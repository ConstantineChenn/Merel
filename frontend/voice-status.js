export function voiceConfiguration(voice) {
  if (!voice) return {label:'等待服务更新',detail:'重启本地服务后可读取语言技能状态。'};
  if (!voice.available) return {label:'暂不可用',detail:'语言技能未能加载，请检查服务端配置。'};
  if (!voice.enabled) return {label:'已安装 · 待连接模型',detail:'在线模型配置后，新的对话会使用 Merel 的表达方式。'};
  return {label:'已接入在线对话',detail:'新的在线回应使用 Merel 语言风格，实际使用结果可在研究回放中查看。'};
}

export function turnVoiceStatus(turn) {
  const trace=turn?.trace||{};
  if(trace.route==='urgent_support') return {label:'即时支持回应',detail:'本轮使用即时支持流程。'};
  const generation=trace.model_calls?.generation;
  if(trace.generator==='llm' && generation?.voice_version && generation?.review_status==='accepted') {
    return {label:'Merel 语言风格',detail:generation.voice_version,
      version:generation.voice_version,mode:generation.voice_mode,
      examples:generation.example_ids||[],rewrites:generation.rewrite_count||0,
      calls:generation.model_call_count};
  }
  if(trace.generator==='llm') return {label:'在线回应',detail:'本轮没有可核验的语言技能使用记录。'};
  if(trace.generator==='local_greeting') return {label:'日常回应',detail:'本轮使用本地问候表达。'};
  return {label:'本地回应',detail:'本轮未使用在线语言技能。'};
}

export function voiceSettingsPanel(el,voice) {
  const status=voiceConfiguration(voice);
  return el('section',{class:'panel','aria-label':'Merel 语言风格'},
    el('div',{class:'panel-title'},el('h2',{},'Merel 的说话方式'),el('span',{class:'tag'},status.label)),
    el('p',{class:'settings-copy'},'直率地接话，认真听清细节，也会自然地改口。'),
    el('p',{class:'settings-copy'},status.detail),
    voice?.version?el('small',{},'语言版本 · '+voice.version):null);
}

export function voiceReplayPanel(el,turn) {
  const status=turnVoiceStatus(turn);
  const modes={care:'认真关心',clarify:'澄清',thinking:'一起想办法',encourage:'回应进展',repair:'改口',everyday:'日常',greeting:'日常问候'};
  return el('section',{class:'panel','aria-label':'本轮语言风格'},
    el('div',{class:'panel-title'},el('h2',{},'本轮说话方式'),el('span',{class:'tag'},status.label)),
    el('p',{class:'settings-copy'},status.detail),
    status.version?el('dl',{class:'decision-summary'},
      el('div',{},el('dt',{},'表达情境'),el('dd',{},modes[status.mode]||'自然回应')),
      el('div',{},el('dt',{},'示例'),el('dd',{},status.examples.join('、')||'无')),
      el('div',{},el('dt',{},'生成与复核'),el('dd',{},`${status.calls??'—'} 次调用 · ${status.rewrites} 次修写`))):null);
}
