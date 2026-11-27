"""Build an inspectable Merel-style chat request without network or credentials."""
import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_resources():
    references = ROOT / 'references'
    paths = [references / name for name in
             ('profile.json', '口吻约束.txt', 'examples.jsonl', 'character.json',
              'contrast_pairs.json', 'evidence.json', 'context_scenes.json','character_layers.json')]
    profile = json.loads(paths[0].read_text(encoding='utf-8'))
    constraints = paths[1].read_text(encoding='utf-8-sig').strip()
    examples = [json.loads(line) for line in
                paths[2].read_text(encoding='utf-8').splitlines() if line.strip()]
    digest = hashlib.sha256()
    for path in paths:
        digest.update(path.name.encode('utf-8'))
        digest.update(path.read_bytes())
    digest.update(Path(__file__).read_bytes())
    return profile, constraints, examples, digest.hexdigest()


def voice_mode(state, text='', history=None, action_id=''):
    # Delivery modes never select or modify the support action.
    if history and re.search(r'不是.{0,18}[，。]|我没说|记错|说错|早就|已经.{0,8}了.*卡', text):
        return 'repair'
    if (re.search(r'挺高兴|很高兴|好开心|很开心|终于[^。！？]{0,40}(了|完)|做到了|成功了|松了一口气', text)
            and not re.search(r'不高兴|不开心|没(?:有)?(?:完成|做完|成功)|没做到',text)):
        return 'encourage'
    if action_id in ('A04','A05','A06'):
        return 'clarify'
    symptoms = state.get('symptoms') or {}
    burden = state.get('functional_burden') or {}
    distressed = any((symptoms.get(code) or {}).get('presence') == 'present'
                     for code in ('low_mood', 'self_blame', 'irritability', 'activation'))
    burdened = any(isinstance(value, (int, float)) and value >= 2
                   for value in burden.values())
    if distressed or burdened or action_id in ('A01','A02','A03','A12'):
        return 'care'
    if action_id in {f'A{i:02d}' for i in range(7,31)}:
        return 'thinking'
    return 'everyday'


def grams(text):
    value=re.sub(r'[^\w\u4e00-\u9fff]', '', text)
    return {value[i:i+2] for i in range(max(0,len(value)-1))}


def choose_examples(examples, action_id, mode, text, history):
    query=grams(text)
    previous='\n'.join(str(t.get('assistant','')) for t in history if isinstance(t,dict))
    topics={
        'loss':r'去世|走了|不在了|小猫|猫咪|葬礼|失去亲人',
        'evaluation':r'老师|展示|排练|表演|合唱|成绩|考试|考了|不及格|批评|被换|准备',
        'energy':r'费劲|没劲|难过|低落|累|课件',
        'task':r'文档|报告|介绍|论文|申请表|开头',
        'social':r'同学|朋友|室友|姐姐|哥哥|家里|邀请',
    }
    query_topics={name for name,pattern in topics.items() if re.search(pattern,text)}
    def score(e):
        tokens=grams(e['user_text'])
        similarity=len(query & tokens)/max(1,len(query | tokens))
        repetition=bool(e['response'][:10] and e['response'][:10] in previous)
        e_topics={name for name,pattern in topics.items() if re.search(pattern,e['user_text'])}
        overlap=len(query_topics & e_topics)
        loss_penalty=2 if ('loss' in e_topics) != ('loss' in query_topics) else 0
        return (-(2*(e['mode']==mode)+0.5*overlap+similarity-0.75*repetition-loss_penalty), e['example_id'])
    candidates=[e for e in examples if e['action_id']==action_id]
    matching=[e for e in candidates if e['mode']==mode]
    return sorted(matching or candidates,key=score)[:2]


