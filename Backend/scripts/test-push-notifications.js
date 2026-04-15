/**
 * Test Script: Push Notifications
 *
 * What it does:
 * 1. Connects to MongoDB
 * 2. Checks Firebase Admin messaging initialization
 * 3. Finds saved FCM tokens for user / restaurant / delivery
 * 4. Sends a live test push through Ziggy's notification helper
 *
 * Usage:
 *   node scripts/test-push-notifications.js
 *   node scripts/test-push-notifications.js --role=user
 *   node scripts/test-push-notifications.js --role=restaurant --id=<mongo-or-public-id>
 *   node scripts/test-push-notifications.js --role=delivery --id=<mongo-or-public-id>
 */

import dotenv from "dotenv";
import mongoose from "mongoose";
import admin from "firebase-admin";
import { connectDB } from "../config/database.js";
import User from "../modules/auth/models/User.js";
import Restaurant from "../modules/restaurant/models/Restaurant.js";
import Delivery from "../modules/delivery/models/Delivery.js";
import { initializeFirebaseAdminMessaging } from "../shared/services/firebaseAdmin.js";
import { sendEntityPushNotification } from "../modules/order/services/pushNotificationService.js";
import { getFirebaseCredentials } from "../shared/utils/envService.js";

dotenv.config();

const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

function log(message, color = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function parseArgs(argv) {
  const parsed = {};
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [key, ...rest] = arg.slice(2).split("=");
    parsed[key] = rest.join("=") || true;
  }
  return parsed;
}

function collectTokens(record) {
  return {
    web: record?.fcmTokenWeb || null,
    android: record?.fcmTokenAndroid || null,
    ios: record?.fcmTokenIos || null,
    count: [record?.fcmTokenWeb, record?.fcmTokenAndroid, record?.fcmTokenIos].filter(Boolean)
      .length,
  };
}

function previewToken(token) {
  if (!token) return "none";
  if (token.length <= 18) return token;
  return `${token.slice(0, 10)}...${token.slice(-8)}`;
}

function getAgeInfo(dateValue) {
  if (!dateValue) return { days: null, text: "unknown" };
  const ms = Date.now() - new Date(dateValue).getTime();
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  return {
    days,
    text: days === 0 ? "today" : `${days} day(s) ago`,
  };
}

function assessStaleness(record) {
  const age = getAgeInfo(record?.updatedAt);
  if (age.days === null) return { level: "unknown", reason: "missing updatedAt" };
  if (age.days > 90) return { level: "high", reason: `record updated ${age.text}` };
  if (age.days > 30) return { level: "medium", reason: `record updated ${age.text}` };
  return { level: "low", reason: `record updated ${age.text}` };
}

function summarizeTarget(role, record) {
  const tokens = collectTokens(record);
  return {
    role,
    mongoId: record?._id?.toString() || null,
    publicId:
      role === "restaurant"
        ? record?.restaurantId || null
        : role === "delivery"
          ? record?.deliveryId || null
          : null,
    name: record?.name || record?.ownerName || "Unknown",
    tokens,
    updatedAt: record?.updatedAt || null,
    staleness: assessStaleness(record),
  };
}

function extractTokensWithPlatform(record) {
  return [
    { platform: "web", token: record?.fcmTokenWeb || null },
    { platform: "android", token: record?.fcmTokenAndroid || null },
    { platform: "ios", token: record?.fcmTokenIos || null },
  ].filter((item) => item.token);
}

async function diagnoseSingleToken(token, platform) {
  try {
    const response = await admin.messaging().send(
      {
        token,
        notification: {
          title: "Ziggy token diagnostic",
          body: `Diagnostic check for ${platform}`,
        },
        data: {
          type: "push_diagnostic",
          platform,
          checkedAt: new Date().toISOString(),
        },
      },
      true,
    );

    return {
      platform,
      ok: true,
      messageId: response,
    };
  } catch (error) {
    return {
      platform,
      ok: false,
      code: error?.code || "unknown",
      message: error?.message || "Unknown Firebase error",
    };
  }
}

async function diagnoseTargetTokens(target) {
  const tokens = extractTokensWithPlatform(target);
  const results = [];

  for (const item of tokens) {
    const diagnosis = await diagnoseSingleToken(item.token, item.platform);
    results.push({
      ...diagnosis,
      preview: previewToken(item.token),
      length: item.token.length,
    });
  }

  return results;
}

async function inspectFirebaseSetup() {
  const creds = await getFirebaseCredentials();
  const app = admin.apps[0] || null;
  const appOptions = app?.options || {};

  return {
    envProjectId: creds.projectId || process.env.FIREBASE_PROJECT_ID || "",
    envSenderId:
      creds.messagingSenderId || process.env.FIREBASE_MESSAGING_SENDER_ID || "",
    appProjectId:
      appOptions.projectId ||
      appOptions.credential?.projectId ||
      appOptions.credential?.certificate?.projectId ||
      "",
    appClientEmail:
      appOptions.clientEmail ||
      appOptions.credential?.clientEmail ||
      appOptions.credential?.certificate?.clientEmail ||
      "",
  };
}

