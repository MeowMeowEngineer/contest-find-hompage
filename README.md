# 대학원 공모전 레이더

대학원생이 낼 수 있는 학회 논문상, 기업 논문상, AI 챌린지, 설계 경진대회, 펠로우십 66건의 마감일과 참가 자격을 모은 정적 사이트입니다. 과정·학적·소속 대학·국적·생년월일을 넣으면 공모전마다 참가 가능, 조건부, 불가를 이유와 함께 보여 줍니다.

- 미리보기 주소: https://gongmo-radar.vercel.app (Vercel 프로젝트를 만든 뒤 열립니다)
- 작업 규칙: [`CLAUDE.md`](CLAUDE.md), 데이터 표준: [`docs/data_standard.md`](docs/data_standard.md)

## 구조

| 경로 | 내용 |
|---|---|
| `data/contests/*.json` | 공모전 하나에 파일 하나(원본) |
| `site.json` | 사이트 이름, 주소(`site_url`), 미리보기/공개 모드, 유형·분야 주소 |
| `pipeline/build.py` | `public/` 빌드: 홈, 공모전 66쪽, 유형·분야 목록, `/check/`, `/calendar/`, `/about/`, sitemap, robots |
| `pipeline/validate.py` | 데이터 형식, 제목·설명 길이, JSON-LD가 화면과 같은지, 깨진 링크, noindex를 검사 |
| `assets/eligibility.js` | 자격 판별 규칙(브라우저·시험 공용) |
| `assets/app.js` | D-day, 목록 필터, 판별 화면 |
| `public/` | 빌드 결과. Vercel이 그대로 배포 |

## 명령

```bash
python3 -m pipeline.build && python3 -m pipeline.validate
python3 -m unittest discover -s tests
node --test tests/*.test.cjs
python3 -m http.server 8851 --directory public     # http://127.0.0.1:8851
```

Python 3.11 이상, Node 22 이상. 외부 패키지는 쓰지 않습니다.

## Vercel 연결 (처음 한 번)

1. https://vercel.com/new 에서 GitHub 저장소 `contest-find-hompage`를 Import 합니다.
2. Project Name을 `gongmo-radar`로 바꿉니다. 이미 쓰이는 이름이면 `grad-contest-radar`로 합니다. 이 이름이 주소(`<이름>.vercel.app`)가 됩니다.
3. Framework Preset은 `Other`, Build Command는 비우고, Output Directory는 `public`으로 둡니다(`vercel.json`에도 적혀 있습니다).
4. Deploy를 누릅니다. 그 뒤로는 `main`에 push할 때마다 자동으로 배포됩니다.
5. 프로젝트 이름을 다르게 정했다면 `site.json`의 `site_url`을 그 주소로 바꾸고 다시 빌드해 push합니다.
