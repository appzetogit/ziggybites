import { Plus, Minus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useCart } from "../context/CartContext"
import { isModuleAuthenticated } from "@/lib/utils/auth"
import { useNavigate, useLocation } from "react-router-dom"
import { toast } from "sonner"

export default function AddToCartButton({ item, className = "" }) {
  const { addToCart, isInCart, getCartItem, updateQuantity } = useCart()
  const inCart = isInCart(item.id)
  const cartItem = getCartItem(item.id)
  const navigate = useNavigate()
  const location = useLocation()

  const handleAddToCart = (e) => {
    e.preventDefault()
    e.stopPropagation()

    if (!isModuleAuthenticated('user')) {
      toast.error("Please login to add items to cart")
      navigate('/user/auth/sign-in', { state: { from: location.pathname } })
      return
    }

    addToCart(item)
  }

  const handleIncrease = (e) => {
    e.preventDefault()
    e.stopPropagation()
    updateQuantity(item.id, (cartItem?.quantity || 0) + 1)
  }

  const handleDecrease = (e) => {
    e.preventDefault()
    e.stopPropagation()
    updateQuantity(item.id, (cartItem?.quantity || 0) - 1)
  }

  if (inCart) {
    return (
      <div
        className={`flex w-full items-center ${className}`.trim()}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
      >
        <div className="flex h-full w-full items-center justify-between border border-primary-orange rounded-xl bg-white overflow-hidden">
          <Button
            variant="ghost"
            size="icon"
            className="h-full w-12 rounded-none hover:bg-gray-100 text-primary-orange"
            onClick={handleDecrease}
          >
            <Minus className="h-4 w-4" />
          </Button>
          <span className="flex-1 px-2 text-sm font-semibold text-center text-gray-900">
            {cartItem?.quantity || 0}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-full w-12 rounded-none hover:bg-gray-100 text-primary-orange"
            onClick={handleIncrease}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>
    )
  }

  return (
    <Button
      size="sm"
      onClick={handleAddToCart}
      className={`bg-primary-orange hover:opacity-90 text-white ${className}`.trim()}
    >
      Add to Cart
    </Button>
  )
}
