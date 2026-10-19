// account.js - Customer Account & Developer Portal

let userToken = localStorage.getItem('norra_user_token') || '';
let currentUser = null;
let currentKey = null;
let isRegisterMode = false;

// Currency conversion rate estimates relative to 1 USD
const CURRENCY_RATES = {
    USD: { symbol: '$', rate: 1 },
    NGN: { symbol: '₦', rate: 1600 },
    GHS: { symbol: 'GH₵', rate: 15.5 },
    KES: { symbol: 'KSh', rate: 130 },
    ZAR: { symbol: 'R', rate: 18.2 },
    EUR: { symbol: '€', rate: 0.92 },
    GBP: { symbol: '£', rate: 0.77 }
};

function detectUserCurrency() {
    const locale = navigator.language || 'en-US';
    if (locale.includes('NG')) return 'NGN';
    if (locale.includes('GH')) return 'GHS';
    if (locale.includes('KE')) return 'KES';
    if (locale.includes('ZA')) return 'ZAR';
    if (locale.includes('GB')) return 'GBP';
    if (locale.includes('DE') || locale.includes('FR') || locale.includes('ES') || locale.includes('IT')) return 'EUR';
    return 'USD';
}

function toggleAuthMode() {
    isRegisterMode = !isRegisterMode;
    const title = document.getElementById('auth-title');
    const nameGroup = document.getElementById('name-group');
    const submitBtn = document.getElementById('auth-submit-btn');
    const switchPrompt = document.getElementById('auth-switch-prompt');
    const switchLink = document.getElementById('auth-switch-link');
    const errorEl = document.getElementById('auth-error');

    errorEl.style.display = 'none';

    if (isRegisterMode) {
        title.textContent = 'Create Developer Account';
        nameGroup.style.display = 'block';
        submitBtn.textContent = 'Register & Get API Key';
        switchPrompt.textContent = 'Already have an account?';
        switchLink.textContent = 'Sign In';
    } else {
        title.textContent = 'Sign In to Developer Portal';
        nameGroup.style.display = 'none';
        submitBtn.textContent = 'Sign In';
        switchPrompt.textContent = "Don't have an account?";
        switchLink.textContent = 'Create Free Account';
    }
}

async function handleAuthSubmit(event) {
    event.preventDefault();
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const fullName = document.getElementById('auth-name').value.trim();
    const errorEl = document.getElementById('auth-error');

    errorEl.style.display = 'none';
    const endpoint = isRegisterMode ? '/api/account/register' : '/api/account/login';
    const payload = isRegisterMode ? { email, password, fullName } : { email, password };

    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (res.ok && data.token) {
            userToken = data.token;
            localStorage.setItem('norra_user_token', userToken);
            loadPortalData();
        } else {
            errorEl.textContent = data.error || 'Authentication failed.';
            errorEl.style.display = 'block';
        }
    } catch (err) {
        errorEl.textContent = 'Connection error. Please try again.';
        errorEl.style.display = 'block';
    }
}

function handleUserLogout() {
    userToken = '';
    localStorage.removeItem('norra_user_token');
    document.getElementById('portal-view').style.display = 'none';
    document.getElementById('auth-view').style.display = 'block';
}

function switchPortalTab(tabName) {
    document.querySelectorAll('.portal-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.portal-tab-content').forEach(el => el.style.display = 'none');

    const targetTab = document.getElementById(`portal-tab-${tabName}`);
    if (targetTab) targetTab.style.display = 'block';

    const activeBtn = Array.from(document.querySelectorAll('.portal-tab-btn'))
        .find(b => b.getAttribute('onclick')?.includes(tabName));
    if (activeBtn) activeBtn.classList.add('active');

    if (tabName === 'upgrade') loadUpgradePlans();
    if (tabName === 'whitelabel') loadWhitelabelSnippets();
    if (tabName === 'invoices') loadInvoices();
}

