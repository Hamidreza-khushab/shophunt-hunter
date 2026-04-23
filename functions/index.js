const { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } = require("node:crypto");
const admin = require("firebase-admin");
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const nodemailer = require("nodemailer");

admin.initializeApp();

const db = admin.firestore();
const fieldValue = admin.firestore.FieldValue;
const timestamp = admin.firestore.Timestamp;

const smtpUser = defineSecret("SMTP_USER");
const smtpPass = defineSecret("SMTP_PASS");

const CODE_LENGTH = 6;
const CODE_TTL_MINUTES = 10;
const VERIFIED_TTL_MINUTES = 15;
const MIN_SEND_INTERVAL_MS = 60 * 1000;
const SEND_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const MAX_SENDS_PER_WINDOW = 5;
const MAX_IP_SENDS_PER_WINDOW = 30;
const MAX_VERIFY_ATTEMPTS = 5;
const PUBLIC_CAMPAIGN_STATUSES = ["published", "scheduled"];
const MAX_PUBLIC_CAMPAIGNS = 100;
const DEFAULT_NEARBY_DISTANCE_METERS = 25000;
const STORY_ADS_SUBCOLLECTION = "storyAds";
const PUBLIC_STORY_STATUS = "published";
const MAX_PUBLIC_STORIES = 30;

const disposableEmailDomains = new Set([
  "10minutemail.com",
  "guerrillamail.com",
  "mailinator.com",
  "tempmail.com",
  "temp-mail.org",
  "yopmail.com",
]);

let mailTransporter;

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function createHttpError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function validateHunterRole(role) {
  if (String(role || "hunter").trim().toLowerCase() !== "hunter") {
    throw createHttpError(403, "ROLE_NOT_ALLOWED", "Diese Registrierung ist nur für Hunter-Konten erlaubt.");
  }
}

function validateSecureEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  const emailParts = normalizedEmail.split("@");

  if (
    emailParts.length !== 2 ||
    !/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(normalizedEmail)
  ) {
    throw createHttpError(400, "INVALID_EMAIL", "Gib eine gültige E-Mail-Adresse ein.");
  }

  if (disposableEmailDomains.has(emailParts[1])) {
    throw createHttpError(
      400,
      "DISPOSABLE_EMAIL",
      "Für die Registrierung ist keine temporäre oder unsichere E-Mail-Adresse erlaubt."
    );
  }

  return normalizedEmail;
}

function getRequestBody(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  if (!req.rawBody) {
    return {};
  }

  try {
    return JSON.parse(req.rawBody.toString("utf8"));
  } catch {
    throw createHttpError(400, "INVALID_JSON", "Die Anfrage enthält kein gültiges JSON.");
  }
}

function applyCors(req, res) {
  const allowedOrigins = String(
    process.env.HUNTER_AUTH_ALLOWED_ORIGINS || "https://www.shophunt.de,https://shophunt.de"
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const origin = req.get("origin");

  if (origin && (allowedOrigins.includes("*") || allowedOrigins.includes(origin))) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
  }

  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.set("Access-Control-Max-Age", "3600");

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return true;
  }

  return false;
}

function getRequestPath(req) {
  const rawUrl = req.originalUrl || req.url || "/";
  const path = rawUrl.split("?")[0];
  return path.replace(/^\/hunterAuth/, "");
}

function createVerificationCode() {
  return randomInt(0, 10 ** CODE_LENGTH).toString().padStart(CODE_LENGTH, "0");
}

function hashStableKey(value) {
  return createHash("sha256").update(String(value || "unknown")).digest("hex");
}

function getClientLimitKey(req) {
  const forwardedFor = String(req.get("x-forwarded-for") || "")
    .split(",")[0]
    .trim();
  const ip = forwardedFor || String(req.ip || req.socket?.remoteAddress || "unknown").trim();
  return hashStableKey(ip || "unknown");
}

function hashCode(code, salt) {
  return createHash("sha256").update(`${salt}:${code}`).digest("hex");
}

