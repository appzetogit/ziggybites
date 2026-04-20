import dotenv from "dotenv";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";

import Order from "../modules/order/models/Order.js";
import Delivery from "../modules/delivery/models/Delivery.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("MONGODB_URI is not configured.");
  process.exit(1);
}

async function main() {
  await mongoose.connect(MONGODB_URI);

  const activeOrderQuery = {
    deliveryPartnerId: { $exists: true, $ne: null },
    status: { $nin: ["delivered", "cancelled", "completed"] },
  };

  const assignedOrderCount = await Order.countDocuments(activeOrderQuery);
  const deliveryCount = await Delivery.countDocuments({
    $or: [
      { assignedOrders: { $exists: true, $ne: [] } },
      { route: { $exists: true, $ne: [] } },
    ],
  });

  const orderResult = await Order.updateMany(activeOrderQuery, {
    $unset: {
      deliveryPartnerId: 1,
      "assignmentInfo.deliveryPartnerId": 1,
      "assignmentInfo.assignedBy": 1,
      "assignmentInfo.assignedAt": 1,
      "deliveryState.acceptedAt": 1,
      "deliveryState.reachedPickupAt": 1,
      "deliveryState.orderIdConfirmedAt": 1,
      "deliveryState.routeToPickup": 1,
      "deliveryState.routeToDelivery": 1,
    },
    $set: {
      "deliveryState.status": "pending",
      "deliveryState.currentPhase": "assigned",
    },
  });

  const deliveryResult = await Delivery.updateMany(
    {},
    {
      $set: {
        assignedOrders: [],
        route: [],
      },
    },
  );

  console.log(
    JSON.stringify(
      {
        activeAssignedOrdersMatched: assignedOrderCount,
        activeAssignedOrdersUpdated: orderResult.modifiedCount,
        deliveriesWithAssignmentsOrRoutes: deliveryCount,
        deliveryDocsUpdated: deliveryResult.modifiedCount,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error("Failed to clear delivery assignments:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close().catch(() => {});
    }
  });
