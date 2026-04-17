/**
 * Test Push Notification Script (v2)
 * 
 * Connects to MongoDB, picks users with FCM web tokens,
 * and sends a test push notification via Firebase Admin SDK
 * with detailed error logging.
 *
 * Usage:  node test-push.js
 */

import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import admin from "firebase-admin";
import { initializeFirebaseAdminMessaging } from "./shared/services/firebaseAdmin.js";

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/ziggy";

async function main() {
  console.log("🔗 Connecting to MongoDB...");
  await mongoose.connect(MONGO_URI);
  console.log("✅ Connected to MongoDB\n");

  const User = (await import("./modules/auth/models/User.js")).default;

  // Find ALL users with web FCM tokens
  const users = await User.find({ fcmTokenWeb: { $ne: null } })
    .select("name email phone fcmTokenWeb")
    .lean();

  if (!users.length) {
    console.error("❌ No users found with fcmTokenWeb.");
    console.log("   → Log in to the web app first to register a token.");
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log(`📱 Found ${users.length} user(s) with FCM web tokens:\n`);
  users.forEach((u, i) => {
    console.log(`   ${i + 1}. ${u.name || u.email || u.phone}`);
    console.log(`      Token: ${u.fcmTokenWeb.substring(0, 30)}...`);
  });

  // Initialize Firebase Admin
  console.log("\n🔧 Initializing Firebase Admin...");
  const ready = await initializeFirebaseAdminMessaging();
  if (!ready) {
    console.error("❌ Firebase Admin SDK failed to initialize.");
    console.log("   → Check service account key in Backend/config/");
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log("✅ Firebase Admin initialized\n");

  // Send to each user individually for better error reporting
  for (const user of users) {
    const name = user.name || user.email || user.phone;
    console.log(`📤 Sending to: ${name}`);

    try {
      const response = await admin.messaging().send({
        token: user.fcmTokenWeb,
        notification: {
          title: "🎉 Test Notification from Ziggy",
          body: "Push notifications are working! This is a test message.",
        },
        data: {
          type: "test",
          link: "/user",
        },
        webpush: {
          headers: { Urgency: "high" },
          notification: {
            title: "🎉 Test Notification from Ziggy",
            body: "Push notifications are working! This is a test message.",
            icon: "/favicon.ico",
          },
          fcmOptions: {
            link: "/user",
          },
        },
      });

      console.log(`   ✅ SUCCESS! Message ID: ${response}`);
    } catch (err) {
      console.log(`   ❌ FAILED`);
      console.log(`      Error code: ${err.code}`);
      console.log(`      Error message: ${err.message}`);

      if (
        err.code === "messaging/registration-token-not-registered" ||
        err.code === "messaging/invalid-registration-token"
      ) {
        console.log(`      → Token is stale/invalid. User needs to log in again.`);
        console.log(`      → Clearing stale token from DB...`);
        await User.updateOne({ _id: user._id }, { $set: { fcmTokenWeb: null } });
        console.log(`      → Done. Token cleared for ${name}.`);
      }
    }
    console.log("");
  }

  await mongoose.disconnect();
  console.log("🏁 Done!");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Fatal error:", err.message);
  process.exit(1);
});
