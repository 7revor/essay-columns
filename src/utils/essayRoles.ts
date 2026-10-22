import type { EssayLine, LineRole } from "../types";
import { isContentLine, isPureMarker, type Line } from "./lineFeatures.ts";

/** 模板行在多少比例的作文中出现才算作模板。 */
const TEMPLATE_RATIO = 0.6;
/** 结尾区域的行数，用于识别“（完）”这类结尾模板。 */
const EPILOGUE_LINES = 2;

/**
 * 一篇作文按正文行分为三区：开头区（信息、编号、模板、题目）→ 正文区 → 结尾区（署名、模板）。
 * 没有正文行时全篇都是开头区。
 */
interface Zones {
  /** 第一行正文的位置；没有正文时为行数。 */
  bodyStart: number;
  /** 最后一行正文之后的位置；没有正文时为 0。 */
  bodyEnd: number;
}

function zonesOf(lines: Line[]): Zones {
  const content = lines.map(isContentLine);
  const bodyStart = content.indexOf(true);
  return {
    bodyStart: bodyStart < 0 ? lines.length : bodyStart,
    bodyEnd: content.lastIndexOf(true) + 1,
  };
}

const inBody = (zones: Zones, index: number) =>
  index >= zones.bodyStart && index < zones.bodyEnd;

/** 用于展示和比较的文本：信息行取规整后的文本（如表格信息栏）。 */
const displayText = (line: Line) => line.meta?.text ?? line.text;

/** 题目位：正文前最后一个非信息、非编号的行。 */
function titleSlotIndex(lines: Line[], zones: Zones): number {
  for (let index = zones.bodyStart - 1; index >= 0; index--) {
    if (!lines[index].meta && !isPureMarker(lines[index])) return index;
  }
  return -1;
}

/**
 * 找出各篇共有的模板行（如“作文批改报告”“【润色提升】”“（完）”）：
 * 在足够多篇的开头区或最后几行出现的题目式短行。
 * 若某重复行在多数篇中处于题目位，则视为相同的题目而非模板。
 */
function detectTemplates(essays: Line[][], zones: Zones[]): Set<string> {
  const templates = new Set<string>();
  if (essays.length < 2) return templates;

  const occurrences = new Map<string, { essays: number; inTitleSlot: number }>();
  essays.forEach((lines, essayIndex) => {
    const { bodyStart } = zones[essayIndex];
    const epilogueStart = lines.length - EPILOGUE_LINES;
    const slot = titleSlotIndex(lines, zones[essayIndex]);
    const seen = new Set<string>();
    lines.forEach((line, index) => {
      const text = displayText(line);
      if (line.meta || !line.titleLike || seen.has(text)) return;
      if (index >= bodyStart && index < epilogueStart) return;
      seen.add(text);
      const entry = occurrences.get(text) ?? { essays: 0, inTitleSlot: 0 };
      entry.essays++;
      if (index === slot) entry.inTitleSlot++;
      occurrences.set(text, entry);
    });
  });

  const minimum = Math.max(2, Math.ceil(essays.length * TEMPLATE_RATIO));
  for (const [text, entry] of occurrences) {
    if (entry.essays >= minimum && entry.inTitleSlot * 2 <= entry.essays) {
      templates.add(text);
    }
  }
  return templates;
}

/**
 * 为每篇作文的每一行标注角色。规则按分区：
 * - 开头区、结尾区的信息行是 meta；
 * - 纯编号在任何位置都是 marker；
 * - 开头区、结尾区的模板文本是 template；
 * - 开头区第一个题目式短行是 title；
 * - 其余为 body（包括正文区中的信息行和模板文本）。
 */
export function classifyEssayLines(essays: Line[][]): EssayLine[][] {
  const zones = essays.map(zonesOf);
  const templates = detectTemplates(essays, zones);

  return essays.map((lines, essayIndex) => {
    const essayZones = zones[essayIndex];
    let titleAssigned = false;

    return lines.map((line, index): EssayLine => {
      const text = displayText(line);
      const role = ((): LineRole => {
        const body = inBody(essayZones, index);
        if (line.meta && !body) return "meta";
        if (isPureMarker(line)) return "marker";
        if (body) return "body";
        if (templates.has(text)) return "template";
        if (!titleAssigned && index < essayZones.bodyStart && line.titleLike) {
          titleAssigned = true;
          return "title";
        }
        return "body";
      })();
      return { text, role };
    });
  });
}
