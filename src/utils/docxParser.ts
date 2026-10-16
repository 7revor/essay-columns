import mammoth from "mammoth";
import type { Essay } from "../types";
import { parseSectionEssays } from "./docxStructure.ts";
import { isEssayBoundaryInfoLine } from "./textPatterns.ts";

/**
 * Find the best delimiter line that splits the document into essays.
 *
 * Strategy: count how many times each non-empty line appears. Lines that repeat
 * many times and are short (likely headers/separators, not essay body) are
 * candidates. Among candidates, pick the one whose occurrences are most evenly
 * spaced — that line is the recurring essay boundary.
 */
export function findDelimiterPattern(lines: string[]): string | null {
  const freq = new Map<string, number[]>();

  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) continue;
    const arr = freq.get(t);
    if (arr) arr.push(i);
    else freq.set(t, [i]);
  }

  const MIN_REPEAT = 3;
  const MAX_CHAR_LEN = 50;

  let best: string | null = null;
  let bestScore = -1;

  for (const [text, positions] of freq) {
    if (positions.length < MIN_REPEAT) continue;
    if (text.length > MAX_CHAR_LEN) continue;

    const gaps: number[] = [];
    for (let i = 1; i < positions.length; i++) {
      gaps.push(positions[i] - positions[i - 1]);
    }
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    if (mean < 2) continue;

    const variance = gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / gaps.length;
    const cv = Math.sqrt(variance) / mean;

    // score: more occurrences + more even spacing = better
    // cv (coefficient of variation) close to 0 means very even
    const score = positions.length * (1 / (1 + cv));

    if (score > bestScore) {
      bestScore = score;
      best = text;
    }
  }

  return best;
}

export async function parseDocx(file: File): Promise<Essay[]> {
  const arrayBuffer = await file.arrayBuffer();
  try {
    const sectionEssays = await parseSectionEssays(arrayBuffer);
    if (sectionEssays) return sectionEssays;
  } catch (error) {
    console.warn("DOCX 结构解析失败，已回退到纯文本识别。", error);
  }

  const result = await mammoth.extractRawText({ arrayBuffer });
  const trimmedLines = result.value.split("\n").map((l) => l.trim());

  return parseTextEssays(trimmedLines);
}

export function parseTextEssays(lines: string[]): Essay[] {
  const infoLineEssays = splitByInfoLines(lines);
  if (infoLineEssays) return infoLineEssays;

  const delimiter = findDelimiterPattern(lines);

  if (!delimiter) {
    // Fallback: treat consecutive non-empty lines as a single essay,
    // separated by blank-line gaps (2+ consecutive blanks).
    return splitByBlankLines(lines);
  }

  const essays: Essay[] = [];
  let paras: string[] = [];

  for (const line of lines) {
    if (line === delimiter) {
      if (paras.length > 0) {
        essays.push({ delimiter, paragraphs: [...paras] });
        paras = [];
      }
      continue;
    }
    if (!line) continue;
    paras.push(line);
  }

  // Remaining paragraphs after the last delimiter
  if (paras.length > 0) {
    essays.push({ delimiter, paragraphs: [...paras] });
  }

  return essays;
}

function splitByInfoLines(lines: string[]): Essay[] | null {
  const boundaryIndexes = lines
    .map((line, index) =>
      isEssayBoundaryInfoLine(line.trim()) ? index : -1,
    )
    .filter((index) => index >= 0);
  if (boundaryIndexes.length < 2) return null;

  const titleIndexes = detectTitlesBeforeInfoLines(lines, boundaryIndexes);
  if (titleIndexes) {
    return splitByTitlesBeforeInfoLines(lines, boundaryIndexes, titleIndexes);
  }

  const essays: Essay[] = [];
  let sourceHeader: string | undefined;
  let paragraphs: string[] = [];

  const flush = () => {
    if (!sourceHeader || paragraphs.length === 0) return;
    essays.push({ delimiter: "", sourceHeader, paragraphs });
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (isEssayBoundaryInfoLine(line)) {
      flush();
      sourceHeader = line;
      paragraphs = [];
      continue;
    }
    if (sourceHeader && line) paragraphs.push(line);
  }
  flush();

  return essays.length >= 2 ? essays : null;
}

function detectTitlesBeforeInfoLines(
  lines: string[],
  boundaryIndexes: number[],
): number[] | null {
  const titleIndexes = boundaryIndexes.map((boundaryIndex) => {
    for (let index = boundaryIndex - 1; index >= 0; index--) {
      if (lines[index].trim()) return index;
    }
    return -1;
  });

  // A title-before-info document starts with a title before the very first
  // personal-information line. Requiring the same short-title shape for most
  // boundaries prevents short body paragraphs in info-first documents from
  // being pulled into the following essay.
  if (titleIndexes[0] < 0) return null;

  const titleLikeCount = titleIndexes.filter((index) => {
    if (index < 0) return false;
    const text = lines[index].trim();
    return (
      text.length > 0 &&
      text.length <= 50 &&
      !isEssayBoundaryInfoLine(text) &&
      !/[。！？!?；;]$/u.test(text)
    );
  }).length;

  return titleLikeCount >= Math.ceil(boundaryIndexes.length * 0.8)
    ? titleIndexes
    : null;
}

function splitByTitlesBeforeInfoLines(
  lines: string[],
  boundaryIndexes: number[],
  titleIndexes: number[],
): Essay[] | null {
  const essays: Essay[] = [];

  for (let essayIndex = 0; essayIndex < boundaryIndexes.length; essayIndex++) {
    const titleIndex = titleIndexes[essayIndex];
    const boundaryIndex = boundaryIndexes[essayIndex];
    const nextTitleIndex = titleIndexes[essayIndex + 1] ?? lines.length;
    if (titleIndex < 0 || titleIndex >= boundaryIndex) continue;

    const paragraphs = [
      lines[titleIndex].trim(),
      ...lines
        .slice(boundaryIndex + 1, nextTitleIndex)
        .map((line) => line.trim())
        .filter(Boolean),
    ];
    if (paragraphs.length < 2) continue;

    essays.push({
      delimiter: "",
      sourceHeader: lines[boundaryIndex].trim(),
      paragraphs,
    });
  }

  return essays.length >= 2 ? essays : null;
}

function splitByBlankLines(lines: string[]): Essay[] {
  const essays: Essay[] = [];
  let paras: string[] = [];
  let blankCount = 0;

  for (const line of lines) {
    if (!line) {
      blankCount++;
      // Split only on 2+ consecutive blank lines
      if (blankCount >= 2 && paras.length > 0) {
        essays.push({ delimiter: "", paragraphs: [...paras] });
        paras = [];
      }
      continue;
    }
    blankCount = 0;
    paras.push(line);
  }

  if (paras.length > 0) {
    essays.push({ delimiter: "", paragraphs: [...paras] });
  }

  return essays;
}
