// Converts contenteditable HTML (from RichNotesEditor) into Asana's html_notes
// format. Asana only accepts a small tag whitelist — raw execCommand output
// (divs, <b>, stray <span style=...>, etc.) needs converting/unwrapping first.
const INLINE_MAP: Record<string, string> = { B: "strong", STRONG: "strong", I: "em", EM: "em", U: "u" };
const BLOCK_KEEP = new Set(["UL", "OL", "LI"]);

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function walk(node: ChildNode): string {
  if (node.nodeType === Node.TEXT_NODE) return escapeHtml(node.textContent || "");
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const el = node as HTMLElement;
  const tag = el.tagName;
  if (tag === "BR") return "\n";
  const inner = () => Array.from(el.childNodes).map(walk).join("");
  if (BLOCK_KEEP.has(tag)) return `<${tag.toLowerCase()}>${inner()}</${tag.toLowerCase()}>`;
  if (INLINE_MAP[tag]) { const i = inner(); return i.trim() ? `<${INLINE_MAP[tag]}>${i}</${INLINE_MAP[tag]}>` : i; }
  if (tag === "DIV" || tag === "P") return `${inner()}\n`;
  return inner(); // unwrap anything else (span, font, etc.) — keep the text, drop the tag
}

export function toAsanaHtmlNotes(html: string): string {
  if (typeof window === "undefined" || !html.trim()) return "<body></body>";
  const doc = new DOMParser().parseFromString(html, "text/html");
  const body = Array.from(doc.body.childNodes).map(walk).join("").replace(/\n{3,}/g, "\n\n").trim();
  return `<body>${body || " "}</body>`;
}
