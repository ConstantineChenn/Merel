import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { expressionChoices as choose, faces } from '../frontend/expression-policy.js';
import { imageCatalog } from '../frontend/image-catalog.js';

const files = readdirSync(new URL('../frontend/images/merel/progressive/expressions/', import.meta.url));
assert.deepEqual(files.sort(), Object.keys(faces).flatMap(id => [id + '.preview.webp', id + '.full.webp']).sort());
assert.equal(Object.keys(imageCatalog).length, 34);
for (const asset of Object.values(imageCatalog)) {
  for (const url of [asset.preview, asset.full]) {
    assert.ok(url.startsWith('/assets/images/merel/progressive/'));
    assert.ok(statSync(new URL('../frontend/' + url.slice('/assets/'.length), import.meta.url)).size > 0);
  }
}
const catalog = JSON.parse(readFileSync(new URL('../backend/data/action_catalog_draft.json', import.meta.url)));
for (const action of catalog.actions) {
  const options = choose({turn:{selected_action:action}});
  assert.ok(options.every(key => faces[key] && !faces[key][1].startsWith('角色演绎')));
}
const currentState = {symptoms:{low_mood:{presence:'present',value:null}}};
assert.deepEqual(choose({turn:{selected_action:{strategy_id:'greeting'}}}),['smile','neutral']);
assert.ok(!choose({currentState,turn:{selected_action:{strategy_id:'greeting'}}}).includes('happy'));
const turn = {selected_action:{strategy_id:'emotional_reflection'}};
assert.equal(choose({currentState, turn})[0], 'sad-serious-talking');
assert.equal(choose({currentState, busy:true})[0], 'neutral');
assert.equal(choose({currentState:{symptoms:{low_mood:{presence:'absent',value:0}}},turn})[0], 'neutral');
const latest = {trace:{route:'urgent_support'}};
for (const page of ['chat','state','research','settings','plans']) {
  assert.deepEqual(choose({latest,turn,page,event:'plan-done',busy:true}), ['serious','serious-talking']);
  assert.ok(!choose({page,event:'plan-done',currentState}).includes('happy'));
}
assert.equal(choose({page:'plans'})[0], 'serious');
assert.equal(choose({page:'plans',event:'plan-done'})[0], 'happy');
assert.equal(choose({page:'chat',event:'plan-added'})[0], 'smile');
assert.equal(choose({event:'plan-done',currentState:{functional_burden:{study:2}}})[0], 'worried');
assert.equal(choose({event:'plan-done',currentState:{symptoms:{activation:{presence:'present',value:null}}}})[0], 'serious');
for (const rating of [1,2,3,4,5]) {
  assert.deepEqual(choose({turn:{...turn,feedback:{helpfulness:rating,burden:1}}}),choose({turn}));
}
console.log('34 preview/full image pairs, 20 expressions, 30 actions, navigation, feedback and priority checks passed.');
