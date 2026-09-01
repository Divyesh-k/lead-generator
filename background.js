// TODO: update to the production dashboard URL once deployed
const API_BASE_URL = "http://localhost:5000/api";

const url = "seller.indiamart.com";
let isPageStated = false;
let intervalId = null;
let extensionAttached = false;
let laserMachines = null;
let recentLeads = [];

(async () => {
    console.time("Fetching laser machines");
    if (chrome.storage.local.get("laserMachines")) {
        laserMachines = chrome.storage.local.get("laserMachines");
        console.log("laser machines found in local");
    } else {
        try {
            const response = await fetch("https://niravtank1199.github.io/laserMachines/laserMachines.json");
            const data = await response.json();
            laserMachines = data.laserMachiones;
            chrome.storage.local.set({ laserMachines });
            console.log("laser machines fetched from server");
        } catch (error) {
            console.error("Error fetching laser machines:", error);
        }
    }
    console.timeEnd("Fetching laser machines");
})();

const injectContentScriptAndSendMessage = (tabId, message) => {
    chrome.scripting.executeScript(
        {
            target: { tabId: tabId },
            files: ["popup.js"], // Ensure this path is correct
        },
        () => {
            if (chrome.runtime.lastError) {
                console.log("Error injecting content script:", chrome.runtime.lastError);
                return;
            } else if (extensionAttached) {
                // const monitoringData = loadMonitoringData().then((monitoringData) => {
                // chrome.runtime.sendMessage({ action: "reload_dom", value: monitoringData });
                // });
            }
        }
    );
};

const getTabByUrl = (urlToFind) => {
    return new Promise((resolve, reject) => {
        chrome.tabs.query({}, (tabs) => {
            if (chrome.runtime.lastError) {
                return reject(chrome.runtime.lastError);
            }
            const tab = tabs.find((tab) => tab.url && tab.url.includes(urlToFind));
            resolve(tab ? tab.id : null);
        });
    });
};

const reloadTabById = (tabId) => {
    return new Promise((resolve, reject) => {
        chrome.tabs.reload(tabId, () => {
            if (chrome.runtime.lastError) {
                return reject(chrome.runtime.lastError);
            }
            resolve(`Tab with ID ${tabId} reloaded and message sent.`);
        });
    });
};

const loadMonitoringData = () => {
    try {
        return new Promise((resolve) => {
            chrome.storage.local.get("monitoring", (result) => {
                resolve(
                    result?.monitoring || {
                        intervalId: null,
                        noOfLeads: 0,
                        sessionStart: null,
                        machines: laserMachines,
                        refreshTime: 3000,
                    }
                );
            });
        });
    } catch (error) {
        console.error("Error loading monitoring data:", error);
    }
};

const saveMonitoringData = (data) => chrome.storage.local.set({ monitoring: data });

const setupInterval = async (refreshTime = 3000) => {
    if (refreshTime === 3000) {
        let monitoring = await loadMonitoringData();
        refreshTime = monitoring.refreshTime;
        saveMonitoringData(monitoring);
    }
    const tabId = await getTabByUrl(url);
    if (tabId === null) {
        console.log("No tab found with the given URL.");
        return;
    }

    intervalId = setInterval(() => {
        injectContentScriptAndSendMessage(tabId);
        reloadTabById(tabId);
        if (extensionAttached) {
            loadMonitoringData().then((monitoringData) => {
                chrome.runtime.sendMessage({ action: "reload_dom", value: monitoringData, recentLeads });
            });
        }
    }, refreshTime);

    isPageStated = true;
    return intervalId;
};

const pageChecker = async (alreadyRunning = false) => {
    try {
        const monitoring = await loadMonitoringData();
        if (!isPageStated || alreadyRunning) {
            clearInterval(monitoring.intervalId);
            monitoring.sessionStart = monitoring?.sessionStart || new Date().toString();
            monitoring.intervalId = await setupInterval(monitoring.refreshTime);
            saveMonitoringData(monitoring);
        }
    } catch (error) {
        console.error("Error in pageChecker:", error);
    }
};

const endPageChecker = async () => {
    isPageStated = false;
    const monitoring = await loadMonitoringData();
    if (monitoring.intervalId) {
        clearInterval(monitoring.intervalId);
        monitoring.intervalId = null;
        monitoring.sessionStart = null;
        monitoring.noOfLeads = 0;
        saveMonitoringData(monitoring);
    }
};

const extractConnectToken = (raw) => {
    try {
        const url = new URL(raw);
        const t = url.searchParams.get("token");
        if (t) return t;
    } catch (_) {
        // not a full URL, treat the whole input as the raw token
    }
    return raw;
};

const connectIndiamart = async (raw) => {
    const token = extractConnectToken(raw);
    const cookies = await chrome.cookies.getAll({ domain: "indiamart.com" });

    if (!cookies.length) {
        return { success: false, message: "No IndiaMART cookies found. Make sure you are logged into seller.indiamart.com in this browser." };
    }

    const cookieString = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

    const res = await fetch(`${API_BASE_URL}/indiamart/connect/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cookie: cookieString }),
    });
    const data = await res.json();
    return {
        success: !!data.success,
        message: data.message,
        companyName: data.data && data.data.companyName,
    };
};

// Event listener for messages from the popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "startMonitoring") {
        pageChecker(message.alreadyRunning);
        chrome.runtime.sendMessage({ action: "monitoring_started" });
    } else if (message.action === "stopMonitoring") {
        endPageChecker();
        chrome.runtime.sendMessage({ action: "monitoring_ended" });
    } else if (message.action === "increase_lead") {
        loadMonitoringData().then((monitoring) => {
            monitoring.noOfLeads += 1;
            saveMonitoringData(monitoring);
            recentLeads.unshift({
                name: message.value.name,
                time: message.value.time,
                clicks: 0,
            });

            recentLeads = recentLeads.map((lead, index) => ({ ...lead, no: index + 1 }));

            if (recentLeads.length > 10) {
                recentLeads.pop();
            }
        });
    } else if (message.action === "getStatus") {
        loadMonitoringData().then((monitoring) => {
            sendResponse(monitoring);
        });
        return true;
    } else if (message.action === "extension_attached") {
        extensionAttached = true;
    } else if (message.action === "extension_detached") {
        extensionAttached = false;
    } else if (message.action === "updateRefreshTime") {
        (async () => {
            try {
                console.log("message.value in finite: ", message.value);
                const monitoring = await loadMonitoringData();
                const wasRunning = monitoring.intervalId !== null;
                monitoring.refreshTime = parseInt(message.value) * 1000;
                if (wasRunning) {
                    clearInterval(monitoring.intervalId);
                    monitoring.intervalId = null;
                    monitoring.intervalId = await setupInterval(monitoring.refreshTime);
                }
                saveMonitoringData(monitoring);
                chrome.runtime.sendMessage({ action: "reload_dom", value: monitoring });
                // return true;
            } catch (error) {
                console.error("Error while updating interval:", error);
            }
        })();
    } else if (message.action === "getLaserMachines") {
        sendResponse(laserMachines);
        return true;
    } else if (message.action === "getRecentLeads") {
        sendResponse(recentLeads);
        return true;
    } else if (message.action === "connectIndiamart") {
        connectIndiamart(message.value)
            .then(sendResponse)
            .catch((error) => sendResponse({ success: false, message: error.message }));
        return true;
    }
});

endPageChecker();
