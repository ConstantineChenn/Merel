"""Versioned state, evidence and deterministic demonstration policy.

The action catalog is an unsigned research draft. No learned policy is loaded.
"""
from copy import deepcopy
from datetime import datetime, timezone
import json
from pathlib import Path
import re

POLICY_VERSION = 'state-rule-demo-v1'
CATALOG = json.loads((Path(__file__).parent/'data/action_catalog_draft.json').read_text(encoding='utf-8'))
DEFINITIONS = [
 ('low_mood','情绪低落','难过、低落或空落的感受'),
 ('anhedonia','兴趣减退','对原有活动的兴趣或愉悦变化'),
 ('sleep','睡眠变化','入睡、维持睡眠及睡眠时长变化'),
 ('fatigue','精力不足','疲惫和日常精力变化'),
 ('concentration','注意困难','专注、记忆和任务切换的困难'),
 ('self_blame','自责','反复责备自己或负面自我评价'),
 ('appetite','食欲变化','进食意愿或食量变化'),
 ('psychomotor','活动变化','动作迟缓或难以安坐的感受'),
 ('rumination','反复思虑','难以停下的反复思考'),
 ('avoidance','活动回避','回避原有活动或社交'),
 ('irritability','易激惹','容易烦躁或发怒'),
 ('activation','激活表现','精力、活动或睡眠需求的明显变化'),
]
SYMPTOM_DEFINITIONS = [dict(code=c,label=l,description=d) for c,l,d in DEFINITIONS]
LABELS={c:l for c,l,_ in DEFINITIONS}
TITLES=['给感受一个名字','放下矛盾的拉扯','回顾已经走过的路','理清变化的时间','看看生活的负担','分辨困倦与疲惫',
 '理解眼前的变化','画出状态的小地图','了解一种支持方法','把事实与评价分开','看见想法与感受','重新看待自我评价',
 '找到一个小小的开始','把计划放轻一点','回顾一次活动体验','把困难拆开看看','比较两种解决办法','确定下一步',
 '记录自己的睡眠节律','找到一天的生活锚点','给精力留一点空间','从任务的第一步开始','整理眼前的待办','为专注留出空间',
 '找到可以联系的人','把需要说给对方听','回顾一次求助经历','整理一份状态时间线','准备想讨论的问题','整理会面前的信息']
ACTIONS=[]
for a,title in zip(CATALOG['actions'],TITLES):
    ACTIONS.append({'id':a['action_id'],'title':title,'strategy_id':a['strategy_id'],
      'strategy_label':a['strategy_zh'],'description':a['content_contract'],
      'burden':'medium' if a['action_id'] in ('A13','A17','A24','A25','A26') else 'low',
      'duration_minutes':5 if a['action_id'] in ('A13','A17','A24','A25','A26') else 3,
      'catalog_version':CATALOG['catalog_id'],'release_status':a['release_status']})

def now(): return datetime.now(timezone.utc).isoformat()

def initial_state():
    return {'version':0,'symptoms':{c:{'value':None,'presence':'unknown','source':None,'evidence':None,'updated_at':None} for c in LABELS},
      'duration_days':None,'functional_burden':{'study':None,'selfcare':None,'social':None},
      'summary':'还没有记录，先从此刻的感受开始。','updated_at':None}

PATTERNS={
 'low_mood':r'低落|难过|伤心|空落落|情绪很差|心情不好',
 'anhedonia':r'没有兴趣|没兴趣|失去兴趣|提不起兴趣|什么都不想做|没意思|不感兴趣',
 'sleep':r'睡不着|失眠|早醒|睡不好|睡得很多|嗜睡|入睡困难',
 'fatigue':r'疲惫|疲乏|没精神|没力气|没有力气|没有精力|很累|精力不足',
 'concentration':r'注意力不集中|无法集中|难以集中|集中不了|分心|走神|专注困难',
 'self_blame':r'自责|责怪自己|都是我的错|我真没用|我很没用',
 'appetite':r'没胃口|食欲差|不想吃饭|吃不下|食欲增加|暴饮暴食',
 'psychomotor':r'动作迟缓|坐立不安|动作变慢',
 'rumination':r'反复想|胡思乱想|想个不停|想不停|反复思考|一直想',
 'avoidance':r'不想见人|不想出门|回避社交|躲着别人',
 'irritability':r'烦躁|易怒|容易发火|容易生气',
 'activation':r'不需要睡觉|睡很少却不困|睡得少却不困|精力异常充沛|思维飞快',
}

