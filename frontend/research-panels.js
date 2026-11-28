import { setProgressiveImage } from './progressive-images.js?v=20261128-portraits1';
import { faces } from './expression-policy.js';

export function researchProgress(el) {
  const row = (label, content) => el('div', {}, el('dt', {}, label), el('dd', {}, content));
  return el('details', {class:'panel research-progress'},
    el('summary', {}, '研究进展', el('small', {}, '11 月 25 日')),
    el('dl', {},
      row('公开语料基线', '在 ESConv 的 1,300 段对话上预测支持策略。仅用当前话语时，测试集 Macro-F1 为 19.02%，加入历史上下文后为 23.54%。'),
      row('已接入原型', '逐轮更新 12 项心理状态记录，按规则从 30 个候选动作中选取支持动作，保存回复、候选分值和使用者反馈。'),
      row('已完成接口测试', '已在人工编写的场景中测试在线模型的结构化抽取接口。每轮实际使用的抽取与生成方式可在执行轨迹中查看。'),
      row('语言技能', 'Merel v0.4 使用原文锚点、四层角色资料与同动作示例，生成后进行事实和动作复核。日常问候单独回应；既有状态记录保留，带具体困扰的消息继续进入支持流程。'),
      row('待验证', '低秩交互排序与同信息基线的比较、独立回复盲评，以及用个人历史预测后续帮助度。')));
}

export function decisionSummary(el, turn, definitions) {
  if(turn.trace?.route==='greeting') return el('p',{class:'settings-copy'},'本轮是日常问候，没有新增心理状态内容。');
  const snapshot = turn.state ?? {};
  const labels = new Map(definitions.map(def => [def.code, def.label]));
  const observed = Object.entries(snapshot.symptoms ?? {}).filter(([, v]) => v?.presence === 'present');
  const state = observed.map(([code, item]) => {
    const level = ['无', '轻微', '明显', '很强'][item.value] ?? '强度待补充';
    return (labels.get(code) ?? code) + '（' + level + '）';
  }).join('、');
  const impacts = Object.entries({study:'学习或工作', selfcare:'自我照料', social:'社交'})
    .filter(([key]) => snapshot.functional_burden?.[key] != null)
    .map(([key, name]) => name + ' · ' + ['无影响','轻微','明显','很大'][snapshot.functional_burden[key]]);
  const feedback = turn.feedback;
  const item = (title, body) => el('div', {}, el('dt', {}, title), el('dd', {}, body));
  return el('dl', {class:'decision-summary'},
    item('本轮记录的表现', state || '本轮快照中没有标为存在的表现'),
    item('时间与生活影响', [snapshot.duration_days != null ? '持续 ' + snapshot.duration_days + ' 天' : '', ...impacts].filter(Boolean).join('，') || '尚未记录'),
    item('使用者反馈', feedback ? '帮助度 ' + feedback.helpfulness + '/5，行动负担 ' + feedback.burden + '/5' : '尚未评价'));
}

export function expressionAlbum(el) {
  const options = el('select', {id:'album-expression'});
  const entries = Object.entries(faces);
  for (const [label, group] of [
    ['支持互动', entries.filter(([, value]) => !value[1].startsWith('角色演绎'))],
    ['角色演绎 · 手动观看', entries.filter(([, value]) => value[1].startsWith('角色演绎'))],
  ]) {
    options.append(el('optgroup', {label}, group.map(([id, [name]]) => el('option', {value:id}, name))));
  }
  const picture = el('img', {alt:'', width:1789, height:6090});
  const copy = el('p', {'aria-live':'polite'});
  const detail = el('details', {class:'panel wide expression-album'},
    el('summary', {}, 'Merel 表情册', el('small', {}, '20 种神态')),
    el('div', {class:'album-body'}, el('div', {class:'album-portrait'}, picture),
      el('div', {class:'album-controls'}, el('label', {for:options.id}, '预览表情'), options, copy)));
  function display() {
    if (!detail.open) return;
    const id = options.value;
    setProgressiveImage(picture, 'expressions/' + id);
    picture.alt = 'Merel · ' + faces[id][0];
    copy.textContent = faces[id][1];
  }
  detail.addEventListener('toggle', display);
  options.addEventListener('change', display);
  return detail;
}
