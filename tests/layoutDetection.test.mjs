import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { DOMParser as XmlDomParser } from "@xmldom/xmldom";

globalThis.DOMParser = XmlDomParser;

const { parseDocx, parseTextEssays } = await import(
  "../src/utils/docxParser.ts"
);
const { defaultRemovedIds, detectPatterns, filterEssay } = await import(
  "../src/utils/patternDetection.ts"
);

const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const MC_NS = "http://schemas.openxmlformats.org/markup-compatibility/2006";
const WPS_NS = "http://schemas.microsoft.com/office/word/2010/wordprocessingShape";

// ---------- 输出断言辅助 ----------

/** 按应用默认设置渲染，返回用户最终看到的页头、标题和正文。 */
function render(essays, { titleAsFirstParagraph = true, stripInfoLines = true } = {}) {
  const patterns = detectPatterns(essays);
  const removed = defaultRemovedIds(patterns);
  return essays
    .map((essay) =>
      filterEssay(essay, removed, patterns, titleAsFirstParagraph, stripInfoLines),
    )
    .filter((content) => content.title || content.paragraphs.length > 0)
    .map((content) => ({
      header: content.header ?? "",
      title: content.title,
      paragraphs: content.paragraphs,
    }));
}

function expected(header, title, ...paragraphs) {
  return { header, title, paragraphs };
}

async function renderDocx(buffer) {
  return render(await parseDocx(new File([buffer], "test.docx")));
}

// ---------- DOCX 构造辅助 ----------

function escapeXml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function run(text, { bold = false, size } = {}) {
  const properties = [
    bold ? "<w:b/>" : "",
    size ? `<w:sz w:val="${size}"/>` : "",
  ].join("");
  return (
    `<w:r>${properties ? `<w:rPr>${properties}</w:rPr>` : ""}` +
    `<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`
  );
}

function P(text, options = {}) {
  const { center, style, pageBreakBefore, sectPr, ...runOptions } = options;
  const properties = [
    style ? `<w:pStyle w:val="${style}"/>` : "",
    pageBreakBefore ? "<w:pageBreakBefore/>" : "",
    center ? `<w:jc w:val="center"/>` : "",
    sectPr ?? "",
  ].join("");
  return (
    `<w:p>${properties ? `<w:pPr>${properties}</w:pPr>` : ""}` +
    `${text ? run(text, runOptions) : ""}</w:p>`
  );
}

const PAGE_BREAK = `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;

function sectPr(headerRelationshipId, type) {
  return (
    "<w:sectPr>" +
    (headerRelationshipId
      ? `<w:headerReference w:type="default" r:id="${headerRelationshipId}"/>`
      : "") +
    (type ? `<w:type w:val="${type}"/>` : "") +
    "</w:sectPr>"
  );
}

function table(rows) {
  return (
    "<w:tbl>" +
    rows
      .map(
        (cells) =>
          "<w:tr>" +
          cells.map((cell) => `<w:tc>${cell}</w:tc>`).join("") +
          "</w:tr>",
      )
      .join("") +
    "</w:tbl>"
  );
}

function sdt(content) {
  return `<w:sdt><w:sdtPr/><w:sdtContent>${content}</w:sdtContent></w:sdt>`;
}

/** Word 2010+ 的文本框会同时写入 DrawingML（Choice）和 VML（Fallback）两份。 */
function textBoxParagraph(content) {
  return (
    `<w:p><w:r><mc:AlternateContent>` +
    `<mc:Choice Requires="wps"><w:drawing><wps:txbx><w:txbxContent>${content}` +
    `</w:txbxContent></wps:txbx></w:drawing></mc:Choice>` +
    `<mc:Fallback><w:pict><w:txbxContent>${content}</w:txbxContent></w:pict></mc:Fallback>` +
    `</mc:AlternateContent></w:r></w:p>`
  );
}

const HEADING_STYLES =
  `<w:styles xmlns:w="${WORD_NS}">` +
  `<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/>` +
  `<w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style>` +
  `<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/>` +
  `<w:basedOn w:val="Heading1"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr></w:style>` +
  `</w:styles>`;

async function makeDocx({ body, headers = {}, styles } = {}) {
  const zip = new JSZip();
  const finalSectPr = body.endsWith("</w:sectPr>") ? "" : "<w:sectPr/>";
  zip.file(
    "word/document.xml",
    `<w:document xmlns:w="${WORD_NS}" xmlns:r="${REL_NS}" ` +
      `xmlns:mc="${MC_NS}" xmlns:wps="${WPS_NS}" mc:Ignorable="wps">` +
      `<w:body>${body}${finalSectPr}</w:body></w:document>`,
  );
  const relationships = Object.keys(headers).map(
    (id) =>
      `<Relationship Id="${id}" ` +
      `Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" ` +
      `Target="${id}.xml"/>`,
  );
  for (const [id, text] of Object.entries(headers)) {
    zip.file(`word/${id}.xml`, `<w:hdr xmlns:w="${WORD_NS}">${P(text)}</w:hdr>`);
  }
  zip.file(
    "word/_rels/document.xml.rels",
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `${relationships.join("")}</Relationships>`,
  );
  if (styles) zip.file("word/styles.xml", styles);
  return zip.generateAsync({ type: "arraybuffer" });
}

