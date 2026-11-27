export const POEM_LINES = Object.freeze([
  'Can I see another’s woe,',
  'And not be in sorrow too?',
  'Can I see another’s grief,',
  'And not seek for kind relief?',
  'Can I see a falling tear,',
  'And not feel my sorrow’s share?',
  'Can a father see his child',
  'Weep, nor be with sorrow filled?',
  'Can a mother sit and hear',
  'An infant groan, an infant fear?',
  'No, no! never can it be!',
  'Never, never can it be!',
  'And can He who smiles on all',
  'Hear the wren with sorrows small,',
  'Hear the small bird’s grief and care,',
  'Hear the woes that infants bear –',
  'And not sit beside the nest,',
  'Pouring pity in their breast,',
  'And not sit the cradle near,',
  'Weeping tear on infant’s tear?',
  'And not sit both night and day,',
  'Wiping all our tears away?',
  'O no! never can it be!',
  'Never, never can it be!',
  'He doth give His joy to all:',
  'He becomes an infant small,',
  'He becomes a man of woe,',
  'He doth feel the sorrow too.',
  'Think not thou canst sigh a sigh,',
  'And thy Maker is not by:',
  'Think not thou canst weep a tear,',
  'And thy Maker is not near.',
  'O He gives to us His joy,',
  'That our grief He may destroy:',
  'Till our grief is fled and gone',
  'He doth sit by us and moan.',
]);
export const POEM_GROUPS = Object.freeze(
  Array.from({length: POEM_LINES.length / 2}, (_, index) =>
    Object.freeze(POEM_LINES.slice(index * 2, index * 2 + 2))),
);

const GROUP_MS = 8000;
const EXIT_MS = 440;
function element(tag,className,text){
  const node=document.createElement(tag);
  node.className=className;
  if(text!==undefined)node.textContent=text;
  return node;
}
export class MerelPoem extends HTMLElement {
  constructor(){
    super();
    this._initialized=false;
    this._connected=false;
    this._index=0;
    this._phase='reading';
    this._remaining=GROUP_MS-EXIT_MS;
    this._timer=null;
    this._startedAt=0;
    this._playing=null;
    this._finished=false;
    this._motion=null;
    this._onToggle = () => this._toggle();
    this._onArrow = event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      this._navigate(event.key === 'ArrowLeft' ? -1 : 1);
    };
    this._onVisibility=()=>this._syncPlayback();
    this._onMotion=event=>{if(event.matches){this._playing=false;this._syncPlayback();}};
  }

  connectedCallback(){
    if(this._connected)return;
    this._connected=true;
    this._motion=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')||null;
    if(this._playing===null)this._playing=!this._motion?.matches;
    else if(this._motion?.matches)this._playing=false;
    if(!this._initialized){
      this._build();
      this._renderPair(this._playing&&!document.hidden);
      this._initialized=true;
    }
    this._verseButton.addEventListener('click', this._onToggle);
    this._verseButton.addEventListener('keydown', this._onArrow);
    document.addEventListener('visibilitychange',this._onVisibility);
    if(this._motion?.addEventListener)this._motion.addEventListener('change',this._onMotion);
    else this._motion?.addListener?.(this._onMotion);
    this._syncPlayback();
  }

  disconnectedCallback(){
    if(!this._connected)return;
    this._connected=false;
    this._stopClock();
    this._verseButton.removeEventListener('click', this._onToggle);
    this._verseButton.removeEventListener('keydown', this._onArrow);
    document.removeEventListener('visibilitychange',this._onVisibility);
    if(this._motion?.removeEventListener)this._motion.removeEventListener('change',this._onMotion);
    else this._motion?.removeListener?.(this._onMotion);
    this._updatePlaybackState();
  }

  _build(){
    const heading=element('div','poem-heading');
    heading.lang = 'en';
    heading.append(element('h2','poem-title','On Another’s Sorrow'),element('p','poem-author','William Blake'));
    this._stage=element('div','poem-stage');
    this._stage.lang = 'en';
    this._stage.setAttribute('aria-live','off');
    this._stage.setAttribute('aria-atomic','true');
    const reading = element('div', 'poem-reading');
    this._verseButton = element('button', 'poem-touch');
    this._verseButton.type = 'button';
    this._verseButton.setAttribute('aria-keyshortcuts', 'ArrowLeft ArrowRight');
    reading.append(this._stage, this._verseButton);
    const card=element('section','poem-card');
    card.setAttribute('aria-label','On Another’s Sorrow — William Blake');
    card.append(heading, reading);
    this.replaceChildren(card);
  }

  _renderPair(animate){
    const pair=element('div','poem-pair'+(animate?' is-entering':''));
    const [first,second]=POEM_GROUPS[this._index];
    pair.append(element('p','poem-line poem-line-first',first),element('p','poem-line poem-line-second',second));
    this._stage.replaceChildren(pair);
    this._pair=pair;
  }

  _shouldRun(){return this._connected&&this._playing&&!this._finished&&!document.hidden;}

  _stopClock(){
    if(this._timer===null)return;
    clearTimeout(this._timer);
    this._timer=null;
    this._remaining=Math.max(0,this._remaining-(performance.now()-this._startedAt));
  }

  _syncPlayback(){
    if(!this._initialized)return;
    if(!this._shouldRun())this._stopClock();
    else if(this._timer===null){
      this._startedAt=performance.now();
      this._timer=setTimeout(()=>{
        this._timer=null;
        this._remaining=0;
        if(this._shouldRun())this._advancePhase();
        else this._updatePlaybackState();
      },this._remaining);
    }
    this._updatePlaybackState();
  }

  _advancePhase(){
    if(this._phase==='leaving'){
      this._index+=1;
      this._phase='reading';
      this._remaining=this._index===POEM_GROUPS.length-1?GROUP_MS:GROUP_MS-EXIT_MS;
      this._renderPair(true);
    }else if(this._index===POEM_GROUPS.length-1){
      this._finished=true;
      this._playing=false;
    }else{
      this._phase='leaving';
      this._remaining=EXIT_MS;
      this._pair.classList.remove('is-entering');
      this._pair.classList.add('is-leaving');
    }
    this._syncPlayback();
  }

  _updatePlaybackState(){
    if(!this._pair)return;
    const running=this._shouldRun();
    this.dataset.state=this._finished?'finished':running?'playing':'paused';
    this.dataset.group=String(this._index+1);
    this._pair.classList.toggle('is-paused',!running);
    this._stage.setAttribute('aria-live',running?'off':'polite');
    this._verseButton.setAttribute('aria-label', this._finished ? '重播诗句' : this._playing ? '暂停诗句' : '继续诗句');
  }

  _navigate(direction){
    const index=Math.max(0,Math.min(POEM_GROUPS.length-1,this._index+direction));
    if(index===this._index)return;
    this._stopClock();
    this._index=index;
    this._phase='reading';
    this._finished=!this._playing&&index===POEM_GROUPS.length-1;
    this._remaining=index===POEM_GROUPS.length-1?GROUP_MS:GROUP_MS-EXIT_MS;
    this._renderPair(this._shouldRun());
    this._syncPlayback();
  }

  _toggle(){
    if(this._finished){
      this._stopClock();
      this._index=0;
      this._phase='reading';
      this._remaining=GROUP_MS-EXIT_MS;
      this._finished=false;
      this._playing=true;
      this._renderPair(this._shouldRun());
    }else this._playing=!this._playing;
    this._syncPlayback();
  }
}

if(!customElements.get('merel-poem'))customElements.define('merel-poem',MerelPoem);
