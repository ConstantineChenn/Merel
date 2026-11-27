"""Conversation events are separate from symptom-conditioned support ranking."""
import re
import unicodedata

GREETING_ACTION = {
    'id':'D01','title':'回应问候','strategy_id':'greeting','strategy_label':'日常交流',
    'description':'自然回应招呼，不假定用户有困扰。','burden':'none','duration_minutes':0,
    'catalog_version':'dialogue-v1','reason':'本轮仅包含问候或确认是否在场',
}

def is_greeting(text):
    normalized=unicodedata.normalize('NFKC',text).lower().strip()
    if len(normalized)>48:return False
    normalized=''.join(c for c in normalized if not c.isspace() and unicodedata.category(c)[0] not in 'PS')
    name=r'(?:merel|梅蕾尔|小梅)'
    greeting=r'(?:你好[呀啊哇哟哦吗]?|您好[呀啊]?|嗨|嘿|hi|hello|哈喽|哈啰|(?:早上好|早安|早|中午好|下午好|晚上好)[呀啊哇哟哦]?|在吗|在不在|有人在吗)'
    return bool(re.fullmatch(name+'?'+greeting+'+'+name+'?',normalized))

def greeting_reply(text):
    if any(x in text for x in ('在吗','在不在','有人在')):return '我在。怎么啦？'
    if any(x in text for x in ('早上','早安','早呀')):return '早上好。今天怎么样？'
    if '晚上好' in text:return '晚上好。想聊点什么？'
    return '啊，你好。找我有什么事吗？'
