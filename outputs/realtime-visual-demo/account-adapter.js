class AccountAdapter extends EventTarget {
  constructor() {
    super();
    this.user = null;
  }

  async request(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "请求失败");
    return data;
  }

  async refresh() {
    try {
      const data = await this.request("/api/auth/me");
      this.user = data.user;
    } catch {
      this.user = null;
    }
    this.dispatchEvent(new CustomEvent("change", { detail: this.user }));
    return this.user;
  }

  async signUp(email, password) {
    const data = await this.request("/api/auth/signup", { method: "POST", body: JSON.stringify({ email, password }) });
    this.user = data.user;
    this.dispatchEvent(new CustomEvent("change", { detail: this.user }));
    return this.user;
  }

  async login(email, password) {
    const data = await this.request("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
    this.user = data.user;
    this.dispatchEvent(new CustomEvent("change", { detail: this.user }));
    return this.user;
  }

  async logout() {
    await this.request("/api/auth/logout", { method: "POST", body: "{}" });
    this.user = null;
    this.dispatchEvent(new CustomEvent("change", { detail: null }));
  }

  async saveProject(project) {
    localStorage.setItem("livecanvas-project", JSON.stringify(project));
    if (!this.user) return { local: true };
    return this.request("/api/project/latest", { method: "PUT", body: JSON.stringify(project) });
  }

  async loadProject() {
    if (this.user) {
      try {
        const data = await this.request("/api/project/latest");
        if (data.project) return data.project;
      } catch {
        // Local state remains the fallback when sync is unavailable.
      }
    }
    return JSON.parse(localStorage.getItem("livecanvas-project") || "null");
  }
}

export const accountAdapter = new AccountAdapter();
