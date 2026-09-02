const IndiamartConnection = require('../models/IndiamartConnection');
const IndiamartLead = require('../models/IndiamartLead');
const Machine = require('../models/Machine');
const { fetchLeads, unlockLead, IndiamartApiError } = require('./indiamartService');

// Shared by the manual "Scrape Leads" button and the auto-scrape interval so both
// paths fetch/unlock/persist leads identically.
async function runScrape(userId, { fetchCount = 20, unlockLimit = 5 } = {}) {
    const conn = await IndiamartConnection.findOne({ user: userId }).select('+cookie');

    if (!conn || conn.status !== 'connected' || !conn.cookie) {
        throw new IndiamartApiError('IndiaMART is not connected', 'NOT_CONNECTED');
    }

    fetchCount = Math.min(Math.max(fetchCount, 1), 20);
    unlockLimit = Math.min(Math.max(unlockLimit, 0), 20);

    // Only leads whose product title exactly matches (case-insensitive) one of the
    // user's active machines are considered. No active machines configured means
    // no filter is applied, so a first-time user still sees unfiltered leads.
    const machines = await Machine.find({ user: userId, isActive: true });
    const machineNames = new Set(machines.map((m) => m.name.trim().toLowerCase()));

    let listing;
    try {
        listing = await fetchLeads(conn.cookie, conn.glusrid, { start: 1, end: fetchCount });
    } catch (err) {
        if (err instanceof IndiamartApiError && err.code === 'TOKEN_EXPIRED') {
            conn.status = 'expired';
            conn.lastError = 'IndiaMART session expired';
            conn.lastErrorCode = 'TOKEN_EXPIRED';
            await conn.save();
            throw err;
        }
        if (err instanceof IndiamartApiError && err.code === 'RATE_LIMITED') {
            // Re-thrown (not swallowed) so the caller can react — e.g. the auto-scrape
            // scheduler pauses itself instead of continuing to hit a rate limit.
            conn.lastError = err.message;
            conn.lastErrorCode = 'RATE_LIMITED';
            await conn.save();
            throw err;
        }
        if (err instanceof IndiamartApiError) {
            conn.lastError = err.message;
            conn.lastErrorCode = err.code || 'FETCH_FAILED';
            await conn.save();
            return { totalFetched: 0, matched: 0, unlocked: 0, creditsSpent: 0, creditBalance: conn.creditBalance, blPurchaseCountBalance: conn.blPurchaseCountBalance, leads: [], message: err.message };
        }
        throw err;
    }

    const displayList = Array.isArray(listing.DisplayList) ? listing.DisplayList : [];
    let unlockedCount = 0;
    let creditsSpent = 0;
    let matchedCount = 0;
    const results = [];

    for (let i = 0; i < displayList.length; i++) {
        const lead = displayList[i];
        const offerId = String(lead.ETO_OFR_ID);

        const titleLower = (lead.ETO_OFR_TITLE || '').trim().toLowerCase();
        if (machineNames.size > 0 && !machineNames.has(titleLower)) {
            continue; // doesn't match any of the user's configured machines — skip entirely
        }
        matchedCount++;

        const existing = await IndiamartLead.findOne({ user: userId, offerId });
        if (existing && existing.unlocked) {
            results.push(existing);
            continue;
        }

        let leadDoc = existing || new IndiamartLead({
            user: userId,
            offerId,
            title: lead.ETO_OFR_TITLE,
            category: lead.ETO_OFR_GLCAT_MCAT_NAME,
            approxOrderValue: lead.ETO_OFR_APPROX_ORDER_VALUE,
            postedAt: lead.OFFER_DATE,
        });

        if (unlockedCount < unlockLimit) {
            try {
                const unlockRes = await unlockLead(conn.cookie, {
                    glusrId: conn.glusrid,
                    ofrid: offerId,
                    ofrtitle: lead.ETO_OFR_TITLE,
                    mappedMcatId: lead.FK_GLCAT_MCAT_ID,
                    matchedMcatId: lead.FK_GLCAT_MCAT_ID,
                    gridParameters: lead.GRID_PARAMETERS,
                    gridLeadPos: i + 1,
                    serial: i + 1,
                });

                if (unlockRes.Flag === '1' && Array.isArray(unlockRes.Data) && unlockRes.Data[0]) {
                    const buyer = unlockRes.Data[0];
                    const balance = unlockRes.Data[1] || {};

                    leadDoc.unlocked = true;
                    leadDoc.creditsSpent = Number(lead.ETO_CREDITS) || 200;
                    leadDoc.buyerName = buyer.GLUSR_NAME || null;
                    leadDoc.buyerEmail = buyer.GLUSR_USR_EMAIL || null;
                    leadDoc.buyerMobile = buyer.GLUSR_USR_PH_MOBILE || null;
                    leadDoc.buyerMobileCountry = buyer.GLUSR_USR_PH_COUNTRY || null;
                    leadDoc.buyerCompany = buyer.GLUSR_COMPANY || null;
                    leadDoc.buyerCity = buyer.GLUSR_CITY || null;
                    leadDoc.buyerState = buyer.GLUSR_STATE || null;
                    leadDoc.buyerCountry = buyer.GLUSR_COUNTRY || null;
                    leadDoc.memberSince = buyer.GLUSR_USR_MEMBERSINCE || null;

                    creditsSpent += leadDoc.creditsSpent;
                    unlockedCount++;

                    if (balance.creditBalance != null) conn.creditBalance = Number(balance.creditBalance);
                    if (balance.blPurchaseCountBalance != null) conn.blPurchaseCountBalance = Number(balance.blPurchaseCountBalance);
                } else {
                    leadDoc.unlocked = false;
                }
            } catch (err) {
                if (err instanceof IndiamartApiError && err.code === 'TOKEN_EXPIRED') {
                    conn.status = 'expired';
                    conn.lastError = 'IndiaMART session expired mid-scrape';
                    conn.lastErrorCode = 'TOKEN_EXPIRED';
                    await conn.save();
                    throw err;
                }
                if (err instanceof IndiamartApiError && err.code === 'RATE_LIMITED') {
                    // Stop unlocking further leads this run instead of continuing to
                    // hammer an endpoint that just told us to back off.
                    conn.lastError = err.message;
                    conn.lastErrorCode = 'RATE_LIMITED';
                    await conn.save();
                    throw err;
                }
                console.error(`Unlock failed for offer ${offerId}:`, err.message);
                leadDoc.unlocked = false;
            }
        }

        leadDoc.scrapedAt = new Date();
        await leadDoc.save();
        results.push(leadDoc);
    }

    conn.lastScrapedAt = new Date();
    conn.lastError = null;
    conn.lastErrorCode = null;
    await conn.save();

    return {
        totalFetched: displayList.length,
        matched: matchedCount,
        unlocked: unlockedCount,
        creditsSpent,
        creditBalance: conn.creditBalance,
        blPurchaseCountBalance: conn.blPurchaseCountBalance,
        leads: results,
    };
}

module.exports = { runScrape };
