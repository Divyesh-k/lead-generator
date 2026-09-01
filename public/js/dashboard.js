// Check authentication
const token = localStorage.getItem('token');
if (!token) {
    window.location.href = '/auth.html';
}

// State
let machines = [];
let subscriptionStatus = null;
let userInfo = null;
let selectionMode = false;
let selectedMachines = [];
let currentActiveTab = 'active'; // Track which tab is active
let machineSearchQuery = '';

// Initialize dashboard
async function init() {
    try {
        await loadUserInfo();
        await loadSubscriptionStatus();
        await loadMachines();
        await loadIndiamartStatus();
        await loadIndiamartLeads();

        // Hide auth loader after successful initialization
        const authLoader = document.getElementById('authLoader');
        if (authLoader) {
            authLoader.classList.add('hidden');
        }

        // Add tab switching event listeners
        const tabButtons = document.querySelectorAll('.machine-tabs .tab-btn');
        tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                // Update active tab styling
                tabButtons.forEach(b => b.classList.remove('active'));  
                btn.classList.add('active');

                // Get the tab type (active or inactive)
                const tabType = btn.getAttribute('data-tab');
                currentActiveTab = tabType;

                // Show/hide tab content - use correct IDs from HTML
                const activeTab = document.getElementById('activeTab');
                const inactiveTab = document.getElementById('inactiveTab');

                // Remove active class from all tabs
                activeTab.classList.remove('active');
                inactiveTab.classList.remove('active');

                // Add active class to the selected tab
                if (tabType === 'active') {
                    activeTab.classList.add('active');
                } else {
                    inactiveTab.classList.add('active');
                }

                // Update button visibility when tab changes
                updateBulkDeleteButton();
            });
        });

        // Poll IndiaMART status every 15 seconds so auto-scrape progress/credit balance stay fresh
        setInterval(async () => {
            await loadIndiamartStatus();
            await loadIndiamartLeads();
        }, 15000);
    } catch (error) {
        console.error('Error initializing dashboard:', error);
        window.location.href = '/auth.html';
    }
}

// Load user info
async function loadUserInfo() {
    try {
        const response = await fetch('/api/auth/me', {
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });

        const data = await response.json();

        if (!response.ok) throw new Error(data.message);

        userInfo = data.data; // Store user info
        document.getElementById('userName').textContent = data.data.name;

        const badge = document.getElementById('subscriptionBadge');
        if (data.data.isPro) {
            badge.innerHTML = svgIcon('star') + 'Pro';
            badge.className = 'badge badge-pro';
            // Hide upgrade prompt for Pro users
            document.getElementById('upgradePrompt').classList.add('hidden');
        } else {
            badge.textContent = 'Free';
            badge.className = 'badge badge-free';
        }
    } catch (error) {
        throw error;
    }
}

// Load subscription status
async function loadSubscriptionStatus() {
    try {
        const response = await fetch('/api/subscription/status', {
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });

        const data = await response.json();
        subscriptionStatus = data.data;


        // Update machine limit display
        const limitEl = document.getElementById('machineLimit');
        if (subscriptionStatus.isPro) {
            limitEl.textContent = 'Unlimited';
        } else {
            limitEl.textContent = `Limit: ${subscriptionStatus.machineLimit}`;
        }

        // Show upgrade prompt only for Free users, hide for Pro users
        const upgradePrompt = document.getElementById('upgradePrompt');
        if (subscriptionStatus.isPro) {
            console.log('Hiding upgrade prompt - User is Pro');
            upgradePrompt.classList.add('hidden');
        } else {
            console.log('Showing upgrade prompt - User is Free');
            upgradePrompt.classList.remove('hidden');
        }
    } catch (error) {
        console.error('Error loading subscription:', error);
    }
}

// Load machines
async function loadMachines() {
    try {
        const response = await fetch('/api/machines', {
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });

        const data = await response.json();
        machines = data.data;

        renderMachines();
        updateStats();
    } catch (error) {
        console.error('Error loading machines:', error);
    }
}

