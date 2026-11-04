// ─────────────────────────────────────────────
//  الدحيح PWA  —  app.js
// ─────────────────────────────────────────────

const ACCENT = '#c9a84c';
const CAT_COLORS = {
  // seasons / sources
  history:      '#92400e', biology:      '#15803d',
  medicine:     '#b91c1c', psychology:   '#6b21a8',
  technology:   '#1d4ed8', economics:    '#0f766e',
  characters:   '#c9a84c', general:      '#4b5563',
  sociology:    '#374151', physics:      '#1e40af',
  sports:       '#059669', wars:         '#991b1b',
  philosophy:   '#7c2d12', literature:   '#9d174d',
  astronomy:    '#1e3a5f', politics:     '#dc2626',
  art:          '#d97706', architecture: '#78350f',
  cinema:       '#7e22ce', geology:      '#065f46',
  geography:    '#0e7490', chemistry:    '#166534',
  // legacy source/season keys (kept for category field)
  ajplus: '#c9a84c', s1:'#b45309', s3:'#166534', s4:'#991b1b',
  s5:'#1e40af', s6:'#6b21a8', s7:'#0f766e', s8:'#0e7490', smf:'#7c2d12',
};
const CAT_GRADIENTS = {
  history:      'linear-gradient(135deg,#3d1f00,#1a0d00)',
  biology:      'linear-gradient(135deg,#002510,#001208)',
  medicine:     'linear-gradient(135deg,#3d0000,#1a0000)',
  psychology:   'linear-gradient(135deg,#1f0040,#0f0020)',
  technology:   'linear-gradient(135deg,#001040,#000820)',
  economics:    'linear-gradient(135deg,#002a26,#001513)',
  characters:   'linear-gradient(135deg,#3d2a00,#1a1200)',
  general:      'linear-gradient(135deg,#111820,#080c10)',
  sociology:    'linear-gradient(135deg,#111820,#080c10)',
  physics:      'linear-gradient(135deg,#001040,#000820)',
  sports:       'linear-gradient(135deg,#003d1a,#001a0c)',
  wars:         'linear-gradient(135deg,#3d0000,#1a0000)',
  philosophy:   'linear-gradient(135deg,#2a0e00,#150700)',
  literature:   'linear-gradient(135deg,#350018,#1a000c)',
  astronomy:    'linear-gradient(135deg,#000820,#000410)',
  politics:     'linear-gradient(135deg,#3d0000,#1a0000)',
  art:          'linear-gradient(135deg,#3d2000,#1a0e00)',
  architecture: 'linear-gradient(135deg,#2a1500,#150a00)',
  cinema:       'linear-gradient(135deg,#1f0040,#0f0020)',
  geology:      'linear-gradient(135deg,#002a1a,#001510)',
  geography:    'linear-gradient(135deg,#002535,#001218)',
  chemistry:    'linear-gradient(135deg,#002510,#001208)',
  // legacy
  ajplus:'linear-gradient(135deg,#3d2a00,#1a1200)',
  s1:'linear-gradient(135deg,#3d1f00,#1a0d00)',
  s3:'linear-gradient(135deg,#002510,#001208)',
  s4:'linear-gradient(135deg,#3d0000,#1a0000)',
  s5:'linear-gradient(135deg,#001040,#000820)',
  s6:'linear-gradient(135deg,#1f0040,#0f0020)',
  s7:'linear-gradient(135deg,#002a26,#001513)',
  s8:'linear-gradient(135deg,#002535,#001218)',
  smf:'linear-gradient(135deg,#2a0e00,#150700)',
};
const QUALITY_LABELS = {
  hd1080:'1080p', hd720:'720p', large:'480p',
  medium:'360p', small:'240p', tiny:'144p', auto:'تلقائي'
};

let EPISODES = [], CATEGORIES = [];

// يتم استبدال القيم دي تلقائياً أثناء البناء على GitHub Actions
const REPO = '__REPO__', BRANCH = '__BRANCH__';
async function loadJSON(name) {
  if (!REPO.startsWith('__')) {          // نسخة محدّثة من GitHub، ولو فشلت نستخدم النسخة المدمجة
    try {
      const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 4000);
      const r = await fetch(`https://raw.githubusercontent.com/${REPO}/${BRANCH}/www/${name}?t=${Date.now()}`, {signal: ac.signal});
      clearTimeout(t);
      if (r.ok) return await r.json();
    } catch {}
  }
  return fetch(name).then(r => r.json());
}

// ══════════════════════════════════════════════
//  BOOT
// ══════════════════════════════════════════════
async function boot() {
  const [eps, cats] = await Promise.all([loadJSON('episodes.json'), loadJSON('categories.json')]);
  EPISODES = mergeExtras(eps); CATEGORIES = cats;
  setupRouter(); route(); startReleaseWatcher();
}
function setupRouter() { window.addEventListener('hashchange', route); }
function route() {
  const hash = location.hash || '#/';
  closeSheet();
  if (hash.startsWith('#/watch/')) renderWatch(parseInt(hash.split('/')[2]));
  else if (hash.startsWith('#/downloads')) renderDownloads();
  else if (hash.startsWith('#/local/')) renderLocal(decodeURIComponent(hash.slice(8)));
  else {
    const p = new URLSearchParams(hash.includes('?') ? hash.split('?')[1] : '');
    renderHome(p.get('cat') || 'all');
  }
}
function navigate(path) { location.hash = path; }

// ══════════════════════════════════════════════
//  SMART SEARCH
// ══════════════════════════════════════════════
function normalizeAr(s) {
  return (s||'').toLowerCase()
    .replace(/[أإآا]/g,'ا').replace(/[ة]/g,'ه').replace(/[ى]/g,'ي')
    .replace(/[\u064B-\u065F]/g,'')
    .replace(/\s+/g,' ').trim();
}
function levenshtein(a, b) {
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m=a.length, n=b.length;
  const dp=Array.from({length:m+1},(_,i)=>[i,...Array(n).fill(0)]);
  for(let j=0;j<=n;j++) dp[0][j]=j;
  for(let i=1;i<=m;i++) for(let j=1;j<=n;j++)
    dp[i][j]=a[i-1]===b[j-1]?dp[i-1][j-1]:1+Math.min(dp[i-1][j],dp[i][j-1],dp[i-1][j-1]);
  return dp[m][n];
}
function smartSearch(q) {
  const nq = normalizeAr(q);
  if (nq.length < 2) return [];
  const words = nq.split(/\s+/).filter(w=>w.length>1);

  return EPISODES.map(ep => {
    const title = normalizeAr(ep.title);
    const desc  = normalizeAr(ep.desc||'');
    const tags  = (ep.tags||[]).map(normalizeAr).join(' ');
    const allText = title + ' ' + tags + ' ' + desc;
    let score = 0;

    // Exact title match = highest
    if (title===nq) score += 200;
    else if (title.includes(nq)) score += 100;

    for (const w of words) {
      if (w.length < 2) continue;
      // Title match
      if (title.includes(w)) score += 50;
      // Tags match
      else if (tags.includes(w)) score += 30;
      // Description match (contextual - includes source books/refs)
      else if (desc.includes(w)) score += 15;
      else {
        // Fuzzy match against title tokens
        for (const t of (title+' '+tags).split(/\s+/)) {
          if (t.length < 2) continue;
          const maxL=Math.max(w.length,t.length);
          if(maxL===0) continue;
          const sim=1-levenshtein(w,t)/maxL;
          if(sim>=0.72) score+=Math.round(sim*20);
        }
      }
    }
    return {ep, score};
  }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).map(x=>x.ep);
}

