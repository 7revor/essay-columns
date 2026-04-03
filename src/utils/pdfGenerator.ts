import {
  A4_WIDTH_MM,
  A4_HEIGHT_MM,
  ESSAY_GAP_MM,
  PT_TO_MM,
  FONT_LH_RATIO,
  type EssayContent,
  type LayoutSettings,
} from "../types";
import { getColumnWidthMM, getColumnGapMM } from "./layoutEngine";
import { getFontBuffer } from "./fontLoader";

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

const FONT_FILE = "SourceHanSerifSC-Regular.woff";

function bufToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export async function generatePDF(
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
