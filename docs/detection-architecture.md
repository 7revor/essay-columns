# 识别引擎优化方案

本文分析 DOCX → 作文切分 → 行角色 → 重复模式这条识别链路的复杂度来源，对照相关开源项目和论文，给出在“纯前端、无模型、体积敏感”约束下的重构方案和取舍。现有各层规则的说明见 [docx-parser.md](./docx-parser.md)。

## 1. 现状

```text
readDocx ─► DocxBlock[] ─► segmentBlocks ─► Segment[] ─► classifyEssayLines ─► Essay[] ─► detectPatterns / filterEssay
(docxStructure)            (segmentation, 7 种策略)        (essayRoles)                   (patternDetection)
```

结构层 `docxStructure.ts` 职责清楚，问题集中在后面三层。

### 1.1 同一特征被多处重复计算、各自解读

| 特征 | 计算位置 |
| --- | --- |
| `parseMetaLine` 个人信息行 | segmentation 的 `Context.meta`、essayRoles 的 `draftLines`、docxParser 的页眉判断 |
| `isTitleLike` 题目式短行 | segmentation 中 6 处、essayRoles 的 `draftLines`、`parseEssayMarker` 内部 |
| `parseEssayMarker` 篇章编号 | segmentation 的 `byMarkers`、essayRoles 的 `draftLines` |
| 重复短行统计 | segmentation 的 `textCount` / `isTemplateLine` / `byRepeatedLines`，essayRoles 的 `detectTemplates` |

切分和角色两层对“这一行是什么”没有共享的数据结构，每层都从文本重新推断，规则改动时容易只改了一处。

### 1.2 七种切分策略各自实现“起点 → 分段”的收尾

七种策略按优先级依次尝试，第一个切出两篇以上的胜出。这个“优先级级联”本身是合理的，但每个策略都自己处理收尾：

| 策略 | 起点来源 | 吸附到分页 | 向前扩展题目 | 封面处理 |
| --- | --- | --- | --- | --- |
| 个人信息行 | 身份组锚点，或署名组之后 | ✓（下界=上一组末行） | ✓ | ✓ |
| 篇章编号 | 递增编号链 | ✓（下界=上一锚点） | | ✓ |
| 重复抬头 / 结尾 | 首个重复行 / 结尾行之后 | 抬头 ✓ | | ✓ |
| 分页与分节 | 硬边界 | | | 手写（起点含 0） |
| 标题样式、居中标题 | `byStartLines` | | | ✓ |
| 连续空段 | 空段阈值 | | | 手写（起点含 0） |

同样的“吸附 + 下界 + 去重排序 + 封面”组合在 `byMetaLines`、`byMarkers`、`byRepeatedLines` 中各写了一遍，`byHardBoundaries` 和 `byBlankRuns` 又绕开了公共函数直接拼分段。读代码时很难一眼看出某个策略和另一个策略的差别在哪。

### 1.3 隐式的“开头 / 正文 / 结尾”分区

`essayRoles.ts` 用 `firstContentIndex`、`lastContentIndex`、`titleSlotIndex` 三个函数分别扫描，再在 `classifyEssayLines` 里用 `outsideBody`、`titleAssigned` 两个变量组合判断。真正的规则是一个很小的状态机：开头区 → 正文区 → 结尾区，各区内按特征定角色，但代码里看不出来。

### 1.4 阈值魔数分散

| 位置 | 阈值 |
| --- | --- |
| segmentation | 吸附窗口 4 块；前缀最多 3 行；前缀一致率 80%；封面 ≤2 行；抬头首现 ≤第 3 块；分页段 ≥2 块；页眉不同 ≥50%；分页段以题目开头 ≥80%；标题起点 ≤第 3 块；居中 ≤40%；空段切点 ≤30% |
| essayRoles | 模板出现率 60%；结尾区 2 行；处于题目位 ≤50% |
| textPatterns | 题目 ≤30 字；信息行 ≤80 字，单键 ≤40 字；无标签信息 ≤30 字、≤4 段；姓名 ≤6 字；学校 2–12 字 |
| patternDetection | 正文重复 ≥max(3, 30%) 篇 |

这些阈值大多有回归用例支撑，数值本身不是问题；问题是同类阈值（“多数篇一致”用了 50%、60%、80% 三个值）散落在函数体内，看不出哪些是同一概念。

## 2. 调研

### 2.1 文档逻辑结构识别

