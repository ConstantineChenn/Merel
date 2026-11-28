"""Black-box HTTP checks against a running release; uses isolated session cookies."""
import json
import sys
import time
from pathlib import Path
from uuid import uuid4
import httpx

base = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8787'
report = {'base': base, 'checks': [], 'model_turns': [], 'model_attempts': [], 'passed': False}
destination=Path(__file__).resolve().parents[1]/'test-results/http-acceptance.json'

def check(name, actual, expected):
    assert actual == expected, (name, actual, expected)
    report['checks'].append(name)

with httpx.Client(base_url=base, timeout=150, trust_env=False) as owner, httpx.Client(base_url=base, timeout=15, trust_env=False) as other:
    cid = None
    try:
        for path in ('/health', '/health/live', '/health/ready'):
            response = owner.get(path)
            check(path+' status', response.status_code, 200)
            check(path+' readiness', response.json()['status'], 'ok')
        check('No session rejected', owner.get('/api/bootstrap').status_code, 401)
        response = owner.post('/api/session', json={})
        check('Session created', response.status_code, 200)
        check('Server online mode', response.json()['mode']['online'], True)
        check('HttpOnly cookie', 'HttpOnly' in response.headers['set-cookie'], True)
        check('SameSite cookie', 'SameSite=strict' in response.headers['set-cookie'], True)
        check('Session id stable', owner.post('/api/session',json={}).json()['user']['id'], response.json()['user']['id'])
        other.post('/api/session', json={}).raise_for_status()
        check('Foreign origin rejected', owner.post('/api/conversations',json={},headers={'Origin':'https://outside.example'}).status_code,403)
        for path in ('/.env','/assets/.env','/assets/../.env','/assets/%2e%2e/.env'):
            check('No configuration exposure '+path, owner.get(path).status_code,404)
        check('Wrong method rejected',owner.put('/api/conversations',json={}).status_code,405)
        check('Malformed JSON rejected',owner.post('/api/conversations',content='{',headers={'Content-Type':'application/json'}).status_code,422)
        check('Unexpected property rejected',owner.post('/api/conversations',json={'title':'测试','unknown':True}).status_code,422)
        response=owner.post('/api/conversations',json={'title':'HTTP 接口验收专用'})
        check('Conversation created',response.status_code,201)
        cid=response.json()['id']
        path='/api/conversations/'+cid
        check('Owner can read',owner.get(path).status_code,200)
        check('Other session cannot read',other.get(path).status_code,404)
        check('Other session cannot update',other.patch(path,json={'title':'不应成功'}).status_code,404)
        check('Other session cannot delete',other.delete(path).status_code,404)
        check('Whitespace rejected',owner.post(path+'/turns',json={'text':'   ','expected_version':0,'idempotency_key':uuid4().hex}).status_code,422)
        check('Rejected request leaves version unchanged',owner.get(path).json()['version'],0)
        for version,text in enumerate(('你好呀','这两天准备答辩有些累，想先安排一个轻松的小步骤。')):
            payload={'text':text,'expected_version':version,'idempotency_key':uuid4().hex}
            start=time.monotonic()
            response=owner.post(path+'/turns',json=payload)
            check(f'Turn {version+1} HTTP status',response.status_code,200)
            turn=response.json()
            report['model_attempts'].append(turn['trace'])
            check(f'Turn {version+1} real model',turn['trace']['generator'],'llm')
            check(f'Turn {version+1} nonempty reply',bool(turn['response'].strip()),True)
            check(f'Turn {version+1} version',turn['version'],version+1)
            check(f'Turn {version+1} idempotent replay',owner.post(path+'/turns',json=payload).json(),turn)
            check(f'Turn {version+1} key bound to content',owner.post(path+'/turns',json={**payload,'text':'改变内容'}).status_code,409)
            check(f'Turn {version+1} stale version rejected',owner.post(path+'/turns',json={**payload,'idempotency_key':uuid4().hex}).status_code,409)
            report['model_turns'].append({'route':turn['trace']['route'],'generator':turn['trace']['generator'],'extractor':turn['trace']['extractor'],'model':turn['trace']['model_calls']['generation']['model'],'latency_ms':turn['trace']['latency_ms'],'round_trip_including_replays_ms':round((time.monotonic()-start)*1000,2),'warnings':turn['trace']['warnings']})
        check('Two turns only after replay',len(owner.get(path).json()['turns']),2)
        check('Chinese duration',turn['state']['duration_days'],2)
        tid=turn['turn_id']
        check('Feedback saved',owner.post(f'/api/turns/{tid}/feedback',json={'helpfulness':5,'burden':1,'note':'自动化验收合成数据'}).status_code,200)
        check('Cross-user feedback rejected',other.post(f'/api/turns/{tid}/feedback',json={'helpfulness':1,'burden':5}).status_code,404)
        response=owner.post('/api/plans',json={'turn_id':tid})
        check('Plan created',response.status_code,201)
        pid=response.json()['id']
        check('Duplicate plan returns same id',owner.post('/api/plans',json={'turn_id':tid}).json()['id'],pid)
        for status in ('done','archived','todo'):
            check('Plan transition '+status,owner.patch('/api/plans/'+pid,json={'status':status}).json()['status'],status)
        check('Cross-user plan update rejected',other.patch('/api/plans/'+pid,json={'status':'done'}).status_code,404)
        check('Cross-user trace rejected',other.get(f'/api/turns/{tid}/trace').status_code,404)
        check('Invalid state rejected',owner.patch(path+'/state',json={'expected_version':2,'symptoms':{'sleep':4}}).status_code,422)
        response=owner.patch(path+'/state',json={'expected_version':2,'symptoms':{'sleep':1}})
        check('State edit increments version',response.json()['version'],3)
        check('Stale state edit rejected',owner.patch(path+'/state',json={'expected_version':2,'duration_days':4}).status_code,409)
        response=owner.get('/api/export')
        check('Export successful',response.status_code,200)
        check('Export retains feedback',response.json()['conversations'][0]['turns'][-1]['feedback']['helpfulness'],5)
        check('Export retains plan',response.json()['plans'][0]['id'],pid)
        check('API not cached',response.headers.get('cache-control'),'no-store')
        check('Export does not include credential',any(token in response.text for token in ('DEEPSEEK_API_KEY','token_hash','merel_session')),False)
        check('Other user export empty',other.get('/api/export').json()['conversations'],[])
        check('Delete test conversation',owner.delete(path).status_code,200)
        cid=None
        check('Deleted conversation absent',owner.get(path).status_code,404)
        check('Dependent trace deleted',owner.get(f'/api/turns/{tid}/trace').status_code,404)
        check('Dependent plan deleted',owner.get('/api/plans').json()['plans'],[])
        report['passed']=True
    except Exception as error:
        report['failure']=str(error)
        raise
    finally:
        try:
            if cid: owner.delete('/api/conversations/'+cid)
        finally:
            destination.parent.mkdir(parents=True,exist_ok=True)
            destination.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'base':base,'passed':report['passed'],'checks':len(report['checks']),'model_turns':report['model_turns']},ensure_ascii=False))