const ids = [1, 2, 3];
const info = (i) => `姓名：学生${i}  班级：三年级3班`;

// ---------- 结构层：分页、控件、文本框、表格、样式 ----------

test("仅用分页符分隔的作文按分页切分", async () => {
  const body = ids
    .map(
      (i) =>
        (i > 1 ? PAGE_BREAK : "") +
        P(`题目${i}`, { center: true }) +
        P(`正文${i}第一段。`) +
        P(`正文${i}第二段。`),
    )
    .join("");
  assert.deepEqual(
    await renderDocx(await makeDocx({ body })),
    ids.map((i) => expected("", `题目${i}`, `正文${i}第一段。`, `正文${i}第二段。`)),
  );
});

test("段落属性『段前分页』也视为分篇信号", async () => {
  const body = ids
    .map(
      (i) =>
        P(`题目${i}`, { center: true, pageBreakBefore: i > 1 }) +
        P(`正文${i}第一段。`) +
        P(`正文${i}第二段。`),
    )
    .join("");
  assert.deepEqual(
    await renderDocx(await makeDocx({ body })),
    ids.map((i) => expected("", `题目${i}`, `正文${i}第一段。`, `正文${i}第二段。`)),
  );
});

test("批改报告模板：抬头和小节标签不当作题目，两篇也能识别", async () => {
  const body = [1, 2]
    .map(
      (i) =>
        (i > 1 ? PAGE_BREAK : "") +
        P("作文批改报告", { center: true, bold: true, size: 40 }) +
        P(info(i)) +
        P("") +
        P("【润色提升】", { bold: true, size: 30 }) +
        P(`题目${i}`, { center: true }) +
        P(`正文${i}。`),
    )
    .join("");
  assert.deepEqual(
    await renderDocx(await makeDocx({ body })),
    [1, 2].map((i) => expected(info(i), `题目${i}`, `正文${i}。`)),
  );
});

test("分节文档中题目位于个人信息行之前", async () => {
  const body = ids
    .map(
      (i) =>
        P(`题目${i}`) +
        P(info(i)) +
        P(`正文${i}。`, i < 3 ? { sectPr: sectPr() } : {}),
    )
    .join("");
  assert.deepEqual(
    await renderDocx(await makeDocx({ body })),
    ids.map((i) => expected(info(i), `题目${i}`, `正文${i}。`)),
  );
});

test("块级内容控件中的正文不会丢失", async () => {
  const body = [1, 2]
    .map((i) => sdt(P(info(i)) + P(`题目${i}`) + P(`正文${i}。`)))
    .join("");
  assert.deepEqual(
    await renderDocx(await makeDocx({ body })),
    [1, 2].map((i) => expected(info(i), `题目${i}`, `正文${i}。`)),
  );
});

