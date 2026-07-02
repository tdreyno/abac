---
"@tdreyno/he-said": minor
---

add `@tdreyno/he-said/drizzle` bridge utilities

Introduces a new Drizzle subpath export with schema-driven helpers:

- `fromFk(columnRef)` for FK-derived relation sources
- `associatesTable(table, { left, right, predicates })`
- `inColumn(columnRef, values)` typed predicate helper
- `drizzleResourceType(table, { owner, contextTerms, fixed })` with composite
  PK context/fixed validation
- `drizzleExecutor(db)` adapter bridge for Drizzle-backed query execution

Also adds package export wiring and optional peer dependency metadata for
`drizzle-orm`.
