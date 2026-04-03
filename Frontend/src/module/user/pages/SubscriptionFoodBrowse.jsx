import { useState, useEffect, useCallback } from "react"
import { useParams, useNavigate, useLocation } from "react-router-dom"
import { ArrowLeft, Loader2, Plus, Utensils, Check, Trash2, Wallet, CreditCard, X, ChevronRight, UtensilsCrossed } from "lucide-react"
import api, { userAPI } from "@/lib/api"
import { toast } from "sonner"
import { initRazorpayPayment } from "@/lib/utils/razorpay"
import { getCompanyNameAsync } from "@/lib/utils/businessSettings"
import {
  readSubscriptionDraftFromStorage,
  writeSubscriptionDraftToStorage,
} from "@/module/user/utils/subscriptionDraftStorage.js"

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
  { id: "breakfast", label: "Breakfast", Icon: BreakfastIcon, heading: "The Sunrise\nSelection" },
  { id: "lunch", label: "Lunch", Icon: LunchIcon, heading: "The Midday\nSelection" },
  { id: "snacks", label: "Evening Snacks", Icon: SnacksIcon, heading: "The Twilight\nSelection" },
  { id: "dinner", label: "Dinner", Icon: DinnerIcon, heading: "The Evening\nSelection" },
]

export default function SubscriptionFoodBrowse() {
  const { category } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const fromEditMeal = location.state?.fromEditMeal
  const addNextMeal = location.state?.addNextMeal
  const chooseMealsFirstTime = Boolean(location.state?.chooseMealsFirstTime)
  const [restaurants, setRestaurants] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedRestaurant, setSelectedRestaurant] = useState(null)
  const [adding, setAdding] = useState(null)
  const [removing, setRemoving] = useState(null)
  const [activeSubscriptions, setActiveSubscriptions] = useState([])
  const [draftItems, setDraftItems] = useState(() => readSubscriptionDraftFromStorage())
  const [pendingPayment, setPendingPayment] = useState(null)
  const [payingCheckout, setPayingCheckout] = useState(false)

  const categoryMeta = MEAL_CATEGORIES.find((c) => c.id === category)
  const primarySub = activeSubscriptions.find((s) => s.status === "active") || activeSubscriptions[0] || null
  const displayItems = primarySub?.items ? primarySub.items : draftItems
  const minimalFirstTimeBrowse = chooseMealsFirstTime && !primarySub

  const isAdded = (foodId) =>
    (displayItems || []).some(
      (i) => String(i.itemId) === String(foodId) && i.mealCategory === category,
    )

  useEffect(() => {
    if (!category || !["breakfast", "lunch", "snacks", "dinner"].includes(category)) {
      navigate("/subscription")
      return
    }
    const fetchData = async () => {
      setLoading(true)
      try {
        const [foodsRes, activeRes] = await Promise.all([
          api.get("/restaurant/foods", { params: { category } }).catch((e) => {
            console.warn("Foods API error:", e?.response?.status, e?.message)
            return { data: { success: false } }
          }),
          api.get("/subscription/active").catch(() => ({ data: { success: false, data: [] } })),
        ])
        const restaurantsData = foodsRes?.data?.data?.restaurants ?? foodsRes?.data?.restaurants ?? []
        setRestaurants(Array.isArray(restaurantsData) ? restaurantsData : [])
        if (activeRes?.data?.success && Array.isArray(activeRes.data.data)) {
          setActiveSubscriptions(activeRes.data.data)
        } else {
          setActiveSubscriptions([])
        }
        setDraftItems(readSubscriptionDraftFromStorage())
      } catch (e) {
        toast.error("Failed to load foods")
        setRestaurants([])
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [category, navigate])

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

  const mergeServerSubscription = (prev, serverSub) => {
    if (!serverSub?._id) return prev
    const idx = prev.findIndex((s) => String(s._id) === String(serverSub._id))
    if (idx < 0) return [serverSub]
    const next = [...prev]
    next[idx] = serverSub
    return next
  }

  const confirmMealAddPayment = useCallback(async (subId, body) => {
    const c = await api.post(`/subscription/${subId}/items/confirm-add-payment`, body)
    if (!c?.data?.success) throw new Error(c?.data?.message || "Could not confirm payment")
    return c.data.data
  }, [])

  const handleDismissPendingPayment = () => {
    if (payingCheckout) return
    setPendingPayment(null)
    toast.info("Payment cancelled. Tap Add again when you're ready.")
  }

  const handlePayFromWallet = async () => {
    if (!pendingPayment?.checkoutId || !(pendingPayment.walletWillDebitRupees > 0)) return
    setPayingCheckout(true)
    try {
      const serverSub = await confirmMealAddPayment(pendingPayment.subId, {
        checkoutId: pendingPayment.checkoutId,
      })
      setActiveSubscriptions((prev) => mergeServerSubscription(prev, serverSub))
      window.dispatchEvent(new CustomEvent("subscriptionDraftUpdated"))
      setPendingPayment(null)
      toast.success(pendingPayment.hadOtherMealInCategory ? `Updated ${categoryMeta?.label}` : `Added to ${categoryMeta?.label}`)
    } catch (e) {
      toast.error(e?.response?.data?.message || "Payment failed")
    } finally {
      setPayingCheckout(false)
    }
  }

  const handlePayWithRazorpay = () => {
    const p = pendingPayment
    const rz = p?.razorpay || p?.razorpayOnlineOnly
    if (!rz?.key || !rz?.orderId || payingCheckout) return
    setPayingCheckout(true)
    let settled = false
    initRazorpayPayment({
      key: rz.key,
      amount: rz.amount,
      currency: rz.currency || "INR",
      order_id: rz.orderId,
      name: p.companyName || "Ziggybites",
      description: `Subscription meal — ${categoryMeta?.label}`,
      prefill: { name: p.prefill?.name || "", email: p.prefill?.email || "", contact: p.prefill?.contact || "" },
      notes: { checkoutId: p.checkoutId, subscriptionId: String(p.subId) },
      handler: async (response) => {
        if (settled) return
        settled = true
        try {
          const serverSub = await confirmMealAddPayment(p.subId, {
            checkoutId: p.checkoutId,
            razorpayOrderId: response.razorpay_order_id,
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySignature: response.razorpay_signature,
          })
          setActiveSubscriptions((prev) => mergeServerSubscription(prev, serverSub))
          window.dispatchEvent(new CustomEvent("subscriptionDraftUpdated"))
          setPendingPayment(null)
          toast.success(p.hadOtherMealInCategory ? `Updated ${categoryMeta?.label}` : `Added to ${categoryMeta?.label}`)
        } catch (err) {
          toast.error(err?.response?.data?.message || "Could not verify payment")
        } finally {
          setPayingCheckout(false)
        }
      },
      onError: (err) => {
        if (settled) return
        settled = true
        setPayingCheckout(false)
        if (err?.code !== "PAYMENT_CANCELLED") toast.error("Payment failed")
      },
      onClose: () => {
        if (settled) return
        settled = true
        setPayingCheckout(false)
      },
    })
  }

  const handleAddFood = async (food) => {
    const newItem = {
      itemId: food.id,
      name: food.name,
      price: food.price,
      quantity: 1,
      image: food.image,
      isVeg: food.foodType === "Veg",
      mealCategory: category,
    }
    if (primarySub) {
      setAdding(food.id)
      try {
        const hadOtherMealInCategory = (displayItems || []).some((i) => i.mealCategory === category && String(i.itemId) !== String(food.id))
        const initRes = await api.post(`/subscription/${primarySub._id}/items/init-add-payment`, { item: newItem })
        const pay = initRes?.data?.data
        if (!initRes?.data?.success) throw new Error(initRes?.data?.message || "Could not start checkout")

        if (!pay.paymentRequired) {
          setActiveSubscriptions((prev) => mergeServerSubscription(prev, pay.subscription))
          toast.success(`${hadOtherMealInCategory ? `Updated` : `Added to`} ${categoryMeta?.label}`)
          return
        }

        const { checkoutId, walletWillDebitRupees = 0, payOnlineRupees = 0, razorpay, razorpayOnlineOnly } = pay
        const companyName = await getCompanyNameAsync().catch(() => "Ziggybites")
        setPendingPayment({
          foodId: food.id,
          foodName: food.name,
          checkoutId,
          subId: primarySub._id,
          walletWillDebitRupees,
          payOnlineRupees,
          razorpay: razorpay?.key ? razorpay : null,
          razorpayOnlineOnly: razorpayOnlineOnly?.key ? razorpayOnlineOnly : null,
          hadOtherMealInCategory,
          companyName,
          prefill: {},
        })
      } catch (e) {
        toast.error(e?.response?.data?.message || "Failed to add food")
      } finally {
        setAdding(null)
      }
    } else {
      try {
        const draft = [...readSubscriptionDraftFromStorage(), newItem]
        writeSubscriptionDraftToStorage(draft)
        setDraftItems(draft)
        toast.success(`Added to ${categoryMeta?.label}`)
      } catch (e) {
        toast.error("Failed to add food")
      }
    }
  }

  const handleRemoveFood = async (foodId) => {
    if (primarySub) {
      setRemoving(foodId)
      try {
        const res = await api.patch(`/subscription/${primarySub._id}/items`, { action: "remove", itemId: foodId, mealCategory: category })
        setActiveSubscriptions((prev) => mergeServerSubscription(prev, res?.data?.data))
        toast.success("Removed from subscription")
      } catch (e) {
        toast.error(e?.response?.data?.message || "Failed to remove")
      } finally {
        setRemoving(null)
      }
    } else {
      const filtered = readSubscriptionDraftFromStorage().filter((i) => !(String(i.itemId) === String(foodId) && i.mealCategory === category))
      writeSubscriptionDraftToStorage(filtered)
      setDraftItems(filtered)
      toast.success("Removed from selection")
    }
  }

  if (!categoryMeta) return null

  return (
    <div className={`min-h-[100dvh] bg-[#F8F9FA] dark:bg-gray-950 flex flex-col ${pendingPayment ? "pb-52" : "pb-24"}`}>
      
      {/* Dynamic Header */}
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md transition-shadow border-b border-gray-100 dark:border-gray-800 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
        <div className="max-w-[480px] mx-auto flex items-center gap-3 px-6 py-4">
          <button
            onClick={() => navigate(fromEditMeal ? "/subscription/edit-meal" : "/subscription")}
            className="text-[#DC2626] transition-opacity hover:opacity-75 focus:outline-none"
          >
            <ArrowLeft className="w-5 h-5 stroke-[2.5]" />
          </button>
          <div className="flex items-center gap-2 text-[#DC2626]">
            {categoryMeta.Icon && <categoryMeta.Icon className="w-[22px] h-[22px]" />}
            <h1 className="text-[17px] font-[800] tracking-tight">{categoryMeta.label}</h1>
          </div>
        </div>
      </header>

      <div className="max-w-[480px] mx-auto w-full flex-1">
        
        {/* Curated Heading (List View Only) */}
        {!selectedRestaurant && (
          <div className="px-6 mt-8 mb-8 animate-in fade-in slide-in-from-bottom-2 duration-700">
            <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1.5 leading-none">CURATED COLLECTION</p>
            <h2 className="text-[36px] font-black leading-[1.05] text-gray-900 dark:text-white tracking-tight whitespace-pre-line">
              {categoryMeta.heading}
            </h2>
            <div className="h-1 w-10 bg-[#DC2626] mt-5 rounded-full" />
          </div>
        )}

        <div className="px-5">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-[#DC2626]" />
            </div>
          ) : selectedRestaurant ? (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="flex items-center gap-3 mb-6 mt-4 pl-1">
                <button
                  onClick={() => setSelectedRestaurant(null)}
                  className="h-10 w-10 flex items-center justify-center rounded-full bg-white shadow-sm border border-gray-100 text-[#DC2626] transition-transform active:scale-95"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <h2 className="text-2xl font-black text-gray-900 dark:text-white">{selectedRestaurant.name}</h2>
              </div>

              <div className="space-y-4">
                {selectedRestaurant.foods?.map((food) => {
                  const added = isAdded(food.id)
                  const isAdding = adding === food.id
                  const isRemoving = removing === food.id
                  return (
                    <div key={food.id} className="flex items-center gap-4 p-4 bg-white dark:bg-gray-900 rounded-[1.5rem] border border-gray-100 dark:border-gray-800 shadow-[0_4px_20px_-8px_rgba(0,0,0,0.06)]">
                      <div className="w-[4.5rem] h-[4.5rem] rounded-2xl overflow-hidden bg-gray-50 shrink-0">
                        <img src={food.image || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=100&q=80"} alt={food.name} className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0 pr-2">
                        <p className="font-bold text-gray-900 dark:text-white mb-1 leading-tight">{food.name}</p>
                        <p className="text-xs font-[800] text-gray-400">₹{(Number(food.price) || 0).toLocaleString("en-IN")}</p>
                      </div>
                      {added ? (
                        <div className="flex flex-col gap-1.5 items-end">
                           <span className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-600 text-[10px] font-bold uppercase tracking-widest"><Check className="w-3 h-3 stroke-[3]" /> Added</span>
                           <button onClick={() => handleRemoveFood(food.id)} disabled={isRemoving} className="text-[11px] font-bold text-red-500 hover:text-red-600 uppercase tracking-widest p-1">
                             {isRemoving ? "Removing..." : "Remove"}
                           </button>
                        </div>
                      ) : (
                        <button onClick={() => handleAddFood(food)} disabled={isAdding || pendingPayment} className="flex items-center gap-1.5 px-5 py-2.5 rounded-[12px] bg-red-50 text-[#DC2626] text-xs font-black uppercase tracking-widest hover:bg-red-100 disabled:opacity-50 transition-colors">
                          {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add"}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-4 pt-2">
              {restaurants.length === 0 ? (
                <div className="text-center py-16">
                  <Utensils className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <p className="font-bold text-gray-400 text-lg">No collections available.</p>
                </div>
              ) : (
                restaurants.map((r, index) => {
                  const isLarge = index < 3;
                  return (
                    <button
                      key={r.id}
                      onClick={() => setSelectedRestaurant(r)}
                      className={`w-full text-left transition-transform active:scale-[0.98] ${
                        isLarge 
                          ? 'flex flex-col rounded-[2rem] bg-white dark:bg-gray-900 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.1)] mb-6 overflow-hidden border border-gray-100 dark:border-gray-800' 
                          : 'flex items-center gap-4 p-[10px] rounded-[1.5rem] bg-white dark:bg-gray-800 mb-4 border border-gray-100 dark:border-gray-800 shadow-sm'
                      }`}
                    >
                      {isLarge ? (
                        <>
                          <div className="w-full h-52 sm:h-64 overflow-hidden bg-gray-100 dark:bg-gray-800 relative">
                            <img
                              src={r.image || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&q=80"}
                              alt={r.name}
                              className="w-full h-full object-cover transition-transform duration-700 hover:scale-105"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />
                          </div>
                          <div className="p-6 flex items-center justify-between bg-white dark:bg-gray-900">
                            <div>
                              <h3 className="text-[20px] font-black tracking-tight text-gray-900 dark:text-white mb-2">{r.name}</h3>
                              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-[0.1em] flex items-center gap-2">
                                <UtensilsCrossed className="w-3.5 h-3.5" />
                                {r.foods?.length || 0} items available
                              </p>
                            </div>
                            <div className="h-12 w-12 rounded-full bg-[#DC2626] flex items-center justify-center text-white shadow-lg shadow-red-500/30">
                              <ChevronRight className="w-5 h-5 stroke-[2.5] ml-0.5" />
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                           <div className="w-[4.5rem] h-[4.5rem] rounded-[1rem] overflow-hidden bg-gray-50 shrink-0 shadow-inner">
                             <img
                               src={r.image || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=200&q=80"}
                               alt={r.name}
                               className="w-full h-full object-cover"
                             />
                           </div>
                           <div className="flex-1 min-w-0 pr-2 py-1">
                             <h3 className="text-[15px] font-black text-gray-900 dark:text-white mb-1.5 truncate">{r.name}</h3>
                             <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                               HEALTHY BITES • {r.foods?.length || 0} ITEMS
                             </p>
                           </div>
                           <div className="mr-3 text-gray-300 dark:text-gray-600">
                              <ChevronRight className="w-5 h-5 stroke-[3]" />
                           </div>
                        </>
                      )}
                    </button>
                  )
                })
              )}
            </div>
          )}
        </div>
      </div>

      {/* Payment Sheet */}
      {pendingPayment && (
        <div className="fixed inset-x-0 bottom-0 z-[60] border-t border-gray-100 rounded-t-3xl dark:border-gray-800 bg-white dark:bg-gray-900 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] px-6 pt-6 pb-[max(2rem,env(safe-area-inset-bottom))] max-w-[480px] mx-auto w-full animate-in slide-in-from-bottom-full duration-300">
          <div className="flex items-start justify-between gap-3 mb-5">
            <div>
              <p className="text-xl font-black text-gray-900 dark:text-white mb-1">Complete Order</p>
              <p className="text-xs text-gray-500 font-bold tracking-wide">
                Pay to add <span className="text-gray-900 dark:text-white uppercase px-1">{pendingPayment.foodName}</span>
              </p>
            </div>
            <button
              onClick={handleDismissPendingPayment}
              disabled={payingCheckout}
              className="p-2.5 rounded-full bg-gray-50 text-gray-400 hover:text-gray-900 disabled:opacity-50"
            >
              <X className="w-5 h-5 stroke-[2.5]" />
            </button>
          </div>
          
          <ul className="space-y-3 mb-6 bg-gray-50 dark:bg-gray-800/50 p-4 rounded-2xl">
             {pendingPayment.walletWillDebitRupees > 0 && (
               <li className="flex items-center justify-between text-sm">
                 <div className="flex items-center gap-2 font-bold text-gray-600">
                   <Wallet className="w-4 h-4 text-emerald-500" /> Wallet Balance
                 </div>
                 <strong className="font-black text-emerald-600">₹{Number(pendingPayment.walletWillDebitRupees).toFixed(2)}</strong>
               </li>
             )}
             {pendingPayment.payOnlineRupees > 0 && (
               <li className="flex items-center justify-between text-sm">
                 <div className="flex items-center gap-2 font-bold text-gray-600">
                   <CreditCard className="w-4 h-4 text-[#DC2626]" /> Razorpay Source
                 </div>
                 <strong className="font-black text-gray-900">₹{Number(pendingPayment.payOnlineRupees).toFixed(2)}</strong>
               </li>
             )}
          </ul>
          
          <div className="flex flex-col gap-3">
            {pendingPayment.walletWillDebitRupees > 0 && !pendingPayment.razorpay ? (
              <button disabled={payingCheckout} onClick={handlePayFromWallet} className="w-full h-14 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm rounded-2xl shadow-lg shadow-emerald-600/20 active:scale-95 transition-transform flex items-center justify-center gap-2">
                {payingCheckout ? <Loader2 className="w-5 h-5 animate-spin" /> : "Pay from Wallet"}
              </button>
            ) : null}
            {(pendingPayment.razorpay || pendingPayment.razorpayOnlineOnly) && (
              <button disabled={payingCheckout} onClick={handlePayWithRazorpay} className="w-full h-14 bg-[#DC2626] hover:bg-[#B91C1C] text-white font-black text-sm rounded-2xl shadow-lg shadow-red-500/20 active:scale-95 transition-transform flex items-center justify-center gap-2">
                {payingCheckout ? <Loader2 className="w-5 h-5 animate-spin" /> : "Proceed to Razorpay"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
