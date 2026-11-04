// ══════════════════════════════════════════════
//  التحميلات + قوائم التشغيل + الضغط المطوّل
// ══════════════════════════════════════════════
const YtDlp = IS_NATIVE ? Capacitor.registerPlugin('YtDlp') : null;
const store = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
let DL = store.get('dl_items_v1', []);          // عناصر التحميل
let PLS = store.get('dl_playlists_v1', []);     // قوائم التشغيل {id,name,keys:[]}
let SET = Object.assign({ concurrent: 2, aria2c: true }, store.get('dl_settings_v1', {}));
const saveDL = () => store.set('dl_items_v1', DL), savePL = () => store.set('dl_playlists_v1', PLS), saveSET = () => store.set('dl_settings_v1', SET);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dlKey = (vid, mode, q) => `${vid}:${mode === 'audio' ? 'a' : 'v' + q}`;
const dlTag = it => it.mode === 'audio' ? 'a' : 'v' + it.quality;
const fmtSize = b => !b ? '' : b > 1e9 ? (b / 1e9).toFixed(2) + ' GB' : (b / 1e6).toFixed(b > 1e8 ? 0 : 1) + ' MB';
const durSec = d => (d || '').split(':').reduce((a, x) => a * 60 + (+x || 0), 0);
const fmtEta = s => !s || s < 0 ? '' : s > 3600 ? `${Math.floor(s / 3600)}س ${Math.floor(s % 3600 / 60)}د` : s > 60 ? `${Math.floor(s / 60)}د ${s % 60}ث` : `${s}ث`;

// مرجع الحلقة بحسب videoId
const epByVid = vid => EPISODES.find(e => e.videoId === vid);

// ── Toast ──
function toast(msg) {
  let t = document.getElementById('toast_el');
  if (!t) { t = document.createElement('div'); t.id = 'toast_el'; document.body.appendChild(t); }
  t.textContent = msg; t.className = 'on';
  clearTimeout(toast._t); toast._t = setTimeout(() => t.className = '', 3200);
}

// ── Bottom sheet ──
function closeSheet() { const o = document.getElementById('sheet_o'); if (o) o.remove(); }
function sheet(html) {
  closeSheet();
  const o = document.createElement('div'); o.id = 'sheet_o';
  o.innerHTML = `<div class="sh-bg" data-act="closeSheet"></div><div class="sh" dir="rtl">${html}</div>`;
  document.body.appendChild(o); requestAnimationFrame(() => o.classList.add('on'));
  return o;
}
function askText(title, initial = '') {
  return new Promise(res => {
    const o = sheet(`<h3>${esc(title)}</h3><input id="ask_in" value="${esc(initial)}" maxlength="40" autocomplete="off"/>
      <div class="sh-row"><button class="sh-btn gold" id="ask_ok">حفظ</button><button class="sh-btn" data-act="closeSheet">إلغاء</button></div>`);
    const inp = o.querySelector('#ask_in'); setTimeout(() => inp.focus(), 80);
    const done = () => { const v = inp.value.trim(); closeSheet(); res(v || null); };
    o.querySelector('#ask_ok').onclick = done; inp.onkeydown = e => { if (e.key === 'Enter') done(); };
    o.querySelector('.sh-bg').addEventListener('click', () => res(null));
  });
}

// ── قائمة خيارات التحميل (ضغطة مطوّلة) ──
function dlSheet(epId) {
  const ep = EPISODES.find(e => e.id === +epId); if (!ep) return;
  const have = k => DL.find(d => d.key === k);
  const opt = (mode, q, label, hint) => {
    const k = dlKey(ep.videoId, mode, q), it = have(k);
    return `<button class="sh-opt" data-act="${it && it.status === 'done' ? 'playLocal' : 'startDl'}" data-vid="${ep.videoId}" data-mode="${mode}" data-q="${q}" data-key="${k}">
      <span>${label}</span><small>${it ? (it.status === 'done' ? '✓ محمّلة — تشغيل' : 'قيد التحميل') : hint}</small></button>`;
  };
  sheet(`<div class="sh-head"><img src="https://img.youtube.com/vi/${ep.videoId}/mqdefault.jpg"/><div><h3>${esc(ep.title)}</h3><small>${esc(ep.duration || '')}</small></div></div>
    ${IS_NATIVE ? `${opt('video', '720', 'تنزيل الفيديو 720p', 'موصى به')}${opt('video', '480', 'تنزيل 480p', 'أصغر حجماً')}${opt('video', '360', 'تنزيل 360p', 'الأخف')}${opt('video', '1080', 'تنزيل 1080p', 'أعلى جودة')}${opt('audio', '0', 'صوت فقط', 'الأسرع والأصغر')}
    <button class="sh-opt" data-act="goDownloads"><span>فتح صفحة التحميلات</span></button>`
      : `<p class="sh-note">التحميل متاح داخل تطبيق الأندرويد فقط.</p>`}`);
}

