// account.js - Customer Account & Developer Portal with Google Sign-In and Email Confirmation

let userToken = localStorage.getItem('norra_user_token') || '';
let currentUser = null;
let currentKey = null;
let isRegisterMode = false;
let authConfig = { googleClientId: '', googleAuthEnabled: false };

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
    const googleBtnText = document.getElementById('google-btn-text');

    errorEl.style.display = 'none';

    if (isRegisterMode) {
        title.textContent = 'Create Developer Account';
        nameGroup.style.display = 'block';
        submitBtn.textContent = 'Register & Get API Key';
        switchPrompt.textContent = 'Already have an account?';
        switchLink.textContent = 'Sign In';
        if (googleBtnText) googleBtnText.textContent = 'Sign up with Google';
    } else {
        title.textContent = 'Sign In to Developer Portal';
        nameGroup.style.display = 'none';
        submitBtn.textContent = 'Sign In';
        switchPrompt.textContent = "Don't have an account?";
        switchLink.textContent = 'Create Free Account';
        if (googleBtnText) googleBtnText.textContent = 'Continue with Google';
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
            if (isRegisterMode && data.requiresEmailVerification) {
                alert('Account registered! We sent a confirmation link to your email. Please verify your address.');
            }
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

// Google Sign-In Setup & Callback
async function initGoogleAuth() {
    try {
        const res = await fetch('/api/account/auth-config');
        authConfig = await res.json();

        if (authConfig.googleAuthEnabled && authConfig.googleClientId) {
            const checkGoogleReady = setInterval(() => {
                if (window.google && window.google.accounts && window.google.accounts.id) {
                    clearInterval(checkGoogleReady);
                    try {
                        google.accounts.id.initialize({
                            client_id: authConfig.googleClientId,
                            callback: handleGoogleCredentialResponse,
                            auto_select: false
                        });

                        const btnContainer = document.getElementById('google-signin-btn');
                        if (btnContainer) {
                            google.accounts.id.renderButton(btnContainer, {
                                theme: 'filled_black',
                                size: 'large',
                                width: '320',
                                text: 'continue_with',
                                shape: 'rectangular'
                            });
                            // Hide the fallback button if the official Google button rendered
                            const fallbackBtn = document.getElementById('google-fallback-btn');
                            if (fallbackBtn) fallbackBtn.style.display = 'none';
                        }
                    } catch (e) {
                        console.warn('Google button render warning:', e);
                    }
                }
            }, 100);

            setTimeout(() => clearInterval(checkGoogleReady), 6000);
        }
    } catch (err) {
        console.warn('Google auth config lookup failed:', err);
    }
}

function triggerGoogleSignIn() {
    if (!authConfig.googleAuthEnabled || !authConfig.googleClientId) {
        const errorEl = document.getElementById('auth-error');
        if (errorEl) {
            errorEl.style.color = '#38bdf8';
            errorEl.textContent = 'Google Sign-In is ready for client activation in Admin Console. You can sign in or register with your email below:';
            errorEl.style.display = 'block';
        }
        const emailInput = document.getElementById('auth-email');
        if (emailInput) emailInput.focus();
        return;
    }
    if (window.google && window.google.accounts && window.google.accounts.id) {
        google.accounts.id.prompt();
    }
}

async function handleGoogleCredentialResponse(response) {
    if (!response || !response.credential) return;
    const errorEl = document.getElementById('auth-error');
    errorEl.style.display = 'none';

    try {
        const res = await fetch('/api/account/google', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ credential: response.credential })
        });
        const data = await res.json();
        if (res.ok && data.token) {
            userToken = data.token;
            localStorage.setItem('norra_user_token', userToken);
            loadPortalData();
        } else {
            errorEl.textContent = data.error || 'Google Sign-In failed.';
            errorEl.style.display = 'block';
        }
    } catch (err) {
        errorEl.textContent = 'Failed to connect to Google Auth endpoint.';
        errorEl.style.display = 'block';
    }
}

// Email Verification Flow
async function verifyEmailToken(token) {
    try {
        const res = await fetch('/api/account/verify-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token })
        });
        const data = await res.json();

        // Clean query param from URL without reload
        const newUrl = window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);

        if (res.ok) {
            alert('🎉 ' + (data.message || 'Email verified successfully! Full access unlocked.'));
            if (currentUser) {
                currentUser.isEmailVerified = true;
                updateEmailBanner();
            }
        } else {
            alert('⚠️ ' + (data.error || 'Verification token is invalid or expired.'));
        }
    } catch (err) {
        console.error('Email verification error:', err);
    }
}

