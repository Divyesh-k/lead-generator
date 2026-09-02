// Machines page — full port of the machine CRUD/tabs/bulk-select logic that used
// to live in the old monolithic dashboard.js. Endpoints preserved exactly:
//   GET    /api/machines
//   POST   /api/machines                 { name }
//   PUT    /api/machines/:id             { isActive }
//   DELETE /api/machines/:id
//   POST   /api/machines/bulk-delete     { machineIds }
//   POST   /api/machines/bulk-toggle     { machineIds, isActive }
//   DELETE /api/machines/clear-all
//   GET    /api/subscription/status

let machines = [];
let subscriptionStatus = null;
let selectionMode = false;
let selectedMachines = [];
let currentActiveTab = 'active';
let machineSearchQuery = '';

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
}

async function init() {
    try {
        await loadSubscriptionStatus();
        await loadMachines();
    } catch (error) {
        console.error('Error initializing machines page:', error);
        showToast(error.message || 'Failed to load machines', 'error');
    }
}

async function loadSubscriptionStatus() {
    try {
        const res = await apiCall('/subscription/status');
        subscriptionStatus = res.data;

        const upgradePrompt = document.getElementById('upgradePrompt');
        if (subscriptionStatus.isPro) {
            upgradePrompt.classList.add('hidden');
        } else {
            upgradePrompt.classList.remove('hidden');
        }
    } catch (error) {
        console.error('Error loading subscription:', error);
    }
}

async function loadMachines() {
    try {
        const res = await apiCall('/machines');
        machines = res.data || [];
        renderMachines();
    } catch (error) {
        console.error('Error loading machines:', error);
        showToast(error.message || 'Failed to load machines', 'error');
    }
}

