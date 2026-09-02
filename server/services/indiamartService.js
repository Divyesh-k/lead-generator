const axios = require('axios');

const BASE_URL = 'https://seller.indiamart.com';

const COMMON_HEADERS = {
    accept: '*/*',
    'accept-language': 'en-US,en;q=0.9',
    'content-type': 'application/json',
    origin: BASE_URL,
    referer: `${BASE_URL}/bltxn/?pref=recent`,
    'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
};

// IndiaMART's cookies are readable by JS (no HttpOnly flag on im_iss / ImeshVisitor per
// observed Set-Cookie headers), which is what makes the bookmarklet-based connect flow possible.
function parseCookieMeta(cookieString) {
    const meta = { glusrid: null, companyName: null, contactName: null };
    if (!cookieString) return meta;

    const pairs = cookieString.split(';').map((p) => p.trim()).filter(Boolean);

    for (const pair of pairs) {
        const eqIndex = pair.indexOf('=');
        if (eqIndex === -1) continue;
        const name = pair.slice(0, eqIndex).trim();
        let value = pair.slice(eqIndex + 1).trim();
        try {
            value = decodeURIComponent(value);
        } catch (_) {
            // leave as-is if not URI-encoded
        }

        if (name === 'im_iss' && !meta.glusrid) {
            try {
                const jwt = value.startsWith('t=') ? value.slice(2) : value;
                const payload = jwt.split('.')[1];
                const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
                if (decoded.sub) meta.glusrid = String(decoded.sub);
            } catch (_) {
                // ignore malformed token
            }
        }

        if (name === 'userDet') {
            const fields = {};
            value.split('|').forEach((kv) => {
                const idx = kv.indexOf('=');
                if (idx === -1) return;
                fields[kv.slice(0, idx)] = kv.slice(idx + 1);
            });
            if (fields.glid && !meta.glusrid) meta.glusrid = fields.glid;
            if (fields.comp_name) meta.companyName = fields.comp_name;
        }

        if (name === 'ImeshVisitor') {
            const fields = {};
            value.split('|').forEach((kv) => {
                const idx = kv.indexOf('=');
                if (idx === -1) return;
                fields[kv.slice(0, idx)] = kv.slice(idx + 1);
            });
            if (fields.fn) meta.contactName = fields.fn;
            if (fields.glid && !meta.glusrid) meta.glusrid = fields.glid;
        }
    }

    return meta;
}

class IndiamartApiError extends Error {
    constructor(message, code) {
        super(message);
        this.code = code;
    }
}

async function fetchLeads(cookie, glusrid, { start = 1, end = 20 } = {}) {
    const res = await axios.post(
        `${BASE_URL}/blreact/getBLDisplayData`,
        {
            LocPref: '2',
            stateid: '',
            city: '',
            iso: '',
            pref_city_lead: 0,
            glusrid: String(glusrid),
            inbox: '',
            offer: '',
            offer_type: 'B',
            start,
            end,
            UsageTyp: '',
            quantity: '',
            is_email: '',
            is_gst: '',
            is_catalog: '',
            is_mobnum: '',
            is_busname: '',
            mcatid: '',
            sov: '',
            eov: null,
            enqType: '',
            expired: '',
        },
        {
            headers: { ...COMMON_HEADERS, Cookie: cookie },
            validateStatus: () => true,
        }
    );

    if (res.status === 429) {
        throw new IndiamartApiError('IndiaMART rate-limited this request (HTTP 429). Auto-scrape has been paused to avoid making it worse.', 'RATE_LIMITED');
    }
    if (res.data && res.data.CODE === '402') {
        throw new IndiamartApiError(res.data.MESSAGE || 'Token expired', 'TOKEN_EXPIRED');
    }
    if (!res.data || res.data.BLflag !== '1') {
        throw new IndiamartApiError((res.data && res.data.BLmsg) || 'Failed to fetch leads', 'FETCH_FAILED');
    }

    return res.data;
}

async function unlockLead(cookie, { glusrId, ofrid, ofrtitle, mappedMcatId, matchedMcatId, gridParameters, gridLeadPos, serial }) {
    const res = await axios.post(
        `${BASE_URL}/blreact/contactBuyNow`,
        {
            glusrId: String(glusrId),
            ofrid: String(ofrid),
            purchasemod: 'WEB',
            count: 1,
            GRID_PARAMETERS: gridParameters || '',
            NIClick: 1,
            bl_page_location: 'page=recent#city=#mcatid=#locpref=',
            grid_lead_pos: gridLeadPos || 1,
            is_bulk_order: '',
            mapped_mcat_id: String(mappedMcatId || ''),
            matched_mcat_id: String(matchedMcatId || ''),
            ofrtitle: ofrtitle || '',
            order_value_flag: '',
            pref: `${BASE_URL}/bltxn/?pref=recent`,
            ptime: new Date().toISOString(),
            responseTextArea: 0,
            serial: serial || 1,
            tsearch_text: 'all_buyleads',
        },
        {
            headers: { ...COMMON_HEADERS, Cookie: cookie },
            validateStatus: () => true,
        }
    );

    if (res.status === 429) {
        throw new IndiamartApiError('IndiaMART rate-limited this request (HTTP 429). Auto-scrape has been paused to avoid making it worse.', 'RATE_LIMITED');
    }
    if (res.data && res.data.CODE === '402') {
        throw new IndiamartApiError(res.data.MESSAGE || 'Token expired', 'TOKEN_EXPIRED');
    }

    return res.data;
}

module.exports = { parseCookieMeta, fetchLeads, unlockLead, IndiamartApiError };