function compareHash(expectedHash, actualHash) {
  const expectedBuffer = Buffer.from(String(expectedHash || ""), "hex");
  const actualBuffer = Buffer.from(String(actualHash || ""), "hex");

  if (expectedBuffer.length === 0 || expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
}

function getMillis(value) {
  if (value && typeof value.toMillis === "function") {
    return value.toMillis();
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  return 0;
}

function getMailConfig() {
  const host = String(process.env.SMTP_HOST || "smtp-relay.brevo.com").trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const secure =
    String(process.env.SMTP_SECURE || "").trim().toLowerCase() === "true" || port === 465;
  const user = String(getSecretValue(smtpUser, "SMTP_USER")).trim();
  const pass = String(getSecretValue(smtpPass, "SMTP_PASS"));
  const fromEmail = String(process.env.WAITLIST_FROM_EMAIL || "info@shophunt.de").trim();
  const fromName = String(process.env.WAITLIST_FROM_NAME || "ShopHunt").trim() || "ShopHunt";
  const replyToEmail = String(process.env.WAITLIST_REPLY_TO_EMAIL || fromEmail).trim() || fromEmail;

  if (!host || !Number.isFinite(port) || port <= 0 || !user || !pass || !fromEmail) {
    throw createHttpError(500, "MAIL_CONFIG_MISSING", "Die E-Mail-Konfiguration ist unvollständig.");
  }

  return {
    host,
    port,
    secure,
    user,
    pass,
    fromEmail,
    fromName,
    replyToEmail,
  };
}

function getSecretValue(secret, fallbackEnvKey) {
  try {
    return secret.value() || process.env[fallbackEnvKey] || "";
  } catch {
    return process.env[fallbackEnvKey] || "";
  }
}

function getTransporter() {
  if (mailTransporter) {
    return mailTransporter;
  }

  const config = getMailConfig();

  mailTransporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    pool: true,
    maxConnections: 3,
    maxMessages: 100,
    name: "shophunt.de",
    requireTLS: !config.secure,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    tls: {
      servername: config.host,
    },
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });

  return mailTransporter;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function createVerificationMail(email, code) {
  const config = getMailConfig();
  const text = [
    "Hallo,",
    "",
    `Ihr ShopHunt Hunter Bestätigungscode lautet: ${code}`,
    `Der Code ist ${CODE_TTL_MINUTES} Minuten gültig.`,
    "",
    "Wenn Sie diese Registrierung nicht gestartet haben, ignorieren Sie diese E-Mail bitte.",
    "",
    "Beste Grüße",
    "ShopHunt",
  ].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937;">
      <p style="margin:0 0 12px;">Hallo,</p>
      <p style="margin:0 0 12px;">Ihr ShopHunt Hunter Bestätigungscode lautet:</p>
      <p style="margin:18px 0;font-size:30px;letter-spacing:4px;font-weight:700;color:#111827;">${escapeHtml(
        code
      )}</p>
      <p style="margin:0 0 12px;">Der Code ist ${CODE_TTL_MINUTES} Minuten gültig.</p>
      <p style="margin:0 0 12px;">Wenn Sie diese Registrierung nicht gestartet haben, ignorieren Sie diese E-Mail bitte.</p>
      <p style="margin:18px 0 0;">Beste Grüße<br />ShopHunt</p>
    </div>
  `;

  return {
    from: {
      name: config.fromName,
      address: config.fromEmail,
    },
    to: email,
    replyTo: config.replyToEmail,
    subject: "Ihr ShopHunt Hunter Bestätigungscode",
    text,
    html,
  };
}

async function sendMail(mailOptions) {
  const info = await getTransporter().sendMail(mailOptions);
  const accepted = Array.isArray(info.accepted) ? info.accepted : [];
  const rejected = Array.isArray(info.rejected) ? info.rejected : [];

  if (rejected.length > 0 || accepted.length === 0) {
    throw createHttpError(502, "MAIL_DELIVERY_FAILED", "Die E-Mail konnte nicht zugestellt werden.");
  }

  return {
    accepted,
    messageId: info.messageId || null,
  };
}

function verificationRef(email) {
  return db.collection("hunterEmailVerifications").doc(email);
}

async function startEmailVerification(body, req) {
  validateHunterRole(body.role);
  const email = validateSecureEmail(body.email);
  const ref = verificationRef(email);
  const ipLimitRef = db.collection("hunterEmailVerificationIpLimits").doc(getClientLimitKey(req));
  const now = Date.now();
  const code = createVerificationCode();
  const codeSalt = randomBytes(16).toString("hex");
  const verificationId = randomUUID();
  const expiresAt = timestamp.fromMillis(now + CODE_TTL_MINUTES * 60 * 1000);

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const ipLimitSnapshot = await transaction.get(ipLimitRef);
    const existing = snapshot.exists ? snapshot.data() || {} : {};
    const ipLimit = ipLimitSnapshot.exists ? ipLimitSnapshot.data() || {} : {};
    const lastSentAt = getMillis(existing.lastSentAt);
    const windowStartAt = getMillis(existing.sendWindowStartAt);
    const windowIsActive = windowStartAt > 0 && now - windowStartAt < SEND_LIMIT_WINDOW_MS;
    const sendCount = windowIsActive ? Number(existing.sendCount || 0) : 0;
    const ipWindowStartAt = getMillis(ipLimit.windowStartAt);
    const ipWindowIsActive = ipWindowStartAt > 0 && now - ipWindowStartAt < SEND_LIMIT_WINDOW_MS;
    const ipSendCount = ipWindowIsActive ? Number(ipLimit.sendCount || 0) : 0;

    if (lastSentAt > 0 && now - lastSentAt < MIN_SEND_INTERVAL_MS) {
      throw createHttpError(
        429,
        "EMAIL_RECENTLY_SENT",
        "Bitte warte kurz, bevor du einen neuen Code anforderst."
      );
    }

    if (windowIsActive && sendCount >= MAX_SENDS_PER_WINDOW) {
      throw createHttpError(
        429,
        "EMAIL_SEND_LIMIT_REACHED",
        "Für diese E-Mail-Adresse wurden zu viele Codes angefordert."
      );
    }

    if (ipWindowIsActive && ipSendCount >= MAX_IP_SENDS_PER_WINDOW) {
      throw createHttpError(
        429,
        "EMAIL_SEND_LIMIT_REACHED",
        "Von diesem Netzwerk wurden zu viele Codes angefordert."
      );
    }

    transaction.set(
      ref,
      {
        email,
        role: "hunter",
        verified: false,
        verificationId,
        codeHash: hashCode(code, codeSalt),
        codeSalt,
        attempts: 0,
        maxAttempts: MAX_VERIFY_ATTEMPTS,
        expiresAt,
        sendWindowStartAt: windowIsActive
          ? existing.sendWindowStartAt
          : timestamp.fromMillis(now),
        sendCount: windowIsActive ? sendCount + 1 : 1,
        lastSentAt: fieldValue.serverTimestamp(),
        createdAt: existing.createdAt || fieldValue.serverTimestamp(),
        updatedAt: fieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    transaction.set(
      ipLimitRef,
      {
        windowStartAt: ipWindowIsActive ? ipLimit.windowStartAt : timestamp.fromMillis(now),
        sendCount: ipWindowIsActive ? ipSendCount + 1 : 1,
        updatedAt: fieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });

  try {
    const delivery = await sendMail(createVerificationMail(email, code));
    await ref.set(
      {
        deliveryStatus: "sent",
        emailSentAt: fieldValue.serverTimestamp(),
        messageId: delivery.messageId,
        updatedAt: fieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  } catch (error) {
    await ref.set(
      {
        deliveryStatus: "failed",
        deliveryErrorCode: error.code || "MAIL_DELIVERY_FAILED",
        updatedAt: fieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    throw error;
  }

  return {
    ok: true,
    verificationId,
    expiresInMinutes: CODE_TTL_MINUTES,
  };
}

async function verifyEmailCode(body) {
  validateHunterRole(body.role);
  const email = validateSecureEmail(body.email);
  const verificationId = String(body.verificationId || "").trim();
  const code = String(body.code || "").trim();

  if (!verificationId) {
    throw createHttpError(400, "VERIFICATION_ID_REQUIRED", "Die Verifizierung ist unvollständig.");
  }

  if (!/^\d{6}$/.test(code)) {
    throw createHttpError(400, "INVALID_CODE", "Der Bestätigungscode muss sechsstellig sein.");
  }

  const ref = verificationRef(email);
  const now = Date.now();

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);

    if (!snapshot.exists) {
      throw createHttpError(404, "VERIFICATION_NOT_FOUND", "Für diese E-Mail-Adresse wurde kein Code gefunden.");
    }

    const data = snapshot.data() || {};

    if (data.role !== "hunter" || data.verificationId !== verificationId) {
      throw createHttpError(400, "VERIFICATION_MISMATCH", "Der Bestätigungscode passt nicht zu dieser Anfrage.");
    }

    if (getMillis(data.expiresAt) <= now) {
      throw createHttpError(410, "VERIFICATION_EXPIRED", "Der Bestätigungscode ist abgelaufen.");
    }

    if (data.verified === true) {
      return;
    }

    const attempts = Number(data.attempts || 0);
    const maxAttempts = Number(data.maxAttempts || MAX_VERIFY_ATTEMPTS);

    if (attempts >= maxAttempts) {
      throw createHttpError(429, "VERIFICATION_LOCKED", "Zu viele Fehlversuche. Bitte fordere einen neuen Code an.");
    }

    if (!data.codeHash || !data.codeSalt) {
      throw createHttpError(500, "VERIFICATION_SECRET_MISSING", "Die Verifizierung ist serverseitig unvollständig.");
    }

    const actualHash = hashCode(code, data.codeSalt);

    if (!compareHash(data.codeHash, actualHash)) {
      transaction.update(ref, {
        attempts: attempts + 1,
        lastAttemptAt: fieldValue.serverTimestamp(),
        updatedAt: fieldValue.serverTimestamp(),
      });
      throw createHttpError(400, "VERIFICATION_CODE_MISMATCH", "Der eingegebene Code ist nicht korrekt.");
    }

    transaction.update(ref, {
      verified: true,
      verifiedAt: fieldValue.serverTimestamp(),
      expiresAt: timestamp.fromMillis(now + VERIFIED_TTL_MINUTES * 60 * 1000),
      codeHash: fieldValue.delete(),
      codeSalt: fieldValue.delete(),
      attempts: fieldValue.delete(),
      maxAttempts: fieldValue.delete(),
      updatedAt: fieldValue.serverTimestamp(),
    });
  });

  return {
    ok: true,
    verified: true,
  };
}

function getBearerToken(req) {
  const header = String(req.get("authorization") || "").trim();

  if (!header.toLowerCase().startsWith("bearer ")) {
    throw createHttpError(401, "AUTH_TOKEN_REQUIRED", "Die Anmeldung ist erforderlich.");
  }

  const token = header.slice(7).trim();

  if (!token) {
    throw createHttpError(401, "AUTH_TOKEN_REQUIRED", "Die Anmeldung ist erforderlich.");
  }

  return token;
}

async function getDecodedAuthToken(req) {
  try {
    return await admin.auth().verifyIdToken(getBearerToken(req));
  } catch {
    throw createHttpError(401, "AUTH_TOKEN_INVALID", "Die Sitzung ist abgelaufen. Bitte melde dich erneut an.");
  }
}

function cleanProfileString(value, maxLength = 120) {
  return String(value || "").trim().slice(0, maxLength);
}

async function assertRecentPasswordVerification(email) {
  const snapshot = await verificationRef(email).get();
  const data = snapshot.exists ? snapshot.data() || {} : {};

  if (
    data.verified !== true ||
    data.role !== "hunter" ||
    getMillis(data.expiresAt) <= Date.now()
  ) {
    throw createHttpError(403, "EMAIL_VERIFICATION_REQUIRED", "Die E-Mail-Adresse wurde nicht bestätigt.");
  }
}

function getAuthProvider(decodedToken) {
  return String(decodedToken.firebase?.sign_in_provider || "").trim();
}

function publicHunterProfile(profile) {
  return {
    uid: profile.uid,
    email: profile.email,
    displayName: profile.displayName || "",
    photoURL: profile.photoURL || null,
    role: profile.role,
    allowedApps: profile.allowedApps || ["hunter"],
    accountStatus: profile.accountStatus || "active",
    authProvider: profile.authProvider,
  };
}

function cleanPublicString(value, maxLength = 240) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizePublicNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeRadiusMeters(value) {
  const radius = Number.parseInt(String(value || 40), 10);

  if (!Number.isFinite(radius) || radius < 1) {
    return 40;
  }

  return Math.min(500, Math.max(10, radius));
}

function normalizeCampaignPoint(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const latitude = normalizePublicNumber(value.latitude);
  const longitude = normalizePublicNumber(value.longitude);

  if (
    latitude === null ||
    longitude === null ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  return {
    latitude: Number(latitude.toFixed(7)),
    longitude: Number(longitude.toFixed(7)),
  };
}

function readDateMillis(value) {
  if (!value) {
    return null;
  }

  if (typeof value.toMillis === "function") {
    return value.toMillis();
  }

  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.getTime() : null;
  }

  if (typeof value === "string" && value.trim()) {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.getTime() : null;
  }

  return null;
}

function serializePublicDate(value) {
  const millis = readDateMillis(value);
  return millis === null ? null : new Date(millis).toISOString();
}

function isCampaignCurrentlyAvailable(data) {
  const status = cleanPublicString(data.status, 80).toLowerCase();

  if (!PUBLIC_CAMPAIGN_STATUSES.includes(status)) {
    return false;
  }

  const schedule =
    data.schedule && typeof data.schedule === "object" ? data.schedule : {};
  const now = Date.now();
  const startMs = readDateMillis(
    schedule.startAt || data.scheduledStartAt || data.publishedAt
  );
  const endMs = readDateMillis(schedule.endAt || data.scheduledEndAt);

  if (startMs !== null && now < startMs) {
    return false;
  }

  if (endMs !== null && now > endMs) {
    return false;
  }

  return true;
}

function normalizeRequestCenter(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  return normalizeCampaignPoint({
    latitude: value.latitude,
    longitude: value.longitude,
  });
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function calculateDistanceMeters(first, second) {
  if (!first || !second) {
    return null;
  }

  const earthRadiusMeters = 6371000;
  const latitudeDelta = toRadians(second.latitude - first.latitude);
  const longitudeDelta = toRadians(second.longitude - first.longitude);
  const firstLatitude = toRadians(first.latitude);
  const secondLatitude = toRadians(second.latitude);
  const a =
    Math.sin(latitudeDelta / 2) * Math.sin(latitudeDelta / 2) +
    Math.cos(firstLatitude) *
      Math.cos(secondLatitude) *
      Math.sin(longitudeDelta / 2) *
      Math.sin(longitudeDelta / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(earthRadiusMeters * c);
}

function serializePublicCampaign(doc, center) {
  const data = doc.data() || {};
  const huntLocation =
    data.huntLocation && typeof data.huntLocation === "object"
      ? data.huntLocation
      : {};
  const point = normalizeCampaignPoint(huntLocation.point);

  if (!point || !isCampaignCurrentlyAvailable(data)) {
    return null;
  }

  const distanceMeters = center ? calculateDistanceMeters(center, point) : null;
  const schedule =
    data.schedule && typeof data.schedule === "object" ? data.schedule : {};
  const customer =
    data.customer && typeof data.customer === "object" ? data.customer : {};

  return {
    id: doc.id,
    path: doc.ref.path,
    title: cleanPublicString(data.title, 120) || "ShopHunt Kampagne",
    type: cleanPublicString(data.type, 40),
    status: cleanPublicString(data.status, 40),
    radiusMeters: normalizeRadiusMeters(data.radiusMeters),
    distanceMeters,
    location: {
      latitude: point.latitude,
      longitude: point.longitude,
      label:
        cleanPublicString(huntLocation.formattedAddress, 500) ||
        cleanPublicString(huntLocation.displayName, 240) ||
        cleanPublicString(customer.companyName, 240),
    },
    customer: {
      companyName: cleanPublicString(customer.companyName, 240),
    },
    schedule: {
      startAt: serializePublicDate(schedule.startAt || data.scheduledStartAt),
      endAt: serializePublicDate(schedule.endAt || data.scheduledEndAt),
    },
  };
}

async function assertHunterProfileForRequest(req) {
  const decodedToken = await getDecodedAuthToken(req);
  const profileSnapshot = await db.collection("users").doc(decodedToken.uid).get();

  if (!profileSnapshot.exists) {
    throw createHttpError(403, "HUNTER_PROFILE_NOT_FOUND", "Dieses Konto ist fuer die Hunter-App nicht zugelassen.");
  }

  const profile = profileSnapshot.data() || {};

  if (profile.role !== "hunter") {
    throw createHttpError(403, "ROLE_NOT_ALLOWED", "Dieses Konto ist fuer die Hunter-App nicht zugelassen.");
  }

  if (profile.accountStatus === "blocked") {
    throw createHttpError(403, "ACCOUNT_BLOCKED", "Der Zugriff auf dieses Konto wurde gesperrt.");
  }

  return {
    uid: decodedToken.uid,
    profile,
  };
}

async function listPublicCampaignsForHunter(body, req) {
  await assertHunterProfileForRequest(req);

  const center = normalizeRequestCenter(body.center);
  const requestedMaxDistance = Number.parseInt(
    String(body.maxDistanceMeters || DEFAULT_NEARBY_DISTANCE_METERS),
    10
  );
  const maxDistanceMeters = Number.isFinite(requestedMaxDistance)
    ? Math.max(1000, Math.min(1000000, requestedMaxDistance))
    : DEFAULT_NEARBY_DISTANCE_METERS;
  const snapshot = await db.collectionGroup("campaigns").get();
  const campaigns = snapshot.docs
    .map((doc) => serializePublicCampaign(doc, center))
    .filter(Boolean)
    .filter((campaign) => {
      if (campaign.distanceMeters === null) {
        return true;
      }

      return campaign.distanceMeters <= maxDistanceMeters + campaign.radiusMeters;
    })
    .sort((first, second) => {
      if (first.distanceMeters === null && second.distanceMeters === null) {
        return first.title.localeCompare(second.title);
      }

      if (first.distanceMeters === null) {
        return 1;
      }

      if (second.distanceMeters === null) {
        return -1;
      }

      return first.distanceMeters - second.distanceMeters;
    })
    .slice(0, MAX_PUBLIC_CAMPAIGNS);

  return {
    ok: true,
    campaigns,
  };
}

function serializePublicStoryAd(doc) {
  const data = doc.data() || {};
  const media = data.media && typeof data.media === "object" ? data.media : {};
  const customer =
    data.customer && typeof data.customer === "object" ? data.customer : {};
  const previewUrl = cleanPublicString(media.previewUrl, 1200);

  if (cleanPublicString(data.status, 80).toLowerCase() !== PUBLIC_STORY_STATUS) {
    return null;
  }

  if (!previewUrl) {
    return null;
  }

  return {
    id: doc.id,
    path: doc.ref.path,
    description: cleanPublicString(data.description, 280),
    imageUrl: previewUrl,
    media: {
      previewUrl,
      width: normalizePublicNumber(media.width),
      height: normalizePublicNumber(media.height),
      name: cleanPublicString(media.name, 160),
    },
    customer: {
      uid: cleanPublicString(data.customerUid || customer.uid, 160),
      companyName:
        cleanPublicString(customer.companyName, 80) ||
        cleanPublicString(customer.fullName, 80) ||
        "Shop",
    },
    publishedAt: serializePublicDate(data.publishedAt),
  };
}

async function listPublicStoryAdsForHunter(body, req) {
  await assertHunterProfileForRequest(req);

  const requestedLimit = Number.parseInt(String(body.limit || MAX_PUBLIC_STORIES), 10);
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(MAX_PUBLIC_STORIES, requestedLimit))
    : MAX_PUBLIC_STORIES;
  const snapshot = await db.collectionGroup(STORY_ADS_SUBCOLLECTION).get();
  const stories = snapshot.docs
    .map(serializePublicStoryAd)
    .filter(Boolean)
    .sort((first, second) => {
      const firstTime = new Date(first.publishedAt || 0).getTime();
      const secondTime = new Date(second.publishedAt || 0).getTime();
      return secondTime - firstTime;
    })
    .slice(0, limit);

  return {
    ok: true,
    stories,
  };
}

async function readHunterProfileForRequest(req) {
  const decodedToken = await getDecodedAuthToken(req);
  const profileSnapshot = await db.collection("users").doc(decodedToken.uid).get();

  if (!profileSnapshot.exists) {
    throw createHttpError(403, "HUNTER_PROFILE_NOT_FOUND", "Dieses Konto ist für die Hunter-App nicht zugelassen.");
  }

  const profile = profileSnapshot.data() || {};

  if (profile.role !== "hunter") {
    throw createHttpError(403, "ROLE_NOT_ALLOWED", "Dieses Konto ist für die Hunter-App nicht zugelassen.");
  }

  if (profile.accountStatus === "blocked") {
    throw createHttpError(403, "ACCOUNT_BLOCKED", "Der Zugriff auf dieses Konto wurde gesperrt.");
  }

  await db.collection("users").doc(decodedToken.uid).set(
    {
      lastLoginAt: fieldValue.serverTimestamp(),
      updatedAt: fieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return {
    ok: true,
    profile: publicHunterProfile(profile),
  };
}

async function upsertHunterProfile(body, req) {
  validateHunterRole(body.role);

  const decodedToken = await getDecodedAuthToken(req);
  const uid = decodedToken.uid;
  const email = validateSecureEmail(decodedToken.email);
  const authProvider = getAuthProvider(decodedToken);

  if (!["password", "google.com"].includes(authProvider)) {
    throw createHttpError(403, "AUTH_PROVIDER_NOT_ALLOWED", "Diese Anmeldemethode ist für Hunter nicht erlaubt.");
  }

  if (authProvider === "password") {
    await assertRecentPasswordVerification(email);
  }

  if (authProvider === "google.com" && decodedToken.email_verified !== true) {
    throw createHttpError(403, "EMAIL_VERIFICATION_REQUIRED", "Die Google-E-Mail-Adresse wurde nicht bestätigt.");
  }

  if (body.termsAccepted !== true) {
    throw createHttpError(400, "TERMS_REQUIRED", "Für die Registrierung musst du die Nutzungsbedingungen akzeptieren.");
  }

  const profileRef = db.collection("users").doc(uid);
  const profileSnapshot = await profileRef.get();

  if (profileSnapshot.exists) {
    const existingProfile = profileSnapshot.data() || {};

    if (existingProfile.role !== "hunter") {
      throw createHttpError(403, "ROLE_NOT_ALLOWED", "Dieses Konto ist für die Hunter-App nicht zugelassen.");
    }

    await profileRef.set(
      {
        displayName: cleanProfileString(body.displayName || existingProfile.displayName),
        photoURL: body.photoURL ? cleanProfileString(body.photoURL, 500) : existingProfile.photoURL || null,
        lastLoginAt: fieldValue.serverTimestamp(),
        updatedAt: fieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return {
      ok: true,
      created: false,
      profile: publicHunterProfile(existingProfile),
    };
  }

  const profile = {
    uid,
    email,
    displayName: cleanProfileString(body.displayName),
    photoURL: body.photoURL ? cleanProfileString(body.photoURL, 500) : null,
    role: "hunter",
    allowedApps: ["hunter"],
    accountStatus: "active",
    emailVerified: true,
    emailVerifiedBy: authProvider === "google.com" ? "google" : "six_digit_code",
    authProvider,
    termsAccepted: true,
    termsAcceptedAt: fieldValue.serverTimestamp(),
    createdAt: fieldValue.serverTimestamp(),
    updatedAt: fieldValue.serverTimestamp(),
    lastLoginAt: fieldValue.serverTimestamp(),
  };

  await profileRef.set(profile);

  if (authProvider === "password") {
    await verificationRef(email).set(
      {
        consumedAt: fieldValue.serverTimestamp(),
        consumedByUid: uid,
        updatedAt: fieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  return {
    ok: true,
    created: true,
    profile: publicHunterProfile(profile),
  };
}

async function routeRequest(req) {
  const path = getRequestPath(req);
  const body = getRequestBody(req);

  if (req.method !== "POST") {
    throw createHttpError(405, "METHOD_NOT_ALLOWED", "Diese Methode ist nicht erlaubt.");
  }

  if (path.endsWith("/api/hunter-auth/email-verification/start")) {
    return startEmailVerification(body, req);
  }

  if (path.endsWith("/api/hunter-auth/email-verification/verify")) {
    return verifyEmailCode(body);
  }

  if (path.endsWith("/api/hunter-auth/profile/me")) {
    return readHunterProfileForRequest(req);
  }

  if (path.endsWith("/api/hunter-auth/profile/upsert")) {
    return upsertHunterProfile(body, req);
  }

  if (path.endsWith("/api/hunter-auth/campaigns/nearby")) {
    return listPublicCampaignsForHunter(body, req);
  }

  if (path.endsWith("/api/hunter-auth/stories/public")) {
    return listPublicStoryAdsForHunter(body, req);
  }

  throw createHttpError(404, "NOT_FOUND", "Der Endpunkt wurde nicht gefunden.");
}

exports.hunterAuth = onRequest(
  {
    region: "europe-west3",
    timeoutSeconds: 30,
    memory: "256MiB",
    secrets: [smtpUser, smtpPass],
  },
  async (req, res) => {
    if (applyCors(req, res)) {
      return;
    }

    try {
      const result = await routeRequest(req);
      res.status(200).json(result);
    } catch (error) {
      const status = Number(error.status || 500);
      const code = error.code || "INTERNAL";
      const message =
        status >= 500
          ? "Der Server konnte die Anfrage nicht verarbeiten."
          : error.message || "Die Anfrage konnte nicht verarbeitet werden.";

      if (status >= 500) {
        console.error("Hunter auth function failed", {
          code,
          message: error.message,
        });
      }

      res.status(status).json({
        ok: false,
        code,
        message,
      });
    }
  }
);
