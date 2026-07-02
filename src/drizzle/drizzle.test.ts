import { pgTable, primaryKey, text } from "drizzle-orm/pg-core"
import { relation, term } from ".."
import { through } from "../rebac"
import {
  associatesTable,
  drizzleExecutor,
  drizzleResourceType,
  fromFk,
  inColumn,
} from "./index"

describe("drizzle bridge", () => {
  it("derives belongsTo relation sources from FK columns", () => {
    const systems = pgTable("systems", { id: text("id").primaryKey() })
    const branches = pgTable("branches", {
      id: text("id").primaryKey(),
      systemId: text("system_id").references(() => systems.id),
    })

    expect(fromFk(branches.systemId)).toEqual({
      kind: "edge",
      table: "branches",
      leftColumn: "id",
      rightColumn: "system_id",
    })
  })

  it("builds association-table sources and typed in predicates", () => {
    const teamMembers = pgTable("team_members", {
      userId: text("user_id").notNull(),
      teamId: text("team_id").notNull(),
      role: text("role").$type<"viewer" | "editor" | "owner">().notNull(),
    })

    expect(
      associatesTable(teamMembers, {
        left: teamMembers.userId,
        right: teamMembers.teamId,
        predicates: [inColumn(teamMembers.role, ["editor", "owner"])],
      }),
    ).toEqual({
      kind: "join-table",
      table: "team_members",
      leftColumn: "user_id",
      rightColumn: "team_id",
      predicates: [{ column: "role", op: "in", values: ["editor", "owner"] }],
    })
  })

  it("derives resource metadata from table PK and validates composite bindings", () => {
    const branchTerm = term<string>()
    const teamTerm = term<string>()
    const nodeInTeam = relation<{ id: string; branchId: string }, string>()
    const nodes = pgTable(
      "canvas_nodes",
      {
        id: text("id").notNull(),
        branchId: text("branch_id").notNull(),
      },
      table => [primaryKey({ columns: [table.id, table.branchId] })],
    )

    const NodeResource = drizzleResourceType(nodes, {
      owner: through(nodeInTeam),
      contextTerms: { branchId: branchTerm },
    })

    expect(NodeResource.table).toBe("canvas_nodes")
    expect(NodeResource.key).toBe("id")
    expect(NodeResource.ownedBy(teamTerm)).toBeDefined()

    expect(() =>
      drizzleResourceType(nodes, {
        owner: through(nodeInTeam),
      }),
    ).toThrow(
      "drizzleResourceType(canvas_nodes) requires contextTerms/fixed for composite PK columns: branch_id",
    )
  })

  it("adapts db.$client.query to PostgresQueryExecutor", async () => {
    const executor = drizzleExecutor({
      $client: {
        query: async <Row extends Record<string, unknown>>() => ({
          rows: [{ ok: true }] as unknown as Row[],
        }),
      },
    })

    await expect(executor.query("SELECT 1", [])).resolves.toEqual({
      rows: [{ ok: true }],
    })
  })
})
