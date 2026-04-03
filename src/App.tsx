import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type {
  Essay,
  EssayContent,
  DetectedPattern,
  LayoutSettings,
  PageLayout,
} from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { parseDocx } from "./utils/docxParser";
import { detectPatterns, filterEssay } from "./utils/patternDetection";
import { measureEssayHeights, computeLayout } from "./utils/layoutEngine";
import { generatePDF } from "./utils/pdfGenerator";
import FileUpload from "./components/FileUpload";
import PatternPanel from "./components/PatternPanel";
import SettingsPanel from "./components/SettingsPanel";
import Preview from "./components/Preview";

export default function App() {
  const [fileName, setFileName] = useState("");
  const [essays, setEssays] = useState<Essay[]>([]);
  const [patterns, setPatterns] = useState<DetectedPattern[]>([]);
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [settings, setSettings] = useState<LayoutSettings>(DEFAULT_SETTINGS);
  const [pages, setPages] = useState<PageLayout[]>([]);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState("");
  const measureRef = useRef<HTMLDivElement>(null);

  const handleUpload = useCallback(async (file: File) => {
    setParsing(true);
    setParseError("");
    try {
      setFileName(file.name);
      const { essays: parsed, allLines } = await parseDocx(file);
      if (parsed.length === 0) {
        setParseError("未能识别出任何作文，请检查文档格式");
        setParsing(false);
        return;
      }
      setEssays(parsed);
      const detected = detectPatterns(parsed, allLines);
      setPatterns(detected);
      setRemovedIds(
        new Set(
          detected
            .filter((p) => p.type !== "header")
            .map((p) => p.id),
        ),
      );
    } catch (err) {
      setParseError(
        `解析失败: ${err instanceof Error ? err.message : "未知错误"}`,
      );
    } finally {
      setParsing(false);
    }
  }, []);

  const essayContents = useMemo<EssayContent[]>(
    () =>
      essays
        .map((e) =>
          filterEssay(e, removedIds, patterns, settings.titleAsFirstParagraph),
        )
        .filter((c) => c.title || c.paragraphs.length > 0),
    [essays, removedIds, patterns, settings.titleAsFirstParagraph],
  );

  useEffect(() => {
    if (!measureRef.current || essayContents.length === 0) {
      setPages([]);
      return;
    }
    const heights = measureEssayHeights(
      essayContents,
      settings,
      measureRef.current,
    );
    setPages(computeLayout(heights, settings));
  }, [essayContents, settings]);

  const handleExport = useCallback(() => {
    if (pages.length === 0) return;
    generatePDF(pages, essayContents, settings);
  }, [pages, essayContents, settings]);

  if (essays.length === 0) {
    return (
      <div>
        <FileUpload onUpload={handleUpload} />
        {parsing && (
          <div className="fixed inset-0 flex items-center justify-center bg-black/20">
            <div className="rounded-xl bg-white px-8 py-5 shadow-lg">
              <p className="text-sm text-gray-700">正在解析文档…</p>
            </div>
          </div>
        )}
        {parseError && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-lg bg-red-600 px-5 py-3 text-sm text-white shadow-lg">
            {parseError}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-gray-50">
      {/* Hidden measurement container */}
      <div
        ref={measureRef}
        style={{
          position: "absolute",
          visibility: "hidden",
          left: "-9999px",
          top: 0,
        }}
      />

      {/* Header */}
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2">
        <h1 className="text-sm font-bold text-gray-800">作文分栏工具</h1>
        <button
          onClick={handleExport}
          disabled={pages.length === 0}
          className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          导出 PDF
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Sidebar */}
        <aside className="flex w-72 shrink-0 flex-col gap-3 overflow-y-auto border-r border-gray-200 bg-white p-3">
          <FileUpload onUpload={handleUpload} compact fileName={fileName} />

          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
            识别到 <strong>{essays.length}</strong> 篇作文 · 输出{" "}
            <strong>{pages.length}</strong> 页
          </div>

          <PatternPanel
            patterns={patterns}
            removedIds={removedIds}
            onChange={setRemovedIds}
          />
          <SettingsPanel settings={settings} onChange={setSettings} />
        </aside>

        {/* Preview */}
        <main className="min-h-0 min-w-0 flex-1 overflow-hidden bg-gray-100">
          <Preview
            pages={pages}
            essayContents={essayContents}
            settings={settings}
          />
        </main>
      </div>
    </div>
  );
}
