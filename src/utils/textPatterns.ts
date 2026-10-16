export const INFO_LINE_RE = /(?:姓名|班级|年级|学号|学生|作者)\s*[：:]/u;

const PERSON_INFO_RE = /(?:姓名|学生|作者)\s*[：:]/u;
const CLASS_INFO_RE = /(?:班级|年级)\s*[：:]/u;

export function isInfoLine(text: string): boolean {
  return INFO_LINE_RE.test(text);
}

export function isEssayBoundaryInfoLine(text: string): boolean {
  return PERSON_INFO_RE.test(text) && CLASS_INFO_RE.test(text);
}
