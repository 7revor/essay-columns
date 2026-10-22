/** 表示人员身份的信息键；其余键（班级、学校等）只作为附属信息。 */
const PERSON_KEYS = ["学生姓名", "小作者", "姓名", "名字", "学生", "作者"];
const OTHER_KEYS = [
  "指导老师",
  "指导教师",
  "辅导老师",
  "班级",
  "年级",
  "学校",
  "学号",
  "考号",
  "座号",
  "性别",
  "年龄",
  "日期",
];
const ALL_KEYS = [...PERSON_KEYS, ...OTHER_KEYS];

// 允许键名字符之间有空格，例如“姓 名：”“班　级：”。
const spaced = (key: string) => [...key].join("[\\s\\u3000]*");
const KEY_PATTERN = ALL_KEYS.map(spaced).join("|");
const LABELED_RE = new RegExp(
  `(?:【\\s*(${KEY_PATTERN})\\s*】|(${KEY_PATTERN})[\\s\\u3000]*[：:])`,
  "gu",
);
const KEY_ONLY_RE = new RegExp(`^(?:${KEY_PATTERN})[\\s\\u3000]*[：:]?$`, "u");

const NUMBER = "[0-9０-９一二三四五六七八九十]+";
const GRADE = `(?:[一二三四五六七八九]|[1-9]|初[一二三]|高[一二三])\\s*年级`;
const CLASS = `[（(]?\\s*${NUMBER}\\s*[)）]?\\s*班`;
const CLASS_TOKEN_RE = new RegExp(
  `^(?:${GRADE}\\s*(?:${CLASS})?|${NUMBER}\\s*[（(]\\s*${NUMBER}\\s*[)）]\\s*班|${NUMBER}年级?${NUMBER}班)$`,
  "u",
);
const SCHOOL_TOKEN_RE = /^\S{2,12}(?:小学|中学|学校|学院|校区)$/u;
const NAME_TOKEN_RE = /^[\p{Script=Han}A-Za-z0-9·]{1,6}$/u;

export interface MetaLine {
  /** 按出现顺序归一化后的键名；无标签的“班级 + 姓名”记为 "#班级"。 */
  keys: string[];
  /** 是否包含能区分作者的人员信息。 */
  person: boolean;
  /** 用于页头展示的文本。 */
  text: string;
}

function canonicalKey(raw: string): string {
  return raw.replace(/[\s　]/g, "");
}

function parseTableMeta(cells: string[]): MetaLine | null {
  const keys: string[] = [];
  const pairs: string[] = [];
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i].trim();
    if (KEY_ONLY_RE.test(cell)) {
      const key = canonicalKey(cell).replace(/[：:]$/, "");
      const next = cells[i + 1]?.trim() ?? "";
      const hasValue = next !== "" && !KEY_ONLY_RE.test(next);
      keys.push(key);
      pairs.push(`${key}：${hasValue ? next : ""}`);
      if (hasValue) i++;
      continue;
    }
    const inline = parseMetaLine(cell);
    if (inline) {
      keys.push(...inline.keys);
      pairs.push(cell);
    }
  }
  if (keys.length === 0) return null;
  return {
    keys,
    person: keys.some((key) => PERSON_KEYS.includes(key)),
    text: pairs.join("  "),
  };
}

function parseUnlabeledMeta(text: string): MetaLine | null {
  if (text.length > 30) return null;
  const tokens = text.split(/[\s　]+/).filter(Boolean);
  if (tokens.length < 1 || tokens.length > 4) return null;

  let hasClass = false;
  let hasName = false;
  for (const token of tokens) {
    if (CLASS_TOKEN_RE.test(token)) hasClass = true;
    else if (SCHOOL_TOKEN_RE.test(token)) continue;
    else if (NAME_TOKEN_RE.test(token)) hasName = true;
    else return null;
  }
  if (!hasClass) return null;
  return { keys: ["#班级"], person: hasName, text };
}

/**
 * 判断一行是否为个人信息（姓名、班级、学校、指导老师等）。
 * 支持“键：值”、键名带空格、【键】值、表格单元格以及无标签的“三年级3班 张三”。
 */
