import { requestId } from './request-id.js?v=20261128-demo2';
import { initBackgroundMusic } from './background-music.js?v=20261128-portraits1';
import { progressiveImage, setProgressiveImage } from './progressive-images.js?v=20261128-portraits1';
import { voiceSettingsPanel, voiceReplayPanel } from './voice-status.js';
import { researchProgress, expressionAlbum, decisionSummary } from './research-panels.js?v=20261128-portraits1';
import { acknowledgePlan, initCharacter, updateCharacter, closeCharacterMenu, mascot, notifyReplyReady, navigationSticker } from '/assets/character.js?v=20261128-portraits1';
import { symptomSelection, statePatch } from '/assets/state-form.js';
import '/assets/poem-reader.js';
const MEREL_FULL_NAME = 'Mental-State-Enhanced Recommendation with Empathetic LLMs';
const $ = (id) => document.getElementById(id);
const paths = {
  chat:'<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z"/>',
  leaf:'<path d="M20 3C10 3 4 6 4 13a7 7 0 0 0 7 7c7 0 9-8 9-17Z"/><path d="M4 21 16 9M9 16l-1-5M13 12l5 1"/>',
  plan:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 2v4h6V2M9 12l2 2 4-4M9 18h6"/>',
  replay:'<path d="M3 11a9 9 0 1 1 2.8 7M3 4v7h7M12 7v5l3 2"/>',
  settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="currentColor" stroke="none"/><circle cx="15" cy="17" r="3" fill="currentColor" stroke="none"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  arrow:'<path d="M5 12h14M13 6l6 6-6 6"/>',
  send:'<path d="M12 19V5M6 11l6-6 6 6"/>',
  menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',
  edit:'<path d="m16 3 5 5-12 12H4v-5L16 3ZM13 6l5 5"/>',
  trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
  heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
  moon:'<path d="M20.8 13a9 9 0 1 1-9.8-9.8A7 7 0 0 0 20.8 13Z"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1 1M18 18l1 1M5 19l1-1M18 6l1-1"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
  panel:'<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M15 4v16"/>',
  download:'<path d="M12 3v12M7 10l5 5 5-5M4 16v5h16v-5"/>',
  refresh:'<path d="M20 7V3l-3 3a8 8 0 1 0 3 9M20 7h-5"/>',
  archive:'<rect x="3" y="3" width="18" height="5" rx="1"/><path d="M5 8v13h14V8M10 12h4"/>',
  spark:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/>',
  globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a17 17 0 0 1 0 18 17 17 0 0 1 0-18Z"/>',
  copy:'<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
};
function icon(name){const n=document.createElementNS('http://www.w3.org/2000/svg','svg');n.setAttribute('viewBox','0 0 24 24');n.setAttribute('fill','none');n.setAttribute('stroke','currentColor');n.setAttribute('stroke-width','1.5');n.setAttribute('stroke-linecap','round');n.setAttribute('stroke-linejoin','round');n.setAttribute('aria-hidden','true');n.innerHTML=paths[name]||paths.spark;return n;}
function el(tag,attrs={},...children){const n=document.createElement(tag);for(const [k,v]of Object.entries(attrs)){if(v===undefined||v===null)continue;if(k==='class')n.className=v;else if(k==='text')n.textContent=v;else if(k.startsWith('on'))n.addEventListener(k.slice(2),v);else if(k==='disabled'||k==='hidden'||k==='selected')n[k]=v;else n.setAttribute(k,String(v));}for(const c of children.flat(Infinity)){if(c===null||c===undefined||c===false)continue;n.append(c instanceof Node?c:document.createTextNode(String(c)));}return n;}
function btn(label,fn,cls='secondary-button',ic){return el('button',{type:'button',class:cls,onclick:fn},ic?icon(ic):null,label);}
function ib(label,ic,fn){return el('button',{type:'button',class:'icon-button','aria-label':label,title:label,onclick:fn},icon(ic));}
const nav=[['chat','chat','倾听与对话'],['state','leaf','状态记录'],['plans','plan','我的小计划'],['research','replay','研究回放'],['settings','settings','设置']];
const levels=['未记录','没有','轻微','明显','很强'];
const S={page:'chat',user:null,mode:{},conversations:[],current:null,definitions:[],plans:[],settings:null,booting:true,loading:false,pageError:null,showInsights:true,mobileInsights:false,planFilter:'todo',replayId:null,drafts:{},sending:{},failed:{},recentGeneration:0};
let toastTimer,loadController,loadGeneration=0;
function toast(message,error=false){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').classList.toggle('error',error);$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,error?6500:3200);}
class APIError extends Error{constructor(message,status){super(message);this.status=status;}}
async function api(path,options={}){const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),options.timeout||180000);if(options.signal)options.signal.addEventListener('abort',()=>ctrl.abort(),{once:true});try{const res=await fetch('/api'+path,{method:options.method||'GET',credentials:'same-origin',headers:{'Content-Type':'application/json'},...(options.body!==undefined?{body:JSON.stringify(options.body)}:{}),signal:ctrl.signal});let data;try{data=await res.json();}catch{throw new APIError('服务暂时没有返回有效数据，请稍后重试。',res.status);}if(!res.ok){let detail=data.detail||data.message||'请求未完成';if(Array.isArray(detail))detail=detail.map(x=>x.msg).join('；');if(typeof detail==='object')detail=JSON.stringify(detail);throw new APIError(String(detail),res.status);}return {data,status:res.status};}catch(err){if(err.name==='AbortError'&&options.signal?.aborted)throw err;if(err.name==='AbortError')throw new APIError('等待时间较长，请重试。已保留这次发送内容。',0);if(err instanceof APIError)throw err;throw new APIError('暂时无法连接服务，请检查本地服务是否仍在运行。',0);}finally{clearTimeout(timer);}}
async function get(path,options){return (await api(path,options)).data;}
const list=(data,key)=>Array.isArray(data)?data:(data?.[key]||[]);
function time(value,full=false){if(!value)return '';const d=new Date(value);if(Number.isNaN(+d))return '';return new Intl.DateTimeFormat('zh-CN',{...(full?{month:'long',day:'numeric'}:{}),hour:'2-digit',minute:'2-digit',hour12:false}).format(d);}
function date(value){if(!value)return '';const d=new Date(value);return Number.isNaN(+d)?'':new Intl.DateTimeFormat('zh-CN',{month:'long',day:'numeric'}).format(d);}
const cid=()=>S.current?.id||S.current?.conversation_id;
const tid=t=>t.turn_id||t.id;
const known=()=>Object.entries(S.current?.state?.symptoms||{}).filter(([,v])=>v?.presence&&v.presence!=='unknown');
function defLabel(code){return S.definitions.find(d=>(d.code||d.id)===code)?.label||S.definitions.find(d=>(d.code||d.id)===code)?.name||code;}
function busy(){return !!S.sending[cid()];}
function saveSelected(id){try{localStorage.setItem('merel.conversation',id);}catch{}}
function closeSidebar(){const drawer=$('sidebar');drawer.classList.remove('open');drawer.setAttribute('aria-hidden','true');drawer.inert=true;$('sidebar-backdrop').hidden=true;}
function openSidebar(){closeConversationMenu();closeCharacterMenu();const drawer=$('sidebar');drawer.classList.add('open');drawer.setAttribute('aria-hidden','false');drawer.inert=false;for(const image of drawer.querySelectorAll('img[data-asset]'))setProgressiveImage(image);$('sidebar-backdrop').hidden=false;requestAnimationFrame(()=>drawer.querySelector('button')?.focus());}
document.addEventListener('keydown',e=>{const drawer=$('sidebar');if(!drawer.classList.contains('open'))return;if(e.key==='Escape'){closeSidebar();focusHistoryTrigger();}if(e.key==='Tab'){const nodes=[...drawer.querySelectorAll('button:not(:disabled),a,input')],first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}});
$('sidebar-backdrop').addEventListener('click',closeSidebar);
function sidebar(){const node=$('sidebar');node.replaceChildren(el('div',{class:'drawer-heading'},el('div',{},el('span',{class:'eyebrow'},'CONVERSATIONS'),el('h2',{},'对话历史')),ib('收起对话历史','close',()=>{closeSidebar();focusHistoryTrigger();})),btn('开始新的对话',newConversation,'primary-button drawer-new','plus'));const recent=el('div',{class:'recent-list'});if(!S.conversations.length)recent.append(el('p',{class:'sidebar-empty'},'每一次倾诉，都有自己的位置。'));for(const c of S.conversations){const id=c.id||c.conversation_id;recent.append(el('div',{class:'recent-row'+(id===cid()?' active':'')},el('button',{class:'recent-title',type:'button',title:c.title||'新的对话',onclick:()=>selectConversation(id)},c.title||'新的对话'),ib('重命名对话','edit',()=>renameConversation(c)),ib('删除对话','trash',()=>deleteConversation(c))));}node.append(recent,el('div',{class:'sidebar-footer'},el('button',{class:'user-button',type:'button',onclick:()=>navigate('settings')},progressiveImage('neutral',{alt:'',width:42,height:42},{deferred:true}),el('div',{},el('strong',{},S.user?.display_name||'我的空间'),el('small',{},'管理称呼与个人记录')),icon('settings'))));}
function focusHistoryTrigger() {
  const trigger = $('conversation-tools-button') || $('history-button');
  trigger?.focus();
}
function closeConversationMenu(restoreFocus = false) {
  $('conversation-toolbar')?.classList.remove('is-open');
  const trigger = $('conversation-tools-button');
  trigger?.setAttribute('aria-expanded', 'false');
  if (restoreFocus) trigger?.focus();
}
function toggleConversationMenu() {
  const toolbar = $('conversation-toolbar');
  if (!toolbar) return;
  if (toolbar.classList.contains('is-open')) return closeConversationMenu(true);
  closeCharacterMenu();
  closeSidebar();
  toolbar.classList.add('is-open');
  $('conversation-tools-button')?.setAttribute('aria-expanded', 'true');
  toolbar.querySelector('.conversation-actions button')?.focus();
}
document.addEventListener('pointerdown', event => {
  if (!event.target.closest('#conversation-toolbar, #conversation-tools-button')) closeConversationMenu();
});
document.addEventListener('focusin', event => {
  if (!event.target.closest('#conversation-toolbar, #conversation-tools-button')) closeConversationMenu();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && $('conversation-toolbar')?.classList.contains('is-open')) {
    event.preventDefault();
    closeConversationMenu(true);
  }
});
function historyButton() {
  const button = btn('对话历史', openSidebar, 'header-history', 'replay');
  button.id = 'history-button';
  return button;
}
function connectionButton() {
  return el('button', {
    class: 'connection-pill' + (S.mode.online ? ' connected' : ''), type: 'button',
    onclick: () => navigate('settings'), title: '查看当前运行模式',
  }, el('i'), S.mode.online ? '在线模型' : '本地演示');
}
function header() {
  const brand = el('section', {class:'brand'},
    el('button', {class:'brand-mascot brand-home', type:'button', 'aria-label':'MEREL 首页', onclick:()=>navigate('chat')}, mascot('', 'Merel 敬礼表情', 'brand-salute')),
    el('div', {}, el('h1', {}, 'MEREL', el('span', {class:'brand-period'}, '.')),
      el('p', {class:'brand-full-name', lang:'en'}, MEREL_FULL_NAME)));
  const hasChatToolbar = S.page === 'chat' && !S.booting && !S.loading && !S.pageError;
  $('topbar').classList.toggle('header-brand-only', hasChatToolbar);
  $('topbar').replaceChildren(brand);
  if (hasChatToolbar) {
    const trigger = ib('对话工具', 'menu', toggleConversationMenu);
    trigger.id = 'conversation-tools-button';
    trigger.className = 'conversation-tools-toggle';
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', 'conversation-toolbar');
    $('topbar').append(trigger);
  } else $('topbar').append(el('div', {class:'header-actions'}, historyButton(), connectionButton()));
}
function conversationToolbar() {
  const overview = btn('状态概览', () => {
    closeConversationMenu(true);
    const dialog = modal('此刻状态与支持');
    dialog.classList.add('insights-dialog');
    dialog.append(insights(), el('div', {class:'dialog-actions'}, btn('关闭', () => dialog.close())));
  }, '', 'panel');
  const title = S.current?.title || '新的对话';
  return el('header', {id:'conversation-toolbar', class:'chat-heading conversation-toolbar', 'aria-label':'对话工具栏'},
    el('div', {class:'conversation-context'},
      el('span', {class:'conversation-title', title}, title), connectionButton()),
    el('div', {class:'conversation-actions', role:'group', 'aria-label':'对话操作'},
      historyButton(), overview, btn('新对话', () => { closeConversationMenu(); newConversation(); }, '', 'plus')));
}

