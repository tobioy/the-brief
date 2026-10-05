# The Brief

A study app for the National Intelligence Agency (Nigeria) entrance exam and interview. It runs on an iPhone as a home-screen web app, works offline, and gets new content every week.

**App:** https://tobioy.github.io/the-brief/

## How the learner uses it
1. Open the link in **Safari** on the iPhone.
2. Tap the Share button, then **Add to Home Screen**.
3. Always open The Brief from the home-screen icon. (On iPhone, the icon and Safari keep separate storage, so switching between them splits progress.)

Each day takes about 35 minutes: the Daily Brief, a lesson, flashcards, a quiz, an English or maths drill, and one interview question. Days 7 and 14 have mock exams. After the 14-day bootcamp it switches to a daily routine that targets weak topics, with a mock exam every Sunday.

Progress lives on the phone. **Progress → Share progress report** sends a summary by WhatsApp, iMessage or email. **Progress → Back up or restore** gives a code to move progress to a new phone.

## How it stays current
A scheduled Claude task updates `docs/content/` every Sunday (full update) and Wednesday (Daily Brief only), following [UPDATING.md](UPDATING.md), runs `node scripts/validate.js`, and pushes. GitHub Pages republishes on its own.

## Layout
- `docs/`: the app (served by GitHub Pages from the `docs` folder on `main`)
  - `index.html`, `styles.css`, `app.js`, `sw.js` (offline cache), `manifest.webmanifest`, `icons/`
  - `content/units.json`: modules and lessons
  - `content/cards.json`, `content/questions.json`: flashcards and quiz questions
  - `content/english.json`: English and logic items (maths questions are generated in `app.js`)
  - `content/interview.json`: interview questions, tips and example answers
  - `content/brief.json`: the Daily Brief
  - `content/plan.json`: the 14-day bootcamp
- `scripts/validate.js`: checks content before publishing
