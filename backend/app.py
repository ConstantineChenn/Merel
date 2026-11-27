"""MEREL modular local API with persistent anonymous ownership and replay."""
from contextlib import contextmanager
from copy import deepcopy
import hashlib
import json
import os
from pathlib import Path
import secrets
import sqlite3
import time
from typing import Literal
from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field, field_validator
from .domain import (ACTIONS,CATALOG,LABELS,POLICY_VERSION,SYMPTOM_DEFINITIONS,now,initial_state,
 extract_local,merge_extraction,finalize_state,rank_actions,local_reply,urgent_signal,crisis_reply)
from .gateway import DeepSeekGateway,ModelFailure,validate_extraction
from .voice_runtime import voice_status
from .dialogue import GREETING_ACTION,is_greeting,greeting_reply

ROOT=Path(__file__).resolve().parents[1]
COOKIE='merel_session'
def encode(v):return json.dumps(v,ensure_ascii=False,sort_keys=True,separators=(',',':'))
def digest(v):return hashlib.sha256(v.encode()).hexdigest()
def ident():return uuid4().hex

class StrictModel(BaseModel):
    model_config=ConfigDict(extra='forbid',strict=True)
class ConversationInput(StrictModel):
    title:str=Field(default='新的对话',min_length=1,max_length=80)
    @field_validator('title')
    @classmethod
    def nonblank(cls,v):
        if not v.strip():raise ValueError('请输入标题')
        return v.strip()
class ProfileInput(StrictModel):
    display_name:str=Field(min_length=1,max_length=30)
    @field_validator('display_name')
    @classmethod
    def nonblank(cls,v):
        if not v.strip():raise ValueError('请输入称呼')
        return v.strip()
class TurnInput(StrictModel):
    text:str=Field(min_length=1,max_length=5000)
    expected_version:int=Field(ge=0)
    idempotency_key:str=Field(min_length=8,max_length=100)
    @field_validator('text')
    @classmethod
    def nonblank(cls,v):
        if not v.strip():raise ValueError('请输入一些内容')
        return v.strip()
class StateInput(StrictModel):
    expected_version:int=Field(ge=0)
    symptoms:dict[str,int|None]=Field(default_factory=dict)
    duration_days:int|None=Field(default=None,ge=0,le=3650)
    functional_burden:dict[str,int|None]|None=None
    @field_validator('symptoms','functional_burden')
    @classmethod
    def valid_values(cls,v,info):
        if v is None:return v
        allowed=LABELS if info.field_name=='symptoms' else ('study','selfcare','social')
        if any(k not in allowed or (x is not None and (type(x)!=int or not 0<=x<=3)) for k,x in v.items()):raise ValueError('状态值应为0至3或未知')
        return v
class FeedbackInput(StrictModel):
    helpfulness:int=Field(ge=1,le=5)
    burden:int=Field(ge=1,le=5)
    note:str=Field(default='',max_length=1000)
class PlanInput(StrictModel):
    turn_id:str=Field(min_length=1,max_length=80)
class PlanUpdate(StrictModel):
    status:Literal['todo','done','archived']

