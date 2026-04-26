import { useState, useEffect, useRef } from "react"
import { useNavigate, useSearchParams, Link } from "react-router-dom"
import { Mail, Phone, AlertCircle, Loader2 } from "lucide-react"
import AnimatedPage from "../../components/AnimatedPage"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { authAPI } from "@/lib/api"
import { firebaseAuth, ensureFirebaseInitialized, signInWithGoogleBridge } from "@/lib/firebase"
import { setAuthData } from "@/lib/utils/auth"
import { syncSubscriptionDraftAfterUserLogin } from "@/module/user/utils/subscriptionDraftStorage.js"
import { registerFcmTokenForLoggedInUser } from "@/lib/notifications/fcmWeb"
import ziggybitesLogo from "@/assets/ziggybiteslogo.png"

// Common country codes
const countryCodes = [
  { code: "+1", country: "US/CA", flag: "🇺🇸" },
  { code: "+44", country: "UK", flag: "🇬🇧" },
  { code: "+91", country: "IN", flag: "🇮🇳" },
  { code: "+86", country: "CN", flag: "🇨🇳" },
  { code: "+81", country: "JP", flag: "🇯🇵" },
  { code: "+49", country: "DE", flag: "🇩🇪" },
  { code: "+33", country: "FR", flag: "🇫🇷" },
  { code: "+39", country: "IT", flag: "🇮🇹" },
  { code: "+34", country: "ES", flag: "🇪🇸" },
  { code: "+61", country: "AU", flag: "🇦🇺" },
  { code: "+7", country: "RU", flag: "🇷🇺" },
  { code: "+55", country: "BR", flag: "🇧🇷" },
  { code: "+52", country: "MX", flag: "🇲🇽" },
  { code: "+82", country: "KR", flag: "🇰🇷" },
  { code: "+65", country: "SG", flag: "🇸🇬" },
  { code: "+971", country: "AE", flag: "🇦🇪" },
  { code: "+966", country: "SA", flag: "🇸🇦" },
  { code: "+27", country: "ZA", flag: "🇿🇦" },
  { code: "+31", country: "NL", flag: "🇳🇱" },
  { code: "+46", country: "SE", flag: "🇸🇪" },
]

