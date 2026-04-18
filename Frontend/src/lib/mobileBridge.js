const VOICE_RESULT_TIMEOUT_MS = 45000
const FLUTTER_BRIDGE_READY_TIMEOUT_MS = 4000

let activeBrowserRecognition = null
let flutterCameraBridgeInstalled = false

function isFlutterBridgeAvailable() {
  if (typeof window === "undefined") return false

  return Boolean(
    window.flutter_inappwebview &&
      typeof window.flutter_inappwebview.callHandler === "function",
  )
}

function isLikelyAndroidWebView() {
  if (typeof navigator === "undefined") return false

  const userAgent = navigator.userAgent || ""
  return /; wv\)/i.test(userAgent) || /\bVersion\/[\d.]+ Chrome\/[\d.]+ Mobile\b/i.test(userAgent)
}

function hasFlutterSpecificGlobals() {
  if (typeof window === "undefined") return false

  return Boolean(
    window.FlutterChannel ||
      window.flutterChannel ||
      window.flutterApp ||
      window.__flutter_inappwebview_ready__ ||
      window.__flutter_webview__,
  )
}

function getVoiceSearchChannel() {
  if (typeof window === "undefined") return null

  const directChannel = window.VoiceSearchChannel
  const aliasChannel = window.voiceSearchChannel
  const channel =
    directChannel && typeof directChannel.postMessage === "function"
      ? directChannel
      : aliasChannel && typeof aliasChannel.postMessage === "function"
        ? aliasChannel
        : null

  if (channel) {
    window.VoiceSearchChannel = channel
    window.voiceSearchChannel = channel
  }

  return channel
}

function getNativeShareChannel() {
  if (typeof window === "undefined") return null

  const directChannel = window.NativeShareChannel || window.ShareChannel
  const aliasChannel = window.nativeShareChannel || window.shareChannel
  const channel =
    directChannel && typeof directChannel.postMessage === "function"
      ? directChannel
      : aliasChannel && typeof aliasChannel.postMessage === "function"
        ? aliasChannel
        : null

  if (channel) {
    window.NativeShareChannel = channel
    window.nativeShareChannel = channel
  }

  return channel
}

function getWebkitNativeShareHandler() {
  if (typeof window === "undefined") return null

  const candidates = [
    window.webkit?.messageHandlers?.nativeShare,
    window.webkit?.messageHandlers?.NativeShare,
    window.webkit?.messageHandlers?.NativeShareChannel,
    window.webkit?.messageHandlers?.share,
    window.webkit?.messageHandlers?.ShareChannel,
  ]

  return candidates.find(
    (handler) => handler && typeof handler.postMessage === "function",
  ) || null
}

function normalizeTranscript(value) {
  if (typeof value === "string") return value
  if (value == null) return ""
  if (typeof value === "object") {
    return String(value.transcript ?? value.text ?? value.result ?? "")
  }
  return String(value)
}

function normalizeError(value) {
  if (typeof value === "string") return value
  if (value && typeof value === "object") {
    return String(value.message ?? value.error ?? "Voice search failed")
  }
  return "Voice search failed"
}

async function requestBrowserVoiceSearch() {
  if (typeof window === "undefined") {
    throw new Error("Voice search is unavailable in this environment")
  }

  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition

  if (!SpeechRecognition) {
    throw new Error("Voice search is not supported on this device")
  }

  return await new Promise((resolve, reject) => {
    const recognition = new SpeechRecognition()
    activeBrowserRecognition = recognition
    recognition.lang = "en-IN"
    recognition.interimResults = false
    recognition.maxAlternatives = 1

    recognition.onresult = (event) => {
      const transcript = event?.results?.[0]?.[0]?.transcript || ""
      activeBrowserRecognition = null
      resolve(String(transcript).trim())
    }

    recognition.onerror = (event) => {
      activeBrowserRecognition = null
      reject(new Error(event?.error || "Voice search failed"))
    }

    recognition.onend = () => {
      activeBrowserRecognition = null
    }

    recognition.start()
  })
}

