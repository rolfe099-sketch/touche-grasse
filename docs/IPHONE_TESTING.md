# iPhone readiness and physical-device testing

The active application is `apps/mobile` (Expo), not the original Swift prototype. The owner's test target is an **iPhone 13 Pro**. Record the exact iOS version from Settings → General → About; "latest" is not a reproducible version.

On 4 November 2026, the owner confirmed installation and Today launch, correct 10g olive-oil nutrition, repeat, undo, reopen persistence, and the new entry-delete/Undo flow on that physical iPhone. Single-ingredient speech worked; multi-ingredient speech captured the words but exposed a clause-parsing failure. After the fix and an explicit development-client Reload, the owner confirmed that the existing sentence split into three rows. The owner also confirmed that scanning a packaged food opens its editable product review, and that creating a recovery copy and exporting it to Files succeeds. Other device checks below remain pending. The exact iOS version remains unrecorded.

## What Windows checks establish

- TypeScript, domain tests and both storage adapters exercise exact meal/portion math and historical persistence.
- Native speech adapter tests use a fake native port to exercise permission races, interruption, cancellation, stale callbacks and final-result deduplication. They do not access a microphone.
- Native backup tests use fake file/share ports to check size validation, errors and cleanup. They do not operate iOS Files or its share sheet.
- Browser tests at 393×852 exercise correction, six saved servings, one-serving logging, reload, undo, speech fallback and barcode fallback. The optional WebKit run uses a desktop automation build, not the owner's Safari or iPhone hardware.
- `expo export --platform ios` checks JavaScript packaging. Config introspection checks native permission/plugin configuration. Neither compiles, signs or installs an iOS binary.

## Browser test from Windows, no Mac required

1. Export a backup before testing with existing records. Browser origins and native app installs have separate stores.
2. Put the PC and phone on the same private Wi-Fi. In `apps/mobile`, run `npx expo start --web --lan --port 8082`.
3. On the iPhone, open Safari at `http://<PC-LAN-IP>:8082`. Use the address printed by your local network tools; the phone's `localhost` points to the phone.
4. Check the workflow below. Do not clear site data or uninstall a client without a backup.

The HTTP LAN preview can test typing, matching, recipes and persistence. It does not establish installable-PWA, offline-shell, microphone or browser-camera support: secure-context features need HTTPS and browser support. No firewall rules or public tunnel are created by this project. If unreachable, check same-network access, guest isolation, VPN and existing private-network firewall permissions.

For the automated browser check, export the web app, then use `npx playwright install webkit` and `npm run test:iphone:web` while the preview is running. CI starts its own preview. This supplements the default Chromium suite.

## Native development build without a Mac

The repository includes `expo-dev-client` matched to SDK 54 and an `eas.json` development profile for a physical iPhone (`simulator: false`, internal distribution). The maintainer's authenticated Expo project is `@aftertext/touche-grasse`, linked through the standard public project ID in `app.json`. No signing team or credentials are included. Contributors should link their own Expo project rather than attempting to build against the maintainer's account.

The maintainer confirmed the standard/exempt encryption classification for this build, recorded as `ITSAppUsesNonExemptEncryption: false`. Reassess that declaration if encryption-related behavior or linked libraries change; it is not a blanket compliance assertion for forks.

Expo EAS can build iOS remotely from Windows. Installing its signed build on a physical iPhone requires the owner's Expo account and Apple Developer Program credentials/membership. Review service pricing and account access first. Linking a project is not a signed build or device validation; Apple login, signing and device enrollment remain separate steps.

Once the owner has chosen that route, the setup sequence is:

```sh
cd apps/mobile
npx eas-cli login
npx eas-cli init
# Register the actual iPhone in the owner's project and signing account:
npx eas-cli device:create
# Start only after project, credentials and any cost are approved:
npx eas-cli build --platform ios --profile development
```

