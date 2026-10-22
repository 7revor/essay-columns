import { isRepeatedTitleLike, type Line } from "./lineFeatures.ts";

/** 一篇作文在文本块序列中的范围 [start, end)。 */
export interface Segment {
  start: number;
  end: number;
}

/** 硬边界与软信号起点之间允许的最大距离（块数）。 */
const SNAP_WINDOW = 4;
/** 推断“信息行之前的题目/抬头”时最多向前看几块。 */
const MAX_PREFIX = 3;
/** 除第一篇外，至少多少比例的篇具有同样长的题目前缀才采用。 */
const PREFIX_AGREEMENT = 0.8;
/** 封面最多几行短标题。 */
const MAX_PREAMBLE = 2;
/** 标题类起点、重复抬头必须出现在文档前几块（下标上限）。 */
const MAX_FIRST_START = 2;
/** 分页切出的段中，至少多少比例以题目或信息行开头才视为分篇。 */
const HARD_START_RATIO = 0.8;
/** 至少多少比例的分页段页眉互不相同，即可直接按分页分篇。 */
const DISTINCT_HEADER_RATIO = 0.5;
/** 居中段落超过此比例时（如诗歌）居中不再有区分度。 */
const MAX_CENTERED_RATIO = 0.4;
/** 按空段切分时，切点数不得超过块数的此比例。 */
const MAX_BLANK_CUT_RATIO = 0.3;

/**
 * 筛子给出的切分建议：各篇的锚点及对齐方式，由 assemble 统一生成分段。
 * - snap：锚点吸附到附近的分页/分节；
 * - snapOrPrefix：吸附不到分页时，按多数篇一致的题目前缀长度向前扩展。
 */
interface Proposal {
  anchors: number[];
  align?: "snap" | "snapOrPrefix";
  /** 对齐时不得越过的位置（不含），默认为上一锚点。 */
  lowerBounds?: number[];
}

type Sieve = (lines: Line[]) => Proposal | null;

/** 按精确度从高到低排列，第一个切出至少两篇的筛子生效。 */
const SIEVES: [name: string, sieve: Sieve][] = [
  ["metaLines", byMetaLines],
  ["markers", byMarkers],
  ["repeatedLines", byRepeatedLines],
  ["hardBoundaries", byHardBoundaries],
  ["headings", byHeadings],
  ["centeredTitles", byCenteredTitles],
  ["blankRuns", byBlankRuns],
];

export interface Segmentation {
  segments: Segment[];
  /** 生效的筛子；未能切分时为 "single"。 */
  strategy: string;
}

/**
 * 把文本行切成作文。按信号强弱依次尝试：
 * 个人信息行 → 篇章编号 → 重复抬头/结尾行 → 分页与分节 → 标题样式 → 居中短标题 → 连续空段。
 */
export function segmentLines(lines: Line[]): Segmentation {
  if (lines.length === 0) return { segments: [], strategy: "single" };
  for (const [name, sieve] of SIEVES) {
    const proposal = sieve(lines);
    if (!proposal) continue;
    const segments = assemble(lines, proposal);
    if (segments.length >= 2) return { segments, strategy: name };
  }
  return { segments: [{ start: 0, end: lines.length }], strategy: "single" };
}

// ---------- 统一组装 ----------

function assemble(lines: Line[], proposal: Proposal): Segment[] {
  const { anchors, align } = proposal;
  const lowerBounds =
    proposal.lowerBounds ?? anchors.map((_, j) => (j === 0 ? -1 : anchors[j - 1]));
  let starts = anchors;
  if (align === "snap") {
    starts = anchors.map(
      (anchor, j) => snapToHardBoundary(lines, anchor, lowerBounds[j]) ?? anchor,
    );
  } else if (align === "snapOrPrefix") {
    starts = startsWithPrefix(lines, anchors, lowerBounds);
  }
  return segmentsFromStarts(lines, starts);
}

/** 由起点列表生成分段；第一个起点之前的少量封面内容会被丢弃，否则独立成篇。 */
function segmentsFromStarts(lines: Line[], rawStarts: number[]): Segment[] {
  const starts = [...new Set(rawStarts)].sort((a, b) => a - b);
  if (starts.length === 0) return [];
  const segments: Segment[] = [];
  if (starts[0] > 0 && !isDiscardablePreamble(lines.slice(0, starts[0]))) {
    segments.push({ start: 0, end: starts[0] });
  }
  starts.forEach((start, index) => {
    segments.push({ start, end: starts[index + 1] ?? lines.length });
  });
  return segments;
}

