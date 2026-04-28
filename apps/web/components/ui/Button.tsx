import { ButtonHTMLAttributes, JSX } from "react";

type Variant = "primary" | "secondary" | "ghost" | "destructive";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variantClasses: Record<Variant, string> = {
  primary:     "bg-brand-600 text-white hover:bg-brand-700 focus:ring-brand-500",
  secondary:   "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 focus:ring-brand-500",
  ghost:       "text-gray-600 hover:bg-gray-100 focus:ring-brand-500",
  destructive: "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500",
};

const sizeClasses: Record<Size, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
  lg: "px-6 py-3 text-base",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  disabled,
  ...props
}: ButtonProps): JSX.Element {
  return (
    <button
      className={[
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium",
        "transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        variantClasses[variant],
        sizeClasses[size],
        className,
      ].join(" ")}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
