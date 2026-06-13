import { describe, expect, it } from 'vitest'
import { explainDomain } from './explain'

describe('explainDomain', () => {
  it('explains an exact match with service and category', () => {
    const result = explainDomain('chatgpt.com', false)
    expect(result.status).toBe('blocked')
    expect(result.matchType).toBe('exact')
    expect(result.owner?.service).toBe('OpenAI ChatGPT')
    expect(result.owner?.categoryName).toBe('AI Chat')
    expect(result.reason).toContain('OpenAI ChatGPT')
  })

  it('explains a non-listed subdomain as a parent-domain match', () => {
    const result = explainDomain('help.openai.com', false)
    expect(result.status).toBe('blocked')
    expect(result.matchType).toBe('parent')
    expect(result.reason).toContain('parent domain openai.com')
  })

  it('marks strict-only services as allowed when strict mode is off', () => {
    const off = explainDomain('huggingface.co', false)
    expect(off.status).toBe('strict-only')
    expect(off.reason).toContain('only in strict mode')

    const on = explainDomain('huggingface.co', true)
    expect(on.status).toBe('blocked')
  })

  it('reports unknown domains as allowed', () => {
    const result = explainDomain('example.com', true)
    expect(result.status).toBe('allowed')
    expect(result.owner).toBeNull()
    expect(result.matchType).toBeNull()
  })

  it('does not match lookalike domains', () => {
    expect(explainDomain('notopenai.com', true).status).toBe('allowed')
    expect(explainDomain('openai.com.evil.net', true).status).toBe('allowed')
  })

  it('surfaces breakage risk and notes for risky services', () => {
    const result = explainDomain('bing.com', false)
    expect(result.owner?.breakageRisk).toBe('high')
    expect(result.owner?.note).toContain('Bing')
  })

  it('handles empty input gracefully', () => {
    const result = explainDomain('   ', false)
    expect(result.status).toBe('allowed')
    expect(result.normalized).toBe('')
  })
})
