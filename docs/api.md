# API Documentation

## Exports

he-said exports algebra constructors, an in-memory adapter, and related types.

### Algebra Constructors

- term<T>()
- term<T>().is(predicate)
- relation<Left, Right>()
- eq(leftTerm, rightTermOrValue)
- ref(name)
- and(...constraints)
- or(...constraints)
- not(constraint)
- implies(premise, consequence)
- oneOf(term, values)
- atLeast(count, ...constraints)
- atMost(count, ...constraints)
- exactly(count, ...constraints)
- forAll(term, constraint)
- select(...terms)(constraint)
- distinct(constraint)
- letRule(name, constraint)

### Evaluator Construction

- evaluator(adapter, { evaluatorContext })

Returns an EvaluatorInstance with:

- evaluate(rule, environment): Promise<boolean>
- evaluateWithProof(rule, environment): Promise<EvaluationProof>

### In-Memory Adapter

- createInMemoryAdapter(options)
- validateStratifiedNegation(rule)

InMemoryAdapterOptions:

- relations: array of { relation, pairs }
- domain: optional fallback candidate domain
- relation entries may also include:
  - rows: array of { left, right, columns? }
  - predicates: typed filters (`eq`, `in`, `gt`, `ge`, `lt`, `le`)
  - orderings: per-column rank maps for ordered comparisons

### Postgres Adapter

- createPostgresAdapter(options)
- planPostgresRule(rule, options)

Postgres relation/domain sources support:

- staticFilters (legacy SQL snippets)
- predicates (typed, parameterized source predicates)
- orderings (per-column rank maps for enum/string thresholds)

## Key Types

- Environment
- Rule
- Term<T>
- Relation<Left, Right>
- UnaryPredicate<T, Env>
- EvaluatorAdapter<Env, EvaluatorContext>
- EvaluatorInstance<Env>
- EvaluationProof
- InMemoryRelationFacts<Left, Right>
- InMemoryRelationRow<Left, Right>
- InMemoryAdapterOptions
- SourcePredicate
- SourceOrdering
- PostgresSourcePredicate (adapter alias of SourcePredicate)
- PostgresSourceOrdering (adapter alias of SourceOrdering)

## Rule Notes

- Rule trees are immutable plain objects.
- and and or flatten nested nodes of the same kind.
- oneOf(term, values) is equivalent to or(eq(term, v1), eq(term, v2), ...).
- cardinality helpers count satisfied constraints:
  - atLeast(n, ...rules)
  - atMost(n, ...rules)
  - exactly(n, ...rules)
- ref and letRule names must be non-empty after trim.

## Error Conditions

- unknown term used in rule expression
- ref name is required
- letRule name is required
- atLeast requires a non-negative integer count
- atMost requires a non-negative integer count
- exactly requires a non-negative integer count
- unknown ref during evaluation/validation
- recursive or non-stratified negative dependencies
