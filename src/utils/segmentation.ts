import type { DocxBlock, DocxSection } from "./docxStructure.ts";
import {
  isTitleLike,
  parseEssayMarker,
  parseMetaLine,
  type MetaLine,
} from "./textPatterns.ts";

/** 一篇作文在文本块序列中的范围 [start, end)。 */
export interface Segment {
  start: number;
  end: number;
}

/** 硬边界与软信号起点之间允许的最大距离（块数）。 */
const SNAP_WINDOW = 4;
/** 推断“信息行之前的题目/抬头”时最多向前看几块。 */
const MAX_PREFIX = 3;

interface Context {
  blocks: DocxBlock[];
  sections: DocxSection[];
  meta: (MetaLine | null)[];
  textCount: Map<string, number>;
  hard: boolean[];
}

/**
 * 把文本块切成作文。按信号强弱依次尝试：
 * 个人信息行 → 篇章编号 → 重复抬头/结尾行 → 分页与分节 → 标题样式 → 居中短标题 → 连续空段。
 * 软信号的起点会吸附到附近的分页/分节，以便把题目、抬头完整归入同一篇。
 */
export function segmentBlocks(
  blocks: DocxBlock[],
  sections: DocxSection[] = [],
): Segment[] {
  if (blocks.length === 0) return [];
  const textCount = new Map<string, number>();
  for (const block of blocks) {
    textCount.set(block.text, (textCount.get(block.text) ?? 0) + 1);
  }
  const context: Context = {
    blocks,
    sections,
    meta: blocks.map((block) => parseMetaLine(block.text, block.tableCells)),
    textCount,
    hard: blocks.map((block, index) => isHardBoundary(blocks, sections, index)),
  };

  const strategies = [
    byMetaLines,
    byMarkers,
    byRepeatedLines,
    byHardBoundaries,
    byHeadings,
    byCenteredTitles,
    byBlankRuns,
  ];
  for (const strategy of strategies) {
    const segments = strategy(context);
    if (segments && segments.length >= 2) return segments;
  }
  return [{ start: 0, end: blocks.length }];
}

function isHardBoundary(
  blocks: DocxBlock[],
  sections: DocxSection[],
  index: number,
): boolean {
  if (index === 0) return false;
  const block = blocks[index];
  if (block.pageBreakBefore) return true;
  const previous = blocks[index - 1];
  if (block.section === previous.section) return false;
  // 连续分节只有在页眉变化时才视为边界。
  return (
    (sections[block.section]?.header ?? "") !==
    (sections[previous.section]?.header ?? "")
  );
}

function isTemplateLine(context: Context, index: number): boolean {
  const text = context.blocks[index].text;
  return (context.textCount.get(text) ?? 0) >= 2 && isTitleLike(text);
}

/** 由起点列表生成分段；起点之前的少量封面内容会被丢弃或独立成篇。 */
function segmentsFromStarts(context: Context, rawStarts: number[]): Segment[] {
  const starts = [...new Set(rawStarts)].sort((a, b) => a - b);
  if (starts.length === 0) return [];
  const segments: Segment[] = [];
  if (starts[0] > 0 && !isDiscardablePreamble(context, 0, starts[0])) {
    segments.push({ start: 0, end: starts[0] });
  }
  starts.forEach((start, index) => {
    segments.push({ start, end: starts[index + 1] ?? context.blocks.length });
  });
  return segments;
}

/** 起点之前只有一两行短标题（如“三年级优秀习作集”）时视为封面。 */
function isDiscardablePreamble(context: Context, start: number, end: number): boolean {
  if (end - start > 2) return false;
  for (let index = start; index < end; index++) {
    if (!isTitleLike(context.blocks[index].text)) return false;
  }
  return true;
}

/** 把起点吸附到 (lowerBound, start] 内最近的分页/分节。 */
function snapToHardBoundary(context: Context, start: number, lowerBound: number): number | null {
  for (let index = start; index > lowerBound && start - index <= SNAP_WINDOW; index--) {
    if (context.hard[index]) return index;
  }
  return null;
}

/**
 * 为每个锚点（如个人信息行）计算真正的起点：
 * 优先吸附到分页；否则统计锚点前连续的“题目/抬头”行数，按多数篇一致的数量向前扩展。
 */
