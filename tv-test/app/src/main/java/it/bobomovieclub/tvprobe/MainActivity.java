package it.bobomovieclub.tvprobe;

import android.app.Activity;
import android.os.Bundle;
import android.graphics.Color;
import android.net.Uri;
import android.util.Log;
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
import android.widget.FrameLayout;

import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Collections;

public final class MainActivity extends Activity {
    private static final String TAG = "BoboTV";
    private static final String SITE = "https://movie.curromatteo.it/";
    private FrameLayout root;
    private WebView browser;
    private View customView;
    private WebChromeClient.CustomViewCallback customCallback;
    private boolean inPlayer = false;
    private boolean playingStarted = false;

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        immersive();

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        browser = new WebView(this);
        browser.setBackgroundColor(Color.rgb(16, 21, 27));
        browser.setFocusable(true);
        browser.setFocusableInTouchMode(true);
        browser.setOverScrollMode(View.OVER_SCROLL_NEVER);

        WebSettings settings = browser.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setDefaultTextEncodingName("UTF-8");
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(browser, true);

        browser.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) return false;
                // This application never navigates to a third-party web page.
                // Vix must remain inside its dedicated iframe.
                return true;
            }
        });
        browser.setWebChromeClient(new WebChromeClient() {
            @Override public void onShowCustomView(View view, CustomViewCallback callback) {
                if (customView != null) {
                    callback.onCustomViewHidden();
                    return;
                }
                customView = view;
                customCallback = callback;
                root.addView(view, new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
                browser.setVisibility(View.INVISIBLE);
                immersive();
            }
            @Override public void onHideCustomView() {
                closeCustomView();
            }
        });

        root.addView(browser, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);

        setupOriginRestrictedBridge();

        String html = asset("tv.html")
            .replace("<!--TV_STYLES-->", "<style>" + asset("tv.css") + "</style>")
            .replace("<!--TV_SCRIPT-->", "<script>" + asset("tv.js") + "</script>");
        browser.loadDataWithBaseURL(SITE, html, "text/html", "UTF-8", SITE);
        browser.requestFocus();
    }

    private String asset(String path) {
        try (InputStream stream = getAssets().open(path);
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] bytes = new byte[8192];
            int length;
            while ((length = stream.read(bytes)) >= 0) {
                if (length > 0) output.write(bytes, 0, length);
            }
            return output.toString("UTF-8");
        } catch (Exception error) {
            Log.e(TAG, "Unable to load asset " + path, error);
            return "";
        }
    }

    private void setupOriginRestrictedBridge() {
        // Modern Android WebView: only trusted first-party TV UI can update
        // native playback state. Third-party iframes cannot reach this bridge.
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            try {
                WebViewCompat.addWebMessageListener(browser, "BoboNative",
                    Collections.singleton(SITE.substring(0, SITE.length() - 1)),
                    (view, message, sourceOrigin, isMainFrame, replyProxy) -> {
                        if (!isMainFrame) return;
                        try {
                            JSONObject data = new JSONObject(message.getData());
                            String kind = data.optString("event", "");
                            if ("state".equals(kind)) {
                                boolean player = data.optBoolean("player", false);
                                boolean started = data.optBoolean("started", false);
                                runOnUiThread(() -> {
                                    inPlayer = player;
                                    playingStarted = started;
                                    Log.d(TAG, "Playback state player=" + player + " started=" + started);
                                });
                            } else if ("exit".equals(kind)) {
                                runOnUiThread(this::finish);
                            }
                        } catch (Exception ignored) {
                        }
                    });
            } catch (Exception error) {
                Log.w(TAG, "Trusted TV UI bridge not available", error);
            }
        }
        // The optional player bridge is injected ONLY into Vix frames and
        // exposes no Java/native objects to external content.
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            try {
                WebViewCompat.addDocumentStartJavaScript(
                    browser, asset("vix-bridge.js"),
                    new HashSet<>(Arrays.asList(
                        "https://vixsrc.to", "https://*.vixsrc.to")));
            } catch (Exception error) {
                Log.w(TAG, "Direct Vix media control unavailable; fallback will be used", error);
            }
        }
    }

    private void send(String key) {
        // The event is delivered to our own local TV UI, not the iframe.
        browser.evaluateJavascript(
            "window.BoboTV && window.BoboTV.remoteKey('" + key + "')", null);
    }

    private void closeCustomView() {
        if (customView == null) return;
        root.removeView(customView);
        customView = null;
        browser.setVisibility(View.VISIBLE);
        if (customCallback != null) {
            WebChromeClient.CustomViewCallback callback = customCallback;
            customCallback = null;
            callback.onCustomViewHidden();
        }
        immersive();
        browser.requestFocus();
    }

    private void immersive() {
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }

    @Override public boolean dispatchKeyEvent(KeyEvent event) {
        // Activity-level dispatch occurs BEFORE the focused WebView/iframe,
        // unlike onKeyDown(), which the WebView may consume first.
        if (inPlayer) {
            final int code = event.getKeyCode();
            if (code == KeyEvent.KEYCODE_BACK || code == KeyEvent.KEYCODE_ESCAPE) {
                if (event.getAction() == KeyEvent.ACTION_UP) {
                    if (customView != null) closeCustomView();
                    else browser.evaluateJavascript("window.BoboTV && window.BoboTV.back()", null);
                }
                return true;
            }
            String command = null;
            switch (code) {
                case KeyEvent.KEYCODE_DPAD_CENTER:
                case KeyEvent.KEYCODE_ENTER:
                case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
                    command = "center"; break;
                case KeyEvent.KEYCODE_DPAD_LEFT:
                    command = "left"; break;
                case KeyEvent.KEYCODE_DPAD_RIGHT:
                    command = "right"; break;
                case KeyEvent.KEYCODE_DPAD_DOWN:
                    command = "down"; break;
                case KeyEvent.KEYCODE_DPAD_UP:
                    command = "up"; break;
                default: break;
            }
            if (command != null) {
                if (event.getAction() == KeyEvent.ACTION_DOWN && event.getRepeatCount() == 0) {
                    Log.d(TAG, "Remote command: " + command);
                    send(command);
                }
                return true;
            }
        }
        return super.dispatchKeyEvent(event);
    }

    @Override public boolean onKeyDown(int code, KeyEvent event) {
        if (code == KeyEvent.KEYCODE_BACK || code == KeyEvent.KEYCODE_ESCAPE) {
            if (customView != null) {
                closeCustomView();
            } else {
                browser.evaluateJavascript(
                    "window.BoboTV && window.BoboTV.back()", null);
            }
            return true;
        }
        // Standard Google TV remotes lack Play/Pause and FF/Rewind buttons.
        // Once video is playing these D-pad keys are forwarded to Bobo's
        // simple playback control layer, even if the iframe owns web focus.
        if (inPlayer && playingStarted) {
            switch (code) {
                case KeyEvent.KEYCODE_DPAD_CENTER:
                case KeyEvent.KEYCODE_ENTER:
                case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
                    send("center");
                    return true;
                case KeyEvent.KEYCODE_DPAD_LEFT:
                    send("left");
                    return true;
                case KeyEvent.KEYCODE_DPAD_RIGHT:
                    send("right");
                    return true;
                case KeyEvent.KEYCODE_DPAD_DOWN:
                    send("down");
                    return true;
                case KeyEvent.KEYCODE_DPAD_UP:
                    send("up");
                    return true;
                default:
                    break;
            }
        }
        return super.onKeyDown(code, event);
    }

    @Override public void onBackPressed() {
        if (customView != null) closeCustomView();
        else browser.evaluateJavascript("window.BoboTV && window.BoboTV.back()", null);
    }

    @Override protected void onResume() {
        super.onResume();
        if (browser != null) browser.onResume();
        immersive();
    }

    @Override protected void onPause() {
        if (browser != null) browser.onPause();
        super.onPause();
    }

    @Override protected void onDestroy() {
        if (customView != null) closeCustomView();
        if (browser != null) {
            browser.loadUrl("about:blank");
            browser.destroy();
        }
        super.onDestroy();
    }
}