async function findTargetRecord(role, requestedId = null) {
  if (role === "user") {
    if (requestedId) {
      if (mongoose.Types.ObjectId.isValid(requestedId)) {
        const byId = await User.findById(requestedId).lean();
        if (byId) return byId;
      }
      return User.findOne({
        $or: [{ phone: requestedId }, { email: requestedId }],
      }).lean();
    }

    return User.findOne({
      $or: [
        { fcmTokenWeb: { $ne: null } },
        { fcmTokenAndroid: { $ne: null } },
        { fcmTokenIos: { $ne: null } },
      ],
    })
      .sort({ updatedAt: -1 })
      .lean();
  }

  if (role === "restaurant") {
    if (requestedId) {
      if (mongoose.Types.ObjectId.isValid(requestedId)) {
        const byId = await Restaurant.findById(requestedId).lean();
        if (byId) return byId;
      }
      return Restaurant.findOne({
        $or: [{ restaurantId: requestedId }, { slug: requestedId }, { phone: requestedId }],
      }).lean();
    }

    return Restaurant.findOne({
      $or: [
        { fcmTokenWeb: { $ne: null } },
        { fcmTokenAndroid: { $ne: null } },
        { fcmTokenIos: { $ne: null } },
      ],
    })
      .sort({ updatedAt: -1 })
      .lean();
  }

  if (role === "delivery") {
    if (requestedId) {
      if (mongoose.Types.ObjectId.isValid(requestedId)) {
        const byId = await Delivery.findById(requestedId).lean();
        if (byId) return byId;
      }
      return Delivery.findOne({
        $or: [{ deliveryId: requestedId }, { phone: requestedId }, { email: requestedId }],
      }).lean();
    }

    return Delivery.findOne({
      $or: [
        { fcmTokenWeb: { $ne: null } },
        { fcmTokenAndroid: { $ne: null } },
        { fcmTokenIos: { $ne: null } },
      ],
    })
      .sort({ updatedAt: -1 })
      .lean();
  }

  throw new Error(`Unsupported role: ${role}`);
}

async function countTokenCoverage() {
  const buildQuery = {
    $or: [
      { fcmTokenWeb: { $ne: null } },
      { fcmTokenAndroid: { $ne: null } },
      { fcmTokenIos: { $ne: null } },
    ],
  };

  const [users, restaurants, deliveries] = await Promise.all([
    User.countDocuments(buildQuery),
    Restaurant.countDocuments(buildQuery),
    Delivery.countDocuments(buildQuery),
  ]);

  return { users, restaurants, deliveries };
}

