# RBAC API Reference

Complete API documentation for `@tdreyno/he-said/rbac`.

## Imports

```typescript
import {
  enforcer,
  resource,
  role,
  policy,
  // Types
  type Resource,
  type Role,
  type Permission,
  type RoleDerivation,
  type RBACEnforcer,
  type PermissionDecision,
  type Context,
  type IDMapperConfig,
  type RoleBuilder,
  type CompiledPolicy,
} from "@tdreyno/he-said/rbac"
```

## Builder API

### `resource<T>()`

Create a resource primitive.

**Signature:**

```typescript
function resource<T extends string = string>(): Resource<T>
```

**Parameters:** None

**Returns:** A unique `Resource<T>` symbol

**Example:**

```typescript
const post = resource<"post">()
const comment = resource<"comment">()
const user = resource<"user">()
```

**Notes:**

- Each call creates a new unique resource
- Type parameter `T` is optional and for documentation only
- Resources are compared by identity (===)

---

### `role<T>()`

Create a role with fluent permission chaining.

**Signature:**

```typescript
function role<T extends string = string>(): RoleBuilder<T>
```

**Parameters:** None

**Returns:** A `RoleBuilder<T>` instance

**Example:**

```typescript
const admin = role<"admin">()
  .permission("read", post)
  .permission("write", post)
  .permission("delete", post)
```

**Notes:**

- Type parameter `T` is optional and for documentation only
- Returns a builder that supports fluent chaining

---

### `RoleBuilder`

**Properties:**

#### `id: Role<T>`

The underlying role primitive. Pass this to enforcer methods.

```typescript
const admin = role()
const adminId = admin.id
await rbac.roles(adminId).grant("alice")
```

#### `permissions: Permission[]`

Get all permissions defined for this role (read-only).

```typescript
const admin = role().permission("read", post).permission("write", post)
console.log(admin.permissions.length) // 2
```

---

### `RoleBuilder.permission(action, resource)`

Add a permission to a role and return the role for chaining.

**Signature:**

```typescript
permission(action: string, res: Resource): RoleBuilder<T>
```

**Parameters:**

- `action` (string): The action name (e.g., 'read', 'write', 'delete')
- `res` (Resource): The resource primitive to grant permission on

**Returns:** The same `RoleBuilder` instance (for chaining)

**Example:**

```typescript
const editor = role()
  .permission("read", post)
  .permission("write", post)
  .permission("read", comment)
  .permission("write", comment)
```

---

### `policy(roles, hierarchies?)`

Compile roles and optional role hierarchies into a policy for the enforcer.

**Signature:**

```typescript
function policy(
  roles: RoleBuilder[],
  hierarchies?: RoleDerivation[],
): CompiledPolicy
```

**Parameters:**

- `roles` (RoleBuilder[]): Array of role builders
- `hierarchies` (RoleDerivation[], optional): Array of role inheritance definitions

**Returns:** A `CompiledPolicy` object

**Example:**

```typescript
const admin = role().permission("read", post).permission("delete", post)
const editor = role().permission("read", post).permission("write", post)
const viewer = role().permission("read", post)

const rbacPolicy = policy([admin, editor, viewer], [])

// With hierarchies
const member = role().permission("read", post)
const manager = role().permission("approve", post)
const director = role()

const rbacPolicy2 = policy(
  [member, manager, director],
  [
    { childRole: member.id, parentRole: manager.id },
    { childRole: manager.id, parentRole: director.id },
  ],
)
```

---

## Enforcer Factory

### `enforcer(policy, idMappers?)`

Create an RBAC enforcer instance.

**Signature:**

```typescript
function enforcer<U = unknown, R = unknown, C extends Context = Context>(
  policy: CompiledPolicy,
  idMappers?: IDMapperConfig<U, R, C>,
): RBACEnforcer<U, R, C>
```

**Parameters:**

- `policy` (CompiledPolicy): The compiled policy from `policy()`
- `idMappers` (IDMapperConfig, optional): Custom entity-to-ID extractors

**Returns:** An `RBACEnforcer` instance

**Example:**

```typescript
const rbac = enforcer(policy([admin, editor, viewer], []))

// With custom ID mappers
interface User {
  id: string
}
interface Document {
  id: string
}

const rbac2 = enforcer(policy([admin, editor, viewer], []), {
  user: (entity: User) => entity.id,
  resource: (entity: Document) => entity.id,
})
```

---

## RBACEnforcer API

### `.enforce(user, resource, action, context?)`

Check if a user can perform an action on a resource.

**Signature:**