async function loadPortalData() {
    try {
        const meRes = await fetch('/api/account/me', {
            headers: { Authorization: `Bearer ${userToken}` }
        });
        if (!meRes.ok) return handleUserLogout();

        const meData = await meRes.json();
        currentUser = meData.user;

        document.getElementById('auth-view').style.display = 'none';
        document.getElementById('portal-view').style.display = 'block';
        document.getElementById('badge-user-plan').textContent = `${currentUser.plan} PLAN`;

        await loadKeys();
    } catch (err) {
        handleUserLogout();
    }
}

async function loadKeys() {
    try {
        const res = await fetch('/api/account/keys', {
            headers: { Authorization: `Bearer ${userToken}` }
        });
        const data = await res.json();
        if (data.keys && data.keys.length) {
            currentKey = data.keys[0];
            document.getElementById('display-api-key').textContent = currentKey.key;
            document.getElementById('stat-rate-limit').textContent = `${currentKey.rateLimitPerMinute} req/min`;
            document.getElementById('stat-ad-free').textContent = currentKey.isAdFree ? '100% Ad-Free' : 'Ad-Supported';
            document.getElementById('stat-total-calls').textContent = currentKey.totalRequests || 0;
        }
    } catch (err) {
        console.error('Failed to load keys:', err);
    }
}

function copyApiKey() {
    if (!currentKey) return;
    navigator.clipboard.writeText(currentKey.key).then(() => {
        alert('API Key copied to clipboard!');
    });
}

async function regenerateApiKey() {
    if (!currentKey) return;
    if (!confirm('Are you sure you want to regenerate your API key? Any applications currently using the old key will stop working.')) return;

    try {
        const res = await fetch('/api/account/keys/regenerate', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${userToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ keyId: currentKey._id })
        });
        const data = await res.json();
        if (res.ok && data.key) {
            alert('API key regenerated successfully!');
            loadKeys();
        } else {
            alert(data.error || 'Failed to regenerate key.');
        }
    } catch (err) {
        alert('Network error while regenerating key.');
    }
}

async function loadUpgradePlans() {
    try {
        const res = await fetch('/api/plans');
        const data = await res.json();
        const grid = document.getElementById('upgrade-plans-grid');
        const userCurrency = detectUserCurrency();
        const curr = CURRENCY_RATES[userCurrency] || CURRENCY_RATES.USD;

        grid.innerHTML = (data.plans || []).filter(p => p.id !== 'free').map(plan => {
            const localAmount = (plan.priceUsd * curr.rate).toLocaleString(undefined, { maximumFractionDigits: 0 });
            const localText = userCurrency !== 'USD' ? `≈ ${curr.symbol}${localAmount} ${userCurrency}/mo` : '';

            return `
                <div class="plan-card">
                    <div>
                        <span style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: var(--color-primary); letter-spacing: 0.5px;">${plan.name}</span>
                        <div class="plan-price">$${plan.priceUsd} <small>/ month</small></div>
                        <div class="local-price-estimate">${localText}</div>
                        <ul class="plan-features">
                            ${plan.features.map(f => `<li>${f}</li>`).join('')}
                        </ul>
                    </div>
                    <div>
                        <button class="btn-primary" style="width: 100%; margin-bottom: 8px;" onclick="checkoutWithFlutterwave('${plan.id}')">Pay with Flutterwave (Card/Bank)</button>
                        <button class="btn-secondary" style="width: 100%;" onclick="checkoutWithPayPal('${plan.id}')">Pay with PayPal</button>
                    </div>
                </div>
            `;
        }).join('');
    } catch (err) {
        console.error('Failed to load plans:', err);
    }
}

async function checkoutWithFlutterwave(planId) {
    if (!currentUser) return;
    try {
        const res = await fetch('/api/payments/flutterwave/initialize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                plan: planId,
                email: currentUser.email,
                name: currentUser.fullName || currentUser.email,
                currency: 'USD'
            })
        });
        const data = await res.json();
        if (res.ok && data.paymentUrl) {
            window.location.href = data.paymentUrl;
        } else {
            alert(data.error || 'Failed to start Flutterwave checkout.');
        }
    } catch (err) {
        alert('Network error initializing Flutterwave.');
    }
}