async function sendTestForRole(role, requestedId = null) {
  const record = await findTargetRecord(role, requestedId);
  if (!record) {
    log(`No ${role} record found for testing`, "red");
    return { role, sent: false, reason: "record_not_found" };
  }

  const target = summarizeTarget(role, record);
  const targetId = target.mongoId;

  log(`\nTesting role: ${role}`, "cyan");
  log(`Target: ${target.name}`, "blue");
  log(`Mongo ID: ${target.mongoId || "N/A"}`, "blue");
  if (target.publicId) log(`Public ID: ${target.publicId}`, "blue");
  log(
    `Record updated: ${target.updatedAt ? new Date(target.updatedAt).toISOString() : "unknown"} (${getAgeInfo(target.updatedAt).text})`,
    "blue",
  );
  log(
    `Staleness check: ${target.staleness.level.toUpperCase()} - ${target.staleness.reason}`,
    target.staleness.level === "high"
      ? "yellow"
      : target.staleness.level === "medium"
        ? "yellow"
        : "green",
  );
  log(
    `Tokens -> web: ${target.tokens.web ? "yes" : "no"}, android: ${target.tokens.android ? "yes" : "no"}, ios: ${target.tokens.ios ? "yes" : "no"}`,
    target.tokens.count > 0 ? "green" : "yellow",
  );
  if (target.tokens.web) log(`  web token: ${previewToken(target.tokens.web)} (len=${target.tokens.web.length})`, "blue");
  if (target.tokens.android) {
    log(`  android token: ${previewToken(target.tokens.android)} (len=${target.tokens.android.length})`, "blue");
  }
  if (target.tokens.ios) log(`  ios token: ${previewToken(target.tokens.ios)} (len=${target.tokens.ios.length})`, "blue");

  if (target.tokens.count === 0) {
    log(`Skipping ${role} send because no FCM tokens are saved`, "yellow");
    return { role, sent: false, reason: "missing_tokens", target };
  }

  const tokenDiagnostics = await diagnoseTargetTokens(record);
  log("Per-token Firebase diagnostics:", "magenta");
  for (const item of tokenDiagnostics) {
    if (item.ok) {
      log(`  ${item.platform}: dry-run accepted (${item.preview})`, "green");
    } else {
      log(
        `  ${item.platform}: ${item.code} - ${item.message} (${item.preview})`,
        "red",
      );
    }
  }

  const result = await sendEntityPushNotification(targetId, role, {
    title: `Ziggy ${role} push test`,
    body: `Test notification sent at ${new Date().toISOString()}`,
    data: {
      type: "push_test",
      role,
      targetId: target.mongoId,
      publicId: target.publicId || "",
      sentAt: new Date().toISOString(),
    },
  });

  const successCount = result?.successCount || 0;
  const failureCount = result?.failureCount || 0;

  if (successCount > 0) {
    log(
      `Push send reported success for ${role}: success=${successCount}, failure=${failureCount}`,
      "green",
    );
  } else {
    log(
      `Push send did not report success for ${role}: success=${successCount}, failure=${failureCount}`,
      failureCount > 0 ? "red" : "yellow",
    );
  }

  if (result?.failedTokens?.length) {
    log("Failed token details:", "yellow");
    for (const failed of result.failedTokens) {
      log(`  - ${failed.code}`, "yellow");
    }
  }

  if (result?.cleanupTokens?.length) {
    log(`Cleanup suggested for ${result.cleanupTokens.length} invalid token(s)`, "yellow");
  }

  return {
    role,
    sent: successCount > 0,
    target,
    tokenDiagnostics,
    result,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const role = args.role || null;
  const requestedId = args.id || null;
  const allowedRoles = ["user", "restaurant", "delivery"];

  if (role && !allowedRoles.includes(role)) {
    log(`Invalid role "${role}". Allowed: ${allowedRoles.join(", ")}`, "red");
    process.exit(1);
  }

  try {
    log("\nStarting Ziggy push notification test...\n", "cyan");

    if (!process.env.MONGODB_URI) {
      log("MONGODB_URI is missing in environment", "red");
      process.exit(1);
    }

    log("Connecting to MongoDB...", "blue");
    await connectDB();
    log("MongoDB connected", "green");

    log("\nChecking Firebase Admin messaging...", "blue");
    const firebaseReady = await initializeFirebaseAdminMessaging();
    if (!firebaseReady) {
      log("Firebase Admin messaging is not configured or failed to initialize", "red");
      process.exit(1);
    }
    log("Firebase Admin messaging is ready", "green");

    const firebaseInspection = await inspectFirebaseSetup();
    log("\nFirebase setup inspection:", "magenta");
    log(`Env project ID: ${firebaseInspection.envProjectId || "missing"}`, firebaseInspection.envProjectId ? "green" : "red");
    log(`Env sender ID: ${firebaseInspection.envSenderId || "missing"}`, firebaseInspection.envSenderId ? "green" : "red");
    log(`Admin app project ID: ${firebaseInspection.appProjectId || "missing"}`, firebaseInspection.appProjectId ? "green" : "red");
    log(`Admin app client email: ${firebaseInspection.appClientEmail || "missing"}`, firebaseInspection.appClientEmail ? "green" : "red");
    if (
      firebaseInspection.envProjectId &&
      firebaseInspection.appProjectId &&
      firebaseInspection.envProjectId !== firebaseInspection.appProjectId
    ) {
      log("Project ID mismatch detected between env config and initialized admin app", "red");
    }

    const coverage = await countTokenCoverage();
    log("\nSaved FCM token coverage:", "magenta");
    log(`Users with tokens: ${coverage.users}`, coverage.users > 0 ? "green" : "yellow");
    log(
      `Restaurants with tokens: ${coverage.restaurants}`,
      coverage.restaurants > 0 ? "green" : "yellow",
    );
    log(
      `Delivery partners with tokens: ${coverage.deliveries}`,
      coverage.deliveries > 0 ? "green" : "yellow",
    );

    const rolesToTest = role ? [role] : allowedRoles;
    const results = [];
    for (const currentRole of rolesToTest) {
      results.push(await sendTestForRole(currentRole, requestedId));
    }

    log("\nSummary:", "cyan");
    for (const item of results) {
      if (item.sent) {
        log(`  ${item.role}: push send succeeded`, "green");
      } else {
        log(`  ${item.role}: push send not confirmed (${item.reason || "no_success_count"})`, "yellow");
      }
    }
  } catch (error) {
    log(`\nPush test failed: ${error.message}`, "red");
    console.error(error);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close().catch(() => {});
  }
}

main();