function machineCardHtml(machine) {
    return `
        <div class="machine-card${machine.isActive ? '' : ' inactive'}" data-id="${machine._id}">
            <div class="machine-header">
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <input type="checkbox" class="machine-select-checkbox" data-id="${machine._id}"
                           onchange="toggleMachineSelection('${machine._id}', this.checked)">
                    <div class="machine-name">${escapeHtml(machine.name)}</div>
                </div>
                <div class="machine-actions">
                    <div class="machine-toggle">
                        <label class="toggle-switch">
                            <input type="checkbox" ${machine.isActive ? 'checked' : ''}
                                   onchange="toggleMachine('${machine._id}', this.checked)">
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                    <button class="delete-btn" onclick="deleteMachine('${machine._id}')">${svgIcon('trash')}</button>
                </div>
            </div>
        </div>
    `;
}

// Renders one tab's filtered machine list; falls back to a "no matches" message
// when a search query narrows a non-empty list down to zero results.
function renderMachineTab(container, emptyEl, list, totalCount, query, emptyMessage) {
    if (list.length > 0) {
        emptyEl.classList.add('hidden');
        container.innerHTML = list.map(machineCardHtml).join('');
    } else {
        container.innerHTML = '';
        emptyEl.querySelector('p').textContent = (query && totalCount > 0)
            ? `No machines match "${query}".`
            : emptyMessage;
        emptyEl.classList.remove('hidden');
    }
}

// Render machines
function renderMachines() {
    const activeMachinesContainer = document.getElementById('activeMachinesContainer');
    const inactiveMachinesContainer = document.getElementById('inactiveMachinesContainer');
    const noMachines = document.getElementById('noMachines');
    const noActiveMachines = document.getElementById('noActiveMachines');
    const noInactiveMachines = document.getElementById('noInactiveMachines');

    // Separate machines into active and inactive
    const activeMachines = machines.filter(m => m.isActive);
    const inactiveMachines = machines.filter(m => !m.isActive);

    // Update tab counts (reflect true totals, not the search filter)
    document.getElementById('activeTabCount').textContent = activeMachines.length;
    document.getElementById('inactiveTabCount').textContent = inactiveMachines.length;

    if (machines.length === 0) {
        activeMachinesContainer.innerHTML = '';
        inactiveMachinesContainer.innerHTML = '';
        noMachines.classList.remove('hidden');
        noActiveMachines.classList.add('hidden');
        noInactiveMachines.classList.add('hidden');
        return;
    }

    noMachines.classList.add('hidden');

    const query = machineSearchQuery.trim().toLowerCase();
    const filteredActive = query ? activeMachines.filter(m => m.name.toLowerCase().includes(query)) : activeMachines;
    const filteredInactive = query ? inactiveMachines.filter(m => m.name.toLowerCase().includes(query)) : inactiveMachines;

    renderMachineTab(activeMachinesContainer, noActiveMachines, filteredActive, activeMachines.length, query, 'No active machines. Activate some machines to see them here!');
    renderMachineTab(inactiveMachinesContainer, noInactiveMachines, filteredInactive, inactiveMachines.length, query, 'No inactive machines. All your machines are active!');
}

// Toggle machine
async function toggleMachine(machineId, isActive) {
    try {
        const response = await fetch(`/api/machines/${machineId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ isActive }),
        });

        const data = await response.json();

        if (!response.ok) throw new Error(data.message);

        showToast(`Machine ${isActive ? 'activated' : 'deactivated'}`, 'success');
        await loadMachines();
    } catch (error) {
        showToast(error.message, 'error');
        await loadMachines(); // Reload to reset toggle
    }
}

// Delete machine
async function deleteMachine(machineId) {
    const confirmed = await showConfirmModal('Are you sure you want to delete this machine?');
    if (!confirmed) return;

    try {
        const response = await fetch(`/api/machines/${machineId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });

        const data = await response.json();

        if (!response.ok) throw new Error(data.message);

        showToast('Machine deleted successfully', 'success');

        await loadMachines();
        await loadSubscriptionStatus();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

// Load leads
// Update stats
function updateStats() {
    const activeMachines = machines.filter(m => m.isActive).length;
    document.getElementById('activeMachinesCount').textContent = activeMachines;
}

// Event Listeners
document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.clear();
    window.location.href = '/auth.html';
});

document.getElementById('machineSearchInput').addEventListener('input', (e) => {
    machineSearchQuery = e.target.value;
    renderMachines();
});

document.getElementById('addMachineBtn').addEventListener('click', () => {
    if (!subscriptionStatus.canAddMachines) {
        showToast('Machine limit reached. Upgrade to Pro!', 'error');
        return;
    }
    document.getElementById('addMachineModal').classList.remove('hidden');
});

