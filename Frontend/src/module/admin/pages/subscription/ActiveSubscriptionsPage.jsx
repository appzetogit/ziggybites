import { useState, useEffect } from "react"
import { Users, Loader2, Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import api from "@/lib/api"

/**
 * ZigZagLite – Admin: Active Subscriptions list.
 * View renewals, filter by status/date.
 */
export default function ActiveSubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")

  useEffect(() => {
    const fetchSubscriptions = async () => {
      try {
        setLoading(true)
        // If no admin token yet, skip API call and just show empty state
        const token = localStorage.getItem("admin_accessToken")
        if (!token) {
          setSubscriptions([])
          return
        }

        const res = await api.get("/subscription/active").catch(() => null)
        if (res?.data?.success && Array.isArray(res.data.data)) {
          setSubscriptions(res.data.data)
        } else {
          setSubscriptions([])
        }
      } catch {
        setSubscriptions([])
      } finally {
        setLoading(false)
      }
    }
    fetchSubscriptions()
  }, [])

  const filtered = subscriptions.filter(
    (s) =>
      !search ||
      (s.userName || "").toLowerCase().includes(search.toLowerCase()) ||
      (s.userEmail || "").toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-4 lg:p-6 bg-slate-50 dark:bg-[#0a0a0a] min-h-screen">
      <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-xl lg:text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Users className="h-6 w-6 text-[#DC2626]" />
          Active Subscriptions
        </h1>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>
      <p className="text-slate-600 dark:text-slate-400 mb-6">
        View and manage active meal subscriptions. Renewals and filters can be wired to backend when ready.
      </p>
      {loading ? (
        <div className="flex items-center justify-center min-h-[300px]">
          <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border border-slate-200 dark:border-slate-800">
          <CardContent className="py-12 text-center text-slate-500 dark:text-slate-400">
            No active subscriptions to show. Data will appear when users subscribe.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((sub, index) => (
            <Card key={sub._id || index} className="border border-slate-200 dark:border-slate-800">
              <CardContent className="p-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-slate-900 dark:text-white">{sub.userName || "—"}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{sub.userEmail || sub.planName || "—"}</p>
                </div>
                <div className="text-sm text-slate-600 dark:text-slate-300 flex flex-wrap items-center gap-2">
                  {sub.status && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        sub.status === "paused"
                          ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                          : sub.status === "active"
                            ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200"
                            : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                      }`}
                    >
                      {sub.status}
                    </span>
                  )}
                  {sub.planName && <span>{sub.planName}</span>}
                  {sub.nextDeliveryAt && (
                    <span>· Next meal: {new Date(sub.nextDeliveryAt).toLocaleString()}</span>
                  )}
                  {sub.nextBillingDate && (
                    <span className="ml-2">· Next: {new Date(sub.nextBillingDate).toLocaleDateString()}</span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
