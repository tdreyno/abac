import { action, actionIs, approve, deny, eq, ge, policy } from "./index"

type User = {
  id: string
  department: string
  clearance: number
  suspended: boolean
}

type Resource = {
  ownerId: string
  department: string
  sensitivity: number
}

const READ = action("read")

const denySuspended = deny(eq((user: User) => user.suspended, true))

const approveRead = approve([
  actionIs(READ),
  eq(
    (user: User) => user.department,
    (resource: Resource) => resource.department,
  ),
  ge(
    (user: User) => user.clearance,
    (resource: Resource) => resource.sensitivity,
  ),
])

policy(denySuspended, approveRead)
