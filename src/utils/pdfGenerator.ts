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

function buildPageBody(
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
    const first = pi > 0 ? " brk" : "";
    body += `<div class="pg${first}">${cols}</div>`;
  }
  return body;
}

function buildPrintCSS(settings: LayoutSettings): string {
  return `
@page{size:${A4_WIDTH_MM}mm ${A4_HEIGHT_MM}mm;margin:0}
html,body{margin:0;padding:0;width:${A4_WIDTH_MM}mm}
*{margin:0;padding:0;box-sizing:border-box}
body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
.pg{width:${A4_WIDTH_MM}mm;height:${A4_HEIGHT_MM}mm;position:relative;overflow:hidden;
font-family:${settings.fontFamily};font-size:${settings.fontSize}pt;line-height:${settings.lineHeight};color:#000}
.pg.brk{break-before:page;page-break-before:always}
.sep{margin-top:${ESSAY_GAP_MM}mm;border-top:.3px dashed #bbb;padding-top:${ESSAY_GAP_MM * 0.4}mm}`;
}

function buildDesktopHTML(body: string, css: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<style>${css}</style>
</head><body>${body}</body></html>`;
}

function buildMobileHTML(body: string, settings: LayoutSettings): string {
  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=${A4_WIDTH_MM}mm">
<style>
@page{size:${A4_WIDTH_MM}mm ${A4_HEIGHT_MM}mm;margin:0}
*{margin:0;padding:0;box-sizing:border-box}
html,body{margin:0;padding:0;width:${A4_WIDTH_MM}mm}
body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
.tip{text-align:center;padding:12px 16px;font-size:14px;color:#555;background:#f0f4ff;font-family:system-ui,sans-serif;width:100%}
.pg{width:${A4_WIDTH_MM}mm;height:${A4_HEIGHT_MM}mm;position:relative;overflow:hidden;
font-family:${settings.fontFamily};font-size:${settings.fontSize}pt;line-height:${settings.lineHeight};color:#000}
.sep{margin-top:${ESSAY_GAP_MM}mm;border-top:.3px dashed #bbb;padding-top:${ESSAY_GAP_MM * 0.4}mm}
@media print{.tip{display:none}}
</style>
</head><body>
<div class="tip">请使用浏览器的 <b>共享 → 打印</b> 功能导出 PDF，打印时边距请选择「无」</div>
${body}
</body></html>`;
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

function openMobilePage(html: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function generatePDF(
  pages: PageLayout[],
  contents: EssayContent[],
  settings: LayoutSettings,
): void {
  const body = buildPageBody(pages, contents, settings);
  const css = buildPrintCSS(settings);

  if (isMobile()) {
    openMobilePage(buildMobileHTML(body, settings));
  } else {
    printViaIframe(buildDesktopHTML(body, css));
  }
}
