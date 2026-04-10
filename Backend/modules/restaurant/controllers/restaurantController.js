import Restaurant from "../models/Restaurant.js";
import Menu from "../models/Menu.js";
import Zone from "../../admin/models/Zone.js";
import DiningCategory from "../../dining/models/DiningCategory.js";
import {
  successResponse,
  errorResponse,
} from "../../../shared/utils/response.js";
import {
  uploadToCloudinary,
  deleteFromCloudinary,
} from "../../../shared/utils/cloudinaryService.js";
import { initializeCloudinary } from "../../../config/cloudinary.js";
import asyncHandler from "../../../shared/middleware/asyncHandler.js";
import mongoose from "mongoose";

function itemHasMealCategory(item, category) {
  if (!item || !category) return false;
  if (Array.isArray(item.mealCategories) && item.mealCategories.includes(category)) return true;
  return item.mealCategory === category;
}

/**
 * GET /api/restaurant/food-feed
 * Returns a flat list of food items from nearby restaurants.
 * Query: lat, lng, limit (default 30), offset (default 0),
 *        foodType (Veg/Non-Veg), isCombo (true/false),
 *        maxDistance (metres, default 50000 = 50 km)
 */
export const getFoodFeed = asyncHandler(async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  const limit = Math.min(parseInt(req.query.limit) || 30, 100);
  const offset = parseInt(req.query.offset) || 0;
  const foodType = req.query.foodType; // "Veg" | "Non-Veg"
  const isCombo = req.query.isCombo === "true";
  const tag = (req.query.tag || "").trim();
  const maxDistance = parseInt(req.query.maxDistance) || 50000;

  const hasLocation = !isNaN(lat) && !isNaN(lng);

  let restaurantIds = [];
  const distanceMap = new Map();

  const nearbyRestaurants = await findNearbyRestaurants({
    ...req.query,
    maxDistance: hasLocation ? maxDistance / 1000 : req.query.maxDistance,
  }, 25);

  if (Array.isArray(nearbyRestaurants) && nearbyRestaurants.length) {
    restaurantIds = nearbyRestaurants.map((restaurant) => restaurant._id);
    nearbyRestaurants.forEach((restaurant) => {
      distanceMap.set(restaurant._id.toString(), {
        ...restaurant,
        dist: restaurant._distanceMeters ?? null,
      });
    });
  }

  if (!restaurantIds.length) {
    return successResponse(res, 200, "No food items found", { items: [], total: 0 });
  }

  const itemMatch = {
    "sections.items.isAvailable": true,
    "sections.items.approvalStatus": "approved",
  };
  if (foodType === "Veg" || foodType === "Non-Veg") {
    itemMatch["sections.items.foodType"] = foodType;
  }
    if (isCombo) {
      itemMatch["sections.items.isCombo"] = true;
    }
    if (tag) {
      const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      itemMatch["sections.items.tags"] = {
        $elemMatch: { $regex: `^${escapedTag}$`, $options: "i" },
      };
    }

  const pipeline = [
    { $match: { restaurant: { $in: restaurantIds }, isActive: true } },
    { $unwind: "$sections" },
    { $match: { "sections.isEnabled": { $ne: false } } },
    { $unwind: "$sections.items" },
    { $match: itemMatch },
    {
      $project: {
        _id: 0,
        restaurantObjId: "$restaurant",
        itemId: "$sections.items.id",
        name: "$sections.items.name",
        image: "$sections.items.image",
        images: "$sections.items.images",
        price: "$sections.items.price",
        originalPrice: "$sections.items.originalPrice",
        discount: "$sections.items.discount",
        discountType: "$sections.items.discountType",
        discountAmount: "$sections.items.discountAmount",
        foodType: "$sections.items.foodType",
        rating: "$sections.items.rating",
        reviews: "$sections.items.reviews",
        isCombo: { $ifNull: ["$sections.items.isCombo", false] },
        category: "$sections.items.category",
        description: "$sections.items.description",
        preparationTime: "$sections.items.preparationTime",
        macronutrients: "$sections.items.macronutrients",
        vitamins: "$sections.items.vitamins",
          nutrition: "$sections.items.nutrition",
          allergies: "$sections.items.allergies",
          tags: "$sections.items.tags",
        },
      },
    { $sort: { rating: -1 } },
    { $skip: offset },
    { $limit: limit },
  ];

  const items = await Menu.aggregate(pipeline);

  const enriched = items.map((item) => {
    const rData = distanceMap.get(item.restaurantObjId.toString()) || {};
    const distMeters = rData.dist != null ? Math.round(rData.dist) : null;
    const distKm = distMeters != null ? Math.round((distMeters / 1000) * 10) / 10 : null;
    return {
      ...item,
      food_id: item.itemId,
      food_name: item.name,
      food_image: item.images?.[0] || item.image || "",
      restaurantId: item.restaurantObjId,
      restaurant_id: item.restaurantObjId,
      restaurantName: rData.name || "",
      restaurant_name: rData.name || "",
      restaurantSlug: rData.slug || "",
      restaurantRating: rData.rating || 0,
      restaurantImage: rData.profileImage?.url || "",
      distance: distMeters,
      distance_km: distKm,
      eta: rData.estimatedDeliveryTime || "25-30 mins",
    };
  });

  if (hasLocation) {
    enriched.sort((a, b) => {
      if (a.distance !== b.distance) return (a.distance ?? Infinity) - (b.distance ?? Infinity);
      return (b.rating || 0) - (a.rating || 0);
    });
  }

  const countPipeline = [
    { $match: { restaurant: { $in: restaurantIds }, isActive: true } },
    { $unwind: "$sections" },
    { $match: { "sections.isEnabled": { $ne: false } } },
    { $unwind: "$sections.items" },
    { $match: itemMatch },
    { $count: "total" },
  ];
  const countResult = await Menu.aggregate(countPipeline);
  const total = countResult[0]?.total || 0;

  return successResponse(res, 200, "Food feed retrieved", { items: enriched, total });
});

