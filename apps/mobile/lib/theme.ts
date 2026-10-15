// Values from the approved mockups. PRD §11 (brand) is still open: change colours here only.
export const colors = {
  brand: "#15803D",
  brandDark: "#166534",
  brandSoft: "#DCFCE7",
  text: "#111827",
  textMuted: "#4B5563",
  textSubtle: "#6B7280",
  border: "#E5E7EB",
  borderStrong: "#D1D5DB",
  surface: "#FFFFFF",
  background: "#F3F4F6",
  danger: "#B91C1C",
  dangerSoft: "#FEE2E2",
  warning: "#92400E",
  warningSoft: "#FEF3C7",
  chatBackground: "#EFEAE2",
  bubbleOut: "#DCF8C6",
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;
export const font = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
} as const;
