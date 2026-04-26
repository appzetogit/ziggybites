import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  CalendarClock,
  Download,
  Eye,
  Loader2,
  RefreshCw,
  Search,
  Timer,
  Truck,
  Users,
  WalletCards,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import api from "@/lib/api"

function formatDate(value, withTime = false) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return withTime ? date.toLocaleString("en-IN") : date.toLocaleDateString("en-IN")
}

function statusClass(status) {
  if (status === "active") return "bg-green-100 text-green-700"
  if (status === "paused") return "bg-amber-100 text-amber-700"
  return "bg-slate-100 text-slate-700"
}

function getAddressLabel(address) {
  if (!address) return "-"
  return address.formattedAddress || [address.street, address.city, address.state, address.zipCode].filter(Boolean).join(", ") || "-"
}

function escapeCsv(value) {
  const text = value == null ? "" : String(value)
  return `"${text.replaceAll('"', '""')}"`
}

function MetricCard({ title, value, helper, icon: Icon, tone }) {
  return (
    <Card className="border border-slate-200 bg-white shadow-sm">
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
          {helper ? <p className="mt-1 text-xs text-slate-500">{helper}</p> : null}
        </div>
        <div className={`rounded-lg p-3 ${tone}`}>
          <Icon className="h-6 w-6" />
        </div>
      </CardContent>
    </Card>
  )
}