// ── منطق التحميل ──
function enqueue(vid, mode, q) {
  const ep = epByVid(vid); if (!ep) return;
  const key = dlKey(vid, mode, q);
  const old = DL.find(d => d.key === key);
  if (old && old.status !== 'error' && old.status !== 'paused') { toast('الحلقة موجودة في التحميلات'); return; }
  if (old) { old.status = 'queued'; old.error = ''; }
  else DL.unshift({ key, videoId: vid, epId: ep.id, title: ep.title, duration: ep.duration || '', mode, quality: q, status: 'queued', progress: 0, size: 0, path: '', addedAt: Date.now() });
  saveDL(); toast('أُضيفت للتحميلات ⬇'); pump(); refreshDL(true);
}
function activeCount() { return DL.filter(d => d.status === 'downloading').length; }
let svcOn = false;
function syncService() {
  const need = DL.some(d => d.status === 'downloading' || d.status === 'queued');
  if (need && !svcOn) { svcOn = true; YtDlp?.serviceStart(); }
  if (!need && svcOn) { svcOn = false; YtDlp?.serviceStop(); }
}
function pump() {
  if (!YtDlp) return;
  const queued = DL.filter(d => d.status === 'queued').reverse();   // الأقدم أولاً
  let slots = SET.concurrent - activeCount();
  for (const it of queued) { if (slots-- <= 0) break; run(it); }
  syncService();
}
async function run(it) {
  it.status = 'downloading'; it.progress = it.progress || 0; saveDL(); refreshDL(true);
  try {
    const r = await YtDlp.download({ key: it.key, videoId: it.videoId, mode: it.mode, quality: it.quality, aria2c: SET.aria2c });
    it.status = 'done'; it.progress = 100; it.path = r.path; it.size = r.size; it.doneAt = Date.now(); it.speed = '';
    toast('اكتمل التحميل ✓ ' + it.title);
  } catch (e) {
    if (it.status === 'downloading') { it.status = 'error'; it.error = String(e.message || e).slice(0, 160); }
  }
  saveDL(); pump(); refreshDL(true);
}
function pauseDl(key) { const it = DL.find(d => d.key === key); if (!it) return; it.status = 'paused'; it.speed = ''; saveDL(); YtDlp?.cancel({ key }); refreshDL(true); syncService(); }
function resumeDl(key) { const it = DL.find(d => d.key === key); if (!it) return; it.status = 'queued'; it.error = ''; saveDL(); pump(); refreshDL(true); }
async function removeDl(key) {
  const it = DL.find(d => d.key === key); if (!it) return;
  if (it.status === 'downloading') await YtDlp?.cancel({ key });
  try { await YtDlp?.deleteFiles({ prefix: `${it.videoId}_${dlTag(it)}` }); } catch {}
  DL = DL.filter(d => d.key !== key); PLS.forEach(p => p.keys = p.keys.filter(k => k !== key));
  saveDL(); savePL(); refreshDL(true); syncService();
}