document.getElementById('cancelAddMachine').addEventListener('click', () => {
    document.getElementById('addMachineModal').classList.add('hidden');
    document.getElementById('addMachineForm').reset();
});

document.getElementById('addMachineForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('machineName').value;

    try {
        const response = await fetch('/api/machines', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ name }),
        });

        const data = await response.json();

        if (!response.ok) throw new Error(data.message);

        showToast('Machine added successfully', 'success');
        document.getElementById('addMachineModal').classList.add('hidden');
        document.getElementById('addMachineForm').reset();
        await loadMachines();
        await loadSubscriptionStatus();
    } catch (error) {
        showToast(error.message, 'error');
    }
});

document.getElementById('uploadCsvBtn').addEventListener('click', () => {
    document.getElementById('csvFileInput').click();
});

document.getElementById('csvFileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('/api/machines/bulk', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
            },
            body: formData,
        });

        const data = await response.json();

        if (!response.ok) throw new Error(data.message);

        showToast(`${data.count} machines imported successfully`, 'success');
        await loadMachines();
        await loadSubscriptionStatus();
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        e.target.value = '';
    }
});

document.getElementById('startGenerationBtn').addEventListener('click', () => {
    if (!indiamartStatus || !indiamartStatus.connected) {
        showToast('Connect IndiaMART first', 'error');
        return;
    }
    document.getElementById('startGenerationModal').classList.remove('hidden');
});

document.getElementById('cancelStartGeneration').addEventListener('click', () => {
    document.getElementById('startGenerationModal').classList.add('hidden');
    document.getElementById('startGenerationForm').reset();
});

document.getElementById('startGenerationForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const intervalMinutes = parseInt(document.getElementById('autoScrapeInterval').value, 10);
    const unlockLimit = parseInt(document.getElementById('autoScrapeUnlockLimit').value, 10);

    try {
        await apiCall('/indiamart/auto-scrape/start', {
            method: 'POST',
            body: JSON.stringify({ intervalMinutes, unlockLimit }),
        });

        showToast('Auto-scrape started!', 'success');
        document.getElementById('startGenerationModal').classList.add('hidden');
        document.getElementById('startGenerationForm').reset();
        await loadIndiamartStatus();
    } catch (error) {
        showToast(error.message, 'error');
    }
});

document.getElementById('stopGenerationBtn').addEventListener('click', async () => {
    try {
        await apiCall('/indiamart/auto-scrape/stop', { method: 'POST' });
        showToast('Auto-scrape stopped', 'info');
        await loadIndiamartStatus();
    } catch (error) {
        showToast(error.message, 'error');
    }
});

