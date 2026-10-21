"""data/contests/*.json → public/ 정적 사이트.

    python3 -m pipeline.build              # site.json의 mode(preview/production)로 빌드
    python3 -m pipeline.build --mode production --out dist-check
"""
import argparse
import datetime as dt
import html
import json
import pathlib
import shutil

from .common import (ROOT, FIELDS, TYPES, fmt_long, fmt_md, load_contests, load_site, parse_date, timing,
                     today_kst)

E = html.escape
STATUS_LABEL = {"모집중": "모집 중", "모집예정": "모집 예정", "다음 회차 대기": "다음 회차 대기", "확인필요": "일정 확인 필요"}


class Site:
    def __init__(self, cfg, contests, mode, today):
        self.cfg = cfg
        self.name = cfg["name"]
        self.url = cfg["site_url"].rstrip("/")
        self.mode = mode
        self.today = today
        self.contests = contests
        self.by_id = {c["id"]: c for c in contests}
        for c in contests:
            c["_t"] = timing(c, today)
        self.sorted = sorted(contests, key=lambda c: (c["_t"]["sort"], c["name"]))

    # ---------- 공통 조각 ----------
    def type_slug(self, t):
        return self.cfg["types"][t]["slug"]

    def type_label(self, t):
        return self.cfg["types"][t]["label"]

    def field_slug(self, f):
        return self.cfg["fields"][f]

    def page(self, path, title, desc, body, jsonld=None, scripts=("app",), nav=""):
        full_title = f"{title} | {self.name}" if title != self.name else self.name
        canonical = self.url + path
        robots = '<meta name="robots" content="noindex, nofollow">' if self.mode == "preview" else ""
        ld = ""
        if jsonld:
            ld = '<script type="application/ld+json">' + json.dumps(jsonld, ensure_ascii=False).replace("</", "<\\/") + "</script>"
        js = "".join(f'<script src="/assets/{s}.js" defer></script>' for s in ("eligibility",) + tuple(scripts))
        links = [("/", "마감순 목록", "list"), ("/check/", "내 자격 판별", "check"), ("/calendar/", "12개월 일정", "calendar"), ("/about/", "소개", "about")]
        navhtml = "".join(
            f'<a href="{h}"{" aria-current=\"page\"" if k == nav else ""}>{E(t)}</a>' for h, t, k in links)
        return f"""<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{E(full_title)}</title>
<meta name="description" content="{E(desc)}">
{robots}
<link rel="canonical" href="{E(canonical)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="{E(self.name)}">
<meta property="og:locale" content="ko_KR">
<meta property="og:title" content="{E(full_title)}">
<meta property="og:description" content="{E(desc)}">
<meta property="og:url" content="{E(canonical)}">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/assets/fonts/pretendard.css">
<link rel="stylesheet" href="/assets/style.css">
{ld}
{js}
</head>
<body>
<a class="skip" href="#main">본문으로 건너뛰기</a>
<header class="top"><div class="wrap top-in">
<a class="brand" href="/"><img src="/assets/favicon.svg" alt="" width="28" height="28"><span>{E(self.name)}</span></a>
<nav class="nav" aria-label="주요 메뉴">{navhtml}</nav>
</div></header>
<main id="main" class="wrap">
{body}
</main>
<footer class="foot"><div class="wrap">
<p>{E(self.name)}는 대학원생이 참가할 수 있는 공모전·논문상·펠로우십의 공고를 모아 마감일과 참가 자격을 정리합니다. 각 항목의 공식 페이지 링크에서 원문 공고를 볼 수 있습니다.</p>
</div></footer>
</body>
</html>
"""

    def when_html(self, c):
        t = c["_t"]
        if t["kind"] == "set":
            return (f'<span class="when-main">{fmt_md(t["date"])}</span>'
                    f'<span class="when-sub" data-dday="{t["date"].isoformat()}">{t["date"].year}년</span>')
        if t["kind"] == "est":
            return f'<span class="when-main est">보통 {t["month"]}월</span><span class="when-sub">{t["year"]}년 예상</span>'
        if c.get("cycle") == "상시":
            return '<span class="when-main">상시</span><span class="when-sub">수시 접수</span>'
        return '<span class="when-main est">미정</span><span class="when-sub">일정 미공지</span>'

    def status_of(self, c):
        t = c["_t"]
        if t["kind"] == "set":
            return "모집 예정" if c.get("status") == "모집예정" else "모집 중"
        if t.get("passed"):
            return "이번 회차 마감"
        return STATUS_LABEL.get(c.get("status"), "다음 회차 대기")

    def row(self, c):
        fields = "|".join(c.get("fields", []))
        q = " ".join([c["name"], c["organizer"], c["type"], " ".join(c.get("fields", [])), c.get("eligibility") or ""]).lower()
        prize = f'<p class="row-prize">{E(c["prize"])}</p>' if c.get("prize") else ""
        return (f'<li class="row" data-id="{E(c["id"])}" data-type="{E(c["type"])}" data-fields="{E(fields)}" '
                f'data-q="{E(q)}" data-deadline="{E(c.get("nextDeadline") or "")}" '
                f'data-months="{",".join(str(m) for m in c.get("typicalMonths") or [])}" data-name="{E(c["name"])}">'
                f'<div class="when">{self.when_html(c)}</div>'
                f'<div class="what"><a class="row-name" href="/contests/{E(c["id"])}/">{E(c["name"])}</a>'
                f'<p class="row-meta">{E(c["organizer"])} · {E(c["type"])} · {E(self.status_of(c))}</p>{prize}</div>'
                f'<div class="verdict" data-verdict-for="{E(c["id"])}"></div></li>')

    def rows(self, items):
        return '<ul class="rows" data-rows>' + "".join(self.row(c) for c in items) + "</ul>"

    @staticmethod
    def description(parts, limit=80):
        out = ""
        for p in parts:
            if not p:
                continue
            cand = (out + " " + p).strip()
            if len(cand) <= limit:
                out = cand
        return out

    def deadline_sentence(self, c):
        t = c["_t"]
        if t["kind"] == "set":
            return f"다음 마감은 {fmt_long(t['date'])}입니다."
        if t["kind"] == "est":
            return f"보통 {t['month']}월에 마감합니다."
        if c.get("cycle") == "상시":
            return "상시 접수합니다."
        return "다음 일정은 아직 공지되지 않았습니다."

    @staticmethod
    def first_clause(s, limit=44):
        if not s:
            return ""
        for sep in (". ", ", ", " ("):
            if sep in s:
                s = s.split(sep, 1)[0]
        return s if len(s) <= limit else ""

    def breadcrumb_ld(self, items):
        return {"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": i + 1, "name": n, "item": self.url + p} for i, (n, p) in enumerate(items)]}

    # ---------- 페이지 ----------
    def home(self):
        set_items = [c for c in self.sorted if c["_t"]["kind"] == "set"]
        upcoming = "".join(
            f'<li><a href="/contests/{E(c["id"])}/"><span class="up-d" data-dday="{c["_t"]["date"].isoformat()}">'
            f'{fmt_md(c["_t"]["date"])}</span><span class="up-date">{fmt_md(c["_t"]["date"])}</span>'
            f'<span class="up-name">{E(c["name"])}</span></a></li>' for c in set_items[:8])
        type_opts = "".join(f'<option value="{E(t)}">{E(self.type_label(t))}</option>' for t in TYPES)
        field_opts = "".join(f'<option value="{E(f)}">{E(f)}</option>' for f in FIELDS)
        body = f"""
<section class="hero">
<h1>대학원생이 낼 수 있는 공모전·논문상·펠로우십 마감일</h1>
<p class="lead">학회 학생논문상, 기업 논문상, AI 챌린지, 설계 경진대회, 장학금 {len(self.contests)}건의 마감일과 참가 자격, 상금을 모았습니다. 과정과 소속을 넣으면 공모전마다 참가할 수 있는지 표시합니다.</p>
<div class="profile-bar" data-profile-bar><a class="btn" href="/check/">내 자격으로 판별하기</a></div>
</section>

<section class="block" aria-labelledby="up-h">
<h2 id="up-h">마감일이 공지된 공모전</h2>
<ol class="upcoming">{upcoming}</ol>
</section>

<section class="block" aria-labelledby="all-h">
<h2 id="all-h">전체 목록</h2>
<form class="filters" data-filters role="search" onsubmit="return false">
<label class="f-q"><span class="sr">검색</span><input id="f-q" type="search" placeholder="이름, 주최, 분야로 찾기" autocomplete="off"></label>
<label><span class="sr">유형</span><select id="f-type"><option value="">모든 유형</option>{type_opts}</select></label>
<label><span class="sr">분야</span><select id="f-field"><option value="">모든 분야</option>{field_opts}</select></label>
<label data-needs-profile hidden><span class="sr">내 자격</span><select id="f-verdict"><option value="">자격 전체</option><option value="ok">참가 가능만</option><option value="okcond">가능·조건부</option></select></label>
<label><span class="sr">정렬</span><select id="f-sort"><option value="deadline">마감 임박순</option><option value="name">이름순</option></select></label>
</form>
<p class="count" data-count>{len(self.contests)}건</p>
{self.rows(self.sorted)}
<p class="empty" data-empty hidden>조건에 맞는 공모전이 없습니다. 유형이나 분야 조건을 줄여 보세요.</p>
</section>
"""
        ld = {"@context": "https://schema.org", "@graph": [
            {"@type": "WebSite", "@id": self.url + "/#website", "url": self.url + "/", "name": self.name, "inLanguage": "ko"},
            {"@type": "ItemList", "name": "전체 목록", "numberOfItems": len(self.sorted), "itemListElement": [
                {"@type": "ListItem", "position": i + 1, "name": c["name"], "url": f"{self.url}/contests/{c['id']}/"}
                for i, c in enumerate(self.sorted)]}]}
        desc = f"대학원생이 낼 수 있는 공모전·논문상·펠로우십 {len(self.contests)}건의 마감일과 참가 자격. 내 과정을 넣으면 참가 가능 여부를 판별합니다."
        return self.page("/", self.name, self.description([desc]), body, ld, nav="list")

    def contest(self, c):
        t = c["_t"]
        type_path = f"/types/{self.type_slug(c['type'])}/"
        facts = [
            ("주최·주관", c.get("organizer")),
            ("유형", f'<a href="{type_path}">{E(self.type_label(c["type"]))}</a>', True),
            ("분야", ", ".join(f'<a href="/fields/{self.field_slug(f)}/">{E(f)}</a>' for f in c.get("fields", [])), True),
            ("참가 자격", c.get("eligibility")),
            ("상금·혜택", c.get("prize")),
            ("개최 주기", c.get("cycle")),
            ("보통 마감", c.get("typicalDeadline")),
            ("다음 회차", c.get("nextDeadlineNote")),
        ]
        dl = "".join(
            f'<div><dt>{E(k)}</dt><dd>{v if (len(f) > 2 and f[2]) else E(v)}</dd></div>'
            for f in facts for k, v in [f[:2]] if v)
        if t["kind"] == "set":
            due = (f'<p class="due-big"><span data-dday="{t["date"].isoformat()}">{fmt_long(t["date"])}</span></p>'
                   f'<p class="due-sub">{fmt_long(t["date"])} 마감 · {E(self.status_of(c))}</p>')
        else:
            due = (f'<p class="due-big est">{E(self.deadline_sentence(c))}</p>'
                   f'<p class="due-sub">{E(self.status_of(c))}</p>')
        needs = c["elig"].get("needs") or []
        needs_html = ("<section class=\"block\"><h2>준비할 것</h2><ul class=\"needs\">" +
                      "".join(f"<li>{E(n)}</li>" for n in needs) + "</ul></section>") if needs else ""
        links = []
        if c.get("url"):
            links.append(f'<a class="btn" href="{E(c["url"])}" rel="noopener" target="_blank">공식 페이지</a>')
        if c.get("sourceUrl") and c.get("sourceUrl") != c.get("url"):
            links.append(f'<a class="btn ghost" href="{E(c["sourceUrl"])}" rel="noopener" target="_blank">근거 출처</a>')
        related = [x for x in self.sorted if x["id"] != c["id"] and set(x.get("fields", [])) & set(c.get("fields", []))][:6]
        rel_html = (f'<section class="block"><h2>같은 분야의 다른 공모전</h2>{self.rows(related)}</section>') if related else ""
        body = f"""
<nav class="crumbs" aria-label="현재 위치"><a href="/">홈</a><span aria-hidden="true">›</span><a href="{type_path}">{E(self.type_label(c['type']))}</a></nav>
<article class="detail">
<header class="detail-head">
<h1>{E(c['name'])}</h1>
<p class="lead">{E(c.get('summary') or '')}</p>
</header>
<div class="detail-grid">
<section class="panel due" aria-label="마감">{due}</section>
<section class="panel my" aria-label="내 자격" data-my-elig="{E(c['id'])}">
<p class="my-title">내 자격</p>
<p class="my-body">과정과 소속을 넣으면 이 공모전에 참가할 수 있는지 바로 알려 드립니다.</p>
<a class="btn" href="/check/">내 자격 판별하기</a>
</section>
</div>
<section class="block"><h2>한눈에 보기</h2><dl class="facts">{dl}</dl></section>
{needs_html}
<div class="links">{''.join(links)}</div>
</article>
{rel_html}
"""
        path = f"/contests/{c['id']}/"
        labels = ["마감"] + (["자격"] if c.get("eligibility") else []) + (["상금"] if c.get("prize") else [])
        title = f"{c['name']} {'·'.join(labels)}"
        desc = self.description([self.deadline_sentence(c),
                                 ("참가 자격은 " + self.first_clause(c.get("eligibility")) + ".") if self.first_clause(c.get("eligibility")) else "",
                                 ("상금은 " + self.first_clause(c.get("prize")) + ".") if self.first_clause(c.get("prize")) else ""])
        ld = {"@context": "https://schema.org", "@graph": [
            {"@type": "WebPage", "@id": self.url + path, "url": self.url + path, "name": c["name"], "inLanguage": "ko",
             "dateModified": c["verifiedAt"], "isPartOf": {"@id": self.url + "/#website"}},
            self.breadcrumb_ld([("홈", "/"), (self.type_label(c["type"]), type_path), (c["name"], path)])]}
        return path, self.page(path, title, desc, body, ld)

    def listing(self, path, h1, lead, items, crumb):
        body = f"""
<nav class="crumbs" aria-label="현재 위치"><a href="/">홈</a></nav>
<section class="hero small"><h1>{E(h1)}</h1><p class="lead">{E(lead)}</p>
<div class="profile-bar" data-profile-bar><a class="btn" href="/check/">내 자격으로 판별하기</a></div></section>
<section class="block">{self.rows(items)}</section>
"""
        ld = {"@context": "https://schema.org", "@graph": [
            {"@type": "CollectionPage", "@id": self.url + path, "url": self.url + path, "name": h1, "inLanguage": "ko",
             "dateModified": max(c["verifiedAt"] for c in items), "isPartOf": {"@id": self.url + "/#website"}},
            self.breadcrumb_ld([("홈", "/"), (crumb, path)])]}
        nxt = [c for c in items if c["_t"]["kind"] == "set"]
        desc = self.description([f"{h1} {len(items)}건의 마감일과 참가 자격을 정리했습니다.",
                                 f"가장 가까운 마감은 {nxt[0]['name']}입니다." if nxt else ""])
        return self.page(path, f"{h1} {len(items)}건", desc, body, ld)

    def check(self):
        body = """
<section class="hero small">
<h1>내 정보로 참가 가능한 공모전 판별</h1>
<p class="lead">과정, 학적, 소속 대학, 국적, 생년월일을 넣으면 공모전마다 참가 가능, 조건부, 불가로 나눠 보여 줍니다. 입력한 정보는 이 브라우저에만 저장되고 서버로 보내지 않습니다.</p>
</section>
<div class="check-grid">
<form class="panel check-form" data-check-form onsubmit="return false">
<h2>내 정보</h2>
<label class="fld"><span>소속 대학</span><input id="p-university" type="text" placeholder="예: 아주대학교" autocomplete="organization"></label>
<div class="two">
<label class="fld"><span>과정</span><select id="p-level"><option value="학부">학부</option><option value="석사">석사과정</option><option value="박사">박사과정</option><option value="석박통합">석박통합과정</option><option value="박사후">박사후연구원</option><option value="일반">학생 아님</option></select></label>
<label class="fld"><span>학적</span><select id="p-status"><option>재학</option><option>휴학</option><option>입학예정</option><option>졸업예정</option><option>졸업</option></select></label>
</div>
<div class="two">
<label class="fld"><span>대학 위치</span><select id="p-uniCountry"><option>국내</option><option>해외</option></select></label>
<label class="fld"><span>대학 소재지</span><select id="p-uniRegion"><option value="">선택 안 함</option><option>서울</option><option>부산</option><option>대구</option><option>인천</option><option>광주</option><option>대전</option><option>울산</option><option>세종</option><option>경기</option><option>강원</option><option>충북</option><option>충남</option><option>전북</option><option>전남</option><option>경북</option><option>경남</option><option>제주</option></select></label>
</div>
<div class="two">
<label class="fld"><span>전공 계열</span><select id="p-field"><option>공학</option><option>자연과학</option><option value="기타">인문사회·예체능</option></select></label>
<label class="fld"><span>국적</span><select id="p-nationality"><option value="KR">대한민국</option><option value="other">외국</option></select></label>
</div>
<div class="two">
<label class="fld"><span>생년월일 <small>나이 조건 판별</small></span><input id="p-birth" type="date"></label>
<label class="fld"><span>입학 연월 <small>신입생 조건 판별</small></span><input id="p-entry" type="month"></label>
</div>
<label class="chk"><input id="p-fullTime" type="checkbox"> 전일제 학생</label>
<label class="chk"><input id="p-employed" type="checkbox"> 회사·연구소에 재직 중</label>
<fieldset class="members"><legend>가입한 학회</legend>
<label class="chk"><input type="checkbox" name="member" value="IEEE AP-S"> IEEE AP-S</label>
<label class="chk"><input type="checkbox" name="member" value="IEEE MTT-S"> IEEE MTT-S</label>
<label class="chk"><input type="checkbox" name="member" value="대한전자공학회"> 대한전자공학회</label>
</fieldset>
<p class="hint" data-default-note>지금은 기본값(국내 대학원 석사과정, 재학, 전일제)으로 판별하고 있습니다. 값을 바꾸면 이 브라우저에 저장됩니다.</p>
<button class="btn ghost" type="button" data-reset-profile>입력 지우기</button>
</form>
<section class="check-results" aria-live="polite">
<div class="tally" data-tally></div>
<div data-results><p class="hint">판별 결과를 불러오는 중입니다. 자바스크립트가 꺼져 있으면 <a href="/">전체 목록</a>에서 공모전별 참가 자격을 볼 수 있습니다.</p></div>
</section>
</div>
"""
        ld = {"@context": "https://schema.org", "@graph": [
            {"@type": "WebPage", "@id": self.url + "/check/", "url": self.url + "/check/", "name": "내 정보로 참가 가능한 공모전 판별",
             "inLanguage": "ko", "isPartOf": {"@id": self.url + "/#website"}}]}
        desc = "과정·학적·소속 대학·국적·나이를 넣으면 대학원생 공모전과 펠로우십마다 참가 가능 여부와 이유를 알려 줍니다."
        return self.page("/check/", "내 정보로 참가 가능한 공모전 판별", desc, body, ld, nav="check")

    def calendar_page(self):
        start = self.today.replace(day=1)
        cols = []
        y, m = start.year, start.month
        for _ in range(12):
            cols.append((y, m))
            m += 1
            if m > 12:
                y, m = y + 1, 1
        head = "".join(f'<th scope="col">{mm}월<small>{yy}</small></th>' for yy, mm in cols)
        rows = []
        for c in self.sorted:
            dl = parse_date(c.get("nextDeadline"))
            months = c.get("typicalMonths") or []
            cells = []
            for i, (yy, mm) in enumerate(cols):
                mark = ""
                if dl and dl >= self.today and (dl.year, dl.month) == (yy, mm):
                    mark = f'<span class="mk-set" title="{dl.isoformat()} 마감">{dl.day}일</span>'
                elif mm in months:
                    near = dl and dl >= self.today and abs((yy * 12 + mm) - (dl.year * 12 + dl.month)) <= 1
                    ended = i == 0 and dl and dl < self.today and (dl.year, dl.month) == (yy, mm)
                    if not near and not ended:
                        mark = '<span class="mk-typ" title="보통 이 달에 마감"></span>'
                cells.append(f"<td>{mark}</td>")
            rows.append(f'<tr><th scope="row"><a href="/contests/{E(c["id"])}/">{E(c["name"])}</a>'
                        f'<small>{E(self.type_label(c["type"]))}</small></th>{"".join(cells)}</tr>')
        body = f"""
<section class="hero small">
<h1>대학원생 공모전 12개월 마감 일정</h1>
<p class="lead">{cols[0][0]}년 {cols[0][1]}월부터 12개월 동안 공모전마다 어느 달에 마감하는지 한 표로 보여 줍니다. 숫자가 있는 칸은 공지된 마감일이고, 동그라미는 지난 회차를 기준으로 보통 마감하는 달입니다.</p>
</section>
<div class="cal-wrap"><table class="cal"><thead><tr><th scope="col">공모전</th>{head}</tr></thead><tbody>{"".join(rows)}</tbody></table></div>
"""
        ld = {"@context": "https://schema.org", "@graph": [
            {"@type": "WebPage", "@id": self.url + "/calendar/", "url": self.url + "/calendar/", "name": "대학원생 공모전 12개월 마감 일정",
             "inLanguage": "ko", "isPartOf": {"@id": self.url + "/#website"}}]}
        desc = "학회 논문상, AI 챌린지, 설계 경진대회, 펠로우십이 어느 달에 마감하는지 12개월 표로 정리했습니다."
        return self.page("/calendar/", "대학원생 공모전 12개월 마감 일정", desc, body, ld, nav="calendar")

    def about(self):
        body = f"""
<section class="hero small"><h1>{E(self.name)} 소개</h1>
<p class="lead">대학원생이 참가할 수 있는 학회 학생논문상, 기업 논문상, AI·데이터 챌린지, 설계 경진대회, 특허 공모전, 펠로우십·장학금을 한곳에 모은 사이트입니다.</p></section>
<section class="block prose">
<h2>마감일을 적는 방법</h2>
<p>주최 측이 공고한 마감일이 있으면 그 날짜를 적고 남은 날을 D-day로 보여 줍니다. 공고 전인 회차는 지난 회차의 접수 기간을 보고 보통 마감하는 달을 적습니다. 학회 학생논문상처럼 학술대회 논문 마감과 같이 가는 상은 학술대회 논문 마감일을 기준으로 합니다.</p>
<h2>참가 자격을 판별하는 방법</h2>
<p>공모전마다 공고의 참가 자격을 과정(학부·석사·박사), 학적, 전일제 여부, 국내·해외 대학, 대학 소재지, 국적, 나이, 재직 여부, 전공 계열, 학회 회원 조건으로 나눠 두었습니다. <a href="/check/">내 자격 판별</a>에 넣은 정보와 이 조건을 비교해 참가 가능, 조건부, 불가로 나눕니다. 대학 추천이나 성적 기준처럼 사이트가 확인할 수 없는 조건이 있으면 조건부로 표시하고 무엇을 확인해야 하는지 적습니다.</p>
<p>입력한 정보는 이 브라우저의 저장소(localStorage)에만 남고 서버로 보내지 않습니다. '입력 지우기'를 누르면 지워집니다.</p>
<h2>출처</h2>
<p>공모전마다 공식 페이지와 근거로 삼은 페이지를 링크합니다. 날짜와 상금은 원문 공고 기준이며, 주최 측이 일정을 바꾸면 공식 페이지가 우선합니다.</p>
</section>
"""
        ld = {"@context": "https://schema.org", "@graph": [
            {"@type": "AboutPage", "@id": self.url + "/about/", "url": self.url + "/about/", "name": f"{self.name} 소개",
             "inLanguage": "ko", "isPartOf": {"@id": self.url + "/#website"}}]}
        desc = "마감일을 적는 방법, 참가 자격을 판별하는 방법, 출처를 다는 방법을 설명합니다."
        return self.page("/about/", "소개", desc, body, ld, nav="about")

    def not_found(self):
        body = """<section class="hero small"><h1>페이지를 찾을 수 없습니다</h1>
<p class="lead">주소가 바뀌었거나 없어진 공모전입니다. <a href="/">마감순 목록</a>에서 다시 찾아 보세요.</p></section>"""
        return self.page("/404.html", "페이지를 찾을 수 없습니다", "요청한 페이지가 없습니다.", body)

    def data_json(self):
        keep = ["name", "organizer", "type", "fields", "nextDeadline", "typicalMonths", "typicalDeadline", "cycle", "status", "prize", "elig"]
        return json.dumps([dict({"id": c["id"]}, **{k: c.get(k) for k in keep}) for c in self.sorted], ensure_ascii=False)


