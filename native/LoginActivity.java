package com.aldahih.app;

import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.Toast;
import java.io.File;
import java.io.FileWriter;

/** شاشة تسجيل دخول جوجل → تصدير الكوكيز بصيغة Netscape لاستخدامها مع yt-dlp. */
public class LoginActivity extends Activity {
    private static final String UA = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";
    private static final String LOGIN_URL = "https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fm.youtube.com%2F";
    private WebView web;
    private boolean exporting = false;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.BLACK);
        root.setFitsSystemWindows(true);
        web = new WebView(this);
        Button done = new Button(this);
        done.setText("تم تسجيل الدخول — حفظ الجلسة");
        root.addView(web, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        root.addView(done, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        setContentView(root);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setUserAgentString(UA);
        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(web, true);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView v, String url) {
                if (exporting && url != null && url.contains("robots.txt")) finishExport();
            }
        });
        done.setOnClickListener(v -> { exporting = true; web.loadUrl("https://www.youtube.com/robots.txt"); });
        web.loadUrl(LOGIN_URL);
    }

    private void finishExport() {
        exporting = false;
        CookieManager cm = CookieManager.getInstance();
        cm.flush();
        StringBuilder sb = new StringBuilder("# Netscape HTTP Cookie File\n");
        boolean ok = false;
        String[][] srcs = {{"https://www.youtube.com", ".youtube.com"}, {"https://accounts.google.com", ".google.com"}, {"https://www.google.com", ".google.com"}};
        for (String[] sr : srcs) {
            String raw = cm.getCookie(sr[0]);
            if (raw == null) continue;
            for (String pair : raw.split(";\\s*")) {
                int i = pair.indexOf('=');
                if (i <= 0) continue;
                String n = pair.substring(0, i), v = pair.substring(i + 1);
                if (n.equals("SAPISID") || n.equals("__Secure-3PSID") || n.equals("SID")) ok = true;
                sb.append(sr[1]).append("\tTRUE\t/\tTRUE\t2147483647\t").append(n).append("\t").append(v).append("\n");
            }
        }
        if (ok) {
            try (FileWriter w = new FileWriter(new File(getFilesDir(), "cookies.txt"))) {
                w.write(sb.toString());
                setResult(RESULT_OK);
            } catch (Exception e) {
                Toast.makeText(this, "تعذّر حفظ الجلسة", Toast.LENGTH_LONG).show();
                setResult(RESULT_CANCELED);
            }
        } else {
            Toast.makeText(this, "لم يتم تسجيل الدخول بعد", Toast.LENGTH_LONG).show();
            setResult(RESULT_CANCELED);
        }
        // نمسح كوكيز الـ WebView علشان يوتيوب ما يغيّر الجلسة اللي صدّرناها
        cm.removeAllCookies(null);
        cm.flush();
        finish();
    }
}
