#!/usr/bin/env bash
# Run from a macOS checkout with Xcode selected and an iPhone simulator runtime installed.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p verification
command -v xcodegen >/dev/null || { echo 'Install XcodeGen: brew install xcodegen'; exit 1; }
xcodebuild -version | tee verification/xcode-version.txt
swift test --package-path Packages/ToucheGrasseCore 2>&1 | tee verification/swift-tests-macos.txt
xcodegen generate --spec project.yml
xcodebuild -project ToucheGrasse.xcodeproj -scheme ToucheGrasse -showdestinations
if [[ -z "${SIMULATOR_ID:-}" ]]; then
    SIMULATOR_ID="$(xcrun simctl list devices available -j | python3 -c 'import json,sys; d=json.load(sys.stdin); ids=[v["udid"] for k,vs in d["devices"].items() if "iOS" in k for v in vs if v.get("isAvailable") and "iPhone" in v["name"]]; print(ids[0] if ids else "")')"
fi
[[ -n "$SIMULATOR_ID" ]] || { echo 'Install an iPhone simulator runtime in Xcode Settings, then retry.'; exit 1; }
xcodebuild -project ToucheGrasse.xcodeproj -scheme ToucheGrasse \
    -destination "platform=iOS Simulator,id=$SIMULATOR_ID" \
    -derivedDataPath DerivedData CODE_SIGNING_ALLOWED=NO \
    test 2>&1 | tee verification/xcode-tests.txt
# A screenshot is genuine simulator output only after the application is installed and launched.
xcrun simctl boot "$SIMULATOR_ID" 2>/dev/null || true
xcrun simctl bootstatus "$SIMULATOR_ID" -b
xcrun simctl install "$SIMULATOR_ID" DerivedData/Build/Products/Debug-iphonesimulator/ToucheGrasse.app
xcrun simctl launch "$SIMULATOR_ID" local.touchegrasse.app
echo "App launched. Inspect it, then capture with:"
echo "xcrun simctl io '$SIMULATOR_ID' screenshot verification/today-simulator.png"
