"""Unit tests for the note helpers: table rows, sections, the review schedule and prompt trimming.
Run:  python3 -m unittest discover -s tests -v"""
import datetime as dt
import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import server  # noqa: E402

TRACKER = """# Mastery Tracker

| Topic | Level | Mastered | Next review | Notes |
| --- | --- | --- | --- | --- |
| Arrays | R3 | no | now | |
| Strings | R5 | yes | 2099-01-01 | |
"""


def day(n):
    return (dt.date.today() + dt.timedelta(days=n)).isoformat()


class NotesTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp(prefix="cc-notes-")
        self.path = os.path.join(self.dir, "Mastery Tracker.md")
        server.write_text(self.path, TRACKER)

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def rows(self):
        return {r["topic"]: r for r in server.table_rows(server.read_text(self.path))}

    # ---------------------------------------------------------------- upsert_row
    def test_update_existing_row_is_case_insensitive(self):
        self.assertEqual(server.upsert_row(self.path, "arrays", {"Level": "R4", "Notes": "better"}), "updated")
        r = self.rows()["Arrays"]
        self.assertEqual((r["level"], r["notes"], r["mastered"]), ("R4", "better", "no"))
        self.assertEqual(len(self.rows()), 2)

    def test_add_new_row(self):
        self.assertEqual(server.upsert_row(self.path, "HashMaps", {"Level": "R1", "Mastered": "no"}), "added")
        self.assertEqual(self.rows()["HashMaps"]["level"], "R1")
        self.assertIn("# Mastery Tracker", server.read_text(self.path))

    def test_pipes_and_newlines_are_escaped(self):
        server.upsert_row(self.path, "Arrays", {"Notes": "a || b\nnext line"})
        text = server.read_text(self.path)
        self.assertIn(r"a \|\| b next line", text)
        self.assertEqual(len(self.rows()), 2)        # the table didn't break into extra columns/rows

    def test_increment(self):
        p = os.path.join(self.dir, "Mistakes.md")
        server.write_text(p, "| Mistake | Fix | Times seen |\n| --- | --- | --- |\n| off by one | use < | 2 |\n")
        server.upsert_row(p, "off by one", {}, increment="Times seen")
        server.upsert_row(p, "null check", {"Fix": "check first"}, increment="Times seen")
        rows = {r["mistake"]: r for r in server.table_rows(server.read_text(p))}
        self.assertEqual(rows["off by one"]["times seen"], "3")
        self.assertEqual(rows["null check"]["times seen"], "1")

    def test_missing_note_or_table(self):
        with self.assertRaises(ValueError):
            server.upsert_row(os.path.join(self.dir, "nope.md"), "x", {})
        p = os.path.join(self.dir, "plain.md")
        server.write_text(p, "no table here")
        with self.assertRaises(ValueError):
            server.upsert_row(p, "x", {})

    # ---------------------------------------------------------------- upsert_section
    def test_section_add_then_replace(self):
        p = os.path.join(self.dir, "Patterns.md")
        server.write_text(p, "# Patterns\n\n## Two pointers\nold\n\n## Sliding window\nkeep me\n")
        self.assertEqual(server.upsert_section(p, "Two pointers", "## Two pointers\nnew body"), "updated")
        self.assertEqual(server.upsert_section(p, "Accumulate", "count things"), "added")
        text = server.read_text(p)
        self.assertNotIn("old", text)
        self.assertEqual(text.count("## Two pointers"), 1)          # repeated heading from the model is dropped
        self.assertIn("## Sliding window\nkeep me", text)
        self.assertTrue(text.rstrip().endswith("## Accumulate\ncount things"))

    def test_section_ignores_headings_inside_code_fences(self):
        p = os.path.join(self.dir, "P.md")
        server.write_text(p, "## A\n```\n## B\n```\nstill A\n\n## C\nc\n")
        server.upsert_section(p, "A", "replaced")
        text = server.read_text(p)
        self.assertNotIn("still A", text)
        self.assertIn("## C\nc", text)

    # ---------------------------------------------------------------- next_review
    def test_schedule(self):
        t = dt.date.today()
        self.assertEqual(server.next_review("fail", t.isoformat(), day(5)), "now")
        self.assertEqual(server.next_review("pass", t.isoformat(), ""), day(2))             # first gap
        self.assertEqual(server.next_review("pass", t.isoformat(), day(2)), day(5))         # 2 -> 5
        self.assertEqual(server.next_review("pass", t.isoformat(), day(5)), day(12))        # 5 -> 12 (12.5 rounds to even)
        self.assertEqual(server.next_review("pass", t.isoformat(), day(12)), day(30))
        self.assertEqual(server.next_review("pass", t.isoformat(), day(100)), day(180))     # capped
        self.assertEqual(server.next_review("hard", t.isoformat(), day(12)), day(12))       # same gap again
        self.assertEqual(server.next_review("hard", t.isoformat(), "garbage"), day(1))

    # ---------------------------------------------------------------- prompt trimming
    def test_topic_terms(self):
        terms = server.topic_terms("HashMaps and getOrDefault review")
        self.assertIn("map", terms)
        self.assertIn("hashmap", terms)
        self.assertIn("hash", terms)
        self.assertNotIn("get", terms)
        self.assertNotIn("and", terms)
        self.assertNotIn("review", terms)

    def test_is_due(self):
        self.assertTrue(server.is_due("now"))
        self.assertTrue(server.is_due(day(-1)))
        self.assertTrue(server.is_due(day(0)))
        self.assertFalse(server.is_due(day(1)))
        self.assertFalse(server.is_due("next session"))

    def test_small_notes_are_not_trimmed(self):
        self.assertEqual(server.trim_notes("tracker", TRACKER, {"map"}, "learn"), (TRACKER, ""))

    def test_tracker_trim_keeps_due_unmastered_and_on_topic(self):
        rows = ["| Topic %d | R6 | yes | 2099-01-01 | %s |" % (i, "x" * 60) for i in range(80)]
        rows += ["| Recursion | R6 | yes | 2099-01-01 | |", "| Loops | R2 | no | 2099-01-01 | |", "| Arrays | R6 | yes | now | |"]
        text = "# T\n\n| Topic | Level | Mastered | Next review | Notes |\n| --- | --- | --- | --- | --- |\n" + "\n".join(rows) + "\n"
        out, note = server.trim_notes("tracker", text, server.topic_terms("recursion"), "learn")
        kept = {r["topic"] for r in server.table_rows(out)}
        self.assertEqual(kept, {"Recursion", "Loops", "Arrays"})
        self.assertIn("Topic 5", note)
        self.assertLess(len(out), len(text))

    def test_blueprint_trim_keeps_rules_and_topic(self):
        filler = "\n".join("line %d %s" % (i, "y" * 80) for i in range(45))
        text = ("# Blueprint\n\n## Style rules\nno main\n\n## Recursion questions\nrec\n\n## Graph questions\n" + filler +
                "\n\n## Sorting questions\n" + filler)
        out, note = server.trim_notes("blueprint", text, server.topic_terms("recursion"), "learn")
        self.assertIn("## Style rules", out)
        self.assertIn("## Recursion questions", out)
        self.assertFalse("## Graph questions" in out, "off-topic section kept")
        self.assertIn("2 blueprint sections", note)
        self.assertEqual(server.trim_notes("blueprint", text, set(), "quizsim")[0], text)   # quiz sims see everything

    # ---------------------------------------------------------------- AI line parsing
    def test_parse_ai(self):
        cfg = dict(server.DEFAULT_CONFIG)
        self.assertEqual(server.parse_ai(cfg, "ollama:qwen3:14b")["model"], "qwen3:14b")
        self.assertTrue(server.parse_ai(cfg, "ollama:qwen3:14b")["local"])
        c = server.parse_ai(cfg, "my-model@http://127.0.0.1:9/v1")
        self.assertEqual((c["id"], c["model"], c["local"]), ("custom", "my-model", True))
        self.assertEqual(server.parse_ai(cfg, "deepseek/deepseek-v4.1-flash")["id"], "openrouter")
        cfg["providers"] = {"newlab": {"url": "https://api.newlab.ai/v1", "key_env": "NEWLAB_API_KEY"}}
        self.assertEqual(server.parse_ai(cfg, "newlab:x")["url"], "https://api.newlab.ai/v1")

    def test_cache_marks_only_for_claude_on_openrouter(self):
        cfg = dict(server.DEFAULT_CONFIG)
        msgs = [{"role": "system", "content": "sys"}, {"role": "user", "content": "hi"},
                {"role": "assistant", "content": None, "tool_calls": []}, {"role": "tool", "content": "{}"}]
        self.assertTrue(server.needs_cache_marks(server.parse_ai(cfg, "openrouter:anthropic/claude-sonnet-5.5")))
        self.assertFalse(server.needs_cache_marks(server.parse_ai(cfg, "openrouter:deepseek/deepseek-v4.1-flash")))
        self.assertFalse(server.needs_cache_marks(server.parse_ai(cfg, "anthropic:claude-sonnet-5.5")))
        out = server.with_cache_marks(msgs)
        self.assertEqual(out[0]["content"][0]["cache_control"], {"type": "ephemeral"})
        self.assertEqual(out[1]["content"][0]["text"], "hi")          # newest plain-text message
        self.assertEqual(msgs[0]["content"], "sys")                    # the original is untouched

    def test_cache_stats(self):
        self.assertEqual(server.cache_stats({"prompt_tokens_details": {"cached_tokens": 900}})[0], 900)
        self.assertEqual(server.cache_stats({"prompt_cache_hit_tokens": 50})[0], 50)       # DeepSeek
        self.assertEqual(server.cache_stats(None), (0, 0, 0.0))


if __name__ == "__main__":
    unittest.main()
