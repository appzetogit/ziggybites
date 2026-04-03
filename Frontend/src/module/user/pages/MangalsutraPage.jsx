import { Heart } from "lucide-react"

/**
 * ZigZagLite – Mangalsutra section (placeholder).
 * Bottom nav item as per spec.
 */
export default function MangalsutraPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pt-20 pb-24">
      <div className="max-w-2xl mx-auto px-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
          <Heart className="h-7 w-7 text-[#DC2626]" />
          Mangalsutra
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Content coming soon.
        </p>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8 text-center text-gray-500 dark:text-gray-400">
          This section will be available in a future update.
        </div>
      </div>
    </div>
  )
}
