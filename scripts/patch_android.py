"""يُشغَّل بعد `npx cap add android`: يضيف yt-dlp + ffmpeg + aria2c ويسجّل الإضافة الأصلية."""
import re, shutil, pathlib

A = pathlib.Path("android")
pkg = A / "app/src/main/java/com/aldahih/app"
pkg.mkdir(parents=True, exist_ok=True)
for f in ("MainActivity.java", "YtDlpPlugin.java", "DlService.java"):
    shutil.copy(f"native/{f}", pkg / f)

# minSdk 24 مطلوب للمكتبة
v = A / "variables.gradle"
t = v.read_text()
t = re.sub(r"minSdkVersion = \d+", "minSdkVersion = 24", t)
v.write_text(t)

g = A / "app/build.gradle"
t = g.read_text()
t = t.replace("android {", """android {
    packagingOptions { jniLibs { useLegacyPackaging = true } }""", 1)
t = t.replace("defaultConfig {", """defaultConfig {
        ndk { abiFilters 'arm64-v8a' }""", 1)
LIB = "io.github.junkfood02.youtubedl-android"
t = t.replace("dependencies {", f"""dependencies {{
    implementation "{LIB}:library:0.17.2"
    implementation "{LIB}:ffmpeg:0.17.2"
    implementation "{LIB}:aria2c:0.17.2\"""", 1)
g.write_text(t)

m = A / "app/src/main/AndroidManifest.xml"
t = m.read_text()
t = t.replace("<application", '<application android:extractNativeLibs="true"', 1)
t = t.replace("</application>", '    <service android:name=".DlService" android:exported="false" android:foregroundServiceType="dataSync" />\n    </application>', 1)
t = t.replace("</manifest>", """    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_DATA_SYNC" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />
</manifest>""", 1)
m.write_text(t)
print("patched")
