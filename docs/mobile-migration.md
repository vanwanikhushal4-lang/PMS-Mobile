# SCM mobile migration

The supplied Java checkout is the source of truth for business behavior. React Native will replace the JSP screens incrementally on iOS and Android. Keep MySQL behind the Java service; the app never talks directly to it. Keep the JSP client working until native parity is demonstrated. A browser redirect or an embedded JSP screen does not count as native parity.

| Step | Deliverable | Required acceptance evidence |
| --- | --- | --- |
| 1 | Legacy route and screen inventory; React Native shell, motion primitives, navigation and server connection check | Regenerate the inventory; test source mapping and real/invalid responses; run lint, typecheck, bundle for both platforms and preview the native shell. |
| 2 | Account entry, company selection, role/scope handling, Active Directory and local accounts, MFA, reset and logout | Test each account/MFA mode, expiry, invalid input, reset, retry and logout with seeded staging accounts; deny unauthorized deep links and server requests. |
| 3 | Role landing screens, menus, user profile, notifications and operational dashboards | Compare views and counts by role and scope; cover empty, error and refresh states; verify no overscoped data. |
| 4 | Projects, requirement and understanding documents, kickoff meetings and publishing | Compare project lifecycles and role handoffs, document upload/download, revisions and notifications. |
| 5 | Task assignment, work logs, operational tasks, customization and RFP/compliance | Verify assignment, status transitions including return/reopen paths, delivery, progress, date revisions and dashboard reconciliation. |
| 6 | Sales: registration, proposals, revisions, licenses, purchase orders, Forms A/B/C, collection and exports | Replay each approval/rejection flow with seeded records; compare generated documents, amounts, attachments and audits. |
| 7 | Helpdesk: incidents, problems, service catalog, tickets, coordinator and engineer work queues, self-help | Compare requester and staff lifecycle flows, including priority, VIP, outage, assignment, holds, history, closure and reopen. |
| 8 | E-forms and service operations: software request/release/transfer, email/SMTP and business ID workflows | Compare all approval and support queues, permission checks, tracking events and notifications. |
| 9 | Administration, reference data, SLA/escalation, reports, integration settings and remaining utilities | Cover scoped CRUD, validation, report filters/totals/exports, notification jobs and integration behavior against controlled staging services. |
| 10 | Full parity and release audit on iOS and Android | Reconcile every inventoried workflow and decide any exceptions explicitly; run device-level role matrix, simulated slow/error networks, accessibility and reduced motion, lifecycle, and release build smoke tests. |

The local inventory at `docs/legacy-inventory.json` records mapped routes, literal JSP view returns, explicit URL references and linked custom assets. Dynamic URLs, multi-step transitions, roles, request fields and response schemas still need manual reconciliation against each workflow. A JSP with no direct route may be an include, shared layout, error page, or obsolete source; review before removing it from scope.

For each feature record the legacy entry, role/scope, inputs, states and side effects, corresponding native route, and evidence. Only mark the feature complete when successful and failed paths match, permissions are verified at the server, and the UI is previewed with standard and reduced motion. Use a seeded isolated database for writes, actual notifications disabled or redirected to test sinks, and capture validation results per step. The existing runtime can serve as a read-only reference for the public login page.

## Step 1 working files

- `mobile/`: Expo/React Native application. `npm run ios` and `npm run android` launch the development client workflow.
- Rebuild the inventory with `python3 tools/scm_inventory.py /path/to/SCM --output docs/legacy-inventory.json`. Use `--check` for drift detection.
- Run inventory tests with `python3 -m unittest discover -s tools -v`. From `mobile/`, run `npm test`, `npm run lint` and `npm run typecheck`.
- The connection check only opens the SCM entry page and validates its expected title. A response does not indicate authentication success or prove database health. The shell does not send account credentials.

## Verification record

