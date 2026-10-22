import type { Essay } from "../types";
import { readDocx, type DocxBlock, type DocxContent } from "./docxStructure.ts";
import { classifyEssayLines } from "./essayRoles.ts";
import { analyzeLines } from "./lineFeatures.ts";
import { segmentLines } from "./segmentation.ts";
import { parseMetaLine } from "./textPatterns.ts";

export async function parseDocx(file: Blob): Promise<Essay[]> {
  return buildEssays(await readDocx(await file.arrayBuffer()));
}

/** 纯文本入口：每行一段，空行表示空段。 */
export function parseTextEssays(lines: string[]): Essay[] {
  return buildEssays({ blocks: textBlocks(lines), sections: [] });
}

/** 把纯文本行转成文本块，空行计入下一块的 blankBefore。 */
export function textBlocks(lines: string[]): DocxBlock[] {
  const blocks: DocxBlock[] = [];
  let blankBefore = 0;
  for (const line of lines) {
    const text = line.trim();
    if (!text) {
      blankBefore++;
      continue;
    }
    blocks.push({
      text,
      section: 0,
      blankBefore,
      pageBreakBefore: false,
      centered: false,
      bold: false,
    });
    blankBefore = 0;
  }
  return blocks;
}

function buildEssays(content: DocxContent): Essay[] {
  const lines = analyzeLines(content.blocks, content.sections);
  const { segments } = segmentLines(lines);
  const essays = segments.map((segment) => lines.slice(segment.start, segment.end));
  const headers = essays.map((essay) => essay[0].header.trim());
  // 页眉随篇变化或本身是个人信息时，才作为该篇的来源页头；共享的普通页眉忽略。
  const distinctHeaders = new Set(headers.filter(Boolean)).size;
  const useHeader = (header: string) =>
    Boolean(header) && (distinctHeaders >= 2 || parseMetaLine(header) !== null);

  const roles = classifyEssayLines(essays);
  return essays.map((_, index) => ({
    lines: roles[index],
    sourceHeader: useHeader(headers[index]) ? headers[index] : undefined,
  }));
}