async function resendVerificationEmail() {
    const btn = document.getElementById('resend-verification-btn');
    if (btn) btn.disabled = true;

    try {
        const res = await fetch('/api/account/resend-verification', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${userToken}`
            },
            body: JSON.stringify({ email: currentUser?.email })
        });
        const data = await res.json();
        if (res.ok) {
            alert('✉️ ' + (data.message || 'Confirmation link sent to your email!'));
            if (btn) btn.textContent = 'Sent! Check Inbox';
        } else {
            alert('⚠️ ' + (data.error || 'Failed to resend confirmation email.'));
            if (btn) btn.disabled = false;
        }
    } catch (err) {
        alert('Connection error resending verification email.');
        if (btn) btn.disabled = false;
    }
}

function updateEmailBanner() {
    const banner = document.getElementById('email-verification-banner');
    const verifiedAlert = document.getElementById('email-verified-alert');
    const emailSpan = document.getElementById('user-unverified-email');

    if (!currentUser) return;

    if (!currentUser.isEmailVerified) {
        if (banner) {
            banner.style.display = 'flex';
            if (emailSpan) emailSpan.textContent = currentUser.email;
        }
        if (verifiedAlert) verifiedAlert.style.display = 'none';
    } else {
        if (banner) banner.style.display = 'none';
        if (verifiedAlert) verifiedAlert.style.display = 'flex';
        // Auto-hide the verified badge after 6 seconds
        setTimeout(() => {
            if (verifiedAlert) verifiedAlert.style.display = 'none';
        }, 6000);
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

        updateEmailBanner();
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

        if (data.norraMasterKey) {
            const masterKeyEl = document.getElementById('display-norra-master-key');
            if (masterKeyEl) masterKeyEl.textContent = data.norraMasterKey;
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

function copyMasterApiKey() {
    const masterKeyEl = document.getElementById('display-norra-master-key');
    const key = masterKeyEl ? masterKeyEl.textContent.trim() : 'norra_live_master_internal_access_2026';
    navigator.clipboard.writeText(key).then(() => {
        alert('Norra AI Master API Key copied to clipboard!');
    });
}

async function regenerateApiKey() {
    if (!currentKey) return;
    if (!confirm('Are you sure you want to regenerate your API key? Any applications currently using the old key will stop working.')) return;

    try {
        const res = await fetch('/api/account/keys/regenerate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${userToken}`
            },
            body: JSON.stringify({ keyId: currentKey._id })
        });
        const data = await res.json();
        if (data.key) {
            currentKey = data.key;
            document.getElementById('display-api-key').textContent = currentKey.key;
            alert('API key regenerated successfully!');
        }
    } catch (err) {
        alert('Failed to regenerate key.');
    }
}

async function loadUpgradePlans() {
    const grid = document.getElementById('upgrade-plans-grid');
    grid.innerHTML = '<div style="color:var(--text-muted);">Loading plans...</div>';

    try {
        const res = await fetch('/api/plans');
        const data = await res.json();
        const userCurr = detectUserCurrency();
        const currInfo = CURRENCY_RATES[userCurr] || CURRENCY_RATES.USD;

        grid.innerHTML = (data.plans || []).map(plan => {
            const isCurrent = currentUser && currentUser.plan === plan.id;
            const approxLocal = Math.round(plan.priceUsd * currInfo.rate);

            return `
                <div class="plan-card" style="${isCurrent ? 'border-color: var(--color-primary); box-shadow: 0 0 12px var(--color-primary-subtle);' : ''}">
                    <div>
                        <div style="display: flex; justify-content: space-between; align-items: baseline;">
                            <h4 style="margin: 0; font-size: 16px;">${escapeHtml(plan.name)}</h4>
                            ${isCurrent ? '<span style="font-size: 11px; color: var(--color-primary); font-weight: 700;">CURRENT</span>' : ''}
                        </div>
                        <div style="font-size: 26px; font-weight: 800; margin: 12px 0 4px;">
                            $${plan.priceUsd} <span style="font-size: 13px; font-weight: 400; color: var(--text-muted);">/ month</span>
                        </div>
                        ${userCurr !== 'USD' && plan.priceUsd > 0 ? `
                            <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 12px;">
                                ≈ ${currInfo.symbol}${approxLocal.toLocaleString()} ${userCurr} / mo
                            </div>
                        ` : ''}
                        <ul style="padding-left: 18px; font-size: 13px; color: var(--text-muted); margin: 16px 0;">
                            ${(plan.features || []).map(f => `<li style="margin-bottom: 6px;">${escapeHtml(f)}</li>`).join('')}
                        </ul>
                    </div>
                    ${!isCurrent && plan.priceUsd > 0 ? `
                        <div style="display: flex; gap: 8px; margin-top: 15px;">
                            ${data.gateways?.flutterwave ? `
                                <button onclick="checkoutFlutterwave('${plan.id}')" class="btn-primary" style="flex: 1; padding: 8px 10px; font-size: 12px;">Pay Flutterwave</button>
                            ` : ''}
                            ${data.gateways?.paypal ? `
                                <button onclick="checkoutPayPal('${plan.id}')" class="btn-secondary" style="flex: 1; padding: 8px 10px; font-size: 12px;">PayPal</button>
                            ` : ''}
                        </div>
                    ` : (isCurrent ? '<button class="btn-secondary" style="width: 100%; margin-top: 15px;" disabled>Active Plan</button>' : '')}
                </div>
            `;
        }).join('');
    } catch (err) {
        grid.innerHTML = '<div style="color:#ef4444;">Failed to load pricing plans.</div>';
    }
}

