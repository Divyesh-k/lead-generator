const IndiamartConnection = require('../models/IndiamartConnection');
const { runScrape, runContactSync } = require('./indiamartScraper');
const { IndiamartApiError } = require('./indiamartService');

// In-memory per-user interval handles. Single-process only (matches how the
// rest of this app runs) — re-armed from the DB on boot via initialize().
const timers = new Map();

// Guards against overlapping ticks: with short intervals (down to 5s) a slow
// IndiaMART response could otherwise let a second tick start before the first
// one finishes.
const running = new Set();

async function tick(userId) {
    if (running.has(userId)) {
        return; // previous tick for this user is still in flight — skip this one
    }
    running.add(userId);

    try {
        const conn = await IndiamartConnection.findOne({ user: userId });
        if (!conn || !conn.autoScrapeEnabled || conn.status !== 'connected') {
            stop(userId);
            return;
        }

        await runScrape(userId, {
            fetchCount: 100,
            // null = unlimited-per-user-setting; runScrape() itself still hard-caps
            // actual unlocks at 100 per run.
            unlockLimit: conn.autoScrapeUnlockLimit == null ? Infinity : conn.autoScrapeUnlockLimit,
        });

        // Also sync Lead Manager's contact list every tick, so a BuyLead consumed
        // by anyone/anything other than this app's own unlock call (the IndiaMART
        // website directly, another session on the account) still shows up here.
        // Same session, same cadence — a TOKEN_EXPIRED/RATE_LIMITED here is handled
        // by the same catch block below since it's the same underlying cookie.
        await runContactSync(userId, { fetchCount: 25 });

        await IndiamartConnection.updateOne({ user: userId }, { $set: { autoScrapeLastRunAt: new Date() } });
    } catch (error) {
        if (error instanceof IndiamartApiError && error.code === 'TOKEN_EXPIRED') {
            console.warn(`Auto-scrape stopped for user ${userId}: IndiaMART session expired`);
            await IndiamartConnection.updateOne({ user: userId }, { $set: { autoScrapeEnabled: false } });
            stop(userId);
            return;
        }
        if (error instanceof IndiamartApiError && error.code === 'RATE_LIMITED') {
            console.warn(`Auto-scrape paused for user ${userId}: IndiaMART rate-limited the request`);
            await IndiamartConnection.updateOne({ user: userId }, { $set: { autoScrapeEnabled: false } });
            stop(userId);
            return;
        }
        console.error(`Auto-scrape tick failed for user ${userId}:`, error.message);
    } finally {
        running.delete(userId);
    }
}

function start(userId, intervalSeconds, unlockLimit) {
    stop(userId); // clear any existing timer first
    const handle = setInterval(() => tick(userId), intervalSeconds * 1000);
    timers.set(userId, handle);
    const limitLabel = unlockLimit == null ? 'unlimited (capped at 100/run)' : unlockLimit;
    console.log(`Auto-scrape started for user ${userId}: every ${intervalSeconds}s, unlocking up to ${limitLabel} new lead(s) per run`);
}

function stop(userId) {
    const handle = timers.get(userId);
    if (handle) {
        clearInterval(handle);
        timers.delete(userId);
    }
    running.delete(userId);
}

// Re-arm auto-scrape for any connections that had it enabled before a restart
async function initialize() {
    const connections = await IndiamartConnection.find({ autoScrapeEnabled: true, status: 'connected' });
    connections.forEach((conn) => {
        start(conn.user.toString(), conn.autoScrapeIntervalSeconds, conn.autoScrapeUnlockLimit);
    });
    if (connections.length) {
        console.log(`Re-armed auto-scrape for ${connections.length} connected account(s)`);
    }
}

module.exports = { start, stop, initialize };
