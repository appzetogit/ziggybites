import UserWallet from "../../user/models/UserWallet.js";
import WalletTransaction from "../models/WalletTransaction.js";

/**
 * Credit user wallet (meal downgrade diff, refund, etc.)
 */
export async function creditWallet(
  userId,
  amount,
  { reason = "other", orderId = null, description = "", metadata = {} } = {},
) {
  if (amount <= 0) return { wallet: null, ledger: null };
  const wallet = await UserWallet.findOrCreateByUserId(userId);
  const reasonKey =
    reason === "meal_change"
      ? "meal_change"
      : reason === "refund"
        ? "refund"
        : reason === "recharge"
          ? "recharge"
          : reason === "subscription_pause"
            ? "subscription_pause"
            : "other";
  wallet.addTransaction({
    amount,
    type: "addition",
    status: "Completed",
    description: description || `Credit: ${reason}`,
    reason: reasonKey,
    orderId: orderId || undefined,
  });
  await wallet.save();
  const ledger = await WalletTransaction.create({
    userId,
    amount,
    type: "credit",
    reason: ["meal_change", "refund", "recharge", "subscription_pause"].includes(reason) ? reason : "other",
    orderId,
    balanceAfter: wallet.balance,
    metadata: { description, ...metadata },
  });
  return { wallet, ledger };
}

/**
 * Debit wallet for meal upgrade; throws if insufficient balance.
 */
export async function debitWallet(userId, amount, { reason = "meal_change", orderId = null, description = "" } = {}) {
  if (amount <= 0) return { wallet: null, ledger: null };
  const wallet = await UserWallet.findOrCreateByUserId(userId);
  if (wallet.balance < amount) {
    const err = new Error("INSUFFICIENT_WALLET");
    err.code = "INSUFFICIENT_WALLET";
    err.amountDue = amount - wallet.balance;
    throw err;
  }
  wallet.addTransaction({
    amount,
    type: "deduction",
    status: "Completed",
    description: description || `Debit: ${reason}`,
    reason: reason === "meal_change" ? "meal_change" : "other",
    orderId: orderId || undefined,
  });
  await wallet.save();
  const ledger = await WalletTransaction.create({
    userId,
    amount,
    type: "debit",
    reason: reason === "meal_change" ? "meal_change" : "other",
    orderId,
    balanceAfter: wallet.balance,
    metadata: { description },
  });
  return { wallet, ledger };
}

export async function getWalletBalance(userId) {
  const w = await UserWallet.findOrCreateByUserId(userId);
  return w.balance;
}
