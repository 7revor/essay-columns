export interface Essay {
  name: string;
  className: string;
  headerLine: string;
  paragraphs: string[];
}

export interface EssayContent {
  header?: string;
  title: string;
  paragraphs: string[];
}

export interface DetectedPattern {
  id: string;
  label: string;
  count: number;
  examples: string[];
  type: "header" | "separator" | "empty" | "decorative";
}

export interface LayoutSettings {
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  columns: number;
  columnGapChars: number;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  titleAsFirstParagraph: boolean;
}

export interface PageLayout {
  columns: ColumnLayout[];
}

export interface ColumnLayout {
  essayIndices: number[];
  usedHeight: number;
}

export const A4_WIDTH_MM = 210;
export const A4_HEIGHT_MM = 297;
export const MM_TO_PX = 96 / 25.4;
export const PT_TO_MM = 25.4 / 72;
export const ESSAY_GAP_MM = 2;

export const DEFAULT_SETTINGS: LayoutSettings = {
  marginTop: 5,
  marginBottom: 10,
  marginLeft: 5,
  marginRight: 5,
  columns: 2,
  columnGapChars: 1,
  fontFamily: '"SimSun", "STSong", "Songti SC", serif',
  fontSize: 8,
  lineHeight: 1.2,
  titleAsFirstParagraph: true,
};

export const FONT_OPTIONS = [
  { label: "宋体", value: '"SimSun", "STSong", "Songti SC", serif' },
  { label: "黑体", value: '"SimHei", "STHeiti", "Heiti SC", sans-serif' },
  { label: "楷体", value: '"KaiTi", "STKaiti", "Kaiti SC", serif' },
  { label: "仿宋", value: '"FangSong", "STFangsong", serif' },
  {
    label: "苹方/雅黑",
    value: '"PingFang SC", "Microsoft YaHei", sans-serif',
  },
];