async function checkoutFlutterwave(planId) {
    try {
        const res = await fetch('/api/payments/flutterwave/initialize', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${userToken}`
            },
            body: JSON.stringify({
                plan: planId,
                email: currentUser.email,
                name: currentUser.fullName
            })
        });
        const data = await res.json();
        if (data.paymentUrl) {
            window.location.href = data.paymentUrl;
        } else {
            alert(data.error || 'Could not initialize Flutterwave checkout.');
        }
    } catch (err) {
        alert('Checkout error.');
    }
}

async function checkoutPayPal(planId) {
    try {
        const res = await fetch('/api/payments/paypal/create-order', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${userToken}`
            },
            body: JSON.stringify({
                plan: planId,
                email: currentUser.email,
                name: currentUser.fullName
            })
        });
        const data = await res.json();
        if (data.orderId) {
            // In mock/sandbox mode, complete capture immediately
            const captureRes = await fetch('/api/payments/paypal/capture-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderId: data.orderId, tx_ref: data.tx_ref })
            });
            const capData = await captureRes.json();
            if (capData.status === 'success') {
                alert(`PayPal subscription activated! Your upgraded key: ${capData.apiKey}`);
                loadPortalData();
            } else {
                alert(capData.error || 'PayPal capture failed.');
            }
        } else {
            alert(data.error || 'Could not create PayPal order.');
        }
    } catch (err) {
        alert('PayPal checkout error.');
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
    const tbody = document.getElementById('invoices-body');
    try {
        const res = await fetch('/api/account/invoices', {
            headers: { Authorization: `Bearer ${userToken}` }
        });
        const data = await res.json();
        if (data.invoices && data.invoices.length) {
            tbody.innerHTML = data.invoices.map(inv => `
                <tr style="border-bottom: 1px solid var(--border-subtle);">
                    <td style="padding: 10px;">${new Date(inv.createdAt).toLocaleDateString()}</td>
                    <td style="padding: 10px; font-family: monospace;">${escapeHtml(inv.tx_ref)}</td>
                    <td style="padding: 10px; text-transform: uppercase; font-weight: 600;">${escapeHtml(inv.plan)}</td>
                    <td style="padding: 10px;">$${inv.amount} ${escapeHtml(inv.currency)}</td>
                    <td style="padding: 10px; text-transform: capitalize;">${escapeHtml(inv.gateway)}</td>
                    <td style="padding: 10px;">
                        <span style="padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; ${inv.status === 'successful' ? 'background: rgba(16, 185, 129, 0.15); color: #10b981;' : 'background: rgba(239, 68, 68, 0.15); color: #ef4444;'}">
                            ${escapeHtml(inv.status)}
                        </span>
                    </td>
                </tr>
            `).join('');
        } else {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px; color: var(--text-muted);">No payment invoices found.</td></tr>';
        }
    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px; color: #ef4444;">Failed to load invoices.</td></tr>';
    }
}

function toggleTheme() {
    const current = document.body.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    document.body.setAttribute('data-theme', next);
    document.body.className = next === 'light' ? 'theme-light' : 'theme-dark';
    localStorage.setItem('norra_theme', next);
}

function escapeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Initial boot
document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('norra_theme') || 'dark';
    if (savedTheme === 'light') {
        document.body.classList.remove('theme-dark');
        document.body.setAttribute('data-theme', 'light');
    }

    // Initialize Google Auth
    initGoogleAuth();

    // Check email verification token in URL
    const urlParams = new URLSearchParams(window.location.search);
    const verifyToken = urlParams.get('verify_token');
    if (verifyToken) {
        verifyEmailToken(verifyToken);
    }

    // Check payment callback
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
