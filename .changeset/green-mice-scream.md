---
"@tdreyno/he-said": minor
---

Fix Postgres `staticFilters` parameter placeholder binding by rewriting local `$n` placeholders to the correct global parameter positions during query planning.

This closes a correctness gap where parameterized static filters could bind to unrelated earlier parameters from environment bindings or other predicates.
