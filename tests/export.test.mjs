import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
const engine = fileURLToPath(new URL('../scripts/engine.mjs', import.meta.url));

function fixture(t, hop = 0) {
  const dir = mkdtempSync(resolve(tmpdir(), 'patchwork-export-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const name of ['app', 'automation', 'artifacts']) mkdirSync(resolve(dir, name));
  const app = resolve(dir, 'app'), artifacts = resolve(dir, 'artifacts');
  const git = args => execFileSync('git', args, { cwd: app, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  writeFileSync(resolve(app, 'app.ts'), 'export const answer = 1;\n');
  git(['init', '-b', 'main']); git(['add', '.']); git(['-c', 'user.name=test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'fixture']);
  const sha = git(['rev-parse', 'HEAD']);
  const config = { repository: 'demo/source', baseBranch: 'main', runtime: 'node', sentry: { org: 'demo', project: 'source', projectId: '1' },
    sourceFiles: ['app.ts'], testPattern: '^test-[a-z]+.ts$', handoff: { targets: [{ repository: 'demo/target', baseBranch: 'main' }], sources: [] } };
  writeFileSync(resolve(dir, 'automation/config.json'), JSON.stringify(config));
  writeFileSync(resolve(artifacts, 'incident.json'), JSON.stringify({ hop }));
  const propose = () => writeFileSync(resolve(app, '.patchwork-handoff.json'), JSON.stringify({ destination: 'demo/target', targetRevision: 'b'.repeat(40),
    symptom: 'Sintoma com detalhes.', evidence: 'Evidência com detalhes.', hypothesis: 'Hipótese a confirmar.', destinationReason: 'Responsabilidade do destino.', reproduction: 'Passos de reprodução.', uncertainties: 'Limitações conhecidas.' }));
  const run = () => spawnSync(process.execPath, [engine, 'export'], { cwd: dir, encoding: 'utf8', env: { ...process.env, RUNNER_TEMP: artifacts,
    BASE_SHA: sha, PATCHWORK_CONFIG: 'config.json', GITHUB_OUTPUT: resolve(artifacts, 'output') } });
  return { dir, app, artifacts, propose, run };
}

test('reparo local exporta patch sem investigação ou relatório de encaminhamento', t => {
  const f = fixture(t);
  writeFileSync(resolve(f.app, 'app.ts'), 'export const answer = 2;\n');
  writeFileSync(resolve(f.app, 'test-answer.ts'), 'test regression\n');
  const result = f.run(); assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(resolve(f.artifacts, 'output'), 'utf8'), 'outcome=repair\n');
  assert.ok(existsSync(resolve(f.artifacts, 'candidate.patch')));
  assert.equal(existsSync(resolve(f.artifacts, 'handoff.json')), false);
});

test('encaminhamento exporta relatório sem exigir patch ou novo teste na origem', t => {
  const f = fixture(t); f.propose();
  const result = f.run(); assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(resolve(f.artifacts, 'output'), 'utf8'), 'outcome=handoff\n');
  assert.ok(existsSync(resolve(f.artifacts, 'handoff.json')));
  assert.equal(existsSync(resolve(f.artifacts, 'candidate.patch')), false);
});

test('export recusa misturar patch e encaminhamento ou encaminhar uma segunda vez', t => {
  const mixed = fixture(t); mixed.propose(); writeFileSync(resolve(mixed.app, 'app.ts'), 'changed\n');
  assert.match(mixed.run().stderr, /sem patch local/);
  const cycle = fixture(t, 1); cycle.propose(); assert.match(cycle.run().stderr, /salto automático/);
});
