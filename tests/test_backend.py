import json
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import threading
import unittest
import httpx
from fastapi.testclient import TestClient
from backend.app import create_app
from backend.domain import extract_local,urgent_signal,ACTIONS
from backend.gateway import DeepSeekGateway,ModelFailure,validate_extraction

class Offline:
    enabled=False
    model='offline'

class ControlledGateway:
    enabled=True
    model='mock-test-model'
    def __init__(self):self.entered=threading.Event();self.release=threading.Event()
    def extract(self,text):
        self.entered.set();self.release.wait(timeout=5)
        return {'observations':[],'duration_days':None},{'model':self.model}
    def generate(self,*args):return '测试回复',{'model':self.model}

class BackendTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.db=Path(self.tmp.name)/'api.sqlite3'
        self.app=create_app(self.db,Offline());self.client=TestClient(self.app)
        self.client.post('/api/session',json={})
        self.cid=self.client.post('/api/conversations',json={}).json()['id']
    def tearDown(self):self.client.close();self.tmp.cleanup()
    def turn(self,text='我最近有点睡不着，精力不足',version=0,key='request-0001',client=None):
        return (client or self.client).post(f'/api/conversations/{self.cid}/turns',json={'text':text,'expected_version':version,'idempotency_key':key})
    def test_complete_flow_and_persistent_reload(self):
        result=self.turn();self.assertEqual(result.status_code,200);t=result.json()
        self.assertEqual(len(t['ranking']),30);self.assertEqual(len({a['id'] for a in t['ranking']}),30)
        self.assertEqual(t['state']['symptoms']['sleep']['value'],1)
        self.assertIsNone(t['state']['symptoms']['fatigue']['value'])
        self.assertEqual(t['state']['symptoms']['fatigue']['presence'],'present')
        self.assertEqual(t['trace']['generator'],'local_support_templates')
        fb=self.client.post(f"/api/turns/{t['turn_id']}/feedback",json={'helpfulness':4,'burden':2,'note':'可执行'})
        self.assertEqual(fb.status_code,200)
        p=self.client.post('/api/plans',json={'turn_id':t['turn_id']}).json()
        self.assertEqual(self.client.patch('/api/plans/'+p['id'],json={'status':'done'}).json()['status'],'done')
        self.assertEqual(self.client.post('/api/plans',json={'turn_id':t['turn_id']}).json()['id'],p['id'])
        second=TestClient(create_app(self.db,Offline()));second.cookies.update(self.client.cookies)
        detail=second.get('/api/conversations/'+self.cid).json()
        self.assertEqual(detail['turns'][0]['feedback']['helpfulness'],4)
        export=second.get('/api/export');self.assertEqual(export.status_code,200)
        self.assertEqual(export.json()['plans'][0]['status'],'done');self.assertNotIn('token',export.text)
        second.close()
    def test_user_isolation_for_all_objects(self):
        t=self.turn().json();p=self.client.post('/api/plans',json={'turn_id':t['turn_id']}).json()
        other=TestClient(self.app);other.post('/api/session',json={})
        for endpoint in (f'/api/conversations/{self.cid}',f'/api/conversations/{self.cid}/state',f"/api/turns/{t['turn_id']}/trace"):
            self.assertEqual(other.get(endpoint).status_code,404)
        self.assertEqual(other.post(f"/api/turns/{t['turn_id']}/feedback",json={'helpfulness':4,'burden':1}).status_code,404)
        self.assertEqual(other.post('/api/plans',json={'turn_id':t['turn_id']}).status_code,404)
        self.assertEqual(other.patch('/api/plans/'+p['id'],json={'status':'done'}).status_code,404)
        self.assertEqual(other.get('/api/export').json()['conversations'],[]);other.close()
    def test_session_reuse_and_cookie_flags(self):
        before=self.client.get('/api/bootstrap').json()['user']['id']
        again=self.client.post('/api/session',json={});self.assertEqual(again.json()['user']['id'],before)
        fresh=TestClient(self.app);r=fresh.post('/api/session',json={})
        self.assertIn('HttpOnly',r.headers['set-cookie']);self.assertIn('SameSite=strict',r.headers['set-cookie']);fresh.close()
    def test_requires_owner_cookie(self):
        fresh=TestClient(self.app);self.assertEqual(fresh.get('/api/bootstrap').status_code,401);fresh.close()
    def test_csrf_origin_rejected(self):
        self.assertEqual(self.client.post('/api/conversations',json={},headers={'Origin':'https://outside.example'}).status_code,403)
    def test_idempotency_and_content_binding(self):
        first=self.turn();second=self.turn();self.assertEqual(first.json(),second.json())
        self.assertEqual(self.turn('不同内容').status_code,409)
        self.assertEqual(self.turn(key='new-key-0002').status_code,409)
        self.assertEqual(len(self.client.get('/api/conversations/'+self.cid).json()['turns']),1)
    def test_state_edit_unknown_and_version(self):
        r=self.client.patch(f'/api/conversations/{self.cid}/state',json={'expected_version':0,'symptoms':{'sleep':3,'fatigue':None},'duration_days':14,'functional_burden':{'study':2}})
        self.assertEqual(r.status_code,200);self.assertEqual(r.json()['version'],1)
        self.assertIsNone(r.json()['state']['symptoms']['fatigue']['value'])
        self.assertEqual(r.json()['state']['symptoms']['fatigue']['presence'],'unknown')
        self.assertEqual(self.turn().status_code,409)
        t=self.turn('谢谢',1).json();self.assertEqual(t['state']['symptoms']['sleep']['value'],3)
        self.assertEqual(t['state']['symptoms']['sleep']['source'],'self_report')
        state=self.client.get(f'/api/conversations/{self.cid}/state').json();self.assertEqual(len(state['history']),2)
    def test_rejects_invalid_state_and_empty_text(self):
        for symptoms in ({'unknown_code':2},{'sleep':4},{'sleep':True},{'sleep':'2'}):
            self.assertEqual(self.client.patch(f'/api/conversations/{self.cid}/state',json={'expected_version':0,'symptoms':symptoms}).status_code,422)
        self.assertEqual(self.turn('  ').status_code,422)
        self.assertEqual(self.client.get('/api/conversations/'+self.cid).json()['version'],0)
    def test_feedback_update_retained_in_detail(self):
        t=self.turn().json()
        for h in (3,5):self.assertEqual(self.client.post(f"/api/turns/{t['turn_id']}/feedback",json={'helpfulness':h,'burden':2}).status_code,200)
        detail=self.client.get('/api/conversations/'+self.cid).json();self.assertEqual(detail['turns'][0]['feedback']['helpfulness'],5)
    def test_delete_cascades_export_and_trace(self):
        t=self.turn().json();self.client.post('/api/plans',json={'turn_id':t['turn_id']})
        self.assertEqual(self.client.delete('/api/conversations/'+self.cid).status_code,200)
        self.assertEqual(self.client.get('/api/plans').json()['plans'],[])
        self.assertEqual(self.client.get(f"/api/turns/{t['turn_id']}/trace").status_code,404)
    def test_urgent_route_separate_and_no_plan(self):
        r=self.turn('我没有人陪，我现在准备自杀').json()
        self.assertEqual(r['trace']['route'],'urgent_support');self.assertEqual(r['ranking'],[])
        self.assertEqual(self.client.post('/api/plans',json={'turn_id':r['turn_id']}).status_code,409)
    def test_model_failure_is_transparent_and_key_absent(self):
        class Failing:
            enabled=True;model='test'
            def extract(self,*a):raise ModelFailure('sensitive response never shown')
            def generate(self,*a):raise ModelFailure('sensitive response never shown')
        client=TestClient(create_app(self.db,Failing()));client.cookies.update(self.client.cookies)
        r=self.turn(client=client);self.assertEqual(r.status_code,200)
        self.assertEqual(len(r.json()['trace']['warnings']),2)
        self.assertNotIn('sensitive response',r.text);self.assertEqual(r.json()['trace']['generator'],'local_support_templates');client.close()
    def test_concurrent_pending_and_edit_reject_stale_commit(self):
        gateway=ControlledGateway();client=TestClient(create_app(self.db,gateway));client.cookies.update(self.client.cookies)
        with ThreadPoolExecutor() as pool:
            future=pool.submit(self.turn,client=client)
            self.assertTrue(gateway.entered.wait(3))
            self.assertEqual(self.turn(client=client).status_code,202)
            self.assertEqual(self.turn(key='parallel-0002',client=client).status_code,409)
            edited=self.client.patch(f'/api/conversations/{self.cid}/state',json={'expected_version':0,'symptoms':{'sleep':1}})
            self.assertEqual(edited.status_code,200);gateway.release.set()
            self.assertEqual(future.result().status_code,409)
        self.assertEqual(self.client.get('/api/conversations/'+self.cid).json()['turns'],[]);client.close()
    def test_rename_during_generation_is_preserved(self):
        gateway=ControlledGateway();client=TestClient(create_app(self.db,gateway));client.cookies.update(self.client.cookies)
        with ThreadPoolExecutor() as pool:
            f=pool.submit(self.turn,client=client);self.assertTrue(gateway.entered.wait(3))
            self.client.patch('/api/conversations/'+self.cid,json={'title':'我的标题'});gateway.release.set();self.assertEqual(f.result().status_code,200)
        self.assertEqual(self.client.get('/api/conversations/'+self.cid).json()['title'],'我的标题');client.close()
    def test_delete_during_generation_does_not_resurrect(self):
        gateway=ControlledGateway();client=TestClient(create_app(self.db,gateway));client.cookies.update(self.client.cookies)
        with ThreadPoolExecutor() as pool:
            f=pool.submit(self.turn,client=client);self.assertTrue(gateway.entered.wait(3))
            self.client.delete('/api/conversations/'+self.cid);gateway.release.set();self.assertEqual(f.result().status_code,404)
        self.assertEqual(self.client.get('/api/export').json()['conversations'],[]);client.close()