export async function requestVoiceSearch() {
  if (typeof window === "undefined") {
    throw new Error("Voice search is unavailable in this environment")
  }

  if (
    window.flutter_inappwebview &&
    typeof window.flutter_inappwebview.callHandler === "function"
  ) {
    const result = await window.flutter_inappwebview.callHandler("startVoiceSearch")
    return normalizeTranscript(result)
  }

  const channel = getVoiceSearchChannel()
  if (channel) {
    return await new Promise((resolve, reject) => {
      const previousResultHandler = window.onFlutterVoiceResult
      const previousErrorHandler = window.onFlutterVoiceError
      let settled = false

      const cleanup = () => {
        window.clearTimeout(timeoutId)
        window.onFlutterVoiceResult = previousResultHandler
        window.onFlutterVoiceError = previousErrorHandler
      }

      const settle = (fn, value) => {
        if (settled) return
        settled = true
        cleanup()
        fn(value)
      }

      const timeoutId = window.setTimeout(() => {
        settle(reject, new Error("Voice search timed out"))
      }, VOICE_RESULT_TIMEOUT_MS)

      window.onFlutterVoiceResult = (value) => {
        settle(resolve, normalizeTranscript(value))
      }

      window.onFlutterVoiceError = (value) => {
        settle(reject, new Error(normalizeError(value)))
      }

      try {
        channel.postMessage("startVoiceSearch")
      } catch (error) {
        settle(reject, error instanceof Error ? error : new Error("Voice search failed"))
      }
    })
  }

  return await requestBrowserVoiceSearch()
}

export async function stopVoiceSearch() {
  if (typeof window === "undefined") return

  if (activeBrowserRecognition) {
    try {
      activeBrowserRecognition.stop()
    } catch (_) {
      // no-op
    }
    activeBrowserRecognition = null
  }

  if (
    window.flutter_inappwebview &&
    typeof window.flutter_inappwebview.callHandler === "function"
  ) {
    try {
      await window.flutter_inappwebview.callHandler("stopVoiceSearch")
      return
    } catch (_) {
      return
    }
  }

  const channel = getVoiceSearchChannel()
  if (channel) {
    try {
      channel.postMessage("stopVoiceSearch")
    } catch (_) {
      // no-op
    }
  }
}

export async function requestNativeGoogleSignIn() {
  if (typeof window === "undefined") return null

  const isReady = await waitForFlutterInAppWebView()

  if (isReady) {
    try {
      const result = await window.flutter_inappwebview.callHandler("nativeGoogleSignIn")
      return result || { success: false }
    } catch (error) {
      throw error instanceof Error ? error : new Error("Native Google sign-in failed")
    }
  }

  return null
}

export function hasNativeShareBridge() {
  if (isFlutterBridgeAvailable()) return true
  if (getWebkitNativeShareHandler()) return true
  return Boolean(getNativeShareChannel())
}

export async function requestNativeShare(payload) {
  if (typeof window === "undefined") {
    throw new Error("Native sharing is unavailable in this environment")
  }

  const sharePayload = {
    title: String(payload?.title || document.title || ""),
    text: String(payload?.text || ""),
    url: String(payload?.url || window.location.href),
  }

  if (isFlutterBridgeAvailable()) {
    // flutter_inappwebview supports structured payloads and works on Android/iOS.
    const result = await window.flutter_inappwebview.callHandler(
      "nativeShare",
      sharePayload,
    )

    if (result && typeof result === "object" && result.success === false) {
      throw new Error(result.error || "Native share failed")
    }

    return result || { success: true }
  }

  const webkitHandler = getWebkitNativeShareHandler()
  if (webkitHandler) {
    webkitHandler.postMessage(sharePayload)
    return { success: true }
  }

  const channel = getNativeShareChannel()
  if (channel) {
    channel.postMessage(JSON.stringify(sharePayload))
    return { success: true }
  }

  throw new Error("Native share bridge is not available")
}

function normalizeCameraResult(result) {
  if (!result || typeof result !== "object") {
    throw new Error("Camera capture failed")
  }

  if (!result.success) {
    throw new Error(result.error || "Camera capture cancelled")
  }

  if (!result.base64) {
    throw new Error("Camera capture did not return an image")
  }

  return {
    base64: String(result.base64),
    mimeType: String(result.mimeType || "image/jpeg"),
    fileName: String(result.fileName || `camera-${Date.now()}.jpg`),
  }
}

function base64ToUint8Array(base64) {
  const sanitizedBase64 = String(base64).replace(/\s/g, "")
  const binaryString = window.atob(sanitizedBase64)
  const bytes = new Uint8Array(binaryString.length)

  for (let index = 0; index < binaryString.length; index += 1) {
    bytes[index] = binaryString.charCodeAt(index)
  }

  return bytes
}

