import { useState, useEffect, useMemo } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import {
  Repeat,
  Loader2,
  Calendar,
  Package,
  Check,
  MessageCircle,
  Info,
  Pencil,
  ChevronRight,
  PauseCircle,
  Plus,
  Wallet,
  CreditCard,
  Truck,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
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

const WHATSAPP_SUPPORT = "https://wa.me/919769203828?text=" + encodeURIComponent("Hi, I need help with my subscription on Ziggybites.")

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
  return "Meal subscription with 2-hour prior delivery notification."
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
  const [walletBalance, setWalletBalance] = useState(null)
  const [recentOrders, setRecentOrders] = useState([])

  const { userProfile: profileFromContext } = useProfile()
  const displayProfile = profile || profileFromContext

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
    const fetchData = async () => {
      try {
        setLoading(true)
        setError(null)
        const [profileRes, activeRes, plansRes, purchasedRes, dashboardRes, ordersRes, walletRes] = await Promise.all([
          userAPI.getProfile().catch(() => ({ data: { success: false, data: null } })),
          api.get("/subscription/active").catch(() => ({ data: { success: false, data: [] } })),
          api.get("/subscription/plans").catch(() => ({ data: { success: false, data: [] } })),
          api.get("/subscription/purchased-plans").catch(() => ({ data: { success: false, data: [] } })),
          api.get("/subscription/dashboard").catch(() => ({ data: { success: false, data: null } })),
          api.get("/order?limit=10").catch(() => ({ data: { success: false, data: { orders: [] } } })),
          userAPI.getWallet().catch(() => ({ data: { success: false, data: { balance: 0 } } })),
        ])
        if (profileRes?.data?.success) {
          const u = profileRes.data.data?.user || profileRes.data.data || profileRes.data
          if (u && typeof u === 'object') setProfile(u)
        }
        if (activeRes?.data?.success) {
          const subs = Array.isArray(activeRes.data.data) ? activeRes.data.data : (Array.isArray(activeRes.data) ? activeRes.data : [])
          setActiveSubscriptions(subs)
        }
        if (walletRes?.data?.success) {
          const walletData = walletRes.data.data?.wallet || walletRes.data.data
          setWalletBalance(walletData?.balance ?? 0)
        }
        if (ordersRes?.data?.success) {
          const resData = ordersRes.data.data || ordersRes.data
          const allOrders = resData?.orders || (Array.isArray(resData) ? resData : [])
          setRecentOrders(allOrders.filter(o => o.source?.type === "subscription" || o.source?.subscriptionId))
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
        
        // Redirect if no active sub
        if (!activeRes?.data?.success || (Array.isArray(activeRes.data.data) && activeRes.data.data.length === 0)) {
           navigate("/subscription/plans")
        }
        if (location.state?.showMandatePrompt) {
          setShowMandatePrompt(true)
          navigate(location.pathname, { replace: true, state: { planPurchased: location.state?.planPurchased } })
        }
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  /** New users: land on Edit meal first until all categories have a pick (per-user draft, not shared). */
  useEffect(() => {
    if (loading) return
    if (!isModuleAuthenticated("user")) return
    if (hasActive) return
    if (hasCompleteMealSelection(draftItems)) return
    navigate("/subscription/edit-meal", { replace: true, state: { mealSetupFirst: true } })
  }, [loading, hasActive, draftItems, navigate])

  useEffect(() => {
    if (!location.state?.requireMealsFirst) return
    const { requireMealsFirst: _skip, ...rest } = location.state || {}
    navigate(location.pathname, { replace: true, state: Object.keys(rest).length ? rest : undefined })
  }, [location.state, location.pathname, navigate])

  useEffect(() => {
    if (!hasActive || !primarySubscription) {
      setWalletBalance(null)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const r = await userAPI.getWallet()
        const w = r?.data?.data?.wallet ?? r?.data?.wallet ?? r?.data?.data
        const b = typeof w?.balance === "number" ? w.balance : null
        if (!cancelled) setWalletBalance(b)
      } catch {
        if (!cancelled) setWalletBalance(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [hasActive, primarySubscription?._id])

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
  const latestPurchased = purchasedPlans.length > 0 ? purchasedPlans[0] : null

  const purchasedPlanMeta =
    latestPurchased && displayPlans.find((p) => p.durationDays === latestPurchased.planDays)

  let purchasedRemainingDays = null
  let purchasedEndDateLabel = ""
  let nextPlanMeta = null
  let totalPurchasedDays = 0

  // Combine validity of all purchased plans
  if (purchasedPlans.length > 0) {
    const totalDays = purchasedPlans.reduce(
      (sum, p) => sum + (Number(p.planDays) || 0),
      0,
    )
    totalPurchasedDays = totalDays

    const withDates = purchasedPlans.filter((p) => p.purchasedAt)
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

  const recentActivity = useMemo(() => {
    const activities = []

    recentOrders.forEach((order) => {
      const createdAt = order?.createdAt ? new Date(order.createdAt) : null
      activities.push({
        id: `order-${order._id || createdAt?.getTime?.() || Math.random()}`,
        title: order.status === "delivered" ? "Meal Delivered" : `${order.status || "Pending"} Order`,
        subtitle:
          createdAt && !Number.isNaN(createdAt.getTime())
            ? `${createdAt.toLocaleDateString()} at ${createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
            : "Subscription order update",
        value: order.status === "delivered" ? "+1 Meal" : `₹${order.pricing?.total || 0}`,
        icon: order.status === "delivered" ? "delivered" : "order",
        at: createdAt,
      })
    })

    if (latestPurchased?.purchasedAt) {
      const purchasedAt = new Date(latestPurchased.purchasedAt)
      activities.push({
        id: `plan-${latestPurchased._id || purchasedAt.getTime()}`,
        title: "Plan Purchased",
        subtitle: !Number.isNaN(purchasedAt.getTime())
          ? purchasedAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
          : "Subscription plan purchase",
        value: `${latestPurchased.planDays || 0} Days`,
        icon: "plan",
        at: purchasedAt,
      })
    }

    if (primarySubscription?.nextDeliveryAt) {
      const nextDeliveryAt = new Date(primarySubscription.nextDeliveryAt)
      activities.push({
        id: `next-delivery-${primarySubscription._id || nextDeliveryAt.getTime()}`,
        title: primarySubscription.status === "paused" ? "Delivery Paused" : "Next Delivery Scheduled",
        subtitle: !Number.isNaN(nextDeliveryAt.getTime())
          ? formatNextDeliveryLabel(primarySubscription.nextDeliveryAt)
          : "Upcoming subscription delivery",
        value: primarySubscription.status === "paused" ? "Paused" : "Upcoming",
        icon: primarySubscription.status === "paused" ? "paused" : "scheduled",
        at: nextDeliveryAt,
      })
    } else if (primarySubscription?.createdAt) {
      const createdAt = new Date(primarySubscription.createdAt)
      activities.push({
        id: `subscription-${primarySubscription._id || createdAt.getTime()}`,
        title: "Subscription Active",
        subtitle: !Number.isNaN(createdAt.getTime())
          ? `Started on ${createdAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`
          : "Subscription started",
        value: primarySubscription.planName?.replace(/ plan$/i, "") || `${primarySubscription.planDays || 0} Days`,
        icon: "plan",
        at: createdAt,
      })
    }

    return activities
      .filter((activity) => activity.at && !Number.isNaN(activity.at.getTime()))
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, 3)
  }, [recentOrders, latestPurchased, primarySubscription])

  const hasBillingPlan = !!(dashboard?.activePlan || purchasedPlanMeta)



  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-100 dark:bg-gray-950">
        <Loader2 className="h-9 w-9 animate-spin text-[#DC2626]" />
      </div>
    )
  }

  const sendToEditMealFirst =
    isModuleAuthenticated("user") && !hasActive && !hasCompleteMealSelection(draftItems)
  if (sendToEditMealFirst) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-stone-100 dark:bg-gray-950 px-6">
        <Loader2 className="h-9 w-9 animate-spin text-[#DC2626]" />
        <p className="text-center text-sm text-gray-600 dark:text-gray-400 max-w-xs">
          Choose your meals first — opening meal setup…
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#FDFDFD] dark:bg-gray-950 pb-32 pt-6">
      <div className="max-w-md mx-auto px-6">
        <header className="mb-8">
           <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#DC2626] mb-1">Your Subscription</p>
           <h1 className="text-[3.2rem] font-[900] text-gray-900 leading-[1.1] tracking-[-0.03em] mb-8 animate-in fade-in slide-in-from-left duration-700">
          Hello, {displayProfile?.name || "User"}
        </h1>
        </header>

        {/* Value props */}
        <div className="mb-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowPolicy(true)}
            className="inline-flex items-center gap-2 rounded-full border border-gray-200/80 bg-white/90 dark:bg-gray-900/60 dark:border-gray-700 px-3.5 py-2 text-xs font-semibold text-gray-700 dark:text-gray-200 shadow-sm hover:border-[#DC2626]/30 hover:bg-white dark:hover:bg-gray-900 transition-colors"
          >
            <Info className="h-3.5 w-3.5 text-[#DC2626]" />
            7-day cancellation
          </button>
          <a
            href={WHATSAPP_SUPPORT}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-emerald-200/80 bg-emerald-50/90 dark:bg-emerald-950/40 dark:border-emerald-800/50 px-3.5 py-2 text-xs font-semibold text-emerald-800 dark:text-emerald-200 shadow-sm hover:bg-emerald-100/90 dark:hover:bg-emerald-900/30 transition-colors"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            WhatsApp
          </a>
        </div>

        {planPurchased && !showMandatePrompt && (
          <div className="mb-4 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 text-sm">
            Plan purchased successfully. You can view it below.
          </div>
        )}
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm">
            {error}
          </div>
        )}



        {hasActive && primarySubscription ? (
          <div className="space-y-5 mb-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Plan Card */}
            <section className="relative overflow-hidden rounded-[2.5rem] bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-8">
               <div className="flex justify-between items-start mb-6">
                 <div>
                   <h2 className="text-2xl font-black text-gray-900 dark:text-white leading-tight">
                     {totalPurchasedDays > 0 
                       ? `${totalPurchasedDays} Days` 
                       : (primarySubscription.planName?.replace(/ plan$/i, '') || `${primarySubscription.planDays} Days`)}
                   </h2>
                   <p className="text-sm font-medium text-gray-500 mt-1 italic">
                     {primarySubscription.restaurantName || "Nutritious Daily Meals"}
                   </p>
                 </div>
                 <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
                   primarySubscription.status === 'active' 
                   ? 'bg-[#7CFCD5] text-[#1E3A34]' 
                   : 'bg-amber-100 text-amber-800'
                 }`}>
                   {primarySubscription.status}
                 </span>
               </div>

               <div className="mt-10 mb-2">
                 <div className="flex items-baseline gap-3">
                   <span className="text-6xl font-black text-[#DC2626] tabular-nums tracking-tighter">
                     {displayRemainingDays}
                   </span>
                   <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Days Left</span>
                 </div>
               </div>

               <div className="h-2 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden mb-8">
                   <div 
                    className="h-full bg-[#DC2626] transition-all duration-1000" 
                    style={{ width: `${Math.min(100, Math.max(0, ((typeof displayRemainingDays === 'number' ? displayRemainingDays : 0) / (totalPurchasedDays > 0 ? totalPurchasedDays : (primarySubscription.planDays || 30))) * 100))}%` }} 
                  />
               </div>

               <div className="flex items-center justify-between border-t border-gray-100 dark:border-gray-800 pt-6">
                 <div>
                   <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 leading-none">Valid Until</p>
                   <p className="text-sm font-black text-gray-900 dark:text-white leading-none">
                     {displayEndDate}
                   </p>
                 </div>
                 <Button 
                   variant={dashboard?.cancellationRequestedAt ? "outline" : "default"}
                   onClick={dashboard?.cancellationRequestedAt ? () => {} : () => navigate("/subscription/plans")}
                   className={`h-12 px-8 rounded-2xl font-black text-sm transition-transform active:scale-95 ${
                     dashboard?.cancellationRequestedAt 
                     ? "border-red-200 text-red-500" 
                     : "bg-[#DC2626] hover:bg-[#B91C1C] text-white shadow-lg shadow-red-500/20"
                   }`}
                 >
                   {dashboard?.cancellationRequestedAt ? "Cancellation Pending" : "Extend Plan"}
                 </Button>
               </div>
            </section>

            {/* Wallet Card */}
            <div className="bg-[#F8F8F8] dark:bg-gray-900 rounded-[2rem] p-6 flex items-center justify-between border border-transparent dark:border-gray-800">
               <div className="flex items-center gap-4">
                 <div className="h-12 w-12 rounded-xl bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
                    <div className="h-8 w-8 rounded-lg bg-[#DC143C] flex items-center justify-center text-white">
                       <div className="h-4 w-4 border-2 border-white rounded-[2px] flex items-center justify-center">
                          <div className="h-1 w-2 bg-white rounded-full translate-x-1" />
                       </div>
                    </div>
                 </div>
                 <div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Wallet Balance</p>
                    <p className="text-2xl font-black text-gray-900 dark:text-white">
                       ₹{walletBalance != null ? Number(walletBalance).toFixed(2) : "0.00"}
                    </p>
                 </div>
               </div>
               <Link to="/wallet" className="text-xs font-black text-[#DC2626] uppercase tracking-widest hover:underline">
                 Add Money
               </Link>
            </div>

            {/* Deliveries Card */}
            <Link to="/subscription/manage" className="bg-white dark:bg-gray-900 rounded-[2rem] p-6 flex items-center gap-5 border border-gray-100 dark:border-gray-800 shadow-sm transition-transform active:scale-[0.98]">
               <div className="h-14 w-14 rounded-full bg-[#E6F3F1] flex items-center justify-center text-[#2D7A6E]">
                  <Truck className="h-6 w-6" strokeWidth={2.5} />
               </div>
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Remaining Deliveries</p>
                   <p className="text-lg font-black text-gray-900 dark:text-white">
                     {remainingDeliveries} Meals Total
                   </p>
                </div>
            </Link>

            {/* Recent Activity */}
            <div className="pt-4">
               <div className="flex items-center justify-between mb-4">
                 <h3 className="text-xl font-extrabold text-gray-900 dark:text-white">Recent Activity</h3>
                 <Link to="/orders" className="text-[10px] font-black text-gray-400 uppercase tracking-widest hover:text-[#DC2626]">View All</Link>
               </div>
               <div className="space-y-3">
                 {recentActivity.length > 0 ? recentActivity.map((activity) => (
                   <div key={activity.id} className="bg-[#F8F8F8] dark:bg-gray-900 rounded-3xl p-5 flex items-center justify-between border border-transparent dark:border-gray-800">
                    <div className="flex items-center gap-4">
                       <div className={`h-10 w-10 rounded-full bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 flex items-center justify-center ${
                         activity.icon === 'delivered'
                           ? 'text-emerald-500'
                           : activity.icon === 'plan'
                             ? 'text-[#DC2626]'
                             : activity.icon === 'paused'
                               ? 'text-amber-500'
                               : 'text-sky-500'
                       }`}>
                          {activity.icon === 'delivered' ? (
                            <Check className="h-5 w-5" strokeWidth={3} />
                          ) : activity.icon === 'plan' ? (
                            <Package className="h-5 w-5" strokeWidth={2.2} />
                          ) : activity.icon === 'paused' ? (
                            <PauseCircle className="h-5 w-5" strokeWidth={2.2} />
                          ) : activity.icon === 'scheduled' ? (
                            <Calendar className="h-5 w-5" strokeWidth={2.2} />
                          ) : (
                            <Truck className="h-5 w-5" strokeWidth={2} />
                          )}
                       </div>
                       <div>
                          <p className="text-sm font-black text-gray-900 dark:text-white leading-tight capitalize">
                            {activity.title}
                          </p>
                          <p className="text-[10px] font-bold text-gray-400 mt-1 leading-none">
                            {activity.subtitle}
                          </p>
                       </div>
                    </div>
                    <span className="text-xs font-black text-gray-900 dark:text-white uppercase tracking-widest">
                      {activity.value}
                    </span>
                  </div>
                 )) : (
                   <div className="bg-[#F8F8F8] dark:bg-gray-900 rounded-3xl p-8 text-center border border-dashed border-gray-200 dark:border-gray-800">
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">No recent subscription activity</p>
                   </div>
                 )}
               </div>
            </div>

            {/* Help Card */}
            <a 
              href={WHATSAPP_SUPPORT}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-[#F0FAF7] dark:bg-[#0D2A24] rounded-3xl p-6 flex items-center justify-between border border-[#E0F2EE] dark:border-[#1E3A34] transition-transform active:scale-[0.98]"
            >
               <div className="flex items-center gap-5">
                 <div className="h-14 w-14 rounded-full bg-[#24D366] flex items-center justify-center text-white shadow-lg shadow-green-200/50">
                    <MessageCircle className="h-7 w-7 fill-white" strokeWidth={1} />
                 </div>
                 <div>
                    <p className="font-extrabold text-gray-900 dark:text-white leading-tight">Need any help?</p>
                    <p className="text-[11px] font-bold text-gray-500 mt-1">Chat with us on WhatsApp</p>
                 </div>
               </div>
               <ChevronRight className="h-5 w-5 text-gray-400" />
            </a>
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
          <div className="bg-gradient-to-b from-emerald-50 to-white dark:from-emerald-950/30 dark:to-gray-900 p-6">
            <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-200/60">
              <Check className="h-7 w-7" strokeWidth={3} />
            </div>
            <DialogHeader>
              <DialogTitle className="text-center text-2xl font-black text-gray-900 dark:text-white">Payment Successful</DialogTitle>
              <p className="text-sm text-gray-500 dark:text-gray-400">
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
        <DialogContent className="sm:max-w-md">
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
