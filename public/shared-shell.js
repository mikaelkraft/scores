/* Shared Shell: Atomic Theme Switcher, Unified Brand Logos & Dynamic Pricing Sync */
(function () {
    function applyThemeUi(theme) {
        var cleanTheme = theme === 'light' ? 'light' : 'dark';
        var isLight = cleanTheme === 'light';
        document.documentElement.setAttribute('data-theme', cleanTheme);
        document.documentElement.classList.toggle('theme-light', isLight);
        if (document.body) {
            document.body.setAttribute('data-theme', cleanTheme);
            document.body.classList.toggle('theme-light', isLight);
        }
        var icon = isLight ? '🌙' : '☀️';
        var title = 'Switch to ' + (isLight ? 'Dark' : 'Light') + ' Mode';
        var b1 = document.getElementById('theme-toggle');
        var b2 = document.getElementById('sticky-theme-toggle');
        if (b1) { b1.textContent = icon; b1.title = title; }
        if (b2) { b2.textContent = icon; b2.title = title; }
        var meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', isLight ? '#ffffff' : '#080b12');
    }

    window.applyTheme = applyThemeUi;

    window.toggleTheme = function () {
        var current = document.documentElement.getAttribute('data-theme') ||
            localStorage.getItem('norra_theme') ||
            'dark';
        var next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.classList.add('no-theme-transition');
        applyThemeUi(next);
        void document.documentElement.offsetHeight;
        try {
            localStorage.setItem('norra_theme', next);
            localStorage.setItem('theme', next);
        } catch (e) {}
        setTimeout(function () {
            document.documentElement.classList.remove('no-theme-transition');
        }, 40);
    };

    var saved = 'dark';
    try {
        saved = localStorage.getItem('norra_theme') || localStorage.getItem('theme') || 'dark';
    } catch (e) {}
    applyThemeUi(saved);

    function bindThemeButtons() {
        var b1 = document.getElementById('theme-toggle');
        var b2 = document.getElementById('sticky-theme-toggle');
        if (b1) b1.onclick = window.toggleTheme;
        if (b2) b2.onclick = window.toggleTheme;
    }

    function applyBrandingAndPricing(cfg) {
        if (!cfg) return;
        var b = cfg.branding || {};
        var headerLogoImg = document.getElementById('header-logo-img');
        var headerBrandFallback = document.getElementById('header-brand-fallback');
        var headerBrandTitle = document.getElementById('header-brand-title') || document.querySelector('.brand-text strong');

        if (b.headerLogoUrl && headerLogoImg) {
            headerLogoImg.src = b.headerLogoUrl;
            headerLogoImg.alt = b.siteTitle || 'Norra Scores';
            headerLogoImg.hidden = false;
            headerLogoImg.style.display = 'block';
            if (headerBrandFallback) {
                headerBrandFallback.style.display = 'none';
                headerBrandFallback.hidden = true;
            }
        }
        if (b.siteTitle && headerBrandTitle) {
            headerBrandTitle.textContent = b.siteTitle;
        }

        var footerLogoImg = document.getElementById('footer-logo-img');
        var footerBrandText = document.getElementById('footer-brand-text') ||
            (footerLogoImg && footerLogoImg.parentElement ? footerLogoImg.parentElement.querySelector('span') : null);
        if (b.footerLogoUrl && footerLogoImg) {
            footerLogoImg.src = b.footerLogoUrl;
            footerLogoImg.alt = b.siteTitle || 'Norra Scores';
            footerLogoImg.hidden = false;
            footerLogoImg.style.display = 'block';
            if (footerBrandText) {
                footerBrandText.style.display = 'none';
                footerBrandText.hidden = true;
            }
        }

        if (b.faviconUrl) {
            var fav = document.getElementById('site-favicon') || document.querySelector('link[rel="icon"]');
            if (fav) fav.href = b.faviconUrl;
        }

        // Sync social links if present in footer
        if (cfg.socialLinks && typeof cfg.socialLinks === 'object') {
            ['twitter', 'telegram', 'discord', 'github', 'facebook', 'instagram', 'youtube', 'linkedin'].forEach(function (key) {
                var a = document.getElementById('social-link-' + key);
                if (!a) return;
                var url = String(cfg.socialLinks[key] || '').trim();
                if (url) {
                    a.href = url;
                    a.style.display = 'inline-flex';
                } else if (['facebook', 'instagram', 'youtube', 'linkedin'].indexOf(key) !== -1) {
                    a.style.display = 'none';
                }
            });
        }

        // Sync Supported & Sponsored partner bar if present in footer
        var partnersEl = document.getElementById('footer-partners');
        if (partnersEl && Array.isArray(cfg.partnerAttributions)) {
            var activePartners = cfg.partnerAttributions.filter(function (p) { return p && p.enabled !== false && p.name && p.url; });
            if (activePartners.length > 0) {
                var heading = partnersEl.querySelector('.footer-partners-heading');
                if (heading && cfg.partnerSectionTitle) heading.textContent = cfg.partnerSectionTitle;
                var row = partnersEl.querySelector('.footer-partners-row');
                if (row) {
                    row.innerHTML = activePartners.map(function (p) {
                        var safeName = String(p.name).replace(/[<>&"]/g, '');
                        var safeUrl = String(p.url).replace(/"/g, '%22');
                        if (p.logoUrl) {
                            var safeLogo = String(p.logoUrl).replace(/"/g, '%22');
                            return '<span class="footer-partner-item"><a href="' + safeUrl + '" rel="dofollow" target="_blank" title="' + safeName + '" aria-label="' + safeName + '" style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:14px;background:var(--bg-surface-elevated);border:1px solid var(--border-subtle);text-decoration:none;font:700 .76rem system-ui,sans-serif;color:var(--text-main);"><img src="' + safeLogo + '" alt="' + safeName + '" style="height:18px;width:auto;object-fit:contain;border-radius:3px;"><span>' + safeName + '</span></a></span>';
                        }
                        return '<span class="footer-partner-item"><a href="' + safeUrl + '" rel="dofollow" target="_blank" title="' + safeName + '" aria-label="' + safeName + '" style="display:inline-flex;align-items:center;justify-content:center;min-width:32px;height:28px;line-height:28px;padding:0 12px;background:#1e40af;color:#fff;border-radius:14px;text-decoration:none;font:700 .78rem system-ui,sans-serif;white-space:nowrap;">' + safeName + '</a></span>';
                    }).join('');
                }
                partnersEl.hidden = false;
            }
        }

        var plans = cfg.plans || {};
        if (plans.starter && plans.starter.priceUsd !== undefined) {
            document.querySelectorAll('[data-tier-price="starter"]').forEach(function (el) {
                el.textContent = '$' + plans.starter.priceUsd + '/mo';
            });
            document.querySelectorAll('[data-tier-price-num="starter"]').forEach(function (el) {
                el.textContent = '$' + plans.starter.priceUsd;
            });
        }
        if (plans.pro && plans.pro.priceUsd !== undefined) {
            document.querySelectorAll('[data-tier-price="pro"]').forEach(function (el) {
                el.textContent = '$' + plans.pro.priceUsd + '/mo';
            });
            document.querySelectorAll('[data-tier-price-num="pro"]').forEach(function (el) {
                el.textContent = '$' + plans.pro.priceUsd;
            });
        }
        if (plans.whitelabel && plans.whitelabel.priceUsd !== undefined) {
            document.querySelectorAll('[data-tier-price="whitelabel"]').forEach(function (el) {
                el.textContent = '$' + plans.whitelabel.priceUsd + '/mo';
            });
            document.querySelectorAll('[data-tier-price-num="whitelabel"]').forEach(function (el) {
                el.textContent = '$' + plans.whitelabel.priceUsd;
            });
        }
    }

    function init() {
        bindThemeButtons();
        fetch('/api/config/public', { headers: { Accept: 'application/json' } })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(applyBrandingAndPricing)
            .catch(function () {});
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