if (YtDlp) {
  YtDlp.addListener('progress', e => {
    const it = DL.find(d => d.key === e.key); if (!it || it.status !== 'downloading') return;
    it.progress = Math.max(it.progress || 0, Math.round(e.progress * 10) / 10); it.eta = e.eta;
    const m = /DL:([\d.]+\s?\w+)/.exec(e.line || '') || /at\s+([\d.]+\s?\w+\/s)/.exec(e.line || '');
    if (m) it.speed = m[1].replace(/\/s$/, '') + '/s';
    patchRow(it);
  });
  // رجوع من إغلاق التطبيق: اللي كان شغّال يبقى «متوقف» ويكمل بالاستئناف
  DL.forEach(d => { if (d.status === 'downloading' || d.status === 'queued') d.status = 'paused'; }); saveDL();
  // تحديث yt-dlp كل 12 ساعة (يوتيوب بيغيّر حاجات كتير)
  const lastUp = +localStorage.getItem('ytdlp_upd') || 0;
  if (Date.now() - lastUp > 12 * 36e5) YtDlp.update().then(r => { localStorage.setItem('ytdlp_upd', Date.now()); localStorage.setItem('ytdlp_ver', r.version || ''); }).catch(() => {});
}

// ── صفحة التحميلات ──
const DLV = { pl: 'all', sort: 'new' };
const SORTS = { new: 'الأحدث تنزيلاً', old: 'الأقدم تنزيلاً', name: 'الاسم', size: 'الحجم', dur: 'مدة الحلقة' };
const ico = d => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const IC = {
  play: ico('<polygon points="6 4 20 12 6 20 6 4" fill="currentColor"/>'), pause: ico('<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>'),
  resume: ico('<path d="M21 12a9 9 0 1 1-3-6.7"/><polyline points="21 3 21 9 15 9"/>'), trash: ico('<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>'),
  list: ico('<path d="M4 6h12M4 12h12M4 18h8M19 15v6M16 18h6"/>'), gear: ico('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>'),
  down: ico('<path d="M12 3v12M6 11l6 6 6-6M4 21h16"/>'),
};
function sortItems(a) {
  const s = DLV.sort;
  return a.slice().sort((x, y) => s === 'old' ? (x.doneAt || x.addedAt) - (y.doneAt || y.addedAt) : s === 'name' ? x.title.localeCompare(y.title, 'ar')
    : s === 'size' ? y.size - x.size : s === 'dur' ? durSec(y.duration) - durSec(x.duration) : (y.doneAt || y.addedAt) - (x.doneAt || x.addedAt));
}
function statusText(it) {
  if (it.status === 'done') return [it.mode === 'audio' ? 'صوت' : it.quality + 'p', fmtSize(it.size)].filter(Boolean).join(' • ');
  if (it.status === 'queued') return 'في الانتظار…';
  if (it.status === 'paused') return 'متوقف — اضغط استئناف';
  if (it.status === 'error') return 'فشل: ' + (it.error || '');
  return [`${Math.floor(it.progress || 0)}%`, it.speed, it.eta ? 'متبقي ' + fmtEta(it.eta) : ''].filter(Boolean).join(' • ');
}
function rowHTML(it) {
  const k = esc(it.key), done = it.status === 'done';
  const btn = (a, i, t, cls = '') => `<button class="dl-b ${cls}" data-act="${a}" data-key="${k}" aria-label="${t}">${i}</button>`;
  return `<div class="dl-row" id="r_${k.replace(/:/g, '_')}">
    <div class="dl-th" ${done ? `data-act="playLocal" data-key="${k}"` : ''}><img src="https://img.youtube.com/vi/${it.videoId}/mqdefault.jpg" loading="lazy"/>${done ? `<span class="dl-play">${IC.play}</span>` : ''}</div>
    <div class="dl-body"><div class="dl-t">${esc(it.title)}</div><div class="dl-m ${it.status === 'error' ? 'err' : ''}">${esc(statusText(it))}</div>
      ${done ? '' : `<div class="dl-bar"><i style="width:${it.progress || 0}%"></i></div>`}</div>
    <div class="dl-acts">${done ? btn('plSheet', IC.list, 'قوائم') : it.status === 'downloading' || it.status === 'queued' ? btn('pauseDl', IC.pause, 'إيقاف') : btn('resumeDl', IC.resume, 'استئناف')}${btn('rmDl', IC.trash, 'حذف', 'del')}</div></div>`;
}
function patchRow(it) {
  if (!location.hash.startsWith('#/downloads')) return;
  const r = document.getElementById('r_' + it.key.replace(/:/g, '_')); if (!r) return;
  const bar = r.querySelector('.dl-bar i'); if (bar) bar.style.width = (it.progress || 0) + '%';
  const m = r.querySelector('.dl-m'); if (m) m.textContent = statusText(it);
}
function refreshDL(force) { if (location.hash.startsWith('#/downloads')) renderDownloads(force); }

