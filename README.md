# 공모 레이더

청소년부터 어르신까지 참가할 수 있는 공모전·대회·논문상·장학금의 마감일과 참가 자격을 모은 정적 사이트입니다. 생년월일·신분·거주 지역·국적(학생이면 학적·소속 대학)을 넣으면 공모전마다 참가 가능, 조건부, 불가를 이유와 함께 보여 주고, 공식 페이지로 바로 연결합니다.

- 미리보기 주소: https://gongmo-radar.vercel.app (지금은 모든 페이지 noindex)
- 작업 규칙: [`CLAUDE.md`](CLAUDE.md), 데이터 표준: [`docs/data_standard.md`](docs/data_standard.md)

## 구조

| 경로 | 내용 |
|---|---|
| `data/contests/*.json` | 공모전 하나에 파일 하나(원본) |
| `site.json` | 사이트 이름, 주소(`site_url`), 미리보기/공개 모드, 유형·분야 주소 |
| `pipeline/build.py` | `public/` 빌드: 홈, 공모전마다 한 쪽, 대상별(`/for/`)·유형·분야 목록, `/check/`, `/calendar/`, `/about/`, sitemap, robots |
| `tools/verdicts.cjs` | 대상별 대표 프로필로 판별해 대상별 페이지에 넣을 공모전을 고른다(빌드가 부른다) |
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

Python 3.11 이상, Node 22 이상(빌드에도 필요). 외부 패키지는 쓰지 않습니다.

## 배포 (Vercel)

- Vercel 계정 `jangstar-5887`, 프로젝트 `contest-find-hompage`. GitHub `main`에 push하면 `public/`이 그대로 배포됩니다(빌드 명령 없음, 설정은 `vercel.json`).
- 주소: 프로젝트 Settings → Domains에 `gongmo-radar.vercel.app`을 추가해 씁니다(2026-10-21). `site.json`의 `site_url`과 같아야 합니다.
- `contest-find-hompage-…-jangstar-5887.vercel.app` 같은 배포별 주소는 Vercel에 로그인한 사람만 열립니다. 남에게는 `gongmo-radar.vercel.app`을 보냅니다.
- 공개 전환 절차는 [`CLAUDE.md`](CLAUDE.md) 7절에 있습니다.
