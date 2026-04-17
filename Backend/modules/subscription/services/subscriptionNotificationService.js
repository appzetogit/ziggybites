import User from "../../auth/models/User.js";
import Order from "../../order/models/Order.js";
import SubscriptionMealNotificationLog from "../models/SubscriptionMealNotificationLog.js";
import SubscriptionSettings from "../models/SubscriptionSettings.js";
import UserPlanSubscription from "../models/UserPlanSubscription.js";
import UserSubscription from "../models/UserSubscription.js";
import { sendPushNotification } from "../../../shared/services/firebaseAdmin.js";
import { resumeExpiredPauses } from "./subscriptionPauseService.js";
import {
  getMealCategoriesFromItems,
  mergeMealSlotRanges,
  parseTimeString,
  wallClockFromUtc,
} from "./subscriptionScheduleService.js";

const DEFAULT_NOTIFICATION_LEAD_MINUTES = 120;
const DEFAULT_CRON_INTERVAL_MINUTES = 5;
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_BACKOFF_MINUTES = [5, 15, 30];

const MEAL_LABELS = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  snacks: "Snacks",
  dinner: "Dinner",
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getCronIntervalMinutes() {
  const raw = Number(process.env.SUBSCRIPTION_NOTIFICATION_CRON_MINUTES);
  if (!Number.isFinite(raw)) return DEFAULT_CRON_INTERVAL_MINUTES;
  return clamp(Math.round(raw), 1, 30);
}

function getNotificationSettings(settings) {
  const cfg = settings?.notificationSettings || {};
  const lead = Number(cfg.mealReminderLeadMinutes);
  return {
    enabled: cfg.mealReminderEnabled !== false,
    leadMinutes: Number.isFinite(lead)
      ? clamp(Math.round(lead), 15, 1440)
      : DEFAULT_NOTIFICATION_LEAD_MINUTES,
  };
}

function minuteKey(subscriptionId, dateLike) {
  const ms = new Date(dateLike).getTime();
  return `${String(subscriptionId)}:${Math.floor(ms / 60000)}`;
}

function collectUserTokens(user) {
  return [
    ...new Set([
      ...(user?.fcmTokens || []),
      ...(user?.fcmTokenMobile || []),
      user?.fcmTokenWeb,
      user?.fcmTokenAndroid,
      user?.fcmTokenIos,
    ].filter(Boolean)),
  ];
}

function leadText(leadMinutes) {
  if (leadMinutes === 1440) return "24 hours";
  if (leadMinutes % 60 === 0) {
    const h = leadMinutes / 60;
    return h === 1 ? "1 hour" : `${h} hours`;
  }
  return `${leadMinutes} minutes`;
}

function resolveMealTypeForSlot(sub, settings) {
  const categories = getMealCategoriesFromItems(sub.items || []);
  if (!categories.length) return null;

  const tz = (settings?.mealSlotTimezone || "Asia/Kolkata").trim() || "Asia/Kolkata";
  const ranges = mergeMealSlotRanges(settings?.mealSlotTimes);
  const deliveryWall = wallClockFromUtc(new Date(sub.nextDeliveryAt).getTime(), tz);

  let scheduledMealType = null;
  for (const mealType of Object.keys(ranges)) {
    const slot = ranges[mealType];
    const parsed = parseTimeString(slot?.start);
    if (!parsed) continue;
    if (deliveryWall.h === parsed.h && deliveryWall.mi === parsed.m) {
      scheduledMealType = mealType;
      break;
    }
  }

  if (!scheduledMealType) return null;
  return categories.includes(scheduledMealType) ? scheduledMealType : null;
}

function isSubscriptionPlanActive(userSub, userPlan, now) {
  if (!userSub || userSub.status !== "active") return false;
  if (userSub.pauseUntil && new Date(userSub.pauseUntil).getTime() > now.getTime()) return false;
  if (userSub.endDate && new Date(userSub.endDate).getTime() < now.getTime()) return false;

  if (!userPlan) return true;

  if (!["active", "cancelled_renewal"].includes(userPlan.status)) return false;
  if (userPlan.endDate && new Date(userPlan.endDate).getTime() < now.getTime()) return false;
  return true;
}

