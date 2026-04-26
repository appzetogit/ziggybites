import { useState, useEffect, useMemo } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import {
  Calendar,
  Package,
  Check,
  Info,
  PauseCircle,
  Truck,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import api, { userAPI } from "@/lib/api"
import SubscriptionPauseDialog from "@/module/user/components/SubscriptionPauseDialog.jsx"
import {
  hasCompleteMealSelection,
  SUBSCRIPTION_REQUIRED_MEAL_CATEGORIES as REQUIRED_CATEGORIES,
} from "@/module/user/utils/subscriptionMealSelection.js"
import { useProfile } from "../context/ProfileContext"
import { readSubscriptionDraftFromStorage } from "@/module/user/utils/subscriptionDraftStorage.js"
import { isModuleAuthenticated } from "@/lib/utils/auth"
import { toast } from "sonner"

const FALLBACK_PLANS = [
  { durationDays: 15, name: "15 Days (Basic)", price: 299, discountPercent: 0, description: "Short-term access. Best for trying out." },
  { durationDays: 30, name: "30 Days (Standard)", price: 499, discountPercent: 13, description: "Monthly standard. Most popular choice." },
  { durationDays: 90, name: "90 Days (Value)", price: 1299, discountPercent: 25, description: "Quarterly value plan. Best value." },
]

const REQUEST_TIMEOUT_MS = 8000

function withRequestTimeout(promise, fallback) {
  return Promise.race([
    promise.catch(() => fallback),
    new Promise((resolve) => {
      window.setTimeout(() => resolve(fallback), REQUEST_TIMEOUT_MS)
    }),
  ])
}

function getValidityLabel(days) {
  if (days === 15) return "Valid for 15 days"
  if (days === 30) return "Valid for 30 days"
  if (days === 90) return "Valid for 90 days"
  return `Valid for ${days} day(s)`
}

function getDefaultDescription(plan) {
  if (plan.description) return plan.description
  if (plan.durationDays === 15) return "Short-term access. Best for trying out."
  if (plan.durationDays === 30) return "Monthly standard. Most popular choice."
  if (plan.durationDays === 90) return "Quarterly value plan. Best value."
  return "Meal subscription with 24-hour prior delivery notification."
}

/** Next delivery: readable local date/time without seconds */
function formatNextDeliveryLabel(iso) {
  if (!iso) return ""
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
  } catch {
    return String(iso)
  }
}

