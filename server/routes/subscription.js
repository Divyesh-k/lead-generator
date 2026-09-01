const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const User = require('../models/User');
const Machine = require('../models/Machine');

// @route   GET /api/subscription/status
// @desc    Get subscription status
// @access  Private
router.get('/status', protect, async (req, res) => {
    try {
        const user = req.user;
        const machineCount = await Machine.countDocuments({ user: user._id });
        const machineLimit = user.isProUser() ? null : 5;

        res.json({
            success: true,
            data: {
                tier: user.subscriptionTier,
                isPro: user.isProUser(),
                expiry: user.subscriptionExpiry,
                machineCount,
                machineLimit,
                canAddMachines: user.isProUser() || machineCount < 5,
            },
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server error',
        });
    }
});

// @route   POST /api/subscription/upgrade
// @desc    Upgrade to pro (redirects to payment flow)
// @access  Private
router.post('/upgrade', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);

        // Check if already Pro
        if (user.isProUser()) {
            return res.status(400).json({
                success: false,
                message: 'You are already a Pro user',
            });
        }

        // In production, this endpoint redirects to payment flow
        // For now, return message to use payment API
        res.json({
            success: false,
            message: 'Please use the payment flow to upgrade to Pro',
            redirectTo: '/api/payment/create-order',
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server error',
        });
    }
});

module.exports = router;
