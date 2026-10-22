import type { DetectedPattern } from "../types";

interface Props {
  patterns: DetectedPattern[];
  removedIds: Set<string>;
  onChange: (ids: Set<string>) => void;
}

const TYPE_LABELS: Record<string, string> = {
  header: "结构",
  separator: "分隔",
  empty: "空白",
  decorative: "内容",
};

export default function PatternPanel({ patterns, removedIds, onChange }: Props) {
  if (patterns.length === 0) return null;

  const toggle = (id: string) => {
    const next = new Set(removedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };

  const removedCount = patterns.filter((p) => removedIds.has(p.id)).length;

  return (
    <section className="panel">
      <div className="panel-header">
        <h3 className="panel-title">重复模式</h3>
        <span className="panel-hint">
          已删除 {removedCount}/{patterns.length}
        </span>
      </div>
      <p className="px-4 pt-2.5 text-xs text-slate-400">勾选的模式将从输出中删除</p>
      <div className="p-1.5">
        {patterns.map((p) => {
          const checked = removedIds.has(p.id);
          return (
            <label
              key={p.id}
              className={`flex cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 transition-colors ${
                checked ? "bg-brand-50/60 hover:bg-brand-50" : "hover:bg-slate-50"
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(p.id)}
                className="checkbox mt-0.5"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-px text-[10px] font-medium text-slate-500">
                    {TYPE_LABELS[p.type] || p.type}
                  </span>
                  <span
                    className={`truncate text-[13px] ${
                      checked ? "text-slate-400 line-through decoration-slate-300" : "text-slate-700"
                    }`}
                  >
                    {p.label}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-[11px] text-slate-400">
                  共 {p.count} 处
                  {p.examples[0] && p.examples[0] !== "(空行)" && (
                    <> · {p.examples[0].slice(0, 30)}</>
                  )}
                </p>
              </div>
            </label>
          );
        })}
      </div>
    </section>
  );
}