function startsFromAnchors(
  context: Context,
  anchors: number[],
  lowerBounds: number[],
): number[] {
  const prefixLengths = anchors.map((anchor, j) => {
    let length = 0;
    for (
      let index = anchor - 1;
      index > lowerBounds[j] && length < MAX_PREFIX;
      index--
    ) {
      const block = context.blocks[index];
      if (context.meta[index]) break;
      if (!isTemplateLine(context, index) && !isTitleLike(block.text)) break;
      length++;
    }
    return length;
  });

  let prefix = 0;
  for (let k = MAX_PREFIX; k >= 1; k--) {
    const later = prefixLengths.slice(1);
    const agreeing = later.filter((length) => length >= k).length;
    if (prefixLengths[0] >= k && agreeing >= Math.ceil(later.length * 0.8)) {
      prefix = k;
      break;
    }
  }

  return anchors.map((anchor, j) => {
    const snapped = snapToHardBoundary(context, anchor, lowerBounds[j]);
    if (snapped !== null) return snapped;
    return anchor - Math.min(prefix, prefixLengths[j]);
  });
}

interface MetaGroup {
  start: number;
  end: number; // 含
  identity: boolean;
}

function metaGroups(context: Context): MetaGroup[] {
  const groups: MetaGroup[] = [];
  for (let index = 0; index < context.blocks.length; index++) {
    const meta = context.meta[index];
    if (!meta) continue;
    const last = groups[groups.length - 1];
    if (last && last.end === index - 1) {
      last.end = index;
      last.identity ||= meta.person;
    } else {
      groups.push({ start: index, end: index, identity: meta.person });
    }
  }
  return groups.filter((group) => group.identity);
}

function byMetaLines(context: Context): Segment[] | null {
  const groups = metaGroups(context);
  if (groups.length < 2) return null;

  const firstKey = (index: number) => context.meta[index]?.keys[0];
  const leadKey = firstKey(groups[0].start);

  // 最后一组之后没有正文：信息位于文末（署名），每组结束即一篇结束。
  const last = groups[groups.length - 1];
  const hasContentAfterLast = context.meta
    .slice(last.end + 1)
    .some((meta) => meta === null);
  if (!hasContentAfterLast) {
    const starts = [0, ...groups.slice(0, -1).map((group) => group.end + 1)];
    return segmentsFromStarts(context, starts);
  }

  // 每组中与首组首行同键的行为锚点；组内锚点之前的信息行（如上一篇的指导老师）留给上一篇。
  const anchors = groups.map((group) => {
    for (let index = group.start; index <= group.end; index++) {
      if (firstKey(index) === leadKey) return index;
    }
    return group.start;
  });
  const lowerBounds = groups.map((_, j) => (j === 0 ? -1 : groups[j - 1].end));
  return segmentsFromStarts(context, startsFromAnchors(context, anchors, lowerBounds));
}

function byMarkers(context: Context): Segment[] | null {
  const candidates = context.blocks
    .map((block, index) => ({ index, marker: parseEssayMarker(block.text) }))
    .filter((entry) => entry.marker !== null);

  for (const explicit of [true, false]) {
    // 取编号从 1 开始逐一递增的链，避免把正文里的小列表当作分篇。
    const chain: number[] = [];
    for (const { index, marker } of candidates) {
      if (marker!.explicit !== explicit) continue;
      if (marker!.number === chain.length + 1) chain.push(index);
    }
    // “一、题目”式列表编号也常用于单篇作文的小标题，只在文档以编号开头时采用。
    if (chain.length >= 2 && (explicit || chain[0] === 0)) {
      const lowerBounds = chain.map((_, j) => (j === 0 ? -1 : chain[j - 1]));
      const starts = chain.map(
        (anchor, j) => snapToHardBoundary(context, anchor, lowerBounds[j]) ?? anchor,
      );
      return segmentsFromStarts(context, starts);
    }
  }
  return null;
}

