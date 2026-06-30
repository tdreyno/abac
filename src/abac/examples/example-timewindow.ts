/**
 * ABAC time-window example
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
  policy,
} from "../index"

type User = {
  id: string
  hasVpn: boolean
}

async function run(): Promise<void> {
  const READ = action("read")

  const denyAfterHoursWithoutVpn = deny(
    [
      actionIs(READ),
      eqEnv(
        (environment: { isBusinessHours: boolean }) =>
          environment.isBusinessHours,
        false,
      ),
      eq((user: User) => user.hasVpn, false),
    ],
    {
      name: "deny-after-hours-without-vpn",
      failure: failure("After-hours access requires VPN."),
      priority: 100,
    },
  )

  const allowRead = approve(actionIs(READ))

  const authz = enforcer(policy(denyAfterHoursWithoutVpn, allowRead))

  const result = await authz.can(READ, {
    user: {
      id: "u1",
      hasVpn: false,
    },
    resource: {
      ownerId: "u2",
    },
    environment: {
      isBusinessHours: false,
    },
  })

  console.log("allowed:", result.allowed)
}

void run()