// ══════════════════════════════════════════════
//  SVG ICONS
// ══════════════════════════════════════════════
const svgSearch = (s,c='currentColor') =>
  `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`;
const svgX = s =>
  `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>`;
const svgPlay = (s,fill='currentColor') =>
  `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="${fill}"><polygon points="5,3 19,12 5,21"/></svg>`;
const svgPause = s =>
  `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
const svgVol = (s,muted) => muted
  ? `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>`
  : `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`;
const svgFS = (s,full) => full
  ? `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>`
  : `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>`;
const svgGear = s =>
  `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;
const svgChevL = s =>
  `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg>`;
const svgChevR = s =>
  `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>`;
const svgSkipB = s =>
  `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="currentColor"><polygon points="19,20 9,12 19,4"/><rect x="5" y="4" width="2" height="16"/></svg>`;
const svgSkipF = s =>
  `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,4 15,12 5,20"/><rect x="17" y="4" width="2" height="16"/></svg>`;
const svgSun = s =>
  `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;

// ══════════════════════════════════════════════
//  HEADER + SEARCH
// ══════════════════════════════════════════════
let _hdrScrollFn = null;
function mountScrollHeader(el, solid=false) {
  if (_hdrScrollFn) window.removeEventListener('scroll', _hdrScrollFn);
  _hdrScrollFn = () => {
    const s = solid || window.scrollY > 30;
    el.style.background = s ? 'rgba(8,8,8,0.98)' : 'linear-gradient(to bottom,rgba(8,8,8,0.95),transparent)';
    el.style.backdropFilter = s ? 'blur(12px)' : 'none';
    el.style.borderBottom = s ? '1px solid rgba(255,255,255,0.05)' : 'none';
  };
  window.addEventListener('scroll', _hdrScrollFn, {passive:true});
  _hdrScrollFn();
}
function headerHTML() {
  return `
<header id="main_hdr" style="position:fixed;top:0;left:0;right:0;z-index:100;padding:env(safe-area-inset-top,0px) var(--px) 0;height:calc(64px + env(safe-area-inset-top,0px));
  display:flex;align-items:center;justify-content:space-between;transition:background .3s,border-color .3s;" dir="rtl">
  <button onclick="navigate('#/')" style="background:none;border:none;cursor:pointer;display:flex;align-items:center;gap:10px;padding:0;">
    <div style="width:34px;height:34px;border-radius:8px;background:linear-gradient(135deg,#c9a84c,#8a6a20);
      display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(201,168,76,.3);">
      <span style="color:#000;font-weight:700;font-size:1rem;font-family:'Cairo',sans-serif;">د</span></div>
    <span style="font-family:'Cairo',sans-serif;letter-spacing:-.02em;background:linear-gradient(90deg,#c9a84c,#f0d98a);
      -webkit-background-clip:text;-webkit-text-fill-color:transparent;">الدحيح</span>
  </button>
  <div style="display:flex;gap:8px;align-items:center;">
  <button onclick="navigate('#/downloads')" aria-label="التحميلات" style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);border-radius:8px;color:#c9a84c;width:38px;height:36px;cursor:pointer;display:flex;align-items:center;justify-content:center;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M6 11l6 6 6-6M4 21h16"/></svg></button>
  <button onclick="openSearchBar()" style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);
    border-radius:8px;color:#888;padding:8px 14px;cursor:pointer;display:flex;align-items:center;gap:8px;
    font-family:'Cairo',sans-serif;transition:border-color .2s,background .2s;"
    onmouseenter="this.style.borderColor='rgba(201,168,76,.3)';this.style.background='rgba(255,255,255,.08)'"
    onmouseleave="this.style.borderColor='rgba(255,255,255,.08)';this.style.background='rgba(255,255,255,.06)'">
    ${svgSearch(16,'#888')}<span style="font-size:.85rem;">بحث</span>
  </button></div>
</header>
<div id="srch_bar" style="display:none;position:fixed;top:0;left:0;right:0;z-index:101;
  padding:calc(12px + env(safe-area-inset-top,0px)) var(--px) 12px;background:rgba(8,8,8,.98);backdrop-filter:blur(12px);
  border-bottom:1px solid rgba(255,255,255,.06);" dir="rtl">
  <div style="display:flex;align-items:center;gap:10px;max-width:700px;margin:0 auto;">
    ${svgSearch(18,'#888')}
    <input id="srch_input" placeholder="ابحث في الحلقات…" oninput="doSearch(this.value)"
      style="flex:1;background:transparent;border:none;color:#f0f0f0;font-family:'Cairo',sans-serif;
        font-size:1rem;outline:none;" dir="rtl"/>
    <button onclick="closeSearchBar()" style="background:none;border:none;color:#666;cursor:pointer;padding:4px;">
      ${svgX(20)}</button>
  </div>