def build_messages(request):
    """Accept an already selected action and return messages plus trace metadata."""
    profile, constraints, examples, digest = load_resources()
    action = request.get('selected_action') or {}
    action_id = action.get('id') or action.get('action_id')
    if request.get('route', 'standard') != 'standard' or action_id == 'urgent_support':
        raise ValueError('Use the existing immediate-support route for this request.')
    contracts={**profile['action_contracts'],**profile.get('dialogue_contracts',{})}
    if action_id not in contracts:
        raise ValueError('Supply an action from the versioned action catalog.')
    social=action_id in profile.get('dialogue_contracts',{})
    catalog=profile['dialogue_catalog_id'] if social else profile['catalog_id']
    if action.get('catalog_version', catalog) != catalog:
        raise ValueError('The action catalog and voice examples use different versions.')
    contract = contracts[action_id]
    if action.get('strategy_id', contract['strategy_id']) != contract['strategy_id']:
        raise ValueError('The selected action and strategy disagree.')
    text = request.get('text')
    state = request.get('state') or {}
    if not isinstance(text, str) or not text.strip() or not isinstance(state, dict):
        raise ValueError('Supply nonempty user text and a state object.')
    history=request.get('recent_turns') or []
    if not isinstance(history,list):
        raise ValueError('Recent turns must be a list.')
    mode = 'greeting' if social else voice_mode(state,text,history,action_id)
    selected = choose_examples(examples,action_id,mode,text,history)
    character=json.loads((ROOT/'references/character.json').read_text(encoding='utf-8'))
    evidence=json.loads((ROOT/'references/evidence.json').read_text(encoding='utf-8'))
    sources={r['source_id']:r for r in evidence['records']}
    anchor_ids=character['anchor_ids'].get(mode,[])
    anchors=[sources[sid]['发言原文'] for sid in anchor_ids]
    scenes=json.loads((ROOT/'references/context_scenes.json').read_text(encoding='utf-8'))['scenes']
    scene=max(scenes,key=lambda item:len(set(item['sourceIds'])&set(anchor_ids)))
    scene_text=json.dumps({k:scene[k] for k in ('interlocutor','situation','speech_acts','transferable_mechanism','do_not_copy')},ensure_ascii=False)
    layers=json.loads((ROOT/'references/character_layers.json').read_text(encoding='utf-8'))
    matched=[key for key,words in layers['story_memory']['keywords'].items() if any(w in text for w in words)] if not social else []
    layer_text={name:layers[name] for name in ('fixed_personality','relationship_memory','situational_behavior')}
    layer_text['story_memory']={'rules':layers['story_memory']['rules'],'recalled_anchors':[a for a in layers['anchors'] if a['id'] in matched]}
    contrasts=json.loads((ROOT/'references/contrast_pairs.json').read_text(encoding='utf-8'))
    contrast_text=['改写对照：'+r['bad']+' → '+r['better']+'；'+r['reason'] for r in contrasts[:3]] if not social else [
        '用户只说“你好呀”时，自然回一个招呼即可。不要接“这种感受持续多久了”，也无需强行邀谈心事。']
    system = '\n'.join([
        '你以 Merel 的口吻参与日常交流。本轮只回应问候。' if social else '你是 MEREL 心理支持对话系统，以 Merel 的口吻和用户交谈，并执行服务端给定的支持动作。',
        '写的是她当场会怎样接这句话：有自己的反应、判断和一点不精致的生活感。不要把回复写成评估结果或支持步骤的说明书。',
        '人物内在姿态',
        *character['prompt_core'],
        '四层角色资料（原文证据与性格归纳分开；关系信息只取真实历史）：'+json.dumps(layer_text,ensure_ascii=False),
        '表达特点',
        *profile['voice_rules'],
        '当前语气',
        profile['modes'][mode],
        '语气标签是检索线索；若与当前原话不合，以当前原话的实际含义为准，不推断用户未表达的情绪。',
        '原剧本语感锚点（研究资料，观察接话方式；不照搬经历、物品、称谓或承诺）：',
        *anchors,
        '对应剧情语境（情境概述，不是给当前用户的事实）：'+(scene_text if anchor_ids else '本轮是普通问候，不召回重剧情场景。'),
        '常见失败的修正',
        *contrast_text,
        '运行约束',
        constraints,
        '示例库是独立编写的训练资料，不是当前对话。只有当前输入中的 recent_turns 属于真实历史。绝不能拿训练示例与当前用户核对、比较或追问矛盾。',
        '唯一的 user 消息才是本轮输入。示例只示范表达与动作落实，不照抄句子外壳。',
        '动作边界：反映感受/整理记录时不顺手加澄清问题或行动任务。提出办法时只使用用户提供的活动；没有写作任务就不要说“写一小段”。',
        '事实核对：询问信息要问尚缺的字段；只有本轮一处误解，不说“又记错”。草稿不补造请求理由。比较方案只用已知差异，不把常见印象写成这两项的事实。未知设备不编操作按钮。',
        '自然度核对：挑最关键的细节接话，不把同一句事实换三种说法重复。不必用“这件事做成了”“两件事都算数”作结。高兴时可以直接高兴一下，认真时就直说。',
        '若有委屈或失落，回应已知事件中的落差，再有一句当场反应，不固定收尾“确实难受”。若有进展，用完成动作接一句自然的高兴，未完成的部分放在背景里，不作验收。',
        '输出前默读一次：接上当前这句话吗？给定动作完整吗？添了事实或另一项任务吗？像在交谈还是在读流程表？修正后只输出回复正文。',
    ])
    demonstrations=[]
    for example in selected:
        demonstration = {
            'example_id':example['example_id'],
            'text': example['user_text'], 'state': example['state'],
            'selected_action': {'id': action_id, **contract},
            'recent_turns':example.get('recent_turns',[]),
            'knowledge':example.get('knowledge',[]),
            'target_reply':example['response'],
        }
        demonstrations.append(demonstration)
    system+='\n<isolated_training_examples>\n'+json.dumps(demonstrations,ensure_ascii=False)+'\n</isolated_training_examples>'
    system+='\n本轮完成标准：'+contract['completion_check']+'。完成这项即收口。不要顺手添加另一项支持任务。'
    messages = [{'role': 'system', 'content': system}]
    current = {
        'text': text, 'state': state,
        'selected_action': {**action, **contract, 'id': action_id},
        'recent_turns': history[-4:],
        'knowledge':request.get('knowledge',[]),
    }
    messages.append({'role': 'user', 'content': json.dumps(current, ensure_ascii=False)})
    metadata = {
        'voice_version': profile['version'], 'voice_bundle_sha256': digest,
        'voice_mode': mode, 'example_ids': [item['example_id'] for item in selected],
        'catalog_id': catalog, 'selected_action_id': action_id,
        'anchor_ids':anchor_ids,'retrieval':'same_action_mode_bigrams_v3_isolated',
        'example_placement':'isolated_system_data',
        'context_scene_id':scene['scene_id'] if anchor_ids else None,
        'character_layers_version':layers['version'],'recalled_anchor_ids':matched,
    }
    return messages, metadata


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, required=True)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    messages, metadata = build_messages(json.loads(args.input.read_text(encoding='utf-8-sig')))
    payload = json.dumps({'messages': messages, 'voice_metadata': metadata},
                         ensure_ascii=False, indent=2) + '\n'
    if args.output:
        args.output.write_text(payload, encoding='utf-8')
    else:
        print(payload, end='')


if __name__ == '__main__':
    main()
