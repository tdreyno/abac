import {
  and,
  annotateRule,
  type Rule,
  type RuleAnnotations,
  type Term,
  term,
} from "../core/algebra"
import type {
  ActionToken,
  FailureToken,
  PolicyRef,
  RuleKind,
  RuleOptions,
  RuleRef,
  RuleReferenceToken,
} from "./abac-types"

export interface EvalContext<User, Resource, Environment> {
  readonly action: ActionToken
  readonly user: User
  readonly resource: Resource
  readonly environment: Environment
}

const ACTION_LABELS = new Map<ActionToken, string | undefined>()
const FAILURE_MESSAGES = new Map<FailureToken, string | undefined>()

const EVAL_CONTEXT_TERM = term<EvalContext<unknown, unknown, unknown>>()

type RuleInput = Rule | readonly Rule[]

const normalizeRuleInput = (input: RuleInput): Rule => {
  if (Array.isArray(input)) {
    return and(...(input as Rule[]))
  }

  return input as Rule
}

const contextTerm = <User, Resource, Environment>(): Term<
  EvalContext<User, Resource, Environment>
> => {
  return EVAL_CONTEXT_TERM as Term<EvalContext<User, Resource, Environment>>
}

const ruleFromPredicate = <User, Resource, Environment>(
  predicate: (ctx: EvalContext<User, Resource, Environment>) => boolean,
): Rule => {
  return and(contextTerm<User, Resource, Environment>().is(predicate))
}

const buildRuleRef = (
  kind: RuleKind,
  definition: RuleInput,
  options?: RuleOptions,
): RuleRef => {
  const compiledRule = normalizeRuleInput(definition)
  const reference = Symbol("abac.rule.ref") as RuleReferenceToken

  const annotations: RuleAnnotations = {
    label: options?.name,
    referenceToken: reference,
    outcomeToken: options?.failure,
  }

  annotateRule(compiledRule, annotations)

  return {
    kind,
    ref: reference,
    rule: compiledRule,
    name: options?.name,
    failure: options?.failure,
    priority: options?.priority ?? 0,
  }
}

export const action = <TLabel extends string = string>(
  label?: TLabel,
): ActionToken<TLabel> => {
  const value = Symbol(label ?? "abac.action") as ActionToken<TLabel>
  ACTION_LABELS.set(value as ActionToken, label)
  return value
}

export const actionLabel = (value: ActionToken): string | undefined => {
  return ACTION_LABELS.get(value)
}

export const failure = (message?: string): FailureToken => {
  const value = Symbol("abac.failure") as FailureToken
  FAILURE_MESSAGES.set(value, message)
  return value
}

export const failureMessage = (token: FailureToken): string | undefined => {
  return FAILURE_MESSAGES.get(token)
}

export const actionIs = (target: ActionToken): Rule => {
  return ruleFromPredicate<unknown, unknown, unknown>(ctx => {
    return ctx.action === target
  })
}

export const actionIn = (...targets: ActionToken[]): Rule => {
  const set = new Set(targets)
  return ruleFromPredicate<unknown, unknown, unknown>(ctx => {
    return set.has(ctx.action)
  })
}

export function eq<User, T>(left: (user: User) => T, right: T): Rule
export function eq<User, Resource, T>(
  left: (user: User) => T,
  right: (resource: Resource) => T,
): Rule
export function eq<User, Resource, T>(
  left: (user: User) => T,
  right: ((resource: Resource) => T) | T,
): Rule {
  return ruleFromPredicate<User, Resource, unknown>(ctx => {
    const rightValue =
      typeof right === "function"
        ? (right as (resource: Resource) => T)(ctx.resource)
        : right

    return Object.is(left(ctx.user), rightValue)
  })
}

export function ge<User>(left: (user: User) => number, right: number): Rule
export function ge<User, Resource>(
  left: (user: User) => number,
  right: (resource: Resource) => number,
): Rule
export function ge<User, Resource>(
  left: (user: User) => number,
  right: ((resource: Resource) => number) | number,
): Rule {
  return ruleFromPredicate<User, Resource, unknown>(ctx => {
    const rightValue =
      typeof right === "function"
        ? (right as (resource: Resource) => number)(ctx.resource)
        : right

    return left(ctx.user) >= rightValue
  })
}

export const eqEnv = <Environment, T>(
  left: (environment: Environment) => T,
  right: T,
): Rule => {
  return ruleFromPredicate<unknown, unknown, Environment>(ctx => {
    return Object.is(left(ctx.environment), right)
  })
}

export const all = (...rules: Rule[]): Rule => and(...rules)

export const approve = (
  definition: RuleInput,
  options?: RuleOptions,
): RuleRef => {
  return buildRuleRef("approve", definition, options)
}

export const deny = (definition: RuleInput, options?: RuleOptions): RuleRef => {
  return buildRuleRef("deny", definition, options)
}

export const policy = (...rules: RuleRef[]): PolicyRef => {
  return {
    rules: [...rules],
  }
}

export const buildEvalEnvironment = <User, Resource, Environment>(
  context: EvalContext<User, Resource, Environment>,
): Record<PropertyKey, unknown> => {
  return {
    [EVAL_CONTEXT_TERM]: context,
  }
}
