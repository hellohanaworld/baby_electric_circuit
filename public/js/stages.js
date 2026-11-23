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
 * 월드 1~5 는 전구, 6~10 은 선풍기로 같은 순서(1개 → 스위치 → 전지 2개 → 기차(직렬) → 사다리(병렬))를 배워요.
 */
(function (global) {
  'use strict';
  const BASE = global.WORLD_BASE;

  // 레이아웃: comps = [종류, x, y, {추가}], wires = [부품i, 단자, 부품j, 단자]  (전지 단자 1 = ＋)
  // 레이아웃 A(쉬움) → B(한 걸음 더: 스위치나 전지가 하나 더) 순서로 스테이지가 섞여 나와요.
  // 같은 모양을 전구(1~5)와 선풍기(6~10)로 두 번 배워요. 선풍기는 최대 2개.
  const ONE = load => ({ // 전지 1 + 부품 1
    layouts: [
      { comps: [['battery', 500, 480], [load, 500, 250]], wires: [[0, 1, 1, 1], [1, 0, 0, 0]] },
      { comps: [['battery', 300, 450], [load, 680, 280]], wires: [[0, 1, 1, 1], [1, 0, 0, 0]] }
    ]
  });
  const SWITCH = load => ({ // 전지 1 + 부품 1 + 스위치 1
    layouts: [
      { comps: [['battery', 500, 500], [load, 680, 270], ['switch', 320, 270, { open: false }]], wires: [[0, 1, 1, 1], [1, 0, 2, 1], [2, 0, 0, 0]] },
      { comps: [['battery', 320, 490], ['switch', 700, 490, { open: false }], [load, 500, 250]], wires: [[0, 1, 1, 0], [1, 1, 2, 1], [2, 0, 0, 0]] }
    ]
  });
  const STRONG = load => ({ // 전지 2개 줄줄이 (+ B: 스위치)
    layouts: [
      { comps: [['battery', 380, 500], ['battery', 620, 500], [load, 500, 250]], wires: [[0, 1, 1, 0], [1, 1, 2, 1], [2, 0, 0, 0]] },
      { comps: [['battery', 300, 520], ['battery', 520, 520], [load, 720, 270], ['switch', 330, 270, { open: false }]],
        wires: [[0, 1, 1, 0], [1, 1, 2, 1], [2, 0, 3, 1], [3, 0, 0, 0]] }
    ]
  });
  const SERIES = load => ({ // 부품 2개 한 줄 (+ B: 가운데 스위치)
    layouts: [
      { comps: [['battery', 500, 500], [load, 330, 250], [load, 670, 250]], wires: [[0, 1, 2, 1], [2, 0, 1, 1], [1, 0, 0, 0]] },
      { comps: [['battery', 500, 520], [load, 270, 260], [load, 730, 260], ['switch', 500, 260, { open: false }]],
        wires: [[0, 1, 2, 1], [2, 0, 3, 1], [3, 0, 1, 1], [1, 0, 0, 0]] }
    ]
  });
  const PARALLEL = load => ({ // 부품 2개 나란히 (+ B: 전지 2개 + 갈래마다 스위치)
    layouts: [
      { comps: [['battery', 500, 520], [load, 300, 250], [load, 700, 250]], wires: [[0, 1, 1, 1], [0, 1, 2, 1], [1, 0, 0, 0], [2, 0, 0, 0]] },
      { comps: [['battery', 400, 550], ['battery', 600, 550], [load, 380, 220], [load, 380, 410], ['switch', 700, 220, { open: false }], ['switch', 700, 410, { open: false }]],
        wires: [[0, 1, 1, 0], [1, 1, 4, 1], [4, 0, 2, 1], [2, 0, 0, 0], [1, 1, 5, 1], [5, 0, 3, 1], [3, 0, 0, 0]] }
    ]
  });
  const W = [
    Object.assign({ act: '전구에 불을 켜요!', extra: { eraser: 1, switch: 1 } }, ONE('bulb')),
    Object.assign({ act: '불이 켜지면 스위치를 콕 눌러서 꺼 봐요!', extra: { battery: 1, eraser: 1 } }, SWITCH('bulb')),
    Object.assign({ act: '전지 2개로 아주 밝게!', extra: { bulb: 1, eraser: 1 } }, STRONG('bulb')),
    Object.assign({ act: '전구 2개를 한 줄로 켜요!', extra: { battery: 1, chopstick: 1 } }, SERIES('bulb')),
    Object.assign({ act: '전구 2개를 나란히 둘 다 밝게!', extra: { switch: 1, eraser: 1 } }, PARALLEL('bulb')),
    Object.assign({ act: '선풍기를 돌려요!', extra: { bulb: 1, eraser: 1 } }, ONE('motor')),
    Object.assign({ act: '선풍기가 돌면 스위치를 콕 눌러서 멈춰 봐요!', extra: { battery: 1, chopstick: 1 } }, SWITCH('motor')),
    Object.assign({ act: '전지 2개로 쌩쌩!', extra: { motor: 1, eraser: 1 } }, STRONG('motor')),
    Object.assign({ act: '선풍기 2개를 한 줄로 돌려요!', extra: { bulb: 1, eraser: 1 } }, SERIES('motor')),
    Object.assign({ act: '선풍기 2개를 나란히 둘 다 쌩쌩!', extra: { bulb: 1, chopstick: 1 } }, PARALLEL('motor'))
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
    // 재료 상자 = 이 스테이지 회로에 필요한 만큼 (X-10 에는 필요 없는 재료가 섞여요)
    const inv = comps.reduce((o, c) => { o[c.kind] = (o[c.kind] || 0) + 1; return o; }, {});
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
    const design = comps.reduce((o, c) => {
      const k = w.mats && w.mats.includes(c.kind) ? 'MAT' : c.kind;
      o[k] = (o[k] || 0) + 1; return o;
    }, {});
    return Object.assign({}, base, {
      world: wi, stage: si, label: `${wi + 1}-${si + 1}`, story, inv,
      preset: {
        comps: keep.map(i => Object.assign({ kind: comps[i].kind, x: comps[i].x, y: comps[i].y }, comps[i].extra)),
        wires: wires.map(([a, ta, b, tb]) => [map[a], ta, map[b], tb])
      },
      ghost: sch.ghost && keep.length === n ? removed.map(([a, ta, b, tb]) => [map[a], ta, map[b], tb]) : [],
      guided: si < 5,    // 아직 안 이은 점을 반짝이게
      // 재료 상자에서 꺼내야 하는 스테이지(X-7, X-8): 꺼낼 재료를 반짝반짝
      want: hidden.length && keep.length ? design : null,
      design       // 이 주제의 회로에 꼭 필요한 재료 (도와줘가 엉뚱한 재료를 권하지 않게)
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
