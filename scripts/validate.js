// Checks the study content before it is published. Run: node scripts/validate.js
// Exits with an error if any file is broken, so a bad weekly update is never pushed.
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'docs', 'content');
const read = f => JSON.parse(fs.readFileSync(path.join(dir, f + '.json'), 'utf8'));
const errs = [];
const u = read('units'), c = read('cards'), q = read('questions'), e = read('english'), iv = read('interview'), p = read('plan'), b = read('brief');
const units = new Set(u.units.map(x => x.id));
const ids = new Set();
const isDate = s => /^\d{4}-\d{2}(-\d{2})?$/.test(s);
for (const x of c.cards) { if (!units.has(x.unit)) errs.push('card ' + x.id + ': unknown unit ' + x.unit); if (ids.has(x.id)) errs.push('duplicate id ' + x.id); ids.add(x.id); if (!x.front || !x.back) errs.push('card ' + x.id + ': empty side'); }
for (const x of q.questions) {
  if (!units.has(x.unit)) errs.push('question ' + x.id + ': unknown unit ' + x.unit);
  if (ids.has(x.id)) errs.push('duplicate id ' + x.id); ids.add(x.id);
  if (!Array.isArray(x.o) || x.o.length !== 4) errs.push('question ' + x.id + ': needs 4 options');
  if (!(x.a >= 0 && x.a < x.o.length)) errs.push('question ' + x.id + ': answer index out of range');
  if (new Set(x.o).size !== x.o.length) errs.push('question ' + x.id + ': duplicate options');
}
for (const x of e.items) if (!(x.a >= 0 && x.a < x.o.length)) errs.push('english ' + x.id + ': answer index out of range');
const ivs = new Set(iv.questions.map(x => x.id));
for (const d of p.days) { for (const un of d.units) if (!units.has(un)) errs.push('plan day ' + d.day + ': unknown unit ' + un); if (d.interview !== 'mock' && !ivs.has(d.interview)) errs.push('plan day ' + d.day + ': unknown interview ' + d.interview); }
const sids = new Set();
for (const s of b.stories) {
  if (sids.has(s.id)) errs.push('duplicate story ' + s.id); sids.add(s.id);
  if (!units.has(s.unit)) errs.push('story ' + s.id + ': unknown unit ' + s.unit);
  if (!isDate(s.date)) errs.push('story ' + s.id + ': bad date');
  if (!s.source || !/^https:\/\//.test(s.source.url || '')) errs.push('story ' + s.id + ': missing https source');
}
for (const f of ['units', 'cards', 'questions', 'brief']) if (!isDate(read(f).updated)) errs.push(f + '.json: bad "updated" date');
if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
console.log('Content OK:', c.cards.length, 'cards,', q.questions.length, 'questions,', b.stories.length, 'brief stories');
