# 作文分栏工具

上传 DOCX 作文文档，自动识别作文结构与重复模式，生成多栏 A4 排版并导出 PDF。纯前端实现，无需后端服务。

## 功能

- **DOCX 解析** — 通过 mammoth.js 提取文本，按「姓名 / 班级」标头自动拆分作文
- **模式检测** — 识别文档中的重复行（分隔符、装饰线、空行等），可逐项控制是否保留
- **多栏排版** — 自动计算分栏布局，将作文紧凑填充到 A4 页面中
- **实时预览** — 可缩放的所见即所得页面预览
- **PDF 导出** — 一键生成可打印的多栏 PDF

## 技术栈

| 类别 | 技术 |
| --- | --- |
| 框架 | React 19 + TypeScript |
| 构建 | Vite 6 |
| 样式 | Tailwind CSS 4 |
| 文档解析 | mammoth.js |
| 部署 | Cloudflare Pages (Wrangler) |

## 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 本地预览构建产物
npm run preview
```

## 项目结构

```
src/
├── App.tsx                   # 应用入口，状态管理与页面布局
├── types.ts                  # 类型定义与布局常量
├── components/
│   ├── FileUpload.tsx        # 文件上传组件
│   ├── PatternPanel.tsx      # 模式检测面板
│   ├── SettingsPanel.tsx     # 排版设置面板
│   └── Preview.tsx           # A4 页面预览
└── utils/
    ├── docxParser.ts         # DOCX 文本提取与作文拆分
    ├── patternDetection.ts   # 重复模式检测
    ├── layoutEngine.ts       # 分栏高度测量与页面布局计算
    ├── renderUtils.ts        # 作文 HTML 渲染
    └── pdfGenerator.ts       # PDF 生成
```

## 使用方式

1. 打开页面，拖拽或选择包含多篇作文的 `.docx` 文件
2. 工具自动识别作文并检测重复模式，可在左侧面板中调整过滤规则
3. 调整排版参数（字体、字号、栏数、页边距等）
4. 实时预览排版效果，确认后点击「导出 PDF」

## License

MIT
