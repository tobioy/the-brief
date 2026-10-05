# Weekly content update

The Brief gets new content every Sunday (full update) and Wednesday (Daily Brief only). A scheduled Claude task does this by editing the JSON files in `docs/content/`, checking them, and pushing to `main`. GitHub Pages republishes automatically, and the app picks up the new files the next time it is opened.

The learner never needs to do anything. Their progress is stored on their phone and is keyed by item `id`, so **never change or reuse an existing `id`**.

## What each run does

### Every run (Sunday and Wednesday): the Daily Brief
1. Research what happened in the last 3–4 days (Wednesday) or 7 days (Sunday) on the syllabus topics: Nigeria's security by zone, the Sahel / AES / ECOWAS, the US–Israel–Iran war, Russia–Ukraine, Israel–Palestine and Gaza, Sudan and DR Congo, global trade and Nigeria's economy, terrorism, trafficking and organised crime, Nigerian foreign policy, and any change to office holders.
2. Rewrite `docs/content/brief.json`:
   - `updated`: today's date (YYYY-MM-DD). `week`: e.g. "Week of 12 October 2026".
   - 4–6 `stories`, newest first. Keep at most 2 older stories if they are still the latest word on a topic.
   - Each story: a new unique `id` (`br-YYYY-MM-DD-topic`), `date`, `tag`, `unit` (the closest unit id from `units.json`), `title`, `body` (3–5 plain sentences), `why` (one sentence: why it matters to Nigeria), `source` (`name` and `https` `url` of the article actually used), and 0–3 `cards` (`front`/`back`) on facts likely to be asked.

### Sunday only: keep the course current
3. Re-check every "(checked …)" office-holder card in `cards.json` and the A2 lesson in `units.json`. If someone has changed, edit the card's `back` and the lesson text, and update "(checked …)" to the new month. Keep the same `id`.
4. Update the "where it stands now" paragraphs of lessons whose situation changed (ceasefires, talks, major attacks, new laws). Keep each lesson's sections short. Update that unit's `sources`.
5. Add 3–8 new questions to `questions.json` and 3–8 new cards to `cards.json` on new, important facts. New ids continue the numbering for that unit (e.g. `qD2-08`, `D2-11`). Questions need exactly 4 distinct options, `a` = index of the right one, and `x` = a one-sentence explanation.
6. If a fact in an existing card or question has become wrong (not just old), fix it in place. If it is only out of date, add "(as of Month YYYY)" to the text.
7. Set `updated` in every file you changed.

### Finish
8. Run `node scripts/validate.js`. Fix anything it reports. Do not push if it fails.
9. Commit with a message like `Weekly update: 12 Oct 2026` and push to `main`.

## Source rules
Facts come from official bodies, wire services, established broadcasters and research institutes. Opinion pieces, blogs, unverified social media and content farms are never the source for a quiz answer.

- Nigerian official: statehouse.gov.ng, foreignaffairs.gov.ng, NAPTIP, NDLEA, NBS, CBN, Voice of Nigeria (von.gov.ng), News Agency of Nigeria (nannews.ng)
- Nigerian press: Premium Times, Channels TV, The Guardian Nigeria, Punch, BusinessDay
- Regional and international: ECOWAS, African Union, UN and UN Security Council, UNODC, UNHCR, IOM, IMF, World Bank, WTO
- Wire services and broadcasters: Reuters, AP, AFP, BBC, Al Jazeera
- Research and trackers: International Crisis Group, ACLED, CFR Global Conflict Tracker, ISS Africa, Chatham House, UK House of Commons Library, Global Terrorism Index

Where two good sources disagree on a number, use the more conservative figure and name the source in the text. Write in plain British English, short sentences, no em-dashes.

## Privacy
Nothing about the learner is stored in this repository. Do not add their name or details to any file.
