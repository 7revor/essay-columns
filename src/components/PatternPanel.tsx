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

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-3 py-2">
        <h3 className="text-sm font-semibold text-gray-800">
          重复模式检测
        </h3>
        <p className="mt-0.5 text-xs text-gray-500">勾选即删除该模式</p>
      </div>
      <div className="divide-y divide-gray-50">
        {patterns.map((p) => (
          <label
            key={p.id}
            className="flex cursor-pointer items-start gap-2 px-3 py-2 hover:bg-gray-50"
          >
            <input
              type="checkbox"
              checked={removedIds.has(p.id)}
              onChange={() => toggle(p.id)}
              className="mt-0.5 h-3.5 w-3.5 rounded border-gray-300 text-blue-600"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="shrink-0 rounded bg-gray-100 px-1 py-0.5 text-[10px] text-gray-500">
                  {TYPE_LABELS[p.type] || p.type}
                </span>
                <span className="truncate text-xs text-gray-700">
                  {p.label}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-gray-400">
                共 {p.count} 处
                {p.examples[0] && p.examples[0] !== "(空行)" && (
                  <> · {p.examples[0].slice(0, 30)}</>
                )}
              </p>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}
