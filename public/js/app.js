/* 꼬마 전기 실험실 - 화면, 드래그, 애니메이션 */
(function () {
  'use strict';
  const C = window.Circuit, KINDS = C.KINDS, PHYS = C.PHYS, MISSIONS = window.MISSIONS, fmt = C.fmt;
  const $ = s => document.querySelector(s);
  const svg = $('#board');
  const L = {
    wires: $('#l-wires'), flow: $('#l-flow'), comps: $('#l-comps'),
    labels: $('#l-labels'), terms: $('#l-terms'), ui: $('#l-ui'), wave: $('#l-wave'), guide: $('#l-guide'), arrows: $('#l-arrows'), heat: $('#l-heat'), dark: $('#l-dark'), fx: $('#l-fx')
  };
  const dragPath = $('#drag-wire');
  const GRID = 20, BW = 1000, BH = 640;
  const WIRE_COLORS = ['#e03131', '#1c7ed6', '#2f9e44', '#f08c00', '#9c36b5', '#0c8599'];
  const SPEED = 110;           // 전류 1A 일 때 점이 움직이는 속도 (px/초)
  const STORE = 'kkoma-circuit-v2';   // v2: 스테이지(1-1 …) 방식
  const ORDER = ['battery', 'bulb', 'switch', 'motor', 'resistor', 'clip', 'coin', 'eraser', 'chopstick', 'pencil'];

  /* ---------- 저장 ---------- */
  let progress = { done: [], unlockAll: false, level: 0 };
  let settings = { numbers: true, electron: true, sound: true, voice: true };
  try {
    const s = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (s) { Object.assign(progress, s.progress || {}); Object.assign(settings, s.settings || {}); }
    else { const old = JSON.parse(localStorage.getItem('kkoma-circuit-v1') || 'null'); if (old) Object.assign(settings, old.settings || {}); }
  } catch (e) { /* 저장소를 못 써도 게임은 됨 */ }
  function save() { try { localStorage.setItem(STORE, JSON.stringify({ progress, settings })); } catch (e) { } }

  /* ---------- 상태 ---------- */
  const S = {
    level: 0, comps: [], wires: [], nextId: 1, sel: null, selWire: null,
    memo: {}, succeeded: false, sol: null, an: null, litCount: 0, wasShort: false, colorIdx: 0
  };
  const mission = () => MISSIONS[S.level];
  const getComp = id => S.comps.find(c => c.id === id);

  /* ---------- 소리 ---------- */
  let actx = null;
  function audio() {
    if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } }
    if (actx && actx.state === 'suspended') actx.resume();
    return actx;
  }
  function tone(freq, dur, type = 'sine', vol = 0.12, delay = 0) {
    if (!settings.sound) return;
    const a = audio(); if (!a) return;
    const t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol = 0.2) {
    if (!settings.sound) return;
    const a = audio(); if (!a) return;
    const buf = a.createBuffer(1, a.sampleRate * dur, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
    const s = a.createBufferSource(), g = a.createGain(); g.gain.value = vol;
    s.buffer = buf; s.connect(g).connect(a.destination); s.start();
  }
  const sfx = {
    pick: () => tone(520, 0.06, 'triangle', 0.08),
    drop: () => tone(380, 0.08, 'triangle', 0.1),
    click: () => tone(900, 0.04, 'square', 0.05),
    connect: () => { tone(523, 0.08, 'sine', 0.12); tone(784, 0.12, 'sine', 0.12, 0.07); },
    remove: () => tone(260, 0.1, 'sine', 0.1),
    light: () => { tone(880, 0.15, 'sine', 0.08); tone(1320, 0.25, 'sine', 0.06, 0.05); },
    pop: () => { noise(0.25, 0.35); tone(150, 0.2, 'sawtooth', 0.08); },
    warn: () => { tone(330, 0.18, 'sawtooth', 0.07); tone(247, 0.25, 'sawtooth', 0.07, 0.2); },
    success: () => [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.22, 'triangle', 0.13, i * 0.11))
  };

  /* ---------- 읽어주기 (한국어 음성) ---------- */
  /* 크롬·엣지·웨일 등에서 읽어주기가 조용히 멈추는 문제들을 피해요
   *  - 한국어 목소리 목록은 늦게 도착해요 (voiceschanged)
   *  - cancel() 바로 뒤 speak() 는 가끔 무시돼요 → 살짝 기다렸다 말해요
   *  - 긴 문장은 중간에 끊겨요 → 문장마다 나눠 말해요
   *  - 말하던 객체가 지워지면 소리가 멈춰요 → 붙잡아 둬요 */
  const TTS = { voice: null, count: 0, ko: 0, err: '', said: 0, ended: 0, keep: [] };
  function pickVoice() {
    if (!('speechSynthesis' in window)) return;
    const all = speechSynthesis.getVoices();
    const ko = all.filter(v => v.lang && v.lang.toLowerCase().replace('_', '-').startsWith('ko'));
    TTS.count = all.length; TTS.ko = ko.length;
    TTS.voice = ko.find(v => v.localService) || ko.find(v => /google|microsoft|heami|yuna|sunhi/i.test(v.name)) || ko[0] || null;
  }
  if ('speechSynthesis' in window) {
    pickVoice();
    speechSynthesis.addEventListener ? speechSynthesis.addEventListener('voiceschanged', pickVoice) : (speechSynthesis.onvoiceschanged = pickVoice);
  }
  function speak(text, force) {
    if ((!settings.voice && !force) || !('speechSynthesis' in window)) return;
    try {
      if (!TTS.voice) pickVoice();
      const busy = speechSynthesis.speaking || speechSynthesis.pending;
      if (busy) speechSynthesis.cancel();
      if (speechSynthesis.paused) speechSynthesis.resume();
      const clean = text.replace(/<[^>]+>/g, ' ').replace(/\p{Extended_Pictographic}/gu, '')
        .replace(/(\d)\.(\d)V/g, '$1점$2볼트').replace(/(\d)V/g, '$1볼트')
        .replace(/(\d)\.(\d+)A/g, '$1점$2암페어').replace(/(\d)A/g, '$1암페어').replace(/(\d)Ω/g, '$1옴')
        .replace(/＋/g, '플러스 ').replace(/−/g, '마이너스 ')
        .replace(/[①-⑮]/g, ch => (ch.charCodeAt(0) - 0x2460 + 1) + '번');
      const parts = clean.match(/[^.!?。~]+[.!?。~]*/g) || [clean];
      const us = parts.map(t => t.trim()).filter(t => t.replace(/[\s.!?~,]/g, '')).map(t => {
        const u = new SpeechSynthesisUtterance(t);
        u.lang = 'ko-KR'; u.rate = 0.95; u.pitch = 1.1;
        if (TTS.voice) u.voice = TTS.voice;
        u.onend = () => { TTS.ended++; };
        u.onerror = e => { if (e.error !== 'interrupted' && e.error !== 'canceled') TTS.err = e.error || 'error'; };
        return u;
      });
      TTS.keep = us;
      const go = () => { if (TTS.keep !== us) return; us.forEach(u => speechSynthesis.speak(u)); TTS.said++; };
      if (busy) setTimeout(go, 150); else go();
    } catch (e) { TTS.err = String(e); }
  }
  // 엄마 아빠용: 목소리가 안 나올 때 원인 찾기
  function voiceDiag() {
    if (!('speechSynthesis' in window)) return '❌ 이 브라우저는 읽어주기를 지원하지 않아요. 크롬이나 엣지에서 열어 주세요.';
    pickVoice();
    let h = '';
    if (!settings.voice) h += '⚠️ 위쪽 🗣️ 버튼이 <b>꺼져</b> 있었어요. 지금 켰어요.<br>';
    if (!TTS.ko) h += `❌ 이 컴퓨터(브라우저)에 <b>한국어 목소리가 없어요</b> (전체 목소리 ${TTS.count}개).<br>
      👉 윈도우: 설정 → 시간 및 언어 → 음성 → "음성 추가"에서 <b>한국어</b>를 설치한 뒤 브라우저를 다시 켜 주세요. 또는 <b>크롬</b>(Google 한국의 목소리)이나 <b>엣지</b>로 열어 주세요.`;
    else h += `✅ 한국어 목소리: <b>${TTS.voice ? TTS.voice.name : '?'}</b> (한국어 ${TTS.ko}개)`;
    if (TTS.err) h += `<br>⚠️ 최근 오류: ${TTS.err}${TTS.err === 'not-allowed' ? ' (화면을 한 번 누른 뒤 다시 해 보세요)' : ''}`;
    h += '<br>🔈 소리가 안 들리면 컴퓨터 볼륨, 탭의 음소거(탭 위 스피커 아이콘)도 확인해 주세요.';
    return h;
  }

  /* ---------- 기하 ---------- */
  function rotV(v, deg) {
    const r = deg * Math.PI / 180, c = Math.round(Math.cos(r) * 1e6) / 1e6, s = Math.round(Math.sin(r) * 1e6) / 1e6;
    return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
  }
  function termPos(c, t) {
    const Lh = KINDS[c.kind].L;
    const v = rotV({ x: t ? Lh : -Lh, y: 0 }, c.rot);
    return { x: c.x + v.x, y: c.y + v.y, n: rotV({ x: t ? 1 : -1, y: 0 }, c.rot) };
  }
  function bez(p1, n1, p2, n2, sag = 0) {
    const d = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1, base = Math.max(30, Math.min(140, d * 0.45));
    const ux = (p2.x - p1.x) / d, uy = (p2.y - p1.y) / d;
    // 단자가 상대 쪽을 보면 길게, 반대쪽을 보면 짧게 → 쓸데없이 크게 도는 고리 방지
    const k1 = base * (0.4 + 0.6 * Math.max(0, n1.x * ux + n1.y * uy));
    const k2 = base * (0.4 + 0.6 * Math.max(0, -(n2.x * ux + n2.y * uy)));
    const s = sag * Math.min(90, 30 + d * 0.22);   // 전선이 살짝 늘어지게 (겹침 방지)
    const c1 = { x: p1.x + n1.x * k1, y: p1.y + n1.y * k1 + s }, c2 = { x: p2.x + n2.x * k2, y: p2.y + n2.y * k2 + s };
    return {
      d: `M${p1.x} ${p1.y} C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${p2.x} ${p2.y}`,
      rd: `M${p2.x} ${p2.y} C${c2.x} ${c2.y} ${c1.x} ${c1.y} ${p1.x} ${p1.y}`,
      mid: { x: (p1.x + 3 * c1.x + 3 * c2.x + p2.x) / 8, y: (p1.y + 3 * c1.y + 3 * c2.y + p2.y) / 8 }
    };
  }
  const JUNC = 40;   // 갈림길까지의 길이
  function termDeg() {
    const deg = {};
    for (const w of S.wires) for (const e of [w.a, w.b]) { const k = e.c + ':' + e.t; deg[k] = (deg[k] || 0) + 1; }
    return deg;
  }
  function juncPt(c, t) { const p = termPos(c, t); return { x: p.x + p.n.x * JUNC, y: p.y + p.n.y * JUNC, n: p.n }; }
  function wireGeom(w, deg) {
    const a = getComp(w.a.c), b = getComp(w.b.c);
    if (!a || !b) return null;
    deg = deg || termDeg();
    const ja = deg[w.a.c + ':' + w.a.t] > 1, jb = deg[w.b.c + ':' + w.b.t] > 1;
    const p1 = ja ? juncPt(a, w.a.t) : termPos(a, w.a.t), p2 = jb ? juncPt(b, w.b.t) : termPos(b, w.b.t);
    const g = bez(p1, p1.n, p2, p2.n, w.sag);
    g.ja = ja; g.jb = jb;
    return g;
  }
  function svgPt(e) {
    const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
    return p.matrixTransform(svg.getScreenCTM().inverse());
  }
  const snap = v => Math.round(v / GRID) * GRID;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const inRect = (e, el) => { const r = el.getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom; };

  /* ---------- 표준 회로 기호 (부품 속 작은 하얀 판) ----------
   * 부품이 돌아가면 기호도 같이 돌아가서, 기호의 양 끝이 진짜 단자 쪽을 향해요 (회로도와 같은 모양). */
  function symbol(kind, x, y, c) {
    let g = '';
    if (kind === 'battery')      // 전지: 긴 선 = ＋극, 짧고 굵은 선 = −극
      g = `<rect x="-15" y="-8" width="30" height="16" rx="3" class="sym-bg"/>
        <path d="M-12 0 H-3 M3 0 H12" class="sym-ln"/><path d="M-3 -4 V4" class="sym-ln" stroke-width="3.4"/><path d="M3 -7 V7" class="sym-ln"/>`;
    if (kind === 'bulb')         // 전구: 동그라미 속 ×
      g = `<circle r="9" class="sym-bg"/><circle r="6.5" class="sym-ln"/><path d="M-4.6 -4.6 L4.6 4.6 M4.6 -4.6 L-4.6 4.6" class="sym-ln"/>`;
    if (kind === 'switch')       // 스위치: 열리면 날이 들려요
      g = `<rect x="-17" y="-6" width="34" height="12" rx="3" class="sym-bg"/>
        <path d="M-14 2 H-8 M8 2 H14" class="sym-ln"/><circle cx="-8" cy="2" r="1.8" class="sym-dot"/><circle cx="8" cy="2" r="1.8" class="sym-dot"/>
        <path d="${c && c.open ? 'M-8 2 L6 -4' : 'M-8 2 L8 2'}" class="sym-ln"/>`;
    if (kind === 'resistor')     // 저항: 네모 (KS·IEC 기호)
      g = `<rect x="-17" y="-7" width="34" height="14" rx="3" class="sym-bg"/><path d="M-14 0 H-8 M8 0 H14" class="sym-ln"/><rect x="-8" y="-4" width="16" height="8" class="sym-ln"/>`;
    return g ? `<g class="sym" transform="translate(${x} ${y})">${g}</g>` : '';
  }

  /* ---------- 부품 그림 (가로 방향, 가운데가 0,0) ---------- */
  function compInner(c, o) {
    const k = c.kind;
    if (k === 'battery' && c.broken) {   // 펑! 까맣게 탄 전지
      return `
        <rect class="hit" x="-62" y="-28" width="124" height="56"/>
        <line x1="-60" y1="0" x2="-46" y2="0" class="lead" stroke="#495057"/>
        <rect x="-46" y="-22" width="88" height="44" rx="10" fill="#343a40" stroke="#212529" stroke-width="3" transform="rotate(-4)"/>
        <path d="M-30 -20 L-20 -4 L-28 6 L-14 20 M10 -20 L4 -6 L16 4 L8 20" stroke="#fa5252" stroke-width="2.5" fill="none"/>
        <path d="M-40 -12 Q-30 -30 -18 -14 M20 -14 Q32 -32 40 -10" stroke="#868e96" stroke-width="3" fill="none"/>
        <text x="0" y="8" class="bat-v" style="font-size:15px">탔어요</text>
        <text x="30" y="-30" class="emo small">💨</text>`;
    }
    if (k === 'battery') {
      const body = o.short ? '#ff8787' : '#4dabf7', cap = o.short ? '#fa5252' : '#fcc419';
      return `
        <rect class="hit" x="-62" y="-28" width="124" height="56"/>
        <line x1="-60" y1="0" x2="-46" y2="0" class="lead"/>
        <line x1="48" y1="0" x2="60" y2="0" class="lead"/>
        <rect x="40" y="-9" width="10" height="18" rx="3" fill="#ced4da" stroke="#495057" stroke-width="2"/>
        <rect x="-46" y="-22" width="88" height="44" rx="10" fill="${cap}" stroke="#495057" stroke-width="3"/>
        <path d="M8 -20.5 H-36 a8.5 8.5 0 0 0 -8.5 8.5 V12 a8.5 8.5 0 0 0 8.5 8.5 H8 Z" fill="${body}"/>
        <text x="-30" y="10" class="pol">−</text>
        <text x="25" y="10" class="pol">+</text>
        ${symbol('battery', -10, -7)}
        <text x="-10" y="17" class="bat-v">1.5V</text>
        ${o.short ? '<text x="0" y="-32" class="emo">🔥</text>' : ''}`;
    }
    if (k === 'bulb') {
      const b = o.b || 0, lit = b > 0.01 && !c.broken;
      const op = lit ? Math.min(1, 0.18 + 0.82 * Math.min(1, b)) : 0;
      const gr = 46 + 22 * Math.min(2, b);
      let rays = '';
      if (lit && b > 0.6) {
        const n = 8, r1 = 32, r2 = 32 + 10 + 10 * Math.min(1.5, b);
        for (let i = 0; i < n; i++) {
          const a = i / n * Math.PI * 2;
          rays += `<line x1="${Math.cos(a) * r1}" y1="${-48 + Math.sin(a) * r1}" x2="${Math.cos(a) * r2}" y2="${-48 + Math.sin(a) * r2}" class="ray" opacity="${Math.min(1, b)}"/>`;
        }
      }
      const glass = c.broken ? '#dee2e6' : (lit ? `rgba(255,236,120,${0.35 + 0.65 * op})` : '#e7f5ff');
      const fil = c.broken
        ? '<path d="M-6 -26 L-6 -44 L-3 -50" class="fil" stroke="#495057"/><path d="M3 -48 L6 -44 L6 -26" class="fil" stroke="#495057"/>'
        : `<path d="M-6 -26 L-6 -44 L-3 -50 L0 -44 L3 -50 L6 -44 L6 -26" class="fil" stroke="${lit ? '#ff922b' : '#868e96'}"/>`;
      return `
        <rect class="hit" x="-56" y="-80" width="112" height="96"/>
        <g data-light="${c.id}">${lit ? `<circle cx="0" cy="-48" r="${gr}" fill="url(#glow)" opacity="${op}"/>` : ''}${rays}</g>
        <rect x="-46" y="-9" width="92" height="18" rx="8" fill="#b08968" stroke="#7f5539" stroke-width="2"/>
        <path d="M-40 0 L-10 -10 M40 0 L10 -10" stroke="#adb5bd" stroke-width="3"/>
        <circle cx="0" cy="-48" r="24" fill="${c.broken ? '#dee2e6' : '#e7f5ff'}" stroke="#74a9c9" stroke-width="2.5"/>
        ${lit ? '' : fil}
        ${lit ? `<g data-light="${c.id}"><circle cx="0" cy="-48" r="24" fill="${glass}" stroke="#74a9c9" stroke-width="2.5"/>${fil}</g>` : ''}
        <rect x="-12" y="-27" width="24" height="18" rx="3" fill="#adb5bd" stroke="#495057" stroke-width="2"/>
        <path d="M-12 -21 H12 M-12 -15 H12" stroke="#495057" stroke-width="1.5"/>
        ${symbol('bulb', -30, 2)}
        ${c.broken ? '<text x="26" y="-62" class="emo small">💥</text>' : ''}`;
    }
    if (k === 'motor') {
      return `
        <rect class="hit" x="-56" y="-92" width="112" height="108"/>
        <rect x="-46" y="-9" width="92" height="18" rx="8" fill="#b08968" stroke="#7f5539" stroke-width="2"/>
        <path d="M-40 0 L-16 -14 M40 0 L16 -14" stroke="#adb5bd" stroke-width="3"/>
        <rect x="-22" y="-46" width="44" height="38" rx="10" fill="#adb5bd" stroke="#495057" stroke-width="2.5"/>
        <circle cx="0" cy="-27" r="14" class="sym-bg"/><circle cx="0" cy="-27" r="11.5" class="sym-ln"/>
        <text x="0" y="-21" class="motor-m">M</text>
        <line x1="0" y1="-46" x2="0" y2="-60" stroke="#495057" stroke-width="4"/>
        <g data-fan="${c.id}" transform="translate(0 -62)">
          <ellipse cx="0" cy="-15" rx="8" ry="16" fill="#74c0fc" stroke="#1971c2" stroke-width="2"/>
          <ellipse cx="0" cy="-15" rx="8" ry="16" fill="#ffa8a8" stroke="#c92a2a" stroke-width="2" transform="rotate(120)"/>
          <ellipse cx="0" cy="-15" rx="8" ry="16" fill="#b2f2bb" stroke="#2b8a3e" stroke-width="2" transform="rotate(240)"/>
          <circle r="5" fill="#495057"/>
        </g>`;
    }
    if (k === 'switch') {
      const ang = c.open ? -38 : 0;
      return `
        <rect class="hit" x="-56" y="-40" width="112" height="56"/>
        <rect x="-46" y="-8" width="92" height="20" rx="8" fill="#b08968" stroke="#7f5539" stroke-width="2"/>
        <circle cx="-28" cy="-6" r="6" fill="#ced4da" stroke="#495057" stroke-width="2"/>
        <circle cx="28" cy="-6" r="6" fill="#ced4da" stroke="#495057" stroke-width="2"/>
        <g transform="rotate(${ang} -28 -6)">
          <rect x="-30" y="-11" width="62" height="9" rx="4.5" fill="#dee2e6" stroke="#495057" stroke-width="2"/>
          <circle cx="36" cy="-6.5" r="8" fill="${c.open ? '#fa5252' : '#40c057'}" stroke="#495057" stroke-width="2"/>
        </g>
        ${symbol('switch', 0, 5, c)}`;
    }
    if (k === 'resistor') {
      return `
        <rect class="hit" x="-56" y="-26" width="112" height="44"/>
        <line x1="-50" y1="0" x2="-26" y2="0" class="lead"/>
        <line x1="26" y1="0" x2="50" y2="0" class="lead"/>
        <rect x="-28" y="-12" width="56" height="24" rx="11" fill="#e9d5a6" stroke="#8d6e3f" stroke-width="2"/>
        <rect x="-18" y="-12" width="6" height="24" fill="#f76707"/>
        <rect x="-8" y="-12" width="6" height="24" fill="#212529"/>
        <rect x="2" y="-12" width="6" height="24" fill="#d4a017"/>
        <rect x="14" y="-12" width="5" height="24" fill="#d4a017"/>
        ${symbol('resistor', -16, 22)}
        <text x="16" y="27" class="res-v">3Ω</text>`;
    }
    // 시험용 물건들
    let item = '', half = 30;
    if (k === 'clip') item = '<path d="M-30 -7 H24 A7 7 0 0 1 24 7 H-24 A4.5 4.5 0 0 1 -24 -2 H18" fill="none" stroke="#868e96" stroke-width="4" stroke-linecap="round"/>';
    if (k === 'coin') { half = 22; item = '<circle r="22" fill="#e9b949" stroke="#a07a14" stroke-width="3"/><circle r="16" fill="none" stroke="#a07a14" stroke-width="1.5"/><text y="6" class="coin-t">100</text>'; }
    if (k === 'eraser') { half = 30; item = '<rect x="-30" y="-14" width="60" height="28" rx="5" fill="#fff" stroke="#adb5bd" stroke-width="2"/><rect x="-30" y="-14" width="26" height="28" rx="5" fill="#74c0fc"/><rect x="-10" y="-14" width="6" height="28" fill="#74c0fc"/>'; }
    if (k === 'chopstick') { half = 40; item = '<rect x="-40" y="-5" width="80" height="10" rx="4" fill="#deb887" stroke="#a0784c" stroke-width="2"/>'; }
    if (k === 'pencil') { half = 36; item = '<rect x="-36" y="-4" width="72" height="8" rx="3" fill="#495057" stroke="#212529" stroke-width="1.5"/><path d="M-30 -2 H30" stroke="#868e96" stroke-width="1.5"/>'; }
    return `
      <rect class="hit" x="-56" y="-26" width="112" height="44"/>
      <line x1="-50" y1="0" x2="${-half}" y2="0" class="lead"/>
      <line x1="${half}" y1="0" x2="50" y2="0" class="lead"/>
      ${item}`;
  }
  const LABEL_TOP = { battery: 46, bulb: 98, motor: 104, switch: 40, resistor: 26, clip: 30, coin: 34, eraser: 30, chopstick: 26, pencil: 26 };

  /* ---------- 그리기 ---------- */
  let flows = [], fans = [], lights = [], wave = null;
  const phase = {}, fanAng = {};

  function compInfo(c) {
    const r = S.sol && S.sol.comp[c.id] ? S.sol.comp[c.id] : { I: 0, V: 0 };
    const A = Math.abs(r.I);
    const o = { I: r.I, A, V: r.V };
    if (c.kind === 'bulb' && !c.broken) o.b = (r.I * r.I * KINDS.bulb.R) / PHYS.P_NOM;
    if (c.kind === 'battery') o.short = A > PHYS.SHORT_A;
    return o;
  }

  function renderBoard() {
    const short = S.an && S.an.status === 'short';
    const dir = settings.electron ? -1 : 1;
    const pcls = 'electrons' + (settings.electron ? '' : ' conv') + (short ? ' short' : '');
    const fl = [];   // 알갱이가 들어있는 길 (전선, 갈림길, 부품 속)
    let wHtml = '', fHtml = '', cHtml = '', lHtml = '', tHtml = '', uHtml = '';
    const connected = new Set();

    const deg = termDeg();
    // 갈림길 몸통 호스 (한 점에서 전선이 2개 이상 나갈 때)
    for (const k in deg) {
      if (deg[k] < 2) continue;
      const [cid, t] = k.split(':').map(Number), c = getComp(cid); if (!c) continue;
      const p = termPos(c, t), q = juncPt(c, t);
      wHtml += `<path class="wire trunk" d="M${p.x} ${p.y} L${q.x} ${q.y}" stroke="#868e96"/><path class="hose-in" d="M${p.x} ${p.y} L${q.x} ${q.y}"/>`;
      // 갈림길 몸통에 흐르는 전류 = 갈래들의 합 (들어온 만큼 나가요)
      let o = 0, i = 0;
      for (const w of S.wires) {
        const I = S.sol ? (S.sol.wire[w.id] || 0) : 0;
        if (w.a.c + ':' + w.a.t === k) { if (I > 0) o += I; else i -= I; }
        if (w.b.c + ':' + w.b.t === k) { if (I < 0) o -= I; else i += I; }
      }
      const net = o - i, fwd = net * dir > 0;   // 전지 단자에서 바깥으로 나가면 net > 0
      fl.push({ key: 'j' + cid + '_' + t, cref: cid, d: fwd ? `M${p.x} ${p.y} L${q.x} ${q.y}` : `M${q.x} ${q.y} L${p.x} ${p.y}`,
        from: fwd ? k : k + '*', to: fwd ? k + '*' : k, A: Math.abs(net) });
    }
    // 점선 길잡이: 여기를 이으면 돼요 (X-1 스테이지)
    for (const gw of S.ghost || []) {
      const a = getComp(gw.a.c), b = getComp(gw.b.c); if (!a || !b) continue;
      const done = S.wires.some(w => (w.a.c === gw.a.c && w.a.t === gw.a.t && w.b.c === gw.b.c && w.b.t === gw.b.t) ||
        (w.a.c === gw.b.c && w.a.t === gw.b.t && w.b.c === gw.a.c && w.b.t === gw.a.t));
      if (done) continue;
      const p1 = termPos(a, gw.a.t), p2 = termPos(b, gw.b.t);
      wHtml += `<path class="ghost-wire" d="${bez(p1, p1.n, p2, p2.n, 0).d}"/>`;
    }
    for (const w of S.wires) {
      const g = wireGeom(w, deg); if (!g) continue;
      connected.add(w.a.c + ':' + w.a.t); connected.add(w.b.c + ':' + w.b.t);
      const sel = S.selWire === w.id;
      wHtml += `<path class="wire-hit" data-wid="${w.id}" d="${g.d}"/>`;
      wHtml += `<path class="wire${sel ? ' sel' : ''}" d="${g.d}" stroke="${w.color}"/><path class="hose-in" d="${g.d}"/>`;
      const I = S.sol ? (S.sol.wire[w.id] || 0) : 0;
      const fwd = I * dir >= 0, ka = w.a.c + ':' + w.a.t + (g.ja ? '*' : ''), kb = w.b.c + ':' + w.b.t + (g.jb ? '*' : '');
      fl.push({ key: 'w' + w.id, cref: w.a.c, d: fwd ? g.d : g.rd, from: fwd ? ka : kb, to: fwd ? kb : ka, A: Math.abs(I) });
      if (sel) uHtml += btn(g.mid.x, g.mid.y, '✖', 'delwire', '#fa5252');
    }

    const waitPal = ORDER.some(paletteNeeds);   // 먼저 재료 상자에서 꺼내야 하면 점은 가만히
    for (const c of S.comps) {
      const o = compInfo(c);
      const sel = S.sel === c.id;
      cHtml += `<g class="comp${sel ? ' sel' : ''}" data-cid="${c.id}" transform="translate(${c.x} ${c.y}) rotate(${c.rot})">${compInner(c, o)}</g>`;
      // 부품 속 알갱이 (금속 부품만. 지우개·나무·열린 스위치·끊어진 전구에는 움직일 알갱이 길이 없어요)
      if (c.kind === 'battery' || isFinite(C.resistanceOf(c))) {
        const p0 = termPos(c, 0), p1 = termPos(c, 1), fwd = o.I * dir >= 0;
        const a = fwd ? p0 : p1, b = fwd ? p1 : p0;
        fl.push({ key: 'c' + c.id, cid: c.id, cref: c.id, d: `M${a.x} ${a.y} L${b.x} ${b.y}`, from: c.id + ':' + (fwd ? 0 : 1), to: c.id + ':' + (fwd ? 1 : 0), A: o.A });
      }
      lHtml += labelSVG(c, o);
      for (const t of [0, 1]) {
        const p = termPos(c, t), on = connected.has(c.id + ':' + t);
        const pulse = !waitPal && (!S.wires.length || (mission().guided && !on));
        tHtml += `<circle class="term${on ? ' on' : ''}${pulse ? ' pulse' : ''}" data-term="${c.id}:${t}" cx="${p.x}" cy="${p.y}" r="11"/>`;
        if (c.kind === 'battery') {
          tHtml += `<text class="term-pol${t ? ' plus' : ''}" x="${p.x}" y="${p.y + 5}">${t ? '+' : '−'}</text>`;
        }
      }
      if (sel) {
        const a = rotV({ x: 0, y: 46 }, c.rot);
        const bx = c.x + a.x * 1.3, by = c.y + a.y * 1.3 + (Math.abs(a.x) > 1 ? 0 : 20);
        uHtml += btn(bx - 26, by, '🔄', 'rotate', '#339af0') + btn(bx + 26, by, '🗑️', 'delete', '#fa5252');
      }
    }

    for (const f of fl) fHtml += `<path class="${pcls}${f.A > PHYS.ACTIVE_A ? ' moving' : ''}" data-bk="${f.key}" d="${f.d}"/>`;
    L.wires.innerHTML = wHtml; L.flow.innerHTML = fHtml; L.comps.innerHTML = cHtml;
    L.labels.innerHTML = lHtml; L.terms.innerHTML = tHtml; L.ui.innerHTML = uHtml;

    flows = fl.map(f => Object.assign(f, { el: L.flow.querySelector(`[data-bk="${f.key}"]`) }));
    renderArrows(short);
    drawDark();
    lights = [...L.comps.querySelectorAll('[data-light]')];
    if (wave) { prepareWave(); applyWave(); }
    fans = [...L.comps.querySelectorAll('[data-fan]')].map(el => ({ el, id: +el.dataset.fan, I: compInfo(getComp(+el.dataset.fan)).A }));
  }

  /* ---------- 전류 화살표 ----------
   * 방향 = 알갱이와 같은 방향 (기본: 교과서 전류 ＋→−)
   * 굵기 = 그 회로를 미는 전지 전압 (1.5V 얇게, 3V 굵게, 4.5V 아주 굵게)
   * 빠르기 = 전류 (알갱이 속도와 같아요) */
  const aPhase = {};
  function renderArrows(short) {
    const push = {};
    const pv = id => {
      if (push[id] == null) { const c = getComp(id); push[id] = c && S.sol && S.sol.node ? C.supplyV(S.comps, S.wires, S.sol, c) : 0; }
      return push[id];
    };
    let h = '';
    for (const f of flows) {
      if (f.A <= PHYS.ACTIVE_A || !f.el) continue;
      f.len = f.el.getTotalLength(); if (f.len < 24) continue;
      const V = pv(f.cref);
      f.sc = clamp(0.3 + 0.6 * V / 1.5, 0.8, 2.4);
      const n = Math.max(1, Math.round(f.len / 130));
      f.gap = f.len / n;
      h += `<g data-ak="${f.key}">` + '<path class="arrow" style="display:none" d="M-11 -10 L10 0 L-11 10 L-5 0 Z"/>'.repeat(n) + '</g>';
    }
    L.arrows.setAttribute('class', 'arrows' + (settings.electron ? ' elec' : '') + (short ? ' short' : ''));
    L.arrows.innerHTML = h;
    for (const f of flows) if (f.sc) { f.arr = [...L.arrows.querySelector(`[data-ak="${f.key}"]`).children]; f.hid = true; }
  }
  function moveArrows(dt) {
    for (const f of flows) {
      if (!f.arr) continue;
      if (wave && !wave.moving.has(f.key)) { if (!f.hid) { f.arr.forEach(a => { a.style.display = 'none'; }); f.hid = true; } continue; }
      const ap = (((aPhase[f.key] || 0) + Math.min(f.A * SPEED, 420) * dt) % f.gap + f.gap) % f.gap;
      aPhase[f.key] = ap;
      f.arr.forEach((a, i) => {
        const d = ap + i * f.gap;
        const d0 = Math.max(0, Math.min(f.len - 2, d)), p = f.el.getPointAtLength(d0), q = f.el.getPointAtLength(d0 + 2);
        const ang = Math.atan2(q.y - p.y, q.x - p.x) * 180 / Math.PI;
        a.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${ang.toFixed(1)}) scale(${f.sc.toFixed(2)})`);
      });
      if (f.hid) { f.arr.forEach(a => { a.style.display = ''; }); f.hid = false; }
    }
  }

  function btn(x, y, label, action, color) {
    return `<g class="ui-btn" data-action="${action}" transform="translate(${x} ${y})"><circle r="19" fill="#fff" stroke="${color}" stroke-width="3"/><text y="7">${label}</text></g>`;
  }

  function labelSVG(c, o) {
    const k = KINDS[c.kind];
    const name = C.displayName(c);
    let val = '', cls = 'val';
    if (c.kind === 'battery' && c.broken) { val = '탔어요! 콕 눌러요'; cls += ' danger'; }
    else if (c.kind === 'battery') { val = o.short ? '🔥 뜨거워요!' : (settings.numbers ? '1.5V' + (o.A > PHYS.ACTIVE_A ? ` · ${fmt(o.A)}A` : '') : ''); if (o.short) cls += ' danger'; }
    else if (c.kind === 'switch') { val = c.open ? '꺼짐' : '켜짐'; cls += c.open ? ' off' : ' on'; }
    else if (c.kind === 'bulb' && c.broken) { val = '고장! 콕 눌러요'; cls += ' danger'; }
    else if (k.cat === 'material') { if (settings.numbers && C.isLoad(c)) val = fmt(o.A) + 'A'; }
    else if (settings.numbers) val = fmt(o.A) + 'A';
    const top = LABEL_TOP[c.kind] || 40;
    const d = rotV({ x: 0, y: -1 }, c.rot);
    const x = c.x + d.x * top, y = c.y + d.y * top;
    let anchor = 'middle', y1, y2;
    if (d.x > 0.5) anchor = 'start'; else if (d.x < -0.5) anchor = 'end';
    if (d.y < -0.5) { y1 = y - (val ? 26 : 6); y2 = y - 6; }
    else if (d.y > 0.5) { y1 = y + 20; y2 = y + 42; }
    else { y1 = y - 6; y2 = y + 16; }
    const dx = anchor === 'start' ? 8 : anchor === 'end' ? -8 : 0;
    return `<g class="label" text-anchor="${anchor}"><text class="name" x="${x + dx}" y="${y1}">${name}</text>${val ? `<text class="${cls}" x="${x + dx}" y="${y2}">${val}</text>` : ''}</g>`;
  }

  /* ---------- 계산 ---------- */
  function ctxFor() {
    const sol = S.sol;
    return {
      comps: S.comps, sol, an: S.an, memo: S.memo, KINDS,
      I: c => sol.comp[c.id].I, A: c => Math.abs(sol.comp[c.id].I),
      of: k => S.comps.filter(c => c.kind === k),
      lit: () => S.comps.filter(c => c.kind === 'bulb' && !c.broken && Math.abs(sol.comp[c.id].I) > PHYS.LIT_A),
      name: c => C.displayName(c),
      wouldConduct: c => C.wouldConduct(S.comps, S.wires, c),
      push: c => C.supplyV(S.comps, S.wires, sol, c),
      toast
    };
  }

  function recompute() {
    let sol = C.solve(S.comps, S.wires);
    for (let guard = 0; guard < 6; guard++) {
      const burn = S.comps.filter(c => c.kind === 'bulb' && !c.broken && Math.abs(sol.comp[c.id].I) > PHYS.BURN_A);
      if (!burn.length) break;
      const amp = Math.abs(sol.comp[burn[0].id].I);
      burn.forEach(c => { c.broken = true; });
      sfx.pop();
      toast(`💥 전기가 너무 세서 전구가 고장 났어요! (${fmt(amp)}A) 전구를 콕 누르면 새 전구!`, 5000);
      sol = C.solve(S.comps, S.wires);
    }
    S.sol = sol;
    S.an = C.analyze(S.comps, S.wires, sol);
    const short = S.an.status === 'short';
    if (short && !S.wasShort) { sfx.warn(); }
    S.wasShort = short;
    $('#banner').classList.toggle('hidden', !short);
    if (short) heatUpdate(); else if (S.heat) heatCool();

    const ctx = ctxFor();
    const lit = ctx.lit().length;
    const flowing = S.an.status === 'ok';
    let waveDur = 0, afterWave = null;

    const m = mission();
    if (m.check && !short) {
      const okNow = m.check(ctx);
      if (okNow && !S.succeeded) {
        S.succeeded = true; S.nudge = false; S.hintShown = '';
        if (!progress.done.includes(S.level)) progress.done.push(S.level);
        save();
        // 성공 화면은 흐름 애니메이션이 중간에 끊겨도 꼭 나와요
        const tok = {}; S.successTok = tok;
        const fire = () => { if (S.successTok !== tok) return; S.successTok = null; showSuccess(); };
        setTimeout(() => { if (S.successTok === tok) cheer(); }, flowing ? 500 : 0);   // 바로 화면 가운데에 "잘했어요!"
        // 어둠 속 불빛 쇼를 볼 시간을 주고 나서 축하 창을 띄워요
        if (flowing) { waveDur = 2.4; afterWave = () => setTimeout(fire, 2000); setTimeout(fire, 2400 + 2000 + 700); }
        else setTimeout(fire, 1200);
      }
    }
    if (!waveDur && flowing && !S.wasFlowing) waveDur = 2.6;   // 새로 이어졌을 때
    S.wasFlowing = flowing;
    if (!waveDur && lit > S.litCount) sfx.light();
    S.litCount = lit;
    const litNow = new Set(ctx.lit().map(c => c.id));
    if (!waveDur) for (const id of litNow) if (!S.litSet || !S.litSet.has(id)) setTimeout(() => lightPop(getComp(id)), 50);
    S.litSet = litNow;
    if (!flowing) {
      wave = null; L.wave.innerHTML = '';
      if (S.successTok) { const tok = S.successTok; setTimeout(() => { if (S.successTok === tok) { S.successTok = null; showSuccess(); } }, 300); }
    }
    renderBoard(); renderNote(); renderBars(); renderMission();
    if (waveDur) startWave(waveDur, afterWave);
    S.lastKeys = null;
    if (S.chain > 0 && !S.succeeded && mission().check) {
      const left = S.chain - 1; S.chain = 0; clearTimeout(autoT);
      autoT = setTimeout(() => { if (!S.succeeded && !drag && !anyModalOpen()) { giveHint(); S.chain = Math.min(S.chain, left); } }, 1200 + waveDur * 1000);
    } else scheduleAutoHint(waveDur * 1000);
  }

  /* ---------- 합선 발열: 전지 속 → 이음매 → 전선 → 연기 → 펑! ----------
   * 열 = I²R. 합선 길에서 저항이 제일 큰 곳은 전지 속(내부저항) → 그다음 이음매(접촉저항) → 전선. */
  const HEAT_T = [0, 2, 4, 7];              // 단계가 시작하는 시간(초), 7초에 펑! (그 전에 지우면 식어요)
  const HEAT_MSG = ['', '🔋 ① 전지 속이 뜨거워져요!', '🔴 ② 이음매랑 전선이 빨갛게 달아요!', '💨 ③ 연기가 나요! 곧 터져요!'];
  const HEAT_SAY = ['', '앗 합선! 전지가 뜨거워져요! 빨리 전선을 지워요!', '전선이 빨개져요!', '연기가 나요! 곧 터져요!'];
  function heatUpdate() {
    const big = I => Math.abs(I) > PHYS.SHORT_A;
    const bats = S.comps.filter(c => c.kind === 'battery' && !c.broken && big(S.sol.comp[c.id].I)).map(c => c.id);
    const wires = S.wires.filter(w => big(S.sol.wire[w.id] || 0)).map(w => w.id);
    if (!S.heat) S.heat = { t0: performance.now(), stage: 0 };
    S.heat.bats = bats; S.heat.wires = wires; S.heat.drawn = -1;
  }
  function heatClear() {
    S.heat = null;
    if (L.heat) L.heat.innerHTML = '';
    svg.classList.remove('shake', 'shake-big');
  }
  function heatCool() {
    const st = S.heat.stage;
    heatClear();
    if (st >= 1) { toast(st >= 3 ? '휴~ 아슬아슬했어요! 전선을 잘 지웠어요 😮‍💨' : '휴~ 식었어요! 잘 지웠어요 👍', 3000); }
  }
  function heatTick(now) {
    const H = S.heat, e = (now - H.t0) / 1000;
    if (e >= HEAT_T[3]) { heatBoom(); return; }
    const stage = e < HEAT_T[1] ? 1 : e < HEAT_T[2] ? 2 : 3;
    if (stage !== H.stage) {
      H.stage = stage;
      $('#banner-txt').textContent = HEAT_MSG[stage];
      speak(HEAT_SAY[stage]);
      tone(stage === 3 ? 220 : 300, 0.2, 'sawtooth', 0.06);
      svg.classList.toggle('shake', stage === 3);
    }
    if (H.drawn !== stage) { H.drawn = stage; heatDraw(stage); }
    // 온도계와 빨갛게 달아오르는 전선
    $('#thermo-fill').style.width = Math.min(100, e / HEAT_T[3] * 100) + '%';
    const p = Math.max(0, Math.min(1, (e - HEAT_T[1]) / (HEAT_T[2] - HEAT_T[1])));
    L.heat.querySelectorAll('.heat-wire').forEach(el => el.setAttribute('stroke-dasharray', `${(p * 100).toFixed(1)} 100`));
    if (stage === 3 && Math.random() < dtCrackle) noise(0.05, 0.08);   // 지직지직
  }
  const dtCrackle = 0.08;
  function heatDraw(stage) {
    const H = S.heat;
    let h = '';
    const hotBat = new Set(H.bats);
    for (const id of H.bats) {
      const c = getComp(id); if (!c) continue;
      h += `<circle class="heat-glow s${stage}" cx="${c.x}" cy="${c.y}" r="${40 + stage * 16}"/>`;
      if (stage === 1) h += `<text class="heat-ico" x="${c.x}" y="${c.y - 46}">🌡️</text>`;
      if (stage >= 3) h += `<text class="heat-fire" x="${c.x - 24}" y="${c.y - 24}">🔥</text><text class="heat-fire b" x="${c.x + 26}" y="${c.y - 20}">🔥</text>`;
    }
    for (const id of H.wires) {
      const w = S.wires.find(x => x.id === id), g = w && wireGeom(w); if (!g) continue;
      const fromB = hotBat.has(w.a.c) || !hotBat.has(w.b.c);
      if (stage >= 2) {
        h += `<path class="heat-wire s${stage}" d="${fromB ? g.d : g.rd}" pathLength="100" stroke-dasharray="0 100"/>`;
        for (const end of [w.a, w.b]) { const q = termPos(getComp(end.c), end.t); h += `<circle class="heat-joint" cx="${q.x}" cy="${q.y}" r="15"/>`; }
      }
      if (stage >= 3) {
        h += `<text class="heat-smoke" x="${g.mid.x}" y="${g.mid.y}">💨</text><text class="heat-smoke b" x="${g.mid.x + 20}" y="${g.mid.y - 6}">💨</text>`;
        h += `<text class="heat-fire" x="${g.mid.x - 8}" y="${g.mid.y + 12}">🔥</text>`;
      }
    }
    L.heat.innerHTML = h;
  }
  function heatBoom() {
    const H = S.heat;
    const bats = H.bats.map(getComp).filter(Boolean);
    const gone = new Set(H.wires);
    let h = '';
    for (const c of bats) h += `<text class="boom" x="${c.x}" y="${c.y + 40}">💥</text>`;
    heatClear();
    L.heat.innerHTML = h;
    setTimeout(() => { if (!S.heat) L.heat.innerHTML = ''; }, 1600);
    svg.classList.add('shake-big'); setTimeout(() => svg.classList.remove('shake-big'), 900);
    const fl = document.createElement('div'); fl.className = 'boom-flash'; document.body.appendChild(fl); setTimeout(() => fl.remove(), 900);
    noise(0.9, 0.6); tone(70, 0.7, 'sawtooth', 0.2); tone(45, 0.9, 'sine', 0.25, 0.05);
    bats.forEach(c => { c.broken = true; });
    S.wires = S.wires.filter(w => !gone.has(w.id));      // 전선이 녹아서 끊어졌어요
    toast('💥 펑! 전지가 터지고 전선이 녹아 끊어졌어요! 까만 전지를 콕 눌러 새 전지로 바꿔요', 6000);
    speak('펑! 전지가 터지고 전선이 녹아서 끊어졌어요! 진짜로 하면 불이 나고 크게 다쳐요. 까맣게 탄 전지를 콕 눌러서 새 전지로 바꿔요.');
    recompute();
  }

  /* ---------- 오른쪽 패널 ---------- */
  const WORLDS = window.WORLDS;
  const stageName = m => m.free ? m.title : `${m.label} ${m.title}`;
  function renderMission() {
    const m = mission();
    const ctx = ctxFor();
    let items = m.progress ? m.progress(ctx) : [{ text: m.goal, done: S.succeeded }];
    if (m.check === null) items = [];
    const done = progress.done.includes(S.level);
    const wd = WORLDS[m.world] || { first: S.level, count: 1 };
    const stars = m.free ? '' : Array.from({ length: wd.count }, (_, k) => wd.first + k).map(i => `<span class="dot${progress.done.includes(i) ? ' got' : ''}${i === S.level ? ' cur' : ''}">${progress.done.includes(i) ? '⭐' : i - wd.first + 1}</span>`).join('');
    $('#mission').innerHTML = `
      <button class="info-i" id="btn-m-info" title="엄마 아빠 설명">i</button>
      <div class="m-dots">${stars}</div>
      <div class="m-head"><span class="m-emoji">${m.emoji}</span><h2>${m.free ? '' : `<span class="m-label">${m.label}</span> `}${m.title}${done ? ' ⭐' : ''}</h2></div>
      <p class="m-story">${m.story}</p>
      ${items.length ? `<ul class="m-goals">${items.map(g => `<li class="${g.done ? 'done' : ''}${g.extra ? ' extra' : ''}">${g.done ? '✅' : '⭐'} ${g.text}</li>`).join('')}</ul>` : ''}
      <div class="m-btns">
        <button class="pill" id="btn-say">🔊 들려줘</button>
        <button class="pill${S.nudge ? ' nudge' : ''}" id="btn-hint">💡 도와줘</button>
        ${S.succeeded && S.level < MISSIONS.length - 1 ? '<button class="pill go shine" id="btn-next2">다음 ▶</button>' : ''}
      </div>
      <div class="m-hint${S.hintShown ? '' : ' hidden'}" id="hint-box">${S.hintShown || ''}</div>`;
    $('#btn-say').onclick = () => speak(m.story);
    $('#btn-hint').onclick = () => giveHint();
    $('#fab-hint').classList.toggle('nudge', !!S.nudge);
    $('#fab-hint').classList.toggle('hidden', mission().check === null);
    $('#btn-m-info').onclick = () => openParent(stageName(m), m.parent);
    const n2 = $('#btn-next2'); if (n2) n2.onclick = () => loadLevel(S.level + 1);
    $('#level-title').textContent = stageName(m);
  }

  function renderNote() {
    const an = S.an, el = $('#note');
    if (an.status === 'short') {
      el.innerHTML = `<div class="warn-box"><div class="big-emo">🔥😱</div><b>앗, 합선이에요!</b><br>전기가 전구로 안 가고 지름길로 몰려가요.<br>
        <ol class="heat-steps"><li>🔋 전지 속이 제일 먼저 뜨거워져요</li><li>🔴 전선 이음매가 빨갛게 달아요</li><li>💨 전선 껍질이 녹고 연기가 나요</li><li>💥 펑! 전지가 터지고 전선이 녹아 끊어져요</li></ol>
        <b>빨리 반짝이는 전선을 콕 눌러 지워요!</b></div>`;
      return;
    }
    if (an.status === 'open') {
      el.innerHTML = `<div class="open-box"><div class="big-emo">😴</div>전기가 아직 쉬고 있어요</div><p class="tip">👉 ${an.hint}</p>`;
      return;
    }
    // 전기 세기 번개 (0.25A 마다 ⚡ 하나)
    const n = Math.max(1, Math.min(8, Math.round(an.maxI / 0.25)));
    const bolts = '⚡'.repeat(n);
    let h = `<div class="kid-power"><div class="kp-label">전기 세기</div><div class="kp-bolts">${bolts}</div></div>`;
    if (an.kidEq && settings.numbers) {
      h += `<div class="kid-eq">
        <div class="ke-box push"><div class="ke-ico">🔋</div><div class="ke-num">${an.kidEq.V}V</div><div class="ke-word">미는 힘</div></div>
        <div class="ke-op">÷</div>
        <div class="ke-box block"><div class="ke-ico">🚧</div><div class="ke-num">${an.kidEq.R}Ω</div><div class="ke-word">막는 힘</div></div>
        <div class="ke-op">=</div>
        <div class="ke-box flow"><div class="ke-ico">⚡</div><div class="ke-num">${an.kidEq.I}A</div><div class="ke-word">전기 세기</div></div>
      </div>`;
    }
    h += `<div class="summary">${an.summary.map(s => `<p>${s}</p>`).join('')}</div>`;
    h += '<p class="water-note">➡️ 화살표 = 전기가 가는 길. 전지가 세게 밀수록(전지를 줄줄이 이을수록) 화살표가 굵어져요!</p>';
    h += '<p class="water-note">🔵 전선 속에는 전자 알갱이가 꽉 차 있어요. 길이 이어지면 다 같이 움직여요. 빠를수록 전기가 세요!</p>';
    el.innerHTML = h;
  }

  /** 엄마 아빠용 자세한 계산 (ⓘ) */
  function parentNoteHTML() {
    const an = S.an;
    let h = '';
    if (!an || an.status === 'open') h += '<p>지금은 회로가 닫혀 있지 않아 전류가 <b>0A</b>입니다. 전지 (＋)극에서 부하(전구 등)를 거쳐 (−)극으로 돌아오는 닫힌 경로가 필요합니다.</p>';
    else if (an.status === 'short') h += '<p><b>합선(단락)</b>: 전지의 두 극이 저항이 거의 없는 경로로 직접 이어진 상태입니다. 이론상 매우 큰 전류가 흘러 실제 전지·전선이 발열하며 위험합니다. 이때 전구 쪽에는 전압이 거의 걸리지 않아 꺼집니다.</p><p><b>화면의 발열 순서</b>: 열은 P = I²R 로 생깁니다. 합선 회로에서 저항이 가장 큰 곳은 <b>전지의 내부저항</b>이라 전지가 가장 먼저·가장 많이 뜨거워지고, 다음으로 접촉저항이 있는 <b>단자·이음매</b>, 그다음 <b>전선</b>이 달아오릅니다. 실제로는 전선 피복이 녹아 연기가 나고, 전지가 부풀거나 새거나(누액) 드물게 파열·발화할 수 있습니다. 화면에서는 약 7초 만에 \'펑\' 하도록 극적으로 줄여 보여 줍니다(실제 시간·정도는 전지 종류에 따라 다름).</p>';
    else {
      for (const s of an.steps) h += `<div class="step${s.big ? ' big' : ''}"><div class="s-label">${s.icon} ${s.label}</div><div class="s-formula">${s.formula}</div>${s.sub ? `<div class="s-sub">${s.sub}</div>` : ''}</div>`;
      if (!an.ok) h += '<p>직렬·병렬이 섞인 회로라 한 줄 공식 대신 부품별 값을 보여줍니다. 각 부품에서 옴의 법칙(V = I × R)이 성립합니다.</p>';
      const act = an.list.filter(x => x.active);
      if (act.length) h += `<div class="step"><div class="s-label">🔎 부품별 옴의 법칙 (전압 ÷ 저항 = 전류)</div>` +
        act.map(x => `<div class="s-row"><span>${x.name}</span><span>${x.V}V ÷ ${x.R}Ω = <b>${x.I}A</b></span></div>`).join('') + '</div>';
    }
    h += `<h3>아이에게 쓰는 말 ↔ 실제 용어</h3>
      <ul><li><b>미는 힘</b> = 전압 (V, 볼트)</li><li><b>막는 힘</b> = 저항 (Ω, 옴)</li><li><b>전기 세기</b> = 전류 (A, 암페어) · 번개 ⚡ 1개 = 0.25A</li>
      <li><b>줄줄이(기차)</b> = 직렬 · <b>나란히(사다리)</b> = 병렬</li>
      <li><b>➡️ 화살표</b>: 전류의 방향(알갱이 방향 설정을 따름)입니다. <b>굵기 = 그 회로를 미는 전지 전압</b>(1.5V 얇게, 3V 굵게, 4.5V 아주 굵게), <b>빠르기 = 전류 크기</b>입니다. 전압은 원래 두 점 사이의 차이라서, 여기서는 그 회로 전체에 걸린 전지 전압을 굵기로 보여줍니다.</li>
      <li><b>🔣 부품 속 하얀 그림 = 회로도 기호</b>: 교과서 회로도에 쓰는 표준 기호입니다. 전지(긴 선이 ＋극, 짧고 굵은 선이 −극), 전구(동그라미 속 ×), 스위치(열리면 날이 들림), 전동기(동그라미 속 M), 저항(네모). 부품을 돌리면 기호도 같이 돌아 단자 방향과 맞습니다.</li>
      <li><b>🔵 알갱이 = 자유전자</b>: 금속 전선 속에는 움직일 수 있는 전자가 원래 가득 있습니다. 그래서 연결 전에도 알갱이가 보이고, 지우개·나무(부도체)에는 없습니다.</li>
      <li><b>⚡ 밀림 파동</b>: 회로가 닫히면 마지막으로 이어진 곳에서 전기적 '밀림'(전자기파)이 양쪽으로 퍼집니다. 실제 속도는 빛의 약 60~90%라서 1m 전선을 몇 나노초 만에 지나갑니다. 화면은 수십억 배 느리게 보여주는 것입니다.</li>
      <li><b>🐢 전자의 실제 속도</b>: 0.5A, 0.5mm² 구리선에서 전자의 평균 이동 속도는 초속 약 0.07mm입니다(v = I ÷ nqA). 그래도 불이 바로 켜지는 건 전자가 이미 꽉 차 있어 다 같이 움직이기 때문입니다. 화면의 알갱이는 보기 쉽게 훨씬 빠르게 그렸습니다.</li>
      <li><b>📏 속도 = 전류</b>: 같은 전선에서 전류는 전자 속도에 비례합니다(I = nqAv). 병렬로 갈라지면 갈래마다 알갱이가 절반 속도로, 합쳐지는 몸통에서는 다시 빠르게 움직입니다(키르히호프 전류 법칙).</li>
      <li><b>방향</b>: 전자는 −극 → ＋극으로 움직이고, 교과서의 '전류 방향'은 그 반대(＋ → −)입니다. ⓘ 설정에서 알갱이 방향을 바꿀 수 있어요.</li>
      <li>${settings.electron ? '🔵 파란 점 = 전자 (−극 → ＋극). 실제로 움직이는 것은 전자이며 전류 방향과 반대입니다.' : '🟡 노란 점 = 전류 (＋극 → −극, 관례적인 방향). 점의 속도는 전류 크기에 비례합니다.'}</li></ul>`;
    return h;
  }

  function renderBars() {
    const el = $('#bars');
    const rows = S.comps.filter(c => c.kind === 'battery' || C.isLoad(c) || (c.kind === 'bulb'));
    if (!rows.length) { el.innerHTML = '<p class="tip">재료를 꺼내면 여기에 전기 세기 막대가 보여요.</p>'; return; }
    const MAX = 2;
    const short = S.an && S.an.status === 'short';
    el.innerHTML = rows.map(c => {
      const A = short ? 0 : compInfo(c).A;
      const pct = Math.min(100, A / MAX * 100);
      const cls = c.kind === 'battery' ? 'bat' : c.kind === 'bulb' ? 'bulb' : 'load';
      return `<div class="bar-row"><span class="bar-name">${C.displayName(c)}</span>
        <div class="bar"><div class="fill ${cls}" style="width:${pct}%"></div><div class="base" title="기본 0.5A"></div></div>
        <span class="bar-val">${short && c.kind === 'battery' ? '🔥' : (settings.numbers ? fmt(A) + 'A' : '')}</span></div>`;
    }).join('') + '<p class="bar-legend">❤️ 빨간 선 = 보통 밝기 (전지 1개 + 전구 1개)</p>';
  }

  /* ---------- 팔레트 (재료함) ---------- */
  function countOnBoard(kind) { return S.comps.filter(c => c.kind === kind).length; }
  // 재료 상자에서 아직 꺼내야 할 재료가 있는지 (X-7, X-8)
  function paletteNeeds(k) {
    const m = mission(), want = m.want;
    if (!want || (m.inv[k] || 0) - countOnBoard(k) <= 0) return false;
    const isMat = x => KINDS[x].cat === 'material';
    if (isMat(k)) return !!want.MAT && !S.comps.some(c => isMat(c.kind));
    return (want[k] || 0) > countOnBoard(k);
  }
  function renderPalette() {
    const inv = mission().inv;
    const kinds = ORDER.filter(k => inv[k]);
    $('#pal-items').innerHTML = kinds.map(k => {
      const left = inv[k] - countOnBoard(k);
      const sparkle = paletteNeeds(k);
      const fake = { id: 0, kind: k, rot: 0, open: k === 'switch', num: 1 };
      return `<div class="pal-item${left <= 0 ? ' empty' : ''}${sparkle ? ' want' : ''}" data-kind="${k}">${sparkle ? '<span class="sparkle s1">✨</span><span class="sparkle s2">✨</span>' : ''}
        <svg viewBox="-66 -96 132 128" class="pal-svg">${compInner(fake, { b: 0 })}</svg>
        <div class="pal-name">${KINDS[k].name}</div><div class="pal-count">${left > 0 ? '×' + left : '다 썼어요'}</div></div>`;
    }).join('');
  }

  /* ---------- 부품/전선 다루기 ---------- */
  function addComp(kind, x, y, extra) {
    const used = new Set(S.comps.filter(c => c.kind === kind).map(c => c.num));
    let num = 1; while (used.has(num)) num++;
    const c = Object.assign({ id: S.nextId++, kind, x: clamp(snap(x), 70, BW - 70), y: clamp(snap(y), 110, BH - 40), rot: 0, num }, extra || {});
    if (kind === 'switch' && c.open == null) c.open = true;
    S.comps.push(c);
    return c;
  }
  function removeComp(id) {
    S.comps = S.comps.filter(c => c.id !== id);
    S.wires = S.wires.filter(w => w.a.c !== id && w.b.c !== id);
    if (S.sel === id) S.sel = null;
    sfx.remove();
    renderPalette(); recompute();
  }
  function addWire(a, b) {
    if (a.c === b.c && a.t === b.t) return false;
    const dup = S.wires.some(w => (w.a.c === a.c && w.a.t === a.t && w.b.c === b.c && w.b.t === b.t) || (w.a.c === b.c && w.a.t === b.t && w.b.c === a.c && w.b.t === a.t));
    if (dup) return false;
    const sag = S.wires.length % 2 ? -1 : 1;
    S.wires.push({ id: S.nextId++, a, b, sag, color: WIRE_COLORS[S.colorIdx++ % WIRE_COLORS.length] });
    return true;
  }
  function freeSpot() {
    for (let r = 0; r < 12; r++) {
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * Math.PI * 2, x = 500 + Math.cos(a) * r * 50, y = 360 + Math.sin(a) * r * 30;
        if (x < 80 || x > BW - 80 || y < 120 || y > BH - 60) continue;
        if (S.comps.every(c => Math.hypot(c.x - x, c.y - y) > 150)) return { x, y };
      }
    }
    return { x: 500, y: 360 };
  }
  function nearestTerm(p, exclude, maxD = 30) {
    let best = null, bd = maxD;
    for (const c of S.comps) for (const t of [0, 1]) {
      if (exclude && exclude.c === c.id && exclude.t === t) continue;
      const q = termPos(c, t), d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < bd) { bd = d; best = { c: c.id, t }; }
    }
    return best;
  }

  /* ---------- 드래그 ---------- */
  let drag = null;
  const palette = $('#palette');

  svg.addEventListener('pointerdown', e => {
    audio();
    if (S.successTok) return;   // 성공 축하 중에는 판을 눌러도 회로가 안 망가져요
    const act = e.target.closest('[data-action]');
    if (act) { e.preventDefault(); doAction(act.dataset.action); return; }
    const term = e.target.closest('[data-term]');
    if (term) {
      const [c, t] = term.dataset.term.split(':').map(Number);
      drag = { type: 'wire', from: { c, t } };
      S.sel = null; S.selWire = null;
      svg.setPointerCapture(e.pointerId);
      svg.classList.add('wiring');
      updateDragWire(svgPt(e));
      sfx.pick();
      return;
    }
    const comp = e.target.closest('[data-cid]');
    if (comp) {
      const c = getComp(+comp.dataset.cid), p = svgPt(e);
      drag = { type: 'move', cid: c.id, dx: p.x - c.x, dy: p.y - c.y, sx: e.clientX, sy: e.clientY, moved: false };
      svg.setPointerCapture(e.pointerId);
      return;
    }
    const w = e.target.closest('[data-wid]');
    // 전선은 아무 데나 콕 누르면 바로 지워져요
    if (w) { const id = +w.dataset.wid; S.wires = S.wires.filter(x => x.id !== id); S.selWire = null; S.sel = null; sfx.remove(); recompute(); return; }
    if (S.sel || S.selWire) { S.sel = null; S.selWire = null; renderBoard(); }
  });

  $('#pal-items').addEventListener('pointerdown', e => {
    audio();
    const it = e.target.closest('.pal-item');
    if (!it || it.classList.contains('empty')) return;
    e.preventDefault();
    const kind = it.dataset.kind;
    const ghost = document.createElement('div');
    ghost.className = 'ghost';
    ghost.innerHTML = it.querySelector('svg').outerHTML;
    document.body.appendChild(ghost);
    drag = { type: 'palette', kind, ghost, sx: e.clientX, sy: e.clientY, moved: false };
    moveGhost(e);
    sfx.pick();
  });

  function moveGhost(e) { drag.ghost.style.left = e.clientX + 'px'; drag.ghost.style.top = e.clientY + 'px'; }

  function updateDragWire(p) {
    const from = getComp(drag.from.c); if (!from) return;
    const p1 = termPos(from, drag.from.t);
    const tgt = nearestTerm(p, drag.from);
    let p2 = p, n2 = { x: (p1.x - p.x), y: (p1.y - p.y) };
    const nl = Math.hypot(n2.x, n2.y) || 1; n2 = { x: n2.x / nl, y: n2.y / nl };
    if (tgt) { const q = termPos(getComp(tgt.c), tgt.t); p2 = q; n2 = q.n; }
    dragPath.setAttribute('d', bez(p1, p1.n, p2, n2).d);
    dragPath.style.display = '';
    L.terms.querySelectorAll('.term.target').forEach(el => el.classList.remove('target'));
    if (tgt) { const el = L.terms.querySelector(`[data-term="${tgt.c}:${tgt.t}"]`); if (el) el.classList.add('target'); }
  }

  window.addEventListener('pointermove', e => {
    if (!drag) return;
    if (drag.type === 'palette') {
      if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 5) drag.moved = true;
      moveGhost(e);
      drag.ghost.classList.toggle('over', inRect(e, svg));
    } else if (drag.type === 'move') {
      if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 6) return;
      if (!drag.moved) { drag.moved = true; S.sel = drag.cid; S.selWire = null; }
      const c = getComp(drag.cid), p = svgPt(e);
      c.x = clamp(snap(p.x - drag.dx), 40, BW - 40); c.y = clamp(snap(p.y - drag.dy), 40, BH - 30);
      palette.classList.toggle('trash', inRect(e, palette));
      renderBoard();
    } else if (drag.type === 'wire') {
      updateDragWire(svgPt(e));
    }
  });

  window.addEventListener('pointerup', e => {
    if (!drag) return;
    const d = drag; drag = null;
    if (d.type === 'palette') {
      d.ghost.remove();
      if (inRect(e, svg)) { const p = svgPt(e); const c = addComp(d.kind, p.x, p.y); S.sel = c.id; sfx.drop(); }
      else if (!d.moved) { const p = freeSpot(); const c = addComp(d.kind, p.x, p.y); S.sel = c.id; sfx.drop(); }
      else return;
      renderPalette(); recompute();
    } else if (d.type === 'move') {
      palette.classList.remove('trash');
      if (!d.moved) { clickComp(getComp(d.cid)); return; }
      if (inRect(e, palette)) { removeComp(d.cid); return; }
      sfx.drop();
      renderBoard();
    } else if (d.type === 'wire') {
      svg.classList.remove('wiring');
      dragPath.style.display = 'none';
      const tgt = nearestTerm(svgPt(e), d.from);
      if (tgt && addWire(d.from, tgt)) { S.lastKeys = [d.from.c + ':' + d.from.t, tgt.c + ':' + tgt.t]; sfx.connect(); recompute(); }
      else renderBoard();
    }
  });

  function clickComp(c) {
    if (!c) return;
    S.sel = c.id; S.selWire = null;
    S.lastKeys = [c.id + ':0', c.id + ':1'];
    if (c.kind === 'switch') { c.open = !c.open; sfx.click(); }
    else if (c.kind === 'bulb' && c.broken) { c.broken = false; sfx.connect(); toast('새 전구 짠! 💡'); }
    else if (c.kind === 'battery' && c.broken) { c.broken = false; sfx.connect(); toast('새 전지 짠! 🔋 이번엔 합선 조심!'); }
    recompute();
  }

  function doAction(a) {
    if (a === 'rotate' && S.sel) { const c = getComp(S.sel); c.rot = (c.rot + 90) % 360; sfx.click(); renderBoard(); }
    if (a === 'delete' && S.sel) removeComp(S.sel);
    if (a === 'delwire' && S.selWire) { S.wires = S.wires.filter(w => w.id !== S.selWire); S.selWire = null; sfx.remove(); recompute(); }
  }

  window.addEventListener('keydown', e => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (S.sel) removeComp(S.sel);
      else if (S.selWire) doAction('delwire');
    }
    if ((e.key === 'r' || e.key === 'R') && S.sel) doAction('rotate');
    if (e.key === 'Escape') { if (!$('#parent').classList.contains('hidden')) $('#parent').classList.add('hidden'); else closeModals(); }
  });

  /* ---------- 밀림 파동: 이어진 곳에서 시작해 양쪽으로 퍼져요 (아주 느리게 보여주기) ----------
   * 실제: 전선 속에는 전자가 원래 꽉 차 있고, 회로가 닫히면 '밀림'이 거의 빛의 속도로 퍼져요.
   *       파동이 지나간 곳부터 전자가 움직이기 시작하고, 전자 자체는 아주 느리게(초속 0.1mm 정도) 움직여요. */
  function prepareWave() {
    const act = flows.filter(f => f.A > PHYS.ACTIVE_A && f.el);
    const nodes = new Set();
    for (const f of act) { f.len = f.el.getTotalLength(); nodes.add(f.from); nodes.add(f.to); }
    const dist = {};
    let starts = (wave.origin || []).flatMap(k => [k, k + '*']).filter(k => nodes.has(k));
    if (!starts.length) starts = S.comps.filter(c => c.kind === 'battery').flatMap(c => [c.id + ':0', c.id + ':1']).filter(k => nodes.has(k));
    starts.forEach(k => { dist[k] = 0; });
    const edges = act.map(f => [f.from, f.to, f.len]);
    for (const k of nodes) if (!k.endsWith('*') && nodes.has(k + '*')) edges.push([k, k + '*', 0]);
    for (let it = 0; it < edges.length + 2; it++) {
      let ch = false;
      for (const [a, b, l] of edges) {
        if (dist[a] != null && (dist[b] == null || dist[a] + l < dist[b] - 0.01)) { dist[b] = dist[a] + l; ch = true; }
        if (dist[b] != null && (dist[a] == null || dist[b] + l < dist[a] - 0.01)) { dist[a] = dist[b] + l; ch = true; }
      }
      if (!ch) break;
    }
    wave.total = 1;
    for (const f of act) {
      f.dA = dist[f.from] != null ? dist[f.from] : 0;
      f.dB = dist[f.to] != null ? dist[f.to] : 0;
      f.cover = Math.min(f.dA + f.len, f.dB + f.len, (f.dA + f.dB + f.len) / 2);   // 양쪽에서 온 파동이 만나면 다 덮여요
      wave.total = Math.max(wave.total, f.cover);
    }
    wave.act = act;
  }
  function applyWave() {
    const k = Math.min(1, (performance.now() - wave.t0) / (wave.dur * 1000));
    const front = wave.total * k;
    let html = '';
    for (const f of wave.act) {
      if (front >= f.cover) { wave.moving.add(f.key); }
      else {
        const s1 = front - f.dA, s2 = front - f.dB;
        if (s1 > 0 && s1 < f.len && s1 < f.len - Math.max(0, s2)) { const q = f.el.getPointAtLength(s1); html += `<circle class="pulse-dot" cx="${q.x}" cy="${q.y}" r="15"/>`; }
        if (s2 > 0 && s2 < f.len && s2 < f.len - Math.max(0, s1)) { const q = f.el.getPointAtLength(f.len - s2); html += `<circle class="pulse-dot" cx="${q.x}" cy="${q.y}" r="15"/>`; }
      }
      if (f.cid != null && front >= Math.min(f.dA, f.dB) && !wave.reached.has(f.cid)) {
        wave.reached.add(f.cid);
        const c = getComp(f.cid);
        if (c && c.kind === 'bulb' && Math.abs(S.sol.comp[c.id].I) > PHYS.LIT_A) { sfx.light(); lightPop(c); }
      }
    }
    L.wave.innerHTML = html;
    for (const el of lights) el.style.opacity = wave.reached.has(+el.dataset.light) ? '' : '0';
    if (k >= 1) {
      const done = wave.onDone; wave = null;
      L.wave.innerHTML = '';
      lights.forEach(el => { el.style.opacity = ''; });
      $('#slowmo').classList.add('hidden');
      if (done) done();
    }
  }
  function startWave(dur, onDone) {
    if (!flows.some(f => f.A > PHYS.ACTIVE_A)) { if (onDone) onDone(); return; }
    wave = { t0: performance.now(), dur, onDone, origin: S.lastKeys, reached: new Set(), moving: new Set() };
    prepareWave(); applyWave();
    $('#slowmo').classList.remove('hidden');
    for (let i = 0; i < 6; i++) tone(500 + i * 90, 0.12, 'triangle', 0.05, i * 0.07);   // 쭈욱~ 퍼지는 소리
  }

  /* ---------- 애니메이션 ---------- */
  let last = performance.now();
  function tick(t) {
    const dt = Math.min(0.05, (t - last) / 1000); last = t;
    for (const f of flows) {
      if (f.A <= PHYS.ACTIVE_A || !f.el) continue;              // 길이 안 이어지면 알갱이는 가만히
      if (wave && !wave.moving.has(f.key)) continue;           // 밀림 파동이 아직 안 왔어요
      const sp = Math.min(f.A * SPEED, 420);                  // 같은 전선이면 전류 ∝ 알갱이 속도
      let ph = (phase[f.key] || 0) + sp * dt;
      ph = ((ph % 160) + 160) % 160;
      phase[f.key] = ph;
      f.el.setAttribute('stroke-dashoffset', (-ph).toFixed(2));
    }
    if (wave) applyWave();
    moveArrows(dt);
    if (S.heat) heatTick(t);
    if (S.night && (wave || S.nightShow)) drawDark();
    if (S.night && S.nightShow) nightGrow(t);
    for (const f of fans) {
      if (wave && !wave.reached.has(f.id)) continue;
      fanAng[f.id] = ((fanAng[f.id] || 0) + f.I * 540 * dt) % 360;
      f.el.setAttribute('transform', `translate(0 -62) rotate(${fanAng[f.id].toFixed(1)})`);
    }
    requestAnimationFrame(tick);
  }

  /* ---------- 토스트 / 모달 ---------- */
  let toastTimer = null;
  function toast(msg, ms = 3000) {
    const el = $('#toast');
    el.textContent = msg; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), ms);
  }
  function openModal(id) { closeModals(); $(id).classList.remove('hidden'); }
  function closeModals() { document.querySelectorAll('.modal').forEach(m => { if (m.id !== 'start') m.classList.add('hidden'); }); }
  $('#parent-close').onclick = () => $('#parent').classList.add('hidden');
  $('#btn-note-info').onclick = () => openParent('계산 노트', '');
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeModals));
  document.querySelectorAll('.modal').forEach(m => m.addEventListener('pointerdown', e => {
    if (e.target !== m || m.id === 'start') return;
    if (m.id === 'parent') m.classList.add('hidden'); else closeModals();
  }));

  /* ---------- 깜깜한 밤 화면: 불빛이 얼마나 퍼지는지 보여줘요 ----------
   * 불빛 크기 ∝ √(밝기). 밝기 = 전력 ÷ 기본 전력 (전지 1 + 전구 1 = 1)
   * 직렬 전구(0.25A) = 밝기 ¼ → 작은 불빛, 전지 2개(1A) = 밝기 4 → 아주 큰 불빛 */
  let darkKey = '';
  const STARS = Array.from({ length: 22 }, (_, i) => ({ x: (i * 397 + 61) % 960 + 20, y: (i * 211 + 37) % 600 + 20, d: (i % 7) * 0.3 }));
  function drawDark() {
    if (!L.dark) return;
    if (!S.night) { if (darkKey) { L.dark.innerHTML = ''; darkKey = ''; } return; }
    const lit = S.comps.filter(c => c.kind === 'bulb' && !c.broken && (!wave || S.nightShow || wave.reached.has(c.id)))
      .map(c => ({ c, b: compInfo(c).b || 0 })).filter(x => x.b > 0.02);
    const key = 'n' + lit.map(x => `${x.c.id}:${x.c.x}:${x.c.y}:${x.c.rot}:${x.b.toFixed(2)}`).join('|');
    if (key === darkKey) return;
    darkKey = key;
    // 마스크 없이 그려요 (오래된 브라우저에서도 보이게): 깜깜한 판 위에 불 켜진 전구만 환하게
    let lights = '';
    for (const { c, b } of lit) {
      const k = Math.sqrt(Math.min(b, 4));                 // 밝기 ¼ → 0.5, 1 → 1, 4 → 2
      const R = 60 + 110 * k, op = Math.min(1, 0.45 + 0.55 * Math.min(1, b));
      let rays = '';
      for (let i = 0; i < 10; i++) {
        const a2 = i / 10 * Math.PI * 2, r1 = 34, r2 = 34 + 14 + 22 * Math.min(1.5, k);
        rays += `<line x1="${(Math.cos(a2) * r1).toFixed(1)}" y1="${(-48 + Math.sin(a2) * r1).toFixed(1)}" x2="${(Math.cos(a2) * r2).toFixed(1)}" y2="${(-48 + Math.sin(a2) * r2).toFixed(1)}" class="night-ray"/>`;
      }
      lights += `<g class="night-light" opacity="${op.toFixed(2)}" transform="translate(${c.x} ${c.y}) rotate(${c.rot})">
        <circle cx="0" cy="-48" r="${R.toFixed(0)}" data-r="${R.toFixed(0)}" fill="url(#warm)"/>
        <circle cx="0" cy="-48" r="${(R * 0.45).toFixed(0)}" data-r="${(R * 0.45).toFixed(0)}" fill="url(#glow)"/>
        ${[0, 1, 2, 3, 4, 5].map(i => { const a3 = i / 6 * Math.PI * 2 + 0.4, rr = R * 0.62; return `<text class="night-spark" x="${(Math.cos(a3) * rr).toFixed(0)}" y="${(-40 + Math.sin(a3) * rr).toFixed(0)}" style="animation-delay:${(i * 0.23).toFixed(2)}s">✨</text>`; }).join('')}
        ${rays}
        <circle cx="0" cy="-48" r="25" fill="#fffbe6" stroke="#ffe066" stroke-width="3"/>
        <path d="M-6 -26 L-6 -44 L-3 -50 L0 -44 L3 -50 L6 -44 L6 -26" fill="none" stroke="#ff922b" stroke-width="2.6" stroke-linejoin="round"/>
        <rect x="-12" y="-27" width="24" height="16" rx="3" fill="#7d6a4a" opacity=".8"/></g>`;
    }
    if (!L.dark.querySelector('.night-lights')) {     // 깜깜한 판은 한 번만 (불빛만 바꿔 그려요)
      const stars = STARS.map(s => `<circle class="star" cx="${s.x}" cy="${s.y}" r="2.2" style="animation-delay:${s.d}s"/>`).join('');
      L.dark.innerHTML = `<rect class="night" width="1000" height="640" rx="24"/>${stars}<g class="night-lights"></g>`;
    }
    L.dark.querySelector('.night-lights').innerHTML = lights;
  }
  // 성공 쇼: 깜깜해진 뒤(0.8초) 불빛이 1.4초 동안 점점 커지고, 잠깐 두근두근 빛나요
  function nightGrow(now) {
    const e = now - S.nightShow, g = Math.max(0, Math.min(1, (e - 800) / 1400));
    const beat = 1 + 0.06 * Math.sin(e / 140);
    const box = L.dark.querySelector('.night-lights'); if (!box) return;
    box.setAttribute('opacity', Math.min(1, g * 1.6).toFixed(2));
    box.querySelectorAll('[data-r]').forEach(el => el.setAttribute('r', (+el.dataset.r * (0.15 + 0.85 * g) * beat).toFixed(1)));
    if (e > 6000) { S.nightShow = null; box.setAttribute('opacity', '1'); box.querySelectorAll('[data-r]').forEach(el => el.setAttribute('r', el.dataset.r)); }
  }
  function syncNight() {
    const b = $('#btn-night'); if (!b) return;
    b.innerHTML = S.night ? '☀️<span>밝게</span>' : '🌙<span>깜깜하게</span>';
    b.classList.toggle('on', !!S.night);
    drawDark();
  }
  $('#btn-night').onclick = () => {
    audio(); S.night = !S.night; syncNight();
    if (S.night) speak(S.litCount ? '깜깜한 밤이에요! 전구가 밝을수록 불빛이 넓게 퍼져요.' : '깜깜한 밤이에요! 불을 켜 볼까요?');
  };

  // 불이 켜지는 순간: 번쩍! 빛 고리 + 반짝이
  function lightPop(c) {
    if (!c || !L.fx) return;
    const g = rotV({ x: 0, y: -48 }, c.rot), x = c.x + g.x, y = c.y + g.y;
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    el.setAttribute('class', 'pop');
    const ring = d => `<circle class="pop-ring" cx="${x}" cy="${y}" r="20" opacity="0"><animate attributeName="r" values="20;130" dur="0.9s" begin="${d}s" fill="freeze"/><animate attributeName="opacity" values="1;0" dur="0.9s" begin="${d}s" fill="freeze"/></circle>`;
    el.innerHTML = ring(0) + ring(0.2) +
      [0, 60, 120, 180, 240, 300].map((a, i) => { const r = a * Math.PI / 180; return `<text class="pop-spark" x="${x + Math.cos(r) * 70}" y="${y + Math.sin(r) * 70 + 8}" style="animation-delay:${i * 0.05}s">✨</text>`; }).join('') +
      `<text class="pop-word" x="${x}" y="${y - 70}">반짝!</text>`;
    L.fx.appendChild(el);
    setTimeout(() => el.remove(), 1400);
  }

  // 성공 연출: 전구면 깜깜한 밤에 환하게, 선풍기면 바람이 쌩쌩
  function successShow() {
    const litB = S.comps.some(c => c.kind === 'bulb' && !c.broken && Math.abs(S.sol.comp[c.id].I) > PHYS.LIT_A);
    if (litB) {
      S.night = true; S.nightShow = performance.now(); darkKey = ''; syncNight();
      tone(1200, 0.05, 'square', 0.05);                                  // 딸깍 (불 끄는 소리)
      setTimeout(() => { if (S.night) speak('깜깜한 밤에도 우리 전구가 환하게 빛나요!'); }, 1500);
    }
    const fansOn = S.comps.filter(c => c.kind === 'motor' && Math.abs(S.sol.comp[c.id].I) > 0.1);
    for (const c of fansOn) {
      const A = Math.abs(S.sol.comp[c.id].I), g = rotV({ x: 0, y: -62 }, c.rot), x = c.x + g.x, y = c.y + g.y;
      const el = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      el.setAttribute('class', 'wind');
      el.innerHTML = [-24, 0, 24].map((dy, i) => `<path class="wind-line" style="animation-duration:${(1.2 / Math.max(0.5, A * 2)).toFixed(2)}s;animation-delay:${i * 0.15}s"
        d="M${x + 30} ${y + dy} q60 -18 120 0 t120 0"/>`).join('') + `<text class="wind-leaf" x="${x + 60}" y="${y}">🍃</text><text class="wind-leaf b" x="${x + 60}" y="${y + 20}">🍃</text>`;
      L.fx.appendChild(el);
      setTimeout(() => el.remove(), 6000);
    }
  }

  // 성공하자마자: 글자 대신 깜깜한 밤 불빛 쇼(선풍기는 바람)가 칭찬이에요. "잘했어요"는 축하 창에서 한 번만.
  function cheer() {
    if (S.cheered) return;
    S.cheered = true;
    successShow();
  }
  function showSuccess() {
    const m = mission();
    sfx.success(); confetti();
    if (!S.cheered) successShow();
    document.querySelectorAll('.cheer').forEach(el => el.remove());
    const hasNext = S.level < MISSIONS.length - 1;
    const worldDone = !m.free && m.stage === 9;
    const nx = MISSIONS[S.level + 1];
    $('#success-body').innerHTML = `<button class="info-i" id="btn-s-info" title="엄마 아빠 설명">i</button>
      <div class="succ-emoji">${worldDone ? '🏆' : '🎉'}</div><h2>${worldDone ? `${m.title} 다 깼어요!` : `${m.label} 잘했어요!`}</h2>
      ${worldDone && nx ? `<p class="next-world">다음 모험: ${nx.emoji} <b>${nx.title}</b></p>` : ''}
      <div class="learn">${m.learn}</div>
      <div class="m-btns center">
        <button class="pill" data-close>🔬 더 놀래요</button>
        ${hasNext ? '<button class="pill go big shine" id="btn-next">다음 ▶</button>' : '<button class="pill go big" data-close>🏆 다 했어요!</button>'}
      </div>`;
    $('#btn-s-info').onclick = () => openParent(stageName(m), m.parent);
    $('#success-body').querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeModals));
    const nb = $('#btn-next'); if (nb) nb.onclick = () => { closeModals(); loadLevel(S.level + 1); };
    openModal('#success');
    speak((worldDone ? `우와! ${m.title} 열 개를 다 깼어요! ` + (m.say || '') : (m.say || '성공!')) + (hasNext ? ' 반짝이는 다음 버튼을 눌러요!' : ''));
    renderMission();
  }

  function openParent(title, html) {
    $('#parent-title').textContent = 'ⓘ 엄마 아빠 설명 · ' + title;
    $('#parent-body').innerHTML = (html || '') + '<h3>🧮 지금 판 위의 회로</h3>' + parentNoteHTML();
    $('#parent').classList.remove('hidden');
  }

  function confetti() {
    const colors = ['#ff6b6b', '#ffd43b', '#69db7c', '#4dabf7', '#da77f2', '#ffa94d'];
    for (let i = 0; i < 80; i++) {
      const d = document.createElement('div');
      d.className = 'confetti';
      d.style.left = Math.random() * 100 + 'vw';
      d.style.background = colors[i % colors.length];
      d.style.animationDelay = Math.random() * 0.6 + 's';
      d.style.animationDuration = 2 + Math.random() * 1.5 + 's';
      d.style.transform = `rotate(${Math.random() * 360}deg)`;
      document.body.appendChild(d);
      setTimeout(() => d.remove(), 4500);
    }
  }

  function unlocked(i) {
    const m = MISSIONS[i];
    return progress.unlockAll || i === 0 || (m && m.free) || progress.done.includes(i - 1) || progress.done.includes(i);
  }
  function renderMap() {
    $('#map-grid').innerHTML = WORLDS.map((w, wi) => {
      const ids = Array.from({ length: w.count }, (_, k) => w.first + k);
      const got = ids.filter(i => progress.done.includes(i)).length, open = ids.some(unlocked);
      const btns = ids.map(i => {
        const m = MISSIONS[i], done = progress.done.includes(i), op = unlocked(i);
        return `<button class="map-st${done ? ' done' : ''}${op ? '' : ' locked'}${i === S.level ? ' cur' : ''}" data-lv="${i}" ${op ? '' : 'disabled'}>${done ? '⭐' : op ? (m.free ? '🔬' : m.stage + 1) : '🔒'}</button>`;
      }).join('');
      return `<div class="map-world${open ? '' : ' locked'}"><div class="mw-head"><span class="mi-emoji">${open ? w.emoji : '🔒'}</span>
        <span class="mw-title">${w.count > 1 ? (wi + 1) + '. ' : ''}${w.title}</span>${w.count > 1 ? `<span class="mw-got">⭐ ${got}/${w.count}</span>` : ''}</div>
        <div class="mw-stages">${btns}</div></div>`;
    }).join('');
    $('#map-grid').querySelectorAll('[data-lv]').forEach(b => b.onclick = () => { closeModals(); loadLevel(+b.dataset.lv); });
  }

  /* ---------- 레벨 ---------- */
  /* ---------- 막혔을 때 도와주기 ---------- */
  let lastAct = performance.now(), lastNudge = 0;
  const IDLE_MS = 20000;      // 20초 동안 아무것도 안 하면
  const LONG_MS = 90000;      // 이것저것 해도 1분 30초 넘게 못 풀면
  const GAP_MS = 45000;       // 알려주는 간격
  window.addEventListener('pointerdown', e => { lastAct = performance.now(); if (!e.target.closest('#btn-hint, #fab-hint')) clearGuide(); }, true);

  function anyModalOpen() { return [...document.querySelectorAll('.modal')].some(m => !m.classList.contains('hidden')); }

  function nudge() {
    S.nudge = true; lastNudge = performance.now();
    const b = $('#btn-hint'); if (b) b.classList.add('nudge');
    $('#fab-hint').classList.add('nudge');
    toast('막혔나요? 오른쪽 아래 노란 💡도와줘 버튼을 눌러 봐요! 👉', 6000);
    speak('막혔나요? 오른쪽 아래에 반짝반짝 빛나는 노란 도와줘 버튼을 눌러 봐요!', true);
  }

  setInterval(() => {
    const m = mission();
    if (!m || m.check === null || S.succeeded || S.nudge || anyModalOpen() || drag) return;
    const now = performance.now();
    if (now - lastNudge < GAP_MS) return;
    if (now - lastAct > IDLE_MS || now - (S.levelStart || now) > LONG_MS * (1 + (S.hintCount || 0))) nudge();
  }, 2000);

  /* 다 만든 것 같은데 성공이 아니면: 5초 기다렸다가 무엇을 할지 손가락과 목소리로 알려줘요 */
  const AUTO_MS = 5000;
  let autoT = 0;
  function scheduleAutoHint(extra) {
    clearTimeout(autoT);
    const m = mission(), an = S.an;
    if (!m.check || S.succeeded || !S.comps.length || !an || an.status === 'short') return;
    const flowing = an.status === 'ok';
    const used = new Set(); for (const w of S.wires) { used.add(w.a.c + ':' + w.a.t); used.add(w.b.c + ':' + w.b.t); }
    const allWired = S.comps.every(c => used.has(c.id + ':0') && used.has(c.id + ':1'));
    if (!flowing && !allWired) return;
    autoT = setTimeout(function fire() {
      if (S.succeeded || mission() !== m) return;
      if (drag || anyModalOpen()) { autoT = setTimeout(fire, 1500); return; }
      const now = S.an;
      const why = now && now.status === 'ok'
        ? (S.litCount ? '불은 켜졌는데 아직 미션 성공이 아니에요!' : '전기는 흐르는데 아직 미션 성공이 아니에요!')
        : '전선은 다 이었는데 전기가 안 흘러요!';
      giveHint('🤔 ' + why);
    }, AUTO_MS + (extra || 0));
  }

  /** 지금 판 상태를 보고 알맞은 힌트 고르기 */
  function smartHint() {
    const m = mission(), an = S.an;
    if (an && an.status === 'short') return '앗, 합선이에요! 전지의 ＋와 −가 바로 이어진 전선을 콕 눌러서 지워요. 🔥';
    const parts = [];
    if (an && an.status === 'open' && an.hint) parts.push(an.hint);
    if (!parts.length || (S.hintCount || 0) >= 1) parts.push('💡 ' + m.hint);
    return parts.join('<br>');
  }

  /* ---------- 다음에 할 일 찾기: 가능한 행동을 미리 해 보고 가장 좋아지는 것을 골라요 ---------- */
  function simState(comps, wires, memo) {
    const sol = C.solve(comps, wires);
    const an = C.analyze(comps, wires, sol);
    const ctx = {
      comps, sol, an, memo, KINDS,
      I: c => sol.comp[c.id].I, A: c => Math.abs(sol.comp[c.id].I),
      of: k => comps.filter(c => c.kind === k),
      lit: () => comps.filter(c => c.kind === 'bulb' && !c.broken && Math.abs(sol.comp[c.id].I) > PHYS.LIT_A),
      name: c => C.displayName(c),
      push: c => C.supplyV(comps, wires, sol, c),
      wouldConduct: c => C.wouldConduct(comps, wires, c),
      toast: () => { }
    };
    const m = mission();
    let ok = false, done = 0;
    const short = an.status === 'short';
    const burn = comps.some(c => c.kind === 'bulb' && !c.broken && Math.abs(sol.comp[c.id].I) > PHYS.BURN_A);
    if (m.check && !short) {
      try { ok = !!m.check(ctx); } catch (e) { ok = false; }
      if (m.progress) try { done = m.progress(ctx).filter(x => x.done && !x.extra).length; } catch (e) { }
    }
    const lit = ctx.lit().length;
    const score = (ok ? 1000 : 0) + done * 100 + lit * 10 + (an.status === 'ok' ? 5 : 0) - (short ? 2000 : 0) - (burn ? 800 : 0);
    return { score, ok, short, burn };
  }

  function eul(word) {   // 받침 있으면 '을', 없으면 '를' (①은 '1번'으로 읽어서 '을')
    const ch = word.charCodeAt(word.length - 1);
    if (ch >= 0x2460 && ch <= 0x246E) return word + '을';
    if (ch >= 0xAC00 && ch <= 0xD7A3) return word + ((ch - 0xAC00) % 28 ? '을' : '를');
    return word + '을';
  }
  function termName(c, t) {
    if (c.kind === 'battery') return `${C.displayName(c)}의 ${t ? '＋' : '−'} 점`;
    const p = termPos(c, t), q = termPos(c, 1 - t);
    const side = Math.abs(p.x - q.x) >= Math.abs(p.y - q.y) ? (p.x < q.x ? '왼쪽' : '오른쪽') : (p.y < q.y ? '위쪽' : '아래쪽');
    return `${C.displayName(c)}의 ${side} 점`;
  }

  function candidateActions() {
    const acts = [];
    const terms = [];
    for (const c of S.comps) for (const t of [0, 1]) terms.push({ c: c.id, t });
    const has = (a, b) => S.wires.some(w => (w.a.c === a.c && w.a.t === a.t && w.b.c === b.c && w.b.t === b.t) || (w.a.c === b.c && w.a.t === b.t && w.b.c === a.c && w.b.t === a.t));
    for (let i = 0; i < terms.length; i++) for (let j = i + 1; j < terms.length; j++) {
      const a = terms[i], b = terms[j];
      if (a.c === b.c || has(a, b)) continue;   // 같은 부품 양쪽을 바로 잇는 건 빼요
      const pa = termPos(getComp(a.c), a.t), pb = termPos(getComp(b.c), b.t);
      acts.push({ type: 'wire', a, b, cost: Math.hypot(pa.x - pb.x, pa.y - pb.y) / 1000 });
    }
    for (const c of S.comps) if (c.kind === 'switch') acts.push({ type: 'toggle', id: c.id, cost: 0.2 });
    for (const c of S.comps) if (c.broken) acts.push({ type: 'fix', id: c.id, cost: 0 });
    for (const w of S.wires) acts.push({ type: 'unwire', id: w.id, cost: 0.5 });
    for (const c of S.comps) acts.push({ type: 'remove', id: c.id, cost: 0.6 });
    return acts;
  }

  function applyAct(st, act) {
    let comps = st.comps, wires = st.wires;
    if (act.type === 'wire') wires = wires.concat([{ id: -1 - wires.length, a: act.a, b: act.b }]);
    if (act.type === 'unwire') wires = wires.filter(w => w.id !== act.id);
    if (act.type === 'toggle') comps = comps.map(c => c.id === act.id ? Object.assign({}, c, { open: !c.open }) : c);
    if (act.type === 'fix') comps = comps.map(c => c.id === act.id ? Object.assign({}, c, { broken: false }) : c);
    if (act.type === 'remove') { comps = comps.filter(c => c.id !== act.id); wires = wires.filter(w => w.a.c !== act.id && w.b.c !== act.id); }
    return { comps, wires };
  }

  /** 잘못 들어간 재료 찾기: 전기가 안 통하는 물건, 설계보다 많은 재료, 거꾸로 이은 전지 */
  function wrongPart() {
    const m = mission(), design = m.design;
    const wired = c => S.wires.some(w => w.a.c === c.id || w.b.c === c.id);
    // 전기가 안 통하는 물건이 길을 막고 있어요
    for (const c of S.comps) {
      const k = KINDS[c.kind];
      if (k.cat === 'material' && !k.conductor && wired(c) && C.wouldConduct(S.comps, S.wires, c)) return { c, why: 'insulator' };
    }
    // 설계에 없는(또는 더 많은) 재료
    if (design) {
      const count = {};
      for (const c of S.comps) {
        const k = KINDS[c.kind];
        const key = k.cat === 'material' ? (k.conductor && design.MAT ? 'MAT' : '-') : c.kind;
        count[key] = (count[key] || 0) + 1;
        if (count[key] > (design[key] || 0) && wired(c)) return { c, why: 'extra' };
      }
    }
    // 거꾸로 이은 전지: 그 전지만 뒤집어 보면 회로가 좋아지는지 미리 계산해 봐요
    const bats = S.comps.filter(c => c.kind === 'battery' && wired(c));
    if (bats.length >= 2) {
      const memo = () => JSON.parse(JSON.stringify(S.memo || {}));
      const now = simState(S.comps, S.wires, memo()).score;
      for (const b of bats.slice().reverse()) {
        const fl = t => ({ c: t.c, t: t.c === b.id ? 1 - t.t : t.t });
        const ws = S.wires.map(w => ({ id: w.id, a: fl(w.a), b: fl(w.b) }));
        if (simState(S.comps, ws, memo()).score > now) return { c: b, why: 'reversed' };
      }
    }
    return null;
  }

  function planGuide() {
    const m = mission();
    const clone = () => JSON.parse(JSON.stringify(S.memo || {}));
    const base = { comps: S.comps.map(c => Object.assign({}, c)), wires: S.wires.slice() };
    const now = simState(base.comps, base.wires, clone()).score;

    // 1) 재료가 아예 부족하면 재료 상자부터
    const inv = m.inv, left = k => (inv[k] || 0) - S.comps.filter(c => c.kind === k).length;
    const anyMat = S.comps.some(c => KINDS[c.kind].cat === 'material');
    // 설계에 꼭 필요한데 아직 모자란 재료 (설계 정보가 없는 자유 실험실은 예전 방식)
    const design = m.design;
    const needs = k => {
      if (left(k) <= 0) return false;
      if (!design) return true;
      if (KINDS[k].cat === 'material') return !!design.MAT && !anyMat && KINDS[k].conductor;
      return (design[k] || 0) > S.comps.filter(c => c.kind === k).length;
    };
    const missing = ORDER.filter(k => needs(k) && !S.comps.some(c => c.kind === k));
    const needFirst = missing.find(k => KINDS[k].cat !== 'material') || (!anyMat && missing.find(k => KINDS[k].cat === 'material'));
    if (needFirst) return { type: 'palette', kind: needFirst };

    const acts = candidateActions();
    let best = null;
    const consider = (first, score, steps) => {
      const v = score - steps * 3 - first.cost;
      if (score > now && (!best || v > best.v)) best = { act: first, v, score, steps };
    };
    for (const a of acts) {
      const st1 = applyAct(base, a);
      const r1 = simState(st1.comps, st1.wires, clone());
      consider(a, r1.score, 1);
      if (r1.ok) continue;
      if (acts.length > 45 || r1.short) continue;   // 너무 많으면 두 걸음 앞은 생략
      for (const b of acts) {
        if (b === a || (b.type === a.type && b.id != null && b.id === a.id)) continue;
        if (b.type === 'wire' && a.type === 'remove' && (b.a.c === a.id || b.b.c === a.id)) continue;
        const st2 = applyAct(st1, b);
        const r2 = simState(st2.comps, st2.wires, clone());
        if (r2.score > now) consider(a, r2.score - 1, 2);
      }
    }
    const shortNow = S.an && S.an.status === 'short';
    const bad = wrongPart();
    // 잘못 들어간 재료가 있으면 돌아가는 길보다 그것부터 고쳐요 (합선만 먼저)
    if (bad && !shortNow) return { type: 'remove', id: bad.c.id, why: bad.why };
    const fine = a => a.type === 'wire' || a.type === 'toggle' || a.type === 'fix' ||
      best.score >= 1000 || shortNow || (a.type === 'remove' && bad && bad.c.id === a.id);
    if (best && fine(best.act)) return withWhy(best.act, bad);

    // 2) 잘못 들어간 재료가 있으면 그것부터 치워요
    if (bad) return { type: 'remove', id: bad.c.id, why: bad.why };

    // 3) 지금 재료로 안 되면, 남은 재료를 꺼내요
    const k = ORDER.find(needs);
    if (k) return { type: 'palette', kind: k };
    return best ? withWhy(best.act, bad) : null;
  }

  function withWhy(act, bad) {
    if (act.type === 'remove') return Object.assign({}, act, { why: bad && bad.c.id === act.id ? bad.why : 'extra' });
    return act;
  }

  /* ---------- 손가락 안내 그리기 ---------- */
  let guideTimer = null;
  // 판 밖(재료 상자)까지 손이 부품을 끌고 가는 모습
  function flyHand(c) {
    const r = svg.getScreenCTM(), pr = palette.getBoundingClientRect();
    const el = document.createElement('div');
    el.className = 'guide-fly';
    el.innerHTML = '<span>✋</span>';
    el.style.setProperty('--x0', (c.x * r.a + r.e) + 'px'); el.style.setProperty('--y0', (c.y * r.d + r.f) + 'px');
    el.style.setProperty('--x1', (pr.left + pr.width / 2) + 'px'); el.style.setProperty('--y1', (pr.top + pr.height / 2) + 'px');
    document.body.appendChild(el);
    palette.classList.add('guide-drop');
  }
  function clearGuide() {
    L.guide.innerHTML = '';
    document.querySelectorAll('.guide-fly').forEach(el => el.remove());
    palette.classList.remove('guide-drop');
    document.querySelectorAll('.pal-item.guide, .pal-item.dim').forEach(el => el.classList.remove('guide', 'dim'));
    clearTimeout(guideTimer);
  }
  // 눌러야 할 바로 그 자리에서 번쩍번쩍 (퍼지는 고리 + 반짝이는 별)
  function burst(x, y, delay = 0, big = false) {
    const r0 = big ? 30 : 14, r1 = big ? 78 : 50;
    const ring = d => `<circle class="burst-ring" r="${r0}"><animate attributeName="r" values="${r0};${r1}" dur="1s" begin="${d}s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;0" dur="1s" begin="${d}s" repeatCount="indefinite"/></circle>`;
    return `<g class="burst" transform="translate(${x} ${y})" style="animation-delay:${delay}s">${ring(delay)}${ring(delay + 0.5)}
      ${big ? '' : `<circle class="burst-core" r="17" style="animation-delay:${delay}s"/>`}
      <text class="burst-star" x="${big ? 40 : 18}" y="${big ? -34 : -16}" style="animation-delay:${delay}s">✨</text></g>`;
  }
  function showGuide(g) {
    clearGuide();
    let html = '', say = '';
    const hand = (path, dur) => `<text class="guide-hand" font-size="46">👆<animateMotion dur="${dur}s" repeatCount="indefinite" path="${path}"/></text>`;
    if (g.type === 'wire') {
      const ca = getComp(g.a.c), cb = getComp(g.b.c);
      const pa = termPos(ca, g.a.t), pb = termPos(cb, g.b.t);
      const d = bez(pa, pa.n, pb, pb.n).d;
      html += `<path class="guide-line" d="${d}"/>`;
      html += burst(pa.x, pa.y, 0) + burst(pb.x, pb.y, 0.8);
      html += `<text class="guide-num" x="${pa.x}" y="${pa.y - 30}">①</text><text class="guide-num" x="${pb.x}" y="${pb.y - 30}">②</text>`;
      html += `<g transform="translate(-14 40)">${hand(d, 2.2)}</g>`;
      say = `반짝이는 ① ${eul(termName(ca, g.a.t))} 꾹 누르고, ② ${termName(cb, g.b.t)}까지 쭉~ 끌어요!`;
    } else if (g.type === 'toggle' || g.type === 'fix') {
      const c = getComp(g.id);
      html += `<circle class="guide-ring" cx="${c.x}" cy="${c.y}" r="46"/>` + burst(c.x, c.y, 0, true);
      html += `<g transform="translate(${c.x - 14} ${c.y + 46})"><text class="guide-hand tap" font-size="46">👆</text></g>`;
      say = g.type === 'fix' ? `반짝이는 ${eul(C.displayName(c))} 콕 눌러서 새 ${c.kind === 'battery' ? '전지' : '전구'}로 바꿔요!` : `반짝이는 ${eul(C.displayName(c))} 콕 눌러 봐요! (지금은 ${c.open ? '꺼짐' : '켜짐'})`;
    } else if (g.type === 'unwire') {
      const w = S.wires.find(x => x.id === g.id), geo = w && wireGeom(w);
      if (geo) {
        html += `<path class="guide-badwire" d="${geo.d}"/>`;
        html += `<text class="guide-spark" x="${geo.mid.x - 40}" y="${geo.mid.y - 20}">✨</text><text class="guide-spark b" x="${geo.mid.x + 24}" y="${geo.mid.y - 26}">✨</text>`;
        html += burst(geo.mid.x, geo.mid.y, 0);
        html += `<g transform="translate(${geo.mid.x - 14} ${geo.mid.y + 34})"><text class="guide-hand tap" font-size="46">👆</text></g>`;
      }
      say = S.an && S.an.status === 'short' ? '앗 뜨거워요! 반짝이는 전선을 콕 눌러서 지워요.' : '반짝이는 전선을 콕 눌러서 지워 봐요.';
    } else if (g.type === 'remove') {
      const c = getComp(g.id), name = C.displayName(c);
      html += `<circle class="guide-ring bad" cx="${c.x}" cy="${c.y}" r="58"/>` + burst(c.x, c.y, 0, true);
      html += `<text class="guide-spark" x="${c.x - 62}" y="${c.y - 40}">✨</text><text class="guide-spark b" x="${c.x + 44}" y="${c.y - 46}">✨</text><text class="guide-spark" x="${c.x + 40}" y="${c.y + 58}">✨</text>`;
      html += `<text class="guide-no" x="${c.x}" y="${c.y - 64}">${g.why === 'reversed' ? '🙃' : '🚫'}</text>`;
      html += `<path class="guide-line" d="M${c.x - 60} ${c.y} L12 ${c.y}"/><text class="guide-num" x="40" y="${c.y - 18}">⬅</text>`;
      flyHand(c);
      const jong = w => { if (/[①-⑮]$/.test(w)) return true; /* ②는 '2번'으로 읽어요 */ const ch = w.charCodeAt(w.length - 1); return ch >= 0xac00 && ch <= 0xd7a3 && (ch - 0xac00) % 28 > 0; };
      const what = g.why === 'insulator' ? `반짝이는 ${KINDS[c.kind].topic} 전기가 안 통해요!`
        : g.why === 'reversed' ? `반짝이는 ${name}${jong(name) ? '이' : '가'} 거꾸로 이어졌어요!`
        : `반짝이는 ${name}${jong(name) ? '은' : '는'} 지금 필요 없어요!`;
      say = `${what} ${eul(name)} 꾹 잡고, 왼쪽 재료 상자로 쭉~ 끌어다 놓아요.` + (g.why === 'reversed' ? ' 그다음 다시 꺼내서 ＋는 −에 이어요.' : '');
    } else if (g.type === 'next') {
      const b = document.querySelector('#success:not(.hidden) #btn-next') || $('#btn-next2');
      if (b) { b.classList.remove('shine'); void b.offsetWidth; b.classList.add('shine'); b.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
      say = '다 맞췄어요! 반짝이는 초록 「다음 ▶」 버튼을 콕 눌러요!';
    } else if (g.type === 'palette') {
      const el = document.querySelector(`.pal-item[data-kind="${g.kind}"]`);
      if (el) { el.classList.add('guide'); el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
      document.querySelectorAll('.pal-item').forEach(x => { if (x !== el) x.classList.add('dim'); });
      html += `<g transform="translate(-14 40)">${hand('M60 320 L420 320', 1.8)}</g>`;
      say = `왼쪽 재료 상자에서 반짝이는 ${eul(KINDS[g.kind].name)} 꾹 잡고, 판 위로 쭉~ 끌어와요!`;
    }
    L.guide.innerHTML = html;
    guideTimer = setTimeout(clearGuide, 15000);
    return say;
  }

  function giveHint(why) {
    S.nudge = false; lastNudge = performance.now(); lastAct = performance.now();
    S.hintCount = (S.hintCount || 0) + 1;
    let plan = null;
    if (S.succeeded && S.level < MISSIONS.length - 1) plan = { type: 'next' };
    else try { if (mission().check) plan = planGuide(); } catch (e) { plan = null; }
    S.hintShown = (typeof why === 'string' ? why + '<br>' : '') + (plan ? '👆 ' + showGuide(plan) : smartHint());
    S.chain = plan && plan.type !== 'next' ? 3 : 0;     // 아이가 따라 하면 다음 걸음도 이어서 알려줘요
    const b = $('#btn-hint'); if (b) b.classList.remove('nudge');
    $('#fab-hint').classList.remove('nudge');
    const box = $('#hint-box');
    box.innerHTML = S.hintShown; box.classList.remove('hidden');
    box.classList.remove('flash'); void box.offsetWidth; box.classList.add('flash');
    speak(S.hintShown, true);
    // 콕 집어 알려줄 게 없을 때만 연결할 점들을 다 반짝이게
    if (!plan) L.terms.querySelectorAll('.term').forEach(t => { t.classList.add('pulse'); });
  }

  function loadLevel(i) {
    S.level = clamp(i, 0, MISSIONS.length - 1);
    progress.level = S.level; save();
    S.comps = []; S.wires = []; S.sel = null; S.selWire = null; S.memo = {}; S.succeeded = false;
    S.litCount = 0; S.litSet = null; S.night = false; S.nightShow = null; S.wasShort = false; if (L.fx) L.fx.innerHTML = ''; syncNight(); S.colorIdx = 0;
    S.nudge = false; S.hintShown = ''; S.hintCount = 0; S.chain = 0; S.successTok = null; S.cheered = false; heatClear(); S.wasFlowing = false; wave = null; S.lastKeys = null; S.levelStart = performance.now(); lastAct = performance.now(); lastNudge = 0;
    const m = mission();
    const made = ((m.preset && m.preset.comps) || []).map(p => {
      const ex = { rot: p.rot || 0 };
      if (p.open != null) ex.open = p.open;
      return addComp(p.kind, p.x, p.y, ex);
    });
    for (const w of (m.preset && m.preset.wires) || []) addWire({ c: made[w[0]].id, t: w[1] }, { c: made[w[2]].id, t: w[3] });
    S.ghost = (m.ghost || []).map(w => ({ a: { c: made[w[0]].id, t: w[1] }, b: { c: made[w[2]].id, t: w[3] } }));
    renderPalette();
    recompute();
    speak(m.story);
  }

  /* ---------- 위쪽 버튼 ---------- */
  function syncToggles() {
    $('#btn-electron').textContent = settings.electron ? '🔵 알갱이 = 전자 (−→＋)' : '🟡 알갱이 = 전류 방향 (＋→−)';
    $('#btn-numbers').classList.toggle('on', settings.numbers);
    $('#btn-sound').classList.toggle('on', settings.sound);
    $('#btn-voice').classList.toggle('on', settings.voice);
    $('#btn-electron').classList.toggle('on', settings.electron);
  }
  $('#btn-electron').onclick = () => { settings.electron = !settings.electron; save(); syncToggles(); renderBoard(); renderNote(); toast(settings.electron ? '파란 알갱이 = 전자 (−에서 ＋로 움직여요)' : '노란 알갱이 = 교과서의 전류 방향 (＋에서 −로)'); };
  $('#btn-numbers').onclick = () => { settings.numbers = !settings.numbers; save(); syncToggles(); renderBoard(); renderNote(); renderBars(); };
  $('#btn-sound').onclick = () => { settings.sound = !settings.sound; save(); syncToggles(); };
  $('#btn-voice').onclick = () => {
    settings.voice = !settings.voice; save(); syncToggles();
    if (!settings.voice && 'speechSynthesis' in window) speechSynthesis.cancel();
    toast(settings.voice ? '🗣️ 읽어주기 켰어요' : '🔇 읽어주기 껐어요');
    if (settings.voice) speak('읽어주기를 켰어요!');
  };
  $('#btn-reset').onclick = () => loadLevel(S.level);
  $('#fab-hint').onclick = () => { audio(); giveHint(); };
  $('#btn-map').onclick = () => { renderMap(); openModal('#map'); };
  $('#btn-info').onclick = () => openModal('#info');
  $('#btn-voice-test').onclick = () => {
    audio();
    if (!settings.voice) { settings.voice = true; save(); syncToggles(); }
    TTS.err = '';
    speak('안녕! 목소리가 잘 들리나요? 전기 놀이를 시작해요!', true);
    const box = $('#voice-diag');
    box.innerHTML = voiceDiag(); box.classList.remove('hidden');
    setTimeout(() => { box.innerHTML = voiceDiag(); }, 1500);
  };
  $('#btn-unlock').onclick = () => { progress.unlockAll = true; save(); renderMap(); };
  $('#btn-start').onclick = () => {
    audio();
    $('#start').classList.add('hidden');
    loadLevel(unlocked(progress.level || 0) ? (progress.level || 0) : 0);
  };
  /* ---------- 처음부터 하기 ----------
   * 진행 기록은 서버가 아니라 이 브라우저(localStorage)에 저장돼요. 그래서 새로고침해도 이어서 해요.
   * 실수로 지우지 않게 두 번 눌러야 지워져요. (소리·읽어주기 같은 설정은 그대로) */
  function armRestart(btn, onDone) {
    let armed = false, t = null;
    const label = btn.textContent;
    btn.onclick = () => {
      audio();
      if (!armed) {
        armed = true; btn.classList.add('armed');
        btn.textContent = '⚠️ 정말요? 한 번 더 누르면 ⭐가 다 지워져요';
        speak('정말 처음부터 할까요? 한 번 더 누르면 별이 다 지워져요.');
        clearTimeout(t); t = setTimeout(() => { armed = false; btn.textContent = label; btn.classList.remove('armed'); }, 4000);
        return;
      }
      clearTimeout(t); armed = false; btn.textContent = label; btn.classList.remove('armed');
      progress.done = []; progress.unlockAll = false; progress.level = 0; save();
      onDone();
    };
  }
  armRestart($('#btn-restart'), () => { $('#start').classList.add('hidden'); loadLevel(0); toast('🔄 처음부터 시작해요! 1-1'); });
  armRestart($('#btn-restart2'), () => { closeModals(); loadLevel(0); toast('🔄 처음부터 시작해요! 1-1'); });
  // 시작 화면: 하던 게 있으면 "이어서 하기"와 "처음부터 하기"를 같이 보여줘요
  if (progress.done.length || progress.level) {
    const m = MISSIONS[progress.level] || MISSIONS[0];
    $('#btn-start').textContent = `▶ 이어서 하기 (${m.free ? m.title : m.label})`;
    $('#btn-restart').classList.remove('hidden');
  }
  if ('speechSynthesis' in window) speechSynthesis.getVoices();

  syncToggles();
  S.level = progress.level || 0;
  renderPalette(); recompute();
  requestAnimationFrame(tick);
})();
