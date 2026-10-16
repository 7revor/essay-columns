import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { DOMParser as XmlDomParser } from "@xmldom/xmldom";

globalThis.DOMParser = XmlDomParser;

const {
  extractDocxSections,
  parseSectionEssays,
} = await import("../src/utils/docxStructure.ts");
const { parseDocx, parseTextEssays } = await import(
  "../src/utils/docxParser.ts"
);
const { detectPatterns, filterEssay } = await import(
  "../src/utils/patternDetection.ts"
);

const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

function escapeXml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function paragraph(text, sectionProperties = "") {
  const properties = sectionProperties
    ? `<w:pPr>${sectionProperties}</w:pPr>`
    : "";
  return `<w:p>${properties}<w:r><w:t>${escapeXml(text)}</w:t></w:r></w:p>`;
}

function sectionProperties(relationshipId) {
  const headerReference = relationshipId
    ? `<w:headerReference w:type="default" r:id="${relationshipId}"/>`
    : "";
  return `<w:sectPr>${headerReference}</w:sectPr>`;
}

async function makeSectionedDocx({ bodyInfoLines = false, withHeaders = true }) {
  const zip = new JSZip();
  const body = [];
  const relationships = [];

  for (let i = 1; i <= 3; i++) {
    const infoLine = `姓名：学生${i}\t${i}    班级：四年级4班`;
    if (bodyInfoLines) body.push(paragraph(infoLine));
    body.push(paragraph("作文批改报告"));
    body.push(paragraph(`题目${i}`));
    body.push(paragraph(`正文${i}`));

    const relationshipId = withHeaders ? `rId${i}` : undefined;
    const properties = sectionProperties(relationshipId);
    if (i < 3) body.push(paragraph("", properties));
    else body.push(properties);

    if (withHeaders) {
      relationships.push(
        `<Relationship Id="${relationshipId}" ` +
          `Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" ` +
          `Target="header${i}.xml"/>`,
      );
      zip.file(
        `word/header${i}.xml`,
        `<w:hdr xmlns:w="${WORD_NS}"><w:p><w:r>` +
          `<w:t>姓名：学生${i}</w:t><w:tab/>` +
          `<w:t>${i}    班级：四年级4班</w:t>` +
          `</w:r></w:p></w:hdr>`,
      );
    }
  }

  zip.file(
    "word/document.xml",
    `<w:document xmlns:w="${WORD_NS}" xmlns:r="${REL_NS}">` +
      `<w:body>${body.join("")}</w:body></w:document>`,
  );
  zip.file(
    "word/_rels/document.xml.rels",
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `${relationships.join("")}</Relationships>`,
  );
  return zip.generateAsync({ type: "arraybuffer" });
}

test("按 section 读取每篇作文对应的独立页眉", async () => {
  const buffer = await makeSectionedDocx({});
  const sections = await extractDocxSections(buffer);
  assert.equal(sections.length, 3);
  assert.equal(sections[0].header, "姓名：学生1\t1    班级：四年级4班");
  assert.deepEqual(sections[0].paragraphs, ["作文批改报告", "题目1", "正文1"]);

  const essays = await parseDocx(new File([buffer], "headers.docx"));
  assert.equal(essays.length, 3);
  assert.equal(essays[2].sourceHeader, "姓名：学生3\t3    班级：四年级4班");

  const content = filterEssay(
    essays[0],
    new Set(),
    detectPatterns(essays),
    true,
    true,
  );
  assert.equal(content.header, "姓名：学生1\t1    班级：四年级4班");
  assert.equal(content.title, "作文批改报告");
});

test("页眉搬到正文后仍按 section 分篇并提取个人信息", async () => {
  const buffer = await makeSectionedDocx({ bodyInfoLines: true, withHeaders: false });
  const essays = await parseDocx(new File([buffer], "body-info.docx"));
  assert.equal(essays.length, 3);
  assert.equal(essays[1].paragraphs[0], "姓名：学生2\t2    班级：四年级4班");

  const content = filterEssay(
    essays[1],
    new Set(),
    detectPatterns(essays),
    true,
    true,
  );
  assert.equal(content.header, "姓名：学生2\t2    班级：四年级4班");
  assert.equal(content.title, "作文批改报告");
});

test("无可用 section 时可用不同姓名的个人信息行分篇", () => {
  const essays = parseTextEssays([
    "姓名：张三  班级：四年级1班",
    "题目一",
    "正文一",
    "",
    "姓名：李四  班级：四年级1班",
    "题目二",
    "正文二",
  ]);
  assert.equal(essays.length, 2);
  assert.equal(essays[0].sourceHeader, "姓名：张三  班级：四年级1班");
  assert.deepEqual(essays[1].paragraphs, ["题目二", "正文二"]);
});

test("普通版式分节不会在缺少作文特征时被误判为多篇", async () => {
  const zip = new JSZip();
  zip.file(
    "word/document.xml",
    `<w:document xmlns:w="${WORD_NS}" xmlns:r="${REL_NS}"><w:body>` +
      `${paragraph("第一部分", sectionProperties())}` +
      `${paragraph("第二部分")}${sectionProperties()}` +
      `</w:body></w:document>`,
  );
  const buffer = await zip.generateAsync({ type: "arraybuffer" });
  assert.equal(await parseSectionEssays(buffer), null);
});

test("普通文档的共享页眉不会仅因分节而被误判为多篇", async () => {
  const zip = new JSZip();
  zip.file(
    "word/document.xml",
    `<w:document xmlns:w="${WORD_NS}" xmlns:r="${REL_NS}"><w:body>` +
      `${paragraph("第一章", sectionProperties("rIdHeader"))}` +
      `${paragraph("第二章")}${sectionProperties()}` +
      `</w:body></w:document>`,
  );
  zip.file(
    "word/_rels/document.xml.rels",
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rIdHeader" ` +
      `Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" ` +
      `Target="header1.xml"/></Relationships>`,
  );
  zip.file(
    "word/header1.xml",
    `<w:hdr xmlns:w="${WORD_NS}">${paragraph("学校作文集")}</w:hdr>`,
  );

  const buffer = await zip.generateAsync({ type: "arraybuffer" });
  assert.equal(await parseSectionEssays(buffer), null);
});

test("页眉与正文信息同时存在时合并且不重复", () => {
  const essay = {
    delimiter: "",
    sourceHeader: "姓名：张三  班级：四年级1班",
    paragraphs: ["姓名：张三  班级：四年级1班", "标题", "正文"],
  };
  const content = filterEssay(essay, new Set(), [], true, true);
  assert.equal(content.header, "姓名：张三  班级：四年级1班");
  assert.equal(content.title, "标题");
});
