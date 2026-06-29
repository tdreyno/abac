/**
 * RBAC package exports
 *
 * Usage:
 * ```typescript
 * import { enforcer, resource, role, policy } from '@tdreyno/he-said/rbac'
 * ```
 */

export type {
  Resource,
  Role,
  Permission,
  RoleDerivation,
  Context,
  IDMapperConfig,
  PermissionDecision,
} from "./rbac-types"

export { resource, role, policy } from "./rbac-builder"
export type { RoleBuilder, CompiledPolicy } from "./rbac-builder"

export { enforcer } from "./rbac-enforcer"
export type { RBACEnforcer, UserContext, RoleContext } from "./rbac-enforcer"
