import test from 'node:test';
import assert from 'node:assert/strict';
import {voiceConfiguration,turnVoiceStatus} from '../frontend/voice-status.js';
test('installed offline skill is not shown as active',()=>{
  assert.match(voiceConfiguration({available:true,enabled:false}).label,/待连接/);
  assert.match(voiceConfiguration(null).label,/等待服务更新/);
});
test('only accepted online generation has a skill version',()=>{
  const generation={voice_version:'v-test',review_status:'accepted',example_ids:['E1'],rewrite_count:1,model_call_count:4};
  const accepted=turnVoiceStatus({trace:{generator:'llm',model_calls:{generation}}});
  assert.equal(accepted.version,'v-test');assert.equal(accepted.rewrites,1);
  const fallback=turnVoiceStatus({trace:{generator:'local_support_templates',model_calls:{generation_failure_details:generation}}});
  assert.equal(fallback.version,undefined);assert.equal(fallback.label,'本地回应');
  assert.equal(turnVoiceStatus({trace:{route:'urgent_support',generator:'llm',model_calls:{generation}}}).version,undefined);
});
test('older turns are not retroactively assigned the new skill',()=>{
  assert.equal(turnVoiceStatus({trace:{generator:'llm'}}).version,undefined);
});
test('offline greeting is accurately labelled',()=>{
  const result=turnVoiceStatus({trace:{route:'greeting',generator:'local_greeting'}});
  assert.equal(result.label,'日常回应');
  assert.equal(result.version,undefined);
});
