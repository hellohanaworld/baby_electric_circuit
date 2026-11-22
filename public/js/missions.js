/* 꼬마 전기 실험실 - 월드(주제) 10개 + 자유 실험실. 스테이지는 stages.js 에서 만들어요
 * story / goal / hint / learn / say : 아이용 (짧고 쉬운 말)
 * parent : 엄마 아빠용 자세한 설명 (ⓘ 버튼으로 열림)
 */
(function (global) {
  'use strict';
  const inRange = (x, a, b) => x >= a && x <= b;

  const BASE = [
    {
      emoji: '💡', title: '불을 켜요',
      story: '전구에 불을 켜 볼까요? 동그란 점을 꾹 누르고 다른 점까지 쭉~ 끌어요!',
      goal: '전구에 불 켜기',
      inv: { battery: 1, bulb: 1 },
      preset: { comps: [{ kind: 'battery', x: 300, y: 400 }, { kind: 'bulb', x: 680, y: 400 }] },
      hint: '전지 점 2개를 전구 점 2개에 하나씩 이어요. 동그랗게 한 바퀴!',
      check: ctx => ctx.lit().length > 0,
      learn: '전기는 <b>동그란 길</b>을 한 바퀴 돌아야 불을 켜요!<div class="pic">🔋 ➡️ 💡 ➡️ 🔋</div>',
      say: '성공! 전기가 동그랗게 한 바퀴 돌아서 불이 켜졌어요.',
      parent: `<p><b>핵심 개념: 닫힌 회로</b><br>전류는 전지의 (＋)극에서 나와 전구를 지나 (−)극으로 돌아옵니다. 길이 한 곳이라도 끊기면(열린 회로) 전류는 0이 됩니다.</p>
        <p><b>계산</b><br>전류 = 전압 ÷ 저항 = 1.5V ÷ 3Ω = <b>0.5A</b> (옴의 법칙)</p>
        <p><b>이렇게 말해 주세요</b><br>"전기는 놀이터 미끄럼틀처럼 한 바퀴 돌아오는 길이 있어야 움직여. 길이 끊기면 멈춰."<br>
        "전선 하나를 지워 볼까? 불이 꺼지지? 길이 끊겼기 때문이야."</p>`
    },
    {
      emoji: '🔘', title: '스위치 딸깍',
      story: '스위치는 전기 길의 문이에요. 스위치를 넣고 불을 켰다 껐다 해 봐요!',
      goal: '스위치로 켜고 끄기',
      inv: { battery: 1, bulb: 1, switch: 1 },
      preset: { comps: [{ kind: 'battery', x: 260, y: 440 }, { kind: 'bulb', x: 720, y: 440 }] },
      hint: '전지 → 스위치 → 전구 → 전지. 그리고 스위치를 콕!',
      progress: ctx => [
        { text: '스위치로 불 켜기', done: !!ctx.memo.on },
        { text: '스위치로 불 끄기', done: !!ctx.memo.off }
      ],
      check: ctx => {
        const sw = ctx.of('switch');
        const lit = ctx.lit().length > 0;
        if (lit && sw.some(s => !s.open && ctx.A(s) > 0.1)) ctx.memo.on = true;
        if (ctx.memo.on && !lit && sw.some(s => s.open && ctx.wouldConduct(s))) ctx.memo.off = true;
        return !!(ctx.memo.on && ctx.memo.off);
      },
      learn: '스위치를 켜면 길이 <b>이어지고</b>, 끄면 길이 <b>끊어져요!</b><div class="pic">🔘 켜짐 → 💡 &nbsp; | &nbsp; 🔘 꺼짐 → 🌑</div>',
      say: '성공! 스위치는 전기 길을 열고 닫는 문이에요.',
      parent: `<p><b>핵심 개념: 스위치 = 회로를 열고 닫는 장치</b><br>스위치가 닫히면(켜짐) 회로가 이어져 전류가 흐르고, 열리면(꺼짐) 회로가 끊겨 전류가 0A가 됩니다.</p>
        <p><b>헷갈리기 쉬운 점</b><br>전기 용어로는 '닫힘 = 켜짐', '열림 = 꺼짐'입니다. 문과 반대처럼 느껴질 수 있어요. "다리가 이어지면 건널 수 있다"로 설명하면 쉬워요.</p>
        <p><b>이렇게 말해 주세요</b><br>"방에 있는 전등 스위치도 이렇게 전기 길을 끊었다 이었다 하는 거야."</p>`
    },
    {
      emoji: '🔍', title: '전기가 통할까?',
      story: '클립, 동전, 지우개, 나무젓가락! 전구와 전지 사이에 물건을 넣어서 불을 켜 봐요!',
      goal: '물건을 넣어서 불 켜기',
      inv: { battery: 1, bulb: 1, clip: 1, coin: 1, eraser: 1, chopstick: 1 },
      preset: {
        comps: [{ kind: 'battery', x: 300, y: 480 }, { kind: 'bulb', x: 540, y: 220 }],
        wires: [[0, 1, 1, 1]]
      },
      hint: '물건 양쪽 점을 전구 점과 전지 − 점에 이어요. 불이 안 켜지면 다른 물건으로 바꿔 봐요!',
      progress: ctx => {
        const t = ctx.memo.tested || {};
        const list = [{ text: '물건을 넣어서 불 켜기', done: !!ctx.memo.litBy }];
        ['clip', 'coin', 'eraser', 'chopstick'].forEach(k => {
          const r = t[k];
          if (r != null) list.push({ text: `${ctx.KINDS[k].name}: ${r ? '전기가 통해요 ⚡' : '안 통해요 🚫'}`, done: true, extra: true });
        });
        return list;
      },
      check: ctx => {
        ctx.memo.tested = ctx.memo.tested || {};
        for (const c of ctx.comps) {
          const k = ctx.KINDS[c.kind];
          if (k.cat === 'material' && ctx.memo.tested[c.kind] == null && ctx.wouldConduct(c)) {
            ctx.memo.tested[c.kind] = k.conductor;
            ctx.toast(k.conductor ? `${k.topic} 전기가 통해요! ⚡` : `${k.topic} 전기가 안 통해요 🚫`);
          }
        }
        // 전기가 통하는 물건을 지나서 전구에 불이 켜지면 성공
        const ok = ctx.lit().length > 0 && ctx.comps.some(c => ctx.KINDS[c.kind].cat === 'material' && ctx.A(c) > 0.1);
        if (ok) ctx.memo.litBy = true;
        return ok;
      },
      learn: '<b>쇠·동전</b>은 전기가 통해요 ⚡<br><b>지우개·나무</b>는 전기가 안 통해요 🚫<div class="pic">📎🪙 ⚡ &nbsp; | &nbsp; 🧽🥢 🚫</div>다른 물건도 넣어 볼까요?',
      say: '성공! 쇠로 만든 물건은 전기가 잘 통해요. 지우개와 나무도 넣어 볼까요?',
      parent: `<p><b>핵심 개념: 도체와 부도체</b><br>금속(클립의 쇠, 동전의 구리·니켈)은 자유롭게 움직이는 전자가 많아 전기가 잘 통하는 <b>도체</b>입니다. 고무(지우개)·나무는 전기가 거의 통하지 않는 <b>부도체(절연체)</b>입니다.</p>
        <p><b>성공 조건</b><br>전기가 통하는 물건 하나로 불을 켜면 성공입니다. 나머지 물건은 자유롭게 더 시험해 보세요. 시험한 결과는 미션 카드에 기록됩니다.</p>
        <p><b>생활 연결</b><br>"전선을 잘라 보면 속은 구리(금속), 겉은 비닐(부도체)이야. 그래서 겉을 만져도 안전해."</p>
        <p><b>참고</b><br>자유 실험실의 '연필심(흑연)'은 전기가 조금 통해서 전구가 어둡게 켜집니다. 실제 동전은 표면이 더러우면 잘 안 통할 수도 있어요.</p>`
    },
    {
      emoji: '🔋', title: '더 밝게!',
      story: '전구를 더 밝게 켜고 싶어요! 전지 2개를 기차처럼 줄줄이 이어 봐요.',
      goal: '전구를 아주 밝게 켜기',
      inv: { battery: 2, bulb: 1 },
      hint: '전지의 ＋를 다른 전지의 −에 이어요. 기차처럼 칙칙폭폭!',
      // 전지 2개가 줄줄이(직렬) 이어져서 3V로 밀어 주는 회로에 불이 켜지면 성공 (남은 재료는 안 써도 돼요)
      check: ctx => ctx.lit().some(b => ctx.push(b) >= 2.9),
      learn: '전지 2개가 <b>같이 밀어서</b> 전기가 2배로 세졌어요!<div class="pic">🔋🔋 ➡️ 🌟💡🌟</div>',
      say: '성공! 전지 두 개가 같이 미니까 전구가 더 밝아졌어요.',
      parent: `<p><b>핵심 개념: 전지의 직렬연결</b><br>(＋)극과 (−)극을 이어 붙이면 전압이 더해집니다. 1.5V + 1.5V = 3V</p>
        <p><b>계산</b><br>3V ÷ 3Ω = <b>1A</b> → 전지 1개일 때(0.5A)의 2배. 밝기(전력 P = I²R)는 4배가 됩니다.</p>
        <p><b>이렇게 말해 주세요</b><br>"전압은 전기를 미는 힘이야. 친구 둘이 같이 밀면 더 세게 밀 수 있지?"</p>
        <p><b>해볼 것</b><br>전지 하나를 거꾸로(＋끼리) 이어 보세요. 미는 힘이 서로 상쇄되어 불이 꺼집니다.</p>`
    },
    {
      emoji: '🚂', title: '전구 기차',
      story: '전지 1개에 전구 2개를 기차처럼 줄줄이 이어요. 밝기가 어떻게 될까요?',
      goal: '전구 2개를 한 줄로 켜기',
      inv: { battery: 1, bulb: 2 },
      hint: '전지 → 전구 → 전구 → 전지. 한 줄로 쭉!',
      check: ctx => { const l = ctx.lit(); return l.length >= 2 && l.every(b => inRange(ctx.A(b), 0.2, 0.3)); },
      learn: '한 줄로 길어지면 전기가 <b>지나가기 힘들어요</b>. 그래서 둘 다 어두워요!<div class="pic">🔋 ➡️ 🌙💡 ➡️ 🌙💡</div>',
      say: '성공! 줄줄이 이으면 전구가 어두워져요.',
      parent: `<p><b>핵심 개념: 전구의 직렬연결</b><br>저항이 더해집니다. 3Ω + 3Ω = 6Ω</p>
        <p><b>계산</b><br>1.5V ÷ 6Ω = <b>0.25A</b> → 전구 하나일 때의 절반. 전구마다 걸리는 전압도 0.75V로 나뉘어 어두워집니다.</p>
        <p><b>이렇게 말해 주세요</b><br>"좁은 길이 두 번 이어지면 지나가기 더 힘들지? 그래서 전기가 약해졌어."</p>
        <p><b>해볼 것</b><br>전구 하나를 재료함으로 치워 보세요. 길이 끊겨서 다른 전구도 꺼집니다.</p>`
    },
    {
      emoji: '🪜', title: '전구 사다리',
      story: '이번엔 전구 2개를 사다리처럼 나란히 이어요. 둘 다 밝게 켤 수 있을까요?',
      goal: '전구 2개를 둘 다 밝게',
      inv: { battery: 1, bulb: 2 },
      hint: '전지 ＋ 점에서 전구 2개로 전선을 하나씩! 한 점에 전선을 여러 개 이을 수 있어요.',
      check: ctx => { const l = ctx.lit(); return l.length >= 2 && l.every(b => inRange(ctx.A(b), 0.45, 0.55)); },
      learn: '길이 <b>두 갈래</b>라서 전구마다 전기가 넉넉해요. 둘 다 밝아요!<div class="pic">🔋 ➡️ 💡<br>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;↘️ 💡</div>',
      say: '성공! 나란히 이으면 전구 둘 다 밝아요.',
      parent: `<p><b>핵심 개념: 전구의 병렬연결</b><br>전구마다 전지의 1.5V가 그대로 걸립니다.</p>
        <p><b>계산</b><br>전구마다 1.5V ÷ 3Ω = 0.5A, 전지에서 나가는 전류는 0.5A + 0.5A = <b>1A</b>. 전체 저항은 3Ω ÷ 2 = 1.5Ω</p>
        <p><b>이렇게 말해 주세요</b><br>"길이 두 개면 차가 나눠서 쌩쌩 달릴 수 있어. 대신 전지는 두 배로 일해서 빨리 닳아."</p>
        <p><b>직렬과 비교</b><br>직렬(전구 기차) 0.25A vs 병렬 0.5A. 오른쪽 막대 그래프로 비교해 보세요.</p>`
    },
    {
      emoji: '🤝', title: '전지 친구',
      story: '전지 2개를 나란히 이어요. ＋는 ＋끼리, −는 −끼리!',
      goal: '전지 2개를 나란히 이어 불 켜기',
      inv: { battery: 2, bulb: 1 },
      hint: '＋끼리 전선 하나, −끼리 전선 하나. 그 다음 전구를 이어요!',
      check: ctx => {
        const bats = ctx.of('battery');
        return ctx.lit().some(b => inRange(ctx.A(b), 0.45, 0.55)) && bats.length >= 2 &&
          bats.every(b => inRange(ctx.I(b), 0.2, 0.3));
      },
      learn: '전지 둘이 <b>일을 나눠서</b> 해요. 밝기는 그대로, 대신 더 오래가요!<div class="pic">🔋<br>🔋 ➡️ 💡</div>',
      say: '성공! 전지 친구가 일을 나눠서 하니까 더 오래가요.',
      parent: `<p><b>핵심 개념: 전지의 병렬연결</b><br>전압은 1.5V 그대로라서 밝기는 전지 1개일 때와 같습니다.</p>
        <p><b>계산</b><br>1.5V ÷ 3Ω = 0.5A, 전지 하나는 0.5A ÷ 2 = <b>0.25A</b>씩만 보냅니다. 그래서 전지가 더 오래갑니다.</p>
        <p><b>안전</b><br>＋와 −를 바로 이으면 화면에 '합선' 경고가 나옵니다. 실제 전지로 하면 뜨거워져 위험하다고 꼭 알려 주세요.</p>`
    },
    {
      emoji: '🌀', title: '선풍기 쌩쌩',
      story: '선풍기를 가장 빠르게 돌려 봐요! 전지 3개를 줄줄이 이어요.',
      goal: '선풍기 가장 빠르게',
      inv: { battery: 3, motor: 1, switch: 1 },
      hint: '전지 3개를 기차처럼 이어요. 1개, 2개, 3개로 바꿔 보면서 빠르기를 봐요!',
      // 전지 3개가 줄줄이(직렬) 4.5V로 밀어서 선풍기가 돌면 성공
      check: ctx => ctx.of('motor').some(m => ctx.A(m) > 0.1 && ctx.push(m) >= 4.4),
      learn: '전지가 많을수록 <b>미는 힘이 세져서</b> 쌩쌩 돌아요!<div class="pic">🔋 → 🌀<br>🔋🔋 → 🌀🌀<br>🔋🔋🔋 → 🌀🌀🌀</div>',
      say: '성공! 전지가 많을수록 선풍기가 빨라져요.',
      parent: `<p><b>핵심 개념: 옴의 법칙 (전압 ∝ 전류)</b></p>
        <p><b>계산</b><br>전지 1개: 1.5V ÷ 3Ω = 0.5A<br>전지 2개: 3V ÷ 3Ω = 1A<br>전지 3개: 4.5V ÷ 3Ω = <b>1.5A</b><br>전압이 2배, 3배가 되면 전류도 2배, 3배가 됩니다.</p>
        <p><b>단순화</b><br>실제 모터는 돌면서 역기전력이 생겨 전류가 줄어듭니다. 여기서는 3Ω 저항처럼 계산하고, 회전 속도를 전류에 비례하게 보여줍니다.</p>`
    },
    {
      emoji: '🏠', title: '우리 집 전등',
      story: '전구 2개를 스위치 2개로 하나씩 따로 켜 봐요. 우리 집 전등처럼요!',
      goal: '전구를 하나씩 따로 켜기',
      inv: { battery: 1, bulb: 2, switch: 2 },
      hint: '전구 2개를 사다리처럼 나란히! 전구마다 스위치를 하나씩 붙여요.',
      progress: ctx => {
        const bulbs = ctx.of('bulb');
        if (!bulbs.length) return [{ text: '전구 2개, 스위치 2개 꺼내기', done: false }];
        return bulbs.map(b => ({ text: `${ctx.name(b)}만 혼자 켜기`, done: !!(ctx.memo.solo && ctx.memo.solo[b.id]) }));
      },
      check: ctx => {
        ctx.memo.solo = ctx.memo.solo || {};
        const bulbs = ctx.of('bulb'), lit = ctx.lit();
        if (bulbs.length >= 2 && lit.length === 1 && ctx.A(lit[0]) >= 0.45 && ctx.of('switch').some(s => s.open && ctx.wouldConduct(s)))
          ctx.memo.solo[lit[0].id] = true;
        return bulbs.filter(b => ctx.memo.solo[b.id]).length >= 2;
      },
      learn: '길이 <b>따로따로</b>라서 하나만 꺼도 다른 건 켜져 있어요!<div class="pic">🏠 거실 💡 &nbsp; 방 🌑</div>',
      say: '성공! 우리 집 전등도 이렇게 따로따로 켤 수 있어요.',
      parent: `<p><b>핵심 개념: 병렬회로와 독립 제어</b><br>병렬로 이어진 각 갈래는 서로 독립적이라, 한 갈래의 스위치를 열어도 다른 갈래에는 계속 전류가 흐릅니다.</p>
        <p><b>생활 연결</b><br>집의 전등과 콘센트는 모두 병렬로 연결되어 있습니다. 그래서 거실 불을 꺼도 방 불은 켜져 있어요.</p>
        <p><b>안전</b><br>집 전기(220V)는 건전지(1.5V)보다 훨씬 강해서 아주 위험합니다. 콘센트는 절대 만지면 안 된다고 알려 주세요.</p>`
    },
    {
      emoji: '🎯', title: '딱 알맞게',
      story: '전지 3개는 전구한테 너무 세요! 그냥 이으면 전구가 고장 나요. 저항으로 막아 줘요!',
      goal: '전지 3개로 보통 밝기 만들기',
      inv: { battery: 3, bulb: 1, resistor: 3 },
      hint: '전지 3개를 줄줄이 잇고, 전구와 저항을 한 줄로 이어요. 저항 몇 개가 좋을까요?',
      check: ctx => {
        const bats = ctx.of('battery');
        return bats.length >= 3 && bats.every(b => ctx.I(b) >= 0.45) && ctx.lit().some(b => inRange(ctx.A(b), 0.45, 0.55));
      },
      learn: '<b>저항</b>은 전기를 살짝 막아 줘요. 그래서 전구가 고장 나지 않아요!<div class="pic">🔋🔋🔋 ➡️ 🚧🚧 ➡️ 💡</div>',
      say: '성공! 저항이 전기를 알맞게 막아서 전구를 지켜 줬어요.',
      parent: `<p><b>핵심 개념: 저항으로 전류 조절</b><br>저항은 전류의 흐름을 방해하는 부품입니다. 직렬로 넣으면 전체 저항이 커져 전류가 줄어듭니다.</p>
        <p><b>계산</b><br>전구(3Ω) + 저항(3Ω) + 저항(3Ω) = 9Ω<br>4.5V ÷ 9Ω = <b>0.5A</b> (전구 보통 밝기)</p>
        <p><b>참고</b><br>저항 없이 전지 3개를 바로 이으면 4.5V ÷ 3Ω = 1.5A가 흘러 전구가 끊어집니다(이 앱에서는 1.2A 초과 시). 끊어진 전구는 클릭하면 새것으로 바뀝니다.</p>`
    },
    {
      emoji: '🔬', title: '자유 실험실',
      story: '모든 재료로 마음껏 만들어 봐요! 연필심도 전기가 통할까요?',
      goal: '마음껏 실험하기',
      inv: { battery: 6, bulb: 4, motor: 2, resistor: 4, switch: 3, clip: 1, coin: 1, eraser: 1, chopstick: 1, pencil: 1 },
      hint: '전지 수, 전구 수를 바꿔 보면서 전구 밝기가 어떻게 바뀌는지 봐요!',
      check: null,
      parent: `<p><b>함께 해볼 질문</b></p>
        <ul><li>전구 3개를 줄줄이 이으면? (1.5V ÷ 9Ω ≈ 0.17A, 더 어두움)</li>
        <li>전구 3개를 나란히 이으면? (전구마다 0.5A, 전지에서 1.5A)</li>
        <li>연필심(흑연)을 넣으면? (6Ω, 조금 통해서 어둡게 켜짐)</li>
        <li>전지 4개를 전구에 바로 이으면? (2A → 전구가 끊어짐)</li></ul>`
    }
  ];
  global.WORLD_BASE = BASE;
})(window);
