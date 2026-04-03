import {
  A4_WIDTH_MM,
  A4_HEIGHT_MM,
  ESSAY_GAP_MM,
  PT_TO_MM,
  FONT_FAMILY,
  FONT_LH_RATIO,
  type PageLayout,
  type EssayContent,
  type LayoutSettings,
} from "../types";
import { essayInnerHTML } from "./renderUtils";
import { getColumnWidthMM, getColumnGapMM } from "./layoutEngine";
import { getFontBuffer } from "./fontLoader";

function buildPageBody(pages: PageLayout[], contents: EssayContent[], settings: LayoutSettings): string {
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

// ─── pdfmake mobile PDF generation (snaking columns + unbreakable) ───

function mmToPt(mm: number): number {
  return mm / PT_TO_MM;
}

function buildPdfmakeDoc(
  contents: EssayContent[],
  settings: LayoutSettings,
): object {
  const colW = getColumnWidthMM(settings);
  const gapMM = getColumnGapMM(settings);
  const fontSize = settings.fontSize;
  const pdfLineHeight = settings.lineHeight / FONT_LH_RATIO;
  const colWidthPt = mmToPt(colW);
  const gapPt = mmToPt(gapMM);

  const essayStacks: object[] = [];

  for (let i = 0; i < contents.length; i++) {
    const essay = contents[i];
    const items: object[] = [];

    if (essay.header) {
      items.push({
        text: essay.header,
        fontSize,
        lineHeight: pdfLineHeight,
      });
    }

    if (essay.title) {
      items.push({
        text: essay.title,
        fontSize: fontSize + 0.01,
        characterSpacing: 0.5,
        alignment: "center",
        lineHeight: pdfLineHeight,
      });
    }

    for (const p of essay.paragraphs) {
      items.push({
        text: p,
        fontSize,
        lineHeight: pdfLineHeight,
        leadingIndent: fontSize * 2,
      });
    }

    if (i > 0) {
      essayStacks.push({
        canvas: [{
          type: "line",
          x1: 0, y1: 0,
          x2: colWidthPt, y2: 0,
          lineWidth: 0.3,
          dash: { length: 2, space: 2 },
          lineColor: "#bbbbbb",
        }],
        margin: [0, mmToPt(ESSAY_GAP_MM * 0.6), 0, mmToPt(ESSAY_GAP_MM * 0.4)],
      });
    }

    essayStacks.push({
      stack: items,
      unbreakable: true,
    });
  }

  const columnsArr: object[] = [];
  for (let c = 0; c < settings.columns; c++) {
    columnsArr.push(c === 0
      ? { width: colWidthPt, stack: essayStacks }
      : { width: colWidthPt, text: "" },
    );
  }

  return {
    pageSize: { width: mmToPt(A4_WIDTH_MM), height: mmToPt(A4_HEIGHT_MM) },
    pageMargins: [
      mmToPt(settings.marginLeft),
      mmToPt(settings.marginTop),
      mmToPt(settings.marginRight),
      mmToPt(settings.marginBottom),
    ],
    content: [
      {
        columns: columnsArr,
        columnGap: gapPt,
        snakingColumns: true,
      },
    ],
    defaultStyle: {
      font: "SourceHanSerifSC",
      fontSize,
      lineHeight: pdfLineHeight,
    },
    info: { title: "作文排版" },
    compress: true,
  };
}

function buildPrintCSS(settings: LayoutSettings, fontDataUrl: string): string {
  return `
@font-face{font-family:"Source Han Serif SC";src:url("${fontDataUrl}") format("woff");font-weight:normal;font-style:normal}
@page{size:${A4_WIDTH_MM}mm ${A4_HEIGHT_MM}mm;margin:0}
html,body{margin:0;padding:0;width:${A4_WIDTH_MM}mm}
*{margin:0;padding:0;box-sizing:border-box}
body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
.pg{width:${A4_WIDTH_MM}mm;height:${A4_HEIGHT_MM}mm;position:relative;overflow:hidden;
font-family:${FONT_FAMILY};font-size:${settings.fontSize}pt;line-height:${settings.lineHeight};color:#000}
.pg.brk{break-before:page;page-break-before:always}
.sep{margin-top:${ESSAY_GAP_MM}mm;border-top:.3px dashed #bbb;padding-top:${ESSAY_GAP_MM * 0.4}mm}`;
}

function buildHTML(body: string, css: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<style>${css}</style>
</head><body>${body}</body></html>`;
}

const isMobile = () =>
  /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
  (navigator.maxTouchPoints > 1 && !window.matchMedia("(pointer:fine)").matches);

function printViaIframe(html: string) {
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;width:0;height:0;border:0;opacity:0;pointer-events:none";
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

const FONT_FILE = "SourceHanSerifSC-Regular.woff";

function bufToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function generateMobilePDF(
  contents: EssayContent[],
  settings: LayoutSettings,
  onProgress?: (msg: string) => void,
): Promise<void> {
  onProgress?.("正在加载 PDF 引擎…");

  const [pdfMakeModule, fontBuf] = await Promise.all([
    import("pdfmake/build/pdfmake"),
    getFontBuffer(),
  ]);
  const pdfMake = pdfMakeModule.default ?? pdfMakeModule;

  (pdfMake as any).addVirtualFileSystem({ [FONT_FILE]: bufToBase64(fontBuf) });
  pdfMake.fonts = {
    SourceHanSerifSC: {
      normal: FONT_FILE,
      bold: FONT_FILE,
      italics: FONT_FILE,
      bolditalics: FONT_FILE,
    },
  };

  onProgress?.("正在生成 PDF…");

  const docDef = buildPdfmakeDoc(contents, settings);
  const pdf = pdfMake.createPdf(docDef as any);

  const blob = await pdf.getBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "作文排版.pdf";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function bufToDataUrl(buf: ArrayBuffer): string {
  return `data:font/woff;base64,${bufToBase64(buf)}`;
}

// ─── public API ───

export async function generatePDF(
  pages: PageLayout[],
  contents: EssayContent[],
  settings: LayoutSettings,
  onProgress?: (msg: string) => void,
): Promise<void> {
  if (isMobile()) {
    await generateMobilePDF(contents, settings, onProgress);
  } else {
    const fontBuf = await getFontBuffer();
    const fontDataUrl = bufToDataUrl(fontBuf);
    const body = buildPageBody(pages, contents, settings);
    const css = buildPrintCSS(settings, fontDataUrl);
    const html = buildHTML(body, css);
    printViaIframe(html);
  }
}
