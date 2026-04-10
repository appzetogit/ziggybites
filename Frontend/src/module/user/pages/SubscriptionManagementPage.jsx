import { useState, useEffect, useCallback } from "react"
import { Link, useNavigate } from "react-router-dom"
import {
  Loader2,
  Package,
  Pencil,
  ChevronRight,
  PauseCircle,
  Truck,
  ArrowLeft,
  MessageCircle,
  Plus,
  Sunrise,
  Sun,
  Coffee,
  Moon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import api from "@/lib/api"
import SubscriptionPauseDialog from "@/module/user/components/SubscriptionPauseDialog.jsx"
import { toast } from "sonner"
import AnimatedPage from "@/module/user/components/AnimatedPage"

const WHATSAPP_SUPPORT = "https://wa.me/919769203828?text=" + encodeURIComponent("Hi, I need help with my subscription management on Ziggybites.")

const MEAL_CATEGORIES = [
  { id: "breakfast", label: "Breakfast", Icon: Sunrise, color: "text-amber-500", bg: "bg-amber-50" },
  { id: "lunch", label: "Lunch", Icon: Sun, color: "text-yellow-500", bg: "bg-yellow-50" },
  { id: "snacks", label: "Evening Snacks", Icon: Coffee, color: "text-rose-500", bg: "bg-rose-50" },
  { id: "dinner", label: "Dinner", Icon: Moon, color: "text-indigo-500", bg: "bg-indigo-50" },
]

export default function SubscriptionManagementPage() {
  const navigate = useNavigate()
  const [activeSubscriptions, setActiveSubscriptions] = useState([])
  const [dashboard, setDashboard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showPauseDialog, setShowPauseDialog] = useState(false)
  const [cancelSaving, setCancelSaving] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [cancelPreviewLoading, setCancelPreviewLoading] = useState(false)
  const [cancelPreview, setCancelPreview] = useState(null)

  const primarySubscription =
    activeSubscriptions.find((s) => s.status === "active") || activeSubscriptions[0] || null

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const [activeRes, dashboardRes] = await Promise.all([
        api.get("/subscription/active").catch(() => ({ data: { success: false, data: [] } })),
        api.get("/subscription/dashboard").catch(() => ({ data: { success: false, data: null } })),
      ])
      
      if (activeRes?.data?.success) setActiveSubscriptions(activeRes.data.data)
      if (dashboardRes?.data?.success) setDashboard(dashboardRes.data.data)

      if (!activeRes?.data?.data?.length && !dashboardRes?.data?.data?.activePlan) {
         navigate("/subscription")
      }
    } catch (e) {
      toast.error(e?.message || "Failed to load subscription management")
    } finally {
      setLoading(false)
    }
  }, [navigate])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleCancel = async () => {
    setCancelPreviewLoading(true)
    try {
      const res = await api.post("/subscription/cancel", { previewOnly: true })
      setCancelPreview(res?.data?.data || null)
      setShowCancelConfirm(true)
    } catch (e) {
      toast.error(e?.response?.data?.message || "Could not calculate cancellation amount")
    } finally {
      setCancelPreviewLoading(false)
    }
  }

  const handleConfirmCancel = async () => {
    setCancelSaving(true)
    try {
      const res = await api.post("/subscription/cancel")
      const refunded = Number(res?.data?.data?.refundedAmount || 0).toLocaleString("en-IN")
      toast.success(`Subscription cancelled. Refund of Rs. ${refunded} will go to your bank/payment source.`)
      setShowCancelConfirm(false)
      setCancelPreview(null)
      fetchData()
    } catch (e) {
      toast.error(e?.response?.data?.message || "Could not cancel")
    } finally {
      setCancelSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fdfdfd] dark:bg-gray-950">
        <Loader2 className="h-9 w-9 animate-spin text-[#DC2626]" />
      </div>
    )
  }

  return (
    <AnimatedPage className="min-h-screen bg-[#FDFDFD] dark:bg-gray-950 pb-32 pt-6">
      <div className="max-w-md mx-auto px-6">
        <header className="mb-8 flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => navigate("/subscription")}
            className="shrink-0 -ml-2"
          >
            <ArrowLeft className="h-6 w-6" />
          </Button>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#DC2626] mb-1">Management</p>
            <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white">
              Manage Meals
            </h1>
          </div>
        </header>

        {primarySubscription ? (
          <div className="space-y-6">
            
            {/* Skip Deliveries Section */}
            <section className="bg-white dark:bg-gray-900 rounded-[2.5rem] border border-gray-100 dark:border-gray-800 p-8 shadow-sm">
               <div className="flex items-center gap-4 mb-6">
                 <div className={`h-14 w-14 rounded-full flex items-center justify-center ${primarySubscription.status === 'paused' ? 'bg-amber-100 text-amber-600' : 'bg-rose-50 text-[#DC2626]'}`}>
                    <PauseCircle className="h-8 w-8" strokeWidth={2} />
                 </div>
                 <div>
                    <h2 className="text-xl font-black text-gray-900 dark:text-white">Skip Deliveries</h2>
                    <p className="text-xs font-bold text-gray-500 italic">Need a break? Pause your plan</p>
                 </div>
               </div>

               <p className="text-sm text-gray-600 dark:text-gray-400 mb-8 leading-relaxed">
                 You can skip deliveries for up to 7 days. Your plan will be extended, and skipped days will be credited back to your wallet.
               </p>

               {primarySubscription.status === 'paused' ? (
                 <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 mb-6">
                   <p className="text-sm font-bold text-amber-900 dark:text-amber-200">Subscription Paused</p>
                   {primarySubscription.pauseUntil && (
                     <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">Resuming on: {new Date(primarySubscription.pauseUntil).toLocaleDateString()}</p>
                   )}
                 </div>
               ) : null}

               <Button 
                onClick={() => setShowPauseDialog(true)}
                className="w-full h-14 rounded-2xl bg-[#DC2626] hover:bg-[#B91C1C] text-white font-black text-sm shadow-lg shadow-red-500/20 transition-transform active:scale-95"
               >
                 {primarySubscription.status === 'paused' ? "Manage Skip Dates" : "Skip Deliveries Now"}
               </Button>
            </section>

            {/* Current Meal Choices */}
            <section>
               <div className="flex items-center justify-between mb-4 px-2">
                 <h3 className="text-xl font-black text-gray-900 dark:text-white">Meal Choices</h3>
                 <Link to="/subscription/manage" className="text-xs font-black text-[#DC2626] uppercase tracking-widest hover:underline">
                   Manage
                 </Link>
               </div>
               <div className="grid grid-cols-1 gap-3">
                 {MEAL_CATEGORIES.map((cat) => {
                   const item = primarySubscription.items?.find(i => i.mealCategory === cat.id);
                   const Icon = cat.Icon;
                   return (
                     <div key={cat.id} className="bg-white dark:bg-gray-900 rounded-3xl p-5 border border-gray-50 dark:border-gray-800 flex items-center justify-between group">
                        <div className="flex items-center gap-4">
                           <div className={`h-12 w-12 rounded-2xl ${cat.bg} dark:bg-gray-800 flex items-center justify-center ${cat.color}`}>
                              <Icon className="h-6 w-6" />
                           </div>
                           <div>
                             <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-[1] mb-1">{cat.label}</p>
                              <p className={`text-sm font-black leading-tight ${item ? "text-gray-900 dark:text-white" : "text-[#DC2626]"}`}>
                                {item ? (item.dishName || item.mealName || "Custom Pick") : "Add food"}
                              </p>
                           </div>
                        </div>
                        <Link 
                          to={`/subscription/browse/${cat.id}`} 
                          state={{ fromManage: true }}
                          className={`flex items-center justify-center transition-colors ${
                            item
                              ? "h-10 w-10 rounded-full bg-gray-50 dark:bg-gray-800 text-gray-400 group-hover:text-[#DC2626] group-hover:bg-red-50"
                              : "h-10 px-4 rounded-full bg-[#DC2626] text-white text-[11px] font-black uppercase tracking-[0.12em]"
                          }`}
                        >
                          {item ? <Pencil className="h-4 w-4" /> : <><Plus className="h-4 w-4 mr-1" />Add</>}
                        </Link>
                     </div>
                   );
                 })}
               </div>
            </section>

            {/* Danger Zone */}
            <section className="pt-6 border-t border-gray-100 dark:border-gray-800">
               <Button 
                variant="ghost" 
                onClick={handleCancel}
                disabled={cancelPreviewLoading || cancelSaving || !!dashboard?.cancellationRequestedAt}
                className="w-full h-12 text-red-500 hover:text-red-600 hover:bg-red-50 font-bold text-xs uppercase tracking-widest"
               >
                 {dashboard?.cancellationRequestedAt ? "Cancellation Pending" : cancelPreviewLoading ? "Calculating..." : "Cancel Subscription"}
               </Button>
               {dashboard?.cancellationRequestedAt && (
                 <p className="text-center text-[10px] text-gray-400 mt-2 italic px-8">
                   You requested cancellation on {new Date(dashboard.cancellationRequestedAt).toLocaleDateString()}. Your plan will end on {new Date(dashboard.endDate).toLocaleDateString()}.
                 </p>
               )}
            </section>

            {/* Help Card */}
            <a 
              href={WHATSAPP_SUPPORT}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-[#F0FAF7] dark:bg-[#0D2A24] rounded-3xl p-6 flex items-center justify-between border border-[#E0F2EE] dark:border-[#1E3A34] transition-transform active:scale-[0.98]"
            >
               <div className="flex items-center gap-5">
                 <div className="h-14 w-14 rounded-full bg-[#24D366] flex items-center justify-center text-white shadow-lg shadow-green-200/50">
                    <MessageCircle className="h-7 w-7 fill-white" strokeWidth={1} />
                 </div>
                 <div>
                    <p className="font-extrabold text-gray-900 dark:text-white leading-tight">Need help skipping?</p>
                    <p className="text-[11px] font-bold text-gray-500 mt-1">Chat with us on WhatsApp</p>
                 </div>
               </div>
               <ChevronRight className="h-5 w-5 text-gray-400" />
            </a>
          </div>
        ) : (
          <div className="text-center py-20">
            <div className="inline-flex h-20 w-20 items-center justify-center rounded-3xl bg-gray-50 dark:bg-gray-900 mb-6">
               <Package className="h-10 w-10 text-gray-300" />
            </div>
            <p className="text-gray-400 font-bold">No active subscription found.</p>
            <Button className="mt-6 bg-[#DC2626] px-8 rounded-2xl h-12" onClick={() => navigate("/subscription")}>View Plans</Button>
          </div>
        )}
      </div>

      <SubscriptionPauseDialog
        open={showPauseDialog}
        onOpenChange={setShowPauseDialog}
        subscription={primarySubscription}
        onAfterPause={fetchData}
      />

      <Dialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
        <DialogContent className="sm:max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black">Confirm Cancellation</DialogTitle>
            <p className="text-sm text-gray-500">
              Refund will be sent automatically to your original payment source/bank account.
            </p>
          </DialogHeader>
          <div className="rounded-2xl border border-gray-200 p-4 bg-gray-50 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Total paid</span>
              <span className="font-semibold text-gray-900">Rs. {Number(cancelPreview?.totalPaid || 0).toLocaleString("en-IN")}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Meals used amount</span>
              <span className="font-semibold text-gray-900">Rs. {Number(cancelPreview?.usedAmount || 0).toLocaleString("en-IN")}</span>
            </div>
            <div className="flex items-center justify-between border-t border-gray-200 pt-2">
              <span className="font-semibold text-gray-900">Refund amount</span>
              <span className="font-black text-[#DC2626]">Rs. {Number(cancelPreview?.refundableAmount || 0).toLocaleString("en-IN")}</span>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setShowCancelConfirm(false)} disabled={cancelSaving}>
              Close
            </Button>
            <Button className="flex-1 bg-[#DC2626] hover:bg-[#B91C1C] text-white" onClick={handleConfirmCancel} disabled={cancelSaving}>
              {cancelSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : `Confirm Rs. ${Number(cancelPreview?.refundableAmount || 0).toLocaleString("en-IN")}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AnimatedPage>
  )
}
