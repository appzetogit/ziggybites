import { useState, useEffect, useCallback } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { ArrowLeft, Check, PauseCircle, Loader2, UserCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import api from "@/lib/api"
import { toast } from "sonner"
import SubscriptionPauseDialog from "@/module/user/components/SubscriptionPauseDialog.jsx"
import { hasCompleteMealSelection } from "@/module/user/utils/subscriptionMealSelection.js"
import { readSubscriptionDraftFromStorage } from "@/module/user/utils/subscriptionDraftStorage.js"

// We use basic generic SVGs matching the provided design closely
const BreakfastIcon = ({ className }) => (
  <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
    <path d="M7 2v20" />
    <path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
  </svg>
)

const LunchIcon = ({ className }) => (
  <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 14h18" />
    <path d="M5 14c0-3.87 3.13-7 7-7s7 3.13 7 7" />
    <path d="M4 18h16a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v0a2 2 0 0 1 2-2z" />
  </svg>
)

const SnacksIcon = ({ className }) => (
  <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 10h16v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V10z" />
    <path d="M8 10V4" />
    <path d="M12 10V2" />
    <path d="M16 10V4" />
  </svg>
)

const DinnerIcon = ({ className }) => (
  <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 13h20a10 10 0 0 1-20 0z" />
    <path d="M22 6l-6 7" />
    <path d="M2 6l6 7" />
  </svg>
)

const MEAL_CATEGORIES = [
  { id: "breakfast", label: "Breakfast", Icon: BreakfastIcon, timeRange: "8 AM - 9 AM" },
  { id: "lunch", label: "Lunch", Icon: LunchIcon, timeRange: "1 PM - 2 PM" },
  { id: "snacks", label: "Evening Snacks", Icon: SnacksIcon, timeRange: "5 PM - 6 PM" },
  { id: "dinner", label: "Dinner", Icon: DinnerIcon, timeRange: "8 PM - 9 PM" },
]

function normalizeMealSubscription(pref) {
  if (!pref) return null
  const id = pref._id ?? pref.id
  if (id == null || id === "") return null
  return { ...pref, _id: id }
}

export default function SubscriptionEditMeal() {
  const location = useLocation()
  const navigate = useNavigate()
  const [displayItems, setDisplayItems] = useState([])
  const [mealSubscription, setMealSubscription] = useState(null)
  const [bootstrapping, setBootstrapping] = useState(true)
  const [showPauseDialog, setShowPauseDialog] = useState(false)
  const [resumeSaving, setResumeSaving] = useState(false)

  const refreshFromServer = useCallback(async () => {
    try {
      const activeRes = await api.get("/subscription/active").catch(() => ({ data: { success: false, data: [] } }))
      const subs = activeRes?.data?.success && Array.isArray(activeRes.data.data) ? activeRes.data.data : []
      const pref = subs.find((s) => s.status === "active") || subs[0] || null
      setMealSubscription(normalizeMealSubscription(pref))
      const draft = readSubscriptionDraftFromStorage()
      const subItems = pref?.items || []
      setDisplayItems(subItems.length > 0 ? subItems : draft)
    } catch {
      setDisplayItems([])
      setMealSubscription(null)
    } finally {
      setBootstrapping(false)
    }
  }, [])

  useEffect(() => {
    refreshFromServer()
  }, [refreshFromServer])

  useEffect(() => {
    const handler = () => refreshFromServer()
    window.addEventListener("subscriptionDraftUpdated", handler)
    window.addEventListener("userAuthChanged", handler)
    return () => {
      window.removeEventListener("subscriptionDraftUpdated", handler)
      window.removeEventListener("userAuthChanged", handler)
    }
  }, [refreshFromServer])

  useEffect(() => {
    const onVis = () => document.visibilityState === "visible" && refreshFromServer()
    document.addEventListener("visibilitychange", onVis)
    return () => document.removeEventListener("visibilitychange", onVis)
  }, [refreshFromServer])

  const hasMealSub = Boolean(mealSubscription)
  const isChooseMealsFirstTime = !hasMealSub
  const mealsComplete = hasCompleteMealSelection(displayItems || [])
  const selectedCount = new Set((displayItems || []).map(i => i.mealCategory)).size
  const hasAnyMealSelected = selectedCount > 0
  const stepNumber = Math.min(4, Math.max(1, selectedCount + 1))
  const shouldRedirectToManage = !bootstrapping && hasMealSub && !location.state?.mealSetupFirst

  useEffect(() => {
    if (!shouldRedirectToManage) return
    navigate("/subscription/manage", { replace: true })
  }, [shouldRedirectToManage, navigate])

  const handleResume = async () => {
    const id = mealSubscription?._id ?? mealSubscription?.id
    if (!id) return
    setResumeSaving(true)
    try {
      const res = await api.post("/subscription/resume", { subscriptionId: id })
      toast.success(res?.data?.message || "Deliveries resumed")
      await refreshFromServer()
    } catch (e) {
      toast.error(e?.response?.data?.message || e.message || "Could not resume")
    } finally {
      setResumeSaving(false)
    }
  }

  const handleBack = () => {
    if (isChooseMealsFirstTime && !mealsComplete) return navigate("/")
    navigate("/subscription")
  }

  if (bootstrapping || shouldRedirectToManage) {
    return (
      <div className="min-h-screen bg-[#FDFDFD] dark:bg-gray-950 flex items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-[#DC2626]" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#FDFDFD] dark:bg-gray-950 flex flex-col pt-4">
      
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 mb-2">
        <button onClick={handleBack} className="flex items-center gap-3 text-gray-900 dark:text-white transition-opacity hover:opacity-75">
          <ArrowLeft className="h-5 w-5 stroke-[2.5]" />
          <h1 className="text-[22px] font-black tracking-tight">{isChooseMealsFirstTime ? "Choose your meal" : "Edit your meal"}</h1>
        </button>
        <Link to="/profile" className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
          <UserCircle2 className="h-6 w-6 stroke-2" />
        </Link>
      </header>

      {/* Description */}
      <div className="px-6 mb-8">
        <p className="text-[15px] text-gray-600 dark:text-gray-400 leading-[1.6] select-none">
          {isChooseMealsFirstTime
            ? "Pick your preferred meal time to get started. Once you choose at least one meal, you can continue to the plan page."
            : "Customize your culinary journey. You can select or change your preferred meal time for any day of your active subscription."}
        </p>
      </div>

      <div className="flex-1 px-6 pb-28 space-y-8">

        {!isChooseMealsFirstTime && (
          <div className="bg-white dark:bg-gray-900 rounded-[2rem] p-7 shadow-[0_8px_30px_-8px_rgba(0,0,0,0.06)] border border-gray-100 dark:border-gray-800">
            <div className="flex items-center justify-between mb-6">
              <div className="flex gap-[6px]">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className={`h-1.5 w-8 rounded-full transition-colors duration-300 ${i <= stepNumber ? 'bg-[#DC2626]' : 'bg-gray-200 dark:bg-gray-700'}`}
                  />
                ))}
              </div>
              <div className="text-[10px] font-black uppercase tracking-widest text-[#DC2626] leading-[1.1] text-right">
                STEP {stepNumber}<br/>OF 4
              </div>
            </div>

            <div className="flex flex-col gap-3">
              {mealSubscription?.status === "paused" ? (
                <Button
                  onClick={handleResume}
                  disabled={resumeSaving}
                  className="w-full h-14 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-2xl text-[15px] shadow-lg shadow-emerald-600/20 transition-all active:scale-[0.98]"
                >
                  {resumeSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : "Resume deliveries"}
                </Button>
              ) : (
                <Button
                  onClick={() => setShowPauseDialog(true)}
                  className="w-full h-14 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-900 dark:text-white font-bold py-3.5 rounded-2xl text-[15px] transition-all active:scale-[0.98]"
                >
                  Skip deliveries
                </Button>
              )}

              <Button
                onClick={() => {
                  const target = mealSubscription?.nextMealCategory
                    ? `/subscription/browse/${mealSubscription.nextMealCategory}`
                    : "/subscription/edit-meal"
                  navigate(target, { state: { fromEditMeal: true, addNextMeal: true } })
                }}
                className="w-full h-14 bg-[#DC2626] hover:bg-[#B91C1C] text-white font-bold py-3.5 rounded-2xl text-[15px] shadow-[0_8px_20px_rgba(220,38,38,0.25)] transition-all active:scale-[0.98]"
              >
                Change next meal
              </Button>
            </div>
          </div>
        )}

        {/* Select Meal Time */}
        <div>
          <div className="flex items-end justify-between mb-5 px-1">
            <h2 className="text-[22px] font-black tracking-tight text-gray-900 dark:text-white leading-none">Select Meal Time</h2>
            <span className="text-[9px] font-black text-gray-500 uppercase tracking-[0.15em] mb-1">DAILY SCHEDULE</span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {MEAL_CATEGORIES.map((cat) => {
              const hasItems = (displayItems || []).some((i) => i.mealCategory === cat.id)
              const Icon = cat.Icon

              return (
                <Link
                  key={cat.id}
                  to={`/subscription/browse/${cat.id}`}
                  state={{ fromEditMeal: true, chooseMealsFirstTime: isChooseMealsFirstTime }}
                  className={`group relative flex flex-col p-[22px] rounded-[1.75rem] transition-all duration-200 active:scale-95 ${
                    hasItems 
                      ? "bg-white dark:bg-gray-900 border border-[#DC2626] shadow-[0_12px_30px_-10px_rgba(220,38,38,0.15)]" 
                      : "bg-[#F6F6F9] dark:bg-gray-800/50 border border-transparent hover:bg-[#EBEBEF] dark:hover:bg-gray-800"
                  }`}
                >
                  {hasItems && (
                     <div className="absolute top-4 right-4 h-6 w-6 rounded-full bg-[#DC2626] flex items-center justify-center text-white shadow-md z-10">
                       <Check className="h-[14px] w-[14px] stroke-[3.5]" />
                     </div>
                  )}

                  <div className="mb-4 text-[#DC2626]">
                    <Icon className="h-7 w-7" />
                  </div>

                  <div>
                    <h3 className="text-[17px] font-[800] tracking-tight text-gray-900 dark:text-white mb-1.5">{cat.label}</h3>
                    <p className={`text-[10px] font-black uppercase tracking-[0.1em] ${hasItems ? 'text-[#DC2626]' : 'text-gray-500'}`}>{cat.timeRange}</p>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>

        {isChooseMealsFirstTime && hasAnyMealSelected && (
          <Button
            onClick={() => navigate("/subscription/plans")}
            className="w-full h-14 bg-[#DC2626] hover:bg-[#B91C1C] text-white font-bold py-3.5 rounded-2xl text-[15px] shadow-[0_8px_20px_rgba(220,38,38,0.25)] transition-all active:scale-[0.98]"
          >
            Continue to plans
          </Button>
        )}

        {/* Kitchen/Brand Image Placeholder */}
        <div className="mt-6 rounded-3xl overflow-hidden shadow-sm relative h-40 group">
           <img 
             src="https://images.unsplash.com/photo-1556910103-1c02745aae4d?auto=format&fit=crop&q=80&w=800" 
             alt="Ziggybites Kitchen" 
             className="w-full h-full object-cover grayscale brightness-75 transition-all duration-700 group-hover:grayscale-0 group-hover:brightness-90"
           />
           <div className="absolute inset-0 bg-gradient-to-t from-gray-900/40 to-transparent pointer-events-none" />
        </div>

      </div>

      <SubscriptionPauseDialog
        open={showPauseDialog}
        onOpenChange={setShowPauseDialog}
        subscription={mealSubscription}
        onAfterPause={refreshFromServer}
      />
    </div>
  )
}
