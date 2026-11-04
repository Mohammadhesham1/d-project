"""مزامنة كاملة لقسم AJ+ مع قائمة التشغيل.
- بيستبدل حلقات AJ+ القديمة بكل حلقات القائمة (الأحدث أولاً).
- بيحافظ على (topic / desc / duration / views) للحلقات اللي كانت موجودة.
- المواسم (New Media Academy) بتفضل زي ما هي.
- لو فيه secret اسمه YT_API_KEY بيستخدم YouTube Data API، وإلا بيستخدم yt-dlp.
"""
import json, os, subprocess, sys, urllib.parse, urllib.request
import xml.etree.ElementTree as ET

PLAYLIST_ID = "PLRCzrSHS5u_HQuXr15gOMCIK-E-57A5vd"
CAT, SOURCE, TOPIC = "ajplus", "ajplus", "general"
PATH = "www/episodes.json"
SKIP_TITLES = {"[Private video]", "[Deleted video]"}

def fmt_dur(sec):
    if not sec: return ""
    sec = int(sec); h, m, s = sec // 3600, sec % 3600 // 60, sec % 60
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"

def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=60).read()

def via_api(key):
    ids, token = [], ""
    while True:
        q = {"part": "snippet", "playlistId": PLAYLIST_ID, "maxResults": 50, "key": key}
        if token: q["pageToken"] = token
        d = json.loads(get("https://www.googleapis.com/youtube/v3/playlistItems?" + urllib.parse.urlencode(q)))
        ids += [i["snippet"]["resourceId"]["videoId"] for i in d["items"]]
        token = d.get("nextPageToken", "")
        if not token: break
    out = []
    for i in range(0, len(ids), 50):
        q = {"part": "snippet,contentDetails,statistics", "id": ",".join(ids[i:i + 50]), "key": key}
        for v in json.loads(get("https://www.googleapis.com/youtube/v3/videos?" + urllib.parse.urlencode(q)))["items"]:
            import re
            m = re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", v["contentDetails"]["duration"])
            sec = int(m.group(1) or 0) * 3600 + int(m.group(2) or 0) * 60 + int(m.group(3) or 0)
            out.append({"videoId": v["id"], "title": v["snippet"]["title"], "duration": sec,
                        "views": int(v["statistics"].get("viewCount", 0)), "desc": v["snippet"].get("description", ""),
                        "published": v["snippet"]["publishedAt"]})
    out.sort(key=lambda x: x["published"], reverse=True)   # الأحدث أولاً
    return out

def feed_dates():
    """تواريخ نشر أول 15 حلقة من RSS — بنستخدمها لمعرفة اتجاه ترتيب القائمة."""
    try:
        root = ET.fromstring(get(f"https://www.youtube.com/feeds/videos.xml?playlist_id={PLAYLIST_ID}"))
        ns = {"a": "http://www.w3.org/2005/Atom"}
        return [e.find("a:published", ns).text for e in root.findall("a:entry", ns)]
    except Exception:
        return []

def via_ytdlp():
    r = subprocess.run(["yt-dlp", "--flat-playlist", "-J", "--no-warnings", f"https://www.youtube.com/playlist?list={PLAYLIST_ID}"],
                       capture_output=True, text=True, timeout=600)
    if r.returncode != 0: raise RuntimeError(r.stderr[-400:])
    out = [{"videoId": e["id"], "title": e.get("title") or "", "duration": e.get("duration"),
            "views": e.get("view_count") or 0, "desc": ""} for e in json.loads(r.stdout)["entries"] if e and e.get("id")]
    d = feed_dates()
    if len(d) > 1 and d[0] < d[-1]:   # القائمة مترتبة من الأقدم للأحدث → نعكسها
        out.reverse()
    return out

def merge(eps, items):
    old = {e["videoId"]: e for e in eps if e["category"] == CAT}
    nid = max(e["id"] for e in eps) + 1
    new_block = []
    for it in reversed(items):                       # أقدم حلقة تاخد أصغر id
        o = old.get(it["videoId"])
        if o:
            e = dict(o); e["title"] = it["title"] or o["title"]
            if it.get("views"): e["views"] = it["views"]
            if it.get("duration") and not e.get("duration"): e["duration"] = fmt_dur(it["duration"])
        else:
            e = {"id": nid, "videoId": it["videoId"], "title": it["title"], "duration": fmt_dur(it.get("duration")),
                 "views": it.get("views") or 0, "category": CAT, "source": SOURCE, "desc": it.get("desc", ""), "topic": TOPIC}
            nid += 1
        new_block.append(e)
    new_block.reverse()                              # الأحدث أولاً
    pos = next((i for i, e in enumerate(eps) if e["category"] == CAT), 0)
    rest = [e for e in eps if e["category"] != CAT]
    pos = min(pos, len(rest))
    return rest[:pos] + new_block + rest[pos:], len(old), len(new_block), len([1 for it in items if it["videoId"] not in old])

def main():
    key = os.environ.get("YT_API_KEY", "").strip()
    items = via_api(key) if key else via_ytdlp()
    items = [i for i in items if i["title"] not in SKIP_TITLES]
    seen, uniq = set(), []
    for i in items:
        if i["videoId"] not in seen: seen.add(i["videoId"]); uniq.append(i)
    if len(uniq) < 50:
        sys.exit(f"suspicious playlist size ({len(uniq)}), not touching episodes.json")
    eps = json.load(open(PATH, encoding="utf-8"))
    merged, n_old, n_new, n_added = merge(eps, uniq)
    json.dump(merged, open(PATH, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"AJ+: before={n_old} after={n_new} newly_added={n_added}")

if __name__ == "__main__":
    main()
