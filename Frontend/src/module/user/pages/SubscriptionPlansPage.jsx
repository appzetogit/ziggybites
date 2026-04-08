import { useState, useEffect, useMemo } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import {
  ChevronRight,
  Check,
  ArrowLeft,
  Loader2,
  Pencil
} from "lucide-react"
import { Button } from "@/components/ui/button"
import api, { userAPI } from "@/lib/api"
import { readSubscriptionDraftFromStorage } from "@/module/user/utils/subscriptionDraftStorage.js"
import AnimatedPage from "@/module/user/components/AnimatedPage"

function hasAnyMealSelection(items) {
  return Array.isArray(items) && items.length > 0
}

const FALLBACK_PLANS = [
  { durationDays: 15, name: "15 Days (Basic)", price: 299, discountPercent: 0 },
  { durationDays: 30, name: "30 Days (Standard)", price: 499, discountPercent: 10 },
  { durationDays: 90, name: "90 Days (Value)", price: 1299, discountPercent: 25 },
]

function getValidityLabel(days) {
  if (days === 15) return "Valid for 15 days"
  if (days === 30) return "Valid for 1 month"
  if (days === 45) return "Valid for 45 days"
  if (days === 90) return "Valid for 3 months"
  return `Valid for ${days} days`
}

function getDefaultDescription(plan) {
  if (plan.description) return plan.description
  if (plan.durationDays === 15) return "Basic transformation plan for starters."
  if (plan.durationDays === 30) return "Standard month-long consistency plan."
  if (plan.durationDays === 45) return "Extended 45-day milestone plan."
  if (plan.durationDays === 90) return "Quarterly value plan. Best value."
  return "Meal subscription with flexible scheduling."
}

