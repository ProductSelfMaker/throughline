# Throughline UI — Design Handoff

Self-contained snapshot of the **current** Throughline UI for redesign in Claude Design.
Open `throughline-ui.html` in any browser (no build/server needed) — it renders three
representative states. All styling is inline in the `<style>` block; class names match the
React/CSS source so edits map back cleanly.

## How to use
1. Open / paste `throughline-ui.html` into Claude Design.
2. Edit freely — tokens live at the top of `<style>` (`:root`), component rules below mirror `src/web/styles.css` 1:1.
3. Send the edited HTML/CSS back; it gets translated into the React components + `styles.css`.

## What Throughline is (context for the design)
A chat over the user's coding agent (Claude Code). The product's value is the **right-side views**:
the conversation auto-maintains a living spec (문서) and user-flow (플로우) in the background, plus a
live **프리뷰** of the running app. Keep the chat calm/secondary; the views are where intent lives.

## Layout — 4 zones on a grey canvas
Left → right, each a white rounded card with a consistent gutter between them:

```
[Sidebar 240px] │ [Chat (flex)] │ ⋮resize │ [View panel (flex)] │ [Rail 52px]
```
- **Sidebar** — wordmark only for now (`Throughline`, no logo mark); body empty (future: conversation/workspace list). Collapsible to 0.
- **Chat** — empty = centered hero (`⌀` mark + "오늘 무엇을 만들까요?" + big rounded composer); active = centered ≤720px thread + composer docked at bottom.
- **View panel** — opens only when a rail icon is active; drag-resizable boundary with Chat (clamp **20–80%**, persisted).
- **Rail** — 3 monochrome line icons: 문서 / 플로우 / 프리뷰. Click toggles its view; click the active one closes it.

## Design tokens (`:root`)
| token | value | use |
|---|---|---|
| `--canvas` | `#f2f2f3` | app background (grey gutters show through) |
| `--card` | `#ffffff` | every region card |
| `--border` | `#e8e8ea` | thin card border |
| `--border-strong` | `#dcdcdf` | composer/input border, divider handle |
| `--text` | `#1a1a1a` | primary text |
| `--muted` | `#8e8e93` | placeholders, secondary text |
| `--chip-bg` | `#f4f4f5` | user bubble, tool chip, inline code |
| `--radius` | `14px` | card corner radius |
| `--gutter` | `10px` | gap between every region + page edges |

**Constraint: grayscale only.** No accent/brand color is used anywhere (active states use grey, not blue). Emoji in sample content (✦ 🔧 ⌀ 👋 🙂) are placeholders.

## States shown in the file
1. **Empty / hero** — sidebar open, no view panel.
2. **Active** — thread + 프리뷰 view open (URL bar; body empty until a URL is entered + Enter). Boundary at 55/45.
3. **Sidebar collapsed + 문서 view** — placeholder text; collapse toggle stays top-left to re-open.

(플로우 view = identical placeholder treatment as 문서, different text: "유저 플로우가 여기에 표시됩니다.")

## Interactions (behavior is fixed; visuals are open)
- Composer: **Enter** sends, **Shift+Enter** newline. Send button disabled when empty/busy.
- Rail icon: toggles its view open/closed (only one open at a time).
- Divider: drag to resize Chat↔View (20–80%, saved to `localStorage`).
- Sidebar toggle: collapse/expand (saved to `localStorage`).
- Preview: empty until the user types a URL and presses Enter; nothing auto-loads.

## Class → source mapping
| HTML class | React component | file |
|---|---|---|
| `.sidebar`, `.sidebar-brand` | `Sidebar` | `src/web/Sidebar.tsx` |
| `.sidebar-toggle` | (in App) | `src/web/App.tsx` |
| `.chat`, `.chat-hero`, `.chat-thread`, `.msg-*`, `.tool-chip`, `.composer*` | `ChatPane` | `src/web/ChatPane.tsx` |
| `.divider` | `ResizableDivider` | `src/web/ResizableDivider.tsx` |
| `.view`, `.view-body`, `.placeholder` | `RightPane` | `src/web/RightPane.tsx` |
| `.preview`, `.url-bar`, `.preview-frame` | `PreviewView` | `src/web/PreviewView.tsx` |
| `.rail`, `.rail-btn` | `ViewRail` | `src/web/ViewRail.tsx` |
| all rules | — | `src/web/styles.css` |

## Open to redesign vs. keep
- **Open:** all visuals — tokens, card treatment, gutters/radius, typography, spacing, the rail icons, composer shape, chat bubble style, how the views read.
- **Keep:** the 4-zone structure, grayscale-only, the views (문서/플로우/프리뷰) as the focus, and the listed interactions. If a change touches structure or behavior (not just looks), flag it so it can be re-planned.
