/**
 * Wallet extension module:
 * - models/WalletTransaction.js — standalone ledger (credit/debit + reason)
 * - services/walletService.js — uses existing UserWallet for balance + writes ledger rows
 */
export { default as WalletTransaction } from "./models/WalletTransaction.js";
export {
  creditWallet,
  debitWallet,
  getWalletBalance,
} from "./services/walletService.js";