function createFileFromCameraResult(result) {
  const { base64, mimeType, fileName } = normalizeCameraResult(result)
  const bytes = base64ToUint8Array(base64)
  return new File([bytes], fileName, { type: mimeType })
}

function assignFileToInput(input, file) {
  const transfer = new DataTransfer()
  transfer.items.add(file)
  input.files = transfer.files
}

function isImageInput(input) {
  const accept = (input.getAttribute("accept") || "").toLowerCase()
  return accept.includes("image/")
}

function shouldUseFlutterCameraBridge(input) {
  if (!(input instanceof HTMLInputElement)) return false
  if (input.type !== "file" || input.disabled) return false
  if (input.multiple) return false
  if (!isImageInput(input)) return false
  if (input.dataset.flutterCameraBridge === "off") return false

  const capture = (input.getAttribute("capture") || "").toLowerCase()
  if (capture === "user" || capture === "environment") return true

  return input.dataset.flutterCameraBridge === "on"
}

function findAssociatedFileInput(target) {
  if (!(target instanceof Element)) return null

  if (target instanceof HTMLInputElement && target.type === "file") {
    return target
  }

  const parentLabel = target.closest("label")
  if (parentLabel) {
    const nestedInput = parentLabel.querySelector('input[type="file"]')
    if (nestedInput instanceof HTMLInputElement) {
      return nestedInput
    }

    const htmlFor = parentLabel.getAttribute("for")
    if (htmlFor) {
      const labelledInput = document.getElementById(htmlFor)
      if (labelledInput instanceof HTMLInputElement && labelledInput.type === "file") {
        return labelledInput
      }
    }
  }

  return null
}

export async function requestCameraCapture() {
  if (typeof window === "undefined") {
    throw new Error("Camera is unavailable in this environment")
  }

  const isReady = await waitForFlutterInAppWebView()
  if (!isReady) {
    throw new Error("Flutter camera bridge is not available")
  }

  const result = await window.flutter_inappwebview.callHandler("openCamera")
  return createFileFromCameraResult(result)
}

export function installFlutterCameraBridge() {
  if (typeof window === "undefined" || flutterCameraBridgeInstalled) return
      flutterCameraBridgeInstalled = true

  document.addEventListener(
    "click",
    async (event) => {
      const input = findAssociatedFileInput(event.target)
      if (!input || !shouldUseFlutterCameraBridge(input)) return
      if (!isLikelyFlutterWebView()) return

      event.preventDefault()
      event.stopPropagation()

      try {
        const file = await requestCameraCapture()
        assignFileToInput(input, file)
        input.dispatchEvent(new Event("input", { bubbles: true }))
        input.dispatchEvent(new Event("change", { bubbles: true }))
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Camera capture failed"

        if (message.toLowerCase().includes("cancel")) {
          return
        }

        console.error("Flutter camera bridge error:", error)
      }
    },
    true,
  )
}

export function hasFlutterInAppWebView() {
  return isFlutterBridgeAvailable()
}

export function isLikelyFlutterWebView() {
  if (isFlutterBridgeAvailable()) return true
  if (typeof window === "undefined") return false

  return hasFlutterSpecificGlobals() || isLikelyAndroidWebView()
}

export async function waitForFlutterInAppWebView(
  timeoutMs = FLUTTER_BRIDGE_READY_TIMEOUT_MS,
) {
  if (isFlutterBridgeAvailable()) return true
  if (typeof window === "undefined") return false

  return await new Promise((resolve) => {
    let settled = false
    let pollId = null

    const cleanup = () => {
      if (pollId) {
        window.clearInterval(pollId)
      }
      window.clearTimeout(timeoutId)
      window.removeEventListener(
        "flutterInAppWebViewPlatformReady",
        handleReadyEvent,
      )
    }

    const finish = (value) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(value)
    }

    const handleReadyEvent = () => {
      finish(isFlutterBridgeAvailable())
    }

    const timeoutId = window.setTimeout(() => {
      finish(isFlutterBridgeAvailable())
    }, timeoutMs)

    pollId = window.setInterval(() => {
      if (isFlutterBridgeAvailable()) {
        finish(true)
      }
    }, 50)

    window.addEventListener(
      "flutterInAppWebViewPlatformReady",
      handleReadyEvent,
      { once: true },
    )
  })
}