Use the resulting device installation link, enable Developer Mode if iOS requires it, and start the local server with `npm run start:iphone`. Keep the phone and Windows PC on the same private network. The project currently retains its existing `local.touchegrasse.mobile` bundle identifier; verify availability before the first signed build and keep the chosen ID stable afterward. Changing it creates a separate app/storage identity.

To create a connection QR after the server starts, run `node scripts/iphone-qr.mjs <PC-LAN-IP>:8082 --dev-client`. It checks the real iOS manifest and writes `verification/expo/iphone-dev-client-qr.svg` locally. Scan it only after installing this project's signed development client. Without `--dev-client`, the helper retains its Expo Go URL mode; that mode does not add native speech support.

Expo Go can only use native modules present in its installed binary and must support this project's pinned SDK. Direct `expo-speech-recognition` requires the custom build; do not treat an Expo Go run as its native voice test. Do not upgrade the SDK just to match a phone client without a separate compatibility review.

### Dependency review before distribution

The SDK 54 lockfile audit on 4 November 2026 reports 48 advisory entries (6 high, 41 moderate, 1 low). These are dependency advisories, not evidence of an exploited app. The SDK-matched development client has moderate transitive advisories; npm's proposed fix crosses SDK majors. The install added ten packages and changed no existing locked dependency versions. Review compatible SDK updates before distributing a signed release; do not run `npm audit fix --force` blindly. The detailed local audit is kept in ignored verification output rather than committed as a permanent security guarantee.