test("文本框的 Choice/Fallback 双份内容只读取一次", async () => {
  const body = [1, 2]
    .map((i) => textBoxParagraph(P(info(i))) + P(`题目${i}`) + P(`正文${i}。`))
    .join("");
  assert.deepEqual(
    await renderDocx(await makeDocx({ body })),
    [1, 2].map((i) => expected(info(i), `题目${i}`, `正文${i}。`)),
  );
});

test("单元格作文纸中的段落保持独立，嵌套表格不重复", async () => {
  const body = [1, 2]
    .map(
      (i) =>
        (i > 1 ? PAGE_BREAK : "") +
        table([
          [
            P(`题目${i}`, { center: true }) +
              P(`正文${i}第一段。`) +
              table([[P(`正文${i}第二段。`)]]),
          ],
        ]),
    )
    .join("");
  assert.deepEqual(
    await renderDocx(await makeDocx({ body })),
    [1, 2].map((i) => expected("", `题目${i}`, `正文${i}第一段。`, `正文${i}第二段。`)),
  );
});

test("表格形式的个人信息栏可识别并规整为页头", async () => {
  const body = ids
    .map(
      (i) =>
        table([[P("姓名"), P(`学生${i}`), P("班级"), P("三年级3班")]]) +
        P(`题目${i}`) +
        P(`正文${i}。`),
    )
    .join("");
  assert.deepEqual(
    await renderDocx(await makeDocx({ body })),
    ids.map((i) => expected(`姓名：学生${i}  班级：三年级3班`, `题目${i}`, `正文${i}。`)),
  );
});

test("每页两篇、班级在前的信息行、题目有重名", async () => {
  // 对应真实文档：信息行“二年级（14）班  姓名：xxx”，分页符只出现在每两篇之间。
  const titles = ["我最喜爱的积木", "我喜欢的玩具", "我喜欢的遥控车", "我最喜爱的积木", "我的小熊玩偶", "我最喜爱的积木"];
  const tag = (i) => `二年级（14）班       姓名：学生${i}`;
  const body = titles
    .map(
      (title, index) =>
        P(tag(index + 1), { size: 19, pageBreakBefore: index > 0 && index % 2 === 0 }) +
        P(title, { center: true, bold: true, size: 33 }) +
        P(`正文${index + 1}第一段。`, { size: 27 }) +
        P(`正文${index + 1}第二段。`, { size: 27 }) +
        P(`正文${index + 1}第三段！`, { size: 27 }) +
        (index % 2 === 0 ? P("") : ""),
    )
    .join("");
  assert.deepEqual(
    await renderDocx(await makeDocx({ body })),
    titles.map((title, index) =>
      expected(
        tag(index + 1),
        title,
        `正文${index + 1}第一段。`,
        `正文${index + 1}第二段。`,
        `正文${index + 1}第三段！`,
      ),
    ),
  );
});

test("标题样式的段落可作为分篇信号", async () => {
  const body = ids
    .map(
      (i) =>
        P(`题目${i}`, { style: "Heading1" }) +
        P(`正文${i}第一段。`) +
        P(`正文${i}第二段。`),
    )
    .join("");
  assert.deepEqual(
    await renderDocx(await makeDocx({ body, styles: HEADING_STYLES })),
    ids.map((i) => expected("", `题目${i}`, `正文${i}第一段。`, `正文${i}第二段。`)),
  );
});

test("单篇作文中的二级标题不会被拆成多篇", async () => {
  const body =
    P("我的四季", { style: "Heading1" }) +
    P("春天", { style: "Heading2" }) +
    P("春天来了。") +
    P("夏天", { style: "Heading2" }) +
    P("夏天很热。");
  assert.deepEqual(
    await renderDocx(await makeDocx({ body, styles: HEADING_STYLES })),
    [expected("", "我的四季", "春天", "春天来了。", "夏天", "夏天很热。")],
  );
});