function characterContext() {
  const turns = S.current?.turns || [];
  const latest = turns.at(-1);
  const replay = S.page === 'research' && turns.find(t => tid(t) === S.replayId);
  const turn = replay || latest;
  return {page:S.page, conversationId:cid(), turn, latest,
    currentState:S.page === 'research' && turn ? turn.state : S.current?.state,
    busy:busy(), failed:!!S.failed[cid()], loading:S.booting || (S.loading && S.page === 'chat')};
}
function render({bottom=false}={}){document.title=`MEREL · ${nav.find(x=>x[0]===S.page)?.[2]||'我的空间'}`;const scroll=$('content').querySelector('.chat-scroll');const y=scroll?.scrollTop||0;sidebar();header();updateCharacter(characterContext());const content=$('content');content.replaceChildren();if(S.booting){content.append(el('div',{class:'boot-state'},mascot('boot-mascot','','curious'),el('p',{},'正在准备你的空间…')));return;}if(S.pageError){content.append(errorPanel(S.pageError,refreshPage));return;}if(S.loading){content.append(el('div',{class:'loading-inline'},'正在读取…'));return;}const view={chat:chatView,state:stateView,plans:plansView,research:researchView,settings:settingsView}[S.page]||chatView;content.append(view());requestAnimationFrame(()=>{const target=content.querySelector('.chat-scroll');if(target){const hasMessages=!!S.current?.turns?.length||!!S.sending[cid()]||!!S.failed[cid()];target.scrollTop=bottom&&hasMessages?target.scrollHeight:hasMessages?y:0;}});}
function errorPanel(message,retry){return el('section',{class:'error-state'},icon('globe'),el('h2',{},'这次连接没有完成'),el('p',{},message),btn('重新连接',retry,'primary-button','refresh'));}
async function bootstrap(){S.booting=true;S.pageError=null;render();try{await api('/session',{method:'POST',body:{}});const b=await get('/bootstrap');S.user=b.user;S.mode=b.mode||{};S.definitions=b.symptom_definitions||[];S.conversations=list(b.conversations,'conversations');S.plans=list(await get('/plans'),'plans');let saved;try{saved=localStorage.getItem('merel.conversation');}catch{}const first=S.conversations.find(c=>(c.id||c.conversation_id)===saved)||S.conversations[0];if(first){S.current=await get('/conversations/'+(first.id||first.conversation_id));}else{S.current=await get('/conversations',{method:'POST',body:{}});S.conversations=[S.current];}saveSelected(cid());S.booting=false;render({bottom:true});initBackgroundMusic();}catch(err){S.booting=false;S.user=null;S.pageError=err.message;render();}}
async function navigate(page){++loadGeneration;loadController?.abort();closeSidebar();closeCharacterMenu();S.page=page;S.pageError=null;if(page==='plans'||page==='settings'){S.loading=true;render();try{if(page==='plans')S.plans=list(await get('/plans'),'plans');else S.settings=await get('/settings');}catch(err){if(S.page===page)S.pageError=err.message;}finally{if(S.page===page){S.loading=false;render();}}}else{S.loading=false;render();}requestAnimationFrame(()=>{window.scrollTo(0,0);$('main')?.focus({preventScroll:true});});}
async function refreshConversations(){const generation=++S.recentGeneration;const data=await get('/conversations');if(generation===S.recentGeneration)S.conversations=list(data,'conversations');}
async function refreshPage(){if(!S.user)return bootstrap();const id=cid(),page=S.page;S.pageError=null;try{await refreshConversations();if(id){const data=await get('/conversations/'+id);if(cid()===id)S.current=data;}if(page==='plans')S.plans=list(await get('/plans'),'plans');if(page==='settings')S.settings=await get('/settings');if(S.page===page)render();}catch(err){if(S.page===page){S.pageError=err.message;render();}}}
async function selectConversation(id){closeSidebar();const gen=++loadGeneration;loadController?.abort();loadController=new AbortController();S.page='chat';S.loading=true;S.pageError=null;render();try{const c=await get('/conversations/'+id,{signal:loadController.signal});if(gen!==loadGeneration)return;S.current=c;saveSelected(id);S.loading=false;render({bottom:true});}catch(err){if(gen!==loadGeneration||err.name==='AbortError')return;S.loading=false;S.pageError=err.message;render();}}
let creating=false;
async function newConversation(){if(creating||S.booting)return;creating=true;++loadGeneration;loadController?.abort();try{const c=await get('/conversations',{method:'POST',body:{}});S.conversations.unshift(c);S.current=c;S.page='chat';S.pageError=null;S.loading=false;saveSelected(cid());closeSidebar();render();requestAnimationFrame(()=>$('message-input')?.focus());}catch(err){toast(err.message,true);}finally{creating=false;}}
function modal(title,description){const d=el('dialog',{class:'dialog','aria-label':title},el('h2',{},title),description?el('p',{},description):null);$('modal-root').replaceChildren(d);d.addEventListener('close',()=>d.remove());d.addEventListener('click',e=>{if(e.target===d){const b=d.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)d.close();}});d.showModal();return d;}
function renameConversation(c){const d=modal('给这段对话起个名字','用一个容易记住的名字，留住这段交流。');const input=el('input',{value:c.title||'',maxlength:80,'aria-label':'对话名称'});const field=el('div',{class:'field'},el('label',{},'对话名称'),input);const save=btn('保存',async()=>{const value=input.value.trim();if(!value){input.focus();return;}save.disabled=true;try{const updated=await get('/conversations/'+(c.id||c.conversation_id),{method:'PATCH',body:{title:value}});c.title=updated.title||value;if(cid()===(c.id||c.conversation_id)){S.current.title=c.title;const heading=$('content').querySelector('.conversation-title');if(heading)heading.textContent=c.title;}d.close();sidebar();toast('对话名称已更新');}catch(err){toast(err.message,true);save.disabled=false;}},'primary-button');d.append(field,el('div',{class:'dialog-actions'},btn('取消',()=>d.close()),save));input.focus();input.select();input.addEventListener('keydown',e=>{if(e.key==='Enter')save.click();});}
function deleteConversation(c){const id=c.id||c.conversation_id;if(S.sending[id])return toast('请等本次回复完成后再删除。');const d=modal('删除这段对话？',`“${c.title||'新的对话'}”及对应状态、反馈将被删除。`);const confirm=btn('删除对话',async()=>{confirm.disabled=true;try{await get('/conversations/'+id,{method:'DELETE'});S.conversations=S.conversations.filter(x=>(x.id||x.conversation_id)!==id);delete S.failed[id];delete S.drafts[id];S.plans=list(await get('/plans'),'plans');if(cid()===id){if(S.conversations.length)S.current=await get('/conversations/'+(S.conversations[0].id||S.conversations[0].conversation_id));else{S.current=await get('/conversations',{method:'POST',body:{}});S.conversations=[S.current];}saveSelected(cid());}d.close();render();toast('对话已删除');}catch(err){toast(err.message,true);confirm.disabled=false;}},'danger-button');d.append(el('div',{class:'dialog-actions'},btn('保留',()=>d.close()),confirm));}
function welcome() {
  return document.createElement('merel-poem');
}
function chatView(){const main=el('section',{class:'chat-panel','aria-label':'对话'});const heading=conversationToolbar();const scroll=el('div',{class:'messages chat-scroll',tabindex:0,'aria-label':'对话消息'});const turns=S.current?.turns||[];if(!turns.length&&!S.sending[cid()]&&!S.failed[cid()])scroll.append(welcome());else{for(const turn of turns)scroll.append(turnView(turn));const sending=S.sending[cid()],failed=S.failed[cid()];if(sending||failed){const pending=sending||failed;scroll.append(el('article',{class:'message user'},el('div',{class:'message-meta'},'你'),el('p',{},pending.payload.text)));if(sending)scroll.append(el('div',{class:'assistant-thinking',role:'status'},mascot('thinking-mascot','','neutral'),el('span',{class:'thinking-dot'}),'Merel 正在回应…'));else scroll.append(el('div',{class:'inline-error',role:'alert'},el('p',{},failed.error),btn(failed.conflict?'同步后重新发送':'重试这次发送',()=>retrySend(cid()),'quiet-button'),btn('取消',()=>{S.drafts[cid()]=failed.payload.text;delete S.failed[cid()];render();},'quiet-button')));}}main.append(heading,scroll,composer());return main;}
function turnView(turn){const assistant=el('article',{class:'message assistant'},el('div',{class:'message-meta'},el('span',{},'MEREL'),el('time',{},time(turn.created_at))),el('p',{},turn.response||''));const actions=el('div',{class:'message-actions'});const greeting=turn.trace?.route==='greeting';if(!greeting)actions.append(btn('感受反馈',()=>feedbackDialog(turn),'quiet-button','heart'));if(!greeting&&turn.selected_action?.id&&turn.selected_action.id!=='urgent_support')actions.append(btn('加入小计划',()=>addPlan(turn),'quiet-button','plus'));actions.append(btn('本次记录',()=>{S.replayId=tid(turn);navigate('research');},'quiet-button','replay'));if(turn.feedback)actions.append(el('span',{class:'feedback-mark'},`已记录 · 帮助度 ${turn.feedback.helpfulness}/5`));assistant.append(actions);return el('div',{class:'turn'},el('article',{class:'message user'},el('div',{class:'message-meta'},'你'),el('p',{},turn.user_text||turn.text||'')),assistant);}
function composer() {
  const textarea = el('textarea', {
    id: 'message-input', rows: 1, maxlength: 5000,
    placeholder: '今天想聊些什么？', 'aria-label': '输入你想聊的内容', disabled: busy(),
  });
  textarea.value = S.drafts[cid()] || '';
  const send = el('button', {
    class: 'send-button', type: 'submit', 'aria-label': '发送消息', title: '发送消息',
  }, icon('send'));
  function updateSendButton() {
    send.disabled = busy() || !textarea.value.trim() || !!S.failed[cid()];
  }
  updateSendButton();
  textarea.addEventListener('input', () => {
    S.drafts[cid()] = textarea.value;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(100, textarea.scrollHeight) + 'px';
    updateSendButton();
  });
  textarea.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      if (!send.disabled) send.click();
    }
  });
  const form = el('form', {
    class: 'composer',
    onsubmit: event => { event.preventDefault(); sendMessage(); },
  }, textarea, send);
  const note = el('div', {class: 'composer-note'},
    el('span', {}, 'Enter 发送 · Shift + Enter 换行'),
    el('a', {class:'contributor-link', href:'https://space.bilibili.com/288645075', target:'_blank', rel:'noopener noreferrer'},
      el('span', {lang:'en'}, 'Primary contributor: '), '君士坦丁堡堡'));
  return el('div', {class: 'composer-dock'}, form, note);
}
async function sendMessage(payload,conversationId){const id=conversationId||cid();if(!id||S.sending[id])return;const text=(S.drafts[id]||'').trim();if(!payload&&!text)return;const request=payload||{text,expected_version:S.current.version,idempotency_key:requestId()};S.sending[id]={payload:request};delete S.failed[id];S.drafts[id]='';if(cid()===id)render({bottom:true});try{let response=await api('/conversations/'+id+'/turns',{method:'POST',body:request});let tries=0;while(response.status===202&&tries++<60){await new Promise(r=>setTimeout(r,1000));response=await api('/conversations/'+id+'/turns',{method:'POST',body:request});}if(response.status===202)throw new APIError('回复仍在处理中，稍后点击重试即可继续读取。',202);const result=response.data;if(cid()===id){S.current.version=result.version;S.current.state=result.state;S.current.turns=S.current.turns||[];if(!S.current.turns.some(t=>tid(t)===tid(result)))S.current.turns.push({...result,user_text:result.user_text||request.text});}try{const refreshed=await get('/conversations/'+id);if(cid()===id)S.current=refreshed;await refreshConversations();}catch{toast('回复已保存，会话列表暂未同步。');}}catch(err){S.failed[id]={payload:request,error:err.status===409?'这段对话已更新。同步最新状态后，可以重新发送。':err.message,conflict:err.status===409};}finally{delete S.sending[id];if(cid()===id){render({bottom:true});if(!S.failed[id] && S.page==='chat')notifyReplyReady();requestAnimationFrame(()=>$('message-input')?.focus());}else sidebar();}}
async function retrySend(id){const failed=S.failed[id];if(!failed)return;if(failed.conflict){try{const current=await get('/conversations/'+id);if(cid()===id)S.current=current;failed.payload={...failed.payload,expected_version:current.version,idempotency_key:requestId()};}catch(err){return toast(err.message,true);}}sendMessage(failed.payload,id);}
function insights(){const knownValues=known();const last=S.current?.turns?.at(-1);const side=el('aside',{class:'insights','aria-label':'此刻状态与支持'},el('div',{class:'insight-heading'},el('span',{},'此刻，与你有关'),icon('leaf')));const status=el('section',{class:'insight-section'},el('div',{class:'section-kicker'},'状态小记'));if(!knownValues.length){const art=el('div',{class:'empty-state-illustration','aria-hidden':'true'});art.innerHTML='<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="49" r="32" fill="#e1e8d8"/><path d="M30 65c2-17 6-31 19-39 11 7 22 24 22 39" fill="#ccd8bf"/><path d="M50 28v49M50 50 37 42M50 59l14-12" stroke="#a0b68c" stroke-width="1.2" fill="none"/><path d="M24 75h52" stroke="#b9c8a8" stroke-width="1.3"/></svg>';status.append(art,el('h3',{},'从你的描述开始'),el('p',{class:'insight-copy'},'聊聊近期感受，或记录此刻的睡眠、精力与注意状态。'));}else{status.append(el('h3',{},S.current.state.summary||'正在了解此刻的你'));for(const [code,v]of knownValues.slice(0,4)){const bars=el('div',{class:'state-bars'});for(let i=0;i<3;i++)bars.append(el('i',{class:i<v.value?'filled':''}));status.append(el('div',{class:'state-item'},el('div',{class:'state-item-top'},el('span',{},defLabel(code)),el('span',{},v.presence==='conflicting'?'记录待核对':v.presence==='absent'?'明确没有':v.value==null?'强度待补充':levels[v.value+1])),v.value==null?el('div',{class:'state-unrated'}):bars));}}status.append(btn(knownValues.length?'查看与修订状态':'记下当前状态',()=>navigate('state'),'soft-link','arrow'));side.append(status);const support=el('section',{class:'insight-section'},el('div',{class:'section-kicker'},'本次支持'));if(last?.selected_action){const a=last.selected_action;support.append(el('div',{class:'insight-action'},el('div',{class:'mini-label'},a.strategy_label||'支持方式'),el('strong',{},a.title),el('p',{},a.reason||a.description),el('div',{class:'action-meta'},a.duration_minutes?el('span',{class:'tag'},`${a.duration_minutes} 分钟`):null,el('span',{class:'tag warm'},a.burden==='low'?'轻量开始':'一步一步来'))));}else support.append(el('h3',{},'先理解，再一起想办法'),el('p',{class:'insight-copy'},'每个人的处境都不同。我们会从你当前的状态，寻找合适的一小步。'));side.append(support);const plans=el('section',{class:'insight-section'},el('div',{class:'section-kicker'},'我的小计划'));const todos=S.plans.filter(p=>p.status==='todo').slice(0,2);if(todos.length){for(const p of todos)plans.append(el('div',{class:'plan-mini'},el('button',{type:'button','aria-label':'完成计划：'+planTitle(p),onclick:()=>updatePlan(p,'done')},icon('check')),el('span',{},planTitle(p))));plans.append(btn('查看全部计划',()=>navigate('plans'),'soft-link','arrow'));}else plans.append(el('p',{class:'insight-copy'},'把对话里想尝试的事留下来，',el('br'),'从一件小事开始就很好。'));side.append(plans,el('p',{class:'insight-bottom'},'慢一点，也是在向前。'));return side;}
function feedbackDialog(turn){let helpfulness=turn.feedback?.helpfulness||null,burden=turn.feedback?.burden||null;const d=modal('这次回应，感觉怎么样？','记录你的实际感受，让这次交流留下更清楚的反馈。');const note=el('textarea',{rows:2,maxlength:500,placeholder:'也可以补充一句你的感受（选填）','aria-label':'反馈补充'});note.value=turn.feedback?.note||'';const save=btn('保存反馈',async()=>{if(!helpfulness||!burden)return toast('请分别选择帮助度和行动负担。',true);save.disabled=true;try{const feedback=await get('/turns/'+tid(turn)+'/feedback',{method:'POST',body:{helpfulness,burden,note:note.value.trim()}});turn.feedback=feedback.feedback||{helpfulness,burden,note:note.value.trim()};d.close();render();toast('你的反馈已保存');}catch(err){toast(err.message,true);save.disabled=false;}},'primary-button');for(const [kind,label,names]of [['helpfulness','对你处理眼前困扰的帮助',['没有','较少','一些','较多','很多']],['burden','尝试其中行动的负担',['很低','较低','一般','较高','很高']]]){const options=el('div',{class:'feedback-options',role:'group','aria-label':label});for(let i=1;i<=5;i++){const b=el('button',{type:'button',class:(kind==='helpfulness'?helpfulness:burden)===i?'active':'','aria-pressed':(kind==='helpfulness'?helpfulness:burden)===i,onclick:()=>{if(kind==='helpfulness')helpfulness=i;else burden=i;for(const x of options.children){x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b));}}},i,el('small',{},names[i-1]));options.append(b);}d.append(el('div',{class:'field'},el('label',{},label),options));}d.append(el('div',{class:'field'},el('label',{},'补充感受'),note),el('div',{class:'dialog-actions'},btn('暂不评价',()=>d.close()),save));}
const addingPlans=new Set();
async function addPlan(turn){const id=tid(turn), origin=cid(), page=S.page;if(addingPlans.has(id))return;if(S.plans.some(plan=>plan.turn_id===id))return toast('这项计划已经保存');addingPlans.add(id);try{await get('/plans',{method:'POST',body:{turn_id:id}});S.plans=list(await get('/plans'),'plans');render();if(cid()===origin && S.page===page)acknowledgePlan('plan-added');toast('已加入小计划');}catch(err){toast(err.message,true);}finally{addingPlans.delete(id);}}
function pageIntro(kicker,title,description,action){const item=nav.find(n=>n[0]===S.page);return el('div',{class:'page-intro'},el('div',{class:'workspace-header'},el('div',{class:'workspace-title'},el('span',{class:'page-symbol'},navigationSticker(S.page, 'page-sticker')),el('h2',{},item?.[2]||title)),el('div',{class:'workspace-actions'},ib('回到对话','chat',()=>navigate('chat')),ib('刷新当前页面','refresh',refreshPage))),el('div',{class:'page-intro-copy'},el('h1',{},title),el('p',{},description)),action);}
function selectLevel(value,labels=levels){const select=el('select');labels.forEach((label,i)=>select.append(el('option',{value:i===0?'':i-1,selected:(value===null||value===undefined)?i===0:value===i-1},label)));return select;}
function stateView(){
  const page=el('section',{class:'page'},pageIntro('A MOMENT TO NOTICE','听一听，自己的状态','已提及的感受与强度分别保留。没有确定的部分，可以继续留白。'));
  if(!S.current)return page;
  const form=el('form'),initial=structuredClone(S.current.state||{}),formConversationId=cid(),formVersion=S.current.version;
  const fields={},grid=el('div',{class:'state-grid'});
  for(const def of S.definitions){
    const code=def.code||def.id,value=initial.symptoms?.[code],selection=symptomSelection(value),sel=selectLevel(value?.value);
    if(selection==='keep-presence'){
      const label=value.presence==='conflicting'?'已提及 · 信息待核对':value.presence==='absent'?'已明确没有 · 强度未记录':'已提及 · 强度待补充';
      sel.prepend(el('option',{value:'keep-presence'},label));sel.value='keep-presence';
    }
    sel.id='symptom-'+code;fields[code]=sel;
    const source=value?.source==='self_report'||value?.source==='structured_self_report'?'来自你的记录':value?.evidence?'来自对话':'尚未记录';
    grid.append(el('div',{class:'state-control'},el('label',{for:sel.id},def.label||def.name||code),sel,el('small',{},value?.evidence?String(value.evidence):source)));
  }
  const count=known().length,rated=Object.values(initial.symptoms||{}).filter(v=>v.value!==null&&v.value!==undefined).length;
  form.append(el('section',{class:'panel'},el('div',{class:'panel-title'},el('h2',{},'当前感受'),el('small',{},`${count} / ${S.definitions.length} 项已记录 · ${rated} 项强度明确`)),grid));
  const days=el('input',{id:'duration-days',type:'number',min:0,max:3650,placeholder:'暂不确定',value:initial.duration_days??''}),burdens={};
  const row=el('div',{class:'field-row'},el('div',{class:'field'},el('label',{for:'duration-days'},'这次困扰持续了多久（天）'),days));
  for(const [key,label]of [['study','学习 / 工作'],['selfcare','生活照料'],['social','社交活动']]){
    const select=selectLevel(initial.functional_burden?.[key],['未记录','没有影响','轻微影响','明显影响','影响很大']);select.id='function-'+key;burdens[key]=select;
    row.append(el('div',{class:'field'},el('label',{for:select.id},label),select));
  }
  form.append(el('section',{class:'panel'},el('div',{class:'panel-title'},el('h2',{},'时间与日常生活')),row));
  const save=el('button',{class:'primary-button',type:'submit',disabled:busy()},icon('check'),'保存这次记录');
  form.append(el('div',{class:'form-actions'},el('small',{},initial.updated_at?'更新于 '+time(initial.updated_at,true):'只保存你修改的内容'),save));
  form.addEventListener('submit',async e=>{
    e.preventDefault();if(S.sending[formConversationId])return;
    const values={symptoms:Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,v.value])),functional_burden:Object.fromEntries(Object.entries(burdens).map(([k,v])=>[k,v.value])),duration_days:days.value};
    let patch;try{patch=statePatch(initial,values,formVersion);}catch{return toast('请确认状态值与持续天数。',true);}
    if(Object.keys(patch).length===1)return toast('当前记录没有变化。');
    save.disabled=true;
    try{
      const updated=await get('/conversations/'+formConversationId+'/state',{method:'PATCH',body:patch});
      if(cid()===formConversationId){S.current.state=updated.state;S.current.version=updated.version;}
      await refreshConversations();render();toast('状态记录已保存');
    }catch(err){toast(err.status===409?'状态已经更新，请刷新后重新确认。':err.message,true);save.disabled=false;}
  });
  page.append(form);return page;
}
function planTitle(p){return p.title||p.action?.title||p.selected_action?.title||'我的小计划';}
function plansView(){const page=el('section',{class:'page'},pageIntro('ONE SMALL STEP','从一件小事开始','不用一次做完所有事情。把想尝试的一步留在这里。'));const tabs=el('div',{class:'filters','aria-label':'计划状态'});for(const [key,label]of [['todo','进行中'],['done','已完成'],['archived','已归档']]){const count=S.plans.filter(p=>p.status===key).length;const b=btn(`${label} ${count}`,()=>{S.planFilter=key;render();},'filter-button'+(S.planFilter===key?' active':''));b.setAttribute('aria-pressed',String(S.planFilter===key));tabs.append(b);}page.append(tabs);const filtered=S.plans.filter(p=>p.status===S.planFilter);if(!filtered.length){page.append(emptyPanel('plan',S.planFilter==='todo'?'给下一步留一个位置':'这里还没有计划记录','在对话中，将想尝试的支持动作加入小计划，完成后再回来记下一笔。',()=>navigate('chat'),'回到对话'));return page;}const grid=el('div',{class:'plans-grid'});for(const p of filtered){const a=p.action||p.selected_action||p;const actions=el('div',{class:'message-actions'});if(p.status!=='done')actions.append(btn('完成',()=>updatePlan(p,'done'),'secondary-button','check'));else actions.append(btn('重新开始',()=>updatePlan(p,'todo'),'secondary-button','refresh'));if(p.status!=='archived')actions.append(ib('归档计划','archive',()=>updatePlan(p,'archived')));else actions.append(btn('恢复',()=>updatePlan(p,'todo'),'secondary-button','refresh'));grid.append(el('article',{class:'plan-card'},el('div',{class:'action-meta'},el('span',{class:'tag'},a.strategy_label||p.strategy_label||'日常支持'),a.duration_minutes?el('span',{class:'tag warm'},`${a.duration_minutes} 分钟`):null),el('h3',{},planTitle(p)),el('p',{},p.description||a.description||'从这一次对话里，留下一步可以尝试的行动。'),el('div',{class:'plan-card-footer'},el('span',{class:'plan-date'},date(p.created_at)+' 创建'),actions)));}page.append(grid);return page;}
const updatingPlans=new Set();
async function updatePlan(p,status){const id=p.id||p.plan_id, origin=cid(), page=S.page;if(updatingPlans.has(id))return;updatingPlans.add(id);try{await get('/plans/'+id,{method:'PATCH',body:{status}});S.plans=list(await get('/plans'),'plans');render();if(status==='done' && p.status!=='done' && cid()===origin && S.page===page)acknowledgePlan('plan-done');toast(status==='done'?'已记为完成':status==='archived'?'计划已归档':'计划已恢复');}catch(err){toast(err.message,true);}finally{updatingPlans.delete(id);}}
function emptyPanel(ic,title,copy,action,label){return el('div',{class:'empty-panel'},icon(ic),el('h2',{},title),el('p',{},copy),action?btn(label,action,'secondary-button','arrow'):null);}
function dataDetails(title,data){return el('details',{class:'data-details'},el('summary',{},title),el('pre',{},JSON.stringify(data,null,2)));}
function researchView(){const page=el('section',{class:'page'},pageIntro('A CLEARER PICTURE','看见每一次回应的依据','回放当前对话的状态、支持动作与执行记录。',btn('导出我的数据',exportData,'secondary-button','download')),researchProgress(el));const turns=S.current?.turns||[];if(!turns.length){page.append(emptyPanel('replay','对话之后，记录会留在这里','这里呈现实际输入、候选动作和运行信息，便于回看与核对。',()=>navigate('chat'),'开始一段对话'));return page;}const selected=turns.find(t=>tid(t)===S.replayId)||turns.at(-1);const layout=el('div',{class:'replay-layout'});const items=el('div',{class:'replay-list','aria-label':'选择对话轮次'});for(const [index,t]of [...turns.entries()].reverse()){const b=el('button',{class:'replay-item'+(tid(t)===tid(selected)?' active':''),type:'button','aria-pressed':tid(t)===tid(selected),onclick:()=>{S.replayId=tid(t);render();}},el('strong',{},`第 ${index+1} 次回应`),el('span',{},t.user_text||t.text||''),el('small',{},time(t.created_at,true)));items.append(b);}const detail=el('div',{class:'replay-detail'});const a=selected.selected_action||{};const trace=selected.trace||{};const panel=el('section',{class:'panel'},el('div',{class:'panel-title'},el('h2',{},a.title||'本次回应'),el('span',{class:'tag'},a.strategy_label||'支持记录'),a.id?el('small',{},a.id):null),el('p',{class:'trace-id'},trace.trace_id?'TRACE · '+trace.trace_id:'TURN · '+tid(selected)),el('div',{class:'trace-summary'},el('span',{class:'tag warm'},trace.route==='greeting'?'日常交流 · 未执行支持排序':'推荐版本 · '+(trace.policy_version||S.mode.policy||'演示规则')),el('span',{class:'tag'},'生成 · '+(trace.generator||'本地模板')),typeof trace.latency_ms==='number'?el('span',{class:'tag'},trace.latency_ms+' ms'):null),el('div',{class:'detail-label'},'当时的描述'),el('p',{class:'detail-copy'},selected.user_text||selected.text||''),el('div',{class:'detail-label'},trace.route==='greeting'?'回应内容':'支持内容'),el('p',{class:'detail-copy'},selected.response),a.reason?el('div',{},el('div',{class:'detail-label'},'动作选择依据'),el('p',{class:'detail-copy'},a.reason)):null);panel.append(decisionSummary(el,selected,S.definitions));detail.append(panel,voiceReplayPanel(el,selected));const ranking=selected.ranking||[];if(ranking.length){const table=el('table',{class:'ranking-table'},el('thead',{},el('tr',{},el('th',{scope:'col'},'#'),el('th',{scope:'col'},'候选动作'),el('th',{scope:'col'},trace.policy_version==='state-rule-demo-v1'?'规则分值':'排序分值'))));const tbody=el('tbody');ranking.forEach((r,i)=>tbody.append(el('tr',{},el('td',{},i+1),el('td',{},r.title||r.id,el('small',{},r.reason||'')),el('td',{},Number.isFinite(r.score)?r.score.toFixed(3):'—'))));table.append(tbody);const rankingDetails=el('details',{class:'data-details'},el('summary',{},`全部 ${ranking.length} 个候选动作与分值`),table);detail.append(rankingDetails);}detail.append(dataDetails('当时的心理状态快照',selected.state||{}),dataDetails('执行轨迹与版本',trace),dataDetails('本次反馈',selected.feedback||{status:'尚未评价'}));layout.append(items,detail);page.append(layout);return page;}
function keyValue(key,value){return el('div',{class:'key-value'},el('span',{},key),el('strong',{},value??'未配置'));}
function settingsView(){const page=el('section',{class:'page'},pageIntro('YOUR OWN SPACE','让这个空间，更像你','管理称呼、查看连接信息，也可以带走自己的记录。'));const settings=S.settings||{};const mode=settings.mode||S.mode;const grid=el('div',{class:'settings-grid'});const nameInput=el('input',{id:'display-name',value:S.user?.display_name||'',maxlength:30,required:true,autocomplete:'nickname'});const save=el('button',{class:'primary-button',type:'submit'},'保存称呼');const profile=el('form',{class:'panel',onsubmit:async e=>{e.preventDefault();const display_name=nameInput.value.trim();if(!display_name)return nameInput.focus();save.disabled=true;try{const u=await get('/profile',{method:'PATCH',body:{display_name}});S.user={...S.user,...(u.user||u),display_name};sidebar();toast('称呼已更新');}catch(err){toast(err.message,true);}finally{save.disabled=false;}}},el('div',{class:'panel-title'},el('h2',{},'怎么称呼你')),el('div',{class:'field'},el('label',{for:'display-name'},'你的称呼'),nameInput,el('small',{},'用你觉得自在的名字就好。')),el('div',{class:'form-actions'},save));grid.append(profile);const model=el('section',{class:'panel'},el('div',{class:'panel-title'},el('h2',{},'模型与运行模式'),el('span',{class:'tag'},mode.online?'在线已配置':'本地演示')),keyValue('生成服务',mode.online?(mode.provider||'DeepSeek'):'本地中文回复'),keyValue('模型',mode.online?mode.model:'确定性演示'),keyValue('推荐策略',mode.policy||'规则演示'),keyValue('存储',settings.storage||'SQLite 本地存储'),el('div',{class:'notice'},mode.online?'模型已通过服务端配置。实际每轮生成方式与失败记录可在研究回放中查看。':'当前可直接体验完整流程。连接在线模型时，在服务端设置 ',!mode.online?el('code',{},'DEEPSEEK_API_KEY / DEEPSEEK_MODEL'):null,!mode.online?'，随后重启服务。':''));grid.append(model,voiceSettingsPanel(el,settings.voice),expressionAlbum(el));grid.append(el('section',{class:'panel wide'},el('div',{class:'panel-title'},el('h2',{},'我的数据'),btn('下载 JSON',exportData,'secondary-button','download')),el('p',{class:'settings-copy'},'导出此账号的对话、状态、反馈与计划。会话可在顶部对话历史中逐条删除。'),el('div',{class:'notice'},'本地演示模式不调用在线模型。开启在线模式后，当前对话上下文会发送到已配置的模型服务；接口密钥只保存在服务端。')));grid.append(el('section',{class:'panel wide settings-brand'},mascot('settings-mascot',''),el('div',{},el('strong',{},'MEREL'),el('p',{},MEREL_FULL_NAME,el('br'),'个性化抑郁心理支持对话系统 · 原型 v0.1'))));page.append(grid);return page;}
function exportDateStamp(){const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');}
let exporting=false;
async function exportData(){if(exporting)return;exporting=true;try{const data=await get('/export');const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'});const url=URL.createObjectURL(blob);const a=el('a',{href:url,download:'MEREL-'+exportDateStamp()+'.json'});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('数据已导出');}catch(err){toast(err.message,true);}finally{exporting=false;}}
initCharacter(navigate);
bootstrap();