document.getElementById('upgradeBtn').addEventListener('click', async () => {
    try {
        // Show payment modal
        const paymentModal = document.getElementById('paymentModal');
        paymentModal.classList.remove('hidden');

        // Create order
        const response = await fetch('/api/payment/create-order', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message);
        }

        // Hide payment modal
        paymentModal.classList.add('hidden');

        // No real payment provider configured (local/Docker testing) — simulate the
        // upgrade instead of opening the real Razorpay widget (which needs a real key).
        if (data.data.demoMode) {
            const confirmed = confirm('No payment provider is configured in this environment (demo/test mode). Simulate a successful ₹50 payment and upgrade to Pro?');
            if (!confirmed) {
                showToast('Payment cancelled', 'error');
                return;
            }

            paymentModal.classList.remove('hidden');
            try {
                const verifyRes = await apiCall('/payment/verify', {
                    method: 'POST',
                    body: JSON.stringify({
                        razorpay_order_id: data.data.orderId,
                        razorpay_payment_id: `demo_pay_${Date.now()}`,
                        razorpay_signature: 'demo',
                    }),
                });
                paymentModal.classList.add('hidden');
                showToast('Demo upgrade to Pro complete!', 'success', 'check-circle');
                await loadUserInfo();
                await loadSubscriptionStatus();
                document.getElementById('upgradePrompt').classList.add('hidden');
            } catch (error) {
                paymentModal.classList.add('hidden');
                showToast('Demo upgrade failed: ' + error.message, 'error');
            }
            return;
        }

        // Configure Razorpay options
        const options = {
            key: data.data.keyId,
            amount: data.data.amount,
            currency: data.data.currency,
            name: 'Lead Generator Pro',
            description: 'Pro Subscription - Monthly',
            order_id: data.data.orderId,
            handler: async function (response) {
                // Show processing modal
                paymentModal.classList.remove('hidden');

                try {
                    // Verify payment
                    const verifyResponse = await fetch('/api/payment/verify', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            razorpay_order_id: response.razorpay_order_id,
                            razorpay_payment_id: response.razorpay_payment_id,
                            razorpay_signature: response.razorpay_signature,
                        }),
                    });

                    const verifyData = await verifyResponse.json();

                    paymentModal.classList.add('hidden');

                    if (!verifyResponse.ok) {
                        throw new Error(verifyData.message);
                    }

                    showToast('Successfully upgraded to Pro!', 'success', 'check-circle');
                    await loadUserInfo();
                    await loadSubscriptionStatus();
                    document.getElementById('upgradePrompt').classList.add('hidden');
                } catch (error) {
                    paymentModal.classList.add('hidden');
                    showToast('Payment verification failed: ' + error.message, 'error');
                }
            },
            prefill: {
                name: userInfo?.name || '',
                email: userInfo?.email || '',
            },
            theme: {
                color: '#6366f1',
            },
            modal: {
                ondismiss: function () {
                    paymentModal.classList.add('hidden');
                    showToast('Payment cancelled', 'error');
                }
            }
        };

        // Open Razorpay checkout
        const razorpay = new Razorpay(options);
        razorpay.on('payment.failed', function (response) {
            paymentModal.classList.add('hidden');
            showToast('Payment failed: ' + response.error.description, 'error');
        });
        razorpay.open();

    } catch (error) {
        document.getElementById('paymentModal').classList.add('hidden');
        showToast(error.message, 'error');
    }
});

// Toggle selection mode
document.getElementById('selectToDeleteBtn').addEventListener('click', () => {
    selectionMode = !selectionMode;
    const checkboxes = document.querySelectorAll('.machine-select-checkbox');
    const selectBtn = document.getElementById('selectToDeleteBtn');

    if (selectionMode) {
        // Show checkboxes
        checkboxes.forEach(cb => cb.classList.add('show'));
        selectBtn.innerHTML = svgIcon('x') + 'Cancel Selection';
        selectBtn.classList.remove('btn-secondary');
        selectBtn.classList.add('btn-error');
    } else {
        // Hide checkboxes and reset selection
        checkboxes.forEach(cb => {
            cb.classList.remove('show');
            cb.checked = false;
        });
        selectBtn.innerHTML = svgIcon('check-square') + 'Select to Delete';
        selectBtn.classList.remove('btn-error');
        selectBtn.classList.add('btn-secondary');
        selectedMachines = [];
        updateBulkDeleteButton();
    }
});

// Toggle machine selection
function toggleMachineSelection(machineId, isSelected) {
    if (isSelected) {
        if (!selectedMachines.includes(machineId)) {
            selectedMachines.push(machineId);
        }
    } else {
        selectedMachines = selectedMachines.filter(id => id !== machineId);
    }
    updateBulkDeleteButton();
}

// Update bulk action button visibility
function updateBulkDeleteButton() {
    const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
    const activateSelectedBtn = document.getElementById('activateSelectedBtn');
    const deactivateSelectedBtn = document.getElementById('deactivateSelectedBtn');

    if (selectedMachines.length > 0) {
        deleteSelectedBtn.classList.remove('hidden');
        deleteSelectedBtn.innerHTML = svgIcon('trash') + `Delete Selected (${selectedMachines.length})`;

        // Show only relevant buttons based on current tab
        if (currentActiveTab === 'active') {
            // In Active tab, show only Deactivate button
            activateSelectedBtn.classList.add('hidden');
            deactivateSelectedBtn.classList.remove('hidden');
            deactivateSelectedBtn.innerHTML = svgIcon('pause') + `Deactivate Selected (${selectedMachines.length})`;
        } else {
            // In Inactive tab, show only Activate button
            activateSelectedBtn.classList.remove('hidden');
            activateSelectedBtn.innerHTML = svgIcon('check-circle') + `Activate Selected (${selectedMachines.length})`;
            deactivateSelectedBtn.classList.add('hidden');
        }
    } else {
        deleteSelectedBtn.classList.add('hidden');
        activateSelectedBtn.classList.add('hidden');
        deactivateSelectedBtn.classList.add('hidden');
    }
}


