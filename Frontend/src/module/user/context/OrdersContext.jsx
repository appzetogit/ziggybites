import { createContext, useContext, useState, useEffect } from "react"

const OrdersContext = createContext(null)

export function OrdersProvider({ children }) {
  const [orders, setOrders] = useState(() => {
    if (typeof window === "undefined") return []
    try {
      const saved = localStorage.getItem("userOrders")
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem("userOrders", JSON.stringify(orders))
    } catch {
      // ignore storage errors
    }
  }, [orders])

  const createOrder = () => {
    throw new Error("Local order creation is disabled. Use orderAPI.createOrder so the backend creates the single canonical order ID.")
  }

  const getOrderById = (orderId) => {
    return orders.find(order => order.id === orderId)
  }

  const getAllOrders = () => {
    return orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  }

  const updateOrderStatus = (orderId, status) => {
    setOrders(orders.map(order => {
      if (order.id === orderId) {
        const updatedTracking = { ...order.tracking }
        if (status === "preparing") {
          updatedTracking.preparing = { status: true, timestamp: new Date().toISOString() }
        } else if (status === "outForDelivery") {
          updatedTracking.outForDelivery = { status: true, timestamp: new Date().toISOString() }
        } else if (status === "delivered") {
          updatedTracking.delivered = { status: true, timestamp: new Date().toISOString() }
        }
        return {
          ...order,
          status,
          tracking: updatedTracking
        }
      }
      return order
    }))
  }

  const value = {
    orders,
    createOrder,
    getOrderById,
    getAllOrders,
    updateOrderStatus
  }

  return <OrdersContext.Provider value={value}>{children}</OrdersContext.Provider>
}

export function useOrders() {
  const context = useContext(OrdersContext)
  if (!context) {
    throw new Error("useOrders must be used within an OrdersProvider")
  }
  return context
}
