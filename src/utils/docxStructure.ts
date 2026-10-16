import JSZip from "jszip";
import type { Essay } from "../types";
import { isEssayBoundaryInfoLine } from "./textPatterns.ts";

const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const DOCUMENT_PATH = "word/document.xml";
const DOCUMENT_RELS_PATH = "word/_rels/document.xml.rels";

export interface DocxSection {
  header?: string;
  paragraphs: string[];
}

type HeaderType = "default" | "first" | "even";
type HeaderTargets = Partial<Record<HeaderType, string>>;

function parseXml(xml: string, partName: string): XMLDocument {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.getElementsByTagName("parsererror").length > 0) {
    throw new Error(`无法解析 DOCX XML 部件: ${partName}`);
  }
  return document;
}

function directChild(parent: Element, localName: string): Element | undefined {
  for (let i = 0; i < parent.childNodes.length; i++) {
    const node = parent.childNodes[i];
    if (node.nodeType === 1) {
      const element = node as Element;
      if (element.localName === localName) return element;
    }
  }
  return undefined;
}

function descendantElements(parent: Element, localName: string): Element[] {
  const nodes = parent.getElementsByTagNameNS(WORD_NS, localName);
  const result: Element[] = [];
  for (let i = 0; i < nodes.length; i++) result.push(nodes[i]);
  return result;
}

