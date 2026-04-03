import mongoose from "mongoose";

/**
 * Standalone wallet ledger rows (audit trail).
 * Balance of record remains on UserWallet; this collection is for reporting & traceability.
 */
const walletTransactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    type: {
      type: String,
      enum: ["credit", "debit"],
      required: true,
    },
    reason: {
      type: String,
      enum: ["meal_change", "refund", "recharge", "subscription_pause", "other"],
      default: "other",
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
      index: true,
    },
    /** UserWallet balance after this operation (best-effort snapshot). */
    balanceAfter: {
      type: Number,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true, collection: "wallettransactions" },
);

walletTransactionSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model("WalletTransaction", walletTransactionSchema);
