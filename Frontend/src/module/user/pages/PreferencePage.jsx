import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Leaf, UtensilsCrossed, ArrowRight, Loader2, Sparkles, CheckCircle2 } from "lucide-react"
import AnimatedPage from "../components/AnimatedPage"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { userAPI } from "@/lib/api"
import { useProfile } from "../context/ProfileContext"

const OPTIONS = [
  {
    id: "healthy",
    title: "Healthy choices",
    description: "Prioritize items that restaurants have tagged as healthy.",
    icon: Leaf,
    accent: "from-emerald-500 to-green-600",
    border: "border-emerald-200",
    glow: "shadow-emerald-100",
    note: "Best for a wellness-focused feed",
  },
  {
    id: "all",
    title: "All items",
    description: "Browse the full menu selection from all partner restaurants.",
    icon: UtensilsCrossed,
    accent: "from-orange-500 to-amber-600",
    border: "border-orange-200",
    glow: "shadow-orange-100",
    note: "Best for the full discovery experience",
  },
]

export default function PreferencePage() {
  const navigate = useNavigate()
  const { userProfile, updateUserProfile } = useProfile()
  const [selected, setSelected] = useState(userProfile?.preferences?.foodPreference || "")
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (userProfile?.preferences?.foodPreference) {
      setSelected(userProfile.preferences.foodPreference)
    }
  }, [userProfile?.preferences?.foodPreference])

  const handleContinue = async () => {
    if (!selected || isSaving) return

    setIsSaving(true)
    setError("")

    const nextUserProfile = {
      ...(userProfile || {}),
      preferences: {
        ...(userProfile?.preferences || {}),
        foodPreference: selected,
      },
    }

    updateUserProfile(nextUserProfile)

    try {
      const response = await userAPI.updateProfile({
        preferences: {
          foodPreference: selected,
        },
      })

      const updatedUser =
        response?.data?.data?.user ||
        response?.data?.user ||
        nextUserProfile

      updateUserProfile(updatedUser)
    } catch (err) {
      // Keep the locally cached preference so the user can continue.
      console.warn("Failed to sync food preference to server:", err?.message || err)
    } finally {
      setIsSaving(false)
      navigate("/user", { replace: true })
    }
  }

  return (
    <AnimatedPage className="min-h-screen bg-[radial-gradient(circle_at_top,#fff7ed_0%,#fff_35%,#f8fafc_100%)] dark:bg-[radial-gradient(circle_at_top,#1f2937_0%,#111827_45%,#0a0a0a_100%)] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-5xl flex-col justify-center">
        <div className="mb-6 flex items-start gap-3 text-orange-600 sm:items-center">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white shadow-lg shadow-orange-100 ring-1 ring-orange-100 dark:bg-[#111827] dark:ring-orange-900/30">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-orange-500">
              Food Preference
            </p>
            <h1 className="text-2xl font-bold leading-tight text-slate-900 dark:text-white sm:text-3xl">
              Tell us what you'd like to see first
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
              This helps us personalize your home feed so you see the most relevant food items right away.
            </p>
          </div>
        </div>

        <Card className="overflow-hidden border border-slate-200/70 bg-white/90 p-4 shadow-2xl shadow-slate-200/60 backdrop-blur dark:border-slate-800/70 dark:bg-[#111827]/90 dark:shadow-black/30 sm:p-6">
          <div className="mb-6 grid gap-4 lg:grid-cols-2">
            {OPTIONS.map((option) => {
              const Icon = option.icon
              const isSelected = selected === option.id

              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setSelected(option.id)}
                  className={`group rounded-3xl border p-5 text-left transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:ring-offset-2 dark:focus:ring-offset-[#111827] ${
                    isSelected
                      ? `${option.border} bg-gradient-to-br ${option.accent} text-white shadow-xl ${option.glow}`
                      : "border-slate-200 bg-white text-slate-900 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-[#0f172a] dark:text-white dark:hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-3">
                      <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${isSelected ? "bg-white/15" : "bg-slate-100 dark:bg-slate-800"}`}>
                        <Icon className={`h-6 w-6 ${isSelected ? "text-white" : "text-orange-500"}`} />
                      </div>
                      <div className="space-y-2">
                        <h2 className="text-xl font-bold tracking-tight">{option.title}</h2>
                        <p className={`mt-2 text-sm leading-6 ${isSelected ? "text-white/90" : "text-slate-600 dark:text-slate-300"}`}>
                          {option.description}
                        </p>
                        <p className={`text-xs font-medium uppercase tracking-[0.22em] ${isSelected ? "text-white/80" : "text-slate-400 dark:text-slate-500"}`}>
                          {option.note}
                        </p>
                      </div>
                    </div>

                    <div
                      className={`mt-1 flex h-6 w-6 items-center justify-center rounded-full border-2 ${
                        isSelected
                          ? "border-white bg-white"
                          : "border-slate-300 dark:border-slate-600"
                      }`}
                    >
                      {isSelected && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-200 pt-5 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-slate-600 dark:text-slate-300">
              <p className="font-medium text-slate-900 dark:text-white">You can update this anytime from your profile settings.</p>
              {error && <p className="mt-1 text-amber-600 dark:text-amber-400">{error}</p>}
            </div>

            <Button
              type="button"
              onClick={handleContinue}
              disabled={!selected || isSaving}
              className="inline-flex h-12 items-center gap-2 rounded-2xl bg-slate-900 px-5 text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving preference
                </>
              ) : (
                <>
                  Save and continue
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </Card>
      </div>
    </AnimatedPage>
  )
}