async function clearInvalidTokensForUser(userId, tokens) {
  if (!tokens?.length) return;
  const tokenSet = new Set(tokens);
  const update = {};

  const user = await User.findById(userId).select("fcmTokens fcmTokenMobile fcmTokenWeb fcmTokenAndroid fcmTokenIos").lean();
  if (!user) return;

  if (user.fcmTokenWeb && tokenSet.has(user.fcmTokenWeb)) update.fcmTokenWeb = null;
  if (user.fcmTokenAndroid && tokenSet.has(user.fcmTokenAndroid)) update.fcmTokenAndroid = null;
  if (user.fcmTokenIos && tokenSet.has(user.fcmTokenIos)) update.fcmTokenIos = null;

  await User.updateOne(
    { _id: userId },
    {
      ...(Object.keys(update).length > 0 ? { $set: update } : {}),
      $pull: {
        fcmTokens: { $in: tokens },
        fcmTokenMobile: { $in: tokens },
      },
    },
  );
}

function getRetryAt(attempts) {
  const delay = RETRY_BACKOFF_MINUTES[Math.min(Math.max(attempts - 1, 0), RETRY_BACKOFF_MINUTES.length - 1)];
  return new Date(Date.now() + delay * 60 * 1000);
}

async function markLogAsFailure(logId, attempts, reason) {
  if (attempts >= MAX_RETRY_ATTEMPTS) {
    await SubscriptionMealNotificationLog.updateOne(
      { _id: logId },
      {
        $set: {
          status: "failed",
          attempts,
          failReason: reason,
          nextRetryAt: null,
        },
      },
    );
    return;
  }

  await SubscriptionMealNotificationLog.updateOne(
    { _id: logId },
    {
      $set: {
        status: "failed",
        attempts,
        failReason: reason,
        nextRetryAt: getRetryAt(attempts),
      },
    },
  );
}

async function attemptDelivery({ logDoc, userSub, user, settings, leadMinutes, now }) {
  const nextAttempts = (logDoc.attempts || 0) + 1;

  if (!user || user.role !== "user" || user.isActive === false) {
    await SubscriptionMealNotificationLog.updateOne(
      { _id: logDoc._id },
      { $set: { status: "skipped", attempts: nextAttempts, failReason: "inactive_or_missing_user", nextRetryAt: null } },
    );
    return { sent: false, skipped: true };
  }

  const mealType = resolveMealTypeForSlot(userSub, settings);
  if (!mealType) {
    await SubscriptionMealNotificationLog.updateOne(
      { _id: logDoc._id },
      { $set: { status: "skipped", attempts: nextAttempts, failReason: "meal_not_included", nextRetryAt: null } },
    );
    return { sent: false, skipped: true };
  }

  const title = "Your meal is coming up";
  const body = `Hi ${user.name || "there"}, your ${MEAL_LABELS[mealType] || mealType} will be served in ${leadText(leadMinutes)}. Get ready!`;
  const tokens = collectUserTokens(user);

  if (!tokens.length) {
    await markLogAsFailure(logDoc._id, nextAttempts, "missing_fcm_token");
    return { sent: false, skipped: false };
  }

  const push = await sendPushNotification(tokens, {
    title,
    body,
    data: {
      type: "subscription_meal_reminder",
      mealType,
      scheduledMealAt: new Date(userSub.nextDeliveryAt).toISOString(),
      leadMinutes: String(leadMinutes),
      userSubscriptionId: String(userSub._id),
      tag: `subscription:${userSub._id}:${mealType}:${new Date(userSub.nextDeliveryAt).toISOString()}`,
      link: "/subscription",
    },
  });

  if (push.cleanupTokens?.length) {
    await clearInvalidTokensForUser(user._id, push.cleanupTokens);
  }

  if (push.successCount > 0) {
    await SubscriptionMealNotificationLog.updateOne(
      { _id: logDoc._id },
      {
        $set: {
          status: "sent",
          attempts: nextAttempts,
          sentAt: now,
          nextRetryAt: null,
          failReason: "",
          pushSummary: {
            successCount: push.successCount || 0,
            failureCount: push.failureCount || 0,
          },
          mealType,
        },
      },
    );
    return { sent: true, skipped: false };
  }

  await markLogAsFailure(logDoc._id, nextAttempts, "push_delivery_failed");
  return { sent: false, skipped: false };
}

async function getSkippedOrCancelledOrderKeys(subscriptionIds, lowerBound, upperBound) {
  if (!subscriptionIds.length) return new Set();

  const orders = await Order.find({
    "source.type": "subscription",
    "source.subscriptionId": { $in: subscriptionIds },
    scheduledMealAt: { $gte: lowerBound, $lte: upperBound },
    status: { $in: ["skipped", "cancelled"] },
  })
    .select("source.subscriptionId scheduledMealAt")
    .lean();

  const set = new Set();
  for (const order of orders) {
    if (!order?.source?.subscriptionId || !order?.scheduledMealAt) continue;
    set.add(minuteKey(order.source.subscriptionId, order.scheduledMealAt));
  }
  return set;
}

