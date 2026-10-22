import type { LayoutSettings } from "../types";

interface Props {
  settings: LayoutSettings;
  onChange: (s: LayoutSettings) => void;
}

const COLUMN_OPTIONS = [1, 2, 3, 4, 5, 6];

function Field({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 0.5,
  unit,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}) {
  return (
    <label className="block min-w-0">
      <span className="field-label">
        {label}
        {unit && <span className="text-slate-400"> · {unit}</span>}
      </span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        max={max}
        step={step}
        className="field-input"
      />
    </label>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3">
      <span className="min-w-0">
        <span className="block text-[13px] text-slate-700">{label}</span>
        <span className="block text-[11px] text-slate-400">{hint}</span>
      </span>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span className="h-5 w-9 rounded-full bg-slate-200 transition-colors peer-checked:bg-brand-600 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-500" />
        <span className="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4" />
      </span>
    </label>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-xs font-medium tracking-wide text-slate-500">{title}</legend>
      {children}
    </fieldset>
  );
}

export default function SettingsPanel({ settings, onChange }: Props) {
  const set = <K extends keyof LayoutSettings>(
    key: K,
    val: LayoutSettings[K],
  ) => onChange({ ...settings, [key]: val });

  return (
    <section className="panel">
      <div className="panel-header">
        <h3 className="panel-title">排版设置</h3>
      </div>
      <div className="space-y-5 p-4">
        <div className="space-y-3">
          <Toggle
            checked={settings.titleAsFirstParagraph}
            onChange={(v) => set("titleAsFirstParagraph", v)}
            label="首段识别为标题"
            hint="居中显示并加书名号"
          />
          <Toggle
            checked={settings.stripInfoLines}
            onChange={(v) => set("stripInfoLines", v)}
            label="提取个人信息"
            hint="姓名、班级等合并到篇首信息行"
          />
        </div>

        <Group title="分栏">
          <div className="grid grid-cols-6 gap-1 rounded-lg bg-slate-100 p-1">
            {COLUMN_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => set("columns", n)}
                aria-pressed={settings.columns === n}
                className={`h-7 cursor-pointer rounded-md text-sm tabular-nums transition-colors ${
                  settings.columns === n
                    ? "bg-white font-semibold text-brand-700 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <Field
              label="栏距"
              value={settings.columnGapChars}
              onChange={(v) => set("columnGapChars", v)}
              min={0}
              max={10}
              step={0.5}
              unit="字"
            />
          </div>
        </Group>

        <Group title="字体">
          <div className="grid grid-cols-2 gap-2.5">
            <Field
              label="字号"
              value={settings.fontSize}
              onChange={(v) => set("fontSize", Math.max(3, v))}
              min={3}
              max={30}
              step={0.5}
              unit="pt"
            />
            <Field
              label="行高"
              value={settings.lineHeight}
              onChange={(v) => set("lineHeight", Math.max(1, v))}
              min={1}
              max={3}
              step={0.1}
              unit="倍"
            />
          </div>
        </Group>

        <Group title="页边距">
          <div className="grid grid-cols-4 gap-2">
            <Field label="上" value={settings.marginTop} onChange={(v) => set("marginTop", v)} unit="mm" />
            <Field label="下" value={settings.marginBottom} onChange={(v) => set("marginBottom", v)} unit="mm" />
            <Field label="左" value={settings.marginLeft} onChange={(v) => set("marginLeft", v)} unit="mm" />
            <Field label="右" value={settings.marginRight} onChange={(v) => set("marginRight", v)} unit="mm" />
          </div>
        </Group>
      </div>
    </section>
  );
}
