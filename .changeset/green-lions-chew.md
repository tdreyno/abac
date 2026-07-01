---
"@tdreyno/he-said": minor
---

Add set-returning authorization support with `instance.filter(...)` across in-memory and Postgres adapters, plus `planPostgresPredicate(...)` for composable parameterized `EXISTS(...)` SQL fragments.

This also adds tests and docs updates for batch authorization flows and predicate composition.