```typescript
enforce(
  user: U,
  resource: R | string,
  action: string,
  context?: C
): Promise<PermissionDecision>
```

**Parameters:**

- `user` (U): The user to check (string or custom type)
- `resource` (R | string): The resource to check (Resource symbol or string)
- `action` (string): The action name (e.g., 'read', 'write', 'delete')
- `context` (C, optional): Additional context (for future use)

**Returns:** Promise resolving to `PermissionDecision`

**Example:**

```typescript
const decision = await rbac.enforce("alice", post, "write")

if (decision.allowed) {
  // Grant access
} else {
  console.error("Denied:", decision.reason)
}
```

---

### `.users(user)`

Get fluent API for user-related queries.

**Signature:**

```typescript
users(user: U): UserContext<C>
```

**Parameters:**

- `user` (U): The user to query

**Returns:** A `UserContext` object

**Example:**

```typescript
const roles = await rbac.users("alice").roles()
const perms = await rbac.users("alice").permissions()
```

---

### `.users().roles(context?)`

Get all roles assigned to a user.

**Signature:**

```typescript
roles(context?: C): Promise<Role[]>
```

**Parameters:**

- `context` (C, optional): Additional context (for future use)

**Returns:** Promise resolving to array of `Role` symbols

**Example:**

```typescript
const userRoles = await rbac.users("alice").roles()
console.log(userRoles.includes(editor.id)) // true or false
```

---

### `.users().permissions(context?)`

Get all permissions available to a user across all assigned roles.

**Signature:**

```typescript
permissions(context?: C): Promise<Permission[]>
```

**Parameters:**

- `context` (C, optional): Additional context (for future use)

**Returns:** Promise resolving to array of `Permission` objects

**Example:**

```typescript
const perms = await rbac.users("alice").permissions()
// [
//   { action: 'read', resource: post },
//   { action: 'write', resource: post },
// ]
```

---

### `.roles(role)`

Get fluent API for role management.

**Signature:**

```typescript
roles(role: Role): RoleContext<U, R, C>
```

**Parameters:**

- `role` (Role): The role symbol (from `role().id`)

**Returns:** A `RoleContext` object

**Example:**

```typescript
await rbac.roles(editor.id).grant("alice")
await rbac.roles(editor.id).addPermission("delete", post)
```

---

### `.roles().grant(user, context?)`

Assign a role to a user.

**Signature:**

```typescript
grant(user: U, context?: C): Promise<void>
```

**Parameters:**

- `user` (U): The user to grant the role to
- `context` (C, optional): Additional context (for future use)

**Returns:** Promise that resolves when complete

**Example:**

```typescript
await rbac.roles(editor.id).grant("alice")
```

---

### `.roles().revoke(user, context?)`

Remove a role assignment from a user.

**Signature:**

```typescript
revoke(user: U, context?: C): Promise<void>
```

**Parameters:**

- `user` (U): The user to revoke the role from
- `context` (C, optional): Additional context (for future use)

**Returns:** Promise that resolves when complete

**Example:**

```typescript
await rbac.roles(editor.id).revoke("alice")
```

---

### `.roles().permissions`

Get all permissions defined for a role (getter, not async).

**Signature:**

```typescript
readonly permissions: Permission[]
```

**Example:**

```typescript
const editorPerms = rbac.roles(editor.id).permissions
console.log(editorPerms) // [{ action: 'read', resource }, ...]
```

---

### `.roles().addPermission(action, resource, context?)`

Add a permission to a role.

**Signature:**

```typescript
addPermission(
  action: string,
  resource: R | string,
  context?: C
): Promise<void>
```

**Parameters:**

- `action` (string): The action name
- `resource` (R | string): The resource (Resource symbol or string)
- `context` (C, optional): Additional context (for future use)

**Returns:** Promise that resolves when complete

**Example:**

```typescript
await rbac.roles(editor.id).addPermission("delete", post)
```

---

### `.roles().removePermission(action, resource, context?)`

Remove a permission from a role.

**Signature:**

```typescript
removePermission(
  action: string,
  resource: R | string,
  context?: C
): Promise<void>
```

**Parameters:**

- `action` (string): The action name
- `resource` (R | string): The resource (Resource symbol or string)
- `context` (C, optional): Additional context (for future use)

**Returns:** Promise that resolves when complete

**Example:**

```typescript
await rbac.roles(editor.id).removePermission("delete", post)
```

---

### `.roles().derived(parentRole, context?)`

Set up role inheritance (child role derives from parent).

**Signature:**

```typescript
derived(parentRole: Role, context?: C): Promise<void>
```

**Parameters:**