export default function SubscriptionPlansPage() {
  const navigate = useNavigate()
  const [plans, setPlans] = useState([])
  const [purchasedPlans, setPurchasedPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [draftItems, setDraftItems] = useState(() => readSubscriptionDraftFromStorage())

  useEffect(() => {
    const syncDraftItems = () => {
      setDraftItems(readSubscriptionDraftFromStorage())
    }

    window.addEventListener("subscriptionDraftUpdated", syncDraftItems)
    window.addEventListener("userAuthChanged", syncDraftItems)

    return () => {
      window.removeEventListener("subscriptionDraftUpdated", syncDraftItems)
      window.removeEventListener("userAuthChanged", syncDraftItems)
    }
  }, [])

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        const [plansRes, purchasedRes] = await Promise.all([
          api.get("/subscription/plans").catch(() => ({ data: { success: false, data: [] } })),
          api.get("/subscription/purchased-plans").catch(() => ({ data: { success: false, data: [] } })),
        ])

        if (plansRes?.data?.success) {
          const p = Array.isArray(plansRes.data.data) ? plansRes.data.data : (Array.isArray(plansRes.data) ? plansRes.data : [])
          setPlans(p.length ? p : FALLBACK_PLANS)
        } else {
          setPlans(FALLBACK_PLANS)
        }

        if (purchasedRes?.data?.success) {
          const pp = Array.isArray(purchasedRes.data.data) ? purchasedRes.data.data : (Array.isArray(purchasedRes.data) ? purchasedRes.data : [])
          setPurchasedPlans(pp)
        }
      } catch (e) {
        console.error("Error fetching plans:", e)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  useEffect(() => {
    if (loading) return
    if (hasAnyMealSelection(draftItems)) return

    navigate("/subscription/edit-meal", { replace: true, state: { mealSetupFirst: true } })
  }, [loading, draftItems, navigate])

  const displayPlans = plans.filter((p) => p.isActive !== false)

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fdfdfd] dark:bg-gray-950">
        <Loader2 className="h-9 w-9 animate-spin text-[#DC2626]" />
      </div>
    )
  }

  if (!hasAnyMealSelection(draftItems)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-[#fdfdfd] dark:bg-gray-950 px-6">
        <Loader2 className="h-9 w-9 animate-spin text-[#DC2626]" />
        <p className="text-center text-sm text-gray-600 dark:text-gray-400 max-w-xs">
          Choose your meals first, then we&apos;ll show your plans.
        </p>
      </div>
    )
  }

  return (
    <AnimatedPage className="min-h-screen bg-[#FDFDFD] dark:bg-gray-950 pb-32 pt-6">
      <div className="max-w-md mx-auto px-6">
        <header className="mb-8 flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => navigate("/subscription")}
            className="shrink-0 -ml-2"
          >
            <ArrowLeft className="h-6 w-6" />
          </Button>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#DC2626] mb-1">Upgrade or Renew</p>
            <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white">
              Choose a plan
            </h1>
          </div>
        </header>

        <div className="mb-8 p-6 rounded-[2rem] bg-[#DC2626]/5 border border-[#DC2626]/10">
          <div className="flex items-center justify-between mb-4">
             <h2 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-widest">Your Selection</h2>
             <Link to="/subscription/edit-meal" className="text-xs font-bold text-[#DC2626] flex items-center gap-1">
               <Pencil className="h-3 w-3" />
               Edit Meals
             </Link>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {draftItems.length > 0 
              ? `You have selected ${draftItems.length} meals. Price will be calculated based on this selection.`
              : "No meals selected yet. Please select meals to see final pricing."}
          </p>
        </div>

        <div className="space-y-4">
          {displayPlans.map((plan) => {
            const isPurchased = purchasedPlans.some((p) => p.planDays === plan.durationDays)
            const isPopular = plan.durationDays === 30
            return (
              <div
                key={plan.durationDays}
                className={`relative overflow-hidden rounded-[2.5rem] bg-white dark:bg-gray-900 border transition-all duration-300 ${
                  isPopular 
                    ? "border-[#DC2626]/30 shadow-[0_10px_40px_rgba(220,38,38,0.08)]" 
                    : "border-gray-100 dark:border-gray-800 shadow-sm"
                }`}
              >
                {isPopular && (
                  <div className="absolute top-6 right-6 px-3 py-1 bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest rounded-full">
                    Most Popular
                  </div>
                )}
                
                <div className="p-8">
                  <div className="mb-6">
                    <h3 className="text-2xl font-black text-gray-900 dark:text-white">
                      {plan.name || `${plan.durationDays} Days Plan`}
                    </h3>
                    <p className="text-sm font-medium text-gray-500 mt-1 italic">
                      {getValidityLabel(plan.durationDays)}
                    </p>
                  </div>

                  <p className="text-sm text-gray-600 dark:text-gray-300 mb-6 leading-relaxed">
                    {getDefaultDescription(plan)}
                  </p>

                  <div className="mb-8">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Pricing</p>
                    {plan.priceType === "fixed" && plan.price > 0 ? (
                      <div className="flex items-baseline gap-2">
                        <span className="text-4xl font-black text-gray-900 dark:text-white">₹{plan.price}</span>
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">/ Total</span>
                      </div>
                    ) : (
                      <p className="text-lg font-black text-gray-900 dark:text-white">Price based on your meal selection</p>
                    )}
                  </div>

                  <div className="flex flex-col gap-3">
                    <Button 
                      asChild
                      className={`h-14 rounded-2xl font-black text-sm transition-transform active:scale-95 ${
                        isPurchased 
                          ? "bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/20" 
                          : "bg-[#DC2626] hover:bg-[#B91C1C] shadow-red-500/20 shadow-lg"
                      }`}
                    >
                      <Link to={`/subscription/plan/${plan.durationDays}`}>
                        {isPurchased ? (
                          <span className="flex items-center gap-2">
                            <Check className="h-5 w-5" strokeWidth={3} />
                            Already Purchased
                          </span>
                        ) : (
                          <span className="flex items-center gap-2">
                            View details
                            <ChevronRight className="h-5 w-5" />
                          </span>
                        )}
                      </Link>
                    </Button>
                  </div>

                  <div className="mt-8 pt-8 border-t border-gray-50 dark:border-gray-800 space-y-3">
                    <div className="flex items-center gap-3">
                       <div className="h-5 w-5 rounded-full bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center text-emerald-500">
                         <Check className="h-3 w-3" strokeWidth={4} />
                       </div>
                       <span className="text-xs font-bold text-gray-600 dark:text-gray-400">24-hour prior delivery notification</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs font-bold text-gray-600 dark:text-gray-400">
                       <div className="h-5 w-5 rounded-full bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center text-emerald-500">
                         <Check className="h-3 w-3" strokeWidth={4} />
                       </div>
                       Modify, skip, or confirm each delivery
                    </div>
                    <div className="flex items-center gap-3 text-xs font-bold text-gray-600 dark:text-gray-400">
                       <div className="h-5 w-5 rounded-full bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center text-emerald-500">
                         <Check className="h-3 w-3" strokeWidth={4} />
                       </div>
                       No refunds on cancellation
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <p className="mt-12 text-center text-[11px] font-bold text-gray-400 leading-relaxed max-w-[280px] mx-auto">
          Subscribe from any restaurant on Home. You will get a notification 24 hours before each delivery.
        </p>
      </div>
    </AnimatedPage>
  )
}
