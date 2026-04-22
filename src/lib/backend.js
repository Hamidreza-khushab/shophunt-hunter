export const backendConfig = {
  siteUrl: trimTrailingSlash(
    process.env.EXPO_PUBLIC_SITE_URL || "https://www.shophunt.de"
  ),
  authApiBaseUrl: trimTrailingSlash(
    process.env.EXPO_PUBLIC_AUTH_API_URL ||
      process.env.EXPO_PUBLIC_SITE_URL ||
      "https://www.shophunt.de"
  ),
};

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

async function postBackendJson(path, body) {
  const response = await fetch(`${backendConfig.authApiBaseUrl}${path}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: "Die Serverantwort ist ungültig." };
  }

  if (!response.ok) {
    const error = new Error(
      data.message || "Die Anfrage an den Server ist fehlgeschlagen."
    );
    error.code = data.code || "backend/request-failed";
    error.status = response.status;
    throw error;
  }

  return data;
}

export function startHunterEmailVerification(email) {
  return postBackendJson("/api/hunter-auth/email-verification/start", {
    email,
    role: "hunter",
  });
}

export function verifyHunterEmailCode({ email, verificationId, code }) {
  return postBackendJson("/api/hunter-auth/email-verification/verify", {
    email,
    verificationId,
    code,
    role: "hunter",
  });
}
