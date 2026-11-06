# Contributing

Thank you for helping keep Touche Grasse useful and free.

Please follow our [Code of Conduct](CODE_OF_CONDUCT.md). For a source map and detailed validation instructions, see the [development guide](docs/DEVELOPMENT.md).

Use Node 24 LTS. From `apps/mobile`, run `npm ci` and `npm run web`. The Expo app is the active implementation. Keep changes focused and discuss large features in an issue first. Check existing issues and PRs before starting. A maintainer-approved issue is the best starting point for a larger contribution.

Before opening a pull request:

```sh
npm run typecheck
npm run lint
npm test
npm run build:web
```

For entry, persistence or layout changes, also run `npm run preview`, then `npx playwright install chromium` and `npm run test:e2e` in another terminal. Test at 390×844 and explain remaining device-validation limits. Screenshots must come from the actual app with isolated fixture data.

## Product and data rules

- Keep the interface in English and support Norwegian food data and queries.
- Preserve storage, backup compatibility, historical nutrition snapshots and unknown values.
- Nutrition comes from reviewed food records. Never invent nutrition, portion conversions, cooked yield, oil absorption or unlisted ingredients.
- Generic cooking inputs prefer clean raw ingredients; important raw/cooked or dry/cooked differences must remain explicit.
- Logging, repeat, undo and drafts must stay fast. Batch creation must not count the batch as eaten.
- Add meaningful tests for changed domain behavior and storage transitions. Include repro steps for bug fixes.
- Do not add telemetry, remote services, credentials or paid dependencies without discussion.

For food issues, include the public source URL/ID, query and expected match. Do not include private diary exports, photos, databases, recordings or tokens.

## Pull requests

Describe the problem, resulting behavior, validation performed and remaining limits. New features should use the existing component language and be accessible to keyboard and screen-reader users.

By contributing, you agree that your original contributions are provided under this project's AGPL-3.0-only license. Preserve attribution and only contribute material you have the right to share. Be respectful and specific in discussions.

## Scope and review

Open PRs against `main`. Explain the user-visible problem, why the change solves it, which checks ran and any compatibility risks. Include actual screenshots for interface changes. Do not label fixture/browser evidence as physical-device validation. Add user-facing changes to [CHANGELOG.md](CHANGELOG.md) under Unreleased. There is no contributor agreement beyond the existing project license and no guaranteed review deadline.
