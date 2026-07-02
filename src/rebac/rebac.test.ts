import {
  and,
  createInMemoryAdapter,
  evaluator,
  exists,
  fact,
  factIsTrue,
  relation,
  term,
  type InMemoryRelationFacts,
  type Rule,
} from ".."
import { either, grant, roleTiers, scopedPolicy, through } from "./index"

type User = string
type Team = string
type Workspace = string
type Project = string
type File = string

describe("rebac facade", () => {
  it("compiles ownership + tiered grants and emits source predicates", async () => {
    const actor = term<User>()
    const scope = term<Team>()

    const fileInProject = relation<File, Project>()
    const projectInTeam = relation<Project, Team>()
    const fileInTeam = relation<File, Team>()
    const memberOfTeam = relation<User, Team>()

    const tiers = roleTiers("viewer", "editor", "owner")
    const policy = scopedPolicy<
      User,
      Team,
      { File: File },
      "update",
      "viewer" | "editor" | "owner"
    >({
      actor,
      scope,
      membership: {
        relation: memberOfTeam,
        roleColumn: "role",
        tiers,
      },
      resources: {
        File: either(
          through(fileInTeam),
          through(fileInProject, projectInTeam),
        ),
      },
      grants: {
        update: grant.atLeast("editor"),
      },
    })

    expect(tiers.atLeast("editor")).toEqual(["editor", "owner"])
    expect(policy.roleRequirementFor("update", "File")).toEqual({
      minimum: "editor",
      predicate: { column: "role", op: "ge", value: "editor" },
      ordering: {
        column: "role",
        order: { viewer: 1, editor: 2, owner: 3 },
      },
    })

    const memberFactsInput: InMemoryRelationFacts<User, Team> = {
      relation: memberOfTeam,
      rows: [
        {
          left: "alice",
          right: "team-1",
          columns: { role: "editor" },
        },
        {
          left: "bob",
          right: "team-1",
          columns: { role: "viewer" },
        },
      ],
      pairs: [["alice", "team-1"] as const, ["bob", "team-1"] as const],
    }

    const adapter = createInMemoryAdapter({
      relations: [
        {
          relation: fileInTeam,
          pairs: [["file-1", "team-1"]],
        },
        {
          relation: fileInProject,
          pairs: [["file-1", "project-1"]],
        },
        {
          relation: projectInTeam,
          pairs: [["project-1", "team-1"]],
        },
        memberFactsInput,
      ],
      domain: ["alice", "bob", "team-1", "file-1"],
    })

    const runtime = evaluator(adapter, { evaluatorContext: null })
    const rule = policy.ruleFor("update", "File")
    const resourceTerm = policy.resourceTerms.File

    await expect(
      runtime.evaluate(rule, {
        [actor]: "alice",
        [resourceTerm]: "file-1",
      }),
    ).resolves.toBe(true)

    await expect(
      runtime.evaluate(rule, {
        [actor]: "bob",
        [resourceTerm]: "file-1",
      }),
    ).resolves.toBe(false)
  })

  it("enforces atLeast tiers in can() without requiring sourceFor wiring", async () => {
    const actor = term<User>()
    const team = term<Team>()
    const fileInTeam = relation<File, Team>()
    const memberOfTeam = relation<User, Team>()

    const adapter = createInMemoryAdapter({
      relations: [
        {
          relation: fileInTeam,
          pairs: [["file-1", "team-1"]],
        },
        {
          relation: memberOfTeam,
          pairs: [
            ["viewer-user", "team-1"],
            ["editor-user", "team-1"],
          ],
          rows: [
            {
              left: "viewer-user",
              right: "team-1",
              columns: { role: "viewer" },
            },
            {
              left: "editor-user",
              right: "team-1",
              columns: { role: "editor" },
            },
          ],
        },
      ],
      domain: ["viewer-user", "editor-user", "team-1", "file-1"],
    })

    const policy = scopedPolicy<
      User,
      Team,
      { File: File },
      "read" | "update",
      "viewer" | "editor"
    >({
      actor,
      scope: team,
      membership: {
        relation: memberOfTeam,
        roleColumn: "role",
        tiers: roleTiers("viewer", "editor"),
      },
      resources: {
        File: through(fileInTeam),
      },
      grants: {
        read: grant.atLeast("viewer"),
        update: grant.atLeast("editor"),
      },
      evaluator: evaluator(adapter, { evaluatorContext: null }),
    })

    await expect(
      policy.can("viewer-user", "read", "File", "file-1"),
    ).resolves.toBe(true)
    await expect(
      policy.can("viewer-user", "update", "File", "file-1"),
    ).resolves.toBe(false)
    await expect(
      policy.can("editor-user", "update", "File", "file-1"),
    ).resolves.toBe(true)
  })

  it("supports read-scope widening with grant.readScope()", async () => {
    const actor = term<User>()
    const team = term<Team>()

    const fileInTeam = relation<File, Team>()
    const teamInWorkspace = relation<Team, Workspace>()
    const memberOfTeam = relation<User, Team>()
    const memberOfWorkspace = relation<User, Workspace>()

    const policy = scopedPolicy<
      User,
      Team,
      { File: File },
      "read",
      "viewer" | "editor",
      Workspace
    >({
      actor,
      scope: team,
      membership: {
        relation: memberOfTeam,
        roleColumn: "role",
        tiers: roleTiers("viewer", "editor"),
      },
      readScope: {
        via: through(teamInWorkspace),
        membership: memberOfWorkspace,
      },
      resources: {
        File: through(fileInTeam),
      },
      grants: {
        read: grant.readScope(),
      },
    })

    const adapter = createInMemoryAdapter({
      relations: [
        {
          relation: fileInTeam,
          pairs: [["file-1", "team-1"]],
        },
        {
          relation: teamInWorkspace,
          pairs: [["team-1", "workspace-1"]],
        },
        {
          relation: memberOfWorkspace,
          pairs: [["alice", "workspace-1"]],
        },
      ],
      domain: ["file-1", "team-1", "workspace-1"],
    })

    const runtime = evaluator(adapter, { evaluatorContext: null })

    await expect(
      runtime.evaluate(policy.ruleFor("read", "File"), {
        [actor]: "alice",
        [policy.resourceTerms.File]: "file-1",
      }),
    ).resolves.toBe(true)
  })

  it("supports override grants as arbitrary core rules", async () => {
    const actor = term<User>()
    const team = term<Team>()
    const fileInTeam = relation<File, Team>()
    const authoredBy = relation<File, User>()

    const policy = scopedPolicy<
      User,
      Team,
      { File: File },
      "read",
      "viewer" | "editor"
    >({
      actor,
      scope: team,
      membership: {
        relation: relation<User, Team>(),
        roleColumn: "role",
        tiers: roleTiers("viewer", "editor"),
      },
      resources: {
        File: through(fileInTeam),
      },
      grants: {
        read: grant.atLeast("viewer"),
      },
      overrides: {
        File: {
          read: ({ resource, actor: actorTerm }): Rule =>
            authoredBy(resource, actorTerm),
        },
      },
    })

    const adapter = createInMemoryAdapter({
      relations: [
        {
          relation: fileInTeam,
          pairs: [["file-1", "team-1"]],
        },
        {
          relation: authoredBy,
          pairs: [["file-1", "alice"]],
        },
      ],
      domain: ["file-1", "team-1", "alice"],
    })

    const runtime = evaluator(adapter, { evaluatorContext: null })
    await expect(
      runtime.evaluate(policy.ruleFor("read", "File"), {
        [actor]: "alice",
        [policy.resourceTerms.File]: "file-1",
      }),
    ).resolves.toBe(true)
  })

  it("compiles grant.deny() to an unconditionally-false rule", async () => {
    const actor = term<User>()
    const team = term<Team>()
    const fileInTeam = relation<File, Team>()

    const policy = scopedPolicy<
      User,
      Team,
      { File: File },
      "read" | "manage",
      "viewer" | "editor"
    >({
      actor,
      scope: team,
      membership: {
        relation: relation<User, Team>(),
        roleColumn: "role",
        tiers: roleTiers("viewer", "editor"),
      },
      resources: {
        File: through(fileInTeam),
      },
      grants: {
        read: grant.atLeast("viewer"),
        manage: grant.deny(),
      },
    })

    const adapter = createInMemoryAdapter({
      relations: [{ relation: fileInTeam, pairs: [["file-1", "team-1"]] }],
      domain: ["file-1", "team-1", "alice"],
    })
    const runtime = evaluator(adapter, { evaluatorContext: null })

    await expect(
      runtime.evaluate(policy.ruleFor("manage", "File"), {
        [actor]: "alice",
        [policy.resourceTerms.File]: "file-1",
      }),
    ).resolves.toBe(false)
    expect(policy.roleRequirementFor("manage", "File")).toBeUndefined()
  })

  it("lets a bypass rule OR into an atLeast grant while staying fail-closed on missing resources", async () => {
    const actor = term<User>()
    const team = term<Team>()
    const fileInTeam = relation<File, Team>()
    const memberOfTeam = relation<User, Team>()
    const isAppAdmin = fact<boolean>()

    const policy = scopedPolicy<
      User,
      Team,
      { File: File },
      "update",
      "viewer" | "editor"
    >({
      actor,
      scope: team,
      membership: {
        relation: memberOfTeam,
        roleColumn: "role",
        tiers: roleTiers("viewer", "editor"),
      },
      resources: {
        File: through(fileInTeam),
      },
      grants: {
        update: grant.atLeast("editor"),
      },
      bypass: ({ resource }) => and(factIsTrue(isAppAdmin), exists(resource)),
    })

    const adapter = createInMemoryAdapter({
      relations: [
        { relation: fileInTeam, pairs: [["file-1", "team-1"]] },
        {
          relation: memberOfTeam,
          pairs: [["viewer-user", "team-1"]],
          rows: [
            {
              left: "viewer-user",
              right: "team-1",
              columns: { role: "viewer" },
            },
          ],
        },
      ],
      domain: ["viewer-user", "admin-user", "team-1", "file-1"],
    })
    const runtime = evaluator(adapter, { evaluatorContext: null })
    const rule = policy.ruleFor("update", "File")
    const resourceTerm = policy.resourceTerms.File

    // Fails the tier check and isn't an admin.
    await expect(
      runtime.evaluate(rule, {
        [actor]: "viewer-user",
        [resourceTerm]: "file-1",
        facts: { [isAppAdmin]: false },
      }),
    ).resolves.toBe(false)

    // Bypasses the tier check as an app admin.
    await expect(
      runtime.evaluate(rule, {
        [actor]: "admin-user",
        [resourceTerm]: "file-1",
        facts: { [isAppAdmin]: true },
      }),
    ).resolves.toBe(true)

    // Fail-closed: admin bypass still requires the resource to exist.
    await expect(
      runtime.evaluate(rule, {
        [actor]: "admin-user",
        [resourceTerm]: "file-missing",
        facts: { [isAppAdmin]: true },
      }),
    ).resolves.toBe(false)
  })

  it("combines grant.deny() with bypass so only the bypass actor can act, and overrides can supersede the deny", async () => {
    const actor = term<User>()
    const team = term<Team>()
    const teamResourceInTeam = relation<string, Team>()
    const isAppAdmin = fact<boolean>()

    const policy = scopedPolicy<
      User,
      Team,
      { Widget: string; System: string },
      "manage",
      "viewer" | "editor"
    >({
      actor,
      scope: team,
      membership: {
        relation: relation<User, Team>(),
        roleColumn: "role",
        tiers: roleTiers("viewer", "editor"),
      },
      resources: {
        Widget: through(teamResourceInTeam),
        System: through(teamResourceInTeam),
      },
      grants: {
        manage: grant.deny(),
      },
      overrides: {
        System: { manage: grant.atLeast("editor") },
      },
      bypass: ({ resource }) => and(factIsTrue(isAppAdmin), exists(resource)),
    })

    const adapter = createInMemoryAdapter({
      relations: [
        {
          relation: teamResourceInTeam,
          pairs: [
            ["widget-1", "team-1"],
            ["system-1", "team-1"],
          ],
        },
        {
          relation: relation<User, Team>(),
          pairs: [],
        },
      ],
      domain: ["widget-1", "system-1", "team-1", "editor-user", "admin-user"],
    })
    const runtime = evaluator(adapter, { evaluatorContext: null })

    // Widget stays denied for a normal (non-admin) actor.
    await expect(
      runtime.evaluate(policy.ruleFor("manage", "Widget"), {
        [actor]: "editor-user",
        [policy.resourceTerms.Widget]: "widget-1",
        facts: { [isAppAdmin]: false },
      }),
    ).resolves.toBe(false)

    // Widget is reachable via the admin bypass.
    await expect(
      runtime.evaluate(policy.ruleFor("manage", "Widget"), {
        [actor]: "admin-user",
        [policy.resourceTerms.Widget]: "widget-1",
        facts: { [isAppAdmin]: true },
      }),
    ).resolves.toBe(true)

    // System overrides the base grant.deny() with an atLeast("editor") grant.
    expect(policy.roleRequirementFor("manage", "System")).toEqual({
      minimum: "editor",
      predicate: { column: "role", op: "ge", value: "editor" },
      ordering: { column: "role", order: { viewer: 1, editor: 2 } },
    })
  })
})