/** 起点之前只有一两行短标题（如“三年级优秀习作集”）时视为封面。 */
function isDiscardablePreamble(preamble: Line[]): boolean {
  return preamble.length <= MAX_PREAMBLE && preamble.every((line) => line.titleLike);
}

/** 把起点吸附到 (lowerBound, start] 内最近的分页/分节。 */
function snapToHardBoundary(lines: Line[], start: number, lowerBound: number): number | null {
  for (let index = start; index > lowerBound && start - index <= SNAP_WINDOW; index--) {
    if (lines[index].hard) return index;
  }
  return null;
}

/**
 * 为每个锚点（如个人信息行）计算真正的起点：
 * 优先吸附到分页；否则统计锚点前连续的“题目/抬头”行数，按多数篇一致的数量向前扩展。
 */
function startsWithPrefix(
  lines: Line[],
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
      const line = lines[index];
      if (line.meta || !line.titleLike) break;
      length++;
    }
    return length;
  });

  let prefix = 0;
  for (let k = MAX_PREFIX; k >= 1; k--) {
    const later = prefixLengths.slice(1);
    const agreeing = later.filter((length) => length >= k).length;
    if (prefixLengths[0] >= k && agreeing >= Math.ceil(later.length * PREFIX_AGREEMENT)) {
      prefix = k;
      break;
    }
  }

  return anchors.map((anchor, j) => {
    const snapped = snapToHardBoundary(lines, anchor, lowerBounds[j]);
    if (snapped !== null) return snapped;
    return anchor - Math.min(prefix, prefixLengths[j]);
  });
}

// ---------- 筛子 ----------

interface MetaGroup {
  start: number;
  end: number; // 含
  identity: boolean;
}

/** 连续的信息行合成一组；只保留含人员信息的身份组。 */
function metaGroups(lines: Line[]): MetaGroup[] {
  const groups: MetaGroup[] = [];
  lines.forEach(({ meta }, index) => {
    if (!meta) return;
    const last = groups[groups.length - 1];
    if (last && last.end === index - 1) {
      last.end = index;
      last.identity ||= meta.person;
    } else {
      groups.push({ start: index, end: index, identity: meta.person });
    }
  });
  return groups.filter((group) => group.identity);
}

function byMetaLines(lines: Line[]): Proposal | null {
  const groups = metaGroups(lines);
  if (groups.length < 2) return null;

  // 最后一组之后没有正文：信息位于文末（署名），每组结束即一篇结束。
  const last = groups[groups.length - 1];
  if (lines.slice(last.end + 1).every((line) => line.meta)) {
    return { anchors: [0, ...groups.slice(0, -1).map((group) => group.end + 1)] };
  }

  // 每组中与首组首行同键的行为锚点；组内锚点之前的信息行（如上一篇的指导老师）留给上一篇。
  const firstKey = (index: number) => lines[index].meta?.keys[0];
  const leadKey = firstKey(groups[0].start);
  const anchors = groups.map((group) => {
    for (let index = group.start; index <= group.end; index++) {
      if (firstKey(index) === leadKey) return index;
    }
    return group.start;
  });
  return {
    anchors,
    align: "snapOrPrefix",
    lowerBounds: groups.map((_, j) => (j === 0 ? -1 : groups[j - 1].end)),
  };
}

function byMarkers(lines: Line[]): Proposal | null {
  for (const explicit of [true, false]) {
    // 取编号从 1 开始逐一递增的链，避免把正文里的小列表当作分篇。
    const chain: number[] = [];
    lines.forEach(({ marker }, index) => {
      if (marker?.explicit === explicit && marker.number === chain.length + 1) {
        chain.push(index);
      }
    });
    // “一、题目”式列表编号也常用于单篇作文的小标题，只在文档以编号开头时采用。
    if (chain.length >= 2 && (explicit || chain[0] === 0)) {
      return { anchors: chain, align: "snap" };
    }
  }
  return null;
}

