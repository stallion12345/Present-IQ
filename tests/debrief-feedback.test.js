const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const functionPath = path.join(__dirname, '..', 'netlify', 'functions', 'analyse-transcript.js');
const functionSource = fs.readFileSync(functionPath, 'utf8');
const validatorSource = functionSource.match(/function validateWeakSentences\(weakSentences, sentenceCount\) \{[\s\S]*?\n\}/);
assert.ok(validatorSource, 'weak sentence validator should exist');

const validateWeakSentences = vm.runInNewContext(
  `${validatorSource[0]}; validateWeakSentences`,
  {}
);

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const speedSource = html.match(/function suggestedScrollUnits\(wpm, scriptHeight, totalWords\) \{[\s\S]*?\n\}/);
assert.ok(speedSource, 'scroll speed conversion should exist in public/index.html');

const suggestedScrollUnits = vm.runInNewContext(
  `${speedSource[0]}; suggestedScrollUnits`,
  { SCROLL_PIXELS_PER_UNIT: 16 }
);

test('validates weak sentence indexes, uniqueness, count, and reason length', () => {
  const reason = 'one two three four five six seven eight nine ten eleven twelve thirteen';
  const result = validateWeakSentences([
    { index: 2, reason },
    { index: 2, reason: 'duplicate' },
    { index: 0, reason: 'out of range' },
    { index: 3.5, reason: 'not an integer' },
    { index: 4, reason: 'outside script' },
    { index: 1, reason: 'valid second' },
    { index: 3, reason: 'valid third' },
    { index: 5, reason: 'capped' }
  ], 3);

  assert.deepEqual(JSON.parse(JSON.stringify(result)), [
    { index: 2, reason: 'one two three four five six seven eight nine ten eleven twelve' },
    { index: 1, reason: 'valid second' },
    { index: 3, reason: 'valid third' }
  ]);
});

test('converts measured pace and script dimensions to clamped slider units', () => {
  assert.equal(suggestedScrollUnits(120, 1600, 100), 2);
  assert.equal(suggestedScrollUnits(600, 1600, 100), 10);
  assert.equal(suggestedScrollUnits(10, 100, 100), 1);
  assert.equal(suggestedScrollUnits(0, 1600, 100), null);
});
