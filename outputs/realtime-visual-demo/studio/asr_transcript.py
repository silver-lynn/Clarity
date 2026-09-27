"""Normalize full ASR snapshots without requiring optional timing metadata.

With result_type=full, utterance positions are stable across snapshots. Identity
belongs to the position, not mutable text or the availability of timestamps.
"""


class TranscriptNormalizer:
    def __init__(self):
        self.identities = {}
        self.confirmed = {}

    def accept(self, payload):
        if not isinstance(payload, dict):
            return []
        results = payload.get('result') or []
        if isinstance(results, dict):
            results = [results]
        if not isinstance(results, list):
            return []
        output, partial = [], []
        for result_index, result in enumerate(results):
            if not isinstance(result, dict):
                continue
            utterances = result.get('utterances') or []
            if not isinstance(utterances, list):
                utterances = []
            represented = []
            for index, utterance in enumerate(utterances):
                if not isinstance(utterance, dict):
                    continue
                text = utterance.get('text')
                if not isinstance(text, str) or not text.strip():
                    continue
                text = text.strip()
                represented.append(text)
                slot = (result_index, index)
                # Never use optional start_time as a required key, and never
                # change identity if a later correction supplies that field.
                identity = self.identities.setdefault(slot, f'r{result_index}:u{index}')
                if utterance.get('definite') is True:
                    if self.confirmed.get(identity) != text:
                        self.confirmed[identity] = text
                        output.append({'type': 'final', 'id': identity, 'text': text})
                else:
                    partial.append(text)
            full_text = result.get('text')
            prefix = ''.join(represented)
            if isinstance(full_text, str) and full_text.strip().startswith(prefix):
                tail = full_text.strip()[len(prefix):].strip()
                if tail:
                    partial.append(tail)
        if partial:
            output.append({'type': 'partial', 'text': ''.join(partial)})
        return output
