import { Routes, Route, Navigate } from "react-router-dom"
import ProtectedRoute from "@/components/ProtectedRoute"
import AuthRedirect from "@/components/AuthRedirect"
import UserLayout from "./UserLayout"
import { Suspense, lazy } from "react"
import Loader from "@/components/Loader"
import { useProfile } from "../context/ProfileContext"
import { isModuleAuthenticated } from "@/lib/utils/auth"

// Lazy Loading Pages

// Home & Discovery (ZigZagLite: no Dining, subscription-only)
const Home = lazy(() => import("../pages/Home"))
const CategoryPage = lazy(() => import("../pages/CategoryPage"))
const SubscriptionPage = lazy(() => import("../pages/SubscriptionPage"))
const SubscriptionManagementPage = lazy(() => import("../pages/SubscriptionManagementPage"))
const SubscriptionPlanDetailPage = lazy(() => import("../pages/SubscriptionPlanDetailPage"))
const SubscriptionPlansPage = lazy(() => import("../pages/SubscriptionPlansPage"))
const SubscriptionFoodBrowse = lazy(() => import("../pages/SubscriptionFoodBrowse"))
const SubscriptionEditMeal = lazy(() => import("../pages/SubscriptionEditMeal"))
const PreferencePage = lazy(() => import("../pages/PreferencePage"))
const HolyPujaPage = lazy(() => import("../pages/HolyPujaPage"))
const MangalsutraPage = lazy(() => import("../pages/MangalsutraPage"))

const RestaurantDetails = lazy(() => import("../pages/restaurants/RestaurantDetails"))
const SearchResults = lazy(() => import("../pages/SearchResults"))
const ProductDetail = lazy(() => import("../pages/ProductDetail"))
const FoodDetailPage = lazy(() => import("../pages/FoodDetailPage"))

// Cart
const Cart = lazy(() => import("../pages/cart/Cart"))
const Checkout = lazy(() => import("../pages/cart/Checkout"))

// Orders
const Orders = lazy(() => import("../pages/orders/Orders"))
const OrderTracking = lazy(() => import("../pages/orders/OrderTracking"))
const OrderInvoice = lazy(() => import("../pages/orders/OrderInvoice"))
const UserOrderDetails = lazy(() => import("../pages/orders/UserOrderDetails"))
const OrderChatScreen = lazy(() => import("@/module/usermain/pages/OrderChatScreen"))

// Offers
const Offers = lazy(() => import("../pages/Offers"))

// Gourmet
const Gourmet = lazy(() => import("../pages/Gourmet"))

// Top 10
const Top10 = lazy(() => import("../pages/Top10"))

// Collections
const Collections = lazy(() => import("../pages/Collections"))
const CollectionDetail = lazy(() => import("../pages/CollectionDetail"))

// Gift Cards
const GiftCards = lazy(() => import("../pages/GiftCards"))
const GiftCardCheckout = lazy(() => import("../pages/GiftCardCheckout"))

// Profile
const Profile = lazy(() => import("../pages/profile/Profile"))
const EditProfile = lazy(() => import("../pages/profile/EditProfile"))
const Payments = lazy(() => import("../pages/profile/Payments"))
const AddPayment = lazy(() => import("../pages/profile/AddPayment"))
const EditPayment = lazy(() => import("../pages/profile/EditPayment"))
const Favorites = lazy(() => import("../pages/profile/Favorites"))
const Settings = lazy(() => import("../pages/profile/Settings"))
const Coupons = lazy(() => import("../pages/profile/Coupons"))
const RedeemGoldCoupon = lazy(() => import("../pages/profile/RedeemGoldCoupon"))
const About = lazy(() => import("../pages/profile/About"))
const Terms = lazy(() => import("../pages/profile/Terms"))
const Privacy = lazy(() => import("../pages/profile/Privacy"))
const ContentPolicy = lazy(() => import("../pages/profile/ContentPolicy"))
const Refund = lazy(() => import("../pages/profile/Refund"))
const Shipping = lazy(() => import("../pages/profile/Shipping"))
const Cancellation = lazy(() => import("../pages/profile/Cancellation"))
const SendFeedback = lazy(() => import("../pages/profile/SendFeedback"))
const ReportSafetyEmergency = lazy(() => import("../pages/profile/ReportSafetyEmergency"))
const Accessibility = lazy(() => import("../pages/profile/Accessibility"))
const Logout = lazy(() => import("../pages/profile/Logout"))
const Addresses = lazy(() => import("../pages/profile/Addresses"))

