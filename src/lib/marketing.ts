import { getActiveDomains, rulePack } from './blocklists'

// Shared coverage stats for the marketing pages, computed once from the pack.
export const allCategoriesEnabled = Object.fromEntries(
  rulePack.categories.map((category) => [category.id, true]),
)

export const defaultDomains = getActiveDomains(allCategoriesEnabled, false)
export const defaultDomainCount = defaultDomains.length
export const strictDomainCount = getActiveDomains(allCategoriesEnabled, true).length
export const serviceCount = rulePack.categories.reduce(
  (total, category) => total + category.services.length,
  0,
)
