import {
  type Environment,
  type EvaluationProof,
  type EvaluatorAdapter,
  type Relation,
  type Rule,
  type Term,
} from "./algebra"

type PostgresSourceFilter = {
  sql: string
  params?: ReadonlyArray<unknown>
}

type PostgresSuggestedIndex = {
  columns: ReadonlyArray<string>
  where?: string
}

type PostgresRelationSourceBase = {
  table: string
  leftColumn: string
  rightColumn: string
  staticFilters?: ReadonlyArray<PostgresSourceFilter>
  suggestedIndexes?: ReadonlyArray<PostgresSuggestedIndex>
}

export type PostgresEdgeRelationSource = PostgresRelationSourceBase & {
  kind: "edge"
}

export type PostgresJoinTableRelationSource = PostgresRelationSourceBase & {
  kind: "join-table"
  metadataColumns?: Readonly<Record<string, string>>
  recommendedView?: string
}

export type PostgresRelationSource =
  | PostgresEdgeRelationSource
  | PostgresJoinTableRelationSource

export interface PostgresRelationMapping<Left, Right> {
  relation: Relation<Left, Right>
  source: PostgresRelationSource
}

export interface PostgresQueryResult<Row> {
  readonly rows: ReadonlyArray<Row>
}

export interface PostgresQueryExecutor {
  query<Row extends Record<string, unknown>>(
    sql: string,
    params: ReadonlyArray<unknown>,
  ): Promise<PostgresQueryResult<Row>>
}

export type PostgresTermEncoder<T> = (value: T) => unknown

export interface PostgresTermEncoding<T> {
  term: Term<T>
  encode: PostgresTermEncoder<T>
}

type PostgresTermDomainSourceBase = {
  table: string
  valueColumn: string
  staticFilters?: ReadonlyArray<PostgresSourceFilter>
}

export type PostgresTermDomainSource<T> = PostgresTermDomainSourceBase & {
  term: Term<T>
}

export interface PostgresProofDiagnostic {
  readonly level: "info" | "warning"
  readonly code: string
  readonly message: string
  readonly recommendation?: string
}

export interface PlannedPostgresRule {
  readonly sql: string
  readonly params: ReadonlyArray<unknown>
  readonly diagnostics: ReadonlyArray<PostgresProofDiagnostic>
  readonly selectApplied: number
  readonly distinctApplied: number
  readonly sources: ReadonlyArray<{
    relationId: symbol
    kind: PostgresRelationSource["kind"]
    table: string
  }>
}

export interface PostgresAdapterOptions<
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  Env extends Environment = Environment,
  EvaluatorContext = unknown,
> {
  relationMappings: ReadonlyArray<PostgresRelationMapping<any, any>>
  termDomains?: ReadonlyArray<PostgresTermDomainSource<any>>
  termEncodings?: ReadonlyArray<PostgresTermEncoding<any>>
  queryExecutor: PostgresQueryExecutor
  getEvaluatorContext?: (
    evaluatorContext: EvaluatorContext,
  ) => Readonly<Record<string, unknown>>
  explainQuery?: boolean
}

type PlannerState = {
  relationMappings: Map<symbol, PostgresRelationSource>
  termDomains: Map<symbol, PostgresTermDomainSource<any>>
  termEncodings: Map<symbol, PostgresTermEncoder<any>>
  definitions: Map<string, Rule>
  termIds: Map<symbol, string>
  nextAlias: number
  params: Array<unknown>
  diagnostics: Array<PostgresProofDiagnostic>
  sources: Array<{
    relationId: symbol
    kind: PostgresRelationSource["kind"]
    table: string
  }>
  selectApplied: number
  distinctApplied: number
}

type QueryBuilder = {
  columns: Map<symbol, string>
  fromClauses: Array<string>
  whereClauses: Array<string>
}

const quoteIdentifier = (value: string): string => {
  return `"${value.split('"').join('""')}"`
}

