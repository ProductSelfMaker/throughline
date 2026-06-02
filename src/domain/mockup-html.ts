// src/domain/mockup-html.ts
// Assemble the final mockup document. The real project stylesheet is embedded
// VERBATIM so the mockup is pixel-identical to the running app — the LLM only
// produces the body (artboards using the real class names). This is the whole
// reason the mockup now matches: CSS is copied, never re-derived.

/** Canvas/artboard chrome — the only styles the generator adds (not app styles). */
const CANVAS_CSS = `
/* ===== mockup canvas (generated wrapper — NOT part of the app) ===== */
html { height: auto; }
body { margin: 0; padding: 52px; background: #e9e6dd; height: auto; min-height: 100%;
       font-family: "Geist", -apple-system, system-ui, "Apple SD Gothic Neo", "Segoe UI", sans-serif; }
.mock-canvas { display: flex; flex-wrap: wrap; align-items: flex-start; align-content: flex-start; gap: 36px 56px; max-width: 6900px; }
.mock-art { display: flex; flex-direction: column; gap: 12px; }
.mock-label { font-family: "Geist Mono", ui-monospace, "SF Mono", monospace; font-size: 13px; font-weight: 600; color: #44413a; padding-left: 2px; }
.mock-frame { width: 1180px; height: 720px; border-radius: 18px; overflow: hidden; background: #fff;
              box-shadow: 0 10px 40px rgba(0,0,0,.12), 0 2px 8px rgba(0,0,0,.06); }
/* the real app shell fills its artboard frame */
.mock-frame .tl { height: 100%; }
`;

export function assembleMockupHtml(css: string, bodyFragment: string, headLinks = ''): string {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
${headLinks}
<style>
${css}

${CANVAS_CSS}
</style>
</head>
<body>
${bodyFragment}
</body>
</html>`;
}
