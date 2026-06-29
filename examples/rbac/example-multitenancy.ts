/**
 * Multi-Tenant RBAC Example
 *
 * This example demonstrates how to use RBAC in a multi-tenant environment,
 * where the same user might have different roles in different organizations,
 * workspaces, or teams.
 *
 * The approach is to scope user and resource IDs by tenant.
 */

import { enforcer, resource, role, policy } from "../../src/rbac"

async function main() {
  console.log("=== Multi-Tenant RBAC Example ===\n")

  // Define resources
  const document = resource<"document">()
  const workspace = resource<"workspace">()

  console.log("Defined resources: document, workspace\n")

  // Define roles
  const member = role().permission("read", document)

  const admin = role()
    .permission("read", document)
    .permission("write", document)
    .permission("delete", document)
    .permission("read", workspace)
    .permission("write", workspace)

  console.log("Defined roles:")
  console.log(`  - member: can read documents`)
  console.log(
    `  - admin: can read/write/delete documents and manage workspace\n`,
  )

  const rbac = enforcer(policy([member, admin], []))

  // Scenario: Multiple organizations
  const orgA = "org:acme"
  const orgB = "org:globex"
  const docAId = "doc:1:in:acme"
  const docBId = "doc:2:in:globex"

  console.log("Scenario: Two organizations (ACME and Globex)\n")

  // Alice: admin at ACME, member at Globex
  console.log("Setting up users and roles:")
  await rbac.roles(admin.id).grant(`${orgA}:alice`)
  await rbac.roles(member.id).grant(`${orgB}:alice`)
  console.log("  - alice: admin at ACME, member at Globex")

  // Bob: member at ACME
  await rbac.roles(member.id).grant(`${orgA}:bob`)
  console.log("  - bob: member at ACME")

  // Charlie: admin at Globex
  await rbac.roles(admin.id).grant(`${orgB}:charlie`)
  console.log("  - charlie: admin at Globex\n")

  // Check permissions
  console.log("Permission checks:")

  const checks = [
    {
      org: orgA,
      user: "alice",
      doc: docAId,
      action: "write",
      expected: true,
    },
    {
      org: orgB,
      user: "alice",
      doc: docBId,
      action: "write",
      expected: false,
    },
    {
      org: orgA,
      user: "bob",
      doc: docAId,
      action: "write",
      expected: false,
    },
    {
      org: orgB,
      user: "charlie",
      doc: docBId,
      action: "write",
      expected: true,
    },
  ]

  for (const check of checks) {
    const result = await rbac.enforce(
      `${check.org}:${check.user}`,
      check.doc,
      check.action,
    )
    const status = result.allowed === check.expected ? "✓" : "✗"
    console.log(
      `  ${status} alice in ${check.org} can ${check.action} doc: ${result.allowed}`,
    )
  }

  console.log()

  // Query organization-specific information
  console.log("Querying organization-specific information:")

  const aliceAcmeRoles = await rbac.users(`${orgA}:alice`).roles()
  const aliceGlobexRoles = await rbac.users(`${orgB}:alice`).roles()

  console.log(`  alice at ACME: ${aliceAcmeRoles.length} role(s)`)
  console.log(`  alice at Globex: ${aliceGlobexRoles.length} role(s)\n`)

  // Scenario: Workspace-based scoping
  console.log("Scenario: Workspace-based scoping\n")

  const ws1 = "workspace:123"
  const ws2 = "workspace:456"
  const userId = "user:diana"

  console.log("Setting up workspace access:")
  await rbac.roles(admin.id).grant(`${ws1}:${userId}`)
  await rbac.roles(member.id).grant(`${ws2}:${userId}`)
  console.log("  - diana: admin in workspace:123, member in workspace:456\n")

  console.log("Permission checks:")

  const ws1Doc = `doc:w1d1:in:${ws1}`
  const ws2Doc = `doc:w2d1:in:${ws2}`

  const diana1Write = await rbac.enforce(`${ws1}:${userId}`, ws1Doc, "write")
  const diana2Write = await rbac.enforce(`${ws2}:${userId}`, ws2Doc, "write")

  console.log(`  diana can write in workspace:123: ${diana1Write.allowed}`)
  console.log(`  diana can write in workspace:456: ${diana2Write.allowed}\n`)

  // Summary
  console.log("Multi-Tenant Strategy:")
  console.log("  1. Prefix user and resource IDs with tenant/org/workspace ID")
  console.log("  2. Use the same roles for all tenants")
  console.log("  3. Grant roles independently per tenant")
  console.log("  4. Check permissions with tenant-scoped IDs")
  console.log()
  console.log("  This approach allows:")
  console.log("  - Users to have different roles in different tenants")
  console.log("  - Single RBAC instance serving multiple tenants")
  console.log("  - Easy tenant isolation via ID prefixing")

  console.log("\n=== Example Complete ===")
}

main().catch(console.error)