const quoteQualifiedIdentifier = (value: string): string => {
  return value.split(".").map(quoteIdentifier).join(".")
}

const nextAlias = (state: PlannerState, prefix: string): string => {
  state.nextAlias += 1
  return `${prefix}${state.nextAlias}`
}

const nextParam = (state: PlannerState, value: unknown): string => {
  state.params.push(value)
  return `$${state.params.length}`
}

const isSqlPrimitive = (value: unknown): boolean => {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint" ||
    value instanceof Date
  )
}

const encodeTermValue = (
  state: PlannerState,
  term: symbol,
  value: unknown,
): unknown => {
  const encoder = state.termEncodings.get(term)
  if (encoder) {
    return encoder(value)
  }

  if (isSqlPrimitive(value)) {
    return value
  }

  throw new Error(
    "postgres adapter requires a term encoder for bound object values; configure termEncodings for this term",
  )
}

const termKey = (state: PlannerState, term: symbol): string => {
  const existing = state.termIds.get(term)
  if (existing) {
    return existing
  }

  const value = `term_${state.termIds.size + 1}`
  state.termIds.set(term, value)
  return value
}

const applyFilterAlias = (sql: string, alias: string): string => {
  return sql.split("{{source}}").join(alias)
}

type UnsupportedPostgresRule = Extract<Rule, { type: "term" | "unary" }>

const sortAndChildren = (children: ReadonlyArray<Rule>): Array<Rule> => {
  const rank = (node: Rule): number => {
    switch (node.type) {
      case "relation":
        return 0
      case "eq-term":
      case "eq-value":
        return 1
      case "ref":
      case "select":
      case "distinct":
      case "memo":
        return 2
      case "term":
      case "unary":
      case "or":
      case "not":
      case "forall":
      case "and":
        return 3
      default: {
        const exhaustive: never = node
        return exhaustive
      }
    }
  }

  return [...children].sort((left, right) => rank(left) - rank(right))
}

const collectDefinitions = (rule: Rule): Map<string, Rule> => {
  const definitions = new Map<string, Rule>()

  const visit = (node: Rule): void => {
    switch (node.type) {
      case "memo": {
        const existing = definitions.get(node.name)
        if (existing && existing !== node.child) {
          throw new Error(`duplicate letRule definition for "${node.name}"`)
        }

        definitions.set(node.name, node.child)
        visit(node.child)
        return
      }
      case "and":
      case "or":
        node.children.forEach(visit)
        return
      case "not":
      case "distinct":
      case "select":
      case "forall":
        visit(node.child)
        return
      case "relation":
      case "unary":
      case "term":
      case "eq-term":
      case "eq-value":
      case "ref":
        return
      default: {
        const exhaustive: never = node
        return exhaustive
      }
    }
  }

  visit(rule)
  return definitions
}

const addSourceDiagnostics = (
  state: PlannerState,
  source: PostgresRelationSource,
): void => {
  if (source.kind !== "join-table") {
    return
  }

  const compositeIndex = `(${quoteIdentifier(source.leftColumn)}, ${quoteIdentifier(source.rightColumn)})`
  const missingIndexRecommendation = source.staticFilters?.length
    ? `Consider a partial index on ${quoteQualifiedIdentifier(source.table)} ${compositeIndex} with the join-table filter predicate.`
    : `Consider a composite index on ${quoteQualifiedIdentifier(source.table)} ${compositeIndex}.`

  if (!source.suggestedIndexes || source.suggestedIndexes.length === 0) {
    state.diagnostics.push({
      level: "warning",
      code: "missing-join-table-index-hint",
      message: `Join-table relation ${quoteQualifiedIdentifier(source.table)} has no suggested indexes configured.`,
      recommendation: missingIndexRecommendation,
    })
  }

  if (
    source.recommendedView &&
    ((source.staticFilters?.length ?? 0) > 0 ||
      Object.keys(source.metadataColumns ?? {}).length > 0)
  ) {
    state.diagnostics.push({
      level: "info",
      code: "consider-join-table-view",
      message: `Join-table relation ${quoteQualifiedIdentifier(source.table)} carries reusable filters or metadata.`,
      recommendation: `Consider exposing ${quoteQualifiedIdentifier(source.recommendedView)} as a stable view for this relation source.`,
    })
  }
}

