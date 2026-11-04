# Touche Grasse: primary Expo implementation

The primary application is now [apps/mobile](apps/mobile/README.md): Expo SDK 54, React Native, strict TypeScript and Expo Router, targeting iPhone with a working browser development path.

The original root README, SwiftUI project, Swift package, SQL, tests, captured Matvaretabellen data and product/design documents are preserved. They describe the previous native implementation. New migration work lives separately; see `verification/expo/original-files.json` for the original SHA-256 manifest.

Start here:

```powershell
cd D:\ToucheGrasse\apps\mobile
npm ci
npx expo start --web --port 8082
```

For Expo Go, run `npx expo start --port 8082`, keep the computer and iPhone on the same network, and scan its QR code with the iPhone Camera. See [the full workflow](apps/mobile/README.md) and [migration decisions](apps/mobile/ARCHITECTURE.md).

No EAS Build, EAS Update, `eas go`, signing or deployment is part of this implementation. Physical-iPhone execution still needs to be verified on the owner's device.