| Check | Result |
| --- | --- |
| Inventory | Two extractor tests passed; `--check` reproduced the saved inventory from SCM source. 18 controller sources, 1,815 route/method entries, and 523 JSP files including two public-root JSPs. |
| Mobile | TypeScript and ESLint checks passed; four connection tests passed against a local HTTP fixture and response doubles. Expo exported Hermes bundles for iOS and Android. |
| iOS Simulator | Confirmed the welcome screen and orbit animation across frames. With the simulator's Reduce Motion enabled, the same artwork rendered without motion across frames. Confirmed “SCM is reachable” against the actual public SCM route, which returned HTTP 200. |
| Android emulator | The Android bundle exported successfully. Device verification remains open because the emulator's package manager was unavailable when installing Expo Go. |
| Step 2 isolated Java | Challenge/session expiry, company lookup, local/directory adapter, SMS, authenticator enrollment, password recovery, and logout passed against isolated Tomcat/H2. Native local sign-in and logout passed on iOS. Live service validation is tracked in [account and session parity](auth-parity.md). |
| Step 3 requester workspace | On iOS, verified the seeded totals, latest activity, read-only profile, repeated tab changes and Reduce Motion navigation. During a simulated Java outage, refresh retained the last successful data and recovered on retry. Java HTTP tests verify requester/company scope, date ordering, one update per incident, the 20-update limit, empty results, and revocation. |
| Step 3 platform checks | TypeScript, lint, 17 mobile tests and eight Java HTTP tests passed. Both Hermes bundles exported. The Android emulator installed Expo Go and loaded the development bundle, then showed a System UI timeout. Android interaction checks remain open. |

## Step 3 coverage

| Legacy entry | Native coverage | Open work |
| --- | --- | --- |
| `UserActivityController.getUserDashboardData` and `UserActivityDaoImpl.getUserDashboardData` | My incidents shows personal incident counts by status from `TICKET`. Java derives the requester and company from the verified session. A missing status has an explicit label. | Compare counts on the designated MySQL staging dataset. Staff, project and sales dashboards still need their own authorized reads. |
| `/NotificationConfig/getUserNotification` | Incident activity shows the latest update for up to 20 owned incidents. The Java query checks requester and company against the tracking row and its incident. | Coordinator and engineer notifications, additional ticket classes, and their organizational scopes still need coverage. |
| `GET /User/UpdateProfile`, `POST /UserActivity/getUserDetailsForUpdate`, and `POST /UserActivity/updateLoginUserProfile` | Profile shows verified identity, location, site, department, subdepartment, work email and phone. Java queries by login ID and company. | Legacy branch and department affect staff visibility, and phone is used for authentication and recovery. Profile writes need authorized organizational scope changes and verified contact changes. |
| `dashboardsidebar.jsp` | The protected workspace uses persistent Projects, My work, Service and Profile tabs. Projects and My work appear when granted. Service contains the incident overview and activity. | Role menus also depend on role, designation, `SIDEBARSCOPE`, visibility, and group membership. Map function-level permissions to the remaining native endpoints. |

## Step 4 coverage

| Legacy entry | Native coverage | Open work |
| --- | --- | --- |
| `GET /PMS/getSavedProjectData` | Projects shows granted `ProjectData` rows with search, pagination and account-specific bookmarks. Java checks the exact project grant by login ID and company. | Reconcile the grants against the actual SCM project roster. Port project creation and lifecycle changes. |
| `/Admin/RequirementDoc`, `/Admin/UnderstandingDoc`, `/PMS/getProjectKickMeetingTable` | The project’s Records tab shows separately linked requirement documents, understanding documents and kickoff records, scoped to the project and company. It shows up to 20 per category with an explicit limit when more exist. | Document content, attachment transfers, approval and revision actions, kickoff scheduling, invite delivery and publishing remain open. |

## Step 5 coverage

