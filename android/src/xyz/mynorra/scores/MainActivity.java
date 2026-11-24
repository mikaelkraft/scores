package xyz.mynorra.scores;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ProgressBar;

public class MainActivity extends Activity {
    private static final String APP_URL = "https://scores.mynorra.xyz/";
    private WebView webView;
    private ProgressBar progressBar;
    private String lastRequestedUrl = APP_URL;

    private static boolean isAllowedAppHost(String host) {
        if (host == null) return false;
        String h = host.toLowerCase();
        return h.equals("mynorra.xyz")
            || h.endsWith(".mynorra.xyz")
            || h.equals("localhost")
            || h.equals("127.0.0.1");
    }

    private void showOfflineFallback(WebView view, String failedUrl) {
        String safeUrl = (failedUrl != null && failedUrl.startsWith("http")) ? failedUrl : APP_URL;
        String escaped = safeUrl.replace("\"", "&quot;").replace("'", "&#39;");
        String html = "<!DOCTYPE html><html><head><meta charset='utf-8'>"
            + "<meta name='viewport' content='width=device-width,initial-scale=1'>"
            + "<style>body{background:#0b0f19;color:#f8fafc;font-family:-apple-system,Roboto,sans-serif;"
            + "display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;box-sizing:border-box;text-align:center;}"
            + ".card{background:#111827;border:1px solid rgba(255,255,255,0.1);border-radius:14px;padding:28px 22px;max-width:360px;width:100%;}"
            + "h2{margin:0 0 10px;font-size:19px;}p{color:#94a3b8;font-size:14px;line-height:1.5;margin:0 0 20px;}"
            + "a.btn{display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-weight:700;padding:12px 24px;border-radius:8px;font-size:14px;}"
            + "</style></head><body><div class='card'><h2>Connection Interrupted</h2>"
            + "<p>Live football scores require an active internet connection. Check your network and tap Retry.</p>"
            + "<a class='btn' href='" + escaped + "'>Retry</a></div></body></html>";
        view.loadDataWithBaseURL(APP_URL, html, "text/html", "UTF-8", null);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = (WebView) findViewById(R.id.webview);
        progressBar = (ProgressBar) findViewById(R.id.progressbar);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadsImagesAutomatically(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setUserAgentString(settings.getUserAgentString() + " NorraScoreApp/1.0.0");

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                if (newProgress < 100) {
                    progressBar.setVisibility(View.VISIBLE);
                    progressBar.setProgress(newProgress);
                } else {
                    progressBar.setVisibility(View.GONE);
                }
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme();
                String host = uri.getHost();
                if (("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme)) && isAllowedAppHost(host)) {
                    lastRequestedUrl = uri.toString();
                    return false;
                }
                try {
                    Intent intent = new Intent(Intent.ACTION_VIEW, uri);
                    startActivity(intent);
                    return true;
                } catch (Exception e) {
                    return true;
                }
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                if (url != null && url.startsWith("http")) {
                    lastRequestedUrl = url;
                }
                progressBar.setVisibility(View.VISIBLE);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                progressBar.setVisibility(View.GONE);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request != null && request.isForMainFrame()) {
                    progressBar.setVisibility(View.GONE);
                    showOfflineFallback(view, lastRequestedUrl);
                }
            }
        });

        if (savedInstanceState == null) {
            Intent intent = getIntent();
            Uri data = intent != null ? intent.getData() : null;
            if (data != null && isAllowedAppHost(data.getHost())) {
                lastRequestedUrl = data.toString();
                webView.loadUrl(lastRequestedUrl);
            } else {
                lastRequestedUrl = APP_URL;
                webView.loadUrl(APP_URL);
            }
        } else {
            webView.restoreState(savedInstanceState);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.onResume();
            webView.resumeTimers();
        }
    }

    @Override
    protected void onPause() {
        if (webView != null) {
            webView.onPause();
            webView.pauseTimers();
        }
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.stopLoading();
            webView.setWebChromeClient(null);
            webView.setWebViewClient(null);
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (webView != null) {
            webView.saveState(outState);
        }
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && webView != null && webView.canGoBack()) {
            webView.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }
}
