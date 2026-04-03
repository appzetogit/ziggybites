import { X } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"

const MACRO_LABELS = {
  protein: "Protein",
  carbohydrate: "Carbohydrate",
  fat: "Fat",
  fibre: "Fibre",
}

const VITAMIN_LABELS = {
  vitaminA: "Vitamin A",
  vitaminB1: "Vitamin B1",
  vitaminB2: "Vitamin B2",
  vitaminB3: "Vitamin B3",
  vitaminB5: "Vitamin B5",
  vitaminB6: "Vitamin B6",
  vitaminB7: "Vitamin B7",
  vitaminB9: "Vitamin B9",
  vitaminB12: "Vitamin B12",
  vitaminC: "Vitamin C",
  vitaminD: "Vitamin D",
  vitaminE: "Vitamin E",
  vitaminK: "Vitamin K",
}

function formatValue(value, unit = "g") {
  if (value == null || value === "") return null
  const num = Number(value)
  if (isNaN(num)) return null
  return `${num} ${unit}`
}

export default function NutritionModal({ open, onClose, food }) {
  const hasMacros = food?.macronutrients && Object.values(food.macronutrients).some((v) => v != null && v !== "")
  const hasVitamins = food?.vitamins && Object.values(food.vitamins).some((v) => v != null && v !== "")
  const hasNutrition = food?.nutrition && Array.isArray(food.nutrition) && food.nutrition.length > 0
  const hasAllergies = food?.allergies && Array.isArray(food.allergies) && food.allergies.length > 0
  const hasAny = hasMacros || hasVitamins || hasNutrition || hasAllergies

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/50 z-[9998]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed left-0 right-0 bottom-0 md:left-1/2 md:right-auto md:-translate-x-1/2 md:bottom-auto md:top-1/2 md:-translate-y-1/2 z-[9999] bg-white dark:bg-[#1a1a1a] rounded-t-3xl md:rounded-3xl shadow-2xl max-h-[85vh] md:max-w-md w-full flex flex-col"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: 0.25, type: "spring", damping: 30, stiffness: 400 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-4 border-b dark:border-gray-800">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                Nutrition value
              </h2>
              <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
              {food?.food_name && (
                <p className="text-base font-medium text-gray-700 dark:text-gray-300">
                  {food.food_name}
                </p>
              )}

              {!hasAny && (
                <div className="space-y-2">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    No nutrition information available for this item.
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    The restaurant can add macronutrients and vitamins from their menu editor.
                  </p>
                </div>
              )}

              {hasMacros && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 uppercase tracking-wide">
                    Macronutrients (per serving)
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    {Object.entries(food.macronutrients).map(([key, value]) => {
                      const formatted = formatValue(value, "g")
                      if (!formatted) return null
                      return (
                        <div
                          key={key}
                          className="flex justify-between items-center border-b border-gray-100 dark:border-gray-800 pb-2"
                        >
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            {MACRO_LABELS[key] || key}
                          </span>
                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            {formatted}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {hasVitamins && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 uppercase tracking-wide">
                    Vitamins & Micronutrients (per serving)
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    {Object.entries(food.vitamins).map(([key, value]) => {
                      const formatted = formatValue(value, "mcg")
                      if (!formatted) return null
                      return (
                        <div
                          key={key}
                          className="flex justify-between items-center border-b border-gray-100 dark:border-gray-800 pb-2"
                        >
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            {VITAMIN_LABELS[key] || key}
                          </span>
                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            {formatted}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {hasNutrition && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 uppercase tracking-wide">
                    Nutrition
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {food.nutrition.map((item, index) => (
                      <span
                        key={index}
                        className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm rounded-lg"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {hasAllergies && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 uppercase tracking-wide">
                    Allergen info
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {food.allergies.map((item, index) => (
                      <span
                        key={index}
                        className="px-3 py-1.5 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 text-sm rounded-lg"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
