const mongoose = require('mongoose');

const indiamartConnectionSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true,
    },
    status: {
        type: String,
        enum: ['pending', 'connected', 'expired', 'disconnected'],
        default: 'pending',
    },
    cookie: {
        type: String,
        default: null,
        select: false,
    },
    glusrid: {
        type: String,
        default: null,
    },
    companyName: {
        type: String,
        default: null,
    },
    contactName: {
        type: String,
        default: null,
    },
    creditBalance: {
        type: Number,
        default: null,
    },
    blPurchaseCountBalance: {
        type: Number,
        default: null,
    },
    connectToken: {
        type: String,
        default: null,
    },
    connectTokenExpiry: {
        type: Date,
        default: null,
    },
    connectTokenUsed: {
        type: Boolean,
        default: false,
    },
    connectedAt: {
        type: Date,
        default: null,
    },
    lastScrapedAt: {
        type: Date,
        default: null,
    },
    lastError: {
        type: String,
        default: null,
    },
    lastErrorCode: {
        type: String,
        default: null,
    },
    autoScrapeEnabled: {
        type: Boolean,
        default: false,
    },
    autoScrapeIntervalSeconds: {
        type: Number,
        default: 900,
    },
    autoScrapeUnlockLimit: {
        // null = unlimited for this run (still hard-capped at 20 by the scraper itself)
        type: Number,
        default: 2,
    },
    autoScrapeLastRunAt: {
        type: Date,
        default: null,
    },
    lastContactSyncAt: {
        type: Date,
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

module.exports = mongoose.model('IndiamartConnection', indiamartConnectionSchema);
