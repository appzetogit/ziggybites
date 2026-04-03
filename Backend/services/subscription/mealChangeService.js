import Order from '../../modules/order/models/Order.js';
import Wallet from '../../wallet/Wallet.js';
import Transaction from '../../transactions/Transaction.js';

/**
 * logic for changing a meal in a subscription order.
 * Handles edit window validation and price adjustments.
 */
export const changeMeal = async (orderId, newMeal, userId) => {
  const order = await Order.findById(orderId);
  if (!order) throw new Error('Order not found');

  // 1. Validation: Only if within edit window
  const now = new Date();
  if (order.status !== 'scheduled') {
      throw new Error('Order must be in scheduled status to change meal');
  }
  if (!order.editWindow.start || !order.editWindow.end) {
      throw new Error('Edit window not yet opened for this order');
  }
  if (now < order.editWindow.start || now > order.editWindow.end) {
      throw new Error('Edit window is closed or not yet started');
  }

  // 2. Pricing Logic
  const oldPrice = order.basePrice || order.pricing.total;
  const newPrice = newMeal.price; // Assume newMeal has pricing info
  const diff = newPrice - oldPrice;

  // 3. Wallet Operations
  let wallet = await Wallet.findOne({ userId });
  if (!wallet) {
    wallet = await Wallet.create({ userId, balance: 0 });
  }

  if (diff > 0) {
    // newPrice > basePrice: deduct from wallet
    if (wallet.balance < diff) {
      throw new Error('Insufficient wallet balance for price difference');
    }
    wallet.balance -= diff;
    await Transaction.create({
      userId,
      amount: diff,
      type: 'debit',
      reason: 'meal_change',
      orderId: order._id
    });
  } else if (diff < 0) {
    // newPrice < basePrice: add to wallet
    const refundAmount = Math.abs(diff);
    wallet.balance += refundAmount;
    await Transaction.create({
      userId,
      amount: refundAmount,
      type: 'credit',
      reason: 'meal_change',
      orderId: order._id
    });
  }

  await wallet.save();

  // 4. Update Order
  order.selectedMeal = newMeal;
  order.finalPrice = newPrice;
  // Update the items array as well for backward compatibility
  order.items = [{
      itemId: newMeal.itemId,
      name: newMeal.name,
      price: newMeal.price,
      quantity: 1,
      image: newMeal.image,
      isVeg: newMeal.isVeg
  }];
  order.pricing.subtotal = newPrice;
  order.pricing.total = newPrice;

  await order.save();
  return order;
};
