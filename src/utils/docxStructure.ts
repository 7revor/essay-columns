import JSZip from "jszip";

const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const MC_NS = "http://schemas.openxmlformats.org/markup-compatibility/2006";
const DOCUMENT_PATH = "word/document.xml";
const DOCUMENT_RELS_PATH = "word/_rels/document.xml.rels";
const STYLES_PATH = "word/styles.xml";

/** 文档中的一个非空文本块：一个段落中的一行，或一个多单元格表格行。 */
export interface DocxBlock {
  text: string;
  /** 所在分节的序号。 */
  section: number;
  /** 前面紧邻的空段数量。 */
  blankBefore: number;
  /** 前面有分页：分页符、段前分页，或换页分节的起点。 */
  pageBreakBefore: boolean;
  /** 标题样式或大纲级别（0 为最高级）；正文为 undefined。 */
  headingLevel?: number;
  centered: boolean;
  /** 所有可见文字均为粗体。 */
  bold: boolean;
  /** 最大字号，单位为半磅。 */
  fontSize?: number;
  /** 多单元格表格行的各单元格文本。 */
  tableCells?: string[];
}

export interface DocxSection {
  header?: string;
}

export interface DocxContent {
  blocks: DocxBlock[];
  sections: DocxSection[];
}

type HeaderType = "default" | "first" | "even";
type HeaderTargets = Partial<Record<HeaderType, string>>;

interface StyleProperties {
  centered?: boolean;
  outlineLevel?: number;
  pageBreakBefore?: boolean;
  bold?: boolean;
  fontSize?: number;
  headingLevel?: number;
}

interface Styles {
  defaults: StyleProperties;
  byId: Map<string, StyleProperties>;
}

function parseXml(xml: string, partName: string): XMLDocument {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.getElementsByTagName("parsererror").length > 0) {
    throw new Error(`无法解析 DOCX XML 部件: ${partName}`);
  }
  return document;
}

function childElements(parent: Element): Element[] {
  const result: Element[] = [];
  for (let i = 0; i < parent.childNodes.length; i++) {
    const node = parent.childNodes[i];
    if (node.nodeType === 1) result.push(node as Element);
  }
  return result;
}

function directChild(parent: Element, localName: string): Element | undefined {
  return childElements(parent).find(
    (element) =>
      element.namespaceURI === WORD_NS && element.localName === localName,
  );
}

function wordAttribute(element: Element | undefined, name: string): string | null {
  if (!element) return null;
  // 部分 DOM 实现对缺失属性返回空字符串而非 null。
  return (
    element.getAttributeNS(WORD_NS, name) || element.getAttribute(`w:${name}`) || null
  );
}

/** OOXML 开关属性：无 val 或 val 不为 false/0/off 时为真。 */
function toggleValue(element: Element | undefined): boolean | undefined {
  if (!element) return undefined;
  const value = wordAttribute(element, "val");
  return !value || !/^(false|0|off|none)$/i.test(value);
}

function readRunProperties(runProperties: Element | undefined): StyleProperties {
  if (!runProperties) return {};
  const size = Number(wordAttribute(directChild(runProperties, "sz"), "val"));
  return {
    bold: toggleValue(directChild(runProperties, "b")),
    fontSize: Number.isFinite(size) && size > 0 ? size : undefined,
  };
}

function readParagraphProperties(
  paragraphProperties: Element | undefined,
): StyleProperties {
  if (!paragraphProperties) return {};
  const alignment = wordAttribute(directChild(paragraphProperties, "jc"), "val");
  const outline = wordAttribute(
    directChild(paragraphProperties, "outlineLvl"),
    "val",
  );
  const outlineLevel = outline === null ? undefined : Number(outline);
  return {
    centered: alignment ? alignment === "center" : undefined,
    outlineLevel:
      outlineLevel !== undefined && outlineLevel >= 0 && outlineLevel < 9
        ? outlineLevel
        : undefined,
    pageBreakBefore: toggleValue(directChild(paragraphProperties, "pageBreakBefore")),
  };
}

function mergeProperties(
  base: StyleProperties,
  override: StyleProperties,
): StyleProperties {
  const merged = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value !== undefined) (merged as Record<string, unknown>)[key] = value;
  }
  return merged;
}

