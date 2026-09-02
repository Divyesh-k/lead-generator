// Payments page — real two-tier pricing (Free / Pro, ₹50 flat) and the upgrade
// flow ported from the old dashboard.js `upgradeBtn` handler (Razorpay + demo-mode
// paths), using the shared apiCall() helper in place of the original's raw fetch calls
// (same endpoints/payloads: POST /payment/create-order, POST /payment/verify).

const freeCard = document.getElementById('freePricingCard');
const proCard = document.getElementById('proPricingCard');
const paymentModal = document.getElementById('paymentModal');

let currentUser = null;
let currentSubscription = null;

function renderPricing() {
    const isPro = !!(currentSubscription && currentSubscription.isPro);
    const freeMachineLimit = (currentSubscription && !isPro && currentSubscription.machineLimit) || 5;

    freeCard.className = `pricing-card${isPro ? '' : ' current'}`;
    freeCard.innerHTML = `
        ${!isPro ? `<span class="pricing-current-badge">${svgIcon('check-circle')}Current Plan</span>` : ''}
        <div class="pricing-name">Free</div>
        <div class="pricing-price">₹0<span>/month</span></div>
        <ul class="pricing-features">
            <li>${svgIcon('check')}Up to ${freeMachineLimit} machines</li>
            <li>${svgIcon('check')}IndiaMART lead scraping</li>
            <li>${svgIcon('check')}CSV bulk upload</li>
        </ul>
    `;

    proCard.className = `pricing-card popular${isPro ? ' current' : ''}`;
    proCard.innerHTML = `
        <div class="pricing-badge">Most Popular</div>
        ${isPro ? `<span class="pricing-current-badge">${svgIcon('check-circle')}Current Plan</span>` : ''}
        <div class="pricing-name">Pro</div>
        <div class="pricing-price">₹50<span>/month</span></div>
        <ul class="pricing-features">
            <li>${svgIcon('check')}Unlimited machines</li>
            <li>${svgIcon('check')}IndiaMART lead scraping</li>
            <li>${svgIcon('check')}CSV bulk upload</li>
            <li>${svgIcon('check')}Auto-scrape scheduling</li>
        </ul>
        ${isPro
            ? `<button class="btn btn-secondary" type="button" style="width: 100%;" disabled>${svgIcon('check-circle')}Current Plan</button>
               ${currentSubscription.expiry ? `<p class="pricing-note">Renews / expires ${new Date(currentSubscription.expiry).toLocaleDateString()}</p>` : ''}`
            : `<button class="btn btn-primary" id="upgradeBtn" type="button" style="width: 100%;">${svgIcon('zap')}Upgrade to Pro</button>`
        }
    `;

    if (!isPro) {
        document.getElementById('upgradeBtn').addEventListener('click', handleUpgrade);
    }
}

async function handleUpgrade() {
    try {
        paymentModal.classList.remove('hidden');

        const createRes = await apiCall('/payment/create-order', { method: 'POST' });
        const data = createRes.data;

        paymentModal.classList.add('hidden');

        // No real payment provider configured (local/Docker testing) — simulate the
        // upgrade instead of opening the real Razorpay widget (which needs a real key).
        if (data.demoMode) {
            const confirmed = confirm('No payment provider is configured in this environment (demo/test mode). Simulate a successful ₹50 payment and upgrade to Pro?');
            if (!confirmed) {
                showToast('Payment cancelled', 'error');
                return;
            }

            paymentModal.classList.remove('hidden');
            try {
                await apiCall('/payment/verify', {
                    method: 'POST',
                    body: JSON.stringify({
                        razorpay_order_id: data.orderId,
                        razorpay_payment_id: `demo_pay_${Date.now()}`,
                        razorpay_signature: 'demo',
                    }),
                });
                paymentModal.classList.add('hidden');
                showToast('Demo upgrade to Pro complete!', 'success');
                setTimeout(() => window.location.reload(), 1200);
            } catch (error) {
                paymentModal.classList.add('hidden');
                showToast('Demo upgrade failed: ' + error.message, 'error');
            }
            return;
        }

        // Configure Razorpay options
        const options = {
            key: data.keyId,
            amount: data.amount,
            currency: data.currency,
            name: 'NexLead Pro',
            description: 'Pro Subscription - Monthly',
            order_id: data.orderId,
            handler: async function (response) {
                paymentModal.classList.remove('hidden');
                try {
                    await apiCall('/payment/verify', {
                        method: 'POST',
                        body: JSON.stringify({
                            razorpay_order_id: response.razorpay_order_id,
                            razorpay_payment_id: response.razorpay_payment_id,
                            razorpay_signature: response.razorpay_signature,
                        }),
                    });
                    paymentModal.classList.add('hidden');
                    showToast('Successfully upgraded to Pro!', 'success');
                    setTimeout(() => window.location.reload(), 1200);
                } catch (error) {
                    paymentModal.classList.add('hidden');
                    showToast('Payment verification failed: ' + error.message, 'error');
                }
            },
            prefill: {
                name: currentUser?.name || '',
                email: currentUser?.email || '',
            },
            theme: {
                color: '#6366f1',
            },
            modal: {
                ondismiss: function () {
                    paymentModal.classList.add('hidden');
                    showToast('Payment cancelled', 'error');
                },
            },
        };

        const razorpay = new Razorpay(options);
        razorpay.on('payment.failed', function (response) {
            paymentModal.classList.add('hidden');
            showToast('Payment failed: ' + response.error.description, 'error');
        });
        razorpay.open();
    } catch (error) {
        paymentModal.classList.add('hidden');
        showToast(error.message, 'error');
    }
}

document.addEventListener('appshell:ready', (e) => {
    currentUser = e.detail.user;
    currentSubscription = e.detail.subscription;
    renderPricing();
});
