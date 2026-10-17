import { StyleSheet } from "react-native";
import { colors, font, radius, space } from "../../lib/theme";

/** Shared by the Clerk and WBMSG sign-in screens. */
export const signInStyles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  body: { flex: 1, paddingHorizontal: space.xl, paddingTop: space.xl, gap: space.md },
  back: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start" },
  backText: { fontFamily: font.semibold, fontSize: 16, color: colors.text },
  logo: { width: 56, height: 56, borderRadius: 16, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center", marginTop: space.lg },
  logoText: { fontFamily: font.bold, fontSize: 26, color: "#FFFFFF" },
  title: { fontFamily: font.bold, fontSize: 26, color: colors.text, marginTop: space.sm },
  subtitle: { fontFamily: font.regular, fontSize: 15, lineHeight: 22, color: colors.textMuted, marginBottom: space.md },
  label: { fontFamily: font.medium, fontSize: 14, color: colors.text },
  input: { height: 48, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, paddingHorizontal: 14, fontSize: 16, fontFamily: font.regular, color: colors.text },
  code: { letterSpacing: 8, textAlign: "center", fontFamily: font.semibold, fontSize: 22 },
  primary: { height: 52, borderRadius: radius.md, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center", marginTop: space.sm },
  primaryText: { fontFamily: font.semibold, fontSize: 16, color: "#FFFFFF" },
  disabled: { opacity: 0.5 },
  ghost: { minHeight: 44, justifyContent: "center", alignSelf: "center" },
  ghostText: { fontFamily: font.semibold, fontSize: 15, color: colors.brand },
  notice: { fontFamily: font.medium, fontSize: 14, color: colors.textMuted },
  error: { fontFamily: font.medium, fontSize: 14, color: colors.danger },
  footer: { marginTop: "auto", paddingBottom: space.xl, alignItems: "center", gap: space.sm },
  footerText: { fontFamily: font.regular, fontSize: 13, color: colors.textMuted, textAlign: "center" },
  link: { fontFamily: font.semibold, color: colors.brand },
  footerHint: { fontFamily: font.regular, fontSize: 12, color: colors.textSubtle },
});