/**
 * GET /api/restaurant/foods?category=breakfast|lunch|snacks|dinner
 * Returns foods grouped by restaurant, filtered by meal category.
 */
export const getFoodsByCategory = asyncHandler(async (req, res) => {
  const category = (req.query.category || "").toLowerCase();
  const validCategories = ["breakfast", "lunch", "snacks", "dinner"];
  if (!validCategories.includes(category)) {
    return errorResponse(res, 400, "Invalid category. Use: breakfast, lunch, snacks, or dinner.");
  }

  const restaurants = await Restaurant.find({ isActive: true })
    .select("_id name slug rating profileImage estimatedDeliveryTime")
    .lean()
    .limit(200);

  const menus = await Menu.find({
    restaurant: { $in: restaurants.map((r) => r._id) },
    isActive: true,
  })
    .lean();

  const restaurantMap = new Map(restaurants.map((r) => [r._id.toString(), r]));

  const collectItemsWithCategory = (sections, restaurantId) => {
    const items = [];
    (sections || []).forEach((section) => {
      if (section.isEnabled === false) return;
      (section.items || []).forEach((item) => {
        if (item.isAvailable !== false && itemHasMealCategory(item, category) && (item.approvalStatus !== "rejected")) {
          items.push({
            ...item,
            sectionName: section.name,
            restaurantId,
          });
        }
      });
      (section.subsections || []).forEach((subsection) => {
        (subsection.items || []).forEach((item) => {
          if (item.isAvailable !== false && itemHasMealCategory(item, category) && (item.approvalStatus !== "rejected")) {
            items.push({
              ...item,
              sectionName: section.name,
              subsectionName: subsection.name,
              restaurantId,
            });
          }
        });
      });
    });
    return items;
  };

  const restaurantsWithFoods = [];
  menus.forEach((menu) => {
    const restaurantId = menu.restaurant?.toString?.() || menu.restaurant;
    const restaurant = restaurantMap.get(restaurantId);
    if (!restaurant) return;

    const items = collectItemsWithCategory(menu.sections, restaurantId);
    if (items.length > 0) {
      restaurantsWithFoods.push({
        id: restaurant._id.toString(),
        restaurantId: restaurant._id,
        name: restaurant.name,
        slug: restaurant.slug,
        rating: restaurant.rating || 0,
        image: restaurant.profileImage?.url || "",
        estimatedDeliveryTime: restaurant.estimatedDeliveryTime || "25-30 mins",
        foods: items.map((item) => ({
          id: item.id,
          name: item.name,
          price: item.price,
          originalPrice: item.originalPrice,
          image: item.image || (item.images?.[0] || ""),
          foodType: item.foodType,
          description: item.description || "",
          sectionName: item.sectionName,
          subsectionName: item.subsectionName,
        })),
      });
    }
  });

  return successResponse(res, 200, "Foods by category retrieved", {
    category,
    restaurants: restaurantsWithFoods,
    total: restaurantsWithFoods.length,
  });
});

/**
 * Check if a point is within a zone polygon using ray casting algorithm
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {Array} zoneCoordinates - Zone coordinates array
 * @returns {boolean}
 */
