import { useState, useEffect, useCallback, useRef } from "react"
import { Link, useParams, useNavigate } from "react-router-dom"
import { ArrowLeft, Repeat, Loader2, Check, Calendar, Utensils } from "lucide-react"
import api from "@/lib/api"
import { initRazorpayPayment } from "@/lib/utils/razorpay"
import { isModuleAuthenticated } from "@/lib/utils/auth"
import { readSubscriptionDraftFromStorage } from "@/module/user/utils/subscriptionDraftStorage.js"
const FALLBACK_PLANS = [
  { durationDays: 15, name: "15 Days", priceType: "dynamic", description: "Short-term access. Best for trying out." },
  { durationDays: 30, name: "30 Days", priceType: "dynamic", description: "Monthly standard. Most popular choice." },
  { durationDays: 90, name: "90 Days", priceType: "dynamic", description: "Quarterly value plan. Best value." },
]

const DEFAULT_BENEFITS = [
  "24-hour prior delivery notification before each meal",
  "Modify, skip, or confirm each delivery",
  "Subscribe from any restaurant on Home",
  "No refunds on cancellation (ZigZagLite policy)",
]

function hasAnyMealSelection(items) {
  return Array.isArray(items) && items.length > 0
}

function getValidityLabel(days) {
  if (days === 15) return "15 days"
  if (days === 30) return "30 days"
  if (days === 90) return "90 days"
  return `${days} day(s)`
}

function getDefaultDescription(plan) {
  if (plan?.description) return plan.description
  if (plan?.durationDays === 15) return "Short-term access. Best for trying out."
  if (plan?.durationDays === 30) return "Monthly standard. Most popular choice."
  if (plan?.durationDays === 90) return "Quarterly value plan. Best value."
  return "Meal subscription with 24-hour prior delivery notification."
}

/** Build selectedMeals from draft items - same selection for all days */
function buildSelectedMeals(draftItems, planDays, mealTypesEnabled) {
  const byCategory = {}
  for (const item of draftItems || []) {
    const cat = item.mealCategory || "lunch"
    if (!mealTypesEnabled || mealTypesEnabled[cat] !== false) {
      if (!byCategory[cat]) byCategory[cat] = []
      byCategory[cat].push({
        itemId: item.itemId || item.id,
        name: item.name,
        price: Number(item.price) || 0,
        quantity: Number(item.quantity) || 1,
      })
    }
  }
  const selectedMeals = []
  for (let d = 1; d <= planDays; d++) {
    selectedMeals.push({
      day: d,
      breakfast: (byCategory.breakfast || []).map((i) => ({ ...i })),
      lunch: (byCategory.lunch || []).map((i) => ({ ...i })),
      snacks: (byCategory.snacks || []).map((i) => ({ ...i })),
      dinner: (byCategory.dinner || []).map((i) => ({ ...i })),
    })
  }
  return selectedMeals
}

