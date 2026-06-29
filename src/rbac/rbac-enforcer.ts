/**
 * RBAC enforcer: main API for permission checking and role management
 */

import type {
  Role,
  Permission,
  Context,
  IDMapperConfig,
  PermissionDecision,
} from "./rbac-types"
import type { CompiledPolicy } from "./rbac-builder"

/**
 * Internal fact storage for user-role and role-permission assignments
 */
interface EnforcerFacts {
  userRoles: Map<string, Set<symbol>>
  rolePermissions: Map<symbol, Map<string, symbol>> // role -> (action -> resource)
  roleHierarchies: Map<symbol, Set<symbol>>
  resourceMap: Map<string, symbol> // resourceId -> symbol
}

/**
 * RBAC Enforcer: check permissions and manage roles
 */
export interface RBACEnforcer<
  U = unknown,
  R = unknown,
  C extends Context = Context,
> {
  /**
   * Check if user can perform action on resource
   */
  enforce(
    user: U,
    resource: R | string,
    action: string,
    context?: C,
  ): Promise<PermissionDecision>

  /**
   * Fluent API for user-related queries
   */
  users(user: U): UserContext<C>

  /**
   * Fluent API for role management
   */
  roles(role: Role): RoleContext<U, R, C>
}

/**
 * User context for querying roles and permissions
 */
export interface UserContext<C extends Context = Context> {
  /**
   * Get all roles for this user (optionally scoped to context)
   */
  roles(context?: C): Promise<Role[]>

  /**
   * Get all permissions for this user (optionally scoped to context)
   */
  permissions(context?: C): Promise<Permission[]>
}

/**
 * Role context for managing role assignments and permissions
 */
export interface RoleContext<
  U = unknown,
  R = unknown,
  C extends Context = Context,
> {
  /**
   * Grant this role to a user
   */
  grant(user: U, context?: C): Promise<void>

  /**
   * Revoke this role from a user
   */
  revoke(user: U, context?: C): Promise<void>

  /**
   * Get all permissions for this role
   */
  readonly permissions: Permission[]

  /**
   * Add a permission to this role
   */
  addPermission(
    action: string,
    resource: R | string,
    context?: C,
  ): Promise<void>

  /**
   * Remove a permission from this role
   */
  removePermission(
    action: string,
    resource: R | string,
    context?: C,
  ): Promise<void>

  /**
   * Mark this role as derived from (inheriting) a parent role
   */
  derived(parentRole: Role, context?: C): Promise<void>
}

/**
 * Create an RBAC enforcer with the given policy
 */
