import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import rawPack from './ai-services.json'

// A lowercase hostname: letters/digits/hyphens labels joined by dots.
const HOSTNAME_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const rulePackSchema = z
  .object({
    version: z.string().regex(/^\d{4}\.\d{2}\.\d{2}$/),
    updatedAt: z.string().regex(ISO_DATE),
    disclaimer: z.string().min(10),
    categories: z
      .array(
        z
          .object({
            id: z.string().min(1),
            name: z.string().min(1),
            description: z.string().min(1),
            color: z.string().regex(/^#[0-9a-f]{6}$/),
            services: z
              .array(
                z
                  .object({
                    name: z.string().min(1),
                    domains: z.array(z.string().regex(HOSTNAME_PATTERN)).min(1),
                    breakageRisk: z.enum(['low', 'medium', 'high']),
                    verified: z.string().regex(ISO_DATE),
                    note: z.string().min(1).optional(),
                    strictOnly: z.boolean().optional(),
                  })
                  .strict(),
              )
              .min(1),
          })
          .strict(),
      )
      .min(1),
    policies: z
      .array(
        z
          .object({
            id: z.string().min(1),
            name: z.string().min(1),
            tagline: z.string().min(1),
            space: z.string().min(1),
            recommendedFor: z.string().min(1),
            block: z.array(z.string().min(1)),
            strict: z.boolean(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict()

describe('ai-services rule pack', () => {
  it('matches the expected schema', () => {
    expect(() => rulePackSchema.parse(rawPack)).not.toThrow()
  })

  it('has unique category ids', () => {
    const ids = rawPack.categories.map((category) => category.id)
    expect(ids).toEqual([...new Set(ids)])
  })

  it('every policy blocks only real category ids and has a unique id', () => {
    const categoryIds = new Set(rawPack.categories.map((category) => category.id))
    const policyIds = rawPack.policies.map((policy) => policy.id)
    expect(policyIds).toEqual([...new Set(policyIds)])

    for (const policy of rawPack.policies) {
      for (const id of policy.block) {
        expect(categoryIds.has(id)).toBe(true)
      }
    }
  })

  it('has no duplicate domains across the whole pack', () => {
    const domains = rawPack.categories.flatMap((category) =>
      category.services.flatMap((service) => service.domains),
    )
    const duplicates = domains.filter((domain, index) => domains.indexOf(domain) !== index)
    expect(duplicates).toEqual([])
  })

  it('keeps every domain lowercase and trimmed', () => {
    for (const category of rawPack.categories) {
      for (const service of category.services) {
        for (const domain of service.domains) {
          expect(domain).toBe(domain.trim().toLowerCase())
        }
      }
    }
  })
})
