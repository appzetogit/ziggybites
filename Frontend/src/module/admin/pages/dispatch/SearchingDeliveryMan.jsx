import { useState, useMemo, useEffect } from "react"
import OrdersTopbar from "../../components/orders/OrdersTopbar"
import DispatchOrdersTable from "../../components/orders/DispatchOrdersTable"
import DispatchFilterPanel from "../../components/orders/DispatchFilterPanel"
import ViewOrderDialog from "../../components/orders/ViewOrderDialog"
import SettingsDialog from "../../components/orders/SettingsDialog"
import { useGenericTableManagement } from "../../components/orders/useGenericTableManagement"
import { adminAPI } from "@/lib/api"
import apiClient from "@/lib/api/axios"
import { toast } from "sonner"
import { Loader2, UserPlus } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

export default function SearchingDeliveryMan() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [visibleColumns, setVisibleColumns] = useState({
    sl: true,
    order: true,
    date: true,
    customer: true,
    restaurant: true,
    total: true,
    status: true,
    actions: true,
  })
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("")
  const [assignModalOpen, setAssignModalOpen] = useState(false)
  const [assignOrderId, setAssignOrderId] = useState(null)
  const [deliveryPartners, setDeliveryPartners] = useState([])
  const [partnersLoading, setPartnersLoading] = useState(false)
  const [assigning, setAssigning] = useState(false)

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery)
    }, 500) // 500ms delay

    return () => clearTimeout(timer)
  }, [searchQuery])

  // Fetch orders from API
  useEffect(() => {
    const fetchOrders = async () => {
      try {
        setLoading(true)
        const response = await adminAPI.getSearchingDeliverymanOrders({
          search: debouncedSearchQuery || undefined,
          limit: 1000 // Get all orders
        })

        if (response?.data?.success && response.data.data?.orders) {
          setOrders(response.data.data.orders)
        } else {
          setOrders([])
          if (response?.data?.message) {
            toast.error(response.data.message)
          }
        }
      } catch (error) {
        console.error("Error fetching searching deliveryman orders:", error)
        console.error("Error details:", {
          message: error.message,
          code: error.code,
          response: error.response ? {
            status: error.response.status,
            statusText: error.response.statusText,
            data: error.response.data
          } : null,
          request: error.request ? {
            url: error.config?.url,
            method: error.config?.method,
            baseURL: error.config?.baseURL
          } : null
        })
        
        if (error.response) {
          const status = error.response.status
          const errorData = error.response.data
          
          if (status === 401) {
            toast.error('Authentication required. Please login again.')
          } else if (status === 403) {
            toast.error('Access denied. You do not have permission.')
          } else if (status === 404) {
            toast.error('Endpoint not found. Please check backend server.')
          } else if (status >= 500) {
            toast.error('Server error. Please try again later.')
          } else {
            toast.error(errorData?.message || `Error ${status}: Failed to fetch orders`)
          }
        } else if (error.request) {
          toast.error('Cannot connect to server. Please check if backend is running.')
        } else {
          toast.error(error.message || 'Failed to fetch orders')
        }
        setOrders([])
      } finally {
        setLoading(false)
      }
    }

    fetchOrders()
  }, [debouncedSearchQuery])

  const {
    isFilterOpen,
    setIsFilterOpen,
    isSettingsOpen,
    setIsSettingsOpen,
    isViewOrderOpen,
    setIsViewOrderOpen,
    selectedOrder,
    filters,
    setFilters,
    filteredData,
    count,
    activeFiltersCount,
    handleApplyFilters,
    handleResetFilters,
    handleExport,
    handleViewOrder,
    handlePrintOrder,
    toggleColumn,
  } = useGenericTableManagement(
    orders,
    "Searching For Deliverymen Orders",
    ["id", "customerName", "restaurant", "customerPhone"]
  )

  const openAssignModal = async (orderId) => {
    setAssignOrderId(orderId)
    setAssignModalOpen(true)
    setPartnersLoading(true)
    try {
      const res = await apiClient.get("/admin/delivery-partners", { params: { status: "approved", limit: 200 } })
      if (res?.data?.success && Array.isArray(res.data.data)) {
        setDeliveryPartners(res.data.data)
      } else if (res?.data?.data?.deliveryPartners) {
        setDeliveryPartners(res.data.data.deliveryPartners)
      } else {
        setDeliveryPartners([])
      }
    } catch (e) {
      toast.error("Failed to fetch delivery partners")
      setDeliveryPartners([])
    } finally {
      setPartnersLoading(false)
    }
  }

  const handleAssign = async (partnerId) => {
    if (!assignOrderId || !partnerId) return
    setAssigning(true)
    try {
      const res = await apiClient.post(`/admin/orders/${assignOrderId}/assign-delivery`, { deliveryPartnerId: partnerId })
      if (res?.data?.success) {
        toast.success("Delivery partner assigned successfully")
        setAssignModalOpen(false)
        setOrders((prev) => prev.filter((o) => o.id !== assignOrderId && o._id !== assignOrderId))
      } else {
        toast.error(res?.data?.message || "Failed to assign")
      }
    } catch (e) {
      toast.error(e?.response?.data?.message || "Failed to assign delivery partner")
    } finally {
      setAssigning(false)
    }
  }

  const resetColumns = () => {
    setVisibleColumns({
      sl: true,
      order: true,
      date: true,
      customer: true,
      restaurant: true,
      total: true,
      status: true,
      actions: true,
    })
  }

  if (loading) {
    return (
      <div className="p-4 lg:p-6 bg-slate-50 min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          <p className="text-gray-600">Loading orders...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg sm:text-xl font-semibold text-gray-900">
            Searching For Deliverymen Orders
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            All orders that are currently searching for a deliveryman.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-600 border border-blue-100">
            Unassigned Orders: {count}
          </span>
        </div>
      </div>
      <OrdersTopbar 
        title="Searching For Deliverymen Orders" 
        count={count} 
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onFilterClick={() => setIsFilterOpen(true)}
        activeFiltersCount={activeFiltersCount}
        onExport={handleExport}
        onSettingsClick={() => setIsSettingsOpen(true)}
      />
      <DispatchFilterPanel
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        filters={filters}
        setFilters={setFilters}
        onApply={handleApplyFilters}
        onReset={handleResetFilters}
      />
      <SettingsDialog
        isOpen={isSettingsOpen}
        onOpenChange={setIsSettingsOpen}
        visibleColumns={visibleColumns}
        toggleColumn={toggleColumn}
        resetColumns={resetColumns}
        columnsConfig={{
          sl: "Serial Number",
          order: "Order",
          date: "Date",
          customer: "Customer",
          restaurant: "Restaurant",
          total: "Total Amount",
          status: "Order Status",
          actions: "Actions",
        }}
      />
      <ViewOrderDialog
        isOpen={isViewOrderOpen}
        onOpenChange={setIsViewOrderOpen}
        order={selectedOrder}
      />
      <DispatchOrdersTable 
        orders={filteredData} 
        visibleColumns={visibleColumns}
        onViewOrder={handleViewOrder}
        onPrintOrder={handlePrintOrder}
      />

      {/* Manual assign buttons per order */}
      {filteredData.length > 0 && (
        <div className="mt-4 bg-white rounded-lg border p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Assign Delivery Partner</h3>
          <div className="space-y-2">
            {filteredData.map((order) => (
              <div key={order.id || order._id} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
                <div>
                  <span className="text-sm font-medium text-gray-900">#{order.id || order.orderId}</span>
                  <span className="text-xs text-gray-500 ml-2">{order.restaurant || order.restaurantName}</span>
                </div>
                <Button
                  size="sm"
                  className="gap-1"
                  onClick={() => openAssignModal(order.id || order._id)}
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Assign
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Assign delivery partner modal */}
      <Dialog open={assignModalOpen} onOpenChange={setAssignModalOpen}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Assign Delivery Partner</DialogTitle>
          </DialogHeader>
          {partnersLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
            </div>
          ) : deliveryPartners.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">No delivery partners available</p>
          ) : (
            <div className="space-y-2 max-h-[50vh] overflow-y-auto">
              {deliveryPartners.map((dp) => (
                <div
                  key={dp._id}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-gray-50 transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">{dp.name}</p>
                    <p className="text-xs text-gray-500">{dp.phone} {dp.vehicle?.type ? `- ${dp.vehicle.type}` : ""}</p>
                    <p className="text-xs text-gray-400">
                      {dp.availability?.isOnline ? "Online" : "Offline"}
                      {dp.status ? ` - ${dp.status}` : ""}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    disabled={assigning}
                    onClick={() => handleAssign(dp._id)}
                  >
                    {assigning ? <Loader2 className="h-3 w-3 animate-spin" /> : "Assign"}
                  </Button>
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignModalOpen(false)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
