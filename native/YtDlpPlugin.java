package com.aldahih.app;

import android.content.Context;
import android.content.Intent;
import android.os.Environment;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.yausername.aria2c.Aria2c;
import com.yausername.ffmpeg.FFmpeg;
import com.yausername.youtubedl_android.YoutubeDL;
import com.yausername.youtubedl_android.YoutubeDLRequest;
import com.yausername.youtubedl_android.mapper.VideoInfo;
import java.io.File;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
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
        File ck = cookieFile();
        boolean logged = ck.exists();
        if (logged) r.addOption("--cookies", ck.getAbsolutePath());
        if (client != null && !logged) r.addOption("--extractor-args", "youtube:player_client=" + client + "");
        return r;
    }

    private static final Pattern ARIA = Pattern.compile("\\[#\\w+\\s+([\\d.]+\\w*)/([\\d.]+\\w*)\\((\\d+)%\\)(?:.*?DL:([\\d.]+\\w*))?");
    private static final Pattern YTD = Pattern.compile("\\[download\\]\\s+([\\d.]+)%\\s+of\\s+~?\\s*([\\d.]+\\w+)(?:\\s+at\\s+([\\d.]+\\w+)/s)?");
    private final AtomicInteger activeDl = new AtomicInteger(0);

    private static long toBytes(String s) {
        if (s == null) return 0;
        Matcher m = Pattern.compile("([\\d.]+)\\s*([KMGT]?)").matcher(s);
        if (!m.find()) return 0;
        double v = Double.parseDouble(m.group(1));
        String u = m.group(2);
        double mul = u.equals("K") ? 1024 : u.equals("M") ? 1048576 : u.equals("G") ? 1073741824 : u.equals("T") ? 1099511627776.0 : 1;
        return (long) (v * mul);
    }
    private static String fmtBytes(long b) {
        if (b >= 1073741824L) return String.format(Locale.US, "%.2f GB", b / 1073741824.0);
        if (b >= 1048576L) return String.format(Locale.US, "%.1f MB", b / 1048576.0);
        return String.format(Locale.US, "%d KB", b / 1024);
    }
    private void phase(String key, String ph) {
        JSObject o = new JSObject(); o.put("key", key); o.put("phase", ph); notifyListeners("progress", o);
    }
    private void cleanPartials(String prefix) {
        File[] fs = dir().listFiles((d, n) -> n.startsWith(prefix + ".") && n.matches(".*\\.(part|ytdl|aria2|temp)(\\.aria2)?$|.*\\.f\\d+\\..*"));
        if (fs != null) for (File f : fs) f.delete();
    }

    @PluginMethod
    public void download(final PluginCall call) {
        final String key = call.getString("key");
        final String vid = call.getString("videoId");
        final String mode = call.getString("mode", "video");
        final String q = call.getString("quality", "720");
        final boolean useAria = Boolean.TRUE.equals(call.getBoolean("aria2c", true));
        pool.execute(() -> {
            activeDl.incrementAndGet();
            try {
                if (!ready) phase(key, "init");
                ensureInit();
                canceled.remove(key);
                final String tag = mode.equals("audio") ? "a" : "v" + q;
                final String prefix = vid + "_" + tag;
                final int streams = (mode.equals("video") && !q.equals("360")) ? 2 : 1;
                StringBuilder errs = new StringBuilder();
                // 0: aria2c + android_vr (بدون JS) — 1: تحميل عادي + android_vr — 2: العملاء الافتراضية
                for (int attempt = useAria ? 0 : 1; attempt < 3; attempt++) {
                    if (attempt > 0) { cleanPartials(prefix); phase(key, "retry"); }
                    final float[] st = {0f, 0f};
                    final AtomicLong lastTick = new AtomicLong(System.currentTimeMillis());
                    final AtomicBoolean stalled = new AtomicBoolean(false), finished = new AtomicBoolean(false), started = new AtomicBoolean(false);
                    final long[] slowSince = {0};
                    final String[] lastDone = {""};
                    final int att = attempt;
                    Thread wd = new Thread(() -> {
                        while (!finished.get()) {
                            try { Thread.sleep(4000); } catch (InterruptedException e) { return; }
                            long idle = System.currentTimeMillis() - lastTick.get();
                            if (!finished.get() && idle > (started.get() ? 60000 : 120000)) {
                                stalled.set(true);
                                try { YoutubeDL.getInstance().destroyProcessById(key); } catch (Exception ignored) {}
                                return;
                            }
                        }
                    });
                    wd.setDaemon(true); wd.start();
                    try {
                        YoutubeDLRequest req = buildRequest(vid, mode, q, tag, attempt == 0, attempt < 2 ? "android_vr" : null);
                        YoutubeDL.getInstance().execute(req, key, (p, eta, line) -> {
                            if (line == null) return kotlin.Unit.INSTANCE;
                            long now = System.currentTimeMillis();
                            String done = null, total = null, speed = null; float pct = -1;
                            Matcher m = ARIA.matcher(line);
                            if (m.find()) { done = m.group(1); total = m.group(2); pct = Float.parseFloat(m.group(3)); speed = m.group(4); }
                            else {
                                m = YTD.matcher(line);
                                if (m.find()) {
                                    pct = Float.parseFloat(m.group(1)); total = m.group(2); speed = m.group(3);
                                    done = fmtBytes((long) (toBytes(total) * pct / 100.0));
                                }
                            }
                            if (pct < 0) {
                                if (!started.get()) lastTick.set(now);
                                String ph = line.contains("[Merger]") || line.contains("[ffmpeg]") ? "merge"
                                        : (line.contains("[youtube]") || line.contains("[info]")) ? "extract" : null;
                                if (ph != null) phase(key, ph);
                                return kotlin.Unit.INSTANCE;
                            }
                            started.set(true);
                            if (!String.valueOf(done).equals(lastDone[0])) { lastDone[0] = String.valueOf(done); lastTick.set(now); }
                            if (pct + 25 < st[1]) st[0]++;
                            st[1] = pct;
                            if (speed != null && att < 2) {
                                if (toBytes(speed) < 60 * 1024) {
                                    if (slowSince[0] == 0) slowSince[0] = now;
                                    else if (now - slowSince[0] > 45000 && !stalled.get()) {
                                        stalled.set(true);
                                        try { YoutubeDL.getInstance().destroyProcessById(key); } catch (Exception ignored) {}
                                    }
                                } else slowSince[0] = 0;
                            }
                            float overall = Math.min(99.5f, (Math.min(st[0], streams - 1) + pct / 100f) / streams * 100f);
                            Long last = lastEmit.get(key);
                            if (last == null || now - last > 400) {
                                lastEmit.put(key, now);
                                JSObject o = new JSObject();
                                o.put("key", key); o.put("progress", overall); o.put("pct", pct);
                                o.put("done", done); o.put("total", total);
                                o.put("speed", speed == null ? "" : speed + "/s");
                                o.put("eta", eta); o.put("stage", (int) Math.min(st[0], streams - 1)); o.put("streams", streams);
                                notifyListeners("progress", o);
                            }
                            return kotlin.Unit.INSTANCE;
                        });
                        finished.set(true);
                        File[] fs = dir().listFiles((d, n) -> n.startsWith(prefix + ".")
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
                        finished.set(true);
                        if (canceled.contains(key)) { call.reject("canceled"); return; }
                        String msg = stalled.get() ? "تعثّر" : (e.getMessage() == null ? e.toString() : e.getMessage());
                        msg = msg.trim().split("\\n")[0];
                        if (msg.length() > 110) msg = msg.substring(0, 110);
                        if (errs.length() > 0) errs.append(" | ");
                        errs.append(att + 1).append(") ").append(msg);
                    }
                }
                String all = errs.length() == 0 ? "فشل التحميل" : errs.toString();
                call.reject(all.length() > 500 ? all.substring(0, 500) : all);
            } catch (Exception e) {
                call.reject(String.valueOf(e.getMessage()));
            } finally {
                activeDl.decrementAndGet();
            }
        });
    }

    private File cookieFile() { return new File(getContext().getFilesDir(), "cookies.txt"); }

    @PluginMethod
    public void openLogin(PluginCall call) {
        startActivityForResult(call, new Intent(getContext(), LoginActivity.class), "loginResult");
    }

    @ActivityCallback
    private void loginResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject o = new JSObject();
        o.put("loggedIn", cookieFile().exists());
        call.resolve(o);
    }

    @PluginMethod
    public void hasLogin(PluginCall call) {
        JSObject o = new JSObject();
        o.put("loggedIn", cookieFile().exists());
        call.resolve(o);
    }

    @PluginMethod
    public void logout(PluginCall call) {
        cookieFile().delete();
        call.resolve();
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
        if (activeDl.get() > 0) { call.reject("busy"); return; }
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
