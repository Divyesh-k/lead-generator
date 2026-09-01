const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');
const crypto = require('crypto');
const { protect } = require('../middleware/auth');
const User = require('../models/User');

// Debug: Check if Razorpay credentials are loaded
console.log('=== Payment Route Debug ===');
console.log('RAZORPAY_KEY_ID:', process.env.RAZORPAY_KEY_ID ? 'Set ✓' : 'NOT SET ✗');
console.log('RAZORPAY_KEY_SECRET:', process.env.RAZORPAY_KEY_SECRET ? 'Set ✓' : 'NOT SET ✗');

// Initialize Razorpay
let razorpay = null;
if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
    try {
        razorpay = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET,
        });
        console.log('Razorpay initialized successfully ✓');
    } catch (initErr) {
        console.error('Failed to initialize Razorpay:', initErr.message);
        razorpay = null;
    }
} else {
    console.warn('Razorpay credentials not configured; payment routes will be disabled.');
}
console.log('===========================\n');

// @route   POST /api/payment/create-order
// @desc    Create Razorpay order for Pro subscription
// @access  Private
router.post('/create-order', protect, async (req, res) => {
    try {
        const user = req.user;

        // Check if already Pro
        if (user.isProUser()) {
            return res.status(400).json({
                success: false,
                message: 'You are already a Pro user',
            });
        }

        // No real Razorpay keys configured (e.g. local/Docker testing) — simulate an
        // order instead of failing, so the upgrade flow can still be exercised.
        if (!razorpay) {
            return res.json({
                success: true,
                data: {
                    demoMode: true,
                    orderId: `demo_order_${Date.now()}`,
                    amount: 5000,
                    currency: 'INR',
                    keyId: null,
                },
            });
        }

        // Create order options
        const options = {
            amount: 5000, // ₹50 in paise (50 * 100)
            currency: 'INR',
            receipt: `rcpt_${Date.now()}_${user._id.toString().slice(-8)}`,
            notes: {
                userId: user._id.toString(),
                email: user.email,
                plan: 'pro_monthly',
            },
        };

        // Create order
        const order = await razorpay.orders.create(options);

        res.json({
            success: true,
            data: {
                orderId: order.id,
                amount: order.amount,
                currency: order.currency,
                keyId: process.env.RAZORPAY_KEY_ID,
            },
        });
    } catch (error) {
        console.error('=== Create Order Error ===');
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        console.error('Full error:', error);
        console.error('========================\n');
        res.status(500).json({
            success: false,
            message: 'Failed to create payment order',
            error: error.message,
        });
    }
});

// @route   POST /api/payment/verify
// @desc    Verify payment and upgrade user to Pro
// @access  Private
router.post('/verify', protect, async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

        // No real Razorpay keys configured — this can only be reached in demo mode,
        // regardless of what the client claims, since a real provider always takes
        // precedence below. Simulate a successful payment instead of verifying one.
        if (!razorpay || !process.env.RAZORPAY_KEY_SECRET) {
            const demoUser = await User.findById(req.user._id);
            demoUser.subscriptionTier = 'pro';
            demoUser.subscriptionExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
            demoUser.paymentHistory.push({
                orderId: razorpay_order_id || `demo_order_${Date.now()}`,
                paymentId: razorpay_payment_id || `demo_pay_${Date.now()}`,
                amount: 50,
                currency: 'INR',
                status: 'captured (demo)',
            });
            await demoUser.save();

            return res.json({
                success: true,
                message: 'Demo payment simulated — subscription upgraded (no real charge, no payment provider configured).',
                data: {
                    tier: demoUser.subscriptionTier,
                    expiry: demoUser.subscriptionExpiry,
                    paymentId: demoUser.paymentHistory[demoUser.paymentHistory.length - 1].paymentId,
                    demoMode: true,
                },
            });
        }

        // Verify signature
        const body = razorpay_order_id + '|' + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(body.toString())
            .digest('hex');

        const isAuthentic = expectedSignature === razorpay_signature;

        if (!isAuthentic) {
            return res.status(400).json({
                success: false,
                message: 'Payment verification failed',
            });
        }

        // Fetch payment details
        const payment = await razorpay.payments.fetch(razorpay_payment_id);

        // Update user subscription
        const user = await User.findById(req.user._id);
        user.subscriptionTier = 'pro';
        user.subscriptionExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days from now

        // Add payment to history
        user.paymentHistory.push({
            orderId: razorpay_order_id,
            paymentId: razorpay_payment_id,
            amount: payment.amount / 100, // Convert paise to rupees
            currency: payment.currency,
            status: payment.status,
        });

        await user.save();

        res.json({
            success: true,
            message: 'Payment verified and subscription upgraded successfully!',
            data: {
                tier: user.subscriptionTier,
                expiry: user.subscriptionExpiry,
                paymentId: razorpay_payment_id,
            },
        });
    } catch (error) {
        console.error('=== Verify Payment Error ===');
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        console.error('========================\n');
        res.status(500).json({
            success: false,
            message: 'Payment verification failed',
            error: error.message,
        });
    }
});

// @route   POST /api/payment/webhook
// @desc    Handle Razorpay webhooks
// @access  Public (but verified)
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    try {
        const signature = req.headers['x-razorpay-signature'];
        const body = req.body;

        // Verify webhook signature
        if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
            console.warn('Received webhook but RAZORPAY_WEBHOOK_SECRET is not configured');
            return res.status(503).json({ success: false, message: 'Webhook secret not configured' });
        }

        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
            .update(JSON.stringify(body))
            .digest('hex');

        if (signature !== expectedSignature) {
            return res.status(400).json({ success: false, message: 'Invalid signature' });
        }

        const event = body.event;
        const payload = body.payload.payment.entity;

        // Handle different events
        switch (event) {
            case 'payment.captured':
                console.log('Payment captured:', payload.id);
                // Additional logic if needed
                break;
            case 'payment.failed':
                console.log('Payment failed:', payload.id);
                // Handle failed payment
                break;
            default:
                console.log('Unhandled event:', event);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ success: false, message: 'Webhook processing failed' });
    }
});

module.exports = router;
