/* 꼬마 전기 실험실 - 화면, 드래그, 애니메이션 */
(function () {
  'use strict';
  const C = window.Circuit, KINDS = C.KINDS, PHYS = C.PHYS, MISSIONS = window.MISSIONS, fmt = C.fmt;
  const $ = s => document.querySelector(s);
  const svg = $('#board');
  const L = {
    wires: $('#l-wires'), flow: $('#l-flow'), comps: $('#l-comps'),
    labels: $('#l-labels'), terms: $('#l-terms'), ui: $('#l-ui'), wave: $('#l-wave')
  };
  const dragPath = $('#drag-wire');
  const GRID = 20, BW = 1000, BH = 640;
  const WIRE_COLORS = ['#e03131', '#1c7ed6', '#2f9e44', '#f08c00', '#9c36b5', '#0c8599'];
  const SPEED = 110;           // 전류 1A 일 때 점이 움직이는 속도 (px/초)
  const STORE = 'kkoma-circuit-v1';
  const ORDER = ['battery', 'bulb', 'switch', 'motor', 'resistor', 'clip', 'coin', 'eraser', 'chopstick', 'pencil'];

  /* ---------- 저장 ---------- */
  let progress = { done: [], unlockAll: false, level: 0 };
  let settings = { numbers: true, electron: true, sound: true, voice: true };
  try {
    const s = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (s) { Object.assign(progress, s.progress || {}); Object.assign(settings, s.settings || {}); }
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
  function speak(text, force) {
    if ((!settings.voice && !force) || !('speechSynthesis' in window)) return;
    try {
      speechSynthesis.cancel();
      const clean = text.replace(/<[^>]+>/g, ' ').replace(/\p{Extended_Pictographic}/gu, '')
        .replace(/(\d)\.(\d)V/g, '$1점$2볼트').replace(/(\d)V/g, '$1볼트')
        .replace(/(\d)\.(\d+)A/g, '$1점$2암페어').replace(/(\d)A/g, '$1암페어').replace(/(\d)Ω/g, '$1옴')
        .replace(/＋/g, '플러스 ').replace(/−/g, '마이너스 ');
      const u = new SpeechSynthesisUtterance(clean);
      u.lang = 'ko-KR'; u.rate = 0.95; u.pitch = 1.1;
      const v = speechSynthesis.getVoices().find(v => v.lang && v.lang.toLowerCase().startsWith('ko'));
      if (v) u.voice = v;
      speechSynthesis.speak(u);
    } catch (e) { }
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

  /* ---------- 부품 그림 (가로 방향, 가운데가 0,0) ---------- */
  function compInner(c, o) {
    const k = c.kind;
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
        <text x="-8" y="5" class="bat-v">1.5V</text>
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
        ${c.broken ? '<text x="26" y="-62" class="emo small">💥</text>' : ''}`;
    }
    if (k === 'motor') {
      return `
        <rect class="hit" x="-56" y="-92" width="112" height="108"/>
        <rect x="-46" y="-9" width="92" height="18" rx="8" fill="#b08968" stroke="#7f5539" stroke-width="2"/>
        <path d="M-40 0 L-16 -14 M40 0 L16 -14" stroke="#adb5bd" stroke-width="3"/>
        <rect x="-22" y="-46" width="44" height="38" rx="10" fill="#adb5bd" stroke="#495057" stroke-width="2.5"/>
        <text x="0" y="-20" class="motor-m">M</text>
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
        </g>`;
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
        <text x="0" y="30" class="res-v">3Ω</text>`;
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
      fl.push({ key: 'j' + cid + '_' + t, d: fwd ? `M${p.x} ${p.y} L${q.x} ${q.y}` : `M${q.x} ${q.y} L${p.x} ${p.y}`,
        from: fwd ? k : k + '*', to: fwd ? k + '*' : k, A: Math.abs(net) });
    }
    for (const w of S.wires) {
      const g = wireGeom(w, deg); if (!g) continue;
      connected.add(w.a.c + ':' + w.a.t); connected.add(w.b.c + ':' + w.b.t);
      const sel = S.selWire === w.id;
      wHtml += `<path class="wire-hit" data-wid="${w.id}" d="${g.d}"/>`;
      wHtml += `<path class="wire${sel ? ' sel' : ''}" d="${g.d}" stroke="${w.color}"/><path class="hose-in" d="${g.d}"/>`;
      const I = S.sol ? (S.sol.wire[w.id] || 0) : 0;
      const fwd = I * dir >= 0, ka = w.a.c + ':' + w.a.t + (g.ja ? '*' : ''), kb = w.b.c + ':' + w.b.t + (g.jb ? '*' : '');
      fl.push({ key: 'w' + w.id, d: fwd ? g.d : g.rd, from: fwd ? ka : kb, to: fwd ? kb : ka, A: Math.abs(I) });
      if (sel) uHtml += btn(g.mid.x, g.mid.y, '✖', 'delwire', '#fa5252');
    }

    for (const c of S.comps) {
      const o = compInfo(c);
      const sel = S.sel === c.id;
      cHtml += `<g class="comp${sel ? ' sel' : ''}" data-cid="${c.id}" transform="translate(${c.x} ${c.y}) rotate(${c.rot})">${compInner(c, o)}</g>`;
      // 부품 속 알갱이 (금속 부품만. 지우개·나무·열린 스위치·끊어진 전구에는 움직일 알갱이 길이 없어요)
      if (c.kind === 'battery' || isFinite(C.resistanceOf(c))) {
        const p0 = termPos(c, 0), p1 = termPos(c, 1), fwd = o.I * dir >= 0;
        const a = fwd ? p0 : p1, b = fwd ? p1 : p0;
        fl.push({ key: 'c' + c.id, cid: c.id, d: `M${a.x} ${a.y} L${b.x} ${b.y}`, from: c.id + ':' + (fwd ? 0 : 1), to: c.id + ':' + (fwd ? 1 : 0), A: o.A });
      }
      lHtml += labelSVG(c, o);
      for (const t of [0, 1]) {
        const p = termPos(c, t), on = connected.has(c.id + ':' + t);
        const pulse = !S.wires.length || (S.level === 0 && !on);
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
    lights = [...L.comps.querySelectorAll('[data-light]')];
    if (wave) { prepareWave(); applyWave(); }
    fans = [...L.comps.querySelectorAll('[data-fan]')].map(el => ({ el, id: +el.dataset.fan, I: compInfo(getComp(+el.dataset.fan)).A }));
  }

  function btn(x, y, label, action, color) {
    return `<g class="ui-btn" data-action="${action}" transform="translate(${x} ${y})"><circle r="19" fill="#fff" stroke="${color}" stroke-width="3"/><text y="7">${label}</text></g>`;
  }

  function labelSVG(c, o) {
    const k = KINDS[c.kind];
    const name = C.displayName(c);
    let val = '', cls = 'val';
    if (c.kind === 'battery') { val = o.short ? '🔥 뜨거워요!' : (settings.numbers ? '1.5V' + (o.A > PHYS.ACTIVE_A ? ` · ${fmt(o.A)}A` : '') : ''); if (o.short) cls += ' danger'; }
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
        if (flowing) { waveDur = 4; afterWave = () => setTimeout(showSuccess, 1600); }
        else setTimeout(showSuccess, 900);
      }
    }
    if (!waveDur && flowing && !S.wasFlowing) waveDur = 2.6;   // 새로 이어졌을 때
    S.wasFlowing = flowing;
    if (!waveDur && lit > S.litCount) sfx.light();
    S.litCount = lit;
    if (!flowing) { wave = null; L.wave.innerHTML = ''; }
    renderBoard(); renderNote(); renderBars(); renderMission();
    if (waveDur) startWave(waveDur, afterWave);
    S.lastKeys = null;
  }

  /* ---------- 오른쪽 패널 ---------- */
  function renderMission() {
    const m = mission();
    const ctx = ctxFor();
    let items = m.progress ? m.progress(ctx) : [{ text: m.goal, done: S.succeeded }];
    if (m.check === null) items = [];
    const done = progress.done.includes(S.level);
    const stars = MISSIONS.map((_, i) => `<span class="dot${progress.done.includes(i) ? ' got' : ''}${i === S.level ? ' cur' : ''}">${progress.done.includes(i) ? '⭐' : i + 1}</span>`).join('');
    $('#mission').innerHTML = `
      <button class="info-i" id="btn-m-info" title="엄마 아빠 설명">i</button>
      <div class="m-dots">${stars}</div>
      <div class="m-head"><span class="m-emoji">${m.emoji}</span><h2>${m.title}${done ? ' ⭐' : ''}</h2></div>
      <p class="m-story">${m.story}</p>
      ${items.length ? `<ul class="m-goals">${items.map(g => `<li class="${g.done ? 'done' : ''}${g.extra ? ' extra' : ''}">${g.done ? '✅' : '⭐'} ${g.text}</li>`).join('')}</ul>` : ''}
      <div class="m-btns">
        <button class="pill" id="btn-say">🔊 들려줘</button>
        <button class="pill${S.nudge ? ' nudge' : ''}" id="btn-hint">💡 도와줘</button>
        ${S.succeeded && S.level < MISSIONS.length - 1 ? '<button class="pill go" id="btn-next2">다음 ▶</button>' : ''}
      </div>
      <div class="m-hint${S.hintShown ? '' : ' hidden'}" id="hint-box">${S.hintShown || ''}</div>`;
    $('#btn-say').onclick = () => speak(m.story);
    $('#btn-hint').onclick = giveHint;
    $('#btn-m-info').onclick = () => openParent(`미션 ${S.level + 1}. ${m.title}`, m.parent);
    const n2 = $('#btn-next2'); if (n2) n2.onclick = () => loadLevel(S.level + 1);
    $('#level-title').textContent = `${S.level + 1}. ${m.title}`;
  }

  function renderNote() {
    const an = S.an, el = $('#note');
    if (an.status === 'short') {
      el.innerHTML = `<div class="warn-box"><div class="big-emo">🔥😱</div><b>앗, 뜨거워요! (합선)</b><br>전기가 전구로 안 가고 지름길로 몰려가요.<br>진짜 전지로 하면 <b>위험해요!</b><br>전선을 콕 눌러서 지워요.</div>`;
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
    h += '<p class="water-note">🔵 전선 속에는 전자 알갱이가 꽉 차 있어요. 길이 이어지면 다 같이 움직여요. 빠를수록 전기가 세요!</p>';
    el.innerHTML = h;
  }

  /** 엄마 아빠용 자세한 계산 (ⓘ) */
  function parentNoteHTML() {
    const an = S.an;
    let h = '';
    if (!an || an.status === 'open') h += '<p>지금은 회로가 닫혀 있지 않아 전류가 <b>0A</b>입니다. 전지 (＋)극에서 부하(전구 등)를 거쳐 (−)극으로 돌아오는 닫힌 경로가 필요합니다.</p>';
    else if (an.status === 'short') h += '<p><b>합선(단락)</b>: 전지의 두 극이 저항이 거의 없는 경로로 직접 이어진 상태입니다. 이론상 매우 큰 전류가 흘러 실제 전지·전선이 발열하며 위험합니다. 이때 전구 쪽에는 전압이 거의 걸리지 않아 꺼집니다.</p>';
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
  function renderPalette() {
    const inv = mission().inv;
    const kinds = ORDER.filter(k => inv[k]);
    $('#pal-items').innerHTML = kinds.map(k => {
      const left = inv[k] - countOnBoard(k);
      const fake = { id: 0, kind: k, rot: 0, open: k === 'switch', num: 1 };
      return `<div class="pal-item${left <= 0 ? ' empty' : ''}" data-kind="${k}">
        <svg viewBox="-66 -96 132 118" class="pal-svg">${compInner(fake, { b: 0 })}</svg>
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
    if (w) { S.selWire = +w.dataset.wid; S.sel = null; sfx.click(); renderBoard(); return; }
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
        if (c && c.kind === 'bulb' && Math.abs(S.sol.comp[c.id].I) > PHYS.LIT_A) sfx.light();
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

  function showSuccess() {
    const m = mission();
    sfx.success();
    confetti();
    const hasNext = S.level < MISSIONS.length - 1;
    $('#success-body').innerHTML = `<button class="info-i" id="btn-s-info" title="엄마 아빠 설명">i</button>
      <div class="succ-emoji">🎉</div><h2>잘했어요!</h2><div class="learn">${m.learn}</div>
      <div class="m-btns center">
        <button class="pill" data-close>🔬 더 놀래요</button>
        ${hasNext ? '<button class="pill go big" id="btn-next">다음 ▶</button>' : '<button class="pill go big" data-close>🏆 다 했어요!</button>'}
      </div>`;
    $('#btn-s-info').onclick = () => openParent(`미션 ${S.level + 1}. ${m.title}`, m.parent);
    $('#success-body').querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeModals));
    const nb = $('#btn-next'); if (nb) nb.onclick = () => { closeModals(); loadLevel(S.level + 1); };
    openModal('#success');
    speak(m.say || '성공!');
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

  function unlocked(i) { return progress.unlockAll || i === 0 || progress.done.includes(i - 1) || progress.done.includes(i); }
  function renderMap() {
    $('#map-grid').innerHTML = MISSIONS.map((m, i) => {
      const done = progress.done.includes(i), open = unlocked(i);
      return `<button class="map-item${done ? ' done' : ''}${open ? '' : ' locked'}${i === S.level ? ' cur' : ''}" data-lv="${i}" ${open ? '' : 'disabled'}>
        <span class="mi-emoji">${open ? m.emoji : '🔒'}</span><span class="mi-no">${i + 1}</span><span class="mi-title">${m.title}</span>${done ? '<span class="mi-star">⭐</span>' : ''}</button>`;
    }).join('');
    $('#map-grid').querySelectorAll('[data-lv]').forEach(b => b.onclick = () => { closeModals(); loadLevel(+b.dataset.lv); });
  }

  /* ---------- 레벨 ---------- */
  /* ---------- 막혔을 때 도와주기 ---------- */
  let lastAct = performance.now(), lastNudge = 0;
  const IDLE_MS = 20000;      // 20초 동안 아무것도 안 하면
  const LONG_MS = 90000;      // 이것저것 해도 1분 30초 넘게 못 풀면
  const GAP_MS = 45000;       // 알려주는 간격
  window.addEventListener('pointerdown', () => { lastAct = performance.now(); }, true);

  function anyModalOpen() { return [...document.querySelectorAll('.modal')].some(m => !m.classList.contains('hidden')); }

  function nudge() {
    S.nudge = true; lastNudge = performance.now();
    const b = $('#btn-hint'); if (b) b.classList.add('nudge');
    toast('막혔나요? 반짝이는 💡도와줘 버튼을 눌러 봐요! 👉', 6000);
    speak('막혔나요? 반짝반짝 빛나는 도와줘 버튼을 눌러 봐요!', true);
  }

  setInterval(() => {
    const m = mission();
    if (!m || m.check === null || S.succeeded || S.nudge || anyModalOpen() || drag) return;
    const now = performance.now();
    if (now - lastNudge < GAP_MS) return;
    if (now - lastAct > IDLE_MS || now - (S.levelStart || now) > LONG_MS * (1 + (S.hintCount || 0))) nudge();
  }, 2000);

  /** 지금 판 상태를 보고 알맞은 힌트 고르기 */
  function smartHint() {
    const m = mission(), an = S.an;
    if (an && an.status === 'short') return '앗, 합선이에요! 전지의 ＋와 −가 바로 이어진 전선을 콕 눌러서 지워요. 🔥';
    const parts = [];
    if (an && an.status === 'open' && an.hint) parts.push(an.hint);
    if (!parts.length || (S.hintCount || 0) >= 1) parts.push('💡 ' + m.hint);
    return parts.join('<br>');
  }

  function giveHint() {
    S.nudge = false; lastNudge = performance.now(); lastAct = performance.now();
    S.hintCount = (S.hintCount || 0) + 1;
    S.hintShown = smartHint();
    const b = $('#btn-hint'); if (b) b.classList.remove('nudge');
    const box = $('#hint-box');
    box.innerHTML = S.hintShown; box.classList.remove('hidden');
    box.classList.remove('flash'); void box.offsetWidth; box.classList.add('flash');
    speak(S.hintShown, true);
    // 연결할 점들을 반짝이게
    L.terms.querySelectorAll('.term').forEach(t => { t.classList.add('pulse'); });
  }

  function loadLevel(i) {
    S.level = clamp(i, 0, MISSIONS.length - 1);
    progress.level = S.level; save();
    S.comps = []; S.wires = []; S.sel = null; S.selWire = null; S.memo = {}; S.succeeded = false;
    S.litCount = 0; S.wasShort = false; S.colorIdx = 0;
    S.nudge = false; S.hintShown = ''; S.hintCount = 0; S.wasFlowing = false; wave = null; S.lastKeys = null; S.levelStart = performance.now(); lastAct = performance.now(); lastNudge = 0;
    const m = mission();
    const made = ((m.preset && m.preset.comps) || []).map(p => addComp(p.kind, p.x, p.y, { rot: p.rot || 0 }));
    for (const w of (m.preset && m.preset.wires) || []) addWire({ c: made[w[0]].id, t: w[1] }, { c: made[w[2]].id, t: w[3] });
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
  $('#btn-voice').onclick = () => { settings.voice = !settings.voice; save(); syncToggles(); if (!settings.voice && 'speechSynthesis' in window) speechSynthesis.cancel(); };
  $('#btn-reset').onclick = () => loadLevel(S.level);
  $('#btn-map').onclick = () => { renderMap(); openModal('#map'); };
  $('#btn-info').onclick = () => openModal('#info');
  $('#btn-unlock').onclick = () => { progress.unlockAll = true; save(); renderMap(); };
  $('#btn-start').onclick = () => {
    audio();
    $('#start').classList.add('hidden');
    loadLevel(unlocked(progress.level || 0) ? (progress.level || 0) : 0);
  };
  if ('speechSynthesis' in window) speechSynthesis.getVoices();

  syncToggles();
  S.level = progress.level || 0;
  renderPalette(); recompute();
  requestAnimationFrame(tick);
})();