</div>`;
}
window.openSearchBar = () => {
  document.getElementById('srch_bar').style.display='block';
  setTimeout(()=>document.getElementById('srch_input')?.focus(),50);
};
window.closeSearchBar = () => {
  document.getElementById('srch_bar').style.display='none';
  const inp=document.getElementById('srch_input'); if(inp) inp.value='';
  const res=document.getElementById('srch_results'); if(res) res.style.display='none';
};
window.doSearch = (q) => {
  const res=document.getElementById('srch_results'); if(!res) return;
  if(!q||q.trim().length<2){ res.style.display='none'; return; }
  const found=smartSearch(q);
  res.style.display='block';
  res.innerHTML=`
    <div style="padding:calc(88px + env(safe-area-inset-top,0px)) var(--px) 28px;" dir="rtl">
      <h2 style="color:#f0f0f0;margin:0 0 6px;font-family:'Cairo',sans-serif;">نتائج البحث عن "${q}"</h2>
      <p style="color:#555;margin:0 0 28px;font-size:.85rem;font-family:'Cairo',sans-serif;">${found.length} نتيجة</p>
      ${found.length===0
        ? `<div style="text-align:center;padding:80px 0;color:#444;font-family:'Cairo',sans-serif;"><p>لا توجد نتائج مطابقة</p></div>`
        : `<div class="ep-grid">
            ${found.map(ep=>episodeCardHTML(ep)).join('')}</div>`}
    </div>`;
  attachCardHovers();
};

// ══════════════════════════════════════════════
//  YOUTUBE IFRAME API PLAYER
// ══════════════════════════════════════════════
let _ytReady=false, _ytCbs=[];
function loadYTApi(cb) {
  if(_ytReady){cb();return;}
  _ytCbs.push(cb);
  if(!window._ytLoading){
    window._ytLoading=true;
    window.onYouTubeIframeAPIReady=()=>{_ytReady=true;_ytCbs.forEach(f=>f());_ytCbs=[];};
    const s=document.createElement('script'); s.src='https://www.youtube.com/iframe_api';
    document.head.appendChild(s);
  }
}
function formatTime(sec) {
  if(!sec||isNaN(sec)) return '0:00';
  const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=Math.floor(sec%60);
  if(h>0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}

// Player state (global mutable object)
let P = {
  yt:null, playing:false, muted:false, vol:80, bright:1,
  cur:0, dur:0, fullscreen:false, showCtrl:true,
  rate:1, quality:'auto', qualities:[],
  settingsTab:'speed', settingsOpen:false,
  buffering:false, ready:false, error:false,
  ctrlTimer:null, raf:null,
};
let GS = {sy:0,sx:0,sv:80,drag:false,side:'r',lT:0,lS:null,pend:null};
let _sliderHideTimer = null;



// showVSlider defined below


function playerMount(videoId) {
  P = {...P, _currentVideoId:videoId, yt:null, playing:false, cur:0, dur:0, ready:false, error:false,
       buffering:false, showCtrl:true, settingsOpen:false, quality:'auto', qualities:[]};
  _overlayVisible=true;
  if(P.raf){cancelAnimationFrame(P.raf);P.raf=null;}

  loadYTApi(()=>{
    const div=document.getElementById('yt_div'); if(!div) return;
    try {
      P.yt = new window.YT.Player('yt_div',{
        videoId,
        playerVars:{controls:1,rel:0,modestbranding:1,enablejsapi:1,
                    playsinline:1,iv_load_policy:3,origin:window.location.origin,widget_referrer:window.location.href},
        events:{
          onReady: e=>{
            e.target.setVolume(P.vol);
            P.dur=e.target.getDuration()||0;
            P.ready=true;
            // Fetch qualities after slight delay - not available in onReady
            setTimeout(()=>{
              try{
                const q = e.target.getAvailableQualityLevels();
                if(q && q.length>1) P.qualities=q;
              }catch{}
            }, 2000);
            pUI();
          },
          onStateChange: e=>{
            const s=e.data;
            if(s===1){
              P.playing=true;P.buffering=false;schedHide();
              // Fetch qualities once video is actually playing
              if(!P.qualities||P.qualities.length===0){
                try{
                  const q=e.target.getAvailableQualityLevels();
                  if(q&&q.length>0) P.qualities=q;
                }catch{}
              }
            }
            else if(s===2){P.playing=false;showCtrl();}
            else if(s===3){P.buffering=true;}
            else if(s===0){P.playing=false;showCtrl();}
            else if(s===-1){P.playing=false;}
            pUI();
          },
          onError:()=>{P.error=true;pUI();},
        },
      });
    } catch{P.error=true;pUI();}
  });

  // RAF - track time for seek gestures
  const tick=()=>{
    if(P.yt?.getCurrentTime){
      try{
        const ct=P.yt.getCurrentTime(),dur=P.yt.getDuration();
        if(!isNaN(ct))P.cur=ct; if(!isNaN(dur)&&dur>0)P.dur=dur;
      }catch{}
    }
    P.raf=requestAnimationFrame(tick);
  };
  P.raf=requestAnimationFrame(tick);

  document.addEventListener('fullscreenchange',()=>{
    P.fullscreen=!!document.fullscreenElement;
    if(P.fullscreen){
      _mountFsVolStrip();
    } else {
      _unmountFsVolStrip();
    }
  });
}

// Mount a floating vol_strip + vslider on body during fullscreen
// (our player_wrap elements are hidden when YT iframe goes fullscreen)
function _mountFsVolStrip(){
  _unmountFsVolStrip(); // clean any old one
  const strip=document.createElement('div');
  strip.id='fs_vol_strip';
  strip.style.cssText=`position:fixed;top:0;right:0;width:60px;bottom:15%;z-index:2147483647;touch-action:none;
    display:flex;align-items:center;justify-content:center;`;
  strip.innerHTML=`<div style="width:4px;height:40px;background:rgba(255,255,255,.15);border-radius:2px;pointer-events:none;"></div>`;
  strip.addEventListener('pointerdown', gDown);
  strip.addEventListener('pointermove', gMove);
  strip.addEventListener('pointerup', gUp);
  strip.addEventListener('pointercancel', gUp);

  const slider=document.createElement('div');
  slider.id='fs_vslider';
  slider.style.cssText=`display:none;position:fixed;right:68px;top:50%;transform:translateY(-50%);
    z-index:2147483647;pointer-events:none;flex-direction:column;align-items:center;gap:8px;`;
  slider.innerHTML=`
    <span class="vs_lbl" style="color:white;font-size:.9rem;font-weight:700;font-family:'Cairo',sans-serif;
      text-shadow:0 2px 6px rgba(0,0,0,1);">${P.vol}%</span>
    <div style="width:46px;height:180px;background:rgba(0,0,0,.75);border-radius:23px;
      border:1px solid rgba(255,255,255,.15);display:flex;flex-direction:column;justify-content:flex-end;overflow:hidden;">
      <div class="vs_fill" style="width:100%;height:${P.vol}%;background:linear-gradient(to top,#c9a84c,#f0d980);transition:height .03s linear;"></div>
    </div>
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`;

  document.body.appendChild(strip);
  document.body.appendChild(slider);
}

function _unmountFsVolStrip(){
  document.getElementById('fs_vol_strip')?.remove();
  document.getElementById('fs_vslider')?.remove();
}


function pUI(){
  const er=document.getElementById('yt_err'); if(er)er.style.display=P.error?'flex':'none';
}

// schedHide / showCtrl / pTapOverlay kept as stubs (YouTube handles its own controls now)
let _overlayVisible = true;
function schedHide(){}
function showCtrl(){}
window.pTapOverlay=()=>{};

window.pTogglePlay=()=>{
  if(!P.yt||!P.ready)return;
  try{if(P.yt.getPlayerState()===1){P.yt.pauseVideo();pPulse(false);}else{P.yt.playVideo();pPulse(true);}}catch{}
};
window.pSeek=(delta)=>{
  if(!P.yt)return;
  try{const t=Math.max(0,Math.min(P.dur,(P.yt.getCurrentTime()||0)+delta));P.yt.seekTo(t,true);}catch{}
  showSeekAnim(delta<0?'left':'right',Math.abs(delta));
};
window.pToggleMute=()=>{
  if(!P.yt)return;
  try{if(P.muted){P.yt.unMute();P.yt.setVolume(P.vol||50);P.muted=false;}else{P.yt.mute();P.muted=true;}pUI();}catch{}
};
window.pFS=()=>{
  const c=document.getElementById('player_wrap'); if(!c)return;
  if(!document.fullscreenElement){
    c.requestFullscreen().catch(()=>{}).then(()=>{
      try{ screen.orientation?.lock('landscape').catch(()=>{}); }catch(e){}
    }).catch(()=>{});
  } else {
    document.exitFullscreen().then(()=>{
      try{ screen.orientation?.unlock(); }catch(e){}
    }).catch(()=>{});
  }
};

window.pSetRate=(r)=>{
  P.rate=r; try{P.yt?.setPlaybackRate(r);}catch{}
  pRenderSettings();
};

window.pToggleSettings=(tab)=>{
  const m=document.getElementById('settings_menu'); if(!m)return;
  if(P.settingsOpen&&P.settingsTab===tab){pCloseSettings();return;}
  P.settingsOpen=true; P.settingsTab=tab; pRenderSettings();
  m.style.display='block';
  setTimeout(()=>{
    const onOut=(ev)=>{
      const gear=document.getElementById('gear_btn');
      if(!m.contains(ev.target)&&ev.target!==gear&&!gear?.contains(ev.target)){
        pCloseSettings();
        document.removeEventListener('pointerdown',onOut,true);
      }
    };
    document.addEventListener('pointerdown',onOut,true);
  },50);
};
window.pCloseSettings=()=>{P.settingsOpen=false;const m=document.getElementById('settings_menu');if(m)m.style.display='none';};
window.pOpenYT=()=>{
  const ep=EPISODES.find(e=>e.videoId===P._currentVideoId);
  const vid=P._currentVideoId||'';
  if(vid) window.open('https://www.youtube.com/watch?v='+vid,'_blank');
  pCloseSettings();
};
window._pNavPrev=()=>{
  const hash=location.hash||'';
  if(!hash.startsWith('#/watch/'))return;
  const id=parseInt(hash.split('/')[2]);
  const ep=EPISODES.find(e=>e.id===id); if(!ep)return;
  const same=EPISODES.filter(e=>e.category===ep.category);
  const idx=same.findIndex(e=>e.id===id);
  if(idx>0)navigate('#/watch/'+same[idx-1].id);
};
window._pNavNext=()=>{
  const hash=location.hash||'';
  if(!hash.startsWith('#/watch/'))return;
  const id=parseInt(hash.split('/')[2]);
  const ep=EPISODES.find(e=>e.id===id); if(!ep)return;
  const same=EPISODES.filter(e=>e.category===ep.category);
  const idx=same.findIndex(e=>e.id===id);
  if(idx<same.length-1)navigate('#/watch/'+same[idx+1].id);
};
window.pSetTab=(tab)=>{P.settingsTab=tab;pRenderSettings();};

window.pSetQuality=(q)=>{
  P.quality=q;
  try{P.yt?.setPlaybackQuality(q);}catch{}
  pRenderSettings();
};

function pRenderSettings(){
  const m=document.getElementById('settings_menu'); if(!m)return;
  const rates=[0.5,0.75,1,1.25,1.5,2];
  const hasQualities=P.qualities&&P.qualities.length>0;

  // Tabs header
  let html=`<div style="display:flex;border-bottom:1px solid rgba(255,255,255,.07);margin-bottom:4px;padding:0 4px;">`;
  html+=`<button onclick="event.stopPropagation();pSetTab('speed')" style="flex:1;padding:6px 4px;font-size:.75rem;border:none;cursor:pointer;border-radius:6px 6px 0 0;font-family:Cairo,sans-serif;background:transparent;color:${P.settingsTab==='speed'?ACCENT:'rgba(255,255,255,.5)'};border-bottom:2px solid ${P.settingsTab==='speed'?ACCENT:'transparent'};">السرعة</button>`;
  if(hasQualities){
    html+=`<button onclick="event.stopPropagation();pSetTab('quality')" style="flex:1;padding:6px 4px;font-size:.75rem;border:none;cursor:pointer;border-radius:6px 6px 0 0;font-family:Cairo,sans-serif;background:transparent;color:${P.settingsTab==='quality'?ACCENT:'rgba(255,255,255,.5)'};border-bottom:2px solid ${P.settingsTab==='quality'?ACCENT:'transparent'};">الجودة</button>`;
  }
  html+=`</div>`;

  if(P.settingsTab==='speed'){
    for(const r of rates){
      html+=`<button onclick="event.stopPropagation();pSetRate(${r})" class="rate_btn" data-r="${r}" style="display:block;width:100%;text-align:right;padding:7px 12px;font-size:.83rem;border:none;cursor:pointer;border-radius:6px;font-family:Cairo,sans-serif;color:${P.rate===r?ACCENT:'rgba(255,255,255,.8)'};background:${P.rate===r?ACCENT+'18':'transparent'};">${r===1?'عادي':r+'×'}</button>`;
    }
  } else if(P.settingsTab==='quality' && hasQualities){
    for(const q of P.qualities){
      const lbl=QUALITY_LABELS[q]||q;
      const active=P.quality===q||(P.quality==='auto'&&q==='auto');
      html+=`<button onclick="event.stopPropagation();pSetQuality('${q}')" style="display:block;width:100%;text-align:right;padding:7px 12px;font-size:.83rem;border:none;cursor:pointer;border-radius:6px;font-family:Cairo,sans-serif;color:${active?ACCENT:'rgba(255,255,255,.8)'};background:${active?ACCENT+'18':'transparent'};">${lbl}</button>`;
    }
  }

  html+='<div style="border-top:1px solid rgba(255,255,255,.05);margin-top:4px;padding-top:2px;">';
  html+=`<button onclick="event.stopPropagation();pOpenYT()" style="display:flex;align-items:center;gap:8px;width:100%;padding:7px 12px;font-size:.8rem;border:none;cursor:pointer;border-radius:6px;font-family:Cairo,sans-serif;color:rgba(255,255,255,.65);background:transparent;"><svg width="13" height="13" viewBox="0 0 24 24" fill="#ff0000"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.77a4.85 4.85 0 01-1.01-.08z"/></svg>فتح على يوتيوب</button>`;
  html+='</div>';
  m.innerHTML=html;
}