test("每节独立页眉作为对应作文的个人信息", async () => {
  const headers = Object.fromEntries(ids.map((i) => [`rId${i}`, info(i)]));
  const body = ids
    .map(
      (i) =>
        P(`题目${i}`) +
        (i < 3
          ? P(`正文${i}。`, { sectPr: sectPr(`rId${i}`) })
          : P(`正文${i}。`) + sectPr(`rId${i}`)),
    )
    .join("");
  assert.deepEqual(
    await renderDocx(await makeDocx({ body, headers })),
    ids.map((i) => expected(info(i), `题目${i}`, `正文${i}。`)),
  );
});

test("连续分节和共享页眉不会把普通文档拆成多篇", async () => {
  const body =
    P("唯一的题目") +
    P("第一部分。", { sectPr: sectPr("rIdShared", "continuous") }) +
    P("第二部分。") +
    sectPr("rIdShared", "continuous");
  assert.deepEqual(
    await renderDocx(await makeDocx({ body, headers: { rIdShared: "学校作文集" } })),
    [expected("", "唯一的题目", "第一部分。", "第二部分。")],
  );
});

test("页眉移入正文后仍按分节分篇并提取个人信息", async () => {
  const body = ids
    .map(
      (i) =>
        P(info(i)) +
        P("作文批改报告") +
        P(`题目${i}`) +
        (i < 3
          ? P(`正文${i}。`, { sectPr: sectPr() })
          : P(`正文${i}。`) + sectPr()),
    )
    .join("");
  assert.deepEqual(
    await renderDocx(await makeDocx({ body })),
    ids.map((i) => expected(info(i), `题目${i}`, `正文${i}。`)),
  );
});

test("每节只有一段的普通换页分节不拆成多篇", async () => {
  const body = P("第一部分", { sectPr: sectPr() }) + P("第二部分") + sectPr();
  assert.deepEqual(await renderDocx(await makeDocx({ body })), [
    expected("", "第一部分", "第二部分"),
  ]);
});

// ---------- 文本层：个人信息、编号、空段 ----------

function repeat(build) {
  return ids.flatMap(build);
}

test("个人信息行：已支持的同行『姓名 + 班级』", () => {
  assert.deepEqual(
    render(parseTextEssays(repeat((i) => [info(i), `题目${i}`, `正文${i}。`]))),
    ids.map((i) => expected(info(i), `题目${i}`, `正文${i}。`)),
  );
});

test("个人信息行：键名中间有空格『姓 名：』", () => {
  const line = (i) => `姓 名：学生${i}  班 级：三年级3班`;
  assert.deepEqual(
    render(parseTextEssays(repeat((i) => [line(i), `题目${i}`, `正文${i}。`]))),
    ids.map((i) => expected(line(i), `题目${i}`, `正文${i}。`)),
  );
});

test("个人信息行：姓名和班级分两行", () => {
  assert.deepEqual(
    render(
      parseTextEssays(
        repeat((i) => [`姓名：学生${i}`, "班级：三年级3班", `题目${i}`, `正文${i}。`]),
      ),
    ),
    ids.map((i) => expected(info(i), `题目${i}`, `正文${i}。`)),
  );
});

test("个人信息行：题目在前且信息分两行", () => {
  assert.deepEqual(
    render(
      parseTextEssays(
        repeat((i) => [`题目${i}`, `姓名：学生${i}`, "班级：三年级3班", `正文${i}。`]),
      ),
    ),
    ids.map((i) => expected(info(i), `题目${i}`, `正文${i}。`)),
  );
});

test("个人信息行：只有『作者：』", () => {
  assert.deepEqual(
    render(parseTextEssays(repeat((i) => [`题目${i}`, `作者：学生${i}`, `正文${i}。`]))),
    ids.map((i) => expected(`作者：学生${i}`, `题目${i}`, `正文${i}。`)),
  );
});

test("个人信息行：无冒号的『三年级3班 张三』", () => {
  assert.deepEqual(
    render(
      parseTextEssays(repeat((i) => [`题目${i}`, `三年级3班 学生${i}`, `正文${i}。`])),
    ),
    ids.map((i) => expected(`三年级3班 学生${i}`, `题目${i}`, `正文${i}。`)),
  );
});

