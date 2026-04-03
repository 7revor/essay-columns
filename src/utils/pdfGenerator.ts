import {
  A4_WIDTH_MM,
  A4_HEIGHT_MM,
  ESSAY_GAP_MM,
  type PageLayout,
  type EssayContent,
  type LayoutSettings,
} from "../types";
import { essayInnerHTML } from "./renderUtils";
import { getColumnWidthMM, getColumnGapMM } from "./layoutEngine";

export function generatePDF(
  pages: PageLayout[],
  contents: EssayContent[],
  settings: LayoutSettings,
): void {
  const colW = getColumnWidthMM(settings);
  const gapMM = getColumnGapMM(settings);

  let body = "";
  for (const page of pages) {
    let cols = "";
    for (let ci = 0; ci < page.columns.length; ci++) {
      const col = page.columns[ci];
      const left = settings.marginLeft + ci * (colW + gapMM);
      let essays = "";
      for (let ei = 0; ei < col.essayIndices.length; ei++) {
        const idx = col.essayIndices[ei];
        const cls = ei > 0 ? ' class="sep"' : "";
        essays += `<div${cls}>${essayInnerHTML(contents[idx])}</div>`;
      }
      cols += `<div style="position:absolute;left:${left}mm;top:${settings.marginTop}mm;width:${colW}mm">${essays}</div>`;
    }
    body += `<div class="pg">${cols}</div>`;
  }

  const html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><style>
@page{size:${A4_WIDTH_MM}mm ${A4_HEIGHT_MM}mm;margin:0}
*{margin:0;padding:0;box-sizing:border-box}
.pg{width:${A4_WIDTH_MM}mm;height:${A4_HEIGHT_MM}mm;position:relative;overflow:hidden;page-break-after:always;
font-family:${settings.fontFamily};font-size:${settings.fontSize}pt;line-height:${settings.lineHeight};color:#000}
.pg:last-child{page-break-after:auto}
.sep{margin-top:${ESSAY_GAP_MM}mm;border-top:.3px dashed #bbb;padding-top:${ESSAY_GAP_MM * 0.4}mm}
</style></head><body>${body}</body></html>`;

  const iframe = document.createElement("iframe");
  iframe.style.cssText =
    "position:fixed;width:0;height:0;border:0;opacity:0;pointer-events:none";
  document.body.appendChild(iframe);

  const cleanup = () => {
    try {
      document.body.removeChild(iframe);
    } catch {
      /* already removed */
    }
  };

  iframe.srcdoc = html;
  iframe.onload = () => {
    const win = iframe.contentWindow;
    if (!win) {
      cleanup();
      return;
    }
    win.onafterprint = cleanup;
    win.focus();
    win.print();
  };

  setTimeout(cleanup, 120_000);
}
