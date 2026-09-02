// Search Machines page — client-side name-only filter over GET /api/machines
// (the Machine model only has name/isActive/createdAt, so no keyword/location
// filters are offered here). Toggling reuses PUT /api/machines/:id { isActive }.

let machines = [];
let searchQuery = '';

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
}

async function init() {
    try {
        const res = await apiCall('/machines');
        machines = res.data || [];
        render();
    } catch (error) {
        console.error('Error loading machines:', error);
        showToast(error.message || 'Failed to load machines', 'error');
    }
}

function render() {
    const wrap = document.getElementById('resultsWrap');
    const countEl = document.getElementById('resultsCount');

    if (machines.length === 0) {
        countEl.textContent = '';
        wrap.innerHTML = `
            <div class="empty-state">
                <p>No machines yet. Add your first machine to get started.</p>
                <a href="/machines.html" class="btn btn-primary btn-sm">Go to Machines</a>
            </div>
        `;
        return;
    }

    const query = searchQuery.trim().toLowerCase();
    const filtered = query ? machines.filter((m) => m.name.toLowerCase().includes(query)) : machines;

    countEl.textContent = query ? `${filtered.length} of ${machines.length} machines` : `${machines.length} machine(s)`;

    if (filtered.length === 0) {
        wrap.innerHTML = `
            <div class="empty-state">
                <p>No machines match "${escapeHtml(searchQuery)}".</p>
            </div>
        `;
        return;
    }

    const rows = filtered.map((m) => `
        <tr data-id="${m._id}">
            <td>${escapeHtml(m.name)}</td>
            <td><span class="status-pill ${m.isActive ? 'status-active' : 'status-stopped'}">${m.isActive ? 'Active' : 'Inactive'}</span></td>
            <td>${m.createdAt ? new Date(m.createdAt).toLocaleDateString() : '-'}</td>
            <td>
                <label class="toggle-switch">
                    <input type="checkbox" ${m.isActive ? 'checked' : ''} onchange="toggleMachine('${m._id}', this.checked)">
                    <span class="toggle-slider"></span>
                </label>
            </td>
        </tr>
    `).join('');

    wrap.innerHTML = `
        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Status</th>
                        <th>Added</th>
                        <th>Active</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    `;
}

async function toggleMachine(machineId, isActive) {
    try {
        await apiCall(`/machines/${machineId}`, {
            method: 'PUT',
            body: JSON.stringify({ isActive }),
        });
        showToast(`Machine ${isActive ? 'activated' : 'deactivated'}`, 'success');

        const machine = machines.find((m) => m._id === machineId);
        if (machine) machine.isActive = isActive;
        render();
    } catch (error) {
        showToast(error.message, 'error');
        render(); // reset the toggle to the last known real state
    }
}

document.getElementById('searchInput').addEventListener('input', (e) => {
    searchQuery = e.target.value;
    render();
});

init();
