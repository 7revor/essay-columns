import type { Essay, EssayContent, DetectedPattern } from "../types";

function preview(text: string): string {
  return text.length > 30 ? text.slice(0, 30) + "…" : text;
}

export function detectPatterns(essays: Essay[]): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];

  const markers = essays.flatMap((essay) =>
    essay.lines.filter((line) => line.role === "marker").map((line) => line.text),
  );
  if (markers.length > 0) {
    patterns.push({
      id: "marker",
      label: `篇章编号: "${preview(markers[0])}" 等`,
      count: markers.length,
      examples: [...new Set(markers)],
      type: "header",
    });
  }

  const countByRole = (role: "template" | "body") => {
    const counts = new Map<string, number>();
    for (const essay of essays) {
      const seen = new Set<string>();
      for (const line of essay.lines) {
        if (line.role !== role || seen.has(line.text)) continue;
        seen.add(line.text);
        counts.set(line.text, (counts.get(line.text) ?? 0) + 1);
      }
    }
    return counts;
  };

  let index = 0;
  for (const [text, count] of countByRole("template")) {
    patterns.push({
      id: `template-${index++}`,
      label: `模板行: "${preview(text)}"`,
      count,
      examples: [text],
      type: "header",
    });
  }

  // 正文中跨篇重复的段落仅供用户选择删除，默认保留，避免误删真实内容。
  const threshold = Math.max(3, Math.floor(essays.length * 0.3));
  index = 0;
  for (const [text, count] of countByRole("body")) {
    if (count < threshold) continue;
    patterns.push({
      id: `dup-${index++}`,
      label: `重复内容: "${preview(text)}"`,
      count,
      examples: [text],
      type: "decorative",
    });
  }

  return patterns;
}

/** 默认删除结构性模式（模板行、篇章编号），正文重复内容默认保留。 */
export function defaultRemovedIds(patterns: DetectedPattern[]): Set<string> {
  return new Set(
    patterns.filter((p) => p.type === "header").map((p) => p.id),
  );
}

export function filterEssay(
  essay: Essay,
  removedIds: Set<string>,
  patterns: DetectedPattern[],
  titleAsFirstParagraph: boolean,
  stripInfoLines: boolean,
): EssayContent {
  const removedStructure = new Set<string>();
  const removedBody = new Set<string>();
  for (const pattern of patterns) {
    if (!removedIds.has(pattern.id)) continue;
    const target = pattern.type === "decorative" ? removedBody : removedStructure;
    for (const example of pattern.examples) target.add(example);
  }

  const sourceHeader = essay.sourceHeader?.trim();
  const headerParts = sourceHeader ? [sourceHeader] : [];
  const paragraphs: string[] = [];
  let title = "";

  for (const { text, role } of essay.lines) {
    switch (role) {
      case "meta":
        if (!stripInfoLines) paragraphs.push(text);
        else if (!headerParts.includes(text)) headerParts.push(text);
        break;
      case "template":
      case "marker":
        if (!removedStructure.has(text)) paragraphs.push(text);
        break;
      case "title":
        if (titleAsFirstParagraph && !title) title = text;
        else paragraphs.push(text);
        break;
      case "body":
        if (!removedBody.has(text)) paragraphs.push(text);
        break;
    }
  }

  if (titleAsFirstParagraph && !title) title = paragraphs.shift() ?? "";

  return {
    header: headerParts.length > 0 ? headerParts.join("  ") : undefined,
    title,
    paragraphs,
  };
}
