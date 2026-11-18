"use client";

import { LANG_INFO, LANGUAGES, SUPPORT_LANGUAGES, type Lang, type SupportLang } from "@/lib/languages";
import { LEVEL_INFO, LEVELS, type Level } from "@/lib/levels";

/** A compact row of radio "chips". */
function Segmented<T extends string>({ legend, name, options, value, onChange, columns }: {
  legend: string;
  name: string;
  options: { value: T; label: React.ReactNode; aria?: string }[];
  value: T | null;
  onChange: (v: T) => void;
  columns: number;
}) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-semibold text-soft">{legend}</legend>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {options.map((o) => {
          const checked = value === o.value;
          return (
            <label key={o.value}
              className={`flex h-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl border text-[15px] font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${checked ? "border-accent bg-accent text-white" : "border-line bg-white text-ink"}`}>
              <input type="radio" name={name} value={o.value} checked={checked} onChange={() => onChange(o.value)}
                aria-label={o.aria} className="sr-only" />
              {o.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Six level chips in one row; the chosen level's description shows underneath. */
export default function LevelPicker({ value, onChange, legend = "Your level", name = "level" }: {
  value: Level | null;
  onChange: (level: Level) => void;
  legend?: string;
  name?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Segmented legend={legend} name={name} columns={6} value={value} onChange={onChange}
        options={LEVELS.map((l) => ({ value: l, label: l, aria: `${l}, ${LEVEL_INFO[l].name}` }))} />
      <p className="min-h-10 text-[13px] leading-snug text-muted" aria-live="polite">
        {value ? (
          <><strong className="font-semibold text-soft">{LEVEL_INFO[value].name}.</strong> {LEVEL_INFO[value].can}</>
        ) : (
          "A1 is a beginner, C2 almost native. Not sure? Pick the one that feels a little easy."
        )}
      </p>
    </div>
  );
}

export function LanguagePicker({ value, onChange, legend = "I want to learn", name = "language" }: {
  value: Lang | null;
  onChange: (lang: Lang) => void;
  legend?: string;
  name?: string;
}) {
  return (
    <Segmented legend={legend} name={name} columns={3} value={value} onChange={onChange}
      options={LANGUAGES.map((l) => ({
        value: l,
        label: <><span aria-hidden="true">{LANG_INFO[l].flag}</span>{LANG_INFO[l].name}</>,
      }))} />
  );
}

/** Which language this learning language's words are translated into. */
export function SupportSelect({ language, value, onChange, id = "support" }: {
  language: Lang;
  value: SupportLang;
  onChange: (support: SupportLang) => void;
  id?: string;
}) {
  const options = (Object.keys(SUPPORT_LANGUAGES) as SupportLang[]).filter((l) => l !== language);
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-soft">
        Translate my {LANG_INFO[language].name} words into
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as SupportLang)} className="field h-11">
        {options.map((l) => <option key={l} value={l}>{SUPPORT_LANGUAGES[l]}</option>)}
      </select>
    </div>
  );
}

export { Segmented };
