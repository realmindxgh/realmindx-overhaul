const TTL = 5 * 60 * 1000
const MAX_SHOP_ENTRIES = 5
const CACHE_VERSION = 1

const shopCaches = new Map()
let homeCache = null

const now = () => Date.now()

const log = (msg, ...args) => {
  if (import.meta.env.DEV) console.debug(`[RouteCache] ${msg}`, ...args)
}

function isFresh(entry) {
  return entry && (now() - entry.cachedAt) < TTL
}

function evictOldest() {
  if (shopCaches.size <= MAX_SHOP_ENTRIES) return
  let oldestKey = null
  let oldestTime = Infinity
  for (const [key, entry] of shopCaches) {
    if (entry.cachedAt < oldestTime) {
      oldestTime = entry.cachedAt
      oldestKey = key
    }
  }
  if (oldestKey) { shopCaches.delete(oldestKey); log('evicted oldest entry', oldestKey) }
}

const DEFAULT_FILTER_SHAPE = ['categories','subjects','levels','curricula','publishers','min','max','ratingMin','ratingMax','inStock','query']

function hasFilterKeys(obj) {
  return obj && typeof obj === 'object' && DEFAULT_FILTER_SHAPE.every(k => k in obj)
}

export function isValidShopCache(entry) {
  if (!entry) { log('cache validation: entry is null'); return false }
  if (!entry.cachedAt || typeof entry.cachedAt !== 'number') { log('cache validation: missing or invalid cachedAt'); return false }
  if (!Array.isArray(entry.products)) { log('cache validation: products is not an array'); return false }
  if (typeof entry.totalCount !== 'number' || entry.totalCount < 0) { log('cache validation: invalid totalCount', entry.totalCount); return false }
  if (typeof entry.currentPage !== 'number' || entry.currentPage < 1) { log('cache validation: invalid currentPage', entry.currentPage); return false }
  if (typeof entry.hasMore !== 'boolean') { log('cache validation: hasMore is not boolean'); return false }
  if (!hasFilterKeys(entry.filters)) { log('cache validation: missing or invalid filters'); return false }
  if (typeof entry.sort !== 'string') { log('cache validation: sort is not string'); return false }
  if (entry.requestStatus !== 'success') { log('cache validation: requestStatus is not success', entry.requestStatus); return false }
  if (entry.cacheVersion !== CACHE_VERSION) { log('cache validation: version mismatch', entry.cacheVersion, CACHE_VERSION); return false }
  return true
}

export function buildShopCacheKey(filters, sort, batch, initialBrowse, initialQuery, examPicks = false) {
  const f = filters
  const base = examPicks ? 'exam-picks::1' : `${initialBrowse.taxonomy || ''}::${initialBrowse.value || ''}::${initialQuery || ''}`
  return `${base}|c:${(f.categories||[]).sort().join(',')}|s:${(f.subjects||[]).sort().join(',')}|l:${(f.levels||[]).sort().join(',')}|u:${(f.curricula||[]).sort().join(',')}|p:${(f.publishers||[]).sort().join(',')}|min:${f.min}|max:${f.max}|rmin:${f.ratingMin}|rmax:${f.ratingMax}|stock:${f.inStock}|q:${f.query||''}|sort:${sort}|b:${batch}`
}

export function saveShopCache(key, data) {
  if (!data.products || !Array.isArray(data.products)) { log('save skipped: products is not an array'); return }
  if (typeof data.totalCount !== 'number' || data.totalCount < 0) { log('save skipped: invalid totalCount'); return }
  if (!hasFilterKeys(data.filters)) { log('save skipped: invalid filters'); return }
  if (typeof data.sort !== 'string') { log('save skipped: invalid sort'); return }
  if (data.requestStatus !== 'success') { log('save skipped: requestStatus is not success', data.requestStatus); return }
  shopCaches.set(key, { ...data, cacheVersion: CACHE_VERSION, cachedAt: now() })
  log('saved', { key, products: data.products.length, total: data.totalCount });
  evictOldest()
}

export function getShopCacheStale(key) {
  const entry = shopCaches.get(key)
  if (!entry) { log('miss', key); return null }
  if (!isValidShopCache(entry)) {
    shopCaches.delete(key)
    log('deleted invalid entry', key);
    return null
  }
  if (isFresh(entry)) { log('hit (fresh)', { key, products: entry.products.length, total: entry.totalCount }); return entry }
  log('hit (stale)', { key, products: entry.products.length, total: entry.totalCount });
  return { ...entry, stale: true }
}

export function getShopCacheByBrowseScope(taxonomy, value, query) {
  const prefix = `${taxonomy || ''}::${value || ''}::${query || ''}|`
  let match = null
  for (const [key, entry] of shopCaches) {
    if (key.startsWith(prefix)) {
      if (!isFresh(entry)) {
        shopCaches.delete(key)
        continue
      }
      if (!match || entry.cachedAt > match.cachedAt) {
        match = { ...entry, key }
      }
    }
  }
  if (match) log('browse scope hit', { prefix, key: match.key });
  else log('browse scope miss', prefix);
  return match
}

export function getShopCacheByBrowseScopeStale(taxonomy, value, query) {
  const prefix = `${taxonomy || ''}::${value || ''}::${query || ''}|`
  let match = null
  for (const [key, entry] of shopCaches) {
    if (key.startsWith(prefix)) {
      if (!isValidShopCache(entry)) {
        shopCaches.delete(key)
        continue
      }
      if (!match || entry.cachedAt > match.cachedAt) {
        match = { ...entry, key, stale: !isFresh(entry) }
      }
    }
  }
  if (match) log('browse scope stale hit', { prefix, key: match.key, stale: match.stale, products: match.products.length });
  else log('browse scope stale miss', prefix);
  return match
}

export function saveHomeCache(data) {
  homeCache = { ...data, cachedAt: now() }
}

export function getHomeCacheStale() {
  if (!homeCache) return null
  if (isFresh(homeCache)) return homeCache
  return { ...homeCache, stale: true }
}

export function clearCache() {
  shopCaches.clear()
  homeCache = null
  log('cleared all caches')
}

export function invalidateProductCaches() {
  shopCaches.clear()
  homeCache = null
  log('invalidated all caches')
}

// --- In-memory scroll position tracker ---
// Tracks the latest scroll position per route for SPA navigation.
// Not persisted — lost on full page reload (use localStorage cache for that).
const scrollPositions = new Map()

export function saveCurrentScrollPosition(routeKey) {
  if (typeof window === 'undefined') return 0
  const pos = window.scrollY || window.pageYOffset || 0
  scrollPositions.set(routeKey, pos)
  return pos
}

export function getSavedScrollPosition(routeKey) {
  return scrollPositions.get(routeKey) || 0
}

export function hasSavedScroll(routeKey) {
  return scrollPositions.has(routeKey) && (scrollPositions.get(routeKey) || 0) > 5
}
