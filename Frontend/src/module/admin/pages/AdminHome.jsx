import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Activity, ArrowUpRight, ShoppingBag, CreditCard, Truck, Receipt, DollarSign, Store, UserCheck, Package, UserCircle, Clock, CheckCircle, Plus, Users, Repeat, UtensilsCrossed } from "lucide-react"
import { adminAPI } from "@/lib/api"

export default function AdminHome() {
  const [selectedZone, setSelectedZone] = useState("all")
  const [selectedPeriod, setSelectedPeriod] = useState("overall")
  const [statusFilter, setStatusFilter] = useState("all")
  const [foodCategoryFilter, setFoodCategoryFilter] = useState("all")
  const [isLoading, setIsLoading] = useState(true)
  const [dashboardData, setDashboardData] = useState(null)

  // Fetch dashboard stats on mount
  useEffect(() => {
    const fetchDashboardStats = async () => {
      try {
        setIsLoading(true)
        const response = await adminAPI.getDashboardStats()
        if (response.data?.success && response.data?.data) {
          setDashboardData(response.data.data)
          console.log('✅ Dashboard stats fetched:', response.data.data)
          console.log('💰 Commission:', response.data.data.commission)
          console.log('💳 Platform Fee:', response.data.data.platformFee)
          console.log('🚚 Delivery Fee:', response.data.data.deliveryFee)
          console.log('🧾 GST:', response.data.data.gst)
          console.log('💵 Total Admin Earnings:', response.data.data.totalAdminEarnings)
        } else {
          console.error('❌ Invalid response format:', response.data)
        }
      } catch (error) {
        console.error('❌ Error fetching dashboard stats:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchDashboardStats()
  }, [])

  // Update loading state when filters change
  useEffect(() => {
    if (dashboardData) {
      setIsLoading(true)
      const timer = setTimeout(() => setIsLoading(false), 350)
      return () => clearTimeout(timer)
    }
  }, [selectedZone, selectedPeriod])

  // Get order stats from real data (for pie chart: Pending, In progress, Delivered, Cancelled)
  const getOrderStats = () => {
    if (!dashboardData?.orders?.byStatus) {
      return [
        { label: "Pending", value: 0, color: "#10b981" },
        { label: "In progress", value: 0, color: "#8b5cf6" },
        { label: "Delivered", value: 0, color: "#0ea5e9" },
        { label: "Cancelled", value: 0, color: "#ef4444" },
      ]
    }

    const byStatus = dashboardData.orders.byStatus
    const inProgress =
      (byStatus.confirmed || 0) + (byStatus.preparing || 0) + (byStatus.ready || 0) + (byStatus.out_for_delivery || 0)
    return [
      { label: "Pending", value: byStatus.pending || 0, color: "#10b981" },
      { label: "In progress", value: inProgress, color: "#8b5cf6" },
      { label: "Delivered", value: byStatus.delivered || 0, color: "#0ea5e9" },
      { label: "Cancelled", value: byStatus.cancelled || 0, color: "#ef4444" },
    ]
  }

  // Get monthly data from real data
  const getMonthlyData = () => {
    if (!dashboardData?.monthlyData || dashboardData.monthlyData.length === 0) {
      // Return empty data structure if no data
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      return monthNames.map(month => ({ month, commission: 0, revenue: 0, orders: 0 }))
    }

    // Use real monthly data from backend
    return dashboardData.monthlyData.map(item => ({
      month: item.month,
      commission: item.commission || 0,
      revenue: item.revenue || 0,
      orders: item.orders || 0
    }))
  }

  const orderStats = getOrderStats()
  const monthlyData = getMonthlyData()

  // Calculate totals from real data
  const revenueTotal = dashboardData?.revenue?.total || 0
  const commissionTotal = dashboardData?.commission?.total || 0
  const ordersTotal = dashboardData?.orders?.total || 0
  const platformFeeTotal = dashboardData?.platformFee?.total || 0
  const deliveryFeeTotal = dashboardData?.deliveryFee?.total || 0
  const gstTotal = dashboardData?.gst?.total || 0
  // Total revenue = Commission + Platform Fee + Delivery Fee + GST
  const totalAdminEarnings = commissionTotal + platformFeeTotal + deliveryFeeTotal + gstTotal

  // Additional stats
  const totalRestaurants = dashboardData?.restaurants?.total || 0
  const pendingRestaurantRequests = dashboardData?.restaurants?.pendingRequests || 0
  const totalDeliveryBoys = dashboardData?.deliveryBoys?.total || 0
  const pendingDeliveryBoyRequests = dashboardData?.deliveryBoys?.pendingRequests || 0
  const totalFoods = dashboardData?.foods?.total || 0
  const totalAddons = dashboardData?.addons?.total || 0
  const totalCustomers = dashboardData?.customers?.total || 0
  const pendingOrders = dashboardData?.orderStats?.pending || 0
  const inProgressOrders = dashboardData?.orderStats?.inProgress || 0
  const completedOrders = dashboardData?.orderStats?.completed || 0
  const ordersToday = dashboardData?.ordersByPeriod?.today ?? 0
  const ordersThisWeek = dashboardData?.ordersByPeriod?.thisWeek ?? 0
  const ordersThisMonth = dashboardData?.ordersByPeriod?.thisMonth ?? 0
  const activeSubscriptions = dashboardData?.activeSubscriptions ?? 0
  const topSellingFoods = dashboardData?.topSellingFoods ?? []
  const userActivity = dashboardData?.userActivity ?? {}

  const pieData = orderStats.map((item) => ({
    name: item.label,
    value: item.value,
    fill: item.color,
  }))

  const activityFeed = []

  return (
    <div className="px-4 pb-10 lg:px-6 pt-4">
      <div className="relative overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-[0_30px_120px_-60px_rgba(0,0,0,0.28)]">
        {isLoading && (
          <div className="absolute top-4 right-4 z-20 flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs text-neutral-600 shadow-md border border-neutral-200">
            <span className="h-2 w-2 animate-pulse rounded-full bg-neutral-500" />
            Updating...
          </div>
        )}

        <div className="flex flex-col gap-4 border-b border-neutral-200 bg-linear-to-br from-white via-neutral-50 to-neutral-100 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">Admin Overview</p>
              <h1 className="text-2xl font-semibold text-neutral-900">Operations Command</h1>
            </div>

          </div>
          <div className="flex flex-wrap gap-3 items-center">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="min-w-[140px] border-neutral-300 bg-white text-neutral-900">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent className="border-neutral-200 bg-white text-neutral-900">
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="processing">In progress</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Select value={foodCategoryFilter} onValueChange={setFoodCategoryFilter}>
              <SelectTrigger className="min-w-[160px] border-neutral-300 bg-white text-neutral-900">
                <SelectValue placeholder="Food category" />
              </SelectTrigger>
              <SelectContent className="border-neutral-200 bg-white text-neutral-900">
                <SelectItem value="all">All categories</SelectItem>
                <SelectItem value="veg">Veg</SelectItem>
                <SelectItem value="non_veg">Non-veg</SelectItem>
              </SelectContent>
            </Select>
            <Select value={selectedZone} onValueChange={setSelectedZone}>
              <SelectTrigger className="min-w-[160px] border-neutral-300 bg-white text-neutral-900">
                <SelectValue placeholder="All zones" />
              </SelectTrigger>
              <SelectContent className="border-neutral-200 bg-white text-neutral-900">
                <SelectItem value="all">All zones</SelectItem>
                <SelectItem value="zone1">Zone 1</SelectItem>
                <SelectItem value="zone2">Zone 2</SelectItem>
                <SelectItem value="zone3">Zone 3</SelectItem>
                <SelectItem value="zone4">Zone 4</SelectItem>
              </SelectContent>
            </Select>
            <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
              <SelectTrigger className="min-w-[140px] border-neutral-300 bg-white text-neutral-900">
                <SelectValue placeholder="Overall" />
              </SelectTrigger>
              <SelectContent className="border-neutral-200 bg-white text-neutral-900">
                <SelectItem value="overall">Overall</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">This week</SelectItem>
                <SelectItem value="month">This month</SelectItem>
                <SelectItem value="year">This year</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-6 px-6 py-6">
          {/* Key metrics: Orders by period, Revenue, Subscriptions */}
          {/* All Metric Cards in a single grid */}
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <MetricCard title="Orders today" value={ordersToday.toLocaleString("en-IN")} helper="Created today" icon={<Activity className="h-5 w-5 text-blue-600" />} accent="bg-blue-200/40" to="/admin/orders/all" />
            <MetricCard title="Orders (this week)" value={ordersThisWeek.toLocaleString("en-IN")} helper="Last 7 days" icon={<Activity className="h-5 w-5 text-sky-600" />} accent="bg-sky-200/40" to="/admin/orders/all" />
            <MetricCard title="Orders (this month)" value={ordersThisMonth.toLocaleString("en-IN")} helper="Current month" icon={<Activity className="h-5 w-5 text-cyan-600" />} accent="bg-cyan-200/40" to="/admin/orders/all" />
            <MetricCard title="Total revenue" value={`₹${revenueTotal.toLocaleString("en-IN")}`} helper="Gross (delivered)" icon={<DollarSign className="h-5 w-5 text-emerald-600" />} accent="bg-emerald-200/40" to="/admin/orders/all" />
            <MetricCard title="Active subscriptions" value={activeSubscriptions.toLocaleString("en-IN")} helper="ZigZagLite" icon={<Repeat className="h-5 w-5 text-red-600" />} accent="bg-red-200/40" to="/admin/subscriptions" />
            <MetricCard title="Total orders" value={ordersTotal.toLocaleString("en-IN")} helper="Delivered (all time)" icon={<ShoppingBag className="h-5 w-5 text-amber-600" />} accent="bg-amber-200/40" to="/admin/orders/all" />

            <MetricCard title="Pending orders" value={pendingOrders.toLocaleString("en-IN")} helper="Awaiting processing" icon={<Clock className="h-5 w-5 text-amber-600" />} accent="bg-amber-200/40" to="/admin/orders/pending" />
            <MetricCard title="In-progress orders" value={inProgressOrders.toLocaleString("en-IN")} helper="Accepted / preparing / on the way" icon={<Truck className="h-5 w-5 text-indigo-600" />} accent="bg-indigo-200/40" to="/admin/orders/accepted" />
            <MetricCard title="Delivered orders" value={completedOrders.toLocaleString("en-IN")} helper="Successfully completed" icon={<CheckCircle className="h-5 w-5 text-emerald-600" />} accent="bg-emerald-200/40" to="/admin/orders/delivered" />

            <MetricCard title="New users (today)" value={String(userActivity.newUsersToday ?? 0)} helper="Registered today" icon={<Users className="h-5 w-5 text-violet-600" />} accent="bg-violet-200/40" />
            <MetricCard title="New users (week)" value={String(userActivity.newUsersThisWeek ?? 0)} helper="Last 7 days" icon={<Users className="h-5 w-5 text-purple-600" />} accent="bg-purple-200/40" />
            <MetricCard title="New users (month)" value={String(userActivity.newUsersThisMonth ?? 0)} helper="This month" icon={<Users className="h-5 w-5 text-fuchsia-600" />} accent="bg-fuchsia-200/40" />
            <MetricCard title="Active users (today)" value={String(userActivity.activeUsersToday ?? 0)} helper="Placed order today" icon={<UserCircle className="h-5 w-5 text-teal-600" />} accent="bg-teal-200/40" />
            <MetricCard title="Active users (week)" value={String(userActivity.activeUsersThisWeek ?? 0)} helper="Placed order this week" icon={<UserCircle className="h-5 w-5 text-cyan-600" />} accent="bg-cyan-200/40" />
            <MetricCard title="Active users (month)" value={String(userActivity.activeUsersThisMonth ?? 0)} helper="Placed order this month" icon={<UserCircle className="h-5 w-5 text-sky-600" />} accent="bg-sky-200/40" />

            <MetricCard
              title="Gross revenue"
              value={`₹${revenueTotal.toLocaleString("en-IN")}`}
              helper="Rolling 12 months"
              icon={<ShoppingBag className="h-5 w-5 text-emerald-600" />}
              accent="bg-emerald-200/40"
              to="/admin/orders/all"
            />
            <MetricCard
              title="Commission earned"
              value={`₹${commissionTotal.toLocaleString("en-IN")}`}
              helper="Restaurant commission"
              icon={<ArrowUpRight className="h-5 w-5 text-indigo-600" />}
              accent="bg-indigo-200/40"
              to="/admin/restaurants/commission"
            />
            <MetricCard
              title="Orders processed"
              value={ordersTotal.toLocaleString("en-IN")}
              helper="Fulfilled & billed"
              icon={<Activity className="h-5 w-5 text-amber-600" />}
              accent="bg-amber-200/40"
              to="/admin/orders/all"
            />
            <MetricCard
              title="Platform fee"
              value={`₹${platformFeeTotal.toLocaleString("en-IN")}`}
              helper="Total platform fees"
              icon={<CreditCard className="h-5 w-5 text-purple-600" />}
              accent="bg-purple-200/40"
              to="/admin/orders/all"
            />
            <MetricCard
              title="Delivery fee"
              value={`₹${deliveryFeeTotal.toLocaleString("en-IN")}`}
              helper="Total delivery fees"
              icon={<Truck className="h-5 w-5 text-blue-600" />}
              accent="bg-blue-200/40"
              to="/admin/order-detect-delivery"
            />
            <MetricCard
              title="GST"
              value={`₹${gstTotal.toLocaleString("en-IN")}`}
              helper="Total GST collected"
              icon={<Receipt className="h-5 w-5 text-orange-600" />}
              accent="bg-orange-200/40"
              to="/admin/orders/all"
            />
            <MetricCard
              title="Total revenue"
              value={`₹${totalAdminEarnings.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              helper={`Commission ₹${commissionTotal.toFixed(2)} + Platform ₹${platformFeeTotal.toFixed(2)} + Delivery ₹${deliveryFeeTotal.toFixed(2)} + GST ₹${gstTotal.toFixed(2)}`}
              icon={<DollarSign className="h-5 w-5 text-green-600" />}
              accent="bg-green-200/40"
              to="/admin/orders/all"
            />
            <MetricCard
              title="Total restaurants"
              value={totalRestaurants.toLocaleString("en-IN")}
              helper="All registered restaurants"
              icon={<Store className="h-5 w-5 text-blue-600" />}
              accent="bg-blue-200/40"
              to="/admin/restaurants"
            />
            <MetricCard
              title="Restaurant request pending"
              value={pendingRestaurantRequests.toLocaleString("en-IN")}
              helper="Awaiting approval"
              icon={<UserCheck className="h-5 w-5 text-orange-600" />}
              accent="bg-orange-200/40"
              to="/admin/restaurants/joining-request"
            />
            <MetricCard
              title="Total delivery boy"
              value={totalDeliveryBoys.toLocaleString("en-IN")}
              helper="All delivery partners"
              icon={<Truck className="h-5 w-5 text-indigo-600" />}
              accent="bg-indigo-200/40"
              to="/admin/delivery-partners"
            />
            <MetricCard
              title="Delivery boy request pending"
              value={pendingDeliveryBoyRequests.toLocaleString("en-IN")}
              helper="Awaiting verification"
              icon={<Clock className="h-5 w-5 text-yellow-600" />}
              accent="bg-yellow-200/40"
              to="/admin/delivery-partners/requests"
            />
            <MetricCard
              title="Total foods"
              value={totalFoods.toLocaleString("en-IN")}
              helper="Active menu items"
              icon={<Package className="h-5 w-5 text-purple-600" />}
              accent="bg-purple-200/40"
              to="/admin/foods"
            />
            <MetricCard
              title="Total addons"
              value={totalAddons.toLocaleString("en-IN")}
              helper="Active addon items"
              icon={<Plus className="h-5 w-5 text-pink-600" />}
              accent="bg-pink-200/40"
              to="/admin/addons"
            />
            <MetricCard
              title="Total customers"
              value={totalCustomers.toLocaleString("en-IN")}
              helper="Registered users"
              icon={<UserCircle className="h-5 w-5 text-cyan-600" />}
              accent="bg-cyan-200/40"
              to="/admin/customers"
            />
          </div>

          {/* Top-selling food items */}
          <Card className="border-neutral-200 bg-white">
            <CardHeader className="border-b border-neutral-200 pb-4">
              <CardTitle className="text-lg text-neutral-900 flex items-center gap-2">
                <UtensilsCrossed className="h-5 w-5 text-red-600" />
                Top-selling food items
              </CardTitle>
              <p className="text-sm text-neutral-500">By quantity sold (delivered orders)</p>
            </CardHeader>
            <CardContent className="pt-4">
              {topSellingFoods.length === 0 ? (
                <p className="text-sm text-neutral-500 py-6 text-center">No data yet</p>
              ) : (
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topSellingFoods} layout="vertical" margin={{ left: 20, right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis type="number" stroke="#6b7280" />
                      <YAxis type="category" dataKey="name" width={120} stroke="#6b7280" tick={{ fontSize: 11 }} />
                      <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 12 }} />
                      <Bar dataKey="totalQuantity" fill="#DC2626" radius={[0, 4, 4, 0]} name="Quantity sold" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2 border-neutral-200 bg-white">
              <CardHeader className="flex flex-col gap-2 border-b border-neutral-200 pb-4">
                <CardTitle className="text-lg text-neutral-900">Revenue trajectory</CardTitle>
                <p className="text-sm text-neutral-500">
                  Commission and gross revenue with monthly order volume
                </p>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={monthlyData}>
                      <defs>
                        <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="comFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#a855f7" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="month" stroke="#6b7280" />
                      <YAxis stroke="#6b7280" />
                      <Tooltip
                        contentStyle={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 12 }}
                        labelStyle={{ color: "#111827" }}
                        itemStyle={{ color: "#111827" }}
                      />
                      <Legend />
                      <Area
                        type="monotone"
                        dataKey="revenue"
                        stroke="#0ea5e9"
                        fillOpacity={1}
                        fill="url(#revFill)"
                        name="Gross revenue"
                      />
                      <Area
                        type="monotone"
                        dataKey="commission"
                        stroke="#a855f7"
                        fillOpacity={1}
                        fill="url(#comFill)"
                        name="Commission"
                      />
                      <Bar
                        dataKey="orders"
                        fill="#ef4444"
                        radius={[6, 6, 0, 0]}
                        name="Orders"
                        barSize={10}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="h-full border-neutral-200 bg-white">
              <CardHeader className="flex items-center justify-between border-b border-neutral-200 pb-4">
                <div>
                  <CardTitle className="text-lg text-neutral-900">Order mix</CardTitle>
                  <p className="text-sm text-neutral-500">Distribution by state</p>
                </div>
                <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-700">
                  {orderStats.reduce((s, o) => s + o.value, 0)} orders
                </span>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={4}
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={index} fill={entry.fill} stroke="none" />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 12 }}
                        labelStyle={{ color: "#111827" }}
                        itemStyle={{ color: "#111827" }}
                      />
                      <Legend
                        formatter={(value) => <span style={{ color: "#111827", fontSize: 12 }}>{value}</span>}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {orderStats.map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: item.color }} />
                        <p className="text-sm text-neutral-800">{item.label}</p>
                      </div>
                      <p className="text-sm font-semibold text-neutral-900">{item.value}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="h-full border-neutral-200 bg-white">
              <CardHeader className="flex items-center justify-between border-b border-neutral-200 pb-4">
                <CardTitle className="text-lg text-neutral-900">Momentum snapshot</CardTitle>
                <span className="text-xs text-neutral-500">No data available</span>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyData.slice(-6)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="month" stroke="#6b7280" />
                      <YAxis stroke="#6b7280" />
                      <Tooltip
                        contentStyle={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 12 }}
                        labelStyle={{ color: "#111827" }}
                        itemStyle={{ color: "#111827" }}
                      />
                      <Legend />
                      <Bar dataKey="orders" fill="#0ea5e9" radius={[8, 8, 0, 0]} name="Orders" />
                      <Bar dataKey="commission" fill="#a855f7" radius={[8, 8, 0, 0]} name="Commission" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="h-full border-neutral-200 bg-white">
              <CardHeader className="border-b border-neutral-200 pb-4">
                <CardTitle className="text-lg text-neutral-900">Live signals</CardTitle>
                <p className="text-sm text-neutral-500">Ops notes and service health</p>
              </CardHeader>
              <CardContent className="space-y-3 pt-4">
                {activityFeed.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-start justify-between rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-3"
                  >
                    <div>
                      <p className="text-sm font-semibold text-neutral-900">{item.title}</p>
                      <p className="text-xs text-neutral-600">{item.detail}</p>
                    </div>
                    <span className="text-xs text-neutral-500">{item.time}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="h-full border-neutral-200 bg-white">
              <CardHeader className="border-b border-neutral-200 pb-4">
                <CardTitle className="text-lg text-neutral-900">Order states</CardTitle>
                <p className="text-sm text-neutral-500">Quick glance by status</p>
              </CardHeader>
              <CardContent className="grid gap-3 pt-4">
                {orderStats.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-sm font-semibold text-neutral-900"
                        style={{ background: `${item.color}1A`, color: item.color }}
                      >
                        {item.label.slice(0, 2).toUpperCase()}
                      </span>
                      <div>
                        <p className="text-sm text-neutral-900">{item.label}</p>
                        <p className="text-xs text-neutral-500">Tracked in {selectedPeriod}</p>
                      </div>
                    </div>
                    <p className="text-sm font-semibold text-neutral-900">{item.value}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

function MetricCard({ title, value, helper, icon, accent, to }) {
  const navigate = useNavigate()
  return (
    <Card className={`h-full min-h-[120px] overflow-hidden border-neutral-200 bg-white p-0 ${to ? "cursor-pointer hover:ring-2 hover:ring-neutral-300 transition-shadow" : ""}`}>
      <CardContent
        className="h-full relative flex flex-col justify-center gap-2 px-4 py-4"
        onClick={to ? () => navigate(to) : undefined}
        onKeyDown={to ? (e) => e.key === "Enter" && navigate(to) : undefined}
        role={to ? "button" : undefined}
        tabIndex={to ? 0 : undefined}
      >
        <div className={`absolute inset-0 ${accent} `} />
        <div className="relative flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] sm:text-xs uppercase tracking-[0.18em] text-neutral-500 truncate">{title}</p>
            <p className="text-xl sm:text-2xl font-bold text-neutral-900 truncate">{value}</p>
            <p className="text-[10px] sm:text-xs text-neutral-500 line-clamp-2">{helper}</p>
          </div>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-neutral-200">
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