// Delete selected machines
document.getElementById('deleteSelectedBtn').addEventListener('click', async () => {
    if (selectedMachines.length === 0) return;

    const confirmed = await showConfirmModal(`Are you sure you want to delete ${selectedMachines.length} selected machine(s)?`);
    if (!confirmed) return;

    try {
        const response = await fetch('/api/machines/bulk-delete', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ machineIds: selectedMachines }),
        });

        const data = await response.json();

        if (!response.ok) throw new Error(data.message);

        showToast(data.message, 'success');

        // Reset selection state
        selectedMachines = [];
        selectionMode = false;

        // Reset button states
        const selectBtn = document.getElementById('selectToDeleteBtn');
        selectBtn.innerHTML = svgIcon('check-square') + 'Select to Delete';
        selectBtn.classList.remove('btn-error');
        selectBtn.classList.add('btn-secondary');

        // Hide delete selected button
        updateBulkDeleteButton();

        // Reload machines
        await loadMachines();
        await loadSubscriptionStatus();

        // Hide all checkboxes after machines are reloaded
        setTimeout(() => {
            const checkboxes = document.querySelectorAll('.machine-select-checkbox');
            checkboxes.forEach(cb => {
                cb.classList.remove('show');
                cb.checked = false;
            });
        }, 100);

    } catch (error) {
        showToast(error.message, 'error');
    }
});

// Clear all machines
document.getElementById('clearAllBtn').addEventListener('click', async () => {
    const count = machines.length;
    if (count === 0) {
        showToast('No machines to delete', 'error');
        return;
    }

    const confirmed = await showConfirmModal(`Are you sure you want to delete ALL ${count} machine(s)? This cannot be undone!`);
    if (!confirmed) return;

    try {
        const response = await fetch('/api/machines/clear-all', {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });

        const data = await response.json();

        if (!response.ok) throw new Error(data.message);

        showToast(data.message, 'success');

        selectedMachines = [];
        await loadMachines();
        await loadSubscriptionStatus();
    } catch (error) {
        showToast(error.message, 'error');
    }
});

// Activate selected machines
document.getElementById('activateSelectedBtn').addEventListener('click', async () => {
    if (selectedMachines.length === 0) return;

    try {
        const response = await fetch('/api/machines/bulk-toggle', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ machineIds: selectedMachines, isActive: true }),
        });

        const data = await response.json();

        if (!response.ok) throw new Error(data.message);

        showToast(`Activated ${selectedMachines.length} machine(s) successfully`, 'success', 'check-circle');

        // Reset selection state
        selectedMachines = [];
        selectionMode = false;

        // Reset button states
        const selectBtn = document.getElementById('selectToDeleteBtn');
        selectBtn.innerHTML = svgIcon('check-square') + 'Select to Delete';
        selectBtn.classList.remove('btn-error');
        selectBtn.classList.add('btn-secondary');

        // Hide action buttons
        updateBulkDeleteButton();

        // Reload machines
        await loadMachines();

        // Hide all checkboxes after machines are reloaded
        setTimeout(() => {
            const checkboxes = document.querySelectorAll('.machine-select-checkbox');
            checkboxes.forEach(cb => {
                cb.classList.remove('show');
                cb.checked = false;
            });
        }, 100);

    } catch (error) {
        showToast(error.message, 'error');
    }
});

// Deactivate selected machines
document.getElementById('deactivateSelectedBtn').addEventListener('click', async () => {
    if (selectedMachines.length === 0) return;

    try {
        const response = await fetch('/api/machines/bulk-toggle', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ machineIds: selectedMachines, isActive: false }),
        });

        const data = await response.json();

        if (!response.ok) throw new Error(data.message);

        showToast(`Deactivated ${selectedMachines.length} machine(s) successfully`, 'success', 'pause');

        // Reset selection state
        selectedMachines = [];
        selectionMode = false;

        // Reset button states
        const selectBtn = document.getElementById('selectToDeleteBtn');
        selectBtn.innerHTML = svgIcon('check-square') + 'Select to Delete';
        selectBtn.classList.remove('btn-error');
        selectBtn.classList.add('btn-secondary');

        // Hide action buttons
        updateBulkDeleteButton();

        // Reload machines
        await loadMachines();

        // Hide all checkboxes after machines are reloaded
        setTimeout(() => {
            const checkboxes = document.querySelectorAll('.machine-select-checkbox');
            checkboxes.forEach(cb => {
                cb.classList.remove('show');
                cb.checked = false;
            });
        }, 100);

    } catch (error) {
        showToast(error.message, 'error');
    }
});


