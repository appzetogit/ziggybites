/**
 * Subscription meal draft in localStorage — scoped by logged-in user so new accounts
 * never inherit another user's selections from a shared browser key.
 */
import { getModuleToken, getUserIdFromToken } from "@/lib/utils/auth"

export const LEGACY_SUBSCRIPTION_DRAFT_KEY = "ziggybites_subscription_draft"

const GUEST_SUBSCRIPTION_DRAFT_KEY = "ziggybites_subscription_draft_guest"

export function getSubscriptionDraftStorageKey() {
  if (typeof window === "undefined") return GUEST_SUBSCRIPTION_DRAFT_KEY
  const token = getModuleToken("user")
  if (!token) return GUEST_SUBSCRIPTION_DRAFT_KEY
  const userId = getUserIdFromToken(token)
  if (!userId) return GUEST_SUBSCRIPTION_DRAFT_KEY
  return `${LEGACY_SUBSCRIPTION_DRAFT_KEY}_user_${String(userId)}`
}

export function readSubscriptionDraftFromStorage() {
  const key = getSubscriptionDraftStorageKey()
  try {
    const raw = localStorage.getItem(key)
    if (raw) {
      const d = JSON.parse(raw)
      return Array.isArray(d) ? d : []
    }
    return []
  } catch {
    return []
  }
}

export function writeSubscriptionDraftToStorage(items) {
  if (typeof window === "undefined") return
  const key = getSubscriptionDraftStorageKey()
  try {
    localStorage.setItem(key, JSON.stringify(Array.isArray(items) ? items : []))
    window.dispatchEvent(new Event("subscriptionDraftUpdated"))
  } catch (e) {
    console.warn("Failed to persist subscription draft", e)
  }
}

/** Removes the old single global key (cross-account leak). */
export function clearLegacySubscriptionDraftKey() {
  try {
    localStorage.removeItem(LEGACY_SUBSCRIPTION_DRAFT_KEY)
  } catch {
    /* ignore */
  }
}

/**
 * Call after user JWT is stored: drop legacy key; if this user has no draft yet, promote guest draft once.
 */
export function syncSubscriptionDraftAfterUserLogin() {
  if (typeof window === "undefined") return
  clearLegacySubscriptionDraftKey()
  const token = getModuleToken("user")
  const userId = token ? getUserIdFromToken(token) : null
  if (!userId) return
  const userKey = `${LEGACY_SUBSCRIPTION_DRAFT_KEY}_user_${String(userId)}`
  try {
    const existing = localStorage.getItem(userKey)
    if (existing) {
      const parsed = JSON.parse(existing)
      if (Array.isArray(parsed) && parsed.length > 0) return
    }
    const guestRaw = localStorage.getItem(GUEST_SUBSCRIPTION_DRAFT_KEY)
    if (!guestRaw) return
    const guest = JSON.parse(guestRaw)
    if (Array.isArray(guest) && guest.length > 0) {
      localStorage.setItem(userKey, guestRaw)
    }
    localStorage.removeItem(GUEST_SUBSCRIPTION_DRAFT_KEY)
  } catch {
    /* ignore */
  }
}