export default function ActiveSubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [sourceFilter, setSourceFilter] = useState("all")
  const [planFilter, setPlanFilter] = useState("all")
  const [selectedSub, setSelectedSub] = useState(null)
  const hasLoadedRef = useRef(false)
  const inFlightRef = useRef(false)

  const fetchSubscriptions = useCallback(async ({ silent = false } = {}) => {
    if (inFlightRef.current) return

    try {
      inFlightRef.current = true
      setLoading(true)
      const token = localStorage.getItem("admin_accessToken")
      if (!token) {
        setSubscriptions([])
        return
      }

      const res = await api
        .get("/admin/subscriptions", { suppressErrorToast: silent })
        .catch(() => null)
      if (res?.data?.success && Array.isArray(res.data.data)) {
        const sortedSubscriptions = [...res.data.data].sort((a, b) => {
          const aTime = new Date(a?.createdAt || a?.startDate || 0).getTime()
          const bTime = new Date(b?.createdAt || b?.startDate || 0).getTime()
          return bTime - aTime
        })
        setSubscriptions(sortedSubscriptions)
      } else {
        setSubscriptions([])
      }
    } catch {
      setSubscriptions([])
    } finally {
      inFlightRef.current = false
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (hasLoadedRef.current) return
    hasLoadedRef.current = true
    fetchSubscriptions({ silent: true })
  }, [fetchSubscriptions])

  const planOptions = useMemo(() => {
    return [...new Set(subscriptions.map((sub) => sub.planName).filter(Boolean))].sort()
  }, [subscriptions])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return subscriptions.filter((sub) => {
      const matchesSearch =
        !q ||
        [sub.userName, sub.userEmail, sub.userPhone, sub.phoneNumber, sub.planName, sub.restaurantName]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(q))
      const matchesStatus = statusFilter === "all" || sub.status === statusFilter
      const matchesSource = sourceFilter === "all" || sub.source === sourceFilter
      const matchesPlan = planFilter === "all" || sub.planName === planFilter
      return matchesSearch && matchesStatus && matchesSource && matchesPlan
    })
  }, [subscriptions, search, statusFilter, sourceFilter, planFilter])

  const stats = useMemo(() => {
    const active = subscriptions.filter((sub) => sub.status === "active").length
    const paused = subscriptions.filter((sub) => sub.status === "paused").length
    const meal = subscriptions.filter((sub) => sub.source === "meal").length
    const planOnly = subscriptions.filter((sub) => sub.source === "plan").length
    const remainingMeals = subscriptions.reduce((sum, sub) => sum + (Number(sub.remainingMeals) || 0), 0)
    const expiringSoon = subscriptions.filter((sub) => {
      const days = Number(sub.remainingDays)
      return Number.isFinite(days) && days <= 7
    }).length
    return { active, paused, meal, planOnly, remainingMeals, expiringSoon }
  }, [subscriptions])

  const exportCsv = () => {
    const headers = [
      "Customer",
      "Email",
      "Phone",
      "Status",
      "Plan",
      "Source",
      "Restaurant",
      "Days Left",
      "Meals Left",
      "Next Delivery",
      "End Date",
      "Auto Pay",
    ]
    const rows = filtered.map((sub) => [
      sub.userName,
      sub.userEmail,
      sub.userPhone || sub.phoneNumber,
      sub.status,
      sub.planName,
      sub.source,
      sub.restaurantName,
      sub.remainingDays,
      sub.remainingMeals,
      formatDate(sub.nextDeliveryAt, true),
      formatDate(sub.endDate),
      sub.autoPayEnabled ? "Yes" : "No",
    ])
    const csv = [headers, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `active-subscriptions-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-950">
            <Users className="h-6 w-6 text-red-600" />
            Active Subscriptions
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Monitor paid access, meal deliveries, pauses, renewal windows, and subscriber details.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={fetchSubscriptions} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button onClick={exportCsv} disabled={!filtered.length}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Active" value={stats.active} helper={`${stats.paused} paused`} icon={Users} tone="bg-green-50 text-green-600" />
        <MetricCard title="Meal Subs" value={stats.meal} helper={`${stats.planOnly} plan-only`} icon={Truck} tone="bg-red-50 text-red-600" />
        <MetricCard title="Meals Left" value={stats.remainingMeals.toLocaleString("en-IN")} helper="Across visible plans" icon={WalletCards} tone="bg-blue-50 text-blue-600" />
        <MetricCard title="Expiring Soon" value={stats.expiringSoon} helper="7 days or less" icon={Timer} tone="bg-amber-50 text-amber-600" />
      </div>

      <Card className="mb-6 border border-slate-200 bg-white shadow-sm">
        <CardContent className="grid gap-3 p-4 md:grid-cols-[1fr_160px_160px_180px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search customer, phone, plan or restaurant"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-9"
            />
          </div>
          <select className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All status</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
          </select>
          <select className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm" value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
            <option value="all">All access</option>
            <option value="meal">Meal delivery</option>
            <option value="plan">Plan only</option>
          </select>
          <select className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm" value={planFilter} onChange={(event) => setPlanFilter(event.target.value)}>
            <option value="all">All plans</option>
            {planOptions.map((plan) => (
              <option key={plan} value={plan}>{plan}</option>
            ))}
          </select>
        </CardContent>
      </Card>

      <Card className="border border-slate-200 bg-white shadow-sm">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex min-h-[300px] items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-slate-500">No active subscriptions to show.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead>Customer</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Access</TableHead>
                    <TableHead>Restaurant</TableHead>
                    <TableHead>Remaining</TableHead>
                    <TableHead>Next Delivery</TableHead>
                    <TableHead>Ends</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((sub, index) => (
                    <TableRow key={sub._id || index}>
                      <TableCell>
                        <div className="font-medium text-slate-950">{sub.userName || "Unknown user"}</div>
                        <div className="text-xs text-slate-500">{sub.userEmail || sub.userPhone || sub.phoneNumber || "-"}</div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-slate-900">{sub.planName || "-"}</div>
                        <div className="text-xs text-slate-500">{sub.autoPayEnabled ? "Auto-pay on" : "Manual renewal"}</div>
                      </TableCell>
                      <TableCell>
                        <span className={`rounded-full px-2 py-1 text-xs font-semibold capitalize ${statusClass(sub.status)}`}>
                          {sub.status || "-"}
                        </span>
                      </TableCell>
                      <TableCell className="capitalize">{sub.source === "meal" ? "Meal delivery" : "Plan only"}</TableCell>
                      <TableCell>{sub.restaurantName || "-"}</TableCell>
                      <TableCell>
                        <div>{sub.remainingDays ?? "-"} days</div>
                        <div className="text-xs text-slate-500">{sub.remainingMeals ?? "-"} meals</div>
                      </TableCell>
                      <TableCell>{formatDate(sub.nextDeliveryAt, true)}</TableCell>
                      <TableCell>{formatDate(sub.endDate)}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" onClick={() => setSelectedSub(sub)}>
                          <Eye className="mr-2 h-4 w-4" />
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedSub} onOpenChange={(open) => !open && setSelectedSub(null)}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto bg-white p-0">
          <DialogHeader className="border-b border-slate-200 px-6 py-5">
            <DialogTitle className="text-xl font-bold text-slate-950">Subscription Details</DialogTitle>
          </DialogHeader>
          {selectedSub ? (
            <div className="space-y-6 p-6">
              <div className="grid gap-4 md:grid-cols-3">
                <MetricCard title="Plan" value={selectedSub.planName || "-"} helper={selectedSub.source === "meal" ? "Meal delivery" : "Plan only"} icon={CalendarClock} tone="bg-red-50 text-red-600" />
                <MetricCard title="Days Left" value={selectedSub.remainingDays ?? "-"} helper={`Ends ${formatDate(selectedSub.endDate)}`} icon={Timer} tone="bg-amber-50 text-amber-600" />
                <MetricCard title="Meals Left" value={selectedSub.remainingMeals ?? "-"} helper={`${selectedSub.itemsCount || 0} selected meals`} icon={Truck} tone="bg-blue-50 text-blue-600" />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <section className="rounded-lg border border-slate-200 p-4">
                  <h3 className="mb-3 font-semibold text-slate-950">Customer</h3>
                  <div className="space-y-2 text-sm text-slate-600">
                    <p><span className="font-medium text-slate-900">Name:</span> {selectedSub.userName || "-"}</p>
                    <p><span className="font-medium text-slate-900">Email:</span> {selectedSub.userEmail || "-"}</p>
                    <p><span className="font-medium text-slate-900">Phone:</span> {selectedSub.userPhone || selectedSub.phoneNumber || "-"}</p>
                    <p><span className="font-medium text-slate-900">Delivery phone:</span> {selectedSub.phoneNumber || "-"}</p>
                  </div>
                </section>
                <section className="rounded-lg border border-slate-200 p-4">
                  <h3 className="mb-3 font-semibold text-slate-950">Access</h3>
                  <div className="space-y-2 text-sm text-slate-600">
                    <p><span className="font-medium text-slate-900">Status:</span> {selectedSub.status || "-"}</p>
                    <p><span className="font-medium text-slate-900">Auto-pay:</span> {selectedSub.autoPayEnabled ? "Enabled" : "Disabled"}</p>
                    <p><span className="font-medium text-slate-900">Start:</span> {formatDate(selectedSub.startDate)}</p>
                    <p><span className="font-medium text-slate-900">Next delivery:</span> {formatDate(selectedSub.nextDeliveryAt, true)}</p>
                  </div>
                </section>
              </div>

              <section className="rounded-lg border border-slate-200 p-4">
                <h3 className="mb-3 font-semibold text-slate-950">Delivery</h3>
                <div className="grid gap-3 text-sm text-slate-600 md:grid-cols-2">
                  <p><span className="font-medium text-slate-900">Restaurant:</span> {selectedSub.restaurantName || "-"}</p>
                  <p><span className="font-medium text-slate-900">Slot:</span> {selectedSub.deliverySlot || "-"}</p>
                  <p className="md:col-span-2"><span className="font-medium text-slate-900">Address:</span> {getAddressLabel(selectedSub.address)}</p>
                  <p className="md:col-span-2"><span className="font-medium text-slate-900">Instructions:</span> {selectedSub.specialCookingInstructions || "-"}</p>
                </div>
              </section>

              <section className="rounded-lg border border-slate-200 p-4">
                <h3 className="mb-3 font-semibold text-slate-950">Selected Meals</h3>
                {selectedSub.items?.length ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    {selectedSub.items.map((item, index) => (
                      <div key={`${item.itemId || item.name}-${index}`} className="rounded-lg bg-slate-50 p-3 text-sm">
                        <p className="font-semibold text-slate-950">{item.name || "Meal item"}</p>
                        <p className="text-slate-500">{item.mealCategory || "Meal"} · Qty {item.quantity || 1} · Rs. {Number(item.price || 0).toLocaleString("en-IN")}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">No meal items attached to this subscription.</p>
                )}
              </section>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
