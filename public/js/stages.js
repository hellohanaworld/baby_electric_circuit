/* 꼬마 전기 실험실 - 스테이지 만들기
 * 월드(missions.js 의 주제) 하나마다 스테이지 10개 (1-1 … 1-10).
 * 처음엔 거의 다 만들어 둔 회로에 전선 하나만 이으면 되고, 갈수록 직접 하는 일이 조금씩 늘어나요.
 *   X-1      : 재료 + 전선이 다 있고 하나만 빠짐 (점선으로 어디를 이을지 보여줌)
 *   X-2, X-3 : 전선 하나가 빠짐 (모양이 바뀌거나 거울처럼 뒤집힘)
 *   X-4, X-5 : 전선 2개가 빠짐
 *   X-6      : 재료만 있고 전선은 없음
 *   X-7      : 재료 하나는 재료 상자에서 꺼내야 함
 *   X-8      : 전지만 놓여 있음
 *   X-9      : 빈 판에서 다 만들기
 *   X-10     : 빈 판 + 필요 없는 재료가 섞여 있음
 */
(function (global) {
  'use strict';
  const BASE = global.WORLD_BASE;

  // 레이아웃: comps = [종류, x, y, {추가}], wires = [부품i, 단자, 부품j, 단자]  (전지 단자 1 = ＋)
  const W = [
    { // 1 불을 켜요
      act: '전구에 불을 켜요!',
      layouts: [
        { comps: [['battery', 500, 480], ['bulb', 500, 240]], wires: [[0, 1, 1, 1], [1, 0, 0, 0]] },
        { comps: [['battery', 300, 440], ['bulb', 680, 260]], wires: [[0, 1, 1, 1], [1, 0, 0, 0]] }
      ],
      extra: { eraser: 1, chopstick: 1 }
    },
    { // 2 스위치
      act: '불이 켜지면 스위치를 콕 눌러서 꺼 봐요!',
      layouts: [
        { comps: [['battery', 500, 500], ['bulb', 680, 260], ['switch', 320, 260, { open: false }]], wires: [[0, 1, 1, 1], [1, 0, 2, 1], [2, 0, 0, 0]] },
        { comps: [['battery', 320, 480], ['switch', 700, 480, { open: false }], ['bulb', 500, 240]], wires: [[0, 1, 1, 0], [1, 1, 2, 1], [2, 0, 0, 0]] }
      ],
      extra: { eraser: 1, battery: 1 }
    },
    { // 3 전기가 통할까? ('MAT' = 스테이지마다 바뀌는 물건)
      act: '물건으로도 전기가 지나갈까요?',
      layouts: [
        { comps: [['battery', 300, 480], ['bulb', 540, 220], ['MAT', 700, 420]], wires: [[0, 1, 2, 0], [2, 1, 1, 1], [1, 0, 0, 0]] },
        { comps: [['battery', 500, 500], ['bulb', 300, 240], ['MAT', 700, 240]], wires: [[0, 1, 2, 1], [2, 0, 1, 1], [1, 0, 0, 0]] }
      ],
      mats: ['clip', 'coin', 'clip', 'coin', 'clip', 'coin', 'coin', 'clip', 'coin', 'clip']
    },
    { // 4 더 밝게 (전지 직렬)
      act: '전지 2개로 아주 밝게!',
      layouts: [
        { comps: [['battery', 380, 500], ['battery', 620, 500], ['bulb', 500, 240]], wires: [[0, 1, 1, 0], [1, 1, 2, 1], [2, 0, 0, 0]] },
        { comps: [['battery', 260, 420], ['battery', 480, 420], ['bulb', 740, 280]], wires: [[0, 1, 1, 0], [1, 1, 2, 1], [2, 0, 0, 0]] }
      ],
      extra: { eraser: 1, bulb: 1 }
    },
    { // 5 전구 기차 (전구 직렬)
      act: '전구 2개를 한 줄로 켜요!',
      layouts: [
        { comps: [['battery', 500, 500], ['bulb', 330, 240], ['bulb', 670, 240]], wires: [[0, 1, 2, 1], [2, 0, 1, 1], [1, 0, 0, 0]] },
        { comps: [['battery', 300, 520], ['bulb', 400, 220], ['bulb', 620, 360]], wires: [[0, 1, 2, 1], [2, 0, 1, 1], [1, 0, 0, 0]] }
      ],
      extra: { chopstick: 1, clip: 1 }
    },
    { // 6 전구 사다리 (전구 병렬)
      act: '전구 2개를 둘 다 밝게!',
      layouts: [
        { comps: [['battery', 500, 540], ['bulb', 500, 200], ['bulb', 500, 370]], wires: [[0, 1, 1, 1], [0, 1, 2, 1], [1, 0, 0, 0], [2, 0, 0, 0]] },
        { comps: [['battery', 500, 520], ['bulb', 300, 240], ['bulb', 700, 240]], wires: [[0, 1, 1, 1], [0, 1, 2, 1], [1, 0, 0, 0], [2, 0, 0, 0]] }
      ],
      extra: { chopstick: 1, switch: 1 }
    },
    { // 7 전지 친구 (전지 병렬)
      act: '전지 2개가 나란히 같이 일해요!',
      layouts: [
        { comps: [['battery', 400, 400], ['battery', 400, 540], ['bulb', 700, 220]], wires: [[0, 1, 1, 1], [0, 0, 1, 0], [0, 1, 2, 1], [2, 0, 0, 0]] },
        { comps: [['battery', 640, 380], ['battery', 640, 530], ['bulb', 360, 220]], wires: [[0, 0, 1, 0], [0, 1, 1, 1], [0, 1, 2, 1], [2, 0, 0, 0]] }
      ],
      extra: { eraser: 1, coin: 1 }
    },
    { // 8 선풍기 쌩쌩 (전지 3개 직렬)
      act: '선풍기를 쌩쌩 돌려요!',
      layouts: [
        { comps: [['battery', 250, 500], ['battery', 450, 500], ['battery', 650, 500], ['motor', 650, 230], ['switch', 300, 230, { open: false }]],
          wires: [[0, 1, 1, 0], [1, 1, 2, 0], [2, 1, 3, 1], [3, 0, 4, 1], [4, 0, 0, 0]] },
        { comps: [['battery', 300, 540], ['battery', 500, 540], ['battery', 700, 540], ['motor', 480, 240], ['switch', 780, 340, { open: false }]],
          wires: [[0, 1, 1, 0], [1, 1, 2, 0], [2, 1, 4, 1], [4, 0, 3, 1], [3, 0, 0, 0]] }
      ],
      extra: { bulb: 1, eraser: 1 }
    },
    { // 9 우리 집 전등 (병렬 + 스위치)
      act: '스위치를 하나씩 꺼 봐요! 전구가 따로따로 꺼져요.',
      layouts: [
        { comps: [['battery', 500, 540], ['bulb', 380, 200], ['bulb', 380, 380], ['switch', 700, 200, { open: false }], ['switch', 700, 380, { open: false }]],
          wires: [[0, 1, 3, 1], [3, 0, 1, 1], [1, 0, 0, 0], [0, 1, 4, 1], [4, 0, 2, 1], [2, 0, 0, 0]] },
        { comps: [['battery', 500, 540], ['bulb', 640, 200], ['bulb', 640, 380], ['switch', 340, 200, { open: false }], ['switch', 340, 380, { open: false }]],
          wires: [[0, 1, 1, 1], [1, 0, 3, 1], [3, 0, 0, 0], [0, 1, 2, 1], [2, 0, 4, 1], [4, 0, 0, 0]] }
      ],
      extra: { chopstick: 1 }
    },
    { // 10 딱 알맞게 (저항)
      act: '전구가 고장 나지 않게 저항으로 막아 줘요!',
      layouts: [
        { comps: [['battery', 250, 520], ['battery', 450, 520], ['battery', 650, 520], ['resistor', 300, 220], ['resistor', 500, 220], ['bulb', 740, 220]],
          wires: [[0, 1, 1, 0], [1, 1, 2, 0], [2, 1, 5, 1], [5, 0, 4, 1], [4, 0, 3, 1], [3, 0, 0, 0]] },
        { comps: [['battery', 300, 520], ['battery', 500, 520], ['battery', 700, 520], ['resistor', 500, 240], ['resistor', 740, 240], ['bulb', 260, 240]],
          wires: [[0, 1, 1, 0], [1, 1, 2, 0], [2, 1, 4, 1], [4, 0, 3, 1], [3, 0, 5, 1], [5, 0, 0, 0]] }
      ],
      extra: { clip: 1 }
    }
  ];

  // 스테이지 순서표 (L: 레이아웃, M: 거울, rm: 빠진 전선, hide: 재료 상자에 둘 부품, keep: 판에 둘 부품)
  const SCHEDULE = [
    { L: 0, rm: [-1], ghost: true },
    { L: 0, M: true, rm: [0] },
    { L: 1, rm: [1] },
    { L: 0, rm: [0, -1] },
    { L: 1, M: true, rm: [1, -1] },
    { L: 0, M: true, rm: 'all' },
    { L: 1, rm: 'all', hide: [-1] },
    { L: 0, rm: 'all', keep: [0] },
    { keep: [] },
    { L: 1, keep: [], extra: true }
  ];

  function eul(word) {
    const ch = word.charCodeAt(word.length - 1);
    if (ch < 0xac00 || ch > 0xd7a3) return word + '를';
    return word + ((ch - 0xac00) % 28 ? '을' : '를');
  }
  const NAMES = { battery: '전지', bulb: '전구', switch: '스위치', motor: '선풍기', resistor: '저항', clip: '클립', coin: '동전' };

  function makeStage(base, wi, si) {
    const w = W[wi], sch = SCHEDULE[si];
    const lay = w.layouts[sch.L || 0];
    let comps = lay.comps.map(c => ({ kind: c[0] === 'MAT' ? w.mats[si] : c[0], x: c[1], y: c[2], extra: Object.assign({}, c[3] || {}) }));
    let wires = lay.wires.map(x => x.slice());
    if (sch.M) {
      comps.forEach(c => { c.x = 1000 - c.x; });
      // 거울로 뒤집으면 가로로 놓인 부품은 왼쪽/오른쪽 단자가 서로 바뀌어요
      wires = wires.map(([a, ta, b, tb]) => [a, 1 - ta, b, 1 - tb]);
    }
    const n = comps.length, norm = i => (i < 0 ? n + i : i);
    let keep = comps.map((_, i) => i);
    if (sch.keep) keep = sch.keep.map(norm);
    else if (sch.hide) { const h = sch.hide.map(norm); keep = keep.filter(i => !h.includes(i)); }

    let removed = [];
    if (sch.rm === 'all' || keep.length < n) { removed = wires; wires = []; }
    else if (sch.rm) {
      const nw = wires.length, idx = [...new Set(sch.rm.map(i => (i < 0 ? nw + i : i)))];
      removed = wires.filter((_, i) => idx.includes(i));
      wires = wires.filter((_, i) => !idx.includes(i));
    }

    // 재료 상자
    const inv = Object.assign({}, base.inv);
    if (w.mats) {
      for (const k of ['clip', 'coin', 'eraser', 'chopstick']) delete inv[k];
      inv[w.mats[si]] = 1;
      if (si >= 4) inv[si % 2 ? 'eraser' : 'chopstick'] = 1;
      if (si >= 8) Object.assign(inv, { clip: 1, coin: 1, eraser: 1, chopstick: 1 });
    }
    if (sch.extra && w.extra) for (const k in w.extra) inv[k] = (inv[k] || 0) + w.extra[k];

    // 이야기
    let story;
    const hidden = comps.filter((_, i) => !keep.includes(i));
    if (!keep.length) story = base.story + (sch.extra ? ' 필요 없는 재료도 섞여 있어요. 잘 골라요!' : '');
    else if (sch.keep && keep.length === 1) story = `${NAMES[comps[keep[0]].kind] || '재료'}만 있어요! 재료 상자에서 반짝이는 재료를 꺼내서 만들어요. ${w.act}`;
    else if (hidden.length) {
      const k = hidden[0].kind;
      story = (w.mats ? '재료 상자에서 반짝이는 물건 하나를 골라서 꺼내요!' : `재료 상자에서 반짝이는 ${eul(NAMES[k] || '재료')} 꺼내요!`) + ` 그리고 전선으로 이어요. ${w.act}`;
    } else if (!wires.length) story = `재료는 다 있어요! 전선으로 이어 볼까요? ${w.act}`;
    else if (removed.length === 1) story = `전선이 하나 빠졌어요! 반짝이는 점을 이어 주세요. ${w.act}`;
    else story = `전선이 ${removed.length}개 빠졌어요! 반짝이는 점끼리 이어 주세요. ${w.act}`;

    const map = {}; keep.forEach((ci, j) => { map[ci] = j; });
    return Object.assign({}, base, {
      world: wi, stage: si, label: `${wi + 1}-${si + 1}`, story, inv,
      preset: {
        comps: keep.map(i => Object.assign({ kind: comps[i].kind, x: comps[i].x, y: comps[i].y }, comps[i].extra)),
        wires: wires.map(([a, ta, b, tb]) => [map[a], ta, map[b], tb])
      },
      ghost: sch.ghost && keep.length === n ? removed.map(([a, ta, b, tb]) => [map[a], ta, map[b], tb]) : [],
      guided: si < 5,    // 아직 안 이은 점을 반짝이게
      // 재료 상자에서 꺼내야 하는 스테이지(X-7, X-8): 꺼낼 재료를 반짝반짝
      want: hidden.length && keep.length ? comps.reduce((o, c) => {
        const k = w.mats && w.mats.includes(c.kind) ? 'MAT' : c.kind;
        o[k] = (o[k] || 0) + 1; return o;
      }, {}) : null
    });
  }

  const STAGES = [];
  W.forEach((w, wi) => { for (let si = 0; si < 10; si++) STAGES.push(makeStage(BASE[wi], wi, si)); });
  const free = BASE[BASE.length - 1];
  STAGES.push(Object.assign({}, free, { world: W.length, stage: 0, label: '🔬', free: true, ghost: [] }));

  global.WORLDS = BASE.map((b, i) => ({ emoji: b.emoji, title: b.title, first: i * 10, count: i < W.length ? 10 : 1 }));
  global.MISSIONS = STAGES;
  global.STAGE_LAYOUTS = W;
})(window);
