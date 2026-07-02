---
"@tdreyno/he-said": patch
---

Require `factIsTrue(...)` facts to be explicitly bound during evaluation and planning. Unbound facts now throw instead of silently matching, including in `or`/`not` branches, with regression coverage for in-memory and Postgres adapters plus prepared fact override behavior.