// ── Gesture system ──────────────────────────────
// Right edge strip: vertical swipe → volume slider
// No gesture layer over the main iframe - YouTube handles everything else
let _gSlide=false,_gStartY=0,_gStartVol=80;

window.gDown=(e)=>{
  _gSlide=false;
  _gStartY=e.clientY;
  _gStartVol=P.vol;
  GS.sy=e.clientY; GS.sx=e.clientX; GS.drag=false;
  try{e.currentTarget.setPointerCapture(e.pointerId);}catch{}
};

window.gMove=(e)=>{
  const dy=_gStartY-e.clientY;
  const dx=Math.abs(e.clientX-GS.sx);
  // Start volume slide once clearly vertical
  if(!_gSlide && Math.abs(dy)>8 && Math.abs(dy)>dx){
    _gSlide=true;
    GS.drag=true;
    _vsShow(P.vol);
  }
  if(!_gSlide) return;
  // 160px swipe = full 0→100
  const nv=Math.max(0,Math.min(100,_gStartVol+(dy/1.6)));
  P.vol=Math.round(nv); P.muted=nv===0;
  try{P.yt?.setVolume(Math.round(nv));if(nv>0)P.yt?.unMute();}catch{}
  _vsShow(nv);
};

window.gUp=(e)=>{
  if(_gSlide){
    _gSlide=false; GS.drag=false;
    if(_sliderHideTimer)clearTimeout(_sliderHideTimer);
    _sliderHideTimer=setTimeout(()=>{
      const el=document.getElementById('vslider_r'); if(el)el.style.display='none';
      const fs=document.getElementById('fs_vslider'); if(fs)fs.style.display='none';
    },1000);
  }
  _gSlide=false;
};