// Helper function to show toast (from api.js)
function showToast(message, type = 'info', iconName) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        display: flex;
        align-items: center;
        padding: 1rem 1.5rem;
        background: ${type === 'success' ? 'var(--success)' : type === 'error' ? 'var(--error)' : 'var(--primary)'};
        color: white;
        border-radius: var(--radius-md);
        box-shadow: var(--shadow);
        z-index: 10000;
        animation: slideInRight 0.3s ease;
    `;

    // iconName always comes from our own fixed ICONS map (never user input), so
    // it's safe to inject as HTML; the message itself stays a plain text node.
    if (iconName) {
        const iconSpan = document.createElement('span');
        iconSpan.style.cssText = 'display:inline-flex;margin-right:0.6em;flex-shrink:0;';
        iconSpan.innerHTML = svgIcon(iconName);
        toast.appendChild(iconSpan);
    }
    toast.appendChild(document.createTextNode(message));

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Custom Confirm Modal Helper
function showConfirmModal(message) {
    return new Promise((resolve) => {
        const modal = document.getElementById('deleteConfirmModal');
        const messageEl = document.getElementById('deleteConfirmMessage');
        const confirmBtn = document.getElementById('confirmDeleteBtn');
        const cancelBtn = document.getElementById('cancelDeleteBtn');

        // Set message
        messageEl.textContent = message;

        // Show modal
        modal.classList.remove('hidden');

        // Handle confirm
        const handleConfirm = () => {
            modal.classList.add('hidden');
            cleanup();
            resolve(true);
        };

        // Handle cancel
        const handleCancel = () => {
            modal.classList.add('hidden');
            cleanup();
            resolve(false);
        };

        // Cleanup listeners
        const cleanup = () => {
            confirmBtn.removeEventListener('click', handleConfirm);
            cancelBtn.removeEventListener('click', handleCancel);
        };

        // Add listeners
        confirmBtn.addEventListener('click', handleConfirm);
        cancelBtn.addEventListener('click', handleCancel);
    });
}

// ===== IndiaMART Connector =====

let indiamartStatus = null;
let indiamartLeads = [];
let indiamartPollInterval = null;

async function loadIndiamartStatus() {
    try {
        const res = await apiCall('/indiamart/status');
        indiamartStatus = res.data;
        renderIndiamartStatus();
    } catch (error) {
        console.error('Error loading IndiaMART status:', error);
    }
}

function renderIndiamartStatus() {
    const badge = document.getElementById('imStatusBadge');
    const companyEl = document.getElementById('imCompanyName');
    const details = document.getElementById('imStatusDetails');
    const hint = document.getElementById('imHint');
    const connectBtn = document.getElementById('imConnectBtn');
    const disconnectBtn = document.getElementById('imDisconnectBtn');
    const scrapeBtn = document.getElementById('imScrapeBtn');
    const startAutoBtn = document.getElementById('startGenerationBtn');
    const stopAutoBtn = document.getElementById('stopGenerationBtn');
    const statusEl = document.getElementById('generationStatus');
    const statusIcon = document.getElementById('statusIcon');
    const statCredit = document.getElementById('statCreditBalance');

    if (!indiamartStatus || !indiamartStatus.connected) {
        badge.textContent = indiamartStatus && indiamartStatus.status === 'expired' ? 'Session Expired' : 'Not Connected';
        badge.className = `badge ${indiamartStatus && indiamartStatus.status === 'expired' ? 'badge-expired' : 'badge-free'}`;
        companyEl.textContent = '';
        details.classList.add('hidden');
        hint.textContent = indiamartStatus && indiamartStatus.status === 'expired'
            ? 'Your IndiaMART session expired. Reconnect to keep scraping leads.'
            : 'Connect your IndiaMART seller account to start pulling and unlocking buy-leads directly from your dashboard.';
        connectBtn.classList.remove('hidden');
        disconnectBtn.classList.add('hidden');
        scrapeBtn.classList.add('hidden');
        startAutoBtn.classList.add('hidden');
        stopAutoBtn.classList.add('hidden');
        statusEl.textContent = 'Stopped';
        statusIcon.innerHTML = svgIcon('pause');
        statCredit.textContent = '-';
        return;
    }

    badge.textContent = 'Connected';
    badge.className = 'badge badge-connected';
    companyEl.textContent = indiamartStatus.companyName ? `· ${indiamartStatus.companyName}` : '';
    details.classList.remove('hidden');
    document.getElementById('imGlusrid').textContent = indiamartStatus.glusrid || '-';
    document.getElementById('imCreditBalance').textContent = indiamartStatus.creditBalance != null ? indiamartStatus.creditBalance : 'Scrape to check';
    document.getElementById('imPurchaseBalance').textContent = indiamartStatus.blPurchaseCountBalance != null ? indiamartStatus.blPurchaseCountBalance : 'Scrape to check';
    document.getElementById('imLastScraped').textContent = indiamartStatus.lastScrapedAt ? new Date(indiamartStatus.lastScrapedAt).toLocaleString() : 'Never';
    hint.textContent = 'Click "Scrape Leads" to pull recent buy-leads and unlock new buyer contacts.';
    connectBtn.classList.add('hidden');
    disconnectBtn.classList.remove('hidden');
    scrapeBtn.classList.remove('hidden');

    statCredit.textContent = indiamartStatus.creditBalance != null ? indiamartStatus.creditBalance : '-';

    const autoScrapeInfoEl = document.getElementById('imAutoScrapeInfo');
    if (indiamartStatus.autoScrapeEnabled) {
        startAutoBtn.classList.add('hidden');
        stopAutoBtn.classList.remove('hidden');
        statusEl.textContent = 'Running';
        statusIcon.innerHTML = svgIcon('play');
        autoScrapeInfoEl.textContent = `Every ${indiamartStatus.autoScrapeIntervalMinutes}m, up to ${indiamartStatus.autoScrapeUnlockLimit} unlock(s)/run${indiamartStatus.autoScrapeLastRunAt ? ` · last run ${new Date(indiamartStatus.autoScrapeLastRunAt).toLocaleString()}` : ''}`;
    } else {
        startAutoBtn.classList.remove('hidden');
        stopAutoBtn.classList.add('hidden');
        statusEl.textContent = 'Stopped';
        statusIcon.innerHTML = svgIcon('pause');
        autoScrapeInfoEl.textContent = 'Off';
    }
}

async function loadIndiamartLeads() {
    try {
        const res = await apiCall('/indiamart/leads');
        indiamartLeads = res.data || [];
        renderIndiamartLeads();
    } catch (error) {
        console.error('Error loading IndiaMART leads:', error);
    }
}

function renderIndiamartLeads() {
    const tbody = document.getElementById('imLeadsTableBody');
    const wrap = document.getElementById('imLeadsTableWrap');
    const empty = document.getElementById('imNoLeads');

    document.getElementById('totalLeadsCount').textContent = indiamartLeads.filter((l) => l.unlocked).length;

    if (!indiamartLeads.length) {
        wrap.classList.add('hidden');
        empty.classList.remove('hidden');
        return;
    }

    wrap.classList.remove('hidden');
    empty.classList.add('hidden');

    tbody.innerHTML = indiamartLeads.map((lead) => {
        const cityState = [lead.buyerCity, lead.buyerState].filter(Boolean).join(', ');
        const mobile = lead.buyerMobile ? `+${lead.buyerMobileCountry || '91'} ${lead.buyerMobile}` : '-';
        return `
        <tr>
            <td>${escapeHtml(lead.title || '-')}</td>
            <td>${lead.unlocked ? escapeHtml(lead.buyerName || '-') : svgIcon('lock') + 'Locked'}</td>
            <td>${lead.unlocked ? escapeHtml(lead.buyerEmail || '-') : '-'}</td>
            <td>${lead.unlocked ? escapeHtml(mobile) : '-'}</td>
            <td>${escapeHtml(cityState || '-')}</td>
            <td>${lead.unlocked ? escapeHtml(lead.buyerCompany || 'Not provided') : '-'}</td>
            <td>${lead.unlocked ? escapeHtml(lead.memberSince || '-') : '-'}</td>
            <td>${lead.unlocked ? lead.creditsSpent : '-'}</td>
            <td>${new Date(lead.scrapedAt).toLocaleString()}</td>
        </tr>`;
    }).join('');
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
}

function csvEscape(value) {
    const str = value == null ? '' : String(value);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

document.getElementById('imExportLeadsBtn').addEventListener('click', () => {
    if (!indiamartLeads.length) {
        showToast('No IndiaMART leads to export yet', 'info');
        return;
    }

    const headers = ['Product', 'Buyer Name', 'Company', 'Email', 'Mobile', 'City', 'State', 'Country', 'Member Since', 'Order Value', 'Category', 'Credits Spent', 'Unlocked', 'Scraped At'];
    const rows = indiamartLeads.map((lead) => [
        lead.title,
        lead.buyerName,
        lead.buyerCompany || 'Not provided',
        lead.buyerEmail,
        lead.buyerMobile ? `+${lead.buyerMobileCountry || '91'} ${lead.buyerMobile}` : '',
        lead.buyerCity,
        lead.buyerState,
        lead.buyerCountry,
        lead.memberSince,
        lead.approxOrderValue,
        lead.category,
        lead.creditsSpent,
        lead.unlocked ? 'Yes' : 'No',
        new Date(lead.scrapedAt).toLocaleString(),
    ]);

    const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `indiamart-leads-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    showToast('IndiaMART leads exported', 'success');
});