export function enforcer<U = unknown, R = unknown, C extends Context = Context>(
  policy: CompiledPolicy,
  idMappers?: IDMapperConfig<U, R, C>,
): RBACEnforcer<U, R, C> {
  // Build initial facts from policy
  const facts: EnforcerFacts = {
    userRoles: new Map(),
    rolePermissions: new Map(),
    roleHierarchies: new Map(),
    resourceMap: new Map(),
  }

  // Build role permission facts from policy and track resource symbols
  for (const roleBuilder of policy.roles) {
    const roleSym = roleBuilder.id as any as symbol
    const actionToResource = new Map<string, symbol>()

    for (const perm of roleBuilder.permissions) {
      const resourceSym = perm.resource as any as symbol
      actionToResource.set(perm.action, resourceSym)
    }

    facts.rolePermissions.set(roleSym, actionToResource)
  }

  // Build role hierarchy facts
  for (const hierarchy of policy.hierarchies) {
    const childSym = hierarchy.childRole as any as symbol
    const parentSym = hierarchy.parentRole as any as symbol

    if (!facts.roleHierarchies.has(childSym)) {
      facts.roleHierarchies.set(childSym, new Set())
    }
    facts.roleHierarchies.get(childSym)!.add(parentSym)
  }

  // Helper to extract IDs from entities
  function getUserId(user: U): string {
    return idMappers?.user?.(user) ?? String(user)
  }

  // Helper to check if role has permission (including via inheritance)
  function roleHasPermission(
    roleSym: symbol,
    action: string,
    resourceSym: symbol,
  ): boolean {
    const rolePerms = facts.rolePermissions.get(roleSym)

    // Direct permission
    if (rolePerms?.get(action) === resourceSym) {
      return true
    }

    // Check parent roles (recursively)
    const parents = facts.roleHierarchies.get(roleSym)
    if (parents) {
      for (const parentSym of parents) {
        if (roleHasPermission(parentSym, action, resourceSym)) {
          return true
        }
      }
    }

    return false
  }

  return {
    async enforce(
      user: U,
      resource: R | string,
      action: string,
      _context?: C,
    ): Promise<PermissionDecision> {
      void _context
      const userId = getUserId(user)

      // Normalize resource to a symbol for matching
      let resourceSym: symbol
      if (typeof resource === "string") {
        // For string resources, look up or create symbol
        if (!facts.resourceMap.has(resource)) {
          // No matching resource found
          return { allowed: false, reason: "Resource not found in policy" }
        }
        resourceSym = facts.resourceMap.get(resource)!
      } else {
        resourceSym = resource as any as symbol
      }

      // Find all roles assigned to this user
      const userRoles = facts.userRoles.get(userId) || new Set()

      for (const roleSym of userRoles) {
        if (roleHasPermission(roleSym as symbol, action, resourceSym)) {
          return { allowed: true }
        }
      }

      return { allowed: false, reason: "No matching permission found" }
    },

    users(user: U): UserContext<C> {
      const userId = getUserId(user)

      return {
        async roles(_context?: C): Promise<Role[]> {
          void _context
          const userRoles = facts.userRoles.get(userId) || new Set()
          return Array.from(userRoles) as Role[]
        },

        async permissions(_context?: C): Promise<Permission[]> {
          void _context
          const userRoles = facts.userRoles.get(userId) || new Set()
          const perms: Permission[] = []

          for (const roleSym of userRoles) {
            const rolePerms = facts.rolePermissions.get(roleSym as symbol)
            if (rolePerms) {
              for (const [action, resource] of rolePerms.entries()) {
                perms.push({
                  action,
                  resource: resource as any,
                })
              }
            }
          }

          return perms
        },
      }
    },

    roles(role: Role): RoleContext<U, R, C> {
      const roleSym = role as any as symbol

      return {
        async grant(user: U, _context?: C): Promise<void> {
          void _context
          const userId = getUserId(user)

          if (!facts.userRoles.has(userId)) {
            facts.userRoles.set(userId, new Set())
          }
          facts.userRoles.get(userId)!.add(roleSym)
        },

        async revoke(user: U, _context?: C): Promise<void> {
          void _context
          const userId = getUserId(user)
          facts.userRoles.get(userId)?.delete(roleSym)
        },

        get permissions(): Permission[] {
          const rolePerms = facts.rolePermissions.get(roleSym) || new Map()
          return Array.from(rolePerms.entries()).map(([action, resource]) => ({
            action,
            resource: resource as any,
          }))
        },

        async addPermission(
          action: string,
          resource: R | string,
          _context?: C,
        ): Promise<void> {
          void _context
          // For simplicity, we'll create a unique resource symbol for string resources
          let resourceSym: symbol
          if (typeof resource === "string") {
            // Look up or create a symbol for this resource ID
            if (!facts.resourceMap.has(resource)) {
              facts.resourceMap.set(resource, Symbol(resource))
            }
            resourceSym = facts.resourceMap.get(resource)!
          } else {
            resourceSym = resource as any as symbol
          }

          if (!facts.rolePermissions.has(roleSym)) {
            facts.rolePermissions.set(roleSym, new Map())
          }
          facts.rolePermissions.get(roleSym)!.set(action, resourceSym)
        },

        async removePermission(
          action: string,
          _resource: R | string,
          _context?: C,
        ): Promise<void> {
          void _context
          void _resource
          const rolePerms = facts.rolePermissions.get(roleSym)
          if (rolePerms?.has(action)) {
            rolePerms.delete(action)
          }
        },

        async derived(parentRole: Role, _context?: C): Promise<void> {
          void _context
          const parentSym = parentRole as any as symbol

          if (!facts.roleHierarchies.has(roleSym)) {
            facts.roleHierarchies.set(roleSym, new Set())
          }
          facts.roleHierarchies.get(roleSym)!.add(parentSym)
        },
      }
    },
  }
}