async function checkoutWithPayPal(planId) {
    if (!currentUser) return;
    try {
        const res = await fetch('/api/payments/paypal/create-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                plan: planId,
                email: currentUser.email,
                name: currentUser.fullName || currentUser.email
            })
        });
        const data = await res.json();
        if (res.ok && data.orderId) {
            // Capture order (or mock capture)
            const captureRes = await fetch('/api/payments/paypal/capture-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderId: data.orderId, tx_ref: data.tx_ref })
            });
            const capData = await captureRes.json();
            if (captureRes.ok && capData.status === 'success') {
                alert(`PayPal payment complete! Your ${planId.toUpperCase()} subscription is active.`);
                loadPortalData();
            } else {
                alert(capData.error || 'PayPal payment capture failed.');
            }
        }
    } catch (err) {
        alert('Failed to initiate PayPal checkout.');
    }
}

async function loadWhitelabelSnippets() {
    try {
        const res = await fetch('/api/account/whitelabel-snippet', {
            headers: { Authorization: `Bearer ${userToken}` }
        });
        const data = await res.json();
        if (data.iframeSnippet) {
            document.getElementById('iframe-snippet-code').textContent = data.iframeSnippet;
            document.getElementById('js-snippet-code').textContent = data.jsSnippet;
        }
    } catch (err) {
        console.error('Failed to load snippets:', err);
    }
}

function copySnippet(elementId) {
    const text = document.getElementById(elementId).textContent;
    navigator.clipboard.writeText(text).then(() => {
        alert('Embed code copied to clipboard!');
    });
}

async function loadInvoices() {
    try {
        const res = await fetch('/api/account/invoices', {
            headers: { Authorization: `Bearer ${userToken}` }
        });
        const data = await res.json();
        const body = document.getElementById('invoices-body');
        if (data.invoices && data.invoices.length) {
            body.innerHTML = data.invoices.map(inv => `
                <tr style="border-bottom: 1px solid var(--border-subtle);">
                    <td style="padding: 10px;">${new Date(inv.createdAt).toLocaleDateString()}</td>
                    <td style="padding: 10px;"><code>${inv.tx_ref}</code></td>
                    <td style="padding: 10px; text-transform: capitalize;">${inv.plan}</td>
                    <td style="padding: 10px;">$${inv.amount} ${inv.currency}</td>
                    <td style="padding: 10px; text-transform: capitalize;">${inv.gateway}</td>
                    <td style="padding: 10px; color: ${inv.status === 'successful' ? '#16a34a' : '#ea580c'}; font-weight: 600;">${inv.status}</td>
                </tr>
            `).join('');
        } else {
            body.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px; color: var(--text-muted);">No payment invoices found.</td></tr>';
        }
    } catch (err) {
        console.error('Failed to load invoices:', err);
    }
}

function toggleTheme() {
    const isDark = document.body.classList.contains('theme-dark');
    if (isDark) {
        document.body.classList.remove('theme-dark');
        document.body.setAttribute('data-theme', 'light');
        localStorage.setItem('norra_theme', 'light');
    } else {
        document.body.classList.add('theme-dark');
        document.body.setAttribute('data-theme', 'dark');
        localStorage.setItem('norra_theme', 'dark');
    }
}

// Initial boot
document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('norra_theme') || 'dark';
    if (savedTheme === 'light') {
        document.body.classList.remove('theme-dark');
        document.body.setAttribute('data-theme', 'light');
    }

    // Check payment callback
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('payment_status') === 'flw_callback') {
        const tx_ref = urlParams.get('tx_ref');
        const transaction_id = urlParams.get('transaction_id');
        fetch('/api/payments/flutterwave/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tx_ref, transaction_id })
        })
        .then(r => r.json())
        .then(data => {
            if (data.status === 'success') {
                alert(`Payment successful! Your API key is: ${data.apiKey}`);
            }
        })
        .catch(() => {});
    }

    if (userToken) {
        loadPortalData();
    }
});
