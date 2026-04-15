const VOICE_RESULT_TIMEOUT_MS = 45000

let activeBrowserRecognition = null

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

  if (
    window.flutter_inappwebview &&
    typeof window.flutter_inappwebview.callHandler === "function"
  ) {
    try {
      const result = await window.flutter_inappwebview.callHandler("nativeGoogleSignIn")
      return result || { success: false }
    } catch (error) {
      throw error instanceof Error ? error : new Error("Native Google sign-in failed")
    }
  }

  return null
}

export function hasFlutterInAppWebView() {
  if (typeof window === "undefined") return false

  return Boolean(
    window.flutter_inappwebview &&
      typeof window.flutter_inappwebview.callHandler === "function",
  )
}
