# SCM Mobile design notes

- **Product:** An internal workspace for staff handling SCM projects, proposals, approvals and service requests.
- **Character:** Exact, composed, practical.
- **World:** An operations register in a service desk, with cool graphite and a single Velox blue accent.
- **Moments:** The indexed register on the entry screen, and the trace from account details to verified identity during sign-in.
- **Signature:** A thin blue trace marks the current real step; completed identity is shown only after the service confirms it.

The original entry screen’s orbit and looping halo had no connection to an SCM task. The “Foundation” pill, wide all-caps labels, and saturated surfaces split attention with the connection action. The refreshed screen keeps the SCM name and server check, uses a 4-point spacing rhythm and one neutral ramp, and replaces the hero with a register of the existing SCM areas. Nothing in the register represents availability or invented activity. The fields, labels and verification rail use a consistent alignment and lighter type. Focus, step changes, and confirmations animate through opacity and transforms; those transitions are instantaneous with Reduce Motion enabled.

The requester workspace carries the blue trace into the tab rail. The Overview uses bars sized to the share of real incidents in each status, with exact counts beside them. Activity uses the incident ID as the first item on each ledger row. The tab marker springs from its current position, while the new pane enters from the selected tab’s direction and the bars draw in sequence. Reduce Motion displays the selected tab, pane and bar lengths immediately.

Projects and tasks use the references people already recognize from SCM. Project rows enter in a short stagger and respond to touch with a native spring. Task details reveal below the selected row with their status held in view. Linked documents and kickoff records share a ruled register. Reduce Motion presents the same records and actions immediately.

Design audit and passes informed by [unslop](https://github.com/heydamir/unslop/tree/main/skills/unslop) by Damir Sokolovsky ([@heydamir](https://x.com/heydamir)), CC BY 4.0.
