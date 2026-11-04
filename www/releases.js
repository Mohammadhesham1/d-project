// ══════════════════════════════════════════════
//  فحص الحلقات الجديدة (والتطبيق مفتوح فقط)
// ══════════════════════════════════════════════
const REL = {
  days: [1, 5],            // 1 = الإثنين ، 5 = الجمعة
  hour: 20,                // الساعة 8 مساءً (غيّرها لـ 8 لو صباحاً)
  tz: 'Africa/Cairo',
  delayMin: 60,            // يبدأ الفحص بعد موعد النزول بساعة (اكتب 0 للبدء من الموعد نفسه)
  pollMs: 3 * 60 * 1000,   // كل 3 دقائق لحد ما الحلقة تنزل
  feed: 'https://www.youtube.com/feeds/videos.xml?playlist_id=PLRCzrSHS5u_HQuXr15gOMCIK-E-57A5vd',
};
const IS_NATIVE = !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform());

function tzParts(ts) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: REL.tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
  const o = {}; f.formatToParts(new Date(ts)).forEach(p => o[p.type] = +p.value);
  return o;
}
function tzOffsetMs(ts) { const p = tzParts(ts); return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ts / 1000) * 1000; }
function tzToUtc(y, m, d, h) {
  const t0 = Date.UTC(y, m - 1, d, h);
  return t0 - tzOffsetMs(t0 - tzOffsetMs(t0));
}
function latestSlot(now) {
  const p = tzParts(now);
  for (let k = 0; k < 9; k++) {
    const d = new Date(Date.UTC(p.year, p.month - 1, p.day - k));
    if (!REL.days.includes(d.getUTCDay())) continue;
    const slot = tzToUtc(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), REL.hour);
    if (slot <= now) return slot;
  }
  return now;
}
function nextSlot(now) { let t = latestSlot(now) + 36e5; while (latestSlot(t) <= latestSlot(now)) t += 36e5 * 6; return latestSlot(t); }

// حلقات أُضيفت من التطبيق (تُدمج مع القائمة الأساسية)
const EXTRA_KEY = 'extra_eps_v1';
function loadExtras() { try { return JSON.parse(localStorage.getItem(EXTRA_KEY) || '[]'); } catch { return []; } }
function hashId(s) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return 9000000 + (h % 900000); }
function mergeExtras(eps) {
  const have = new Set(eps.map(e => e.videoId));
  const extras = loadExtras();
  const keep = extras.filter(e => !have.has(e.videoId));
  if (keep.length !== extras.length) localStorage.setItem(EXTRA_KEY, JSON.stringify(keep));
  if (!keep.length) return eps;
  const out = eps.slice();
  const pos = Math.max(0, out.findIndex(e => e.category === 'ajplus'));
  out.splice(pos, 0, ...keep);
  return out;
}

async function fetchFeed() {
  let xml;
  if (IS_NATIVE && Capacitor.Plugins.CapacitorHttp) {
    const r = await Capacitor.Plugins.CapacitorHttp.get({ url: REL.feed + '&t=' + Date.now(), responseType: 'text' });
    xml = r.data;
  } else {
    xml = await (await fetch(REL.feed + '&t=' + Date.now())).text();
  }
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  return [...doc.getElementsByTagName('entry')].map(e => {
    const g = n => e.getElementsByTagName(n)[0];
    return {
      videoId: g('yt:videoId')?.textContent,
      title: (g('title')?.textContent || '').trim(),
      published: Date.parse(g('published')?.textContent || ''),
      views: +(g('media:statistics')?.getAttribute('views') || 0),
      desc: g('media:description')?.textContent || '',
    };
  }).filter(x => x.videoId);
}

function fmtDur(sec) {
  sec = Math.round(sec); const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

// يرجع true لو حلقة الموعد الحالي نزلت فعلاً
async function checkNew(slot) {
  const known = new Set(EPISODES.map(e => e.videoId));
  let feed;
  try { feed = await fetchFeed(); }
  catch {
    // بديل: نسخة GitHub المحدّثة
    try {
      const eps = await loadJSON('episodes.json');
      const fresh = eps.filter(e => !known.has(e.videoId));
      if (fresh.length) { EPISODES = mergeExtras(eps); announce(fresh); return true; }
    } catch {}
    return false;
  }
  const slotOut = feed.some(f => f.published >= slot - 3 * 36e5);
  const prev = latestSlot(slot - 60000);
  const fresh = feed.filter(f => !known.has(f.videoId) && f.published >= prev - 3 * 36e5);
  if (fresh.length) {
    const extras = loadExtras();
    const items = fresh.sort((a, b) => b.published - a.published).map(f => ({
      id: hashId(f.videoId), videoId: f.videoId, title: f.title, duration: '', views: f.views,
      category: 'ajplus', source: 'ajplus', desc: f.desc, topic: 'general',
    }));
    localStorage.setItem(EXTRA_KEY, JSON.stringify([...items, ...extras]));
    EPISODES = mergeExtras(EPISODES.filter(e => !items.some(i => i.videoId === e.videoId)));
    announce(items);
    items.forEach(fillDuration);
  }
  return slotOut || fresh.length > 0;
}
async function fillDuration(it) {
  if (!IS_NATIVE || typeof YtDlp === 'undefined' || !YtDlp) return;
  try {
    const r = await YtDlp.info({ videoId: it.videoId });
    const ep = EPISODES.find(e => e.videoId === it.videoId); if (ep) ep.duration = fmtDur(r.duration);
    const ex = loadExtras(); const x = ex.find(e => e.videoId === it.videoId);
    if (x) { x.duration = fmtDur(r.duration); localStorage.setItem(EXTRA_KEY, JSON.stringify(ex)); }
  } catch {}
}
function announce(items) {
  toast(items.length === 1 ? `🎉 حلقة جديدة: ${items[0].title}` : `🎉 نزلت ${items.length} حلقات جديدة`);
  const h = location.hash || '#/';
  if (!h.startsWith('#/watch') && !h.startsWith('#/local') && !h.startsWith('#/downloads')) route();
}

// ── جدولة: تعمل فقط والتطبيق ظاهر ──
let relTimer = null, relBusy = false;
function relEval() {
  clearTimeout(relTimer);
  if (document.hidden || relBusy) return;
  const now = Date.now(), slot = latestSlot(now);
  const done = +localStorage.getItem('rel_done') || 0;
  if (done >= slot) { relTimer = setTimeout(relEval, Math.min(nextSlot(now) + REL.delayMin * 6e4 - now, 2 ** 31 - 1)); return; }
  const start = slot + REL.delayMin * 6e4;
  if (now < start) { relTimer = setTimeout(relEval, start - now); return; }
  relBusy = true;
  checkNew(slot).then(found => { if (found) localStorage.setItem('rel_done', String(slot)); })
    .catch(() => {}).finally(() => { relBusy = false; relTimer = setTimeout(relEval, REL.pollMs); });
}
function startReleaseWatcher() {
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearTimeout(relTimer); else relEval(); });
  relEval();
}
