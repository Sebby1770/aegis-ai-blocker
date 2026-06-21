import { rulePack, type Policy } from './blocklists'
import type { RulesSettings } from './rules-storage'

export type { Policy }

export const policies = rulePack.policies

export const CUSTOM_POLICY_ID = 'custom'

const categoryIds = rulePack.categories.map((category) => category.id)

// Turns a policy (a set of values) into concrete category switches: a category
// is enabled (blocked) when the policy lists it in `block`.
export function settingsForPolicy(policy: Policy, exportFormat: RulesSettings['exportFormat']): RulesSettings {
  return {
    enabledCategories: Object.fromEntries(categoryIds.map((id) => [id, policy.block.includes(id)])),
    strictMode: policy.strict,
    exportFormat,
    activePolicyId: policy.id,
    // A policy carries no personal exceptions; callers that want to preserve
    // the user's allow/block lists across a policy switch merge them back in.
    allowDomains: [],
    blockDomains: [],
  }
}

function policyMatches(policy: Policy, settings: RulesSettings): boolean {
  return (
    policy.strict === settings.strictMode &&
    categoryIds.every((id) => settings.enabledCategories[id] === policy.block.includes(id))
  )
}

// Detects which named policy the current switches correspond to, so manual
// edits surface as "Custom" instead of silently keeping a stale policy label.
// When several policies share the same enforcement (e.g. Strict no-AI and
// School exam both block everything), the currently-selected one is kept so
// the label does not flip out from under the user.
export function matchPolicyId(settings: RulesSettings): string {
  const current = policies.find((policy) => policy.id === settings.activePolicyId)

  if (current && policyMatches(current, settings)) {
    return current.id
  }

  return policies.find((policy) => policyMatches(policy, settings))?.id ?? CUSTOM_POLICY_ID
}
