import { useRef, useState, useCallback } from "react";
import {
  ColumnsIcon,
  DocumentIcon,
  GitHubIcon,
  LogoMark,
  PdfIcon,
  SparkIcon,
  UploadIcon,
} from "./icons";

interface Props {
  onUpload: (file: File) => void;
  onReject?: (file: File) => void;
  compact?: boolean;
  fileName?: string;
}

const ACCEPT = ".docx,.doc";

function useWordFileHandler(
  onUpload: (file: File) => void,
  onReject?: (file: File) => void,
) {
  return useCallback(
    (file: File) => {
      const lower = file.name.toLowerCase();
      if (lower.endsWith(".docx") || lower.endsWith(".doc")) {
        onUpload(file);
      } else {
        onReject?.(file);
      }
    },
    [onUpload, onReject],
  );
}

/** 点击后弹出文件选择框的按钮，用于在结果页直接替换当前文档 */
export function FilePickerButton({
  onUpload,
  onReject,
  className,
  disabled,
  title,
  children,
}: Omit<Props, "compact" | "fileName"> & {
  className?: string;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const handleFile = useWordFileHandler(onUpload, onReject);
  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        title={title}
        className={className}
      >
        {children}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
    </>
  );
}

export default function FileUpload({ onUpload, onReject, compact, fileName }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const handleFile = useWordFileHandler(onUpload, onReject);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile],
  );

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) handleFile(f);
      e.target.value = "";
    },
    [handleFile],
  );

  const input = (
    <input
      ref={inputRef}
      type="file"
      accept={ACCEPT}
      hidden
      onChange={onInputChange}
    />
  );

  if (compact) {
    return (
      <div className="panel flex items-center gap-3 p-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          <DocumentIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-800" title={fileName}>
            {fileName || "未命名文档"}
          </p>
          <p className="text-xs text-slate-400">Word 文档</p>
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="btn btn-ghost h-8 px-2.5 text-xs text-brand-600 hover:bg-brand-50 hover:text-brand-700"
        >
          更换
        </button>
        {input}
      </div>
    );
  }

  const features = [
    { icon: SparkIcon, title: "智能解析", desc: "识别作文结构与重复模式" },
    { icon: ColumnsIcon, title: "多栏排版", desc: "紧凑填充 A4，支持 1–6 栏" },
    { icon: PdfIcon, title: "矢量 PDF", desc: "全平台一致的高质量输出" },
  ];

  return (
    <div className="relative flex flex-col overflow-hidden bg-slate-50" style={{ minHeight: "100dvh" }}>
      {/* 背景装饰 */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(60%_100%_at_50%_0%,var(--color-brand-100)_0%,transparent_100%)] opacity-70"
      />

      <header className="relative flex items-center gap-2.5 px-5 pt-5 sm:px-8 sm:pt-6">
        <LogoMark className="h-8 w-8" />
        <span className="text-[15px] font-semibold text-slate-900">作文分栏</span>
      </header>

      <main className="relative flex flex-1 flex-col items-center justify-center px-5 py-8 sm:px-8">
        <div className="mb-7 text-center sm:mb-10">
          <h1 className="text-[26px] leading-tight font-bold tracking-tight text-slate-900 sm:text-4xl">
            作文一键分栏排版
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-slate-500 sm:text-base">
            上传 Word 文档，自动识别作文并紧凑排入多栏 A4 页面，一键导出 PDF。
          </p>
        </div>

        <div
          role="button"
          tabIndex={0}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          className={`group w-full max-w-xl cursor-pointer rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-500 sm:px-10 sm:py-14 ${
            dragging
              ? "scale-[1.01] border-brand-500 bg-brand-50 shadow-lg shadow-brand-500/10"
              : "border-slate-300 bg-white shadow-sm hover:border-brand-400 hover:shadow-md"
          }`}
        >
          <div
            className={`mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl transition-colors ${
              dragging
                ? "bg-brand-600 text-white"
                : "bg-brand-50 text-brand-600 group-hover:bg-brand-600 group-hover:text-white"
            }`}
          >
            <UploadIcon className="h-7 w-7" />
          </div>
          <p className="text-base font-semibold text-slate-800 sm:text-lg">
            <span className="hidden sm:inline">拖拽 .docx 文件到这里，或</span>
            <span className="text-brand-600">点击选择文件</span>
          </p>
          <p className="mt-2 text-xs text-slate-400 sm:text-sm">
            文件仅在浏览器本地处理，不会上传到服务器
          </p>
          {input}
        </div>

        <div className="mt-8 grid w-full max-w-xl grid-cols-3 gap-2.5 sm:mt-10 sm:gap-4">
          {features.map((f) => (
            <div
              key={f.title}
              className="flex flex-col items-center rounded-xl border border-slate-200/80 bg-white/80 px-2 py-3.5 text-center sm:items-start sm:px-4 sm:py-4 sm:text-left"
            >
              <span className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                <f.icon className="h-[18px] w-[18px]" />
              </span>
              <span className="text-xs font-semibold text-slate-800 sm:text-sm">{f.title}</span>
              <span className="mt-1 text-[11px] leading-snug text-slate-400 sm:text-xs">{f.desc}</span>
            </div>
          ))}
        </div>
      </main>

      <footer className="relative flex shrink-0 items-center justify-center gap-3 pb-5 pt-2 text-xs text-slate-400">
        <span>Powered by 7revor · {__APP_VERSION__}</span>
        <span className="text-slate-300">|</span>
        <a
          href="https://github.com/7revor/essay-columns"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 transition-colors hover:text-slate-600"
        >
          <GitHubIcon />
          GitHub
        </a>
      </footer>
    </div>
  );
}
