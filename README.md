# ⚡ 꼬마 전기 실험실

6세 어린이를 위한 전기회로 실험 웹 게임입니다. 건전지·전구·스위치를 마우스로 끌어다 전선으로 이으면,
실제 회로 계산(옴의 법칙 + 키르히호프 법칙)으로 전류가 얼마나 흐르는지 숫자, 수식, 움직이는 점, 전구 밝기로 보여줍니다.

## 바로 하기

👉 **https://hellohanaworld.github.io/baby_electric_circuit/** (크롬 권장)

`main` 브랜치에 올리면 GitHub Actions가 `public/` 폴더를 GitHub Pages로 자동 배포합니다.

## 내 PC에서 실행

```bash
node server.js            # http://localhost:8080
PORT=3000 node server.js  # 포트 바꾸기 (PowerShell: $env:PORT=3000; node server.js)
```

Node.js 16 이상이면 되고, 설치할 패키지는 없습니다. `public/` 폴더는 정적 파일이라 Netlify, GitHub Pages, Vercel,
nginx 같은 곳에 그대로 올려도 됩니다.

Docker:

```bash
docker build -t kkoma-circuit .
docker run -p 8080:8080 kkoma-circuit
```

## 구성

| 파일 | 역할 |
|---|---|
| `server.js` | 의존성 없는 정적 파일 서버 (`/health` 상태 확인용) |
| `public/js/sim.js` | 회로 계산 엔진 (마디 해석법), 직렬/병렬 판별, 아이 눈높이 수식 생성 |
| `public/js/missions.js` | 미션 11개 (재료, 목표, 힌트, 성공 설명) |
| `public/js/app.js` | 화면 그리기, 드래그, 전류 애니메이션, 효과음, 한국어 읽어주기 |

## 미션

1. 불을 켜 봐요 (닫힌 회로)
2. 스위치로 켰다 껐다
3. 전기가 통할까? (도체와 부도체)
4. 더 밝게! 전지 2개 (전지 직렬: 1A)
5. 전구 2개를 줄줄이 (전구 직렬: 0.25A)
6. 전구 2개를 나란히 (전구 병렬: 0.5A씩, 합쳐서 1A)
7. 전지 2개를 나란히 (전지 병렬: 0.25A씩)
8. 선풍기를 쌩쌩! (전지 3개: 1.5A)
9. 전구 따로따로 켜기 (병렬 + 스위치)
10. 알맞은 밝기 맞추기 (저항: 4.5V ÷ 9Ω = 0.5A)
11. 자유 실험실

진행 상황은 브라우저 localStorage에 저장됩니다.