const createBuilder = (): QueryBuilder => ({
  columns: new Map(),
  fromClauses: [],
  whereClauses: [],
})

const ensureSupportedNode = (rule: UnsupportedPostgresRule): never => {
  switch (rule.type) {
    case "term":
      throw new Error(
        "postgres adapter does not support unconstrained term nodes yet; anchor the term through a relation or equality first",
      )
    case "unary":
      throw new Error(
        "postgres adapter does not support JavaScript unary predicates yet; provide a SQL-native relation or value constraint instead",
      )
  }
}

const cloneColumns = (
  columns: ReadonlyMap<symbol, string>,
): Map<symbol, string> => {
  return new Map(columns)
}

const appendRelation = (
  rule: Extract<Rule, { type: "relation" }>,
  builder: QueryBuilder,
  state: PlannerState,
): QueryBuilder => {
  const source = state.relationMappings.get(rule.relationId)
  if (!source) {
    throw new Error("postgres adapter is missing a relation mapping")
  }

  const alias = nextAlias(state, "rel")
  const tableSql = `${quoteQualifiedIdentifier(source.table)} ${quoteIdentifier(alias)}`

  builder.fromClauses.push(
    builder.fromClauses.length === 0
      ? `FROM ${tableSql}`
      : `JOIN ${tableSql} ON TRUE`,
  )

  const leftSql = `${quoteIdentifier(alias)}.${quoteIdentifier(source.leftColumn)}`
  const rightSql = `${quoteIdentifier(alias)}.${quoteIdentifier(source.rightColumn)}`
  const existingLeft = builder.columns.get(rule.left)
  const existingRight = builder.columns.get(rule.right)

  if (existingLeft) {
    builder.whereClauses.push(`${existingLeft} IS NOT DISTINCT FROM ${leftSql}`)
  } else {
    builder.columns.set(rule.left, leftSql)
  }

  if (existingRight) {
    builder.whereClauses.push(
      `${existingRight} IS NOT DISTINCT FROM ${rightSql}`,
    )
  } else {
    builder.columns.set(rule.right, rightSql)
  }

  source.staticFilters?.forEach(filter => {
    builder.whereClauses.push(
      applyFilterAlias(filter.sql, quoteIdentifier(alias)),
    )
    filter.params?.forEach(value => {
      nextParam(state, value)
    })
  })

  state.sources.push({
    relationId: rule.relationId,
    kind: source.kind,
    table: source.table,
  })
  addSourceDiagnostics(state, source)

  return builder
}

const appendEqValue = (
  rule: Extract<Rule, { type: "eq-value" }>,
  builder: QueryBuilder,
  state: PlannerState,
): QueryBuilder => {
  const encodedValue = encodeTermValue(state, rule.term, rule.value)
  const param = nextParam(state, encodedValue)
  const existing = builder.columns.get(rule.term)

  if (existing) {
    builder.whereClauses.push(`${existing} IS NOT DISTINCT FROM ${param}`)
    return builder
  }

  builder.columns.set(rule.term, param)
  return builder
}

const appendEqTerm = (
  rule: Extract<Rule, { type: "eq-term" }>,
  builder: QueryBuilder,
): QueryBuilder => {
  const left = builder.columns.get(rule.left)
  const right = builder.columns.get(rule.right)

  if (left && right) {
    builder.whereClauses.push(`${left} IS NOT DISTINCT FROM ${right}`)
    return builder
  }

  if (left) {
    builder.columns.set(rule.right, left)
    return builder
  }

  if (right) {
    builder.columns.set(rule.left, right)
    return builder
  }

  throw new Error(
    "postgres adapter cannot solve eq(termA, termB) when neither side is anchored by a relation or bound environment yet",
  )
}

