import { JSX } from "react";

type BadgeVariant = "green" | "yellow" | "red" | "blue" | "gray";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
  green:  "bg-green-100 text-green-800",
  yellow: "bg-yellow-100 text-yellow-800",
  red:    "bg-red-100 text-red-800",
  blue:   "bg-blue-100 text-blue-800",
  gray:   "bg-gray-100 text-gray-700",
};

export function Badge({ children, variant = "gray" }: BadgeProps): JSX.Element {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${variantClasses[variant]}`}>
      {children}
    </span>
  );
}
