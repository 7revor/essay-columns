import type { Essay, EssayContent, DetectedPattern } from "../types";

export function detectPatterns(
  essays: Essay[],
  allLines: string[],
): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];

  if (essays.length > 0) {
    patterns.push({
      id: "header",
      label: "姓名/班级信息",
      count: essays.length,
      examples: essays.slice(0, 2).map((e) => e.headerLine),
      type: "header",
    });
  }

  const SEPARATOR_RE = /^--\s*\d+\s*of\s*\d+\s*--$/;
  const seps = allLines.filter((l) => SEPARATOR_RE.test(l.trim()));
  if (seps.length > 0) {
    patterns.push({
      id: "separator",
      label: `页码分隔线 (如 "${seps[0].trim()}")`,
      count: seps.length,
      examples: seps.slice(0, 2).map((l) => l.trim()),
      type: "separator",
    });
  }

  const paraFreq = new Map<string, { count: number; names: string[] }>();
  for (const essay of essays) {
    const seen = new Set<string>();
    for (const p of essay.paragraphs) {
      const n = p.trim();
      if (!n || seen.has(n)) continue;
      seen.add(n);
      const e = paraFreq.get(n);
      if (e) {
        e.count++;
        if (e.names.length < 3) e.names.push(essay.name);
      } else {
        paraFreq.set(n, { count: 1, names: [essay.name] });
      }
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
): EssayContent {
  const decorativeTexts = new Set<string>();
  for (const p of patterns) {
    if (!removedIds.has(p.id) || p.type !== "decorative") continue;
    for (const ex of p.examples) decorativeTexts.add(ex);
  }

  const filtered = essay.paragraphs.filter(
    (p) => !decorativeTexts.has(p.trim()),
  );

  const result: EssayContent = {
    title: titleAsFirstParagraph ? filtered[0] || "" : "",
    paragraphs: titleAsFirstParagraph ? filtered.slice(1) : filtered,
  };

  if (!removedIds.has("header")) {
    result.header = essay.headerLine;
  }

  return result;
}
