/**
 * Type definitions for RBAC policy framework
 */

import type { Term } from "../core/algebra"

/**
 * Unique symbol for resource primitives
 */
export type Resource<T extends string = string> = Term<{ _resourceBrand: T }>

/**
 * Unique symbol for role primitives
 */
export type Role<T extends string = string> = Term<{ _roleBrand: T }>

/**
 * A single permission: action on a resource
 */
export interface Permission {
  readonly action: string
  readonly resource: Resource
}

/**
 * Role derivation: parent role includes child role permissions
 */
export interface RoleDerivation {
  readonly parentRole: Role
  readonly childRole: Role
}

/**
 * Generic context for scoping (workspace, org, domain, etc.)
 */
export type Context = Record<string, unknown>

/**
 * ID mapper configuration: extract IDs from entities per type
 */
export type IDMapperConfig<
  User = unknown,
  Resource = unknown,
  Ctx extends Context = Context,
> = {
  user?: (entity: User) => string
  resource?: (entity: Resource) => string
} & {
  [K in keyof Ctx]?: (entity: Ctx[K]) => string
}

/**
 * Result of a permission check
 */
export interface PermissionDecision {
  readonly allowed: boolean
  readonly reason?: string
}
