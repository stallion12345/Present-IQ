const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const functionSource = html.match(/function alignTimestampsToSentences\(wordTimestamps\) \{[\s\S]*?\n\}/);

assert.ok(functionSource, 'alignment function should exist in public/index.html');

function align(script, timestamps, wpm = 120) {
  const context = {
    scriptSentences: script.map(text => ({ text })),
    lastCoachingData: { wpm },
    sessionDuration: 0,
    wordCount: 0
  };
  const runAlignment = vm.runInNewContext(
    `${functionSource[0]}; alignTimestampsToSentences`,
    context
  );
  return JSON.parse(JSON.stringify(runAlignment(timestamps)));
}

test('aligns repeated sentence words monotonically and uses the final word end', () => {
  const timings = align(
    ['We build systems.', 'We build systems better.'],
    [
      { word: 'We', start: 0.1, end: 0.25 },
      { word: 'build', start: 0.25, end: 0.45 },
      { word: 'systems.', start: 0.45, end: 0.8 },
      { word: '', start: 0.8, end: 0.9 },
      { word: 'We', start: 1, end: 1.15 },
      { word: 'build', start: 1.15, end: 1.4 },
      { word: 'systems', start: 1.4, end: 1.75 },
      { word: 'better.', start: 1.75, end: 2.1 }
    ]
  );

  assert.equal(timings.length, 2);
  assert.deepEqual(timings.map(({ startTimeMs, durationMs }) => ({ startTimeMs, durationMs })), [
    { startTimeMs: 100, durationMs: 900 },
    { startTimeMs: 1000, durationMs: 1100 }
  ]);
});

test('estimates unmatched sentences at the speaker pace and retains one timing per sentence', () => {
  const timings = align(
    ['An entirely absent sentence.', 'Another absent phrase.', 'We continue.'],
    [
      { word: 'We', start: 3.5, end: 3.7 },
      { word: 'continue.', start: 3.7, end: 4 }
    ]
  );

  assert.equal(timings.length, 3);
  assert.deepEqual(timings.map(({ startTimeMs, durationMs }) => ({ startTimeMs, durationMs })), [
    { startTimeMs: 0, durationMs: 2000 },
    { startTimeMs: 2000, durationMs: 1500 },
    { startTimeMs: 3500, durationMs: 500 }
  ]);
});
