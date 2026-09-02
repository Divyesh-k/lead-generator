const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: [true, 'Please provide an email'],
        unique: true,
        lowercase: true,
        trim: true,
        match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email'],
    },
    password: {
        type: String,
        required: [true, 'Please provide a password'],
        minlength: 6,
        select: false,
    },
    name: {
        type: String,
        required: [true, 'Please provide a name'],
        trim: true,
    },
    subscriptionTier: {
        type: String,
        enum: ['free', 'pro'],
        default: 'free',
    },
    subscriptionExpiry: {
        type: Date,
        default: null,
    },
    razorpayCustomerId: {
        type: String,
        default: null,
    },
    razorpaySubscriptionId: {
        type: String,
        default: null,
    },
    paymentHistory: [{
        orderId: String,
        paymentId: String,
        amount: Number,
        currency: String,
        status: String,
        createdAt: {
            type: Date,
            default: Date.now,
        },
    }],
    resetPasswordToken: {
        type: String,
        default: null,
        select: false,
    },
    resetPasswordExpiry: {
        type: Date,
        default: null,
    },
    activeSessionId: {
        type: String,
        default: null,
    },
    activeSessionStartedAt: {
        type: Date,
        default: null,
    },
    activeSessionBrowser: {
        type: String,
        default: null,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
    updatedAt: {
        type: Date,
        default: Date.now,
    },
});

// Hash password before saving
userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) {
        next();
    }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

// Compare password method
userSchema.methods.comparePassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

// Check if subscription is active
userSchema.methods.isProUser = function () {
    if (this.subscriptionTier === 'pro') {
        if (!this.subscriptionExpiry || this.subscriptionExpiry > new Date()) {
            return true;
        }
    }
    return false;
};

module.exports = mongoose.model('User', userSchema);
