"""3.6: practice that fits the real assessment - whole Java classes with signature checks, the coverage map,
and the missing-materials nudge."""
import datetime as dt
import os
import shutil
import sys
import tempfile
import unittest
import urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))
from harness import App  # noqa: E402
import server  # noqa: E402


def day(n):
    return (dt.date.today() + dt.timedelta(days=n)).isoformat()


SCOREBOARD = """public class Scoreboard {
    private int home;
    private int away;
    public Scoreboard(int home, int away) {
        this.home = home;
        this.away = away;
    }
    public int addHome(int points) {
        home += points;
        return home;
    }
    public int getHome() { return home; }
    public static String winner(int a, int b) { return a > b ? "home" : a < b ? "away" : "tie"; }
}
"""
SPEC_TESTS = """tClass("Scoreboard", "public class");
tField("Scoreboard", "private int home");
tCtor("Scoreboard", "public (int, int)");
tMethod("Scoreboard", "public int addHome(int)");
tMethod("Scoreboard", "public static String winner(int, int)");
Scoreboard b = new Scoreboard(2, 3);
t("addHome(4)", 6, () -> b.addHome(4));
t("winner(1, 2)", "away", () -> Scoreboard.winner(1, 2));
"""


@unittest.skipUnless(shutil.which("javac"), "needs a JDK")
class JavaClassesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = App().__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.app.__exit__()

    def run_java(self, code, tests):
        return self.app.api("/api/run_tests", {"language": "java", "code": code, "tests": tests}, timeout=120)

    def test_top_classes(self):
        self.assertEqual(server.java_top_classes(SCOREBOARD), ["Scoreboard"])
        self.assertEqual(server.java_top_classes("int add(int a, int b) { return a + b; }"), [])
        self.assertEqual(server.java_top_classes('// public class Nope {}\nString s = "class X {";\nint f() { return 1; }'), [])

    def test_whole_class_passes_spec(self):
        r = self.run_java(SCOREBOARD, SPEC_TESTS)
        self.assertTrue(r["ok"], r)
        self.assertEqual((r["passed"], r["total"]), (7, 7))

    def test_spec_names_what_is_wrong(self):
        bad = SCOREBOARD.replace("private int home", "int home").replace("public int addHome", "int addHome")
        r = self.run_java(bad, SPEC_TESTS)
        self.assertFalse(r["ok"])
        self.assertEqual((r["passed"], r["total"]), (5, 7), r)
        self.assertIn("found int home", str(r))
        self.assertIn("found int addHome(int)", str(r))

    def test_wrong_signature_is_the_students_to_fix(self):
        r = self.run_java(SCOREBOARD.replace("public static String", "public String"), SPEC_TESTS)
        self.assertEqual(r["stage"], "compile", r)                    # not "test setup problem (not your fault)"
        self.assertIn("`winner` should be `static`", r["message"])
        r = self.run_java(SCOREBOARD.replace("public int addHome(int points)", "public int addHome(double points)").replace("home += points", "home += (int) points"), SPEC_TESTS)
        self.assertEqual((r["stage"], r["passed"]), ("run", 6), r)       # compiles (int fits a double), the signature test catches it
        self.assertIn("addHome(double)", str(r))

    def test_class_name_typo_is_explained(self):
        r = self.run_java(SCOREBOARD.replace("class Scoreboard", "class ScoreBoard").replace("public Scoreboard(", "public ScoreBoard("), SPEC_TESTS)
        self.assertFalse(r["ok"])
        self.assertIn("class name", str(r))

    def test_method_only_still_works(self):
        r = self.run_java("int add(int a, int b) { return a + b; }", 't("add(1, 2)", 3, () -> s.add(1, 2));\ntMethod("Solution", "int add(int, int)");')
        self.assertTrue(r["ok"], r)
        self.assertEqual(r["total"], 2)


