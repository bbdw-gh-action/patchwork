"""Contrato do workflow e execução real das verificações de entrada via Node."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

import yaml

ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = yaml.load((ROOT / '.github/workflows/patchwork.yml').read_text(encoding='utf-8'), Loader=yaml.BaseLoader)
JOBS = WORKFLOW['jobs']


class WorkflowTests(unittest.TestCase):
    def test_only_publisher_has_write_permissions_and_no_agent_secret(self):
        self.assertEqual(WORKFLOW['permissions'], {'contents': 'read'})
        for name, job in JOBS.items():
            permissions = job.get('permissions', WORKFLOW['permissions'])
            writes = {key for key, value in permissions.items() if value == 'write'}
            self.assertEqual(writes, {'contents', 'pull-requests'} if name == 'publish' else {'copilot-requests'} if name == 'propose' else set())
            payload = str(job)
            if name not in ('prepare', 'propose'):
                self.assertNotIn('secrets.SENTRY_AUTH_TOKEN', payload)
            self.assertNotIn('OPENAI_API_KEY', payload)
            if name == 'validate':
                self.assertNotIn('github.token', payload)

    def test_validation_is_required_and_publish_does_not_run_proposal(self):
        self.assertEqual(JOBS['validate']['needs'], ['prepare', 'propose'])
        self.assertEqual(JOBS['publish']['needs'], ['prepare', 'validate'])
        self.assertEqual([step['run'] for step in JOBS['publish']['steps'] if 'run' in step],
                         ['node patchwork/scripts/engine.mjs publish'])
        for name, job in JOBS.items():
            for step in job['steps']:
                if step.get('uses', '').startswith('actions/checkout@'):
                    settings = step['with']
                    self.assertEqual(settings['ref'], {'app': '${{ needs.prepare.outputs.sha }}', 'automation': '${{ github.workflow_sha }}', 'patchwork': '${{ job.workflow_sha }}'}[settings['path']])
                    if settings['path'] == 'patchwork':
                        self.assertEqual(settings['repository'], '${{ job.workflow_repository }}')
                    if name != 'publish' or settings.get('path') != 'app':
                        self.assertEqual(settings['persist-credentials'], 'false')

    def test_skills_and_mcp_precede_agent(self):
        steps = JOBS['propose']['steps']
        setup = next(i for i,s in enumerate(steps) if s.get('run') == 'node patchwork/scripts/context.mjs')
        agent = next(i for i,s in enumerate(steps) if s.get('run') == 'bash patchwork/scripts/run-agent.sh')
        self.assertLess(setup, agent)
        self.assertEqual(steps[agent]['env'], {'SENTRY_ACCESS_TOKEN':'${{ secrets.SENTRY_AUTH_TOKEN }}',
            'GITHUB_TOKEN':'${{ github.token }}', 'COPILOT_MODEL':'${{ inputs.copilot_model }}'})

    def test_handoff_is_optional_and_app_key_never_reaches_agent(self):
        self.assertEqual(JOBS['validate']['if'], "needs.propose.outputs.outcome == 'repair'")
        self.assertEqual(JOBS['handoff']['if'], "needs.propose.outputs.outcome == 'handoff'")
        self.assertEqual(JOBS['handoff']['needs'], ['prepare', 'propose'])
        self.assertIn('needs.prepare.outputs.incident', JOBS['handoff']['concurrency']['group'])
        for name, job in JOBS.items():
            if name != 'handoff':
                self.assertNotIn('secrets.PATCHWORK_APP_PRIVATE_KEY', str(job))
        self.assertEqual([s['run'] for s in JOBS['handoff']['steps'] if 'run' in s],
                         ['node patchwork/scripts/engine.mjs handoff'])
        self.assertNotIn('working-directory', str(JOBS['handoff']))

    def test_v3_contract_and_process_isolation(self):
        interface = WORKFLOW['on']['workflow_call']
        self.assertNotIn('OPENAI_API_KEY', interface['secrets'])
        self.assertNotIn('allow_bot_users', interface['inputs'])
        self.assertEqual(interface['inputs']['copilot_model']['default'], '')
        launcher = (ROOT / 'scripts/run-agent.sh').read_text(encoding='utf-8')
        self.assertIn('sudo -Hu "$agent_user"', launcher)
        self.assertIn('pkill -KILL -u "$agent_user"', launcher)
        self.assertIn('trap cleanup EXIT', launcher)

    def test_example_propagates_copilot_permission_without_personal_secret(self):
        example = yaml.load((ROOT / 'examples/consumer.yml').read_text(encoding='utf-8'), Loader=yaml.BaseLoader)
        call = example['jobs']['patchwork']
        self.assertEqual(call['permissions']['copilot-requests'], 'write')
        self.assertEqual(set(call['secrets']), {'SENTRY_AUTH_TOKEN'})
        self.assertIn('bb-dw-26/patchwork/', call['uses'])
        self.assertTrue(call['uses'].endswith('@v3'))

if __name__ == '__main__':
    unittest.main()
