import { describe, expect, it } from 'vitest'
import { rulePack } from './blocklists'
import { defaultSettings, parseSettings, serializeSettings } from './rules-storage'

describe('parseSettings', () => {
  it('returns defaults for missing or invalid input', () => {
    expect(parseSettings(null)).toEqual(defaultSettings())
    expect(parseSettings('not json')).toEqual(defaultSettings())
    expect(parseSettings('42')).toEqual(defaultSettings())
  })

  it('round-trips serialized settings', () => {
    const settings = defaultSettings()
    settings.strictMode = true
    settings.exportFormat = 'hosts'
    settings.enabledCategories[rulePack.categories[0]!.id] = false

    expect(parseSettings(serializeSettings(settings))).toEqual(settings)
  })

  it('drops unknown categories and keeps new ones enabled', () => {
    const parsed = parseSettings(
      JSON.stringify({
        enabledCategories: { 'removed-category': false },
        strictMode: false,
        exportFormat: 'plain',
      }),
    )

    expect('removed-category' in parsed.enabledCategories).toBe(false)

    for (const category of rulePack.categories) {
      expect(parsed.enabledCategories[category.id]).toBe(true)
    }
  })

  it('rejects invalid export formats and non-boolean flags', () => {
    const parsed = parseSettings(
      JSON.stringify({ strictMode: 'yes', exportFormat: 'exe' }),
    )

    expect(parsed.strictMode).toBe(false)
    expect(parsed.exportFormat).toBe('adguard')
  })
})