References: [Expo development builds](https://docs.expo.dev/develop/development-builds/introduction/), [internal distribution](https://docs.expo.dev/build/internal-distribution/), [iOS Simulator restrictions](https://docs.expo.dev/workflow/ios-simulator/).

## Physical acceptance

Use a separate test diary or export first. Record model, exact iOS version, runtime/build ID, locale, date, pass/fail and screenshots. Never publish a personal backup or recording.

| Check | Expected behavior | Device result |
| --- | --- | --- |
| Fresh launch and relaunch | Catalog available; saved diary retained | Today opens and olive-oil entry survives relaunch, owner-confirmed on iPhone 13 Pro; full catalog not counted on device |
| Single ingredient | `10g olive oil` uses the verified record | 89 kcal and 9.9 g fat, owner-confirmed on iPhone 13 Pro |
| Whole meal | Enter `200g chicken, 150g pasta, 15g pesto, 10g olive oil, 50g parmesan`; choose raw chicken breast, dry plain pasta and the reviewed pesto | Pending |
| Quantity correction | Change chicken 200→250→200; other quantities stay 150/15/10/50; number pad has Done | Pending |
| Keyboard and safe areas | Focus first/last ingredient, manual nutrients, targets and portion amounts; controls remain reachable; drag dismisses keyboard; no home-indicator overlap | Pending |
| One-action meal log | All resolved rows log together; keyboard does not require a separate dismiss tap first | Pending |
| Six portions | Save six servings without logging; no final weight assumed; log one serving = exactly one-sixth; five remain | Pending |
| Repeat and undo | Repeat one meal or serving, undo, relaunch; counts and totals remain correct | Olive-oil repeat to 178 kcal, Undo to 89 kcal and relaunch passed, owner-confirmed on iPhone 13 Pro; saved serving pending |
| Adjusted repeat | Edit an amount before logging; totals update, one action logs the meal, Undo removes the repeat | Amount field, totals, logging and Undo passed comfortably on iPhone 13 Pro, owner-confirmed; multi-row and finite-inventory device edge cases pending |
| Delete an entry | Trash beside a diary entry removes only that entry; Undo restores its original values | Passed on iPhone 13 Pro, owner-confirmed |
| Interrupted draft | Switch tabs, lock/unlock, background and relaunch; unfinished entry stays editable | Pending |
| Voice first permission | A requested permission prompt may briefly interrupt the app; capture begins only for the still-active request | Pending |
| Multi-ingredient speech | `10 g olive oil then add 100 grams chicken and add 50 g apple` creates three rows, with product choices retained for review | Three rows after explicit Reload, owner-confirmed on iPhone 13 Pro; parsing, draft repair and confirmed product reuse also covered by regression tests |
| Voice denial/recovery | Deny microphone/speech; useful error, Settings link and immediate typing fallback; enable permission and explicitly retry | Pending |
| Capture cancellation | Navigate away or background while permission is pending; resolving it must not start capture | Pending |
| Voice interruption | Home/lock/phone-call interruption stops capture; returning does not restart it; no late command logs a meal | Pending |
| Retained command | Speak part of a command, switch to Type or background, reload, then Continue voice command. Nothing is applied until Apply. Retry a failed command without duplicating food. | SQLite/IndexedDB and browser boundary covered; physical iPhone pending |
| Cooking sequence | Say a recipe name, ingredients, one correction, six servings and a measured cooked weight. An invalid later correction leaves the existing meal unchanged. Generic foods still require product review. | Deterministic command and browser tests covered; physical microphone pending |
| Language | English and Norwegian commands select reviewed records; unsupported speech locale leaves typing usable | Pending |
| Camera lifecycle | Permission request is user-started; deny→Settings/manual fallback; background/lock/navigation releases camera; resume requires Scan barcode | Pending |
| Barcode latch | A saved barcode adds one row once; unknown code offers manual label entry; editing code clears stale guidance | Pending |
| New packaged product | Scan a real package, review sourced values and g/ml basis, correct a field and add an amount. Nothing is eaten until Log. Scan again offline to use the saved record. | Editable product review appears after scanning a real package, owner-confirmed on iPhone 13 Pro. Physical label correction, basis choice and offline reuse pending |
| Nutrition-label photo | Photograph nutrition label, accept the photo, review source values and explicitly confirm unclear units; nothing is eaten until Log | Photo review opens on the owner's iPhone 13 Pro using build 7873c86c-bebc-473d-9428-6d4be9fb0fca. The reported reading (`energi 2043 kJ/488 kcal`, protein `5,6 Dr`, fiber `3,2`) exposed row association and unclear-unit cases now covered by regressions. On 5 November the owner confirmed the reopened review shows 488 kcal and the explicit unit buttons fill 5.6 g protein and 3.2 g fiber. This confirms that readout; broader fresh-photo accuracy, closer-crop behavior and interruption/permission cases remain pending. |
| Resume label review | After reload, Today > Log > Continue label review opens the saved form without launching the camera | Passed on iPhone 13 Pro, owner-confirmed on 5 November. The owner also confirmed the recovered energy and explicit protein/fiber confirmations in that reopened review. |
| Rescan corrections | Correct fat, deliberately clear an uncertain field, then photograph again. Current values stay; choose a compatible column to fill blanks, or explicitly replace a different basis. Reload retains the pending photo review. | Real local synthetic-image OCR plus persistence tests covered; fresh package photos on iPhone pending |
| Export/share | Save an export through Files; cancel/retry; temporary app export is removed after share sheet closes | Pending |
| Restore | Restore into an isolated test store, repeat restore without duplicate history, confirm targets/drafts/remaining portions | Pending |
| Automatic recovery | Settings lists automatic copies after a quiet period. Export a copy through Files; recovery merges missing entries and keeps existing history/current draft. Do not delete real app data to test this. | Creating a copy and exporting it to Files passed on iPhone 13 Pro, owner-confirmed. Recovery merge covered by isolated browser/native-port tests; actual native merge pending |
| Photos | Select a photo, save recipe, relaunch and restore; share no location metadata | Pending |
| Offline | Native catalog/search/log/repeat/relaunch work without networking; recognizer limitations remain visible | Pending |
| Accessibility | VoiceOver field/action order, large Dynamic Type, high contrast, reduced motion and touch targets | Pending |
| Optional support | Coffee icon opens the owner's exact URL; diary remains usable after returning | Pending |

Measure taps, text-entry actions, scrolls and elapsed time separately for a new meal, recognized meal, isolated quantity correction, saved serving and repeat. Automation timings are not human iPhone benchmarks.
