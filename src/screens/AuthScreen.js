import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  completeEmailHunterRegistration,
  getAuthErrorMessage,
  signInHunterWithEmail,
  signInHunterWithGoogle,
  startEmailHunterRegistration,
} from "../lib/auth";
import { backendConfig } from "../lib/backend";
import { hasFirebaseConfig } from "../lib/firebase";
import { colors, spacing } from "../theme";

WebBrowser.maybeCompleteAuthSession();

const googleClientIds = {
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
};

function getPlatformGoogleClientId() {
  return Platform.select({
    ios: googleClientIds.iosClientId || googleClientIds.webClientId,
    android: googleClientIds.androidClientId || googleClientIds.webClientId,
    default: googleClientIds.webClientId,
  });
}

function GoogleAuthButton({ disabled, mode, onError, onTokens }) {
  const platformClientId = getPlatformGoogleClientId();
  const [request, response, promptAsync] = Google.useAuthRequest({
    clientId: platformClientId,
    webClientId: googleClientIds.webClientId,
    iosClientId: googleClientIds.iosClientId,
    androidClientId: googleClientIds.androidClientId,
    scopes: ["openid", "profile", "email"],
    selectAccount: true,
  });

  useEffect(() => {
    if (!response) {
      return;
    }

    if (response.type === "success") {
      onTokens({
        accessToken:
          response.authentication?.accessToken || response.params.access_token,
        idToken: response.authentication?.idToken || response.params.id_token,
      });
      return;
    }

    if (response.type === "error") {
      onError("Die Anmeldung mit Google ist fehlgeschlagen.");
    }
  }, [onError, onTokens, response]);

  return (
    <Pressable
      disabled={disabled || !request}
      onPress={() => promptAsync()}
      style={({ pressed }) => [
        styles.googleButton,
        pressed ? styles.buttonPressed : null,
        disabled || !request ? styles.disabledButton : null,
      ]}
    >
      <Text style={styles.googleMark}>G</Text>
      <Text style={styles.googleButtonText}>
        {mode === "login"
          ? "Mit Google anmelden"
          : "Mit Google registrieren"}
      </Text>
    </Pressable>
  );
}

function Feedback({ error, info }) {
  if (!error && !info) {
    return null;
  }

  return (
    <View style={[styles.feedback, error ? styles.errorBox : styles.infoBox]}>
      <Text style={[styles.feedbackText, error ? styles.errorText : styles.infoText]}>
        {error || info}
      </Text>
    </View>
  );
}

