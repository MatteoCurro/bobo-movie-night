package it.bobomovieclub.tvprobe;

import android.app.Activity;
import android.os.Bundle;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.Uri;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebSettings;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.text.InputType;

public final class MainActivity extends Activity {
    private static final String SITE = "https://movie.curromatteo.it/";
    private FrameLayout root;
    private WebView browser;
    private View menu;
    private TextView loading;
    private View fullScreenView;
    private WebChromeClient.CustomViewCallback fullScreenCallback;

    @Override
    public void onCreate(Bundle saved) {
        super.onCreate(saved);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        immersive();

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(12, 12, 18));
        browser = new WebView(this);
        browser.setBackgroundColor(Color.BLACK);
        browser.setFocusable(true);
        browser.setFocusableInTouchMode(true);

        WebSettings settings = browser.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(browser, true);
        WebView.setWebContentsDebuggingEnabled(true);

        browser.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) return false;
                Uri uri = request.getUrl();
                if ("about".equals(uri.getScheme())) return false;
                return !isAllowedTopLevel(uri);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                loading.setVisibility(View.GONE);
            }
        });
        browser.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int progress) {
                if (loading == null || browser.getVisibility() != View.VISIBLE) return;
                loading.setText("Bobo · Caricamento " + progress + "%");
                loading.setVisibility(progress >= 100 ? View.GONE : View.VISIBLE);
            }

            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (fullScreenView != null) {
                    callback.onCustomViewHidden();
                    return;
                }
                fullScreenView = view;
                fullScreenCallback = callback;
                root.addView(view, new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
                browser.setVisibility(View.GONE);
                if (loading != null) loading.setVisibility(View.GONE);
                immersive();
            }

            @Override
            public void onHideCustomView() {
                leaveFullScreen();
            }
        });
        root.addView(browser, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        menu = makeMenu();
        root.addView(menu, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        loading = new TextView(this);
        loading.setTextColor(Color.WHITE);
        loading.setTextSize(13);
        loading.setPadding(dp(16), dp(8), dp(16), dp(8));
        loading.setBackgroundColor(0xCC161620);
        loading.setVisibility(View.GONE);
        FrameLayout.LayoutParams loadingParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT,
            Gravity.BOTTOM | Gravity.RIGHT);
        loadingParams.setMargins(dp(16), dp(16), dp(16), dp(16));
        root.addView(loading, loadingParams);
        setContentView(root);

        browser.setVisibility(View.GONE);
        menu.setVisibility(View.VISIBLE);
        String requested = getIntent().getStringExtra("url");
        if (requested != null) openUrl(requested);
    }

    private boolean isAllowedTopLevel(Uri uri) {
        return "https".equalsIgnoreCase(uri.getScheme())
            && ("movie.curromatteo.it".equalsIgnoreCase(uri.getHost())
                || "vixsrc.to".equalsIgnoreCase(uri.getHost()));
    }

    private void openUrl(String url) {
        try {
            Uri uri = Uri.parse(url);
            if (!isAllowedTopLevel(uri)) return;
            menu.setVisibility(View.GONE);
            browser.setVisibility(View.VISIBLE);
            browser.onResume();
            browser.loadUrl(url);
            browser.requestFocus();
        } catch (Exception ignored) {
        }
    }

    private View makeMenu() {
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(0xFF101014);

        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setGravity(Gravity.CENTER);
        panel.setPadding(dp(48), dp(26), dp(48), dp(26));
        scroll.addView(panel);

        TextView title = new TextView(this);
        title.setText("BOBO · TEST PLAYER TV");
        title.setTextColor(0xFFBDFF56);
        title.setTextSize(27);
        title.setGravity(Gravity.CENTER);
        panel.addView(title, new LinearLayout.LayoutParams(-1, dp(52)));

        TextView desc = new TextView(this);
        desc.setText("WebView Android TV · Vix nell'iframe originale di Bobo. Seleziona un titolo dal catalogo oppure inserisci un ID TMDB.");
        desc.setTextColor(Color.WHITE);
        desc.setTextSize(16);
        desc.setGravity(Gravity.CENTER);
        panel.addView(desc, new LinearLayout.LayoutParams(-1, dp(58)));

        Button site = button("Apri Bobo Movie Club");
        panel.addView(site, new LinearLayout.LayoutParams(dp(500), dp(54)));
        site.setOnClickListener(v -> openUrl(SITE));

        EditText idField = new EditText(this);
        idField.setHint("ID TMDB (es. dal link della scheda)");
        idField.setSingleLine(true);
        idField.setInputType(InputType.TYPE_CLASS_NUMBER);
        idField.setTextColor(Color.WHITE);
        idField.setHintTextColor(0xFFAAAAAA);
        idField.setTextSize(18);
        idField.setPadding(dp(16), 0, dp(16), 0);
        panel.addView(idField, new LinearLayout.LayoutParams(dp(500), dp(54)));

        LinearLayout actions = new LinearLayout(this);
        actions.setGravity(Gravity.CENTER);
        panel.addView(actions, new LinearLayout.LayoutParams(-1, dp(64)));

        Button movie = button("Prova film");
        actions.addView(movie, new LinearLayout.LayoutParams(dp(238), dp(54)));
        Button series = button("Prova serie S1 E1");
        LinearLayout.LayoutParams seriesP = new LinearLayout.LayoutParams(dp(238), dp(54));
        seriesP.leftMargin = dp(20);
        actions.addView(series, seriesP);

        movie.setOnClickListener(v -> {
            String id = idField.getText().toString().trim();
            if (id.matches("[0-9]{1,10}")) {
                openUrl(SITE + "watch.html?type=movie&id=" + id + "&debug=player");
            } else idField.setError("Inserisci un ID TMDB numerico");
        });
        series.setOnClickListener(v -> {
            String id = idField.getText().toString().trim();
            if (id.matches("[0-9]{1,10}")) {
                openUrl(SITE + "watch.html?type=tv&id=" + id + "&s=1&e=1&debug=player");
            } else idField.setError("Inserisci un ID TMDB numerico");
        });

        TextView guide = new TextView(this);
        guide.setText("Dal Mac puoi aprire direttamente una scheda con adb shell am start ... --es url <indirizzo>.\nBACK torna indietro; MENU riapre questa schermata. Il fullscreen del player è gestito da Android.");
        guide.setTextColor(0xFFB0B0C0);
        guide.setTextSize(13);
        guide.setGravity(Gravity.CENTER);
        panel.addView(guide, new LinearLayout.LayoutParams(-1, dp(65)));

        site.requestFocus();
        return scroll;
    }

    private Button button(String label) {
        Button button = new Button(this);
        button.setText(label);
        button.setAllCaps(false);
        button.setTextSize(16);
        return button;
    }

    private int dp(int px) {
        return Math.round(px * getResources().getDisplayMetrics().density);
    }

    private void immersive() {
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_FULLSCREEN |
            View.SYSTEM_UI_FLAG_HIDE_NAVIGATION |
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }

    private void leaveFullScreen() {
        if (fullScreenView == null) return;
        root.removeView(fullScreenView);
        fullScreenView = null;
        browser.setVisibility(View.VISIBLE);
        if (fullScreenCallback != null) {
            fullScreenCallback.onCustomViewHidden();
            fullScreenCallback = null;
        }
        immersive();
        browser.requestFocus();
    }

    private void showMenu() {
        if (fullScreenView != null) leaveFullScreen();
        browser.onPause();
        browser.setVisibility(View.GONE);
        menu.setVisibility(View.VISIBLE);
        menu.requestFocus();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        String requested = intent.getStringExtra("url");
        if (requested != null) {
            browser.onResume();
            openUrl(requested);
        }
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_MENU) {
            showMenu();
            return true;
        }
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            if (fullScreenView != null) {
                leaveFullScreen();
                return true;
            }
            if (menu.getVisibility() != View.VISIBLE) {
                if (browser.canGoBack()) browser.goBack();
                else showMenu();
                return true;
            }
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onDestroy() {
        if (fullScreenView != null) leaveFullScreen();
        browser.destroy();
        super.onDestroy();
    }
}
