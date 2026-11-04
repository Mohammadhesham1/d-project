"""يسحب آخر حلقات قائمة التشغيل ويضيف الجديد فقط إلى www/episodes.json (بدون API key)."""
import json, re, subprocess, sys, urllib.request
import xml.etree.ElementTree as ET

PLAYLIST_ID = "PLRCzrSHS5u_HQuXr15gOMCIK-E-57A5vd"
DEFAULT_CATEGORY, DEFAULT_SOURCE, DEFAULT_TOPIC = "ajplus", "ajplus", "general"
PATH = "www/episodes.json"
NS = {"a": "http://www.w3.org/2005/Atom", "m": "http://search.yahoo.com/mrss/", "y": "http://www.youtube.com/xml/schemas/2015"}

def fetch_feed():
    url = f"https://www.youtube.com/feeds/videos.xml?playlist_id={PLAYLIST_ID}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    root = ET.fromstring(urllib.request.urlopen(req, timeout=30).read())
    out = []
    for e in root.findall("a:entry", NS):
        vid = e.find("y:videoId", NS).text
        g = e.find("m:group", NS)
        stats = g.find("m:community/m:statistics", NS)
        out.append({
            "videoId": vid,
            "title": e.find("a:title", NS).text.strip(),
            "views": int(stats.get("views", 0)) if stats is not None else 0,
            "desc": (g.find("m:description", NS).text or "") if g.find("m:description", NS) is not None else "",
        })
    return out  # الأحدث أولاً

def duration(vid):  # اختياري: لو yt-dlp فشل نكمل بدون مدة
    try:
        r = subprocess.run(["yt-dlp", "--skip-download", "--print", "duration_string", f"https://www.youtube.com/watch?v={vid}"],
                           capture_output=True, text=True, timeout=60)
        d = r.stdout.strip().splitlines()[-1] if r.returncode == 0 and r.stdout.strip() else ""
        return re.sub(r"^0(\d:)", r"\1", d) if d else ""
    except Exception:
        return ""

def main():
    eps = json.load(open(PATH, encoding="utf-8"))
    known = {e["videoId"] for e in eps}
    new = [v for v in fetch_feed() if v["videoId"] not in known]
    if not new:
        print("no new episodes"); return
    nid = max(e["id"] for e in eps) + 1
    items = []
    for i, v in enumerate(reversed(new)):  # أقدم جديد يأخذ أصغر id
        items.append({"id": nid + i, "videoId": v["videoId"], "title": v["title"], "duration": duration(v["videoId"]),
                      "views": v["views"], "category": DEFAULT_CATEGORY, "source": DEFAULT_SOURCE,
                      "desc": v["desc"], "topic": DEFAULT_TOPIC})
    items.reverse()  # الأحدث أولاً
    pos = next((i for i, e in enumerate(eps) if e["category"] == DEFAULT_CATEGORY), 0)
    eps[pos:pos] = items
    json.dump(eps, open(PATH, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"added {len(items)}:", *[i["title"] for i in items], sep="\n  ")

if __name__ == "__main__":
    sys.exit(main())