async function readStyles(zip: JSZip): Promise<Styles> {
  const stylesFile = zip.file(STYLES_PATH);
  if (!stylesFile) return { defaults: {}, byId: new Map() };

  const document = parseXml(await stylesFile.async("string"), STYLES_PATH);
  const root = document.documentElement;
  const docDefaults = directChild(root, "docDefaults");
  const defaultRun = docDefaults && directChild(docDefaults, "rPrDefault");
  const defaults = readRunProperties(defaultRun && directChild(defaultRun, "rPr"));

  const raw = new Map<string, { basedOn?: string; own: StyleProperties }>();
  for (const style of childElements(root)) {
    if (style.localName !== "style") continue;
    const id = wordAttribute(style, "styleId");
    if (!id) continue;
    const name = wordAttribute(directChild(style, "name"), "val") || "";
    const own = mergeProperties(
      readParagraphProperties(directChild(style, "pPr")),
      readRunProperties(directChild(style, "rPr")),
    );
    const headingName = (/^(?:heading|标题)\s*(\d)$/i.exec(name) ||
      /^Heading(\d)$/.exec(id))?.[1];
    if (headingName) own.headingLevel = Number(headingName) - 1;
    else if (/^(?:title|标题)$/i.test(name) || id === "Title") own.headingLevel = 0;
    raw.set(id, {
      basedOn: wordAttribute(directChild(style, "basedOn"), "val") || undefined,
      own,
    });
  }

  const byId = new Map<string, StyleProperties>();
  const resolve = (id: string, depth: number): StyleProperties => {
    const cached = byId.get(id);
    if (cached) return cached;
    const entry = raw.get(id);
    if (!entry || depth > 20) return {};
    const resolved = mergeProperties(
      entry.basedOn ? resolve(entry.basedOn, depth + 1) : {},
      entry.own,
    );
    byId.set(id, resolved);
    return resolved;
  };
  for (const id of raw.keys()) resolve(id, 0);

  return { defaults, byId };
}

function normalizePartPath(basePart: string, target: string): string {
  const baseSegments = basePart.split("/").slice(0, -1);
  const targetSegments = target.startsWith("/")
    ? target.slice(1).split("/")
    : [...baseSegments, ...target.split("/")];
  const normalized: string[] = [];

  for (const segment of targetSegments) {
    if (!segment || segment === ".") continue;
    if (segment === "..") normalized.pop();
    else normalized.push(segment);
  }

  return normalized.join("/");
}

async function readRelationshipTargets(zip: JSZip): Promise<Map<string, string>> {
  const relsFile = zip.file(DOCUMENT_RELS_PATH);
  if (!relsFile) return new Map();

  const relsDocument = parseXml(
    await relsFile.async("string"),
    DOCUMENT_RELS_PATH,
  );
  const relationships = relsDocument.getElementsByTagName("Relationship");
  const targets = new Map<string, string>();

  for (let i = 0; i < relationships.length; i++) {
    const relationship = relationships[i];
    const id = relationship.getAttribute("Id");
    const target = relationship.getAttribute("Target");
    if (!id || !target || relationship.getAttribute("TargetMode") === "External") {
      continue;
    }
    targets.set(id, normalizePartPath(DOCUMENT_PATH, target));
  }

  return targets;
}

function updateHeaderTargets(
  sectionProperties: Element,
  relationshipTargets: Map<string, string>,
  activeTargets: HeaderTargets,
): void {
  for (const reference of childElements(sectionProperties)) {
    if (reference.localName !== "headerReference") continue;
    const type = wordAttribute(reference, "type") as HeaderType | null;
    const relationshipId = reference.getAttributeNS(REL_NS, "id");
    const target = relationshipId
      ? relationshipTargets.get(relationshipId)
      : undefined;
    if (type && target) activeTargets[type] = target;
  }
}

/**
 * 把一个 WordprocessingML 容器（正文、单元格、内容控件、文本框）展开成文本块。
 * 段落内的分页符会把段落切开，并让后续块带上 pageBreakBefore。
 */
class BlockReader {
  readonly blocks: DocxBlock[] = [];
  section = 0;
  private pendingBlank = 0;
  private pendingPageBreak = false;
  private readonly styles: Styles;
  private readonly onSectionEnd: (sectionProperties: Element) => Promise<void>;

  constructor(
    styles: Styles,
    onSectionEnd: (sectionProperties: Element) => Promise<void>,
  ) {
    this.styles = styles;
    this.onSectionEnd = onSectionEnd;
  }

  markPageBreak(): void {
    this.pendingPageBreak = true;
  }

