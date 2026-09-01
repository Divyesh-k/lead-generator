const statusButton = document.getElementById("status");
const startButton = document.getElementById("startButton");
const stopButton = document.getElementById("stopButton");
const editIconEl = document.getElementById("editIcon");
const refreshTimeEl = document.getElementById("refreshTime");
const recentLeadsEl = document.getElementById("recentLeadsSwitch");
const horizontalBreakLeads = document.getElementById("horizontalBreakLeads");
const tableWrapperEl = document.querySelector(".table-wrapper");
const noOfLeadsEl = document.getElementById("noOfLeads");
const timerEl = document.getElementById("timer");

let data = null;
let isRunning = false;
let recentLeadsData = [];
// dom event listeners
editIconEl.addEventListener("click", () => {
    refreshTimeEl.disabled = false;
    refreshTimeEl.focus();
});

refreshTimeEl.addEventListener("blur", async () => {
    if (!isRunning) {
        isRunning = true;
        refreshTimeEl.disabled = true;
        chrome.runtime.sendMessage({ action: "updateRefreshTime", value: refreshTimeEl.value });
    }
    isRunning = false;
});

startButton.addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "startMonitoring" });
});

stopButton.addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "stopMonitoring" });
});

recentLeadsEl.addEventListener("change", updateRecentLeadsTable);

document.addEventListener("DOMContentLoaded", async () => {
    data = await chrome.runtime.sendMessage({ action: "getStatus" });
    chrome.runtime.sendMessage({ action: "extension_attached" });
    updateDomContent(data);
});

document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
        chrome.runtime.sendMessage({ action: "extension_detached" });
    }
});
// dom event listeners end

// logic
function updateStatusButton(isRunning) {
    if (statusButton) {
        statusButton.innerText = isRunning ? "Running" : "Stopped";
        statusButton.classList.toggle("text-green", isRunning);
        statusButton.classList.toggle("text-red", !isRunning);
    }
}

function toggleButtons(isRunning) {
    if (startButton && stopButton) {
        startButton.disabled = isRunning;
        stopButton.disabled = !isRunning;
    }
}

function formatTimeDifference(startTime, endTime) {
    console.log("endTime: ", endTime, typeof endTime);
    console.log("startTime: ", startTime, typeof startTime);
    // Ensure startTime and endTime are Date objects
    if (!(startTime instanceof Date) || !(endTime instanceof Date)) {
        throw new Error("Both arguments must be Date objects.");
    }

    // Calculate the difference in milliseconds
    const diffInMs = endTime - startTime;
    console.log("diffInMs: ", diffInMs);

    // Convert milliseconds to seconds
    const diffInSec = Math.floor(diffInMs / 1000);

    // Calculate hours, minutes, and seconds
    const hours = Math.floor(diffInSec / 3600);
    const minutes = Math.floor((diffInSec % 3600) / 60);
    const seconds = diffInSec % 60;

    // Format the result as hh:mm:ss
    const formattedDiff = [String(hours).padStart(2, "0"), String(minutes).padStart(2, "0"), String(seconds).padStart(2, "0")].join(":");

    console.log("formattedDiff: ", formattedDiff);
    return formattedDiff;
}

function updateDomContent(data) {
    if (data.intervalId) {
        updateStatusButton(true);
        toggleButtons(true);
    }
    noOfLeadsEl.value = data?.noOfLeads || 0;
    timerEl.value = data?.sessionStart ? formatTimeDifference(new Date(data.sessionStart), new Date()) : "HH:MM:SS";
    refreshTimeEl.value = data?.refreshTime / 1000 || 3;
    recentLeadsData = data?.recentLeads || [];
    updateRecentLeadsTable();
}

async function updateRecentLeadsTable() {
    if (recentLeadsEl.checked) {
        recentLeadsData = await chrome.runtime.sendMessage({ action: "getRecentLeads" });
        const elements = recentLeadsData.map((lead) => {
            return `
            <tr>
            <td>${lead.no}</td>
            <td>${lead.name}</td>
            <td>${lead.time}</td>
            </tr>`;
        });
        horizontalBreakLeads.style.display = "block";
        tableWrapperEl.innerHTML = `
        <table class="leads-table">
                <thead>
                    <tr>
                        <th>No</th>
                        <th>Lead Name</th>
                        <th>Time</th>
                    </tr>
                </thead>
                <tbody>
                    ${elements.join("")}
                </tbody>
            </table>`;
    } else {
        horizontalBreakLeads.style.display = "none";
        tableWrapperEl.innerHTML = "";
    }
}
// logic end

// Connect IndiaMART
const connectTokenInput = document.getElementById("connectTokenInput");
const connectDashboardBtn = document.getElementById("connectDashboardBtn");
const connectStatusEl = document.getElementById("connectStatus");

connectDashboardBtn.addEventListener("click", () => {
    const raw = connectTokenInput.value.trim();
    if (!raw) {
        connectStatusEl.textContent = "Paste a connect code or link first.";
        connectStatusEl.className = "connect-status text-red";
        return;
    }

    connectDashboardBtn.disabled = true;
    connectStatusEl.textContent = "Connecting...";
    connectStatusEl.className = "connect-status";

    chrome.runtime.sendMessage({ action: "connectIndiamart", value: raw }, (response) => {
        connectDashboardBtn.disabled = false;
        if (response && response.success) {
            connectStatusEl.textContent = response.companyName ? `Connected to ${response.companyName}` : "Connected!";
            connectStatusEl.className = "connect-status text-green";
        } else {
            connectStatusEl.textContent = (response && response.message) || "Connect failed";
            connectStatusEl.className = "connect-status text-red";
        }
    });
});

// Listener for background events
chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "monitoring_started") {
        updateStatusButton(true);
        toggleButtons(true);
    } else if (message.action === "monitoring_ended") {
        updateStatusButton(false);
        toggleButtons(false);
        timerEl.value = "HH:MM:SS";
        noOfLeadsEl.value = "0";
    } else if (message.action === "reload_dom") {
        updateDomContent(message.value);
    }
});