/** 每篇固定出现的抬头（如“作文批改报告”）或结尾行（如“（完）”）。 */
function byRepeatedLines(lines: Line[]): Proposal | null {
  const positions = new Map<string, number[]>();
  lines.forEach((line, index) => {
    if (!isRepeatedTitleLike(line)) return;
    const list = positions.get(line.text);
    if (list) list.push(index);
    else positions.set(line.text, [index]);
  });

  // 多数出现处紧跟正文长段的重复行是同名题目（如多名学生都写“我最喜爱的积木”），
  // 不是每篇固定的抬头。
  const followedByBody = (index: number) => {
    const next = lines[index + 1];
    return next !== undefined && !next.meta && !next.titleLike;
  };
  const leading = [...positions.values()]
    .filter((list) => list[0] <= MAX_FIRST_START)
    .filter((list) => list.filter(followedByBody).length * 2 < list.length)
    .sort((a, b) => b.length - a.length || a[0] - b[0]);
  if (leading.length > 0) return { anchors: leading[0], align: "snap" };

  const lastIndex = lines.length - 1;
  const trailing = [...positions.values()]
    .filter((list) => list[list.length - 1] === lastIndex)
    .sort((a, b) => b.length - a.length);
  if (trailing.length > 0) {
    return { anchors: [0, ...trailing[0].slice(0, -1).map((index) => index + 1)] };
  }
  return null;
}

/** 分页/分节切出的每段都至少两块，且页眉各不相同或多数段以题目式短行开头，才视为分篇。 */
function byHardBoundaries(lines: Line[]): Proposal | null {
  const starts = [0];
  lines.forEach((line, index) => {
    if (line.hard) starts.push(index);
  });
  if (starts.length < 2) return null;
  const ends = [...starts.slice(1), lines.length];
  if (starts.some((start, index) => ends[index] - start < 2)) return null;

  const firstLines = starts.map((start) => lines[start]);
  const distinctHeaders = new Set(firstLines.map((line) => line.header).filter(Boolean)).size;
  if (distinctHeaders >= Math.max(2, Math.ceil(starts.length * DISTINCT_HEADER_RATIO))) {
    return { anchors: starts };
  }
  const startsLikeEssay = firstLines.filter((line) => line.titleLike || line.meta).length;
  return startsLikeEssay >= Math.ceil(starts.length * HARD_START_RATIO)
    ? { anchors: starts }
    : null;
}

function byStartLines(
  lines: Line[],
  isStart: (line: Line, index: number) => boolean,
): Proposal | null {
  const starts = lines
    .map((line, index) => (isStart(line, index) ? index : -1))
    .filter((index) => index >= 0);
  if (starts.length < 2 || starts[0] > MAX_FIRST_START) return null;
  // 相邻的标题行（如主副标题）只取第一行。
  return { anchors: starts.filter((start, i) => i === 0 || start - starts[i - 1] > 1) };
}

/** 只取最高一级标题，避免把单篇作文的小标题当作分篇。 */
function byHeadings(lines: Line[]): Proposal | null {
  const levels = lines
    .map((line) => line.block.headingLevel)
    .filter((level): level is number => level !== undefined);
  if (levels.length === 0) return null;
  const top = Math.min(...levels);
  return byStartLines(lines, (line) => line.block.headingLevel === top);
}

/** 居中的短行，且其后的段落不居中：常见于未使用标题样式的作文集。 */
function byCenteredTitles(lines: Line[]): Proposal | null {
  const centeredCount = lines.filter((line) => line.block.centered).length;
  if (centeredCount === 0 || centeredCount > lines.length * MAX_CENTERED_RATIO) return null;
  return byStartLines(
    lines,
    (line, index) =>
      line.block.centered &&
      line.titleLike &&
      lines[index + 1] !== undefined &&
      !lines[index + 1].block.centered,
  );
}

/**
 * 按连续空段切分。阈值取能让切点不超过三成的最小空段数，
 * 避免把“段间空一行”的排版习惯当成分篇。
 */
function byBlankRuns(lines: Line[]): Proposal | null {
  const maxBlank = Math.max(...lines.map((line) => line.block.blankBefore));
  for (let threshold = 1; threshold <= maxBlank; threshold++) {
    const starts = [0];
    lines.forEach((line, index) => {
      if (index > 0 && line.block.blankBefore >= threshold) starts.push(index);
    });
    if (starts.length < 2) return null;
    if (starts.length - 1 <= lines.length * MAX_BLANK_CUT_RATIO) return { anchors: starts };
  }
  return null;
}
