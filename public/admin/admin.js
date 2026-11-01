// admin.js - Norra Scores Admin Console Client

let adminToken = localStorage.getItem('norra_admin_token') || localStorage.getItem('admin_token') || '';
let globalSettings = null;

function checkAuth() {
    const authOverlay = document.getElementById('auth-overlay');
    if (!adminToken) {
        authOverlay.style.display = 'grid';
    } else {
        authOverlay.style.display = 'none';
        loadDashboardData();
    }
}

async function handleAdminLogin(event) {
    event.preventDefault();
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');

    errorEl.style.display = 'none';
    try {
        const res = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (res.ok && data.token) {
            adminToken = data.token;
            localStorage.setItem('norra_admin_token', adminToken);
            document.getElementById('auth-overlay').style.display = 'none';
            loadDashboardData();
        } else {
            errorEl.textContent = data.error || 'Invalid username or password.';
            errorEl.style.display = 'block';
        }
    } catch (err) {
        errorEl.textContent = 'Connection error. Please try again.';
        errorEl.style.display = 'block';
    }
}

function handleLogout() {
    adminToken = '';
    localStorage.removeItem('norra_admin_token');
    document.getElementById('auth-overlay').style.display = 'grid';
}

function switchAdminTab(tabName) {
    document.querySelectorAll('.admin-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.admin-tab-content').forEach(el => el.style.display = 'none');

    const targetTab = document.getElementById(`tab-${tabName}`);
    if (targetTab) targetTab.style.display = 'block';

    const activeBtn = Array.from(document.querySelectorAll('.admin-tab-btn'))
        .find(b => b.getAttribute('onclick')?.includes(tabName));
    if (activeBtn) activeBtn.classList.add('active');

    if (tabName === 'keys') loadApiKeysAndUsers();
}

async function loadDashboardData() {
    await Promise.all([loadStats(), loadSettings()]);
}