  async readContainer(container: Element): Promise<void> {
    for (const element of childElements(container)) {
      if (element.namespaceURI !== WORD_NS) continue;
      switch (element.localName) {
        case "p":
          await this.readParagraph(element);
          break;
        case "tbl":
          await this.readTable(element);
          break;
        case "sdt": {
          const content = directChild(element, "sdtContent");
          if (content) await this.readContainer(content);
          break;
        }
        case "customXml":
          await this.readContainer(element);
          break;
        case "sectPr":
          await this.onSectionEnd(element);
          break;
      }
    }
  }

  private async readParagraph(paragraph: Element): Promise<void> {
    const paragraphProperties = directChild(paragraph, "pPr");
    const styleId = wordAttribute(
      paragraphProperties && directChild(paragraphProperties, "pStyle"),
      "val",
    );
    const style = mergeProperties(
      this.styles.defaults,
      (styleId && this.styles.byId.get(styleId)) || {},
    );
    const own = readParagraphProperties(paragraphProperties);
    const properties = mergeProperties(style, own);
    if (properties.pageBreakBefore) this.pendingPageBreak = true;

    const format = {
      headingLevel: properties.outlineLevel ?? properties.headingLevel,
      centered: Boolean(properties.centered),
    };
    let text = "";
    let visibleRuns = 0;
    let boldRuns = 0;
    let fontSize: number | undefined;
    let emitted = false;
    const textBoxes: Element[] = [];

    const flush = () => {
      const lines = text
        .replace(/ /g, " ")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      for (const line of lines) {
        this.pushBlock({
          text: line,
          ...format,
          bold: visibleRuns > 0 && boldRuns === visibleRuns,
          fontSize,
        });
        emitted = true;
      }
      text = "";
      visibleRuns = 0;
      boldRuns = 0;
      fontSize = undefined;
    };

    const visit = (node: Element, run: StyleProperties) => {
      if (node.namespaceURI === MC_NS && node.localName === "AlternateContent") {
        const children = childElements(node);
        const chosen =
          children.find((child) => child.localName === "Choice") ||
          children.find((child) => child.localName === "Fallback");
        if (chosen) visit(chosen, run);
        return;
      }
      if (node.namespaceURI === WORD_NS) {
        switch (node.localName) {
          case "pPr":
          case "rPr":
          case "del":
          case "moveFrom":
          case "instrText":
          case "delText":
            return;
          case "txbxContent":
            textBoxes.push(node);
            return;
          case "r": {
            const characterStyleId = wordAttribute(
              directChild(directChild(node, "rPr") ?? node, "rStyle"),
              "val",
            );
            const characterStyle =
              (characterStyleId && this.styles.byId.get(characterStyleId)) || {};
            const runProperties = mergeProperties(
              mergeProperties(run, characterStyle),
              readRunProperties(directChild(node, "rPr")),
            );
            for (const child of childElements(node)) visit(child, runProperties);
            return;
          }
          case "t":
            if ((node.textContent || "").trim()) {
              visibleRuns++;
              if (run.bold) boldRuns++;
              if (run.fontSize) fontSize = Math.max(fontSize ?? 0, run.fontSize);
            }
            text += node.textContent || "";
            return;
          case "tab":
            text += "\t";
            return;
          case "noBreakHyphen":
            text += "-";
            return;
          case "cr":
            text += "\n";
            return;
          case "br":
            if (wordAttribute(node, "type") === "page") {
              flush();
              this.pendingPageBreak = true;
            } else {
              text += "\n";
            }
            return;
        }
      }
      for (const child of childElements(node)) visit(child, run);
    };

    for (const child of childElements(paragraph)) visit(child, style);
    for (const textBox of textBoxes) await this.readContainer(textBox);
    flush();
    const sectionProperties =
      paragraphProperties && directChild(paragraphProperties, "sectPr");
    // 只承载分节符的空段不算作空行。
    if (!emitted && textBoxes.length === 0 && !sectionProperties) {
      this.pendingBlank++;
    }
    if (sectionProperties) await this.onSectionEnd(sectionProperties);
  }

  private async readTable(table: Element): Promise<void> {
    for (const row of this.tableChildren(table, "tr")) {
      const cells = this.tableChildren(row, "tc");
      const cellReaders: BlockReader[] = [];
      for (const cell of cells) {
        const reader = new BlockReader(this.styles, async () => {});
        reader.section = this.section;
        await reader.readContainer(cell);
        cellReaders.push(reader);
      }

      const filled = cellReaders.filter((reader) => reader.blocks.length > 0);
      if (filled.length === 0) continue;
      if (filled.length === 1) {
        // 单单元格行（常见于作文纸模板）按普通段落展开，保持段落边界。
        filled[0].blocks.forEach((block, index) =>
          this.pushBlock(index === 0 ? block : { ...block, keepSpacing: true }),
        );
        continue;
      }

      const tableCells = filled.map((reader) =>
        reader.blocks.map((block) => block.text).join(" "),
      );
      this.pushBlock({
        text: tableCells.join("\t"),
        centered: false,
        bold: filled.every((reader) => reader.blocks.every((block) => block.bold)),
        tableCells,
      });
    }
  }

