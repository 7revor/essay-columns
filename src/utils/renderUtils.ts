import type { EssayContent } from "../types";

function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function essayInnerHTML(content: EssayContent): string {
  let html = "";
  if (content.header) {
    html += `<div style="margin:0">${esc(content.header)}</div>`;
  }
  if (content.title) {
    html += `<div data-essay-title style="margin:0;text-align:center">《${esc(content.title)}》</div>`;
  }
  for (const p of content.paragraphs) {
    html += `<p style="margin:0;text-indent:2em">${esc(p)}</p>`;
  }
  return html;
}
