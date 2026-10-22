import type { Essay } from "../types";
import { readDocx, type DocxBlock, type DocxContent } from "./docxStructure.ts";
import { classifyEssayLines } from "./essayRoles.ts";
import { segmentBlocks } from "./segmentation.ts";
import { parseMetaLine } from "./textPatterns.ts";

export async function parseDocx(file: Blob): Promise<Essay[]> {
  return buildEssays(await readDocx(await file.arrayBuffer()));
}

/** 纯文本入口：每行一段，空行表示空段。 */
export function parseTextEssays(lines: string[]): Essay[] {
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
  return buildEssays({ blocks, sections: [] });
}

function buildEssays(content: DocxContent): Essay[] {
  const { blocks, sections } = content;
  const segments = segmentBlocks(blocks, sections);
  const headers = segments.map(
    (segment) => sections[blocks[segment.start].section]?.header?.trim() ?? "",
  );
  // 页眉随篇变化或本身是个人信息时，才作为该篇的来源页头；共享的普通页眉忽略。
  const distinctHeaders = new Set(headers.filter(Boolean)).size;
  const useHeader = (header: string) =>
    Boolean(header) && (distinctHeaders >= 2 || parseMetaLine(header) !== null);

  const lines = classifyEssayLines(
    segments.map((segment) => blocks.slice(segment.start, segment.end)),
  );
  return segments.map((_, index) => ({
    lines: lines[index],
    sourceHeader: useHeader(headers[index]) ? headers[index] : undefined,
  }));
}
