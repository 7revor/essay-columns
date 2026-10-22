import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import {
  A4_WIDTH_MM,
  A4_HEIGHT_MM,
  MM_TO_PX,
  ESSAY_GAP_MM,
  FONT_FAMILY,
  type PageLayout,
  type EssayContent,
  type LayoutSettings,
} from "../types";
import { getColumnWidthMM, getColumnGapMM } from "../utils/layoutEngine";
import { essayInnerHTML } from "../utils/renderUtils";

interface Props {
  pages: PageLayout[];
  essayContents: EssayContent[];
  settings: LayoutSettings;
}

const PAGE_W = A4_WIDTH_MM * MM_TO_PX;
const PAGE_H = A4_HEIGHT_MM * MM_TO_PX;

export default function Preview({ pages, essayContents, settings }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [fitScale, setFitScale] = useState(0.5);
  const [userZoom, setUserZoom] = useState<number | null>(null);
  const hasContent = pages.length > 0;

  const scale = userZoom ?? fitScale;

  const calcFitScale = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const targetW = Math.min(el.clientWidth * 0.8, 1280);
    setFitScale(targetW / PAGE_W);
  }, []);

  useEffect(() => {
    calcFitScale();
    const el = scrollRef.current;
    if (!el) return;
    // 窗口尺寸变化（如手机旋转、侧栏切换）时重新计算适应宽度
    const ro = new ResizeObserver(calcFitScale);
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasContent, calcFitScale]);

  const zoomTo = useCallback((v: number) => setUserZoom(Math.round(Math.max(0.15, Math.min(3, v)) * 100) / 100), []);

  const { colW, gapMM } = useMemo(
    () => ({ colW: getColumnWidthMM(settings), gapMM: getColumnGapMM(settings) }),
    [settings],
  );

  const htmlCache = useMemo(
    () => essayContents.map((c) => essayInnerHTML(c)),
    [essayContents],
  );

  const pct = Math.round(scale * 100);

  return (
    <div className="flex h-full flex-col">
      {hasContent && (
        <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white/85 px-3 backdrop-blur sm:px-4">
          <span className="text-xs text-slate-500">
            <span className="font-medium text-slate-700 tabular-nums">{pages.length}</span> 页
            <span className="mx-1.5 text-slate-300">·</span>
            <span className="font-medium text-slate-700 tabular-nums">{essayContents.length}</span> 篇
          </span>
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-0.5 shadow-xs">
            <button
              type="button"
              onClick={() => zoomTo(scale - 0.1)}
              aria-label="缩小"
              className="btn btn-ghost h-7 w-7 px-0 text-base leading-none"
            >
              −
            </button>
            <input
              type="range"
              min={15}
              max={200}
              step={5}
              value={pct}
              onChange={(e) => zoomTo(Number(e.target.value) / 100)}
              aria-label="缩放比例"
              className="hidden h-1 w-24 cursor-pointer accent-brand-600 sm:block"
            />
            <button
              type="button"
              onClick={() => zoomTo(scale + 0.1)}
              aria-label="放大"
              className="btn btn-ghost h-7 w-7 px-0 text-base leading-none"
            >
              +
            </button>
            <span className="w-10 text-center text-xs tabular-nums text-slate-600">{pct}%</span>
            <span className="h-4 w-px bg-slate-200" />
            <button
              type="button"
              onClick={() => { calcFitScale(); setUserZoom(null); }}
              className={`btn h-7 px-2 text-xs ${
                userZoom === null ? "text-brand-700" : "btn-ghost text-brand-600"
              }`}
            >
              适应宽度
            </button>
          </div>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-auto bg-slate-100">
        {!hasContent ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">暂无内容</div>
        ) : (
          <div className="flex flex-col items-center gap-4 p-4 sm:gap-6 sm:p-6">
            {pages.map((page, pi) => (
              <div key={pi} className="shrink-0">
                <div
                  className="overflow-hidden rounded-[3px] shadow-[0_1px_3px_rgb(15_23_42/0.08),0_8px_24px_-6px_rgb(15_23_42/0.12)] ring-1 ring-slate-900/5"
                  style={{
                    width: `${PAGE_W * scale}px`,
                    height: `${PAGE_H * scale}px`,
                  }}
                >
                  <div
                    style={{
                      width: `${PAGE_W}px`,
                      height: `${PAGE_H}px`,
                      transform: `scale(${scale})`,
                      transformOrigin: "top left",
                      backgroundColor: "#fff",
                      position: "relative",
                      fontFamily: FONT_FAMILY,
                      fontSize: `${settings.fontSize}pt`,
                      lineHeight: `${settings.lineHeight}`,
                      color: "#000",
                    }}
                  >
                    {page.columns.map((col, ci) => {
                      const leftMM = settings.marginLeft + ci * (colW + gapMM);
                      return (
                        <div
                          key={ci}
                          style={{
                            position: "absolute",
                            left: `${leftMM * MM_TO_PX}px`,
                            top: `${settings.marginTop * MM_TO_PX}px`,
                            width: `${colW * MM_TO_PX}px`,
                          }}
                        >
                          {col.essayIndices.map((idx, ei) => (
                            <div
                              key={idx}
                              style={{
                                marginTop: ei > 0 ? `${ESSAY_GAP_MM * MM_TO_PX}px` : undefined,
                                borderTop: ei > 0 ? "0.3px dashed #bbb" : undefined,
                                paddingTop: ei > 0 ? `${ESSAY_GAP_MM * 0.4 * MM_TO_PX}px` : undefined,
                              }}
                              dangerouslySetInnerHTML={{
                                __html: htmlCache[idx],
                              }}
                            />
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <p className="mt-2 text-center text-[11px] tabular-nums text-slate-400">{pi + 1} / {pages.length}</p>
              </div>
            ))}
            <div className="h-2 shrink-0" />
          </div>
        )}
      </div>
    </div>
  );
}
