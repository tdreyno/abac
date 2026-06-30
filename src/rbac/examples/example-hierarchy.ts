/**
 * Role Hierarchy Example
 *
 * This example demonstrates role hierarchies, where roles can inherit
 * permissions from other roles. This is useful for organizational
 * structures like team member -> team lead -> manager -> director.
 */

import { enforcer, resource, role, policy } from "../index"

async function main() {
  console.log("=== Role Hierarchy Example ===\n")

  // Define a resource
  const document = resource<"document">()
  console.log("Defined resource: document\n")

  // Define roles with hierarchical permissions
  const member = role().permission("read", document)

  const lead = role().permission("review", document)

  const manager = role().permission("assign", document)

  const director = role().permission("approve", document)

  console.log("Defined roles:")
  console.log(`  - member: can 'read'`)
  console.log(`  - lead: can 'review'`)
  console.log(`  - manager: can 'assign'`)
  console.log(`  - director: can 'approve'\n`)

  // Set up hierarchies: each role inherits from the one below
  // director inherits from manager
  // manager inherits from lead
  // lead inherits from member
  const rbacPolicy = policy(
    [member, lead, manager, director],
    [
      { childRole: member.id, parentRole: lead.id },
      { childRole: lead.id, parentRole: manager.id },
      { childRole: manager.id, parentRole: director.id },
    ],
  )

  console.log("Set up inheritance chain:")
  console.log("  director → manager → lead → member\n")

  const rbac = enforcer(rbacPolicy)

  // Test 1: Grant member role
  console.log("Test 1: User with member role")
  await rbac.roles(member.id).grant("alice")

  const aliceRead = await rbac.enforce("alice", document, "read")
  const aliceReview = await rbac.enforce("alice", document, "review")

  console.log(`  alice can read: ${aliceRead.allowed}`)
  console.log(`  alice can review: ${aliceReview.allowed}\n`)

  // Test 2: Grant lead role
  console.log("Test 2: User with lead role")
  await rbac.roles(lead.id).grant("bob")

  const bobRead = await rbac.enforce("bob", document, "read")
  const bobReview = await rbac.enforce("bob", document, "review")
  const bobAssign = await rbac.enforce("bob", document, "assign")

  console.log(`  bob can read: ${bobRead.allowed}`)
  console.log(`  bob can review: ${bobReview.allowed}`)
  console.log(`  bob can assign: ${bobAssign.allowed}\n`)

  // Test 3: Grant director role
  console.log("Test 3: User with director role")
  await rbac.roles(director.id).grant("charlie")

  const charlieRead = await rbac.enforce("charlie", document, "read")
  const charlieReview = await rbac.enforce("charlie", document, "review")
  const charlieAssign = await rbac.enforce("charlie", document, "assign")
  const charlieApprove = await rbac.enforce("charlie", document, "approve")

  console.log(`  charlie can read: ${charlieRead.allowed}`)
  console.log(`  charlie can review: ${charlieReview.allowed}`)
  console.log(`  charlie can assign: ${charlieAssign.allowed}`)
  console.log(`  charlie can approve: ${charlieApprove.allowed}\n`)

  // Test 4: Setting up derived permissions dynamically
  console.log("Test 4: Dynamic hierarchy setup")
  console.log("  Setting manager to derive from lead...")
  await rbac.roles(manager.id).derived(lead.id)
  console.log("  Setting lead to derive from member...")
  await rbac.roles(lead.id).derived(member.id)

  // Grant a user a middle role
  await rbac.roles(manager.id).grant("diana")

  const dianaRead = await rbac.enforce("diana", document, "read")
  const dianaReview = await rbac.enforce("diana", document, "review")
  const dianaAssign = await rbac.enforce("diana", document, "assign")
  const dianaApprove = await rbac.enforce("diana", document, "approve")

  console.log(`  diana (manager) can read: ${dianaRead.allowed}`)
  console.log(`  diana (manager) can review: ${dianaReview.allowed}`)
  console.log(`  diana (manager) can assign: ${dianaAssign.allowed}`)
  console.log(`  diana (manager) can approve: ${dianaApprove.allowed}\n`)

  // Summary
  console.log("Summary:")
  console.log("  With role hierarchies, users at higher levels inherit")
  console.log("  permissions from lower levels in the organizational chain.")
  console.log("  This reduces permission duplication and makes it easy to")
  console.log("  model organizational structures.")

  console.log("\n=== Example Complete ===")
}

main().catch(console.error)