export default function SubscriptionPlanDetailPage() {
  const { durationDays } = useParams()
  const navigate = useNavigate()
  const [plan, setPlan] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [paying, setPaying] = useState(false)
  const [alreadyPurchased, setAlreadyPurchased] = useState(false)
  const [autoPayEnabled, setAutoPayEnabled] = useState(true)
  const [draftItems, setDraftItems] = useState(() => readSubscriptionDraftFromStorage())
  const [activeSubscriptions, setActiveSubscriptions] = useState([])
  const [priceBreakdown, setPriceBreakdown] = useState(null)
  const [priceLoading, setPriceLoading] = useState(false)
  const [deliveryPerDay, setDeliveryPerDay] = useState(30)
  const fetchPriceAbortRef = useRef(null)
  const lastFetchKeyRef = useRef("")

  const primaryMealSub =
    activeSubscriptions.find((s) => s.status === "active") || activeSubscriptions[0] || null
  const displayItems = primaryMealSub?.items || draftItems
  const itemsSignature = displayItems?.length
    ? displayItems.map((i) => `${i.itemId}:${i.quantity}:${i.price}`).join("|")
    : ""

  const duration = durationDays ? parseInt(durationDays, 10) : null
  const isValidPlan = typeof duration === "number" && Number.isInteger(duration) && duration >= 1
  const isDynamicPlan = !plan?.priceType || plan?.priceType === "dynamic"
  const mealTypesEnabled = plan?.mealTypesEnabled || { breakfast: true, lunch: true, snacks: true, dinner: true }

  /** Client-side fallback when API fails */
  const computeLocalPrice = useCallback((items, days, deliveryPerDayVal = 30) => {
    let foodCost = 0
    for (const item of items || []) {
      foodCost += (Number(item.price) || 0) * (Number(item.quantity) || 1)
    }
    const foodPerDay = foodCost
    const totalFood = foodPerDay * days
    const deliveryCharges = (deliveryPerDayVal || 30) * days
    return {
      totalPrice: totalFood + deliveryCharges,
      breakdown: { foodCost: totalFood, deliveryCharges, totalPrice: totalFood + deliveryCharges },
      deliveryChargesPerDay: deliveryPerDayVal || 30,
    }
  }, [])

  const fetchPrice = useCallback(async () => {
    if (!plan || !duration || !isDynamicPlan) return
    const items = displayItems
    const selectedMeals = buildSelectedMeals(items, duration, mealTypesEnabled)
    const hasAnyItems = selectedMeals.some(
      (d) =>
        (d.breakfast?.length || 0) + (d.lunch?.length || 0) + (d.snacks?.length || 0) + (d.dinner?.length || 0) > 0,
    )
    const fetchKey = `${duration}:${itemsSignature}`
    if (fetchKey === lastFetchKeyRef.current) return
    if (!hasAnyItems) {
      setPriceBreakdown(null)
      setPriceLoading(false)
      lastFetchKeyRef.current = ""
      return
    }
    lastFetchKeyRef.current = fetchKey
    if (fetchPriceAbortRef.current) fetchPriceAbortRef.current.abort()
    const controller = new AbortController()
    fetchPriceAbortRef.current = controller
    setPriceLoading(true)
    let deliveryVal = 30
    try {
      const [res, settingsRes] = await Promise.all([
        api.post("/subscription/calculate-plan-price", {
          durationDays: duration,
          selectedMeals,
        }, { signal: controller.signal }).catch((err) => {
          if (err?.name === "AbortError" || err?.code === "ERR_CANCELED") throw err
          return { data: { success: false } }
        }),
        api.get("/subscription/settings", { signal: controller.signal }).catch(() => ({ data: { success: false } })),
      ])
      if (controller.signal.aborted) return
      if (settingsRes?.data?.success && settingsRes.data.data?.deliveryChargesPerDay != null) {
        deliveryVal = settingsRes.data.data.deliveryChargesPerDay
        setDeliveryPerDay(deliveryVal)
      }
      if (res?.data?.success && res.data.data) {
        setPriceBreakdown(res.data.data)
      } else {
        setPriceBreakdown(computeLocalPrice(items, duration, deliveryVal))
      }
    } catch (err) {
      if (err?.name === "AbortError" || err?.code === "ERR_CANCELED") return
      setPriceBreakdown(computeLocalPrice(items, duration, deliveryVal))
    } finally {
      if (!controller.signal.aborted) setPriceLoading(false)
      fetchPriceAbortRef.current = null
    }
  }, [duration, itemsSignature, isDynamicPlan, mealTypesEnabled, computeLocalPrice, plan, displayItems])

  useEffect(() => {
    setDraftItems(readSubscriptionDraftFromStorage())
  }, [])

  useEffect(() => {
    const handler = () => {
      setDraftItems(readSubscriptionDraftFromStorage())
    }
    window.addEventListener("subscriptionDraftUpdated", handler)
    window.addEventListener("userAuthChanged", handler)
    return () => {
      window.removeEventListener("subscriptionDraftUpdated", handler)
      window.removeEventListener("userAuthChanged", handler)
    }
  }, [])

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        setLoading(true)
        setError(null)
        const [plansRes, purchasedRes, activeRes] = await Promise.all([
          api.get("/subscription/plans").catch(() => ({ data: { success: false, data: [] } })),
          api.get("/subscription/purchased-plans").catch(() => ({ data: { success: false, data: [] } })),
          api.get("/subscription/active").catch(() => ({ data: { success: false, data: [] } })),
        ])
        if (activeRes?.data?.success && Array.isArray(activeRes.data.data)) {
          setActiveSubscriptions(activeRes.data.data)
        } else {
          setActiveSubscriptions([])
        }
        const plans =
          plansRes?.data?.success && Array.isArray(plansRes.data.data) && plansRes.data.data.length
            ? plansRes.data.data
            : FALLBACK_PLANS
        const found = typeof duration === "number" ? plans.find((p) => p.durationDays === duration) : null
        setPlan(found || (typeof duration === "number" ? FALLBACK_PLANS.find((p) => p.durationDays === duration) : null) || null)
        if (purchasedRes?.data?.success && Array.isArray(purchasedRes.data.data)) {
          const purchased = purchasedRes.data.data.some((p) => p.planDays === duration)
          setAlreadyPurchased(purchased)
        } else {
          setAlreadyPurchased(false)
        }
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    fetchPlans()
  }, [duration])

  useEffect(() => {
    if (loading) return
    if (primaryMealSub) return
    if (!hasAnyMealSelection(draftItems)) {
      navigate("/subscription", { replace: true, state: { requireMealsFirst: true } })
    }
  }, [loading, primaryMealSub, draftItems, navigate])

  useEffect(() => {
    if (!plan || loading) return
    fetchPrice()
  }, [fetchPrice, plan, loading])

  if (!isValidPlan) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pt-6 pb-24">
        <div className="max-w-2xl mx-auto px-4">
          <p className="text-gray-600 dark:text-gray-400">Invalid plan.</p>
          <Link to="/subscription" className="mt-4 inline-flex items-center gap-2 text-[#DC2626] font-medium">
            <ArrowLeft className="h-4 w-4" /> Back to plans
          </Link>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pt-6 pb-24 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#DC2626]" />
      </div>
    )
  }

  if (!plan) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pt-6 pb-24">
        <div className="max-w-2xl mx-auto px-4">
          <p className="text-gray-600 dark:text-gray-400">Plan not found.</p>
          <Link to="/subscription" className="mt-4 inline-flex items-center gap-2 text-[#DC2626] font-medium">
            <ArrowLeft className="h-4 w-4" /> Back to plans
          </Link>
        </div>
      </div>
    )
  }

  const validityLabel = getValidityLabel(plan.durationDays)
  const description = getDefaultDescription(plan)
  const totalPrice = priceBreakdown?.totalPrice ?? (isDynamicPlan ? null : plan.price)
  const hasPositivePrice = isDynamicPlan ? (priceBreakdown?.totalPrice > 0) : (plan.price > 0)
  const mealsReady = hasAnyMealSelection(displayItems)
  const canPay = !alreadyPurchased && hasPositivePrice && mealsReady
  const payLabel = paying
    ? "Redirecting to Razorpay…"
    : !isModuleAuthenticated("user")
      ? "Sign in & pay"
      : `Pay ₹${(priceBreakdown?.breakdown?.totalPrice ?? totalPrice ?? 0).toLocaleString("en-IN")}`

  const handlePayNow = async () => {
    if (alreadyPurchased || !canPay) return
    if (!duration || !plan) return
    if (!mealsReady) {
      setError("Add at least one meal on the Subscription page before paying.")
      navigate("/subscription", { state: { requireMealsFirst: true } })
      return
    }

    if (!isModuleAuthenticated("user")) {
      setError("Please sign in to continue with payment.")
      navigate("/auth/sign-in", { state: { from: `/subscription/plan/${duration}` } })
      return
    }

    setPaying(true)
    setError(null)
    try {
      const selectedMeals = isDynamicPlan ? buildSelectedMeals(displayItems, duration, mealTypesEnabled) : undefined
      const orderRes = await api.post("/subscription/create-plan-order", {
        planDays: duration,
        selectedMeals,
      })
      const { success, data } = orderRes?.data || {}
      if (!success || !data?.razorpayOrderId || !data?.key) {
        throw new Error(data?.message || "Failed to create payment order")
      }
      const amount = data.amount ?? Math.round((totalPrice || 0) * 100)
      await initRazorpayPayment({
        key: data.key,
        amount: String(amount),
        currency: data.currency || "INR",
        order_id: data.razorpayOrderId,
        name: "Ziggybites",
        description: `Subscription plan: ${plan.name} - ₹${(amount / 100).toLocaleString("en-IN")}`,
        handler: async (response) => {
          try {
            await api.post("/subscription/verify-plan-payment", {
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
              planDays: duration,
              autoPayEnabled: autoPayEnabled,
              /** Creates / updates meal delivery subscription (UserSubscription) for pause/skip — same flow as Edit meal → Pay plan */
              mealItems: displayItems,
              deliverySlot: "veg",
              mealRestaurantId: "ziggybites",
              mealRestaurantName: "Ziggybites",
            })
            navigate("/subscription", { state: { planPurchased: true, showMandatePrompt: true } })
          } catch (verifyErr) {
            setError(verifyErr?.response?.data?.message || verifyErr?.message || "Payment verification failed")
          } finally {
            setPaying(false)
          }
        },
        onError: (err) => {
          const msg = err?.description || err?.message || "Payment failed"
          const isAuthError = /authentication failed|invalid key|configuration/i.test(String(msg))
          setError(isAuthError ? "Payment gateway configuration error. Please contact support or try again later." : msg)
          setPaying(false)
        },
        onClose: () => setPaying(false),
      })
    } catch (e) {
      const status = e?.response?.status
      const msg = e?.response?.data?.message || e?.message || "Could not start payment"
      if (status === 401 || /unauthorized|invalid token|no token|sign in/i.test(String(msg))) {
        setError("Your session has expired. Please sign in again to continue.")
        navigate("/auth/sign-in", { state: { from: `/subscription/plan/${duration}` } })
      } else {
        setError(msg)
      }
      setPaying(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pt-6 pb-36 md:pb-28">
      <div className="max-w-2xl mx-auto px-4">
        <Link
          to="/subscription"
          className="inline-flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-[#DC2626] mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to plans
        </Link>

        {error && (
          <div className="mb-4 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm">
            <p className="mb-2">{error}</p>
            {(error.includes("sign in") || error.includes("session") || error.includes("expired")) && (
              <Link
                to="/auth/sign-in"
                state={{ from: `/subscription/plan/${duration}` }}
                className="inline-flex items-center gap-1 text-red-800 dark:text-red-200 font-medium hover:underline"
              >
                Sign in to continue
              </Link>
            )}
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="p-6 sm:p-8">
            <div className="flex items-center gap-2 text-[#DC2626] mb-2">
              <Repeat className="h-6 w-6" />
              <span className="font-semibold">Subscription plan</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mt-1">
              {plan.name}
            </h1>

            {alreadyPurchased ? (
              <div className="mt-8 space-y-6">
                <div className="p-5 rounded-2xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 text-green-800 dark:text-green-200">
                  <div className="flex items-center gap-2 font-bold mb-1">
                    <Check className="h-5 w-5 text-green-600" />
                    Already Purchased
                  </div>
                  <p className="text-sm opacity-90 leading-relaxed">
                    This plan duration is already active on your account. You can manage your meals, track deliveries, and handle renewals from your dashboard.
                  </p>
                </div>
                
                <button
                  type="button"
                  onClick={() => navigate("/subscription")}
                  className="w-full inline-flex items-center justify-center gap-3 rounded-2xl bg-[#DC2626] px-8 py-5 text-xl font-bold text-white hover:bg-[#B91C1C] transition-all shadow-[0_10px_25px_-5px_rgba(220,38,38,0.4)] active:scale-[0.98]"
                >
                  Manage Subscription
                </button>
                
                <p className="text-center text-sm text-gray-500 dark:text-gray-400">
                  Take full control of your meal plan in one place.
                </p>
              </div>
            ) : (
              <>
                <dl className="mt-6 space-y-4">
                  <div>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Validity</dt>
                    <dd className="mt-1 flex items-center gap-2 text-gray-900 dark:text-white">
                      <Calendar className="h-5 w-5 text-gray-400" />
                      {validityLabel}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Description</dt>
                    <dd className="mt-1 text-gray-700 dark:text-gray-300">
                      {description}
                    </dd>
                  </div>
                </dl>

                {/* Dynamic price breakdown */}
                {isDynamicPlan && (
                  <div className="mt-6 p-4 rounded-xl bg-gray-50 dark:bg-gray-700/30 border border-gray-200 dark:border-gray-600">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                      <Utensils className="h-4 w-4" />
                      Price breakdown
                    </p>
                    {priceLoading ? (
                      <div className="flex items-center gap-2 text-gray-500">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Calculating…
                      </div>
                    ) : priceBreakdown ? (
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Total food cost</span>
                          <span className="font-medium text-gray-900 dark:text-white">
                            ₹{priceBreakdown.breakdown?.foodCost?.toLocaleString("en-IN") ?? "0"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Delivery charges ({duration} × ₹{priceBreakdown.deliveryChargesPerDay ?? 30}/day)</span>
                          <span className="font-medium text-gray-900 dark:text-white">
                            ₹{priceBreakdown.breakdown?.deliveryCharges?.toLocaleString("en-IN") ?? "0"}
                          </span>
                        </div>
                        <div className="flex justify-between pt-2 border-t border-gray-200 dark:border-gray-600">
                          <span className="font-semibold text-gray-900 dark:text-white">Final payable</span>
                          <span className="text-lg font-bold text-[#DC2626]">
                            ₹{priceBreakdown.breakdown?.totalPrice?.toLocaleString("en-IN") ?? "0"}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-sm text-amber-600 dark:text-amber-400">
                          Add at least one meal to see your price.
                        </p>
                        <Link
                          to="/subscription"
                          className="inline-flex items-center gap-1.5 text-sm font-medium text-[#DC2626] hover:text-[#B91C1C]"
                        >
                          <ArrowLeft className="h-4 w-4" />
                          Back to add meals
                        </Link>
                      </div>
                    )}
                  </div>
                )}

                {/* Fixed price */}
                {!isDynamicPlan && plan.price != null && plan.price > 0 && (
                  <div className="mt-6 p-4 rounded-xl bg-gray-50 dark:bg-gray-700/30">
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-gray-700 dark:text-gray-300">Price</span>
                      <span className="text-xl font-bold text-gray-900 dark:text-white">
                        ₹{plan.price.toLocaleString("en-IN")}
                      </span>
                    </div>
                  </div>
                )}

                <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Auto-pay (Mandatory for first purchase)</dt>
                  <dd className="flex items-center gap-3">
                    <div
                      className={`w-12 h-6 rounded-full relative transition-colors cursor-pointer ${autoPayEnabled ? "bg-[#DC2626]" : "bg-gray-300"}`}
                      onClick={() => setAutoPayEnabled(!autoPayEnabled)}
                    >
                      <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${autoPayEnabled ? "left-7" : "left-1"}`} />
                    </div>
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      {autoPayEnabled ? "Enabled" : "Disabled"}
                    </span>
                  </dd>
                </div>

                <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">What you get</p>
                  <ul className="space-y-2 text-gray-600 dark:text-gray-400">
                    {(plan?.benefits
                      ? String(plan.benefits)
                          .split("\n")
                          .map((b) => b.trim())
                          .filter(Boolean)
                      : DEFAULT_BENEFITS
                    ).map((benefit, idx) => (
                      <li key={idx} className="flex items-center gap-2">
                        <Check className="h-5 w-5 text-green-600 shrink-0" />
                        {benefit}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Inline CTAs (desktop + fallback); mobile also uses fixed dock below */}
                <div className="mt-8 hidden md:flex flex-col sm:flex-row gap-3">
                  <button
                    type="button"
                    disabled={paying || !canPay}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#DC2626] px-6 py-3 text-base font-medium text-white hover:bg-[#B91C1C] transition-colors disabled:opacity-60 disabled:cursor-not-allowed min-h-[48px]"
                    onClick={handlePayNow}
                  >
                    {paying ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                    {payLabel}
                  </button>
                  {!hasPositivePrice && isDynamicPlan && (
                    <p className="text-sm text-amber-600 dark:text-amber-400 self-center">
                      Add at least one meal first, or go back to build your box.
                    </p>
                  )}
                  {!mealsReady && !primaryMealSub && hasPositivePrice && (
                    <p className="text-sm text-amber-600 dark:text-amber-400 self-center">
                      Add at least one meal on Subscription before you can pay.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => navigate("/subscription")}
                    className="inline-flex items-center justify-center rounded-xl border border-gray-300 dark:border-gray-600 px-6 py-3 text-base font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors min-h-[48px]"
                  >
                    Back to plans
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Mobile: fixed pay bar above bottom nav so CTAs are never hidden */}
        {!alreadyPurchased && (
          <div
            className="md:hidden fixed left-0 right-0 z-[45] border-t border-gray-200 dark:border-gray-700 bg-white/98 dark:bg-gray-900/98 backdrop-blur-md shadow-[0_-8px_30px_rgba(0,0,0,0.08)] px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
            style={{ bottom: "4.75rem" }}
          >
            <div className="max-w-2xl mx-auto flex flex-col gap-2">
              <button
                type="button"
                disabled={paying || !canPay}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#DC2626] px-4 py-3.5 text-base font-semibold text-white hover:bg-[#B91C1C] disabled:opacity-55 disabled:cursor-not-allowed min-h-[52px] shadow-md"
                onClick={handlePayNow}
              >
                {paying ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                {payLabel}
              </button>
              {!hasPositivePrice && isDynamicPlan && (
                <p className="text-[11px] text-center text-amber-600 dark:text-amber-400 px-1">
                  Select at least one meal on the subscription page to enable payment.
                </p>
              )}
              {!mealsReady && !primaryMealSub && hasPositivePrice && (
                <p className="text-[11px] text-center text-amber-600 dark:text-amber-400 px-1">
                  Choose at least one meal on Subscription before paying.
                </p>
              )}
              <button
                type="button"
                onClick={() => navigate("/subscription")}
                className="w-full inline-flex items-center justify-center rounded-xl border border-gray-300 dark:border-gray-600 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Back to plans
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