async function hasSkippedOrCancelledOrderForSlot(subscriptionId, scheduledMealAt) {
  const center = new Date(scheduledMealAt).getTime();
  const lower = new Date(center - 60 * 1000);
  const upper = new Date(center + 60 * 1000);
  const found = await Order.findOne({
    "source.type": "subscription",
    "source.subscriptionId": subscriptionId,
    scheduledMealAt: { $gte: lower, $lte: upper },
    status: { $in: ["skipped", "cancelled"] },
  })
    .select("_id")
    .lean();
  return Boolean(found);
}

async function claimDueLog(userSub, mealType, leadMinutes, now) {
  const filter = {
    userSubscriptionId: userSub._id,
    scheduledMealAt: new Date(userSub.nextDeliveryAt),
    mealType,
    leadMinutes,
  };
  const existing = await SubscriptionMealNotificationLog.findOne(filter).lean();
  if (existing) {
    if (existing.status === "sent" || existing.status === "skipped") return null;
    if (existing.status === "processing") return null;
    if ((existing.attempts || 0) >= MAX_RETRY_ATTEMPTS) return null;
    if (existing.status === "failed" && existing.nextRetryAt && new Date(existing.nextRetryAt).getTime() > now.getTime()) {
      return null;
    }
    const updated = await SubscriptionMealNotificationLog.findOneAndUpdate(
      { _id: existing._id },
      { $set: { status: "processing" } },
      { new: true },
    );
    return updated;
  }

  try {
    return await SubscriptionMealNotificationLog.create({
      userId: userSub.userId,
      userSubscriptionId: userSub._id,
      scheduledMealAt: new Date(userSub.nextDeliveryAt),
      mealType,
      leadMinutes,
      status: "processing",
      attempts: 0,
      nextRetryAt: null,
    });
  } catch {
    return null;
  }
}

export async function processSubscriptionTwoHourNotifications() {
  await resumeExpiredPauses();

  const now = new Date();
  const settings = await SubscriptionSettings.getSettings();
  const { enabled, leadMinutes } = getNotificationSettings(settings);
  if (!enabled) {
    return {
      processed: 0,
      skipped: 0,
      retried: 0,
      message: "Meal reminder notifications are disabled in subscription settings",
    };
  }

  const cronIntervalMinutes = getCronIntervalMinutes();
  const slackMs = cronIntervalMinutes * 60 * 1000;
  const leadMs = leadMinutes * 60 * 1000;
  const lowerBound = new Date(now.getTime() + leadMs - slackMs);
  const upperBound = new Date(now.getTime() + leadMs + slackMs);

  const subscriptions = await UserSubscription.find({
    status: "active",
    nextDeliveryAt: { $gte: lowerBound, $lte: upperBound },
    $and: [
      { $or: [{ pauseUntil: null }, { pauseUntil: { $lte: now } }] },
      { $or: [{ endDate: null }, { endDate: { $gte: now } }] },
    ],
  })
    .select("userId items nextDeliveryAt status pauseUntil endDate")
    .sort({ nextDeliveryAt: 1 })
    .limit(2000)
    .lean();

  if (!subscriptions.length) {
    return { processed: 0, skipped: 0, retried: 0, message: "No subscription reminders due in this window" };
  }

  const userIds = [...new Set(subscriptions.map((sub) => String(sub.userId)))];
  const [users, userPlans] = await Promise.all([
    User.find({ _id: { $in: userIds } })
      .select("name role isActive fcmTokens fcmTokenMobile fcmTokenWeb fcmTokenAndroid fcmTokenIos")
      .lean(),
    UserPlanSubscription.find({ userId: { $in: userIds } }).select("userId status endDate").lean(),
  ]);

  const userById = new Map(users.map((u) => [String(u._id), u]));
  const planByUserId = new Map(userPlans.map((p) => [String(p.userId), p]));

  const skipStatusKeys = await getSkippedOrCancelledOrderKeys(
    subscriptions.map((sub) => sub._id),
    lowerBound,
    upperBound,
  );

  const result = { processed: 0, skipped: 0, retried: 0, errors: 0 };

  for (const sub of subscriptions) {
    const plan = planByUserId.get(String(sub.userId));
    if (!isSubscriptionPlanActive(sub, plan, now)) {
      result.skipped++;
      continue;
    }

    const mealType = resolveMealTypeForSlot(sub, settings);
    if (!mealType) {
      result.skipped++;
      continue;
    }

    if (skipStatusKeys.has(minuteKey(sub._id, sub.nextDeliveryAt))) {
      result.skipped++;
      continue;
    }

    const logDoc = await claimDueLog(sub, mealType, leadMinutes, now);
    if (!logDoc) {
      result.skipped++;
      continue;
    }

    const delivery = await attemptDelivery({
      logDoc,
      userSub: sub,
      user: userById.get(String(sub.userId)),
      settings,
      leadMinutes,
      now,
    });

    if (delivery.sent) result.processed++;
    else if (delivery.skipped) result.skipped++;
    else result.errors++;
  }

  const retry = await retryFailedMealReminderNotifications(settings);
  result.processed += retry.processed;
  result.retried = retry.processed;
  result.errors += retry.errors;

  return {
    processed: result.processed,
    skipped: result.skipped,
    retried: result.retried,
    errors: result.errors,
    message: `Subscription meal reminders: sent=${result.processed}, retried=${result.retried}, skipped=${result.skipped}, errors=${result.errors}`,
  };
}

