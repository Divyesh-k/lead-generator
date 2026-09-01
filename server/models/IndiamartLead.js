const mongoose = require('mongoose');

const indiamartLeadSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    offerId: {
        type: String,
        required: true,
    },
    title: {
        type: String,
        default: null,
    },
    category: {
        type: String,
        default: null,
    },
    approxOrderValue: {
        type: String,
        default: null,
    },
    postedAt: {
        type: String,
        default: null,
    },
    unlocked: {
        type: Boolean,
        default: false,
    },
    creditsSpent: {
        type: Number,
        default: 0,
    },
    buyerName: {
        type: String,
        default: null,
    },
    buyerEmail: {
        type: String,
        default: null,
    },
    buyerMobile: {
        type: String,
        default: null,
    },
    buyerMobileCountry: {
        type: String,
        default: null,
    },
    buyerCompany: {
        type: String,
        default: null,
    },
    buyerCity: {
        type: String,
        default: null,
    },
    buyerState: {
        type: String,
        default: null,
    },
    buyerCountry: {
        type: String,
        default: null,
    },
    memberSince: {
        type: String,
        default: null,
    },
    scrapedAt: {
        type: Date,
        default: Date.now,
    },
});

// One record per (user, offerId) so re-scraping the same buylead updates it instead of duplicating
indiamartLeadSchema.index({ user: 1, offerId: 1 }, { unique: true });
indiamartLeadSchema.index({ user: 1, scrapedAt: -1 });

module.exports = mongoose.model('IndiamartLead', indiamartLeadSchema);
