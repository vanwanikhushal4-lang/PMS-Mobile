# SCM Java mobile authentication

This is an additive Spring MVC module for the supplied SCM 4.2 application. The new routes use the existing `LOGINMASTER` and `company_code_master` tables for identity and role. They never load the legacy `PASSWORD` or `SECRETKEY` columns. Applying the new SQL migration does not alter legacy tables. The application’s legacy routes are unchanged.

## Reproduce the Java staging checks

```sh
./tools/build_mobile_auth.sh
./tools/test_mobile_auth_java.sh
```

The scripts use Java 17 to emit Java 8-compatible classes and pick up libraries from the supplied SCM WAR. Override `SCM_LEGACY_LIB_DIR`, `SCM_TOMCAT_HOME`, or `SCM_H2_JAR` when those assets are elsewhere. The test harness binds a separate Tomcat to `127.0.0.1:8091`; it seeds two companies in H2, exercises the Java endpoints through the mobile client and checks that a disabled profile has no route. It simulates the directory, SMS and email services. It does not connect to the SCM database or deliver any real messages.

To run the seed service for a manual iOS check, run `SCM_AUTH_QA_SERVE=1 ./tools/test_mobile_auth_java.sh`. From `mobile/`, set `EXPO_PUBLIC_SCM_FIXTURE=1` and `EXPO_PUBLIC_SCM_AUTH_URL=http://127.0.0.1:8091/scm-auth-qa/mobile/v1/auth/` when starting Expo. Example fixture company: `QA-A`; account: `alex`; password: `Stage-only-password-28`. The launcher prints the private file containing synthetic delivery codes.

## Integrating into a test deployment

1. Build `scm-mobile-auth.jar`, and stage it in the test copy’s `WEB-INF/lib`. Keep the test initializer and H2 out of the deployed SCM application.
2. Verify the legacy table names and columns against the test MySQL schema. For a fresh setup, apply `src/main/resources/var/schema.sql` first. Then apply `schema-projects.sql` and `schema-tasks.sql` from the same directory before deploying this version. The two later migrations also apply to existing mobile schemas. Set `SCM_MOBILE_AUTH_JDBC_URL` (`jdbc:mysql://host:port/schema` without query parameters), `SCM_MOBILE_AUTH_JDBC_USER`, and `SCM_MOBILE_AUTH_JDBC_PASSWORD`. Give the service account read access to the identity and feature columns used by the endpoints and write access restricted to `scm_mobile_account`. The JDBC connector verifies the MySQL server’s TLS certificate and hostname. Use your test CA trust store as needed.
3. Provision only a test cohort. Link each enabled mobile profile to the exact legacy `LOGINID` and company code. Directory profiles use the staff directory; local profiles need their own password hash. Determine MFA from the actual policy for each account instead of defaulting an existing factor to `off`. Mobile resets currently change the mobile credential only. Reconcile password changes between clients before claiming web and mobile account parity.
4. Inject a Base64-encoded random 32-byte `SCM_MOBILE_AUTH_KEY` from your secrets manager; keep it out of CLI flags, source, the app and logs. Add `scm-mobile-auth` to the Spring active profiles only after setup. Without the profile the handlers are absent. Ingress must provide TLS, and its trusted servlet integration must mark the request secure. The controller does not trust forwarding headers on its own.
5. For directory users, set `SCM_MOBILE_AUTH_AD_URL` (`ldaps://...`), `SCM_MOBILE_AUTH_AD_COMPANY`, and `SCM_MOBILE_AUTH_AD_REALM`. The current adapter binds one configured company by UPN against a certificate-verified endpoint. Confirm actual bind and directory-owned recovery policy in staging; requests here never reset a directory password.
6. For codes, configure `SCM_MOBILE_AUTH_DELIVERY_URL` and `SCM_MOBILE_AUTH_DELIVERY_BEARER` for an approved HTTPS relay accepting `channel`, `destination`, and `code`. Use an isolated sink at first. Verify real directory and delivery only in the designated test environment. Never point the QA build at an operational database.
7. Point the React Native test build at that deployment’s HTTPS `/SCM/mobile/v1/auth/` URL and test each company, role and sign-in method. Session capabilities drive navigation. The endpoints independently check the grant on every read.

