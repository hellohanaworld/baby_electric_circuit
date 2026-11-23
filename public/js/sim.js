/* 꼬마 전기 실험실 - 회로 계산 엔진
 * 마디 해석법(Nodal analysis)으로 실제 전압/전류를 계산합니다.
 *  - 건전지: 1.5V 이상적인 전지 (계산 안정용 아주 작은 내부저항 0.001Ω)
 *  - 전선: 0.0001Ω (사실상 0Ω)
 *  - 꼬마전구 / 모터 / 저항: 3Ω (고정값으로 단순화)
 */
(function (global) {
  'use strict';

  const PHYS = {
    V_CELL: 1.5,      // 건전지 1개 전압 (V)
    R_INT: 0.001,     // 건전지 내부저항 (계산용, 사실상 0)
    R_WIRE: 0.000001, // 전선 저항 (사실상 0)
    G_LEAK: 1e-6,     // 떠 있는 마디 안정화용 (결과에 영향 없음)
    BURN_A: 1.2,      // 꼬마전구가 끊어지는 전류 (A)
    SHORT_A: 4,       // 이보다 크면 합선으로 판단 (A)
    LIT_A: 0.08,      // 전구가 켜졌다고 보는 최소 전류 (A)
    P_NOM: 0.75,      // 전구 기본 밝기 전력 (0.5A × 0.5A × 3Ω)
    ACTIVE_A: 0.02    // 전류가 흐른다고 보는 최소값
  };

  const KINDS = {
    battery:   { name: '전지',   short: '전지',   cat: 'source', L: 60 },
    bulb:      { name: '전구', short: '전구',   cat: 'load', R: 3, L: 50 },
    motor:     { name: '선풍기', short: '선풍기', cat: 'load', R: 3, L: 50 },
    resistor:  { name: '저항',     short: '저항',   cat: 'load', R: 3, L: 50 },
    switch:    { name: '스위치',   short: '스위치', cat: 'switch', L: 50 },
    clip:      { name: '클립',     short: '클립',   cat: 'material', conductor: true,  R: 0, L: 50, topic: '클립은', stuff: '쇠' },
    coin:      { name: '동전',     short: '동전',   cat: 'material', conductor: true,  R: 0, L: 50, topic: '동전은', stuff: '금속' },
    eraser:    { name: '지우개',   short: '지우개', cat: 'material', conductor: false, L: 50, topic: '지우개는', stuff: '고무' },
    chopstick: { name: '나무젓가락', short: '젓가락', cat: 'material', conductor: false, L: 50, topic: '나무젓가락은', stuff: '나무' },
    pencil:    { name: '연필심',   short: '연필심', cat: 'material', conductor: true,  R: 6, L: 50, topic: '연필심은', stuff: '흑연' }
  };

  const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮';

  function fmt(x) {
    const r = Math.round(x * 100) / 100;
    return (Math.abs(r) < 0.005 ? 0 : r).toString();
  }

  function displayName(c) {
    const k = KINDS[c.kind];
    if (k.cat === 'material') return k.name;
    return k.short + (CIRCLED[c.num - 1] || c.num);
  }

  /** 부품의 저항값. Infinity = 전기가 안 통함 */
  function resistanceOf(c, ov) {
    if (ov && ov[c.id] != null) return ov[c.id];
    const k = KINDS[c.kind];
    switch (k.cat) {
      case 'load':
        if (c.kind === 'bulb' && c.broken) return Infinity;
        return k.R;
      case 'switch':
        return c.open ? Infinity : PHYS.R_WIRE;
      case 'material':
        return k.conductor ? Math.max(k.R, PHYS.R_WIRE) : Infinity;
      default:
        return Infinity;
    }
  }

  /** 전구·모터·저항·연필심처럼 저항이 있는 부품 (전기를 쓰는 것) */
  function isLoad(c) {
    const k = KINDS[c.kind];
    if (k.cat === 'load') return !(c.kind === 'bulb' && c.broken);
    if (k.cat === 'material') return k.conductor && k.R > 0.01;
    return false;
  }

  function loadR(c) { return KINDS[c.kind].R; }

  function gauss(A, b) {
    const n = b.length;
    const M = A.map((row, i) => { const r = Array.from(row); r.push(b[i]); return r; });
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      if (p !== c) { const t = M[c]; M[c] = M[p]; M[p] = t; }
      const pv = M[c][c];
      if (Math.abs(pv) < 1e-18) continue;
      for (let r = c + 1; r < n; r++) {
        const f = M[r][c] / pv;
        if (f === 0) continue;
        const Mr = M[r], Mc = M[c];
        for (let k = c; k <= n; k++) Mr[k] -= f * Mc[k];
      }
    }
    const x = new Array(n).fill(0);
    for (let r = n - 1; r >= 0; r--) {
      let s = M[r][n];
      for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
      x[r] = Math.abs(M[r][r]) < 1e-18 ? 0 : s / M[r][r];
    }
    return x;
  }

  /**
   * 회로 풀기
   * comps: [{id, kind, open?, broken?}] - 단자 0, 1 (건전지: 0 = −, 1 = +)
   * wires: [{id, a:{c,t}, b:{c,t}}]
   * 결과: comp[id].I = 단자0 → 단자1 방향 전류 (건전지는 내부에서 − → + 방향, 즉 내보내는 전류)
   *       comp[id].V = 단자0 전압 − 단자1 전압 (건전지는 + 단자 − − 단자)
   *       wire[id]   = a → b 방향 전류
   */
  function solve(comps, wires, ov) {
    const idx = new Map();
    let n = 0;
    for (const c of comps) { idx.set(c.id + ':0', n++); idx.set(c.id + ':1', n++); }
    const G = Array.from({ length: n }, () => new Float64Array(n));
    const B = new Float64Array(n);
    const stamp = (a, b, g) => { G[a][a] += g; G[b][b] += g; G[a][b] -= g; G[b][a] -= g; };

    for (const w of wires) {
      const a = idx.get(w.a.c + ':' + w.a.t), b = idx.get(w.b.c + ':' + w.b.t);
      if (a == null || b == null) continue;
      stamp(a, b, 1 / PHYS.R_WIRE);
    }
    for (const c of comps) {
      const a = idx.get(c.id + ':0'), b = idx.get(c.id + ':1');
      if (c.kind === 'battery' && c.broken) continue;   // 타 버린 전지: 밀지도, 통하지도 않아요
      if (c.kind === 'battery') {
        const g = 1 / PHYS.R_INT;
        stamp(a, b, g);
        const Is = PHYS.V_CELL * g; // 노턴 등가: 전류원 + 내부저항
        B[b] += Is; B[a] -= Is;
      } else {
        const R = resistanceOf(c, ov);
        if (isFinite(R)) stamp(a, b, 1 / R);
      }
    }
    for (let i = 0; i < n; i++) G[i][i] += PHYS.G_LEAK;

    const V = n ? gauss(G, B) : [];
    const res = { comp: {}, wire: {}, node: {} };
    for (const [k, i] of idx) res.node[k] = V[i];
    for (const c of comps) {
      const v0 = V[idx.get(c.id + ':0')], v1 = V[idx.get(c.id + ':1')];
      if (c.kind === 'battery' && c.broken) { res.comp[c.id] = { I: 0, V: 0 }; continue; }
      if (c.kind === 'battery') {
        res.comp[c.id] = { I: (PHYS.V_CELL - (v1 - v0)) / PHYS.R_INT, V: v1 - v0 };
      } else {
        const R = resistanceOf(c, ov);
        res.comp[c.id] = { I: isFinite(R) ? (v0 - v1) / R : 0, V: v0 - v1 };
      }
    }
    for (const w of wires) {
      const a = idx.get(w.a.c + ':' + w.a.t), b = idx.get(w.b.c + ':' + w.b.t);
      res.wire[w.id] = (a == null || b == null) ? 0 : (V[a] - V[b]) / PHYS.R_WIRE;
    }
    return res;
  }

  /** 부품 c 가 들어 있는 회로에서 전지들이 밀어 주는 전체 전압 (V)
   *  전류가 흐르는 부품들의 단자 전위 중 (가장 높은 값 − 가장 낮은 값).
   *  전지 2개 직렬 = 3V, 병렬 = 1.5V, 거꾸로 = 0V. 매달려만 있는 전지는 전류가 없어서 빼요. */
  function supplyV(comps, wires, sol, c) {
    const parent = {};
    const find = k => { if (parent[k] == null) parent[k] = k; while (parent[k] !== k) { parent[k] = parent[parent[k]]; k = parent[k]; } return k; };
    const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; };
    for (const w of wires) union(w.a.c + ':' + w.a.t, w.b.c + ':' + w.b.t);
    for (const x of comps) if ((x.kind === 'battery' && !x.broken) || isFinite(resistanceOf(x))) union(x.id + ':0', x.id + ':1');
    const root = find(c.id + ':0');
    let hi = -Infinity, lo = Infinity;
    for (const x of comps) {
      if (find(x.id + ':0') !== root || Math.abs(sol.comp[x.id].I) < 0.05) continue;
      for (const t of [0, 1]) { const v = sol.node[x.id + ':' + t]; if (v > hi) hi = v; if (v < lo) lo = v; }
    }
    return hi > lo ? hi - lo : 0;
  }

  /** 이 부품이 전기가 통한다면 전류가 흐를 자리에 있는지 (물건 시험, 스위치 확인용) */
  function wouldConduct(comps, wires, c) {
    const s = solve(comps, wires, { [c.id]: PHYS.R_WIRE });
    return Math.abs(s.comp[c.id].I) > 0.05 && Math.abs(s.comp[c.id].I) < PHYS.SHORT_A * 50;
  }

  /** 전선 / 켜진 스위치 / 금속으로 이어진 단자끼리 묶기 (같은 '마디') */
  function topo(comps, wires) {
    const parent = {};
    const find = k => { if (parent[k] == null) parent[k] = k; while (parent[k] !== k) { parent[k] = parent[parent[k]]; k = parent[k]; } return k; };
    const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; };
    for (const w of wires) union(w.a.c + ':' + w.a.t, w.b.c + ':' + w.b.t);
    for (const c of comps) {
      if (c.kind === 'battery') continue;
      const R = resistanceOf(c);
      if (R <= PHYS.R_WIRE * 1.01) union(c.id + ':0', c.id + ':1');
    }
    return find;
  }

  function openHint(comps, wires) {
    const has = k => comps.some(c => c.kind === k);
    if (!has('battery')) return '왼쪽에서 전지 🔋를 꺼내요!';
    if (!comps.some(c => KINDS[c.kind].cat === 'load')) return '전구 💡를 꺼내요!';
    if (!wires.length) return '동그란 점 ⚪을 꾹 누르고 다른 점까지 쭉~ 끌어요!';
    if (comps.some(c => c.kind === 'battery' && c.broken)) return '까맣게 탄 전지를 콕 누르면 새 전지! 🔋';
    if (comps.some(c => c.kind === 'bulb' && c.broken)) return '전구가 고장 났어요. 전구를 콕 누르면 새 전구! 💡';
    for (const c of comps) {
      const k = KINDS[c.kind];
      if (k.cat === 'material' && !k.conductor && wouldConduct(comps, wires, c))
        return `${k.topic} 전기가 안 통해요! 길이 막혔어요. 🚫`;
    }
    for (const c of comps) {
      if (c.kind === 'switch' && c.open && wouldConduct(comps, wires, c))
        return '스위치가 꺼져 있어요. 스위치를 콕 눌러 봐요! 🔘';
    }
    const bats = comps.filter(c => c.kind === 'battery');
    const wired = (c, t) => wires.some(w => (w.a.c === c.id && w.a.t === t) || (w.b.c === c.id && w.b.t === t));
    if (bats.filter(b => wired(b, 0) && wired(b, 1)).length >= 2)
      return '전지가 거꾸로 있나 봐요. ＋는 −랑 이어요! 🔋';
    return '전지 ＋ → 전구 → 전지 −, 동그랗게 한 바퀴 이어요! 🔄';
  }

  /** 회로를 아이 눈높이 수식으로 설명 */
  function analyze(comps, wires, sol) {
    const T = PHYS.ACTIVE_A;
    const I = c => sol.comp[c.id].I;
    const A = c => Math.abs(I(c));
    const bats = comps.filter(c => c.kind === 'battery');
    const loads = comps.filter(isLoad);

    if (bats.some(b => A(b) > PHYS.SHORT_A)) return { status: 'short' };

    const aB = bats.filter(b => A(b) > T);
    const aL = loads.filter(l => A(l) > T);
    if (!aB.length || !aL.length) return { status: 'open', hint: openHint(comps, wires) };

    const find = topo(comps, wires);
    const pr = c => [find(c.id + ':0'), find(c.id + ':1')];
    const near = (a, b, rel = 0.03) => Math.abs(a - b) <= rel * Math.max(Math.abs(a), Math.abs(b)) + 0.005;
    const sum = arr => arr.reduce((s, x) => s + x, 0);

    // 전류가 흐르는 부품들이 하나로 이어져 있는지
    const adj = {};
    const act = aB.concat(aL);
    for (const c of act) { const [p, q] = pr(c); (adj[p] = adj[p] || []).push(q); (adj[q] = adj[q] || []).push(p); }
    const start = pr(act[0])[0], seen = new Set([start]), st = [start];
    while (st.length) { const x = st.pop(); for (const y of adj[x] || []) if (!seen.has(y)) { seen.add(y); st.push(y); } }
    const connected = Object.keys(adj).every(k => seen.has(k));

    // 전지 묶음
    let bank = { mode: 'mixed' };
    if (aB.length === 1) bank = { mode: 'one', n: 1, V: PHYS.V_CELL, I: A(aB[0]) };
    else {
      const p0 = pr(aB[0]);
      const par = aB.every(b => { const p = pr(b); return p[0] === p0[0] && p[1] === p0[1]; }) && aB.every(b => I(b) > 0);
      if (par) bank = { mode: 'parallel', n: aB.length, V: PHYS.V_CELL, I: sum(aB.map(A)) };
      else if (aB.every(b => near(A(b), A(aB[0])))) {
        const ns = aB.filter(b => I(b) > 0).length, nr = aB.length - ns;
        bank = { mode: 'series', n: aB.length, ns, nr, V: PHYS.V_CELL * (ns - nr), I: A(aB[0]) };
      }
    }

    // 전기를 쓰는 부품 묶음
    const Rs = aL.map(loadR);
    let lg = { mode: 'mixed' };
    if (aL.length === 1) lg = { mode: 'one', R: Rs[0] };
    else if (aL.every(l => near(A(l), A(aL[0]))) && bank.I && near(A(aL[0]), bank.I)) lg = { mode: 'series', R: sum(Rs) };
    else {
      const p0 = pr(aL[0]);
      const same = aL.every(l => { const p = pr(l); return (p[0] === p0[0] && p[1] === p0[1]) || (p[0] === p0[1] && p[1] === p0[0]); });
      if (same) lg = { mode: 'parallel', R: 1 / sum(Rs.map(r => 1 / r)) };
    }

    const ok = connected && bank.mode !== 'mixed' && lg.mode !== 'mixed' && bank.V > 0 && near(bank.V / lg.R, bank.I, 0.04);

    const steps = [];
    const summary = [];
    if (ok) {
      const V = bank.V, R = lg.R, Itot = V / R;
      // 1. 전압
      if (bank.mode === 'one') steps.push({ icon: '🔋', label: '미는 힘 (전압)', formula: `전지 1개 = ${fmt(V)}V` });
      else if (bank.mode === 'series') {
        let f = '';
        aB.forEach((b, i) => { const pos = I(b) > 0; f += i === 0 ? (pos ? '1.5V' : '−1.5V') : (pos ? ' + 1.5V' : ' − 1.5V'); });
        steps.push({ icon: '🔋', label: `미는 힘 (전압) · 전지 ${bank.n}개 줄줄이(직렬)`, formula: `${f} = ${fmt(V)}V`,
          sub: bank.nr ? '거꾸로 끼운 전지가 있어서 서로 반대로 밀어요. 힘이 빠져요!' : '줄줄이 이으면 미는 힘이 차곡차곡 더해져요.' });
      } else if (bank.mode === 'parallel') {
        steps.push({ icon: '🔋', label: `미는 힘 (전압) · 전지 ${bank.n}개 나란히(병렬)`, formula: `그대로 ${fmt(V)}V`,
          sub: '나란히 이으면 미는 힘은 그대로예요. 대신 전지들이 일을 나눠서 해요.' });
      }
      // 2. 저항
      if (lg.mode === 'one') steps.push({ icon: '🚧', label: '지나가기 힘든 정도 (저항)', formula: `${displayName(aL[0])} = ${fmt(R)}Ω` });
      else if (lg.mode === 'series') steps.push({ icon: '🚧', label: `지나가기 힘든 정도 (저항) · ${aL.length}개 줄줄이(직렬)`,
        formula: Rs.map(r => fmt(r) + 'Ω').join(' + ') + ` = ${fmt(R)}Ω`, sub: '줄줄이 이으면 길이 길어져서 지나가기 더 힘들어요.' });
      else {
        const eq = Rs.every(r => r === Rs[0]);
        steps.push({ icon: '🚧', label: `지나가기 힘든 정도 (저항) · ${aL.length}개 나란히(병렬)`,
          formula: eq ? `${fmt(Rs[0])}Ω ÷ ${aL.length} = ${fmt(R)}Ω` : `1 ÷ (${Rs.map(r => '1/' + fmt(r)).join(' + ')}) = ${fmt(R)}Ω`,
          sub: '길이 여러 갈래라서 전기가 더 쉽게 지나가요.' });
      }
      // 3. 전류
      steps.push({ icon: '⚡', label: '흐르는 전기 (전류)', formula: `전압 ÷ 저항 = ${fmt(V)}V ÷ ${fmt(R)}Ω = ${fmt(Itot)}A`, big: true });
      if (lg.mode === 'parallel') steps.push({ icon: '🔀', label: '갈래길마다 나눠 흐르는 전류',
        formula: aL.map(l => fmt(V / loadR(l)) + 'A').join(' + ') + ` = ${fmt(Itot)}A` });
      if (bank.mode === 'parallel') steps.push({ icon: '🤝', label: '전지 하나가 보내는 전류',
        formula: `${fmt(Itot)}A ÷ ${bank.n} = ${fmt(Itot / bank.n)}A씩` });

      // 아이용 아주 쉬운 한 마디
      const base = 0.5;
      if (bank.mode === 'series' && !bank.nr && bank.n > 1) summary.push(`전지 ${bank.n}개가 같이 밀어요. 힘이 ${bank.n}배! 💪`);
      if (bank.mode === 'series' && bank.nr) summary.push('전지 하나가 거꾸로예요! 서로 반대로 밀어서 힘이 빠져요. 🙃');
      if (bank.mode === 'parallel') summary.push('전지들이 일을 나눠서 해요. 밝기는 그대로, 대신 더 오래가요. 🤝');
      if (lg.mode === 'series') summary.push('한 줄로 길어서 지나가기 힘들어요. 물줄기가 가늘어졌어요. 🐢');
      if (lg.mode === 'parallel') summary.push('물줄기가 갈래로 나뉘어 흘러요. 전구마다 전기가 넉넉해요. 🛣️');
      const bulbs = aL.filter(c => c.kind === 'bulb');
      if (bulbs.length) {
        const ratio = Math.abs(I(bulbs[0])) / base;
        if (near(ratio, 1)) summary.push('전구 밝기는 보통이에요. 💡');
        else if (ratio > 1) summary.push('전구가 보통보다 더 밝아요! 🌟');
        else summary.push('전구가 보통보다 어두워요. 🌙');
      }
      if (!summary.length) summary.push('전기가 동그랗게 한 바퀴 돌아요! 🔄');
    } else {
      summary.push(connected ? '길이 여러 갈래로 복잡해요. 그래도 전기는 잘 흐르고 있어요!'
        : '동그란 길이 여러 개 있어요. 길마다 따로 전기가 흘러요!');
    }

    const list = loads.map(l => ({
      id: l.id, name: displayName(l), V: fmt(Math.abs(sol.comp[l.id].V)), R: fmt(loadR(l)), I: fmt(A(l)), active: A(l) > T
    }));
    // 아이용 한 줄 수식 (미는 힘 ÷ 막는 힘 = 전기 세기)
    const kidEq = ok ? { V: fmt(bank.V), R: fmt(lg.R), I: fmt(bank.V / lg.R) } : null;
    const maxI = Math.max(...aL.map(A));
    return { status: 'ok', ok, bank, lg, steps, summary, list, kidEq, maxI };
  }

  global.Circuit = { PHYS, KINDS, CIRCLED, fmt, displayName, resistanceOf, isLoad, solve, analyze, wouldConduct, supplyV };
})(window);