def create_app(db_path=None,model_client=None):
    path=Path(db_path or os.environ.get('MEREL_DB',ROOT/'data/merel.sqlite3'))
    path.parent.mkdir(parents=True,exist_ok=True)
    gateway=model_client if model_client is not None else DeepSeekGateway()
    @contextmanager
    def database():
        db=sqlite3.connect(path,timeout=15)
        db.row_factory=sqlite3.Row;db.execute('PRAGMA foreign_keys=ON')
        try:yield db;db.commit()
        except BaseException:db.rollback();raise
        finally:db.close()
    with database() as db:
        db.execute('PRAGMA journal_mode=WAL')
        db.executescript('''
        CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, display_name TEXT NOT NULL, created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS conversations(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),title TEXT NOT NULL,version INTEGER NOT NULL,state_json TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,idempotency_key TEXT NOT NULL,payload_hash TEXT NOT NULL,status TEXT NOT NULL,expires REAL NOT NULL,result_json TEXT,error_code TEXT,UNIQUE(conversation_id,idempotency_key));
        CREATE TABLE IF NOT EXISTS turns(id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,version INTEGER NOT NULL,user_text TEXT NOT NULL,result_json TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(conversation_id,version));
        CREATE TABLE IF NOT EXISTS feedback(turn_id TEXT PRIMARY KEY REFERENCES turns(id) ON DELETE CASCADE,helpfulness INTEGER NOT NULL,burden INTEGER NOT NULL,note TEXT NOT NULL,updated_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS plans(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),turn_id TEXT UNIQUE NOT NULL REFERENCES turns(id) ON DELETE CASCADE,title TEXT NOT NULL,description TEXT NOT NULL,action_id TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS state_events(id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,version INTEGER NOT NULL,source TEXT NOT NULL,state_json TEXT NOT NULL,created_at TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS conversations_user ON conversations(user_id,updated_at);
        CREATE INDEX IF NOT EXISTS turns_conversation ON turns(conversation_id,version);
        ''')
    app=FastAPI(title='MEREL',version='0.1.0',description='Mental-State-Enhanced Recommendation with Empathetic LLMs')
    app.state.db_path=path;app.state.gateway=gateway

    @app.middleware('http')
    async def same_origin(request,call_next):
        if request.url.path.startswith('/api/') and request.method not in ('GET','HEAD','OPTIONS'):
            origin=request.headers.get('origin')
            if origin and origin!=str(request.base_url).rstrip('/'):
                return JSONResponse({'detail':'请求来源不匹配'},403)
        response=await call_next(request)
        response.headers['X-Content-Type-Options']='nosniff'
        if request.url.path.startswith('/api/'):
            response.headers['Cache-Control']='no-store'
        return response

    def user_for(request):
        token=request.cookies.get(COOKIE)
        if not token:return None
        with database() as db:return db.execute('SELECT * FROM users WHERE token_hash=?',(digest(token),)).fetchone()
    def identity(request:Request):
        user=user_for(request)
        if user is None:raise HTTPException(401,'请重新连接本地会话')
        return dict(user)
    def user_public(user):return {k:user[k] for k in ('id','display_name','created_at')}
    def owned(db,cid,uid):
        row=db.execute('SELECT * FROM conversations WHERE id=? AND user_id=?',(cid,uid)).fetchone()
        if not row:raise HTTPException(404,'没有找到这段对话')
        return row
    def owned_turn(db,tid,uid):
        row=db.execute('SELECT t.* FROM turns t JOIN conversations c ON t.conversation_id=c.id WHERE t.id=? AND c.user_id=?',(tid,uid)).fetchone()
        if not row:raise HTTPException(404,'没有找到这次回应')
        return row
    def conv_public(row):
        return {'id':row['id'],'title':row['title'],'version':row['version'],'state':json.loads(row['state_json']),
                'created_at':row['created_at'],'updated_at':row['updated_at']}
    def mode():return {'provider':'DeepSeek' if gateway.enabled else 'local','model':gateway.model if gateway.enabled else 'deterministic-support-v1',
                      'online':bool(gateway.enabled),'policy':POLICY_VERSION,'label':'在线模型' if gateway.enabled else '本地演示'}
    def all_conversations(db,uid):
        return [conv_public(x) for x in db.execute('SELECT * FROM conversations WHERE user_id=? ORDER BY updated_at DESC,id DESC',(uid,))]
    def turn_public(db,row):
        result=json.loads(row['result_json']);result['user_text']=row['user_text']
        fb=db.execute('SELECT * FROM feedback WHERE turn_id=?',(row['id'],)).fetchone()
        result['feedback']=dict(fb) if fb else None
        return result

    @app.get('/health')
    @app.get('/health/live')
    def health():return {'status':'ok','service':'MEREL','version':'0.1.0'}
    @app.get('/health/ready')
    def ready():
        with database() as db:db.execute('SELECT 1').fetchone()
        return {'status':'ok','storage':'sqlite'}
    @app.post('/api/session')
    def session(request:Request,response:Response):
        user=user_for(request)
        if user is None:
            token=secrets.token_urlsafe(40);uid=ident()
            with database() as db:
                db.execute('INSERT INTO users VALUES(?,?,?,?)',(uid,digest(token),'朋友',now()))
                user=db.execute('SELECT * FROM users WHERE id=?',(uid,)).fetchone()
            response.set_cookie(COOKIE,token,max_age=60*60*24*30,httponly=True,samesite='strict',secure=request.url.scheme=='https')
        return {'user':user_public(user),'mode':mode()}
    @app.get('/api/bootstrap')
    def bootstrap(user=Depends(identity)):
        with database() as db:
            conversations=all_conversations(db,user['id'])
            stats={'conversations':len(conversations),'turns':db.execute('SELECT count(*) FROM turns t JOIN conversations c ON t.conversation_id=c.id WHERE c.user_id=?',(user['id'],)).fetchone()[0],
                   'plans_completed':db.execute("SELECT count(*) FROM plans WHERE user_id=? AND status='done'",(user['id'],)).fetchone()[0]}
        return {'user':user_public(user),'conversations':conversations,'actions':ACTIONS,'mode':mode(),'symptom_definitions':SYMPTOM_DEFINITIONS,'stats':stats}
    @app.get('/api/settings')
    def settings(user=Depends(identity)):
        return {'mode':mode(),'storage':'SQLite','catalog_version':CATALOG['catalog_id'],'catalog_status':'draft',
                'voice':voice_status(gateway.enabled),
                'api_key_configured':bool(gateway.enabled),'features':{'state':True,'feedback':True,'plans':True,'trace':True,'export':True},
                'algorithm_status':'demonstration_rules','history_scope':'conversation','full_name':'Mental-State-Enhanced Recommendation with Empathetic LLMs'}
    @app.patch('/api/profile')
    def update_profile(body:ProfileInput,user=Depends(identity)):
        with database() as db:db.execute('UPDATE users SET display_name=? WHERE id=?',(body.display_name,user['id']))
        user['display_name']=body.display_name
        return {'user':user_public(user)}
    @app.get('/api/conversations')
    def conversations(user=Depends(identity)):
        with database() as db:return {'conversations':all_conversations(db,user['id'])}
    @app.post('/api/conversations',status_code=201)
    def new_conversation(body:ConversationInput,user=Depends(identity)):
        cid=ident();stamp=now();state=initial_state()
        with database() as db:
            db.execute('INSERT INTO conversations VALUES(?,?,?,?,?,?,?)',(cid,user['id'],body.title,0,encode(state),stamp,stamp))
            row=owned(db,cid,user['id'])
        return conv_public(row)
    @app.get('/api/conversations/{cid}')
    def get_conversation(cid:str,user=Depends(identity)):
        with database() as db:
            result=conv_public(owned(db,cid,user['id']))
            result['turns']=[turn_public(db,row) for row in db.execute('SELECT * FROM turns WHERE conversation_id=? ORDER BY version',(cid,))]
        return result
    @app.patch('/api/conversations/{cid}')
    def rename_conversation(cid:str,body:ConversationInput,user=Depends(identity)):
        with database() as db:
            owned(db,cid,user['id']);db.execute('UPDATE conversations SET title=?,updated_at=? WHERE id=?',(body.title,now(),cid))
            return conv_public(owned(db,cid,user['id']))
    @app.delete('/api/conversations/{cid}')
    def delete_conversation(cid:str,user=Depends(identity)):
        with database() as db:
            db.execute('BEGIN IMMEDIATE');owned(db,cid,user['id']);db.execute('DELETE FROM conversations WHERE id=?',(cid,))
        return {'deleted':True,'conversation_id':cid}
    @app.get('/api/conversations/{cid}/state')
    def get_state(cid:str,user=Depends(identity)):
        with database() as db:
            c=owned(db,cid,user['id'])
            history=[{'version':r['version'],'source':r['source'],'created_at':r['created_at'],'state':json.loads(r['state_json'])} for r in db.execute('SELECT * FROM state_events WHERE conversation_id=? ORDER BY version',(cid,))]
            return {'state':json.loads(c['state_json']),'version':c['version'],'history':history}
    @app.patch('/api/conversations/{cid}/state')
    def patch_state(cid:str,body:StateInput,user=Depends(identity)):
        with database() as db:
            db.execute('BEGIN IMMEDIATE');c=owned(db,cid,user['id'])
            if c['version']!=body.expected_version:raise HTTPException(409,'状态已更新，请刷新后重试')
            state=json.loads(c['state_json']);version=c['version']+1
            for code,value in body.symptoms.items():
                state['symptoms'][code]={'value':value,'presence':'unknown' if value is None else 'absent' if value==0 else 'present',
                  'source':'self_report','evidence':'手动状态记录','updated_at':now()}
            if 'duration_days' in body.model_fields_set:state['duration_days']=body.duration_days
            if body.functional_burden is not None:state['functional_burden'].update(body.functional_burden)
            state=finalize_state(state,version)
            db.execute('UPDATE conversations SET version=?,state_json=?,updated_at=? WHERE id=?',(version,encode(state),now(),cid))
            db.execute('INSERT INTO state_events VALUES(?,?,?,?,?,?)',(ident(),cid,version,'self_report',encode(state),now()))
        return {'state':state,'version':version}

    @app.post('/api/conversations/{cid}/turns')
    def add_turn(cid:str,body:TurnInput,user=Depends(identity)):
        started=time.perf_counter();fingerprint=digest(encode(body.model_dump()));rid=ident()
        with database() as db:
            db.execute('BEGIN IMMEDIATE');c=owned(db,cid,user['id'])
            existing=db.execute('SELECT * FROM requests WHERE conversation_id=? AND idempotency_key=?',(cid,body.idempotency_key)).fetchone()
            if existing:
                if existing['payload_hash']!=fingerprint:raise HTTPException(409,'同一请求标识对应了不同内容')
                if existing['status']=='completed':return json.loads(existing['result_json'])
                if existing['status']=='pending' and existing['expires']>time.time():return JSONResponse({'status':'pending','request_id':existing['id']},202)
            if c['version']!=body.expected_version:raise HTTPException(409,'对话已更新，请刷新后重试')
            db.execute("UPDATE requests SET status='failed',error_code='lease_expired' WHERE conversation_id=? AND status='pending' AND expires<=?",(cid,time.time()))
            if db.execute("SELECT id FROM requests WHERE conversation_id=? AND status='pending'",(cid,)).fetchone():raise HTTPException(409,'这段对话正在生成回应')
            if existing:
                # Replace request identity so an expired worker cannot commit a retried request.
                db.execute('DELETE FROM requests WHERE id=?',(existing['id'],))
            db.execute('INSERT INTO requests VALUES(?,?,?,?,?,?,?,?)',(rid,cid,body.idempotency_key,fingerprint,'pending',time.time()+180,None,None))
            previous=json.loads(c['state_json']);history=[turn_public(db,r) for r in db.execute('SELECT * FROM turns WHERE conversation_id=? ORDER BY version',(cid,))]
            original_title=c['title']
        warnings=[];metadata={};stages=[]
        try:
            stage=time.perf_counter();crisis=urgent_signal(body.text)
            greeting=not crisis and is_greeting(body.text)
            extraction=None if greeting else extract_local(body.text);extractor='local_evidence_rules'
            if gateway.enabled and not crisis and not greeting:
                try:
                    extraction,meta=gateway.extract(body.text);extraction=validate_extraction(extraction,body.text)
                    extractor='llm_structured';metadata['extraction']=meta
                except (ModelFailure,ValueError,TypeError,KeyError) as e:warnings.append('状态抽取未完成，已使用本地证据提取');metadata['extraction_error']=type(e).__name__
            if greeting:extractor='not_applicable_greeting'
            stages.append({'name':'状态抽取','duration_ms':round((time.perf_counter()-stage)*1000,2),'status':'skipped' if greeting else 'fallback' if warnings else 'ok'})
            if greeting:
                state=deepcopy(previous);state['version']=body.expected_version+1
            else:state=merge_extraction(previous,extraction,body.expected_version+1,extractor)
            stage=time.perf_counter()
            if greeting:selected,ranking=dict(GREETING_ACTION),[]
            else:selected,ranking=rank_actions(state,[t['selected_action']['id'] for t in history if t['selected_action']['id'].startswith('A')])
            if crisis:
                selected={'id':'urgent_support','title':'联系即时支持','strategy_id':'urgent_support','strategy_label':'即时支持','description':'联系可马上陪伴的人并衔接当地急救','burden':'low','duration_minutes':1,'reason':'当前直接危险表述'}
                ranking=[]
            stages.append({'name':'支持动作排序','duration_ms':round((time.perf_counter()-stage)*1000,2),'status':'skipped' if greeting else 'routed' if crisis else 'ok'})
            stage=time.perf_counter();answer=crisis_reply() if crisis else greeting_reply(body.text) if greeting else local_reply(body.text,state,selected,len(history));generator='local_greeting' if greeting else 'local_support_templates'
            if gateway.enabled and not crisis:
                try:
                    answer,meta=gateway.generate(body.text,{} if greeting else state,selected,[{'user':t['user_text'],'assistant':t['response']} for t in history[-4:]])
                    if not isinstance(answer,str) or not answer.strip():raise ModelFailure('empty_response')
                    generator='llm';metadata['generation']=meta
                except (ModelFailure,ValueError,TypeError,KeyError) as e:
                    warnings.append('在线回复暂不可用，已切换本地回应')
                    metadata['generation_error']=type(e).__name__
                    if getattr(e,'metadata',None):metadata['generation_failure_details']=e.metadata
            stages.append({'name':'回复生成','duration_ms':round((time.perf_counter()-stage)*1000,2),'status':'fallback' if gateway.enabled and generator!='llm' and not crisis else 'ok'})
            version=body.expected_version+1;tid=ident();stamp=now()
            result={'turn_id':tid,'conversation_id':cid,'version':version,'user_text':body.text,'response':answer,'state':state,
              'selected_action':selected,'ranking':ranking,'feedback':None,'created_at':stamp,
              'trace':{'trace_id':rid,'policy_version':'dialogue-v1' if greeting else POLICY_VERSION,'catalog_version':'dialogue-v1' if greeting else CATALOG['catalog_id'],
                'extractor':extractor,'generator':generator,'latency_ms':round((time.perf_counter()-started)*1000,2),'stages':stages,
                'warnings':warnings,'model_calls':metadata,'route':'urgent_support' if crisis else 'greeting' if greeting else 'standard','history_turns':len(history),
                'eligible_for_support_evaluation':not greeting and not crisis}}
            with database() as db:
                db.execute('BEGIN IMMEDIATE');current=owned(db,cid,user['id'])
                active=db.execute("SELECT id FROM requests WHERE id=? AND status='pending'",(rid,)).fetchone()
                if current['version']!=body.expected_version or not active:raise HTTPException(409,'状态在生成期间发生变化，请刷新后重试')
                title=body.text[:22] if current['title']=='新的对话' else current['title']
                db.execute('INSERT INTO turns VALUES(?,?,?,?,?,?)',(tid,cid,version,body.text,encode(result),stamp))
                db.execute('UPDATE conversations SET version=?,state_json=?,title=?,updated_at=? WHERE id=? AND version=?',(version,encode(state),title,stamp,cid,body.expected_version))
                if not greeting:db.execute('INSERT INTO state_events VALUES(?,?,?,?,?,?)',(ident(),cid,version,'conversation',encode(state),stamp))
                db.execute("UPDATE requests SET status='completed',result_json=? WHERE id=?",(encode(result),rid))
            return result
        except Exception as e:
            with database() as db:db.execute("UPDATE requests SET status='failed',error_code=? WHERE id=? AND status='pending'",(type(e).__name__,rid))
            if isinstance(e,HTTPException):raise
            raise HTTPException(503,'这次回应未完成，请稍后重试') from None

    @app.post('/api/turns/{tid}/feedback')
    def feedback(tid:str,body:FeedbackInput,user=Depends(identity)):
        with database() as db:
            t=owned_turn(db,tid,user['id']);stamp=now()
            if json.loads(t['result_json'])['selected_action']['id'].startswith('D'):raise HTTPException(409,'日常问候不记录支持效果评分')
            db.execute('INSERT INTO feedback VALUES(?,?,?,?,?) ON CONFLICT(turn_id) DO UPDATE SET helpfulness=excluded.helpfulness,burden=excluded.burden,note=excluded.note,updated_at=excluded.updated_at',(tid,body.helpfulness,body.burden,body.note,stamp))
        return {'turn_id':tid,**body.model_dump(),'updated_at':stamp,'recorded':True}
    @app.get('/api/turns/{tid}/trace')
    def trace(tid:str,user=Depends(identity)):
        with database() as db:r=turn_public(db,owned_turn(db,tid,user['id']))
        return {**r['trace'],'turn_id':tid,'state':r['state'],'ranking':r['ranking'],'selected_action':r['selected_action']}
    @app.get('/api/plans')
    def plans(user=Depends(identity)):
        with database() as db:return {'plans':[dict(r) for r in db.execute('SELECT * FROM plans WHERE user_id=? ORDER BY created_at DESC',(user['id'],))]}
    @app.post('/api/plans',status_code=201)
    def new_plan(body:PlanInput,user=Depends(identity)):
        with database() as db:
            db.execute('BEGIN IMMEDIATE');t=owned_turn(db,body.turn_id,user['id'])
            old=db.execute('SELECT * FROM plans WHERE turn_id=?',(body.turn_id,)).fetchone()
            if old:return dict(old)
            action=json.loads(t['result_json'])['selected_action']
            if action['id']=='urgent_support':raise HTTPException(409,'即时支持回应不加入日常行动计划')
            if action['id'].startswith('D'):raise HTTPException(409,'日常问候不加入行动计划')
            pid=ident();stamp=now()
            db.execute('INSERT INTO plans VALUES(?,?,?,?,?,?,?,?,?)',(pid,user['id'],body.turn_id,action['title'],action['description'],action['id'],'todo',stamp,stamp))
            return dict(db.execute('SELECT * FROM plans WHERE id=?',(pid,)).fetchone())
    @app.patch('/api/plans/{pid}')
    def patch_plan(pid:str,body:PlanUpdate,user=Depends(identity)):
        with database() as db:
            if not db.execute('SELECT id FROM plans WHERE id=? AND user_id=?',(pid,user['id'])).fetchone():raise HTTPException(404,'没有找到这项计划')
            db.execute('UPDATE plans SET status=?,updated_at=? WHERE id=?',(body.status,now(),pid))
            return dict(db.execute('SELECT * FROM plans WHERE id=?',(pid,)).fetchone())
    @app.get('/api/export')
    def export(user=Depends(identity)):
        with database() as db:
            conversations=all_conversations(db,user['id'])
            for c in conversations:
                c['turns']=[turn_public(db,r) for r in db.execute('SELECT * FROM turns WHERE conversation_id=? ORDER BY version',(c['id'],))]
                c['state_history']=[{'version':r['version'],'source':r['source'],'state':json.loads(r['state_json']),'created_at':r['created_at']} for r in db.execute('SELECT * FROM state_events WHERE conversation_id=? ORDER BY version',(c['id'],))]
            result={'schema_version':'merel-export-v1','exported_at':now(),'user':user_public(user),'conversations':conversations,
                    'plans':[dict(r) for r in db.execute('SELECT * FROM plans WHERE user_id=?',(user['id'],))],'mode':mode()}
        return JSONResponse(result,headers={'Content-Disposition':'attachment; filename="merel-data.json"'})

    frontend=ROOT/'frontend'
    if frontend.exists():app.mount('/assets',StaticFiles(directory=frontend),name='assets')
    @app.get('/',include_in_schema=False)
    def index():
        if (frontend/'index.html').exists():return FileResponse(frontend/'index.html')
        return JSONResponse({'service':'MEREL','message':'前端文件尚未就绪','docs':'/docs'})
    return app

app=create_app()
