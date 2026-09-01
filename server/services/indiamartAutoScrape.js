const IndiamartConnection = require('../models/IndiamartConnection');
const { runScrape } = require('./indiamartScraper');
const { IndiamartApiError } = require('./indiamartService');

// In-memory per-user interval handles. Single-process only (matches how the
// rest of this app runs) — re-armed from the DB on boot via initialize().
const timers = new Map();

async function tick(userId) {
    try {
        const conn = await IndiamartConnection.findOne({ user: userId });
        if (!conn || !conn.autoScrapeEnabled || conn.status !== 'connected') {
            stop(userId);
            return;
        }

        await runScrape(userId, {
            fetchCount: 20,
            unlockLimit: conn.autoScrapeUnlockLimit,
        });

        await IndiamartConnection.updateOne({ user: userId }, { $set: { autoScrapeLastRunAt: new Date() } });
    } catch (error) {
        if (error instanceof IndiamartApiError && error.code === 'TOKEN_EXPIRED') {
            console.warn(`Auto-scrape stopped for user ${userId}: IndiaMART session expired`);
            await IndiamartConnection.updateOne({ user: userId }, { $set: { autoScrapeEnabled: false } });
            stop(userId);
            return;
        }
        console.error(`Auto-scrape tick failed for user ${userId}:`, error.message);
    }
}

function start(userId, intervalMinutes, unlockLimit) {
    stop(userId); // clear any existing timer first
    const handle = setInterval(() => tick(userId), intervalMinutes * 60 * 1000);
    timers.set(userId, handle);
    console.log(`Auto-scrape started for user ${userId}: every ${intervalMinutes}m, unlocking up to ${unlockLimit} new lead(s) per run`);
}

function stop(userId) {
    const handle = timers.get(userId);
    if (handle) {
        clearInterval(handle);
        timers.delete(userId);
    }
}

// Re-arm auto-scrape for any connections that had it enabled before a restart
async function initialize() {
    const connections = await IndiamartConnection.find({ autoScrapeEnabled: true, status: 'connected' });
    connections.forEach((conn) => {
        start(conn.user.toString(), conn.autoScrapeIntervalMinutes, conn.autoScrapeUnlockLimit);
    });
    if (connections.length) {
        console.log(`Re-armed auto-scrape for ${connections.length} connected account(s)`);
    }
}

module.exports = { start, stop, initialize };
