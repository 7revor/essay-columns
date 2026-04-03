import { useRef, useState, useCallback } from "react";

interface Props {
  onUpload: (file: File) => void;
  compact?: boolean;
  fileName?: string;
}

export default function FileUpload({ onUpload, compact, fileName }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFile = useCallback(
    (file: File) => {
      if (file.name.endsWith(".docx") || file.name.endsWith(".doc")) {
        onUpload(file);
      }
    },
    [onUpload],
  );

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

  if (compact) {
    return (
      <div>
        <button
          onClick={() => inputRef.current?.click()}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          {fileName ? `\u{1F4C4} ${fileName}` : "\u91CD\u65B0\u4E0A\u4F20\u6587\u4EF6"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".docx,.doc"
          hidden
          onChange={onInputChange}
        />
      </div>
    );
  }

  const features = [
    { icon: FileIcon, title: "\u667A\u80FD\u89E3\u6790", desc: "\u81EA\u52A8\u8BC6\u522B\u4F5C\u6587\u7ED3\u6784\u4E0E\u91CD\u590D\u6A21\u5F0F" },
    { icon: ColumnsIcon, title: "\u591A\u680F\u6392\u7248", desc: "\u7D27\u51D1\u586B\u5145 A4 \u9875\u9762\uFF0C\u652F\u6301 1\u20136 \u680F" },
    { icon: PdfIcon, title: "\u77E2\u91CF PDF", desc: "\u5168\u5E73\u53F0\u4E00\u81F4\u7684\u9AD8\u8D28\u91CF\u8F93\u51FA" },
  ];

  return (
    <div className="flex flex-col overflow-hidden bg-gradient-to-br from-slate-50 via-white to-blue-50" style={{ height: "100dvh" }}>
      <div className="flex flex-1 flex-col items-center justify-center overflow-hidden px-4 sm:px-8">
        <div className="mb-6 text-center sm:mb-10">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
            {"\u4F5C\u6587\u5206\u680F\u5DE5\u5177"}
          </h1>
          <p className="mt-2 text-sm text-gray-500 sm:text-base">
            {"\u4E0A\u4F20 Word \u6587\u6863\uFF0C\u81EA\u52A8\u591A\u680F\u6392\u7248\uFF0C\u4E00\u952E\u5BFC\u51FA PDF"}
          </p>
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`group relative w-full max-w-lg cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition-all duration-200 sm:p-14 ${
            dragging
              ? "scale-[1.02] border-blue-500 bg-blue-50/80 shadow-lg shadow-blue-100"
              : "border-gray-300/80 bg-white/60 shadow-sm backdrop-blur hover:border-blue-400 hover:bg-white hover:shadow-md"
          }`}
        >
          <div className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl transition-colors ${
            dragging ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-400 group-hover:bg-blue-50 group-hover:text-blue-500"
          }`}>
            <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
          </div>
          <p className="text-base font-medium text-gray-700 sm:text-lg">
            {"\u62D6\u62FD .docx \u6587\u4EF6\u5230\u6B64\u5904"}
          </p>
          <p className="mt-1.5 text-xs text-gray-400 sm:text-sm">
            {"\u6216\u70B9\u51FB\u9009\u62E9\u6587\u4EF6"}
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".docx,.doc"
            hidden
            onChange={onInputChange}
          />
        </div>

        <div className="mt-6 grid w-full max-w-lg grid-cols-3 gap-3 sm:mt-10 sm:gap-5">
          {features.map((f) => (
            <div key={f.title} className="flex flex-col items-center rounded-xl bg-white/70 px-3 py-3 shadow-sm backdrop-blur sm:px-4 sm:py-5">
              <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-500 sm:h-10 sm:w-10">
                <f.icon />
              </div>
              <span className="text-xs font-medium text-gray-800 sm:text-sm">{f.title}</span>
              <span className="mt-0.5 text-center text-[10px] leading-tight text-gray-400 sm:text-[11px]">{f.desc}</span>
            </div>
          ))}
        </div>
      </div>

      <footer className="flex shrink-0 items-center justify-center gap-3 pb-4 pt-2 text-xs text-gray-400">
        <span>Powered by 7revor</span>
        <span className="text-gray-300">|</span>
        <a
          href="https://github.com/7revor/essay-columns"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-gray-400 transition-colors hover:text-gray-600"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/>
          </svg>
          GitHub
        </a>
      </footer>
    </div>
  );
}

function FileIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9zm3.75 11.625a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  );
}

function ColumnsIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125z" />
    </svg>
  );
}

function PdfIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m.75 12l3 3m0 0l3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}