document.getElementById('imConnectBtn').addEventListener('click', async () => {
    try {
        const res = await apiCall('/indiamart/connect-link', { method: 'POST' });
        const { url } = res.data;

        document.getElementById('imConnectLinkInput').value = url;
        document.getElementById('imOpenLinkBtn').href = url;
        document.getElementById('imConnectModal').classList.remove('hidden');

        window.open(url, '_blank');

        if (indiamartPollInterval) clearInterval(indiamartPollInterval);
        indiamartPollInterval = setInterval(async () => {
            await loadIndiamartStatus();
            if (indiamartStatus && indiamartStatus.connected) {
                clearInterval(indiamartPollInterval);
                indiamartPollInterval = null;
                document.getElementById('imConnectModal').classList.add('hidden');
                showToast('IndiaMART connected!', 'success');
            }
        }, 3000);
    } catch (error) {
        showToast(error.message || 'Failed to create connect link', 'error');
    }
});

document.getElementById('imCloseConnectModal').addEventListener('click', () => {
    document.getElementById('imConnectModal').classList.add('hidden');
});

document.getElementById('imCopyLinkBtn').addEventListener('click', () => {
    const input = document.getElementById('imConnectLinkInput');
    input.select();
    navigator.clipboard.writeText(input.value).then(() => showToast('Link copied', 'success')).catch(() => {});
});