function machineCardHtml(machine) {
    return `
        <div class="machine-card${machine.isActive ? '' : ' inactive'}" data-id="${machine._id}">
            <div class="machine-header">
                <div style="display: flex; align-items: center; gap: 0.5rem; min-width: 0;">
                    <input type="checkbox" class="machine-select-checkbox${selectionMode ? ' show' : ''}" data-id="${machine._id}"
                           onchange="toggleMachineSelection('${machine._id}', this.checked)">
                    <div class="machine-name-tip" data-tooltip="${escapeHtml(machine.name)}">
                        <div class="machine-name">${escapeHtml(machine.name)}</div>
                    </div>
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

function renderMachines() {
    const activeMachinesContainer = document.getElementById('activeMachinesContainer');
    const inactiveMachinesContainer = document.getElementById('inactiveMachinesContainer');
    const noMachines = document.getElementById('noMachines');
    const noActiveMachines = document.getElementById('noActiveMachines');
    const noInactiveMachines = document.getElementById('noInactiveMachines');

    const activeMachines = machines.filter((m) => m.isActive);
    const inactiveMachines = machines.filter((m) => !m.isActive);

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
    const filteredActive = query ? activeMachines.filter((m) => m.name.toLowerCase().includes(query)) : activeMachines;
    const filteredInactive = query ? inactiveMachines.filter((m) => m.name.toLowerCase().includes(query)) : inactiveMachines;

    renderMachineTab(activeMachinesContainer, noActiveMachines, filteredActive, activeMachines.length, query, 'No active machines. Activate some machines to see them here!');
    renderMachineTab(inactiveMachinesContainer, noInactiveMachines, filteredInactive, inactiveMachines.length, query, 'No inactive machines. All your machines are active!');
}

async function toggleMachine(machineId, isActive) {
    try {
        await apiCall(`/machines/${machineId}`, {
            method: 'PUT',
            body: JSON.stringify({ isActive }),
        });
        showToast(`Machine ${isActive ? 'activated' : 'deactivated'}`, 'success');
        await loadMachines();
    } catch (error) {
        showToast(error.message, 'error');
        await loadMachines();
    }
}

async function deleteMachine(machineId) {
    const confirmed = await showConfirmModal('Are you sure you want to delete this machine?');
    if (!confirmed) return;

    try {
        await apiCall(`/machines/${machineId}`, { method: 'DELETE' });
        showToast('Machine deleted successfully', 'success');
        await loadMachines();
        await loadSubscriptionStatus();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

// ===== Confirm modal helper (Promise-based, ported verbatim) =====
function showConfirmModal(message) {
    return new Promise((resolve) => {
        const modal = document.getElementById('deleteConfirmModal');
        const messageEl = document.getElementById('deleteConfirmMessage');
        const confirmBtn = document.getElementById('confirmDeleteBtn');
        const cancelBtn = document.getElementById('cancelDeleteBtn');

        messageEl.textContent = message;
        modal.classList.remove('hidden');

        const handleConfirm = () => {
            modal.classList.add('hidden');
            cleanup();
            resolve(true);
        };

        const handleCancel = () => {
            modal.classList.add('hidden');
            cleanup();
            resolve(false);
        };

        const cleanup = () => {
            confirmBtn.removeEventListener('click', handleConfirm);
            cancelBtn.removeEventListener('click', handleCancel);
        };

        confirmBtn.addEventListener('click', handleConfirm);
        cancelBtn.addEventListener('click', handleCancel);
    });
}

// ===== Tab switching =====
document.querySelectorAll('.pill-tabs .pill-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.pill-tabs .pill-tab').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');

        const tabType = btn.getAttribute('data-tab');
        currentActiveTab = tabType;

        const activeTab = document.getElementById('activeTab');
        const inactiveTab = document.getElementById('inactiveTab');

        if (tabType === 'active') {
            activeTab.classList.remove('hidden');
            inactiveTab.classList.add('hidden');
        } else {
            activeTab.classList.add('hidden');
            inactiveTab.classList.remove('hidden');
        }

        updateBulkActionButtons();
    });
});

// ===== Search =====
document.getElementById('machineSearchInput').addEventListener('input', (e) => {
    machineSearchQuery = e.target.value;
    renderMachines();
});

// ===== Add machine =====
document.getElementById('addMachineBtn').addEventListener('click', () => {
    if (subscriptionStatus && !subscriptionStatus.canAddMachines) {
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
        await apiCall('/machines', {
            method: 'POST',
            body: JSON.stringify({ name }),
        });

        showToast('Machine added successfully', 'success');
        document.getElementById('addMachineModal').classList.add('hidden');
        document.getElementById('addMachineForm').reset();
        await loadMachines();
        await loadSubscriptionStatus();
    } catch (error) {
        showToast(error.message, 'error');
    }
});

// ===== Selection mode =====
document.getElementById('selectToDeleteBtn').addEventListener('click', () => {
    selectionMode = !selectionMode;
    const selectBtn = document.getElementById('selectToDeleteBtn');

    if (selectionMode) {
        selectBtn.innerHTML = svgIcon('x') + 'Cancel Selection';
        selectBtn.classList.remove('btn-secondary');
        selectBtn.classList.add('btn-error');
    } else {
        selectedMachines = [];
        selectBtn.innerHTML = svgIcon('check-square') + 'Select to Delete';
        selectBtn.classList.remove('btn-error');
        selectBtn.classList.add('btn-secondary');
        updateBulkActionButtons();
    }

    // Re-render so checkboxes pick up the new selection-mode "show" state.
    renderMachines();
});

function toggleMachineSelection(machineId, isSelected) {
    if (isSelected) {
        if (!selectedMachines.includes(machineId)) {
            selectedMachines.push(machineId);
        }
    } else {
        selectedMachines = selectedMachines.filter((id) => id !== machineId);
    }
    updateBulkActionButtons();
}

function updateBulkActionButtons() {
    const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
    const activateSelectedBtn = document.getElementById('activateSelectedBtn');
    const deactivateSelectedBtn = document.getElementById('deactivateSelectedBtn');

    if (selectedMachines.length > 0) {
        deleteSelectedBtn.classList.remove('hidden');
        deleteSelectedBtn.innerHTML = svgIcon('trash') + `Delete Selected (${selectedMachines.length})`;

        if (currentActiveTab === 'active') {
            activateSelectedBtn.classList.add('hidden');
            deactivateSelectedBtn.classList.remove('hidden');
            deactivateSelectedBtn.innerHTML = svgIcon('pause') + `Deactivate Selected (${selectedMachines.length})`;
        } else {
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

function resetSelectionState() {
    selectedMachines = [];
    selectionMode = false;

    const selectBtn = document.getElementById('selectToDeleteBtn');
    selectBtn.innerHTML = svgIcon('check-square') + 'Select to Delete';
    selectBtn.classList.remove('btn-error');
    selectBtn.classList.add('btn-secondary');

    updateBulkActionButtons();
}

document.getElementById('deleteSelectedBtn').addEventListener('click', async () => {
    if (selectedMachines.length === 0) return;

    const confirmed = await showConfirmModal(`Are you sure you want to delete ${selectedMachines.length} selected machine(s)?`);
    if (!confirmed) return;

    try {
        const res = await apiCall('/machines/bulk-delete', {
            method: 'POST',
            body: JSON.stringify({ machineIds: selectedMachines }),
        });

        showToast(res.message, 'success');
        resetSelectionState();
        await loadMachines();
        await loadSubscriptionStatus();
    } catch (error) {
        showToast(error.message, 'error');
    }
});

document.getElementById('clearAllBtn').addEventListener('click', async () => {
    const count = machines.length;
    if (count === 0) {
        showToast('No machines to delete', 'error');
        return;
    }

    const confirmed = await showConfirmModal(`Are you sure you want to delete ALL ${count} machine(s)? This cannot be undone!`);
    if (!confirmed) return;

    try {
        const res = await apiCall('/machines/clear-all', { method: 'DELETE' });
        showToast(res.message, 'success');
        resetSelectionState();
        await loadMachines();
        await loadSubscriptionStatus();
    } catch (error) {
        showToast(error.message, 'error');
    }
});

document.getElementById('activateSelectedBtn').addEventListener('click', async () => {
    if (selectedMachines.length === 0) return;

    try {
        await apiCall('/machines/bulk-toggle', {
            method: 'POST',
            body: JSON.stringify({ machineIds: selectedMachines, isActive: true }),
        });

        showToast(`Activated ${selectedMachines.length} machine(s) successfully`, 'success');
        resetSelectionState();
        await loadMachines();
    } catch (error) {
        showToast(error.message, 'error');
    }
});

document.getElementById('deactivateSelectedBtn').addEventListener('click', async () => {
    if (selectedMachines.length === 0) return;

    try {
        await apiCall('/machines/bulk-toggle', {
            method: 'POST',
            body: JSON.stringify({ machineIds: selectedMachines, isActive: false }),
        });

        showToast(`Deactivated ${selectedMachines.length} machine(s) successfully`, 'success');
        resetSelectionState();
        await loadMachines();
    } catch (error) {
        showToast(error.message, 'error');
    }
});

init();