export default function AuthScreen({ authMessage, onClearAuthMessage }) {
  const [mode, setMode] = useState("login");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [pendingRegistration, setPendingRegistration] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const platformGoogleClientId = getPlatformGoogleClientId();
  const googleAvailable = Boolean(platformGoogleClientId);
  const isRegister = mode === "register";
  const isVerifyingEmail = Boolean(pendingRegistration);

  const visibleError = error || authMessage || "";

  const resetFeedback = useCallback(() => {
    setError("");
    setInfo("");
    onClearAuthMessage?.();
  }, [onClearAuthMessage]);

  const switchMode = useCallback(
    (nextMode) => {
      setMode(nextMode);
      setPendingRegistration(null);
      setVerificationCode("");
      resetFeedback();
    },
    [resetFeedback]
  );

  const handleEmailSubmit = useCallback(async () => {
    resetFeedback();
    setLoading(true);

    try {
      if (isVerifyingEmail) {
        await completeEmailHunterRegistration({
          ...pendingRegistration,
          code: verificationCode,
        });
        return;
      }

      if (isRegister) {
        const registration = await startEmailHunterRegistration({
          displayName,
          email,
          password,
          acceptedTerms,
        });
        setPendingRegistration({ ...registration, password });
        setInfo("Der 6-stellige Bestätigungscode wurde per E-Mail gesendet.");
        return;
      }

      await signInHunterWithEmail({ email, password });
    } catch (caughtError) {
      setError(getAuthErrorMessage(caughtError));
    } finally {
      setLoading(false);
    }
  }, [
    acceptedTerms,
    displayName,
    email,
    isRegister,
    isVerifyingEmail,
    password,
    pendingRegistration,
    resetFeedback,
    verificationCode,
  ]);

  const handleGoogleTokens = useCallback(
    async (tokens) => {
      resetFeedback();
      setLoading(true);

      try {
        await signInHunterWithGoogle({
          ...tokens,
          mode,
          acceptedTerms,
        });
      } catch (caughtError) {
        if (caughtError?.code === "auth/google-account-not-registered") {
          setMode("register");
          setError(
            "Dieses Google-Konto ist noch nicht registriert. Fahre bitte mit der Registrierung fort."
          );
        } else {
          setError(getAuthErrorMessage(caughtError));
        }
      } finally {
        setLoading(false);
      }
    },
    [acceptedTerms, mode, resetFeedback]
  );

  const submitLabel = useMemo(() => {
    if (isVerifyingEmail) {
      return "Code bestätigen";
    }
    return isRegister ? "Code per E-Mail anfordern" : "Mit E-Mail anmelden";
  }, [isRegister, isVerifyingEmail]);

  const openTerms = useCallback(() => {
    Linking.openURL(`${backendConfig.siteUrl}/terms`).catch(() => {});
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Image
              source={require("../../assets/icon.png")}
              resizeMode="contain"
              style={styles.logo}
            />
            <Text style={styles.title}>Shop Hunter</Text>
            <Text style={styles.subtitle}>Zugang nur für Hunter</Text>
          </View>

          <View style={styles.segmentedControl}>
            <Pressable
              onPress={() => switchMode("login")}
              style={[styles.segment, mode === "login" ? styles.segmentActive : null]}
            >
              <Text
                style={[
                  styles.segmentText,
                  mode === "login" ? styles.segmentTextActive : null,
                ]}
              >
                Anmelden
              </Text>
            </Pressable>
            <Pressable
              onPress={() => switchMode("register")}
              style={[
                styles.segment,
                mode === "register" ? styles.segmentActive : null,
              ]}
            >
              <Text
                style={[
                  styles.segmentText,
                  mode === "register" ? styles.segmentTextActive : null,
                ]}
              >
                Registrieren
              </Text>
            </Pressable>
          </View>

          <Feedback error={visibleError} info={info} />

          {!hasFirebaseConfig ? (
            <Feedback error="Die Firebase-Konfiguration ist unvollständig." />
          ) : null}

          {isRegister && !isVerifyingEmail ? (
            <TextInput
              autoCapitalize="words"
              editable={!loading}
              onChangeText={setDisplayName}
              placeholder="Anzeigename"
              placeholderTextColor="#94A3B8"
              style={styles.input}
              value={displayName}
            />
          ) : null}

          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            editable={!loading && !isVerifyingEmail}
            keyboardType="email-address"
            onChangeText={setEmail}
            placeholder="E-Mail"
            placeholderTextColor="#94A3B8"
            style={styles.input}
            textContentType="emailAddress"
            value={email}
          />

          <TextInput
            editable={!loading && !isVerifyingEmail}
            onChangeText={setPassword}
            placeholder="Passwort"
            placeholderTextColor="#94A3B8"
            secureTextEntry
            style={styles.input}
            textContentType={isRegister ? "newPassword" : "password"}
            value={password}
          />

          {isVerifyingEmail ? (
            <TextInput
              editable={!loading}
              keyboardType="number-pad"
              maxLength={6}
              onChangeText={setVerificationCode}
              placeholder="6-stelliger Code"
              placeholderTextColor="#94A3B8"
              style={styles.input}
              textAlign="center"
              value={verificationCode}
            />
          ) : null}

          {isRegister && !isVerifyingEmail ? (
            <Pressable
              disabled={loading}
              onPress={() => setAcceptedTerms((value) => !value)}
              style={styles.termsRow}
            >
              <View
                style={[
                  styles.checkbox,
                  acceptedTerms ? styles.checkboxChecked : null,
                ]}
              >
                {acceptedTerms ? <Text style={styles.checkboxMark}>✓</Text> : null}
              </View>
              <Text style={styles.termsText}>
                Ich akzeptiere die Nutzungsbedingungen.
                <Text onPress={openTerms} style={styles.termsLink}>
                  {" "}
                  Bedingungen ansehen
                </Text>
              </Text>
            </Pressable>
          ) : null}

          <Pressable
            disabled={loading || !hasFirebaseConfig}
            onPress={handleEmailSubmit}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed ? styles.buttonPressed : null,
              loading || !hasFirebaseConfig ? styles.disabledButton : null,
            ]}
          >
            {loading ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.primaryButtonText}>{submitLabel}</Text>
            )}
          </Pressable>

          {!isVerifyingEmail ? (
            <>
              <View style={styles.dividerRow}>
                <View style={styles.divider} />
                <Text style={styles.dividerText}>oder</Text>
                <View style={styles.divider} />
              </View>

              {googleAvailable ? (
                <GoogleAuthButton
                  disabled={loading || (isRegister && !acceptedTerms)}
                  mode={mode}
                  onError={setError}
                  onTokens={handleGoogleTokens}
                />
              ) : (
                <View style={styles.googleMissing}>
                  <Text style={styles.googleMissingText}>
                    Für diese Plattform ist keine Google-Client-ID konfiguriert.
                  </Text>
                </View>
              )}
            </>
          ) : null}

          {isVerifyingEmail ? (
            <Pressable
              disabled={loading}
              onPress={() => {
                setPendingRegistration(null);
                setVerificationCode("");
                setInfo("");
              }}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>E-Mail bearbeiten</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.appBg,
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    padding: spacing.pageX,
  },
  header: {
    alignItems: "center",
    marginBottom: 24,
  },
  logo: {
    backgroundColor: colors.white,
    borderColor: colors.inkBorder,
    borderRadius: 8,
    borderWidth: 1,
    height: 76,
    width: 76,
  },
  title: {
    color: colors.inkText,
    fontSize: 30,
    fontWeight: "900",
    marginTop: 14,
    textAlign: "center",
  },
  subtitle: {
    color: colors.inkMuted,
    fontSize: 15,
    fontWeight: "700",
    marginTop: 6,
    textAlign: "center",
  },
  segmentedControl: {
    backgroundColor: "#EAF1FF",
    borderColor: "rgba(37,99,235,0.15)",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    marginBottom: 16,
    padding: 5,
  },
  segment: {
    alignItems: "center",
    borderRadius: 7,
    flex: 1,
    paddingVertical: 11,
  },
  segmentActive: {
    backgroundColor: colors.white,
  },
  segmentText: {
    color: colors.inkMuted,
    fontSize: 14,
    fontWeight: "900",
  },
  segmentTextActive: {
    color: colors.brandPrimary,
  },
  input: {
    backgroundColor: colors.white,
    borderColor: colors.inkBorder,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.inkText,
    fontSize: 15,
    fontWeight: "700",
    marginTop: 12,
    minHeight: 52,
    paddingHorizontal: 14,
  },
  termsRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  checkbox: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: colors.inkBorder,
    borderRadius: 6,
    borderWidth: 1,
    height: 24,
    justifyContent: "center",
    width: 24,
  },
  checkboxChecked: {
    backgroundColor: colors.brandPrimary,
    borderColor: colors.brandPrimary,
  },
  checkboxMark: {
    color: colors.white,
    fontSize: 14,
    fontWeight: "900",
  },
  termsText: {
    color: colors.inkText,
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 22,
    textAlign: "left",
  },
  termsLink: {
    color: colors.brandPrimary,
    fontWeight: "900",
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.brandPrimary,
    borderRadius: 8,
    justifyContent: "center",
    marginTop: 18,
    minHeight: 52,
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: "900",
  },
  secondaryButton: {
    alignItems: "center",
    marginTop: 14,
    paddingVertical: 12,
  },
  secondaryButtonText: {
    color: colors.brandPrimary,
    fontSize: 14,
    fontWeight: "900",
  },
  googleButton: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: colors.inkBorder,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    minHeight: 52,
  },
  googleMark: {
    color: colors.brandAccent,
    fontSize: 18,
    fontWeight: "900",
  },
  googleButtonText: {
    color: colors.inkText,
    fontSize: 15,
    fontWeight: "900",
  },
  buttonPressed: {
    opacity: 0.78,
  },
  disabledButton: {
    opacity: 0.45,
  },
  dividerRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    marginVertical: 18,
  },
  divider: {
    backgroundColor: colors.inkBorder,
    flex: 1,
    height: 1,
  },
  dividerText: {
    color: colors.inkMuted,
    fontSize: 12,
    fontWeight: "900",
  },
  feedback: {
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 4,
    padding: 12,
  },
  errorBox: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FCA5A5",
  },
  infoBox: {
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE",
  },
  feedbackText: {
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 21,
    textAlign: "left",
  },
  errorText: {
    color: "#B91C1C",
  },
  infoText: {
    color: colors.brandPrimaryDark,
  },
  googleMissing: {
    backgroundColor: "#FFF7ED",
    borderColor: "rgba(249,115,22,0.28)",
    borderRadius: 8,
    borderWidth: 1,
    padding: 13,
  },
  googleMissingText: {
    color: colors.brandAccent,
    fontSize: 13,
    fontWeight: "800",
    textAlign: "left",
  },
});
