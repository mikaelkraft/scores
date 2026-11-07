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

function togglePasswordVisibility(inputId, btnEl) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const isPw = input.type === 'password';
    input.type = isPw ? 'text' : 'password';
    if (btnEl) btnEl.textContent = isPw ? '🙈' : '👁️';
}
window.togglePasswordVisibility = togglePasswordVisibility;

async function handleAuthSubmit(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    const emailInput = document.getElementById('auth-email');
    const passwordInput = document.getElementById('auth-password');
    const nameInput = document.getElementById('auth-name');

    const email = (emailInput?.value || '').trim();
    const password = passwordInput?.value || '';
    const fullName = (nameInput?.value || '').trim();
    const errorEl = document.getElementById('auth-error');

    if (errorEl) errorEl.style.display = 'none';
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
            if (data.isAdmin || data.redirectUrl) {
                localStorage.setItem('norra_admin_token', data.token);
                localStorage.setItem('admin_token', data.token);
                window.location.assign(data.redirectUrl || '/admin');
                return;
            }
            userToken = data.token;
            localStorage.setItem('norra_user_token', userToken);
            if (isRegisterMode && data.requiresEmailVerification) {
                alert('Account registered! We sent a confirmation link to your email. Please verify your address.');
            }
            loadPortalData();
        } else {
            if (errorEl) {
                errorEl.textContent = data.error || 'Authentication failed.';
                errorEl.style.display = 'block';
            }
        }
    } catch (err) {
        if (errorEl) {
            errorEl.textContent = 'Connection error. Please try again.';
            errorEl.style.display = 'block';
        }
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

    if (tabName === 'profile') populateProfileTab();
    if (tabName === 'upgrade') loadUpgradePlans();
    if (tabName === 'whitelabel') loadWhitelabelSnippets();
    if (tabName === 'invoices') loadInvoices();
}

function populateProfileTab() {
    if (!currentUser) return;
    const nameEl = document.getElementById('profile-display-name');
    const usernameEl = document.getElementById('profile-display-username');
    const sinceEl = document.getElementById('profile-member-since');
    const badgeEl = document.getElementById('profile-verification-badge');
    const avatarImg = document.getElementById('profile-avatar-img');

    if (nameEl) nameEl.textContent = currentUser.fullName || currentUser.username || 'Developer';
    if (usernameEl) usernameEl.textContent = `@${currentUser.username || 'user'}`;
    if (sinceEl) {
        const dateStr = currentUser.createdAt ? new Date(currentUser.createdAt).toLocaleDateString() : '';
        sinceEl.textContent = dateStr ? `Member since ${dateStr}` : 'Active Member';
    }
    if (avatarImg && currentUser.avatarUrl) {
        avatarImg.src = currentUser.avatarUrl;
    }
    if (badgeEl) {
        if (currentUser.isEmailVerified) {
            badgeEl.textContent = '✅ Verified Account';
            badgeEl.style.background = 'rgba(16, 185, 129, 0.15)';
            badgeEl.style.color = '#34d399';
        } else {
            badgeEl.textContent = '⚠️ Unverified Email';
            badgeEl.style.background = 'rgba(234, 179, 8, 0.15)';
            badgeEl.style.color = '#fde047';
        }
    }

    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val || '';
    };

    setVal('profile-fullname', currentUser.fullName);
    setVal('profile-username', currentUser.username);
    setVal('profile-email', currentUser.email);
    setVal('profile-company', currentUser.companyName);
    setVal('profile-phone', currentUser.phone);
    setVal('profile-website', currentUser.website);
    setVal('profile-location', currentUser.location);
    setVal('profile-bio', currentUser.bio);

    const groupCurrentPassword = document.getElementById('group-current-password');
    if (groupCurrentPassword) {
        if (currentUser.authProvider === 'google' && !currentUser.hasPassword) {
            groupCurrentPassword.style.display = 'none';
        } else {
            groupCurrentPassword.style.display = 'block';
        }
    }
}

