---
"@tdreyno/he-said": minor
---

Add RBAC (Role-Based Access Control) package with fluent API for role and permission management.

**New exports** (`@tdreyno/he-said/rbac`):
- `resource<T>()`: Create unique resource primitives
- `role<T>()`: Create roles with fluent `.permission()` chaining
- `policy(roles[], hierarchies?)`: Compile roles and hierarchies into a policy
- `enforcer(policy, idMappers?)`: Create RBAC enforcer instance
- `RBACEnforcer<U, R, C>`: Main enforcer interface with `.enforce()`, `.users()`, `.roles()` fluent APIs

**Key features**:
- Symbol-based resource and role identity for type-safe matching
- In-memory fact storage with role hierarchies support
- Fluent API for role assignment, permission management, and user queries
- Support for multi-tenancy via custom ID mappers

**Core algebra enhancements**:
- `derives(entity, from)`: Model transitive entity relationships (role hierarchies, permission delegation)
- `given(rule, context)`: Scope rules to contexts (workspaces, time windows, conditions)
- Both primitives are pattern-agnostic and work with RBAC, ABAC, and ReBAC equally

**Documentation**:
- `docs/rbac-guide.md`: Comprehensive guide covering core concepts, usage patterns, and best practices
- `docs/rbac-api.md`: Complete API reference with signatures, parameters, and examples
- `examples/rbac/`: Three working examples (basic, hierarchy, multi-tenancy)
- Updated `docs/core-concepts.md` with derives/given documentation

**Package updates**:
- Added `exports` field in `package.json` for subpath support (`@tdreyno/he-said/rbac`)
- Updated `README.md` with RBAC section and documentation links