async function loadStats() {
    try {
        const res = await fetch('/api/admin/stats', {
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        if (res.status === 401 || res.status === 403) return handleLogout();
        const data = await res.json();
        if (data.stats) {
            document.getElementById('stat-leagues').textContent = data.stats.activeLeagues ?? 0;
            document.getElementById('stat-matches').textContent = data.stats.storedMatches ?? 0;
            document.getElementById('stat-keys').textContent = data.stats.activeApiKeys ?? 0;
            document.getElementById('stat-users').textContent = data.stats.totalUsers ?? 0;
        }

        const txBody = document.getElementById('recent-transactions-body');
        if (data.recentTransactions && data.recentTransactions.length) {
            txBody.innerHTML = data.recentTransactions.map(tx => `
                <tr>
                    <td>${new Date(tx.createdAt).toLocaleDateString()}</td>
                    <td><code>${tx.tx_ref}</code></td>
                    <td>${tx.customer_email}</td>
                    <td><strong style="text-transform: capitalize;">${tx.plan}</strong></td>
                    <td>$${tx.amount} ${tx.currency}</td>
                    <td>${tx.gateway}</td>
                    <td><span style="color: ${tx.status === 'successful' ? '#16a34a' : '#ea580c'}; font-weight: 600;">${tx.status}</span></td>
                </tr>
            `).join('');
        } else {
            txBody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">No subscription transactions recorded yet.</td></tr>';
        }
    } catch (err) {
        console.error('Failed to load stats:', err);
    }
}

async function loadSettings() {
    try {
        const res = await fetch('/api/admin/settings', {
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        const data = await res.json();
        if (!data.settings) return;
        globalSettings = data.settings;

        // Branding
        document.getElementById('setting-site-title').value = globalSettings.siteTitle || '';
        document.getElementById('setting-tagline').value = globalSettings.tagline || '';
        document.getElementById('setting-announcement-active').checked = Boolean(globalSettings.announcementActive);
        document.getElementById('setting-announcement').value = globalSettings.announcement || '';
        if (globalSettings.headerLogoUrl) {
            document.getElementById('preview-header-logo').src = globalSettings.headerLogoUrl;
        }
        if (globalSettings.footerLogoUrl) {
            document.getElementById('preview-footer-logo').src = globalSettings.footerLogoUrl;
        }
        if (globalSettings.faviconUrl && document.getElementById('preview-favicon')) {
            document.getElementById('preview-favicon').src = globalSettings.faviconUrl;
        }

        // Pricing
        const plans = globalSettings.plans || {};
        document.getElementById('plan-starter-price').value = plans.starter?.priceUsd || 19;
        document.getElementById('plan-starter-limit').value = plans.starter?.rateLimitPerMinute || 500;
        document.getElementById('plan-pro-price').value = plans.pro?.priceUsd || 49;
        document.getElementById('plan-pro-limit').value = plans.pro?.rateLimitPerMinute || 1500;
        document.getElementById('plan-whitelabel-price').value = plans.whitelabel?.priceUsd || 99;
        document.getElementById('plan-whitelabel-limit').value = plans.whitelabel?.rateLimitPerMinute || 5000;

        // Gateways
        document.getElementById('setting-flw-enabled').checked = globalSettings.paymentSettings?.flutterwaveEnabled !== false;
        document.getElementById('setting-pp-enabled').checked = globalSettings.paymentSettings?.paypalEnabled !== false;

        // Booking hook
        document.getElementById('setting-booking-hook-enabled').checked = globalSettings.bookingSettings?.hookEnabled !== false;
        document.getElementById('setting-booking-referral').value = globalSettings.bookingSettings?.referralCode || 'NORRA_AI';

        // Auth & Email
        const auth = globalSettings.authSettings || {};
        const smtp = globalSettings.smtpSettings || {};
        const googleIdEl = document.getElementById('setting-google-client-id');
        if (googleIdEl) googleIdEl.value = auth.googleClientId || '';
        const reqVerifEl = document.getElementById('setting-require-verification');
        if (reqVerifEl) reqVerifEl.checked = auth.requireEmailVerification !== false;

        const smtpEnEl = document.getElementById('setting-smtp-enabled');
        if (smtpEnEl) smtpEnEl.checked = Boolean(smtp.enabled);
        const smtpHostEl = document.getElementById('setting-smtp-host');
        if (smtpHostEl) smtpHostEl.value = smtp.host || '';
        const smtpPortEl = document.getElementById('setting-smtp-port');
        if (smtpPortEl) smtpPortEl.value = smtp.port || 587;
        const smtpUserEl = document.getElementById('setting-smtp-user');
        if (smtpUserEl) smtpUserEl.value = smtp.user || '';
        const smtpPassEl = document.getElementById('setting-smtp-pass');
        if (smtpPassEl) smtpPassEl.value = smtp.pass || '';
        const smtpFromEl = document.getElementById('setting-smtp-from');
        if (smtpFromEl) smtpFromEl.value = smtp.fromEmail || '';

        // Social Links
        const social = globalSettings.socialLinks || {};
        if (document.getElementById('setting-social-twitter')) document.getElementById('setting-social-twitter').value = social.twitter || '';
        if (document.getElementById('setting-social-telegram')) document.getElementById('setting-social-telegram').value = social.telegram || '';
        if (document.getElementById('setting-social-discord')) document.getElementById('setting-social-discord').value = social.discord || '';
        if (document.getElementById('setting-social-github')) document.getElementById('setting-social-github').value = social.github || '';
        if (document.getElementById('setting-social-facebook')) document.getElementById('setting-social-facebook').value = social.facebook || '';
        if (document.getElementById('setting-social-instagram')) document.getElementById('setting-social-instagram').value = social.instagram || '';
        if (document.getElementById('setting-social-youtube')) document.getElementById('setting-social-youtube').value = social.youtube || '';
        if (document.getElementById('setting-social-linkedin')) document.getElementById('setting-social-linkedin').value = social.linkedin || '';

        // Live Infeed Settings
        const infeed = globalSettings.infeedSettings || {};
        const infeedCard = infeed.infeedCard || {};
        if (document.getElementById('setting-infeed-autosync')) document.getElementById('setting-infeed-autosync').checked = infeed.autoSyncEnabled !== false;
        if (document.getElementById('setting-infeed-interval')) document.getElementById('setting-infeed-interval').value = infeed.syncIntervalSeconds || 45;
        if (document.getElementById('setting-infeed-card-enabled')) document.getElementById('setting-infeed-card-enabled').checked = infeedCard.enabled !== false;
        if (document.getElementById('setting-infeed-card-badge')) document.getElementById('setting-infeed-card-badge').value = infeedCard.badgeText || 'LIVE INFEED';
        if (document.getElementById('setting-infeed-card-color')) document.getElementById('setting-infeed-card-color').value = infeedCard.badgeColor || '#2563eb';
        if (document.getElementById('setting-infeed-card-headline')) document.getElementById('setting-infeed-card-headline').value = infeedCard.headline || '';
        if (document.getElementById('setting-infeed-card-subtext')) document.getElementById('setting-infeed-card-subtext').value = infeedCard.subtext || '';
        if (document.getElementById('setting-infeed-card-cta-text')) document.getElementById('setting-infeed-card-cta-text').value = infeedCard.ctaText || 'Get API Access';
        if (document.getElementById('setting-infeed-card-cta-url')) document.getElementById('setting-infeed-card-cta-url').value = infeedCard.ctaUrl || '/pricing';
        if (document.getElementById('setting-infeed-card-html')) document.getElementById('setting-infeed-card-html').value = infeedCard.customHtml || '';

        // Render Promos and Ads
        renderBookiePromos(globalSettings.bookiePromos || []);
        renderAdSlots(globalSettings.ads || {});
    } catch (err) {
        console.error('Failed to load settings:', err);
    }
}

// Logo upload helper
async function uploadLogoFile(type, inputEl) {
    if (!inputEl.files || !inputEl.files[0]) return;
    const file = inputEl.files[0];
    const formData = new FormData();
    formData.append('logo', file);
    formData.append('logoType', type);

    try {
        const res = await fetch('/api/admin/upload-logo', {
            method: 'POST',
            headers: { Authorization: `Bearer ${adminToken}` },
            body: formData
        });
        const data = await res.json();
        if (res.ok && data.url) {
            const labelMap = { header: 'Header logo', footer: 'Footer logo', favicon: 'Favicon' };
            alert(`${labelMap[type] || 'Logo'} uploaded successfully!`);
            const previewEl = document.getElementById(type === 'favicon' ? 'preview-favicon' : `preview-${type}-logo`);
            if (previewEl) previewEl.src = data.url;
        } else {
            alert(data.error || 'Failed to upload logo.');
        }
    } catch (err) {
        alert('Upload failed. Please check file size and format.');
    }
}

function renderBookiePromos(promos) {
    const container = document.getElementById('bookie-promos-container');
    // Ensure 3 default slots
    const items = [...promos];
    while (items.length < 3) {
        items.push({ bookmaker: 'Sponsor', headline: 'Special Bonus Offer', promoCode: 'CODE', linkUrl: '#', active: true });
    }

    container.innerHTML = items.slice(0, 3).map((p, idx) => `
        <div style="border: 1px solid var(--border-subtle); border-radius: 8px; padding: 16px; margin-bottom: 12px; background: var(--bg-canvas);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <strong>Card #${idx + 1}: ${p.bookmaker || 'Sponsor'}</strong>
                <label class="toggle-switch">
                    <input type="checkbox" id="promo-active-${idx}" ${p.active !== false ? 'checked' : ''}>
                    <span>Active</span>
                </label>
            </div>
            <div class="form-grid">
                <div class="form-group">
                    <label>Bookmaker / Sponsor Name</label>
                    <input type="text" id="promo-name-${idx}" value="${p.bookmaker || ''}">
                </div>
                <div class="form-group">
                    <label>Badge Color (HEX)</label>
                    <input type="text" id="promo-color-${idx}" value="${p.badgeColor || '#2563eb'}">
                </div>
                <div class="form-group">
                    <label>Headline / Bonus Offer</label>
                    <input type="text" id="promo-headline-${idx}" value="${p.headline || ''}">
                </div>
                <div class="form-group">
                    <label>Promo Code</label>
                    <input type="text" id="promo-code-${idx}" value="${p.promoCode || ''}">
                </div>
                <div class="form-group">
                    <label>CTA Button Text</label>
                    <input type="text" id="promo-cta-${idx}" value="${p.ctaText || 'Claim Bonus'}">
                </div>
                <div class="form-group">
                    <label>Affiliate Destination URL</label>
                    <input type="text" id="promo-url-${idx}" value="${p.linkUrl || '#'}">
                </div>
            </div>
        </div>
    `).join('');
}

function renderAdSlots(ads) {
    const slots = [
        { key: 'header', label: 'Top Header Leaderboard (728x90)' },
        { key: 'infeed', label: 'In-Feed Match List Separator' },
        { key: 'drawer', label: 'Match Center Modal / Drawer Sponsor' },
        { key: 'footer', label: 'Bottom Footer Banner' }
    ];

    const container = document.getElementById('ad-slots-container');
    container.innerHTML = slots.map(slot => {
        const ad = ads[slot.key] || {};
        return `
            <div style="border: 1px solid var(--border-subtle); border-radius: 8px; padding: 16px; margin-bottom: 14px; background: var(--bg-canvas);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                    <strong>${slot.label}</strong>
                    <label class="toggle-switch">
                        <input type="checkbox" id="ad-enabled-${slot.key}" ${ad.enabled ? 'checked' : ''}>
                        <span>Slot Enabled</span>
                    </label>
                </div>
                <div class="form-grid">
                    <div class="form-group">
                        <label>Format</label>
                        <select id="ad-type-${slot.key}">
                            <option value="html" ${ad.type !== 'image' ? 'selected' : ''}>Custom HTML / AdSense Script</option>
                            <option value="image" ${ad.type === 'image' ? 'selected' : ''}>Banner Image with Link</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Image URL (If Image Format)</label>
                        <input type="text" id="ad-img-${slot.key}" value="${ad.imageUrl || ''}" placeholder="https://...">
                    </div>
                    <div class="form-group">
                        <label>Click URL (If Image Format)</label>
                        <input type="text" id="ad-link-${slot.key}" value="${ad.linkUrl || ''}" placeholder="https://...">
                    </div>
                </div>
                <div class="form-group" style="margin-top: 10px;">
                    <label>HTML Code / Ad Tag Snippet</label>
                    <textarea id="ad-html-${slot.key}" rows="3" placeholder="<script>...</script>">${ad.htmlContent || ''}</textarea>
                </div>
            </div>
        `;
    }).join('');
}

async function saveBrandingSettings() {
    const payload = {
        siteTitle: document.getElementById('setting-site-title').value.trim(),
        tagline: document.getElementById('setting-tagline').value.trim(),
        announcementActive: document.getElementById('setting-announcement-active').checked,
        announcement: document.getElementById('setting-announcement').value.trim()
    };
    await updateSettingsPayload(payload, 'Branding settings saved!');
}

async function saveSocialSettings() {
    const socialLinks = {
        twitter: document.getElementById('setting-social-twitter')?.value.trim() || '',
        telegram: document.getElementById('setting-social-telegram')?.value.trim() || '',
        discord: document.getElementById('setting-social-discord')?.value.trim() || '',
        github: document.getElementById('setting-social-github')?.value.trim() || '',
        facebook: document.getElementById('setting-social-facebook')?.value.trim() || '',
        instagram: document.getElementById('setting-social-instagram')?.value.trim() || '',
        youtube: document.getElementById('setting-social-youtube')?.value.trim() || '',
        linkedin: document.getElementById('setting-social-linkedin')?.value.trim() || ''
    };
    await updateSettingsPayload({ socialLinks }, 'Social media links saved successfully!');
}

async function saveInfeedSettings() {
    const infeedSettings = {
        autoSyncEnabled: document.getElementById('setting-infeed-autosync')?.checked !== false,
        syncIntervalSeconds: Number(document.getElementById('setting-infeed-interval')?.value) || 45,
        providers: {
            espn: true,
            livescore: true
        },
        infeedCard: {
            enabled: document.getElementById('setting-infeed-card-enabled')?.checked !== false,
            badgeText: document.getElementById('setting-infeed-card-badge')?.value.trim() || 'LIVE INFEED',
            badgeColor: document.getElementById('setting-infeed-card-color')?.value.trim() || '#2563eb',
            headline: document.getElementById('setting-infeed-card-headline')?.value.trim() || '',
            subtext: document.getElementById('setting-infeed-card-subtext')?.value.trim() || '',
            ctaText: document.getElementById('setting-infeed-card-cta-text')?.value.trim() || 'Get API Access',
            ctaUrl: document.getElementById('setting-infeed-card-cta-url')?.value.trim() || '/pricing',
            customHtml: document.getElementById('setting-infeed-card-html')?.value.trim() || ''
        }
    };
    await updateSettingsPayload({ infeedSettings }, 'Live infeed settings saved successfully!');
}

async function triggerInfeedSync(type = 'infeed') {
    const indicator = document.getElementById('sync-status-indicator');
    const btnInfeed = document.getElementById('btn-sync-infeed');
    const btnStats = document.getElementById('btn-sync-stats');
    const btnAll = document.getElementById('btn-sync-all');

    if (indicator) {
        indicator.style.display = 'block';
        indicator.style.background = 'rgba(37, 99, 235, 0.1)';
        indicator.style.color = 'var(--color-primary)';
        indicator.style.border = '1px solid rgba(37, 99, 235, 0.3)';
        if (type === 'stats') {
            indicator.innerHTML = '<span class="loader" style="display:inline-block; width:14px; height:14px; margin-right:8px; vertical-align:middle;"></span> Ingesting in-game telemetry & incidents across all worldwide leagues for Norra AI training...';
        } else {
            indicator.innerHTML = '<span class="loader" style="display:inline-block; width:14px; height:14px; margin-right:8px; vertical-align:middle;"></span> Synchronizing live games infeed across global feeds...';
        }
    }
    if (btnInfeed) btnInfeed.disabled = true;
    if (btnStats) btnStats.disabled = true;
    if (btnAll) btnAll.disabled = true;

    try {
        const res = await fetch('/api/admin/sync', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${adminToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ type })
        });
        const data = await res.json();
        if (res.ok) {
            if (indicator) {
                indicator.style.background = 'rgba(16, 185, 129, 0.1)';
                indicator.style.color = '#10b981';
                indicator.style.border = '1px solid rgba(16, 185, 129, 0.3)';
                indicator.innerHTML = `✓ ${data.message} &bull; Total matches: <strong>${data.stats?.matchesCount || 0}</strong> | With in-game stats: <strong>${data.stats?.withStatsCount || 0}</strong> | In-Play live: <strong>${data.stats?.inPlayCount || 0}</strong> | Active competitions: <strong>${data.stats?.leaguesCount || 0}</strong>`;
            }
            loadStats();
        } else {
            if (indicator) {
                indicator.style.background = 'rgba(239, 68, 68, 0.1)';
                indicator.style.color = '#ef4444';
                indicator.style.border = '1px solid rgba(239, 68, 68, 0.3)';
                indicator.innerHTML = `⚠️ ${data.error || 'Sync encountered an error.'}`;
            }
        }
    } catch (err) {
        if (indicator) {
            indicator.style.background = 'rgba(239, 68, 68, 0.1)';
            indicator.style.color = '#ef4444';
            indicator.style.border = '1px solid rgba(239, 68, 68, 0.3)';
            indicator.innerHTML = `⚠️ Network error while initiating sync: ${err.message}`;
        }
    } finally {
        if (btnInfeed) btnInfeed.disabled = false;
        if (btnStats) btnStats.disabled = false;
        if (btnAll) btnAll.disabled = false;
    }
}

async function saveBookiePromos() {
    const promos = [];
    for (let i = 0; i < 3; i++) {
        promos.push({
            bookmaker: document.getElementById(`promo-name-${i}`)?.value.trim() || 'Sponsor',
            badgeColor: document.getElementById(`promo-color-${i}`)?.value.trim() || '#2563eb',
            headline: document.getElementById(`promo-headline-${i}`)?.value.trim() || '',
            promoCode: document.getElementById(`promo-code-${i}`)?.value.trim() || '',
            ctaText: document.getElementById(`promo-cta-${i}`)?.value.trim() || 'Claim Bonus',
            linkUrl: document.getElementById(`promo-url-${i}`)?.value.trim() || '#',
            active: document.getElementById(`promo-active-${i}`)?.checked !== false
        });
    }
    await updateSettingsPayload({ bookiePromos: promos }, 'Bookmaker sponsor promos saved!');
}

async function saveAdSettings() {
    const slotKeys = ['header', 'infeed', 'drawer', 'footer'];
    const ads = {};
    slotKeys.forEach(k => {
        ads[k] = {
            enabled: document.getElementById(`ad-enabled-${k}`)?.checked || false,
            type: document.getElementById(`ad-type-${k}`)?.value || 'html',
            imageUrl: document.getElementById(`ad-img-${k}`)?.value.trim() || '',
            linkUrl: document.getElementById(`ad-link-${k}`)?.value.trim() || '',
            htmlContent: document.getElementById(`ad-html-${k}`)?.value.trim() || ''
        };
    });
    await updateSettingsPayload({ ads }, 'Ad slot settings saved!');
}

async function savePlanSettings() {
    const plans = {
        starter: {
            priceUsd: Number(document.getElementById('plan-starter-price').value) || 19,
            rateLimitPerMinute: Number(document.getElementById('plan-starter-limit').value) || 500
        },
        pro: {
            priceUsd: Number(document.getElementById('plan-pro-price').value) || 49,
            rateLimitPerMinute: Number(document.getElementById('plan-pro-limit').value) || 1500
        },
        whitelabel: {
            priceUsd: Number(document.getElementById('plan-whitelabel-price').value) || 99,
            rateLimitPerMinute: Number(document.getElementById('plan-whitelabel-limit').value) || 5000
        }
    };
    await updateSettingsPayload({ plans }, 'Plan pricing updated successfully!');
}

async function saveGatewaySettings() {
    const paymentSettings = {
        flutterwaveEnabled: document.getElementById('setting-flw-enabled').checked,
        paypalEnabled: document.getElementById('setting-pp-enabled').checked,
        baseCurrency: 'USD'
    };
    await updateSettingsPayload({ paymentSettings }, 'Payment gateway preferences saved!');
}

async function saveBookingSettings() {
    const bookingSettings = {
        hookEnabled: document.getElementById('setting-booking-hook-enabled').checked,
        referralCode: document.getElementById('setting-booking-referral').value.trim() || 'NORRA_AI'
    };
    await updateSettingsPayload({ bookingSettings }, 'Betting hook settings saved!');
}

async function updateSettingsPayload(payload, successMsg) {
    try {
        const res = await fetch('/api/admin/settings', {
            method: 'PUT',
            headers: {
                Authorization: `Bearer ${adminToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (res.ok) {
            alert(successMsg || 'Settings saved successfully!');
            loadSettings();
        } else {
            alert(data.error || 'Failed to save settings.');
        }
    } catch (err) {
        alert('Network error while saving settings.');
    }
}

async function loadApiKeysAndUsers() {
    try {
        const [keysRes, usersRes] = await Promise.all([
            fetch('/api/admin/keys', { headers: { Authorization: `Bearer ${adminToken}` } }),
            fetch('/api/admin/users', { headers: { Authorization: `Bearer ${adminToken}` } })
        ]);

        const keysData = await keysRes.json();
        const usersData = await usersRes.json();

        const keysBody = document.getElementById('api-keys-body');
        if (keysData.keys && keysData.keys.length) {
            keysBody.innerHTML = keysData.keys.map(k => `
                <tr>
                    <td><code>${k.key.slice(0, 12)}...</code></td>
                    <td><strong>${k.name}</strong><br><small style="color:var(--text-muted);">${k.email}</small></td>
                    <td><span style="text-transform:uppercase; font-weight:600;">${k.plan}</span></td>
                    <td>${k.rateLimitPerMinute}</td>
                    <td>${k.isAdFree ? '✅ Yes' : '❌ No'}</td>
                    <td>${k.totalRequests || 0}</td>
                    <td>${k.expiresAt ? new Date(k.expiresAt).toLocaleDateString() : 'Never'}</td>
                    <td>
                        <button class="btn-secondary" style="color: #ef4444; padding: 4px 8px; font-size: 11px;" onclick="revokeKey('${k._id}')">Revoke</button>
                    </td>
                </tr>
            `).join('');
        } else {
            keysBody.innerHTML = '<tr><td colspan="8" style="text-align:center;">No API keys issued yet.</td></tr>';
        }

        const usersBody = document.getElementById('users-body');
        if (usersData.users && usersData.users.length) {
            usersBody.innerHTML = usersData.users.map(u => `
                <tr>
                    <td><strong>${u.email}</strong></td>
                    <td>${u.fullName || '—'} ${u.companyName ? `(${u.companyName})` : ''}</td>
                    <td><span style="text-transform:uppercase; font-weight:600;">${u.plan}</span></td>
                    <td>${new Date(u.created_at).toLocaleDateString()}</td>
                    <td>${u.role}</td>
                </tr>
            `).join('');
        } else {
            usersBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No developer accounts registered yet.</td></tr>';
        }
    } catch (err) {
        console.error('Failed to load keys & users:', err);
    }
}

async function revokeKey(id) {
    if (!confirm('Are you sure you want to revoke this API key?')) return;
    try {
        const res = await fetch(`/api/admin/keys/${id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        if (res.ok) {
            alert('API key revoked.');
            loadApiKeysAndUsers();
        }
    } catch (err) {
        alert('Failed to revoke API key.');
    }
}

function openIssueKeyModal() {
    const email = prompt('Enter customer / partner email:');
    if (!email) return;
    const plan = prompt('Enter plan (starter, pro, whitelabel):', 'pro') || 'pro';

    fetch('/api/admin/keys', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${adminToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, plan, name: `${plan.toUpperCase()} Enterprise Partner` })
    })
    .then(r => r.json())
    .then(data => {
        if (data.status === 'success' && data.key) {
            alert(`Key issued successfully!\nKey: ${data.key.key}`);
            loadApiKeysAndUsers();
        } else {
            alert(data.error || 'Failed to issue key.');
        }
    })
    .catch(() => alert('Failed to issue key.'));
}

async function saveAuthAndEmailSettings() {
    const authSettings = {
        googleClientId: document.getElementById('setting-google-client-id').value.trim(),
        requireEmailVerification: document.getElementById('setting-require-verification').checked
    };

    const smtpSettings = {
        enabled: document.getElementById('setting-smtp-enabled').checked,
        host: document.getElementById('setting-smtp-host').value.trim(),
        port: parseInt(document.getElementById('setting-smtp-port').value) || 587,
        user: document.getElementById('setting-smtp-user').value.trim(),
        pass: document.getElementById('setting-smtp-pass').value,
        fromEmail: document.getElementById('setting-smtp-from').value.trim() || 'Norra AI <support@mynorra.xyz>'
    };

    try {
        const res = await fetch('/api/admin/settings', {
            method: 'PUT',
            headers: {
                Authorization: `Bearer ${adminToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ authSettings, smtpSettings })
        });
        const data = await res.json();
        if (res.ok) {
            alert('Authentication & Email settings saved successfully!');
        } else {
            alert(data.error || 'Failed to save settings.');
        }
    } catch (err) {
        alert('Connection error saving settings.');
    }
}

function toggleTheme() {
    if (typeof window.toggleTheme === 'function') {
        window.toggleTheme();
    }
}

// Initial boot
document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('norra_theme') || 'dark';
    if (savedTheme === 'light') {
        document.body.classList.remove('theme-dark');
        document.body.setAttribute('data-theme', 'light');
    }
    checkAuth();
});
