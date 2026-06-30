/**
 * Basic ABAC example
 */

import {
  action,
  actionIs,
  approve,
  deny,
  enforcer,
  eq,
  eqEnv,
  failure,
  ge,
  policy,
} from "../index"

type User = {
  id: string
  department: string
  clearance: number
  suspended: boolean
}

type Document = {
  ownerId: string
  department: string
  sensitivity: number
}

async function run(): Promise<void> {
  const READ = action("read")
  const RULE_DENY_AFTER_HOURS = failure("Access blocked outside allowed hours.")

  const denySuspended = deny(
    eq((user: User) => user.suspended, true),
    {
      name: "deny-suspended",
      failure: failure("Suspended users cannot access documents."),
      priority: 100,
    },
  )

  const denyAfterHours = deny(
    [
      actionIs(READ),
      eqEnv(
        (environment: { isBusinessHours: boolean }) =>
          environment.isBusinessHours,
        false,
      ),
    ],
    {
      name: "deny-after-hours",
      failure: RULE_DENY_AFTER_HOURS,
      priority: 90,
    },
  )

  const approveRead = approve([
    actionIs(READ),
    eq(
      (user: User) => user.department,
      (resource: Document) => resource.department,
    ),
    ge(
      (user: User) => user.clearance,
      (resource: Document) => resource.sensitivity,
    ),
  ])

  const authz = enforcer(policy(denySuspended, denyAfterHours, approveRead))

  const decision = await authz.can(READ, {
    user: {
      id: "u1",
      department: "engineering",
      clearance: 3,
      suspended: false,
    },
    resource: {
      ownerId: "u2",
      department: "engineering",
      sensitivity: 2,
    },
    environment: {
      isBusinessHours: true,
    },
  })

  console.log("allowed:", decision.allowed)
}

void run()
