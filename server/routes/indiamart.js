const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { protect } = require('../middleware/auth');
const IndiamartConnection = require('../models/IndiamartConnection');
const IndiamartLead = require('../models/IndiamartLead');
const { parseCookieMeta, fetchLeads, IndiamartApiError } = require('../services/indiamartService');
const { runScrape, runContactSync } = require('../services/indiamartScraper');
const autoScrapeScheduler = require('../services/indiamartAutoScrape');

const CONNECT_LINK_TTL_MS = 23 * 60 * 60 * 1000; // 23 hours, matches "Link valid 23 hours from now" UX

function toPublicConnection(conn) {
    if (!conn) {
        return { connected: false, status: 'disconnected' };
    }
    return {
        connected: conn.status === 'connected',
        status: conn.status,
        companyName: conn.companyName,
        contactName: conn.contactName,
        glusrid: conn.glusrid,
        creditBalance: conn.creditBalance,
        blPurchaseCountBalance: conn.blPurchaseCountBalance,
        connectedAt: conn.connectedAt,
        lastScrapedAt: conn.lastScrapedAt,
        lastError: conn.lastError,
        lastErrorCode: conn.lastErrorCode,
        autoScrapeEnabled: conn.autoScrapeEnabled,
        autoScrapeIntervalSeconds: conn.autoScrapeIntervalSeconds,
        autoScrapeUnlockLimit: conn.autoScrapeUnlockLimit,
        autoScrapeLastRunAt: conn.autoScrapeLastRunAt,
    };
}

