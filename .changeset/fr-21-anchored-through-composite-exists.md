---
"@tdreyno/he-said": minor
---

rebac: add bindable through anchors and custom composite existence rules

`through(...)` now supports anchored intermediate hops via
`through(relA).at(term).through(relB, ...)`, allowing callers to bind
composite-path intermediates from context terms.

`resourceType(...)` now accepts `existence(resource, context)` so
`resource.exists()` can be made composite-aware when id-only existence is too
weak.