Generate a local profile’s `PASSWORD_HASH`, or encrypt an approved existing TOTP key against its legacy `LOGINID`, using the interactive offline helper. It does not read or write a database:

```sh
javac -cp .qa/mobile-auth-build/scm-mobile-auth.jar -d .qa/mobile-auth-build backend/mobile-auth/tools/Provision.java
java -cp '.qa/mobile-auth-build:.qa/mobile-auth-build/scm-mobile-auth.jar' Provision hash-password
# With the deployment key supplied privately in the environment:
java -cp '.qa/mobile-auth-build:.qa/mobile-auth-build/scm-mobile-auth.jar' Provision encrypt-totp 123
```

The provisioner prints only the resulting hash or encrypted key. Use parameterized SQL or a controlled provisioning job for the exact mobile profile. Increment `REVISION` whenever provisioning changes a credential or MFA policy to invalidate older grants. Review the permission to enroll when `TOTP_ENCRYPTED` is null before enabling an existing authenticator user. Rotating the encryption key requires migration of the encrypted TOTP values.

## Requester workspace

`GET /mobile/v1/auth/workspace` requires a current bearer grant. It returns incident counts by stored status and the latest activity per incident, up to 20. Both reads use the requester and company from the verified SCM account. Activity must also match an incident owned by that requester. Date strings represent the legacy local wall clock.

For staging, the mobile JDBC account also needs read access to `TICKET` (`T_ID`, `T_REQUESTER`, `T_COMPANY`, `STATUS`) and `TICKET_TRACKING` (`SR_NO`, `T_ID`, `ACTIVITY_DATE`, `STATUS`, `MESSAGE`, `TICKET_RAISED_NAME`, `TICKET_RAISED_NAME_COMPANY`). The activity query uses MySQL 8 window functions. Verify it against the actual staging server version, table casing, column collations and query plan. The isolated harness exercises it on H2 in MySQL compatibility mode.

## Profile, projects and task queue

- `GET /mobile/v1/auth/profile` reads the verified account’s work email, phone and organizational fields from `LOGINMASTER`. Profile writes remain open because legacy access scopes and account recovery use these fields.
- `POST /mobile/v1/auth/projects/list` accepts optional `query` and `before`. `POST /projects/detail` and `POST /projects/records` accept the project `id`. `scm_mobile_project_access` maps the verified login ID and company code to `ProjectData.SR_NO`. Provision from reviewed account assignments because `ProjectData` lacks a company and stores submitters by display name.
- `scm_mobile_project_record` links each project and company to the exact row of `requirementDocument`, `UnderstandingDocument` or `ProjectKickOfMeeting`. Populate it from verified project and purchase-order relationships. The endpoint returns reference, date, meeting format and stored status. Attachment access and workflow writes require their own grants.
- `POST /mobile/v1/auth/tasks/assigned-by-me` and `/tasks/assigned-to-me` accept optional `before`. Both join `scm_mobile_task_access` by verified login ID and company code to `DaywiseTask.SR_NO`. The first checks `ASSIGNBY`. The second checks `DEVELOPER_NAME`, the pending status and the legacy date-approval rule. The legacy project and task business IDs have independent generators, so task access uses the exact task row ID.
- `POST /mobile/v1/auth/tasks/work-log` takes the task `id` and uses the same open-task and assignee checks. It returns the latest 20 general entries from `Update_Todays_Progress`. Future work-log writes must coordinate the legacy one-entry-per-task-and-day behavior across both clients.

The Java fixtures cover two companies sharing a username, project and task grants in the wrong company, a wrong assigner, and a project with linked records in multiple companies. Give the deployment’s service user read access to the grant tables and the referenced legacy columns. Use the provisioning identity for writes to the grant tables.

Password hashes and encrypted authenticator keys persist. Sessions, pending challenges and rate counters currently live in a single JVM. Restart invalidates them; a distributed session and throttle strategy is required before multi-node rollout. No files in the live SCM deployment were changed by this work.
