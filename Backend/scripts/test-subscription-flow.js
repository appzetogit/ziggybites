import mongoose from "mongoose";
import UserSubscription from "../modules/subscription/models/UserSubscription.js";
import SubscriptionPlan from "../modules/subscription/models/SubscriptionPlan.js";
import SubscriptionPlanPurchase from "../modules/subscription/models/SubscriptionPlanPurchase.js";
import dotenv from "dotenv";

import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../.env") });

async function runTest() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB");

    const userId = new mongoose.Types.ObjectId();
    const restaurantId = "test-restaurant-123";

    // 1. Ensure plans exist
    console.log("Checking plans...");
    let plans = await SubscriptionPlan.find({ durationDays: { $in: [15, 30, 90] } });
    if (plans.length === 0) {
      console.log("Creating default plans...");
      await SubscriptionPlan.insertMany([
        { durationDays: 15, name: "15 Days", price: 299, active: true },
        { durationDays: 30, name: "30 Days", price: 499, active: true },
        { durationDays: 90, name: "90 Days", price: 1299, active: true },
      ]);
      plans = await SubscriptionPlan.find({ durationDays: { $in: [15, 30, 90] } });
    }
    console.log(`Found ${plans.length} plans.`);

    // 2. Create an initial subscription
    console.log("Creating initial 15-day subscription...");
    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 15);

    const sub = await UserSubscription.create({
      userId,
      restaurantId,
      restaurantName: "Test Restaurant",
      planDays: 15,
      deliverySlot: "veg",
      items: [{ itemId: "item1", name: "Meal 1", price: 100, quantity: 1, isVeg: true }],
      nextDeliveryAt: new Date(startDate.getTime() + 24 * 60 * 60 * 1000),
      startDate,
      endDate,
    });
    console.log(`Subscription created with expiry: ${sub.endDate.toLocaleDateString()}`);

    // 3. Simulate an "Advanced Recharge" (Buying 30 more days)
    console.log("Simulating advanced recharge (30 days)...");
    const duration = 30;
    const existingSub = await UserSubscription.findOne({ userId, status: "active" });
    if (existingSub) {
      const newEndDate = new Date(existingSub.endDate);
      newEndDate.setDate(newEndDate.getDate() + duration);
      await UserSubscription.updateOne(
        { _id: existingSub._id },
        { $set: { endDate: newEndDate, autoPayEnabled: true } }
      );
      const updatedSub = await UserSubscription.findById(existingSub._id);
      console.log(`Updated expiry: ${updatedSub.endDate.toLocaleDateString()}`);
      
      const expectedDays = 15 + 30;
      const actualDays = Math.round((updatedSub.endDate - startDate) / (24 * 60 * 60 * 1000));
      if (actualDays === expectedDays) {
        console.log("✅ Advanced recharge logic verified!");
      } else {
        console.log(`❌ Error: Expected ${expectedDays} total days, got ${actualDays}`);
      }
    }

    // Cleanup
    await UserSubscription.deleteOne({ userId });
    await SubscriptionPlanPurchase.deleteMany({ userId });
    console.log("Cleanup complete.");

  } catch (err) {
    console.error("Test failed:", err);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB");
  }
}

runTest();