document.getElementById('imDisconnectBtn').addEventListener('click', async () => {
    if (!confirm('Disconnect your IndiaMART account? You will need to reconnect to keep scraping leads.')) return;
    try {
        await apiCall('/indiamart/disconnect', { method: 'POST' });
        await loadIndiamartStatus();
        showToast('IndiaMART disconnected', 'info');
    } catch (error) {
        showToast(error.message || 'Failed to disconnect', 'error');
    }
});

document.getElementById('imScrapeBtn').addEventListener('click', async () => {
    const balanceHint = indiamartStatus && indiamartStatus.creditBalance != null ? ` Current credit balance: ${indiamartStatus.creditBalance}.` : '';
    if (!confirm(`This will fetch recent buy-leads and unlock up to 5 new ones, which spends IndiaMART credits.${balanceHint} Continue?`)) return;

    const btn = document.getElementById('imScrapeBtn');
    btn.disabled = true;
    btn.textContent = 'Scraping...';

    try {
        const res = await apiCall('/indiamart/scrape', {
            method: 'POST',
            body: JSON.stringify({ fetchCount: 20, unlockLimit: 5 }),
        });
        showToast(`Fetched ${res.data.totalFetched} leads, ${res.data.matched} matched your machines, unlocked ${res.data.unlocked} new (spent ${res.data.creditsSpent} credits)`, 'success');
        await loadIndiamartStatus();
        await loadIndiamartLeads();
    } catch (error) {
        showToast(error.message || 'Scrape failed', 'error');
        await loadIndiamartStatus();
    } finally {
        btn.disabled = false;
        btn.innerHTML = svgIcon('download') + 'Scrape Leads';
    }
});

// Initialize on load
init();