function SubscriptionPageSkeleton() {
  return (
    <div className="min-h-screen bg-[#FDFDFD] pb-32 pt-6">
      <div className="mx-auto max-w-md px-6">
        <header className="mb-8">
          <Skeleton className="mb-3 h-3 w-28 rounded-full bg-red-100" />
          <Skeleton className="h-14 w-64 rounded-2xl bg-black/10" />
        </header>

        <div className="mb-6 flex flex-wrap gap-2">
          <Skeleton className="h-10 w-40 rounded-full bg-black/10" />
          <Skeleton className="h-10 w-32 rounded-full bg-red-100" />
        </div>

        <div className="mb-12 space-y-5">
          <section className="rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
            <div className="mb-8 flex items-start justify-between">
              <div className="space-y-3">
                <Skeleton className="h-8 w-36 rounded-xl bg-black/10" />
                <Skeleton className="h-4 w-24 rounded-full bg-black/10" />
              </div>
              <Skeleton className="h-9 w-20 rounded-full bg-red-100" />
            </div>
            <div className="mb-8 space-y-4">
              <Skeleton className="h-16 w-40 rounded-2xl bg-red-100" />
              <Skeleton className="h-2 w-full rounded-full bg-black/10" />
            </div>
            <div className="flex items-end justify-between border-t border-black/10 pt-6">
              <div className="space-y-2">
                <Skeleton className="h-3 w-20 rounded-full bg-black/10" />
                <Skeleton className="h-5 w-24 rounded-full bg-black/10" />
              </div>
              <Skeleton className="h-12 w-36 rounded-2xl bg-red-100" />
            </div>
          </section>

          <div className="flex items-center justify-between rounded-[2rem] border border-black/10 bg-white p-6">
            <div className="flex items-center gap-4">
              <Skeleton className="h-12 w-12 rounded-xl bg-red-100" />
              <div className="space-y-2">
                <Skeleton className="h-3 w-24 rounded-full bg-black/10" />
                <Skeleton className="h-8 w-32 rounded-xl bg-black/10" />
              </div>
            </div>
            <Skeleton className="h-4 w-24 rounded-full bg-red-100" />
          </div>

          <div className="flex items-center gap-5 rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
            <Skeleton className="h-14 w-14 rounded-full bg-red-100" />
            <div className="space-y-2">
              <Skeleton className="h-3 w-32 rounded-full bg-black/10" />
              <Skeleton className="h-6 w-40 rounded-xl bg-black/10" />
            </div>
          </div>

          <div className="pt-4">
            <div className="mb-4 flex items-center justify-between">
              <Skeleton className="h-7 w-40 rounded-xl bg-black/10" />
              <Skeleton className="h-3 w-14 rounded-full bg-black/10" />
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-3xl border border-black/10 bg-white p-5">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-10 w-10 rounded-full bg-black/10" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-28 rounded-full bg-black/10" />
                    <Skeleton className="h-3 w-36 rounded-full bg-black/10" />
                  </div>
                </div>
                <Skeleton className="h-4 w-14 rounded-full bg-black/10" />
              </div>
              <div className="flex items-center justify-between rounded-3xl border border-black/10 bg-white p-5">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-10 w-10 rounded-full bg-black/10" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-32 rounded-full bg-black/10" />
                    <Skeleton className="h-3 w-28 rounded-full bg-black/10" />
                  </div>
                </div>
                <Skeleton className="h-4 w-16 rounded-full bg-black/10" />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-3xl border border-black/10 bg-white p-6">
            <div className="flex items-center gap-5">
              <Skeleton className="h-14 w-14 rounded-full bg-red-100" />
              <div className="space-y-2">
                <Skeleton className="h-5 w-32 rounded-xl bg-black/10" />
                <Skeleton className="h-3 w-36 rounded-full bg-black/10" />
              </div>
            </div>
            <Skeleton className="h-5 w-5 rounded-full bg-red-100" />
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * ZigZagLite – Subscription Plan
 * Plans shown as cards with price, validity, description. Active plan on top when subscribed.
 */
export default function SubscriptionPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [activeSubscriptions, setActiveSubscriptions] = useState([])
  const [plans, setPlans] = useState([])
  const [purchasedPlans, setPurchasedPlans] = useState([])
  const [dashboard, setDashboard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showMandatePrompt, setShowMandatePrompt] = useState(false)
  const [cancelSaving, setCancelSaving] = useState(false)
  const [resumeSaving, setResumeSaving] = useState(false)
  const [showPauseDialog, setShowPauseDialog] = useState(false)
  const [showPolicy, setShowPolicy] = useState(false)
  const planPurchased = location.state?.planPurchased
  const [draftItems, setDraftItems] = useState(() => readSubscriptionDraftFromStorage())
  const { userProfile: profileFromContext } = useProfile()
  const displayProfile = profile || profileFromContext
  const skipMealRedirect = Boolean(location.state?.skipMealRedirect)

  const hasActive = activeSubscriptions.length > 0
  /** Prefer active sub if user has multiple rows; API sorts active before paused */
  const primarySubscription =
    activeSubscriptions.find((s) => s.status === "active") || activeSubscriptions[0] || null
  const displayItems = primarySubscription?.items || draftItems
  /** When user has meal delivery sub, show one card only — billing merges into red card */
  const hasMealDeliverySubscription = hasActive && primarySubscription

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
    let cancelled = false

    const fetchData = async () => {
      try {
        setLoading(true)
        setError(null)
        const [profileRes, activeRes, plansRes, purchasedRes, dashboardRes] = await Promise.all([
          withRequestTimeout(userAPI.getProfile(), { data: { success: false, data: null } }),
          withRequestTimeout(api.get("/subscription/active"), { data: { success: false, data: [] } }),
          withRequestTimeout(api.get("/subscription/plans"), { data: { success: false, data: [] } }),
          withRequestTimeout(api.get("/subscription/purchased-plans"), { data: { success: false, data: [] } }),
          withRequestTimeout(api.get("/subscription/dashboard"), { data: { success: false, data: null } }),
        ])

        if (cancelled) return

        if (profileRes?.data?.success) {
          const u = profileRes.data.data?.user || profileRes.data.data || profileRes.data
          if (u && typeof u === 'object') setProfile(u)
        }

        if (activeRes?.data?.success) {
          const subs = Array.isArray(activeRes.data.data) ? activeRes.data.data : (Array.isArray(activeRes.data) ? activeRes.data : [])
          setActiveSubscriptions(subs)
        } else {
          setActiveSubscriptions([])
        }

        if (plansRes?.data?.success) {
          const p = Array.isArray(plansRes.data.data) ? plansRes.data.data : (Array.isArray(plansRes.data) ? plansRes.data : [])
          setPlans(p.length ? p : FALLBACK_PLANS)
        } else {
          setPlans(FALLBACK_PLANS)
        }
        if (purchasedRes?.data?.success) {
          const pp = Array.isArray(purchasedRes.data.data) ? purchasedRes.data.data : (Array.isArray(purchasedRes.data) ? purchasedRes.data : [])
          setPurchasedPlans(pp)
        } else {
          setPurchasedPlans([])
        }
        if (dashboardRes?.data?.success) {
          const d = dashboardRes.data.data || dashboardRes.data
          if (d && typeof d === 'object') setDashboard(d)
        } else {
          setDashboard(null)
        }

        if (!activeRes?.data?.success || (Array.isArray(activeRes.data.data) && activeRes.data.data.length === 0)) {
           navigate("/subscription/plans")
        }
        if (location.state?.showMandatePrompt) {
          setShowMandatePrompt(true)
          navigate(location.pathname, { replace: true, state: { planPurchased: location.state?.planPurchased } })
        }

      } catch (e) {
        if (cancelled) return
        setError(e.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchData()
    return () => {
      cancelled = true
    }
  }, [location.pathname, location.state?.planPurchased, location.state?.showMandatePrompt, navigate])

  /** New users: land on Edit meal first until all categories have a pick (per-user draft, not shared). */
  useEffect(() => {
    if (loading) return
    if (!isModuleAuthenticated("user")) return
    if (hasActive) return
    if (hasCompleteMealSelection(draftItems)) return
    if (skipMealRedirect) return
    navigate("/subscription/edit-meal", { replace: true, state: { mealSetupFirst: true } })
  }, [loading, hasActive, draftItems, navigate, skipMealRedirect])

  useEffect(() => {
    if (!location.state?.requireMealsFirst) return
    const { requireMealsFirst: _skip, ...rest } = location.state || {}
    navigate(location.pathname, { replace: true, state: Object.keys(rest).length ? rest : undefined })
  }, [location.state, location.pathname, navigate])

  useEffect(() => {
    if (!location.state?.skipMealRedirect) return
    const { skipMealRedirect: _skip, ...rest } = location.state || {}
    navigate(location.pathname, { replace: true, state: Object.keys(rest).length ? rest : undefined })
  }, [location.state, location.pathname, navigate])

  const refreshMealSubscriptions = async () => {
    try {
      const activeRes = await api.get("/subscription/active")
      if (activeRes?.data?.success && Array.isArray(activeRes.data.data)) {
        setActiveSubscriptions(activeRes.data.data)
      }
    } catch {
      /* ignore */
    }
  }

  const handleResume = async () => {
    const id = primarySubscription?._id
    if (!id) return
    setResumeSaving(true)
    setError(null)
    try {
      const res = await api.post("/subscription/resume", { subscriptionId: id })
      toast.success(res?.data?.message || "Deliveries resumed")
      await refreshMealSubscriptions()
    } catch (e) {
      const msg = e?.response?.data?.message || e.message || "Could not resume"
      setError(msg)
      toast.error(msg)
    } finally {
      setResumeSaving(false)
    }
  }

  const handleToggleAutoPay = async (checked) => {
    try {
      await api.post("/subscription/toggle-autopay", { enabled: checked })
      setDashboard((d) => (d ? { ...d, autoPayEnabled: checked } : null))
    } catch (e) {
      setError(e?.response?.data?.message || e.message)
    }
  }

  const handleCancel = async () => {
    setCancelSaving(true)
    try {
      const res = await api.post("/subscription/cancel")
      const payload = res?.data?.data || {}
      setError(null)
      if (payload.eligibleForImmediateRefund) {
        setDashboard(null)
        setPurchasedPlans([])
        setActiveSubscriptions([])
        const used = Number(payload.usedAmount || 0).toLocaleString("en-IN")
        const refunded = Number(payload.refundedAmount || 0).toLocaleString("en-IN")
        toast.success(`Subscription cancelled. Used ₹${used}; refunded ₹${refunded} to wallet.`)
        navigate("/subscription/plans")
      } else {
        setDashboard((d) =>
          d
            ? { ...d, cancellationRequestedAt: new Date().toISOString(), autoPayEnabled: false }
            : d,
        )
        const used = Number(payload.usedAmount || 0).toLocaleString("en-IN")
        toast.success((res?.data?.message || "Renewal cancelled.") + ` Used amount: ₹${used}.`)
      }
    } catch (e) {
      const msg = e?.response?.data?.message || e.message || "Failed to cancel subscription"
      setError(msg)
      toast.error(msg)
    } finally {
      setCancelSaving(false)
    }
  }


  const displayPlans = plans.length > 0 ? plans : FALLBACK_PLANS
  const sortedPurchasedPlans = useMemo(() => {
    return [...purchasedPlans].sort((a, b) => {
      const aTime = a?.purchasedAt ? new Date(a.purchasedAt).getTime() : 0
      const bTime = b?.purchasedAt ? new Date(b.purchasedAt).getTime() : 0
      return bTime - aTime
    })
  }, [purchasedPlans])
  const latestPurchased = sortedPurchasedPlans.length > 0 ? sortedPurchasedPlans[0] : null

  const purchasedPlanMeta =
    latestPurchased && displayPlans.find((p) => p.durationDays === latestPurchased.planDays)

  let purchasedRemainingDays = null
  let purchasedEndDateLabel = ""
  let nextPlanMeta = null
  let totalPurchasedDays = 0

  // Combine validity of all purchased plans
  if (sortedPurchasedPlans.length > 0) {
    const totalDays = sortedPurchasedPlans.reduce(
      (sum, p) => sum + (Number(p.planDays) || 0),
      0,
    )
    totalPurchasedDays = totalDays

    const withDates = sortedPurchasedPlans.filter((p) => p.purchasedAt)
    const earliest =
      withDates.length > 0
        ? withDates.reduce((earliestSoFar, current) =>
            !earliestSoFar ||
            new Date(current.purchasedAt) < new Date(earliestSoFar.purchasedAt)
              ? current
              : earliestSoFar,
          )
        : null

    if (earliest && totalDays > 0) {
      const start = new Date(earliest.purchasedAt)
      const end = new Date(start)
      end.setDate(end.getDate() + totalDays)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const endDay = new Date(end)
    endDay.setHours(0, 0, 0, 0)
    const diffDays = Math.ceil((endDay - today) / (24 * 60 * 60 * 1000))
    purchasedRemainingDays = Math.max(0, diffDays)
    purchasedEndDateLabel = end.toLocaleDateString()
    }

    // Find the next higher-duration plan (for increased validity)
    const sortedDurations = [...new Set(displayPlans.map((p) => Number(p.durationDays)))].sort((a, b) => a - b)
    const currentIdx = sortedDurations.indexOf(Number(latestPurchased.planDays))
    const nextDuration =
      currentIdx !== -1 && currentIdx < sortedDurations.length - 1 ? sortedDurations[currentIdx + 1] : null
    if (nextDuration) {
      nextPlanMeta = displayPlans.find((p) => p.durationDays === nextDuration) || null
    }
  }

  const displayRemainingDays = purchasedRemainingDays !== null 
    ? purchasedRemainingDays 
    : (dashboard?.remainingDays ?? primarySubscription?.remainingDays ?? "—")

  const displayEndDate = purchasedEndDateLabel || 
    (dashboard?.endDate ? new Date(dashboard.endDate).toLocaleDateString('en-GB') : "—")

  const remainingDeliveries = useMemo(() => {
    const days = typeof displayRemainingDays === 'number' ? displayRemainingDays : 0;
    const itemsCount = primarySubscription?.items?.length || 1;
    return days * itemsCount;
  }, [displayRemainingDays, primarySubscription]);

  const hasBillingPlan = !!(dashboard?.activePlan || purchasedPlanMeta)



  if (loading) {
    return <SubscriptionPageSkeleton />
  }

  const sendToEditMealFirst =
    isModuleAuthenticated("user") && !hasActive && !hasCompleteMealSelection(draftItems)
  if (sendToEditMealFirst) {
    return <SubscriptionPageSkeleton />
  }

  return (
    <div className="min-h-screen bg-[#FDFDFD] dark:bg-gray-950 pb-32 pt-6">
      <div className="max-w-md mx-auto px-6">
        <header className="mb-8">
           <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#DC2626] mb-1">Your Subscription</p>
           <h1 className="text-[3.2rem] font-[900] text-black leading-[1.1] tracking-[-0.03em] mb-8">
          Hello, {displayProfile?.name || "User"}
        </h1>
        </header>

        {/* Value props */}
        <div className="mb-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowPolicy(true)}
            className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3.5 py-2 text-xs font-semibold text-black shadow-sm"
          >
            <Info className="h-3.5 w-3.5 text-[#DC2626]" />
            7-day cancellation
          </button>

        </div>

        {planPurchased && !showMandatePrompt && (
          <div className="mb-4 rounded-lg border border-[#DC2626]/10 bg-white p-3 text-sm text-black">
            Plan purchased successfully. You can view it below.
          </div>
        )}
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm">
            {error}
          </div>
        )}



        {hasActive && primarySubscription ? (
          <div className="space-y-5 mb-12">
            {/* Plan Card */}
            <section className="relative overflow-hidden rounded-[2.5rem] border border-black/10 bg-white p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
               <div className="flex justify-between items-start mb-6">
                 <div>
                   <h2 className="text-2xl font-black text-black leading-tight">
                     {totalPurchasedDays > 0 
                       ? `${totalPurchasedDays} Days` 
                       : (primarySubscription.planName?.replace(/ plan$/i, '') || `${primarySubscription.planDays} Days`)}
                   </h2>
                   <p className="mt-1 text-sm font-medium italic text-black/60">
                     {primarySubscription.restaurantName || "Nutritious Daily Meals"}
                   </p>
                 </div>
                 <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
                   primarySubscription.status === 'active' 
                   ? 'bg-[#DC2626] text-white' 
                   : 'bg-black text-white'
                 }`}>
                   {primarySubscription.status}
                 </span>
               </div>

               <div className="mt-10 mb-2">
                 <div className="flex items-baseline gap-3">
                   <span className="text-6xl font-black text-[#DC2626] tabular-nums tracking-tighter">
                     {displayRemainingDays}
                   </span>
                   <span className="text-xs font-black uppercase tracking-widest text-black/45">Days Left</span>
                 </div>
               </div>

               <div className="mb-8 h-2 w-full overflow-hidden rounded-full bg-black/10">
                   <div 
                    className="h-full bg-[#DC2626]" 
                    style={{ width: `${Math.min(100, Math.max(0, ((typeof displayRemainingDays === 'number' ? displayRemainingDays : 0) / (totalPurchasedDays > 0 ? totalPurchasedDays : (primarySubscription.planDays || 30))) * 100))}%` }} 
                  />
               </div>

               <div className="flex items-end justify-between gap-4 border-t border-black/10 pt-6">
                 <div className="min-w-0">
                   <p className="mb-1 text-[10px] font-black uppercase leading-none tracking-widest text-black/45">Valid Until</p>
                   <p className="text-sm font-black leading-none text-black">
                     {displayEndDate}
                   </p>
                 </div>
                 <div className="flex flex-col items-stretch gap-2 sm:min-w-[11rem]">
                   <Button
                     variant="outline"
                     onClick={() => navigate("/subscription/manage")}
                     className="h-11 rounded-2xl border-black/10 bg-white px-5 font-black text-sm text-black hover:bg-black/[0.03]"
                   >
                     Manage Plan
                   </Button>
                   <Button 
                     variant={dashboard?.cancellationRequestedAt ? "outline" : "default"}
                     onClick={dashboard?.cancellationRequestedAt ? () => {} : () => navigate("/subscription/plans")}
                     className={`h-12 rounded-2xl px-5 font-black text-sm ${
                       dashboard?.cancellationRequestedAt 
                       ? "border-[#DC2626] bg-white text-[#DC2626]" 
                       : "bg-[#DC2626] text-white hover:bg-[#B91C1C]"
                     }`}
                   >
                     {dashboard?.cancellationRequestedAt ? "Cancellation Pending" : "Extend Plan"}
                   </Button>
                 </div>
               </div>
            </section>


            {/* Remaining Meals Card */}
            <Link to="/subscription/manage" className="flex items-center gap-5 rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
               <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-[#DC2626]">
                  <Truck className="h-6 w-6" strokeWidth={2.5} />
               </div>
                <div>
                  <p className="mb-0.5 text-[10px] font-black uppercase tracking-widest text-black/45">Remaining Meals</p>
                   <p className="text-lg font-black text-black">
                     {remainingDeliveries} Meals
                   </p>
                </div>
            </Link>

          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <h2 className="text-xl font-bold text-gray-900">No active subscription</h2>
            <p className="text-gray-500 mt-2">Redirecting to plans...</p>
          </div>
        )}
      </div>

      <SubscriptionPauseDialog
        open={showPauseDialog}
        onOpenChange={setShowPauseDialog}
        subscription={primarySubscription}
        onAfterPause={refreshMealSubscriptions}
      />

      {/* Payment success popup - shown right after purchase */}
      <Dialog open={showMandatePrompt} onOpenChange={setShowMandatePrompt}>
        <DialogContent className="sm:max-w-md rounded-3xl p-0 overflow-hidden border-0">
          <div className="bg-white p-6">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#DC2626] text-white">
              <Check className="h-7 w-7" strokeWidth={3} />
            </div>
            <DialogHeader>
              <DialogTitle className="text-center text-2xl font-black text-black">Payment Successful</DialogTitle>
              <p className="text-sm text-black/60">
                Your subscription plan is active now. You can manage auto-pay anytime from subscription settings.
              </p>
            </DialogHeader>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <Button variant="outline" onClick={() => setShowMandatePrompt(false)}>
                Done
              </Button>
              <Button
                onClick={() => {
                  setShowMandatePrompt(false)
                  navigate("/subscription/manage")
                }}
              >
                Manage plan
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 7-day policy popup */}
      <Dialog open={showPolicy} onOpenChange={setShowPolicy}>
        <DialogContent className="sm:max-w-md rounded-3xl p-0 overflow-hidden">
          <DialogHeader>
            <DialogTitle>7-day cancellation policy</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
            <p><strong>Within 7 days:</strong> Cancel for full or pro-rated refund (depending on usage).</p>
            <p><strong>After 7 days:</strong> &quot;Cancel Renewal&quot; – you won&apos;t be charged for the next cycle, but you keep access until the current period ends.</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}




