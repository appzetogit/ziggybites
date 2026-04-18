import { toast } from "sonner"
import {
  hasNativeShareBridge,
  isLikelyFlutterWebView,
  requestNativeShare,
} from "@/lib/mobileBridge"

let activeSharePromise = null

function getAbsoluteUrl(url) {
  if (typeof window === "undefined") return String(url || "")

  try {
    return new URL(url || window.location.href, window.location.origin).toString()
  } catch (_) {
    return window.location.href
  }
}

function normalizeShareData({ title, text, url } = {}) {
  const safeUrl = getAbsoluteUrl(url)

  return {
    title: String(title || (typeof document !== "undefined" ? document.title : "ZiggyBites")),
    text: String(text || ""),
    url: safeUrl,
  }
}

function getClipboardText({ text, url }) {
  return [text, url].filter(Boolean).join("\n")
}

async function copyShareDataToClipboard(shareData) {
  const clipboardText = getClipboardText(shareData)

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(clipboardText)
    return
  }

  const textArea = document.createElement("textarea")
  textArea.value = clipboardText
  textArea.setAttribute("readonly", "")
  textArea.style.position = "fixed"
  textArea.style.left = "-9999px"
  textArea.style.opacity = "0"
  document.body.appendChild(textArea)
  textArea.select()

  try {
    const copied = document.execCommand("copy")
    if (!copied) {
      throw new Error("Copy command was rejected")
    }
  } finally {
    document.body.removeChild(textArea)
  }
}

function isAbortError(error) {
  return error?.name === "AbortError" || /abort|cancel/i.test(error?.message || "")
}

function canUseWebShare(shareData) {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
    return false
  }

  if (typeof navigator.canShare === "function") {
    try {
      if (navigator.canShare({ url: shareData.url })) {
        return true
      }
    } catch (_) {
      // Ignore capability probing errors and fall back to the browser's
      // share implementation when `navigator.share` exists.
    }
  }

  return true
}

function isFlutterNativeShareCandidate() {
  return isLikelyFlutterWebView() && hasNativeShareBridge()
}

async function shareViaFlutterBridge(shareData) {
  try {
    await requestNativeShare(shareData)
    return { status: "native" }
  } catch (error) {
    if (isAbortError(error)) {
      return { status: "cancelled" }
    }

    console.warn("Flutter native share failed:", error)
    return null
  }
}

async function shareViaWebShareApi(shareData) {
  if (!canUseWebShare(shareData)) {
    return null
  }

  try {
    await navigator.share(shareData)
    return { status: "web-share" }
  } catch (error) {
    if (isAbortError(error)) {
      return { status: "cancelled" }
    }

    console.warn("Web Share API failed, falling back:", error)
    return null
  }
}

async function runShare(shareData) {
  // Priority order:
  // 1. Flutter WebView bridge -> real native Android/iOS share sheet
  // 2. Browser Web Share API
  // 3. Clipboard fallback
  if (isFlutterNativeShareCandidate()) {
    const nativeResult = await shareViaFlutterBridge(shareData)
    if (nativeResult) {
      return nativeResult
    }
  }

  const webShareResult = await shareViaWebShareApi(shareData)
  if (webShareResult) {
    return webShareResult
  }

  try {
    await copyShareDataToClipboard(shareData)
    toast.success("Link copied")
    return { status: "copied" }
  } catch (error) {
    if (isAbortError(error)) {
      return { status: "cancelled" }
    }

    throw error
  }
}

export async function handleShare(shareInput = {}) {
  if (activeSharePromise) {
    return activeSharePromise
  }

  const shareData = normalizeShareData(shareInput)

  activeSharePromise = runShare(shareData)
    .catch((error) => {
      console.error("Share failed:", error)
      toast.error("Unable to share right now")
      return { status: "failed", error }
    })
    .finally(() => {
      activeSharePromise = null
    })

  return activeSharePromise
}