// Auth
const SignIn = lazy(() => import("../pages/auth/SignIn"))
const OTP = lazy(() => import("../pages/auth/OTP"))
const AuthCallback = lazy(() => import("../pages/auth/AuthCallback"))

// Help
const Help = lazy(() => import("../pages/help/Help"))
const OrderHelp = lazy(() => import("../pages/help/OrderHelp"))

// Notifications
const Notifications = lazy(() => import("../pages/Notifications"))

// Wallet
const Wallet = lazy(() => import("../pages/Wallet"))

// Complaints
const SubmitComplaint = lazy(() => import("../pages/complaints/SubmitComplaint"))

function HomeGate() {
  const { userProfile, loading } = useProfile()
  const isAuthenticated = isModuleAuthenticated("user")

  if (!isAuthenticated) {
    return <Home />
  }

  if (loading) {
    return <Loader />
  }

  if (!userProfile?.preferences?.foodPreference) {
    return <Navigate to="/preference" replace />
  }

  return <Home />
}

function PreferenceGate() {
  const { userProfile, loading } = useProfile()
  const isAuthenticated = isModuleAuthenticated("user")

  if (!isAuthenticated) {
    return <Navigate to="/auth/sign-in" replace />
  }

  if (loading) {
    return <Loader />
  }

  if (userProfile?.preferences?.foodPreference) {
    return <Navigate to="/" replace />
  }

  return <PreferencePage />
}

