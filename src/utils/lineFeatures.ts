import type { DocxBlock, DocxSection } from "./docxStructure.ts";
import {
  isTitleLike,
  parseEssayMarker,
  parseMetaLine,
  type EssayMarker,
  type MetaLine,
} from "./textPatterns.ts";

/** 一个文本块及其一次性算好的特征，供切分和角色标注共用。 */
export interface Line {
  block: DocxBlock;
  text: string;
  /** 所在分节的页眉，无页眉为空串。 */
  header: string;
  meta: MetaLine | null;
  marker: EssayMarker | null;
  /** 短且不以句末标点结尾，可能是题目或模板标签。 */
  titleLike: boolean;
  /** 前面是分页或换页分节，即硬边界。 */
  hard: boolean;
  /** 全文中相同文本的出现次数。 */
  repeats: number;
}

export function analyzeLines(
  blocks: DocxBlock[],
  sections: DocxSection[] = [],
): Line[] {
  const counts = new Map<string, number>();
  for (const block of blocks) {
    counts.set(block.text, (counts.get(block.text) ?? 0) + 1);
  }
  const headerOf = (block: DocxBlock) => sections[block.section]?.header ?? "";

  return blocks.map((block, index) => {
    const previous = blocks[index - 1];
    return {
      block,
      text: block.text,
      header: headerOf(block),
      meta: parseMetaLine(block.text, block.tableCells),
      marker: parseEssayMarker(block.text),
      titleLike: isTitleLike(block.text),
      hard: previous !== undefined && isHardBoundary(block, previous, headerOf),
      repeats: counts.get(block.text) ?? 0,
    };
  });
}

function isHardBoundary(
  block: DocxBlock,
  previous: DocxBlock,
  headerOf: (block: DocxBlock) => string,
): boolean {
  if (block.pageBreakBefore) return true;
  if (block.section === previous.section) return false;
  // 连续分节只有在页眉变化时才视为边界。
  return headerOf(block) !== headerOf(previous);
}

/** 只有“第N篇”“作文N”这类明确编号、没有附带题目的行。 */
export function isPureMarker(line: Line): boolean {
  return Boolean(line.marker?.explicit && !line.marker.rest);
}

/** 正文行：既不是信息行、纯编号，也不是题目式短行。 */
export function isContentLine(line: Line): boolean {
  return !line.meta && !isPureMarker(line) && !line.titleLike;
}

/** 全文重复出现的题目式短行，可能是每篇固定的抬头或结尾。 */
export function isRepeatedTitleLike(line: Line): boolean {
  return line.repeats >= 2 && line.titleLike;
}
