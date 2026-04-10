import { MessageCircle } from "lucide-react"

export default function WhatsAppSupport() {
  const phoneNumber = "+919769203828"
  const message = "Hi, I need help with my subscription on Ziggybites."
  const whatsappUrl = `https://wa.me/${phoneNumber.replace('+', '')}?text=${encodeURIComponent(message)}`

  return (
    <a
      href={whatsappUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-20 right-4 z-40 rounded-full bg-[#DC2626] p-3 text-white shadow-lg md:bottom-6"
      title="Contact WhatsApp Support"
    >
      <MessageCircle className="h-6 w-6" />
      <span className="sr-only">WhatsApp Support</span>
    </a>
  )
}