function _vsShow(val){
  const pct=Math.round(Math.max(0,Math.min(100,val)));
  // normal player slider
  const el=document.getElementById('vslider_r');
  if(el){
    el.style.display='flex';
    const fill=el.querySelector('.vs_fill'); if(fill)fill.style.height=pct+'%';
    const lbl=el.querySelector('.vs_lbl'); if(lbl)lbl.textContent=pct+'%';
  }
  // fullscreen slider
  const fs=document.getElementById('fs_vslider');
  if(fs){
    fs.style.display='flex';
    const fill=fs.querySelector('.vs_fill'); if(fill)fill.style.height=pct+'%';
    const lbl=fs.querySelector('.vs_lbl'); if(lbl)lbl.textContent=pct+'%';
  }
}

function pPulse(playing){
  const p=document.getElementById('yt_pulse'); if(!p)return;
  p.innerHTML=`<div style="width:80px;height:80px;border-radius:50%;background:rgba(0,0,0,.6);
    display:flex;align-items:center;justify-content:center;">${playing?svgPlay(36,'white'):svgPause(36)}</div>`;
  p.style.display='flex'; p.style.animation='none';
  requestAnimationFrame(()=>{p.style.animation='fadeOut .6s ease forwards';});
  setTimeout(()=>{if(p)p.style.display='none';},600);
}
function showSeekAnim(side,secs){
  const el=document.getElementById('seek_'+side); if(!el)return;
  el.querySelector('.seek_lbl').textContent=secs+' ثانية';
  el.style.display='flex'; el.style.animation='none';
  requestAnimationFrame(()=>{el.style.animation='seekPulse .7s ease forwards';});
  setTimeout(()=>{if(el)el.style.display='none';},700);
}

function btnCSS(extra=''){
  return `background:transparent;border:none;color:white;cursor:pointer;display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:8px;transition:background .15s;flex-shrink:0;${extra}`;
}

function videoPlayerHTML(videoId){
  return `
<div id="player_wrap" style="position:relative;width:100%;aspect-ratio:16/9;background:#000;overflow:hidden;user-select:none;">

  <!-- YouTube iframe fills everything - no overlays blocking it -->
  <div style="position:absolute;inset:0;">
    <div id="yt_div" style="width:100%;height:100%;"></div>
  </div>

  <!-- Error -->
  <div id="yt_err" style="display:none;position:absolute;inset:0;z-index:30;background:#111;
    flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:2rem;">
    <div style="font-size:2.5rem;margin-bottom:1rem;">⚠</div>
    <p style="color:#f0f0f0;font-family:'Cairo',sans-serif;">الفيديو غير متاح</p>
  </div>

  <!-- Seek animation left (backward) - pointer-events:none so it never blocks -->
  <div id="seek_left" style="display:none;position:absolute;top:50%;transform:translateY(-50%);left:10%;
    z-index:30;flex-direction:column;align-items:center;gap:4px;pointer-events:none;">
    <div style="background:rgba(0,0,0,.65);border-radius:40px;padding:14px 22px;
      display:flex;flex-direction:column;align-items:center;gap:6px;backdrop-filter:blur(8px);">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="white"><path d="M11 17l-5-5 5-5v3.5h8v3H11V17z"/></svg>
      <span class="seek_lbl" style="color:white;font-size:.85rem;font-family:'Cairo',sans-serif;font-weight:600;"></span>
    </div>
  </div>
  <!-- Seek animation right (forward) -->
  <div id="seek_right" style="display:none;position:absolute;top:50%;transform:translateY(-50%);right:60px;
    z-index:30;flex-direction:column;align-items:center;gap:4px;pointer-events:none;">
    <div style="background:rgba(0,0,0,.65);border-radius:40px;padding:14px 22px;
      display:flex;flex-direction:column;align-items:center;gap:6px;backdrop-filter:blur(8px);">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="white"><path d="M13 7l5 5-5 5v-3.5H5v-3h8V7z"/></svg>
      <span class="seek_lbl" style="color:white;font-size:.85rem;font-family:'Cairo',sans-serif;font-weight:600;"></span>
    </div>
  </div>

  <!-- Volume slider display (pointer-events:none - never blocks iframe) -->
  <div id="vslider_r" style="display:none;position:absolute;right:56px;top:50%;transform:translateY(-50%);
    z-index:30;pointer-events:none;flex-direction:column;align-items:center;gap:8px;">
    <span class="vs_lbl" style="color:white;font-size:.9rem;font-weight:700;font-family:'Cairo',sans-serif;
      text-shadow:0 2px 6px rgba(0,0,0,1);">80%</span>
    <div style="width:46px;height:180px;background:rgba(0,0,0,.75);border-radius:23px;
      border:1px solid rgba(255,255,255,.15);
      display:flex;flex-direction:column;justify-content:flex-end;overflow:hidden;">
      <div class="vs_fill" style="width:100%;height:80%;background:linear-gradient(to top,#c9a84c,#f0d980);
        transition:height .03s linear;"></div>
    </div>
    ${svgVol(22,'white')}
  </div>

  <!-- RIGHT EDGE STRIP: narrow touch zone for volume swipe - does NOT cover the iframe center -->
  <div id="vol_strip" style="position:absolute;top:0;right:0;width:52px;bottom:15%;z-index:20;touch-action:none;
    display:flex;align-items:center;justify-content:center;"
    onpointerdown="gDown(event)" onpointermove="gMove(event)" onpointerup="gUp(event)" onpointercancel="gUp(event)">
    <!-- subtle drag hint -->
    <div style="width:4px;height:40px;background:rgba(255,255,255,.12);border-radius:2px;pointer-events:none;"></div>
  </div>

</div>`;
}



// ══════════════════════════════════════════════
function fmtViews(n) {
  if (!n) return '';
  if (n >= 1000000) return (n/1000000).toFixed(1).replace('.0','') + 'M';
  if (n >= 1000) return (n/1000).toFixed(0) + 'K';
  return n.toString();
}

