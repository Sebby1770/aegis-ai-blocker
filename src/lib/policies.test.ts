import { describe, expect, it } from 'vitest'
import { rulePack } from './blocklists'
import { CUSTOM_POLICY_ID, matchPolicyId, policies, settingsForPolicy } from './policies'
import { defaultSettings } from './rules-storage'

const categoryIds = rulePack.categories.map((category) => category.id)

describe('settingsForPolicy', () => {
  it('enables exactly the categories the policy blocks', () => {
    const strictNoAi = policies.find((policy) => policy.id === 'strict-no-ai')!
    const settings = settingsForPolicy(strictNoAi, 'adguard')

    for (const id of categoryIds) {
      expect(settings.enabledCategories[id]).toBe(true)
    }
    expect(settings.strictMode).toBe(true)
    expect(settings.activePolicyId).toBe('strict-no-ai')
  })

  it('leaves non-blocked categories off', () => {
    const focus = policies.find((policy) => policy.id === 'focus')!
    const settings = settingsForPolicy(focus, 'hosts')

    expect(settings.enabledCategories.chat).toBe(true)
    expect(settings.enabledCategories.coding).toBe(false)
    expect(settings.exportFormat).toBe('hosts')
  })
})

describe('matchPolicyId', () => {
  it('round-trips every named policy', () => {
    for (const policy of policies) {
      const settings = settingsForPolicy(policy, 'adguard')
      expect(matchPolicyId(settings)).toBe(policy.id)
    }
  })

  it('returns custom when switches match no policy', () => {
    const settings = settingsForPolicy(policies[0]!, 'adguard')
    settings.enabledCategories[categoryIds[0]!] = !settings.enabledCategories[categoryIds[0]!]
    expect(matchPolicyId(settings)).toBe(CUSTOM_POLICY_ID)
  })

  it('default settings (all on, strict off) resolves consistently', () => {
    const id = matchPolicyId(defaultSettings())
    expect(typeof id).toBe('string')
  })
})
