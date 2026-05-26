import { JSX } from "react";

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}): JSX.Element {
  return (
    <label className="flex items-center gap-3 cursor-pointer select-none">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={[
          "relative w-11 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-1",
          checked ? "bg-brand-600" : "bg-gray-300",
        ].join(" ")}
      >
        <span
          className={[
            "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform",
            checked ? "translate-x-5" : "translate-x-0",
          ].join(" ")}
        />
      </button>
      {label && <span className="text-sm text-gray-700">{label}</span>}
    </label>
  );
}

export function SectionHeader({ title }: { title: string }): JSX.Element {
  return (
    <div className="flex items-center gap-3 py-3">
      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">
        {title}
      </span>
      <div className="flex-1 h-px bg-gray-100" />
    </div>
  );
}

export function FieldSkeleton(): JSX.Element {
  return <div className="h-9 rounded-lg bg-gray-100 animate-pulse" />;
}

export const LANGUAGES = [
  { code: "af",    label: "Afrikaans (af)" },
  { code: "sq",    label: "Albanian (sq)" },
  { code: "ar",    label: "Arabic (ar)" },
  { code: "az",    label: "Azerbaijani (az)" },
  { code: "bn",    label: "Bengali (bn)" },
  { code: "bg",    label: "Bulgarian (bg)" },
  { code: "ca",    label: "Catalan (ca)" },
  { code: "zh_CN", label: "Chinese (Simplified) (zh_CN)" },
  { code: "zh_HK", label: "Chinese (Traditional - Hong Kong) (zh_HK)" },
  { code: "zh_TW", label: "Chinese (Traditional - Taiwan) (zh_TW)" },
  { code: "hr",    label: "Croatian (hr)" },
  { code: "cs",    label: "Czech (cs)" },
  { code: "da",    label: "Danish (da)" },
  { code: "nl",    label: "Dutch (nl)" },
  { code: "en",    label: "English (en)" },
  { code: "en_GB", label: "English (UK) (en_GB)" },
  { code: "en_US", label: "English (US) (en_US)" },
  { code: "et",    label: "Estonian (et)" },
  { code: "fil",   label: "Filipino (fil)" },
  { code: "fi",    label: "Finnish (fi)" },
  { code: "fr",    label: "French (fr)" },
  { code: "ka",    label: "Georgian (ka)" },
  { code: "de",    label: "German (de)" },
  { code: "el",    label: "Greek (el)" },
  { code: "gu",    label: "Gujarati (gu)" },
  { code: "he",    label: "Hebrew (he)" },
  { code: "hi",    label: "Hindi (hi)" },
  { code: "hu",    label: "Hungarian (hu)" },
  { code: "id",    label: "Indonesian (id)" },
  { code: "ga",    label: "Irish (ga)" },
  { code: "it",    label: "Italian (it)" },
  { code: "ja",    label: "Japanese (ja)" },
  { code: "kn",    label: "Kannada (kn)" },
  { code: "kk",    label: "Kazakh (kk)" },
  { code: "ko",    label: "Korean (ko)" },
  { code: "ky",    label: "Kyrgyz (ky)" },
  { code: "lo",    label: "Lao (lo)" },
  { code: "lv",    label: "Latvian (lv)" },
  { code: "lt",    label: "Lithuanian (lt)" },
  { code: "mk",    label: "Macedonian (mk)" },
  { code: "ms",    label: "Malay (ms)" },
  { code: "ml",    label: "Malayalam (ml)" },
  { code: "mr",    label: "Marathi (mr)" },
  { code: "nb",    label: "Norwegian (nb)" },
  { code: "fa",    label: "Persian (fa)" },
  { code: "pl",    label: "Polish (pl)" },
  { code: "pt_BR", label: "Portuguese (Brazil) (pt_BR)" },
  { code: "pt_PT", label: "Portuguese (Portugal) (pt_PT)" },
  { code: "pa",    label: "Punjabi (pa)" },
  { code: "ro",    label: "Romanian (ro)" },
  { code: "ru",    label: "Russian (ru)" },
  { code: "sr",    label: "Serbian (sr)" },
  { code: "sk",    label: "Slovak (sk)" },
  { code: "sl",    label: "Slovenian (sl)" },
  { code: "es",    label: "Spanish (es)" },
  { code: "es_MX", label: "Spanish (Mexico) (es_MX)" },
  { code: "sw",    label: "Swahili (sw)" },
  { code: "sv",    label: "Swedish (sv)" },
  { code: "ta",    label: "Tamil (ta)" },
  { code: "te",    label: "Telugu (te)" },
  { code: "th",    label: "Thai (th)" },
  { code: "tr",    label: "Turkish (tr)" },
  { code: "uk",    label: "Ukrainian (uk)" },
  { code: "ur",    label: "Urdu (ur)" },
  { code: "uz",    label: "Uzbek (uz)" },
  { code: "vi",    label: "Vietnamese (vi)" },
  { code: "zu",    label: "Zulu (zu)" },
];