- `parentRole` (Role): The parent role to inherit from
- `context` (C, optional): Additional context (for future use)

**Returns:** Promise that resolves when complete

**Example:**

```typescript
const member = role().permission("read", post)
const manager = role().permission("approve", post)

// Set up hierarchy: manager inherits from member
await rbac.roles(manager.id).derived(member.id)

// Now manager has both 'read' and 'approve' permissions
```

---

## Types

### `Resource<T>`

A unique resource primitive (Symbol). Created with `resource<T>()`.

```typescript
const post = resource<"post">()
// post is a unique symbol used for identity checks
```

---

### `Role<T>`

A unique role primitive (Symbol). Created with `role().id`.

```typescript
const admin = role()
const adminId = admin.id
// adminId is a unique symbol used for identity checks
```

---

### `Permission`

Represents a single action on a resource.

```typescript
interface Permission {
  readonly action: string
  readonly resource: Resource
}
```

---

### `RoleDerivation`

Defines parent/child role relationships for inheritance.

```typescript
interface RoleDerivation {
  readonly parentRole: Role
  readonly childRole: Role
}
```

---

### `PermissionDecision`

Result of a permission check.

```typescript
interface PermissionDecision {
  readonly allowed: boolean
  readonly reason?: string
}
```

---

### `Context`

Generic record type for multi-tenant or contextual scoping.

```typescript
type Context = Record<string, unknown>
```

---

### `IDMapperConfig<U, R, C>`

Custom entity-to-ID extractors.

```typescript
type IDMapperConfig<
  User = unknown,
  Resource = unknown,
  Ctx extends Context = Context,
> = {
  user?: (entity: User) => string
  resource?: (entity: Resource) => string
} & {
  [K in keyof Ctx]?: (entity: Ctx[K]) => string
}
```

**Example:**

```typescript
interface User {
  id: string
  name: string
}
interface Document {
  id: string
  title: string
}

const idMappers: IDMapperConfig<User, Document> = {
  user: u => u.id,
  resource: d => d.id,
}

const rbac = enforcer(policy, idMappers)
```

---

### `RoleBuilder<T>`

Fluent builder for roles. See [RoleBuilder](#rolebuilder) section above.

---

### `CompiledPolicy`

A compiled policy ready for the enforcer. Returned by `policy()`.

---

### `RBACEnforcer<U, R, C>`

The main enforcer interface. Returned by `enforcer()`.

---

### `UserContext<C>`

Fluent API for user queries. Returned by `.users()`.

```typescript
interface UserContext<C extends Context = Context> {
  roles(context?: C): Promise<Role[]>
  permissions(context?: C): Promise<Permission[]>
}
```

---

### `RoleContext<U, R, C>`

Fluent API for role management. Returned by `.roles()`.

```typescript
interface RoleContext<U = unknown, R = unknown, C extends Context = Context> {
  grant(user: U, context?: C): Promise<void>
  revoke(user: U, context?: C): Promise<void>
  readonly permissions: Permission[]
  addPermission(
    action: string,
    resource: R | string,
    context?: C,
  ): Promise<void>
  removePermission(
    action: string,
    resource: R | string,
    context?: C,
  ): Promise<void>
  derived(parentRole: Role, context?: C): Promise<void>
}
```

---

## Complete Example

```typescript
import { enforcer, resource, role, policy } from "@tdreyno/he-said/rbac"

// 1. Define resources
const post = resource<"post">()
const comment = resource<"comment">()

// 2. Define roles
const viewer = role().permission("read", post).permission("read", comment)

const editor = role()
  .permission("read", post)
  .permission("write", post)
  .permission("read", comment)
  .permission("write", comment)

const admin = role()
  .permission("read", post)
  .permission("write", post)
  .permission("delete", post)
  .permission("read", comment)
  .permission("write", comment)
  .permission("delete", comment)

// 3. Create enforcer
const rbac = enforcer(policy([viewer, editor, admin], []))

// 4. Grant roles
await rbac.roles(editor.id).grant("alice")
await rbac.roles(viewer.id).grant("bob")

// 5. Check permissions
const aliceWrite = await rbac.enforce("alice", post, "write")
console.log(aliceWrite.allowed) // true

const bobWrite = await rbac.enforce("bob", post, "write")
console.log(bobWrite.allowed) // false

// 6. Query and manage
const aliceRoles = await rbac.users("alice").roles()
console.log(aliceRoles.includes(editor.id)) // true

await rbac.roles(editor.id).addPermission("delete", post)
const aliceDelete = await rbac.enforce("alice", post, "delete")
console.log(aliceDelete.allowed) // true
```
