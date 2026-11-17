# Step 2: account and session parity

The existing login page and its Java handler define the workflow. Use this checklist to drive the mobile implementation and to separate staging proof from live account behavior.

| Scenario | Legacy reference | Mobile acceptance | Status |
| --- | --- | --- | --- |
| Company and account lookup | `login/loginNew`, `LoginDaoImpl.getAuthentication` | Company code is carried through the flow. Wrong company, invalid credentials, expired/inactive account, and transport failure have usable outcomes. | Isolated Java verifies company, wrong credentials and disabled accounts; actual account mapping pending |
| Local and Active Directory sign-in | `getAuthentication`, `LOGIN_TYPE` | Exercise both an SCM-managed account and a directory account; no credentials are written to logs, stored on the device, or sent over plain HTTP. | Native local sign-in against isolated Java verified; simulated directory binding passed; live directory parity pending |
| MFA off | `getLogin`, `checkMFAType` | Establish a normal session only after the server confirms sign-in. | Isolated Java and iOS verified with seeded local credentials |
| SMS challenge | `checkMFAType`, `verifyOTP` | Test send, retry, valid and invalid code, expiry, reuse and cancel using a staging SMS sink. | Isolated Java sink and web interaction verified; actual SMS delivery pending |
| Authenticator enrollment and challenge | `getParticularImage`, `verifyOTP`, `FIRST_LOGIN` | Show enrollment only to the current pending account, test first and returning sign-ins, clear enrollment material on navigation, and enforce expiry. | Java enrollment, returning code and replay tested; existing SCM enrollment migration pending |
| Email and phone recovery; password change | `forgetPassword`, `setnewPassword`, email/phone OTP and reset handlers | Test both enabled recovery channels against controlled recipients; require proof of recovery before password change and clear the recovery state after success. | Java tests passed for both sinks; actual delivery and shared credential behavior pending |
| Role, designation, company and scopes | `loginmaster`, login session, role and sidebar routing | Take identity and permissions from the server after verification. Cover a representative user for every role and check protected deep links independently of menu visibility. | Native profile and signed-out deep link verified; full role/scope parity pending |
| Session active, expired, revoked and logged out | Servlet session and `LOGOUT` handler | Show the correct native state after relaunch and idle timeout. Logout revokes the server session and removes the device session. | Native logout and Java expiry/revocation verified; release-device session restore pending |

The mobile client should consume an additive JSON contract on Java. Password, MFA and recovery challenges use short-lived server-owned state bound to one account and company. A final session is the only response that can unlock protected routes. Role and scope metadata stay descriptive on the client; server authorization applies on every request. Existing legacy routes remain in place during rollout.

The current legacy login logs submitted credentials and its session fields differ between initial and MFA sign-in. Do not connect a native password form to those handlers as-is. Authentication work should remove credential logging and derive the same complete server-owned identity after every supported sign-in method. An isolated SCM schema with seeded identities, an Active Directory test account, and controlled email/SMS delivery are needed to prove parity. The read-only connection check from step 1 is independent of those requirements.

The native client and the [Java module](../backend/mobile-auth/README.md) now exercise this contract on isolated Tomcat and H2. Production native grants are stored using device secure storage, bound to the configured endpoint and revalidated by the server before reuse; the fixture and web preview use memory only. Actual MySQL integration and end-to-end directory and delivery verification remain pending. Mobile local credentials use their own hash, and mobile password recovery updates that hash. Shared credential behavior between clients still needs reconciliation.

## Java API exercised in the isolated test deployment

All operations sit under `/mobile/v1/auth`; require HTTPS outside the local test harness and return JSON without caching or request-body logging.

| Method and relative path | Purpose |
| --- | --- |
| `POST /sign-in` | Check company, username and password. Return `authenticated`, a pending `challenge` or `enrollment`, or a generic rejection. A pending challenge creates no authenticated session. |
| `POST /challenge/verify` | Accept the opaque challenge ID and code. Resolve the account, role and company from the server-side challenge; issue a session only after successful verification. |
| `POST /challenge/resend` | Resend the same eligible SMS flow within its expiry and retry limits. Rotate or retire any superseded challenge. |
| `GET /session` | Return a current server-verified identity and expiry for an active session. An expired or revoked session returns `401`. |
| `POST /sign-out` | Revoke the current session; repeated logout requests are safe. |
| `POST /recovery/start`, `/recovery/verify`, `/recovery/complete` | Keep account existence private during recovery and bind the final password change to verified proof for that account. |

Staging assertions must include checking that pending sign-in never grants access, replay cannot open a second session, and an old session cannot resume after logout. Never authorize parent or company scope from mobile form fields, cached capabilities, or client-supplied role names.
