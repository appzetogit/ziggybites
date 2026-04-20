import { toast } from "sonner"

const VERSION_ENDPOINT = "/app-version.json"
const DEFAULT_POLL_INTERVAL_MS = 2 * 60 * 1000
const INITIAL_DELAY_MS = 30 * 1000
const TOAST_ID = "app-auto-update"

async function fetchLatestBuildId() {
  const response = await fetch(`${VERSION_ENDPOINT}?t=${Date.now()}`, {
    cache: "no-store",
    headers: {
      "cache-control": "no-cache",
      pragma: "no-cache",
    },
  })

  if (!response.ok) {
    throw new Error(`Version check failed with status ${response.status}`)
  }

  const payload = await response.json()
  return payload?.buildId || null
}

export function startAutoUpdate({
  currentBuildId = typeof __APP_BUILD_ID__ !== "undefined" ? __APP_BUILD_ID__ : null,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
} = {}) {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => {}
  }

  if (import.meta.env.DEV || !currentBuildId) {
    return () => {}
  }

  let disposed = false
  let updateDetected = false
  let timeoutId = null
  let intervalId = null

  const reloadToLatestBuild = () => {
    const currentUrl = new URL(window.location.href)
    currentUrl.searchParams.set("_appUpdated", Date.now().toString())
    window.location.replace(currentUrl.toString())
  }

  const handleUpdateDetected = () => {
    if (updateDetected || disposed) return
    updateDetected = true

    toast.dismiss(TOAST_ID)
    toast.success("App updated. Reloading to the latest version...", {
      id: TOAST_ID,
      duration: 2500,
      style: { marginTop: "80px" },
    })

    window.setTimeout(() => {
      if (!disposed) {
        reloadToLatestBuild()
      }
    }, 1200)
  }

  const checkForUpdate = async () => {
    if (disposed || updateDetected) return
    if (document.visibilityState === "hidden") return
    if (typeof navigator !== "undefined" && "onLine" in navigator && !navigator.onLine) return

    try {
      const latestBuildId = await fetchLatestBuildId()
      if (latestBuildId && latestBuildId !== currentBuildId) {
        handleUpdateDetected()
      }
    } catch (error) {
      console.warn("[AutoUpdate] Failed to check latest app version:", error)
    }
  }

  const handleVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      void checkForUpdate()
    }
  }

  const handleOnline = () => {
    void checkForUpdate()
  }

  timeoutId = window.setTimeout(() => {
    void checkForUpdate()
    intervalId = window.setInterval(() => {
      void checkForUpdate()
    }, pollIntervalMs)
  }, INITIAL_DELAY_MS)

  document.addEventListener("visibilitychange", handleVisibilityChange)
  window.addEventListener("online", handleOnline)

  return () => {
    disposed = true
    if (timeoutId) window.clearTimeout(timeoutId)
    if (intervalId) window.clearInterval(intervalId)
    document.removeEventListener("visibilitychange", handleVisibilityChange)
    window.removeEventListener("online", handleOnline)
    toast.dismiss(TOAST_ID)
  }
}
