import { useLocation } from "react-router-dom"
import { useEffect, useState } from "react"
import BottomNavigation from "./BottomNavigation"
import { getUnreadDeliveryNotificationCount } from "../utils/deliveryNotifications"
import { isModuleAuthenticated } from "@/lib/utils/auth"
import { registerFcmTokenForDelivery } from "@/lib/notifications/fcmWeb"

export default function DeliveryLayout({
  children,
  showGig = false,
  showPocket = false,
  onHomeClick,
  onGigClick
}) {
  const location = useLocation()
  const [requestBadgeCount, setRequestBadgeCount] = useState(() =>
    getUnreadDeliveryNotificationCount()
  )

  useEffect(() => {
    let timeoutId = null

    const tryRegisterFcm = () => {
      if (!isModuleAuthenticated("delivery")) return

      if (timeoutId) clearTimeout(timeoutId)
      timeoutId = setTimeout(() => {
        registerFcmTokenForDelivery().catch(() => {})
        timeoutId = null
      }, 300)
    }

    tryRegisterFcm()
    window.addEventListener("deliveryAuthChanged", tryRegisterFcm)

    return () => {
      window.removeEventListener("deliveryAuthChanged", tryRegisterFcm)
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [])

  // Update badge count when location changes
  useEffect(() => {
    setRequestBadgeCount(getUnreadDeliveryNotificationCount())

    // Listen for notification updates
    const handleNotificationUpdate = () => {
      setRequestBadgeCount(getUnreadDeliveryNotificationCount())
    }

    window.addEventListener('deliveryNotificationsUpdated', handleNotificationUpdate)
    window.addEventListener('storage', handleNotificationUpdate)

    return () => {
      window.removeEventListener('deliveryNotificationsUpdated', handleNotificationUpdate)
      window.removeEventListener('storage', handleNotificationUpdate)
    }
  }, [location.pathname])

  // Pages where bottom navigation should be shown
  const showBottomNav = [
    '/delivery',
    '/delivery/requests',
    '/delivery/trip-history',
    '/delivery/profile'
  ].includes(location.pathname)

  return (
    <>
      <main>
        {children}
      </main>
      {showBottomNav && (
        <BottomNavigation
          showGig={showGig}
          showPocket={showPocket}
          onHomeClick={onHomeClick}
          onGigClick={onGigClick}
          requestBadgeCount={requestBadgeCount}
        />
      )}
    </>
  )
}