export function parseMetaLine(text: string, cells?: string[]): MetaLine | null {
  if (cells && cells.length > 1) return parseTableMeta(cells);

  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 80) return null;

  const matches = [...trimmed.matchAll(LABELED_RE)];
  if (matches.length > 0) {
    const first = matches[0];
    const leading = trimmed.slice(0, first.index).replace(/[\s　（(【[]/g, "");
    const startsWithKey = leading === "";
    // 键前可以是无标签的学校、班级，如“二年级（14）班  姓名：张三”。
    const prefixTokens = trimmed.slice(0, first.index).split(/[\s　]+/).filter(Boolean);
    const classPrefix =
      !startsWithKey &&
      prefixTokens.every(
        (token) => CLASS_TOKEN_RE.test(token) || SCHOOL_TOKEN_RE.test(token),
      );
    if (!startsWithKey && !classPrefix && matches.length < 2) return null;

    // 单个键后紧跟引号多为对话（如“作者：“……”），不当作信息行。
    const afterFirst = trimmed.slice(first.index! + first[0].length).trim();
    if (matches.length === 1 && /^[“"「『]/u.test(afterFirst)) return null;
    if (matches.length === 1 && trimmed.length > 40) return null;

    const keys = [
      ...(classPrefix ? ["#班级"] : []),
      ...matches.map((match) => canonicalKey(match[1] ?? match[2])),
    ];
    return {
      keys,
      person: keys.some((key) => PERSON_KEYS.includes(key)),
      text: trimmed,
    };
  }

  return parseUnlabeledMeta(trimmed);
}

export function isInfoLine(text: string): boolean {
  return parseMetaLine(text) !== null;
}

const TERMINAL_PUNCTUATION_RE = /[。！？!?；;…，,：:、]$/u;
const CLOSING_MARKS_RE = /[”’"'」』）)】\]》]+$/u;

/** 短且不以句末标点结尾的行，可能是题目或模板标签。 */
export function isTitleLike(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 30) return false;
  const core = trimmed.replace(CLOSING_MARKS_RE, "");
  if (!core) return true;
  return !TERMINAL_PUNCTUATION_RE.test(core);
}

const CHINESE_DIGITS: Record<string, number> = {
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
};

function parseNumber(raw: string): number | null {
  const normalized = raw.replace(/[０-９]/g, (digit) =>
    String(digit.charCodeAt(0) - 0xff10),
  );
  if (/^\d+$/.test(normalized)) return Number(normalized);
  if (!/^[一二三四五六七八九十]+$/.test(raw)) return null;
  if (raw === "十") return 10;
  if (raw.length === 1) return CHINESE_DIGITS[raw];
  if (raw.startsWith("十")) return 10 + CHINESE_DIGITS[raw[1]];
  const tens = CHINESE_DIGITS[raw[0]] * 10;
  return raw.length === 2 && raw[1] === "十" ? tens : tens + (CHINESE_DIGITS[raw[2]] ?? 0);
}

const MARKER_RE = new RegExp(
  `^(?:第\\s*(${NUMBER})\\s*篇(?:作文)?|作文\\s*(${NUMBER})|No\\.\\s*(\\d+))\\s*[：:、.．]?\\s*(.*)$`,
  "iu",
);
const LIST_MARKER_RE = new RegExp(`^(?:(${NUMBER})\\s*[、.．]|[（(]\\s*(${NUMBER})\\s*[)）])\\s*(.+)$`, "u");

export interface EssayMarker {
  number: number;
  /** 编号后的剩余文本（通常为题目），纯编号行为空。 */
  rest: string;
  /** “第N篇”“作文N”这类明确的分篇编号；否则为“一、题目”式列表编号。 */
  explicit: boolean;
}

/** 识别“第1篇”“作文2”“三、题目”等篇章编号。 */
export function parseEssayMarker(text: string): EssayMarker | null {
  const trimmed = text.trim();
  const explicit = trimmed.match(MARKER_RE);
  if (explicit) {
    const number = parseNumber(explicit[1] ?? explicit[2] ?? explicit[3]);
    if (number === null) return null;
    return { number, rest: explicit[4].trim(), explicit: true };
  }
  const list = trimmed.match(LIST_MARKER_RE);
  if (list && isTitleLike(list[3])) {
    const number = parseNumber(list[1] ?? list[2]);
    if (number === null) return null;
    return { number, rest: list[3].trim(), explicit: false };
  }
  return null;
}
