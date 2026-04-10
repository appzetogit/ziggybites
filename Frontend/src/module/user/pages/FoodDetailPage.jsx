import { useState, useEffect } from "react"
import { useParams, useNavigate, useLocation, Link } from "react-router-dom"
import { ArrowLeft, Star, Clock, MapPin, Loader2, AlertCircle, Leaf, ChevronRight } from "lucide-react"
import { motion } from "framer-motion"
import AnimatedPage from "../components/AnimatedPage"
import AddToCartButton from "../components/AddToCartButton"
import NutritionModal from "../components/NutritionModal"
import OptimizedImage from "@/components/OptimizedImage"
import { restaurantAPI } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { useProfile } from "../context/ProfileContext"

/**
 * Find a menu item by id across all sections and subsections
 */
function findItemInMenu(sections, itemId) {
  const searchId = String(itemId).trim()
  for (const section of sections || []) {
    if (section.items?.length) {
      const found = section.items.find((i) => {
        const id = String(i.id || i._id || "").trim()
        return id === searchId || id === itemId
      })
      if (found) return found
    }
    if (section.subsections) {
      for (const sub of section.subsections) {
        if (sub.items?.length) {
          const found = sub.items.find((i) => {
            const id = String(i.id || i._id || "").trim()
            return id === searchId || id === itemId
          })
          if (found) return found
        }
      }
    }
  }
  return null
}

/**
 * Collect all menu items from sections (and subsections)
 */
function collectAllMenuItems(sections) {
  const items = []
  for (const section of sections || []) {
    if (section.items?.length) items.push(...section.items)
    for (const sub of section.subsections || []) {
      if (sub.items?.length) items.push(...sub.items)
    }
  }
  return items
}

function isHealthyItem(item) {
  return Array.isArray(item?.tags) &&
    item.tags.some((tag) => String(tag).trim().toLowerCase() === "healthy")
}

/**
 * Map feed food or API menu item to cart item format
 */
function toCartItem(item, restaurantName, restaurantId) {
  const id = item?.id ?? item?._id ?? item?.food_id
  const name = item?.name ?? item?.food_name
  const image = item?.image ?? item?.food_image ?? item?.images?.[0]
  const price = item?.price ?? 0
  return {
    id,
    name,
    image,
    price,
    restaurant: restaurantName ?? item?.restaurant_name ?? "",
    restaurantId: restaurantId ?? item?.restaurant_id ?? item?.restaurantId,
  }
}