test("个人信息行：无标签的学校、班级在『姓名：』之前", () => {
  const line = (i) => `实验小学 三年级（2）班 姓名：学生${i}`;
  assert.deepEqual(
    render(parseTextEssays(repeat((i) => [line(i), `题目${i}`, `正文${i}。`]))),
    ids.map((i) => expected(line(i), `题目${i}`, `正文${i}。`)),
  );
});

test("班级之外的前缀不会让句子被当作信息行", () => {
  const lines = ["我的同桌", "我们班的同学姓名：都写在黑板上。", "同桌叫小明。"];
  assert.deepEqual(render(parseTextEssays(lines)), [expected("", ...lines)]);
});

test("个人信息行：『学生：』搭配『学校：』", () => {
  const line = (i) => `学生：学生${i}  学校：实验小学`;
  assert.deepEqual(
    render(parseTextEssays(repeat((i) => [line(i), `题目${i}`, `正文${i}。`]))),
    ids.map((i) => expected(line(i), `题目${i}`, `正文${i}。`)),
  );
});

test("个人信息行：文末署名", () => {
  assert.deepEqual(
    render(parseTextEssays(repeat((i) => [`题目${i}`, `正文${i}。`, `作者：学生${i}`]))),
    ids.map((i) => expected(`作者：学生${i}`, `题目${i}`, `正文${i}。`)),
  );
});

test("封面行 + 信息在前 + 文末指导老师：不把结尾挪到下一篇", () => {
  assert.deepEqual(
    render(
      parseTextEssays([
        "三年级3班优秀习作集",
        ...repeat((i) => [info(i), `题目${i}`, `正文${i}。`, `指导老师：老师${i}`]),
      ]),
    ),
    ids.map((i) =>
      expected(`${info(i)}  指导老师：老师${i}`, `题目${i}`, `正文${i}。`),
    ),
  );
});

test("信息在前且正文很短时不会误把正文归给下一篇", () => {
  assert.deepEqual(
    render(parseTextEssays(repeat((i) => [info(i), `题目${i}`, `正文${i}`]))),
    ids.map((i) => expected(info(i), `题目${i}`, `正文${i}`)),
  );
});

test("题目在信息行之前的单节合并文档", () => {
  const titles = ["纸鱼", "升降国旗", "会跳舞的小红花"];
  const infoLines = [
    "姓名：张三  班级：二年级一班",
    "姓名：李四  班级：二年级一班",
    "姓名：   班级：二年级一班",
  ];
  assert.deepEqual(
    render(
      parseTextEssays(
        titles.flatMap((title, i) => [title, infoLines[i], `正文${i + 1}。`, ""]),
      ),
    ),
    titles.map((title, i) => expected(infoLines[i], title, `正文${i + 1}。`)),
  );
});

test("重名题目不会被当作每篇的抬头", () => {
  const titles = ["我最喜爱的积木", "我喜欢的玩具", "我最喜爱的积木"];
  const lines = titles.flatMap((title, i) => [
    ...(i > 0 ? ["", ""] : []),
    title,
    `正文${i + 1}第一段。`,
    `正文${i + 1}第二段。`,
  ]);
  assert.deepEqual(
    render(parseTextEssays(lines)),
    titles.map((title, i) => expected("", title, `正文${i + 1}第一段。`, `正文${i + 1}第二段。`)),
  );
});

test("『第N篇』编号分隔", () => {
  assert.deepEqual(
    render(parseTextEssays(repeat((i) => [`第${i}篇`, `题目${i}`, `正文${i}。`]))),
    ids.map((i) => expected("", `题目${i}`, `正文${i}。`)),
  );
});

test("单篇作文中的『一、』小标题不会被拆成多篇", () => {
  const lines = ["我的寒假", "一、学做饭", "我学会了炒鸡蛋。", "二、去滑雪", "滑雪真好玩。"];
  assert.deepEqual(render(parseTextEssays(lines)), [
    expected("", ...lines),
  ]);
});

test("对话中的『老师：“……”』不当作个人信息", () => {
  const lines = ["开学第一天", "老师：“同学们好！”", "我们齐声回答：“老师好！”"];
  assert.deepEqual(render(parseTextEssays(lines)), [expected("", ...lines)]);
});

