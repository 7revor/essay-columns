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

// ─── pdfmake mobile PDF generation ───

function mmToPt(mm: number): number {
  return mm / PT_TO_MM;
}

function buildPdfmakeDoc(
  pages: PageLayout[],
  contents: EssayContent[],
  settings: LayoutSettings,
): object {
  const colW = getColumnWidthMM(settings);
  const gapMM = getColumnGapMM(settings);
  const fontSize = settings.fontSize;
  const pdfLineHeight = settings.lineHeight / FONT_LH_RATIO;

  const pageContent: object[] = [];

  for (let pi = 0; pi < pages.length; pi++) {
    const page = pages[pi];

    if (pi > 0) {
      pageContent.push({ text: "", pageBreak: "before" });
    }

    const columnBodies: object[][] = [];

    for (let ci = 0; ci < page.columns.length; ci++) {
      const col = page.columns[ci];
      const items: object[] = [];

      for (let ei = 0; ei < col.essayIndices.length; ei++) {
        const idx = col.essayIndices[ei];
        const essay = contents[idx];

        if (ei > 0) {
          items.push({
            canvas: [{
              type: "line",
              x1: 0, y1: 0,
              x2: mmToPt(colW), y2: 0,
              lineWidth: 0.3,
              dash: { length: 2, space: 2 },
              lineColor: "#bbbbbb",
            }],
            margin: [0, mmToPt(ESSAY_GAP_MM), 0, mmToPt(ESSAY_GAP_MM * 0.4)],
          });
        }

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
            text: [
              { text: "\u3000\u3000" },
              { text: p },
            ],
            fontSize,
            lineHeight: pdfLineHeight,
          });
        }
      }

      columnBodies.push(items);
    }

    const colWidthPt = mmToPt(colW);
    const gapPt = mmToPt(gapMM);

    if (columnBodies.length === 1) {
      pageContent.push({
        stack: columnBodies[0],
      });
    } else {
      const columnDef: object = {
        columns: columnBodies.map((body, i) => ({
          width: colWidthPt,
          stack: body,
          ...(i < columnBodies.length - 1 ? { marginRight: gapPt } : {}),
        })),
        columnGap: 0,
      };
      pageContent.push(columnDef);
    }
  }

  return {
    pageSize: { width: mmToPt(A4_WIDTH_MM), height: mmToPt(A4_HEIGHT_MM) },
    pageMargins: [
      mmToPt(settings.marginLeft),
      mmToPt(settings.marginTop),
      mmToPt(settings.marginRight),
      0,
    ],
    content: pageContent,
    defaultStyle: {
      font: "SourceHanSerifSC",
      fontSize,
      lineHeight: pdfLineHeight,
    },
    info: { title: "作文排版" },
    compress: true,
  };
}

const FONT_FILE = "SourceHanSerifSC-Regular.woff";

function bufToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function generateMobilePDF(
  pages: PageLayout[],
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

  const docDef = buildPdfmakeDoc(pages, contents, settings);
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
    await generateMobilePDF(pages, contents, settings, onProgress);
  } else {
    const fontBuf = await getFontBuffer();
    const fontDataUrl = bufToDataUrl(fontBuf);
    const body = buildPageBody(pages, contents, settings);
    const css = buildPrintCSS(settings, fontDataUrl);
    const html = buildHTML(body, css);
    printViaIframe(html);
  }
}
