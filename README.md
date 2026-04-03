# Essay Columns — 作文分栏排版工具

上传 DOCX 作文文档，自动识别结构与重复模式，生成多栏 A4 排版并导出矢量 PDF。纯前端实现，数据不离开浏览器。

## 功能特性

- **DOCX 智能解析** — 基于 mammoth.js 提取文本，按「姓名/班级」标头自动拆分作文
- **重复模式检测** — 识别分隔符、装饰行等重复内容，支持逐项勾选过滤
- **多栏排版引擎** — 自动计算分栏布局，紧凑填充 A4 页面，支持 1–6 栏
- **实时预览** — 可缩放的所见即所得页面预览，支持缩放与适应屏幕
- **矢量 PDF 导出** — 基于 pdfmake 生成矢量 PDF，文字可选可搜索
- **Web 字体** — 使用思源宋体（Source Han Serif SC），页面进入即预加载并缓存
- **全平台一致** — 桌面端与移动端统一使用 pdfmake 排版，输出完全一致
- **隐私安全** — 纯浏览器运算，文档不上传任何服务器

## 技术栈

| 类别 | 技术 |
| --- | --- |
| 框架 | React 19 + TypeScript |
| 构建 | Vite 6 |
| 样式 | Tailwind CSS 4 |
| 文档解析 | mammoth.js |
| PDF 生成 | pdfmake（snaking columns + unbreakable） |
| 字体 | Source Han Serif SC (WOFF, CDN) |
| 部署 | Cloudflare Pages |

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
├── main.tsx                  # 入口，字体预加载
├── App.tsx                   # 状态管理与页面布局
├── types.ts                  # 类型定义与布局常量
├── index.css                 # 全局样式
├── components/
│   ├── FileUpload.tsx        # 文件上传（拖拽 / 选择）
│   ├── PatternPanel.tsx      # 重复模式检测面板
│   ├── SettingsPanel.tsx     # 排版参数设置
│   └── Preview.tsx           # A4 页面缩放预览
└── utils/
    ├── docxParser.ts         # DOCX 解析与作文拆分
    ├── patternDetection.ts   # 重复模式检测算法
    ├── layoutEngine.ts       # 分栏高度测量与分页计算
    ├── renderUtils.ts        # 预览 HTML 渲染
    ├── pdfGenerator.ts       # pdfmake PDF 生成
    └── fontLoader.ts         # 字体预加载与缓存
```

## 使用方式

1. 打开页面，拖拽或点击上传 `.docx` 文件
2. 自动识别作文并检测重复模式，可在侧栏调整过滤规则
3. 调整排版参数 — 字号、行高、栏数、栏距、页边距
4. 实时预览排版效果，确认后点击「导出 PDF」

## 排版参数

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| 页边距 | 5mm (上/左/右), 5mm (下) | 四边独立设置 |
| 栏数 | 2 | 支持 1–6 栏 |
| 栏距 | 1 字宽 | 按当前字号自动换算 |
| 字号 | 8pt | 支持 3–30pt |
| 行高 | 1.2 | 支持 1.0–3.0 |

## License

MIT
