// The display consumes the recorded action after selection. It never scores an action.
export const faces = {
  neutral: ['平静', '等待开口，给对方留出说话的时间。'],
  curious: ['好奇', '需要澄清一处细节，或一起查看状态记录。'],
  talk: ['轻声说话', '解释一项支持方法，或商量一个具体步骤。'],
  serious: ['专注', '仔细阅读记录，或在即时支持中安静陪伴。'],
  'serious-talking': ['认真回应', '说明即时支持的下一步，或梳理需要联系的人。'],
  worried: ['关切', '当前记录显示日常活动负担明显，先关注眼前的困难。'],
  sad: ['难过', '对方提到情绪低落时，轻轻回应这份感受。'],
  'sad-serious-talking': ['郑重安慰', '在低落或自责的情境中，认真回应对方的感受。'],
  smile: ['浅笑', '对方主动把一个可尝试的动作加入计划时，轻轻致意。'],
  happy: ['开心', '对方亲手标记计划完成时，短暂分享这一刻。'],
  surprised: ['惊讶', '角色演绎：突然发现一件出乎意料的小事。'],
  'surprised-smile-talking': ['惊喜地说话', '角色演绎：听见惊喜的好消息，想再问一句。'],
  'sad-smile-talking': ['含笑宽慰', '角色演绎：回望已经过去的遗憾，带着一点笑意道别。'],
  crying: ['落泪', '角色演绎：Merel 自己经历离别，终于落泪。'],
  aghast: ['惊骇', '角色演绎：Merel 遭遇突发险情，一时说不出话。'],
  'hurt-smile': ['负伤浅笑', '角色演绎：自己受了伤，见到熟悉的人仍露出笑意。'],
  'hurt-talking': ['负伤说明', '角色演绎：受伤后向同伴说明刚才发生的事。'],
  'hurt-sad-talking': ['负伤低语', '角色演绎：受伤后向同伴说起一件伤心事。'],
  'hurt-smile-talking': ['负伤笑语', '角色演绎：受伤后得到照应，微笑着说声谢谢。'],
  'hurt-serious-talking': ['负伤正色', '角色演绎：身处困境，仍认真交代下一步。'],
};

const pageFaces = {
  chat: ['neutral', 'curious'], state: ['curious', 'neutral'], plans: ['serious', 'talk'],
  research: ['serious', 'neutral'], settings: ['neutral', 'curious'],
};
const strategyFaces = {
  greeting: ['smile', 'neutral'],
  clarification: ['curious', 'neutral'], emotional_reflection: ['neutral', 'talk'],
  cognitive_reflection: ['serious', 'talk'], professional_linkage: ['serious-talking', 'serious'],
  social_support: ['serious-talking', 'neutral'],
  activity_planning: ['talk', 'serious'], problem_solving: ['talk', 'curious'],
  psychoeducation: ['talk', 'neutral'], daily_rhythm: ['talk', 'neutral'],
  execution_support: ['talk', 'serious'],
};

export function expressionChoices({page = 'chat', currentState, turn, latest, busy, failed, loading, event}) {
  const urgent = t => t?.trace?.route === 'urgent_support' || t?.selected_action?.id === 'urgent_support';
  if (urgent(latest) || urgent(turn)) return ['serious', 'serious-talking'];
  if (loading || busy || failed) return ['neutral', 'serious'];
  const symptoms = currentState?.symptoms ?? {};
  const present = code => symptoms[code]?.presence === 'present';
  const burden = Object.values(currentState?.functional_burden ?? {}).some(value => value >= 2);
  const reflection = turn?.selected_action?.strategy_id === 'emotional_reflection';
  const responding = page === 'chat' || page === 'research';
  if (present('low_mood') || present('self_blame')) {
    const listening = present('low_mood') ? 'sad' : 'serious';
    return reflection && responding ? ['sad-serious-talking', listening] : [listening, 'neutral'];
  }
  if (burden) return ['worried', 'serious'];
  if (event === 'plan-added' || event === 'plan-done') {
    const strained = present('activation') || present('irritability') ||
      Object.values(symptoms).some(s => s?.presence === 'conflicting' ||
        (s?.presence === 'present' && s.value === 3));
    if (strained) return ['serious', 'neutral'];
    return event === 'plan-done' ? ['happy', 'smile'] : ['smile', 'neutral'];
  }
  if (responding && turn) return strategyFaces[turn.selected_action?.strategy_id] ?? ['neutral', 'serious'];
  return pageFaces[page] ?? pageFaces.chat;
}
