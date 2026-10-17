import { useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { wbmsgSession } from "../../lib/auth";
import { NETWORK_ERROR, finishSignIn, stepFromResponse, type AuthResponse } from "../../lib/auth/flows";
import type { SessionTokens } from "../../lib/auth/session-store";
import { config } from "../../lib/config";
import { signInStyles as styles } from "./sign-in-styles";

type Step = "email" | "password" | "new_device" | "email_code" | "set_password" | "super_admin";

const MIN_PASSWORD = 8;

/** WBMSG's own sign-in: email → password → new-device code, set-password (reset code), or "Email me a code". No sign-up here. */
export function WbmsgSignIn() {
  const { client, store } = wbmsgSession();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [code, setCode] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);

  /** One action at a time (double-tap protection); unexpected failures become a neutral message. */
  async function run(action: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setFormError(null);
    setNotice(null);
    try {
      await action();
    } catch {
      setFormError(NETWORK_ERROR);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  function go(next: Step) {
    setFormError(null);
    setNotice(null);
    setCode("");
    setStep(next);
  }

  async function finish(tokens: SessionTokens) {
    const outcome = await finishSignIn(tokens, { me: client.me, signOutRemote: client.signOut, store });
    setPassword("");
    setNewPassword("");
    setCode("");
    // "ok": the (auth) layout sees the signed-in session and moves on.
    if (outcome === "super_admin") go("super_admin");
  }

  /** Applies an answer from a sign-in call; returns false when it was an error (already shown). */
  async function apply(res: AuthResponse): Promise<boolean> {
    const next = stepFromResponse(res);
    switch (next.kind) {
      case "signed_in":
        await finish(next.tokens);
        return true;
      case "new_device":
      case "set_password":
        setChallengeId(next.challengeId);
        go(next.kind);
        return true;
      case "sent":
        return true;
      case "error":
        setFormError(next.message);
        return false;
    }
  }

  const submitPassword = (resend = false) =>
    run(async () => {
      const ok = await apply(await client.signInPassword(email, password, await store.deviceId()));
      if (ok && resend) setNotice("We sent a new code.");
    });

  const submitNewDevice = () => run(async () => { if (challengeId) await apply(await client.verifyNewDevice(challengeId, code)); });

  const requestCode = (resend = false) =>
    run(async () => {
      if (!(await apply(await client.requestEmailCode(email)))) return;
      if (resend) setNotice("We sent a new code.");
      else go("email_code");
    });

  const submitEmailCode = () => run(async () => { await apply(await client.verifyEmailCode(email, code)); });

  const forgotPassword = () =>
    run(async () => {
      if (!(await apply(await client.forgotPassword(email)))) return;
      setChallengeId(null);
      go("set_password");
    });

  // A set-password code from the sign-in step is re-sent by signing in again; a "forgot password" code by asking again.
  const resendResetCode = () =>
    challengeId
      ? submitPassword(true)
      : run(async () => { if (await apply(await client.forgotPassword(email))) setNotice("We sent a new code."); });

  const submitNewPassword = () => run(async () => { await apply(await client.resetPassword(email, code, newPassword)); });

  const back = () => {
    if (step === "new_device" || step === "set_password") go("password");
    else go("email");
  };

  const codeReady = code.trim().length === 6;
  const title =
    step === "password" ? "Enter your password"
      : step === "new_device" || step === "email_code" ? "Check your email"
        : step === "set_password" ? "Set your password"
          : step === "super_admin" ? "Use the web dashboard"
            : "Sign in to WBMSG";
  const subtitle =
    step === "password" ? email
      : step === "new_device" ? `This is a new device, so we sent a 6-digit code to ${email}.`
        : step === "email_code" ? `If an account exists for ${email}, we sent it a 6-digit sign-in code.`
          : step === "set_password" ? `We sent a 6-digit code to ${email}. Enter it and choose a new password.`
            : step === "super_admin" ? "Super admin accounts use the web dashboard, not the app. You have been signed out."
              : "Use the same account you use on the web.";

  const codeInput = (
    <>
      <Text style={styles.label}>6-digit code</Text>
      <TextInput style={[styles.input, styles.code]} value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} autoComplete="one-time-code" textContentType="oneTimeCode" accessibilityLabel="6-digit code" />
    </>
  );
  const primary = (label: string, enabled: boolean, onPress: () => void) => (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: !enabled || busy, busy }} style={[styles.primary, (!enabled || busy) && styles.disabled]} disabled={!enabled || busy} onPress={onPress}>
      {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>{label}</Text>}
    </Pressable>
  );
  const ghost = (label: string, onPress: () => void) => (
    <Pressable accessibilityRole="button" disabled={busy} onPress={onPress} style={[styles.ghost, busy && styles.disabled]}>
      <Text style={styles.ghostText}>{label}</Text>
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.body} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {step !== "email" && (
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={back} style={styles.back}>
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
            {primary("Continue", Boolean(email.trim()), () => go("password"))}
            {email.trim() ? ghost("Email me a code", () => void requestCode()) : null}
          </>
        )}

        {step === "password" && (
          <>
            <Text style={styles.label}>Password</Text>
            <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" textContentType="password" accessibilityLabel="Password" />
            {primary("Sign in", Boolean(password), () => void submitPassword())}
            {ghost("Forgot password?", () => void forgotPassword())}
            {ghost("Email me a code instead", () => void requestCode())}
          </>
        )}

        {step === "new_device" && (
          <>
            {codeInput}
            {primary("Verify", codeReady, () => void submitNewDevice())}
            {ghost("Send a new code", () => void submitPassword(true))}
          </>
        )}

        {step === "email_code" && (
          <>
            {codeInput}
            {primary("Sign in", codeReady, () => void submitEmailCode())}
            {ghost("Send a new code", () => void requestCode(true))}
          </>
        )}

        {step === "set_password" && (
          <>
            {codeInput}
            <Text style={styles.label}>New password</Text>
            <TextInput style={styles.input} value={newPassword} onChangeText={setNewPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" accessibilityLabel="New password" />
            <Text style={styles.footerHint}>At least {MIN_PASSWORD} characters.</Text>
            {primary("Set password and sign in", codeReady && newPassword.length >= MIN_PASSWORD, () => void submitNewPassword())}
            {ghost("Send a new code", () => void resendResetCode())}
          </>
        )}

        {step === "super_admin" && (
          <Pressable accessibilityRole="link" style={styles.primary} onPress={() => void Linking.openURL(`${config.webUrl}/admin/sign-in`)}>
            <Text style={styles.primaryText}>Open web dashboard</Text>
          </Pressable>
        )}

        {notice && <Text style={styles.notice} accessibilityRole="alert">{notice}</Text>}
        {formError && <Text style={styles.error} accessibilityRole="alert">{formError}</Text>}

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            New to WBMSG?{" "}
            <Text style={styles.link} accessibilityRole="link" onPress={() => void Linking.openURL(`${config.webUrl}/sign-up`)}>Create an account on the web</Text>
          </Text>
          <Text style={styles.footerHint}>Same login as the web dashboard</Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
