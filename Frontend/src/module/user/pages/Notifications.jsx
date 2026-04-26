import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import {
  ArrowLeft,
  Bell,
  CheckCircle2,
  Clock,
  Tag,
  Gift,
  AlertCircle,
  Loader2,
} from "lucide-react"
import { toast } from "sonner"
import AnimatedPage from "../components/AnimatedPage"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { userAPI } from "@/lib/api"

function getNotificationVisual(notification) {
  const type = notification?.metadata?.type || notification?.source || "admin"

  if (type === "order") {
    return {
      icon: CheckCircle2,
      iconColor: "text-green-600",
      bgColor: "bg-green-100 dark:bg-green-900/40",
    }
  }

  if (type === "offer" || type === "promotion") {
    return {
      icon: Tag,
      iconColor: "text-red-600",
      bgColor: "bg-red-100 dark:bg-red-900/40",
    }
  }

  if (type === "alert") {
    return {
      icon: AlertCircle,
      iconColor: "text-orange-600",
      bgColor: "bg-orange-100 dark:bg-orange-900/40",
    }
  }

  return {
    icon: Gift,
    iconColor: "text-blue-600",
    bgColor: "bg-blue-100 dark:bg-blue-900/40",
  }
}

export default function Notifications() {
  const [notifications, setNotifications] = useState([])
  const [isLoading, setIsLoading] = useState(true)

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.read).length,
    [notifications],
  )

  const loadNotifications = async () => {
    try {
      setIsLoading(true)
      const response = await userAPI.getNotifications()
      setNotifications(response?.data?.data?.items || [])
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to load notifications")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadNotifications()
  }, [])

  const handleNotificationClick = async (notification) => {
    if (notification.read) {
      return
    }

    setNotifications((current) =>
      current.map((item) =>
        item.id === notification.id
          ? { ...item, read: true, readAt: new Date().toISOString() }
          : item,
      ),
    )

    try {
      await userAPI.markNotificationAsRead(notification.id)
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to update notification")
      await loadNotifications()
    }
  }

  return (
    <AnimatedPage className="min-h-screen bg-white dark:bg-[#0a0a0a]">
      <div className="max-w-md md:max-w-2xl lg:max-w-4xl xl:max-w-5xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 md:py-8">
        <div className="flex items-center gap-3 sm:gap-4 mb-4 md:mb-6 lg:mb-8">
          <Link to="/user">
            <Button variant="ghost" size="icon" className="rounded-full h-8 w-8 sm:h-10 sm:w-10">
              <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3 flex-1">
            <Bell className="h-5 w-5 sm:h-6 sm:w-6 text-red-600 fill-red-600" />
            <h1 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold text-gray-800 dark:text-white">Notifications</h1>
            {unreadCount > 0 && (
              <Badge className="bg-red-600 text-white text-xs md:text-sm">
                {unreadCount}
              </Badge>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="py-16 flex items-center justify-center gap-3 text-gray-500 dark:text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading notifications...</span>
          </div>
        ) : (
          <div className="space-y-3 md:space-y-4">
            {notifications.map((notification) => {
              const visual = getNotificationVisual(notification)
              const Icon = visual.icon
              const notificationTitle =
                notification.title ||
                notification.subject ||
                notification.metadata?.title ||
                "Notification"
              const notificationMessage =
                notification.message ||
                notification.body ||
                notification.description ||
                notification.text ||
                notification.metadata?.message ||
                notification.metadata?.body ||
                ""
              const notificationTime =
                notification.time ||
                notification.relativeTime ||
                notification.createdAt ||
                notification.sentAt ||
                ""

              return (
                <Card
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={`relative cursor-pointer transition-all duration-200 py-1 hover:shadow-md ${
                    !notification.read
                      ? "bg-red-50/50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                      : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                  }`}
                >
                  {!notification.read && (
                    <div className="absolute top-2 right-2 w-2.5 h-2.5 md:w-3 md:h-3 bg-red-600 rounded-full" />
                  )}

                  <CardContent className="p-3 md:p-4 lg:p-5">
                    <div className="flex items-start gap-3 sm:gap-4 md:gap-5">
                      <div className={`flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center ${visual.bgColor}`}>
                        <Icon className={`h-5 w-5 sm:h-6 sm:w-6 md:h-7 md:w-7 ${visual.iconColor}`} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <h3 className={`text-sm sm:text-base md:text-lg font-semibold mb-1 md:mb-2 ${
                          !notification.read ? "text-gray-900 dark:text-white" : "text-gray-700 dark:text-gray-300"
                        }`}>
                          {notificationTitle}
                        </h3>
                        <p className="text-xs sm:text-sm md:text-base text-gray-600 dark:text-gray-400 mb-2 md:mb-3 line-clamp-2">
                          {notificationMessage || "Open to view details"}
                        </p>
                        <div className="flex items-center gap-1 text-xs md:text-sm text-gray-500 dark:text-gray-400">
                          <Clock className="h-3 w-3 md:h-4 md:w-4" />
                          <span>{notificationTime}</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}

        {!isLoading && notifications.length === 0 && (
          <div className="text-center py-12 md:py-16 lg:py-20">
            <Bell className="h-16 w-16 md:h-20 md:w-20 lg:h-24 lg:w-24 text-gray-300 dark:text-gray-600 mx-auto mb-4 md:mb-5 lg:mb-6" />
            <h3 className="text-lg md:text-xl lg:text-2xl font-semibold text-gray-700 dark:text-gray-300 mb-2 md:mb-3">No notifications</h3>
            <p className="text-sm md:text-base text-gray-500 dark:text-gray-400">You're all caught up!</p>
          </div>
        )}
      </div>
    </AnimatedPage>
  )
}
