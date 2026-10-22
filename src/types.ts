/**
 * 行在作文中的角色：
 * - meta：个人信息（姓名、班级、指导老师等），默认移入页头；
 * - template：各篇共有的模板行（如“作文批改报告”），默认删除；
 * - marker：纯篇章编号（如“第1篇”），默认删除；
 * - title：题目；body：正文。
 */
export type LineRole = "meta" | "template" | "marker" | "title" | "body";

export interface EssayLine {
  text: string;
  role: LineRole;
}

export interface Essay {
  /** 按原文顺序排列的行。 */
  lines: EssayLine[];
  /** 来自真实页眉的页头。 */
  sourceHeader?: string;
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
  fontSize: number;
  lineHeight: number;
  titleAsFirstParagraph: boolean;
  stripInfoLines: boolean;
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

export const FONT_URL_LOCAL = "/fonts/Source-Han-Serif-SC-Regular.woff";
export const FONT_URL_OSS =
  "https://py-sp.oss-cn-beijing.aliyuncs.com/smartDesign/font/思源字体/Source-Han-Serif-SC-Regular.woff";
export const FONT_CACHE_KEY = "Source-Han-Serif-SC-Regular";
export const FONT_FAMILY = '"Source Han Serif SC", serif';

// pdfmake lineHeight multiplier for Source Han Serif SC
// derived from (ascender - descender) / unitsPerEm
export const FONT_LH_RATIO = 1.437;

export const DEFAULT_SETTINGS: LayoutSettings = {
  marginTop: 5,
  marginBottom: 5,
  marginLeft: 5,
  marginRight: 5,
  columns: 2,
  columnGapChars: 1,
  fontSize: 8,
  lineHeight: 1.2,
  titleAsFirstParagraph: true,
  stripInfoLines: true,
};