async function saveProfileChanges(event) {
    event.preventDefault();
    const successAlert = document.getElementById('profile-success-alert');
    const errorAlert = document.getElementById('profile-error-alert');
    const btn = document.getElementById('btn-save-profile');

    if (successAlert) successAlert.style.display = 'none';
    if (errorAlert) errorAlert.style.display = 'none';
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Saving...';
    }

    const payload = {
        fullName: document.getElementById('profile-fullname').value.trim(),
        username: document.getElementById('profile-username').value.trim(),
        companyName: document.getElementById('profile-company').value.trim(),
        phone: document.getElementById('profile-phone').value.trim(),
        website: document.getElementById('profile-website').value.trim(),
        location: document.getElementById('profile-location').value.trim(),
        bio: document.getElementById('profile-bio').value.trim()
    };

    try {
        const res = await fetch('/api/account/profile', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${userToken}`
            },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (res.ok && data.user) {
            currentUser = { ...currentUser, ...data.user };
            populateProfileTab();
            if (successAlert) {
                successAlert.textContent = '✅ Profile updated successfully!';
                successAlert.style.display = 'block';
                setTimeout(() => { successAlert.style.display = 'none'; }, 4000);
            }
        } else {
            if (errorAlert) {
                errorAlert.textContent = data.error || 'Failed to update profile.';
                errorAlert.style.display = 'block';
            }
        }
    } catch (err) {
        if (errorAlert) {
            errorAlert.textContent = 'Connection error saving profile.';
            errorAlert.style.display = 'block';
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Save Profile Changes';
        }
    }
}

async function uploadProfileAvatar(input) {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    const formData = new FormData();
    formData.append('avatar', file);

    const errorAlert = document.getElementById('profile-error-alert');
    const successAlert = document.getElementById('profile-success-alert');
    if (errorAlert) errorAlert.style.display = 'none';

    try {
        const res = await fetch('/api/account/avatar', {
            method: 'POST',
            headers: { Authorization: `Bearer ${userToken}` },
            body: formData
        });
        const data = await res.json();
        if (res.ok && data.avatarUrl) {
            currentUser.avatarUrl = data.avatarUrl;
            const img = document.getElementById('profile-avatar-img');
            if (img) img.src = data.avatarUrl;
            if (successAlert) {
                successAlert.textContent = '✅ Avatar photo uploaded successfully!';
                successAlert.style.display = 'block';
                setTimeout(() => { successAlert.style.display = 'none'; }, 4000);
            }
        } else {
            if (errorAlert) {
                errorAlert.textContent = data.error || 'Failed to upload avatar.';
                errorAlert.style.display = 'block';
            }
        }
    } catch (err) {
        if (errorAlert) {
            errorAlert.textContent = 'Connection error uploading avatar.';
            errorAlert.style.display = 'block';
        }
    }
}

async function changeAccountPassword(event) {
    event.preventDefault();
    const successAlert = document.getElementById('password-success-alert');
    const errorAlert = document.getElementById('password-error-alert');
    const btn = document.getElementById('btn-change-password');
    const currentPassword = document.getElementById('input-current-password').value;
    const newPassword = document.getElementById('input-new-password').value;
    const confirmPassword = document.getElementById('input-confirm-password').value;

    if (successAlert) successAlert.style.display = 'none';
    if (errorAlert) errorAlert.style.display = 'none';

    if (newPassword !== confirmPassword) {
        if (errorAlert) {
            errorAlert.textContent = 'New passwords do not match.';
            errorAlert.style.display = 'block';
        }
        return;
    }
    if (newPassword.length < 6) {
        if (errorAlert) {
            errorAlert.textContent = 'Password must be at least 6 characters.';
            errorAlert.style.display = 'block';
        }
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Updating...';
    }

    try {
        const res = await fetch('/api/account/change-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${userToken}`
            },
            body: JSON.stringify({ currentPassword, newPassword })
        });
        const data = await res.json();
        if (res.ok) {
            if (successAlert) {
                successAlert.textContent = '✅ ' + (data.message || 'Password updated successfully!');
                successAlert.style.display = 'block';
                setTimeout(() => { successAlert.style.display = 'none'; }, 5000);
            }
            document.getElementById('password-change-form').reset();
            if (currentUser) currentUser.hasPassword = true;
            const groupCurrentPassword = document.getElementById('group-current-password');
            if (groupCurrentPassword) groupCurrentPassword.style.display = 'block';
        } else {
            if (errorAlert) {
                errorAlert.textContent = data.error || 'Failed to update password.';
                errorAlert.style.display = 'block';
            }
        }
    } catch (err) {
        if (errorAlert) {
            errorAlert.textContent = 'Connection error changing password.';
            errorAlert.style.display = 'block';
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Update Password';
        }
    }
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
        const planUpper = (currentUser.plan || 'free').toUpperCase();
        document.getElementById('badge-user-plan').textContent = `${planUpper} PLAN`;

        updateEmailBanner();
        populateProfileTab();
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
        const activeKeyCard = document.getElementById('active-key-card');
        const btnGenerate = document.getElementById('btn-generate-api-key');
        const btnRevoke = document.getElementById('btn-revoke-api-key');

        if (currentUser) {
            const emailEl = document.getElementById('tier-locked-email');
            if (emailEl) emailEl.textContent = currentUser.email || 'developer';
        }

        if (data.keys && data.keys.length) {
            currentKey = data.keys[0];
            const displayKeyEl = document.getElementById('display-api-key');
            if (displayKeyEl) displayKeyEl.textContent = currentKey.keyMasked || currentKey.key;

            const statRate = document.getElementById('stat-rate-limit');
            if (statRate) statRate.textContent = `${currentKey.rateLimitPerMinute} req/min`;

            const statAd = document.getElementById('stat-ad-free');
            if (statAd) statAd.textContent = currentKey.isAdFree ? '100% Ad-Free' : 'Ad-Supported';

            const statCalls = document.getElementById('stat-total-calls');
            if (statCalls) statCalls.textContent = currentKey.totalRequests || 0;

            const statScope = document.getElementById('stat-league-scope');
            if (statScope) {
                const plan = (currentKey.plan || currentUser?.plan || 'free').toLowerCase();
                statScope.textContent = plan === 'whitelabel' ? 'All Global & Domestic Leagues + Whitelabel Embeds' :
                                       (plan === 'pro' ? 'All Tier 1, 2, 3 Leagues + AI Predictions' :
                                       (plan === 'starter' ? 'Top 25 World Leagues & Live Scores' : 'Top 10 World Leagues'));
            }

            if (activeKeyCard) activeKeyCard.style.display = 'block';
            if (btnRevoke) btnRevoke.style.display = 'inline-flex';
            if (btnGenerate) btnGenerate.textContent = '🔄 Regenerate Key';
        } else {
            currentKey = null;
            if (activeKeyCard) activeKeyCard.style.display = 'none';
            if (btnRevoke) btnRevoke.style.display = 'none';
            if (btnGenerate) btnGenerate.textContent = '🔑 Generate API Key';
        }

        if (data.norraMasterKey) {
            const masterKeyEl = document.getElementById('display-norra-master-key');
            if (masterKeyEl) masterKeyEl.textContent = data.norraMasterKey;
        }
    } catch (err) {
        console.error('Failed to load keys:', err);
    }
}

