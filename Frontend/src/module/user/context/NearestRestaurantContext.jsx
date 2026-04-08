import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { restaurantAPI } from "@/lib/api";
import { useLocation } from "../hooks/useLocation";

const NEAREST_RESTAURANT_STORAGE_KEY = "userNearestRestaurant";
const USER_LOCATION_STORAGE_KEY = "userLocation";
const LOCATION_REFRESH_THRESHOLD_METERS = 100;
const LOCATION_DEBOUNCE_MS = 800;

const NearestRestaurantContext = createContext({
  nearestRestaurant: null,
  userLocation: null,
  loading: true,
  error: null,
  noServiceAvailable: false,
  refreshNearestRestaurant: async () => null,
});

function getStoredJson(key) {
  if (typeof window === "undefined") return null;

  try {
    const rawValue = window.localStorage.getItem(key);
    return rawValue ? JSON.parse(rawValue) : null;
  } catch (error) {
    console.warn(`Failed to read ${key} from storage:`, error);
    return null;
  }
}

function setStoredJson(key, value) {
  if (typeof window === "undefined") return;

  try {
    if (value == null) {
      window.localStorage.removeItem(key);
      return;
    }

    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`Failed to write ${key} to storage:`, error);
  }
}

function getCoordinates(location) {
  if (!location) return null;

  const latitude = location.latitude ?? location.lat;
  const longitude = location.longitude ?? location.lng;

  if (
    typeof latitude !== "number" ||
    typeof longitude !== "number" ||
    Number.isNaN(latitude) ||
    Number.isNaN(longitude)
  ) {
    return null;
  }

  return { latitude, longitude };
}

function calculateDistanceMeters(fromLocation, toLocation) {
  const fromCoords = getCoordinates(fromLocation);
  const toCoords = getCoordinates(toLocation);

  if (!fromCoords || !toCoords) return Number.POSITIVE_INFINITY;

  const toRadians = (value) => (value * Math.PI) / 180;
  const earthRadiusMeters = 6371000;
  const dLat = toRadians(toCoords.latitude - fromCoords.latitude);
  const dLng = toRadians(toCoords.longitude - fromCoords.longitude);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(fromCoords.latitude)) *
      Math.cos(toRadians(toCoords.latitude)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusMeters * c;
}

export function NearestRestaurantProvider({ children }) {
  const { location, loading: locationLoading, error: locationError } = useLocation();
  const [nearestRestaurant, setNearestRestaurant] = useState(() =>
    getStoredJson(NEAREST_RESTAURANT_STORAGE_KEY),
  );
  const [userLocation, setUserLocation] = useState(() =>
    getStoredJson(USER_LOCATION_STORAGE_KEY),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [noServiceAvailable, setNoServiceAvailable] = useState(false);

  const fetchTimeoutRef = useRef(null);
  const lastFetchedLocationRef = useRef(getStoredJson(USER_LOCATION_STORAGE_KEY));
  const fallbackFetchedRef = useRef(false);

  const fetchNearestRestaurant = useCallback(async (coords = null, options = {}) => {
    const { force = false } = options;
    const effectiveCoords = getCoordinates(coords);
    const shouldReuseCache =
      !force &&
      nearestRestaurant &&
      effectiveCoords &&
      calculateDistanceMeters(lastFetchedLocationRef.current, effectiveCoords) <
        LOCATION_REFRESH_THRESHOLD_METERS;

    if (shouldReuseCache) {
      setLoading(false);
      setNoServiceAvailable(false);
      return nearestRestaurant;
    }

    setLoading(true);
    setError(null);

    try {
      const params = effectiveCoords
        ? { lat: effectiveCoords.latitude, lng: effectiveCoords.longitude }
        : {};
      const response = await restaurantAPI.getNearestRestaurant(params);
      const restaurant = response?.data?.data?.restaurant || null;

      setNearestRestaurant(restaurant);
      setStoredJson(NEAREST_RESTAURANT_STORAGE_KEY, restaurant);
      setNoServiceAvailable(!restaurant);

      if (effectiveCoords) {
        lastFetchedLocationRef.current = effectiveCoords;
      }

      return restaurant;
    } catch (fetchError) {
      console.error("Failed to fetch nearest restaurant:", fetchError);
      setError(fetchError);
      return null;
    } finally {
      setLoading(false);
    }
  }, [nearestRestaurant]);

  useEffect(() => {
    if (!location) return;

    setUserLocation(location);
    setStoredJson(USER_LOCATION_STORAGE_KEY, location);
  }, [location]);

  useEffect(() => {
    const currentCoords = getCoordinates(location);

    if (!currentCoords) {
      if (!locationLoading && !fallbackFetchedRef.current) {
        fallbackFetchedRef.current = true;
        fetchNearestRestaurant(null, { force: true });
      }
      return undefined;
    }

    const distanceFromLastFetch = calculateDistanceMeters(
      lastFetchedLocationRef.current,
      currentCoords,
    );

    if (
      nearestRestaurant &&
      distanceFromLastFetch < LOCATION_REFRESH_THRESHOLD_METERS
    ) {
      setLoading(false);
      return undefined;
    }

    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
    }

    fetchTimeoutRef.current = setTimeout(() => {
      fetchNearestRestaurant(currentCoords, {
        force:
          !lastFetchedLocationRef.current ||
          distanceFromLastFetch >= LOCATION_REFRESH_THRESHOLD_METERS,
      });
    }, LOCATION_DEBOUNCE_MS);

    return () => {
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
        fetchTimeoutRef.current = null;
      }
    };
  }, [fetchNearestRestaurant, location, locationLoading, nearestRestaurant]);

  useEffect(() => {
    if (!locationLoading && !location && !nearestRestaurant && !fallbackFetchedRef.current) {
      fallbackFetchedRef.current = true;
      fetchNearestRestaurant(null, { force: true });
    }
  }, [fetchNearestRestaurant, location, locationLoading, nearestRestaurant]);

  const value = useMemo(
    () => ({
      nearestRestaurant,
      userLocation,
      loading: loading || locationLoading,
      error: error || locationError,
      noServiceAvailable,
      refreshNearestRestaurant: (options = {}) =>
        fetchNearestRestaurant(location || userLocation, { force: true, ...options }),
    }),
    [
      error,
      fetchNearestRestaurant,
      loading,
      location,
      locationError,
      locationLoading,
      nearestRestaurant,
      noServiceAvailable,
      userLocation,
    ],
  );

  return (
    <NearestRestaurantContext.Provider value={value}>
      {children}
    </NearestRestaurantContext.Provider>
  );
}

export function useNearestRestaurant() {
  return useContext(NearestRestaurantContext);
}