/** 每篇固定出现的抬头（如“作文批改报告”）或结尾行（如“（完）”）。 */
function byRepeatedLines(context: Context): Segment[] | null {
  const positions = new Map<string, number[]>();
  context.blocks.forEach((block, index) => {
    if (!isTemplateLine(context, index)) return;
    const list = positions.get(block.text);
    if (list) list.push(index);
    else positions.set(block.text, [index]);
  });

  // 多数出现处紧跟正文长段的重复行是同名题目（如多名学生都写“我最喜爱的积木”），
  // 不是每篇固定的抬头。
  const followedByBody = (index: number) => {
    const next = index + 1;
    return (
      next < context.blocks.length &&
      context.meta[next] === null &&
      !isTitleLike(context.blocks[next].text)
    );
  };
  const leading = [...positions.values()]
    .filter((list) => list[0] <= 2)
    .filter((list) => list.filter(followedByBody).length * 2 < list.length)
    .sort((a, b) => b.length - a.length || a[0] - b[0]);
  if (leading.length > 0) {
    const anchors = leading[0];
    const lowerBounds = anchors.map((_, j) => (j === 0 ? -1 : anchors[j - 1]));
    const starts = anchors.map(
      (anchor, j) => snapToHardBoundary(context, anchor, lowerBounds[j]) ?? anchor,
    );
    return segmentsFromStarts(context, starts);
  }

  const lastIndex = context.blocks.length - 1;
  const trailing = [...positions.values()]
    .filter((list) => list[list.length - 1] === lastIndex)
    .sort((a, b) => b.length - a.length);
  if (trailing.length > 0) {
    const starts = [0, ...trailing[0].slice(0, -1).map((index) => index + 1)];
    return segmentsFromStarts(context, starts);
  }
  return null;
}

/** 分页/分节切出的每段都至少两块，且多数段以题目式短行开头，才视为分篇。 */
function byHardBoundaries(context: Context): Segment[] | null {
  const starts = [0];
  context.hard.forEach((hard, index) => {
    if (hard) starts.push(index);
  });
  if (starts.length < 2) return null;

  const segments = starts.map((start, index) => ({
    start,
    end: starts[index + 1] ?? context.blocks.length,
  }));
  if (segments.some((segment) => segment.end - segment.start < 2)) return null;

  const headers = segments.map(
    (segment) => context.sections[context.blocks[segment.start].section]?.header ?? "",
  );
  const distinctHeaders = new Set(headers.filter(Boolean)).size;
  if (distinctHeaders >= Math.max(2, Math.ceil(segments.length * 0.5))) return segments;

  const startsLikeEssay = segments.filter(
    (segment) =>
      isTitleLike(context.blocks[segment.start].text) ||
      context.meta[segment.start] !== null,
  ).length;
  return startsLikeEssay >= Math.ceil(segments.length * 0.8) ? segments : null;
}

function byStartLines(
  context: Context,
  isStart: (block: DocxBlock, index: number) => boolean,
): Segment[] | null {
  const starts = context.blocks
    .map((block, index) => (isStart(block, index) ? index : -1))
    .filter((index) => index >= 0);
  if (starts.length < 2 || starts[0] > 2) return null;
  // 相邻的标题行（如主副标题）只取第一行。
  const merged = starts.filter((start, i) => i === 0 || start - starts[i - 1] > 1);
  return merged.length >= 2 ? segmentsFromStarts(context, merged) : null;
}

/** 只取最高一级标题，避免把单篇作文的小标题当作分篇。 */
function byHeadings(context: Context): Segment[] | null {
  const levels = context.blocks
    .map((block) => block.headingLevel)
    .filter((level): level is number => level !== undefined);
  if (levels.length === 0) return null;
  const top = Math.min(...levels);
  return byStartLines(context, (block) => block.headingLevel === top);
}

/** 居中的短行，且其后的段落不居中：常见于未使用标题样式的作文集。 */
function byCenteredTitles(context: Context): Segment[] | null {
  const { blocks } = context;
  const centeredCount = blocks.filter((block) => block.centered).length;
  // 大部分内容都居中时（如诗歌）居中不再有区分度。
  if (centeredCount === 0 || centeredCount > blocks.length * 0.4) return null;
  return byStartLines(
    context,
    (block, index) =>
      block.centered &&
      isTitleLike(block.text) &&
      blocks[index + 1] !== undefined &&
      !blocks[index + 1].centered,
  );
}

/**
 * 按连续空段切分。阈值取能让切点不超过三成的最小空段数，
 * 避免把“段间空一行”的排版习惯当成分篇。
 */
function byBlankRuns(context: Context): Segment[] | null {
  const { blocks } = context;
  const maxBlank = Math.max(...blocks.map((block) => block.blankBefore));
  for (let threshold = 1; threshold <= maxBlank; threshold++) {
    const starts = [0];
    blocks.forEach((block, index) => {
      if (index > 0 && block.blankBefore >= threshold) starts.push(index);
    });
    if (starts.length < 2) return null;
    if (starts.length - 1 <= blocks.length * 0.3) {
      return starts.map((start, index) => ({
        start,
        end: starts[index + 1] ?? blocks.length,
      }));
    }
  }
  return null;
}
