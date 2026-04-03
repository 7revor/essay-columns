import type { LayoutSettings } from "../types";

interface Props {
  settings: LayoutSettings;
  onChange: (s: LayoutSettings) => void;
}

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
    <div>
      <div className="mb-0.5 text-[11px] text-gray-500">
        {label}
        {unit ? ` (${unit})` : ""}
      </div>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        max={max}
        step={step}
        className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs tabular-nums focus:border-blue-400 focus:outline-none"
      />
    </div>
  );
}

export default function SettingsPanel({ settings, onChange }: Props) {
  const set = <K extends keyof LayoutSettings>(
    key: K,
    val: LayoutSettings[K],
  ) => onChange({ ...settings, [key]: val });

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-3 py-2">
        <h3 className="text-sm font-semibold text-gray-800">布局设置</h3>
      </div>
      <div className="space-y-4 p-3">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={settings.titleAsFirstParagraph}
            onChange={(e) => set("titleAsFirstParagraph", e.target.checked)}
            className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600"
          />
          <span className="text-xs text-gray-700">
            首段识别为标题（居中加粗）
          </span>
        </label>

        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={settings.stripInfoLines}
            onChange={(e) => set("stripInfoLines", e.target.checked)}
            className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600"
          />
          <span className="text-xs text-gray-700">
            提取个人信息（姓名/班级）
          </span>
        </label>

        {/* Margins */}
        <fieldset>
          <legend className="mb-1.5 text-xs font-medium text-gray-700">
            页边距
          </legend>
          <div className="grid grid-cols-4 gap-2">
            <Field
              label="上"
              value={settings.marginTop}
              onChange={(v) => set("marginTop", v)}
              unit="mm"
            />
            <Field
              label="下"
              value={settings.marginBottom}
              onChange={(v) => set("marginBottom", v)}
              unit="mm"
            />
            <Field
              label="左"
              value={settings.marginLeft}
              onChange={(v) => set("marginLeft", v)}
              unit="mm"
            />
            <Field
              label="右"
              value={settings.marginRight}
              onChange={(v) => set("marginRight", v)}
              unit="mm"
            />
          </div>
        </fieldset>

        {/* Columns */}
        <fieldset>
          <legend className="mb-1.5 text-xs font-medium text-gray-700">
            分栏
          </legend>
          <div className="grid grid-cols-2 gap-2">
            <Field
              label="栏数"
              value={settings.columns}
              onChange={(v) => set("columns", Math.max(1, Math.round(v)))}
              min={1}
              max={6}
              step={1}
            />
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
        </fieldset>

        {/* Font size & line height */}
        <fieldset>
          <legend className="mb-1.5 text-xs font-medium text-gray-700">
            字体
          </legend>
          <div className="grid grid-cols-2 gap-2">
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
            />
          </div>
        </fieldset>
      </div>
    </div>
  );
}
