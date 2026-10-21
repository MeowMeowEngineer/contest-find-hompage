"""python3 -m unittest discover -s tests"""
import datetime as dt
import json
import pathlib
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from pipeline import build, validate  # noqa: E402
from pipeline.common import load_contests, load_site, timing  # noqa: E402

TODAY = dt.date(2026, 10, 21)


class TimingTest(unittest.TestCase):
    def test_announced_deadline(self):
        t = timing({"nextDeadline": "2026-12-08"}, TODAY)
        self.assertEqual((t["kind"], t["days"]), ("set", 48))

    def test_passed_this_month_moves_to_next_year(self):
        t = timing({"nextDeadline": "2026-10-16", "typicalMonths": [10]}, TODAY)
        self.assertEqual((t["kind"], t["year"], t["month"]), ("est", 2027, 10))

    def test_typical_month_later_this_year(self):
        t = timing({"typicalMonths": [12]}, TODAY)
        self.assertEqual((t["year"], t["month"]), (2026, 12))


class BuildTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.out = pathlib.Path(cls.tmp.name) / "out"
        cls.result = build.build(cls.out, "preview", TODAY)
        cls.cfg = load_site()
        cls.contests = load_contests(ROOT / "data" / "contests")

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_every_contest_has_a_page(self):
        for c in self.contests:
            self.assertTrue((self.out / "contests" / c["id"] / "index.html").exists(), c["id"])

    def test_validate_has_no_errors(self):
        self.assertEqual(validate.check_data(self.contests, self.cfg), [])
        errors, _ = validate.check_out(self.out, self.cfg, "preview")
        self.assertEqual(errors, [])

    def test_preview_is_noindex(self):
        home = (self.out / "index.html").read_text(encoding="utf8")
        self.assertIn('content="noindex, nofollow"', home)
        self.assertIn("Disallow: /", (self.out / "robots.txt").read_text(encoding="utf8"))

    def test_sitemap_uses_data_dates(self):
        sm = (self.out / "sitemap.xml").read_text(encoding="utf8")
        self.assertNotIn(TODAY.isoformat() + "T", sm)
        c = self.contests[0]
        self.assertIn(f"/contests/{c['id']}/</loc><lastmod>{c['verifiedAt']}</lastmod>", sm)

    def test_data_json_matches_pages(self):
        data = json.loads((self.out / "data" / "contests.json").read_text(encoding="utf8"))
        self.assertEqual(len(data), len(self.contests))
        self.assertTrue(all("elig" in d for d in data))

    def test_check_page_has_form(self):
        html = (self.out / "check" / "index.html").read_text(encoding="utf8")
        for fid in ("p-role", "p-birth", "p-residence", "p-nationality", "p-status", "p-uniRegion", "p-entry", "p-fullTime", "p-employed"):
            self.assertIn(f'id="{fid}"', html)

    def test_audience_pages(self):
        for a in self.cfg["audiences"]:
            self.assertTrue((self.out / "for" / a["slug"] / "index.html").exists(), a["slug"])

    def test_rows_link_to_official_pages(self):
        home = (self.out / "index.html").read_text(encoding="utf8")
        linked = [c for c in self.contests if c.get("url") or c.get("sourceUrl")]
        self.assertEqual(home.count('data-out="'), len(linked))


class ProductionTest(unittest.TestCase):
    def test_production_build_drops_noindex(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = pathlib.Path(tmp) / "out"
            build.build(out, "production", TODAY)
            home = (out / "index.html").read_text(encoding="utf8")
            self.assertNotIn("noindex", home)
            self.assertIn("Sitemap: ", (out / "robots.txt").read_text(encoding="utf8"))


if __name__ == "__main__":
    unittest.main()
