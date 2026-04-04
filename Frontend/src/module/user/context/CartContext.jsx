// src/context/cart-context.jsx
import { createContext, useContext, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ArrowRightLeft, Store } from "lucide-react"

// Default cart context value to prevent errors during initial render
const defaultCartContext = {
  _isProvider: false, // Flag to identify if this is from the actual provider
  cart: [],
  items: [],
  itemCount: 0,
  total: 0,
  lastAddEvent: null,
  lastRemoveEvent: null,
  addToCart: () => {
    console.warn('CartProvider not available - addToCart called');
  },
  removeFromCart: () => {
    console.warn('CartProvider not available - removeFromCart called');
  },
  updateQuantity: () => {
    console.warn('CartProvider not available - updateQuantity called');
  },
  getCartCount: () => 0,
  isInCart: () => false,
  getCartItem: () => null,
  clearCart: () => {
    console.warn('CartProvider not available - clearCart called');
  },
  cleanCartForRestaurant: () => {
    console.warn('CartProvider not available - cleanCartForRestaurant called');
  },
  replacementRequest: null,
  confirmCartReplacement: () => {},
  cancelCartReplacement: () => {},
}

const normalizeRestaurantName = (name) => {
  if (!name) return ""
  return name.trim().toLowerCase()
}

const CartContext = createContext(defaultCartContext)

