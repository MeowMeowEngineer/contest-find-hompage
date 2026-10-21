"""빌드와 검증이 함께 쓰는 데이터 읽기·날짜 계산."""
import calendar
import datetime as dt
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
KST = dt.timezone(dt.timedelta(hours=9))

TYPES = ["논문상", "학생논문경진", "AI·데이터 챌린지", "설계·개발 경진", "아이디어·특허 공모", "펠로우십·장학",
         "문학·수기", "영상·사진", "디자인·미술", "창업·사업화", "과학·탐구 대회"]
FIELDS = ["전자파·RF", "반도체·회로", "통신·네트워크", "AI·데이터", "전기·전력", "컴퓨터·SW", "과학기술 전반", "국방",
          "문화·예술", "사회·정책", "환경", "관광·지역", "복지·건강", "경제·금융", "교육"]
STATUS = ["모집중", "모집예정", "다음 회차 대기", "확인필요"]
CYCLES = ["연 1회", "연 2회", "상시", "비정기"]
LEVELS = ["초등", "중등", "고등", "학부", "석사", "박사", "박사후", "일반"]
REGIONS = ["서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종", "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"]
WEEKDAYS = "월화수목금토일"

REQUIRED = ["name", "organizer", "type", "fields", "summary", "verifiedAt", "elig"]
ELIG_KEYS = {"who", "status", "fullTime", "uni", "regions", "nationality", "foreignNote", "age", "unemployed",
             "generalUnemployed", "employed", "fieldReq", "newStudent", "members", "manual", "needs", "unknown",
             "limitedFor", "residence"}


def load_site(root=ROOT):
    return json.loads((root / "site.json").read_text(encoding="utf8"))


def load_contests(data_dir):
    out = []
    for f in sorted(pathlib.Path(data_dir).glob("*.json")):
        c = json.loads(f.read_text(encoding="utf8"))
        c["id"] = f.stem
        out.append(c)
    return out


def today_kst():
    return dt.datetime.now(KST).date()


def parse_date(s):
    if not isinstance(s, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", s):
        return None
    return dt.date.fromisoformat(s)


def month_end(y, m):
    return dt.date(y, m, calendar.monthrange(y, m)[1])


def timing(c, today):
    """공지된 마감일이 남아 있으면 그 날짜, 아니면 '보통 마감하는 달'의 다음 차례를 예상값으로 쓴다.
    app.js의 timing()과 같은 규칙이다."""
    dl = parse_date(c.get("nextDeadline"))
    passed = dl is not None and dl < today
    if dl and not passed:
        days = (dl - today).days
        return {"kind": "set", "date": dl, "days": days, "sort": days}
    months = [m for m in c.get("typicalMonths") or [] if 1 <= m <= 12]
    if months:
        best = None
        for m in months:
            y = today.year
            if month_end(y, m) < today:
                y += 1
            if passed and dl.year == y and dl.month == m:
                y += 1
            end = month_end(y, m)
            if best is None or end < best[0]:
                best = (end, y, m)
        return {"kind": "est", "year": best[1], "month": best[2], "sort": (best[0] - today).days + 0.5, "passed": passed}
    return {"kind": "none", "sort": 10 ** 6, "passed": passed}


def fmt_md(d):
    return f"{d.month:02d}.{d.day:02d} ({WEEKDAYS[d.weekday()]})"


def fmt_long(d):
    return f"{d.year}년 {d.month}월 {d.day}일"