function episodeCardHTML(ep){
  const color=CAT_COLORS[ep.category]||ACCENT;
  const grad=CAT_GRADIENTS[ep.category]||'linear-gradient(135deg,#1a1a1a,#0a0a0a)';
  const cat=CATEGORIES.find(c=>c.id===ep.category);
  const eg=grad.replace(/'/g,"\\'");
  return `
<div onclick="navigate('#/watch/${ep.id}')" class="ep-card" data-id="${ep.id}" data-color="${color}"
  style="background:#111;border-radius:10px;overflow:hidden;cursor:pointer;position:relative;
    transition:transform .25s cubic-bezier(.25,.46,.45,.94),box-shadow .25s;box-shadow:0 4px 12px rgba(0,0,0,.4);">
  <div style="position:relative;aspect-ratio:16/9;overflow:hidden;">
    <img src="https://img.youtube.com/vi/${ep.videoId}/mqdefault.jpg" alt="${ep.title}"
      onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"
      style="width:100%;height:100%;object-fit:cover;transition:transform .4s ease;display:block;"/>
    <div style="display:none;width:100%;height:100%;background:${eg};
      flex-direction:column;align-items:center;justify-content:center;gap:8px;">
      <div style="width:40px;height:40px;border-radius:50%;background:${color}30;display:flex;align-items:center;justify-content:center;">${svgPlay(18,color)}</div>
    </div>
    <div class="ep-overlay" style="position:absolute;inset:0;background:rgba(0,0,0,.1);
      transition:background .2s;display:flex;align-items:center;justify-content:center;">
      <div class="ep-play" style="display:none;width:50px;height:50px;border-radius:50%;
        background:rgba(201,168,76,.9);align-items:center;justify-content:center;
        box-shadow:0 4px 20px rgba(201,168,76,.4);">${svgPlay(22,'#000')}</div>
    </div>
    ${ep.duration?`<div style="position:absolute;bottom:8px;right:8px;background:rgba(0,0,0,.82);border-radius:4px;padding:2px 6px;font-size:.68rem;color:rgba(255,255,255,.9);font-family:'Cairo',sans-serif;letter-spacing:.02em">${ep.duration}</div>`:''}
    ${ep.views?`<div style="position:absolute;bottom:8px;left:8px;background:rgba(0,0,0,.72);border-radius:4px;padding:2px 6px;font-size:.65rem;color:rgba(255,255,255,.7);font-family:'Cairo',sans-serif;display:flex;align-items:center;gap:3px;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>${fmtViews(ep.views)}</div>`:''}
  </div>
  <div style="padding:10px 12px 12px;">
    <h3 style="color:#f0f0f0;margin:0;overflow:hidden;display:-webkit-box;-webkit-line-clamp:1;
      -webkit-box-orient:vertical;font-size:.95rem;font-family:'Cairo',sans-serif;">${ep.title}</h3>
  </div>
</div>`;
}

// ══════════════════════════════════════════════
//  CATEGORY ROW
// ══════════════════════════════════════════════
function categoryRowHTML(cat,eps){
  if(!eps.length)return'';
  const rid='row_'+cat.id;
  return `
<section style="margin-bottom:48px;">
  <div style="display:flex;align-items:center;justify-content:space-between;padding:0 var(--px);margin-bottom:16px;" dir="rtl">
    <div style="display:flex;align-items:center;gap:12px;">
      <div style="width:4px;height:22px;border-radius:2px;background:linear-gradient(to bottom,${cat.color},${cat.color}88);"></div>
      <h2 style="color:#f0f0f0;margin:0;font-family:'Cairo',sans-serif;">${cat.name}</h2>
      <span style="color:#444;font-size:.8rem;font-family:'Cairo',sans-serif;">(${eps.length} حلقة)</span>
    </div>
    <button onclick="navigate('#/?cat=${cat.id}')" style="background:none;border:none;color:${ACCENT};cursor:pointer;
      font-size:.85rem;display:flex;align-items:center;gap:4px;font-family:'Cairo',sans-serif;">
      عرض الكل ${svgChevL(14)}</button>
  </div>
  <div style="position:relative;">
    <button class="row-arrow" onclick="scrollRow('${rid}',-1)" style="position:absolute;left:0;top:50%;transform:translateY(-50%);z-index:10;
      background:linear-gradient(to right,rgba(8,8,8,.95),transparent);border:none;color:white;cursor:pointer;
      height:100%;width:60px;display:flex;align-items:center;padding-left:8px;">${svgChevR(24)}</button>
    <div id="${rid}" class="hide-scrollbar" style="display:flex;gap:12px;overflow-x:auto;padding:4px var(--px) 8px;scrollbar-width:none;">
      ${eps.map(ep=>`<div class="row-card">${episodeCardHTML(ep)}</div>`).join('')}
    </div>
    <button class="row-arrow" onclick="scrollRow('${rid}',1)" style="position:absolute;right:0;top:50%;transform:translateY(-50%);z-index:10;
      background:linear-gradient(to left,rgba(8,8,8,.95),transparent);border:none;color:white;cursor:pointer;
      height:100%;width:60px;display:flex;align-items:center;justify-content:flex-end;padding-right:8px;">${svgChevL(24)}</button>
  </div>
</section>`;
}
window.scrollRow=(id,dir)=>{const el=document.getElementById(id);if(!el)return;el.scrollBy({left:dir*el.clientWidth*.75,behavior:'smooth'});};

// ══════════════════════════════════════════════
//  HERO + STATS
// ══════════════════════════════════════════════
function heroBannerHTML(ep){
  const cat=CATEGORIES.find(c=>c.id===ep.category),color=cat?cat.color:ACCENT;
  return `
<div class="hero" style="position:relative;width:100%;min-height:520px;overflow:hidden;display:flex;align-items:flex-end;" dir="rtl">
  <img src="https://img.youtube.com/vi/${ep.videoId}/maxresdefault.jpg"
    onerror="this.style.display='none';document.getElementById('hero_fb').style.display='block'"
    style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:blur(2px) brightness(.35);transform:scale(1.05);"/>
  <div id="hero_fb" style="display:none;position:absolute;inset:0;background:linear-gradient(135deg,#0a0a0a,${color}15);"></div>
  <div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(8,8,8,1) 0%,rgba(8,8,8,.7) 40%,rgba(8,8,8,.2) 70%,transparent 100%);"></div>
  <div style="position:absolute;inset:0;background:linear-gradient(to right,rgba(8,8,8,.9) 0%,rgba(8,8,8,.4) 50%,transparent 100%);"></div>
  <div style="position:relative;padding:80px var(--pxl) 60px;max-width:680px;z-index:2;">
    ${cat?`<div style="display:inline-flex;align-items:center;gap:6px;background:${color}22;border:1px solid ${color}44;border-radius:6px;padding:4px 12px;margin-bottom:16px;">
      <div style="width:6px;height:6px;border-radius:50%;background:${color};"></div>
      <span style="color:${color};font-size:.78rem;letter-spacing:.05em;font-family:'Cairo',sans-serif;">${cat.name}</span></div>`:''}
    <h1 style="color:#fff;margin:0 0 16px;line-height:1.2;letter-spacing:-.02em;text-shadow:0 2px 20px rgba(0,0,0,.5);font-family:'Cairo',sans-serif;">${ep.title}</h1>
    <div style="display:flex;gap:12px;align-items:center;">
      <button onclick="navigate('#/watch/${ep.id}')"
        style="display:flex;align-items:center;gap:10px;background:${ACCENT};border:none;border-radius:10px;
          color:#000;cursor:pointer;padding:13px 28px;font-family:'Cairo',sans-serif;
          box-shadow:0 8px 24px ${ACCENT}40;transition:transform .2s,box-shadow .2s;font-size:.95rem;"
        onmouseenter="this.style.transform='translateY(-2px)';this.style.boxShadow='0 12px 32px ${ACCENT}50'"
        onmouseleave="this.style.transform='';this.style.boxShadow='0 8px 24px ${ACCENT}40'">
        ${svgPlay(18)} مشاهدة الحلقة</button>
      <div style="color:rgba(255,255,255,.5);font-size:.82rem;font-family:'Cairo',sans-serif;">#${ep.id}</div>
    </div>
  </div>
  <div style="position:absolute;bottom:24px;left:var(--pxl);color:rgba(255,255,255,.06);font-size:8rem;font-family:'Cairo',sans-serif;font-weight:900;line-height:1;user-select:none;z-index:1;">#${ep.id}</div>
</div>`;
}
function statsBarHTML(){
  const cats=CATEGORIES.filter(c=>c.id!=='all').length;
  return `
<div style="display:flex;align-items:center;padding:20px var(--pxl);border-top:1px solid rgba(255,255,255,.04);
  border-bottom:1px solid rgba(255,255,255,.04);background:rgba(255,255,255,.02);margin-bottom:48px;" dir="rtl">
  ${[{v:EPISODES.length,l:'حلقة'},{v:cats,l:'قسم'}].map((s,i)=>`
    <div style="flex:1;text-align:center;${i<1?'border-right:1px solid rgba(255,255,255,.06);':''}">
      <div style="color:${ACCENT};font-family:'Cairo',sans-serif;font-weight:700;">${s.v}+</div>
      <div style="color:#555;font-size:.8rem;margin-top:2px;font-family:'Cairo',sans-serif;">${s.l}</div>
    </div>`).join('')}
</div>`;
}

// ══════════════════════════════════════════════
//  HOME
// ══════════════════════════════════════════════
function renderHome(activeCat){
  window.scrollTo(0,0);
  if(P.raf){cancelAnimationFrame(P.raf);P.raf=null;}
  const featured=EPISODES[Math.floor(Math.random()*Math.min(30,EPISODES.length))];

  document.getElementById('app').innerHTML=`
${headerHTML()}
<div id="srch_results" style="display:none;min-height:100vh;background:#080808;"></div>
<div id="home_body">
  ${heroBannerHTML(featured)}
  ${statsBarHTML()}
  <div dir="rtl" style="padding:0 var(--px) var(--px);">
    <!-- Source + Season pills -->
    <div class="hide-scrollbar" style="display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;margin-bottom:8px;">
      ${CATEGORIES.filter(c=>c.type==='all'||c.type==='source'||c.type==='season').map(cat=>`
        <button onclick="navigate('#/?cat=${cat.id}')"
          style="flex-shrink:0;padding:6px 14px;border-radius:20px;cursor:pointer;white-space:nowrap;
            font-family:'Cairo',sans-serif;font-size:.8rem;transition:all .2s;
            border:1px solid ${activeCat===cat.id?cat.color:'rgba(255,255,255,.08)'};
            background:${activeCat===cat.id?cat.color+'20':'rgba(255,255,255,.03)'};
            color:${activeCat===cat.id?cat.color:'rgba(255,255,255,.5)'};">${cat.name}</button>`).join('')}
    </div>
    <!-- Topic pills -->
    <div class="hide-scrollbar" style="display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;">
      ${CATEGORIES.filter(c=>c.type==='topic').map(cat=>`
        <button onclick="navigate('#/?cat=${cat.id}')"
          style="flex-shrink:0;padding:5px 13px;border-radius:20px;cursor:pointer;white-space:nowrap;
            font-family:'Cairo',sans-serif;font-size:.76rem;transition:all .2s;
            border:1px solid ${activeCat===cat.id?cat.color:'rgba(255,255,255,.07)'};
            background:${activeCat===cat.id?cat.color+'1a':'rgba(255,255,255,.02)'};
            color:${activeCat===cat.id?cat.color:'rgba(255,255,255,.45)'};">${cat.name}</button>`).join('')}
    </div>
  </div>
  <div id="cat_body"></div>
  <footer style="text-align:center;padding:40px var(--px);border-top:1px solid rgba(255,255,255,.04);color:#333;font-size:.8rem;">
    <p style="margin:0;font-family:'Cairo',sans-serif;">جميع الفيديوهات محتوى أصلي لقناة الدحيح على يوتيوب</p>
  </footer>
</div>`;

  mountScrollHeader(document.getElementById('main_hdr'),false);
  const body=document.getElementById('cat_body');
  function getEpsForCat(catId){
    const cat=CATEGORIES.find(c=>c.id===catId);
    if(!cat) return [];
    if(cat.type==='topic') return EPISODES.filter(e=>e.topic===catId);
    if(catId==='all') return EPISODES;
    return EPISODES.filter(e=>e.category===catId);
  }
  if(activeCat==='all'){
    // Show source+season rows first, then topic rows
    const rows=[
      ...CATEGORIES.filter(c=>c.type==='source'||c.type==='season'),
      ...CATEGORIES.filter(c=>c.type==='topic')
    ];
    body.innerHTML=rows.map(cat=>categoryRowHTML(cat,getEpsForCat(cat.id))).join('');
  } else {
    const cat=CATEGORIES.find(c=>c.id===activeCat);
    const eps=getEpsForCat(activeCat);
    body.innerHTML=`
      <div style="padding:0 var(--px) 60px;" dir="rtl">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:28px;">
          <div style="width:4px;height:22px;border-radius:2px;background:${cat?.color};"></div>
          <h2 style="color:#f0f0f0;margin:0;font-family:'Cairo',sans-serif;">${cat?.name}</h2>
          <span style="color:#444;font-size:.8rem;font-family:'Cairo',sans-serif;">(${eps.length} حلقة)</span>
        </div>
        <div class="ep-grid">
          ${eps.map(ep=>episodeCardHTML(ep)).join('')}
        </div>
      </div>`;
  }
  attachCardHovers();
}

// ══════════════════════════════════════════════
//  WATCH
// ══════════════════════════════════════════════
function renderWatch(id){
  window.scrollTo(0,0);
  if(P.raf){cancelAnimationFrame(P.raf);P.raf=null;}
  const ep=EPISODES.find(e=>e.id===id);
  if(!ep){
    document.getElementById('app').innerHTML=`
      <div style="min-height:100vh;background:#080808;display:flex;flex-direction:column;
        align-items:center;justify-content:center;gap:16px;font-family:'Cairo',sans-serif;">
        <p style="color:#888;">الحلقة غير موجودة</p>
        <button onclick="navigate('#/')" style="background:${ACCENT};border:none;border-radius:8px;
          color:#000;cursor:pointer;padding:10px 24px;font-family:'Cairo',sans-serif;">العودة للرئيسية</button></div>`;
    return;
  }
  const cat=CATEGORIES.find(c=>c.id===ep.category),color=cat?cat.color:ACCENT;
  const same=EPISODES.filter(e=>e.category===ep.category);
  const idx=same.findIndex(e=>e.id===ep.id);
  const prev=same[idx-1]||null,next=same[idx+1]||null;
  const related=same.filter(e=>e.id!==ep.id).slice(0,15);

  document.getElementById('app').innerHTML=`
${headerHTML()}
<div id="srch_results" style="display:none;min-height:100vh;background:#080808;"></div>
<div style="padding-top:calc(64px + env(safe-area-inset-top,0px));">
  <div style="background:#000;width:100%;position:relative;">
    <button class="back-ov" onclick="navigate('#/')"
      style="position:absolute;top:10px;right:14px;z-index:50;
        background:rgba(0,0,0,.7);border:1px solid rgba(255,255,255,.15);
        border-radius:8px;color:white;cursor:pointer;padding:7px 12px;
        display:flex;align-items:center;gap:6px;backdrop-filter:blur(8px);
        font-family:'Cairo',sans-serif;font-size:.82rem;transition:background .2s;"
      onmouseenter="this.style.background='rgba(201,168,76,.2)'"
      onmouseleave="this.style.background='rgba(0,0,0,.7)'">
      ${svgChevR(14)}
      <span>الرئيسية</span>
    </button>
    <div style="max-width:1200px;margin:0 auto;">${videoPlayerHTML(ep.videoId)}</div>
  </div>

  <div style="max-width:1200px;margin:0 auto;padding:var(--px) var(--px) 0;" dir="rtl">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:20px;flex-wrap:wrap;">
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:12px;color:#555;font-size:.8rem;font-family:'Cairo',sans-serif;">
          <button onclick="navigate('#/')" style="background:none;border:none;cursor:pointer;color:#555;font-family:'Cairo',sans-serif;padding:0;">الرئيسية</button>
          ${svgChevL(12)}
          ${cat?`<button onclick="navigate('#/?cat=${cat.id}')" style="background:none;border:none;cursor:pointer;color:${ACCENT};font-family:'Cairo',sans-serif;padding:0;opacity:.8;">${cat.name}</button>${svgChevL(12)}`:''}
          <span>#${ep.id}</span>
        </div>
        <h1 style="color:#fff;margin:0 0 10px;line-height:1.3;font-family:'Cairo',sans-serif;">${ep.title}</h1>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          ${cat?`<span style="padding:5px 14px;border-radius:6px;background:${color}18;border:1px solid ${color}33;color:${color};font-size:.82rem;font-family:'Cairo',sans-serif;">${cat.name}</span>`:''}
          <span style="padding:5px 14px;border-radius:6px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);color:#666;font-size:.82rem;font-family:'Cairo',sans-serif;">حلقة #${ep.id}</span>
        </div>
      </div>
      <div class="nav-btns" style="display:flex;gap:8px;flex-shrink:0;">
        <button onclick="dlSheet(${ep.id})" style="display:flex;align-items:center;justify-content:center;gap:6px;background:rgba(201,168,76,.12);border:1px solid rgba(201,168,76,.35);border-radius:8px;color:#c9a84c;cursor:pointer;padding:8px 14px;font-family:'Cairo',sans-serif;font-size:.82rem;"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M6 11l6 6 6-6M4 21h16"/></svg> تنزيل</button>
        ${prev?`<button onclick="navigate('#/watch/${prev.id}')"
          style="display:flex;align-items:center;gap:6px;background:rgba(255,255,255,.06);
            border:1px solid rgba(255,255,255,.08);border-radius:8px;color:#aaa;cursor:pointer;
            padding:8px 14px;font-family:'Cairo',sans-serif;font-size:.82rem;transition:all .2s;"
          onmouseenter="this.style.background='rgba(255,255,255,.1)';this.style.color='#f0f0f0'"
          onmouseleave="this.style.background='rgba(255,255,255,.06)';this.style.color='#aaa'">
          ${svgChevR(14)} السابق</button>`:''}
        ${next?`<button onclick="navigate('#/watch/${next.id}')"
          style="display:flex;align-items:center;gap:6px;background:rgba(255,255,255,.06);
            border:1px solid rgba(255,255,255,.08);border-radius:8px;color:#aaa;cursor:pointer;
            padding:8px 14px;font-family:'Cairo',sans-serif;font-size:.82rem;transition:all .2s;"
          onmouseenter="this.style.background='rgba(255,255,255,.1)';this.style.color='#f0f0f0'"
          onmouseleave="this.style.background='rgba(255,255,255,.06)';this.style.color='#aaa'">
          التالي ${svgChevL(14)}</button>`:''}
      </div>
    </div>
  </div>

  <div style="max-width:1200px;margin:0 auto;padding:36px var(--px) 60px;" dir="rtl">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
      <div style="width:4px;height:20px;border-radius:2px;background:${color};"></div>
      <h2 style="color:#f0f0f0;margin:0;font-family:'Cairo',sans-serif;">حلقات ${cat?.name??'مشابهة'}</h2>
      <span style="color:#444;font-size:.8rem;font-family:'Cairo',sans-serif;">(${same.length-1} حلقة)</span>
    </div>
    <div style="position:relative;">
      <button class="row-arrow" onclick="scrollRow('rel_row',-1)"
        style="position:absolute;left:0;top:50%;transform:translateY(-50%);z-index:10;
          background:linear-gradient(to right,rgba(8,8,8,.95),transparent);border:none;color:white;
          cursor:pointer;height:100%;width:50px;display:flex;align-items:center;padding-left:6px;">${svgChevR(22)}</button>
      <div id="rel_row" class="hide-scrollbar" style="display:flex;gap:12px;overflow-x:auto;padding:4px 4px 8px;scrollbar-width:none;">
        ${related.map(e=>`<div class="row-card">${episodeCardHTML(e)}</div>`).join('')}
      </div>
      <button class="row-arrow" onclick="scrollRow('rel_row',1)"
        style="position:absolute;right:0;top:50%;transform:translateY(-50%);z-index:10;
          background:linear-gradient(to left,rgba(8,8,8,.95),transparent);border:none;color:white;
          cursor:pointer;height:100%;width:50px;display:flex;align-items:center;justify-content:flex-end;padding-right:6px;">${svgChevL(22)}</button>
    </div>
  </div>
</div>`;

  mountScrollHeader(document.getElementById('main_hdr'),true);
  attachCardHovers();
  playerMount(ep.videoId);
}

// ══════════════════════════════════════════════
//  CARD HOVERS
// ══════════════════════════════════════════════
function attachCardHovers(){
  if(!window.matchMedia('(hover:hover)').matches) return;
  document.querySelectorAll('.ep-card').forEach(card=>{
    const color=card.dataset.color||ACCENT;
    const img=card.querySelector('img'),over=card.querySelector('.ep-overlay'),play=card.querySelector('.ep-play');
    card.addEventListener('mouseenter',()=>{
      card.style.transform='scale(1.03) translateY(-4px)';
      card.style.boxShadow=`0 20px 40px rgba(0,0,0,.7),0 0 0 1px ${color}40`;
      if(img)img.style.transform='scale(1.08)';
      if(over)over.style.background='rgba(0,0,0,.4)';
      if(play)play.style.display='flex';
    });
    card.addEventListener('mouseleave',()=>{
      card.style.transform=''; card.style.boxShadow='0 4px 12px rgba(0,0,0,.4)';
      if(img)img.style.transform=''; if(over)over.style.background='rgba(0,0,0,.1)';
      if(play)play.style.display='none';
    });
  });
}

boot();