| Legacy entry | Native coverage | Open work |
| --- | --- | --- |
| `POST /PMS/getAssignedTaskByMeMobile`, `POST /PMS/getMyTaskList` | My work provides assigned-by-me and assigned-to-me queues with authorized `DaywiseTask` rows, pagination and inline detail. Java resolves the assigner or developer from the verified account and applies the legacy open-task and date-approval conditions to incoming tasks. | Additional staff queues, RFP/compliance and operational task lifecycles remain open. |
| `/Admin/TaskAssigntoDev`, `POST /PMS/saveTaskWithoutPO`, `/Admin/ReassignTaskSide`, `POST /PMS/reassinTaskToDeveloper` | Eligible users can create a general task inside a granted project or from **My work → Create task**. Standalone creation uses a roster-scoped customer, suite, and tool and the JSP’s function and responsibility choices. **My work → Team** supports individual and bulk reassignment. Each task in a batch can have a different assignee, and a rejected item rolls the batch back. | Test live MySQL interoperability and reconcile customer/tool combinations that the original JSP displays outside a user's verified roster. |
| `ProjectData` and `DaywiseTask` | List, Board and Timeline show the same page of explicitly linked project tasks. Search covers the title, description, assignee and status. Confirmed completion from an owned project task refreshes these views. | Apply the mobile migration and provision links from verified SCM records. |
| `/PMS/ViewMyTaskDetails`, `POST /PMS/saveTodaysProgress`, `POST /PMS/updateTaskStatus` | An assignee can enter daily progress, confirm task completion, and reopen the saved work log from the Completed queue. Both My work and the project task sheet use the same service. Isolated Java checks exercise duplicate writes, scoped access, completion retries and rollback when the log insert fails. | Verify the work-log migration against staging MySQL and exercise cross-client concurrency with the original JSP. Assignment and the separate operational and specialist task lifecycles remain open. |
| `POST /PMS/updateModifyDate`, `/PMS/updateMultipleStartEndDate`, `/PMS/approveMultipleEndDate`, `/PMS/approveMultipleStartEndDateMan`, `/PMS/getListOfReviseDateHistory` | An assignee can request a due-date change. A team lead can propose start and due dates with reasons for several team tasks in one batch. Reviewers can compare current and proposed dates and approve multiple eligible requests together. Approved dates update the timeline and enter the shared approval history. | Verify original JSP interoperability on staging MySQL, including pending rows created by older JSP actions. |

The iPhone preview saved a progress note on fixture task T-206, completed the task, and displayed both entries in the Completed queue. Its project board then placed the task in Done. The preview used the isolated Java service and H2 database.

In the date-request preview, the assignee proposed a due date for fixture task T-206 and saw both schedules while approval was pending. The reviewer signed in separately, approved the proposal, and saw it leave the approval queue. The isolated Java suite verifies restored assignee access, updated project dates, approval history, cross-company and self-approval denial, stale and duplicate requests, and rollback when the approval history cannot be written.

In the batch preview, the team lead submitted two distinct schedule changes for tasks T-193 and T-194 on the iPhone simulator. The manager signed in, compared each proposed schedule and reason with the current dates, approved both at once, and saw both leave Approvals. The isolated Java suite verifies requester tracking, rollback of all writes after a stale or invalid item or a failed history insert, mixed approval of new and legacy JSP proposals, and the updated dates and history visible to the assignee.

The iPhone simulator created fixture task T-213 in a project and reassigned it to Noor Paul with the same due date. Isolated Java tests cover roster search and scoping, invalid dates, the weight limit, concurrent retries, rollback when the project link cannot be written, stale reassignment, and visibility from the previous and new assignee accounts.

On a fresh fixture database, the iPhone simulator created standalone task T-213 for Harbor Clinic and opened it in By me. The Team batch reassigned that task to Noor Paul and task T-210 to Dev Singh, and both task details showed the original dates. The isolated Java tests cover standalone roster isolation, classification, receipt retries, visibility, batch rollback with a stale row, and cross-company denial.

The H2-backed Java checks passed for project search, pagination, scoped detail and document reads, assigned-task scope and logout. The iPhone simulator showed the work/contact profile, project search, navigation back with the filter retained, linked records, and expandable task detail. Project browsing and task expansion also worked with Reduce Motion enabled. TypeScript, ESLint, 19 mobile tests, nine Java HTTP tests, and iOS and Android Hermes bundle exports passed. Android runtime interaction and the live MySQL comparison remain open.

The visual direction and motion treatment are in [mobile design notes](mobile-design.md).
