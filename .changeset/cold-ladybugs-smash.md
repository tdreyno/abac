---
"@tdreyno/he-said": minor
---

Add ReBAC facade support for globally-bypassed and explicitly-denied actions.

- Add `grant.deny()` to declare an action with no base grant (always false unless bypassed or overridden).
- Add optional `bypass` to `scopedPolicy(...)`, OR'd into every compiled rule so app-admin style overrides live inside the facade.
- Export `DenyGrant` from `@tdreyno/he-said/rebac`.
- Add tests covering deny-only rules, bypass + tiered grants, fail-closed bypass via `exists(resource)`, and override behavior with denied base grants.
- Update ReBAC guide/API docs for `grant.deny()` and `bypass`.
