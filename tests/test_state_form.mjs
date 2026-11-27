import assert from 'node:assert/strict';
import { symptomSelection, statePatch } from '../frontend/state-form.js';

// Synthetic observations: presence and severity deliberately differ.
const initial = {
  symptoms: {
    sleep: { presence: 'present', value: 1, evidence: '有点睡不着' },
    fatigue: { presence: 'present', value: null, evidence: '白天没精神' },
    concentration: { presence: 'present', value: null, evidence: '总是走神' },
    appetite: { presence: 'unknown', value: null },
    low_mood: { presence: 'absent', value: 0 },
  },
  functional_burden: { study: null, selfcare: null, social: null },
  duration_days: 14,
};
const unchanged = {
  symptoms: Object.fromEntries(Object.entries(initial.symptoms).map(([code, value]) => [code, symptomSelection(value)])),
  functional_burden: { study: '', selfcare: '', social: '' },
  duration_days: '14',
};

assert.equal(symptomSelection(initial.symptoms.fatigue), 'keep-presence');
assert.equal(symptomSelection(initial.symptoms.low_mood), '0');
assert.deepEqual(statePatch(initial, unchanged, 1), { expected_version: 1 });
assert.deepEqual(statePatch(initial, { ...unchanged, functional_burden: { ...unchanged.functional_burden, study: '2' } }, 1), { expected_version: 1, functional_burden: { study: 2 } });
assert.deepEqual(statePatch(initial, { ...unchanged, symptoms: { ...unchanged.symptoms, sleep: '2' } }, 1), { expected_version: 1, symptoms: { sleep: 2 } });
assert.deepEqual(statePatch(initial, { ...unchanged, symptoms: { ...unchanged.symptoms, fatigue: '' } }, 1), { expected_version: 1, symptoms: { fatigue: null } });
assert.deepEqual(statePatch(initial, { ...unchanged, symptoms: { ...unchanged.symptoms, fatigue: '1' } }, 1), { expected_version: 1, symptoms: { fatigue: 1 } });
assert.deepEqual(statePatch(initial, { ...unchanged, duration_days: '' }, 1), { expected_version: 1, duration_days: null });
assert.throws(() => statePatch(initial, { symptoms: { fatigue: 'NaN' } }, 1));
assert.throws(() => statePatch(initial, { duration_days: '3651' }, 1));
assert.equal(initial.symptoms.fatigue.presence, 'present');
assert.equal(initial.symptoms.fatigue.value, null);

console.log('12 assertions passed: presence, missing severity, unchanged fields, explicit corrections, duration, validation, immutable snapshots.');
