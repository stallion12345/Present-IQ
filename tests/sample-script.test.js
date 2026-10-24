const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const sampleConstants = html.match(/const SAMPLE_SCRIPT = '[^']+';\r?\nconst SAMPLE_REFERENCE_TEXT = '[^']+';/);
const loadSampleFunction = html.match(/function loadSampleScript\(\) \{[\s\S]*?\n\}/);
const phraseIndexFunction = html.match(/function buildPhraseIndex\(\) \{[\s\S]*?\n\}/);

assert.ok(sampleConstants, 'sample script and reference text should be defined');
assert.ok(loadSampleFunction, 'sample load function should exist');
assert.ok(phraseIndexFunction, 'phrase index builder should exist');

test('loads the sample script, reference text, and all sample phrase triggers', () => {
  const elements = {
    scriptArea: { value: '' },
    uploadZone: { classList: { add(className) { this.added = className; } } },
    docFile: { value: 'selected-file' },
    progWrap: { style: {} },
    uploadTitle: { textContent: '' },
    uploadSub: { textContent: '' }
  };
  const loadCall = {};
  const context = {
    elements,
    loadCall,
    document: { getElementById: id => elements[id] },
    docText: '',
    docSentences: [],
    phrases: [],
    phraseIndex: {},
    loadScript(hash) { loadCall.hash = hash; loadCall.text = elements.scriptArea.value; },
    renderPhrases() {}
  };
  const result = vm.runInNewContext(
    `${sampleConstants[0]}\n${phraseIndexFunction[0]}\n${loadSampleFunction[0]}\n` +
      'loadSampleScript(); ({ loadCall, docText, docSentences, phrases, phraseIndex, elements })',
    context
  );

  assert.equal(result.loadCall.hash, 'sample');
  assert.equal(result.loadCall.text, elements.scriptArea.value);
  assert.ok(result.loadCall.text.includes('timing model'));
  assert.ok(result.loadCall.text.includes('Nebius Token Factory'));
  assert.ok(result.loadCall.text.includes('reference document'));
  assert.ok(result.docSentences.length > 0);
  assert.deepEqual(JSON.parse(JSON.stringify(result.phrases.map(item => item.phrase))), [
    'timing model',
    'Nebius Token Factory',
    'reference document'
  ]);
  assert.ok(Object.values(result.phraseIndex).every(references => references.length > 0));
  assert.equal(result.elements.docFile.value, '');
  assert.equal(result.elements.uploadZone.classList.added, 'loaded');
  assert.equal(result.elements.uploadTitle.textContent, '✓ Sample reference');
});
