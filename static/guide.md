# How to use CodeCoach

CodeCoach is your personal coding tutor and practice space in one app. An AI coach teaches you, quizzes you, gives you real coding problems, checks your code by actually running it, and keeps your progress as plain Markdown notes in your own Library folder. This guide explains every part of it, how to use it, and why it works the way it does.

> [!tip] New here? Read **Quick start**, then **How CodeCoach teaches**. Everything else you can look up when you need it. Use the search box above to jump to anything.

## Quick start

1. **First launch:** choose where your Library folder lives and which AI to use (both can change later). The **Welcome** page in the sidebar explains how your data is stored and how to switch AI.
2. **Pick your course** in the top-left of the sidebar. Use **+** to add a class or a "learn a language" track.
3. **Fill in your Learner Profile** (Progress → Learner profile): your background, goals and how long you usually study. Two minutes, and your coach starts from you instead of guessing.
4. **Add class content** in **Materials**: slides, practice quizzes, your quiz feedback. Drop files in or paste text.
5. Go to **Today** and click what it suggests: a due review, the next roadmap item, or **Start studying**.
6. In a session, just talk to your coach and answer the cards it gives you. Everything saves automatically.

**One rule to remember:** when you get stuck, decide whether it's a *concept* problem ("I don't know what to do") or a *syntax* problem ("I know what to do but not how to write it") and tell your coach. They're fixed differently.

## How CodeCoach teaches (and why)

