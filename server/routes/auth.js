const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const User = require('../models/User');
const { generateToken } = require('../config/jwt');
const { protect } = require('../middleware/auth');

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post('/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;

        // Validation
        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Please provide name, email, and password',
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 6 characters',
            });
        }

        // Check if user exists
        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({
                success: false,
                message: 'User already exists with this email',
            });
        }

        // Create user
        const user = await User.create({
            name,
            email,
            password,
        });

        // Generate token
        const token = generateToken(user._id);

        res.status(201).json({
            success: true,
            data: {
                id: user._id,
                name: user.name,
                email: user.email,
                subscriptionTier: user.subscriptionTier,
                token,
            },
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server error during registration',
        });
    }
});

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validation
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Please provide email and password',
            });
        }

        // Check for user
        const user = await User.findOne({ email }).select('+password');
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials',
            });
        }

        // Check password
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials',
            });
        }

        // Generate token
        const token = generateToken(user._id);

        res.json({
            success: true,
            data: {
                id: user._id,
                name: user.name,
                email: user.email,
                subscriptionTier: user.subscriptionTier,
                isPro: user.isProUser(),
                token,
            },
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server error during login',
        });
    }
});

// @route   GET /api/auth/me
// @desc    Get current user
// @access  Private
router.get('/me', protect, async (req, res) => {
    try {
        const user = req.user;

        res.json({
            success: true,
            data: {
                id: user._id,
                name: user.name,
                email: user.email,
                subscriptionTier: user.subscriptionTier,
                isPro: user.isProUser(),
                subscriptionExpiry: user.subscriptionExpiry,
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

// @route   PUT /api/auth/update-name
// @desc    Change the logged-in user's display name
// @access  Private
router.put('/update-name', protect, async (req, res) => {
    try {
        const { name } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Please provide a name',
            });
        }

        const user = await User.findById(req.user._id);
        user.name = name.trim();
        await user.save();

        res.json({
            success: true,
            message: 'Name updated successfully',
            data: { name: user.name },
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server error while updating name',
        });
    }
});

// @route   PUT /api/auth/change-email
// @desc    Change the logged-in user's email (requires current password)
// @access  Private
router.put('/change-email', protect, async (req, res) => {
    try {
        const { newEmail, currentPassword } = req.body;

        if (!newEmail || !currentPassword) {
            return res.status(400).json({
                success: false,
                message: 'Please provide the new email and your current password',
            });
        }

        const user = await User.findById(req.user._id).select('+password');
        const isMatch = await user.comparePassword(currentPassword);

        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: 'Current password is incorrect',
            });
        }

        const normalizedEmail = newEmail.trim().toLowerCase();

        if (normalizedEmail === user.email) {
            return res.status(400).json({
                success: false,
                message: 'That is already your current email',
            });
        }

        const existing = await User.findOne({ email: normalizedEmail });
        if (existing) {
            return res.status(400).json({
                success: false,
                message: 'That email is already in use by another account',
            });
        }

        user.email = normalizedEmail;
        await user.save();

        res.json({
            success: true,
            message: 'Email updated successfully',
            data: { email: user.email },
        });
    } catch (error) {
        // Race-condition backstop: the schema's unique index on email rejects a
        // duplicate even if two requests slip past the findOne check above at
        // the same time.
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'That email is already in use by another account',
            });
        }
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server error while updating email',
        });
    }
});

// @route   PUT /api/auth/change-password
// @desc    Change the logged-in user's password
// @access  Private
router.put('/change-password', protect, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Please provide your current password and a new password',
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'New password must be at least 6 characters',
            });
        }

        const user = await User.findById(req.user._id).select('+password');
        const isMatch = await user.comparePassword(currentPassword);

        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: 'Current password is incorrect',
            });
        }

        user.password = newPassword;
        await user.save();

        res.json({
            success: true,
            message: 'Password updated successfully',
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server error while updating password',
        });
    }
});

// @route   POST /api/auth/forgot-password
// @desc    Request a password reset link
// @access  Public
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Please provide your email',
            });
        }

        const user = await User.findOne({ email: email.trim().toLowerCase() });

        // Always respond the same way whether or not the account exists, so this
        // endpoint can't be used to enumerate registered emails.
        const genericMessage = 'If an account exists for that email, a reset link has been generated.';

        if (!user) {
            return res.json({ success: true, message: genericMessage });
        }

        const rawToken = crypto.randomBytes(32).toString('hex');
        user.resetPasswordToken = crypto.createHash('sha256').update(rawToken).digest('hex');
        user.resetPasswordExpiry = new Date(Date.now() + RESET_TOKEN_TTL_MS);
        await user.save();

        const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
        const resetUrl = `${appUrl}/reset-password.html?token=${rawToken}`;

        // No email transport is configured in this environment — same "demo mode"
        // fallback already used for payments when Razorpay isn't configured.
        // Return the link directly instead of silently pretending to email it.
        console.log(`Password reset requested for ${user.email}: ${resetUrl}`);

        res.json({
            success: true,
            message: genericMessage,
            data: { demoMode: true, resetUrl },
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server error while requesting password reset',
        });
    }
});

// @route   POST /api/auth/reset-password/:token
// @desc    Set a new password using a valid reset token
// @access  Public
router.post('/reset-password/:token', async (req, res) => {
    try {
        const { newPassword } = req.body;

        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'Please provide a new password of at least 6 characters',
            });
        }

        const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');

        const user = await User.findOne({
            resetPasswordToken: hashedToken,
            resetPasswordExpiry: { $gt: new Date() },
        }).select('+resetPasswordToken');

        if (!user) {
            return res.status(400).json({
                success: false,
                message: 'This reset link is invalid or has expired. Request a new one.',
            });
        }

        user.password = newPassword;
        user.resetPasswordToken = null;
        user.resetPasswordExpiry = null;
        await user.save();

        const token = generateToken(user._id);

        res.json({
            success: true,
            message: 'Password reset successfully',
            data: {
                id: user._id,
                name: user.name,
                email: user.email,
                subscriptionTier: user.subscriptionTier,
                isPro: user.isProUser(),
                token,
            },
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server error while resetting password',
        });
    }
});

module.exports = router;