const appendStaticFilters = (
  builder: QueryBuilder,
  state: PlannerState,
  alias: string,
  filters?: ReadonlyArray<PostgresSourceFilter>,
): void => {
  filters?.forEach(filter => {
    builder.whereClauses.push(
      applyFilterAlias(filter.sql, quoteIdentifier(alias)),
    )
    filter.params?.forEach(value => {
      nextParam(state, value)
    })
  })
}

const collectRelationTermSources = (
  rule: Rule,
  term: symbol,
  state: PlannerState,
): Array<{ source: PostgresRelationSource; side: "left" | "right" }> => {
  const output: Array<{
    source: PostgresRelationSource
    side: "left" | "right"
  }> = []

  const visit = (node: Rule): void => {
    switch (node.type) {
      case "relation": {
        const source = state.relationMappings.get(node.relationId)
        if (!source) {
          throw new Error("postgres adapter is missing a relation mapping")
        }

        if (node.left === term) {
          output.push({ source, side: "left" })
        }

        if (node.right === term) {
          output.push({ source, side: "right" })
        }

        return
      }
      case "and":
      case "or":
        node.children.forEach(visit)
        return
      case "not":
      case "select":
      case "distinct":
      case "memo":
      case "forall":
        visit(node.child)
        return
      case "ref": {
        const definition = state.definitions.get(node.name)
        if (!definition) {
          throw new Error(`unknown ref "${node.name}"`)
        }

        visit(definition)
        return
      }
      case "term":
      case "unary":
      case "eq-term":
      case "eq-value":
        return
      default: {
        const exhaustive: never = node
        return exhaustive
      }
    }
  }

  visit(rule)
  return output
}

const buildTermDomainQuery = (
  rule: Extract<Rule, { type: "forall" }>,
  state: PlannerState,
): string => {
  const explicitDomain = state.termDomains.get(rule.term)
  if (explicitDomain) {
    const alias = nextAlias(state, "dom")
    const builder = createBuilder()
    const valueSql = `${quoteIdentifier(alias)}.${quoteIdentifier(explicitDomain.valueColumn)}`
    builder.fromClauses.push(
      `FROM ${quoteQualifiedIdentifier(explicitDomain.table)} ${quoteIdentifier(alias)}`,
    )
    builder.whereClauses.push(`${valueSql} IS NOT NULL`)
    appendStaticFilters(builder, state, alias, explicitDomain.staticFilters)
    const where =
      builder.whereClauses.length === 0
        ? ""
        : ` WHERE ${builder.whereClauses.join(" AND ")}`

    return `SELECT DISTINCT ${valueSql} AS candidate ${builder.fromClauses.join(" ")}${where}`
  }

  const derivedSources = collectRelationTermSources(
    rule.child,
    rule.term,
    state,
  )
  if (derivedSources.length === 0) {
    state.diagnostics.push({
      level: "warning",
      code: "forall-without-domain-source",
      message:
        "forall term has no explicit domain source and no relation-derived candidate source.",
      recommendation:
        "Provide a term domain mapping or anchor the quantified term through a relation so the postgres adapter can build a complete candidate set.",
    })
    return "SELECT NULL AS candidate WHERE FALSE"
  }

  state.diagnostics.push({
    level: "info",
    code: "forall-derived-domain",
    message: "forall candidate domain is being derived from relation sources.",
    recommendation:
      "If this quantified term has a broader semantic domain than the participating relations expose, configure an explicit term domain source.",
  })

  return derivedSources
    .map(entry => {
      const alias = nextAlias(state, "dom")
      const builder = createBuilder()
      const column =
        entry.side === "left"
          ? entry.source.leftColumn
          : entry.source.rightColumn
      const valueSql = `${quoteIdentifier(alias)}.${quoteIdentifier(column)}`
      builder.fromClauses.push(
        `FROM ${quoteQualifiedIdentifier(entry.source.table)} ${quoteIdentifier(alias)}`,
      )
      builder.whereClauses.push(`${valueSql} IS NOT NULL`)
      appendStaticFilters(builder, state, alias, entry.source.staticFilters)
      const where =
        builder.whereClauses.length === 0
          ? ""
          : ` WHERE ${builder.whereClauses.join(" AND ")}`

      return `SELECT ${valueSql} AS candidate ${builder.fromClauses.join(" ")}${where}`
    })
    .join(" UNION ")
}

