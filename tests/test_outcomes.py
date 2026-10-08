"""Outcome tracking: learning gain, retention checks, transfer, trends, the Outcomes.md note and the CSV export."""
import csv
import datetime as dt
import io
import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import server  # noqa: E402


def ago(days):
    return (dt.date.today() - dt.timedelta(days=days)).isoformat()


def prob(purpose, topic, passed, total, hints=0, date=None, **kw):
    return dict({"type": "problem", "purpose": purpose, "topic": topic, "passed": passed, "total": total, "solved": passed == total,
                 "hints": hints, "rung": 5, "ms": 300000, "date": date or ago(0)}, **kw)


class OutcomesTest(unittest.TestCase):
    def test_normalized_gain(self):
        ev = [prob("pre", "Maps", 1, 4, date=ago(20)), prob("post", "Maps", 4, 4, date=ago(5)),
              prob("pre", "Loops", 2, 4, date=ago(20)), prob("post", "Loops", 3, 4, date=ago(3)),
              prob("pre", "Sets", 0, 4, date=ago(2))]                      # no post-check yet: not counted
        st = server.outcome_stats(ev)
        gains = {g["topic"]: g["gain"] for g in st["gains"]}
        self.assertEqual(gains, {"Maps": 1.0, "Loops": 0.5})
        self.assertEqual(st["avg_gain"], 0.75)

    def test_retention_schedule(self):
        ev = [{"type": "mastered", "topic": "Maps", "date": ago(65)}, {"type": "mastered", "topic": "Loops", "date": ago(10)}]
        self.assertEqual(server.retention_due(ev), [("Maps", 30)])
        ev.append(prob("retention", "Maps", 3, 3, date=ago(30), window=30))
        self.assertEqual(server.retention_due(ev), [("Maps", 60)])
        ev.append(prob("retention", "Maps", 1, 3, hints=2, window=60))
        self.assertEqual(server.retention_due(ev), [])
        st = server.outcome_stats(ev)
        self.assertEqual(st["retention"], {30: {"n": 1, "kept": 1}, 60: {"n": 1, "kept": 0}})
        self.assertEqual(st["retention_rate"], 0.5)

    def test_transfer_and_trends(self):
        ev = [prob("transfer", "Maps", 3, 3), prob("transfer", "Maps", 3, 3, hints=1),
              prob("practice", "Maps", 3, 3, hints=2, date="2026-09-03"), prob("practice", "Maps", 3, 3, date="2026-10-01"),
              prob("practice", "Maps", 1, 3, date="2026-10-02")]           # not solved: no effect on the trend
        st = server.outcome_stats(ev)
        self.assertEqual(st["transfer"], {"n": 2, "ok": 1})
        sept = [m for m in st["months"] if m["month"] == "2026-09"][0]
        self.assertEqual((sept["n"], sept["avg_hints"], sept["first_try"], sept["avg_min"]), (1, 2.0, 0.0, 5.0))

    def test_note_and_csv(self):
        d = tempfile.mkdtemp(prefix="cc-out-")
        try:
            server.outcome_log(d, {"type": "problem", "purpose": "pre", "topic": "Maps | Sets", "passed": 0, "total": 3, "solved": False, "ms": 60000})
            server.outcome_log(d, {"type": "exam", "title": "Week 6", "pct": 80})
            server.outcome_log(d, {"type": "problem", "purpose": "retention", "topic": "Maps", "window": "60 days", "hints": "none", "solved": True})
            self.assertEqual(server.outcome_stats(server.outcome_events(d))["retention"], {60: {"n": 1, "kept": 1}})
            text = server.read_text(server.outcomes_path(d))
            self.assertIn("| Learning gain | - |", text)
            self.assertIn("| " + server.today() + " | Week 6 | 80% |", text)
            self.assertEqual(len(server.outcome_events(d)), 3)                 # the data block reads back
            rows = list(csv.DictReader(io.StringIO(server.outcomes_csv(server.outcome_events(d)))))
            self.assertEqual((rows[0]["topic"], rows[0]["minutes"], rows[1]["pct"]), ("Maps | Sets", "1.0", "80"))
        finally:
            shutil.rmtree(d, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
