import tempfile
import unittest
from pathlib import Path
from uuid import uuid4
from fastapi.testclient import TestClient
from backend.app import create_app
from backend.domain import extract_local
from backend.gateway import validate_extraction


class Offline:
    enabled = False


class ApiBoundaryTests(unittest.TestCase):
    def test_chinese_duration_matches_online_validation(self):
        for text, expected in [('这两天我有点累',2),('持续三天睡不好',3),('最近两周睡不好',14),('持续两三天睡不好',None)]:
            with self.subTest(text=text):
                self.assertEqual(extract_local(text)['duration_days'],expected)
                validate_extraction({'observations':[],'duration_days':expected},text)

    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.client = TestClient(create_app(Path(self.folder.name) / 'test.sqlite3', Offline()))
        self.client.post('/api/session')

    def tearDown(self):
        self.client.close()
        self.folder.cleanup()

    def conversation(self):
        response = self.client.post('/api/conversations', json={})
        self.assertEqual(response.status_code, 201)
        return response.json()['id']

    def test_title_and_profile_partitions(self):
        for endpoint, method, field, limit in [
            ('/api/conversations', 'post', 'title', 80),
            ('/api/profile', 'patch', 'display_name', 30),
        ]:
            for value, valid in [('',False), (' ',False), ('甲',True), ('甲'*limit,True), ('甲'*(limit+1),False), (7,False), (None,False)]:
                with self.subTest(endpoint=endpoint, length=len(value) if isinstance(value,str) else type(value).__name__):
                    response = getattr(self.client, method)(endpoint, json={field:value})
                    self.assertEqual(response.status_code, (201 if method=='post' else 200) if valid else 422)
            self.assertEqual(getattr(self.client, method)(endpoint, json={field:'甲','unknown':1}).status_code, 422)

    def test_message_text_key_and_version_boundaries(self):
        dimensions = {
            'text':[('',False), (' ',False), ('甲',True), ('甲'*5000,True), ('甲'*5001,False), (12,False), (None,False)],
            'idempotency_key':[('x'*7,False), ('x'*8,True), ('x'*100,True), ('x'*101,False), (None,False)],
            'expected_version':[(-1,False), (0,True), (0.5,False), ('0',False), (True,False)],
        }
        for field, cases in dimensions.items():
            for value, valid in cases:
                with self.subTest(field=field, value_length=len(value) if isinstance(value,str) else value):
                    cid = self.conversation()
                    body = {'text':'你好','expected_version':0,'idempotency_key':uuid4().hex,field:value}
                    response = self.client.post(f'/api/conversations/{cid}/turns', json=body)
                    self.assertEqual(response.status_code, 200 if valid else 422)
                    self.assertEqual(self.client.get(f'/api/conversations/{cid}').json()['version'], int(valid))

    def test_state_and_feedback_boundaries(self):
        for value, valid in [(None,True),(-1,False),(0,True),(3,True),(4,False),('2',False),(True,False)]:
            with self.subTest(symptom=value):
                cid = self.conversation()
                response = self.client.patch(f'/api/conversations/{cid}/state', json={'expected_version':0,'symptoms':{'low_mood':value}})
                self.assertEqual(response.status_code, 200 if valid else 422)
        for value, valid in [(None,True),(-1,False),(0,True),(3650,True),(3651,False)]:
            with self.subTest(duration=value):
                cid = self.conversation()
                response = self.client.patch(f'/api/conversations/{cid}/state', json={'expected_version':0,'duration_days':value})
                self.assertEqual(response.status_code, 200 if valid else 422)
        cid = self.conversation()
        turn = self.client.post(f'/api/conversations/{cid}/turns', json={'text':'最近总是睡不好，白天有点累。','expected_version':0,'idempotency_key':uuid4().hex}).json()
        for field in ('helpfulness','burden'):
            for value, valid in [(0,False),(1,True),(5,True),(6,False),(True,False),('3',False)]:
                with self.subTest(feedback_field=field, value=value):
                    response = self.client.post(f"/api/turns/{turn['turn_id']}/feedback", json={'helpfulness':3,'burden':3,field:value})
                    self.assertEqual(response.status_code, 200 if valid else 422)
        for length, valid in [(0,True),(1000,True),(1001,False)]:
            with self.subTest(note_length=length):
                response = self.client.post(f"/api/turns/{turn['turn_id']}/feedback", json={'helpfulness':3,'burden':3,'note':'甲'*length})
                self.assertEqual(response.status_code, 200 if valid else 422)

    def test_plan_transitions_and_invalid_state(self):
        cid = self.conversation()
        turn = self.client.post(f'/api/conversations/{cid}/turns', json={'text':'最近总是睡不好。','expected_version':0,'idempotency_key':uuid4().hex}).json()
        plan = self.client.post('/api/plans', json={'turn_id':turn['turn_id']}).json()
        for status in ('done','todo','archived','todo'):
            response = self.client.patch('/api/plans/'+plan['id'], json={'status':status})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()['status'], status)
        self.assertEqual(self.client.patch('/api/plans/'+plan['id'], json={'status':'invalid'}).status_code, 422)
        self.assertEqual(self.client.get('/api/plans').json()['plans'][0]['status'], 'todo')


if __name__ == '__main__':
    unittest.main()
