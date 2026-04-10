import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Clock, Loader2, Mic, Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { restaurantAPI } from "@/lib/api"
import { foodImages } from "@/constants/images"
import { requestVoiceSearch, stopVoiceSearch } from "@/lib/mobileBridge"
import { toast } from "sonner"

const SEARCH_HISTORY_KEY = "user_search_history_v2"
const MAX_HISTORY_ITEMS = 10
const MIN_SEARCH_LENGTH = 1
const SEARCH_DEBOUNCE_MS = 350

export default function SearchOverlay({
  isOpen,
  onClose,
  searchValue,
  onSearchChange,
  autoStartVoiceSearchKey,
}) {
  const navigate = useNavigate()
  const inputRef = useRef(null)
  const searchPanelRef = useRef(null)
  const latestRequestRef = useRef(0)
  const [recentSearches, setRecentSearches] = useState([])
  const [searchResults, setSearchResults] = useState([])
  const [loadingResults, setLoadingResults] = useState(false)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [isVoiceSearching, setIsVoiceSearching] = useState(false)

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  useEffect(() => {
    return () => {
      stopVoiceSearch().catch(() => {})
    }
  }, [])

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === "Escape" && isOpen) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener("keydown", handleEscape)
      document.body.style.overflow = "hidden"
    }

    return () => {
      document.removeEventListener("keydown", handleEscape)
      document.body.style.overflow = "unset"
    }
  }, [isOpen, onClose])

  useEffect(() => {
    if (!isOpen) return

    try {
      const raw = localStorage.getItem(SEARCH_HISTORY_KEY)
      if (!raw) {
        setRecentSearches([])
        return
      }

      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) {
        setRecentSearches([])
        return
      }

      setRecentSearches(
        parsed
          .filter((item) => typeof item === "string" && item.trim())
          .slice(0, MAX_HISTORY_ITEMS),
      )
    } catch (error) {
      console.warn("Failed to load search history:", error)
      setRecentSearches([])
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    const handleOutsideClick = (event) => {
      if (!searchPanelRef.current?.contains(event.target)) {
        setIsDropdownOpen(false)
      }
    }

    document.addEventListener("mousedown", handleOutsideClick)
    return () => document.removeEventListener("mousedown", handleOutsideClick)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    const trimmedValue = searchValue.trim()
    if (trimmedValue.length < MIN_SEARCH_LENGTH) {
      setLoadingResults(false)
      setSearchResults([])
      setIsDropdownOpen(false)
      return
    }

    const requestId = latestRequestRef.current + 1
    latestRequestRef.current = requestId

    const timeoutId = window.setTimeout(async () => {
      try {
        setLoadingResults(true)
        setIsDropdownOpen(true)

        const response = await restaurantAPI.searchFoods(trimmedValue)
        if (latestRequestRef.current !== requestId) return

        const items = response?.data?.data?.items || []
        setSearchResults(items.slice(0, 4))
      } catch (error) {
        if (latestRequestRef.current !== requestId) return
        console.error("Food search failed:", error)
        setSearchResults([])
      } finally {
        if (latestRequestRef.current === requestId) {
          setLoadingResults(false)
        }
      }
    }, SEARCH_DEBOUNCE_MS)

    return () => window.clearTimeout(timeoutId)
  }, [isOpen, searchValue])

  const handleVoiceSearch = async () => {
    if (isVoiceSearching) {
      await stopVoiceSearch()
      setIsVoiceSearching(false)
      return
    }

    try {
      setIsVoiceSearching(true)
      const transcript = await requestVoiceSearch()
      onSearchChange(transcript)
      if (String(transcript || "").trim()) {
        setIsDropdownOpen(true)
      }
      inputRef.current?.focus()
    } catch (error) {
      console.error("Voice search failed:", error)
      toast.error(error?.message || "Voice search failed. Please try again.")
    } finally {
      setIsVoiceSearching(false)
    }
  }

  useEffect(() => {
    if (!isOpen || !autoStartVoiceSearchKey) return
    handleVoiceSearch()
  }, [autoStartVoiceSearchKey, isOpen])

  const saveSearchToHistory = (term) => {
    const value = String(term || "").trim()
    if (!value) return

    setRecentSearches((prev) => {
      const nextHistory = [
        value,
        ...prev.filter((item) => item.toLowerCase() !== value.toLowerCase()),
      ].slice(0, MAX_HISTORY_ITEMS)

      try {
        localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(nextHistory))
      } catch (error) {
        console.warn("Failed to save search history:", error)
      }

      return nextHistory
    })
  }

  const clearRecentSearches = () => {
    try {
      localStorage.removeItem(SEARCH_HISTORY_KEY)
    } catch (error) {
      console.warn("Failed to clear search history:", error)
    }
    setRecentSearches([])
  }

  const handleHistoryClick = (term) => {
    onSearchChange(term)
    setIsDropdownOpen(true)
    inputRef.current?.focus()
  }

  const closeAndReset = () => {
    setIsDropdownOpen(false)
    setSearchResults([])
    setLoadingResults(false)
    onClose()
  }

  const handleFoodClick = (food) => {
    const foodId = food.foodId || food.food_id || food.id || food._id
    const restaurantId = food.restaurantId || food.restaurant_id
    const restaurantSlug = food.restaurantSlug || food.restaurant_slug

    if (!foodId) return

    saveSearchToHistory(food.foodName)
    setIsDropdownOpen(false)
    navigate(`/food/${encodeURIComponent(foodId)}${restaurantId ? `?restaurant=${encodeURIComponent(restaurantId)}` : ""}`, {
      state: {
        food,
        restaurantId,
        restaurantSlug,
      },
    })
    onSearchChange("")
    onClose()
  }

  const handleSearchSubmit = (event) => {
    event.preventDefault()
    const trimmedValue = searchValue.trim()
    if (!trimmedValue) return

    saveSearchToHistory(trimmedValue)

    if (searchResults.length > 0) {
      handleFoodClick(searchResults[0])
      return
    }

    navigate(`/user/search?q=${encodeURIComponent(trimmedValue)}`)
    onSearchChange("")
    onClose()
  }

  if (!isOpen) return null

  const trimmedValue = searchValue.trim()
  const showDropdown = isDropdownOpen && trimmedValue.length >= MIN_SEARCH_LENGTH
  const showNoResults =
    showDropdown && !loadingResults && trimmedValue && searchResults.length === 0

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-white dark:bg-[#0a0a0a]">
      <div className="flex-shrink-0 border-b border-gray-100 bg-white shadow-sm dark:border-gray-800 dark:bg-[#1a1a1a]">
        <div
          ref={searchPanelRef}
          className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8"
        >
          <form onSubmit={handleSearchSubmit} className="relative">
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-muted-foreground dark:text-gray-400" />
                <Input
                  ref={inputRef}
                  value={searchValue}
                  onChange={(event) => {
                    const nextValue = event.target.value
                    onSearchChange(nextValue)
                    if (!nextValue.trim()) {
                      setIsDropdownOpen(false)
                      setSearchResults([])
                    } else {
                      setIsDropdownOpen(true)
                    }
                  }}
                  onFocus={() => {
                    if (searchValue.trim()) {
                      setIsDropdownOpen(true)
                    }
                  }}
                  placeholder="Search food items"
                  className="h-12 w-full rounded-full border-gray-200 bg-white pl-12 pr-10 text-base dark:border-gray-800 dark:bg-[#1a1a1a] dark:text-white"
                />
                {searchValue && (
                  <button
                    type="button"
                    onClick={() => {
                      onSearchChange("")
                      setIsDropdownOpen(false)
                      setSearchResults([])
                      inputRef.current?.focus()
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleVoiceSearch}
                className={`rounded-full ${isVoiceSearching ? "bg-red-50 text-red-500 hover:bg-red-100" : "hover:bg-gray-100 dark:hover:bg-gray-800"}`}
                aria-label={isVoiceSearching ? "Stop voice search" : "Start voice search"}
              >
                {isVoiceSearching ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Mic className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={closeAndReset}
                className="rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X className="h-5 w-5 text-gray-700 dark:text-gray-300" />
              </Button>
            </div>

            {showDropdown && (
              <div className="absolute left-0 right-0 top-[calc(100%+12px)] z-20 overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-[#141414]">
                {loadingResults ? (
                  <div className="flex items-center gap-3 px-4 py-4 text-sm text-gray-500 dark:text-gray-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Searching foods...
                  </div>
                ) : null}

                {!loadingResults &&
                  searchResults.map((food) => (
                    <button
                      key={`${food.restaurantId}-${food.foodId}`}
                      type="button"
                      onClick={() => handleFoodClick(food)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-[#1d1d1d]"
                    >
                      <img
                        src={food.image || foodImages[0]}
                        alt={food.foodName}
                        className="h-14 w-14 rounded-2xl object-cover"
                        onError={(event) => {
                          event.currentTarget.src = foodImages[0]
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                          {food.foodName}
                        </p>
                        <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                          {food.restaurantName}
                        </p>
                        {food.category ? (
                          <p className="truncate text-[11px] text-gray-400 dark:text-gray-500">
                            {food.category}
                          </p>
                        ) : null}
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">
                          Rs.{Math.round(Number(food.price) || 0)}
                        </p>
                      </div>
                    </button>
                  ))}

                {showNoResults ? (
                  <div className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400">
                    No food found
                  </div>
                ) : null}
              </div>
            )}
          </form>
        </div>
      </div>

      <div className="mx-auto w-full max-w-7xl flex-1 overflow-y-auto bg-white px-4 py-6 dark:bg-[#0a0a0a] sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
            <Clock className="h-4 w-4 text-red-500" />
            Recent Searches
          </h3>
          {recentSearches.length > 0 ? (
            <button
              type="button"
              onClick={clearRecentSearches}
              className="text-xs font-medium text-gray-500 hover:text-red-500"
            >
              Clear
            </button>
          ) : null}
        </div>

        {recentSearches.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {recentSearches.map((term, index) => (
              <button
                key={`${term}-${index}`}
                type="button"
                onClick={() => handleHistoryClick(term)}
                className="inline-flex items-center gap-2 rounded-full border border-red-100 bg-red-50 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-red-100 dark:border-red-900/40 dark:bg-red-900/10 dark:text-gray-200"
              >
                <Clock className="h-3.5 w-3.5 text-red-500" />
                {term}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Start typing a food name to get quick suggestions.
          </p>
        )}
      </div>
    </div>
  )
}
