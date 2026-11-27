// Presence and severity are independent observations. Never turn missing
// severity into absence, and never overwrite untouched evidence on form save.
export function symptomSelection(symptom) {
  if (symptom?.value !== null && symptom?.value !== undefined) return String(symptom.value);
  if (symptom?.presence && symptom.presence !== 'unknown') return 'keep-presence';
  return '';
}

export function statePatch(initial, values, expectedVersion) {
  const patch = { expected_version: expectedVersion };
  const symptoms = {};
  for (const [code, selected] of Object.entries(values.symptoms || {})) {
    if (selected === symptomSelection(initial.symptoms?.[code]) || selected === 'keep-presence') continue;
    if (!['', '0', '1', '2', '3'].includes(selected)) throw new Error('Invalid symptom selection');
    symptoms[code] = selected === '' ? null : Number(selected);
  }
  if (Object.keys(symptoms).length) patch.symptoms = symptoms;
  const functions = {};
  for (const [code, selected] of Object.entries(values.functional_burden || {})) {
    const prior = initial.functional_burden?.[code];
    if (selected === (prior == null ? '' : String(prior))) continue;
    if (!['', '0', '1', '2', '3'].includes(selected)) throw new Error('Invalid functional selection');
    functions[code] = selected === '' ? null : Number(selected);
  }
  if (Object.keys(functions).length) patch.functional_burden = functions;
  if (values.duration_days !== undefined && values.duration_days !== (initial.duration_days == null ? '' : String(initial.duration_days))) {
    const days = values.duration_days === '' ? null : Number(values.duration_days);
    if (days !== null && (!Number.isInteger(days) || days < 0 || days > 3650)) throw new Error('Invalid duration');
    patch.duration_days = days;
  }
  return patch;
}
