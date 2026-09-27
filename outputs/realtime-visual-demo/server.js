const fs = require("fs");
const path = require("path");
const http = require("http");
const crypto = require("crypto");

const root = __dirname;
const dataRoot = path.resolve(root, "..", "..", "work", "local-server-data");
const evaluationRoot = path.resolve(root, "..", "..", "work", "asr-evaluation");
const evaluationReportRoot = path.join(evaluationRoot, "reports");
const evaluationAudioRoot = path.join(evaluationRoot, "audio");
const dbPath = path.join(dataRoot, "database.json");
const port = Number(process.env.PORT || 4175);
const host = process.env.HOST || "127.0.0.1";
const secureCookie = process.env.NODE_ENV === "production" ? "; Secure" : "";
const sessions = new Map();
const attempts = new Map();

fs.mkdirSync(dataRoot, { recursive: true });
fs.mkdirSync(evaluationReportRoot, { recursive: true });
fs.mkdirSync(evaluationAudioRoot, { recursive: true });
if (!fs.existsSync(dbPath)) fs.writeFileSync(dbPath, JSON.stringify({ users: [], projects: {} }, null, 2));

const mime = {
  ".svg": "image/svg+xml",
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
};

function readDb() {
  return JSON.parse(fs.readFileSync(dbPath, "utf8"));
}

function writeDb(db) {
  const temporary = `${dbPath}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(db, null, 2));
  fs.renameSync(temporary, dbPath);
}

function json(response, status, value, headers = {}) {
  response.writeHead(status, { "Content-Type": mime[".json"], "Cache-Control": "no-store", ...headers });
  response.end(JSON.stringify(value));
}

function body(request) {
  return new Promise((resolve, reject) => {
    let data = "";
    request.on("data", (chunk) => {
      data += chunk;
      if (data.length > 2_000_000) reject(new Error("请求过大"));
    });
    request.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error("JSON 格式错误")); }
    });
    request.on("error", reject);
  });
}

function rawBody(request, limit = 50_000_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("音频文件过大"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function evaluationId(value) {
  const id = String(value || "");
  return /^[a-z0-9-]{8,80}$/i.test(id) ? id : null;
}

function passwordHash(password, salt = crypto.randomBytes(16).toString("hex")) {
  return { salt, hash: crypto.scryptSync(password, salt, 64).toString("hex") };
}

function passwordMatches(password, user) {
  const actual = Buffer.from(passwordHash(password, user.salt).hash, "hex");
  const expected = Buffer.from(user.passwordHash, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function cookies(request) {
  return Object.fromEntries((request.headers.cookie || "").split(";").map((part) => part.trim().split("=")).filter((pair) => pair.length === 2));
}

function sessionUser(request) {
  const token = cookies(request).livecanvas_session;
  const session = token && sessions.get(token);
  if (!session || session.expiresAt < Date.now()) return null;
  return session.userId;
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString("base64url");
  sessions.set(token, { userId, expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 });
  return token;
}

function rateLimited(request) {
  const key = request.socket.remoteAddress || "local";
  const recent = (attempts.get(key) || []).filter((time) => Date.now() - time < 60_000);
  recent.push(Date.now());
  attempts.set(key, recent);
  return recent.length > 20;
}

async function api(request, response, url) {
  if (url.pathname === "/api/preparation") return require("./preparation-api.cjs")(request,response,{json});
  if (url.pathname === "/api/jev") return require("./jev-proxy.cjs")(request,response,{body,json});
  if (url.pathname === "/api/evaluation/session" && request.method === "POST") {
    const input = await body(request);
    const id = evaluationId(input.id);
    if (!id || !input.report || typeof input.report !== "object") return json(response, 400, { error: "评测数据无效" });
    fs.writeFileSync(path.join(evaluationReportRoot, `${id}.json`), JSON.stringify({ ...input.report, sessionId: id }, null, 2));
    return json(response, 200, { ok: true, id });
  }

  if (url.pathname === "/api/evaluation/audio" && request.method === "POST") {
    const id = evaluationId(url.searchParams.get("id"));
    if (!id) return json(response, 400, { error: "评测编号无效" });
    const audio = await rawBody(request);
    fs.writeFileSync(path.join(evaluationAudioRoot, `${id}.webm`), audio);
    return json(response, 200, { ok: true, id, bytes: audio.length });
  }

  if (url.pathname === "/api/auth/me" && request.method === "GET") {
    const userId = sessionUser(request);
    const user = userId ? readDb().users.find((item) => item.id === userId) : null;
    return json(response, 200, { user: user ? { id: user.id, email: user.email } : null });
  }

  if (["/api/auth/signup", "/api/auth/login"].includes(url.pathname) && request.method === "POST") {
    if (rateLimited(request)) return json(response, 429, { error: "操作过于频繁，请稍后重试" });
    const input = await body(request);
    const email = String(input.email || "").trim().toLowerCase();
    const password = String(input.password || "");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || password.length < 8) return json(response, 400, { error: "请输入有效邮箱和至少 8 位密码" });
    const db = readDb();
    let user = db.users.find((item) => item.email === email);
    if (url.pathname.endsWith("signup")) {
      if (user) return json(response, 409, { error: "该邮箱已经注册" });
      const secret = passwordHash(password);
      user = { id: crypto.randomUUID(), email, salt: secret.salt, passwordHash: secret.hash, createdAt: new Date().toISOString() };
      db.users.push(user);
      writeDb(db);
    } else if (!user || !passwordMatches(password, user)) {
      return json(response, 401, { error: "邮箱或密码不正确" });
    }
    const token = createSession(user.id);
    return json(response, 200, { user: { id: user.id, email: user.email } }, { "Set-Cookie": `livecanvas_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${secureCookie}` });
  }

  if (url.pathname === "/api/auth/logout" && request.method === "POST") {
    const token = cookies(request).livecanvas_session;
    if (token) sessions.delete(token);
    return json(response, 200, { ok: true }, { "Set-Cookie": "livecanvas_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0" });
  }

  if (url.pathname === "/api/project/latest") {
    const userId = sessionUser(request);
    if (!userId) return json(response, 401, { error: "请先登录" });
    const db = readDb();
    if (request.method === "GET") return json(response, 200, { project: db.projects[userId] || null });
    if (request.method === "PUT") {
      const project = await body(request);
      db.projects[userId] = { ...project, syncedAt: new Date().toISOString() };
      writeDb(db);
      return json(response, 200, { ok: true, syncedAt: db.projects[userId].syncedAt });
    }
  }

  return json(response, 404, { error: "API 不存在" });
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  try {
    if (url.pathname.startsWith("/api/")) return await api(request, response, url);
    const relative = url.pathname === "/" ? "studio/index.html" : decodeURIComponent(url.pathname.slice(1));
    const target = path.resolve(root, relative);
    if (!(target === root || target.startsWith(`${root}${path.sep}`))) {
      response.writeHead(403);
      return response.end("Forbidden");
    }
    fs.readFile(target, (error, data) => {
      if (error) {
        response.writeHead(404);
        response.end("Not found");
        return;
      }
      const cache = [".html", ".js", ".mjs", ".css", ".webmanifest"].includes(path.extname(target)) ? "no-cache" : "public, max-age=86400";
      response.writeHead(200, { "Content-Type": mime[path.extname(target)] || "application/octet-stream", "Cache-Control": cache, "X-Content-Type-Options": "nosniff" });
      response.end(data);
    });
  } catch (error) {
    json(response, 500, { error: error.message || "服务器错误" });
  }
});

server.listen(port, host, () => console.log(`LiveCanvas local-first server: http://${host}:${port}`));
