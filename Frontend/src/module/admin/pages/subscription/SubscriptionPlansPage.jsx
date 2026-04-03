import { useState, useEffect } from "react"
import { Repeat, Edit2, Loader2, Plus, Trash2, Truck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import api from "@/lib/api"

const ALLOWED_DURATIONS = [15, 30, 90]
const DEFAULT_PLANS = [
  { durationDays: 15, name: "15 Days", active: true },
  { durationDays: 30, name: "30 Days", active: true },
  { durationDays: 90, name: "90 Days", active: true },
]
const MEAL_TYPES = [
  { id: "breakfast", label: "Breakfast" },
  { id: "lunch", label: "Lunch" },
  { id: "snacks", label: "Evening Snacks" },
  { id: "dinner", label: "Dinner" },
]

function getDurationKey(plan) {
  return plan.durationDays ?? plan.durationMonths ?? plan._id
}

export default function SubscriptionPlansPage() {
  const [plans, setPlans] = useState(DEFAULT_PLANS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editingPlan, setEditingPlan] = useState(null)
  const [form, setForm] = useState({ name: "", description: "", benefits: "", active: true, mealTypesEnabled: { breakfast: true, lunch: true, snacks: true, dinner: true } })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [adding, setAdding] = useState(false)
  const [addForm, setAddForm] = useState({
    durationDays: 30,
    name: "30 Days",
    description: "",
    benefits: "",
    active: true,
    mealTypesEnabled: { breakfast: true, lunch: true, snacks: true, dinner: true },
  })
  const [removeConfirm, setRemoveConfirm] = useState(null)
  const [deliveryCharges, setDeliveryCharges] = useState(30)
  const [deliverySaving, setDeliverySaving] = useState(false)

  const fetchPlans = async () => {
    try {
      setLoading(true)
      setError(null)
      const [plansRes, settingsRes] = await Promise.all([
        api.get("/admin/subscription-plans").catch(() => null),
        api.get("/admin/subscription-settings").catch(() => null),
      ])
      if (plansRes?.data?.success && Array.isArray(plansRes.data.data)) {
        setPlans(plansRes.data.data.length ? plansRes.data.data : DEFAULT_PLANS)
      }
      if (settingsRes?.data?.success && settingsRes.data.data?.deliveryChargesPerDay != null) {
        setDeliveryCharges(settingsRes.data.data.deliveryChargesPerDay)
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPlans()
  }, [])

  const handleSaveDeliveryCharges = async () => {
    setDeliverySaving(true)
    try {
      const res = await api.put("/admin/subscription-settings", { deliveryChargesPerDay: Number(deliveryCharges) || 0 })
      if (res?.data?.success) {
        setDeliveryCharges(res.data.data?.deliveryChargesPerDay ?? deliveryCharges)
      }
    } catch (e) {
      setSaveError(e.response?.data?.message || e.message || "Failed to update")
    } finally {
      setDeliverySaving(false)
    }
  }

  const openEdit = (plan) => {
    setEditingPlan(plan)
    const mt = plan.mealTypesEnabled || {}
    setForm({
      name: plan.name || "",
      description: plan.description || "",
      benefits: plan.benefits || "",
      active: plan.active !== false,
      mealTypesEnabled: {
        breakfast: mt.breakfast !== false,
        lunch: mt.lunch !== false,
        snacks: mt.snacks !== false,
        dinner: mt.dinner !== false,
      },
    })
    setSaveError(null)
  }

  const closeEdit = () => {
    setEditingPlan(null)
    setSaveError(null)
  }

  const openAdd = () => {
    setSaveError(null)
    setAdding(true)
    setAddForm({
      durationDays: 30,
      name: "30 Days",
      description: "",
      benefits: "",
      price: "",
      discountPercent: "0",
      active: true,
    })
  }

  const closeAdd = () => {
    setAdding(false)
    setSaveError(null)
  }

  const handleSave = async () => {
    if (!editingPlan) return
    const durationDays = editingPlan.durationDays ?? editingPlan.durationMonths
    const payload = {
      name: form.name.trim() || editingPlan.name,
      description: form.description.trim(),
      benefits: form.benefits.trim(),
      active: form.active,
      mealTypesEnabled: form.mealTypesEnabled,
    }
    setSaving(true)
    setSaveError(null)
    try {
      const res = await api.put(`/admin/subscription-plans/${durationDays}`, payload)
      if (res?.data?.success && res.data.data) {
        setPlans((prev) => prev.map((p) => (getDurationKey(p) === durationDays ? { ...p, ...res.data.data } : p)))
        closeEdit()
      } else {
        setSaveError(res?.data?.message || "Failed to update plan")
      }
    } catch (e) {
      setSaveError(e.response?.data?.message || e.message || "Failed to update plan")
    } finally {
      setSaving(false)
    }
  }

  const handleCreate = async () => {
    const duration = Number(addForm.durationDays)
    if (!Number.isInteger(duration) || duration <= 0) {
      setSaveError("Duration must be a positive number of days.")
      return
    }
    const payload = {
      durationDays: duration,
      name: addForm.name.trim() || `${addForm.durationDays} Days`,
      description: addForm.description.trim(),
      benefits: addForm.benefits.trim(),
      active: addForm.active,
      mealTypesEnabled: addForm.mealTypesEnabled,
    }
    setSaving(true)
    setSaveError(null)
    try {
      const res = await api.post("/admin/subscription-plans", payload)
      if (res?.data?.success && res.data.data) {
        setPlans((prev) => [...prev, res.data.data].sort((a, b) => (a.durationDays ?? a.durationMonths ?? 0) - (b.durationDays ?? b.durationMonths ?? 0)))
        closeAdd()
      } else {
        setSaveError(res?.data?.message || "Failed to create plan")
      }
    } catch (e) {
      setSaveError(e.response?.data?.message || e.message || "Failed to create plan")
    } finally {
      setSaving(false)
    }
  }

  const handleRemoveClick = (plan) => {
    setSaveError(null)
    setRemoveConfirm(plan)
  }

  const handleRemoveConfirm = async () => {
    if (!removeConfirm) return
    const durationDays = removeConfirm.durationDays ?? removeConfirm.durationMonths
    setSaving(true)
    try {
      await api.delete(`/admin/subscription-plans/${durationDays}`)
      setPlans((prev) => prev.filter((p) => getDurationKey(p) !== durationDays))
      setRemoveConfirm(null)
    } catch (e) {
      setSaveError(e.response?.data?.message || e.message || "Failed to remove plan")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 dark:bg-[#0a0a0a] min-h-screen">
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl lg:text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Repeat className="h-6 w-6 text-[#DC2626]" />
          Subscription Plans
        </h1>
        <Button onClick={openAdd} className="gap-2">
          <Plus className="h-4 w-4" />
          Add plan
        </Button>
      </div>
      <p className="text-slate-600 dark:text-slate-400 mb-6">
        Define plan structure only. Price is dynamic (food items + delivery charges). Enable/disable meal types per plan.
      </p>

      {/* Delivery charges */}
      <Card className="mb-6 border border-slate-200 dark:border-slate-800">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-[#DC2626]" />
            <span className="font-semibold text-slate-900 dark:text-white">Delivery charges (per day)</span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">Used in dynamic price: Total = Food cost + (Delivery × Days)</p>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Label htmlFor="delivery-charges" className="text-sm">₹</Label>
            <Input
              id="delivery-charges"
              type="number"
              min={0}
              value={deliveryCharges}
              onChange={(e) => setDeliveryCharges(Number(e.target.value) || 0)}
              className="w-24"
            />
            <span className="text-sm text-slate-500">per day</span>
          </div>
          <Button size="sm" onClick={handleSaveDeliveryCharges} disabled={deliverySaving}>
            {deliverySaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </Button>
        </CardContent>
      </Card>
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm">
          {error}
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan, index) => {
          const durationDays = plan.durationDays ?? plan.durationMonths
          const validityLabel = durationDays === 15 ? "15 days" : durationDays === 30 ? "30 days" : durationDays === 90 ? "90 days" : `${durationDays} days`
          return (
            <Card key={getDurationKey(plan)} className="border border-slate-200 dark:border-slate-800">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-900 dark:text-white">{plan.name}</span>
                  {plan.active !== false && (
                    <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2 py-0.5 rounded">
                      Active
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Validity: {validityLabel}
                </p>
                <div className="flex flex-wrap gap-1">
                  {MEAL_TYPES.map((m) => {
                    const enabled = plan.mealTypesEnabled?.[m.id] !== false
                    return (
                      <span
                        key={m.id}
                        className={`text-xs px-2 py-0.5 rounded ${enabled ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300" : "bg-slate-100 dark:bg-slate-800 text-slate-500"}`}
                      >
                        {m.label}
                      </span>
                    )
                  })}
                </div>
                {plan.description && (
                  <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2">{plan.description}</p>
                )}
                <div className="flex gap-2 mt-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => openEdit(plan)}>
                    <Edit2 className="h-4 w-4 mr-2" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                    onClick={() => handleRemoveClick(plan)}
                    disabled={saving}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Dialog open={!!editingPlan} onOpenChange={(open) => !open && closeEdit()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit plan — all card fields</DialogTitle>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Changes here update what is shown on the plan card.
            </p>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. 1 Month"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-validity">Validity (read-only)</Label>
              <Input
                id="edit-validity"
                readOnly
                className="bg-slate-100 dark:bg-slate-800 cursor-not-allowed"
                value={
                  editingPlan?.durationDays === 15
                    ? "15 days"
                    : editingPlan?.durationDays === 30
                      ? "30 days"
                      : editingPlan?.durationDays === 90
                        ? "90 days"
                        : editingPlan?.durationMonths === 1
                          ? "1 month"
                          : `${editingPlan?.durationDays ?? editingPlan?.durationMonths ?? ""} days`
                }
              />
            </div>
            <div className="grid gap-2">
              <Label>Meal types enabled</Label>
              <div className="flex flex-wrap gap-4">
                {MEAL_TYPES.map((m) => (
                  <div key={m.id} className="flex items-center gap-2">
                    <Switch
                      checked={form.mealTypesEnabled[m.id] !== false}
                      onCheckedChange={(checked) =>
                        setForm((f) => ({
                          ...f,
                          mealTypesEnabled: { ...f.mealTypesEnabled, [m.id]: checked },
                        }))
                      }
                    />
                    <Label className="text-sm font-normal">{m.label}</Label>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-500">Users will select food for enabled meal types only.</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Short description shown on the card"
                rows={2}
                className="resize-none"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-benefits">What you get</Label>
              <Textarea
                id="edit-benefits"
                value={form.benefits}
                onChange={(e) => setForm((f) => ({ ...f, benefits: e.target.value }))}
                placeholder={"One bullet per line, for example:\n2-hour prior delivery notification before each meal"}
                rows={4}
              />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Each line will appear as a separate point under &quot;What you get&quot; on the customer subscription page.
              </p>
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="edit-active">Active (show on card)</Label>
              <Switch
                id="edit-active"
                checked={form.active}
                onCheckedChange={(checked) => setForm((f) => ({ ...f, active: checked }))}
              />
            </div>
          </div>
          {saveError && (
            <p className="text-sm text-red-600 dark:text-red-400">{saveError}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closeEdit} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add plan dialog */}
      <Dialog open={adding} onOpenChange={(open) => !open && closeAdd()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add subscription plan</DialogTitle>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Create a new plan. Duration can be any number of days.
            </p>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="add-duration">Duration (days)</Label>
              <Input
                id="add-duration"
                type="number"
                min={0}
                value={addForm.durationDays}
                onChange={(e) => {
                  const value = Number(e.target.value)
                  const names = { 15: "15 Days", 30: "30 Days", 90: "90 Days" }
                  setAddForm((f) => ({
                    ...f,
                    durationDays: value,
                    name: names[value] || (value ? `${value} Days` : f.name),
                  }))
                }}
                placeholder="15, 30, or 90"
              />
              <p className="text-xs text-slate-500 dark:text-slate-400">Enter how many days this plan should run.</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="add-name">Name</Label>
              <Input
                id="add-name"
                value={addForm.name}
                onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. 30 Days"
              />
            </div>
            <div className="grid gap-2">
              <Label>Meal types enabled</Label>
              <div className="flex flex-wrap gap-4">
                {MEAL_TYPES.map((m) => (
                  <div key={m.id} className="flex items-center gap-2">
                    <Switch
                      checked={addForm.mealTypesEnabled[m.id] !== false}
                      onCheckedChange={(checked) =>
                        setAddForm((f) => ({
                          ...f,
                          mealTypesEnabled: { ...f.mealTypesEnabled, [m.id]: checked },
                        }))
                      }
                    />
                    <Label className="text-sm font-normal">{m.label}</Label>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="add-description">Description</Label>
              <Textarea
                id="add-description"
                value={addForm.description}
                onChange={(e) => setAddForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Short description"
                rows={2}
                className="resize-none"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="add-benefits">What you get</Label>
              <Textarea
                id="add-benefits"
                value={addForm.benefits}
                onChange={(e) => setAddForm((f) => ({ ...f, benefits: e.target.value }))}
                placeholder={"One bullet per line, for example:\n2-hour prior delivery notification before each meal"}
                rows={4}
              />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Each line will appear as a separate point under &quot;What you get&quot; on the customer subscription page.
              </p>
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="add-active">Active</Label>
              <Switch
                id="add-active"
                checked={addForm.active}
                onCheckedChange={(checked) => setAddForm((f) => ({ ...f, active: checked }))}
              />
            </div>
          </div>
          {saveError && adding && (
            <p className="text-sm text-red-600 dark:text-red-400">{saveError}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closeAdd} disabled={saving}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add plan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove confirmation dialog */}
      <Dialog open={!!removeConfirm} onOpenChange={(open) => !open && setRemoveConfirm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove plan?</DialogTitle>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              This will remove &quot;{removeConfirm?.name}&quot; ({removeConfirm?.durationDays ?? removeConfirm?.durationMonths} days). Existing purchases are not affected.
            </p>
          </DialogHeader>
          {saveError && removeConfirm && (
            <p className="text-sm text-red-600 dark:text-red-400">{saveError}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveConfirm(null)} disabled={saving}>Cancel</Button>
            <Button variant="destructive" onClick={handleRemoveConfirm} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