*The full story, with the research and its limits: [How CodeCoach teaches](https://lleyum.github.io/codecoach/how-it-teaches.html).*

Learning to code is two skills at once: **understanding** (what the code should do, which pattern fits) and **fluency** (writing it correctly from memory, fast). Most courses teach the first and hope the second happens. CodeCoach trains both, on purpose, using techniques that research on learning and on programming education supports.

### The ladder (R0 to R6)

Every topic is climbed one rung at a time. Each rung removes a bit of support:

| Rung | What you do | Why |
|---|---|---|
| **R0** Syntax drill | Type one line from memory (e.g. `list.isEmpty()`) | Fixes "I get it but can't write it". Building blocks must be automatic before you can combine them. |
| **R1** Trace | Predict what code prints | Reading and tracing code comes before writing it - research suggests beginners need to trace reliably before they can write well. |
| **R2** Parsons problem | Put scrambled lines in the right order (with 1-2 lines that don't belong). Click a block to add it, drag or use ↑↓ to reorder, × to send a line back. | Teaches code structure about as well as writing it, in much less time. |
| **R3** Fill in the blanks | Complete `/* ??? */` gaps in real code | You focus on the key lines while the rest is given. |
| **R4** Debug / modify | Fix a bug changing at most N lines, or change working code | Reading someone else's code closely - a huge part of real programming. |
| **R5** Write from a spec | Write the whole method from an exact description | Writing from scratch, with the signature given. |
| **R6** Assessment style | A quiz-style word problem, often timed | Exactly what tests ask: read, recognize the pattern, write it under time pressure. |

Your coach starts low for new topics and skips rungs if you're already strong. Solved fast with no hints → skip a rung. Needed hints → same rung again. Failed → down a rung and a new explanation.

### Mastery

A topic counts as **mastered** only when you solve **3 different problems you've never seen, at R5/R6, without hints, the last one within your target time** (10 minutes for CS 124). Recognizing an answer isn't the same as producing it, so mastery means producing it.

### Spaced review

Mastered topics come back for review at growing gaps: **2 days, 5, 12, 30, 75...** Pass → the gap grows. Pass with help → same gap again. Fail → due now, and it's no longer mastered. CodeCoach works out the dates itself.

*Why:* forgetting is normal. Remembering something just as it starts to fade is what makes it stick for months instead of days ("spacing" + "retrieval practice" - two of the best-supported findings in learning science).

### Mixing topics (interleaving)

Reviews and drill sessions mix topics instead of doing ten problems on one thing. It feels harder - that's the point: on a test nobody tells you "this is a Map problem". Mixing trains you to *choose* the right approach.

### Worked examples first, then less and less help

For new material you first see a fully worked example with each step labelled (`// 1. guard`, `// 2. counter`...). As you improve, the examples, hints and step-by-step help fade away.

*Why:* beginners learn most from studying good examples, but for someone who already knows the material that same help just slows them down (the "expertise reversal effect"). So support is matched to what you know right now.

### Predict → run → investigate

For new code your coach shows a short snippet and asks you to **predict** the output, then shows the **real** output, then asks what each part does - before you change or write anything (this sequence is called PRIMM). For references, arrays, objects, collections and recursion it draws **what's in memory** step by step. A correct picture of what the computer does beats memorized syntax.

### Explaining in your own words

After some clean solves, your coach asks one quick question: which pattern was that, and why does the key line work? Explaining is what lets you use a pattern on problems that look different.

### Struggle (a little) on purpose

You get a few minutes to wrestle with a problem before hints. Struggle followed by feedback builds stronger memory than being told immediately. If you're stuck on *syntax*, or getting frustrated, the coach steps in sooner.

### Concept gap vs syntax gap

- **Syntax gap** ("I know what to do, not how to write it"): you get just that one building block in general form, e.g. `myList.isEmpty()`, never your solution. It goes into your **Toolkit** and gets drilled until it's automatic.
- **Concept gap** ("I don't know what to do"): the coach walks you through a starting routine as comments in your file - restate input → output, try examples, name the pattern, write the steps in words, then turn each into code. Then hints, one per attempt. Never the corrected line.

### "Everyone learns differently" - what that really means

People really do differ - mostly in **what they already know**, their goals, pace and motivation. The popular idea of fixed "visual / auditory learning styles" isn't supported by research, and everyone learns code by actively reading and writing it. So CodeCoach personalizes the things that matter:

- **Your Learner Profile** (Progress → Learner profile): you write about yourself; your coach adds what it has seen work for you at least twice (e.g. "analogies before code helps"). It's read at the start of every session, in every course.
- **Support level** follows your current skill, topic by topic.
- **Explanations change** when one doesn't land (analogy, diagram, tiny example, comparing two snippets) - but always end with you writing code.

## Today

Your home screen - it answers "what should I do now?".

- **Stats:** streak, reviews due, topics mastered, Toolkit lines solid, problems solved this week.
- **Up next:** the next unchecked item on your roadmap, with **Learn it**. If your roadmap is empty, **Plan my roadmap** has your coach build one.
- **Spaced review:** everything due, each with **Review**; **Review all** does them in one mixed session.
- **Recent sessions:** **Resume** puts you back exactly where you stopped.
- **Mastery:** a bar per topic (R0-R6, green = mastered).
- **Quick start:** syntax drills, quiz simulation, Playground, Materials, Notes.

## Study sessions

### Starting one

1. Pick a **session type**:
   - **Learn** - new or shaky topic. Probe what you know → plan → teach, mixed with the ladder.
   - **Drill** - lots of problems on topics you know, mixed. Little explaining.
   - **Quiz sim** - a timed practice test in your class's format. No hints until the end.
   - **Review** - only what's due today, mixed.
   - **Exam** - a whole practice exam, taken like the real thing (see *Practice exams* below).
2. **Topic** (optional): type one, pick a suggestion, or press **Next on roadmap**. Leave it empty and your coach suggests one.
3. **Materials** (optional): tick class content to study from. Your coach teaches in your class's style and makes *new* problems based on it.
4. **Paste** (optional): a practice quiz with your answers, feedback, an assignment prompt... (tick "Save to Materials" to keep it).
5. Press **Start session**. Your previous sessions are listed below to resume, rename or delete.

### The chat

Talk normally. **Enter** sends, **Shift+Enter** is a new line. The buttons above the box are shortcuts: *Hint please, Explain that differently, Show me an example, Give me another one, Harder, Easier, Why does that work?*

When a problem is open, everything you send also gives your coach **exactly what's in your editor right now** (only when it changed), so its help uses your variable names and line numbers.

**Stop** interrupts your coach mid-reply, or skips a card that's waiting for you.

### Cards

- **Quiz** - multiple choice. Click or press **A-D**. You see right/wrong and an explanation (in a quiz sim, answers are only recorded).
- **Question** - your coach asking something open (goals, what next). Click a choice or type your own.
- **Drill** - type one line of code from memory; it's compiled and run to check it. 3 tries, then **Show answer**.
- **Parsons** - click blocks to build the solution in order, use the arrows to reorder, then **Check**. Lines that don't belong should stay out. After 2 checks you can reveal the answer.
- **Problem** - a coding problem; **Open** loads it in the workspace.

You can always type in the chat instead of answering a card - e.g. to ask a question about it.

### The workspace (coding problems)

Three layers: the **problem** on top, **your code** in the middle, the **test output** at the bottom.

- **Run tests** (⌘↵): runs hidden tests on your code, as often as you like. Shows PASS/FAIL with expected vs actual. Errors point to *your* line numbers.
- **Submit** (⇧⌘↵): your final answer. Your coach gets the result, the time and how many hints you used, and updates your notes.
- **I'm stuck:** one hint at a time, never the full answer.
- **Give up:** your coach walks you through a solution line by line. Your attempt is saved - giving up is part of learning.
- **Reset** (circular arrow): back to the starting code.
- **Problem tabs:** all problems from the session stay open; only the one on screen counts time.

Every problem is checked before you see it: the coach's own solution must pass its tests, and the starting code must fail them. You'll never get a broken problem.

### Practice exams

Pick **Exam**, set the minutes and how many multiple-choice and coding questions you want, and type the topics (or leave them empty to cover what's due and what your class tests). Then:

1. **Building:** your coach writes the whole exam at once and CodeCoach checks every coding problem against its own tests. This takes a minute or two.
2. **Start:** the clock starts. With **Lockdown** on, CodeCoach goes full screen and hides the sidebar, coach and Playground. Run tests as often as you like, but you only see how many pass.
3. **The clock is real:** it keeps running if you leave or close CodeCoach, and at 0:00 the exam is submitted for you. Leaving the window or full screen isn't blocked; it's written in your report so you can be honest with yourself.
4. **Grading** happens on your computer: multiple choice right or wrong, coding problems get points × the share of tests that pass.
5. **Report and debrief:** a report goes to your course's `exams/` folder (score, time on each question, your code, failing tests, model solutions, the integrity log). Then your coach goes through what you missed and updates your tracker.

No AI runs during the exam: building it costs about as much as a few coach messages, and taking it costs nothing.

### Quick review

A read-only study sheet to look over before a quiz, an exam or a session. Open it from **Today → Quick review**, the **Quick review** card on the Study page, or the book icon next to any past session.

- **By topic:** the key ideas your coach wrote for it, the syntax lines you drilled (with how solid each is), the patterns that use it, your mistakes to watch out for, and your own solutions. Topics due for review are marked ●. **Practice this** starts a session on it.
- **By session:** what you practiced, in order: drills with the standard answer, quiz questions with the right answer and explanation, Parsons problems in the right order, and every coding problem with your code. Exams include the model solutions.
- **During a session:** press **Review** in the session bar. The sheet opens beside the chat and updates as you go.
- **Copy as Markdown** puts the sheet on your clipboard for Notes, Obsidian or a doc.

The key ideas live in `Review Notes.md` in your course folder (Progress → Review notes). Your coach keeps them current as it teaches; you can edit them too.

### Timers and pausing

- **Problem clock** (top right of the workspace): how long you've spent on this problem. Sent to your coach when you submit, get stuck or give up, saved with your solution, and used to judge timed mastery. If a time limit is set it shows "4m 12s / 10m" and turns amber when you go over.
- **Countdown** (top bar): only appears when your coach starts one, e.g. in a quiz sim. At 0:00 your coach is told time's up.
- **Pause** (top bar): freezes both. Typing, running code or sending a message resumes automatically.
- Time never counts while CodeCoach is closed, while you're on another session, or if the app was in the background for more than 5 minutes.

### Ending, stopping, coming back

- **End session** - your coach writes a summary, updates your notes and plans next time. Timers pause. Do this at the end of a study block.
- **Close** - saves and returns to the start screen (no summary).
- **Just closing the window** - also fine. Everything saves within a second or two, and the last moment is saved as the window closes.
- To come back: **Today → Recent sessions → Resume** (or Study, or Progress → Overview). Chat, code, problems and timers come back as they were.

## Materials

Your class content, organized into **units** (e.g. "Week 6 - Lists"). Your coach reads it to teach exactly what your class tests.

- **Add:** drop files anywhere on the page or click *browse* - PDF, Word, PowerPoint (with speaker notes), notebooks, HTML, code, text. Or **Add material** to paste text. Scanned PDFs (pictures of text) can't be read - paste those.
- **Types:** lesson, slides, practice quiz, quiz feedback, homework, notes, code, other.
- **Organize:** **New unit**; drag a material onto a unit to move it; rename or delete units from their header.
- **Use:** click to read; hover for **Study this**, **Edit**, **Delete** (deleted items go to `materials/_trash`). Tick several and press **Study selected**.

*Most valuable to add:* practice quizzes and your quiz feedback - they show your coach exactly how you're tested and where you lost points. Your coach never hands real problems back as practice and never solves real homework; it makes new problems that vary the story, data and edge cases.

## Playground

A full editor for trying anything, in Java, Python, C++, C, JavaScript, Go and Rust.

- **Run** (⌘↵). **Input** box for programs that read input (Scanner, `input()`, `cin`).
- **Java:** you can write just statements - no class or main needed. Full programs work too.
- **Templates:** Scanner input, classes, linked lists, recursion and more.
- **Errors are clickable** and jump to the line; error lines are highlighted.
- **Save** (⌘S) stores a snippet in your Library (it syncs with it). **Open** lists saved snippets. Drafts save automatically per language (on this computer).
- **Ask AI:** ask about your code or press **Explain this error**. "Hints, not answers" is on by default.
- **Re-indent** (⇧⌘F), **Find** (⌘F), comment a line (⌘/).

Use it for quick experiments ("what does this print?"), checking syntax, or practicing outside a session.

## Progress (your notes)

Every note CodeCoach keeps is a Markdown file in your Library. Read and edit them here, or press **Open file** to open one in your usual editor (and **Obsidian** if you have it).

- **Overview** - every topic's level (click to practice; ● = review due), Toolkit progress, **Outcomes**, all sessions.
- **Roadmap** - the plan in order. Tick boxes right here; hover an item for **Learn**.
- **Mastery** (Mastery Tracker) - each topic's rung, mastered or not, last practiced, next review.
- **Toolkit** - the one-line building blocks you need (e.g. `map.getOrDefault(k, 0)`), each *new / shaky / solid*. Shared by all courses in the same language.
- **Mistakes** - your repeated mistakes and how often they show up.
- **Patterns** (Pattern Library) - reusable solution patterns (counting, searching, pairwise...) with trigger words, skeletons and pitfalls.
- **Blueprint** - what your class's tests look like (format, rules, traps).
- **Course profile** - how the course works: goal, assessments, next quiz date, AI policy, code format, target minutes. Keep "Next assessment" current so your coach plans around it.
- **Learner profile** - how *you* learn best (see above). Shared by every course.

**Outcomes** measure what studying has actually done, from your own work (`Outcomes.md` in the course folder):

- **Learning gain** - before your coach teaches a new topic it gives one short check problem (it's fine to get stuck), and after you master the topic one more like it. The gain is how much of what you didn't know you now can do.
- **Retention** - 30, 60 and 90 days after you master a topic, a review includes one fresh problem on it. Solved without hints = kept.
- **Transfer** - now and then a problem uses a pattern you know in a new kind of situation.
- **Speed and independence** - minutes, hints and first-try rate on R5/R6 problems, month by month, and your practice exam scores.
- **Export CSV** saves every logged result as a spreadsheet file on your computer. Nothing is ever sent anywhere.

Your coach also writes a **session note** for every session (`sessions/` in the course folder) and saves your solutions (`practice/`).

## Courses

Press **+** next to the course picker.

- **A class I'm taking:** name, language, level, goal, assessments, AI policy for graded work, minutes per problem. Then add class content in Materials.
- **Learn a language:** for self-study (e.g. "Learn C++"). Your coach asks about your background in the first session and writes your roadmap.

Switch courses with the picker at the top-left. Each course has its own notes; the Toolkit is shared per language and the Learner Profile across everything.

## Your AI coach

**Name:** Settings → AI & coach → *Your coach's name* (shown in the chat and used by the AI).

**Bring your own model** (Settings → AI & coach, or the switcher at the bottom of the sidebar). CodeCoach works with any AI that speaks the OpenAI chat format, and the whole choice is **one line of config**:

| Provider | One line | Cost |
| --- | --- | --- |
| OpenRouter (cloud, hundreds of models) | `openrouter:deepseek/deepseek-v4.1-flash` | pay per use, some free |
| Ollama (on this computer) | `ollama:qwen3:14b` | free, private |
| LM Studio (on this computer) | `lmstudio:qwen/qwen3-14b` | free, private |
| OpenAI, Anthropic, Gemini, Groq, DeepSeek, Mistral | `openai:gpt-5-mini` | pay per use |
| Any other OpenAI-compatible server | `my-model@https://their-server/v1` | depends |

Paste a line into Settings, pick from the lists there, or edit `~/.codecoach/config.json` (`"ai": "..."`). Keys go in Settings (or an environment variable like `OPENROUTER_API_KEY`) and stay on this computer only. A provider that doesn't exist yet needs no update: use the `model@url` form, or add it once under `"providers"` in config.json. The sidebar switcher remembers the AIs you've used, so swapping between, say, a cloud model and a local one is one click.

- **Cloud (e.g. OpenRouter):** best quality. Pay per use - a heavy study day has cost about $0.04, roughly $1-2 a month. The sidebar shows today's and this week's cost (see *Costs* below).
- **Local (Ollama / LM Studio):** free, private, works offline - but slower and a weaker teacher. Good for drills, reviews and offline study.

**Setting up local (one time):**
1. Install Ollama (ollama.com).
2. In Terminal: `ollama pull qwen3:14b` (or a smaller model on an 8 GB computer).
3. In Ollama's settings set **Context length to 32k** (CodeCoach's instructions are long).
4. CodeCoach: Settings → AI & coach → Provider **Ollama** → **Find models** → pick it → Save. Also set "Summarize long sessions after" to about 20000.

On an Intel Arc graphics card: update the Arc driver first. If Ollama doesn't use the graphics card (Task Manager → GPU stays near 0%), use LM Studio with its Vulkan option and server address `http://localhost:1234/v1`.

*Suggested:* cloud for learning new topics (a misconception costs more than a few cents), local as a free backup.

### Costs

- **OpenRouter** tells CodeCoach the exact cost of every reply, so the sidebar and the session chip show real amounts.
- **OpenAI, Anthropic, Gemini, DeepSeek, Mistral and others** only report how many tokens were used. CodeCoach multiplies them by published prices (OpenRouter's public price list, refreshed once a day, no account needed) and shows the result with **≈**. Hover it to see when prices were last updated. Your provider's own bill is always the exact amount.
- **Local models** cost nothing and show "free".
- **Price unknown?** If a model isn't on the public list, add its price (US dollars per million tokens) to `~/.codecoach/price_overrides.json`:

```json
{ "openai:gpt-6-luna": { "input": 1.25, "output": 10, "cached": 0.125 } }
```

The key is the same one line you use for the AI. `cached` is the price for input the provider served from its cache (leave it out if you don't know it).

## Themes and look

- **Themes** (sidebar, or ⇧⌘K): 47 themes, grouped Light then Dark and A-Z inside each, including fun ones (Synthwave, Cyberpunk, Bubblegum...). Hover to preview, click to keep, **Random** for luck. **Follow Mac light/dark** uses one theme for each.
- Every theme's colors are checked so text and code always stay readable.
- **Settings → Appearance:** accent color, text size, editor font and size.

## Sound and effects

Optional sounds, all generated inside the app (no audio files), tuned to stay subtle. Settings → **Sound & effects**; quick mute with the **Sound on/off** button in the sidebar or ⇧⌘M.

- **Mute all / master volume** - one switch silences everything.
- **Typing sounds** - pick a keyboard feel: *Creamy* (soft, muted thock), *Clacky* (crisp, bright), *Thocky* (deep, heavy), *Typewriter* (sharp, with a bell on Enter) or *Bubble* (soft pops). Choose where they play: **when writing code**, **in chat & text boxes**, or both. Its own volume, and **Try** to preview.
- **Effect sounds** - pick a style: *Soft* (warm), *Crisp* (glassy) or *Retro* (8-bit). Turn groups on or off:
  - **Right / wrong & tests** - a rising chime for right answers and passing tests, a low soft tone for wrong ones; a bigger chord when you solve a problem, and an arpeggio when a topic is mastered.
  - **Coach replied** - a quiet pluck when your coach finishes a message (handy if you look away).
  - **Timers & pause** - a bell when a countdown ends, a blip on pause/resume.
  - **Button clicks** - a tiny tick on clicks (off by default).
- **Hear them** - preview every effect.
- **Celebrations** - a small burst of sparks when you solve a problem or master a topic (turns off automatically if your Mac is set to reduce motion).

*Why sounds at all?* Immediate, consistent feedback for right/wrong makes results easier to notice without reading, and a small reward for real progress (solving, mastering) is motivating. They're deliberately quiet and never play while the app is in the background.

## Your data: saving, syncing and other computers

**Your data stays yours.** All your notes, solutions and progress live in a plain folder on your computer - your **Library**. There's no account and no CodeCoach cloud. The **Welcome** page shows where it is.

- **Everything saves automatically**: chat, code, problems, timers, notes.
- **What's inside:** each course is a folder (`_course.md`, Roadmap, Mastery Tracker, Toolkit, Mistakes, Patterns, `materials/`, `practice/` with every solution you wrote, `sessions/` with a readable log of every session). `CodeCoach/` holds saved sessions (for resuming), snippets, usage and your Learner Profile.
- **Plain Markdown:** open or edit any of it in TextEdit, Notepad, VS Code - or open the Library as an Obsidian vault. CodeCoach handles hand-edited notes.
- **Sync for free:** put the Library in iCloud Drive, Dropbox, OneDrive or Google Drive, or track it with Git or Syncthing. Install CodeCoach on the other computer and choose the same folder (Settings → Library & sync). If the same session was changed on two computers, nothing is overwritten silently:
  - **Changed on another computer:** when you come back to the window (or CodeCoach tries to save) and the other computer saved a newer version, a bar asks: **Load that version**, or **Keep mine as a copy** (yours becomes its own session).
  - **Conflict copies:** when a sync service can't merge two edits it keeps both files ("conflicted copy", "name 2", "-LAPTOP", "sync-conflict"). CodeCoach shows these as one session with "2 versions" and asks once you open it: **Compare**, **Use newest**, or **Keep both**. Replaced versions go to `CodeCoach/trash`, never deleted.
- **Per computer only:** API keys, which AI, Library location, theme and look, Playground drafts. Keys are never stored in the Library or in exports.
- **Export everything:** Welcome (or Settings → Library & sync) → **Export everything** makes one zip of every course, solution, session and setting (minus keys), with a note on how to restore it.
- **Updates:** once a day CodeCoach asks GitHub whether a newer version exists (nothing about you is sent). If there is one, an **Update available** button appears at the bottom of the sidebar with what's new and a Download link; installing it never touches your Library. **Skip this version**, **Later**, or turn checking off in Settings → App.
- **Moving to a new computer:** sync or copy the Library (or unzip an export), install CodeCoach, choose that folder, add your AI key.

## Routines that work

**A normal week in a class (e.g. CS 124):**
1. After each lecture/lesson, add the content to Materials under that week's unit.
2. **Learn** session on the new topic with those materials ticked.
3. **Drill** for 15-20 minutes most days - it closes the "I get it but can't write it" gap.
4. Do whatever **Today** says is due (reviews take a few minutes each).
5. Two days before a quiz: add the practice quiz, then a **Quiz sim**. Fix what it finds.
6. After the quiz: add your feedback to Materials - your coach turns misses into targeted practice.

**When time is short:** Today → Review all (10-15 min). Short, frequent sessions beat one long cram.

**Session length:** 30-60 minutes of focused work, then a break (your coach suggests one around 50 minutes). Always press **End session** so your notes and review dates are updated.

## Keyboard shortcuts

| Keys | Action |
|---|---|
| ⌘1 - ⌘5 | Today · Study · Materials · Playground · Progress |
| ⌘↵ | Run code / run tests |
| ⇧⌘↵ | Submit solution |
| ⌘S | Save snippet / note |
| ⌘/ | Comment line |
| ⇧⌘F | Re-indent (Playground) |
| ⌘F | Find in editor |
| A-D | Answer a quiz card |
| ⌘, | Settings |
| ⇧⌘K | Themes |
| ⇧⌘M | Mute / unmute sounds |
| Esc | Close a dialog |
| ⌃⌘F | Full screen (Mac window) |
| ⌘= / ⌘- | Zoom in / out (Mac window) |

## Troubleshooting

- **Pages are blank / nothing loads:** an old CodeCoach may still be running. Settings → **Quit CodeCoach** (bottom left of Settings) and open CodeCoach again.
- **A Terminal window opens when CodeCoach starts** (source-folder installs only): macOS doesn't let that launcher read your Documents folder, so it starts through Terminal. Close Terminal; CodeCoach keeps running. The downloadable app asks for permission instead.
- **"CodeCoach isn't running":** it quits 20 minutes after its window closes (change in Settings). Open the app again.
- **"CodeCoach was restarted. Reload":** press ⌘R.
- **The page refreshed by itself:** usually macOS reclaiming memory from the window (more likely with a local AI model loaded). CodeCoach reopens your session automatically with your code, chat draft and timers. The reason is logged in `~/.codecoach/window.log`.
- **AI error 402:** not enough credit with your AI provider for that reply - lower "Max reply length", add credit, or switch to a free or local model.
- **AI error 429:** a free model's rate limit - wait or switch models.
- **"Empty reply" or a cut-off reply:** press Retry; if it repeats, raise "Max reply length".
- **Local AI is very slow the first message:** normal - it's reading the long instructions; later replies are faster. Check the context length is 32k.
- **A language says "not installed":** Settings → Languages shows how to install it.
- **Something looks wrong in a note:** edit it in Progress or any editor - CodeCoach handles hand-edited notes.

## The research behind it

- **Retrieval practice and spacing** - testing yourself and spreading practice out over time are among the most reliable ways to learn (e.g. MIT Open Learning's summary of spaced and interleaved practice; reviews of spacing and retrieval research).
- **Interleaving** - mixing problem types improves choosing the right method.
- **Worked examples, subgoal labels and fading** - labelled worked examples help novices; support should fade as expertise grows (Kalyuga's *expertise reversal effect*).
- **Parsons problems** - ordering code blocks gives similar learning to writing code in less time (Ericson and colleagues; multi-institution studies).
- **PRIMM** - predict, run, investigate, modify, make (Sentance et al.; Raspberry Pi Foundation's review of programming pedagogy).
- **Code tracing before writing** - novices need reliable tracing before independent writing (Lister and colleagues).
- **Learning styles** - matching teaching to "visual/auditory" styles isn't supported by evidence (Pashler, McDaniel, Rohrer & Bjork, 2008). Prior knowledge is what should drive personalization.
