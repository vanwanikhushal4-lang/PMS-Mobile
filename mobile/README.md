# SCM Mobile

The React Native client lives in this folder. The [migration plan](../docs/mobile-migration.md) tracks feature coverage and explains how to generate the legacy route inventory from an SCM source checkout.

```sh
npm ci
npm run ios -- --localhost --port 8082
```

Use `npm run android -- --localhost --port 8082` for an Android emulator. The Expo SDK versions here are checked in `package.json`; use a compatible Expo Go or development build. On the iOS Simulator, the connection check defaults to the local SCM webapp at `http://127.0.0.1:8080/SCM/`. On the Android emulator it defaults to the host alias at `http://10.0.2.2:8080/SCM/`. The Java app must be running on the Mac to check either address.

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
EXPO_PUBLIC_SCM_FIXTURE=1 EXPO_PUBLIC_SCM_AUTH_URL=http://127.0.0.1:8084/mobile/v1/auth/ npm run ios -- --localhost --port 8085
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