function extractInlineText(root: Element): string {
  const parts: string[] = [];

  const visit = (node: Node) => {
    if (node.nodeType === 1) {
      const element = node as Element;
      if (element.namespaceURI === WORD_NS) {
        if (element.localName === "t") {
          parts.push(element.textContent || "");
          return;
        }
        if (element.localName === "tab") {
          parts.push("\t");
          return;
        }
        if (element.localName === "br" || element.localName === "cr") {
          parts.push("\n");
          return;
        }
      }
    }

    for (let i = 0; i < node.childNodes.length; i++) visit(node.childNodes[i]);
  };

  visit(root);
  return parts
    .join("")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function extractParagraphText(paragraph: Element): string {
  return extractInlineText(paragraph);
}

function extractTableLines(table: Element): string[] {
  const rows = descendantElements(table, "tr");
  return rows
    .map((row) =>
      descendantElements(row, "tc")
        .map((cell) =>
          descendantElements(cell, "p")
            .map(extractParagraphText)
            .filter(Boolean)
            .join(" "),
        )
        .filter(Boolean)
        .join("\t"),
    )
    .filter(Boolean);
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
  const references = descendantElements(sectionProperties, "headerReference");
  for (const reference of references) {
    const type = reference.getAttributeNS(WORD_NS, "type") as HeaderType | null;
    const relationshipId = reference.getAttributeNS(REL_NS, "id");
    const target = relationshipId
      ? relationshipTargets.get(relationshipId)
      : undefined;
    if (type && target) activeTargets[type] = target;
  }
}

async function readSectionHeader(
  zip: JSZip,
  sectionProperties: Element,
  relationshipTargets: Map<string, string>,
  activeTargets: HeaderTargets,
  headerCache: Map<string, Promise<string>>,
): Promise<string | undefined> {
  updateHeaderTargets(sectionProperties, relationshipTargets, activeTargets);
  const usesFirstPageHeader = Boolean(directChild(sectionProperties, "titlePg"));
  const target = usesFirstPageHeader
    ? activeTargets.first || activeTargets.default || activeTargets.even
    : activeTargets.default || activeTargets.first || activeTargets.even;
  if (!target) return undefined;

  let pending = headerCache.get(target);
  if (!pending) {
    pending = (async () => {
      const headerFile = zip.file(target);
      if (!headerFile) throw new Error(`DOCX 页眉部件不存在: ${target}`);
      const headerDocument = parseXml(await headerFile.async("string"), target);
      const paragraphs = headerDocument.getElementsByTagNameNS(WORD_NS, "p");
      const lines: string[] = [];
      for (let i = 0; i < paragraphs.length; i++) {
        const text = extractParagraphText(paragraphs[i]);
        if (text) lines.push(text);
      }
      return lines.join(" ");
    })();
    headerCache.set(target, pending);
  }

  const text = await pending;
  return text || undefined;
}

function sectionsLookLikeEssays(sections: DocxSection[]): boolean {
  if (sections.length < 2) return false;

  const headers = sections
    .map((section) => section.header?.trim())
    .filter((header): header is string => Boolean(header));
  const hasEnoughHeaders =
    headers.length >= Math.max(2, Math.ceil(sections.length * 0.5));
  if (hasEnoughHeaders) {
    const infoHeaderCount = headers.filter(isEssayBoundaryInfoLine).length;
    if (infoHeaderCount >= Math.ceil(headers.length * 0.5)) return true;

    const distinctHeaderCount = new Set(headers).size;
    if (
      headers.length >= 3 &&
      distinctHeaderCount >= Math.ceil(headers.length * 0.5)
    ) {
      return true;
    }
  }

  const infoLineCount = sections.filter((section) =>
    isEssayBoundaryInfoLine(section.paragraphs[0] || ""),
  ).length;
  if (infoLineCount >= Math.ceil(sections.length * 0.5)) return true;

  if (sections.length < 3) return false;
  const firstParagraphFrequency = new Map<string, number>();
  for (const section of sections) {
    const first = section.paragraphs[0]?.trim();
    if (!first || first.length > 100) continue;
    firstParagraphFrequency.set(first, (firstParagraphFrequency.get(first) || 0) + 1);
  }
  const mostFrequent = Math.max(0, ...firstParagraphFrequency.values());
  return mostFrequent >= Math.ceil(sections.length * 0.6);
}

export async function extractDocxSections(
  arrayBuffer: ArrayBuffer,
): Promise<DocxSection[]> {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const documentFile = zip.file(DOCUMENT_PATH);
  if (!documentFile) throw new Error("DOCX 中缺少 word/document.xml");

  const document = parseXml(await documentFile.async("string"), DOCUMENT_PATH);
  const bodies = document.getElementsByTagNameNS(WORD_NS, "body");
  if (bodies.length === 0) throw new Error("DOCX 正文结构中缺少 w:body");

  const relationshipTargets = await readRelationshipTargets(zip);
  const activeHeaderTargets: HeaderTargets = {};
  const headerCache = new Map<string, Promise<string>>();
  const sections: DocxSection[] = [];
  let paragraphs: string[] = [];

  const finishSection = async (sectionProperties: Element) => {
    const header = await readSectionHeader(
      zip,
      sectionProperties,
      relationshipTargets,
      activeHeaderTargets,
      headerCache,
    );
    if (paragraphs.length > 0 || header) {
      sections.push({ header, paragraphs });
    }
    paragraphs = [];
  };

  const body = bodies[0];
  for (let i = 0; i < body.childNodes.length; i++) {
    const node = body.childNodes[i];
    if (node.nodeType !== 1) continue;
    const element = node as Element;
    if (element.namespaceURI !== WORD_NS) continue;

    if (element.localName === "p") {
      const text = extractParagraphText(element);
      if (text) paragraphs.push(text);
      const paragraphProperties = directChild(element, "pPr");
      const sectionProperties = paragraphProperties
        ? directChild(paragraphProperties, "sectPr")
        : undefined;
      if (sectionProperties) await finishSection(sectionProperties);
    } else if (element.localName === "tbl") {
      paragraphs.push(...extractTableLines(element));
    } else if (element.localName === "sectPr") {
      await finishSection(element);
    }
  }

  if (paragraphs.length > 0) sections.push({ paragraphs });
  return sections;
}

export async function parseSectionEssays(
  arrayBuffer: ArrayBuffer,
): Promise<Essay[] | null> {
  const sections = (await extractDocxSections(arrayBuffer)).filter(
    (section) => section.paragraphs.length > 0,
  );
  if (!sectionsLookLikeEssays(sections)) return null;

  return sections.map((section) => ({
    delimiter: "",
    paragraphs: section.paragraphs,
    sourceHeader: section.header,
  }));
}
