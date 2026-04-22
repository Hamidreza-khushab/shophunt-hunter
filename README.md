# Shop Hunter

Expo app shell for hunters who discover ShopHunt campaign spawns through mobile AR encounters.

## Current scope

- JavaScript Expo app.
- Single intro screen.
- ShopHunt web branding: primary blue `#2563EB`, accent orange `#F97316`, shared icon asset.
- Firebase client scaffold for the same backend used by the web dashboard.
- EAS build configuration for Android and iOS.

The QR identity in this app is not a printed wall asset. It represents a virtual Spawn encounter token that will later be surfaced in the mobile AR/camera flow.

## Setup

Create `.env` from `.env.example` and fill it with the public web/backend values from the existing ShopHunt project. Use the same Firebase values as the dashboard, but with the `EXPO_PUBLIC_` prefix instead of `NEXT_PUBLIC_`.

```sh
npm install
npm run start
```

## EAS

```sh
npm run eas:android
npm run eas:ios
```
