(async function () {
    const laserMachines = await chrome.runtime.sendMessage({ action: "getMachines" });
    const headerEl = document.querySelector(".lstNwLftCnt h2");
    const buttonEl = document.querySelector(".btnCBN1");
    chrome.runtime.sendMessage({ action: "script added", value: 5 });
    if (headerEl) {
        const headerElText = headerEl.textContent.trim();
        if (laserMachines.includes(headerElText)) {
            buttonEl.click();
            const leadDetails = {
                name: headerElText,
                time: new Date().toLocaleTimeString(),
            };
            chrome.runtime.sendMessage({ action: "increase_lead", value: leadDetails });
        }
    }
})();
