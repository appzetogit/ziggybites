import { useState, useEffect } from "react"
import { Clock, Loader2, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import api from "@/lib/api"

const MEAL_ROWS = [
  { id: "breakfast", label: "Breakfast" },
  { id: "lunch", label: "Lunch" },
  { id: "snacks", label: "Evening snacks" },
  { id: "dinner", label: "Dinner" },
]

const DEFAULT_RANGES = {
  breakfast: { start: "08:00", end: "09:00" },
  lunch: { start: "13:00", end: "14:00" },
  snacks: { start: "17:00", end: "18:00" },
  dinner: { start: "20:00", end: "21:00" },
}

function padSlot(val) {
  if (val == null || val === "") return ""
  const s = String(val).trim()
  const m = /^(\d{1,2}):(\d{2})$/.exec(s)
  if (!m) return s
  return `${m[1].padStart(2, "0")}:${m[2]}`
}

function normalizeSlotFromApi(val, mealId) {
  const fb = DEFAULT_RANGES[mealId]
  if (val && typeof val === "object") {
    const start = padSlot(val.start) || fb.start
    const end = padSlot(val.end) || fb.end
    return { start, end }
  }
  if (typeof val === "string" && val.includes(":")) {
    const start = padSlot(val)
    return { start, end: start }
  }
  return { ...fb }
}

function toMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || "").trim())
  if (!m) return null
  const h = Number(m[1])
  const mi = Number(m[2])
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return null
  return h * 60 + mi
}

export default function MealSlotTimesPage() {
  const [ranges, setRanges] = useState(() => ({ ...DEFAULT_RANGES }))
  const [timezone, setTimezone] = useState("Asia/Kolkata")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get("/admin/subscription-settings")
      const d = res?.data?.data
      if (d?.mealSlotTimes) {
        const next = {}
        for (const row of MEAL_ROWS) {
          next[row.id] = normalizeSlotFromApi(d.mealSlotTimes[row.id], row.id)
        }
        setRanges(next)
      }
      if (d?.mealSlotTimezone) setTimezone(d.mealSlotTimezone)
    } catch (e) {
      setError(e.response?.data?.message || e.message || "Failed to load settings")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleSave = async () => {
    setError(null)
    setSuccess(null)
    for (const row of MEAL_ROWS) {
      const { start, end } = ranges[row.id]
      const a = toMinutes(start)
      const b = toMinutes(end)
      if (a == null || b == null) {
        setError(`${row.label}: use valid times (HH:mm).`)
        return
      }
      if (b <= a) {
        setError(`${row.label}: end time must be after start (e.g. 9:00 – 10:00).`)
        return
      }
    }
    setSaving(true)
    try {
      const mealSlotTimes = {}
      for (const row of MEAL_ROWS) {
        mealSlotTimes[row.id] = {
          start: padSlot(ranges[row.id].start),
          end: padSlot(ranges[row.id].end),
        }
      }
      const res = await api.put("/admin/subscription-settings", {
        mealSlotTimes,
        mealSlotTimezone: timezone.trim() || "Asia/Kolkata",
      })
      if (res?.data?.success) {
        setSuccess(
          "Meal windows saved. Users see a range (e.g. 9–10). Reminders still go ~24 hours before the window starts.",
        )
        const mt = res.data.data?.mealSlotTimes
        if (mt) {
          const next = {}
          for (const row of MEAL_ROWS) {
            next[row.id] = normalizeSlotFromApi(mt[row.id], row.id)
          }
          setRanges(next)
        }
        if (res.data.data?.mealSlotTimezone) setTimezone(res.data.data.mealSlotTimezone)
      }
    } catch (e) {
      setError(e.response?.data?.message || e.message || "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  const setRange = (mealId, field, value) => {
    setRanges((r) => ({
      ...r,
      [mealId]: { ...r[mealId], [field]: value },
    }))
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[320px]">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 dark:bg-[#0a0a0a] min-h-screen">
      <div className="mb-6">
        <h1 className="text-xl lg:text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Clock className="h-6 w-6 text-[#DC2626]" />
          Meal slot times
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mt-1 text-sm max-w-2xl">
          Set a <strong>delivery window</strong> for each meal (for example 9:00–10:00). Scheduling and the 24-hour reminder
          use the <strong>start</strong> of the window; customers and order notes show the full range.
        </p>
      </div>

      <Card className="mb-6 border border-slate-200 dark:border-slate-800 max-w-2xl">
        <CardHeader className="pb-2">
          <span className="font-semibold text-slate-900 dark:text-white">Delivery window per meal category</span>
        </CardHeader>
        <CardContent className="space-y-5">
          {MEAL_ROWS.map((row) => (
            <div key={row.id} className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
              <Label className="w-40 shrink-0 text-slate-700 dark:text-slate-300">{row.label}</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="time"
                  aria-label={`${row.label} start`}
                  value={ranges[row.id]?.start || ""}
                  onChange={(e) => setRange(row.id, "start", e.target.value)}
                  className="w-36"
                />
                <span className="text-slate-500 dark:text-slate-400 font-medium px-1">–</span>
                <Input
                  type="time"
                  aria-label={`${row.label} end`}
                  value={ranges[row.id]?.end || ""}
                  onChange={(e) => setRange(row.id, "end", e.target.value)}
                  className="w-36"
                />
              </div>
            </div>
          ))}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
            <Label htmlFor="meal-tz" className="mb-2 block">
              Timezone (IANA)
            </Label>
            <Input
              id="meal-tz"
              list="iana-timezones"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="Asia/Kolkata"
              className="max-w-md"
            />
            <datalist id="iana-timezones">
              <option value="Asia/Kolkata" />
              <option value="Asia/Dubai" />
              <option value="Asia/Singapore" />
              <option value="Europe/London" />
              <option value="America/New_York" />
              <option value="UTC" />
            </datalist>
            <p className="text-xs text-slate-500 mt-1">Start and end times are in this timezone.</p>
          </div>
          <div className="flex items-start gap-2 rounded-lg bg-blue-50 dark:bg-blue-950/30 p-3 text-sm text-blue-900 dark:text-blue-200">
            <Info className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              Assign each menu item a meal category under <strong>Foods</strong>. If a subscription includes several
              categories, the next upcoming window is used.
            </span>
          </div>
          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm">{error}</div>
          )}
          {success && (
            <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200 text-sm">
              {success}
            </div>
          )}
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save meal times
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