export default function SignIn() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isSignUp = searchParams.get("mode") === "signup"

  const [authMethod, setAuthMethod] = useState("phone") // "phone" or "email"
  const [formData, setFormData] = useState({
    phone: "",
    countryCode: "+91",
    email: "",
    name: "",
    rememberMe: false,
  })
  const [errors, setErrors] = useState({
    phone: "",
    email: "",
    name: "",
  })
  const [isLoading, setIsLoading] = useState(false)
  const [apiError, setApiError] = useState("")
  const redirectHandledRef = useRef(false)
  const initRanRef = useRef(false)
  const navigateRef = useRef(navigate)

  // Prefill phone when user comes back from OTP screen
  useEffect(() => {
    const stored = sessionStorage.getItem("userAuthData")
    if (!stored) return
    try {
      const data = JSON.parse(stored)
      if (data.method === "phone" && data.phone) {
        const match = String(data.phone).trim().match(/^(\+\d+)\s*(.*)$/)
        if (match) {
          const [, code, num] = match
          setFormData((prev) => ({
            ...prev,
            countryCode: code || "+91",
            phone: (num || "").replace(/\D/g, ""),
          }))
        }
      }
    } catch (_) {}
  }, [])

  // Keep navigate ref in sync
  navigateRef.current = navigate

  // Helper function to process signed-in user
  const processSignedInUser = async (user, source = "unknown") => {
    if (redirectHandledRef.current) {
      console.log(`ℹ️ User already being processed, skipping (source: ${source})`)
      return
    }

    console.log(`✅ Processing signed-in user from ${source}:`, {
      email: user.email,
      uid: user.uid,
      displayName: user.displayName
    })

    redirectHandledRef.current = true
    setIsLoading(true)
    setApiError("")

    try {
      const idToken = await user.getIdToken()
      console.log(`✅ Got ID token from ${source}, calling backend...`)

      const response = await authAPI.firebaseGoogleLogin(idToken, "user")
      const data = response?.data?.data || {}

      console.log(`✅ Backend response from ${source}:`, {
        hasAccessToken: !!data.accessToken,
        hasUser: !!data.user,
        userEmail: data.user?.email
      })

      const accessToken = data.accessToken
      const appUser = data.user

      if (accessToken && appUser) {
        setAuthData("user", accessToken, appUser)
        syncSubscriptionDraftAfterUserLogin()
        window.dispatchEvent(new Event("userAuthChanged"))

        // Register FCM token for push notifications (fire-and-forget)
        registerFcmTokenForLoggedInUser().catch(() => {})

        // Show a welcome notification after login
        const showLoginNotification = async () => {
          if (typeof Notification === "undefined") return
          if (Notification.permission !== "granted") {
            try {
              await Notification.requestPermission()
            } catch {}
          }
          if (Notification.permission === "granted") {
            new Notification("Login Successful", {
              body: "Welcome back!",
              icon: "/favicon.ico",
            })
          }
        }
        showLoginNotification().catch(() => {})

        // Clear any URL hash or params
        const hasHash = window.location.hash.length > 0
        const hasQueryParams = window.location.search.length > 0
        if (hasHash || hasQueryParams) {
          window.history.replaceState({}, document.title, window.location.pathname)
        }

        console.log(`✅ Navigating to user dashboard from ${source}...`)
        navigateRef.current("/user", { replace: true })
      } else {
        console.error(`❌ Invalid backend response from ${source}`)
        redirectHandledRef.current = false
        setIsLoading(false)
        setApiError("Invalid response from server. Please try again.")
      }
    } catch (error) {
      console.error(`❌ Error processing user from ${source}:`, error)
      redirectHandledRef.current = false
      setIsLoading(false)

      let errorMessage = "Failed to complete sign-in. Please try again."
      if (error?.response?.data?.message) {
        errorMessage = error.response.data.message
      } else if (error?.message) {
        errorMessage = error.message
      }
      setApiError(errorMessage)
    }
  }

  // Handle Firebase redirect result on component mount ONLY (run once)
  useEffect(() => {
    // Prevent running multiple times (e.g. React StrictMode double-mount)
    if (initRanRef.current) return
    initRanRef.current = true

    let unsubscribe = null
    let cancelled = false

    const handleRedirectResult = async () => {
      if (cancelled || redirectHandledRef.current) return

      try {
        const { getRedirectResult } = await import("firebase/auth")
        await ensureFirebaseInitialized()

        if (!firebaseAuth) {
          console.log("ℹ️ Firebase Auth not ready, skipping redirect check")
          return
        }

        // Check if we're coming back from a redirect
        let result = null
        try {
          result = await Promise.race([
            getRedirectResult(firebaseAuth),
            new Promise((resolve) =>
              setTimeout(() => resolve(null), 3000)
            )
          ])
        } catch (redirectError) {
          console.log("ℹ️ getRedirectResult error:", redirectError?.code)
          result = null
        }

        if (cancelled || redirectHandledRef.current) return

        if (result?.user) {
          await processSignedInUser(result.user, "redirect-result")
        }
        // NOTE: Removed auto-processing of currentUser here to prevent loops.
        // Users with a stale Firebase session will need to click "Sign in" again.
      } catch (error) {
        if (cancelled) return
        console.error("❌ Google sign-in check error:", error)
        setApiError("Failed to check authentication status. Please try refreshing.")
        setIsLoading(false)
      }
    }

    const setupAuthListener = async () => {
      try {
        const { onAuthStateChanged } = await import("firebase/auth")
        await ensureFirebaseInitialized()

        if (!firebaseAuth) return

        // We only care about NEW sign-ins triggered by the user on this page,
        // not existing Firebase sessions. Track whether listener has fired once.
        let initialFire = true

        unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
          if (cancelled || redirectHandledRef.current) return

          // Skip the first fire — it just reports the existing Firebase session
          // which causes the loop if the user is already signed in with Google.
          if (initialFire) {
            initialFire = false
            return
          }

          if (user && window.location.pathname.includes('/auth/sign-in')) {
            await processSignedInUser(user, "auth-state-listener")
          }
        })
      } catch (error) {
        console.error("❌ Error setting up auth state listener:", error)
      }
    }

    // Initialize everything
    const init = async () => {
      await setupAuthListener()
      // Small delay to let Firebase state settle
      setTimeout(() => {
        if (!cancelled) handleRedirectResult()
      }, 500)
    }

    init()

    return () => {
      cancelled = true
      if (unsubscribe) unsubscribe()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const validateEmail = (email) => {
    if (!email.trim()) {
      return "Email is required"
    }
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/
    if (!emailRegex.test(email.trim())) {
      return "Please enter a valid email address"
    }
    return ""
  }

  const validatePhone = (phone, countryCode = formData.countryCode) => {
    if (!phone.trim()) {
      return "Phone number is required"
    }
    const cleanPhone = phone.replace(/\D/g, "")
    if (!/^\d+$/.test(cleanPhone)) {
      return "Please enter a valid phone number (digits only)"
    }
    const isIndianPhone = countryCode === "+91"
    if (isIndianPhone && cleanPhone.length !== 10) {
      return "Phone number must be 10 digits"
    }
    if (!isIndianPhone && (cleanPhone.length < 7 || cleanPhone.length > 15)) {
      return "Phone number must be 7 to 15 digits"
    }
    if (isIndianPhone && !["6", "7", "8", "9"].includes(cleanPhone[0])) {
      return "Please enter a valid 10-digit mobile number"
    }
    return ""
  }

  const validateName = (name) => {
    if (!name.trim()) {
      return "Name is required"
    }
    if (name.trim().length < 2) {
      return "Name must be at least 2 characters"
    }
    if (name.trim().length > 50) {
      return "Name must be less than 50 characters"
    }
    const nameRegex = /^[a-zA-Z\s]+$/
    if (!nameRegex.test(name.trim())) {
      return "Name can only contain alphabets"
    }
    return ""
  }

  const maxPhoneLength = formData.countryCode === "+91" ? 10 : 15
  const isIndianNumber = formData.countryCode === "+91"

  const handleChange = (e) => {
    const { name, value } = e.target
    let nextValue = value
    if (name === "phone") {
      nextValue = value.replace(/\D/g, "").slice(0, maxPhoneLength)
    }
    if (name === "name") {
      nextValue = value.replace(/[^a-zA-Z\s]/g, "")
    }
    setFormData({
      ...formData,
      [name]: nextValue,
    })

    // Real-time validation
    if (name === "email") {
      setErrors({ ...errors, email: validateEmail(value) })
    } else if (name === "phone") {
      setErrors({ ...errors, phone: validatePhone(nextValue) })
    } else if (name === "countryCode") {
      setErrors({ ...errors, phone: validatePhone(formData.phone, nextValue) })
    } else if (name === "name") {
      setErrors({ ...errors, name: validateName(nextValue) })
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsLoading(true)
    setApiError("")

    // Validate based on auth method
    let hasErrors = false
    const newErrors = { phone: "", email: "", name: "" }

    if (authMethod === "phone") {
      const phoneError = validatePhone(formData.phone, formData.countryCode)
      newErrors.phone = phoneError
      if (phoneError) hasErrors = true
    } else {
      const emailError = validateEmail(formData.email)
      newErrors.email = emailError
      if (emailError) hasErrors = true
    }

    // Validate name for sign up
    if (isSignUp) {
      const nameError = validateName(formData.name)
      newErrors.name = nameError
      if (nameError) hasErrors = true
    }

    setErrors(newErrors)

    if (hasErrors) {
      setIsLoading(false)
      return
    }

    try {
      const purpose = isSignUp ? "register" : "login"
      const phoneDigits = (formData.phone || "").replace(/\D/g, "")
      const fullPhone = authMethod === "phone" ? `${formData.countryCode} ${phoneDigits}`.trim() : null
      const email = authMethod === "email" ? formData.email.trim() : null

      // Call backend to send OTP
      await authAPI.sendOTP(fullPhone, purpose, email)

      // Store auth data in sessionStorage for OTP page (include rememberMe for after OTP)
      const authData = {
        method: authMethod,
        phone: fullPhone,
        email: email,
        name: isSignUp ? formData.name.trim() : null,
        isSignUp,
        module: "user",
        rememberMe: !!formData.rememberMe,
      }
      sessionStorage.setItem("userAuthData", JSON.stringify(authData))

      // Navigate to OTP page
      navigate("/user/auth/otp")
    } catch (error) {
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        "Failed to send OTP. Please try again."
      setApiError(message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setApiError("")
    setIsLoading(true)
    redirectHandledRef.current = false // Reset flag when starting new sign-in

    try {
      const { result, source, cancelled } = await signInWithGoogleBridge()

      if (cancelled) {
        setIsLoading(false)
        redirectHandledRef.current = false
        return
      }

      console.log("Google sign-in successful:", {
        user: result?.user?.email,
        operationType: result?.operationType,
        source,
      })

      if (result?.user) {
        await processSignedInUser(result.user, source)
      }
    } catch (error) {
      console.error("Google sign-in error:", error)
      console.error("Error code:", error?.code)
      console.error("Error message:", error?.message)
      setIsLoading(false)
      redirectHandledRef.current = false

      const errorCode = error?.code || ""
      const errorMessage = error?.message || ""

      let message = "Google sign-in failed. Please try again."

      if (errorCode === "auth/configuration-not-found") {
        message = "Firebase configuration error. Please ensure your domain is authorized in Firebase Console. Current domain: " + window.location.hostname
      } else if (errorCode === "auth/operation-not-allowed") {
        message = "This sign-in method is disabled. Please enable it in the Firebase Console."
      } else if (errorCode === "auth/popup-blocked") {
        message = "Popup was blocked. Please allow popups and try again."
      } else if (
        errorCode === "auth/popup-closed-by-user" ||
        errorCode === "auth/cancelled-popup-request" ||
        errorMessage.toLowerCase().includes("cancel") ||
        errorMessage.toLowerCase().includes("closed by user")
      ) {
        return
      } else if (errorCode === "auth/network-request-failed") {
        message = "Network error. Please check your connection and try again."
      } else if (errorMessage) {
        message = errorMessage
      } else if (error?.response?.data?.message) {
        message = error.response.data.message
      } else if (error?.response?.data?.error) {
        message = error.response.data.error
      }

      setApiError(message)
    }
  }

  const toggleMode = () => {
    const newMode = isSignUp ? "signin" : "signup"
    navigate(`/user/auth/sign-in?mode=${newMode}`, { replace: true })
    // Reset form
    setFormData({ phone: "", countryCode: "+91", email: "", name: "", rememberMe: false })
    setErrors({ phone: "", email: "", name: "" })
  }

  const handleLoginMethodChange = () => {
    setAuthMethod(authMethod === "email" ? "phone" : "email")
  }

  return (
    <AnimatedPage className="h-[100dvh] max-h-[100dvh] flex flex-col bg-white dark:bg-[#0a0a0a] overflow-hidden !pb-0 md:flex-row md:overflow-hidden">

       {/* Mobile: Top Section - Banner Image */}
       {/* Desktop: Left Section - Banner Image */}
       {/* Mobile: Top Section - Delivery logo (ZigZagLite red theme) */}
      <div className="relative md:hidden w-full shrink-0 flex items-center justify-center bg-white dark:bg-white px-4 pt-4" style={{ height: "clamp(220px, 32dvh, 280px)" }}>
        <div className="flex flex-col items-center justify-center">
          <img
            src="/image.png"
            alt="ZiggyBites"
            className="w-48 h-auto object-contain sm:w-56"
            onError={(e) => { e.target.onerror = null; e.target.src = ziggybitesLogo }}
          />
        </div>
       </div>

       {/* Desktop: Left Section - Delivery logo */}
      <div className="relative hidden md:flex w-full shrink-0 md:w-1/2 md:h-full items-center justify-center bg-white dark:bg-white">
        <div className="flex flex-col items-center justify-center">
          <img
            src="/image.png"
            alt="ZiggyBites"
            className="w-80 lg:w-96 h-auto object-contain"
            onError={(e) => { e.target.onerror = null; e.target.src = ziggybitesLogo }}
          />
        </div>
       </div>

      {/* Mobile: Bottom Section - White Login Form (scrollable); Desktop: Right Section - Login Form */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden md:w-1/2 md:h-full md:overflow-hidden">
        <div className="flex-1 min-h-0 overflow-hidden p-3 sm:p-4 md:p-6 lg:p-8 xl:p-10 md:flex md:items-center md:justify-center bg-white dark:bg-[#1a1a1a]">
        <div className="max-w-md lg:max-w-lg xl:max-w-xl mx-auto flex h-full w-full flex-col justify-between gap-4 md:h-auto md:justify-center md:space-y-8 lg:space-y-10">
          {/* Heading - ZigZagLite: subscription food delivery (no dine-in) */}
          <div className="text-center space-y-1.5 md:space-y-3">
            <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-black dark:text-white leading-tight">
              India's #1 Subscription Food Delivery App
            </h2>
            <p className="text-sm sm:text-base md:text-lg text-gray-600 dark:text-gray-400">
              Log in or sign up
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-3 md:space-y-5">
            {/* Name field for sign up - hidden by default, shown only when needed */}
            {isSignUp && (
              <div className="space-y-2">
                <Input
                  id="name"
                  name="name"
                  placeholder="Enter your full name"
                  value={formData.name}
                  onChange={handleChange}
                  className={`text-base md:text-lg h-12 md:h-14 bg-white dark:bg-[#1a1a1a] text-black dark:text-white ${errors.name ? "border-red-500" : "border-gray-300 dark:border-gray-700"} transition-colors`}
                  aria-invalid={errors.name ? "true" : "false"}
                />
                {errors.name && (
                  <div className="flex items-center gap-1 text-xs text-red-600">
                    <AlertCircle className="h-3 w-3" />
                    <span>{errors.name}</span>
                  </div>
                )}
              </div>
            )}

            {/* Phone Number Input */}
            {authMethod === "phone" && (
              <div className="space-y-2">
                <div className="flex items-stretch">
                  <div className="mr-2 flex h-12 md:h-14 items-center rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 dark:border-gray-700 dark:bg-[#1a1a1a] dark:text-white">
                    <select
                      id="countryCode"
                      name="countryCode"
                      value={formData.countryCode}
                      onChange={handleChange}
                      className="bg-transparent pr-1 outline-none"
                      aria-label="Select country code"
                    >
                      {countryCodes.map((country) => (
                        <option key={country.code} value={country.code}>
                          {country.flag} {country.code}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Input
                    id="phone"
                    name="phone"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    placeholder={isIndianNumber ? "Enter 10-digit mobile number" : "Enter phone number"}
                    value={formData.phone}
                    onChange={handleChange}
                    className={`flex-1 h-12 md:h-14 text-base md:text-lg bg-white dark:bg-[#1a1a1a] text-black dark:text-white border-gray-300 dark:border-gray-700 rounded-lg ${errors.phone ? "border-red-500" : ""} transition-colors`}
                    aria-invalid={errors.phone ? "true" : "false"}
                  />
                </div>
                {errors.phone && (
                  <div className="flex items-center gap-1 text-xs text-red-600">
                    <AlertCircle className="h-3 w-3" />
                    <span>{errors.phone}</span>
                  </div>
                )}
                {apiError && authMethod === "phone" && (
                  <div className="flex items-center gap-1 text-xs text-red-600">
                    <AlertCircle className="h-3 w-3" />
                    <span>{apiError}</span>
                  </div>
                )}
              </div>
            )}

            {/* Email Input */}
            {authMethod === "email" && (
              <div className="space-y-2">
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="Enter your email address"
                  value={formData.email}
                  onChange={handleChange}
                  className={`w-full h-12 md:h-14 text-base md:text-lg bg-white dark:bg-[#1a1a1a] text-black dark:text-white border-2 rounded-lg focus-visible:ring-2 focus-visible:ring-[#DC2626] focus-visible:border-[#DC2626] ${errors.email ? "border-red-500" : "border-gray-300 dark:border-gray-700"} transition-colors`}
                  aria-invalid={errors.email ? "true" : "false"}
                />
                {errors.email && (
                  <div className="flex items-center gap-1 text-xs text-red-600">
                    <AlertCircle className="h-3 w-3" />
                    <span>{errors.email}</span>
                  </div>
                )}
                {apiError && authMethod === "email" && (
                  <div className="flex items-center gap-1 text-xs text-red-600">
                    <AlertCircle className="h-3 w-3" />
                    <span>{apiError}</span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setAuthMethod("phone")
                    setApiError("")
                  }}
                  className="text-xs text-[#DC2626] hover:underline text-left"
                >
                  Use phone instead
                </button>
              </div>
            )}

            {/* Remember Me Checkbox */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="rememberMe"
                checked={formData.rememberMe}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, rememberMe: checked })
                }
                className="w-4 h-4 border-2 border-gray-300 rounded data-[state=checked]:bg-[#DC2626] data-[state=checked]:border-[#DC2626] flex items-center justify-center"
              />
              <label
                htmlFor="rememberMe"
                className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer select-none"
              >
                Remember my login for faster sign-in
              </label>
            </div>

            {/* Continue Button - ZigZagLite red */}
            <Button
              type="submit"
              className="w-full h-12 md:h-14 text-white font-bold text-base md:text-lg rounded-lg transition-all hover:opacity-95 hover:shadow-lg active:scale-[0.98] bg-[#DC2626] hover:bg-[#B91C1C]"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {isSignUp ? "Creating Account..." : "Signing In..."}
                </>
              ) : (
                "Continue"
              )}
            </Button>
          </form>

          {/* Or Separator */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-gray-300" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white dark:bg-[#1a1a1a] px-2 text-sm text-gray-500 dark:text-gray-400">
                or
              </span>
            </div>
          </div>

          {/* Social Login Icons */}
          <div className="flex justify-center gap-4 md:gap-6">
            {/* Google Login */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              className="w-12 h-12 md:w-14 md:h-14 rounded-full border border-gray-300 dark:border-gray-700 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-800 transition-all hover:shadow-md active:scale-95"
              aria-label="Sign in with Google"
            >
              <svg className="h-6 w-6" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
            </button>

            {/* Email / Phone toggle - ZigZagLite red */}
            <button
              type="button"
              onClick={handleLoginMethodChange}
              className="w-12 h-12 md:w-14 md:h-14 rounded-full border-2 border-[#DC2626] flex items-center justify-center hover:opacity-90 transition-all hover:shadow-md active:scale-95 bg-[#DC2626]"
              aria-label="Sign in with Email"
            >
              {authMethod == "phone" ? <Mail className="h-5 w-5 md:h-6 md:w-6 text-white" /> : <Phone className="h-5 w-5 md:h-6 md:w-6 text-white" />}
            </button>
          </div>

          {/* Legal Disclaimer */}
          <div className="text-center text-xs md:text-sm text-gray-500 dark:text-gray-400 pt-2 md:pt-6">
            <p className="mb-1 md:mb-2">
              By continuing, you agree to our
            </p>
            <div className="flex justify-center gap-2 flex-wrap">
              <Link to="/terms" className="underline hover:text-gray-700 dark:hover:text-gray-300 transition-colors">Terms of Service</Link>
              <span>•</span>
              <Link to="/privacy" className="underline hover:text-gray-700 dark:hover:text-gray-300 transition-colors">Privacy Policy</Link>
              <span>•</span>
              <Link to="/content-policy" className="underline hover:text-gray-700 dark:hover:text-gray-300 transition-colors">Content Policy</Link>
            </div>
          </div>
        </div>
        </div>
      </div>
    </AnimatedPage>
  )
}