const compileExistsSql = (
  rule: Rule,
  state: PlannerState,
  inheritedColumns: ReadonlyMap<symbol, string>,
): string => {
  switch (rule.type) {
    case "or": {
      const branches = rule.children.map(child => {
        return compileExistsSql(child, state, inheritedColumns)
      })

      return branches.join(" UNION ALL ")
    }
    case "not": {
      return `SELECT 1 WHERE NOT EXISTS(${compileExistsSql(rule.child, state, inheritedColumns)})`
    }
    case "forall": {
      const boundValue = inheritedColumns.get(rule.term)
      if (boundValue) {
        return `SELECT 1 WHERE EXISTS(${compileExistsSql(rule.child, state, inheritedColumns)})`
      }

      const candidateSql = buildTermDomainQuery(rule, state)
      const candidateAlias = nextAlias(state, "forall")
      const childColumns = cloneColumns(inheritedColumns)
      childColumns.set(
        rule.term,
        `${quoteIdentifier(candidateAlias)}.candidate`,
      )

      return `SELECT 1 WHERE NOT EXISTS(SELECT 1 FROM (${candidateSql}) ${quoteIdentifier(candidateAlias)} WHERE NOT EXISTS(${compileExistsSql(rule.child, state, childColumns)}))`
    }
    case "memo":
      return compileExistsSql(rule.child, state, inheritedColumns)
    case "ref": {
      const definition = state.definitions.get(rule.name)
      if (!definition) {
        throw new Error(`unknown ref "${rule.name}"`)
      }

      return compileExistsSql(definition, state, inheritedColumns)
    }
    case "select":
      state.selectApplied += 1
      return compileExistsSql(rule.child, state, inheritedColumns)
    case "distinct":
      state.distinctApplied += 1
      return compileExistsSql(rule.child, state, inheritedColumns)
    case "term":
    case "unary":
      return ensureSupportedNode(rule)
    case "and":
    case "relation":
    case "eq-value":
    case "eq-term": {
      const builder = createBuilder()
      builder.columns = cloneColumns(inheritedColumns)
      appendConjunctiveRule(rule, builder, state)
      return renderInnerSql(builder)
    }
    default: {
      const exhaustive: never = rule
      return exhaustive
    }
  }
}

const appendConjunctiveRule = (
  rule: Rule,
  builder: QueryBuilder,
  state: PlannerState,
): QueryBuilder => {
  switch (rule.type) {
    case "and":
      return sortAndChildren(rule.children).reduce((current, child) => {
        return appendConjunctiveRule(child, current, state)
      }, builder)
    case "relation":
      return appendRelation(rule, builder, state)
    case "eq-value":
      return appendEqValue(rule, builder, state)
    case "eq-term":
      return appendEqTerm(rule, builder)
    case "memo":
      return appendConjunctiveRule(rule.child, builder, state)
    case "ref": {
      const definition = state.definitions.get(rule.name)
      if (!definition) {
        throw new Error(`unknown ref "${rule.name}"`)
      }

      return appendConjunctiveRule(definition, builder, state)
    }
    case "select":
      state.selectApplied += 1
      return appendConjunctiveRule(rule.child, builder, state)
    case "distinct":
      state.distinctApplied += 1
      return appendConjunctiveRule(rule.child, builder, state)
    case "or":
    case "forall":
      builder.whereClauses.push(
        `EXISTS(${compileExistsSql(rule, state, builder.columns)})`,
      )
      return builder
    case "not":
      builder.whereClauses.push(
        `NOT EXISTS(${compileExistsSql(rule.child, state, builder.columns)})`,
      )
      return builder
    case "term":
    case "unary":
      return ensureSupportedNode(rule)
    default: {
      const exhaustive: never = rule
      return exhaustive
    }
  }
}

