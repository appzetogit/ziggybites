import { ShieldAlert } from "lucide-react"

export default function ApprovalPendingPopup({
  title = "Admin approval pending",
  message = "Your account is under admin review. This popup will disappear automatically once approved.",
  className = "",
}) {
  return (
    <div className={`fixed top-4 left-1/2 z-[120] w-[calc(100%-24px)] max-w-md -translate-x-1/2 ${className}`}>
      <div className="rounded-2xl border border-red-200 bg-white shadow-[0_20px_50px_rgba(0,0,0,0.14)]">
        <div className="flex items-start gap-3 px-4 py-4">
          <div className="mt-0.5 rounded-full bg-red-100 p-2 text-red-600">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-black">{title}</p>
            <p className="mt-1 text-xs leading-5 text-gray-600">{message}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
