# Shop Hunter

Expo-App für Hunter, die ShopHunt-Kampagnen-Spawns über mobile AR-Begegnungen entdecken.

## Aktueller Umfang

- JavaScript-Expo-App.
- Einzelner Intro-Screen.
- ShopHunt-Webbranding: Primärblau `#2563EB`, Akzentorange `#F97316`, gemeinsames Icon-Asset.
- Firebase-Client-Grundlage für dasselbe Backend wie das Web-Dashboard.
- Hunter-only-Authentifizierung mit E-Mail/Passwort, Google-Anmeldung, Rollenprüfung und sicher gespeicherten Sitzungen.
- Firebase Cloud Function für sechsstellige E-Mail-Bestätigungscodes über Brevo SMTP.
- EAS-Build-Konfiguration für Android und iOS.

Die QR-Identität in dieser App ist kein gedrucktes Wandlabel. Sie steht für ein virtuelles Spawn-Begegnungstoken, das später im mobilen AR-/Kamera-Flow sichtbar wird.

## App-Setup

Erstelle `.env` aus `.env.example` und fülle sie mit den öffentlichen Web-/Backend-Werten aus dem bestehenden ShopHunt-Projekt. Verwende dieselben Firebase-Werte wie im Dashboard, aber mit dem Präfix `EXPO_PUBLIC_` statt `NEXT_PUBLIC_`.

Die Google-Anmeldung nutzt native Google Sign-In fuer Expo Development-/Preview-Builds. In `.env` wird dafuer `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` verwendet; Android OAuth Client IDs gehoeren nur in Firebase/Google Cloud mit den passenden SHA-1 Fingerprints und werden nicht im JavaScript-Loginflow verwendet.
Firebase Authentication muss den Google provider aktiviert haben. `google-services.json` und `GoogleService-Info.plist` muessen im Projekt liegen, weil `app.json` sie fuer den native Build referenziert.
Für die Android-Karte benötigt der native Build zusätzlich `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` mit einem Google Maps SDK for Android API-Key. Ohne diesen Key kann die Standortfreigabe funktionieren, aber die Kartenkacheln können im Android-Build leer bleiben.

Die E-Mail-Registrierung nutzt die Firebase Function unter:

```sh
EXPO_PUBLIC_AUTH_API_URL=https://europe-west3-shophunt-484e8.cloudfunctions.net/hunterAuth
```

Die App ruft darunter diese Endpunkte auf:

- `POST /api/hunter-auth/email-verification/start`
- `POST /api/hunter-auth/email-verification/verify`

Die App schreibt Hunter-Profile nach `users/{uid}` mit `role: "hunter"` und `allowedApps: ["hunter"]`. Admin- und Kundendashboards müssen diese Rolle in ihrem eigenen Auth-Guard und in ihren Backend-Regeln ablehnen.

```sh
npm install
npm run start
```

## Firebase Functions

Die Function sendet den Code per Brevo SMTP, speichert nur einen Hash des Codes in Firestore und markiert `hunterEmailVerifications/{normalizedEmail}` nach erfolgreicher Prüfung kurzzeitig als `verified: true`.

Kopiere `functions/.env.example` nach `functions/.env` und trage die nicht geheimen SMTP-Werte ein. Für die geheimen Brevo-Zugangsdaten werden Firebase Secrets verwendet:

```sh
firebase functions:secrets:set SMTP_USER
firebase functions:secrets:set SMTP_PASS
```

Danach deployen:

```sh
npm --prefix functions install
firebase use shophunt-484e8
firebase deploy --only firestore:rules,functions:hunter-auth:hunterAuth
```

## EAS

Keep real environment values out of `eas.json`. Local development reads `.env`; cloud builds read the selected EAS environment configured by each build profile.

Push `.env` to EAS before building:

```sh
npx eas-cli@latest env:push development --path .env
npx eas-cli@latest env:push preview --path .env
npx eas-cli@latest env:push production --path .env
```

Preview Android APK:

```sh
npx eas-cli@latest build --profile preview --platform android
```

Preview iOS build:

```sh
npx eas-cli@latest build --profile preview --platform ios
```

Preview build for Android and iOS:

```sh
npx eas-cli@latest build --profile preview --platform all
```

Production Android build:

```sh
npx eas-cli@latest build --profile production --platform android
```

Production iOS build:

```sh
npx eas-cli@latest build --profile production --platform ios
```

Production build for Android and iOS:

```sh
npx eas-cli@latest build --profile production --platform all
```

## Debugging

```sh
adb logcat -c
adb logcat -v time AndroidRuntime:E ReactNativeJS:V ReactNative:V Expo:E '*:S' | Tee-Object crash-log.txt
```
