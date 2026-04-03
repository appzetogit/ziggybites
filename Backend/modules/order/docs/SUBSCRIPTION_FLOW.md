# Subscription flow extension (non-breaking)

## New / extended pieces

### Order model (additive)

- `scheduledMealAt`, `selectedMeal`, `basePrice`, `finalPrice`, `editWindow`, `mealChangeNotificationSentAt`, `subscriptionFlowVersion`
- Existing: `preparationStatus`, `deliveryBoyId`, `status` enums unchanged in spirit (already included `scheduled`, `assigned`, `picked`, etc.)

### Wallet

- **Existing** `UserWallet` — still source of balance; optional `reason` on embedded transactions.
- **New** `wallettransactions` collection via `WalletTransaction` model + `modules/wallet/services/walletService.js` (ledger rows).

### APIs

| Method | Path | Auth |
|--------|------|------|
| POST | `/api/order/change-meal/:orderId` | User JWT |
| PATCH | `/api/restaurant/orders/:orderId/preparation-status` | Restaurant JWT — body `{ preparationStatus }` |
| PATCH | `/api/delivery/orders/:orderId/flow-status` | Delivery JWT — body `{ status: 'picked' \| 'delivered' }` |
| POST | `/api/admin/subscription-flow/assign-orders` | Admin JWT — body `{ orderIds, deliveryBoyId }` |
| GET | `/api/admin/subscription-flow/orders/scheduled` | Admin |
| GET | `/api/admin/subscription-flow/orders/today` | Admin |
| GET | `/api/admin/subscription-flow/orders/grouped-for-assignment` | Admin |

### Cron (server.js)

- Every **5 minutes**: `runSubscriptionMealCronTick()` — opens 30m edit window + notification; locks to `confirmed` after window.

### Subscription order creation

- `subscriptionNotificationService.createPendingOrderForSubscription` now sets `pricing`, `payment`, `scheduledMealAt`, `basePrice`, `finalPrice`, `selectedMeal` so orders satisfy schema and cron can run.

## Explicit clear of a stored secret field (admin env)

N/A here — meal change uses wallet debit/credit only.

## Payment required (meal upgrade)

- `POST /change-meal` returns **402** with `paymentRequired: true`, `amountDue`, `upgradeAmount` when wallet debit fails.