  private tableChildren(parent: Element, localName: string): Element[] {
    const result: Element[] = [];
    for (const element of childElements(parent)) {
      if (element.namespaceURI !== WORD_NS) continue;
      if (element.localName === localName) {
        result.push(element);
      } else if (element.localName === "sdt") {
        const content = directChild(element, "sdtContent");
        if (content) result.push(...this.tableChildren(content, localName));
      } else if (element.localName === "customXml") {
        result.push(...this.tableChildren(element, localName));
      }
    }
    return result;
  }

  private pushBlock(
    block: Omit<DocxBlock, "section" | "blankBefore" | "pageBreakBefore"> &
      Partial<Pick<DocxBlock, "blankBefore" | "pageBreakBefore">> & {
        keepSpacing?: boolean;
      },
  ): void {
    const { keepSpacing, ...rest } = block;
    this.blocks.push({
      ...rest,
      section: this.section,
      blankBefore: keepSpacing
        ? (block.blankBefore ?? 0)
        : this.pendingBlank + (block.blankBefore ?? 0),
      pageBreakBefore:
        (!keepSpacing && this.pendingPageBreak) || Boolean(block.pageBreakBefore),
    });
    if (!keepSpacing) {
      this.pendingBlank = 0;
      this.pendingPageBreak = false;
    }
  }
}

export async function readDocx(arrayBuffer: ArrayBuffer): Promise<DocxContent> {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const documentFile = zip.file(DOCUMENT_PATH);
  if (!documentFile) throw new Error("DOCX 中缺少 word/document.xml");

  const document = parseXml(await documentFile.async("string"), DOCUMENT_PATH);
  const bodies = document.getElementsByTagNameNS(WORD_NS, "body");
  if (bodies.length === 0) throw new Error("DOCX 正文结构中缺少 w:body");

  const [relationshipTargets, styles] = await Promise.all([
    readRelationshipTargets(zip),
    readStyles(zip),
  ]);
  const activeHeaderTargets: HeaderTargets = {};
  const headerCache = new Map<string, Promise<string>>();
  const sections: DocxSection[] = [];

  const readHeader = async (target: string): Promise<string> => {
    const headerFile = zip.file(target);
    if (!headerFile) throw new Error(`DOCX 页眉部件不存在: ${target}`);
    const headerDocument = parseXml(await headerFile.async("string"), target);
    const reader = new BlockReader(styles, async () => {});
    await reader.readContainer(headerDocument.documentElement);
    return reader.blocks.map((block) => block.text).join(" ");
  };

  const reader: BlockReader = new BlockReader(styles, async (sectionProperties) => {
    updateHeaderTargets(sectionProperties, relationshipTargets, activeHeaderTargets);
    const usesFirstPageHeader = toggleValue(directChild(sectionProperties, "titlePg"));
    const target = usesFirstPageHeader
      ? activeHeaderTargets.first || activeHeaderTargets.default
      : activeHeaderTargets.default || activeHeaderTargets.first;

    let header: string | undefined;
    if (target) {
      let pending = headerCache.get(target);
      if (!pending) {
        pending = readHeader(target);
        headerCache.set(target, pending);
      }
      header = (await pending) || undefined;
    }
    sections.push({ header });

    // 分节的 w:type 描述本节如何开始；默认为下一页。
    const sectionType = wordAttribute(directChild(sectionProperties, "type"), "val");
    const startsNewPage = sectionType !== "continuous";
    const sectionIndex = reader.section;
    const firstBlock = reader.blocks.find((block) => block.section === sectionIndex);
    if (firstBlock && sectionIndex > 0 && startsNewPage) firstBlock.pageBreakBefore = true;
    reader.section++;
  });

  await reader.readContainer(bodies[0]);
  // 缺少正文末尾 sectPr 的文档：剩余内容归入最后一个无页眉的分节。
  if (reader.blocks.some((block) => block.section === sections.length)) {
    sections.push({});
  }

  return { blocks: reader.blocks, sections };
}
