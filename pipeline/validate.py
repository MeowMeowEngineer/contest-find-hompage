"""데이터와 빌드 결과 검사. 오류가 하나라도 있으면 종료 코드 1.

    python3 -m pipeline.validate                    # data + public/ 검사, site.json mode 기준
    python3 -m pipeline.validate --out dist-check --mode production
"""
import argparse
import html
import json
import pathlib
import re
import sys
from html.parser import HTMLParser

from .common import (CYCLES, ELIG_KEYS, FIELDS, LEVELS, REGIONS, REQUIRED, ROOT, STATUS, TYPES, load_contests,
                     load_site, parse_date)

DESC_WARN = 80     # 네이버가 80자 넘는 설명에 경고를 낸다
DESC_MAX = 160
LD_SKIP_KEYS = {"@context", "@type", "@id", "url", "item", "inLanguage", "dateModified"}


def check_data(contests, cfg):
    errors = []
    for c in contests:
        cid = c["id"]
        if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", cid):
            errors.append(f"{cid}: id는 영문 소문자·숫자·하이픈만 씁니다")
        for k in REQUIRED:
            if not c.get(k):
                errors.append(f"{cid}: {k} 없음")
        if c.get("type") not in TYPES:
            errors.append(f"{cid}: 알 수 없는 type {c.get('type')}")
        for f in c.get("fields", []):
            if f not in FIELDS:
                errors.append(f"{cid}: 알 수 없는 분야 {f}")
        if c.get("status") not in STATUS:
            errors.append(f"{cid}: 알 수 없는 status {c.get('status')}")
        if c.get("cycle") not in CYCLES:
            errors.append(f"{cid}: 알 수 없는 cycle {c.get('cycle')}")
        if c.get("nextDeadline") is not None and not parse_date(c["nextDeadline"]):
            errors.append(f"{cid}: nextDeadline 형식은 YYYY-MM-DD")
        if not parse_date(c.get("verifiedAt")):
            errors.append(f"{cid}: verifiedAt 형식은 YYYY-MM-DD")
        for m in c.get("typicalMonths") or []:
            if not (isinstance(m, int) and 1 <= m <= 12):
                errors.append(f"{cid}: typicalMonths 값 {m}")
        for k in ("url", "sourceUrl"):
            if c.get(k) and not str(c[k]).startswith("https://") and not str(c[k]).startswith("http://"):
                errors.append(f"{cid}: {k}가 http(s) 주소가 아님")
        if not c.get("url") and not c.get("sourceUrl"):
            errors.append(f"{cid}: url과 sourceUrl이 모두 없음")
        e = c.get("elig") or {}
        unknown = set(e) - ELIG_KEYS
        if unknown:
            errors.append(f"{cid}: elig에 모르는 키 {sorted(unknown)}")
        for lv in e.get("who", []):
            if lv not in LEVELS:
                errors.append(f"{cid}: elig.who 값 {lv}")
        for r in (e.get("residence") or []) + (e.get("regions") or []):
            if r not in REGIONS:
                errors.append(f"{cid}: 시·도 이름 {r}")
        if c.get("type") in TYPES and c["type"] not in cfg["types"]:
            errors.append(f"{cid}: site.json types에 {c['type']} 주소가 없음")
        if "age" in e and not ({"min", "max"} & set(e["age"])):
            errors.append(f"{cid}: elig.age에 min이나 max가 필요")
        if e.get("age", {}).get("ref") and not parse_date(e["age"]["ref"]):
            errors.append(f"{cid}: elig.age.ref 형식")
    return errors