const renderInnerSql = (builder: QueryBuilder): string => {
  const from = builder.fromClauses.join(" ")
  const where =
    builder.whereClauses.length === 0
      ? ""
      : ` WHERE ${builder.whereClauses.join(" AND ")}`

  if (from.length === 0) {
    return `SELECT 1${where}`
  }

  return `SELECT 1 ${from}${where}`
}

const relationMappingsById = (
  relationMappings: ReadonlyArray<PostgresRelationMapping<any, any>>,
): Map<symbol, PostgresRelationSource> => {
  const output = new Map<symbol, PostgresRelationSource>()
  relationMappings.forEach(entry => {
    output.set(entry.relation.id, entry.source)
  })
  return output
}

const termDomainsById = (
  termDomains: ReadonlyArray<PostgresTermDomainSource<any>>,
): Map<symbol, PostgresTermDomainSource<any>> => {
  const output = new Map<symbol, PostgresTermDomainSource<any>>()
  termDomains.forEach(entry => {
    output.set(entry.term, entry)
  })
  return output
}

const termEncodingsById = (
  termEncodings: ReadonlyArray<PostgresTermEncoding<any>>,
): Map<symbol, PostgresTermEncoder<any>> => {
  const output = new Map<symbol, PostgresTermEncoder<any>>()
  termEncodings.forEach(entry => {
    output.set(entry.term, entry.encode)
  })
  return output
}

export const planPostgresRule = <Env extends Environment>(
  rule: Rule,
  options: {
    relationMappings: ReadonlyArray<PostgresRelationMapping<any, any>>
    termDomains?: ReadonlyArray<PostgresTermDomainSource<any>>
    termEncodings?: ReadonlyArray<PostgresTermEncoding<any>>
    environment: Readonly<Env>
  },
): PlannedPostgresRule => {
  const state: PlannerState = {
    relationMappings: relationMappingsById(options.relationMappings),
    termDomains: termDomainsById(options.termDomains ?? []),
    termEncodings: termEncodingsById(options.termEncodings ?? []),
    definitions: collectDefinitions(rule),
    termIds: new Map(),
    nextAlias: 0,
    params: [],
    diagnostics: [],
    sources: [],
    selectApplied: 0,
    distinctApplied: 0,
  }
  const builder = createBuilder()

  Object.getOwnPropertySymbols(options.environment).forEach(key => {
    builder.columns.set(
      key,
      nextParam(state, encodeTermValue(state, key, options.environment[key])),
    )
    termKey(state, key)
  })

  const sql = compileExistsSql(rule, state, builder.columns)

  return {
    sql: `SELECT EXISTS(${sql}) AS ok`,
    params: state.params,
    diagnostics: state.diagnostics,
    selectApplied: state.selectApplied,
    distinctApplied: state.distinctApplied,
    sources: state.sources,
  }
}

type ExplainNode = {
  "Node Type"?: string
  "Relation Name"?: string
  "Index Name"?: string
  Plans?: ReadonlyArray<ExplainNode>
  [key: string]: unknown
}

