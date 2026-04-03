import {
  A4_WIDTH_MM,
  A4_HEIGHT_MM,
  MM_TO_PX,
  PT_TO_MM,
  ESSAY_GAP_MM,
  type LayoutSettings,
  type PageLayout,
  type EssayContent,
} from "../types";
import { essayInnerHTML } from "./renderUtils";

export function getColumnWidthMM(s: LayoutSettings): number {
  const usable = A4_WIDTH_MM - s.marginLeft - s.marginRight;
  const gapMM = s.columnGapChars * s.fontSize * PT_TO_MM;
  return (usable - (s.columns - 1) * gapMM) / s.columns;
}

export function getColumnGapMM(s: LayoutSettings): number {
  return s.columnGapChars * s.fontSize * PT_TO_MM;
}

export function getColumnHeightMM(s: LayoutSettings): number {
  return A4_HEIGHT_MM - s.marginTop - s.marginBottom;
}

export function measureEssayHeights(
  contents: EssayContent[],
  settings: LayoutSettings,
  container: HTMLElement,
): number[] {
  const w = getColumnWidthMM(settings) * MM_TO_PX;
  Object.assign(container.style, {
    width: `${w}px`,
    fontFamily: settings.fontFamily,
    fontSize: `${settings.fontSize}pt`,
    lineHeight: `${settings.lineHeight}`,
    position: "absolute",
    visibility: "hidden",
    left: "-9999px",
    top: "0",
    padding: "0",
    margin: "0",
    boxSizing: "border-box",
  });

  return contents.map((c) => {
    container.innerHTML = essayInnerHTML(c);
    return container.offsetHeight / MM_TO_PX;
  });
}

export function computeLayout(
  heights: number[],
  settings: LayoutSettings,
): PageLayout[] {
  const colH = getColumnHeightMM(settings);
  const pages: PageLayout[] = [];

  const makePage = (): PageLayout => ({
    columns: Array.from({ length: settings.columns }, () => ({
      essayIndices: [],
      usedHeight: 0,
    })),
  });

  let page = makePage();
  let col = 0;

  for (let i = 0; i < heights.length; i++) {
    const h = heights[i];
    if (h <= 0) continue;

    const c = page.columns[col];
    const gap = c.essayIndices.length > 0 ? ESSAY_GAP_MM : 0;

    if (c.usedHeight + gap + h <= colH) {
      c.essayIndices.push(i);
      c.usedHeight += gap + h;
    } else {
      col++;
      if (col >= settings.columns) {
        pages.push(page);
        page = makePage();
        col = 0;
      }
      page.columns[col].essayIndices.push(i);
      page.columns[col].usedHeight = h;
    }
  }

  if (page.columns.some((c) => c.essayIndices.length > 0)) {
    pages.push(page);
  }

  return pages;
}
