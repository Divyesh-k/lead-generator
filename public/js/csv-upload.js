// CSV Upload page — drag & drop wrapper around POST /api/machines/bulk.
// Response shape (server/routes/machines.js POST /bulk):
//   success: { success: true, count, data, message?, skipped? }
//   error:   { success: false, message, limit?, current?, attempting?, upgrade? }

(function () {
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('csvFileInput');

    const stateIdle = document.getElementById('stateIdle');
    const stateUploading = document.getElementById('stateUploading');
    const stateSuccess = document.getElementById('stateSuccess');
    const stateError = document.getElementById('stateError');

    const uploadProgressFill = document.getElementById('uploadProgressFill');
    const successTitle = document.getElementById('successTitle');
    const successMessage = document.getElementById('successMessage');
    const errorTitle = document.getElementById('errorTitle');
    const errorMessage = document.getElementById('errorMessage');
    const upgradeNote = document.getElementById('upgradeNote');

    const uploadAnotherBtn = document.getElementById('uploadAnotherBtn');
    const tryAgainBtn = document.getElementById('tryAgainBtn');

    document.getElementById('idleIconWrap').innerHTML = svgIcon('upload-cloud');
    document.getElementById('successIconWrap').innerHTML = svgIcon('check-circle');
    document.getElementById('errorIconWrap').innerHTML = svgIcon('alert-triangle');
    document.getElementById('tipHeader').innerHTML = svgIcon('check') + 'A "name" (or "machine") header column works, or just list one name per line.';
    document.getElementById('tipComment').innerHTML = svgIcon('check') + 'Lines starting with "#" are treated as comments and skipped.';
    document.getElementById('tipDuplicate').innerHTML = svgIcon('check') + 'Machine names that already exist in your account are skipped automatically.';

    let currentState = 'idle';
    let progressTimer = null;

    function setState(state) {
        currentState = state;
        stateIdle.classList.toggle('hidden', state !== 'idle');
        stateUploading.classList.toggle('hidden', state !== 'uploading');
        stateSuccess.classList.toggle('hidden', state !== 'success');
        stateError.classList.toggle('hidden', state !== 'error');
    }

    function resetToIdle() {
        fileInput.value = '';
        uploadProgressFill.style.width = '0%';
        upgradeNote.classList.add('hidden');
        setState('idle');
    }

    dropzone.addEventListener('click', () => {
        if (currentState === 'idle') fileInput.click();
    });

    dropzone.addEventListener('dragover', (e) => {
        if (currentState !== 'idle') return;
        e.preventDefault();
        dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('dragover');
    });

    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        if (currentState !== 'idle') return;
        const file = e.dataTransfer.files && e.dataTransfer.files[0];
        if (file) uploadFile(file);
    });

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) uploadFile(file);
    });

    uploadAnotherBtn.addEventListener('click', resetToIdle);
    tryAgainBtn.addEventListener('click', resetToIdle);

    async function uploadFile(file) {
        setState('uploading');
        uploadProgressFill.style.width = '0%';

        // No byte-progress event available from apiUpload — animate an
        // indeterminate-style fill toward ~90% while the request is in flight.
        requestAnimationFrame(() => {
            uploadProgressFill.style.width = '90%';
        });

        const formData = new FormData();
        formData.append('file', file);

        // Use a raw fetch (not apiUpload) so we can read the full error
        // payload — apiUpload only preserves `message` on failure, but the
        // free-tier-limit error also carries limit/current/attempting/upgrade
        // fields we need for the "upgrade" affordance below.
        try {
            const token = localStorage.getItem('token');
            const response = await fetch('/api/machines/bulk', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                },
                body: formData,
            });
            const data = await response.json();

            if (!response.ok) {
                const err = new Error(data.message || 'Upload failed');
                err.upgrade = data.upgrade;
                throw err;
            }

            uploadProgressFill.style.width = '100%';

            successTitle.textContent = `${data.count} machine${data.count === 1 ? '' : 's'} imported successfully`;
            if (data.message) {
                successMessage.textContent = data.message;
            } else if (data.skipped) {
                successMessage.textContent = `Skipped ${data.skipped} duplicate(s).`;
            } else {
                successMessage.textContent = '';
            }

            setTimeout(() => setState('success'), 150);
            showToast(`${data.count} machines imported successfully`, 'success');
        } catch (error) {
            errorTitle.textContent = 'Upload failed';
            errorMessage.textContent = error.message || 'Something went wrong while uploading your CSV.';
            upgradeNote.classList.toggle('hidden', !error.upgrade);
            setState('error');
            showToast(error.message, 'error');
        }
    }
})();
