import {
  getTableConfig,
  type AnyPgColumn,
  type AnyPgTable,
} from "drizzle-orm/pg-core"
import type {
  PostgresJoinTableRelationSource,
  PostgresQueryExecutor,
} from "../core/algebra-postgres"
import type { SourcePredicate, Term } from "../core/algebra"
import { associates, belongsTo } from "../core/algebra-postgres-helpers"
import type { ScopePath } from "../rebac/rebac-builder"
import { resourceType, type ResourceType } from "../rebac/resource-type"

type TableName = {
  name: string
  schema?: string
}

const qualifyTable = ({ name, schema }: TableName): string => {
  return schema ? `${schema}.${name}` : name
}

const primaryKeyColumns = (table: AnyPgTable): ReadonlyArray<AnyPgColumn> => {
  const config = getTableConfig(table)
  const explicitPrimaryKeys = config.primaryKeys.flatMap(entry => entry.columns)
  if (explicitPrimaryKeys.length > 0) {
    return explicitPrimaryKeys
  }
  return config.columns.filter(column => column.primary)
}

const requireSingleColumn = (
  columns: ReadonlyArray<AnyPgColumn>,
  context: string,
): AnyPgColumn => {
  if (columns.length !== 1) {
    throw new Error(`${context} requires a single-column mapping`)
  }
  return columns[0]!
}

export const fromFk = (column: AnyPgColumn) => {
  const table = column.table as AnyPgTable
  const tableConfig = getTableConfig(table)
  const matchingFks = tableConfig.foreignKeys.filter(fk => {
    const reference = fk.reference()
    return reference.columns.some(entry => entry.name === column.name)
  })
  if (matchingFks.length === 0) {
    throw new Error(
      `fromFk could not find an FK mapping for column "${column.name}"`,
    )
  }
  if (matchingFks.length > 1) {
    throw new Error(
      `fromFk found multiple FK mappings for column "${column.name}"`,
    )
  }

  const fk = matchingFks[0]!
  const reference = fk.reference()
  const foreignColumn = requireSingleColumn(
    reference.columns,
    `fromFk(${column.name})`,
  )
  const leftPrimaryKey = requireSingleColumn(
    primaryKeyColumns(table),
    `fromFk(${column.name})`,
  )

  return belongsTo({
    table: qualifyTable({ name: tableConfig.name, schema: tableConfig.schema }),
    fk: foreignColumn.name,
    pk: leftPrimaryKey.name,
  })
}

export const inColumn = <T>(
  column: AnyPgColumn,
  values: ReadonlyArray<T>,
): SourcePredicate => {
  return {
    column: column.name,
    op: "in",
    values,
  }
}

export const associatesTable = (
  table: AnyPgTable,
  options: {
    left: AnyPgColumn
    right: AnyPgColumn
    predicates?: ReadonlyArray<SourcePredicate>
  },
): PostgresJoinTableRelationSource => {
  const tableConfig = getTableConfig(table)
  return associates({
    table: qualifyTable({ name: tableConfig.name, schema: tableConfig.schema }),
    left: options.left.name,
    right: options.right.name,
    predicates: options.predicates,
  })
}

type ContextTerms = Record<string, Term<any>>

const selectResourceKey = (
  columns: ReadonlyArray<AnyPgColumn>,
): AnyPgColumn => {
  const idColumn = columns.find(column => column.name === "id")
  return idColumn ?? columns[0]!
}

const toCamelCase = (value: string): string => {
  return value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())
}

export const drizzleResourceType = <
  TTable extends AnyPgTable,
  Scope,
  Context extends ContextTerms = Record<never, never>,
>(
  table: TTable,
  options: {
    owner: ScopePath<TTable["$inferSelect"], Scope>
    contextTerms?: Context
    fixed?: Readonly<Record<string, unknown>>
  },
): ResourceType<TTable["$inferSelect"], Scope, Context> => {
  const tableConfig = getTableConfig(table)
  const pkColumns = primaryKeyColumns(table)
  if (pkColumns.length === 0) {
    throw new Error(
      `drizzleResourceType(${tableConfig.name}) requires a primary key on the table`,
    )
  }

  const keyColumn = selectResourceKey(pkColumns)
  const context = (options.contextTerms ?? {}) as Context
  const fixed = options.fixed ?? {}
  if (pkColumns.length > 1) {
    const uncoveredColumns = pkColumns
      .map(column => column.name)
      .filter(name => name !== keyColumn.name)
      .filter(name => {
        const camel = toCamelCase(name)
        return (
          !(name in context) &&
          !(camel in context) &&
          !(name in fixed) &&
          !(camel in fixed)
        )
      })
    if (uncoveredColumns.length > 0) {
      throw new Error(
        `drizzleResourceType(${tableConfig.name}) requires contextTerms/fixed for composite PK columns: ${uncoveredColumns.join(", ")}`,
      )
    }
  }

  return resourceType<TTable["$inferSelect"], Scope, Context>({
    table: qualifyTable({ name: tableConfig.name, schema: tableConfig.schema }),
    key: keyColumn.name,
    context,
    owner: options.owner,
  })
}

export const drizzleExecutor = (db: {
  $client?: {
    query: <Row extends Record<string, unknown>>(
      sql: string,
      params: ReadonlyArray<unknown>,
    ) => Promise<{ rows: ReadonlyArray<Row> }>
  }
  execute?: (query: unknown) => Promise<unknown>
}): PostgresQueryExecutor => {
  if (db.$client?.query) {
    return {
      async query<Row extends Record<string, unknown>>(
        sql: string,
        params: ReadonlyArray<unknown>,
      ) {
        return db.$client!.query<Row>(sql, params)
      },
    }
  }

  if (db.execute) {
    return {
      async query<Row extends Record<string, unknown>>(
        sql: string,
        params: ReadonlyArray<unknown>,
      ) {
        const result = await db.execute!({ sql, params })
        const rows = (result as { rows?: ReadonlyArray<Row> }).rows
        if (!rows) {
          throw new Error(
            "drizzleExecutor(db.execute) expected a result with rows",
          )
        }
        return { rows }
      },
    }
  }

  throw new Error(
    "drizzleExecutor requires db.$client.query(sql, params) or db.execute(...)",
  )
}