function isPointInZone(lat, lng, zoneCoordinates) {
  if (!zoneCoordinates || zoneCoordinates.length < 3) return false;

  let inside = false;
  for (
    let i = 0, j = zoneCoordinates.length - 1;
    i < zoneCoordinates.length;
    j = i++
  ) {
    const coordI = zoneCoordinates[i];
    const coordJ = zoneCoordinates[j];

    const xi =
      typeof coordI === "object" ? coordI.latitude || coordI.lat : null;
    const yi =
      typeof coordI === "object" ? coordI.longitude || coordI.lng : null;
    const xj =
      typeof coordJ === "object" ? coordJ.latitude || coordJ.lat : null;
    const yj =
      typeof coordJ === "object" ? coordJ.longitude || coordJ.lng : null;

    if (xi === null || yi === null || xj === null || yj === null) continue;

    const intersect =
      yi > lng !== yj > lng && lat < ((xj - xi) * (lng - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Check if a restaurant's location (pin) is within any active zone
 * @param {number} restaurantLat - Restaurant latitude
 * @param {number} restaurantLng - Restaurant longitude
 * @param {Array} activeZones - Array of active zones (cached)
 * @returns {boolean}
 */
function isRestaurantInAnyZone(restaurantLat, restaurantLng, activeZones) {
  if (!restaurantLat || !restaurantLng) return false;

  for (const zone of activeZones) {
    if (!zone.coordinates || zone.coordinates.length < 3) continue;

    let isInZone = false;
    if (typeof zone.containsPoint === "function") {
      isInZone = zone.containsPoint(restaurantLat, restaurantLng);
    } else {
      isInZone = isPointInZone(restaurantLat, restaurantLng, zone.coordinates);
    }

    if (isInZone) {
      return true;
    }
  }

  return false;
}

function calculateHaversineDistanceMeters(lat1, lng1, lat2, lng2) {
  const toRadians = (value) => (value * Math.PI) / 180;
  const earthRadiusMeters = 6371000;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMeters * c;
}

function getRestaurantCoordinates(restaurant) {
  const latitude =
    restaurant?.location?.latitude ??
    (Array.isArray(restaurant?.location?.coordinates)
      ? restaurant.location.coordinates[1]
      : null);
  const longitude =
    restaurant?.location?.longitude ??
    (Array.isArray(restaurant?.location?.coordinates)
      ? restaurant.location.coordinates[0]
      : null);

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

async function buildPublicRestaurantQuery(queryParams = {}) {
  const {
    cuisine,
    minRating,
    maxPrice,
    hasOffers,
    diningCategory,
    isDining,
  } = queryParams;

  const query = { isActive: true, isAcceptingOrders: { $ne: false } };

  if (cuisine) {
    query.cuisines = { $in: [new RegExp(cuisine, "i")] };
  }

  if (minRating) {
    query.rating = { $gte: parseFloat(minRating) };
  }

  if (queryParams.topRated === "true") {
    query.rating = { $gte: 4.5 };
  } else if (queryParams.trusted === "true") {
    query.rating = { $gte: 4.0 };
    query.totalRatings = { $gte: 100 };
  }

  if (maxPrice) {
    const priceMap = { 200: ["$"], 500: ["$", "$$"] };
    if (priceMap[maxPrice]) {
      query.priceRange = { $in: priceMap[maxPrice] };
    }
  }

  if (hasOffers === "true") {
    query.$or = [
      { offer: { $exists: true, $ne: null, $ne: "" } },
      { featuredPrice: { $exists: true } },
    ];
  }

  if (diningCategory) {
    const allCategories = await DiningCategory.find({ isActive: true }).lean();
    const targetCategory = allCategories.find(
      (category) =>
        category.name.toLowerCase().replace(/\s+/g, "-") ===
        diningCategory.toLowerCase(),
    );

    if (targetCategory) {
      query["diningConfig.categories"] = targetCategory._id;
      query["diningConfig.enabled"] = true;
      query.$and = [
        ...(query.$and || []),
        {
          $or: [
            { "diningSettings.isEnabled": { $exists: false } },
            { "diningSettings.isEnabled": { $ne: false } },
          ],
        },
      ];
    } else {
      query["diningConfig.categories"] = new mongoose.Types.ObjectId();
    }
  } else if (isDining === "true") {
    query["diningConfig.enabled"] = true;
    query.$and = [
      ...(query.$and || []),
      {
        $or: [
          { "diningSettings.isEnabled": { $exists: false } },
          { "diningSettings.isEnabled": { $ne: false } },
        ],
      },
    ];
  }

  return query;
}

function passesRestaurantFilters(restaurant, queryParams = {}, distanceMeters = null) {
  const { maxDeliveryTime, maxDistance } = queryParams;

  if (maxDeliveryTime) {
    const maxTime = parseInt(maxDeliveryTime, 10);
    const timeMatch = restaurant?.estimatedDeliveryTime?.match(/(\d+)/);
    if (!timeMatch || parseInt(timeMatch[1], 10) > maxTime) {
      return false;
    }
  }

  if (maxDistance) {
    const maxDistanceKm = parseFloat(maxDistance);
    if (distanceMeters != null) {
      if (distanceMeters / 1000 > maxDistanceKm) {
        return false;
      }
    } else {
      const distanceMatch = restaurant?.distance?.match(/(\d+\.?\d*)/);
      if (!distanceMatch || parseFloat(distanceMatch[1]) > maxDistanceKm) {
        return false;
      }
    }
  }

  return true;
}

async function findNearbyRestaurants(queryParams = {}, limit = 50) {
  const lat = parseFloat(queryParams.lat ?? queryParams.latitude);
  const lng = parseFloat(queryParams.lng ?? queryParams.longitude);
  const hasCoordinates = !Number.isNaN(lat) && !Number.isNaN(lng);
  const query = await buildPublicRestaurantQuery(queryParams);
  const selectFields = "-owner -createdAt -updatedAt -password";

  let restaurants = [];

  if (hasCoordinates) {
    restaurants = await Restaurant.find({
      ...query,
      "location.coordinates": {
        $near: {
          $geometry: { type: "Point", coordinates: [lng, lat] },
        },
      },
    })
      .select(selectFields)
      .limit(limit)
      .lean();
  } else {
    restaurants = await Restaurant.find(query)
      .select(selectFields)
      .sort({ rating: -1, totalRatings: -1, createdAt: -1 })
      .limit(limit)
      .lean();
  }

  const candidates = restaurants
    .map((restaurant) => {
      const coords = getRestaurantCoordinates(restaurant);
      const distanceMeters =
        hasCoordinates && coords
          ? calculateHaversineDistanceMeters(
              lat,
              lng,
              coords.latitude,
              coords.longitude,
            )
          : null;

      return {
        ...restaurant,
        _distanceMeters: distanceMeters,
      };
    })
    .filter((restaurant) =>
      passesRestaurantFilters(
        restaurant,
        queryParams,
        restaurant._distanceMeters,
      ),
    );

  candidates.sort((a, b) => {
    if (hasCoordinates) {
      const distanceA = a._distanceMeters ?? Number.POSITIVE_INFINITY;
      const distanceB = b._distanceMeters ?? Number.POSITIVE_INFINITY;
      if (distanceA !== distanceB) {
        return distanceA - distanceB;
      }
    }

    if ((b.rating || 0) !== (a.rating || 0)) {
      return (b.rating || 0) - (a.rating || 0);
    }

    return (b.totalRatings || 0) - (a.totalRatings || 0);
  });

  return candidates;
}

async function findNearestRestaurant(queryParams = {}) {
  const candidates = await findNearbyRestaurants(queryParams, 50);
  return candidates[0] || null;
}

function serializeNearestRestaurant(restaurant) {
  if (!restaurant) return null;
  const { _distanceMeters, ...restaurantData } = restaurant;
  return restaurantData;
}

function getFoodSearchScore(itemName = "", query = "") {
  const normalizedName = String(itemName).trim().toLowerCase();
  const normalizedQuery = String(query).trim().toLowerCase();

  if (!normalizedName || !normalizedQuery) return Number.POSITIVE_INFINITY;
  if (normalizedName === normalizedQuery) return 0;
  if (normalizedName.startsWith(normalizedQuery)) return 1;

  const wordIndex = normalizedName.indexOf(` ${normalizedQuery}`);
  if (wordIndex >= 0) return 2 + wordIndex;

  const partialIndex = normalizedName.indexOf(normalizedQuery);
  if (partialIndex >= 0) return 10 + partialIndex;

  return Number.POSITIVE_INFINITY;
}

/**
 * GET /api/restaurant/search/foods?query=keyword&lat=xx&lng=yy
 * Returns top 4 matching food items across active restaurants.
 */
export const searchFoods = asyncHandler(async (req, res) => {
  const query = String(req.query.query || "").trim();
  const lat = parseFloat(req.query.lat ?? req.query.latitude);
  const lng = parseFloat(req.query.lng ?? req.query.longitude);
  const hasCoordinates = !Number.isNaN(lat) && !Number.isNaN(lng);

  if (!query) {
    return successResponse(res, 200, "Food search results retrieved", {
      items: [],
      total: 0,
      query: "",
    });
  }

  const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

  const menus = await Menu.find({ isActive: true })
    .populate({
      path: "restaurant",
      match: { isActive: true, isAcceptingOrders: { $ne: false } },
      select:
        "_id restaurantId name slug rating totalRatings profileImage estimatedDeliveryTime location",
    })
    .lean();

  const matches = [];

  for (const menu of menus) {
    const restaurant = menu.restaurant;
    if (!restaurant) continue;

    const restaurantCoords = getRestaurantCoordinates(restaurant);
    const distanceMeters =
      hasCoordinates && restaurantCoords
        ? calculateHaversineDistanceMeters(
            lat,
            lng,
            restaurantCoords.latitude,
            restaurantCoords.longitude,
          )
        : null;

    const pushItem = (item, sectionName = "", subsectionName = "") => {
      if (!item || item.isAvailable === false) return;
      if (item.approvalStatus && item.approvalStatus !== "approved") return;
      if (!regex.test(String(item.name || ""))) return;

      matches.push({
        foodId: item.id,
        foodName: item.name,
        image: item.image || item.images?.[0] || "",
        price: item.price ?? 0,
        restaurantId:
          restaurant.restaurantId ||
          restaurant._id?.toString?.() ||
          "",
        restaurantName: restaurant.name || "",
        restaurantSlug: restaurant.slug || "",
        category: item.category || subsectionName || sectionName || "",
        isAvailable: item.isAvailable !== false,
        searchScore: getFoodSearchScore(item.name, query),
        restaurantRating: restaurant.rating || 0,
        totalRatings: restaurant.totalRatings || 0,
        distance: distanceMeters,
      });
    };

    for (const section of menu.sections || []) {
      if (section?.isEnabled === false) continue;

      for (const item of section.items || []) {
        pushItem(item, section.name);
      }

      for (const subsection of section.subsections || []) {
        for (const item of subsection.items || []) {
          pushItem(item, section.name, subsection.name);
        }
      }
    }
  }

  matches.sort((a, b) => {
    if (a.searchScore !== b.searchScore) return a.searchScore - b.searchScore;

    if (hasCoordinates) {
      const distanceA = a.distance ?? Number.POSITIVE_INFINITY;
      const distanceB = b.distance ?? Number.POSITIVE_INFINITY;
      if (distanceA !== distanceB) return distanceA - distanceB;
    }

    if ((b.restaurantRating || 0) !== (a.restaurantRating || 0)) {
      return (b.restaurantRating || 0) - (a.restaurantRating || 0);
    }

    return (b.totalRatings || 0) - (a.totalRatings || 0);
  });

  const items = matches.slice(0, 4).map((item) => ({
    foodId: item.foodId,
    foodName: item.foodName,
    image: item.image,
    price: item.price,
    restaurantId: item.restaurantId,
    restaurantName: item.restaurantName,
    restaurantSlug: item.restaurantSlug,
    category: item.category,
    isAvailable: item.isAvailable,
  }));

  return successResponse(res, 200, "Food search results retrieved", {
    items,
    total: items.length,
    query,
  });
});

/**
 * Get restaurant's zoneId based on location
 * @param {number} restaurantLat - Restaurant latitude
 * @param {number} restaurantLng - Restaurant longitude
 * @param {Array} activeZones - Array of active zones
 * @returns {string|null} Zone ID or null
 */
function getRestaurantZoneId(restaurantLat, restaurantLng, activeZones) {
  if (!restaurantLat || !restaurantLng) return null;

  for (const zone of activeZones) {
    if (!zone.coordinates || zone.coordinates.length < 3) continue;

    let isInZone = false;
    if (typeof zone.containsPoint === "function") {
      isInZone = zone.containsPoint(restaurantLat, restaurantLng);
    } else {
      isInZone = isPointInZone(restaurantLat, restaurantLng, zone.coordinates);
    }

    if (isInZone) {
      return zone._id.toString();
    }
  }

  return null;
}

// Get all restaurants (for user module)
export const getRestaurants = async (req, res) => {
  try {
    const nearestRestaurant = await findNearestRestaurant(req.query);
    const restaurant = serializeNearestRestaurant(nearestRestaurant);
    const restaurants = restaurant ? [restaurant] : [];

    return successResponse(res, 200, "Restaurants retrieved successfully", {
      restaurants,
      total: restaurants.length,
      filters: { ...req.query },
    });
  } catch (error) {
    console.error("Error fetching restaurants:", error);
    return errorResponse(res, 500, "Failed to fetch restaurants");
  }
};

export const getNearestRestaurant = asyncHandler(async (req, res) => {
  const nearestRestaurant = await findNearestRestaurant(req.query);

  if (!nearestRestaurant) {
    return successResponse(res, 200, "No nearby restaurant found", {
      restaurant: null,
    });
  }

  return successResponse(res, 200, "Nearest restaurant retrieved successfully", {
    restaurant: serializeNearestRestaurant(nearestRestaurant),
  });
});

// Get restaurant by ID or slug
export const getRestaurantById = async (req, res) => {
  try {
    const { id } = req.params;

    // Build query conditions - only include _id if it's a valid ObjectId
    const queryConditions = {
      isActive: true,
    };

    const orConditions = [{ restaurantId: id }, { slug: id }];

    // Only add _id condition if the id is a valid ObjectId
    if (mongoose.Types.ObjectId.isValid(id) && id.length === 24) {
      orConditions.push({ _id: new mongoose.Types.ObjectId(id) });
    }

    queryConditions.$or = orConditions;

    const restaurant = await Restaurant.findOne(queryConditions)
      .select("-owner -createdAt -updatedAt")
      .lean();

    if (!restaurant) {
      return errorResponse(res, 404, "Restaurant not found");
    }

    return successResponse(res, 200, "Restaurant retrieved successfully", {
      restaurant,
    });
  } catch (error) {
    console.error("Error fetching restaurant:", error);
    return errorResponse(res, 500, "Failed to fetch restaurant");
  }
};

// Get restaurant by owner (for restaurant module)
export const getRestaurantByOwner = async (req, res) => {
  try {
    const restaurantId = req.restaurant._id;

    const restaurant = await Restaurant.findById(restaurantId).lean();

    if (!restaurant) {
      return errorResponse(res, 404, "Restaurant not found");
    }

    return successResponse(res, 200, "Restaurant retrieved successfully", {
      restaurant,
    });
  } catch (error) {
    console.error("Error fetching restaurant:", error);
    return errorResponse(res, 500, "Failed to fetch restaurant");
  }
};

// Create/Update restaurant from onboarding data
export const createRestaurantFromOnboarding = async (
  onboardingData,
  restaurantId,
) => {
  try {
    const { step1, step2, step4 } = onboardingData;

    if (!step1 || !step2) {
      throw new Error("Incomplete onboarding data: Missing step1 or step2");
    }

    // Validate required fields
    if (!step1.restaurantName) {
      throw new Error("Restaurant name is required");
    }

    // Find existing restaurant
    const existing = await Restaurant.findById(restaurantId);

    if (!existing) {
      throw new Error("Restaurant not found");
    }

    // Generate slug from restaurant name
    let baseSlug = step1.restaurantName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    // Check if slug needs to be unique (if it's different from existing)
    let slug = baseSlug;
    if (existing.slug !== baseSlug) {
      // Check if the new slug already exists for another restaurant
      const existingBySlug = await Restaurant.findOne({
        slug: baseSlug,
        _id: { $ne: existing._id },
      });
      if (existingBySlug) {
        // Make slug unique by appending a number
        let counter = 1;
        let uniqueSlug = `${baseSlug}-${counter}`;
        while (
          await Restaurant.findOne({
            slug: uniqueSlug,
            _id: { $ne: existing._id },
          })
        ) {
          counter++;
          uniqueSlug = `${baseSlug}-${counter}`;
        }
        slug = uniqueSlug;
        console.log(`Slug already exists, using unique slug: ${slug}`);
      }
    } else {
      slug = existing.slug; // Keep existing slug
    }

    // Update existing restaurant with latest onboarding data
    existing.name = step1.restaurantName || existing.name;
    existing.slug = slug;
    existing.ownerName = step1.ownerName || existing.ownerName;
    existing.ownerEmail = step1.ownerEmail || existing.ownerEmail;
    existing.ownerPhone = step1.ownerPhone || existing.ownerPhone;
    existing.primaryContactNumber =
      step1.primaryContactNumber || existing.primaryContactNumber;
    if (step1.location) existing.location = step1.location;

    // Update step2 data - always update even if empty arrays
    if (step2) {
      if (step2.profileImageUrl) {
        existing.profileImage = step2.profileImageUrl;
      }
      if (step2.menuImageUrls) {
        existing.menuImages = step2.menuImageUrls; // Update even if empty array
      }
      if (step2.cuisines) {
        existing.cuisines = step2.cuisines; // Update even if empty array
      }
      if (step2.deliveryTimings) {
        existing.deliveryTimings = step2.deliveryTimings;
      }
      if (step2.openDays) {
        existing.openDays = step2.openDays; // Update even if empty array
      }
    }

    // Update step4 data if available
    if (step4) {
      if (step4.estimatedDeliveryTime)
        existing.estimatedDeliveryTime = step4.estimatedDeliveryTime;
      if (step4.distance) existing.distance = step4.distance;
      if (step4.priceRange) existing.priceRange = step4.priceRange;
      if (step4.featuredDish) existing.featuredDish = step4.featuredDish;
      if (step4.featuredPrice !== undefined)
        existing.featuredPrice = step4.featuredPrice;
      if (step4.offer) existing.offer = step4.offer;
    }

    // Completing onboarding should submit the restaurant for admin review,
    // not auto-approve it.
    existing.isActive = false;
    existing.isAcceptingOrders = false;
    existing.approvedAt = null;
    existing.approvedBy = null;

    try {
      await existing.save();
    } catch (saveError) {
      if (
        saveError.code === 11000 &&
        saveError.keyPattern &&
        saveError.keyPattern.slug
      ) {
        // Slug conflict - try to make it unique
        let counter = 1;
        let uniqueSlug = `${slug}-${counter}`;
        while (
          await Restaurant.findOne({
            slug: uniqueSlug,
            _id: { $ne: existing._id },
          })
        ) {
          counter++;
          uniqueSlug = `${slug}-${counter}`;
        }
        existing.slug = uniqueSlug;
        await existing.save();
        console.log(`Updated slug to unique value: ${uniqueSlug}`);
      } else {
        throw saveError;
      }
    }
    console.log("✅ Restaurant updated successfully:", {
      restaurantId: existing.restaurantId,
      _id: existing._id,
      name: existing.name,
      isActive: existing.isActive,
    });
    return existing;
  } catch (error) {
    console.error("Error creating restaurant from onboarding:", error);
    console.error("Error stack:", error.stack);
    console.error("Onboarding data received:", {
      hasStep1: !!onboardingData?.step1,
      hasStep2: !!onboardingData?.step2,
      step1Keys: onboardingData?.step1 ? Object.keys(onboardingData.step1) : [],
      step2Keys: onboardingData?.step2 ? Object.keys(onboardingData.step2) : [],
    });
    throw error;
  }
};

/**
 * Update restaurant profile
 * PUT /api/restaurant/profile
 */
export const updateRestaurantProfile = asyncHandler(async (req, res) => {
  try {
    const restaurantId = req.restaurant._id;
    const {
      profileImage,
      menuImages,
      name,
      cuisines,
      location,
      ownerName,
      ownerEmail,
      ownerPhone,
    } = req.body;

    const restaurant = await Restaurant.findById(restaurantId);

    if (!restaurant) {
      return errorResponse(res, 404, "Restaurant not found");
    }

    const updateData = {};

    // Update profile image if provided
    if (profileImage) {
      updateData.profileImage = profileImage;
    }

    // Update menu images if provided
    if (menuImages !== undefined) {
      updateData.menuImages = menuImages;
    }

    // Update name if provided
    if (name) {
      updateData.name = name;
      // Regenerate slug if name changed
      if (name !== restaurant.name) {
        let baseSlug = name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "");

        // Check if slug already exists for another restaurant
        let slug = baseSlug;
        const existingBySlug = await Restaurant.findOne({
          slug: baseSlug,
          _id: { $ne: restaurantId },
        });
        if (existingBySlug) {
          let counter = 1;
          let uniqueSlug = `${baseSlug}-${counter}`;
          while (
            await Restaurant.findOne({
              slug: uniqueSlug,
              _id: { $ne: restaurantId },
            })
          ) {
            counter++;
            uniqueSlug = `${baseSlug}-${counter}`;
          }
          slug = uniqueSlug;
        }
        updateData.slug = slug;
      }
    }

    // Update cuisines if provided
    if (cuisines !== undefined) {
      updateData.cuisines = cuisines;
    }

    // Update location if provided
    if (location) {
      // Ensure coordinates array is set if latitude/longitude exist
      if (location.latitude && location.longitude && !location.coordinates) {
        location.coordinates = [location.longitude, location.latitude]; // GeoJSON format: [lng, lat]
      }

      // If coordinates array exists but no lat/lng, extract them
      if (
        location.coordinates &&
        Array.isArray(location.coordinates) &&
        location.coordinates.length >= 2
      ) {
        if (!location.longitude) location.longitude = location.coordinates[0];
        if (!location.latitude) location.latitude = location.coordinates[1];
      }

      updateData.location = location;
    }

    // Update owner details if provided
    if (ownerName !== undefined) {
      updateData.ownerName = ownerName;
    }
    if (ownerEmail !== undefined) {
      updateData.ownerEmail = ownerEmail;
    }
    if (ownerPhone !== undefined) {
      updateData.ownerPhone = ownerPhone;
    }

    // Update restaurant
    Object.assign(restaurant, updateData);
    await restaurant.save();

    return successResponse(
      res,
      200,
      "Restaurant profile updated successfully",
      {
        restaurant: {
          id: restaurant._id,
          restaurantId: restaurant.restaurantId,
          name: restaurant.name,
          slug: restaurant.slug,
          profileImage: restaurant.profileImage,
          menuImages: restaurant.menuImages,
          cuisines: restaurant.cuisines,
          location: restaurant.location,
          ownerName: restaurant.ownerName,
          ownerEmail: restaurant.ownerEmail,
          ownerPhone: restaurant.ownerPhone,
        },
      },
    );
  } catch (error) {
    console.error("Error updating restaurant profile:", error);
    return errorResponse(res, 500, "Failed to update restaurant profile");
  }
});

/**
 * Upload restaurant profile image
 * POST /api/restaurant/profile/image
 */
export const uploadProfileImage = asyncHandler(async (req, res) => {
  try {
    if (!req.file) {
      return errorResponse(res, 400, "No image file provided");
    }

    // Initialize Cloudinary if not already initialized
    await initializeCloudinary();

    const restaurantId = req.restaurant._id;
    const restaurant = await Restaurant.findById(restaurantId);

    if (!restaurant) {
      return errorResponse(res, 404, "Restaurant not found");
    }

    // Upload to Cloudinary
    const folder = "appzeto/restaurant/profile";
    const result = await uploadToCloudinary(req.file.buffer, {
      folder,
      resource_type: "image",
      transformation: [
        { width: 800, height: 800, crop: "fill", gravity: "auto" },
        { quality: "auto" },
      ],
    });

    // Update restaurant profile image
    restaurant.profileImage = {
      url: result.secure_url,
      publicId: result.public_id,
    };
    await restaurant.save();

    return successResponse(res, 200, "Profile image uploaded successfully", {
      profileImage: restaurant.profileImage,
    });
  } catch (error) {
    console.error("Error uploading profile image:", error);
    return errorResponse(res, 500, "Failed to upload profile image");
  }
});

/**
 * Upload restaurant menu image
 * POST /api/restaurant/profile/menu-image
 */
export const uploadMenuImage = asyncHandler(async (req, res) => {
  try {
    if (!req.file) {
      return errorResponse(res, 400, "No image file provided");
    }

    // Validate file buffer
    if (!req.file.buffer || req.file.buffer.length === 0) {
      return errorResponse(res, 400, "File buffer is empty or invalid");
    }

    // Validate file size (max 20MB)
    const maxSize = 20 * 1024 * 1024; // 20MB
    if (req.file.size > maxSize) {
      return errorResponse(
        res,
        400,
        `File size exceeds ${maxSize / (1024 * 1024)}MB limit`,
      );
    }

    // Validate file type
    const allowedMimeTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "image/gif",
    ];
    if (!allowedMimeTypes.includes(req.file.mimetype)) {
      return errorResponse(
        res,
        400,
        `Invalid file type. Allowed types: ${allowedMimeTypes.join(", ")}`,
      );
    }

    // Initialize Cloudinary if not already initialized
    await initializeCloudinary();

    const restaurantId = req.restaurant._id;
    const restaurant = await Restaurant.findById(restaurantId);

    if (!restaurant) {
      return errorResponse(res, 404, "Restaurant not found");
    }

    console.log("📤 Uploading menu image to Cloudinary:", {
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      bufferSize: req.file.buffer.length,
      restaurantId: restaurantId.toString(),
    });

    // Upload to Cloudinary
    const folder = "appzeto/restaurant/menu";
    const result = await uploadToCloudinary(req.file.buffer, {
      folder,
      resource_type: "image",
      transformation: [
        { width: 1200, height: 800, crop: "fill", gravity: "auto" },
        { quality: "auto" },
      ],
    });

    // Replace first menu image (main banner) or add if none exists
    if (!restaurant.menuImages) {
      restaurant.menuImages = [];
    }

    // Replace the first menu image (main banner) instead of adding a new one
    const newMenuImage = {
      url: result.secure_url,
      publicId: result.public_id,
    };

    if (restaurant.menuImages.length > 0) {
      // Replace the first image (main banner)
      restaurant.menuImages[0] = newMenuImage;
    } else {
      // Add as first image if array is empty
      restaurant.menuImages.push(newMenuImage);
    }

    await restaurant.save();

    return successResponse(res, 200, "Menu image uploaded successfully", {
      menuImage: {
        url: result.secure_url,
        publicId: result.public_id,
      },
      menuImages: restaurant.menuImages,
    });
  } catch (error) {
    console.error("❌ Error uploading menu image:", {
      message: error.message,
      stack: error.stack,
      errorType: error.constructor.name,
      hasFile: !!req.file,
      fileName: req.file?.originalname,
      fileSize: req.file?.size,
      bufferSize: req.file?.buffer?.length,
      restaurantId: req.restaurant?._id,
      cloudinaryError:
        error.http_code || error.name === "Error" ? error.message : null,
    });

    // Provide more specific error message
    let errorMessage = "Failed to upload menu image";
    if (error.message) {
      errorMessage += `: ${error.message}`;
    } else if (error.http_code) {
      errorMessage += `: Cloudinary error (${error.http_code})`;
    }

    return errorResponse(res, 500, errorMessage);
  }
});

/**
 * Update restaurant delivery status (isAcceptingOrders)
 * PUT /api/restaurant/delivery-status
 */
export const updateDeliveryStatus = asyncHandler(async (req, res) => {
  try {
    const restaurantId = req.restaurant._id;
    const { isAcceptingOrders } = req.body;

    if (typeof isAcceptingOrders !== "boolean") {
      return errorResponse(
        res,
        400,
        "isAcceptingOrders must be a boolean value",
      );
    }

    const restaurant = await Restaurant.findByIdAndUpdate(
      restaurantId,
      { isAcceptingOrders },
      { new: true },
    ).select("-password");

    if (!restaurant) {
      return errorResponse(res, 404, "Restaurant not found");
    }

    return successResponse(res, 200, "Delivery status updated successfully", {
      restaurant: {
        id: restaurant._id,
        isAcceptingOrders: restaurant.isAcceptingOrders,
      },
    });
  } catch (error) {
    console.error("Error updating delivery status:", error);
    return errorResponse(res, 500, "Failed to update delivery status");
  }
});

/**
 * Delete restaurant account
 * DELETE /api/restaurant/profile
 */
export const deleteRestaurantAccount = asyncHandler(async (req, res) => {
  try {
    const restaurantId = req.restaurant._id;
    const restaurant = await Restaurant.findById(restaurantId);

    if (!restaurant) {
      return errorResponse(res, 404, "Restaurant not found");
    }

    // Delete Cloudinary images if they exist
    try {
      // Delete profile image
      if (restaurant.profileImage?.publicId) {
        try {
          await deleteFromCloudinary(restaurant.profileImage.publicId);
        } catch (error) {
          console.error("Error deleting profile image from Cloudinary:", error);
          // Continue with account deletion even if image deletion fails
        }
      }

      // Delete menu images
      if (restaurant.menuImages && Array.isArray(restaurant.menuImages)) {
        for (const menuImage of restaurant.menuImages) {
          if (menuImage?.publicId) {
            try {
              await deleteFromCloudinary(menuImage.publicId);
            } catch (error) {
              console.error(
                "Error deleting menu image from Cloudinary:",
                error,
              );
              // Continue with account deletion even if image deletion fails
            }
          }
        }
      }
    } catch (error) {
      console.error("Error deleting images from Cloudinary:", error);
      // Continue with account deletion even if image deletion fails
    }

    // Delete the restaurant from database
    await Restaurant.findByIdAndDelete(restaurantId);

    console.log(`Restaurant account deleted: ${restaurantId}`, {
      restaurantId: restaurant.restaurantId,
      name: restaurant.name,
    });

    return successResponse(res, 200, "Restaurant account deleted successfully");
  } catch (error) {
    console.error("Error deleting restaurant account:", error);
    return errorResponse(res, 500, "Failed to delete restaurant account");
  }
});

// Get restaurants with dishes under ₹250
export const getRestaurantsWithDishesUnder250 = async (req, res) => {
  try {
    const MAX_PRICE = 250;

    // Helper function to calculate final price after discount
    const getFinalPrice = (item) => {
      // price is typically the current/discounted price
      // If discount exists, calculate from originalPrice, otherwise use price directly
      if (
        item.originalPrice &&
        item.discountAmount &&
        item.discountAmount > 0
      ) {
        // Calculate discounted price from originalPrice
        let discountedPrice = item.originalPrice;
        if (item.discountType === "Percent") {
          discountedPrice =
            item.originalPrice -
            (item.originalPrice * item.discountAmount) / 100;
        } else if (item.discountType === "Fixed") {
          discountedPrice = item.originalPrice - item.discountAmount;
        }
        return Math.max(0, discountedPrice);
      }
      // Otherwise, use price as the final price
      return Math.max(0, item.price || 0);
    };

    // Helper function to filter items under ₹250
    const filterItemsUnder250 = (items) => {
      return items.filter((item) => {
        if (item.isAvailable === false) return false;
        const finalPrice = getFinalPrice(item);
        return finalPrice <= MAX_PRICE;
      });
    };

    // Helper function to process a single restaurant
    const processRestaurant = async (restaurant) => {
      try {
        // Get menu for this restaurant
        const menu = await Menu.findOne({
          restaurant: restaurant._id,
          isActive: true,
        }).lean();

        if (!menu || !menu.sections || menu.sections.length === 0) {
          return null; // Skip restaurants without menus
        }

        // Collect all dishes under ₹250 from all sections
        const dishesUnder250 = [];

        menu.sections.forEach((section) => {
          if (section.isEnabled === false) return;

          // Filter direct items in section
          const sectionItems = filterItemsUnder250(section.items || []);
          dishesUnder250.push(
            ...sectionItems.map((item) => ({
              ...item,
              sectionName: section.name,
            })),
          );

          // Filter items in subsections
          (section.subsections || []).forEach((subsection) => {
            const subsectionItems = filterItemsUnder250(subsection.items || []);
            dishesUnder250.push(
              ...subsectionItems.map((item) => ({
                ...item,
                sectionName: section.name,
                subsectionName: subsection.name,
              })),
            );
          });
        });

        // Only include restaurant if it has at least one dish under ₹250
        if (dishesUnder250.length > 0) {
          return {
            id: restaurant._id.toString(),
            restaurantId: restaurant.restaurantId,
            name: restaurant.name,
            slug: restaurant.slug,
            rating: restaurant.rating || 0,
            totalRatings: restaurant.totalRatings || 0,
            deliveryTime: restaurant.estimatedDeliveryTime || "25-30 mins",
            distance: restaurant.distance || "1.2 km",
            cuisine:
              restaurant.cuisines && restaurant.cuisines.length > 0
                ? restaurant.cuisines.join(" • ")
                : "Multi-cuisine",
            price: restaurant.priceRange || "$$",
            image:
              restaurant.profileImage?.url ||
              restaurant.menuImages?.[0]?.url ||
              "",
            menuItems: dishesUnder250.map((item) => ({
              id: item.id,
              name: item.name,
              price: getFinalPrice(item),
              originalPrice: item.originalPrice || item.price,
              image:
                item.image ||
                (item.images && item.images.length > 0 ? item.images[0] : ""),
              isVeg: item.foodType === "Veg",
              bestPrice:
                item.discountAmount > 0 ||
                (item.originalPrice &&
                  item.originalPrice > getFinalPrice(item)),
              description: item.description || "",
              category: item.category || item.sectionName || "",
            })),
          };
        }
        return null;
      } catch (error) {
        console.error(`Error processing restaurant ${restaurant._id}:`, error);
        return null;
      }
    };

    const nearestRestaurant = await findNearestRestaurant(req.query);
    const restaurantsWithDishes = [];

    if (nearestRestaurant) {
      const processedRestaurant = await processRestaurant(nearestRestaurant);
      if (processedRestaurant) {
        restaurantsWithDishes.push(processedRestaurant);
      }
    }

    // Sort by rating (highest first) or by number of dishes
    restaurantsWithDishes.sort((a, b) => {
      if (b.rating !== a.rating) {
        return b.rating - a.rating;
      }
      return b.menuItems.length - a.menuItems.length;
    });

    return successResponse(
      res,
      200,
      "Restaurants with dishes under ₹250 retrieved successfully",
      {
        restaurants: restaurantsWithDishes,
        total: restaurantsWithDishes.length,
      },
    );
  } catch (error) {
    console.error("Error fetching restaurants with dishes under ₹250:", error);
    return errorResponse(
      res,
      500,
      "Failed to fetch restaurants with dishes under ₹250",
    );
  }
};
