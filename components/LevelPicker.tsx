"use client";

import { LEVEL_INFO, LEVELS, type Level } from "@/lib/levels";

/** A radio list of the six CEFR levels with a plain description of each. */
export default function LevelPicker({ value, onChange, name = "level" }: {
  value: Level | null;
  onChange: (level: Level) => void;
  name?: string;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-semibold text-soft">Your Dutch level</legend>
      {LEVELS.map((level) => {
        const info = LEVEL_INFO[level];
        const checked = value === level;
        return (
          <label key={level}
            className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 ${checked ? "border-accent bg-accent-soft" : "border-line bg-white"}`}>
            <input type="radio" name={name} value={level} checked={checked} onChange={() => onChange(level)}
              className="mt-1 h-4 w-4 accent-[#2346c8]" />
            <span className="flex flex-col gap-0.5">
              <span className="text-[15px] font-semibold">
                {level} <span className="font-medium text-soft">· {info.name}</span>
              </span>
              <span className="text-[13px] leading-snug text-muted">{info.can}</span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
