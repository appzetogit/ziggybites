import { useEffect, useState, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, ChefHat, Loader2, Lock, Clock, UtensilsCrossed } from "lucide-react"
import { restaurantAPI } from "@/lib/api"
import { toast } from "sonner"

export default function SubscriptionPrepPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const res = await restaurantAPI.getSubscriptionPrepToday()
      if (res.data?.success && res.data?.data) {
        setData(res.data.data)
      } else {
        setData(null)
      }
    } catch (e) {
      console.error(e)
      toast.error(e.response?.data?.message || "Failed to load subscription prep")
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const prepEntries = data?.prepSummary
    ? Object.entries(data.prepSummary).sort((a, b) => b[1] - a[1])
    : []

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <header className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate("/restaurant/explore")}
          className="p-2 rounded-lg hover:bg-slate-100"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5 text-slate-800" />
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <ChefHat className="w-6 h-6 text-orange-600 shrink-0" />
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-slate-900 truncate">Food subscription</h1>
            <p className="text-xs text-slate-500 truncate">Today&apos;s prep · meals unlock after change window</p>
          </div>
        </div>
      </header>

      <div className="p-4 max-w-lg mx-auto space-y-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
            <p className="text-sm text-slate-600">Loading today&apos;s subscription orders…</p>
          </div>
        ) : !data ? (
          <p className="text-center text-slate-600 py-8">No data</p>
        ) : (
          <>
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <p className="text-sm text-slate-600">
                <span className="font-semibold text-slate-900">{data.date}</span>
                {" · "}
                <span>{data.orderCount} subscription order{data.orderCount !== 1 ? "s" : ""}</span>
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Dish names appear only after the customer&apos;s 30-minute meal-change period ends, so you prepare the final choice.
              </p>
            </div>

            {prepEntries.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                <h2 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                  <UtensilsCrossed className="w-4 h-4 text-green-600" />
                  Totals to prepare (unlocked)
                </h2>
                <ul className="space-y-2">
                  {prepEntries.map(([name, qty]) => (
                    <li
                      key={name}
                      className="flex justify-between items-center text-sm border-b border-slate-100 last:border-0 pb-2 last:pb-0"
                    >
                      <span className="text-slate-800 pr-2">{name}</span>
                      <span className="font-semibold text-slate-900 tabular-nums">×{qty}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="space-y-3">
              <h2 className="text-sm font-bold text-slate-900 px-1">Orders</h2>
              {data.orders?.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-8 bg-white rounded-xl border border-dashed border-slate-200">
                  No subscription deliveries scheduled for today.
                </p>
              ) : (
                data.orders.map((o) => (
                  <div
                    key={o._id}
                    className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm"
                  >
                    <div className="flex justify-between items-start gap-2 mb-2">
                      <span className="font-mono text-sm font-semibold text-slate-900">{o.orderId}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                        {o.preparationStatus || "pending"}
                      </span>
                    </div>
                    {o.scheduledMealAt && (
                      <p className="text-xs text-slate-500 flex items-center gap-1 mb-2">
                        <Clock className="w-3.5 h-3.5" />
                        Slot: {new Date(o.scheduledMealAt).toLocaleString()}
                      </p>
                    )}
                    {!o.mealDetailsVisible ? (
                      <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200 p-3 flex gap-2">
                        <Lock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-amber-900">Meal not visible yet</p>
                          <p className="text-xs text-amber-800 mt-0.5">
                            {o.hint || o.userMessage || "Customer may still change the dish."}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <ul className="mt-2 space-y-1.5">
                        {o.items?.map((it) => (
                          <li key={`${it.itemId}-${it.name}`} className="text-sm text-slate-800 flex justify-between">
                            <span>{it.name}</span>
                            <span className="text-slate-600 tabular-nums">×{it.quantity}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
