# Development guide

## Setup

Use Node 24 LTS and npm. From `apps/mobile`, run `npm ci`, then `npm run web`. The catalog and core diary need no service credentials. Never commit `.env` files, Apple credentials or personal backup files.

The project pins Expo SDK 54. Native speech and OCR need a development build containing the native modules. See [iPhone testing](IPHONE_TESTING.md) before changing runtime versions or signing settings.

## Source map

| Location | Responsibility |
| --- | --- |
| `apps/mobile/app` | Expo Router routes and five-tab navigation |
| `apps/mobile/src/domain` | Parsing, matching, exact nutrition, targets, plans, diary and backup rules |
| `apps/mobile/src/storage` | Shared storage contract, SQLite and IndexedDB adapters |
| `apps/mobile/src/platform` | Native/web speech, camera, photo, sharing and recovery ports |
| `apps/mobile/src/state` | Repository lifecycle and application state |
| `apps/mobile/src/ui` | Shared controls, typography, screen components and accessibility |
| `apps/mobile/tests` | Domain and real-adapter unit tests |
| `apps/mobile/e2e` | Isolated browser workflow tests |
| `website` | Public privacy/support site, published to the `gh-pages` branch |
| `Packages/ToucheGrasseCore`, `ToucheGrasse` | Preserved Swift/SwiftUI reference implementation |

## Validation

Run `npm run typecheck`, `npm run lint`, `npm test` and `npm run build:web` from `apps/mobile`. For workflow/layout changes, start `npm run preview`, install the browsers with `npx playwright install chromium webkit`, then run `npm run test:e2e` and `npm run test:iphone:web` in a second terminal. Linux machines may also need Playwright's system dependencies; the CI container already includes them.

The preview serves port 4173. It must use the export being tested: do not rebuild or swap source/export assets in the middle of a browser run. Test outputs belong in ignored `verification` and `test-results` directories. Use synthetic records from the actual catalog, never someone's browser diary.

Choose checks for the behavior you changed. Parsing/matching changes need meaningful domain cases; storage changes need both adapters, failure rollback and legacy snapshot coverage; UI changes need narrow layouts and relevant workflows. State exactly which device behavior remains unverified.

## Data rules

Use canonical decimal strings and the existing arithmetic helpers. Unknown is not zero. Food calculations must come from source records. Keep preparation/weight bases explicit and preserve immutable historical snapshots. Plans and saved batches are not eaten food until a logging action occurs. Multi-entry operations and Undo must stay atomic.

Browser storage is scoped to its origin. Moving between ports/hosts does not move a diary. Export/import is the supported transfer path; local recovery copies are not off-device backups.

## Changes and publication

Open a focused PR against `main`, explain the resulting behavior and include validation. Discuss large features, new services and dependency/runtime migrations first. CI is a review aid, not proof of all physical-device behavior.

Release metadata lives in `apps/mobile/store.config.json`; the age-rating draft is explicitly unpublished. Never store private review contact phone numbers or signing keys there. The public privacy/support site contains no app diary data. See [release checkpoints](TESTFLIGHT_RELEASE.md) before uploading or claiming store availability.
