import { useSignIn } from "@clerk/expo";
import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { config } from "../../lib/config";
import { stepAfterAttempt, type SignInStep } from "../../lib/sign-in-steps";
import { colors, font, radius, space } from "../../lib/theme";

const NETWORK_ERROR = "Something went wrong. Check your connection and try again.";

function messageOf(error: { longMessage?: string | null; message?: string | null } | null | undefined, fallback: string): string {
  return error?.longMessage ?? error?.message ?? fallback;
}

export default function SignInScreen() {
  const { signIn, fetchStatus } = useSignIn();
  const [step, setStep] = useState<SignInStep>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const busy = submitting || fetchStatus === "fetching";

  /** Runs one Clerk action with double-tap protection; network/unknown failures become a neutral message. */
  async function run(action: () => Promise<void>) {
    if (submitting) return;
    setSubmitting(true);
    setFormError(null);
    setNotice(null);
    try {
      await action();
    } catch {
      setFormError(NETWORK_ERROR);
    } finally {
      setSubmitting(false);
    }
  }

  /** Returns true when the session was activated; the (auth) layout then redirects. */
  async function finish(): Promise<boolean> {
    const { error } = await signIn.finalize();
    if (error) {
      setFormError(messageOf(error, "Couldn't finish signing in. Please try again."));
      return false;
    }
    return true;
  }

  /** Sends the emailed code; returns true on success. */
  async function sendCode(): Promise<boolean> {
    const { error } = await signIn.mfa.sendEmailCode();
    if (error) {
      setFormError(messageOf(error, "Couldn't send the code. Please try again."));
      return false;
    }
    return true;
  }

  function submitPassword() {
    return run(async () => {
      const { error } = await signIn.password({ emailAddress: email.trim(), password });
      if (error) {
        setFormError(messageOf(error, "Couldn't sign in. Check your email and password."));
        return;
      }
      const next = stepAfterAttempt(signIn.status, signIn.supportedSecondFactors);
      if (next === "done") {
        await finish();
        return;
      }
      if (next === "email_code") {
        if (!(await sendCode())) return;
        setCode("");
      }
      setStep(next);
    });
  }

  function submitCode() {
    return run(async () => {
      const { error } = await signIn.mfa.verifyEmailCode({ code: code.trim() });
      if (error) {
        setFormError(messageOf(error, "That code didn't work. Check it and try again."));
        return;
      }
      const next = stepAfterAttempt(signIn.status, signIn.supportedSecondFactors);
      if (next === "done") await finish();
      else setStep("unsupported_2fa");
    });
  }

  function resendCode() {
    return run(async () => {
      if (await sendCode()) setNotice("We sent a new code.");
    });
  }

  const title = step === "password" ? "Enter your password" : step === "email_code" ? "Check your email" : "Sign in to WBMSG";
  const subtitle =
    step === "password"
      ? email
      : step === "email_code"
        ? `This is a new device, so we sent a 6-digit code to ${email}.`
        : step === "unsupported_2fa"
          ? "Your account uses a two-step method the app doesn't support yet. Finish signing in on the web dashboard."
          : "Use the same account you use on the web.";

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.body} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {step !== "email" && (
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => { setFormError(null); setNotice(null); setCode(""); setStep(step === "email_code" ? "password" : "email"); }} style={styles.back}>
            <Text style={styles.backText}>‹ Back</Text>
          </Pressable>
        )}
        <View style={styles.logo}><Text style={styles.logoText}>W</Text></View>
        <Text style={styles.title} accessibilityRole="header">{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>

        {step === "email" && (
          <>
            <Text style={styles.label}>Work email</Text>
            <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" accessibilityLabel="Work email" />
            <Pressable accessibilityRole="button" style={[styles.primary, !email.trim() && styles.disabled]} disabled={!email.trim()} onPress={() => setStep("password")}>
              <Text style={styles.primaryText}>Continue</Text>
            </Pressable>
          </>
        )}

        {step === "password" && (
          <>
            <Text style={styles.label}>Password</Text>
            <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" textContentType="password" accessibilityLabel="Password" />
            <Pressable accessibilityRole="button" style={[styles.primary, (!password || busy) && styles.disabled]} disabled={!password || busy} onPress={() => void submitPassword()}>
              {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>Sign in</Text>}
            </Pressable>
            <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(`${config.webUrl}/sign-in`)} style={styles.ghost}>
              <Text style={styles.ghostText}>Forgot password?</Text>
            </Pressable>
          </>
        )}

        {step === "email_code" && (
          <>
            <Text style={styles.label}>6-digit code</Text>
            <TextInput style={[styles.input, styles.code]} value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} autoComplete="one-time-code" textContentType="oneTimeCode" accessibilityLabel="6-digit code" />
            <Pressable accessibilityRole="button" style={[styles.primary, (code.trim().length !== 6 || busy) && styles.disabled]} disabled={code.trim().length !== 6 || busy} onPress={() => void submitCode()}>
              {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>Verify</Text>}
            </Pressable>
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => void resendCode()} style={[styles.ghost, busy && styles.disabled]}>
              <Text style={styles.ghostText}>Send a new code</Text>
            </Pressable>
          </>
        )}

        {step === "unsupported_2fa" && (
          <Pressable accessibilityRole="link" style={styles.primary} onPress={() => void Linking.openURL(`${config.webUrl}/sign-in`)}>
            <Text style={styles.primaryText}>Open web dashboard</Text>
          </Pressable>
        )}

        {notice && <Text style={styles.notice} accessibilityRole="alert">{notice}</Text>}
        {formError && <Text style={styles.error} accessibilityRole="alert">{formError}</Text>}

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            New to WBMSG? Create your account at{" "}
            <Text style={styles.link} onPress={() => void Linking.openURL(config.webUrl)}>the web dashboard</Text>
          </Text>
          <Text style={styles.footerHint}>Same login as the web dashboard</Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
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
