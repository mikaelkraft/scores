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
            var icons = document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"], #site-favicon');
            if (icons.length > 0) {
                icons.forEach(function (link) {
                    link.removeAttribute('type');
                    link.href = b.faviconUrl;
                });
            } else {
                var fav = document.createElement('link');
                fav.rel = 'icon';
                fav.href = b.faviconUrl;
                document.head.appendChild(fav);
            }
        }

        // Sync social links if present in footer (and create optional icon buttons if absent on secondary pages)
        if (cfg.socialLinks && typeof cfg.socialLinks === 'object') {
            var socialContainer = document.getElementById('footer-social-links');
            var extraSvgs = {
                facebook: { title: 'Facebook', svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>' },
                instagram: { title: 'Instagram', svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>' },
                youtube: { title: 'YouTube', svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>' },
                linkedin: { title: 'LinkedIn', svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 10.9v8.37H9.2V10.9H6.46M7.83 6.64a1.66 1.66 0 0 0-1.66 1.66c0 .92.74 1.66 1.66 1.66a1.66 1.66 0 0 0 1.66-1.66c0-.92-.74-1.66-1.66-1.66z"/></svg>' }
            };
            ['twitter', 'telegram', 'discord', 'github', 'facebook', 'instagram', 'youtube', 'linkedin'].forEach(function (key) {
                var url = String(cfg.socialLinks[key] || '').trim();
                var a = document.getElementById('social-link-' + key);
                if (!a && url && socialContainer && extraSvgs[key]) {
                    a = document.createElement('a');
                    a.id = 'social-link-' + key;
                    a.target = '_blank';
                    a.rel = 'noopener noreferrer';
                    a.className = 'social-icon-btn';
                    a.title = extraSvgs[key].title;
                    a.setAttribute('aria-label', extraSvgs[key].title);
                    a.innerHTML = extraSvgs[key].svg;
                    socialContainer.appendChild(a);
                }
                if (!a) return;
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
