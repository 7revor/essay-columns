import mammoth from "mammoth";
import type { Essay } from "../types";

/**
 * Find the best delimiter line that splits the document into essays.
 *
 * Strategy: count how many times each non-empty line appears. Lines that repeat
 * many times and are short (likely headers/separators, not essay body) are
 * candidates. Among candidates, pick the one whose occurrences are most evenly
 * spaced — that line is the recurring essay boundary.
 */
function findDelimiterPattern(lines: string[]): string | null {
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

export async function parseDocx(file: File): Promise<{ essays: Essay[]; allLines: string[] }> {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  const allLines = result.value.split("\n");

  const trimmedLines = allLines.map((l) => l.trim());

  const delimiter = findDelimiterPattern(trimmedLines);

  if (!delimiter) {
    // Fallback: treat consecutive non-empty lines as a single essay,
    // separated by blank-line gaps (2+ consecutive blanks).
    return { essays: splitByBlankLines(trimmedLines), allLines };
  }

  const essays: Essay[] = [];
  let paras: string[] = [];

  for (const line of trimmedLines) {
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

  // If delimiter appears BEFORE each essay (header style), the first chunk
  // before the first delimiter may be empty — already handled by paras.length check.
  // If delimiter appears AFTER each essay, the last chunk is already captured above.

  return { essays, allLines };
}

function splitByBlankLines(lines: string[]): Essay[] {
  const essays: Essay[] = [];
  let paras: string[] = [];

  for (const line of lines) {
    if (!line) {
      if (paras.length > 0) {
        essays.push({ delimiter: "", paragraphs: [...paras] });
        paras = [];
      }
      continue;
    }
    paras.push(line);
  }

  if (paras.length > 0) {
    essays.push({ delimiter: "", paragraphs: [...paras] });
  }

  return essays;
}
