// src/web/PreviewView.tsx
// Simplified per SP-D: just a URL input + the iframe. Type a URL and press
// Enter to (re)load it. Before any address is entered the body is empty — the
// iframe only ever loads what the user explicitly submits (it never auto-loads
// a remembered URL on open). No separate open/reload buttons.
import { useState, type FormEvent } from 'react';

const URL_KEY = 'throughline.previewUrl';

export function PreviewView() {
  // `draft` remembers the last address for convenience; `url` (what the iframe
  // renders) starts empty so nothing shows until the user presses Enter.
  const [draft, setDraft] = useState(() => localStorage.getItem(URL_KEY) ?? '');
  const [url, setUrl] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  function load(e: FormEvent) {
    e.preventDefault();
    const next = draft.trim();
    setUrl(next);
    localStorage.setItem(URL_KEY, next);
    setReloadKey((k) => k + 1);
  }

  return (
    <div className="preview">
      <form className="url-bar" onSubmit={load}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="http://localhost:3000"
          aria-label="미리보기 주소"
        />
      </form>
      <div className="preview-body">
        {url ? <iframe key={reloadKey} src={url} title="preview" className="preview-frame" /> : null}
      </div>
    </div>
  );
}
