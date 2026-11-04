# Integration research — checked 22 October 2026

This document distinguishes live data retrieval from documentation review and future work.

## Matvaretabellen — actual public responses captured

Official documentation: https://www.matvaretabellen.no/api/

Downloaded actual JSON from:

- https://www.matvaretabellen.no/api/nb/foods.json
- https://www.matvaretabellen.no/api/en/foods.json
- https://www.matvaretabellen.no/api/nb/nutrients.json

The Norwegian response contains 2,121 food records. The importer joins English names by `foodId`; source identifiers must remain strings (e.g. `08.019`), not numeric values. Calories live in `calories.quantity`; macro constituents use `Protein`, `Karbo`, and `Fett`. A constituent with a source ID but no quantity remains missing. Unit validation is mandatory. Original nutrient source IDs and source URLs survive normalization. Full source responses and SHA-256 hashes are in `Fixtures/`.

The API supplies bulk datasets rather than requiring a network search per keystroke. Its documentation requests Matvaretabellen attribution, permits local caching and describes annual updates and unversioned endpoints. The app's current data is a dated snapshot; in-app refresh is pending. Raw foods contain household portions, but this first importer does not map them until each unit and portion meaning has an explicit contract. No fabricated gram factors.

## Open Food Facts — documentation checked; not integrated

Primary reference: https://openfoodfacts.github.io/openfoodfacts-server/api/

At review time, the documentation recommends **v3, currently v3.6**, for new integrations and labels v2 deprecated. Do not implement an old v2 request from memory. The published limits are **15 product reads/minute/IP** and **10 searches/minute/IP**; live limits must be rechecked when implementing. Requests need a custom `AppName/Version (ContactEmail)` User-Agent. No owner contact address was supplied, so none has been invented. The docs recommend staging for tests and ask integrators to submit an API usage form.

Before Milestone 3: obtain the product contact/configuration, review ODbL database and Database Contents licensing plus image attribution/share-alike requirements, cache successful barcode results, rate-limit, honor 429/backoff, and preserve community provenance/uncertainty. Keep OFF source data distinguishable from private user data and assess combined-database redistribution obligations before public distribution. No OFF requests, integration test successes, product fixtures or credentials are claimed in this revision.

## Apple APIs — future native validation gates

Official references:

- NavigationStack: https://developer.apple.com/documentation/swiftui/navigationstack
- Vision text recognition: https://developer.apple.com/documentation/vision/recognizing-text-in-images
- Speech: https://developer.apple.com/documentation/speech/
- SFSpeechRecognizer supported locales: https://developer.apple.com/documentation/speech/sfspeechrecognizer/supportedlocales()
- On-device capability: https://developer.apple.com/documentation/speech/sfspeechrecognizer/supportsondevicerecognition
- Newer SpeechTranscriber: https://developer.apple.com/documentation/speech/speechtranscriber

Apple's on-device request setting only applies when the recognizer reports on-device support. Do not infer Norwegian on-device support from locale spelling or keyboard dictation availability. On target hardware, inspect supported locales, `isAvailable`, `supportsOnDeviceRecognition`, permission status and recognition quality for `nb-NO` and the selected English locale. Investigate newer SpeechTranscriber/SpeechAnalyzer capability, OS availability, downloadable models and Norwegian support before selecting a Milestone 4 implementation. Device capability has NOT been tested here; some Apple web reference content was inaccessible to the text browser.

Default design remains a foreground, user-started session with visible listening and an immediate stop/cancel button. If on-device recognition is unavailable, explain that and keep typing available. Any audio-upload fallback needs explicit consent and a documented provider/privacy design. Do not promise continuous/background listening. No microphone, camera or speech usage-description strings are added until corresponding functional features exist.
