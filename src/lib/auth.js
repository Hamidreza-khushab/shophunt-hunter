import {
  createUserWithEmailAndPassword,
  deleteUser,
  fetchSignInMethodsForEmail,
  getAdditionalUserInfo,
  GoogleAuthProvider,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { firebaseAuth, firestoreDb, hasFirebaseConfig } from "./firebase";
import {
  startHunterEmailVerification,
  verifyHunterEmailCode,
} from "./backend";

export const HUNTER_ROLE = "hunter";

const disposableEmailDomains = new Set([
  "10minutemail.com",
  "guerrillamail.com",
  "mailinator.com",
  "tempmail.com",
  "temp-mail.org",
  "yopmail.com",
]);

export class AuthFlowError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

export function validateSecureEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  const emailParts = normalizedEmail.split("@");

  if (
    emailParts.length !== 2 ||
    !/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(
      normalizedEmail
    )
  ) {
    throw new AuthFlowError(
      "auth/invalid-email",
      "Gib eine gültige E-Mail-Adresse ein."
    );
  }

  const domain = emailParts[1];
  if (disposableEmailDomains.has(domain)) {
    throw new AuthFlowError(
      "auth/disposable-email",
      "Für die Registrierung ist keine temporäre oder unsichere E-Mail-Adresse erlaubt."
    );
  }

  return normalizedEmail;
}

export function validatePassword(password) {
  if (password.length < 8) {
    throw new AuthFlowError(
      "auth/weak-password",
      "Das Passwort muss mindestens 8 Zeichen lang sein."
    );
  }

  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new AuthFlowError(
      "auth/weak-password",
      "Das Passwort muss mindestens einen Buchstaben und eine Zahl enthalten."
    );
  }
}

function requireFirebaseServices() {
  if (!hasFirebaseConfig || !firebaseAuth || !firestoreDb) {
    throw new AuthFlowError(
      "auth/missing-config",
      "Die Firebase-Konfiguration ist unvollständig."
    );
  }
}

function hunterProfileRef(uid) {
  return doc(firestoreDb, "users", uid);
}

export async function getHunterProfile(uid) {
  requireFirebaseServices();
  const profileSnapshot = await getDoc(hunterProfileRef(uid));
  return profileSnapshot.exists() ? profileSnapshot.data() : null;
}

export async function assertHunterAccess(user) {
  const profile = await getHunterProfile(user.uid);

  if (!profile || profile.role !== HUNTER_ROLE) {
    throw new AuthFlowError(
      "auth/not-hunter",
      "Dieses Konto ist für die Hunter-App nicht zugelassen."
    );
  }

  if (profile.accountStatus === "blocked") {
    throw new AuthFlowError(
      "auth/account-blocked",
      "Der Zugriff auf dieses Konto wurde gesperrt."
    );
  }

  return profile;
}

