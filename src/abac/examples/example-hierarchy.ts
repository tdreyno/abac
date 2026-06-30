/**
 * ABAC hierarchy-style example with action families
 */

import {
  action,
  actionIn,
  approve,
  deny,
  enforcer,
  eq,
  failure,
  ge,
  policy,
} from "../index"

type User = {
  id: string
  role: "staff" | "manager" | "admin"
  department: string
  clearance: number
}

type RecordDoc = {
  ownerId: string
  department: string
  sensitivity: number
}

async function run(): Promise<void> {
  const READ = action("read")
  const UPDATE = action("update")
  const DELETE = action("delete")

  const denyHighSensitivity = deny(
    [
      actionIn(DELETE),
      ge(
        (user: User) => user.clearance,
        (resource: RecordDoc) => resource.sensitivity,
      ),
    ],
    {
      name: "deny-delete-high-sensitivity",
      failure: failure("Delete is blocked for high sensitivity records."),
      priority: 100,
    },
  )

  const adminApprove = approve(actionIn(READ, UPDATE, DELETE), {
    name: "approve-admin",
    priority: 10,
  })

  const managerApprove = approve([
    actionIn(READ, UPDATE),
    eq(
      (user: User) => user.department,
      (resource: RecordDoc) => resource.department,
    ),
    ge(
      (user: User) => user.clearance,
      (resource: RecordDoc) => resource.sensitivity,
    ),
  ])

  const authz = enforcer(
    policy(denyHighSensitivity, adminApprove, managerApprove),
  )

  const result = await authz.can(UPDATE, {
    user: {
      id: "u-manager",
      role: "manager",
      department: "finance",
      clearance: 4,
    },
    resource: {
      ownerId: "u-staff",
      department: "finance",
      sensitivity: 3,
    },
    environment: {
      region: "us",
    },
  })

  console.log("allowed:", result.allowed)
}

void run()
