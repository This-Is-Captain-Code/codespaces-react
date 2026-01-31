import express from 'express';
import { billingService } from '../services/billingService.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

router.use(authMiddleware);

// Get user credits
router.get('/balance', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const credits = await billingService.getCredits(userId);
    res.json(credits);
  } catch (error) {
    next(error);
  }
});

// Add credits (simulated - in production, use Stripe)
router.post('/add-credits', async (req, res, next) => {
  try {
    const { amount } = req.body;
    const userId = req.user.id;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    // TODO: In production:
    // 1. Create Stripe payment intent
    // 2. Verify payment
    // 3. Then add credits

    const credits = await billingService.addCredits(userId, amount);
    res.json(credits);
  } catch (error) {
    next(error);
  }
});

export default router;
