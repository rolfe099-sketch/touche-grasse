# TestFlight release preparation

Branch: codex/testflight-release. Public privacy and support sites are in website/ and published through the gh-pages branch (subtree export). Both URLs returned HTTP 200 on 6 November 2026:

- https://rolfe099-sketch.github.io/touche-grasse/privacy/
- https://rolfe099-sketch.github.io/touche-grasse/support/

Contact: support@eriksenlabs.com. No custom domain is needed.

Production uses the existing local.touchegrasse.mobile bundle identifier and existing Apple team to preserve app identity. The distribution certificate was reused, with a new App Store provisioning profile. The app icon is an opaque 1024px rendering of the existing eight-spoke brand symbol. Typecheck and lint passed before the build.

Build 0.1.0 (2): https://expo.dev/accounts/aftertext/projects/touche-grasse/builds/333d1b23-8d11-471c-8d47-524d18f7e136

A build request is not a TestFlight upload or App Review submission. Submission setup is in progress. App Store Connect still needs verified privacy declarations, age-rating/content answers, support/privacy URLs, accepted screenshots, review contact information, and a selected processed build. Do not claim App Review submission or approval until Apple confirms the corresponding status.

Before installing TestFlight over the development app, export a current diary backup to Files. Keep the file private and do not uninstall the development app first. Actual release-build behavior must be checked on the iPhone; browser verification alone does not establish it.

The privacy policy describes actual source behavior, including optional Apple speech processing, barcode requests to Open Food Facts and OS/exported backups. Do not claim all voice recognition is on-device or blindly select privacy declarations without reviewing third-party handling. App Review payment/link eligibility must also be checked for the existing optional Buy Me a Coffee link against the intended storefronts.