export async function retryFailedMealReminderNotifications(settingsFromCaller = null) {
  const now = new Date();
  const settings = settingsFromCaller || (await SubscriptionSettings.getSettings());
  const { leadMinutes } = getNotificationSettings(settings);

  const failedLogs = await SubscriptionMealNotificationLog.find({
    status: "failed",
    attempts: { $lt: MAX_RETRY_ATTEMPTS },
    nextRetryAt: { $ne: null, $lte: now },
  })
    .sort({ nextRetryAt: 1 })
    .limit(500)
    .lean();

  if (!failedLogs.length) {
    return { processed: 0, errors: 0 };
  }

  const subIds = [...new Set(failedLogs.map((log) => String(log.userSubscriptionId)))];
  const userIds = [...new Set(failedLogs.map((log) => String(log.userId)))];

  const [subs, users, plans] = await Promise.all([
    UserSubscription.find({ _id: { $in: subIds } }).select("userId items nextDeliveryAt status pauseUntil endDate").lean(),
    User.find({ _id: { $in: userIds } }).select("name role isActive fcmTokens fcmTokenMobile fcmTokenWeb fcmTokenAndroid fcmTokenIos").lean(),
    UserPlanSubscription.find({ userId: { $in: userIds } }).select("userId status endDate").lean(),
  ]);

  const subById = new Map(subs.map((sub) => [String(sub._id), sub]));
  const userById = new Map(users.map((u) => [String(u._id), u]));
  const planByUserId = new Map(plans.map((p) => [String(p.userId), p]));

  const out = { processed: 0, errors: 0 };

  for (const log of failedLogs) {
    const sub = subById.get(String(log.userSubscriptionId));
    if (!sub) {
      await SubscriptionMealNotificationLog.updateOne(
        { _id: log._id },
        { $set: { status: "skipped", failReason: "subscription_missing", nextRetryAt: null } },
      );
      continue;
    }

    const plan = planByUserId.get(String(sub.userId));
    if (!isSubscriptionPlanActive(sub, plan, now)) {
      await SubscriptionMealNotificationLog.updateOne(
        { _id: log._id },
        { $set: { status: "skipped", failReason: "subscription_inactive", nextRetryAt: null } },
      );
      continue;
    }

    if (await hasSkippedOrCancelledOrderForSlot(sub._id, log.scheduledMealAt)) {
      await SubscriptionMealNotificationLog.updateOne(
        { _id: log._id },
        { $set: { status: "skipped", failReason: "meal_skipped_or_cancelled", nextRetryAt: null } },
      );
      continue;
    }

    await SubscriptionMealNotificationLog.updateOne({ _id: log._id }, { $set: { status: "processing" } });

    const result = await attemptDelivery({
      logDoc: log,
      userSub: sub,
      user: userById.get(String(log.userId)),
      settings,
      leadMinutes,
      now,
    });

    if (result.sent) out.processed++;
    else if (!result.skipped) out.errors++;
  }

  return out;
}

/**
 * Kept for backwards compatibility with existing scheduler imports.
 */
export async function processSubscriptionRenewalAlerts() {
  return { processed: 0, message: "Renewal alert processing is not enabled in this flow" };
}
