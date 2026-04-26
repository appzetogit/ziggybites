import { Link } from "react-router-dom"
import { ArrowLeft } from "lucide-react"
import AnimatedPage from "../../components/AnimatedPage"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { useEffect, useState } from "react"

const USER_NOTIFICATION_SETTINGS_KEY = "user_notification_settings"

export default function Settings() {
  const [settings, setSettings] = useState({
    emailNotifications: true,
    pushNotifications: true,
  })

  useEffect(() => {
    try {
      const stored = localStorage.getItem(USER_NOTIFICATION_SETTINGS_KEY)
      if (!stored) return
      const parsed = JSON.parse(stored)
      setSettings((prev) => ({
        ...prev,
        emailNotifications:
          typeof parsed?.emailNotifications === "boolean"
            ? parsed.emailNotifications
            : prev.emailNotifications,
        pushNotifications:
          typeof parsed?.pushNotifications === "boolean"
            ? parsed.pushNotifications
            : prev.pushNotifications,
      }))
    } catch (error) {
      console.warn("Failed to load user notification settings:", error)
    }
  }, [])

  const updateSetting = (key, value) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value }
      try {
        localStorage.setItem(USER_NOTIFICATION_SETTINGS_KEY, JSON.stringify(next))
      } catch (error) {
        console.warn("Failed to persist user notification settings:", error)
      }
      return next
    })
  }

  return (
    <AnimatedPage className="min-h-screen bg-[#f5f5f5] dark:bg-[#0a0a0a] p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Link to="/user/profile">
            <Button variant="ghost" size="icon" className="h-8 w-8 p-0">
              <ArrowLeft className="h-5 w-5 text-black dark:text-white" />
            </Button>
          </Link>
          <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-black dark:text-white">Notification settings</h1>
        </div>
        <Card className="bg-white dark:bg-[#1a1a1a] border-0 dark:border-gray-800">
          <CardHeader>
            <CardTitle className="text-gray-900 dark:text-white">Notifications & Preferences</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Email Notifications</Label>
                <p className="text-sm text-muted-foreground">
                  Receive updates about your orders via email
                </p>
              </div>
              <Switch
                checked={settings.emailNotifications}
                onCheckedChange={(checked) => updateSetting("emailNotifications", checked)}
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Push Notifications</Label>
                <p className="text-sm text-muted-foreground">
                  Receive push notifications on your device
                </p>
              </div>
              <Switch
                checked={settings.pushNotifications}
                onCheckedChange={(checked) => updateSetting("pushNotifications", checked)}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </AnimatedPage>
  )
}
