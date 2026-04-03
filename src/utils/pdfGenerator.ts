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

function buildHTML(
  pages: PageLayout[],
  contents: EssayContent[],
  settings: LayoutSettings,
): string {
  const colW = getColumnWidthMM(settings);
  const gapMM = getColumnGapMM(settings);

  let body = "";
  for (let pi = 0; pi < pages.length; pi++) {
    const page = pages[pi];
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
    const last = pi === pages.length - 1 ? " last" : "";
    body += `<div class="pg${last}">${cols}</div>`;
  }

  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><style>
@page{size:${A4_WIDTH_MM}mm ${A4_HEIGHT_MM}mm;margin:0}
html,body{margin:0;padding:0;width:${A4_WIDTH_MM}mm}
*{box-sizing:border-box}
body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
.pg{width:${A4_WIDTH_MM}mm;height:${A4_HEIGHT_MM}mm;position:relative;overflow:hidden;
break-after:page;page-break-after:always;
font-family:${settings.fontFamily};font-size:${settings.fontSize}pt;line-height:${settings.lineHeight};color:#000}
.pg.last{break-after:auto;page-break-after:auto}
.sep{margin-top:${ESSAY_GAP_MM}mm;border-top:.3px dashed #bbb;padding-top:${ESSAY_GAP_MM * 0.4}mm}
</style></head><body>${body}</body></html>`;
}

const isMobile = () =>
  /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
  (navigator.maxTouchPoints > 1 && !window.matchMedia("(pointer:fine)").matches);

function printViaIframe(html: string) {
  const iframe = document.createElement("iframe");
  iframe.style.cssText =
    "position:fixed;width:0;height:0;border:0;opacity:0;pointer-events:none";
  document.body.appendChild(iframe);

  const cleanup = () => {
    try { document.body.removeChild(iframe); } catch { /* already removed */ }
  };

  iframe.srcdoc = html;
  iframe.onload = () => {
    const win = iframe.contentWindow;
    if (!win) { cleanup(); return; }
    win.onafterprint = cleanup;
    win.focus();
    win.print();
  };
  setTimeout(cleanup, 120_000);
}

function printViaNewWindow(html: string) {
  const win = window.open("", "_blank");
  if (!win) {
    alert("请允许弹出窗口以导出 PDF");
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.onload = () => { win.focus(); win.print(); };
}

export function generatePDF(
  pages: PageLayout[],
  contents: EssayContent[],
  settings: LayoutSettings,
): void {
  const html = buildHTML(pages, contents, settings);
  if (isMobile()) {
    printViaNewWindow(html);
  } else {
    printViaIframe(html);
  }
}
