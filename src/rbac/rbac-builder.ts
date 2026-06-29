/**
 * RBAC builder: fluent API for defining roles, permissions, and policies
 */

import { term } from "../core/algebra"
import type { Resource, Role, Permission, RoleDerivation } from "./rbac-types"

/**
 * Create a resource primitive
 */
export function resource<T extends string = string>(): Resource<T> {
  return term<{ _resourceBrand: T }>() as Resource<T>
}

/**
 * Role builder with fluent permission chaining
 */
export interface RoleBuilder<T extends string = string> {
  /** Get the underlying role primitive */
  readonly id: Role<T>
  /** Get all permissions defined for this role */
  readonly permissions: Permission[]
  /** Add a permission and return this role for chaining */
  permission(action: string, res: Resource): RoleBuilder<T>
}

/**
 * Create a role primitive with optional permissions
 */
export function role<T extends string = string>(): RoleBuilder<T> {
  const roleId = term<{ _roleBrand: T }>() as Role<T>
  const permissions: Permission[] = []

  const builder: RoleBuilder<T> = {
    id: roleId,
    get permissions() {
      return [...permissions]
    },
    permission(action: string, res: Resource) {
      permissions.push({ action, resource: res })
      return builder
    },
  }

  return builder
}

/**
 * A compiled policy with roles, permissions, and hierarchies
 * Ready to be used by the enforcer
 */
export interface CompiledPolicy {
  readonly roles: RoleBuilder[]
  readonly hierarchies: Array<{ childRole: Role; parentRole: Role }>
}

/**
 * Compile roles, permissions, and role derivations into a policy
 */
export function policy(
  roles: RoleBuilder[],
  hierarchies?: RoleDerivation[],
): CompiledPolicy {
  return {
    roles: [...roles],
    hierarchies: hierarchies ? [...hierarchies] : [],
  }
}