function renderDownloads() {
  const sy = window.scrollY;
  const inPl = DLV.pl !== 'all' ? PLS.find(p => p.id === DLV.pl) : null; if (DLV.pl !== 'all' && !inPl) DLV.pl = 'all';
  const active = DL.filter(d => d.status !== 'done');
  let done = DL.filter(d => d.status === 'done'); if (inPl) done = done.filter(d => inPl.keys.includes(d.key));
  done = sortItems(done);
  const total = DL.filter(d => d.status === 'done').reduce((a, d) => a + d.size, 0);
  document.getElementById('app').innerHTML = `${headerHTML()}<div id="srch_results" style="display:none;min-height:100vh;background:#080808;"></div>
  <div class="dl-page" dir="rtl">
    <div class="dl-top"><h2>التحميلات</h2><button class="dl-b" data-act="settings" aria-label="الإعدادات">${IC.gear}</button></div>
    <div class="dl-sub">${DL.filter(d => d.status === 'done').length} حلقة • ${fmtSize(total) || '0 MB'}</div>
    ${!IS_NATIVE ? '<div class="dl-warn">التحميل يعمل داخل تطبيق الأندرويد فقط. هنا تقدر تتصفح فقط.</div>' : ''}
    <div class="dl-chips hide-scrollbar">
      <button class="${DLV.pl === 'all' ? 'on' : ''}" data-act="plTab" data-id="all">الكل</button>
      ${PLS.map(p => `<button class="${DLV.pl === p.id ? 'on' : ''}" data-act="plTab" data-id="${p.id}">${esc(p.name)} <small>${p.keys.length}</small></button>`).join('')}
      <button class="add" data-act="plNew">＋ قائمة جديدة</button>
    </div>
    ${inPl ? `<div class="dl-plbar"><b>${esc(inPl.name)}</b><span><button class="dl-b" data-act="plPlay" data-id="${inPl.id}" aria-label="تشغيل">${IC.play}</button><button class="dl-b" data-act="plRename" data-id="${inPl.id}">✎</button><button class="dl-b del" data-act="plDel" data-id="${inPl.id}">${IC.trash}</button></span></div>` : ''}
    ${!inPl && active.length ? `<h4>جاري التحميل</h4>${active.map(rowHTML).join('')}` : ''}
    <div class="dl-sorthead"><h4>${inPl ? 'حلقات القائمة' : 'المحمّلة'}</h4>
      <select data-act="sort" aria-label="الفرز">${Object.entries(SORTS).map(([k, v]) => `<option value="${k}" ${DLV.sort === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
    ${done.length ? done.map(rowHTML).join('') : `<div class="dl-empty">${inPl ? 'القائمة فاضية — أضف حلقات من زر القوائم بجانب أي حلقة محمّلة' : 'لا توجد حلقات محمّلة.<br>اضغط ضغطة مطوّلة على أي حلقة لتنزيلها.'}</div>`}
  </div>`;
  mountScrollHeader(document.getElementById('main_hdr'), true);
  window.scrollTo(0, sy);
}

// ── قوائم التشغيل ──
function plSheet(key) {
  const rows = PLS.map(p => `<label class="sh-chk"><input type="checkbox" data-act="plToggle" data-id="${p.id}" data-key="${esc(key)}" ${p.keys.includes(key) ? 'checked' : ''}/><span>${esc(p.name)}</span><small>${p.keys.length}</small></label>`).join('');
  sheet(`<h3>إضافة إلى قائمة</h3>${rows || '<p class="sh-note">لسه معندكش قوائم.</p>'}<button class="sh-opt" data-act="plNewFor" data-key="${esc(key)}"><span>＋ قائمة جديدة</span></button>`);
}
const newPl = name => { const p = { id: 'p' + Date.now().toString(36), name, keys: [] }; PLS.push(p); savePL(); return p; };

// ── تشغيل محلي ──
let LOCAL_Q = [];
function renderLocal(key, qs) {
  const it = DL.find(d => d.key === key && d.status === 'done');
  if (!it) { navigate('#/downloads'); return; }
  const src = Capacitor.convertFileSrc ? Capacitor.convertFileSrc('file://' + it.path) : it.path;
  const i = LOCAL_Q.indexOf(key), prev = LOCAL_Q[i - 1], next = LOCAL_Q[i + 1];
  document.getElementById('app').innerHTML = `${headerHTML()}<div id="srch_results" style="display:none;"></div>
  <div class="dl-page" dir="rtl" style="padding-top:calc(72px + env(safe-area-inset-top,0px))">
    <video id="lv" src="${src}" controls autoplay playsinline poster="https://img.youtube.com/vi/${it.videoId}/hqdefault.jpg" style="width:100%;max-height:70dvh;background:#000;border-radius:10px;"></video>
    <h2 style="margin:14px 0 6px">${esc(it.title)}</h2><div class="dl-sub">${esc(statusText(it))} • يعمل بدون إنترنت</div>
    <div class="sh-row">${prev ? `<button class="sh-btn" data-act="playLocal" data-key="${esc(prev)}" data-q="1">السابق</button>` : ''}${next ? `<button class="sh-btn gold" data-act="playLocal" data-key="${esc(next)}" data-q="1">التالي</button>` : ''}</div>
  </div>`;
  mountScrollHeader(document.getElementById('main_hdr'), true);
  const v = document.getElementById('lv'); v.onended = () => { if (next) { navigate('#/local/' + encodeURIComponent(next)); } };
}
function openLocal(key, queue) {
  if (queue) LOCAL_Q = queue; else if (!LOCAL_Q.includes(key)) LOCAL_Q = sortItems(DL.filter(d => d.status === 'done' && (DLV.pl === 'all' || PLS.find(p => p.id === DLV.pl)?.keys.includes(d.key)))).map(d => d.key);
  navigate('#/local/' + encodeURIComponent(key));
}

// ── معالج الأحداث (delegation) ──
const ACT = {
  closeSheet,
  goDownloads() { closeSheet(); navigate('#/downloads'); },
  startDl(d) { closeSheet(); enqueue(d.vid, d.mode, d.q); },
  playLocal(d) { closeSheet(); openLocal(d.key); },
  pauseDl: d => pauseDl(d.key), resumeDl: d => resumeDl(d.key),
  async rmDl(d) { if (confirm('حذف التحميل والملف؟')) removeDl(d.key); },
  plTab(d) { DLV.pl = d.id; renderDownloads(); },
  async plNew() { const n = await askText('اسم القائمة الجديدة'); if (n) { DLV.pl = newPl(n).id; renderDownloads(); } },
  async plNewFor(d) { const n = await askText('اسم القائمة الجديدة'); if (n) { const p = newPl(n); p.keys.push(d.key); savePL(); refreshDL(); toast('أُضيفت إلى ' + n); } },
  plSheet: d => plSheet(d.key),
  plToggle(d, el) { const p = PLS.find(x => x.id === d.id); if (!p) return; const has = p.keys.includes(d.key); p.keys = has ? p.keys.filter(k => k !== d.key) : [...p.keys, d.key]; savePL(); refreshDL(); },
  async plRename(d) { const p = PLS.find(x => x.id === d.id); const n = await askText('اسم القائمة', p.name); if (n) { p.name = n; savePL(); renderDownloads(); } },
  plDel(d) { const p = PLS.find(x => x.id === d.id); if (p && confirm(`حذف قائمة «${p.name}»؟ (الحلقات تفضل محمّلة)`)) { PLS = PLS.filter(x => x !== p); savePL(); DLV.pl = 'all'; renderDownloads(); } },
  plPlay(d) { const p = PLS.find(x => x.id === d.id); const q = sortItems(DL.filter(x => x.status === 'done' && p.keys.includes(x.key))).map(x => x.key); if (q.length) openLocal(q[0], q); },
  settings() {
    sheet(`<h3>إعدادات التحميل</h3>
      <label class="sh-chk"><span>تحميلات متزامنة</span><select data-act="setConc">${[1, 2, 3, 4].map(n => `<option ${SET.concurrent === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="sh-chk"><input type="checkbox" data-act="setAria" ${SET.aria2c ? 'checked' : ''}/><span>تسريع بـ aria2c (16 اتصال)</span></label>
      <button class="sh-opt" data-act="updYt"><span>تحديث yt-dlp الآن</span><small>${esc(localStorage.getItem('ytdlp_ver') || '')}</small></button>`);
  },
  setConc: (d, el) => { SET.concurrent = +el.value; saveSET(); pump(); },
  setAria: (d, el) => { SET.aria2c = el.checked; saveSET(); },
  async updYt() { toast('جاري تحديث yt-dlp…'); try { const r = await YtDlp.update(); localStorage.setItem('ytdlp_ver', r.version || ''); toast('الإصدار: ' + r.version); } catch (e) { toast('فشل التحديث: ' + (e.message || e)); } },
};
document.addEventListener('click', e => {
  if (performance.now() - lpAt < 700) { e.preventDefault(); e.stopPropagation(); return; }
  const t = e.target.closest('[data-act]'); if (!t || t.tagName === 'SELECT' || (t.tagName === 'INPUT' && t.type === 'checkbox')) return;
  ACT[t.dataset.act]?.(t.dataset, t, e);
}, true);
document.addEventListener('change', e => {
  const t = e.target.closest('[data-act]'); if (!t) return;
  if (t.dataset.act === 'sort') { DLV.sort = t.value; renderDownloads(); } else ACT[t.dataset.act]?.(t.dataset, t, e);
});

// ── ضغطة مطوّلة على أي كارت حلقة ──
let lpAt = -1e9, lpT = null, lpX = 0, lpY = 0;
document.addEventListener('pointerdown', e => {
  const card = e.target.closest('.ep-card'); if (!card || e.button > 0) return;
  lpX = e.clientX; lpY = e.clientY; clearTimeout(lpT);
  lpT = setTimeout(() => { lpAt = performance.now(); navigator.vibrate?.(15); dlSheet(card.dataset.id); }, 450);
});
['pointerup', 'pointercancel', 'pointerleave'].forEach(n => document.addEventListener(n, () => clearTimeout(lpT)));
document.addEventListener('pointermove', e => { if (Math.abs(e.clientX - lpX) > 10 || Math.abs(e.clientY - lpY) > 10) clearTimeout(lpT); });
document.addEventListener('contextmenu', e => { const c = e.target.closest('.ep-card'); if (c) { e.preventDefault(); lpAt = performance.now(); dlSheet(c.dataset.id); } });

// ── CSS ──
document.head.insertAdjacentHTML('beforeend', `<style>
.ep-card{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none}.ep-card img{-webkit-user-drag:none}
#toast_el{position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom,0px));transform:translate(-50%,30px);background:#1d1d1d;color:#f0f0f0;border:1px solid rgba(201,168,76,.35);padding:10px 16px;border-radius:12px;font:600 .85rem Cairo,sans-serif;z-index:400;opacity:0;pointer-events:none;transition:.25s;max-width:90vw;text-align:center}#toast_el.on{opacity:1;transform:translate(-50%,0)}
#sheet_o{position:fixed;inset:0;z-index:300;font-family:Cairo,sans-serif}.sh-bg{position:absolute;inset:0;background:rgba(0,0,0,.6);opacity:0;transition:.2s}
.sh{position:absolute;bottom:0;left:0;right:0;background:#151515;border-radius:18px 18px 0 0;padding:16px var(--px) calc(16px + env(safe-area-inset-bottom,0px));transform:translateY(100%);transition:.25s;max-height:85dvh;overflow:auto;color:#f0f0f0}
#sheet_o.on .sh{transform:none}#sheet_o.on .sh-bg{opacity:1}.sh h3{margin:0 0 12px;font-size:1rem}.sh small{color:#888}
.sh-head{display:flex;gap:12px;align-items:center;margin-bottom:12px}.sh-head img{width:96px;border-radius:8px;aspect-ratio:16/9;object-fit:cover}.sh-head h3{margin:0 0 4px;font-size:.92rem}
.sh-opt,.sh-btn{display:flex;width:100%;justify-content:space-between;align-items:center;padding:13px 14px;margin-bottom:8px;background:#1f1f1f;border:1px solid rgba(255,255,255,.07);border-radius:12px;color:#f0f0f0;font:600 .92rem Cairo,sans-serif;cursor:pointer}
.sh-btn{justify-content:center}.sh-btn.gold{background:linear-gradient(135deg,#c9a84c,#8a6a20);color:#000;border:none}.sh-row{display:flex;gap:8px;margin-top:10px}
.sh-chk{display:flex;align-items:center;gap:10px;padding:12px 4px;border-bottom:1px solid rgba(255,255,255,.05)}.sh-chk span{flex:1}.sh-chk input[type=checkbox]{width:20px;height:20px;accent-color:#c9a84c}
.sh select,.dl-sorthead select{background:#1f1f1f;color:#f0f0f0;border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:6px 8px;font:inherit}
.sh input#ask_in{width:100%;box-sizing:border-box;background:#1f1f1f;border:1px solid rgba(201,168,76,.4);border-radius:10px;color:#fff;padding:12px;font:1rem Cairo,sans-serif}.sh-note{color:#888}
.dl-page{padding:calc(76px + env(safe-area-inset-top,0px)) var(--px) 80px;max-width:900px;margin:0 auto;color:#f0f0f0;font-family:Cairo,sans-serif}
.dl-top{display:flex;justify-content:space-between;align-items:center}.dl-top h2{margin:0}.dl-sub{color:#777;font-size:.82rem;margin:2px 0 14px}.dl-warn{background:#2a2110;border:1px solid #c9a84c55;border-radius:10px;padding:10px;font-size:.82rem;margin-bottom:12px}
.dl-chips{display:flex;gap:6px;overflow-x:auto;margin-bottom:14px;scrollbar-width:none}.dl-chips button{flex-shrink:0;padding:6px 14px;border-radius:20px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:#aaa;font:.8rem Cairo,sans-serif;cursor:pointer;white-space:nowrap}
.dl-chips button.on{border-color:#c9a84c;background:#c9a84c22;color:#c9a84c}.dl-chips button.add{border-style:dashed}
.dl-plbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}.dl-plbar span{display:flex;gap:6px}
h4{margin:16px 0 8px;font-size:.92rem;color:#c9a84c}.dl-sorthead{display:flex;justify-content:space-between;align-items:center}
.dl-row{display:flex;gap:10px;align-items:center;background:#111;border-radius:12px;padding:8px;margin-bottom:8px}
.dl-th{position:relative;flex:0 0 108px;aspect-ratio:16/9;border-radius:8px;overflow:hidden;background:#222}.dl-th img{width:100%;height:100%;object-fit:cover;display:block}
.dl-play{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.35);color:#fff}
.dl-body{flex:1;min-width:0}.dl-t{font-size:.86rem;font-weight:600;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.dl-m{font-size:.72rem;color:#999;margin-top:3px}.dl-m.err{color:#e57373}.dl-bar{height:5px;background:#2a2a2a;border-radius:3px;margin-top:6px;overflow:hidden}.dl-bar i{display:block;height:100%;background:linear-gradient(90deg,#c9a84c,#f0d98a);transition:width .4s}
.dl-acts{display:flex;flex-direction:column;gap:4px}.dl-b{background:#1d1d1d;border:1px solid rgba(255,255,255,.08);color:#ddd;border-radius:10px;width:38px;height:38px;display:flex;align-items:center;justify-content:center;cursor:pointer}.dl-b.del{color:#e57373}
.dl-empty{text-align:center;color:#666;padding:48px 12px;line-height:1.9;font-size:.88rem}
</style>`);