- **GROBID**（Lopez 2009；[文档](https://grobid.readthedocs.io/en/latest/Principles/)）：级联的 CRF 序列标注模型。第一级“分段模型”按**行**标注文档区域（封面、正文、参考文献等），主要依赖版式特征；后续模型只在上一级切出的区域内工作。可借鉴：**先切区域、再在区域内标注**的级联，以及“每行一个特征向量”的统一表示。它的特征（行首/行尾位置、词表命中、字号、块位置）与我们的 `DocxBlock` + 文本特征几乎一一对应。不可直接用：需要训练语料和 CRF 推理库（Wapiti），且模型文件体积大。
- **DocBank**（Li et al., COLING 2020）与 LayoutLM 系列：用弱监督生成大规模版式标注训练深度模型。思路（利用文档源格式自动生成标签）有启发，但模型体积和推理成本与纯前端约束不符。
- **unstructured `partition_docx`**（[文档](https://docs.unstructured.io/open-source/core-functionality/partitioning.md)）：把 docx 段落分为 Title、NarrativeText、ListItem 等元素，优先用**样式名和编号层级**定层级，样式缺失时再用文本启发式（长度、句末标点、大写比例等）。这正是我们结构层 + `isTitleLike` 的做法，说明“样式优先、文本兜底”是业界常规。
- **WordScape**（Weber et al., 2023，[arXiv 2312.10188](https://arxiv.org/pdf/2312.10188)）：从 Word 文档的样式信息自动产生版式标注；样式缺失时用启发式回退，例如“标题需样式唯一且字号最大”。佐证了 docx 样式信号的可靠性高于纯文本特征。

### 2.2 文本分段与边界检测

- **TextTiling**（Hearst, Computational Linguistics 1997）：按相邻窗口的词汇相似度低谷切分话题。作文集里相邻作文常是同一题目，词汇相似度区分度低；而我们有更强的结构信号（信息行、分页、编号），所以不采用。
- **Utiyama & Isahara 2001**（[ACL P01-1064](https://aclanthology.org/P01-1064/)）及基于动态规划的全局最优切分：把切分看作“最小化总代价”，免训练。可借鉴的是“全局一致性”的思想——我们的“前缀长度多数投票”（多数篇的题目都在信息行前 N 行）就是一个简化版全局约束。完整的 DP 打分需要为每种信号设计代价权重，在没有标注数据时权重又会成为新的魔数，暂不采用（见 §4）。
- **记录边界发现**（Embley et al., SIGMOD 1999 “Record-boundary discovery in Web documents”）：把网页切成重复记录，组合“最高频标签、已知分隔符、重复模式、本体词命中”等多个启发式，用确定性因子合并打分。这是与“作文集切成作文”最贴近的问题定义：每篇作文就是一条结构相似的记录。我们的“个人信息行”对应本体词命中，“分页/编号”对应已知分隔符，“重复抬头”对应重复模式。
- **多轮筛（Multi-Pass Sieve）**（Raghunathan et al., EMNLP 2010，Stanford 共指消解）：把规则按精确率从高到低排成若干轮，每轮只处理前面没有决定的部分，规则之间不需要权重。它证明了**有序的确定性规则级联**在无训练数据时可以与学习方法竞争，前提是每一轮规则独立、声明清楚。我们的七种策略正是这种结构，缺的只是统一的接口。

### 2.3 行角色标注

- **CRF / HMM 序列标注**（Lafferty et al., ICML 2001）：行角色依赖于前后行，适合序列模型。可借鉴的是**状态转移结构**：一篇作文的行角色满足“开头区（信息、编号、模板、题目）→ 正文 → 结尾区（署名、模板）”这个线性顺序。无需学习权重，把这个顺序写成显式的三状态自动机即可得到序列模型的大部分收益。

### 2.4 样板 / 模板行检测

- **Boilerpipe**（Kohlschütter et al., WSDM 2010，[论文](https://ir.webis.de/anthology/2010.wsdm_conference-2010.45)）：只用文本长度、链接密度等浅层特征就能有效区分正文与样板，几乎零成本。对应我们的“题目式短行”特征：样板行都短且不以句末标点结尾。
- **模板检测与频繁模式**（Bar-Yossef & Rajagopalan, WWW 2002 “Template detection via data mining”）：在一组页面中出现频率高的片段即模板。我们的模板定义（≥60% 的篇在开头/结尾区出现）就是这一思路的文档频率版本；“与题目位重合则不是模板”是额外的位置约束。
- **PDF 页眉页脚去除**（pdfplumber 社区做法、多数 PDF 抽取工具）：同一位置跨页重复的行即页眉页脚。对应“结尾重复行”与“开头重复行”两种位置。

### 2.5 结论：哪些思路可用

| 思路 | 可用性 | 落地方式 |
| --- | --- | --- |
| 统一的行特征表示（GROBID、CRF 特征工程） | ✓ | 新增 `lineFeatures.ts`，一次计算，各层共享 |
| 有序规则级联（Multi-Pass Sieve） | ✓ | 保留策略优先级，改为声明式“筛子 + 统一组装” |
| 区域状态机（HMM/CRF 的转移结构） | ✓ | 行角色改为显式的开头/正文/结尾分区 |
| 文档频率模板检测（Bar-Yossef） | ✓ 已有 | 保持，只整理阈值 |
| 多启发式打分合并（Embley）/ DP 全局最优（Utiyama） | △ | 暂不采用，作为后续选项（§4） |
| CRF / 深度版式模型（GROBID、DocBank、LayoutLM） | ✗ | 需要训练数据和模型文件，违背体积与无模型约束 |
| 词汇连贯性分段（TextTiling） | ✗ | 同题作文词汇相近，区分度低 |

## 3. 新架构

```text
readDocx ─► DocxBlock[]
             │
             ▼
        analyzeLines ─► Line[]            每行一次性计算：meta / marker / titleLike / hard / 重复次数
             │
             ▼
        segment(lines)                     有序筛子：每个筛子只回答“起点在哪、如何对齐”
          ├ sieve: 个人信息行  ─┐
          ├ sieve: 篇章编号    │
          ├ sieve: 重复抬头/结尾│──► assemble(starts, align) ─► Segment[]   统一吸附、扩展题目、封面
          ├ sieve: 分页与分节  │
          ├ sieve: 标题样式    │
          ├ sieve: 居中标题    │
          └ sieve: 连续空段   ─┘
             │
             ▼
        classifyEssayLines(Line[][])       每篇先分区（开头/正文/结尾），再按 (分区, 特征) 定角色
             │
             ▼
        detectPatterns / filterEssay       不变
```

### 3.1 `lineFeatures.ts`：统一行特征

```ts
interface Line {
  block: DocxBlock;
  text: string;            // 原文
  meta: MetaLine | null;   // 个人信息解析结果
  marker: EssayMarker | null;
  titleLike: boolean;
  hard: boolean;           // 前面是分页或换页分节
  repeats: number;         // 全文中相同文本的出现次数
}
```

切分与角色两层都只读 `Line`，不再自己调用 `parseMetaLine` / `isTitleLike` / `parseEssayMarker`。

### 3.2 切分：筛子 + 统一组装

每个筛子是一个纯函数，返回候选起点和对齐方式，不再自己拼分段：

```ts
interface Proposal {
  starts: number[];                  // 锚点（含 0 表示从文首开始）
  align?: "snap" | "snapOrPrefix";   // 是否吸附到附近分页；是否向前扩展题目
  lowerBounds?: number[];            // 吸附/扩展时不得越过的位置，默认取上一锚点
}
type Sieve = (context) => Proposal | null;
```

`assemble` 统一完成：对齐（吸附/扩展）→ 去重排序 → 封面判定 → 生成分段。筛子的差异全部体现在返回值上，一眼能看出“编号链吸附分页，标题样式不吸附”。级联顺序与现在一致，确保行为不变。

`segment` 同时返回生效的筛子名，便于调试和测试断言“这份文档是按什么切的”。

### 3.3 行角色：显式分区

```text
开头区：第一行正文之前（信息行、编号、模板、题目）
正文区：第一行正文 … 最后一行正文
结尾区：最后一行正文之后（署名、模板）
```

“正文行”定义为：非信息行、非编号、非题目式短行。角色规则表：

| 特征 \ 分区 | 开头区 | 正文区 | 结尾区 |
| --- | --- | --- | --- |
| 信息行 | meta | body | meta |
| 纯编号 | marker | marker | marker |
| 模板文本 | template | body | template |
| 首个题目式短行 | title | — | — |
| 其他 | body | body | body |

模板检测（`detectTemplates`）沿用文档频率规则，统计区域改为复用同一分区结果。

### 3.4 阈值集中

同一概念的阈值集中为具名常量并注明出处用例，例如 `PREFIX_AGREEMENT`（前缀一致率）、`TEMPLATE_RATIO`（模板出现率）、`SNAP_WINDOW`（吸附窗口）。数值保持不变。

## 4. 取舍

**为什么不改成统一打分 / 动态规划？** 打分模型（每个候选边界按信号加权求和，再用 DP 求全局最优）理论上更统一，但：

1. 没有标注数据，只有 41 个回归用例和一份真实文档。权重只能手调，等于把七组可解释的阈值换成一组难以解释的权重。
2. 现有级联的每一级都有用例锁定其精确行为（例如“单篇作文的二级标题不拆”“段间空一行不拆”）。打分模型很难同时满足这些硬约束，容易出现“改一个权重、坏三个用例”。
3. 用户需要理解“为什么这样切”。级联可以直接说出“按个人信息行切分”，打分模型只能给出分数。

因此本次采用**多轮筛**结构：保留优先级与阈值，把重复的收尾逻辑抽成公共组装，把隐式的分区写成显式规则。如果将来出现级联无法处理、需要多种信号共同投票的文档（例如信息行缺失一半、同时有分页），再考虑在 `assemble` 之前加入 Embley 式的多信号合并，接口不需要变。

**不做的事：** 不引入依赖；不改 `layoutEngine.ts`、`pdfGenerator.ts`、`renderUtils.ts`；不改 `Essay` / `EssayLine` 类型与 UI 交互。

## 5. 迁移步骤与验证

1. 新增 `lineFeatures.ts`，切分与角色两层改为读取 `Line`（行为不变）。
2. 切分策略改写为筛子，抽出 `assemble`（行为不变）。
3. 行角色改为显式分区（行为不变）。
4. 补充用例：断言典型文档的生效筛子；同步更新 `docx-parser.md`。

每一步都验证：

- `npm test` 全部通过；`npx tsc -b`、`npx vite build` 通过；
- `input.docx`（37 篇）重构前后的角色标注与渲染结果逐行一致；
- 差分测试：随机生成数千份纯文本作文集（信息行、编号、模板行、空段、题目随机组合），比较新旧实现的输出完全一致。
