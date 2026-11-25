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
import android.view.inputmethod.InputMethodManager;
import android.content.Context;
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
    private TvUpdater updater;
    private View customView;
    private WebChromeClient.CustomViewCallback customCallback;
    private boolean inPlayer = false;
    private boolean playingStarted = false;
    private int scrubDirection = 0;
    private int scrubSeconds = 0;
    private long lastScrubPreviewAt = 0;

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        immersive();

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        browser = new WebView(this);
        updater = new TvUpdater(this,browser);
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
            @Override public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view,url);
                if (updater != null) updater.check(false);
            }
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
            .replace("<!--TV_SCRIPT-->", "<script>" + asset("tv.js") + "</script>")
            .replace("<!--TV_ACCOUNT_SCRIPT-->", "<script>" + asset("tv-account.js") + "</script>")
            .replace("<!--TV_UPDATES_SCRIPT-->", "<script>" + asset("tv-updates.js") + "</script>");
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
                            } else if ("update-check".equals(kind)) {
                                if (updater != null) updater.check(true);
                            } else if ("update-install".equals(kind)) {
                                if (updater != null) updater.installUpdate();
                            } else if ("keyboard-hide".equals(kind)) {
                                runOnUiThread(() -> {
                                    InputMethodManager ime = (InputMethodManager)
                                        getSystemService(Context.INPUT_METHOD_SERVICE);
                                    if (ime != null) ime.hideSoftInputFromWindow(browser.getWindowToken(), 0);
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

    private void scrubPreview(String direction, int seconds) {
        browser.evaluateJavascript(
            "window.BoboTV && window.BoboTV.scrubPreview('" + direction + "'," + seconds + ")",null);
    }

    private void scrubCommit(String direction, int seconds) {
        browser.evaluateJavascript(
            "window.BoboTV && window.BoboTV.scrubCommit('" + direction + "'," + seconds + ")",null);
    }

    private static int acceleratedSeek(long heldMs) {
        if (heldMs < 450) return 10;
        if (heldMs < 850) return 30;
        if (heldMs < 1200) return 60;
        return (int) Math.min(7200L, 60L + ((heldMs - 1200L) / 260L + 1L) * 60L);
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
                if ("left".equals(command) || "right".equals(command)) {
                    final int direction = "left".equals(command) ? -1 : 1;
                    if (event.getAction() == KeyEvent.ACTION_DOWN) {
                        long held = Math.max(0, event.getEventTime() - event.getDownTime());
                        int seconds = acceleratedSeek(held);
                        if (scrubDirection != direction || scrubSeconds != seconds) {
                            scrubDirection = direction;
                            scrubSeconds = seconds;
                            if (event.getEventTime() - lastScrubPreviewAt > 100 ||
                                event.getRepeatCount() == 0) {
                                scrubPreview(command, seconds);
                                lastScrubPreviewAt = event.getEventTime();
                            }
                        }
                    } else if (event.getAction() == KeyEvent.ACTION_UP) {
                        int seconds = scrubDirection == direction ? scrubSeconds : 10;
                        scrubDirection = 0;
                        scrubSeconds = 0;
                        scrubCommit(command, Math.max(10, seconds));
                        Log.d(TAG, "Seek " + command + " " + seconds + " seconds");
                    }
                    return true;
                }
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
        if (updater != null) updater.onResume();
        immersive();
    }

    @Override protected void onPause() {
        if (browser != null) browser.onPause();
        CookieManager.getInstance().flush();
        super.onPause();
    }

    @Override protected void onDestroy() {
        if (updater != null) updater.destroy();
        if (customView != null) closeCustomView();
        if (browser != null) {
            browser.loadUrl("about:blank");
            browser.destroy();
        }
        super.onDestroy();
    }
}