const findSequentialScans = (
  node: ExplainNode,
  scans: Array<{ table: string; rows?: number }> = [],
): Array<{ table: string; rows?: number }> => {
  const nodeType = node["Node Type"]
  const relationName = node["Relation Name"]

  if (
    (nodeType === "Seq Scan" || nodeType === "Bitmap Heap Scan") &&
    relationName
  ) {
    scans.push({
      table: relationName,
      rows: node["Actual Rows"] as number | undefined,
    })
  }

  node["Plans"]?.forEach(child => {
    findSequentialScans(child, scans)
  })

  return scans
}

const analyzeExplainAndRecommend = (
  explainRows: ReadonlyArray<Record<string, unknown>>,
  plan: PlannedPostgresRule,
): Array<PostgresProofDiagnostic> => {
  const recommendations: Array<PostgresProofDiagnostic> = []

  if (!explainRows || explainRows.length === 0) {
    return recommendations
  }

  try {
    const topLevel = explainRows[0] as ExplainNode | undefined
    if (!topLevel) {
      return recommendations
    }

    const seqScans = findSequentialScans(topLevel)

    seqScans.forEach(scan => {
      const relatedSource = plan.sources.find(
        s => s.table === scan.table || s.table.includes(scan.table),
      )

      if (relatedSource && relatedSource.kind === "join-table") {
        recommendations.push({
          level: "warning",
          code: "sequential-scan-detected",
          message: `Sequential scan on ${quoteQualifiedIdentifier(scan.table)} (${scan.rows ?? 0} rows) observed in query plan.`,
          recommendation: `Consider creating a composite index on the join-table predicate columns to avoid sequential scans.`,
        })
      }
    })
  } catch {
    // Silently skip explain analysis on parse errors
  }

  return recommendations
}

const buildProofDetails = (
  plan: PlannedPostgresRule,
  ok: boolean,
  state: Pick<PlannerState, "selectApplied" | "distinctApplied">,
  explainRows?: ReadonlyArray<Record<string, unknown>>,
): Record<string, unknown> => {
  const allDiagnostics = [...plan.diagnostics]

  if (explainRows) {
    const explainRecommendations = analyzeExplainAndRecommend(explainRows, plan)
    allDiagnostics.push(...explainRecommendations)
  }

  return {
    ok,
    sql: plan.sql,
    paramCount: plan.params.length,
    diagnostics: allDiagnostics,
    relationSources: plan.sources,
    selectApplied: state.selectApplied,
    distinctApplied: state.distinctApplied,
    explain: explainRows,
  }
}

export const createPostgresAdapter = <
  Env extends Environment = Environment,
  EvaluatorContext = unknown,
>(
  options: PostgresAdapterOptions<Env, EvaluatorContext>,
): EvaluatorAdapter<Env, EvaluatorContext> => {
  return {
    async evaluate(rule, environment) {
      const plan = planPostgresRule(rule, {
        relationMappings: options.relationMappings,
        termDomains: options.termDomains,
        termEncodings: options.termEncodings,
        environment,
      })
      const result = await options.queryExecutor.query<{ ok: boolean }>(
        plan.sql,
        plan.params,
      )

      return result.rows[0]?.ok === true
    },
    async evaluateWithProof(rule, environment) {
      const plan = planPostgresRule(rule, {
        relationMappings: options.relationMappings,
        termDomains: options.termDomains,
        termEncodings: options.termEncodings,
        environment,
      })
      const result = await options.queryExecutor.query<{ ok: boolean }>(
        plan.sql,
        plan.params,
      )
      const ok = result.rows[0]?.ok === true

      let explainRows: ReadonlyArray<Record<string, unknown>> | undefined
      if (options.explainQuery) {
        const explainResult = await options.queryExecutor.query(
          `EXPLAIN (FORMAT JSON) ${plan.sql}`,
          plan.params,
        )
        explainRows = explainResult.rows
      }

      const proof: EvaluationProof = {
        ok,
        rule,
        details: buildProofDetails(
          plan,
          ok,
          {
            selectApplied: plan.selectApplied,
            distinctApplied: plan.distinctApplied,
          },
          explainRows,
        ),
      }

      return proof
    },
  }
}
