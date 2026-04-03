import { useState, useEffect, useMemo, useId } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import api from "@/lib/api"
import { toast } from "sonner"

export function formatYmdLocal(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

/** Add calendar days to a YYYY-MM-DD string (local date). */
function addCalendarDaysLocal(ymd, deltaDays) {
  const [y, m, d] = ymd.split("-").map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + deltaDays)
  return formatYmdLocal(dt)
}

/** Inclusive calendar days from startYmd through maxEndYmd (local). */
function inclusiveDaysSpan(startYmd, maxEndYmd) {
  if (!startYmd || !maxEndYmd || maxEndYmd < startYmd) return 0
  const s = new Date(`${startYmd}T12:00:00`)
  const e = new Date(`${maxEndYmd}T12:00:00`)
  return Math.floor((e - s) / (24 * 60 * 60 * 1000)) + 1
}

/**
 * Skip deliveries: pick a start date + 1–7 days (inclusive), capped by plan end.
 */
export default function SubscriptionPauseDialog({ open, onOpenChange, subscription, onAfterPause }) {
  const dateInputId = useId()
  const skipDaysId = useId()
  const [pauseStartDate, setPauseStartDate] = useState(() => formatYmdLocal(new Date()))
  const [skipDayCount, setSkipDayCount] = useState(1)
  const [pauseEstimates, setPauseEstimates] = useState({})
  const [pauseEstimatesLoading, setPauseEstimatesLoading] = useState(false)
  const [pauseSaving, setPauseSaving] = useState(false)

  const pauseMaxYmd = useMemo(() => {
    if (!subscription) return null
    if (subscription.endDate) {
      return formatYmdLocal(new Date(subscription.endDate))
    }
    const rd = Number(subscription.remainingDays)
    if (Number.isFinite(rd) && rd >= 0) {
      const d = new Date()
      d.setHours(0, 0, 0, 0)
      d.setDate(d.getDate() + rd)
      return formatYmdLocal(d)
    }
    return null
  }, [subscription])

  const todayYmd = formatYmdLocal(new Date())

  /** Max duration 7 days, or fewer if plan ends sooner. */
  const maxSkipDays = useMemo(() => {
    if (!pauseStartDate) return 7
    if (!pauseMaxYmd) return 7
    const span = inclusiveDaysSpan(pauseStartDate, pauseMaxYmd)
    return Math.min(7, Math.max(0, span))
  }, [pauseStartDate, pauseMaxYmd])

  const pauseEndDate = useMemo(() => {
    if (!pauseStartDate || skipDayCount < 1) return pauseStartDate
    return addCalendarDaysLocal(pauseStartDate, skipDayCount - 1)
  }, [pauseStartDate, skipDayCount])

  useEffect(() => {
    if (!open) return
    const ymd = formatYmdLocal(new Date())
    setPauseStartDate(ymd)
    setSkipDayCount(1)
  }, [open])

  useEffect(() => {
    if (maxSkipDays < 1) return
    if (skipDayCount > maxSkipDays) setSkipDayCount(maxSkipDays)
  }, [maxSkipDays, skipDayCount])

  useEffect(() => {
    if (!open || !subscription?._id) return
    const id = subscription._id
    let cancelled = false
    setPauseEstimatesLoading(true)

    const run = async () => {
      try {
        if (!pauseStartDate || !pauseEndDate || pauseEndDate < pauseStartDate || maxSkipDays < 1) {
          if (!cancelled) {
            setPauseEstimates({})
            setPauseEstimatesLoading(false)
          }
          return
        }
        const r = await api.get("/subscription/pause-estimate", {
          params: {
            subscriptionId: id,
            pauseType: "custom_range",
            pauseStartDate,
            pauseEndDate,
          },
        })
        if (cancelled) return
        const data = r?.data?.data
        setPauseEstimates({
          estimatedWalletCredit: data?.estimatedWalletCredit,
          inclusiveDays: data?.inclusiveDays,
        })
      } catch {
        if (!cancelled) setPauseEstimates({})
      } finally {
        if (!cancelled) setPauseEstimatesLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [open, subscription?._id, pauseStartDate, pauseEndDate, maxSkipDays])

  const handleConfirmPause = async () => {
    const id = subscription?._id
    if (!id) return
    if (!pauseStartDate || !pauseEndDate || pauseEndDate < pauseStartDate) {
      toast.error("Choose a valid start date and number of days.")
      return
    }
    if (maxSkipDays < 1) {
      toast.error("No days left to skip on your current plan.")
      return
    }
    setPauseSaving(true)
    try {
      const res = await api.post("/subscription/pause", {
        subscriptionId: id,
        pauseType: "custom_range",
        pauseStartDate,
        pauseEndDate,
      })
      const credit = res?.data?.walletCredit
      toast.success(
        res?.data?.message ||
          (credit > 0 ? `Skipped. ₹${credit} added to your wallet.` : "Updated your subscription."),
      )
      onOpenChange(false)
      if (onAfterPause) await onAfterPause()
    } catch (e) {
      const msg = e?.response?.data?.message || e.message || "Could not skip deliveries"
      toast.error(msg)
    } finally {
      setPauseSaving(false)
    }
  }

  const dayOptions = Array.from({ length: Math.max(0, maxSkipDays) }, (_, i) => i + 1)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Skip deliveries</DialogTitle>
          <p className="text-sm text-gray-500 dark:text-gray-400 font-normal pt-1">
            Choose the first day to skip and how many days in a row (up to 7). Wallet credit and plan extension apply
            (capped by your remaining plan). Deliveries resume the day after the last skipped day.
          </p>
        </DialogHeader>

        <div className="space-y-4 rounded-xl border border-gray-200 dark:border-gray-700 p-4 bg-gray-50/80 dark:bg-gray-900/40">
          <div className="space-y-1.5">
            <Label htmlFor={dateInputId} className="text-xs font-medium text-gray-700 dark:text-gray-300">
              Start skipping from
            </Label>
            <input
              id={dateInputId}
              type="date"
              min={todayYmd}
              max={pauseMaxYmd || undefined}
              value={pauseStartDate}
              onChange={(e) => setPauseStartDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm text-gray-900 dark:text-white"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={skipDaysId} className="text-xs font-medium text-gray-700 dark:text-gray-300">
              Skip for (days)
            </Label>
            {dayOptions.length > 0 ? (
              <select
                id={skipDaysId}
                className="w-full h-11 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]/40 focus-visible:border-[#DC2626]"
                value={String(Math.min(Math.max(1, skipDayCount), maxSkipDays))}
                onChange={(e) => setSkipDayCount(Number.parseInt(e.target.value, 10) || 1)}
              >
                {dayOptions.map((n) => (
                  <option key={n} value={n}>
                    {n} {n === 1 ? "day" : "days"}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400 py-2">—</p>
            )}
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              Up to 7 days per request. Last skipped day:{" "}
              <span className="font-medium text-gray-700 dark:text-gray-300">{pauseEndDate || "—"}</span>
            </p>
          </div>

          {maxSkipDays < 1 && (
            <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">
              Your plan has no remaining days to skip from this start date.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2 min-h-[1.25rem] pt-1 border-t border-gray-200 dark:border-gray-700">
            {pauseEstimatesLoading ? (
              <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin text-[#DC2626]" />
                Estimating credit…
              </div>
            ) : (
              <>
                {pauseEstimates.inclusiveDays != null && (
                  <span className="text-xs text-gray-600 dark:text-gray-400">
                    {pauseEstimates.inclusiveDays} calendar day{pauseEstimates.inclusiveDays === 1 ? "" : "s"} skipped
                  </span>
                )}
                {pauseEstimates.estimatedWalletCredit != null && (
                  <span className="text-xs font-semibold text-[#DC2626]">
                    Est. wallet credit: ₹{Number(pauseEstimates.estimatedWalletCredit).toLocaleString("en-IN")}
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="w-full sm:w-auto bg-[#DC2626] hover:bg-[#B91C1C] text-white"
            onClick={handleConfirmPause}
            disabled={
              pauseSaving ||
              pauseEstimatesLoading ||
              maxSkipDays < 1 ||
              !pauseStartDate ||
              !pauseEndDate ||
              pauseEndDate < pauseStartDate
            }
          >
            {pauseSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Confirm skip
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
