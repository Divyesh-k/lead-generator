const fs = require('fs');
const path = require('path');
const IndiamartConnection = require('../models/IndiamartConnection');
const IndiamartLead = require('../models/IndiamartLead');
const Machine = require('../models/Machine');
const { fetchLeads, unlockLead, fetchContactList, IndiamartApiError } = require('./indiamartService');

// Every fetched item (matched or not) gets one line here, so a "why didn't
// this lead show up" question can be answered from the log instead of by
// re-querying IndiaMART or guessing at the matching logic.
const MATCH_LOG_FILE = path.join(__dirname, '..', '..', 'logs', 'indiamart-match-log.jsonl');

function logMatchDecision(entry) {
    try {
        fs.mkdirSync(path.dirname(MATCH_LOG_FILE), { recursive: true });
        fs.appendFileSync(MATCH_LOG_FILE, JSON.stringify({ timestamp: new Date().toISOString(), ...entry }) + '\n');
    } catch (err) {
        console.error('Failed to write indiamart match log:', err.message);
    }
}

// Full exact match, case-insensitive only — the machine's name must equal
// the ENTIRE text, not just appear somewhere inside it. No substring
// containment, no fuzzy word-overlap, no reordering. A bare catalog entry
// like "Silver Laser Engraving Machine" no longer matches a more specific
// lead like "30W Silver Laser Engraving Machine" — the client didn't list
// that exact product, so it isn't a match. Explicit instruction: this is a
// client-facing portal where the client decides which machines are
// active/inactive — we don't get to loosen or tighten that list ourselves,
// so the matching itself must stay as strict and literal as possible.
function machineMatchesText(machineName, text) {
    const name = (machineName || '').trim().toLowerCase();
    return name.length > 0 && (text || '').trim().toLowerCase() === name;
}

// Matching is against the buyer-typed lead TITLE only — not IndiaMART's
// category. Category names are IndiaMART's own broad classification (e.g.
// "Laser Engraving Machines" covers everything from a small desktop unit to
// a large industrial one), so matching on category alone let a generic
// catalog entry match leads that weren't actually a match — confirmed live
// with a real lead titled "1390 CO2 Laser Engraving Machine" under category
// "Laser Engraving Machines". Explicit user instruction: match against the
// title, not the category.
function leadMatchesMachine(machineName, title) {
    return machineMatchesText(machineName, title);
}

// Shared by the manual "Scrape Leads" button and the auto-scrape interval so both
// paths fetch/unlock/persist leads identically.
async function runScrape(userId, { fetchCount = 20, unlockLimit = 5 } = {}) {
    const conn = await IndiamartConnection.findOne({ user: userId }).select('+cookie');

    if (!conn || conn.status !== 'connected' || !conn.cookie) {
        throw new IndiamartApiError('IndiaMART is not connected', 'NOT_CONNECTED');
    }

    // Ceiling raised from 20 to 100 at the user's explicit request, to test
    // whether IndiaMART's endpoint actually supports a page/unlock size this
    // large — unverified against their (undocumented) API before this change.
    fetchCount = Math.min(Math.max(fetchCount, 1), 100);
    unlockLimit = Math.min(Math.max(unlockLimit, 0), 100);

    // A lead is only considered relevant if its title exact-matches (case-insensitive)
    // one of the user's active machines (see leadMatchesMachine above). No
    // active machines configured means no filter is applied, so a first-time
    // user still sees unfiltered leads.
    const machines = await Machine.find({ user: userId, isActive: true });
    const machineNames = machines.map((m) => m.name).filter((n) => n && n.trim());

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
    let hadSoftIssue = false; // an unlock was attempted but declined/failed without throwing
    const results = [];

    for (let i = 0; i < displayList.length; i++) {
        const lead = displayList[i];
        const offerId = String(lead.ETO_OFR_ID);

        const matchedMachine = machineNames.find((name) => leadMatchesMachine(name, lead.ETO_OFR_TITLE)) || null;
        const isMatch = machineNames.length === 0 || matchedMachine !== null;

        logMatchDecision({
            source: 'buylead_scrape',
            user: String(userId),
            offerId,
            title: lead.ETO_OFR_TITLE,
            category: lead.ETO_OFR_GLCAT_MCAT_NAME,
            matched: isMatch,
            matchedMachine,
            reason: machineNames.length === 0 ? 'no_active_machines_configured' : (isMatch ? 'title_exact_matches_machine_name' : 'no_active_machine_name_equals_title'),
        });

        if (!isMatch) {
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
                    // IndiaMART answered (no exception) but declined to unlock this
                    // specific lead — capture *why* instead of failing silently, since
                    // this previously vanished with zero visibility.
                    leadDoc.unlocked = false;
                    const declineReason = unlockRes && (unlockRes.Msg || unlockRes.msg || unlockRes.Message || unlockRes.BLmsg);
                    conn.lastError = declineReason
                        ? `IndiaMART declined to unlock "${lead.ETO_OFR_TITLE}": ${declineReason}`
                        : `IndiaMART declined to unlock "${lead.ETO_OFR_TITLE}" (no reason given in response)`;
                    conn.lastErrorCode = 'UNLOCK_DECLINED';
                    hadSoftIssue = true;
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
                conn.lastError = `Unlock failed for "${lead.ETO_OFR_TITLE}": ${err.message}`;
                conn.lastErrorCode = 'UNLOCK_FAILED';
                hadSoftIssue = true;
            }
        }

        leadDoc.scrapedAt = new Date();
        await leadDoc.save();
        results.push(leadDoc);
    }

    conn.lastScrapedAt = new Date();
    if (!hadSoftIssue) {
        conn.lastError = null;
        conn.lastErrorCode = null;
    }
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

