# PMS Mobile

The React Native client lives in this folder. The [migration plan](../docs/mobile-migration.md) tracks feature coverage and explains how to generate the legacy route inventory from an SCM source checkout.

The [backend API contract](../docs/backend-api-requirements.md) lists the endpoints, payloads, roles, uploads, pagination and error behavior. Use the [Java backend setup](../backend/mobile-auth/README.md) to run the full seeded service locally.

## Preview without a backend

```sh
npm ci
EXPO_PUBLIC_SCM_FRONTEND_PREVIEW=1 npm run ios
```

Use `npm run web` or `npm run android` in the same command for those targets. Development preview opens a sample account automatically and displays a sample-data banner. It uses client memory, makes no API calls, and resets on reload. Projects, bookmarks, project creation, document review, kickoff scheduling/file selection, task assignment, work logs/completion, date changes/approvals and the publishing browser can be inspected. Account challenge/recovery flows still require their real integration or the existing isolated fixtures. Selected kickoff files stay on the device in this mode. No invitations are sent.

To connect to the backend, unset `EXPO_PUBLIC_SCM_FRONTEND_PREVIEW` and set `EXPO_PUBLIC_SCM_AUTH_URL` to its HTTPS base ending in `/mobile/v1/auth/`. Preview is gated by `__DEV__` and cannot authenticate a release build. The Java loopback fixture supports scheduling and attachment downloads.

## Integrated development

```sh
npm ci
npm run ios -- --port 8082
```

Use `npm run android -- --localhost --port 8082` for an Android emulator. On iOS, `npm run ios` compiles and installs the PMS Xcode target. On the iOS Simulator, the connection check defaults to the local SCM webapp at `http://127.0.0.1:8080/SCM/`. On the Android emulator it defaults to the host alias at `http://10.0.2.2:8080/SCM/`. The Java app must be running on the Mac to check either address.

## Build PMS in Xcode

The checked-in workspace at `ios/PMS.xcworkspace` uses the PMS QA bundle identifier for the seeded service. Install its dependencies with `pod install --project-directory=ios`. To regenerate the normal PMS configuration, leave `PMS_IOS_VARIANT` unset and use the commands below.

With Xcode and CocoaPods installed, run these commands from `mobile/` to generate and open the native workspace:

```sh
npm ci
npx expo prebuild --platform ios
open ios/PMS.xcworkspace
```

Select the **PMS** scheme. Select an iOS 26 simulator to see the system Liquid Glass tabs and controls. For a physical iPhone, select an Apple development team in Signing & Capabilities and set `EXPO_PUBLIC_SCM_AUTH_URL` to the reachable HTTPS mobile API before building. A Release build includes its own JavaScript bundle and launches independently.

For a standalone simulator build against the seeded Java service, start the service as described in the [backend setup](../backend/mobile-auth/README.md#reproduce-the-java-staging-checks) and run:

```sh
export PMS_IOS_VARIANT=qa
export EXPO_PUBLIC_SCM_FIXTURE=1
export EXPO_PUBLIC_SCM_AUTH_URL=http://127.0.0.1:8091/scm-auth-qa/mobile/v1/auth/
npx expo prebuild --platform ios
xcodebuild -workspace ios/PMS.xcworkspace -scheme PMS -configuration Release \
  -destination 'generic/platform=iOS Simulator' -derivedDataPath ../.qa/pms-ios-build build
```

This build uses the separate `com.velox.scm.mobile.qa` bundle and appears as **PMS QA**. Install it with `xcrun simctl install <simulator-id> ../.qa/pms-ios-build/Build/Products/Release-iphonesimulator/PMS.app`. To return to a production configuration, unset the three QA variables and regenerate the iOS workspace before building.

From the repository root, run the kickoff UI test with XcodeGen installed and the seeded Java service running:

```sh
bash tools/test_pms_ios.sh <iOS-26-simulator-id> \
  .qa/pms-ios-build/Build/Products/Release-iphonesimulator/PMS.app \
  <path-to-a-sample-agenda.pdf>
```

The test installs PMS QA, copies the supplied sample PDF into its simulator Documents folder, and opens the system file picker during the kickoff flow. The Xcode result bundle includes screenshots.

For a shared test environment, set `EXPO_PUBLIC_SCM_URL` to the HTTPS application URL. This value is bundled into the app. Keep secrets out of all `EXPO_PUBLIC_` variables.

```sh
npm test
npm run lint
npm run typecheck
npx expo export --platform ios --platform android
```

The public connection check does not ask for credentials or write to the SCM database. See [account and session parity](../docs/auth-parity.md) for the status of native sign-in and the Java integration.

## Try the local sign-in flow

Start the isolated test service from the repository root with `node tools/scm_auth_fixture.mjs`. Then run this command from `mobile/`:

```sh
EXPO_PUBLIC_SCM_FIXTURE=1 EXPO_PUBLIC_SCM_AUTH_URL=http://127.0.0.1:8084/mobile/v1/auth/ npm run ios -- --port 8085
```

On the web, use `npm run web` in place of `npm run ios`; on an Android emulator use `npm run android` and `10.0.2.2` for the authentication host. Neither the fixture nor this HTTP setting is used for production. The fixture never contacts the SCM database or delivers SMS or email, and its data resets when it stops. Use **synthetic test data only**:

| Field | Value |
| --- | --- |
| Company code | `QA-OPS` |
| Usernames | `local` (password), `sms` (SMS challenge), `totp` (authenticator challenge), `enroll` (first authenticator setup) |
| Password | `SCM-qa-only-2026` |
| Simulated code for all challenges and recovery | `246810` |

For an integrated build, set `EXPO_PUBLIC_SCM_AUTH_URL` to the approved HTTPS mobile auth base ending in `/mobile/v1/auth/`. Keep all secrets out of Expo public configuration. The legacy Java sign-in endpoint is not the mobile auth base.

To preview populated incident counts and activity, use the [isolated Java service](../backend/mobile-auth/README.md#reproduce-the-java-staging-checks). The Java fixture seeds two companies and several requester accounts.
