import { useState, useEffect, useCallback, useMemo } from "react"
import { useParams, useNavigate, useLocation } from "react-router-dom"
import { ArrowLeft, Loader2, Plus, Minus, Utensils, Wallet, CreditCard, X } from "lucide-react"
import api from "@/lib/api"
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

const MEAL_EDIT_CUTOFF_MS = 24 * 60 * 60 * 1000
const FUTURE_EDIT_DAY_COUNT = 5

function mealCategoryFromDate(dateLike) {
  if (!dateLike) return "dinner"
  const d = new Date(dateLike)
  const h = d.getHours()
  if (h >= 5 && h <= 10) return "breakfast"
  if (h >= 11 && h <= 15) return "lunch"
  if (h >= 16 && h <= 18) return "snacks"
  return "dinner"
}

function formatTargetLabel(order) {
  if (!order?.scheduledMealAt) return "Upcoming delivery"
  const scheduledAt = new Date(order.scheduledMealAt)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfDate = new Date(scheduledAt.getFullYear(), scheduledAt.getMonth(), scheduledAt.getDate())
  const diffDays = Math.round((startOfDate.getTime() - startOfToday.getTime()) / MEAL_EDIT_CUTOFF_MS)
  const dayLabel =
    diffDays === 0
      ? "Today"
      : diffDays === 1
        ? "Tomorrow"
        : scheduledAt.toLocaleDateString("en-IN", {
            weekday: "short",
            day: "numeric",
            month: "short",
          })
  const timeLabel = scheduledAt.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
  return `${dayLabel} • ${timeLabel}`
}