// Syncs Lead Manager's contact list — catches every consumed BuyLead regardless
// of who or what unlocked it (this app's own scrape, the IndiaMART website
// directly, or another session on the same account), since a contact appears
// here the moment a BuyLead is consumed, with buyer details already visible
// (no separate unlock/credit-spend step, unlike the BuyLeads marketplace).
// Namespacing the id with "cl_" keeps these rows from ever colliding with a
// real BuyLeads offerId (ETO_OFR_ID), which is purely numeric.
async function runContactSync(userId, { fetchCount = 25 } = {}) {
    const conn = await IndiamartConnection.findOne({ user: userId }).select('+cookie');

    if (!conn || conn.status !== 'connected' || !conn.cookie) {
        throw new IndiamartApiError('IndiaMART is not connected', 'NOT_CONNECTED');
    }

    fetchCount = Math.min(Math.max(fetchCount, 1), 100);

    const machines = await Machine.find({ user: userId, isActive: true });
    const machineNames = machines.map((m) => m.name).filter((n) => n && n.trim());

    const contacts = await fetchContactList(conn.cookie, { start: 1, end: fetchCount });

    let matchedCount = 0;
    let savedCount = 0;

    for (const contact of contacts) {
        const matchedMachine = machineNames.find((name) => machineMatchesText(name, contact.contact_last_product)) || null;
        const isMatch = machineNames.length === 0 || matchedMachine !== null;

        logMatchDecision({
            source: 'contact_sync',
            user: String(userId),
            contactId: contact.im_contact_id,
            title: contact.contact_last_product,
            matched: isMatch,
            matchedMachine,
            reason: machineNames.length === 0 ? 'no_active_machines_configured' : (isMatch ? 'title_exact_matches_machine_name' : 'no_active_machine_name_equals_title'),
        });

        if (!isMatch) {
            continue; // not relevant to any of the user's machines
        }
        matchedCount++;

        // Only contacts that came from a consumed BuyLead — organic enquiries and
        // catalog views are a different thing and aren't "leads" in the sense the
        // rest of this app uses that word.
        if (contact.is_buylead !== '1') {
            continue;
        }

        const offerId = `cl_${contact.im_contact_id}`;
        const existingByContactId = await IndiamartLead.findOne({ user: userId, offerId });
        if (existingByContactId) {
            continue; // already recorded via this same contact sync
        }

        // The same BuyLead can already exist under its real offerId if THIS app's
        // own scraper unlocked it first — offerId and im_contact_id are different
        // ID spaces with no shared key, so the only reliable way to catch that
        // overlap is matching on the buyer's mobile number (unique per buyer).
        if (contact.contacts_mobile1) {
            const existingByMobile = await IndiamartLead.findOne({ user: userId, buyerMobile: contact.contacts_mobile1 });
            if (existingByMobile) {
                continue; // same buyer already recorded under a real offerId — don't duplicate
            }
        }

        await IndiamartLead.create({
            user: userId,
            offerId,
            title: contact.contact_last_product || null,
            unlocked: true, // contact details are already visible in this response
            creditsSpent: null, // unknown — we didn't perform the unlock ourselves
            buyerName: contact.contacts_name || null,
            buyerCompany: contact.contacts_company || null,
            buyerMobile: contact.contacts_mobile1 || null,
            buyerMobileCountry: contact.contact_ph_country || null,
            buyerCity: contact.contact_city || null,
            buyerState: contact.contact_state || null,
            buyerCountry: contact.country_name || null,
            scrapedAt: contact.last_contact_date ? new Date(contact.last_contact_date) : new Date(),
        });
        savedCount++;
    }

    conn.lastContactSyncAt = new Date();
    await conn.save();

    return { totalFetched: contacts.length, matched: matchedCount, saved: savedCount };
}

module.exports = { runScrape, runContactSync };
