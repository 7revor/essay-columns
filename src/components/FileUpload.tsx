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
          {fileName ? `📄 ${fileName}` : "重新上传文件"}
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

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4 sm:p-8">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`flex w-full max-w-lg cursor-pointer flex-col items-center gap-4 rounded-2xl border-2 border-dashed p-8 sm:p-16 transition-colors ${
          dragging
            ? "border-blue-500 bg-blue-50"
            : "border-gray-300 bg-white hover:border-blue-400 hover:bg-gray-50"
        }`}
      >
        <svg
          className="h-12 w-12 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <div className="text-center">
          <p className="text-base font-medium text-gray-700 sm:text-lg">
            拖拽 .docx 文件到此处
          </p>
          <p className="mt-1 text-xs text-gray-500 sm:text-sm">或点击选择文件</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".docx,.doc"
          hidden
          onChange={onInputChange}
        />
      </div>
      <footer className="mt-8 flex items-center gap-3 text-xs text-gray-400">
        <span>Powered by 7revor</span>
        <span>·</span>
        <a
          href="https://github.com/7revor/essay-columns"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/>
          </svg>
          GitHub
        </a>
      </footer>
    </div>
  );
}
