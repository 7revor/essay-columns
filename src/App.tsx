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
import {
  defaultRemovedIds,
  detectPatterns,
  filterEssay,
} from "./utils/patternDetection";
import { measureEssayHeights, computeLayout } from "./utils/layoutEngine";
import { generatePDF } from "./utils/pdfGenerator";
import { preloadFont } from "./utils/fontLoader";
import FileUpload from "./components/FileUpload";
import PatternPanel from "./components/PatternPanel";
import SettingsPanel from "./components/SettingsPanel";
import Preview from "./components/Preview";
import { CloseIcon, DownloadIcon, LogoMark, SlidersIcon } from "./components/icons";

export default function App() {
  const [fontLoaded, setFontLoaded] = useState(false);
  const [fileName, setFileName] = useState("");
  const [essays, setEssays] = useState<Essay[]>([]);
  const [patterns, setPatterns] = useState<DetectedPattern[]>([]);
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [settings, setSettings] = useState<LayoutSettings>(DEFAULT_SETTINGS);
  const [pages, setPages] = useState<PageLayout[]>([]);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const measureRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    preloadFont()
      .then(() => setFontLoaded(true))
      .catch(() => setParseError("字体加载失败，请刷新页面重试"));
  }, []);

  const handleUpload = useCallback(async (file: File) => {
    setParsing(true);
    setParseError("");
    try {
      setFileName(file.name);
      const parsed = await parseDocx(file);
      if (parsed.length === 0) {
        setParseError("未能识别出任何作文，请检查文档格式");
        setParsing(false);
        return;
      }
      setEssays(parsed);
      const detected = detectPatterns(parsed);
      setPatterns(detected);
      setRemovedIds(defaultRemovedIds(detected));
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
          filterEssay(e, removedIds, patterns, settings.titleAsFirstParagraph, settings.stripInfoLines),
        )
        .filter((c) => c.title || c.paragraphs.length > 0),
    [essays, removedIds, patterns, settings.titleAsFirstParagraph, settings.stripInfoLines],
  );

  useEffect(() => {
    if (!fontLoaded || !measureRef.current || essayContents.length === 0) {
      setPages([]);
      return;
    }
    const heights = measureEssayHeights(
      essayContents,
      settings,
      measureRef.current,
    );
    setPages(computeLayout(heights, settings));
  }, [fontLoaded, essayContents, settings]);

  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState("");

  const handleExport = useCallback(async () => {
    if (essayContents.length === 0 || exporting) return;
    setExporting(true);
    try {
      await generatePDF(essayContents, settings, setExportMsg);
      setExportMsg("");
    } catch (err) {
      setExporting(false);
      setExportMsg(
        `导出失败: ${err instanceof Error ? err.message : "未知错误"}`,
      );
      setTimeout(() => setExportMsg(""), 3000);
      return;
    }
    setExporting(false);
  }, [essayContents, settings, exporting]);

  if (essays.length === 0) {
    return (
      <div>
        <FileUpload onUpload={handleUpload} />
        {!fontLoaded && <Toast>正在加载字体…</Toast>}
        {parsing && <BusyOverlay>正在解析文档…</BusyOverlay>}
        {parseError && <Toast tone="error">{parseError}</Toast>}
      </div>
    );
  }

  const sidebarContent = (
    <>
      <FileUpload onUpload={handleUpload} compact fileName={fileName} />

      <div className="grid grid-cols-2 gap-2">
        <Stat label="识别作文" value={essays.length} unit="篇" />
        <Stat label="输出页数" value={pages.length} unit="页" />
      </div>

      <PatternPanel
        patterns={patterns}
        removedIds={removedIds}
        onChange={setRemovedIds}
      />
      <SettingsPanel settings={settings} onChange={setSettings} />
    </>
  );

  return (
    <div className="flex flex-col bg-slate-50" style={{ height: "100dvh" }}>
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
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <LogoMark className="h-7 w-7" />
          <h1 className="truncate text-[15px] font-semibold text-slate-900">作文分栏</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="btn btn-secondary md:hidden"
          >
            <SlidersIcon className="h-4 w-4" />
            设置
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={essayContents.length === 0 || exporting}
            className="btn btn-primary"
          >
            <DownloadIcon className="h-4 w-4" />
            {exporting ? "导出中…" : "导出 PDF"}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Sidebar — desktop */}
        <aside className="hidden w-80 shrink-0 flex-col gap-3 overflow-y-auto border-r border-slate-200 bg-slate-50 p-4 md:flex">
          {sidebarContent}
        </aside>

        {/* Drawer — mobile */}
        {drawerOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
              onClick={() => setDrawerOpen(false)}
            />
            <aside className="absolute right-0 bottom-0 left-0 flex max-h-[85dvh] flex-col rounded-t-2xl bg-slate-50 shadow-2xl">
              <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-slate-300" />
              <div className="flex shrink-0 items-center justify-between px-4 pt-2 pb-1">
                <span className="text-base font-semibold text-slate-900">设置</span>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  aria-label="关闭"
                  className="btn btn-ghost btn-icon rounded-full"
                >
                  <CloseIcon className="h-5 w-5" />
                </button>
              </div>
              <div className="flex flex-col gap-3 overflow-y-auto px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
                {sidebarContent}
              </div>
            </aside>
          </div>
        )}

        {/* Preview */}
        <main className="min-h-0 min-w-0 flex-1 overflow-hidden">
          <Preview
            pages={pages}
            essayContents={essayContents}
            settings={settings}
          />
        </main>
      </div>

      {exportMsg && <BusyOverlay>{exportMsg}</BusyOverlay>}
    </div>
  );
}

function Stat({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="panel px-3.5 py-2.5">
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className="mt-0.5 text-lg font-semibold text-slate-900 tabular-nums">
        {value}
        <span className="ml-0.5 text-xs font-normal text-slate-400">{unit}</span>
      </p>
    </div>
  );
}

function BusyOverlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/25 px-6 backdrop-blur-[2px]">
      <div className="flex items-center gap-3 rounded-xl bg-white px-6 py-4 shadow-xl ring-1 ring-slate-900/5">
        <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />
        <p className="text-sm text-slate-700">{children}</p>
      </div>
    </div>
  );
}

function Toast({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "error";
  children: React.ReactNode;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`fixed bottom-6 left-1/2 z-[110] w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-lg px-4 py-2.5 text-sm text-white shadow-lg ${
        tone === "error" ? "bg-red-600" : "bg-slate-800"
      }`}
    >
      {children}
    </div>
  );
}
