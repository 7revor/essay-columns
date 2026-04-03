import type { Essay, EssayContent, DetectedPattern } from "../types";

const INFO_LINE_RE = /(?:姓名|班级)[：:]/;

export function detectPatterns(
  essays: Essay[],
  _allLines: string[],
): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];

  if (essays.length > 0 && essays[0].delimiter) {
    patterns.push({
      id: "delimiter",
      label: `分隔标记: "${essays[0].delimiter.length > 30 ? essays[0].delimiter.slice(0, 30) + "…" : essays[0].delimiter}"`,
      count: essays.length,
      examples: [essays[0].delimiter],
      type: "header",
    });
  }

  const paraFreq = new Map<string, { count: number }>();
  for (const essay of essays) {
    const seen = new Set<string>();
    for (const p of essay.paragraphs) {
      const n = p.trim();
      if (!n || seen.has(n)) continue;
      seen.add(n);
      const e = paraFreq.get(n);
      if (e) e.count++;
      else paraFreq.set(n, { count: 1 });
    }
  }

  const threshold = Math.max(3, Math.floor(essays.length * 0.3));
  let idx = 0;
  for (const [text, info] of paraFreq) {
    if (info.count >= threshold) {
      patterns.push({
        id: `dup-${idx++}`,
        label: `重复内容: "${text.length > 30 ? text.slice(0, 30) + "…" : text}"`,
        count: info.count,
        examples: [text],
        type: "decorative",
      });
    }
  }

  return patterns;
}

export function filterEssay(
  essay: Essay,
  removedIds: Set<string>,
  patterns: DetectedPattern[],
  titleAsFirstParagraph: boolean,
  stripInfoLines: boolean,
): EssayContent {
  const decorativeTexts = new Set<string>();
  for (const p of patterns) {
    if (!removedIds.has(p.id) || p.type !== "decorative") continue;
    for (const ex of p.examples) decorativeTexts.add(ex);
  }

  let filtered = essay.paragraphs.filter(
    (p) => !decorativeTexts.has(p.trim()),
  );

  let header: string | undefined;

  if (stripInfoLines) {
    const infoLines: string[] = [];
    const rest: string[] = [];
    for (const line of filtered) {
      if (INFO_LINE_RE.test(line) && rest.length === 0) {
        infoLines.push(line);
      } else {
        rest.push(line);
      }
    }
    if (infoLines.length > 0) {
      header = infoLines.join("  ");
      filtered = rest;
    }
  }

  if (!removedIds.has("delimiter") && essay.delimiter) {
    header = essay.delimiter;
  }

  return {
    header,
    title: titleAsFirstParagraph ? filtered[0] || "" : "",
    paragraphs: titleAsFirstParagraph ? filtered.slice(1) : filtered,
  };
}
