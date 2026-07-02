---
"@tdreyno/he-said": patch
---

Fix postgres `filter(..., { candidates })` for typed term domains by using a domain-table `ANY(...)` candidate query instead of untyped `VALUES`, preventing `uuid = text` errors. Adds unit and integration regression coverage for UUID-backed domains.