async function createHunterProfile(user, options) {
  requireFirebaseServices();

  const profileRef = hunterProfileRef(user.uid);
  const profileSnapshot = await getDoc(profileRef);

  if (profileSnapshot.exists()) {
    const profile = profileSnapshot.data();
    if (profile.role !== HUNTER_ROLE) {
      throw new AuthFlowError(
        "auth/not-hunter",
        "Diese E-Mail-Adresse wurde bereits für eine andere Rolle registriert."
      );
    }

    await updateDoc(profileRef, {
      lastLoginAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return profile;
  }

  const profile = {
    uid: user.uid,
    email: normalizeEmail(user.email || options.email),
    displayName: options.displayName || user.displayName || "",
    photoURL: user.photoURL || null,
    role: HUNTER_ROLE,
    allowedApps: [HUNTER_ROLE],
    accountStatus: "active",
    emailVerified: true,
    emailVerifiedBy: options.emailVerifiedBy,
    authProvider: options.authProvider,
    termsAccepted: true,
    termsAcceptedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastLoginAt: serverTimestamp(),
  };

  await setDoc(profileRef, profile);
  return profile;
}

async function emailExists(email) {
  try {
    const methods = await fetchSignInMethodsForEmail(firebaseAuth, email);
    return methods.length > 0;
  } catch {
    return false;
  }
}

export async function startEmailHunterRegistration({
  displayName,
  email,
  password,
  acceptedTerms,
}) {
  requireFirebaseServices();
  const normalizedEmail = validateSecureEmail(email);
  validatePassword(password);

  if (!acceptedTerms) {
    throw new AuthFlowError(
      "auth/terms-required",
      "Für die Registrierung musst du die Nutzungsbedingungen akzeptieren."
    );
  }

  if (await emailExists(normalizedEmail)) {
    throw new AuthFlowError(
      "auth/email-already-in-use",
      "Diese E-Mail-Adresse ist bereits registriert. Nutze bitte die Anmeldung."
    );
  }

  const verification = await startHunterEmailVerification(normalizedEmail);
  return {
    email: normalizedEmail,
    displayName: displayName.trim(),
    verificationId: verification.verificationId || verification.id,
  };
}

export async function completeEmailHunterRegistration({
  displayName,
  email,
  password,
  verificationId,
  code,
}) {
  requireFirebaseServices();
  const normalizedEmail = validateSecureEmail(email);
  validatePassword(password);

  if (!/^\d{6}$/.test(code.trim())) {
    throw new AuthFlowError(
      "auth/invalid-code",
      "Der Bestätigungscode muss sechsstellig sein."
    );
  }

  await verifyHunterEmailCode({
    email: normalizedEmail,
    verificationId,
    code: code.trim(),
  });

  const credential = await createUserWithEmailAndPassword(
    firebaseAuth,
    normalizedEmail,
    password
  );

  try {
    if (displayName.trim()) {
      await updateProfile(credential.user, { displayName: displayName.trim() });
    }

    await createHunterProfile(credential.user, {
      email: normalizedEmail,
      displayName: displayName.trim(),
      authProvider: "password",
      emailVerifiedBy: "six_digit_code",
    });
  } catch (error) {
    await deleteUser(credential.user).catch(() => {});
    await signOut(firebaseAuth).catch(() => {});
    throw error;
  }

  return credential.user;
}

export async function signInHunterWithEmail({ email, password }) {
  requireFirebaseServices();
  const normalizedEmail = validateSecureEmail(email);
  const credential = await signInWithEmailAndPassword(
    firebaseAuth,
    normalizedEmail,
    password
  );

  try {
    await assertHunterAccess(credential.user);
  } catch (error) {
    await signOut(firebaseAuth).catch(() => {});
    throw error;
  }

  return credential.user;
}

async function getGoogleProfile(accessToken) {
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new AuthFlowError(
      "auth/google-profile-failed",
      "Die Google-Kontodaten konnten nicht geladen werden."
    );
  }

  return response.json();
}

export async function signInHunterWithGoogle({
  accessToken,
  idToken,
  mode,
  acceptedTerms,
}) {
  requireFirebaseServices();

  if (mode === "register" && !acceptedTerms) {
    throw new AuthFlowError(
      "auth/terms-required",
      "Für die Registrierung mit Google musst du die Nutzungsbedingungen akzeptieren."
    );
  }

  if (!accessToken && !idToken) {
    throw new AuthFlowError(
      "auth/google-token-missing",
      "Es wurde kein Google-Token empfangen."
    );
  }

  const googleProfile = accessToken ? await getGoogleProfile(accessToken) : {};
  const email = googleProfile.email ? validateSecureEmail(googleProfile.email) : "";
  const credential = GoogleAuthProvider.credential(idToken, accessToken);
  const userCredential = await signInWithCredential(firebaseAuth, credential);
  const additionalInfo = getAdditionalUserInfo(userCredential);

  try {
    if (mode === "login") {
      if (additionalInfo?.isNewUser) {
        await deleteUser(userCredential.user).catch(() => {});
        await signOut(firebaseAuth).catch(() => {});
        throw new AuthFlowError(
          "auth/google-account-not-registered",
          "Dieses Google-Konto ist noch nicht registriert."
        );
      }

      await assertHunterAccess(userCredential.user);
      return userCredential.user;
    }

    if (!additionalInfo?.isNewUser) {
      await signOut(firebaseAuth).catch(() => {});
      throw new AuthFlowError(
        "auth/email-already-in-use",
        "Dieses Konto ist bereits registriert. Nutze bitte die Anmeldung."
      );
    }

    await createHunterProfile(userCredential.user, {
      email,
      displayName: googleProfile.name || userCredential.user.displayName || "",
      authProvider: "google.com",
      emailVerifiedBy: "google",
    });

    return userCredential.user;
  } catch (error) {
    if (error.code !== "auth/google-account-not-registered") {
      await signOut(firebaseAuth).catch(() => {});
    }
    throw error;
  }
}

export async function signOutHunter() {
  requireFirebaseServices();
  await signOut(firebaseAuth);
}

export function getAuthErrorMessage(error) {
  if (error instanceof AuthFlowError) {
    return error.message;
  }

  switch (error?.code) {
    case "auth/email-already-in-use":
      return "Diese E-Mail-Adresse ist bereits registriert.";
    case "auth/invalid-credential":
    case "auth/user-not-found":
    case "auth/wrong-password":
      return "E-Mail-Adresse oder Passwort ist nicht korrekt.";
    case "auth/account-exists-with-different-credential":
      return "Diese E-Mail-Adresse wurde mit einer anderen Anmeldemethode registriert.";
    case "auth/network-request-failed":
      return "Die Netzwerkverbindung ist fehlgeschlagen.";
    default:
      return error?.message || "Die Authentifizierung ist fehlgeschlagen.";
  }
}
