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
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-8">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`flex w-full max-w-lg cursor-pointer flex-col items-center gap-4 rounded-2xl border-2 border-dashed p-16 transition-colors ${
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
          <p className="text-lg font-medium text-gray-700">
            拖拽 .docx 文件到此处
          </p>
          <p className="mt-1 text-sm text-gray-500">或点击选择文件</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".docx,.doc"
          hidden
          onChange={onInputChange}
        />
      </div>
    </div>
  );
}