class StyleChecksTest(unittest.TestCase):
    CHECKS = ["no-hidden-field", "no-param-assign"]

    def problems(self, code):
        return {label: p for label, p in server.style_problems("java", code, self.CHECKS)}

    def test_course_rules_only_when_on(self):
        hidden = "public class P {\n    private int age;\n    public P(int age) { this.age = age; }\n}"
        self.assertEqual(server.style_problems("java", hidden, []), [])                     # ordinary Java: fine
        self.assertEqual(server.style_problems("python", "def f(x):\n    x = 1", self.CHECKS), [])
        p = self.problems(hidden)
        self.assertIn("`age` has the same name as a field", p["style: parameters named differently from fields"])
        self.assertIsNone(p["style: parameters aren't reassigned"])

    def test_clean_code_passes(self):
        good = ("public class P {\n    private String name;\n    private int age, height;\n    private int[] xs = {1, 2};\n"
                "    // public void setName(String name) { this.name = name; }\n"
                "    public P(String setName) { name = setName; }\n    public void setAge(int newAge) { this.age = newAge; }\n"
                "    public String shout(String s) { String t = s.trim(); for (int i = 0; i < 3; i++) { t += \"!\"; } return t; }\n}")
        self.assertEqual(set(self.problems(good).values()), {None})

    def test_param_assign_and_bare_body(self):
        p = self.problems("private int value;\nvoid setValue(int value) { this.value = value; }\nint up(int n) { n++; return n; }")
        self.assertIn("`value` has the same name", p["style: parameters named differently from fields"])
        self.assertIn("parameter `n`", p["style: parameters aren't reassigned"])

    def test_profile_line(self):
        d = tempfile.mkdtemp(prefix="cc-style-")
        self.addCleanup(shutil.rmtree, d, True)
        shutil.copy(os.path.join(os.path.dirname(HERE), "templates", "_course.md"), os.path.join(d, "_course.md"))
        self.assertEqual(server.course_style(d), [])                                       # the template's hint isn't a setting
        server.set_course_style(d, ["no-hidden-field", "made-up"])
        self.assertEqual(server.course_style(d), ["no-hidden-field"])
        server.set_course_style(d, [])
        self.assertEqual(server.course_style(d), [])


@unittest.skipUnless(shutil.which("javac"), "needs a JDK")
class StyleChecksAppTest(unittest.TestCase):
    def test_only_the_course_with_the_rule_fails(self):
        code = SCOREBOARD.replace("public Scoreboard(int home, int away)", "public Scoreboard(int setHome, int setAway)").replace(
            "this.home = home;", "home = setHome;").replace("this.away = away;", "away = setAway;").replace(
            "public int addHome(int points) {", "public void setHome(int home) {\n        this.home = home;\n    }\n    public int addHome(int points) {")
        with App() as app:
            cs = app.api("/api/course/create", {"language": "java", "type": "class", "name": "CS 124"})["folder"]
            general = app.api("/api/course/create", {"language": "java", "type": "general", "name": "Java track"})["folder"]
            app.api("/api/course/style", {"folder": cs, "checks": ["no-hidden-field", "no-param-assign"]})
            r = app.api("/api/run_tests", {"folder": general, "language": "java", "code": code, "tests": SPEC_TESTS}, timeout=120)
            self.assertEqual((r["ok"], r["total"]), (True, 7), r)
            r = app.api("/api/run_tests", {"folder": cs, "language": "java", "code": code, "tests": SPEC_TESTS}, timeout=120)
            self.assertEqual((r["ok"], r["passed"], r["total"]), (False, 8, 9), r)
            self.assertIn("`home` has the same name as a field", r["message"])
            q = urllib.parse.quote
            self.assertIn("STYLE CHECKS ON", app.api("/api/system_prompt?mode=learn&folder=" + q(cs, safe=""))["prompt"])
            self.assertIn("`this.x = x;` in constructors and setters is normal", app.api("/api/system_prompt?mode=learn&folder=" + q(general, safe=""))["prompt"])


