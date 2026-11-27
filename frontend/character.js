import { expressionChoices, faces } from './expression-policy.js';
import { progressiveImage, setProgressiveImage } from './progressive-images.js?v=20261128-demo2';
const entries = [
  ['chat', '对话', 'CONVERSATION', 'sticker-worried'],
  ['state', '状态记录', 'STATE', 'sticker-tears'],
  ['plans', '小计划', 'SMALL STEPS', 'nav-vol31-01'],
  ['research', '研究回放', 'RESEARCH', 'nav-vol31-02'],
  ['settings', '设置', 'SETTINGS', 'nav-vol31-04'],
];
const openHint = '点击 Merel 展开空间';
let portrait, requestedExpression = 'neutral';

function showExpression(expression) {
  requestedExpression = expression;
  if (portrait.dataset.expression === expression) return;
  portrait.dataset.expression = expression;
  portrait.alt = 'Merel · ' + faces[expression][0];
  setProgressiveImage(portrait, 'expressions/' + expression, 'high');
}

function nextExpression() {
  const choices = expressionChoices(state);
  return choices[(choices.indexOf(requestedExpression) + 1) % choices.length];
}
export function navigationSticker(page, className, defer = false) {
  const entry = entries.find(([key]) => key === page);
  return progressiveImage(entry[3], {class: className, width:136, height:136}, {deferred:defer});
}
let app, stage, trigger, hint, menu, status;
let menuOpen = false, readyTimer;
let state = {page:'chat', busy:false, ready:false};
let planTimer, contextKey;
function node(tag, attrs={}, ...children) {
  const n = document.createElement(tag);
  for (const [key,value] of Object.entries(attrs)) n.setAttribute(key,value);
  for (const child of children) n.append(child);
  return n;
}
export function mascot(className='', alt='Merel 头像', variant='smile') {
  return node('span', {class:'merel-mascot '+className}, progressiveImage(variant, {width:136, height:136, alt}));
}
export function closeCharacterMenu(focus=false) {
  menuOpen=false; app?.classList.remove('menu-open');
  if (!menu) return;
  menu.hidden=true; trigger.setAttribute('aria-expanded','false'); hint.setAttribute('aria-expanded','false');
  hint.querySelector('span').textContent=openHint;
  trigger.setAttribute('aria-label', '点击 Merel 更换表情并展开空间');
  if (focus) trigger.focus();
}
function toggleMenu(event) {
  if (menuOpen) return closeCharacterMenu(event.detail===0);
  for (const image of menu.querySelectorAll('img')) setProgressiveImage(image);
  menuOpen=true; app.classList.add('menu-open'); menu.hidden=false;
  trigger.setAttribute('aria-expanded','true'); hint.setAttribute('aria-expanded','true');
  hint.querySelector('span').textContent='收起空间';
  trigger.setAttribute('aria-label', '点击 Merel 更换表情并收起空间');
  if (event.detail===0) menu.querySelector('button').focus();
}
export function notifyReplyReady() {
  clearTimeout(readyTimer);state.ready=true;updateCharacter(state);
  readyTimer=setTimeout(()=>{state.ready=false;updateCharacter(state);},4000);
}
export function acknowledgePlan(event) {
  clearTimeout(planTimer);
  updateCharacter({event});
  planTimer = setTimeout(() => updateCharacter({event:null}), 2800);
}
export function updateCharacter(next) {
  const merged = {...state, ...next};
  if (merged.conversationId !== state.conversationId || merged.page !== state.page ||
      merged.turn !== state.turn || merged.busy !== state.busy || merged.currentState !== state.currentState) {
    clearTimeout(planTimer);
    merged.event = null;
  }
  if (merged.conversationId !== state.conversationId || merged.page !== state.page || merged.busy) {
    clearTimeout(readyTimer);
    merged.ready = false;
  }
  state=merged;if(!app)return;
  const choices = expressionChoices(state);
  const key = JSON.stringify([state.conversationId,state.page,state.turn?.turn_id || state.turn?.id,
    state.currentState?.version,state.busy,state.failed,state.loading,state.event,choices]);
  if (key !== contextKey) {
    contextKey = key;
    showExpression(choices[0]);
  }
  app.classList.toggle('is-chat',state.page==='chat');app.classList.toggle('is-workspace',state.page!=='chat');
  app.classList.toggle('is-thinking',state.busy);app.classList.toggle('reply-ready',state.ready&&!state.busy);
  app.dataset.characterState=state.busy?'thinking':state.ready?'ready':'idle';
  status.textContent=state.busy?'Merel 正在回应…':state.ready?'回复已准备好。':'';
  status.hidden=!state.busy&&!state.ready;
  for(const item of menu.querySelectorAll('button')) {
    item.classList.toggle('active',item.dataset.page===state.page);
    if(item.dataset.page===state.page)item.setAttribute('aria-current','page');else item.removeAttribute('aria-current');
  }
}
export function initCharacter(onNavigate) {
  app=document.getElementById('app');
  hint=node('button',{type:'button',class:'character-hint','aria-expanded':'false','aria-controls':'character-nav'},node('span',{},openHint),node('span',{'aria-hidden':'true'},'✧'));
  portrait = progressiveImage('expressions/neutral', {class:'character-portrait', alt:'Merel · 平静', draggable:'false', 'data-expression':'neutral'}, {priority:'high'});
  trigger=node('button',{type:'button',class:'character-trigger','aria-label':'点击 Merel 更换表情并展开空间','aria-expanded':'false','aria-controls':'character-nav'},portrait);
  for (const opener of [hint, trigger]) {
    opener.addEventListener('click', event => {
      showExpression(nextExpression());
      toggleMenu(event);
    });
  }
  menu=node('nav',{id:'character-nav',class:'radial-nav','aria-label':'工作区'});menu.hidden=true;
  entries.forEach(([page,title,english],index)=>{
    const item=node('button',{type:'button',class:'radial-item',style:'--i:'+index,'data-page':page},node('span',{class:'radial-icon'},navigationSticker(page, 'radial-sticker', true)),node('span',{class:'radial-label'},node('strong',{},title),node('small',{},english)),node('span',{'aria-hidden':'true',class:'radial-chevron'},'›'));
    item.addEventListener('click', () => {
      closeCharacterMenu();
      onNavigate(page);
      showExpression(expressionChoices(state)[0]);
    });
    menu.append(item);
  });
  status=node('div',{class:'character-status',role:'status','aria-live':'polite'});status.hidden=true;
  stage=node('aside',{class:'character-stage','aria-label':'Merel 与工作区导航'},node('div',{class:'portrait-orbit','aria-hidden':'true'}),node('div',{class:'portrait-caption','aria-hidden':'true'},node('span',{},'M E R E L'),node('small',{},'MENTAL STATE · SUPPORT')),trigger,menu,status);
  document.getElementById('character-root').replaceChildren(hint,stage);
  document.addEventListener('pointerdown',event=>{if(menuOpen&&!stage.contains(event.target)&&!hint.contains(event.target))closeCharacterMenu();});
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&menuOpen){event.preventDefault();closeCharacterMenu(true);}
    if(menuOpen&&['ArrowDown','ArrowUp','Home','End'].includes(event.key)&&menu.contains(document.activeElement)){
      event.preventDefault();const items=[...menu.querySelectorAll('button')],index=items.indexOf(document.activeElement);
      items[event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length].focus();
    }
  });updateCharacter(state);
}
