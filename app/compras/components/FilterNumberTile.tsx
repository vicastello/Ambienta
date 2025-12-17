
import React from 'react';

type FilterNumberTileProps = {
    label: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    helper?: string;
    suffix?: string;
    disabled?: boolean;
    onChange: (value: string) => void;
};

export function FilterNumberTile({ label, value, min, max, step, helper, suffix, disabled, onChange }: FilterNumberTileProps) {
    return (
        <label className="rounded-[24px] glass-panel p-4 sm:p-5 space-y-2">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">{label}</p>
            <div className="flex items-center gap-2">
                <input
                    type="number"
                    min={min}
                    max={max}
                    step={step}
                    className="glass-input w-full"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    disabled={disabled}
                />
                {suffix && <span className="text-xs font-semibold text-slate-500">{suffix}</span>}
            </div>
            {helper && <p className="text-xs text-slate-500">{helper}</p>}
        </label>
    );
}
