/**
 * Basic RBAC Example
 *
 * This example demonstrates the fundamental RBAC pattern:
 * - Define resources (things to protect)
 * - Define roles with permissions
 * - Assign roles to users
 * - Check permissions in your application
 */

import { enforcer, resource, role, policy } from "../index"

async function main() {
  console.log("=== Basic RBAC Example ===\n")

  // Step 1: Define resources
  const post = resource<"post">()
  const comment = resource<"comment">()

  console.log("Defined resources: post, comment\n")

  // Step 2: Define roles with permissions
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

  console.log("Defined roles:")
  console.log(`  - viewer: ${viewer.permissions.length} permissions`)
  console.log(`  - editor: ${editor.permissions.length} permissions`)
  console.log(`  - admin: ${admin.permissions.length} permissions\n`)

  // Step 3: Create the enforcer
  const rbac = enforcer(policy([viewer, editor, admin], []))
  console.log("Created RBAC enforcer\n")

  // Step 4: Grant roles to users
  console.log("Granting roles...")
  await rbac.roles(viewer.id).grant("alice")
  await rbac.roles(editor.id).grant("bob")
  await rbac.roles(admin.id).grant("charlie")
  console.log("  - alice: viewer")
  console.log("  - bob: editor")
  console.log("  - charlie: admin\n")

  // Step 5: Check permissions
  console.log("Checking permissions:")

  const checks = [
    { user: "alice", resource: post, action: "read", expected: true },
    { user: "alice", resource: post, action: "write", expected: false },
    { user: "alice", resource: post, action: "delete", expected: false },
    { user: "bob", resource: post, action: "read", expected: true },
    { user: "bob", resource: post, action: "write", expected: true },
    { user: "bob", resource: post, action: "delete", expected: false },
    { user: "charlie", resource: post, action: "read", expected: true },
    { user: "charlie", resource: post, action: "write", expected: true },
    { user: "charlie", resource: post, action: "delete", expected: true },
  ]

  for (const check of checks) {
    const result = await rbac.enforce(check.user, check.resource, check.action)
    const status = result.allowed === check.expected ? "✓" : "✗"
    console.log(
      `  ${status} ${check.user} can ${check.action} post: ${result.allowed}`,
    )
  }

  console.log()

  // Step 6: Query user roles and permissions
  console.log("Querying user information:")

  for (const user of ["alice", "bob", "charlie"]) {
    const roles = await rbac.users(user).roles()
    const perms = await rbac.users(user).permissions()
    console.log(
      `  ${user}: ${roles.length} role(s), ${perms.length} permission(s)`,
    )

    for (const perm of perms) {
      console.log(`    - ${perm.action}`)
    }
  }

  console.log()

  // Step 7: Dynamic permission management
  console.log("Adding permission to editor...")
  await rbac.roles(editor.id).addPermission("delete", comment)
  console.log("  - editor can now delete comments\n")

  const bobDelete = await rbac.enforce("bob", comment, "delete")
  console.log(`  bob can delete comment: ${bobDelete.allowed}\n`)

  // Step 8: Revoking roles
  console.log("Revoking bob's editor role...")
  await rbac.roles(editor.id).revoke("bob")
  console.log("  - bob no longer has editor role\n")

  const bobWrite = await rbac.enforce("bob", post, "write")
  console.log(`  bob can write post: ${bobWrite.allowed}\n`)

  console.log("=== Example Complete ===")
}

main().catch(console.error)
