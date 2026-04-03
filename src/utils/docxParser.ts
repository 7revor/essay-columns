import mammoth from "mammoth";
import type { Essay } from "../types";

const HEADER_RE = /姓名[：:]\s*(.+?)\s*班级[：:]\s*(.+)/;
const SEPARATOR_RE = /^--\s*\d+\s*of\s*\d+\s*--$/;

export async function parseDocx(
  file: File,
): Promise<{ essays: Essay[]; allLines: string[] }> {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  const allLines = result.value.split("\n");

  const essays: Essay[] = [];
  let cur: Partial<Essay> | null = null;
  let paras: string[] = [];

  const flush = () => {
    if (cur?.name) {
      essays.push({
        name: cur.name!,
        className: cur.className!,
        headerLine: cur.headerLine!,
        paragraphs: [...paras],
      });
    }
  };

  for (const raw of allLines) {
    const trimmed = raw.trim();
    const m = trimmed.match(HEADER_RE);

    if (m) {
      flush();
      cur = {
        name: m[1].trim(),
        className: m[2].replace(/\s+/g, ""),
        headerLine: trimmed.replace(/\s+/g, " "),
      };
      paras = [];
      continue;
    }

    if (!cur) continue;
    if (!trimmed || SEPARATOR_RE.test(trimmed)) continue;

    paras.push(trimmed);
  }

  flush();
  return { essays, allLines };
}
