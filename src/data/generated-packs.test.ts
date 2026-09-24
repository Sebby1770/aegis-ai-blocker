import { describe, expect, it } from 'vitest'
import swiftSource from '../../ios/AegisAIBlocker/RulePackData.generated.swift?raw'
import extensionPack from '../../extension/rules/pack.json'
import rawPack from './ai-services.json'

// The iOS app and the browser extension ship generated copies of the rule
// pack. CI regenerates and diffs them; these tests go further and parse each
// copy independently of the generator, so a hand edit, a generator bug, or a
// stale file can never let the platforms enforce different rules.

type ParsedService = { name: string; domains: string[]; strictOnly: boolean }
type ParsedCategory = { id: string; name: string; symbol: string; colorHex: string; services: ParsedService[] }

const SWIFT_STRING = '"((?:[^"\\\\]|\\\\.)*)"'

function unescapeSwift(value: string) {
  return value.replace(/\\(["\\])/g, '$1')
}

function parseSwiftRulePack(source: string) {
  const scalar = (name: string) => {
    const match = source.match(new RegExp(`static let ${name} = ${SWIFT_STRING}`))
    if (!match) {
      throw new Error(`missing static let ${name}`)
    }
    return unescapeSwift(match[1])
  }

  const categories: ParsedCategory[] = source
    .split('RuleCategory(')
    .slice(1)
    .map((chunk) => {
      const field = (name: string, pattern = SWIFT_STRING) => {
        const match = chunk.match(new RegExp(`${name}: ${pattern}`))
        if (!match) {
          throw new Error(`category missing ${name}: ${chunk.slice(0, 80)}`)
        }
        return unescapeSwift(match[1])
      }

      const services = [...chunk.matchAll(new RegExp(`RuleService\\(name: ${SWIFT_STRING}, domains: \\[([^\\]]*)\\](, strictOnly: true)?\\)`, 'g'))].map(
        (match) => ({
          name: unescapeSwift(match[1]),
          domains: [...match[2].matchAll(new RegExp(SWIFT_STRING, 'g'))].map((domain) => unescapeSwift(domain[1])),
          strictOnly: Boolean(match[3]),
        }),
      )

      return {
        id: field('id'),
        name: field('name'),
        symbol: field('symbol'),
        colorHex: field('colorHex', '0x([0-9a-fA-F]{6})'),
        services,
      }
    })

  return { version: scalar('version'), updatedAt: scalar('updatedAt'), categories }
}

describe('iOS RulePackData.generated.swift', () => {
  const swift = parseSwiftRulePack(swiftSource)

  it('carries the pack version and date', () => {
    expect(swift.version).toBe(rawPack.version)
    expect(swift.updatedAt).toBe(rawPack.updatedAt)
  })

  it('has every category, in order, with matching name and color', () => {
    expect(swift.categories.map(({ id, name, colorHex }) => ({ id, name, color: `#${colorHex.toLowerCase()}` }))).toEqual(
      rawPack.categories.map(({ id, name, color }) => ({ id, name, color })),
    )
    for (const category of swift.categories) {
      expect(category.symbol).toMatch(/^[a-z.]+$/)
    }
  })

  it('has every service with exactly the same domains and strict-only flag', () => {
    expect(swift.categories.map((category) => category.services)).toEqual(
      rawPack.categories.map((category) =>
        category.services.map((service) => ({
          name: service.name,
          domains: service.domains,
          strictOnly: Boolean((service as { strictOnly?: boolean }).strictOnly),
        })),
      ),
    )
  })
})

describe('extension rules/pack.json', () => {
  it('matches the rule pack exactly', () => {
    expect(extensionPack.version).toBe(rawPack.version)
    expect(extensionPack.updatedAt).toBe(rawPack.updatedAt)
    expect(extensionPack.policies).toEqual(rawPack.policies)
    expect(extensionPack.services).toEqual(
      rawPack.categories.flatMap((category) =>
        category.services.map((service) => ({
          name: service.name,
          category: category.id,
          domains: service.domains,
          strictOnly: Boolean((service as { strictOnly?: boolean }).strictOnly),
        })),
      ),
    )
  })
})