export default function SubscriptionFoodBrowse() {
  const { category } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const fromEditMeal = location.state?.fromEditMeal
  const fromManage = location.state?.fromManage
  const chooseMealsFirstTime = Boolean(location.state?.chooseMealsFirstTime)
  const [restaurants, setRestaurants] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(null)
  const [removing, setRemoving] = useState(null)
  const [activeSubscriptions, setActiveSubscriptions] = useState([])
  const [upcomingOrders, setUpcomingOrders] = useState([])
  const [draftItems, setDraftItems] = useState(() => readSubscriptionDraftFromStorage())
  const [selectedQuantities, setSelectedQuantities] = useState({})
  const [pendingPayment, setPendingPayment] = useState(null)
  const [payingCheckout, setPayingCheckout] = useState(false)
  const [selectedTarget, setSelectedTarget] = useState("default")

  const categoryMeta = MEAL_CATEGORIES.find((c) => c.id === category)
  const primarySub = activeSubscriptions.find((s) => s.status === "active") || activeSubscriptions[0] || null
  const foods = useMemo(
    () =>
      restaurants.flatMap((restaurant) =>
        (restaurant.foods || [])
          .filter((food) => food?.id && food?.name)
          .map((food) => ({
            ...food,
            image: food.image || food.food_image || food.images?.[0] || "",
            restaurantId: restaurant.id,
            restaurantName: restaurant.name,
          })),
      ),
    [restaurants],
  )
  const editableUpcomingOrders = useMemo(
    () =>
      (upcomingOrders || [])
        .filter((order) => order?.source?.type === "subscription" && order?.scheduledMealAt)
        .filter((order) => mealCategoryFromDate(order.scheduledMealAt) === category)
        .filter((order) => {
          const scheduledMs = new Date(order.scheduledMealAt).getTime()
          return Number.isFinite(scheduledMs) && scheduledMs > Date.now()
        })
        .sort((a, b) => new Date(a.scheduledMealAt).getTime() - new Date(b.scheduledMealAt).getTime())
        .slice(0, FUTURE_EDIT_DAY_COUNT),
    [upcomingOrders, category],
  )
  const selectedOrder = useMemo(() => {
    if (!selectedTarget || selectedTarget === "default") return null
    return editableUpcomingOrders.find((order) => String(order._id) === String(selectedTarget)) || null
  }, [editableUpcomingOrders, selectedTarget])
  const isSelectedOrderLocked = useMemo(() => {
    if (!selectedOrder?.scheduledMealAt) return false
    const scheduledMs = new Date(selectedOrder.scheduledMealAt).getTime()
    if (!Number.isFinite(scheduledMs)) return false
    return scheduledMs - Date.now() <= MEAL_EDIT_CUTOFF_MS
  }, [selectedOrder])
  const displayItems = selectedOrder?.items || (primarySub?.items ? primarySub.items : draftItems)
  const topDropdownOptions = useMemo(() => {
    const futureOption = {
      value: "default",
      label: `Future ${categoryMeta?.label || "meal"} plan`,
    }
    const orderOptions = editableUpcomingOrders.map((order) => {
      const locked = new Date(order.scheduledMealAt).getTime() - Date.now() <= MEAL_EDIT_CUTOFF_MS
      return {
        value: String(order._id),
        label: `${formatTargetLabel(order)}${locked ? " (Locked)" : ""}`,
      }
    })
    return [futureOption, ...orderOptions]
  }, [editableUpcomingOrders, categoryMeta])

  const handleBack = () => {
    if (fromManage) {
      navigate("/subscription/manage")
      return
    }

    if (fromEditMeal) {
      navigate("/subscription/edit-meal", {
        state: { fromBrowse: true, mealSetupFirst: chooseMealsFirstTime },
      })
      return
    }

    navigate("/subscription", { state: { skipMealRedirect: true } })
  }

  const clampQty = (value) => Math.max(1, Math.min(10, Number(value) || 1))
  const getFoodQty = (foodId, fallback = 1) => clampQty(selectedQuantities[String(foodId)] ?? fallback)
  const handleDecreaseOrRemove = async (foodId, currentQty) => {
    if (currentQty <= 1) {
      await handleRemoveFood(foodId)
      return
    }
    const food = foods.find((item) => String(item.id) === String(foodId))
    if (!food) return
    await handleChangeAddedFoodQty(food, currentQty - 1)
  }

  useEffect(() => {
    if (!category || !["breakfast", "lunch", "snacks", "dinner"].includes(category)) {
      navigate("/subscription")
      return
    }

    const fetchData = async () => {
      setLoading(true)
      try {
        const [foodsRes, activeRes, ordersRes] = await Promise.all([
          api.get("/restaurant/foods", { params: { category } }).catch((e) => {
            console.warn("Foods API error:", e?.response?.status, e?.message)
            return { data: { success: false } }
          }),
          api.get("/subscription/active").catch(() => ({ data: { success: false, data: [] } })),
          api.get("/order", { params: { limit: 100, page: 1 } }).catch(() => ({ data: { success: false, data: { orders: [] } } })),
        ])
        const restaurantsData = foodsRes?.data?.data?.restaurants ?? foodsRes?.data?.restaurants ?? []
        setRestaurants(Array.isArray(restaurantsData) ? restaurantsData : [])
        if (activeRes?.data?.success && Array.isArray(activeRes.data.data)) {
          setActiveSubscriptions(activeRes.data.data)
        } else {
          setActiveSubscriptions([])
        }
        const ordersData = ordersRes?.data?.data?.orders || []
        setUpcomingOrders(Array.isArray(ordersData) ? ordersData : [])
        setDraftItems(readSubscriptionDraftFromStorage())
      } catch (e) {
        toast.error("Failed to load foods")
        setRestaurants([])
        setUpcomingOrders([])
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

  useEffect(() => {
    if (selectedTarget === "default") return
    const exists = editableUpcomingOrders.some((order) => String(order._id) === String(selectedTarget))
    if (!exists) {
      setSelectedTarget("default")
    }
  }, [editableUpcomingOrders, selectedTarget])

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
      toast.success(`Saved ${pendingPayment.foodName} (Qty ${pendingPayment.quantity || 1})`)
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
      description: `Subscription meal - ${categoryMeta?.label}`,
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
          toast.success(`Saved ${p.foodName} (Qty ${p.quantity || 1})`)
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

  const saveSelectedOrderItems = useCallback(async (nextItems, successMessage) => {
    if (!selectedOrder?._id) return false
    if (isSelectedOrderLocked) {
      toast.error("This delivery is locked within 24 hours and cannot be modified.")
      return false
    }
    if (!Array.isArray(nextItems) || nextItems.length === 0) {
      toast.error("Choose another meal before removing the last item for this delivery.")
      return false
    }

    const payloadItems = nextItems.map((item) => ({
      itemId: item.itemId || item.id,
      name: item.name,
      price: Number(item.price) || 0,
      quantity: Number(item.quantity) || 1,
      image: item.image,
      description: item.description,
      isVeg: item.isVeg !== false,
      selectedVariation: item.selectedVariation,
      subCategory: item.subCategory || "",
    }))

    const res = await api.post(`/order/change-meal/${selectedOrder._id}`, {
      items: payloadItems,
    })
    const updatedOrder = res?.data?.data?.order
    if (updatedOrder?._id) {
      setUpcomingOrders((prev) =>
        prev.map((order) => (String(order._id) === String(updatedOrder._id) ? { ...order, ...updatedOrder } : order)),
      )
    }
    if (successMessage) {
      toast.success(successMessage)
    }
    return true
  }, [isSelectedOrderLocked, selectedOrder])

  const handleAddFood = async (food, quantityOverride) => {
    const quantity = clampQty(quantityOverride ?? selectedQuantities[String(food.id)] ?? 1)
    const newItem = {
      itemId: food.id,
      name: food.name,
      price: food.price,
      quantity,
      image: food.image,
      isVeg: food.foodType === "Veg",
      mealCategory: category,
      restaurantId: food.restaurantId || "",
      restaurantName: food.restaurantName || "",
    }
    if (selectedOrder) {
      setAdding(food.id)
      try {
        const existingItems = Array.isArray(selectedOrder.items) ? selectedOrder.items : []
        const updatedItems = existingItems.some((item) => String(item.itemId) === String(newItem.itemId))
          ? existingItems.map((item) =>
              String(item.itemId) === String(newItem.itemId)
                ? { ...item, ...newItem, itemId: newItem.itemId, quantity }
                : item,
            )
          : [...existingItems, newItem]
        const saved = await saveSelectedOrderItems(updatedItems, `Saved ${food.name} for ${formatTargetLabel(selectedOrder)}`)
        if (saved) {
          setSelectedQuantities((prev) => ({ ...prev, [String(food.id)]: quantity }))
        }
      } catch (e) {
        toast.error(e?.response?.data?.message || "Failed to update this delivery")
      } finally {
        setAdding(null)
      }
      return
    }
    if (primarySub) {
      setAdding(food.id)
      try {
        const initRes = await api.post(`/subscription/${primarySub._id}/items/init-add-payment`, { item: newItem })
        const pay = initRes?.data?.data
        if (!initRes?.data?.success) throw new Error(initRes?.data?.message || "Could not start checkout")

        if (!pay.paymentRequired) {
          setActiveSubscriptions((prev) => mergeServerSubscription(prev, pay.subscription))
          setSelectedQuantities((prev) => ({ ...prev, [String(food.id)]: quantity }))
          toast.success(`Saved ${food.name} (Qty ${quantity})`)
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
          quantity,
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
        const existing = readSubscriptionDraftFromStorage()
        const draft = existing.some(
          (i) => String(i.itemId) === String(newItem.itemId) && i.mealCategory === category,
        )
          ? existing.map((i) =>
              String(i.itemId) === String(newItem.itemId) && i.mealCategory === category ? { ...i, ...newItem } : i,
            )
          : [...existing, newItem]
        writeSubscriptionDraftToStorage(draft)
        setDraftItems(draft)
        setSelectedQuantities((prev) => ({ ...prev, [String(food.id)]: quantity }))
        toast.success(`Saved ${food.name} (Qty ${quantity})`)
      } catch (e) {
        toast.error("Failed to add food")
      }
    }
  }

  const handleChangeAddedFoodQty = async (food, nextQty) => {
    const quantity = clampQty(nextQty)

    if (selectedOrder) {
      setAdding(food.id)
      try {
        const existingItems = Array.isArray(selectedOrder.items) ? selectedOrder.items : []
        const updatedItems = existingItems.map((item) =>
          String(item.itemId) === String(food.id)
            ? { ...item, quantity }
            : item,
        )
        const saved = await saveSelectedOrderItems(updatedItems, `Updated ${food.name} for ${formatTargetLabel(selectedOrder)}`)
        if (saved) {
          setSelectedQuantities((prev) => ({ ...prev, [String(food.id)]: quantity }))
        }
      } catch (e) {
        toast.error(e?.response?.data?.message || "Failed to update quantity")
      } finally {
        setAdding(null)
      }
      return
    }

    if (primarySub) {
      await handleAddFood(food, quantity)
      return
    }

    try {
      const updatedDraft = readSubscriptionDraftFromStorage().map((item) =>
        String(item.itemId) === String(food.id) && item.mealCategory === category
          ? { ...item, quantity }
          : item,
      )
      writeSubscriptionDraftToStorage(updatedDraft)
      setDraftItems(updatedDraft)
      setSelectedQuantities((prev) => ({ ...prev, [String(food.id)]: quantity }))
      toast.success(`Saved ${food.name} (Qty ${quantity})`)
    } catch (e) {
      toast.error("Failed to update quantity")
    }
  }

  const handleRemoveFood = async (foodId) => {
    if (selectedOrder) {
      setRemoving(foodId)
      try {
        const existingItems = Array.isArray(selectedOrder.items) ? selectedOrder.items : []
        const updatedItems = existingItems.filter((item) => String(item.itemId) !== String(foodId))
        await saveSelectedOrderItems(updatedItems, `Updated ${formatTargetLabel(selectedOrder)}`)
      } catch (e) {
        toast.error(e?.response?.data?.message || "Failed to remove")
      } finally {
        setRemoving(null)
      }
      return
    }
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
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md transition-shadow border-b border-gray-100 dark:border-gray-800 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
        <div className="max-w-[480px] mx-auto flex items-center gap-3 px-6 py-4">
          <button
            onClick={handleBack}
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
        <div className="px-6 mt-8 mb-8">
          <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1.5 leading-none">CURATED COLLECTION</p>
          <h2 className="text-[36px] font-black leading-[1.05] text-gray-900 dark:text-white tracking-tight whitespace-pre-line">
            {categoryMeta.heading}
          </h2>
          <div className="h-1 w-10 bg-[#DC2626] mt-5 rounded-full" />
        </div>

        {(fromManage || primarySub) && (
          <div className="px-5 mb-6">
            <div className="bg-white dark:bg-gray-900 rounded-[1.65rem] border border-gray-100 dark:border-gray-800 shadow-[0_6px_24px_-12px_rgba(0,0,0,0.08)] p-4">
              <label htmlFor="subscription-edit-target" className="block text-[10px] font-black text-gray-500 uppercase tracking-[0.18em] mb-2">
                Edit Target
              </label>
              <select
                id="subscription-edit-target"
                value={selectedTarget}
                onChange={(e) => setSelectedTarget(e.target.value)}
                className="w-full h-12 rounded-2xl border border-gray-200 dark:border-gray-700 bg-[#F8F9FA] dark:bg-gray-800 px-4 text-sm font-semibold text-gray-900 dark:text-white outline-none"
              >
                {topDropdownOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                {selectedOrder
                  ? isSelectedOrderLocked
                    ? "This delivery is locked because it is within 24 hours of the scheduled time."
                    : `Changes now apply only to ${formatTargetLabel(selectedOrder)}.`
                  : `Changes apply to future ${categoryMeta.label.toLowerCase()} deliveries in your subscription plan.`}
              </p>
            </div>
          </div>
        )}

        <div className="px-5">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-[#DC2626]" />
            </div>
          ) : (
            <div className="space-y-4 pt-2">
              {foods.length === 0 ? (
                <div className="text-center py-16">
                  <Utensils className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <p className="font-bold text-gray-400 text-lg">No foods available.</p>
                </div>
              ) : (
                foods.map((food) => {
                  const selectedItem = (displayItems || []).find(
                    (i) => String(i.itemId) === String(food.id) && (selectedOrder || i.mealCategory === category),
                  )
                  const added = Boolean(selectedItem)
                  const isAdding = adding === food.id
                  const isRemoving = removing === food.id
                  const qty = getFoodQty(food.id, Number(selectedItem?.quantity) || 1)
                  const orderLocked = Boolean(selectedOrder && isSelectedOrderLocked)

                  return (
                    <div key={`${food.restaurantId || "restaurant"}-${food.id}`} className="flex items-center gap-4 p-4 bg-white dark:bg-gray-900 rounded-[1.65rem] border border-gray-100 dark:border-gray-800 shadow-[0_6px_24px_-12px_rgba(0,0,0,0.08)]">
                      <div className="w-[5.5rem] h-[5.5rem] rounded-[1.4rem] overflow-hidden bg-gray-50 shrink-0 ring-1 ring-black/5 shadow-sm flex items-center justify-center">
                        {food.image ? (
                          <img src={food.image} alt={food.name} className="w-full h-full object-cover" />
                        ) : (
                          <Utensils className="w-7 h-7 text-gray-300" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[1.08rem] font-semibold text-gray-900 dark:text-white leading-tight truncate">{food.name}</p>
                        <p className="text-sm font-light text-gray-500 mt-1">{"\u20B9"}{(Number(food.price) || 0).toLocaleString("en-IN")}</p>
                      </div>
                      {!added && (
                        <div className="flex flex-col items-end gap-2">
                          <button
                            onClick={() => handleAddFood(food, qty)}
                            disabled={isAdding || pendingPayment || orderLocked}
                            className="h-9 min-w-[4.75rem] px-4 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold uppercase tracking-[0.12em] disabled:opacity-50 transition-colors"
                          >
                            {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add"}
                          </button>
                        </div>
                      )}
                      {added && (
                        <div className="flex flex-col items-end gap-2">
                          <div className="inline-flex items-center rounded-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/70">
                            <button
                              onClick={() => handleDecreaseOrRemove(food.id, qty)}
                              disabled={isAdding || pendingPayment || isRemoving || orderLocked}
                              className="h-9 w-9 flex items-center justify-center text-gray-600 disabled:opacity-40"
                              aria-label="Decrease quantity"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="min-w-8 text-center text-sm font-medium text-gray-900 dark:text-white">{qty}</span>
                            <button
                              onClick={() => handleChangeAddedFoodQty(food, qty + 1)}
                              disabled={isAdding || pendingPayment || qty >= 10 || orderLocked}
                              className="h-9 w-9 flex items-center justify-center text-gray-600 disabled:opacity-40"
                              aria-label="Increase quantity"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          )}
        </div>
      </div>

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
                <strong className="font-black text-emerald-600">{"\u20B9"}{Number(pendingPayment.walletWillDebitRupees).toFixed(2)}</strong>
              </li>
            )}
            {pendingPayment.payOnlineRupees > 0 && (
              <li className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 font-bold text-gray-600">
                  <CreditCard className="w-4 h-4 text-[#DC2626]" /> Razorpay Source
                </div>
                <strong className="font-black text-gray-900">{"\u20B9"}{Number(pendingPayment.payOnlineRupees).toFixed(2)}</strong>
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
