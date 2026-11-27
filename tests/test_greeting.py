"""Greeting routes must stay natural without losing real support or urgent requests."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from fastapi.testclient import TestClient
from backend.app import create_app
from backend.dialogue import is_greeting, GREETING_ACTION
from backend.gateway import ModelFailure
from backend.voice_runtime import build_voice_messages, VOICE_BUNDLE


class Offline:
    enabled=False
    model='offline'


class GreetingGateway:
    enabled=True
    model='test-only'
    def __init__(self,fail=False):self.fail=fail;self.calls=[]
    def extract(self,text):raise AssertionError('Greeting must not call extraction')
    def generate(self,text,state,action,history):
        self.calls.append((text,state,action,history))
        if self.fail:raise ModelFailure('timeout')
        return '啊，你好呀。',{'model':self.model}


class GreetingTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.client=TestClient(create_app(Path(self.tmp.name)/'test.sqlite3',Offline()))
        self.client.post('/api/session',json={})
        self.cid=self.client.post('/api/conversations',json={}).json()['id']
    def tearDown(self):self.client.close();self.tmp.cleanup()
    def turn(self,text,version=0):
        return self.client.post(f'/api/conversations/{self.cid}/turns',json={
            'text':text,'expected_version':version,'idempotency_key':f'greeting-test-{version}'})

    def test_recognizes_only_greetings(self):
        for text in ('你好呀','Merel，在吗？','梅蕾尔你好','HELLO MEREL!','晚上好呀','早安～','嗨，你好 😊','嘿，Merel','有人在吗'):
            with self.subTest(text=text):self.assertTrue(is_greeting(text))
        for text in ('你好，最近睡不着','你好，我现在准备自杀','他说你好呀','你好点了吗','我睡不好','在吗？有件事让我很难受','你好呀，今天考试没考好'):
            with self.subTest(text=text):self.assertFalse(is_greeting(text))

    def test_greeting_skips_state_and_ranking_and_support_feedback(self):
        with patch('backend.app.extract_local',side_effect=AssertionError('local extraction should also be skipped')):
            response=self.turn('你好呀')
        self.assertEqual(response.status_code,200)
        t=response.json()
        self.assertEqual(t['trace']['route'],'greeting')
        self.assertFalse(t['trace']['eligible_for_support_evaluation'])
        self.assertEqual(t['selected_action']['id'],'D01')
        self.assertEqual(t['trace']['catalog_version'],'dialogue-v1')
        self.assertEqual(t['ranking'],[])
        self.assertNotIn('多久',t['response'])
        self.assertNotIn('这种感受',t['response'])
        self.assertEqual(self.client.post('/api/plans',json={'turn_id':t['turn_id']}).status_code,409)
        self.assertEqual(self.client.post(f"/api/turns/{t['turn_id']}/feedback",json={'helpfulness':4,'burden':1}).status_code,409)
        self.assertEqual(self.client.get(f'/api/conversations/{self.cid}/state').json()['history'],[])

    def test_existing_state_is_preserved_without_new_evidence(self):
        t=self.turn('我最近有点睡不着').json()
        following=self.turn('你好呀',1).json()
        a=dict(t['state']);b=dict(following['state']);a.pop('version');b.pop('version')
        self.assertEqual(a,b)
        self.assertEqual(following['version'],2)
        self.assertEqual(len(self.client.get(f'/api/conversations/{self.cid}/state').json()['history']),1)

    def test_distress_attached_to_greeting_uses_support(self):
        t=self.turn('你好，最近有点睡不着').json()
        self.assertEqual(t['trace']['route'],'standard')
        self.assertEqual(len(t['ranking']),30)
        self.assertEqual(t['state']['symptoms']['sleep']['presence'],'present')

    def test_immediate_risk_has_priority(self):
        t=self.turn('你好，我现在准备自杀').json()
        self.assertEqual(t['trace']['route'],'urgent_support')

    def test_online_and_fallback_both_keep_greeting_route(self):
        for fail in (False,True):
            gateway=GreetingGateway(fail)
            with TestClient(create_app(Path(self.tmp.name)/f'online-{fail}.sqlite3',gateway)) as client:
                client.post('/api/session',json={})
                cid=client.post('/api/conversations',json={}).json()['id']
                response=client.post(f'/api/conversations/{cid}/turns',json={
                    'text':'你好呀','expected_version':0,'idempotency_key':'online-greeting-001'})
                self.assertEqual(response.status_code,200)
                self.assertEqual(response.json()['trace']['generator'],'local_greeting' if fail else 'llm')
                self.assertEqual(gateway.calls[0][1],{})
                self.assertEqual(gateway.calls[0][2]['id'],'D01')

    def test_voice_contract_and_examples_do_not_force_support(self):
        messages,meta=build_voice_messages({'text':'你好呀','state':{},'selected_action':GREETING_ACTION})
        self.assertEqual(meta['voice_mode'],'greeting')
        self.assertEqual(meta['catalog_id'],'dialogue-v1')
        self.assertTrue(all(x.startswith('G') for x in meta['example_ids']))
        self.assertEqual(meta['anchor_ids'],[])
        self.assertEqual(meta['recalled_anchor_ids'],[])
        self.assertIsNone(meta['context_scene_id'])
        self.assertIn('本轮只回应问候',messages[0]['content'])

    def test_all_anchor_quotes_match_the_original_corpus(self):
        refs=VOICE_BUNDLE/'references'
        evidence=json.loads((refs/'evidence.json').read_text(encoding='utf-8'))
        sources={r['source_id']:r for r in evidence['records']}
        layers=json.loads((refs/'character_layers.json').read_text(encoding='utf-8'))
        self.assertEqual(len(layers['anchors']),11)
        for anchor in layers['anchors']:
            self.assertTrue(anchor['quotes'])
            for quote in anchor['quotes']:
                self.assertEqual(quote['text'],sources[quote['id']]['发言原文'])
            self.assertEqual(anchor['interpretation_type'],'project_inference_from_cited_speech')


if __name__=='__main__':unittest.main()
