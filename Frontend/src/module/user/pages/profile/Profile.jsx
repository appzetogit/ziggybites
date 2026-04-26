import { useState, useEffect } from "react"
import { Link, useNavigate } from "react-router-dom"
import { motion } from "framer-motion"
import {
  ArrowLeft,
  ChevronRight,
  Wallet,
  Tag,
  User,
  Leaf,
  Palette,
  Bookmark,
  Building2,
  Sun,
  Check,
  Percent,
  Info,
  PenSquare,
  AlertTriangle,
  Settings as SettingsIcon,
  Power,
  ShoppingCart,
  UtensilsCrossed,
  Loader2
} from "lucide-react"

import AnimatedPage from "../../components/AnimatedPage"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useProfile } from "../../context/ProfileContext"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useCompanyName } from "@/lib/hooks/useCompanyName"
import OptimizedImage from "@/components/OptimizedImage"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export default function Profile() {
  const { userProfile, vegMode, setVegMode, updateUserProfile } = useProfile()
  const navigate = useNavigate()
  const companyName = useCompanyName()

  // Popup states
  const [vegModeOpen, setVegModeOpen] = useState(false)
  const [foodPreferenceOpen, setFoodPreferenceOpen] = useState(false)
  const [isSavingFoodPreference, setIsSavingFoodPreference] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  // Get first letter of name for avatar
  const avatarInitial = userProfile?.name?.charAt(0)?.toUpperCase() || userProfile?.phone?.charAt(1)?.toUpperCase() || 'U'
  const displayName = userProfile?.name || userProfile?.phone || 'User'
  // Only show email if it exists and is valid, otherwise show phone or "Not available"
  const hasValidEmail = userProfile?.email && userProfile.email.trim() !== '' && userProfile.email.includes('@')
  const displayEmail = hasValidEmail ? userProfile.email : (userProfile?.phone || 'Not available')
  const foodPreference = userProfile?.preferences?.foodPreference || "all"
  const foodPreferenceLabel = foodPreference === "healthy" ? "Healthy choices" : "All items"

  const handleFoodPreferenceChange = async (nextPreference) => {
    if (!nextPreference || nextPreference === foodPreference || isSavingFoodPreference) {
      setFoodPreferenceOpen(false)
      return
    }

    setIsSavingFoodPreference(true)

    const nextUserProfile = {
      ...(userProfile || {}),
      preferences: {
        ...(userProfile?.preferences || {}),
        foodPreference: nextPreference,
      },
    }

    updateUserProfile(nextUserProfile)

    try {
      const response = await authAPI.updateProfile({
        preferences: {
          foodPreference: nextPreference,
        },
      })

      const updatedUser =
        response?.data?.data?.user ||
        response?.data?.user ||
        nextUserProfile

      updateUserProfile(updatedUser)
    } catch (error) {
      console.warn("Failed to sync food preference:", error?.message || error)
    } finally {
      setIsSavingFoodPreference(false)
      setFoodPreferenceOpen(false)
    }
  }

  // Calculate profile completion percentage
  const calculateProfileCompletion = () => {
    if (!userProfile) return 0

    // Helper function to check if date field is filled (handles Date objects, date strings, ISO strings)
    const isDateFilled = (dateField) => {
      if (!dateField) return false

      // Check if it's a Date object
      if (dateField instanceof Date) {
        return !isNaN(dateField.getTime())
      }

      // Check if it's a string
      if (typeof dateField === 'string') {
        const trimmed = dateField.trim()
        if (trimmed === '' || trimmed === 'null' || trimmed === 'undefined') return false

        // Try to parse as date (handles various formats: YYYY-MM-DD, ISO strings, etc.)
        const date = new Date(trimmed)
        if (!isNaN(date.getTime())) {
          // Valid date
          return true
        }
      }

      return false
    }

    // Check name - must have value
    const hasName = !!(userProfile.name &&
      typeof userProfile.name === 'string' &&
      userProfile.name.trim() !== '')

    // Check contact - phone OR email (at least one)
    const hasPhone = !!(userProfile.phone &&
      typeof userProfile.phone === 'string' &&
      userProfile.phone.trim() !== '')
    const hasContact = hasPhone || hasValidEmail

    // Check profile image - must have URL string
    const hasImage = !!(userProfile.profileImage &&
      typeof userProfile.profileImage === 'string' &&
      userProfile.profileImage.trim() !== '' &&
      userProfile.profileImage !== 'null' &&
      userProfile.profileImage !== 'undefined')

    // Check date of birth
    const hasDateOfBirth = isDateFilled(userProfile.dateOfBirth)

    // Check gender - must be valid value
    const validGenders = ['male', 'female', 'other', 'prefer-not-to-say']
    const hasGender = !!(userProfile.gender &&
      typeof userProfile.gender === 'string' &&
      userProfile.gender.trim() !== '' &&
      validGenders.includes(userProfile.gender.trim().toLowerCase()))

    // Required fields only (anniversary is NOT counted - it's optional)
    // Only these 5 fields count towards 100%
    const requiredFields = {
      name: hasName,
      contact: hasContact,
      profileImage: hasImage,
      dateOfBirth: hasDateOfBirth,
      gender: hasGender,
    }

    const totalRequiredFields = 5 // Fixed: name, contact, profileImage, dateOfBirth, gender
    const completedRequiredFields = Object.values(requiredFields).filter(Boolean).length

    // Calculate percentage based ONLY on required fields (anniversary NOT included)
    const percentage = Math.round((completedRequiredFields / totalRequiredFields) * 100)

    // Always log for debugging (remove in production if needed)
    console.log('🔍 Profile completion check:', {
      requiredFields,
      completedRequiredFields,
      totalRequiredFields,
      percentage,
      fieldStatus: {
        name: hasName ? '✅' : '❌',
        contact: hasContact ? '✅' : '❌',
        profileImage: hasImage ? '✅' : '❌',
        dateOfBirth: hasDateOfBirth ? '✅' : '❌',
        gender: hasGender ? '✅' : '❌',
      },
      rawData: {
        name: userProfile.name || 'missing',
        phone: userProfile.phone || 'missing',
        email: userProfile.email || 'missing',
        profileImage: userProfile.profileImage ? 'exists' : 'missing',
        dateOfBirth: userProfile.dateOfBirth ? String(userProfile.dateOfBirth) : 'missing',
        gender: userProfile.gender || 'missing',
      }
    })

    return percentage
  }

  const profileCompletion = calculateProfileCompletion()
  const isComplete = profileCompletion === 100

  const handleLogout = () => {
    if (isLoggingOut) return
    navigate("/user/profile/logout")
  }

  return (
    <AnimatedPage className="min-h-screen bg-[#f5f5f5] dark:bg-[#0a0a0a]">
      <div className="max-w-md md:max-w-2xl lg:max-w-4xl xl:max-w-5xl mx-auto px-4 sm:px-6 md:px-8 lg:px-10 xl:px-12 py-4 sm:py-6 md:py-8 lg:py-10">
        {/* Back Arrow */}
        <div className="mb-4">
          <Link to="/user">
            <Button variant="ghost" size="icon" className="h-8 w-8 p-0">
              <ArrowLeft className="h-5 w-5 text-black dark:text-white" />
            </Button>
          </Link>
        </div>

        {/* Profile Info Card */}
        <Card className="bg-white dark:bg-[#1a1a1a] rounded-2xl py-0 pt-1 shadow-sm mb-0 border-0 dark:border-gray-800 overflow-hidden">
          <CardContent className="p-4 py-0 pt-2">
            <div className="flex items-start gap-4 mb-4">
              <motion.div
                whileHover={{ scale: 1.1, rotate: 5 }}
                transition={{ duration: 0.3, type: "spring", stiffness: 300 }}
              >
                <Avatar className="h-16 w-16 bg-blue-300 border-0">
                  {userProfile?.profileImage && (
                    <AvatarImage
                      src={userProfile.profileImage && userProfile.profileImage.trim() ? userProfile.profileImage : undefined}
                      alt={displayName}
                    />
                  )}
                  <AvatarFallback className="bg-blue-300 text-white text-2xl font-semibold">
                    {avatarInitial}
                  </AvatarFallback>
                </Avatar>
              </motion.div>
              <div className="flex-1 pt-1">
                <h2 className="text-xl font-bold text-black dark:text-white mb-1">{displayName}</h2>
                {hasValidEmail && (
                  <p className="text-sm text-black dark:text-gray-300 mb-1">{userProfile.email}</p>
                )}
                {userProfile?.phone && (
                  <p className={`text-sm ${hasValidEmail ? 'text-gray-600 dark:text-gray-400' : 'text-black dark:text-white'} mb-3`}>
                    {userProfile.phone}
                  </p>
                )}
                {!hasValidEmail && !userProfile?.phone && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">Not available</p>
                )}
                {/* <Link to="/user/profile/activity" className="flex items-center gap-1 text-green-600 text-sm font-medium">
                  View activity
                  <ChevronRight className="h-4 w-4" />
                </Link> */}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ZiggyBites Money and Coupons - Side by Side */}
        <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 lg:gap-5 mt-3 mb-3">
          <Link to="/user/wallet" className="h-full">
            <motion.div
              whileHover={{ y: -4, scale: 1.02 }}
              transition={{ duration: 0.2, type: "spring", stiffness: 300 }}
            >
              <Card className="bg-white dark:bg-[#1a1a1a] py-0 rounded-xl shadow-sm border-0 dark:border-gray-800 cursor-pointer h-full">
                <CardContent className="p-4 h-full flex items-center gap-3">
                  <motion.div
                    className="bg-gray-100 dark:bg-gray-800 rounded-full p-2 flex-shrink-0"
                    whileHover={{ rotate: 360, scale: 1.1 }}
                    transition={{ duration: 0.5 }}
                  >
                    <Wallet className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                  </motion.div>
                  <div className="flex-1 min-w-0 flex flex-col">
                    <span className="text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap">{companyName} Money</span>
                    <span className="text-base font-semibold text-green-600 dark:text-green-400">₹{userProfile?.wallet?.balance?.toFixed(0) || '0'}</span>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </Link>

          <Link to="/user/profile/coupons" className="h-full">
            <motion.div
              whileHover={{ y: -4, scale: 1.02 }}
              transition={{ duration: 0.2, type: "spring", stiffness: 300 }}
            >
              <Card className="bg-white dark:bg-[#1a1a1a] py-0 rounded-xl shadow-sm border-0 dark:border-gray-800 cursor-pointer h-full">
                <CardContent className="p-4 h-full flex items-center gap-3">
                  <motion.div
                    className="bg-gray-100 dark:bg-gray-800 rounded-full p-2 flex-shrink-0"
                    whileHover={{ rotate: 360, scale: 1.1 }}
                    transition={{ duration: 0.5 }}
                  >
                    <Tag className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                  </motion.div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">Your coupons</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </Link>
        </div>

        {/* Account Options */}
        <div className="space-y-2 mb-3">

          <Link to="/user/cart" className="block">
            <motion.div
              whileHover={{ x: 4, scale: 1.01 }}
              transition={{ duration: 0.2, type: "spring", stiffness: 300 }}
            >
              <Card className="bg-white dark:bg-[#1a1a1a] py-0 rounded-xl shadow-sm border-0 dark:border-gray-800 cursor-pointer">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <motion.div
                      className="bg-gray-100 dark:bg-gray-800 rounded-full p-2"
                      whileHover={{ rotate: 15, scale: 1.1 }}
                      transition={{ duration: 0.3 }}
                    >
                      <ShoppingCart className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                    </motion.div>
                    <span className="text-base font-medium text-gray-900 dark:text-white">Your cart</span>
                  </div>
                  <motion.div
                    whileHover={{ x: 4 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ChevronRight className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                  </motion.div>
                </CardContent>
              </Card>
            </motion.div>
          </Link>


          <Link to="/user/profile/edit" className="block">
            <motion.div
              whileHover={{ x: 4, scale: 1.01 }}
              transition={{ duration: 0.2, type: "spring", stiffness: 300 }}
            >
              <Card className="bg-white dark:bg-[#1a1a1a] py-0 rounded-xl shadow-sm border-0 dark:border-gray-800 cursor-pointer">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <motion.div
                      className="bg-gray-100 dark:bg-gray-800 rounded-full p-2"
                      whileHover={{ rotate: 15, scale: 1.1 }}
                      transition={{ duration: 0.3 }}
                    >
                      <User className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                    </motion.div>
                    <span className="text-base font-medium text-gray-900 dark:text-white">Your profile</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <motion.span
                      className={`text-xs font-medium px-2 py-1 rounded ${isComplete
                        ? 'bg-green-100 text-green-700 border border-green-300'
                        : 'bg-yellow-200 text-yellow-800'
                        }`}
                      whileHover={{ scale: 1.1 }}
                      transition={{ duration: 0.2 }}
                    >
                      {profileCompletion}% completed
                    </motion.span>
                    <motion.div
                      whileHover={{ x: 4 }}
                      transition={{ duration: 0.2 }}
                    >
                      <ChevronRight className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                    </motion.div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </Link>

          <motion.div
            whileHover={{ x: 4, scale: 1.01 }}
            transition={{ duration: 0.2, type: "spring", stiffness: 300 }}
          >
            <Card
              className="bg-white dark:bg-[#1a1a1a] py-0 rounded-xl shadow-sm border-0 dark:border-gray-800 cursor-pointer"
              onClick={() => setVegModeOpen(true)}
            >
              <CardContent className="p-4  flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <motion.div
                    className="bg-gray-100 dark:bg-gray-800 rounded-full p-2"
                    whileHover={{ rotate: 15, scale: 1.1 }}
                    transition={{ duration: 0.3 }}
                  >
                    <Leaf className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                  </motion.div>
                  <span className="text-base font-medium text-gray-900 dark:text-white">Veg Mode</span>
                </div>
                <div className="flex items-center gap-2">
                  <motion.span
                    className="text-base font-medium text-gray-900 dark:text-white"
                    whileHover={{ scale: 1.1 }}
                    transition={{ duration: 0.2 }}
                  >
                    {vegMode ? 'ON' : 'OFF'}
                  </motion.span>
                  <motion.div
                    whileHover={{ x: 4 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ChevronRight className="h-5 w-5 text-gray-400" />
                  </motion.div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            whileHover={{ x: 4, scale: 1.01 }}
            transition={{ duration: 0.2, type: "spring", stiffness: 300 }}
          >
            <Card
              className="bg-white dark:bg-[#1a1a1a] py-0 rounded-xl shadow-sm border-0 dark:border-gray-800 cursor-pointer"
              onClick={() => setFoodPreferenceOpen(true)}
            >
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <motion.div
                    className="bg-gray-100 dark:bg-gray-800 rounded-full p-2"
                    whileHover={{ rotate: 15, scale: 1.1 }}
                    transition={{ duration: 0.3 }}
                  >
                    <UtensilsCrossed className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                  </motion.div>
                  <div className="flex flex-col">
                    <span className="text-base font-medium text-gray-900 dark:text-white">Food preference</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {foodPreferenceLabel}
                    </span>
                  </div>
                </div>
                <motion.div
                  whileHover={{ x: 4 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronRight className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                </motion.div>
              </CardContent>
            </Card>
          </motion.div>

        </div>

        {/* Collections Section */}
        <div className="mb-3">
          <div className="flex items-center gap-2 mb-2 px-1">
            <div className="w-1 h-4 bg-green-600 rounded"></div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Collections</h3>
          </div>
          <Link to="/user/profile/favorites">
            <motion.div
              whileHover={{ x: 4, scale: 1.01 }}
              transition={{ duration: 0.2, type: "spring", stiffness: 300 }}
            >
              <Card className="bg-white dark:bg-[#1a1a1a] py-0 rounded-xl shadow-sm border-0 dark:border-gray-800 cursor-pointer">
                <CardContent className="p-4  flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <motion.div
                      className="bg-gray-100 dark:bg-gray-800 rounded-full p-2"
                      whileHover={{ rotate: 15, scale: 1.1 }}
                      transition={{ duration: 0.3 }}
                    >
                      <Bookmark className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                    </motion.div>
                    <span className="text-base font-medium text-gray-900 dark:text-white">Your collections</span>
                  </div>
                  <motion.div
                    whileHover={{ x: 4 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ChevronRight className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                  </motion.div>
                </CardContent>
              </Card>
            </motion.div>
          </Link>
        </div>

        {/* Food Orders Section */}
        <div className="mb-3">
          <div className="flex items-center gap-2 mb-2 px-1">
            <div className="w-1 h-4 bg-green-600 rounded"></div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Food Orders</h3>
          </div>
          <div className="space-y-2">
            <Link to="/user/orders" className="block">
              <motion.div
                whileHover={{ x: 4, scale: 1.01 }}
                transition={{ duration: 0.2, type: "spring", stiffness: 300 }}
              >
                <Card className="bg-white dark:bg-[#1a1a1a] py-0 rounded-xl shadow-sm border-0 dark:border-gray-800 cursor-pointer">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <motion.div
                        className="bg-gray-100 dark:bg-gray-800 rounded-full p-2"
                        whileHover={{ rotate: 15, scale: 1.1 }}
                        transition={{ duration: 0.3 }}
                      >
                        <Building2 className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                      </motion.div>
                      <span className="text-base font-medium text-gray-900 dark:text-white">Your orders</span>
                    </div>
                    <motion.div
                      whileHover={{ x: 4 }}
                      transition={{ duration: 0.2 }}
                    >
                      <ChevronRight className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                    </motion.div>
                  </CardContent>
                </Card>
              </motion.div>
            </Link>
          </div>
        </div>

        {/* Subscription Section (ZigZagLite: no dine-in) */}
        <div className="mb-3">
          <div className="flex items-center gap-2 mb-2 px-1">
            <div className="w-1 h-4 bg-[#DC2626] rounded"></div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Subscription</h3>
          </div>
          <div className="space-y-2">
            <Link to="/subscription" className="block">
              <motion.div
                whileHover={{ x: 4, scale: 1.01 }}
                transition={{ duration: 0.2, type: "spring", stiffness: 300 }}
              >
                <Card className="bg-white dark:bg-[#1a1a1a] py-0 rounded-xl shadow-sm border-0 dark:border-gray-800 cursor-pointer">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <motion.div
                        className="bg-[#DC2626]/10 dark:bg-[#DC2626]/20 rounded-full p-2"
                        whileHover={{ rotate: 15, scale: 1.1 }}
                        transition={{ duration: 0.3 }}
                      >
                        <UtensilsCrossed className="h-5 w-5 text-[#DC2626] dark:text-red-400" />
                      </motion.div>
                      <span className="text-base font-medium text-gray-900 dark:text-white">My subscriptions</span>
                    </div>
                    <motion.div
                      whileHover={{ x: 4 }}
                      transition={{ duration: 0.2 }}
                    >
                      <ChevronRight className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                    </motion.div>
                  </CardContent>
                </Card>
              </motion.div>
            </Link>
          </div>
        </div>

        {/* Coupons Section */}
        <div className="mb-3">
          <div className="flex items-center gap-2 mb-2 px-1">
            <div className="w-1 h-4 bg-green-600 rounded"></div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Coupons</h3>
          </div>
          <Link to="/profile/redeem-gold-coupon">
            <motion.div
              whileHover={{ x: 4, scale: 1.01 }}
              transition={{ duration: 0.2, type: "spring", stiffness: 300 }}
            >
              <Card className="bg-white dark:bg-[#1a1a1a] py-0 rounded-xl shadow-sm border-0 dark:border-gray-800 cursor-pointer">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <motion.div
                      className="bg-gray-100 dark:bg-gray-800 rounded-full p-2"
                      whileHover={{ rotate: 15, scale: 1.1 }}
                      transition={{ duration: 0.3 }}
                    >
                      <Percent className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                    </motion.div>
                    <span className="text-base font-medium text-gray-900 dark:text-white">Redeem Gold coupon</span>
                  </div>
                  <motion.div
                    whileHover={{ x: 4 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ChevronRight className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                  </motion.div>
                </CardContent>
              </Card>
            </motion.div>
          </Link>
        </div>

        {/* More Section */}
        <div className="mb-6 pb-4">
          <div className="flex items-center gap-2 mb-2 px-1">
            <div className="w-1 h-4 bg-green-600 rounded"></div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">More</h3>
          </div>
          <div className="space-y-2">
            <Link to="/user/profile/about" className="block">
              <motion.div
                whileHover={{ x: 4, scale: 1.01 }}
                transition={{ duration: 0.2, type: "spring", stiffness: 300 }}
              >
                <Card className="bg-white dark:bg-[#1a1a1a] py-0 rounded-xl shadow-sm border-0 dark:border-gray-800 cursor-pointer">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <motion.div
                        className="bg-gray-100 dark:bg-gray-800 rounded-full p-2"
                        whileHover={{ rotate: 15, scale: 1.1 }}
                        transition={{ duration: 0.3 }}
                      >
                        <Info className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                      </motion.div>
                      <span className="text-base font-medium text-gray-900 dark:text-white">About</span>
                    </div>
                    <motion.div
                      whileHover={{ x: 4 }}
                      transition={{ duration: 0.2 }}
                    >
                      <ChevronRight className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                    </motion.div>
                  </CardContent>
                </Card>
              </motion.div>
            </Link>

            <Link to="/user/profile/send-feedback" className="block">
              <motion.div
                whileHover={{ x: 4, scale: 1.01 }}
                transition={{ duration: 0.2, type: "spring", stiffness: 300 }}
              >
                <Card className="bg-white dark:bg-[#1a1a1a] py-0 rounded-xl shadow-sm border-0 dark:border-gray-800 cursor-pointer">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <motion.div
                        className="bg-gray-100 dark:bg-gray-800 rounded-full p-2"
                        whileHover={{ rotate: 15, scale: 1.1 }}
                        transition={{ duration: 0.3 }}
                      >
                        <PenSquare className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                      </motion.div>
                      <span className="text-base font-medium text-gray-900 dark:text-white">Send feedback</span>
                    </div>
                    <motion.div
                      whileHover={{ x: 4 }}
                      transition={{ duration: 0.2 }}
                    >
                      <ChevronRight className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                    </motion.div>
                  </CardContent>
                </Card>
              </motion.div>
            </Link>

            <Link to="/user/profile/report-safety-emergency" className="block">
              <motion.div
                whileHover={{ x: 4, scale: 1.01 }}
                transition={{ duration: 0.2, type: "spring", stiffness: 300 }}
              >
                <Card className="bg-white dark:bg-[#1a1a1a] py-0 rounded-xl shadow-sm border-0 dark:border-gray-800 cursor-pointer">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <motion.div
                        className="bg-gray-100 dark:bg-gray-800 rounded-full p-2"
                        whileHover={{ rotate: 15, scale: 1.1 }}
                        transition={{ duration: 0.3 }}
                      >
                        <AlertTriangle className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                      </motion.div>
                      <span className="text-base font-medium text-gray-900 dark:text-white">Report a safety emergency</span>
                    </div>
                    <motion.div
                      whileHover={{ x: 4 }}
                      transition={{ duration: 0.2 }}
                    >
                      <ChevronRight className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                    </motion.div>
                  </CardContent>
                </Card>
              </motion.div>
            </Link>

            <Link to="/user/profile/settings" className="block">
              <motion.div
                whileHover={{ x: 4, scale: 1.01 }}
                transition={{ duration: 0.2, type: "spring", stiffness: 300 }}
              >
                <Card className="bg-white dark:bg-[#1a1a1a] py-0 rounded-xl shadow-sm border-0 dark:border-gray-800 cursor-pointer">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <motion.div
                        className="bg-gray-100 dark:bg-gray-800 rounded-full p-2"
                        whileHover={{ rotate: 15, scale: 1.1 }}
                        transition={{ duration: 0.3 }}
                      >
                        <SettingsIcon className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                      </motion.div>
                      <span className="text-base font-medium text-gray-900 dark:text-white">Settings</span>
                    </div>
                    <motion.div
                      whileHover={{ x: 4 }}
                      transition={{ duration: 0.2 }}
                    >
                      <ChevronRight className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                    </motion.div>
                  </CardContent>
                </Card>
              </motion.div>
            </Link>

            <motion.div
              whileHover={{ x: 4, scale: 1.01 }}
              transition={{ duration: 0.2, type: "spring", stiffness: 300 }}
            >
              <Card
                className="bg-white dark:bg-[#1a1a1a] py-0 rounded-xl shadow-sm border-0 dark:border-gray-800 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleLogout}
              >
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <motion.div
                      className="bg-gray-100 dark:bg-gray-800 rounded-full p-2"
                      whileHover={{ rotate: 15, scale: 1.1 }}
                      transition={{ duration: 0.3 }}
                    >
                      <Power className={`h-5 w-5 text-gray-700 dark:text-gray-300 ${isLoggingOut ? 'animate-pulse' : ''}`} />
                    </motion.div>
                    <span className="text-base font-medium text-gray-900 dark:text-white">
                      {isLoggingOut ? 'Logging out...' : 'Log out'}
                    </span>
                  </div>
                  <motion.div
                    whileHover={{ x: 4 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ChevronRight className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                  </motion.div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Veg Mode Popup */}
      <Dialog open={vegModeOpen} onOpenChange={setVegModeOpen}>
        <DialogContent className="max-w-sm md:max-w-md lg:max-w-lg w-[calc(100%-2rem)] rounded-2xl p-0 overflow-hidden">
          <DialogHeader className="p-5 pb-3">
            <DialogTitle className="text-lg font-bold text-gray-900">Veg Mode</DialogTitle>
            <DialogDescription className="text-sm text-gray-500">
              Filter restaurants and dishes based on your dietary preferences
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 px-5 pb-5">
            <button
              onClick={() => {
                setVegMode(true)
                setVegModeOpen(false)
              }}
              className={`w-full p-3 rounded-xl border-2 transition-all flex items-center justify-between ${vegMode
                ? 'border-green-600 bg-green-50'
                : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${vegMode ? 'border-green-600 bg-green-600' : 'border-gray-300'
                  }`}>
                  {vegMode && <Check className="h-3 w-3 text-white" />}
                </div>
                <div className="text-left">
                  <p className="font-medium text-gray-900 text-sm">Veg Mode ON</p>
                  <p className="text-xs text-gray-500">Show only vegetarian options</p>
                </div>
              </div>
              <Leaf className={`h-5 w-5 ${vegMode ? 'text-green-600' : 'text-gray-400'}`} />
            </button>
            <button
              onClick={() => {
                setVegMode(false)
                setVegModeOpen(false)
              }}
              className={`w-full p-3 rounded-xl border-2 transition-all flex items-center justify-between ${!vegMode
                ? 'border-red-600 bg-red-50'
                : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${!vegMode ? 'border-red-600 bg-red-600' : 'border-gray-300'
                  }`}>
                  {!vegMode && <Check className="h-3 w-3 text-white" />}
                </div>
                <div className="text-left">
                  <p className="font-medium text-gray-900 text-sm">Veg Mode OFF</p>
                  <p className="text-xs text-gray-500">Show all options</p>
                </div>
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={foodPreferenceOpen} onOpenChange={setFoodPreferenceOpen}>
        <DialogContent className="max-w-sm md:max-w-md lg:max-w-lg w-[calc(100%-2rem)] rounded-2xl p-0 overflow-hidden">
          <DialogHeader className="p-5 pb-3">
            <DialogTitle className="text-lg font-bold text-gray-900">Food Preference</DialogTitle>
            <DialogDescription className="text-sm text-gray-500">
              Choose what you want to see first in your feed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 px-5 pb-5">
            <button
              onClick={() => handleFoodPreferenceChange("healthy")}
              disabled={isSavingFoodPreference}
              className={`w-full p-3 rounded-xl border-2 transition-all flex items-center justify-between ${
                foodPreference === "healthy"
                  ? "border-green-600 bg-green-50"
                  : "border-gray-200 bg-white hover:border-gray-300"
              } disabled:opacity-60`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  foodPreference === "healthy" ? "border-green-600 bg-green-600" : "border-gray-300"
                }`}>
                  {foodPreference === "healthy" && <Check className="h-3 w-3 text-white" />}
                </div>
                <div className="text-left">
                  <p className="font-medium text-gray-900 text-sm">Healthy choices</p>
                  <p className="text-xs text-gray-500">Prioritize healthier tagged dishes</p>
                </div>
              </div>
              {isSavingFoodPreference && foodPreference !== "healthy" ? (
                <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
              ) : (
                <Leaf className={`h-5 w-5 ${foodPreference === "healthy" ? "text-green-600" : "text-gray-400"}`} />
              )}
            </button>
            <button
              onClick={() => handleFoodPreferenceChange("all")}
              disabled={isSavingFoodPreference}
              className={`w-full p-3 rounded-xl border-2 transition-all flex items-center justify-between ${
                foodPreference === "all"
                  ? "border-red-600 bg-red-50"
                  : "border-gray-200 bg-white hover:border-gray-300"
              } disabled:opacity-60`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  foodPreference === "all" ? "border-red-600 bg-red-600" : "border-gray-300"
                }`}>
                  {foodPreference === "all" && <Check className="h-3 w-3 text-white" />}
                </div>
                <div className="text-left">
                  <p className="font-medium text-gray-900 text-sm">All items</p>
                  <p className="text-xs text-gray-500">Show the full food catalog</p>
                </div>
              </div>
              {isSavingFoodPreference && foodPreference !== "all" ? (
                <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
              ) : (
                <UtensilsCrossed className={`h-5 w-5 ${foodPreference === "all" ? "text-red-600" : "text-gray-400"}`} />
              )}
            </button>
          </div>
        </DialogContent>
      </Dialog>

    </AnimatedPage>
  )
}
