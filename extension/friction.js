// Softer friction on top of the policy engine. Pure functions, no extension
// APIs — shared by the background worker, the popup, the interstitial page,
// and the unit tests.
//
//   block    — blocked domains never load (the original behaviour; its rules
//              are exactly buildDnrRules(), unchanged)
//   delay    — a blocked site's page load is redirected to an extension page
//              with a countdown; after waiting, that one tab may open the site
//              for a short pass. Subresources (embeds, XHR) stay blocked.
//   schedule — block only inside configured hours; outside them the pack is
//              lifted like Pause (custom "also block" domains still apply).

import { buildDnrRules, RESOURCE_TYPES } from './enforce.js'

export const FRICTION_MODES = ['block', 'delay', 'schedule']

export const FRICTION_DEFAULTS = {
  friction: 'block',
  delaySeconds: 15,
  passMinutes: 10,
  schedule: { days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' },
}

export const DELAY_BOUNDS = { min: 3, max: 120 }
export const PASS_BOUNDS = { min: 1, max: 60 }

const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/

export function parseClock(value) {
  const match = typeof value === 'string' ? value.match(CLOCK) : null
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

function clampInt(value, { min, max }, fallback) {
  const number = Number(value)
  return Number.isInteger(number) ? Math.min(max, Math.max(min, number)) : fallback
}

// Stored settings are user- or storage-supplied: coerce everything to a known
// shape so a corrupted entry can only ever fall back to defaults.
export function sanitizeFriction(raw = {}) {
  const friction = FRICTION_MODES.includes(raw.friction) ? raw.friction : FRICTION_DEFAULTS.friction
  const rawSchedule = raw.schedule && typeof raw.schedule === 'object' ? raw.schedule : {}
  const days = Array.isArray(rawSchedule.days)
    ? Array.from(new Set(rawSchedule.days.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))).sort()
    : FRICTION_DEFAULTS.schedule.days

  return {
    friction,
    delaySeconds: clampInt(raw.delaySeconds, DELAY_BOUNDS, FRICTION_DEFAULTS.delaySeconds),
    passMinutes: clampInt(raw.passMinutes, PASS_BOUNDS, FRICTION_DEFAULTS.passMinutes),
    schedule: {
      days,
      start: parseClock(rawSchedule.start) === null ? FRICTION_DEFAULTS.schedule.start : rawSchedule.start,
      end: parseClock(rawSchedule.end) === null ? FRICTION_DEFAULTS.schedule.end : rawSchedule.end,
    },
  }
}

// True when `date` (local time) falls inside the schedule. Windows are
// [start, end); an end at or before the start runs overnight into the next
// day and belongs to the day it started on. start === end means all day.
export function isWithinSchedule(schedule, date) {
  const start = parseClock(schedule.start)
  const end = parseClock(schedule.end)
  if (start === null || end === null || schedule.days.length === 0) {
    return false
  }

  const day = date.getDay()
  const minute = date.getHours() * 60 + date.getMinutes()
  const today = schedule.days.includes(day)

  if (start === end) {
    return today
  }
  if (start < end) {
    return today && minute >= start && minute < end
  }

  const yesterday = schedule.days.includes((day + 6) % 7)
  return (today && minute >= start) || (yesterday && minute < end)
}

// The next minute boundary (local time) at which isWithinSchedule flips, or
// null if it never does. A minute-by-minute scan over eight days is ~11.5k
// cheap checks and stays correct across DST shifts and overnight windows.
export function nextScheduleChange(schedule, from) {
  const current = isWithinSchedule(schedule, from)
  const probe = new Date(from.getTime())
  probe.setSeconds(0, 0)

  for (let i = 0; i < 8 * 24 * 60; i += 1) {
    probe.setMinutes(probe.getMinutes() + 1)
    if (isWithinSchedule(schedule, probe) !== current) {
      return new Date(probe.getTime())
    }
  }

  return null
}

// Applies the schedule to the enforcement state: outside the window the pack
// is lifted exactly like Pause.
export function scheduledState(state, friction, now) {
  if (friction.friction === 'schedule' && !isWithinSchedule(friction.schedule, now)) {
    return { ...state, paused: true }
  }
  return state
}

const NON_NAVIGATION_TYPES = RESOURCE_TYPES.filter((type) => type !== 'main_frame')

export const INTERSTITIAL_PATH = '/interstitial.html'
export const PASS_PRIORITY = 3

// Delay-mode rules. Page loads of blocked domains are redirected to the
// interstitial with the original URL in the fragment (one regex rule total, so
// the 1,000-regex-rule cap can never be hit however large the pack grows);
// every other request type to those domains stays blocked. Allow exceptions
// keep priority 2 and win over both.
export function buildDelayRules({ blocked, allowed }, extensionOrigin) {
  const rules = []
  let id = 1

  for (const domain of blocked) {
    rules.push({
      id: id++,
      priority: 1,
      action: { type: 'block' },
      condition: { requestDomains: [domain], resourceTypes: NON_NAVIGATION_TYPES },
    })
  }

  if (blocked.length > 0) {
    rules.push({
      id: id++,
      priority: 1,
      action: { type: 'redirect', redirect: { regexSubstitution: `${extensionOrigin}${INTERSTITIAL_PATH}#\\0` } },
      condition: { requestDomains: [...blocked], regexFilter: '^.*$', resourceTypes: ['main_frame'] },
    })
  }

  for (const domain of allowed) {
    rules.push({
      id: id++,
      priority: 2,
      action: { type: 'allow' },
      condition: { requestDomains: [domain], resourceTypes: RESOURCE_TYPES },
    })
  }

  return rules
}

// Chooses the live ruleset. Delay needs host access (Chrome silently ignores
// redirect rules without it, which would let every blocked site load), so
// without it delay falls back to plain blocking: friction may only ever get
// stricter, never open.
export function compileRules(resolved, friction, { extensionOrigin, hostAccess }) {
  if (friction.friction === 'delay' && hostAccess && extensionOrigin) {
    return { rules: buildDelayRules(resolved, extensionOrigin), effective: 'delay' }
  }
  return { rules: buildDnrRules(resolved), effective: friction.friction === 'delay' ? 'block' : friction.friction }
}

// A tab-scoped pass after waiting out the delay: allowAllRequests on the page
// load lets that frame tree (including the site's own CDNs) work, in that tab
// only, until the pass expires.
export function passRule(id, domain, tabId) {
  return {
    id,
    priority: PASS_PRIORITY,
    action: { type: 'allowAllRequests' },
    condition: { requestDomains: [domain], resourceTypes: ['main_frame'], tabIds: [tabId] },
  }
}

// The blocked entry that covers `host` (the host itself or its closest
// listed parent), or null.
export function coveringDomain(host, blocked) {
  const normalized = String(host).toLowerCase().replace(/\.$/, '')
  const labels = normalized.split('.')
  const set = new Set(blocked)
  for (let i = 0; i < labels.length - 1; i += 1) {
    const candidate = labels.slice(i).join('.')
    if (set.has(candidate)) {
      return candidate
    }
  }
  return null
}

// The interstitial's target comes from its own URL fragment, i.e. from
// anyone who can link to the page. Only ever navigate to plain http(s).
export function safeTarget(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null
  } catch {
    return null
  }
}

export function expiredPasses(passes, now) {
  return passes.filter((pass) => pass.expiresAt <= now)
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// "Mon–Fri 09:00–17:00", "Sat, Sun 10:00–12:00", "Every day 22:00–07:00".
export function describeSchedule(schedule) {
  const days = [...schedule.days].sort()
  let label
  if (days.length === 7) {
    label = 'Every day'
  } else if (days.length === 0) {
    label = 'No days'
  } else if (days.every((day, index) => index === 0 || day === days[index - 1] + 1) && days.length > 2) {
    label = `${DAY_NAMES[days[0]]}–${DAY_NAMES[days[days.length - 1]]}`
  } else {
    label = days.map((day) => DAY_NAMES[day]).join(', ')
  }
  return schedule.start === schedule.end ? `${label}, all day` : `${label} ${schedule.start}–${schedule.end}`
}
