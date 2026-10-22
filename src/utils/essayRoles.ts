import type { EssayLine } from "../types";
import { isPureMarker, type Line } from "./lineFeatures.ts";

/** 模板行在多少比例的作文中出现才算作模板。 */
const TEMPLATE_RATIO = 0.6;
/** 结尾区域的行数，用于识别“（完）”这类结尾模板。 */
const EPILOGUE_LINES = 2;

interface DraftLine {
  text: string;
  meta: boolean;
  marker: boolean;
  titleLike: boolean;
}

function draftLines(lines: Line[]): DraftLine[] {
  return lines.map((line) => ({
    text: line.meta?.text ?? line.text,
    meta: line.meta !== null,
    marker: isPureMarker(line),
    titleLike: line.titleLike,
  }));
}

/** 第一行正文（既非信息行/编号，也不是短标题式的行）的位置。 */
function firstContentIndex(lines: DraftLine[]): number {
  const index = lines.findIndex(
    (line) => !line.meta && !line.marker && !line.titleLike,
  );
  return index < 0 ? lines.length : index;
}

function lastContentIndex(lines: DraftLine[]): number {
  for (let index = lines.length - 1; index >= 0; index--) {
    const line = lines[index];
    if (!line.meta && !line.marker && !line.titleLike) return index;
  }
  return -1;
}

/** 题目位：正文前最后一个非信息、非编号的行。 */
function titleSlotIndex(lines: DraftLine[]): number {
  for (let index = firstContentIndex(lines) - 1; index >= 0; index--) {
    if (!lines[index].meta && !lines[index].marker) return index;
  }
  return -1;
}

/**
 * 找出各篇共有的模板行（如“作文批改报告”“【润色提升】”“（完）”）。
 * 若某重复行在多数篇中处于题目位，则视为相同的题目而非模板。
 */
function detectTemplates(essays: DraftLine[][]): Set<string> {
  const templates = new Set<string>();
  if (essays.length < 2) return templates;

  const occurrences = new Map<string, { essays: number; inTitleSlot: number }>();
  for (const lines of essays) {
    const prologueEnd = firstContentIndex(lines);
    const epilogueStart = lines.length - EPILOGUE_LINES;
    const slot = titleSlotIndex(lines);
    const seen = new Set<string>();
    lines.forEach((line, index) => {
      if (line.meta || !line.titleLike || seen.has(line.text)) return;
      if (index >= prologueEnd && index < epilogueStart) return;
      seen.add(line.text);
      const entry = occurrences.get(line.text) ?? { essays: 0, inTitleSlot: 0 };
      entry.essays++;
      if (index === slot) entry.inTitleSlot++;
      occurrences.set(line.text, entry);
    });
  }

  const minimum = Math.max(2, Math.ceil(essays.length * TEMPLATE_RATIO));
  for (const [text, entry] of occurrences) {
    if (entry.essays >= minimum && entry.inTitleSlot * 2 <= entry.essays) {
      templates.add(text);
    }
  }
  return templates;
}

/** 为每篇作文的每一行标注角色：个人信息、模板、编号、题目或正文。 */
export function classifyEssayLines(segments: Line[][]): EssayLine[][] {
  const drafts = segments.map(draftLines);
  const templates = detectTemplates(drafts);

  return drafts.map((lines) => {
    const prologueEnd = firstContentIndex(lines);
    const epilogueStart = lastContentIndex(lines) + 1;
    let titleAssigned = false;

    return lines.map((line, index): EssayLine => {
      const outsideBody = index < prologueEnd || index >= epilogueStart;
      if (line.meta && outsideBody) return { text: line.text, role: "meta" };
      if (line.marker) return { text: line.text, role: "marker" };
      if (templates.has(line.text) && outsideBody) {
        return { text: line.text, role: "template" };
      }
      if (!titleAssigned && index < prologueEnd && line.titleLike) {
        titleAssigned = true;
        return { text: line.text, role: "title" };
      }
      return { text: line.text, role: "body" };
    });
  });
}
