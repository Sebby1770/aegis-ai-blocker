import { describe, expect, it } from 'vitest'
// @ts-expect-error — plain JS module shared with the extension service worker
import { buildDnrRules, RESOURCE_TYPES } from './enforce.js'
import {
  buildDelayRules,
  compileRules,
  coveringDomain,
  describeSchedule,
  expiredPasses,
  FRICTION_DEFAULTS,
  isWithinSchedule,
  nextScheduleChange,
  passRule,
  safeTarget,
  sanitizeFriction,
  scheduledState,
  // @ts-expect-error — plain JS module shared with the extension service worker
} from './friction.js'

const ORIGIN = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop'
const resolved = { blocked: ['chatgpt.com', 'claude.ai'], allowed: ['github.com'] }

// Local-time constructor: new Date(2026, 8, 21) is Monday 21 Sep 2026.
const at = (day: number, hour: number, minute = 0) => new Date(2026, 8, 20 + day, hour, minute)
const weekdays9to5 = { days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' }

describe('sanitizeFriction', () => {
  it('defaults to block with sensible delay, pass and schedule settings', () => {
    expect(sanitizeFriction()).toEqual(FRICTION_DEFAULTS)
    expect(sanitizeFriction({ friction: 'nonsense' }).friction).toBe('block')
  })

  it('clamps delay and pass lengths and rejects non-integers', () => {
    expect(sanitizeFriction({ delaySeconds: 0, passMinutes: 999 })).toMatchObject({ delaySeconds: 3, passMinutes: 60 })
    expect(sanitizeFriction({ delaySeconds: '15', passMinutes: 2.5 })).toMatchObject({ delaySeconds: 15, passMinutes: 10 })
  })

  it('keeps only valid days and HH:MM clocks', () => {
    expect(sanitizeFriction({ schedule: { days: [5, 1, 1, 9, -1, 'x'], start: '25:00', end: '07:30' } }).schedule).toEqual({
      days: [1, 5],
      start: '09:00',
      end: '07:30',
    })
  })
})

describe('isWithinSchedule', () => {
  it('handles a same-day window as [start, end)', () => {
    expect(isWithinSchedule(weekdays9to5, at(1, 8, 59))).toBe(false)
    expect(isWithinSchedule(weekdays9to5, at(1, 9, 0))).toBe(true)
    expect(isWithinSchedule(weekdays9to5, at(1, 16, 59))).toBe(true)
    expect(isWithinSchedule(weekdays9to5, at(1, 17, 0))).toBe(false)
    expect(isWithinSchedule(weekdays9to5, at(6, 12))).toBe(false) // Saturday
  })

  it('runs an overnight window into the next morning, owned by the start day', () => {
    const schoolNights = { days: [0, 1, 2, 3, 4], start: '21:00', end: '07:00' } // Sun–Thu nights
    expect(isWithinSchedule(schoolNights, at(1, 22))).toBe(true) // Monday night
    expect(isWithinSchedule(schoolNights, at(2, 6, 59))).toBe(true) // Tuesday early (Monday's night)
    expect(isWithinSchedule(schoolNights, at(2, 7))).toBe(false)
    expect(isWithinSchedule(schoolNights, at(5, 22))).toBe(false) // Friday night: not listed
    expect(isWithinSchedule(schoolNights, at(6, 3))).toBe(false) // Saturday early: Friday not listed
    expect(isWithinSchedule(schoolNights, at(0, 23))).toBe(true) // Sunday night
  })

  it('treats start === end as the whole day, and no days as never', () => {
    expect(isWithinSchedule({ days: [6], start: '00:00', end: '00:00' }, at(6, 13))).toBe(true)
    expect(isWithinSchedule({ days: [], start: '09:00', end: '17:00' }, at(1, 12))).toBe(false)
  })
})

describe('nextScheduleChange', () => {
  it('finds the next start while outside and the next end while inside', () => {
    expect(nextScheduleChange(weekdays9to5, at(1, 7, 30))).toEqual(at(1, 9))
    expect(nextScheduleChange(weekdays9to5, at(1, 9, 0))).toEqual(at(1, 17))
    expect(nextScheduleChange(weekdays9to5, at(5, 18))).toEqual(at(8, 9)) // Friday evening -> Monday 09:00
  })

  it('returns null when the schedule never changes', () => {
    expect(nextScheduleChange({ days: [], start: '09:00', end: '17:00' }, at(1, 12))).toBeNull()
    expect(nextScheduleChange({ days: [0, 1, 2, 3, 4, 5, 6], start: '00:00', end: '00:00' }, at(1, 12))).toBeNull()
  })
})

describe('scheduledState', () => {
  const state = { activePolicyId: 'focus', paused: false }

  it('lifts the pack outside the schedule, exactly like pause', () => {
    const friction = sanitizeFriction({ friction: 'schedule', schedule: weekdays9to5 })
    expect(scheduledState(state, friction, at(6, 12))).toEqual({ ...state, paused: true })
    expect(scheduledState(state, friction, at(1, 12))).toBe(state)
  })

  it('never touches block or delay modes', () => {
    expect(scheduledState(state, sanitizeFriction({ friction: 'block' }), at(6, 12))).toBe(state)
    expect(scheduledState(state, sanitizeFriction({ friction: 'delay' }), at(6, 12))).toBe(state)
  })
})

describe('compileRules', () => {
  it('block mode is exactly the original block ruleset', () => {
    expect(compileRules(resolved, sanitizeFriction({ friction: 'block' }), { extensionOrigin: ORIGIN, hostAccess: true })).toEqual({
      rules: buildDnrRules(resolved),
      effective: 'block',
    })
  })

  it('schedule mode compiles block rules (the schedule only changes what is resolved)', () => {
    expect(compileRules(resolved, sanitizeFriction({ friction: 'schedule' }), { extensionOrigin: ORIGIN, hostAccess: false }).rules).toEqual(
      buildDnrRules(resolved),
    )
  })

  it('delay without host access falls back to blocking — never open', () => {
    expect(compileRules(resolved, sanitizeFriction({ friction: 'delay' }), { extensionOrigin: ORIGIN, hostAccess: false })).toEqual({
      rules: buildDnrRules(resolved),
      effective: 'block',
    })
  })

  it('delay with host access redirects page loads and blocks everything else', () => {
    const { rules, effective } = compileRules(resolved, sanitizeFriction({ friction: 'delay' }), {
      extensionOrigin: ORIGIN,
      hostAccess: true,
    })
    expect(effective).toBe('delay')
    expect(rules).toEqual(buildDelayRules(resolved, ORIGIN))
  })
})

describe('buildDelayRules', () => {
  const rules = buildDelayRules(resolved, ORIGIN)

  it('has unique ids', () => {
    expect(new Set(rules.map((rule: { id: number }) => rule.id)).size).toBe(rules.length)
  })

  it('uses exactly one regex rule for all page-load redirects', () => {
    const redirects = rules.filter((rule: { action: { type: string } }) => rule.action.type === 'redirect')
    expect(redirects).toEqual([
      {
        id: 3,
        priority: 1,
        action: { type: 'redirect', redirect: { regexSubstitution: `${ORIGIN}/interstitial.html#\\0` } },
        condition: { requestDomains: ['chatgpt.com', 'claude.ai'], regexFilter: '^.*$', resourceTypes: ['main_frame'] },
      },
    ])
  })

  it('blocks every non-navigation request type, so embeds and APIs stay blocked', () => {
    const blocks = rules.filter((rule: { action: { type: string } }) => rule.action.type === 'block')
    expect(blocks).toHaveLength(2)
    for (const rule of blocks) {
      expect(rule.condition.resourceTypes).toEqual(RESOURCE_TYPES.filter((type: string) => type !== 'main_frame'))
    }
  })

  it('keeps allow exceptions above the redirect', () => {
    const allow = rules.find((rule: { action: { type: string } }) => rule.action.type === 'allow')
    expect(allow).toMatchObject({ priority: 2, condition: { requestDomains: ['github.com'] } })
  })

  it('emits no redirect rule when nothing is blocked (requestDomains may not be empty)', () => {
    expect(buildDelayRules({ blocked: [], allowed: [] }, ORIGIN)).toEqual([])
  })
})

describe('passes', () => {
  it('allows one domain, in one tab, above everything else', () => {
    expect(passRule(900, 'chatgpt.com', 42)).toEqual({
      id: 900,
      priority: 3,
      action: { type: 'allowAllRequests' },
      condition: { requestDomains: ['chatgpt.com'], resourceTypes: ['main_frame'], tabIds: [42] },
    })
  })

  it('expires by time', () => {
    const passes = [
      { id: 1, expiresAt: 1000 },
      { id: 2, expiresAt: 2000 },
    ]
    expect(expiredPasses(passes, 1500)).toEqual([{ id: 1, expiresAt: 1000 }])
  })
})

describe('coveringDomain', () => {
  const blocked = ['chatgpt.com', 'openai.com', 'api.openai.com']

  it('finds the closest listed entry for a host, including trailing-dot FQDNs', () => {
    expect(coveringDomain('chatgpt.com', blocked)).toBe('chatgpt.com')
    expect(coveringDomain('www.chatgpt.com.', blocked)).toBe('chatgpt.com')
    expect(coveringDomain('api.openai.com', blocked)).toBe('api.openai.com')
    expect(coveringDomain('eu.api.openai.com', blocked)).toBe('api.openai.com')
  })

  it('never matches lookalikes', () => {
    expect(coveringDomain('notchatgpt.com', blocked)).toBeNull()
    expect(coveringDomain('chatgpt.com.evil.example', blocked)).toBeNull()
  })
})

describe('safeTarget', () => {
  it('accepts only http(s) URLs', () => {
    expect(safeTarget('https://chatgpt.com/c/1?x=2#frag')).toBe('https://chatgpt.com/c/1?x=2#frag')
    expect(safeTarget('javascript:alert(1)')).toBeNull()
    expect(safeTarget('data:text/html,hi')).toBeNull()
    expect(safeTarget('chrome://settings')).toBeNull()
    expect(safeTarget('not a url')).toBeNull()
  })
})

describe('describeSchedule', () => {
  it('summarises common schedules', () => {
    expect(describeSchedule(weekdays9to5)).toBe('Mon–Fri 09:00–17:00')
    expect(describeSchedule({ days: [0, 6], start: '10:00', end: '12:00' })).toBe('Sun, Sat 10:00–12:00')
    expect(describeSchedule({ days: [0, 1, 2, 3, 4, 5, 6], start: '22:00', end: '07:00' })).toBe('Every day 22:00–07:00')
    expect(describeSchedule({ days: [3], start: '00:00', end: '00:00' })).toBe('Wed, all day')
  })
})
