import { useState, useCallback } from "react";
import { DEFAULTS, COEFFICIENT_GROUPS, type CoefficientsOverride } from "../simulation/coefficients.ts";

interface Props {
  visible: boolean;
  onApply: (overrides: CoefficientsOverride) => void;
}

export default function DevCoefficientPanel({ visible, onApply }: Props) {
  const [values, setValues] = useState<Record<string, number>>({ ...DEFAULTS });
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const handleChange = useCallback((key: string, val: number) => {
    setValues((prev) => ({ ...prev, [key]: val }));
  }, []);

  const handleReset = useCallback(() => {
    setValues({ ...DEFAULTS });
  }, []);

  const handleApply = useCallback(() => {
    const overrides: CoefficientsOverride = {};
    for (const [key, val] of Object.entries(values)) {
      const k = key as keyof typeof DEFAULTS;
      if (val !== DEFAULTS[k]) {
        (overrides as Record<string, number>)[k] = val;
      }
    }
    onApply(overrides);
  }, [values, onApply]);

  const handleCopy = useCallback(() => {
    const changed: Record<string, number> = {};
    for (const [key, val] of Object.entries(values)) {
      const k = key as keyof typeof DEFAULTS;
      if (val !== DEFAULTS[k]) {
        changed[k] = val;
      }
    }
    const json = JSON.stringify(changed, null, 2);
    navigator.clipboard.writeText(json);
  }, [values]);

  const handleExport = useCallback(() => {
    const exportData = {
      timestamp: new Date().toISOString(),
      defaults: { ...DEFAULTS },
      current: { ...values },
      overrides: {} as Record<string, { from: number; to: number }>,
    };
    for (const [key, val] of Object.entries(values)) {
      const k = key as keyof typeof DEFAULTS;
      if (val !== DEFAULTS[k]) {
        exportData.overrides[k] = { from: DEFAULTS[k], to: val };
      }
    }
    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pow-predictor-coefficients-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [values]);

  const toggleGroup = useCallback((name: string) => {
    setCollapsed((prev) => ({ ...prev, [name]: !prev[name] }));
  }, []);

  const hasChanges = Object.entries(values).some(([key, val]) => {
    return val !== DEFAULTS[key as keyof typeof DEFAULTS];
  });

  if (!visible) return null;

  return (
    <div className="fixed top-0 right-0 h-full w-80 z-30 glass-panel border-l border-white/10 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-white/10 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-white/90 tracking-wide uppercase">Dev Coefficients</h2>
          <span className="text-[10px] text-white/40 font-mono">Ctrl+Shift+D</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleApply}
            className="flex-1 px-3 py-1.5 rounded text-xs font-medium bg-sky-600/80 hover:bg-sky-500/80 text-white transition-colors"
          >
            Apply
          </button>
          <button
            onClick={handleReset}
            className="px-3 py-1.5 rounded text-xs font-medium bg-white/10 hover:bg-white/20 text-white/70 transition-colors"
          >
            Reset
          </button>
          <button
            onClick={handleCopy}
            disabled={!hasChanges}
            className="px-3 py-1.5 rounded text-xs font-medium bg-white/10 hover:bg-white/20 text-white/70 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Copy changed values as JSON"
          >
            Copy
          </button>
        </div>
      </div>

      {/* Scrollable coefficient groups */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {COEFFICIENT_GROUPS.map((group) => (
          <div key={group.name}>
            <button
              onClick={() => toggleGroup(group.name)}
              className="w-full flex items-center justify-between py-1.5 text-xs font-semibold text-white/70 uppercase tracking-wide hover:text-white/90 transition-colors"
            >
              <span>{group.name}</span>
              <span className="text-white/40">{collapsed[group.name] ? "+" : "-"}</span>
            </button>
            {!collapsed[group.name] && (
              <div className="space-y-3 pb-3">
                {group.sliders.map((slider) => {
                  const val = values[slider.key];
                  const isChanged = val !== DEFAULTS[slider.key];
                  return (
                    <div key={slider.key}>
                      <div className="flex items-baseline justify-between mb-0.5">
                        <label className={`text-[11px] font-medium ${isChanged ? "text-sky-300" : "text-white/60"}`}>
                          {slider.label}
                        </label>
                        <span className={`text-[11px] font-mono ${isChanged ? "text-sky-300" : "text-white/50"}`}>
                          {val}
                        </span>
                      </div>
                      <p className="text-[10px] text-white/35 mb-1 leading-tight">{slider.description}</p>
                      <input
                        type="range"
                        min={slider.min}
                        max={slider.max}
                        step={slider.step}
                        value={val}
                        onChange={(e) => handleChange(slider.key, parseFloat(e.target.value))}
                        className="w-full h-1 appearance-none rounded bg-white/10 accent-sky-500 cursor-pointer"
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Export footer */}
      <div className="p-3 border-t border-white/10 shrink-0">
        <button
          onClick={handleExport}
          className="w-full px-3 py-2 rounded text-xs font-medium bg-emerald-600/80 hover:bg-emerald-500/80 text-white transition-colors"
        >
          Export Settings to JSON
        </button>
      </div>
    </div>
  );
}
