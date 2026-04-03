import { Link, useLocation } from "react-router-dom"
import { Home, Repeat, History, User } from "lucide-react"

// ZigZagLite – Red Theme (#DC2626)
const ZIGGY_ACTIVE = "text-[#DC2626]"
const ZIGGY_ACTIVE_BG = "bg-[#DC2626]"
const ZIGGY_INACTIVE = "text-gray-600 dark:text-gray-400"

export default function BottomNavigation() {
  const location = useLocation()

  const path = location.pathname
  const isHome = path === "/" || path === "/user"
  const isSubscription = path.startsWith("/subscription")
  const isHistory = path.startsWith("/orders") || path.startsWith("/user/orders")
  const isProfile = path.startsWith("/profile") || path.startsWith("/user/profile")

  return (
    <div
      className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-[#1a1a1a] border-t border-gray-200 dark:border-gray-800 z-50 shadow-lg"
    >
      <div className="flex items-center justify-around h-auto px-2 sm:px-4">
        {/* Home */}
        <Link
          to="/"
          className={`flex flex-col items-center gap-1.5 px-3 sm:px-4 py-2 transition-all duration-200 relative ${isHome ? ZIGGY_ACTIVE : ZIGGY_INACTIVE}`}
        >
          <Home className={`h-5 w-5 ${isHome ? "text-[#DC2626] fill-[#DC2626]" : ZIGGY_INACTIVE}`} strokeWidth={2} />
          <span className={`text-xs sm:text-sm font-medium ${isHome ? "text-[#DC2626] font-semibold" : ZIGGY_INACTIVE}`}>
            Home
          </span>
          {isHome && (
            <div className={`absolute top-0 left-0 right-0 h-0.5 ${ZIGGY_ACTIVE_BG} rounded-b-full`} />
          )}
        </Link>

        <div className="h-8 w-px bg-gray-300 dark:bg-gray-700" />

        {/* Subscription */}
        <Link
          to="/subscription"
          className={`flex flex-col items-center gap-1.5 px-3 sm:px-4 py-2 transition-all duration-200 relative ${isSubscription ? ZIGGY_ACTIVE : ZIGGY_INACTIVE}`}
        >
          <Repeat className={`h-5 w-5 ${isSubscription ? "text-[#DC2626] fill-[#DC2626]" : ZIGGY_INACTIVE}`} strokeWidth={2} />
          <span className={`text-xs sm:text-sm font-medium ${isSubscription ? "text-[#DC2626] font-semibold" : ZIGGY_INACTIVE}`}>
            Subscription
          </span>
          {isSubscription && (
            <div className={`absolute top-0 left-0 right-0 h-0.5 ${ZIGGY_ACTIVE_BG} rounded-b-full`} />
          )}
        </Link>

        <div className="h-8 w-px bg-gray-300 dark:bg-gray-700" />

        {/* History */}
        <Link
          to="/orders"
          className={`flex flex-col items-center gap-1.5 px-3 sm:px-4 py-2 transition-all duration-200 relative ${isHistory ? ZIGGY_ACTIVE : ZIGGY_INACTIVE}`}
        >
          <History className={`h-5 w-5 ${isHistory ? "text-[#DC2626] fill-[#DC2626]" : ZIGGY_INACTIVE}`} strokeWidth={2} />
          <span className={`text-xs sm:text-sm font-medium ${isHistory ? "text-[#DC2626] font-semibold" : ZIGGY_INACTIVE}`}>
            History
          </span>
          {isHistory && (
            <div className={`absolute top-0 left-0 right-0 h-0.5 ${ZIGGY_ACTIVE_BG} rounded-b-full`} />
          )}
        </Link>

        <div className="h-8 w-px bg-gray-300 dark:bg-gray-700" />

        {/* Profile */}
        <Link
          to="/profile"
          className={`flex flex-col items-center gap-1.5 px-3 sm:px-4 py-2 transition-all duration-200 relative ${isProfile ? ZIGGY_ACTIVE : ZIGGY_INACTIVE}`}
        >
          <User className={`h-5 w-5 ${isProfile ? "text-[#DC2626] fill-[#DC2626]" : ZIGGY_INACTIVE}`} />
          <span className={`text-xs sm:text-sm font-medium ${isProfile ? "text-[#DC2626] font-semibold" : ZIGGY_INACTIVE}`}>
            Profile
          </span>
          {isProfile && (
            <div className={`absolute top-0 left-0 right-0 h-0.5 ${ZIGGY_ACTIVE_BG} rounded-b-full`} />
          )}
        </Link>
      </div>
    </div>
  )
}