async function generateApiKeyForUser() {
    const btn = document.getElementById('btn-generate-api-key');
    if (btn) btn.disabled = true;

    try {
        const res = await fetch('/api/account/keys/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${userToken}`
            }
        });
        const data = await res.json();
        if (res.ok && data.rawKey) {
            const revealBox = document.getElementById('new-key-reveal-box');
            const rawInput = document.getElementById('reveal-raw-key-input');
            const copyLabel = document.getElementById('copy-btn-label');
            const copyFeedback = document.getElementById('copy-feedback-text');

            if (rawInput) rawInput.value = data.rawKey;
            if (copyLabel) copyLabel.textContent = 'Copy Key';
            if (copyFeedback) copyFeedback.style.display = 'none';
            if (revealBox) {
                revealBox.style.display = 'block';
                revealBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }

            await loadKeys();
        } else {
            alert(data.error || 'Failed to generate API key.');
        }
    } catch (err) {
        alert('Connection error generating API key.');
    } finally {
        if (btn) btn.disabled = false;
    }
}

function copyRevealedApiKey() {
    const input = document.getElementById('reveal-raw-key-input');
    if (!input || !input.value) return;
    navigator.clipboard.writeText(input.value).then(() => {
        const label = document.getElementById('copy-btn-label');
        if (label) label.textContent = 'Copied! ✅';
        const feedback = document.getElementById('copy-feedback-text');
        if (feedback) feedback.style.display = 'inline-block';
        setTimeout(() => {
            if (label) label.textContent = 'Copy Key';
        }, 3500);
    }).catch(() => {
        input.select();
        document.execCommand('copy');
        const feedback = document.getElementById('copy-feedback-text');
        if (feedback) feedback.style.display = 'inline-block';
    });
}

function dismissKeyRevealBox() {
    const box = document.getElementById('new-key-reveal-box');
    const input = document.getElementById('reveal-raw-key-input');
    if (box) box.style.display = 'none';
    if (input) input.value = '';
}

async function revokeApiKeyForUser() {
    if (!confirm('Are you sure you want to revoke your API key? All applications using this key will immediately receive 401 Unauthorized.')) return;
    try {
        const res = await fetch('/api/account/keys/revoke', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${userToken}`
            },
            body: JSON.stringify({ keyId: currentKey?._id })
        });
        const data = await res.json();
        if (res.ok) {
            dismissKeyRevealBox();
            currentKey = null;
            await loadKeys();
            alert('API key revoked successfully.');
        } else {
            alert(data.error || 'Failed to revoke API key.');
        }
    } catch (err) {
        alert('Connection error revoking API key.');
    }
}

function copyApiKey() {
    if (!currentKey) return;
    const keyToCopy = currentKey.rawKey || currentKey.key;
    navigator.clipboard.writeText(keyToCopy).then(() => {
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
    return generateApiKeyForUser();
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
    if (typeof window.toggleTheme === 'function') {
        window.toggleTheme();
    }
}

function escapeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Initial boot
document.addEventListener('DOMContentLoaded', () => {
    if (typeof window.applyTheme === 'function') {
        const savedTheme = localStorage.getItem('norra_theme') || localStorage.getItem('theme') || 'dark';
        window.applyTheme(savedTheme);
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