export default function FoodDetailPage() {
  const { id: foodId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { state } = location
  const { userProfile } = useProfile()
  const restaurantSlugFromState = state?.restaurantSlug
  const foodPreference = userProfile?.preferences?.foodPreference || "all"

  const [food, setFood] = useState(null)
  const [restaurantName, setRestaurantName] = useState("")
  const [restaurantSlug, setRestaurantSlug] = useState("")
  const [restaurantId, setRestaurantId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showNutritionModal, setShowNutritionModal] = useState(false)
  const [suggestedFoods, setSuggestedFoods] = useState([])

  useEffect(() => {
    let cancelled = false

    const restaurantIdFromState = state?.restaurantId ?? state?.restaurant_id
    const foodFromState = state?.food

    if (foodFromState && restaurantIdFromState) {
      setFood(foodFromState)
      setRestaurantName(foodFromState.restaurant_name ?? "")
      setRestaurantId(restaurantIdFromState)
      setRestaurantSlug(restaurantSlugFromState ?? foodFromState.restaurantSlug ?? (foodFromState.restaurant_name ?? "").toLowerCase().replace(/\s+/g, "-"))
      setLoading(false)
    }

    const fetchFood = async () => {
      const rid = restaurantIdFromState ?? new URLSearchParams(location.search).get("restaurant")
      if (!rid) {
        setError("Restaurant information is missing. Please go back and try again.")
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError(null)
        const res = await restaurantAPI.getMenuByRestaurantId(rid)
        const menu = res.data?.data?.menu
        const sections = menu?.sections || []
        const item = findItemInMenu(sections, foodId)

        if (cancelled) return

        if (item) {
          setFood(item)
          setRestaurantId(rid)
          const rest = res.data?.data?.restaurant
          if (rest) {
            setRestaurantName(rest.name ?? "")
            setRestaurantSlug(rest.slug ?? (rest.name ?? "").toLowerCase().replace(/\s+/g, "-"))
          }
          const allItems = collectAllMenuItems(sections)
          const currentId = String(item.id ?? item._id ?? foodId).trim()
          const others = allItems.filter((i) => {
            const itemId = String(i.id ?? i._id ?? "").trim()
            if (itemId === currentId) return false
            if (foodPreference === "healthy" && !isHealthyItem(i)) return false
            return true
          })
          setSuggestedFoods(others.slice(0, 4))
        } else {
          if (foodFromState && restaurantIdFromState) {
            setFood(foodFromState)
            setRestaurantName(foodFromState.restaurant_name ?? "")
            setRestaurantSlug(restaurantSlugFromState ?? foodFromState.restaurantSlug ?? (foodFromState.restaurant_name ?? "").toLowerCase().replace(/\s+/g, "-"))
          } else {
            setError("Food item not found.")
          }
        }
      } catch (err) {
        if (cancelled) return
        if (foodFromState && restaurantIdFromState) {
          setFood(foodFromState)
          setRestaurantName(foodFromState.restaurant_name ?? "")
          setRestaurantSlug(restaurantSlugFromState ?? foodFromState.restaurantSlug ?? (foodFromState.restaurant_name ?? "").toLowerCase().replace(/\s+/g, "-"))
        } else {
          setError(err?.response?.data?.message ?? err?.message ?? "Failed to load food details.")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    if (!foodFromState || !restaurantIdFromState) {
      fetchFood()
    }

    return () => { cancelled = true }
  }, [foodId, state?.restaurantId, state?.restaurant_id, state?.food, state?.restaurantSlug, location.search])

  // Fetch suggestions when we have food from state (no menu fetch happened)
  useEffect(() => {
    if (!restaurantId || !food || suggestedFoods.length > 0) return
    const rid = state?.restaurantId ?? state?.restaurant_id
    if (!rid) return
    let cancelled = false
    const fetchSuggestions = async () => {
      try {
        const res = await restaurantAPI.getMenuByRestaurantId(rid)
        const sections = res.data?.data?.menu?.sections || []
        const allItems = collectAllMenuItems(sections)
        const currentId = String(food.id ?? food.food_id ?? food._id ?? foodId).trim()
        const others = allItems.filter((i) => {
          const itemId = String(i.id ?? i._id ?? "").trim()
          if (itemId === currentId) return false
          if (foodPreference === "healthy" && !isHealthyItem(i)) return false
          return true
        })
        if (!cancelled) setSuggestedFoods(others.slice(0, 4))
      } catch {
        if (!cancelled) setSuggestedFoods([])
      }
    }
    fetchSuggestions()
    return () => { cancelled = true }
  }, [restaurantId, food, foodId, state?.restaurantId, state?.restaurant_id, foodPreference])

  const cartItem = food ? toCartItem(food, restaurantName, restaurantId) : null
  const foodImage = food?.image ?? food?.food_image ?? food?.images?.[0] ?? "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&h=600&fit=crop"
  const foodName = food?.name ?? food?.food_name ?? ""
  const foodPrice = food?.price ?? 0
  const foodRating = food?.rating
  const foodEta = food?.eta ?? food?.preparationTime ?? ""

  if (loading && !food) {
    return (
      <AnimatedPage>
        <div className="min-h-screen bg-gray-50 dark:bg-[#1a1a1a] flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 text-green-600 animate-spin" />
            <span className="text-sm text-gray-600 dark:text-gray-400">Loading food details...</span>
          </div>
        </div>
      </AnimatedPage>
    )
  }

  if (error && !food) {
    return (
      <AnimatedPage>
        <div className="min-h-screen bg-gray-50 dark:bg-[#1a1a1a] flex items-center justify-center px-4">
          <div className="flex flex-col items-center gap-4 text-center">
            <AlertCircle className="h-12 w-12 text-red-500" />
            <p className="text-gray-700 dark:text-gray-300">{error}</p>
            <Button variant="outline" onClick={() => navigate(-1)}>
              Go back
            </Button>
          </div>
        </div>
      </AnimatedPage>
    )
  }

  const foodType = food?.foodType ?? food?.food_type
  const isVeg = foodType === "Veg" || foodType === "veg"

  return (
    <AnimatedPage>
      <div className="h-screen overflow-hidden bg-gray-100 dark:bg-[#0f0f0f] flex flex-col">
        {/* Header - floating back button */}
        <div className="fixed top-0 left-0 right-0 z-20 px-4 pt-4 pb-2">
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigate(-1)}
              className="p-2.5 rounded-full bg-white/90 dark:bg-[#1a1a1a]/90 backdrop-blur-md shadow-lg border border-gray-200/50 dark:border-gray-700/50 hover:bg-white dark:hover:bg-[#2a2a2a] transition-all active:scale-95"
              aria-label="Go back"
            >
              <ArrowLeft className="h-5 w-5 text-gray-800 dark:text-gray-200" />
            </button>
          </div>
        </div>

        {/* Hero Image */}
        <div className="relative h-[33vh] min-h-[240px] max-h-[300px] w-full bg-gray-200 dark:bg-gray-800 overflow-hidden flex-shrink-0">
          <OptimizedImage
            src={foodImage}
            alt={foodName}
            className="w-full h-full object-cover"
            sizes="100vw"
            objectFit="cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-4 flex items-end justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {typeof foodPrice === "number" && foodPrice > 0 && (
                <span className="inline-flex items-center px-3 py-1.5 rounded-xl bg-white/95 dark:bg-[#1a1a1a]/95 backdrop-blur text-gray-900 dark:text-white font-bold text-lg shadow-lg">
                  ₹{foodPrice}
                </span>
              )}
              {typeof foodRating === "number" && foodRating > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-green-500/90 text-white text-sm font-semibold">
                  <Star className="h-4 w-4 fill-white" />
                  {foodRating.toFixed(1)}
                </span>
              )}
              {foodType && (
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium ${isVeg ? "bg-green-600/90 text-white" : "bg-amber-600/90 text-white"}`}>
                  <span className={`w-2 h-2 rounded-full ${isVeg ? "bg-white" : "bg-white"}`} />
                  {foodType}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Content Card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="relative -mt-5 mx-3 mb-3 flex-1 min-h-0 rounded-2xl sm:rounded-3xl bg-white dark:bg-[#1a1a1a] shadow-xl border border-gray-200/50 dark:border-gray-800 overflow-hidden"
        >
          <div className="h-full flex flex-col p-4 sm:p-5 gap-4">
            <div className="flex-shrink-0 space-y-4">
              {/* Title */}
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
                  {foodName}
                </h1>
              </div>

              {/* Delivery & Distance */}
              {(foodEta || food?.distance_km != null) && (
                <div className="flex flex-wrap gap-3">
                  {foodEta && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800/80">
                      <Clock className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{foodEta}</span>
                    </div>
                  )}
                  {food?.distance_km != null && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800/80">
                      <MapPin className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {food.distance_km >= 1 ? `${food.distance_km.toFixed(1)} km` : `${Math.round((food.distance_km || 0) * 1000)} m`}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Description */}
              {food?.description && (
                <div>
                  <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed line-clamp-2">
                    {food.description}
                  </p>
                </div>
              )}

              {/* Nutrition link */}
              <button
                type="button"
                onClick={() => setShowNutritionModal(true)}
                className="flex items-center gap-2 w-full px-4 py-3 rounded-xl border border-green-200 dark:border-green-900/50 bg-green-50/50 dark:bg-green-900/10 text-green-700 dark:text-green-400 hover:bg-green-100/80 dark:hover:bg-green-900/20 transition-colors"
              >
                <Leaf className="h-5 w-5 flex-shrink-0" />
                <span className="text-sm font-medium">Check nutrition value</span>
                <ChevronRight className="h-4 w-4 ml-auto" />
              </button>
            </div>

            {/* Suggested for you */}
            {suggestedFoods.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.1 }}
                className="flex-1 min-h-0 flex flex-col"
              >
                <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3 px-1 flex-shrink-0">
                  You might also like
                </h2>
                <div className="flex gap-3 overflow-x-auto pb-2 -mx-1">
              {suggestedFoods.map((item) => {
                const itemId = item.id ?? item._id
                const itemName = item.name ?? ""
                const itemImage = item.image ?? item.images?.[0] ?? "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=300&fit=crop"
                const itemPrice = item.price ?? 0
                const slug = restaurantSlug || (restaurantName || "").toLowerCase().replace(/\s+/g, "-")
                return (
                  <Link
                    key={itemId}
                    to={`/food/${itemId}`}
                    state={{
                      food: { ...item, restaurant_name: restaurantName, restaurantSlug: slug },
                      restaurantId,
                      restaurantSlug: slug,
                    }}
                    className="flex-shrink-0 w-[140px] sm:w-[160px] group"
                  >
                    <div className="rounded-xl overflow-hidden bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-800 shadow-sm hover:shadow-md transition-all">
                      <div className="aspect-square relative overflow-hidden bg-gray-100 dark:bg-gray-800">
                        <OptimizedImage
                          src={itemImage}
                          alt={itemName}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          sizes="160px"
                          objectFit="cover"
                        />
                        <div className="absolute bottom-1 left-1 px-2 py-0.5 rounded-md bg-black/70 text-white text-xs font-semibold">
                          ₹{itemPrice}
                        </div>
                      </div>
                      <div className="p-2">
                        <p className="text-sm font-medium text-gray-900 dark:text-white line-clamp-2 group-hover:text-green-600 dark:group-hover:text-green-400 transition-colors">
                          {itemName}
                        </p>
                      </div>
                    </div>
                  </Link>
                )
              })}
                </div>
              </motion.div>
            )}

            {cartItem && (
              <div className="flex-shrink-0 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
                <AddToCartButton item={cartItem} className="w-full !h-12 text-base font-semibold rounded-xl" />
              </div>
            )}
          </div>
        </motion.div>

        <NutritionModal
          open={showNutritionModal}
          onClose={() => setShowNutritionModal(false)}
          food={{ ...food, food_name: food?.name ?? food?.food_name }}
        />
      </div>
    </AnimatedPage>
  )
}
