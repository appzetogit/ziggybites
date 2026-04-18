import { useEffect, useMemo, useState, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, ChefHat, Loader2, Lock, Clock, UtensilsCrossed, Printer } from "lucide-react"
import { restaurantAPI } from "@/lib/api"
import { toast } from "sonner"

const DELIVERY_DEMO_READY_EVENT = "delivery_demo_subscription_ready"

export default function SubscriptionPrepPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)
  const [updatingOrderId, setUpdatingOrderId] = useState("")
  const [isDemoData, setIsDemoData] = useState(false)
  const [forceDemoData, setForceDemoData] = useState(false)
  const [updatingSlotKey, setUpdatingSlotKey] = useState("")
  const [mealFilter, setMealFilter] = useState("all")

  const getStaticDemoData = () => {
    const start = new Date()
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)

    const createSlot = (hour, minute) => {
      const slot = new Date(start)
      slot.setHours(hour, minute, 0, 0)
      return slot
    }

    const breakfastSlot = createSlot(8, 30)
    const lunchSlot = createSlot(13, 0)
    const snacksSlot = createSlot(17, 30)
    const dinnerSlot = createSlot(20, 0)

    const orders = [
      {
        _id: "demo-1",
        orderId: "SUB-DEMO-1001",
        status: "scheduled",
        preparationStatus: "pending",
        user: { _id: "u-1", name: "Rahul", phone: "+91 90000 00001" },
        contactName: "Rahul",
        deliveryAddress: "202, Princess Centre, 2nd Floor, 6/3, 452001, New Delhi",
        totalAmount: 199,
        scheduledMealAt: breakfastSlot.toISOString(),
        mealDetailsVisible: true,
        items: [
          { itemId: "i-b1", name: "Oats Upma", quantity: 1 },
          { itemId: "i-b2", name: "Fruit Bowl", quantity: 1 },
        ],
      },
      {
        _id: "demo-2",
        orderId: "SUB-DEMO-1002",
        status: "scheduled",
        preparationStatus: "preparing",
        user: { _id: "u-2", name: "Priya", phone: "+91 90000 00002" },
        contactName: "Priya",
        deliveryAddress: "B-12, Green Park, 452001, New Delhi",
        totalAmount: 149,
        scheduledMealAt: breakfastSlot.toISOString(),
        mealDetailsVisible: true,
        items: [{ itemId: "i-b3", name: "Idli (4 pcs)", quantity: 1 }],
      },
      {
        _id: "demo-3",
        orderId: "SUB-DEMO-1003",
        status: "scheduled",
        preparationStatus: "pending",
        user: { _id: "u-3", name: "Aman", phone: "+91 90000 00003" },
        contactName: "Aman",
        deliveryAddress: "12, MG Road, Near Metro Station, 452001, Indore",
        totalAmount: 239,
        scheduledMealAt: lunchSlot.toISOString(),
        mealDetailsVisible: true,
        items: [
          { itemId: "i-l1", name: "Dal Tadka + Rice", quantity: 1 },
          { itemId: "i-l2", name: "Salad", quantity: 1 },
        ],
      },
      {
        _id: "demo-4",
        orderId: "SUB-DEMO-1004",
        status: "scheduled",
        preparationStatus: "pending",
        user: { _id: "u-4", name: "Neha", phone: "+91 90000 00004" },
        contactName: "Neha",
        deliveryAddress: "7, Vijay Nagar, 452010, Indore",
        totalAmount: 219,
        scheduledMealAt: lunchSlot.toISOString(),
        mealDetailsVisible: true,
        items: [{ itemId: "i-l3", name: "Rajma Chawal", quantity: 1 }],
      },
      {
        _id: "demo-5",
        orderId: "SUB-DEMO-1005",
        status: "scheduled",
        preparationStatus: "pending",
        user: { _id: "u-5", name: "Sagar", phone: "+91 90000 00005" },
        contactName: "Sagar",
        deliveryAddress: "301, Lotus Heights, 452001, Indore",
        totalAmount: 129,
        scheduledMealAt: snacksSlot.toISOString(),
        mealDetailsVisible: true,
        items: [{ itemId: "i-s1", name: "Sprouts Chaat", quantity: 1 }],
      },
      {
        _id: "demo-6",
        orderId: "SUB-DEMO-1006",
        status: "scheduled",
        preparationStatus: "pending",
        user: { _id: "u-6", name: "Kiran", phone: "+91 90000 00006" },
        contactName: "Kiran",
        deliveryAddress: "88, Scheme No. 78, 452010, Indore",
        totalAmount: 0,
        scheduledMealAt: snacksSlot.toISOString(),
        mealDetailsVisible: false,
        hint: `Unlocks after ${new Date(snacksSlot.getTime() - 30 * 60 * 1000).toLocaleString()}`,
        items: [],
      },
      {
        _id: "demo-7",
        orderId: "SUB-DEMO-1007",
        status: "scheduled",
        preparationStatus: "pending",
        user: { _id: "u-7", name: "Zoya", phone: "+91 90000 00007" },
        contactName: "Zoya",
        deliveryAddress: "501, Skyline Apartments, 452001, Indore",
        totalAmount: 299,
        scheduledMealAt: dinnerSlot.toISOString(),
        mealDetailsVisible: true,
        items: [{ itemId: "i-d1", name: "Paneer Tikka + Roti", quantity: 1 }],
      },
    ]

    const prepSummary = {}
    for (const o of orders) {
      if (!o.mealDetailsVisible) continue
      for (const it of o.items || []) {
        const name = it.name || "Item"
        const q = Number(it.quantity) || 1
        prepSummary[name] = (prepSummary[name] || 0) + q
      }
    }

    return {
      window: { start: start.toISOString(), end: end.toISOString() },
      orderCount: orders.length,
      mealDetailsUnlockedCount: orders.filter((o) => o.mealDetailsVisible).length,
      prepSummary,
      orders,
    }
  }

  const load = useCallback(async () => {
    try {
      setLoading(true)
      if (import.meta.env.DEV && forceDemoData) {
        setIsDemoData(true)
        setData(getStaticDemoData())
        return
      }
      const res = await restaurantAPI.getSubscriptionPrepNext24h()
      if (res.data?.success && res.data?.data) {
        setIsDemoData(false)
        setData(res.data.data)
      } else {
        setIsDemoData(false)
        setData(null)
      }
    } catch (e) {
      console.error(e)
      if (import.meta.env.DEV) {
        setIsDemoData(true)
        setData(getStaticDemoData())
        toast.warning("Backend not reachable — showing demo data")
      } else {
        toast.error(e.response?.data?.message || "Failed to load subscription prep")
        setData(null)
      }
    } finally {
      setLoading(false)
    }
  }, [forceDemoData])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!import.meta.env.DEV) return
    if (forceDemoData) {
      setIsDemoData(true)
      setData(getStaticDemoData())
    } else {
      load()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceDemoData])

  const slotGroups = useMemo(() => {
    const orders = data?.orders || []
    const map = new Map()

    for (const o of orders) {
      const t = o?.scheduledMealAt ? new Date(o.scheduledMealAt).getTime() : null
      const minuteKey = t != null && !Number.isNaN(t) ? Math.floor(t / 60000) : "no-slot"
      const key = String(minuteKey)
      const group = map.get(key) || { key, slotMinute: minuteKey, scheduledMealAt: o?.scheduledMealAt || null, orders: [] }
      group.orders.push(o)
      if (!group.scheduledMealAt && o?.scheduledMealAt) group.scheduledMealAt = o.scheduledMealAt
      map.set(key, group)
    }

    const list = Array.from(map.values())
    list.sort((a, b) => {
      const av = typeof a.slotMinute === "number" ? a.slotMinute : Number.MAX_SAFE_INTEGER
      const bv = typeof b.slotMinute === "number" ? b.slotMinute : Number.MAX_SAFE_INTEGER
      return av - bv
    })

    return list
  }, [data])

  const mealLabelForTime = (iso) => {
    if (!iso) return "Meal"
    const d = new Date(iso)
    const h = d.getHours()
    if (h >= 5 && h <= 10) return "Breakfast"
    if (h >= 11 && h <= 15) return "Lunch"
    if (h >= 16 && h <= 18) return "Evening snacks"
    return "Dinner"
  }

  const mealKeyForTime = (iso) => {
    if (!iso) return "other"
    const d = new Date(iso)
    const h = d.getHours()
    if (h >= 5 && h <= 10) return "breakfast"
    if (h >= 11 && h <= 15) return "lunch"
    if (h >= 16 && h <= 18) return "snacks"
    return "dinner"
  }

  const slotPartsForTime = (iso) => {
    if (!iso) return { day: "", time: "", full: "" }
    const d = new Date(iso)
    const now = new Date()

    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const startOfDate = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    const diffDays = Math.round((startOfDate.getTime() - startOfToday.getTime()) / (24 * 60 * 60 * 1000))

    const day =
      diffDays === 0
        ? "Today"
        : diffDays === 1
          ? "Tomorrow"
          : d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })

    const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    const full = d.toLocaleString()

    return { day, time, full }
  }

  const getReadyWindow = (order) => {
    const readyWindow = order?.readyWindow
    if (readyWindow?.startsAt && readyWindow?.endsAt) {
      const startsAt = new Date(readyWindow.startsAt)
      const endsAt = new Date(readyWindow.endsAt)
      if (!Number.isNaN(startsAt.getTime()) && !Number.isNaN(endsAt.getTime())) {
        return {
          startsAt,
          endsAt,
          canMarkReady: readyWindow.canMarkReady !== false && Date.now() >= startsAt.getTime() && Date.now() <= endsAt.getTime(),
        }
      }
    }
    if (!order?.scheduledMealAt) return { startsAt: null, endsAt: null, canMarkReady: true }
    const scheduledAt = new Date(order.scheduledMealAt)
    if (Number.isNaN(scheduledAt.getTime())) return { startsAt: null, endsAt: null, canMarkReady: true }
    const startsAt = new Date(scheduledAt.getTime() - 45 * 60 * 1000)
    const endsAt = new Date(scheduledAt.getTime() + 45 * 60 * 1000)
    return {
      startsAt,
      endsAt,
      canMarkReady: Date.now() >= startsAt.getTime() && Date.now() <= endsAt.getTime(),
    }
  }

  const canMarkOrderReadyNow = (order) => {
    if (!order?.mealDetailsVisible) return false
    if (String(order?._id || "").startsWith("subscription-")) return false
    if ((order.preparationStatus || "pending") === "ready") return false
    if (isDemoData || String(order?._id || "").startsWith("demo-")) return true
    return getReadyWindow(order).canMarkReady
  }

  const readyWindowLabel = (order) => {
    const window = getReadyWindow(order)
    if (!window.startsAt || !window.endsAt) return "Ready window unavailable"
    return `Ready allowed ${window.startsAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} - ${window.endsAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
  }

  const escapeHtml = (value) => {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;")
  }

  const getOrderAddressText = (order) => {
    return (
      order?.deliveryAddress ||
      order?.address?.formattedAddress ||
      order?.address?.formatted_address ||
      order?.address?.fullAddress ||
      order?.address?.address ||
      order?.shippingAddress ||
      ""
    )
  }

  const getOrderContactName = (order) => {
    return order?.contactName || order?.deliveryContactName || order?.address?.name || order?.user?.name || ""
  }

  const getOrderPhone = (order) => {
    return order?.contactPhone || order?.deliveryPhone || order?.phone || order?.user?.phone || ""
  }

  const formatINR = (amount) => {
    const n = typeof amount === "number" ? amount : Number(amount)
    if (!Number.isFinite(n) || n <= 0) return ""
    return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const getOrderAmountText = (order) => {
    const raw = order?.pricing?.total ?? order?.totalAmount ?? order?.total ?? order?.amount ?? order?.payableAmount ?? null
    if (raw == null) return ""
    if (typeof raw === "string") {
      const trimmed = raw.trim()
      if (!trimmed) return ""
      if (trimmed.includes("₹") || trimmed.includes("$")) return trimmed
      const maybeNum = Number(trimmed)
      return Number.isFinite(maybeNum) ? formatINR(maybeNum) : trimmed
    }
    return formatINR(raw)
  }

  const getOrderTotalQty = (order) => {
    return (order?.items || []).reduce((sum, it) => sum + (Number(it?.quantity) || 1), 0)
  }

  const printOrdersSlip = useCallback(
    (groups, label) => {
      const safeTitle = escapeHtml(label || "Subscription orders")
      const generatedAt = escapeHtml(new Date().toLocaleString())

      const orderBlocks = (groups || [])
        .flatMap((g) => (g?.orders || []).map((o) => ({ group: g, order: o })))
        .map(({ group, order }) => {
          const mealLabel = mealLabelForTime(group?.scheduledMealAt)
          const slot = slotPartsForTime(group?.scheduledMealAt)
          const displayName = escapeHtml(getOrderContactName(order) || order?.user?.name || "Customer")
          const displayPhone = escapeHtml(getOrderPhone(order) || order?.user?.phone || "")
          const address = escapeHtml(getOrderAddressText(order) || "")
          const amountText = escapeHtml(getOrderAmountText(order) || "")
          const totalQty = escapeHtml(getOrderTotalQty(order) || 0)
          const orderId = escapeHtml(order?.orderId || "")
          const slotText = slot.day && slot.time ? `${slot.day} · ${slot.time}` : escapeHtml(slot.full || "")

          const itemsHtml = order?.mealDetailsVisible
            ? (order?.items || [])
              .map((it) => {
                const name = escapeHtml(it?.name || "Item")
                const qty = escapeHtml(it?.quantity ?? 1)
                return `<div class="row"><div class="name">${name}</div><div class="qty">×${qty}</div></div>`
              })
              .join("")
            : `<div class="locked">
                 <div class="lockedTitle">Meal not visible yet</div>
                 <div class="lockedHint">${escapeHtml(order?.hint || order?.userMessage || "Customer may still change the dish.")}</div>
               </div>`

          return `
            <section class="slip">
              <div class="top">
                <div class="title">${escapeHtml(mealLabel)}</div>
                <div class="meta">${escapeHtml(slotText)}</div>
              </div>

              <div class="card">
                <div class="line"><span class="label">Order</span><span class="value mono">${orderId}</span></div>
                <div class="line"><span class="label">Customer</span><span class="value">${displayName}${displayPhone ? ` · ${displayPhone}` : ""}</span></div>
                ${address ? `<div class="line"><span class="label">Address</span><span class="value">${address}</span></div>` : ""}
                ${amountText ? `<div class="line"><span class="label">Amount</span><span class="value">${amountText}</span></div>` : ""}
                <div class="line"><span class="label">Qty</span><span class="value">${totalQty}</span></div>
              </div>

              <div class="items">
                <div class="itemsTitle">Items</div>
                ${itemsHtml}
              </div>
            </section>
          `
        })
        .join("")

      const html = `
        <!doctype html>
        <html>
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <title>${safeTitle}</title>
            <style>
              :root { color-scheme: light; }
              body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, "Noto Sans", "Helvetica Neue"; margin: 16px; color: #0f172a; }
              .header { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-bottom: 12px; }
              .header h1 { font-size: 16px; margin: 0; font-weight: 800; }
              .header .sub { font-size: 11px; color: #475569; }
              .slip { border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; margin: 12px 0; }
              .top { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
              .title { font-weight: 800; font-size: 14px; }
              .meta { font-size: 11px; color: #475569; }
              .card { border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px; background: #f8fafc; }
              .line { display: flex; justify-content: space-between; gap: 10px; font-size: 12px; margin: 6px 0; }
              .label { color: #475569; white-space: nowrap; }
              .value { font-weight: 700; text-align: right; overflow-wrap: anywhere; }
              .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
              .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; background: #e2e8f0; color: #334155; font-weight: 800; font-size: 11px; }
              .items { margin-top: 10px; }
              .itemsTitle { font-weight: 800; font-size: 12px; margin-bottom: 6px; }
              .row { display: flex; justify-content: space-between; gap: 10px; border-bottom: 1px dashed #e2e8f0; padding: 6px 0; }
              .row:last-child { border-bottom: 0; }
              .name { font-size: 12px; }
              .qty { font-size: 12px; font-weight: 800; white-space: nowrap; }
              .locked { border: 1px solid #f59e0b55; background: #fffbeb; border-radius: 10px; padding: 10px; }
              .lockedTitle { font-weight: 900; font-size: 12px; color: #92400e; }
              .lockedHint { font-size: 11px; color: #92400e; margin-top: 4px; }
              @media print {
                body { margin: 0; }
                .slip { break-after: page; page-break-after: always; margin: 0; border-radius: 0; border-left: 0; border-right: 0; }
                .slip:last-child { break-after: auto; page-break-after: auto; }
              }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>${safeTitle}</h1>
              <div class="sub">Generated: ${generatedAt}</div>
            </div>
            ${orderBlocks || `<div class="sub">No orders to print.</div>`}
            <script>
              window.addEventListener('load', () => {
                setTimeout(() => { window.print(); }, 150);
              });
            </script>
          </body>
        </html>
      `

      const iframe = document.createElement("iframe")
      iframe.setAttribute("aria-hidden", "true")
      iframe.style.position = "fixed"
      iframe.style.right = "0"
      iframe.style.bottom = "0"
      iframe.style.width = "0"
      iframe.style.height = "0"
      iframe.style.border = "0"
      iframe.style.opacity = "0"

      document.body.appendChild(iframe)

      const w = iframe.contentWindow
      const d = w?.document

      const cleanup = () => {
        try {
          if (iframe.parentNode) iframe.parentNode.removeChild(iframe)
        } catch {
          // ignore
        }
      }

      if (!w || !d) {
        cleanup()
        toast.error("Unable to open print view. Please try again.")
        return
      }

      try {
        d.open()
        d.write(html)
        d.close()

        // Some browsers don't reliably fire afterprint for iframes.
        w.addEventListener("afterprint", cleanup, { once: true })

        setTimeout(() => {
          try {
            w.focus()
            w.print()
          } catch (e) {
            console.error(e)
            toast.error("Print failed. Please try again.")
            cleanup()
          }
        }, 50)

        setTimeout(cleanup, 60_000)
      } catch (e) {
        console.error(e)
        toast.error("Print failed. Please try again.")
        cleanup()
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const mealFilterOptions = [
    { id: "all", label: "All" },
    { id: "breakfast", label: "Breakfast" },
    { id: "lunch", label: "Lunch" },
    { id: "snacks", label: "Snacks" },
    { id: "dinner", label: "Dinner" },
  ]

  const filteredOrders = useMemo(() => {
    const orders = data?.orders || []
    if (mealFilter === "all") return orders
    return orders.filter((o) => mealKeyForTime(o?.scheduledMealAt) === mealFilter)
  }, [data, mealFilter])

  const filteredSlotGroups = useMemo(() => {
    const map = new Map()

    for (const o of filteredOrders) {
      const t = o?.scheduledMealAt ? new Date(o.scheduledMealAt).getTime() : null
      const minuteKey = t != null && !Number.isNaN(t) ? Math.floor(t / 60000) : "no-slot"
      const key = String(minuteKey)
      const group = map.get(key) || { key, slotMinute: minuteKey, scheduledMealAt: o?.scheduledMealAt || null, orders: [] }
      group.orders.push(o)
      if (!group.scheduledMealAt && o?.scheduledMealAt) group.scheduledMealAt = o.scheduledMealAt
      map.set(key, group)
    }

    const list = Array.from(map.values())
    list.sort((a, b) => {
      const av = typeof a.slotMinute === "number" ? a.slotMinute : Number.MAX_SAFE_INTEGER
      const bv = typeof b.slotMinute === "number" ? b.slotMinute : Number.MAX_SAFE_INTEGER
      return av - bv
    })

    return list
  }, [filteredOrders])

  const prepEntries = useMemo(() => {
    const totals = {}

    for (const g of filteredSlotGroups) {
      for (const o of g.orders || []) {
        if (!o?.mealDetailsVisible) continue
        for (const it of o.items || []) {
          const name = it?.name || "Item"
          const q = Number(it?.quantity) || 1
          totals[name] = (totals[name] || 0) + q
        }
      }
    }

    return Object.entries(totals).sort((a, b) => b[1] - a[1])
  }, [filteredSlotGroups])

  const activeMealLabel = useMemo(() => {
    if (mealFilter === "all") return "All meals"
    return mealFilterOptions.find((o) => o.id === mealFilter)?.label || "This meal"
  }, [mealFilter, mealFilterOptions])

  const pushDemoOrdersToDelivery = useCallback((orders, assignmentMode = "single") => {
    const eligibleOrders = (orders || []).filter((order) => order?.mealDetailsVisible)
    if (eligibleOrders.length === 0) return

    const now = Date.now()
    const assignedOrders = eligibleOrders.slice(0, assignmentMode === "batch" ? 5 : 1).map((order, index) => ({
      orderId: order?.orderId || `SUB-DEMO-${now}-${index + 1}`,
      orderCode: order?.orderId || `SUB-DEMO-${now}-${index + 1}`,
      customerName: order?.contactName || order?.user?.name || `Subscription User ${index + 1}`,
      customerPhone: order?.user?.phone || "9999999999",
      customerAddress: order?.deliveryAddress || "Demo subscription delivery address",
      customerLocation: {
        latitude: 22.7196 + index * 0.004,
        longitude: 75.8577 + index * 0.004,
        address: order?.deliveryAddress || "Demo subscription delivery address",
      },
      items: (order?.items || []).map((item) => ({
        name: item?.name || "Item",
        quantity: Number(item?.quantity) || 1,
        price: Number(item?.price) || 0,
      })),
      total: Number(order?.totalAmount) || 0,
    }))

    const allItems = assignedOrders.flatMap((order) => order.items || [])
    const totalAmount = assignedOrders.reduce((sum, order) => sum + (Number(order?.total) || 0), 0)
    const slotTime = eligibleOrders[0]?.scheduledMealAt ? new Date(eligibleOrders[0].scheduledMealAt) : new Date()

    const payload = {
      source: "restaurant-subscription-demo",
      orderId: `DEMO-SUB-${now}`,
      orderMongoId: `demo-subscription-${now}`,
      status: "preparing",
      restaurantName: "Demo Kitchen",
      restaurantAddress: "Demo Kitchen, Vijay Nagar, Indore",
      restaurantLocation: {
        latitude: 22.7533,
        longitude: 75.8937,
        address: "Demo Kitchen, Vijay Nagar, Indore",
        formattedAddress: "Demo Kitchen, Vijay Nagar, Indore",
      },
      customerName: assignedOrders[0]?.customerName || "Subscription Customer",
      customerPhone: assignedOrders[0]?.customerPhone || "9999999999",
      customerLocation: assignedOrders[0]?.customerLocation || {
        latitude: 22.7196,
        longitude: 75.8577,
        address: "Demo subscription delivery address",
      },
      assignedOrders,
      items: allItems,
      total: totalAmount,
      deliveryFee: Math.max(20, assignedOrders.length * 10),
      estimatedEarnings: Math.max(20, assignedOrders.length * 10),
      deliveryDistance: "4.20 km",
      pickupDistance: "1.10 km",
      paymentMethod: "subscription",
      message:
        assignmentMode === "batch"
          ? `${assignedOrders.length} ${activeMealLabel.toLowerCase()} subscription deliveries are ready`
          : `${assignedOrders[0]?.customerName || "Subscription customer"}'s meal is ready`,
      timestamp: slotTime.toISOString(),
    }

    try {
      localStorage.setItem(DELIVERY_DEMO_READY_EVENT, JSON.stringify({ ...payload, emittedAt: new Date().toISOString() }))
      window.dispatchEvent(new CustomEvent(DELIVERY_DEMO_READY_EVENT, { detail: payload }))
    } catch (error) {
      console.error("Failed to push demo delivery assignment", error)
    }
  }, [activeMealLabel])

  const updateDemoOrders = useCallback((matcher) => {
    setData((current) => {
      if (!current?.orders) return current
      const nextOrders = current.orders.map((order) =>
        matcher(order)
          ? {
              ...order,
              preparationStatus: "ready",
              status: "ready",
            }
          : order,
      )
      return {
        ...current,
        orders: nextOrders,
      }
    })
  }, [])

  const markOrderReady = async (orderId) => {
    if (!orderId || updatingOrderId) return
    if (String(orderId).startsWith("subscription-")) {
      toast.info("This meal is still a preview. Ready action will work after the order is generated.")
      return
    }
    const targetOrder = (data?.orders || []).find((order) => String(order?._id) === String(orderId))
    if (targetOrder && !canMarkOrderReadyNow(targetOrder)) {
      toast.info(readyWindowLabel(targetOrder))
      return
    }
    if (isDemoData || String(orderId).startsWith("demo-")) {
      if (!targetOrder?.mealDetailsVisible) {
        toast.info("Nothing to mark ready")
        return
      }
      updateDemoOrders((order) => String(order?._id) === String(orderId))
      pushDemoOrdersToDelivery([targetOrder], "single")
      toast.success("Demo order sent to delivery")
      return
    }
    try {
      setUpdatingOrderId(String(orderId))
      await restaurantAPI.patchSubscriptionPreparationStatus(orderId, "ready", "single")
      toast.success("Marked as ready")
      await load()
    } catch (e) {
      console.error(e)
      toast.error(e.response?.data?.message || "Failed to mark as ready")
    } finally {
      setUpdatingOrderId("")
    }
  }

  const markMealReadyForSlot = async (slotKey, orders) => {
    if (!slotKey || updatingSlotKey || updatingOrderId) return
    const eligible = (orders || []).filter(
      (o) => canMarkOrderReadyNow(o),
    )
    if (eligible.length === 0) {
      toast.info("Nothing to mark ready")
      return
    }
    if (isDemoData) {
      updateDemoOrders((order) =>
        eligible.some((eligibleOrder) => String(eligibleOrder?._id) === String(order?._id)),
      )
      pushDemoOrdersToDelivery(eligible, "batch")
      toast.success("Demo meal slot sent to delivery")
      return
    }

    try {
      setUpdatingSlotKey(String(slotKey))
      await restaurantAPI.patchSubscriptionPreparationStatus(eligible[0]._id, "ready", "batch")
      toast.success("Meal slot marked ready")
      await load()
    } catch (e) {
      console.error(e)
      toast.error(e.response?.data?.message || "Failed to mark meal as ready")
    } finally {
      setUpdatingSlotKey("")
    }
  }

  const markAllFilteredReady = async () => {
    if (updatingSlotKey || updatingOrderId) return
    const eligibleGroups = filteredSlotGroups
      .map((group) => ({
        key: group.key,
        eligibleOrders: (group.orders || []).filter(
          (order) => canMarkOrderReadyNow(order),
        ),
        firstEligibleOrder: (group.orders || []).find(
          (order) => canMarkOrderReadyNow(order),
        ),
      }))
      .filter((group) => group.firstEligibleOrder)

    if (eligibleGroups.length === 0) {
      toast.info("Nothing to mark ready")
      return
    }
    if (isDemoData) {
      const readyIds = new Set(
        eligibleGroups.flatMap((group) => group.eligibleOrders.map((order) => String(order?._id))),
      )
      updateDemoOrders((order) => readyIds.has(String(order?._id)))
      for (const group of eligibleGroups) {
        pushDemoOrdersToDelivery(group.eligibleOrders, "batch")
      }
      toast.success(`${activeMealLabel} sent to delivery in demo mode`)
      return
    }

    try {
      setUpdatingSlotKey("__all__")
      for (const group of eligibleGroups) {
        // eslint-disable-next-line no-await-in-loop
        await restaurantAPI.patchSubscriptionPreparationStatus(group.firstEligibleOrder._id, "ready", "batch")
      }
      toast.success(`${activeMealLabel} marked ready`)
      await load()
    } catch (e) {
      console.error(e)
      toast.error(e.response?.data?.message || "Failed to mark all ready")
    } finally {
      setUpdatingSlotKey("")
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <header className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate("/restaurant/explore", { replace: true })}
          className="p-2 rounded-lg hover:bg-slate-100"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5 text-slate-800" />
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <ChefHat className="w-6 h-6 text-orange-600 shrink-0" />
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-slate-900 truncate">Food subscription</h1>
            <p className="text-xs text-slate-500 truncate">Next 24 hours · meals unlock after change window</p>
          </div>
        </div>
        {import.meta.env.DEV && (
          <button
            type="button"
            onClick={() => setForceDemoData((v) => !v)}
            className={`shrink-0 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              forceDemoData
                ? "bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200"
                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
            }`}
            title={forceDemoData ? "Showing demo data" : "Show demo data"}
          >
            {forceDemoData ? "Live data" : "Demo data"}
          </button>
        )}
      </header>

      <div className="p-4 max-w-lg mx-auto space-y-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
            <p className="text-sm text-slate-600">Loading subscription orders…</p>
          </div>
        ) : !data ? (
          <p className="text-center text-slate-600 py-8">No data</p>
        ) : (
          <>
            {isDemoData && (
              <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-4 py-3 text-sm">
                Showing demo data (development only).
              </div>
            )}
            {prepEntries.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                <h2 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                  <UtensilsCrossed className="w-4 h-4 text-green-600" />
                  Totals to prepare ({activeMealLabel} · unlocked)
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
              <div className="flex items-center justify-between gap-3 px-1">
                <h2 className="text-sm font-bold text-slate-900">Orders</h2>
                <button
                  type="button"
                  onClick={() => printOrdersSlip(filteredSlotGroups, `${activeMealLabel} · Subscription orders`)}
                  disabled={filteredSlotGroups.length === 0}
                  className={`shrink-0 text-xs px-3 py-2 rounded-lg font-semibold transition-colors inline-flex items-center gap-2 ${
                    filteredSlotGroups.length === 0
                      ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                      : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
                  }`}
                  title="Print each customer's order as a separate slip"
                >
                  <Printer className="w-4 h-4" />
                  Print
                </button>
              </div>

              <div className="px-1">
                  <button
                    type="button"
                    onClick={markAllFilteredReady}
                    disabled={
                      filteredSlotGroups.length === 0 ||
                      updatingOrderId ||
                      updatingSlotKey === "__all__" ||
                      !filteredSlotGroups.some((group) =>
                        (group.orders || []).some((order) => canMarkOrderReadyNow(order)),
                      )
                    }
                  className={`w-full text-xs px-3 py-2.5 rounded-lg font-semibold transition-colors ${
                    filteredSlotGroups.length === 0 || updatingOrderId
                      ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                      : "bg-emerald-600 text-white hover:bg-emerald-700"
                  }`}
                >
                  {updatingSlotKey === "__all__" ? "Marking..." : `Mark all ${activeMealLabel.toLowerCase()} ready`}
                </button>
              </div>

              <div className="bg-slate-100 border border-slate-200 rounded-xl p-1 flex gap-1 overflow-x-auto">
                {mealFilterOptions.map((opt) => {
                  const active = mealFilter === opt.id
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setMealFilter(opt.id)}
                      aria-pressed={active}
                      className={`shrink-0 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                        active
                          ? "bg-white text-slate-900 shadow-sm border border-slate-200"
                          : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/70"
                      }`}
                      title={opt.id === "all" ? "Show all meal slots" : `Show ${opt.label} slots`}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>

              {slotGroups.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-8 bg-white rounded-xl border border-dashed border-slate-200">
                  No subscription deliveries scheduled for the next 24 hours.
                </p>
              ) : filteredSlotGroups.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-8 bg-white rounded-xl border border-dashed border-slate-200">
                  No orders in this meal slot.
                </p>
              ) : (
                filteredSlotGroups.map((g) => {
                  const mealLabel = mealLabelForTime(g.scheduledMealAt)
                  const slotParts = slotPartsForTime(g.scheduledMealAt)
                  const groupTitle =
                    mealFilter === "all"
                      ? mealLabel
                      : slotParts.day && slotParts.time
                        ? `${slotParts.day} · ${slotParts.time}`
                        : "Meal slot"
                  const visibleCount = g.orders.filter((o) => o?.mealDetailsVisible).length
                  const readyCount = g.orders.filter((o) => (o?.preparationStatus || "pending") === "ready").length
                  const canMark =
                    !isDemoData &&
                    (g.orders || []).some((order) => canMarkOrderReadyNow(order))
                  const uniqueUsers = new Set(
                    g.orders
                      .map((o) => o?.user?._id)
                      .filter(Boolean)
                      .map((id) => String(id)),
                  ).size

                  return (
                    <div key={g.key} className="space-y-2">
                      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-900 truncate">
                              {groupTitle}
                            </p>
                            <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                              <Clock className="w-3.5 h-3.5" />
                              {mealFilter === "all" ? (
                                <span title={slotParts.full || ""}>
                                  {slotParts.day && slotParts.time ? `${slotParts.day} · ${slotParts.time}` : "Slot time"}
                                </span>
                              ) : (
                                <span title={slotParts.full || ""}>{slotParts.full || "Slot time"}</span>
                              )}
                            </p>
                            <p className="text-xs text-slate-600 mt-1">
                              {uniqueUsers || g.orders.length} user{(uniqueUsers || g.orders.length) !== 1 ? "s" : ""} · {visibleCount}/{g.orders.length} unlocked · {readyCount}/{visibleCount} ready
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => markMealReadyForSlot(g.key, g.orders)}
                            disabled={!canMark || updatingSlotKey === String(g.key) || updatingSlotKey === "__all__"}
                            className={`shrink-0 text-xs px-3 py-2 rounded-lg font-semibold transition-colors ${
                              canMark
                                ? "bg-emerald-600 text-white hover:bg-emerald-700"
                                : "bg-slate-100 text-slate-400 cursor-not-allowed"
                            }`}
                            title={canMark ? "Mark all unlocked orders ready for this meal slot" : "Ready is allowed only within 45 minutes before or after the scheduled meal time"}
                          >
                            {updatingSlotKey === String(g.key) ? "Marking..." : "Mark meal ready"}
                          </button>
                        </div>
                      </div>

                      {g.orders.map((o) => {
                        const contactName = getOrderContactName(o)
                        const phone = getOrderPhone(o)
                        const address = getOrderAddressText(o)
                        const amountText = getOrderAmountText(o)
                        const totalQty = getOrderTotalQty(o)
                        const itemsCount = o.items?.length || 0

                        return (
                          <div key={o._id} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                            <div className="flex justify-between items-start gap-2">
                              <div className="min-w-0">
                                <p className="font-mono text-sm font-semibold text-slate-900">{o.orderId}</p>
                                <p className="text-xs text-slate-600 truncate">
                                  {o.user?.name ? `Customer: ${o.user.name}` : "Customer"}
                                  {o.user?.phone ? ` · ${o.user.phone}` : ""}
                                </p>
                              </div>
                              <div className="shrink-0 flex items-center gap-2">
                                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                                  {o.preparationStatus || "pending"}
                                </span>
                                {o?.mealDetailsVisible &&
                                  !String(o?._id || "").startsWith("subscription-") &&
                                  (o.preparationStatus || "pending") !== "ready" && (
                                  <button
                                    type="button"
                                    onClick={() => markOrderReady(o._id)}
                                    disabled={!canMarkOrderReadyNow(o) || updatingOrderId === String(o._id) || updatingSlotKey === "__all__"}
                                    title={canMarkOrderReadyNow(o) ? "Mark this order ready" : readyWindowLabel(o)}
                                    className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {updatingOrderId === String(o._id) ? "Marking..." : "Mark ready"}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() =>
                                    printOrdersSlip([{ ...g, orders: [o] }], `${o.orderId || "Order"} · ${activeMealLabel}`)
                                  }
                                  className="p-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
                                  title="Print this order"
                                  aria-label="Print this order"
                                >
                                  <Printer className="w-4 h-4" />
                                </button>
                              </div>
                            </div>

                            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                              {o?.mealDetailsVisible &&
                                !isDemoData &&
                                !String(o?._id || "").startsWith("subscription-") &&
                                (o.preparationStatus || "pending") !== "ready" && (
                                  <div className={`col-span-2 rounded-lg border px-3 py-2 ${
                                    canMarkOrderReadyNow(o)
                                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                      : "border-amber-200 bg-amber-50 text-amber-800"
                                  }`}>
                                    {readyWindowLabel(o)}
                                  </div>
                                )}
                              <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
                                <span className="text-slate-500">Contact</span>
                                <div
                                  className="font-semibold text-slate-900 truncate"
                                  title={`${contactName || ""}${phone ? ` · ${phone}` : ""}`}
                                >
                                  {contactName || o.user?.name || "—"}
                                  {phone ? ` · ${phone}` : ""}
                                </div>
                              </div>
                              <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
                                <span className="text-slate-500">Amount</span>
                                <div className="font-semibold text-slate-900 tabular-nums">{amountText || "—"}</div>
                              </div>
                              <div className="col-span-2 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
                                <span className="text-slate-500">Address</span>
                                <div className="font-semibold text-slate-900" title={address || ""}>
                                  {address || "Address not available"}
                                </div>
                              </div>
                              <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
                                <span className="text-slate-500">Items</span>
                                <div className="font-semibold text-slate-900 tabular-nums">{itemsCount}</div>
                              </div>
                              <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
                                <span className="text-slate-500">Total qty</span>
                                <div className="font-semibold text-slate-900 tabular-nums">{totalQty || 0}</div>
                              </div>
                            </div>

                            {!o.mealDetailsVisible ? (
                              <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 p-3 flex gap-2">
                                <Lock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                                <div>
                                  <p className="text-sm font-medium text-amber-900">Meal not visible yet</p>
                                  <p className="text-xs text-amber-800 mt-0.5">
                                    {o.hint || o.userMessage || "Customer may still change the dish."}
                                  </p>
                                </div>
                              </div>
                            ) : (
                              <div className="mt-3 space-y-2">
                                {o.items?.map((it) => (
                                  <div
                                    key={`${o._id}-${it.itemId}-${it.name}`}
                                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 flex items-center justify-between"
                                  >
                                    <span className="text-sm text-slate-900">{it.name}</span>
                                    <span className="text-sm font-semibold text-slate-700 tabular-nums">×{it.quantity}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                })
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
