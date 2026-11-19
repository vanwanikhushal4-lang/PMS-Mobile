#!/usr/bin/env bash
set -euo pipefail

if [[ $# != 3 ]]; then
  echo 'Usage: bash tools/test_pms_ios.sh SIMULATOR_ID PMS_QA_APP_PATH SYNTHETIC_AGENDA_PDF' >&2
  exit 2
fi

root=$(cd "$(dirname "$0")/.." && pwd)
simulator=$1
app=$2
agenda=$3
test_scheme=PMSFlowTests
bundle=com.velox.scm.mobile.qa

[[ -d "$app" && -f "$agenda" ]] || { echo 'Provide the simulator app and a sample PDF.' >&2; exit 2; }
[[ -f "$app/main.jsbundle" ]] || { echo 'Use the Release app with its embedded JavaScript bundle.' >&2; exit 2; }
[[ $(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$app/Info.plist") == "$bundle" ]] || {
  echo 'Use a PMS QA app built with PMS_IOS_VARIANT=qa.' >&2
  exit 2
}

mkdir -p "$root/.qa"
test_output=$(mktemp -d "$root/.qa/pms-ios-flow.XXXXXX")
xcrun simctl bootstatus "$simulator" -b
xcrun simctl install "$simulator" "$app"
container=$(xcrun simctl get_app_container "$simulator" "$bundle" data)
mkdir -p "$container/Documents"
sample="$container/Documents/PMS simulator agenda.pdf"
if [[ ! -e "$sample" ]]; then cp "$agenda" "$sample"; fi
xcodegen generate --spec "$root/mobile/ios-tests/project.yml" --project "$test_output"

printf 'Xcode test results: %s\n' "$test_output/result.xcresult"
xcodebuild test -project "$test_output/$test_scheme.xcodeproj" -scheme "$test_scheme" \
  -destination "platform=iOS Simulator,id=$simulator" -parallel-testing-enabled NO \
  -test-timeouts-enabled YES -default-test-execution-time-allowance 600 \
  -derivedDataPath "$root/.qa/pms-ios-test-build" -resultBundlePath "$test_output/result.xcresult"
