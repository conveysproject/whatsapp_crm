import type { JSX, ReactNode } from "react";

export type Theme = "light" | "dark";

const T = {
  light: {
    label: "block text-sm font-medium text-gray-700 mb-1",
    input:
      "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0BBF77] read-only:bg-gray-50 read-only:text-gray-500",
    button:
      "w-full rounded-lg bg-[#0BBF77] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#09a867] disabled:opacity-60 disabled:cursor-not-allowed",
    link: "text-[#0BBF77] font-semibold hover:underline",
    muted: "text-sm text-gray-600",
    title: "text-2xl font-bold text-gray-900",
    error: "text-sm text-red-600",
  },
  dark: {
    label: "block text-sm font-medium text-gray-300 mb-1",
    input:
      "w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-gray-400 read-only:text-gray-400",
    button:
      "w-full rounded-lg bg-gray-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-600 disabled:opacity-60 disabled:cursor-not-allowed",
    link: "text-gray-400 hover:text-gray-300 underline",
    muted: "text-sm text-gray-400",
    title: "text-xl font-bold text-white",
    error: "text-sm text-red-400",
  },
} as const;

export function styles(theme: Theme): (typeof T)[Theme] {
  return T[theme];
}

export function TextField(props: {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange?: (v: string) => void;
  autoComplete?: string;
  readOnly?: boolean;
  required?: boolean;
  inputMode?: "numeric" | "email" | "text";
  maxLength?: number;
  theme: Theme;
}): JSX.Element {
  const s = styles(props.theme);
  return (
    <div>
      <label htmlFor={props.id} className={s.label}>
        {props.label}
      </label>
      <input
        id={props.id}
        name={props.id}
        type={props.type ?? "text"}
        value={props.value}
        onChange={(e) => props.onChange?.(e.target.value)}
        autoComplete={props.autoComplete}
        readOnly={props.readOnly}
        required={props.required ?? true}
        inputMode={props.inputMode}
        maxLength={props.maxLength}
        className={s.input}
      />
    </div>
  );
}

export function ErrorText({ message, theme }: { message: string | null; theme: Theme }): JSX.Element | null {
  if (!message) return null;
  return (
    <p role="alert" className={styles(theme).error}>
      {message}
    </p>
  );
}

export function SubmitButton({
  pending,
  theme,
  disabled,
  children,
}: {
  pending: boolean;
  theme: Theme;
  disabled?: boolean;
  children: ReactNode;
}): JSX.Element {
  return (
    <button type="submit" disabled={pending || disabled} className={styles(theme).button}>
      {pending ? "Please wait..." : children}
    </button>
  );
}