class TextAndLinks(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.text = []
        self.links = []
        self.ld = []
        self.meta = {}
        self.title = ""
        self._skip = 0
        self._in_ld = False
        self._in_title = False
        self._ld_buf = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "script":
            if a.get("type") == "application/ld+json":
                self._in_ld = True
            self._skip += 1
        elif tag == "style":
            self._skip += 1
        elif tag == "title":
            self._in_title = True
        elif tag == "a" and a.get("href"):
            self.links.append(a["href"])
        elif tag in ("link", "script") and (a.get("href") or a.get("src")):
            self.links.append(a.get("href") or a.get("src"))
        elif tag == "meta":
            key = a.get("name") or a.get("property")
            if key:
                self.meta[key] = a.get("content", "")
        elif tag == "img" and a.get("src"):
            self.links.append(a["src"])
        if tag == "link" and a.get("href"):
            if a.get("rel") == "canonical":
                self.meta["canonical"] = a["href"]
            else:
                self.links.append(a["href"])

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self._skip -= 1
            if self._in_ld:
                self.ld.append("".join(self._ld_buf))
                self._ld_buf = []
                self._in_ld = False
        elif tag == "title":
            self._in_title = False

    def handle_data(self, data):
        if self._in_ld:
            self._ld_buf.append(data)
        elif self._in_title:
            self.title += data
        elif not self._skip:
            self.text.append(data)


def ld_strings(node, key=None):
    if isinstance(node, dict):
        for k, v in node.items():
            if k in LD_SKIP_KEYS:
                continue
            yield from ld_strings(v, k)
    elif isinstance(node, list):
        for v in node:
            yield from ld_strings(v, key)
    elif isinstance(node, str):
        yield node


def check_out(out, cfg, mode):
    errors, warnings = [], []
    out = pathlib.Path(out)
    site_url = cfg["site_url"].rstrip("/")
    pages = sorted(out.rglob("*.html"))
    if not pages:
        return [f"{out}: HTML이 없음"], []
    for f in pages:
        rel = "/" + str(f.relative_to(out)).replace("index.html", "")
        p = TextAndLinks()
        p.feed(f.read_text(encoding="utf8"))
        text = re.sub(r"\s+", " ", " ".join(p.text))
        if not p.title.endswith(cfg["name"]):
            errors.append(f"{rel}: 제목이 사이트 이름으로 끝나지 않음")
        desc = p.meta.get("description", "")
        if not desc:
            errors.append(f"{rel}: description 없음")
        elif len(desc) > DESC_MAX:
            errors.append(f"{rel}: description {len(desc)}자")
        elif len(desc) > DESC_WARN:
            warnings.append(f"{rel}: description {len(desc)}자(80자 넘음)")
        canon = p.meta.get("canonical", "")
        if not canon.startswith(site_url + "/"):
            errors.append(f"{rel}: canonical이 site_url로 시작하지 않음")
        noindex = "noindex" in p.meta.get("robots", "")
        if mode == "preview" and not noindex:
            errors.append(f"{rel}: 미리보기인데 noindex가 없음")
        if mode == "production" and noindex:
            errors.append(f"{rel}: 공개 빌드에 noindex가 남음")
        for raw in p.ld:
            try:
                data = json.loads(raw)
            except json.JSONDecodeError as ex:
                errors.append(f"{rel}: JSON-LD 파싱 실패 {ex}")
                continue
            for s in ld_strings(data):
                if s and s not in text and html.unescape(s) not in text:
                    errors.append(f"{rel}: JSON-LD 값이 화면에 없음: {s[:40]}")
            for s in re.findall(r'"(https?://[^"]+)"', raw):
                if not s.startswith(site_url) and s != "https://schema.org":
                    errors.append(f"{rel}: JSON-LD 주소가 site_url 밖: {s}")
        for href in p.links:
            if href.startswith(("http://", "https://", "mailto:", "#")):
                continue
            path = href.split("#")[0].split("?")[0]
            target = out / path.lstrip("/")
            if path.endswith("/"):
                target = target / "index.html"
            if not target.exists():
                errors.append(f"{rel}: 깨진 내부 링크 {href}")
    robots = (out / "robots.txt").read_text(encoding="utf8") if (out / "robots.txt").exists() else ""
    if mode == "preview" and "Disallow: /" not in robots:
        errors.append("robots.txt: 미리보기인데 Disallow: / 가 없음")
    if mode == "production" and "Disallow: /" in robots:
        errors.append("robots.txt: 공개 빌드에 Disallow: / 가 남음")
    sm = (out / "sitemap.xml").read_text(encoding="utf8") if (out / "sitemap.xml").exists() else ""
    for f in pages:
        rel = "/" + str(f.relative_to(out)).replace("index.html", "")
        if rel == "/404.html":
            continue
        if f"<loc>{site_url}{rel}</loc>" not in sm:
            errors.append(f"sitemap.xml: {rel} 없음")
    vercel = json.loads((ROOT / "vercel.json").read_text(encoding="utf8"))
    has_header = "noindex" in json.dumps(vercel.get("headers", []))
    if mode == "production" and has_header:
        errors.append("vercel.json: 공개 빌드인데 X-Robots-Tag noindex 헤더가 남음")
    if mode == "preview" and not has_header:
        errors.append("vercel.json: 미리보기인데 X-Robots-Tag noindex 헤더가 없음")
    return errors, warnings


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(ROOT / "public"))
    ap.add_argument("--mode", choices=["preview", "production"])
    args = ap.parse_args()
    cfg = load_site()
    mode = args.mode or cfg["mode"]
    contests = load_contests(ROOT / "data" / "contests")
    errors = check_data(contests, cfg)
    out_err, warnings = check_out(args.out, cfg, mode)
    errors += out_err
    for w in warnings:
        print("경고", w)
    for e in errors:
        print("오류", e)
    print(json.dumps({"mode": mode, "contests": len(contests), "errors": len(errors), "warnings": len(warnings)}, ensure_ascii=False))
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
