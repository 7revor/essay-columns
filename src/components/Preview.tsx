import { useRef, useState, useEffect, useCallback } from "react";
import {
  A4_WIDTH_MM,
  A4_HEIGHT_MM,
  MM_TO_PX,
  ESSAY_GAP_MM,
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

  const scale = userZoom ?? fitScale;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const calc = () => {
      const w = el.clientWidth - 40;
      const h = el.clientHeight - 40;
      setFitScale(Math.min(w / PAGE_W, h / PAGE_H, 2));
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const zoomTo = useCallback(
    (v: number) => setUserZoom(Math.round(Math.max(0.15, Math.min(3, v)) * 100) / 100),
    [],
  );

  const colW = getColumnWidthMM(settings);
  const gapMM = getColumnGapMM(settings);

  if (pages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-gray-400">
        暂无内容
      </div>
    );
  }

  const pct = Math.round(scale * 100);

  return (
    <div className="flex h-full flex-col">
      {/* Zoom toolbar */}
      <div className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white/90 px-4 py-1.5 backdrop-blur">
        <span className="text-xs text-gray-500">
          共 {pages.length} 页 · {essayContents.length} 篇作文
        </span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => zoomTo(scale - 0.1)}
            className="flex h-6 w-6 items-center justify-center rounded text-sm text-gray-600 hover:bg-gray-100"
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
            className="h-1 w-28 cursor-pointer accent-blue-600"
          />
          <button
            onClick={() => zoomTo(scale + 0.1)}
            className="flex h-6 w-6 items-center justify-center rounded text-sm text-gray-600 hover:bg-gray-100"
          >
            +
          </button>
          <span className="w-10 text-center text-[11px] tabular-nums text-gray-600">
            {pct}%
          </span>
          <button
            onClick={() => setUserZoom(null)}
            className="rounded px-1.5 py-0.5 text-[11px] text-blue-600 hover:bg-blue-50"
          >
            适应
          </button>
        </div>
      </div>

      {/* Scrollable page area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto bg-gray-100"
      >
        <div className="flex flex-col items-center gap-5 p-5">
          {pages.map((page, pi) => (
            <div key={pi} className="shrink-0">
              <div
                className="overflow-hidden rounded shadow-md"
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
                    fontFamily: settings.fontFamily,
                    fontSize: `${settings.fontSize}pt`,
                    lineHeight: `${settings.lineHeight}`,
                    color: "#000",
                  }}
                >
                  {page.columns.map((col, ci) => {
                    const leftMM =
                      settings.marginLeft + ci * (colW + gapMM);
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
                              marginTop:
                                ei > 0
                                  ? `${ESSAY_GAP_MM * MM_TO_PX}px`
                                  : undefined,
                              borderTop:
                                ei > 0
                                  ? "0.3px dashed #bbb"
                                  : undefined,
                              paddingTop:
                                ei > 0
                                  ? `${ESSAY_GAP_MM * 0.4 * MM_TO_PX}px`
                                  : undefined,
                            }}
                            dangerouslySetInnerHTML={{
                              __html: essayInnerHTML(
                                essayContents[idx],
                              ),
                            }}
                          />
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
              <p className="mt-1 text-center text-[11px] text-gray-400">
                第 {pi + 1} 页
              </p>
            </div>
          ))}
          <div className="h-2 shrink-0" />
        </div>
      </div>
    </div>
  );
}
