// Last tidy of a chat reply before it goes to the customer. The model now and then wraps a number in
// dollar signs the way maths is typeset ("$22.7$ kg"). A measurement never takes a dollar sign, and a
// price takes only the leading one.
const UNIT = String.raw`(?:kg|g|cm|mm|m|months?|weeks?|years?)\b`;

export function tidyReply(text: string): string {
  return text
    .replace(new RegExp(String.raw`\$(\d[\d.,]*)\$?(\s*(?:x\s*[\d.]+\s*)*${UNIT})`, "g"), "$1$2")
    .replace(new RegExp(String.raw`\$(\d[\d.,]*)\$(?=\s*x\s*[\d.])`, "g"), "$1")
    .replace(/\$(\d[\d.,]*)\$/g, "$$$1");
}
