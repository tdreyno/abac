import { evaluator, type EvaluationProof } from "../core/algebra"
import { createInMemoryAdapter } from "../core/algebra-inmemory"
import {
  buildEvalEnvironment,
  failureMessage,
  type EvalContext,
} from "./abac-builder"
import type {
  ABACEnforcer,
  ActionToken,
  CanContext,
  CanDecision,
  CanRequest,
  PolicyRef,
  RuleRef,
  RuleTrace,
} from "./abac-types"

const byPriority = (left: RuleRef, right: RuleRef): number => {
  return right.priority - left.priority
}

const withTieBreak = (rules: RuleRef[]): RuleRef[] => {
  return [...rules].sort((left, right) => {
    const priorityDiff = byPriority(left, right)
    if (priorityDiff !== 0) {
      return priorityDiff
    }

    if (left.kind === right.kind) {
      return 0
    }

    return left.kind === "deny" ? -1 : 1
  })
}

const proofToTrace = (
  rule: RuleRef,
  matched: boolean,
  proof?: EvaluationProof,
): RuleTrace => {
  return {
    ruleRef: rule.ref,
    name: rule.name,
    kind: rule.kind,
    matched,
    proof,
  }
}

export const enforcer = <User, Resource, Environment>(
  accessPolicy: PolicyRef,
): ABACEnforcer<User, Resource, Environment> => {
  const evalEngine = evaluator(createInMemoryAdapter({ relations: [] }), {
    evaluatorContext: undefined,
  })

  const orderedRules = withTieBreak([...accessPolicy.rules])

  const denyRules = orderedRules.filter(rule => rule.kind === "deny")
  const approveRules = orderedRules.filter(rule => rule.kind === "approve")

  const can = async (
    action: ActionToken,
    context: CanContext<User, Resource, Environment>,
  ): Promise<CanDecision> => {
    const evalContext: EvalContext<User, Resource, Environment> = {
      action,
      user: context.user,
      resource: context.resource,
      environment: context.environment,
    }

    const evalEnvironment = buildEvalEnvironment(evalContext)
    const checkedRules: RuleTrace[] = []
    const matchedRules: RuleTrace[] = []

    for (const rule of denyRules) {
      const proof = await evalEngine.evaluateWithProof(
        rule.rule,
        evalEnvironment,
      )
      const matched = proof.ok
      const trace = proofToTrace(rule, matched, proof)
      checkedRules.push(trace)

      if (matched) {
        matchedRules.push(trace)
        return {
          allowed: false,
          failureToken: rule.failure,
          reason: rule.failure ? failureMessage(rule.failure) : undefined,
          trace: {
            checkedRules,
            matchedRules,
          },
        }
      }
    }

    for (const rule of approveRules) {
      const proof = await evalEngine.evaluateWithProof(
        rule.rule,
        evalEnvironment,
      )
      const matched = proof.ok
      const trace = proofToTrace(rule, matched, proof)
      checkedRules.push(trace)

      if (matched) {
        matchedRules.push(trace)
        return {
          allowed: true,
          trace: {
            checkedRules,
            matchedRules,
          },
        }
      }
    }

    return {
      allowed: false,
      trace: {
        checkedRules,
        matchedRules,
      },
    }
  }

  const canBatch = async (
    ...requests: Array<CanRequest<User, Resource, Environment>>
  ): Promise<CanDecision[]> => {
    return Promise.all(
      requests.map(request => {
        return can(request.action, {
          user: request.user,
          resource: request.resource,
          environment: request.environment,
        })
      }),
    )
  }

  return {
    can,
    canBatch,
    policy() {
      return accessPolicy
    },
  }
}