export default function UserRouter() {
  return (
    <Suspense fallback={<Loader />}>
      <Routes>
        <Route element={<UserLayout />}>
          {/* Home & Discovery (ZigZagLite: subscription-only, no dine-in) */}
          <Route path="/" element={<HomeGate />} />
          <Route path="/preference" element={<PreferenceGate />} />
          <Route
            path="/subscription"
            element={
              <ProtectedRoute requiredRole="user" loginPath="/auth/sign-in">
                <SubscriptionPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/subscription/manage"
            element={
              <ProtectedRoute requiredRole="user" loginPath="/auth/sign-in">
                <SubscriptionManagementPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/subscription/edit-meal"
            element={
              <ProtectedRoute requiredRole="user" loginPath="/auth/sign-in">
                <SubscriptionEditMeal />
              </ProtectedRoute>
            }
          />
          <Route
            path="/subscription/browse/:category"
            element={
              <ProtectedRoute requiredRole="user" loginPath="/auth/sign-in">
                <SubscriptionFoodBrowse />
              </ProtectedRoute>
            }
          />
          <Route
            path="/subscription/plan/:durationDays"
            element={
              <ProtectedRoute requiredRole="user" loginPath="/auth/sign-in">
                <SubscriptionPlanDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/subscription/plans"
            element={
              <ProtectedRoute requiredRole="user" loginPath="/auth/sign-in">
                <SubscriptionPlansPage />
              </ProtectedRoute>
            }
          />
          <Route path="/holy-puja" element={<HolyPujaPage />} />
          <Route path="/mangalsutra" element={<MangalsutraPage />} />
          <Route path="/category/:category" element={<CategoryPage />} />

          <Route path="/restaurants/:slug" element={<RestaurantDetails />} />
          <Route path="/search" element={<SearchResults />} />
          <Route path="/product/:id" element={<ProductDetail />} />
          <Route path="/food/:id" element={<FoodDetailPage />} />

          {/* Cart - Protected */}
          <Route
            path="/cart"
            element={
              <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
                <Cart />
              </ProtectedRoute>
            }
          />
          <Route
            path="/cart/checkout"
            element={
              <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
                <Checkout />
              </ProtectedRoute>
            }
          />

          {/* Orders - Protected */}
          <Route
            path="/orders"
            element={
              <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
                <Orders />
              </ProtectedRoute>
            }
          />
          <Route
            path="/orders/:orderId"
            element={
              <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
                <OrderTracking />
              </ProtectedRoute>
            }
          />
          <Route
            path="/orders/:orderId/chat"
            element={
              <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
                <OrderChatScreen />
              </ProtectedRoute>
            }
          />
          <Route
            path="/orders/:orderId/invoice"
            element={
              <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
                <OrderInvoice />
              </ProtectedRoute>
            }
          />
          <Route
            path="/orders/:orderId/details"
            element={
              <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
                <UserOrderDetails />
              </ProtectedRoute>
            }
          />

          {/* Offers */}
          <Route path="/offers" element={<Offers />} />

          {/* Gourmet */}
          <Route path="/gourmet" element={<Gourmet />} />

          {/* Top 10 */}
          <Route path="/top-10" element={<Top10 />} />

          {/* Collections */}
          <Route path="/collections" element={<Collections />} />
          <Route
            path="/collections/:id"
            element={
              <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
                <CollectionDetail />
              </ProtectedRoute>
            }
          />

          {/* Gift Cards */}
          <Route path="/gift-card" element={<GiftCards />} />
          <Route
            path="/gift-card/checkout"
            element={
              <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
                <GiftCardCheckout />
              </ProtectedRoute>
            }
          />

          {/* Profile - Protected */}
          <Route
            path="/profile"
            element={
              <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
                <Profile />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile/edit"
            element={
              <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
                <EditProfile />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile/addresses"
            element={
              <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
                <Addresses />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile/payments"
            element={
              <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
                <Payments />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile/payments/new"
            element={
              <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
                <AddPayment />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile/payments/:id/edit"
            element={
              <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
                <EditPayment />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile/favorites"
            element={
              <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
                <Favorites />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile/settings"
            element={
              <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
                <Settings />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile/coupons"
            element={
              <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
                <Coupons />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile/redeem-gold-coupon"
            element={
              <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
                <RedeemGoldCoupon />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile/about"
            element={
              <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
                <About />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile/terms"
            element={
              <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
                <Terms />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile/privacy"
            element={
              <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
                <Privacy />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile/refund"
            element={
              <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
                <Refund />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile/shipping"
            element={
              <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
                <Shipping />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile/cancellation"
            element={
              <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
                <Cancellation />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile/send-feedback"
            element={
              <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
                <SendFeedback />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile/report-safety-emergency"
            element={
              <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
                <ReportSafetyEmergency />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile/accessibility"
            element={
              <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
                <Accessibility />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile/logout"
            element={
              <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
                <Logout />
              </ProtectedRoute>
            }
          />

          {/* Public legal pages (no login required) */}
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/content-policy" element={<ContentPolicy />} />

          {/* Auth */}
          <Route path="/auth/sign-in" element={<AuthRedirect module="user"><SignIn /></AuthRedirect>} />
          <Route path="/auth/otp" element={<AuthRedirect module="user"><OTP /></AuthRedirect>} />
          <Route path="/auth/callback" element={<AuthRedirect module="user"><AuthCallback /></AuthRedirect>} />

          {/* Help */}
          <Route path="/help" element={<Help />} />
          <Route path="/help/orders/:orderId" element={<OrderHelp />} />

          {/* Notifications - Protected */}
          <Route
            path="/notifications"
            element={
              <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
                <Notifications />
              </ProtectedRoute>
            }
          />

          {/* Wallet - Protected */}
          <Route
            path="/wallet"
            element={
              <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
                <Wallet />
              </ProtectedRoute>
            }
          />

          {/* Complaints - Protected */}
          <Route
            path="/complaints/submit/:orderId"
            element={
              <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
                <SubmitComplaint />
              </ProtectedRoute>
            }
          />
        </Route>
      </Routes>
    </Suspense>
  )
}

