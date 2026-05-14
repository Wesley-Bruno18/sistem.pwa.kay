import { getSubscriberDiscount } from './db.js'
import { applySubscriberDiscount } from '../utils/plans.js'

export async function calculateDiscountForUser(userId, servicePrice) {
  const discountInfo = await getSubscriberDiscount(userId)
  return {
    ...discountInfo,
    ...applySubscriberDiscount(servicePrice, discountInfo.subscription)
  }
}