export function CartProvider({ children }) {
  // Safe init (works with SSR and bad JSON)
  const [cart, setCart] = useState(() => {
    if (typeof window === "undefined") return []
    try {
      const saved = localStorage.getItem("cart")
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })

  // Track last add event for animation
  const [lastAddEvent, setLastAddEvent] = useState(null)
  // Track last remove event for animation
  const [lastRemoveEvent, setLastRemoveEvent] = useState(null)
  const [replacementRequest, setReplacementRequest] = useState(null)

  // Persist to localStorage whenever cart changes
  useEffect(() => {
    try {
      localStorage.setItem("cart", JSON.stringify(cart))
    } catch {
      // ignore storage errors (private mode, quota, etc.)
    }
  }, [cart])

  // Clear cart when user logs out so new account gets empty cart
  useEffect(() => {
    const onLogout = () => setCart([])
    window.addEventListener("userLogout", onLogout)
    return () => window.removeEventListener("userLogout", onLogout)
  }, [])

  // Clear cart when user signs in or signs up (new or different account) so cart is always empty for the current user
  useEffect(() => {
    const onAuthChanged = () => setCart([])
    window.addEventListener("userAuthChanged", onAuthChanged)
    return () => window.removeEventListener("userAuthChanged", onAuthChanged)
  }, [])

  const detectRestaurantConflict = (item) => {
    if (!item) return null
    if (cart.length === 0) return null

    const firstItem = cart[0]
    const existingNameNormalized = normalizeRestaurantName(firstItem?.restaurant)
    const newNameNormalized = normalizeRestaurantName(item?.restaurant)

    if (existingNameNormalized && newNameNormalized) {
      if (existingNameNormalized !== newNameNormalized) {
        return {
          message: `Cart already contains items from "${firstItem?.restaurant || "another restaurant"}". Replacing will remove those items.`,
          existingRestaurantId: firstItem?.restaurantId,
          existingRestaurantName: firstItem?.restaurant,
          newRestaurantId: item?.restaurantId,
          newRestaurantName: item?.restaurant,
        }
      }
      return null
    }

    const firstRestaurantId = firstItem?.restaurantId
    const newRestaurantId = item?.restaurantId
    if (firstRestaurantId && newRestaurantId && String(firstRestaurantId) !== String(newRestaurantId)) {
      return {
        message: `Cart already contains items from "${firstItem?.restaurant || "another restaurant"}". Replacing will remove those items.`,
        existingRestaurantId: firstRestaurantId,
        existingRestaurantName: firstItem?.restaurant,
        newRestaurantId,
        newRestaurantName: item?.restaurant,
      }
    }

    return null
  }

  const addToCart = (item, sourcePosition = null) => {
    if (!item.restaurantId && !item.restaurant) {
      console.error('✘ Cannot add item: Missing restaurant information!', item);
      throw new Error('Item is missing restaurant information. Please refresh the page.');
    }

    const conflict = detectRestaurantConflict(item)
    if (conflict) {
      console.warn('⚠️ Cart conflict detected:', conflict)
      setReplacementRequest({
        ...conflict,
        newItem: { ...item },
        sourcePosition,
      })
      return
    }

    const lineKey = (i) => (i.selectedVariation?.variationId ? `${i.id}_${i.selectedVariation.variationId}` : i.id)
    const itemLineKey = lineKey(item)

    setCart((prev) => {
      const existing = prev.find((i) => lineKey(i) === itemLineKey)
      if (existing) {
        if (sourcePosition) {
          setLastAddEvent({
            product: {
              id: item.id,
              name: item.name,
              imageUrl: item.image || item.imageUrl,
            },
            sourcePosition,
          })
          setTimeout(() => setLastAddEvent(null), 1500)
        }
        return prev.map((i) =>
          lineKey(i) === itemLineKey ? { ...i, quantity: i.quantity + 1 } : i
        )
      }

      const newItem = { ...item, quantity: 1 }
      if (sourcePosition) {
        setLastAddEvent({
          product: {
            id: item.id,
            name: item.name,
            imageUrl: item.image || item.imageUrl,
          },
          sourcePosition,
        })
        setTimeout(() => setLastAddEvent(null), 1500)
      }

      return [...prev, newItem]
    })
  }
  const removeFromCart = (itemId, sourcePosition = null, productInfo = null, variationId = null) => {
    setCart((prev) => {
      const lineKey = (i) => (i.selectedVariation?.variationId ? `${i.id}_${i.selectedVariation.variationId}` : i.id)
      const targetKey = variationId != null ? `${itemId}_${variationId}` : itemId
      const itemToRemove = prev.find((i) => lineKey(i) === targetKey)
      if (itemToRemove && sourcePosition && productInfo) {
        // Set last remove event for animation
        setLastRemoveEvent({
          product: {
            id: productInfo.id || itemToRemove.id,
            name: productInfo.name || itemToRemove.name,
            imageUrl: productInfo.imageUrl || productInfo.image || itemToRemove.image || itemToRemove.imageUrl,
          },
          sourcePosition,
        })
        // Clear after animation completes
        setTimeout(() => setLastRemoveEvent(null), 1500)
      }
      return prev.filter((i) => lineKey(i) !== targetKey)
    })
  }

  const updateQuantity = (itemId, quantity, sourcePosition = null, productInfo = null, variationId = null) => {
    const targetKey = variationId != null ? `${itemId}_${variationId}` : itemId
    const lineKey = (i) => (i.selectedVariation?.variationId ? `${i.id}_${i.selectedVariation.variationId}` : i.id)
    if (quantity <= 0) {
      setCart((prev) => {
        const itemToRemove = prev.find((i) => lineKey(i) === targetKey)
        if (itemToRemove && sourcePosition && productInfo) {
          setLastRemoveEvent({
            product: {
              id: productInfo.id || itemToRemove.id,
              name: productInfo.name || itemToRemove.name,
              imageUrl: productInfo.imageUrl || productInfo.image || itemToRemove.image || itemToRemove.imageUrl,
            },
            sourcePosition,
          })
          setTimeout(() => setLastRemoveEvent(null), 1500)
        }
        return prev.filter((i) => lineKey(i) !== targetKey)
      })
      return
    }
    setCart((prev) => {
      const existingItem = prev.find((i) => lineKey(i) === targetKey)
      if (existingItem && quantity < existingItem.quantity && sourcePosition && productInfo) {
        setLastRemoveEvent({
          product: {
            id: productInfo.id || existingItem.id,
            name: productInfo.name || existingItem.name,
            imageUrl: productInfo.imageUrl || productInfo.image || existingItem.image || existingItem.imageUrl,
          },
          sourcePosition,
        })
        setTimeout(() => setLastRemoveEvent(null), 1500)
      }
      return prev.map((i) => (lineKey(i) === targetKey ? { ...i, quantity } : i))
    })
  }


  const cancelCartReplacement = () => {
    setReplacementRequest(null)
  }

  const confirmCartReplacement = () => {
    if (!replacementRequest) return

    const replacementItem = {
      ...replacementRequest.newItem,
      quantity: replacementRequest.newItem?.quantity || 1,
    }

    setReplacementRequest(null)
    setCart([replacementItem])

    if (replacementRequest.sourcePosition) {
      setLastAddEvent({
        product: {
          id: replacementItem.id,
          name: replacementItem.name,
          imageUrl: replacementItem.image || replacementItem.imageUrl,
        },
        sourcePosition: replacementRequest.sourcePosition,
      })
      setTimeout(() => setLastAddEvent(null), 1500)
    }
  }

  const getCartCount = () =>
    cart.reduce((total, item) => total + (item.quantity || 0), 0)

  const isInCart = (itemId, variationId = null) => {
    const targetKey = variationId != null ? `${itemId}_${variationId}` : itemId
    const lineKey = (i) => (i.selectedVariation?.variationId ? `${i.id}_${i.selectedVariation.variationId}` : i.id)
    return cart.some((i) => lineKey(i) === targetKey)
  }

  const getCartItem = (itemId, variationId = null) => {
    const targetKey = variationId != null ? `${itemId}_${variationId}` : itemId
    const lineKey = (i) => (i.selectedVariation?.variationId ? `${i.id}_${i.selectedVariation.variationId}` : i.id)
    return cart.find((i) => lineKey(i) === targetKey)
  }

  const clearCart = () => setCart([])

  // Clean cart to remove items from different restaurants
  // Keeps only items from the specified restaurant
  const cleanCartForRestaurant = (restaurantId, restaurantName) => {
    setCart((prev) => {
      if (prev.length === 0) return prev;
      
      // Normalize restaurant name for comparison
      const normalizeName = (name) => name ? name.trim().toLowerCase() : '';
      const targetRestaurantNameNormalized = normalizeName(restaurantName);
      
      // Filter cart to keep only items from the target restaurant
      const cleanedCart = prev.filter((item) => {
        const itemRestaurantId = item?.restaurantId;
        const itemRestaurantName = item?.restaurant;
        const itemRestaurantNameNormalized = normalizeName(itemRestaurantName);
        
        // Check by restaurant name first (more reliable)
        if (targetRestaurantNameNormalized && itemRestaurantNameNormalized) {
          return itemRestaurantNameNormalized === targetRestaurantNameNormalized;
        }
        // Fallback to ID comparison
        if (restaurantId && itemRestaurantId) {
          return itemRestaurantId === restaurantId || 
                 itemRestaurantId === restaurantId.toString() ||
                 itemRestaurantId.toString() === restaurantId;
        }
        // If no match, remove item
        return false;
      });
      
      if (cleanedCart.length !== prev.length) {
        console.warn('🧹 Cleaned cart: Removed items from different restaurants', {
          before: prev.length,
          after: cleanedCart.length,
          removed: prev.length - cleanedCart.length
        });
      }
      
      return cleanedCart;
    });
  }

  // Validate and clean cart on mount/load to prevent multiple restaurant items
  // This runs only once on initial load to clean up any corrupted cart data from localStorage
  useEffect(() => {
    if (cart.length === 0) return;
    
    // Get unique restaurant IDs and names
    const restaurantIds = cart.map(item => item.restaurantId).filter(Boolean);
    const restaurantNames = cart.map(item => item.restaurant).filter(Boolean);
    const uniqueRestaurantIds = [...new Set(restaurantIds)];
    const uniqueRestaurantNames = [...new Set(restaurantNames)];
    
    // Normalize restaurant names for comparison
    const normalizeName = (name) => name ? name.trim().toLowerCase() : '';
    const uniqueRestaurantNamesNormalized = uniqueRestaurantNames.map(normalizeName);
    const uniqueRestaurantNamesSet = new Set(uniqueRestaurantNamesNormalized);
    
    // Check if cart has items from multiple restaurants
    if (uniqueRestaurantIds.length > 1 || uniqueRestaurantNamesSet.size > 1) {
      console.warn('⚠️ Cart contains items from multiple restaurants. Cleaning cart...', {
        restaurantIds: uniqueRestaurantIds,
        restaurantNames: uniqueRestaurantNames
      });
      
      // Keep items from the first restaurant (most recent or first in cart)
      const firstRestaurantId = uniqueRestaurantIds[0];
      const firstRestaurantName = uniqueRestaurantNames[0];
      
      setCart((prev) => {
        const normalizeName = (name) => name ? name.trim().toLowerCase() : '';
        const firstRestaurantNameNormalized = normalizeName(firstRestaurantName);
        
        return prev.filter((item) => {
          const itemRestaurantId = item?.restaurantId;
          const itemRestaurantName = item?.restaurant;
          const itemRestaurantNameNormalized = normalizeName(itemRestaurantName);
          
          // Check by restaurant name first
          if (firstRestaurantNameNormalized && itemRestaurantNameNormalized) {
            return itemRestaurantNameNormalized === firstRestaurantNameNormalized;
          }
          // Fallback to ID comparison
          if (firstRestaurantId && itemRestaurantId) {
            return itemRestaurantId === firstRestaurantId || 
                   itemRestaurantId === firstRestaurantId.toString() ||
                   itemRestaurantId.toString() === firstRestaurantId;
          }
          return false;
        });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only run once on mount to clean up localStorage data

  // Transform cart to match AddToCartAnimation expected structure
  const cartForAnimation = useMemo(() => {
    const items = cart.map(item => ({
      product: {
        id: item.id,
        name: item.name,
        imageUrl: item.image || item.imageUrl,
      },
      quantity: item.quantity || 1,
    }))
    
    const itemCount = cart.reduce((total, item) => total + (item.quantity || 0), 0)
    const total = cart.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 0), 0)
    
    return {
      items,
      itemCount,
      total,
    }
  }, [cart])

  const value = useMemo(
    () => ({
      _isProvider: true, // Flag to identify this is from the actual provider
      // Keep original cart array for backward compatibility
      cart,
      // Add animation-compatible structure
      items: cartForAnimation.items,
      itemCount: cartForAnimation.itemCount,
      total: cartForAnimation.total,
      lastAddEvent,
      lastRemoveEvent,
      addToCart,
      removeFromCart,
      updateQuantity,
      getCartCount,
      isInCart,
      getCartItem,
      clearCart,
      cleanCartForRestaurant,
      replacementRequest,
      confirmCartReplacement,
      cancelCartReplacement,
    }),
    [cart, cartForAnimation, lastAddEvent, lastRemoveEvent, replacementRequest]
  )

  return (
    <CartContext.Provider value={value}>
      {children}
      <CartReplacementDialog
        request={replacementRequest}
        onConfirm={confirmCartReplacement}
        onCancel={cancelCartReplacement}
      />
    </CartContext.Provider>
  )
}

function CartReplacementDialog({ request, onConfirm, onCancel }) {
  if (!request) return null

  const existingName = request.existingRestaurantName || "your current cart"
  const newName = request.newRestaurantName || "this restaurant"
  const description =
    request.message ||
    `Replacing will remove items from ${existingName || "your cart"} and add items from ${newName}.`

  return (
    <Dialog open={Boolean(request)} onOpenChange={(open) => { if (!open) onCancel() }}>
      <DialogContent showCloseButton={false} className="w-[calc(100%-28px)] max-w-[340px] rounded-[28px] border-0 p-0 overflow-hidden shadow-[0_24px_60px_rgba(15,23,42,0.2)]">
        <div className="bg-gradient-to-br from-white via-white to-[#fff6f2] px-5 pb-5 pt-4">
          <DialogHeader className="text-center">
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#fff0ea] text-[#dc2626] shadow-sm">
              <ArrowRightLeft className="h-5 w-5" />
            </div>
            <DialogTitle className="mx-auto max-w-[240px] text-[20px] font-bold leading-6 text-[#1f1722]">
              Replace cart?
            </DialogTitle>
            <DialogDescription className="mx-auto mt-2 max-w-[260px] text-[13px] leading-5 text-[#6b6470]">
              {description}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 rounded-2xl border border-[#f2e4de] bg-white/90 px-4 py-3 text-left shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f7f7f8] text-[#1f1722]">
                <Store className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9b8f99]">
                  New restaurant
                </p>
                <p className="mt-1 truncate text-sm font-semibold text-[#1f1722]">
                  {newName}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-3 text-center text-[12px] font-medium text-[#8a7f89]">
            Current cart: <span className="text-[#1f1722]">{existingName}</span>
          </div>

          <DialogFooter className="mt-5 flex flex-col gap-2">
            <Button
              variant="outline"
              className="h-11 w-full rounded-2xl border-[#e8d8d1] bg-white text-sm font-semibold text-[#3b2d35] hover:bg-[#fff8f5]"
              onClick={onCancel}
            >
              Keep current cart
            </Button>
            <Button
              className="h-11 w-full rounded-2xl bg-[#dc2626] text-sm font-semibold text-white shadow-[0_12px_24px_rgba(220,38,38,0.22)] hover:bg-[#c21f1f]"
              onClick={onConfirm}
            >
              Replace with new items
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function useCart() {
  const context = useContext(CartContext)
  // Check if context is from the actual provider by checking the _isProvider flag
  if (!context || context._isProvider !== true) {
    // In development, log a warning but don't throw to prevent crashes
    if (process.env.NODE_ENV === 'development') {
      console.warn('⚠️ useCart called outside CartProvider. Using default values.');
      console.warn('💡 Make sure the component is rendered inside UserLayout which provides CartProvider.');
    }
    // Return default context instead of throwing
    return defaultCartContext
  }
  return context
}
