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

Die Google-Anmeldung benötigt die plattformspezifischen OAuth-Client-IDs in `.env`.

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
firebase deploy --only firestore:rules,functions:hunterAuth
```

## EAS

```sh
npm run eas:android
npm run eas:ios
```