def write(out, path, text):
    target = out / path.lstrip("/")
    if path.endswith("/"):
        target = target / "index.html"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding="utf8")


def build(out, mode=None, today=None, data_dir=None):
    cfg = load_site()
    mode = mode or cfg["mode"]
    today = today or today_kst()
    contests = load_contests(data_dir or ROOT / "data" / "contests")
    site = Site(cfg, contests, mode, today)
    out = pathlib.Path(out)
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    shutil.copytree(ROOT / "assets", out / "assets")

    pages = {}
    pages["/"] = site.home()
    for c in contests:
        path, text = site.contest(c)
        pages[path] = text
    for t in TYPES:
        items = [c for c in site.sorted if c["type"] == t]
        if items:
            label = site.type_label(t)
            pages[f"/types/{site.type_slug(t)}/"] = site.listing(
                f"/types/{site.type_slug(t)}/", f"대학원생이 낼 수 있는 {label}",
                f"{label} {len(items)}건을 마감이 가까운 순서로 모았습니다.", items, label)
    for f in FIELDS:
        items = [c for c in site.sorted if f in c.get("fields", [])]
        if items:
            pages[f"/fields/{site.field_slug(f)}/"] = site.listing(
                f"/fields/{site.field_slug(f)}/", f"{f} 분야 대학원생 공모전",
                f"{f} 분야의 논문상, 경진대회, 펠로우십 {len(items)}건을 마감이 가까운 순서로 모았습니다.", items, f)
    pages["/check/"] = site.check()
    pages["/calendar/"] = site.calendar_page()
    pages["/about/"] = site.about()
    for p, text in pages.items():
        write(out, p, text)
    write(out, "/404.html", site.not_found())
    (out / "data").mkdir(exist_ok=True)
    (out / "data" / "contests.json").write_text(site.data_json(), encoding="utf8")

    # 사이트맵: lastmod는 데이터 날짜만 쓴다(빌드 날짜를 쓰지 않는다).
    latest = max(c["verifiedAt"] for c in contests)
    urls = []
    for p in pages:
        if p.startswith("/contests/"):
            lm = site.by_id[p.split("/")[2]]["verifiedAt"]
        else:
            lm = latest
        urls.append(f"<url><loc>{site.url}{p}</loc><lastmod>{lm}</lastmod></url>")
    (out / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "\n".join(urls) + "\n</urlset>\n", encoding="utf8")
    if mode == "preview":
        robots = "User-agent: *\nDisallow: /\n"
    else:
        robots = f"User-agent: *\nAllow: /\n\nSitemap: {site.url}/sitemap.xml\n"
    (out / "robots.txt").write_text(robots, encoding="utf8")
    return {"mode": mode, "pages": len(pages) + 1, "contests": len(contests), "out": str(out)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(ROOT / "public"))
    ap.add_argument("--mode", choices=["preview", "production"])
    ap.add_argument("--today", help="YYYY-MM-DD (시험용 고정 날짜)")
    args = ap.parse_args()
    today = dt.date.fromisoformat(args.today) if args.today else None
    print(json.dumps(build(args.out, args.mode, today), ensure_ascii=False))


if __name__ == "__main__":
    main()