class EvidenceTests(unittest.TestCase):
    def test_qualifier_is_local(self):
        obs=extract_local('我非常担心考试，最近有点疲惫')['observations'];self.assertEqual(next(x for x in obs if x['code']=='fatigue')['value'],1)
    def test_unknown_intensity_not_zero(self):
        self.assertIsNone(extract_local('我最近睡不着')['observations'][0]['value'])
    def test_negation_and_other_people(self):
        self.assertEqual(extract_local('我的朋友最近睡不着')['observations'],[])
        self.assertEqual(extract_local('我以前很疲惫')['observations'],[])
        self.assertEqual(extract_local('我不再睡不着')['observations'][0]['presence'],'absent')
        self.assertEqual(extract_local('我没有兴趣')['observations'][0]['presence'],'present')
    def test_urgent_negation_is_local(self):
        for text in ('我没有人陪，我现在想自杀','朋友都不在，我现在想自杀','我不想活了','我想死','我现在准备结束自己生命'):
            self.assertTrue(urgent_signal(text),text)
        for text in ('我不想自杀','我以前想自杀','朋友说他想自杀','电影里的人想自杀'):
            self.assertFalse(urgent_signal(text),text)
    def test_duration_and_hallucination(self):
        self.assertEqual(extract_local('最近两周睡不着')['duration_days'],14)
        with self.assertRaises(ModelFailure):validate_extraction({'observations':[],'duration_days':3650},'我心情不好')
    def test_duration_and_symptoms_share_subject_scope(self):
        for text in ('我朋友最近14天睡不着','她最近14天很疲惫','我以前持续14天睡不着','我的朋友很烦躁，最近14天睡不着'):
            result=extract_local(text)
            self.assertEqual(result['observations'],[],text);self.assertIsNone(result['duration_days'],text)
        result=extract_local('我的朋友睡不着，我最近14天有点疲惫')
        self.assertEqual([x['code'] for x in result['observations']],['fatigue']);self.assertEqual(result['duration_days'],14)
    def test_schema_rejects_unsupported_evidence(self):
        with self.assertRaises(ModelFailure):validate_extraction({'observations':[{'code':'sleep','value':2,'presence':'present','evidence':'编造'}],'duration_days':None},'我最近睡不着')
    def test_model_payload_and_structured_response(self):
        calls=[]
        def handler(request):
            payload=json.loads(request.content);calls.append(payload)
            data={'observations':[{'code':'sleep','value':None,'presence':'present','evidence':'睡不着'}],'duration_days':None}
            return httpx.Response(200,json={'model':'test-model','choices':[{'message':{'content':json.dumps(data,ensure_ascii=False)}}],'usage':{'total_tokens':20}})
        model=DeepSeekGateway(api_key='test-only',transport=httpx.MockTransport(handler))
        data,meta=model.extract('最近睡不着');self.assertEqual(data['observations'][0]['presence'],'present')
        self.assertEqual(calls[0]['thinking'],{'type':'disabled'});self.assertEqual(calls[0]['response_format'],{'type':'json_object'})
    def test_http_error_does_not_leak_remote_message(self):
        model=DeepSeekGateway(api_key='test-only',transport=httpx.MockTransport(lambda r:httpx.Response(401,text='sensitive remote body')))
        with self.assertRaises(ModelFailure) as ctx:model.extract('睡不着')
        self.assertEqual(str(ctx.exception),'http_401')
    def test_generation_preserves_context_with_merel_voice(self):
        calls=[]
        def handler(request):
            calls.append(json.loads(request.content))
            if calls[-1].get('response_format'):
                return httpx.Response(200,json={'model':'test-model','choices':[{'message':{'content':json.dumps({'facts_ok':True,'action_ok':True,'issues':[]})}}]})
            return httpx.Response(200,json={'model':'test-model','choices':[{'message':{'content':'我们先把眼前的一步放小一些。'}}]})
        model=DeepSeekGateway(api_key='test-only',transport=httpx.MockTransport(handler))
        state={'version':2,'summary':'当前记录关注睡眠变化'}
        action={'id':'A19','title':'记录自己的睡眠节律'}
        answer,_=model.generate('最近睡不着',state,action,[])
        system=calls[0]['messages'][0]['content']
        self.assertIn('MEREL 心理支持对话系统',system)
        self.assertIn('服务端给定的支持动作',system)
        self.assertNotIn('desuwa',system)
        payload=json.loads(calls[0]['messages'][-1]['content'])
        self.assertEqual(payload['state'],state)
        self.assertEqual(payload['selected_action']['id'],action['id'])
        self.assertEqual(payload['selected_action']['title'],action['title'])
        self.assertIn('content_contract',payload['selected_action'])

if __name__=='__main__':unittest.main(verbosity=2)
