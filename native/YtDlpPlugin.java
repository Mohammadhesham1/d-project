package com.aldahih.app;

import android.content.Context;
import android.content.Intent;
import android.os.Environment;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.yausername.aria2c.Aria2c;
import com.yausername.ffmpeg.FFmpeg;
import com.yausername.youtubedl_android.YoutubeDL;
import com.yausername.youtubedl_android.YoutubeDLRequest;
import com.yausername.youtubedl_android.mapper.VideoInfo;
import java.io.File;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "YtDlp")
public class YtDlpPlugin extends Plugin {
    private final ExecutorService pool = Executors.newCachedThreadPool();
    private final Set<String> canceled = ConcurrentHashMap.newKeySet();
    private final ConcurrentHashMap<String, Long> lastEmit = new ConcurrentHashMap<>();
    private boolean ready = false;

    private synchronized void ensureInit() throws Exception {
        if (ready) return;
        Context c = getContext();
        YoutubeDL.getInstance().init(c);
        FFmpeg.getInstance().init(c);
        Aria2c.getInstance().init(c);
        ready = true;
    }

    private File dir() {
        File base = getContext().getExternalFilesDir(Environment.DIRECTORY_MOVIES);
        if (base == null) base = getContext().getFilesDir();
        File d = new File(base, "Aldahih");
        d.mkdirs();
        return d;
    }

    private YoutubeDLRequest buildRequest(String vid, String mode, String q, String tag, boolean aria, String client) {
        YoutubeDLRequest r = new YoutubeDLRequest("https://www.youtube.com/watch?v=" + vid);
        r.addOption("--no-playlist");
        r.addOption("--no-mtime");
        r.addOption("--no-warnings");
        r.addOption("--retries", "10");
        r.addOption("--fragment-retries", "10");
        r.addOption("--socket-timeout", "20");
        r.addOption("-N", "8");                       // أجزاء متوازية للصيغ المقسّمة
        r.addOption("-o", dir().getAbsolutePath() + "/" + vid + "_" + tag + ".%(ext)s");
        if (mode.equals("audio")) {
            // m4a جاهز بدون أي معالجة = أسرع خيار
            r.addOption("-f", "ba[ext=m4a]/ba/b");
        } else {
            String f;
            if (q.equals("360")) {
                f = "18/bv*[height<=360][vcodec^=avc1]+ba[acodec^=mp4a]/b[height<=360]/b";
            } else {
                f = "bv*[height<=" + q + "][vcodec^=avc1]+ba[acodec^=mp4a]/b[height<=" + q + "][ext=mp4]"
                  + "/bv*[height<=" + q + "]+ba/b[height<=" + q + "]/b";
            }
            r.addOption("-f", f);
            r.addOption("--merge-output-format", "mp4");   // دمج بدون إعادة ترميز (copy)
        }
        if (aria) r.addOption("--downloader", "libaria2c.so"); // 16 اتصال متوازي
        if (client != null) r.addOption("--extractor-args", "youtube:player_client=" + client);
        return r;
    }

    @PluginMethod
    public void download(final PluginCall call) {
        final String key = call.getString("key");
        final String vid = call.getString("videoId");
        final String mode = call.getString("mode", "video");
        final String q = call.getString("quality", "720");
        final boolean useAria = Boolean.TRUE.equals(call.getBoolean("aria2c", true));
        pool.execute(() -> {
            try {
                ensureInit();
                canceled.remove(key);
                final String tag = mode.equals("audio") ? "a" : "v" + q;
                final int streams = (mode.equals("video") && !q.equals("360")) ? 2 : 1;
                String lastErr = "فشل التحميل";
                // محاولة 1: aria2c — 2: تحميل عادي — 3: عميل بديل
                for (int attempt = useAria ? 0 : 1; attempt < 3; attempt++) {
                    final float[] st = {0f, 0f};
                    try {
                        YoutubeDLRequest req = buildRequest(vid, mode, q, tag, attempt == 0, attempt == 2 ? "android_vr" : null);
                        YoutubeDL.getInstance().execute(req, key, (p, eta, line) -> {
                            if (p == null || p < 0) return kotlin.Unit.INSTANCE;
                            if (p + 25 < st[1]) st[0]++;
                            st[1] = p;
                            float overall = Math.min(99.5f, (Math.min(st[0], streams - 1) + p / 100f) / streams * 100f);
                            long now = System.currentTimeMillis();
                            Long last = lastEmit.get(key);
                            if (last == null || now - last > 400) {
                                lastEmit.put(key, now);
                                JSObject o = new JSObject();
                                o.put("key", key);
                                o.put("progress", overall);
                                o.put("eta", eta);
                                o.put("line", line == null ? "" : line);
                                notifyListeners("progress", o);
                            }
                            return kotlin.Unit.INSTANCE;
                        });
                        File[] fs = dir().listFiles((d, n) -> n.startsWith(vid + "_" + tag + ".")
                                && !n.matches(".*\\.(part|ytdl|aria2|temp)$") && !n.matches(".*\\.f\\d+\\..*"));
                        File best = null;
                        if (fs != null) for (File f : fs) if (best == null || f.length() > best.length()) best = f;
                        if (best == null) throw new Exception("الملف لم يُنشأ");
                        JSObject res = new JSObject();
                        res.put("path", best.getAbsolutePath());
                        res.put("size", best.length());
                        call.resolve(res);
                        return;
                    } catch (Exception e) {
                        if (canceled.contains(key)) { call.reject("canceled"); return; }
                        lastErr = e.getMessage() == null ? e.toString() : e.getMessage();
                    }
                }
                call.reject(lastErr.length() > 300 ? lastErr.substring(0, 300) : lastErr);
            } catch (Exception e) {
                call.reject(String.valueOf(e.getMessage()));
            }
        });
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        String key = call.getString("key");
        canceled.add(key);
        try { YoutubeDL.getInstance().destroyProcessById(key); } catch (Exception ignored) {}
        call.resolve();
    }

    @PluginMethod
    public void deleteFiles(PluginCall call) {
        final String prefix = call.getString("prefix");
        File[] fs = dir().listFiles((d, n) -> n.startsWith(prefix + "."));
        if (fs != null) for (File f : fs) f.delete();
        call.resolve();
    }

    @PluginMethod
    public void info(final PluginCall call) {
        final String vid = call.getString("videoId");
        pool.execute(() -> {
            try {
                ensureInit();
                VideoInfo i = YoutubeDL.getInstance().getInfo("https://www.youtube.com/watch?v=" + vid);
                JSObject o = new JSObject();
                o.put("duration", i.getDuration());
                call.resolve(o);
            } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
        });
    }

    @PluginMethod
    public void update(final PluginCall call) {
        pool.execute(() -> {
            try {
                ensureInit();
                YoutubeDL.UpdateStatus s = YoutubeDL.getInstance()
                        .updateYoutubeDL(getContext(), YoutubeDL.UpdateChannel._NIGHTLY);
                JSObject o = new JSObject();
                o.put("status", s == null ? "unknown" : s.name());
                o.put("version", String.valueOf(YoutubeDL.getInstance().versionName(getContext())));
                call.resolve(o);
            } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
        });
    }

    @PluginMethod
    public void serviceStart(PluginCall call) {
        try {
            Context c = getContext();
            ContextCompat.startForegroundService(c, new Intent(c, DlService.class));
        } catch (Exception ignored) {}
        call.resolve();
    }

    @PluginMethod
    public void serviceStop(PluginCall call) {
        Context c = getContext();
        c.stopService(new Intent(c, DlService.class));
        call.resolve();
    }
}
