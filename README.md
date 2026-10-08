# CodeCoach

A free study app for learning to code. An AI coach teaches you, quizzes you, drills syntax, and gives you real coding problems whose tests run on your own computer. It keeps notes on what you've mastered and brings topics back right before you'd forget them.

- **Any language, any goal:** follow a class (drop in your slides, practice quizzes and quiz feedback, and the coach follows its format and AI policy) or a self-paced track for C++, Python, Java, JavaScript, C, Go or Rust.
- **A mastery ladder:** R0 syntax drills → R1 tracing → R2 Parsons problems → R3 fill-in → R4 debug → R5 from scratch → R6 timed. Mastered = three new problems solved without hints.
- **Spaced, interleaved review:** 2 → 5 → 12 → 30 → 75 days, adjusted by how each review went.
- **Practice exams:** the coach builds a whole exam up front and checks every coding problem; you take it timed and locked down with no AI, it's graded on your computer, then the coach debriefs.
- **Outcomes you can see:** learning gain from pre-check to post-check, retention 30/60/90 days after mastery, transfer to new problems, and speed and hint trends (`Outcomes.md`, CSV export).
- **Playground** for seven languages, an in-app guide, 47 themes, optional typing and effect sounds.

## Your data stays yours

All your notes, solutions and progress live in a plain folder on your computer, your **Library**. Everything in it is Markdown you can read or edit in any text editor, or open as an Obsidian vault.

- **Sync for free** with what you already use: put the Library in iCloud Drive, Dropbox, OneDrive, Google Drive, a Git repo or Syncthing, and point CodeCoach on your other computer at the same folder. No account. If the same session changes on two computers, CodeCoach asks which version to keep instead of overwriting one, and it recognizes sync services' conflict copies.
- **Export everything:** Welcome → *Export everything* makes one zip of every course, solution, session and setting.
- **Keys stay local:** AI keys live in `~/.codecoach/config.json` on each computer, never in the Library or an export. No tracking; CodeCoach talks only to the AI you pick.

```
CodeCoach Library/
├─ Courses/<course>/      _course.md, Roadmap, Mastery Tracker, Toolkit, Mistakes, Patterns,
│                         materials/, practice/ (your solutions), sessions/ (readable logs)
└─ CodeCoach/             saved sessions, snippets, Learner Profile, usage
```

## Bring your own model

CodeCoach works with any AI that speaks the OpenAI chat format. The choice is one line in Settings, or in `~/.codecoach/config.json`:

```jsonc
{ "ai": "openrouter:deepseek/deepseek-v4.1-flash" }   // cloud, hundreds of models, pay per use
{ "ai": "ollama:qwen3:14b" }                           // free and private, on this computer
{ "ai": "lmstudio:qwen/qwen3-14b" }                    // free and private, on this computer
{ "ai": "openai:gpt-5-mini" }                          // also: anthropic: gemini: groq: deepseek: mistral:
{ "ai": "my-model@https://any-server.example/v1" }     // anything OpenAI-compatible, including future providers
```

The sidebar shows what you've spent: exact amounts from OpenRouter, and estimates (marked ≈) from published prices for other cloud providers. Add your own prices in `~/.codecoach/price_overrides.json` if a model isn't listed.

Keys go in Settings (`"keys": {"openrouter": "..."}`) or the usual environment variable (`OPENROUTER_API_KEY`, `OPENAI_API_KEY`, ...). To add a provider by name, add it once:

```json
{ "providers": { "newlab": { "url": "https://api.newlab.ai/v1", "key_env": "NEWLAB_API_KEY" } }, "ai": "newlab:their-model" }
```

## Download

Get the latest build from the **Releases** page:

| | |
| --- | --- |
| Mac, Apple Silicon | `CodeCoach-macOS-AppleSilicon.dmg` |
| Mac, Intel | `CodeCoach-macOS-Intel.dmg` |
| Windows 10/11 | `CodeCoach-Windows-Setup.exe` (or the portable `CodeCoach-Windows.zip`) |
| Linux | `CodeCoach-Linux.tar.gz`, then `./install.sh` |

Python is bundled on Mac and Windows. For Java problems install a JDK (e.g. Temurin); C/C++, Node, Go and Rust are optional (Settings → Languages shows what's found).

**First launch:** on a Mac (11.3+), if macOS says CodeCoach can't be opened, go to System Settings → Privacy & Security → Open Anyway (the app isn't notarized yet). On Windows, if SmartScreen appears: More info → Run anyway.

## Run from source

```bash
python3 server.py          # opens http://127.0.0.1:8765 in your browser
```

Standard library only, Python 3.8+. On a Mac you can also double-click `CodeCoach.app` in this folder (it builds a native window on first launch with the Xcode command line tools); on Windows `CodeCoach.bat`.

## Building the apps

Builds run on GitHub's machines. Push a version tag and the workflow in `.github/workflows/release.yml` builds every platform and publishes a release:

```bash
git tag v3.0.0
git push origin v3.0.0
```

Every build is smoke-tested on GitHub's machines (`packaging/smoke_test.py`: the packaged server starts with its bundled Python, serves the page and offline files, and runs a Python problem's tests). Use **Actions → Build apps → Run workflow** to build without publishing; the files appear under the run's artifacts.

Or build locally: `packaging/macos/build.sh` (on a Mac), `packaging/windows/build.ps1` (on Windows), `packaging/linux/build.sh`. Each first runs `packaging/fetch_vendor.py` so the app works offline.

The website in `site/` deploys to GitHub Pages with `.github/workflows/pages.yml` (Settings → Pages → Source: GitHub Actions). Its download buttons find the latest release automatically.

**Signed Mac builds (optional):** with an Apple Developer ID, set `MAC_SIGN_IDENTITY` and `NOTARY_PROFILE` for `packaging/macos/build.sh` and the Gatekeeper warning goes away.

## Tests

```bash
python3 -m unittest discover -s tests -v        # notes, schedule, trimming, and the real server against a mock AI
python3 -m unittest discover -s tests/e2e -v    # a whole study session in a browser (needs Playwright)
```

No network or API key needed: `tests/mock_llm.py` is a small fake AI that speaks the OpenAI format. You can also run it by hand (`python3 tests/mock_llm.py`) and set the AI line in Settings to `mock-model@http://127.0.0.1:9911/v1`. Every push runs both on GitHub (`.github/workflows/checks.yml`).

## Energy use

CodeCoach is built to sit open all day on a laptop: the server sleeps between requests, timers only tick while visible and running, the audio device sleeps after a sound, nothing animates forever, the diagram library loads only when a diagram appears, and the downloadable apps stop their server the moment you quit.

## Files

- `server.py`: the local server (AI calls, code runner, notes)
- `static/`: the interface; `static/guide.md` is the in-app guide
- `prompts/method.md`: how the coach teaches (edit it to change the teaching)
- `templates/`: notes for new courses
- `site/how-it-teaches.html`: the teaching methods and the research behind them
- `native/`: the Mac window; `packaging/`: app builds; `site/`: the website

## License

MIT