def self_current_clauses(text):
    """Keep subject/time scope across comma-separated clauses in one sentence."""
    for sentence in re.split(r'[。！？!?；;\n]',text):
        other=False;past=False
        for clause in re.split(r'[，,]|但是|不过',sentence):
            if not clause.strip():continue
            explicit_self=bool(re.search(r'我(?:也|自己|本人|最近|现在|目前|这几天|有点|很|非常|感到|觉得|睡|疲|不|没|想|准备|打算)',clause))
            foreign=bool(re.search(r'朋友|室友|同学|他说|她说|父亲|母亲|妈妈|爸爸|新闻|小说|电影|假如|假设|例如|^(?:他|她|他们|她们)',clause.strip()))
            if foreign:other=True
            if explicit_self and not re.search(r'(?:他说|她说|朋友说|小说|电影|假设|例如)',clause):other=False
            if re.search(r'以前|去年|小时候|曾经',clause):past=True
            if re.search(r'现在|最近|目前|这几天',clause):past=False
            if not other and not past:yield clause

def extract_local(text):
    """Conservative lexical evidence only; unspecified intensity remains null."""
    observations=[]
    clauses=list(self_current_clauses(text))
    for clause in clauses:
        for code,pattern in PATTERNS.items():
            match=re.search(pattern,clause)
            if not match:continue
            prefix=clause[max(0,match.start()-8):match.start()]
            absent=bool(re.search(r'(不再|并不|没有|并没有|不是|不觉得|未曾)(?:觉得|感到|那么|很)?$',prefix))
            # Qualifiers attach to this symptom, not a distant topic in the sentence.
            near=clause[max(0,match.start()-5):match.start()]
            value=0 if absent else 1 if re.search(r'有点|轻微|稍微',near) else 3 if re.search(r'极其|极度|非常|严重|完全',near) else 2 if '明显' in near else None
            observations.append({'code':code,'value':value,'presence':'absent' if absent else 'present','evidence':clause.strip()[:300]})
    duration=None
    current_text='，'.join(clauses)
    m=re.search(r'(?:持续|已经|最近|近|这)(\d{1,3}|[一二两三四五六七八九十])(天|周|个月)',current_text)
    if m:
        chinese_numbers={'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10}
        count=int(m[1]) if m[1].isdigit() else chinese_numbers[m[1]]
        duration=min(count*{'天':1,'周':7,'个月':30}[m[2]],3650)
    return {'observations':observations,'duration_days':duration}

def urgent_signal(text):
    for clause in re.split(r'[。！？!?；;，,\n]|但是|但现在|不过',text):
        if re.search(r'朋友|室友|小说|电影|新闻|假设|以前|曾经',clause) and not re.search(r'我(?:自己|本人|现在)',clause):continue
        # 不想活 is a distress expression; 不想自杀 is an explicit negation.
        if re.search(r'我(?:现在|真的|已经)?(?:不想活|活不下去|想死|想要死)',clause):return True
        for match in re.finditer(r'自杀|结束(?:自己)?生命|跳楼|伤害自己|吞药|割伤自己',clause):
            prefix=clause[:match.start()]
            if re.search(r'(?:不想|不会|没有|不打算|不准备|并不想)(?:再|去|要)?$',prefix):continue
            if re.search(r'我(?:现在|马上|已经|准备|打算|就要|想要|想|自己).{0,12}$',prefix):return True
    return False

def merge_extraction(previous,extraction,version,source):
    state=deepcopy(previous)
    for obs in extraction['observations']:
        code=obs['code']
        state['symptoms'][code]={'value':obs['value'],'presence':obs['presence'],'source':source,'evidence':obs['evidence'],'updated_at':now()}
    if extraction.get('duration_days') is not None:state['duration_days']=extraction['duration_days']
    return finalize_state(state,version)

def finalize_state(state,version):
    state['version']=version;state['updated_at']=now()
    present=[LABELS[k] for k,v in state['symptoms'].items() if v['presence']=='present']
    state['summary']='当前记录关注：'+'、'.join(present[:5])+'。' if present else '当前尚未记录明确的困扰，可以继续描述或补充状态。'
    return state

WEIGHTS={
 'emotional_reflection':{'low_mood':1.,'self_blame':.4},'clarification':{},
 'psychoeducation':{'low_mood':.15,'sleep':.15},'cognitive_reflection':{'rumination':1.,'self_blame':.8},
 'activity_planning':{'anhedonia':1.,'avoidance':.5},'problem_solving':{'rumination':.35,'concentration':.35},
 'daily_rhythm':{'sleep':1.,'fatigue':.6,'activation':.8},'execution_support':{'concentration':1.,'fatigue':.45},
 'social_support':{'avoidance':.9,'low_mood':.2},'professional_linkage':{'activation':.6},
}

def rank_actions(state,previous_action_ids=()):
    ranking=[]
    for action in ACTIONS:
        score=.12 if action['strategy_id']=='clarification' else .04
        matched=[]
        for code,weight in WEIGHTS[action['strategy_id']].items():
            v=state['symptoms'][code]
            if v['presence']=='present':
                score+=weight*(.5 if v['value'] is None else v['value']/3)*.65;matched.append(LABELS[code])
        burdens=[v for v in state['functional_burden'].values() if v is not None]
        if burdens and max(burdens)>=2 and action['burden']=='medium':score-=.12
        if state['duration_days'] is not None and state['duration_days']>=14 and action['strategy_id']=='professional_linkage':score+=.15
        if action['id'] in previous_action_ids[-2:]:score-=.08
        # Stable action ordering is explicit, not random learned weights.
        reason='结合'+ '、'.join(matched)+'记录' if matched else '补充当前状态信息'
        if action['id'] in previous_action_ids[-2:]:reason+='，降低近期重复'
        ranking.append({'id':action['id'],'title':action['title'],'score':round(max(0,min(1,score)),4),'reason':reason})
    ranking.sort(key=lambda a:(-a['score'],a['id']))
    selected=deepcopy(next(a for a in ACTIONS if a['id']==ranking[0]['id']))
    selected['reason']=ranking[0]['reason']
    return selected,ranking

BODY={
 'A01':'我们可以先把眼前最重的一种感受说清楚。最近哪件事让这种感受格外明显？',
 'A02':'你可以同时有想努力和想停下来的感受。先选眼下更难承受的一边，我们从那里慢慢整理。',
 'A03':'刚才谈到的困难值得认真对待。回头看这一段时间，有没有一个你已经做过、哪怕很小的应对？',
 'A04':'这段变化是从什么时候开始的？大概持续了几天，还是更久？',
 'A05':'这件事目前最影响的是学习、日常照料，还是与人相处？可以先挑一项聊。',
 'A06':'你现在更像是想睡却睡不着，还是睡过之后仍很疲惫？这两种体验可以分别记录。',
 'A07':'我们先把最影响日常的一种表现单独记下来，再看它出现的时间和情境。这样更容易把困扰讲清楚。',
 'A08':'可以分开记三件事：当时的感受、持续多久、影响了哪件具体的事。先从最近一次开始。',
 'A09':'可以试着用“发生了什么—我的感受—眼前的一小步”整理此刻。每一项写一句就够了。',
 'A10':'把困扰你的那件事写成一句只描述经过的话，再另写一句你对自己的评价。我们先看看这两句有什么不同。',
 'A11':'可以从最近一次想法停不下来的时刻开始：当时发生了什么，脑中出现了哪句话，身体和情绪有什么感觉？',
 'A12':'当“都是我的问题”这样的评价出现时，先记下这句话和当时发生的事。我们再看看哪些是事实，哪些还需要了解。',
 'A13':'先不用把整天安排满。从你原本的日常里选一件最轻的事，把它缩小成两三分钟就能开始的一步。',
 'A14':'可以把原来的目标再缩小一点，先保留一个开始动作。完成后再决定是否继续，今天做到这里也可以。',
 'A15':'回顾最近做过的一件小事：开始前和结束后有什么不同？把舒服和费力的地方分别记下来。',
 'A16':'先把眼前的困难分为“现在能做一点的”和“还需要信息的”。我们只选第一类中的一小项。',
 'A17':'可以列出两个现实可行的小方案，各写下需要的时间与精力，再选负担较轻的一项先试。',
 'A18':'把下一步写成一个具体动作，再定一个回看的时间。目标只需要清楚到你知道如何开始。',
 'A19':'今晚可以先记下上床、大致入睡和起床的时间，以及白天最疲惫的时段。先看清变化，不急着一次调整所有作息。',
 'A20':'从现有日程里找一个稳定的小锚点，例如起床后拉开窗帘。先保留一件容易重复的事，之后再回顾它对一天的影响。',
 'A21':'把今天的活动按上午、下午、晚上简单排开，看看精力最吃紧的是哪一段。可以先给那一段减少一个任务。',
 'A22':'先只处理任务的第一步，例如打开文档并写下一行标题。把“完成整个任务”暂时缩小成“开始五分钟”。',
 'A23':'把待办写成不超过三项的短清单，圈出眼前只需要开始的一项。其余先留在纸上，不必同时挂在心里。',
 'A24':'可以先收起一个最容易打断注意的东西，给当前任务留五分钟。结束后暂停一下，再决定下一步。',
 'A25':'想一想身边是否有一位相处起来较安心的人。可以先整理希望对方做的一件具体小事，不需要一次说明所有经历。',
 'A26':'可以先用一句话表达需要：“我最近有些难受，想找个人听我说一会儿，你现在方便吗？”你也可以把它改成自己的说话方式。',
 'A27':'回想一次已经发生的交流：对方哪种回应有帮助，哪部分没有被理解？这些信息可以留给下一次表达。',
 'A28':'把最早出现变化的时间、近期最明显的表现和受到影响的日常事项列在一起，之后需要交流时就有一份清楚的时间线。',
 'A29':'把希望在专业交流中说清的两三个问题写下来，再补上已有的支持经历。眼下可以先写最在意的一项。',
 'A30':'可以整理已有服务的联系信息、希望沟通的问题和方便的时间。下一步只需确定其中一项。',
}

def local_reply(text,state,selected,turn_count):
    present=[LABELS[k] for k,v in state['symptoms'].items() if v['presence']=='present']
    if present:
        opening=('听起来，'+ '和'.join(present[:2])+'正在占用你的精力。' if turn_count==0 else '我们接着看眼前这一部分，先把下一步放小一些。')
    else:opening='我在听。你可以按自己的节奏说，不需要先把所有事情整理好。' if turn_count==0 else '谢谢你继续把这些说出来，我们可以接着慢慢整理。'
    return opening+'\n\n'+BODY[selected['id']]

def crisis_reply():
    return '你说到现在可能伤害自己，我很在意你此刻的安全。请先远离可能伤害自己的物品，找一位你信任的人到身边陪着你；如果已经受伤或危险迫近，请立即联系当地急救。\n\n你现在是一个人吗？能否先联系一位可以马上陪你的人？'