test("以『一、』编号开头的作文集按编号分篇", () => {
  assert.deepEqual(
    render(
      parseTextEssays(
        ["一、春游", "春游真开心。", "二、秋游", "秋游也开心。"],
      ),
    ),
    [
      expected("", "一、春游", "春游真开心。"),
      expected("", "二、秋游", "秋游也开心。"),
    ],
  );
});

test("正文内的单个空段不切分，篇间的连续空段才切分", () => {
  assert.deepEqual(
    render(
      parseTextEssays([
        "题目1", "正文1第一段。", "", "正文1第二段。", "", "",
        "题目2", "正文2第一段。", "", "正文2第二段。",
      ]),
    ),
    [
      expected("", "题目1", "正文1第一段。", "正文1第二段。"),
      expected("", "题目2", "正文2第一段。", "正文2第二段。"),
    ],
  );
});

test("各篇内容相同的正文句子不会被默认删除", () => {
  assert.deepEqual(
    render(
      parseTextEssays(repeat((i) => [info(i), `题目${i}`, `正文${i}。`, "妈妈说：“真棒！”"])),
    ),
    ids.map((i) => expected(info(i), `题目${i}`, `正文${i}。`, "妈妈说：“真棒！”")),
  );
});

test("页眉与正文信息相同时只输出一次", async () => {
  const headers = Object.fromEntries(ids.map((i) => [`rId${i}`, info(i)]));
  const body = ids
    .map(
      (i) =>
        P(info(i)) +
        P(`题目${i}`) +
        (i < 3
          ? P(`正文${i}。`, { sectPr: sectPr(`rId${i}`) })
          : P(`正文${i}。`) + sectPr(`rId${i}`)),
    )
    .join("");
  assert.deepEqual(
    await renderDocx(await makeDocx({ body, headers })),
    ids.map((i) => expected(info(i), `题目${i}`, `正文${i}。`)),
  );
});

// ---------- 角色分类与设置项 ----------

test("各篇题目相同时仍识别为题目而非模板", () => {
  assert.deepEqual(
    render(parseTextEssays(repeat((i) => [info(i), "我的妈妈", `正文${i}。`]))),
    ids.map((i) => expected(info(i), "我的妈妈", `正文${i}。`)),
  );
});

test("各篇共有的结尾行作为模板默认删除", () => {
  assert.deepEqual(
    render(parseTextEssays(repeat((i) => [`题目${i}`, `正文${i}。`, "（完）", ""]))),
    ids.map((i) => expected("", `题目${i}`, `正文${i}。`)),
  );
});

test("关闭『提取个人信息』时信息行保留在正文原位置", () => {
  const essays = parseTextEssays(repeat((i) => [`题目${i}`, info(i), `正文${i}。`]));
  assert.deepEqual(
    render(essays, { stripInfoLines: false }),
    ids.map((i) => expected("", `题目${i}`, info(i), `正文${i}。`)),
  );
});

test("关闭『首段识别为标题』时题目作为普通段落", () => {
  const essays = parseTextEssays(repeat((i) => [info(i), `题目${i}`, `正文${i}。`]));
  assert.deepEqual(
    render(essays, { titleAsFirstParagraph: false }),
    ids.map((i) => expected(info(i), "", `题目${i}`, `正文${i}。`)),
  );
});

test("模板行可在模式面板中取消删除", () => {
  const essays = parseTextEssays(
    [1, 2].flatMap((i) => ["作文批改报告", info(i), `题目${i}`, `正文${i}。`]),
  );
  const patterns = detectPatterns(essays);
  const template = patterns.find((p) => p.examples.includes("作文批改报告"));
  assert.equal(template?.type, "header");
  const kept = defaultRemovedIds(patterns);
  kept.delete(template.id);
  const content = filterEssay(essays[0], kept, patterns, true, true);
  assert.equal(content.title, "题目1");
  assert.deepEqual(content.paragraphs, ["作文批改报告", "正文1。"]);
});