class CoverageTest(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp(prefix="cc-cov-")
        self.addCleanup(shutil.rmtree, self.d, True)

    def course(self, line, ctype="class"):
        server.write_text(os.path.join(self.d, "_course.md"), "# CS 124\n\n- **Type:** %s\n- **Language:** Java\n- **Next assessment:** %s\n" % (ctype, line))

    def material(self, unit, title, mtype):
        p = os.path.join(self.d, "materials", unit, title + ".md")
        os.makedirs(os.path.dirname(p), exist_ok=True)
        server.write_text(p, "---\ntitle: %s\ntype: %s\n---\ntext" % (title, mtype))

    def test_labels(self):
        cases = {"Quiz 6 on 2026-10-16 - objects": "Quiz 6", "quiz 6 retakes (objects)": "Quiz 6", "Midterm 2 Nov 3": "Midterm 2",
                 "MP1 due": "MP 1", "Final exam": "Final", "testing week": "", "": ""}
        for text, want in cases.items():
            self.assertEqual(server.assessment_label(text), want, text)

    def test_map_rows_and_counts(self):
        self.course("Quiz 6 on %s" % day(3))
        self.assertFalse(server.coverage_status(self.d)["exists"])
        server.update_coverage(self.d, "", [{"skill": "constructors", "source": "Lesson", "ways": "write the class; trace", "status": "gap"},
                                            {"skill": "static fields", "status": "solid"}, {"skill": "getters", "status": "practicing"}])
        server.update_coverage(self.d, "", [{"skill": "Constructors", "status": "solid"}])        # same row, any case
        c = server.coverage_status(self.d)
        self.assertEqual((c["assessment"], c["total"], c["solid"], c["practicing"], c["gaps"]), ("Quiz 6", 3, 2, 1, []))
        self.assertTrue(os.path.exists(os.path.join(self.d, "Coverage - Quiz 6.md")))
        self.assertEqual(c["rows"][0]["ways"], "write the class; trace")
        self.course("Quiz 7 on %s" % day(9))                                                       # a new quiz has no map yet
        c = server.coverage_status(self.d)
        self.assertEqual((c["assessment"], c["exists"]), ("Quiz 7", False))

    def test_missing_materials(self):
        self.course("quiz 6 retakes (objects) on %s" % day(1))
        self.assertEqual(server.materials_missing(self.d), {"assessment": "Quiz 6", "missing": ["lessons", "practice quiz"]})
        self.material("Pasted", "more objects (quiz 6)", "lesson")
        self.material("Quiz 1-4 (basics)", "Practice quiz", "practice-quiz")       # a range that doesn't include 6
        self.assertEqual(server.materials_missing(self.d)["missing"], ["practice quiz"])
        self.material("Quiz 6 (objects)", "PQ6", "practice-quiz")
        self.assertIsNone(server.materials_missing(self.d))
        self.assertEqual(len(server.assessment_materials(self.d, "Quiz 3")), 1)              # "Quiz 1-4" covers quiz 3
        self.course("Quiz 9 on %s" % day(-2))                                                  # out of date: the date question comes first
        self.assertIsNone(server.materials_missing(self.d))
        self.course("Quiz 9 on %s" % day(2), ctype="general")
        self.assertIsNone(server.materials_missing(self.d))


class CoverageAppTest(unittest.TestCase):
    def test_prompt_dashboard_and_course_tab(self):
        with App() as app:
            f = app.api("/api/course/create", {"language": "java", "type": "class", "name": "CS 124"})["folder"]
            q = urllib.parse.quote(f, safe="")
            app.api("/api/course/assessment", {"folder": f, "text": "Quiz 6 on %s - objects" % day(3)})
            prompt = app.api("/api/system_prompt?mode=learn&folder=" + q)["prompt"]
            self.assertIn("No coverage map for Quiz 6 yet", prompt)
            self.assertIn("Materials has no lessons or practice quiz for Quiz 6", prompt)
            d = app.api("/api/dashboard?folder=" + q)
            self.assertEqual(d["materials_missing"]["assessment"], "Quiz 6")
            self.assertFalse(d["coverage"]["exists"])
            r = app.api("/api/note/coverage", {"folder": f, "rows": [{"skill": "write a constructor", "ways": "whole class; fix one", "status": "gap"},
                                                                     {"skill": "private fields", "status": "solid"}]})
            self.assertEqual(r["note"], "Coverage - Quiz 6.md")
            prompt = app.api("/api/system_prompt?mode=learn&folder=" + q)["prompt"]
            self.assertIn("## COVERAGE MAP: Quiz 6", prompt)
            self.assertIn("- write a constructor [gap] - asked as: whole class; fix one", prompt)
            self.assertIn("Quiz 6 coverage: 1/2 skills solid. Gaps: write a constructor", prompt)
            self.assertEqual(app.api("/api/coverage", {"folder": f})["solid"], 1)
            self.assertIn("coverage", app.api("/api/course?folder=" + q)["files"])


if __name__ == "__main__":
    unittest.main()