// @route   GET /api/indiamart/status
// @desc    Current IndiaMART connection state for the logged-in user
// @access  Private
router.get('/status', protect, async (req, res) => {
    try {
        const conn = await IndiamartConnection.findOne({ user: req.user._id });
        res.json({ success: true, data: toPublicConnection(conn) });
    } catch (error) {
        console.error('Get IndiaMART status error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// @route   POST /api/indiamart/connect-link
// @desc    Generate a one-time "Connect IndiaMART" link/token for this user
// @access  Private
router.post('/connect-link', protect, async (req, res) => {
    try {
        const token = crypto.randomBytes(24).toString('hex');
        const expiry = new Date(Date.now() + CONNECT_LINK_TTL_MS);

        await IndiamartConnection.findOneAndUpdate(
            { user: req.user._id },
            {
                $set: {
                    connectToken: token,
                    connectTokenExpiry: expiry,
                    connectTokenUsed: false,
                    updatedAt: new Date(),
                },
                $setOnInsert: { status: 'pending' },
            },
            { upsert: true }
        );

        const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;

        res.json({
            success: true,
            data: {
                token,
                url: `${appUrl}/connect-indiamart.html?token=${token}`,
                expiresAt: expiry,
            },
        });
    } catch (error) {
        console.error('Create connect link error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// @route   GET /api/indiamart/connect/:token/meta
// @desc    Public lookup used by the connect page to show "For: <company>" + expiry
// @access  Public (guarded by the random token itself)
router.get('/connect/:token/meta', async (req, res) => {
    try {
        const conn = await IndiamartConnection.findOne({ connectToken: req.params.token }).populate('user', 'name email');

        if (!conn || !conn.connectTokenExpiry || conn.connectTokenExpiry < new Date()) {
            return res.status(410).json({ success: false, message: 'This connect link is invalid or has expired.' });
        }

        res.json({
            success: true,
            data: {
                userName: conn.user ? conn.user.name : null,
                companyName: conn.companyName,
                expiresAt: conn.connectTokenExpiry,
                alreadyConnected: conn.status === 'connected',
            },
        });
    } catch (error) {
        console.error('Connect meta error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// @route   POST /api/indiamart/connect/:token
// @desc    Bookmarklet posts the captured seller.indiamart.com cookie here
// @access  Public (guarded by the random token itself; single-use)
router.post('/connect/:token', async (req, res) => {
    try {
        const { cookie } = req.body;

        if (!cookie || typeof cookie !== 'string' || cookie.length < 10) {
            return res.status(400).json({ success: false, message: 'No IndiaMART cookie received. Make sure you are logged into seller.indiamart.com before clicking the bookmark.' });
        }

        const conn = await IndiamartConnection.findOne({ connectToken: req.params.token });

        if (!conn || !conn.connectTokenExpiry || conn.connectTokenExpiry < new Date()) {
            return res.status(410).json({ success: false, message: 'This connect link is invalid or has expired. Generate a new one from the dashboard.' });
        }

        if (conn.connectTokenUsed) {
            return res.status(410).json({ success: false, message: 'This connect link has already been used. Generate a new one from the dashboard.' });
        }

        const meta = parseCookieMeta(cookie);

        if (!meta.glusrid) {
            return res.status(400).json({ success: false, message: 'Could not find an active IndiaMART session in that cookie. Please log in to seller.indiamart.com and try again.' });
        }

        // Validate the cookie actually works before saving it. Only a TOKEN_EXPIRED
        // response means the session itself is bad — any other structured response
        // (e.g. "no relevant buy leads") still proves the session authenticated fine.
        try {
            await fetchLeads(cookie, meta.glusrid, { start: 1, end: 1 });
        } catch (err) {
            if (err instanceof IndiamartApiError) {
                if (err.code === 'TOKEN_EXPIRED') {
                    return res.status(400).json({ success: false, message: 'That IndiaMART session has expired. Log in again and retry.' });
                }
                console.warn('Connect validation call returned a business error (treating session as valid):', err.message);
            } else {
                throw err;
            }
        }

        conn.cookie = cookie;
        conn.glusrid = meta.glusrid;
        conn.companyName = meta.companyName || conn.companyName;
        conn.contactName = meta.contactName || conn.contactName;
        conn.status = 'connected';
        conn.connectedAt = new Date();
        conn.connectTokenUsed = true; // single-use link; keep the token itself so the connect page can still poll/confirm
        conn.lastError = null;
        conn.updatedAt = new Date();
        await conn.save();

        res.json({
            success: true,
            message: 'IndiaMART connected successfully',
            data: { companyName: conn.companyName, contactName: conn.contactName },
        });
    } catch (error) {
        console.error('Connect IndiaMART error:', error);
        res.status(500).json({ success: false, message: 'Server error while connecting IndiaMART' });
    }
});

// @route   POST /api/indiamart/disconnect
// @desc    Disconnect and wipe the stored session cookie
// @access  Private
router.post('/disconnect', protect, async (req, res) => {
    try {
        const conn = await IndiamartConnection.findOne({ user: req.user._id });

        if (!conn) {
            return res.json({ success: true, data: toPublicConnection(null) });
        }

        conn.status = 'disconnected';
        conn.cookie = null;
        conn.connectToken = null;
        conn.connectTokenExpiry = null;
        conn.connectedAt = null;
        conn.autoScrapeEnabled = false;
        conn.updatedAt = new Date();
        await conn.save();

        autoScrapeScheduler.stop(req.user._id.toString());

        res.json({ success: true, message: 'IndiaMART disconnected', data: toPublicConnection(conn) });
    } catch (error) {
        console.error('Disconnect IndiaMART error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// @route   POST /api/indiamart/scrape
// @desc    Pull recent buy-leads and unlock (spend credits on) new ones, up to unlockLimit
// @access  Private
router.post('/scrape', protect, async (req, res) => {
    try {
        const parsedFetchCount = parseInt(req.body.fetchCount, 10);
        const parsedUnlockLimit = parseInt(req.body.unlockLimit, 10);

        const data = await runScrape(req.user._id, {
            fetchCount: Number.isFinite(parsedFetchCount) ? parsedFetchCount : 20,
            unlockLimit: Number.isFinite(parsedUnlockLimit) ? parsedUnlockLimit : 5,
        });

        // Best-effort: also pull in any contact already consumed outside this app
        // (the IndiaMART website directly, another session). Failing this shouldn't
        // hide a successful BuyLeads scrape result, so it's caught separately.
        try {
            data.contactSync = await runContactSync(req.user._id, { fetchCount: 25 });
        } catch (syncError) {
            console.error('Contact sync (manual scrape) failed:', syncError.message);
            data.contactSync = { error: syncError.message };
        }

        res.json({ success: true, data });
    } catch (error) {
        if (error instanceof IndiamartApiError && error.code === 'NOT_CONNECTED') {
            return res.status(400).json({ success: false, message: 'IndiaMART is not connected. Connect your account first.' });
        }
        if (error instanceof IndiamartApiError && error.code === 'TOKEN_EXPIRED') {
            return res.status(400).json({ success: false, message: 'Your IndiaMART session has expired. Reconnect from the dashboard.', code: 'TOKEN_EXPIRED' });
        }
        if (error instanceof IndiamartApiError && error.code === 'RATE_LIMITED') {
            return res.status(429).json({ success: false, message: error.message, code: 'RATE_LIMITED' });
        }
        console.error('Scrape IndiaMART error:', error);
        res.status(500).json({ success: false, message: 'Server error while scraping leads' });
    }
});

// @route   POST /api/indiamart/auto-scrape/start
// @desc    Enable a recurring background scrape for this user's connected account
// @access  Private
router.post('/auto-scrape/start', protect, async (req, res) => {
    try {
        const conn = await IndiamartConnection.findOne({ user: req.user._id });

        if (!conn || conn.status !== 'connected') {
            return res.status(400).json({ success: false, message: 'IndiaMART is not connected. Connect your account first.' });
        }

        // Interval is in seconds now (was minutes-only). Floor of 2s is a deliberate
        // safety rail against hammering a third-party site indefinitely, even though
        // the frontend lets a user ask for less.
        const parsedInterval = parseInt(req.body.intervalSeconds, 10);
        const intervalSeconds = Math.min(Math.max(Number.isFinite(parsedInterval) ? parsedInterval : 900, 2), 7200);

        // unlimited: true means "no per-run cap the user set" — runScrape() still
        // hard-caps actual unlocks at 100/run regardless, so this can't run away.
        let unlockLimit;
        if (req.body.unlimited) {
            unlockLimit = null;
        } else {
            const parsedUnlockLimit = parseInt(req.body.unlockLimit, 10);
            unlockLimit = Math.min(Math.max(Number.isFinite(parsedUnlockLimit) ? parsedUnlockLimit : 2, 0), 100);
        }

        conn.autoScrapeEnabled = true;
        conn.autoScrapeIntervalSeconds = intervalSeconds;
        conn.autoScrapeUnlockLimit = unlockLimit;
        await conn.save();

        autoScrapeScheduler.start(req.user._id.toString(), intervalSeconds, unlockLimit);

        res.json({ success: true, message: 'Auto-scrape started', data: { autoScrapeEnabled: true, intervalSeconds, unlockLimit } });
    } catch (error) {
        console.error('Start auto-scrape error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// @route   POST /api/indiamart/auto-scrape/stop
// @desc    Disable the recurring background scrape for this user
// @access  Private
router.post('/auto-scrape/stop', protect, async (req, res) => {
    try {
        await IndiamartConnection.findOneAndUpdate({ user: req.user._id }, { $set: { autoScrapeEnabled: false } });
        autoScrapeScheduler.stop(req.user._id.toString());
        res.json({ success: true, message: 'Auto-scrape stopped' });
    } catch (error) {
        console.error('Stop auto-scrape error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// @route   GET /api/indiamart/leads
// @desc    List previously scraped IndiaMART leads for this user
// @access  Private
router.get('/leads', protect, async (req, res) => {
    try {
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
        const leads = await IndiamartLead.find({ user: req.user._id }).sort({ scrapedAt: -1 }).limit(limit);
        res.json({ success: true, count: leads.length, data: leads });
    } catch (error) {
        console.error('List IndiaMART leads error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;
