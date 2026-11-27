"""Offline integration checks for the bundled voice and existing backend routes."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient

from backend.app import create_app
from backend.domain import ACTIONS
from backend.gateway import DeepSeekGateway, ModelFailure
from backend import voice_runtime


def model_response(content, finish_reason='stop'):
    return httpx.Response(200, json={
        'model': 'mock-voice-model',
        'choices': [{'message': {'content': content}, 'finish_reason': finish_reason}],
        'usage': {'total_tokens': 37},
    })


class VoiceGatewayTests(unittest.TestCase):
    def setUp(self):
        self.calls = []
        self.action = next(dict(action) for action in ACTIONS if action['id'] == 'A19')
        self.state = {'version': 2, 'symptoms': {
            'sleep': {'presence': 'present', 'value': None, 'evidence': '最近睡不着'},
        }}

    def gateway(self, finish_reason='stop'):
        def handler(request):
            payload = json.loads(request.content)
            self.calls.append(payload)
            if payload.get('response_format'):
                if '结构化状态信息提取器' in payload['messages'][0]['content']:
                    content = json.dumps({'observations': [], 'duration_days': None})
                else:
                    content = json.dumps({'facts_ok': True, 'action_ok': True, 'issues': []})
            else:
                content = '今晚先记一下上床的时间和醒来的时间。先记这两项就够了。'
            return model_response(content, finish_reason)
        return DeepSeekGateway(api_key='mock-only', transport=httpx.MockTransport(handler))

    def isolated_examples(self, messages):
        self.assertEqual([message['role'] for message in messages], ['system', 'user'])
        system = messages[0]['content']
        opening, closing = '<isolated_training_examples>', '</isolated_training_examples>'
        self.assertEqual(system.count(opening), 1)
        self.assertEqual(system.count(closing), 1)
        examples = json.loads(system.split(opening, 1)[1].split(closing, 1)[0])
        self.assertIsInstance(examples, list)
        self.assertTrue(examples)
        return examples

    def test_generation_uses_voice_and_same_action_examples(self):
        history = [{'user': f'前文{i}', 'assistant': f'回应{i}'} for i in range(6)]
        answer, meta = self.gateway().generate('最近睡不着', self.state, self.action, history)
        self.assertTrue(answer)
        self.assertEqual(len(self.calls), 2, 'One generation and one factual/action review.')
        payload = self.calls[0]
        self.assertEqual(payload['temperature'], 0.2)
        self.assertNotIn('response_format', payload)
        review_payload=self.calls[1]
        self.assertEqual(review_payload['thinking'],{'type':'enabled'})
        self.assertEqual(review_payload['reasoning_effort'],'high')
        self.assertEqual(review_payload['max_tokens'],4096)
        self.assertNotIn('temperature',review_payload)
        messages = payload['messages']
        self.assertEqual(messages[0]['role'], 'system')
        profile = json.loads((voice_runtime.VOICE_BUNDLE / 'references' / 'profile.json')
                             .read_text(encoding='utf-8'))
        for rule in profile['voice_rules']:
            self.assertIn(rule, messages[0]['content'])
        examples = self.isolated_examples(messages)
        for demonstration in examples:
            self.assertEqual(demonstration['selected_action']['id'], self.action['id'])
            self.assertTrue(demonstration['target_reply'])
        current = json.loads(messages[-1]['content'])
        self.assertEqual(current['text'], '最近睡不着')
        self.assertEqual(current['state'], self.state)
        self.assertEqual(current['selected_action']['id'], self.action['id'])
        self.assertEqual(current['selected_action']['strategy_id'], self.action['strategy_id'])
        self.assertEqual(current['recent_turns'], history[-4:])
        self.assertEqual(meta['voice_version'], profile['version'])
        self.assertEqual(meta['selected_action_id'], self.action['id'])
        self.assertEqual(meta['example_ids'], [example['example_id'] for example in examples])
        self.assertEqual(meta['example_placement'], 'isolated_system_data')
        self.assertRegex(meta['voice_bundle_sha256'], r'^[a-f0-9]{64}$')
        self.assertEqual(meta['voice_source'], 'bundled_merel_support_voice')
        self.assertEqual(meta['model'], 'mock-voice-model')
        self.assertEqual(meta['usage'], {'total_tokens': 74})
        self.assertEqual(meta['model_call_count'], 2)
        self.assertEqual(meta['rewrite_count'], 0)
        self.assertEqual(meta['review_status'], 'accepted')
        self.assertEqual(meta['finish_reason'], 'stop')

    def test_sleep_examples_are_absent_from_current_input_and_real_history(self):
        current_text = '最近总是清晨五点醒来。'
        history = [{'user': '昨晚十点睡下。', 'assistant': '我记下这个时间。'}]
        self.gateway().generate(current_text, {}, self.action, history)
        messages = self.calls[0]['messages']
        examples = self.isolated_examples(messages)
        user_message = messages[-1]['content']
        current = json.loads(user_message)
        self.assertEqual(current['text'], current_text)
        self.assertEqual(current['recent_turns'], history)
        self.assertNotIn('isolated_training_examples', current)
        for example in examples:
            self.assertNotIn(example['text'], user_message)
            self.assertNotIn(example['target_reply'], user_message)
            self.assertNotIn(example['example_id'], user_message)

    def test_extraction_does_not_load_voice(self):
        with patch('backend.gateway.build_voice_messages', side_effect=AssertionError('voice called')):
            data, meta = self.gateway().extract('最近睡不着')
        self.assertEqual(data, {'observations': [], 'duration_days': None})
        payload = self.calls[0]
        self.assertEqual(payload['response_format'], {'type': 'json_object'})
        self.assertEqual(payload['thinking'],{'type':'disabled'})
        self.assertEqual(len(payload['messages']), 2)
        system = payload['messages'][0]['content']
        self.assertIn('结构化状态信息提取器', system)
        self.assertNotIn('Merel', system)
        self.assertNotIn('梅蕾尔', system)
        self.assertNotIn('voice_version', meta)

    def test_all_backend_actions_have_compatible_voice_examples(self):
        gateway = self.gateway()
        for action in ACTIONS:
            with self.subTest(action=action['id']):
                _, meta = gateway.generate('今天有些疲惫', {}, dict(action), [])
                self.assertEqual(meta['selected_action_id'], action['id'])
                self.assertTrue(meta['example_ids'])
                for demonstration in self.isolated_examples(self.calls[-2]['messages']):
                    self.assertEqual(demonstration['selected_action']['id'], action['id'])
                    self.assertEqual(demonstration['selected_action']['strategy_id'], action['strategy_id'])
        self.assertEqual(len(self.calls), len(ACTIONS) * 2)

    def test_urgent_action_is_rejected_before_network(self):
        with self.assertRaisesRegex(ModelFailure, '^voice_request_rejected$'):
            self.gateway().generate('需要即时支持', {}, {'id': 'urgent_support'}, [])
        self.assertEqual(self.calls, [])

    def test_unknown_action_or_mismatched_catalog_is_rejected(self):
        variants = [
            {**self.action, 'id': 'A99'},
            {**self.action, 'catalog_version': 'unknown-catalog'},
            {**self.action, 'strategy_id': 'unrelated-strategy'},
        ]
        for action in variants:
            with self.subTest(action=action), self.assertRaisesRegex(ModelFailure, '^voice_request_rejected$'):
                self.gateway().generate('最近睡不着', self.state, action, [])
        self.assertEqual(self.calls, [])

    def test_nonempty_truncated_reply_is_not_returned(self):
        with self.assertRaisesRegex(ModelFailure, '^response_truncated$'):
            self.gateway('length').generate('最近睡不着', self.state, self.action, [])
        self.assertEqual(len(self.calls), 1)

    def test_truncated_structured_extraction_is_rejected(self):
        with self.assertRaisesRegex(ModelFailure, '^response_truncated$'):
            self.gateway('length').extract('最近睡不着')

    def test_missing_bundle_uses_model_failure_contract(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(voice_runtime, 'VOICE_BUNDLE', Path(directory)):
                with self.assertRaisesRegex(ModelFailure, '^voice_bundle_unavailable$'):
                    self.gateway().generate('最近睡不着', self.state, self.action, [])
        self.assertEqual(self.calls, [])

    def test_loader_does_not_write_bytecode_or_modify_import_path(self):
        import sys
        with tempfile.TemporaryDirectory() as directory:
            bundle = Path(directory)
            scripts = bundle / 'scripts'
            scripts.mkdir()
            source = scripts / 'build_messages.py'
            source.write_text('def build_messages(request):\n    return request\n', encoding='utf-8')
            before_path = list(sys.path)
            with patch.object(voice_runtime, 'VOICE_BUNDLE', bundle):
                builder = voice_runtime._load_builder()
                self.assertEqual(builder({'test': 'read-only'}), {'test': 'read-only'})
            self.assertEqual(list(scripts.iterdir()), [source])
            self.assertEqual(sys.path, before_path)

    def api_turn(self, gateway, text):
        with tempfile.TemporaryDirectory() as directory:
            with TestClient(create_app(Path(directory) / 'voice.sqlite3', gateway)) as client:
                self.assertEqual(client.post('/api/session', json={}).status_code, 200)
                conversation = client.post('/api/conversations', json={}).json()
                result = client.post(f"/api/conversations/{conversation['id']}/turns", json={
                    'text': text, 'expected_version': 0, 'idempotency_key': 'voice-test-0001',
                })
                self.assertEqual(result.status_code, 200, result.text)
                return result.json()

    def test_successful_voice_metadata_is_persisted_in_trace(self):
        result = self.api_turn(self.gateway(), '我最近睡不着')
        trace = result['trace']
        self.assertEqual(trace['generator'], 'llm')
        self.assertEqual(trace['route'], 'standard')
        generation = trace['model_calls']['generation']
        self.assertEqual(generation['voice_source'], 'bundled_merel_support_voice')
        self.assertEqual(generation['selected_action_id'], result['selected_action']['id'])
        self.assertTrue(generation['voice_version'])
        self.assertEqual(len(self.calls), 3, 'One extraction, generation, and factual/action review.')

    def test_failed_generation_keeps_local_source_without_claiming_voice(self):
        def handler(request):
            payload = json.loads(request.content)
            self.calls.append(payload)
            if payload.get('response_format'):
                return model_response(json.dumps({'observations': [], 'duration_days': None}))
            return model_response('This answer is incomplete', 'length')
        gateway = DeepSeekGateway(api_key='mock-only', transport=httpx.MockTransport(handler))
        result = self.api_turn(gateway, '我最近睡不着')
        trace = result['trace']
        self.assertEqual(trace['generator'], 'local_support_templates')
        self.assertNotEqual(result['response'], 'This answer is incomplete')
        self.assertNotIn('generation', trace['model_calls'])
        self.assertIn('generation_error', trace['model_calls'])
        self.assertNotIn('voice_version', json.dumps(trace, ensure_ascii=False))
        self.assertEqual(trace['stages'][-1]['status'], 'fallback')

    def test_twice_rejected_review_uses_existing_local_fallback(self):
        def handler(request):
            payload = json.loads(request.content)
            self.calls.append(payload)
            if payload.get('response_format'):
                if '结构化状态信息提取器' in payload['messages'][0]['content']:
                    return model_response(json.dumps({'observations': [], 'duration_days': None}))
                return model_response(json.dumps({
                    'facts_ok': False, 'action_ok': True, 'issues': ['草稿补写了用户没有提供的住房情况。'],
                }, ensure_ascii=False))
            return model_response('你住的单间一定很安静。')
        gateway = DeepSeekGateway(api_key='mock-only', transport=httpx.MockTransport(handler))
        result = self.api_turn(gateway, '我最近睡不着')
        self.assertEqual(len(self.calls), 5, 'One extraction plus four bounded generation/review calls.')
        self.assertEqual(result['trace']['generator'], 'local_support_templates')
        self.assertNotEqual(result['response'], '你住的单间一定很安静。')
        self.assertNotIn('generation', result['trace']['model_calls'])
        self.assertIn('generation_error', result['trace']['model_calls'])
        self.assertEqual(result['trace']['stages'][-1]['status'], 'fallback')

    def test_urgent_api_route_bypasses_voice_and_network(self):
        with patch('backend.gateway.build_voice_messages', side_effect=AssertionError('voice called')):
            result = self.api_turn(self.gateway(), '我现在准备自杀')
        self.assertEqual(result['trace']['route'], 'urgent_support')
        self.assertEqual(result['selected_action']['id'], 'urgent_support')
        self.assertEqual(result['trace']['generator'], 'local_support_templates')
        self.assertNotIn('generation', result['trace']['model_calls'])
        self.assertEqual(self.calls, [])


class ReviewedGenerationTests(unittest.TestCase):
    def setUp(self):
        self.context = {
            'text': '昨天凌晨一点睡，今天十二点睡，想记下来。',
            'state': {}, 'recent_turns': [],
            'selected_action': {'id': 'A19', 'content_contract': '整理已提供的睡眠时间。'},
        }
        self.messages = [
            {'role': 'system', 'content': '按既定风格回应，执行给定动作。'},
            {'role': 'user', 'content': json.dumps(self.context, ensure_ascii=False)},
        ]
        self.calls = []
        self.good = json.dumps({'facts_ok': True, 'action_ok': True, 'issues': []})

    def caller(self, responses):
        responses = iter(responses)

        def call(messages, json_mode=False):
            self.calls.append({'messages': json.loads(json.dumps(messages)), 'json_mode': json_mode})
            response = next(responses)
            if isinstance(response, Exception):
                raise response
            if isinstance(response, tuple):
                content, finish_reason = response
            else:
                content, finish_reason = response, 'stop'
            return content, {
                'model': 'mock-review-model', 'finish_reason': finish_reason,
                'usage': {'prompt_tokens': 7, 'completion_tokens': 3, 'total_tokens': 10,
                          'prompt_tokens_details': {'cached_tokens': 2}},
            }
        return call

    def test_same_review_pipeline_accepts_baseline_messages_without_voice(self):
        answer, meta = voice_runtime.run_reviewed_generation(
            self.caller(['先记下这两个入睡时间。', self.good]), self.messages, self.context)
        self.assertEqual(answer, '先记下这两个入睡时间。')
        self.assertEqual([call['json_mode'] for call in self.calls], [False, True])
        self.assertEqual(meta['model_call_count'], 2)
        self.assertEqual(meta['usage']['total_tokens'], 20)
        self.assertEqual(meta['generation_calls'][0]['usage']['prompt_tokens_details'], {'cached_tokens': 2})
        self.assertEqual(meta['review_status'], 'accepted')
        review_context = json.loads(self.calls[1]['messages'][-1]['content'])
        self.assertEqual(review_context['current_request'], self.context)
        self.assertNotIn('梅蕾尔', self.calls[1]['messages'][0]['content'])
        self.assertNotIn('voice_version', meta)

    def test_numeric_issue_gets_one_revision_then_fresh_review(self):
        issue = '一点与十二点相差一小时，草稿写成半小时。'
        bad_check = json.dumps({'facts_ok': False, 'action_ok': True, 'issues': [issue]}, ensure_ascii=False)
        original_messages = json.loads(json.dumps(self.messages))
        answer, meta = voice_runtime.run_reviewed_generation(self.caller([
            '这两次相差半小时。', bad_check, '这两个入睡时间相差一小时。', self.good,
        ]), self.messages, self.context)
        self.assertEqual(answer, '这两个入睡时间相差一小时。')
        self.assertEqual(meta['rewrite_count'], 1)
        self.assertEqual(meta['model_call_count'], 4)
        self.assertEqual(meta['usage']['total_tokens'], 40)
        self.assertEqual([call['json_mode'] for call in self.calls], [False, True, False, True])
        revised = self.calls[2]['messages']
        self.assertEqual(revised[0], self.messages[0])
        revision_data = json.loads(revised[-1]['content'])
        self.assertEqual(revision_data['recent_turns'], [])
        self.assertEqual(revision_data['selected_action'], self.context['selected_action'])
        self.assertEqual(revision_data['draft_for_revision'], '这两次相差半小时。')
        self.assertEqual(revision_data['review_issues'], [issue])
        self.assertEqual(self.messages, original_messages, 'Do not mutate the original prompt.')
        self.assertEqual(len(meta['review_checks']), 2)
        self.assertFalse(meta['review_checks'][0]['facts_ok'])
        self.assertTrue(meta['review_checks'][1]['facts_ok'])

    def test_second_rejection_fails_without_a_third_attempt(self):
        rejected = json.dumps({'facts_ok': False, 'action_ok': True,
                               'issues': ['未提供两处住房的价格与噪声，不能断言单间安静或青旅便宜。']}, ensure_ascii=False)
        with self.assertRaisesRegex(voice_runtime.VoiceRuntimeFailure, '^generation_review_rejected$') as error:
            voice_runtime.run_reviewed_generation(self.caller([
                '单间更安静，青旅更便宜。', rejected, '青旅便宜一些。', rejected,
            ]), self.messages, self.context)
        self.assertEqual(len(self.calls), 4)
        self.assertEqual(error.exception.metadata['model_call_count'], 4)
        self.assertEqual(error.exception.metadata['review_status'], 'rejected')
        self.assertEqual(error.exception.metadata['usage']['total_tokens'], 40)

    def test_review_schema_rejects_coercions_extra_fields_and_empty_failures(self):
        invalid = [
            {'facts_ok': 'true', 'action_ok': True, 'issues': []},
            {'facts_ok': 1, 'action_ok': True, 'issues': []},
            {'facts_ok': False, 'action_ok': True, 'issues': []},
            {'facts_ok': True, 'action_ok': True, 'issues': ['仍有问题']},
            {'facts_ok': True, 'action_ok': True, 'issues': [], 'score': 1},
            {'facts_ok': False, 'action_ok': True, 'issues': [None]},
            {'facts_ok': False, 'action_ok': True, 'issues': [' ']},
        ]
        for result in invalid:
            with self.subTest(result=result), self.assertRaisesRegex(
                    voice_runtime.VoiceRuntimeFailure, '^invalid_review_schema$'):
                voice_runtime.run_reviewed_generation(
                    self.caller(['草稿', json.dumps(result)]), self.messages, self.context)

    def test_review_json_must_be_a_bare_valid_object(self):
        with self.assertRaisesRegex(voice_runtime.VoiceRuntimeFailure, '^invalid_review_json$'):
            voice_runtime.run_reviewed_generation(
                self.caller(['草稿', '```json\n' + self.good + '\n```']), self.messages, self.context)

    def test_review_json_rejects_duplicate_boolean_fields(self):
        raw = '{"facts_ok":false,"facts_ok":true,"action_ok":true,"issues":[]}'
        with self.assertRaisesRegex(voice_runtime.VoiceRuntimeFailure, '^invalid_review_json$'):
            voice_runtime.run_reviewed_generation(self.caller(['草稿', raw]), self.messages, self.context)

    def test_truncated_review_never_accepts_a_parseable_json_body(self):
        with self.assertRaisesRegex(voice_runtime.VoiceRuntimeFailure, '^response_truncated$') as error:
            voice_runtime.run_reviewed_generation(
                self.caller(['草稿', (self.good, 'length')]), self.messages, self.context)
        self.assertEqual(error.exception.metadata['model_call_count'], 2)
        self.assertEqual(error.exception.metadata['review_status'], 'failed')

    def test_call_failure_preserves_prior_and_failed_usage(self):
        failure = ModelFailure('response_truncated')
        failure.metadata = {'model': 'mock-review-model', 'usage': {'total_tokens': 5}, 'finish_reason': 'length'}
        with self.assertRaisesRegex(ModelFailure, '^response_truncated$') as error:
            voice_runtime.run_reviewed_generation(
                self.caller(['草稿', failure]), self.messages, self.context)
        self.assertEqual(error.exception.metadata['usage']['total_tokens'], 15)
        self.assertEqual(error.exception.metadata['model_call_count'], 2)
        self.assertEqual(error.exception.metadata['generation_calls'][-1]['status'], 'failed')

    def test_urgent_context_is_rejected_before_any_generation(self):
        context = {**self.context, 'selected_action': {'id': 'urgent_support'}}
        with self.assertRaisesRegex(voice_runtime.VoiceRuntimeFailure, '^voice_request_rejected$'):
            voice_runtime.run_reviewed_generation(self.caller([]), self.messages, context)
        self.assertEqual(self.calls, [])


if __name__ == '__main__':
    unittest.main(verbosity=2)
