import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { validateHandoff, encodeHandoff, decodeHandoff, validateReceived, publishHandoff, withIssueToken } from '../scripts/handoff.mjs';
import { incidentFromEvent, validateIssue, publishProposal } from '../scripts/engine.mjs';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const identity = { appId: '123', botId: '456' };
const sourceSha = 'a'.repeat(40), targetSha = 'b'.repeat(40);
const source = { repository: 'demo/checkout', baseBranch: 'main', sentry: { org: 'demo', project: 'checkout', projectId: '10' } };
const config = { ...source, handoff: { targets: [{ repository: 'demo/storefront', baseBranch: 'demo/incident' }], sources: [] } };
const receiver = { repository: 'demo/storefront', baseBranch: 'main', sourceFiles: ['src/app.ts'], testPattern: '^tests/patchwork-test.ts$',
  sentry: { org: 'demo', project: 'storefront', projectId: '11' }, handoff: { targets: [], sources: [source], receiveBranch: 'demo/incident' } };
const original = { number: 1, state: 'open', body: 'https://demo.sentry.io/issues/99/', labels: [{ name: 'sentry' }, { name: 'agent:repair' }],
  user: { login: 'sentry[bot]', id: 39604003, type: 'Bot' }, performed_via_github_app: { id: 12637 } };
const event = { eventID: 'c'.repeat(32), release: sourceSha, tags: [{ key: 'service', value: 'checkout' }, { key: 'client_release', value: targetSha }] };
const incident = incidentFromEvent(original, { id: '99', project: { id: '10', slug: 'checkout' } }, event, config, sourceSha);
const proposal = { destination: 'demo/storefront', targetRevision: targetSha, symptom: 'Dois envios observados.', evidence: 'Dois requests com a mesma intenção.',
  hypothesis: 'Verificar a origem dos dois envios.', destinationReason: 'Interface responsável por iniciar a operação.', reproduction: 'Repetir ação durante requisição pendente.', uncertainties: 'Confirmar comportamento no navegador.' };

function fixture() {
  const state = { issues: [], comments: [], labels: [], writes: [], refs: { 'demo/checkout/main': sourceSha, 'demo/storefront/demo/incident': targetSha } };
  const runGh = args => {
    const path = args.find(arg => arg.startsWith('repos/'));
    if (path.includes('/git/ref/heads/')) {
      const [repository, branch] = path.slice(6).split('/git/ref/heads/');
      return { object: { sha: state.refs[`${repository}/${branch}`] } };
    }
    if (path === 'repos/demo/checkout/issues/1') return original;
    throw new Error('Unexpected read: ' + args);
  };
  const issueGh = (args, input) => {
    const path = args.find(arg => arg.startsWith('repos/'));
    if (!input) {
      if (path.includes('/comments?')) return [state.comments];
      if (path.includes('/labels?')) return [state.labels];
      if (path.includes('/issues?')) return [state.issues];
    }
    const body = JSON.parse(input); state.writes.push({ path, body });
    if (path.endsWith('/comments')) { state.comments.push({ ...body, user: { id: 456 } }); return body; }
    if (path.endsWith('/labels')) { state.labels.push(body); return body; }
    if (path === 'repos/demo/storefront/issues') {
      const issue = { ...body, labels: body.labels.map(name => ({ name })), state: 'open', number: 2,
        html_url: 'https://github.com/demo/storefront/issues/2', user: { type: 'Bot', id: 456 }, performed_via_github_app: { id: 123 } };
      state.issues.push(issue); return issue;
    }
    throw new Error('Unexpected write: ' + args);
  };
  const publish = () => publishHandoff({ config, incident, proposal, runId: '70', runGh, issueGh, identity, privateKey, publicKey });
  const receive = (issue = state.issues[0], extra = {}) => validateReceived({ issue, config: receiver, identity, publicKey, actorId: '456', event: 'issues', runGh, ...extra });
  return { state, runGh, publish, receive };
}

test('ensaio: incidente backend → issue vinculada autenticada → PR no storefront', t => {
  const f = fixture();
  assert.equal(validateIssue(original, config, 'issues', 'sentry[bot]', '39604003'), '99');
  const url = f.publish();
  assert.equal(url, 'https://github.com/demo/storefront/issues/2');
  assert.match(f.state.comments[0].body, /permanece aberta/);
  assert.equal(original.state, 'open');
  const received = f.receive();
  assert.equal(received.envelope.sentry.project, 'checkout');
  assert.equal(received.envelope.destination, 'demo/storefront');
  assert.deepEqual(received.envelope.report, proposal);
  // O mesmo evento backend é validado; nenhum evento frontend é necessário.
  incidentFromEvent(received.original, { id: '99', project: { id: '10', slug: 'checkout' } }, event, received.source, received.envelope.sourceRevision);
  const dir = mkdtempSync(resolve(tmpdir(), 'patchwork-handoff-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(resolve(dir, 'report.md'), 'Hipótese verificada no código do destino; regressão reproduzida.');
  writeFileSync(resolve(dir, 'validation.json'), JSON.stringify({ passed: true, baseSha: targetSha, tree: 'tree' }));
  const calls = [];
  const pr = publishProposal({ config: { ...receiver, baseBranch: 'demo/incident' }, baseSha: targetSha, number: '2', artifactDir: dir, runId: '71', summaryPath: resolve(dir, 'summary'),
    runGit: args => args[0] === 'write-tree' ? 'tree' : args[0] === 'diff' ? 'M\tsrc/app.ts\nA\ttests/patchwork-test.ts' : '',
    runGh: (args, input) => {
      if (args[0] === 'pr') return [];
      if (input) { calls.push({ args, body: JSON.parse(input) }); return { html_url: 'https://github.com/demo/storefront/pull/3' }; }
      return f.runGh(args);
    } });
  assert.equal(pr, 'https://github.com/demo/storefront/pull/3');
  assert.equal(calls[0].args[1], 'repos/demo/storefront/pulls');
  assert.equal(calls[0].body.draft, true);
  assert.equal(calls[0].body.base, 'demo/incident');
});

test('deduplica inclusive issue fechada e recupera publicação interrompida antes do comentário', () => {
  const f = fixture(); f.publish();
  f.state.issues[0].state = 'closed'; f.state.comments.length = 0;
  f.publish(); f.publish();
  assert.equal(f.state.issues.length, 1); assert.equal(f.state.comments.length, 1);
  assert.equal(f.state.writes.filter(item => item.path === 'repos/demo/storefront/issues').length, 1);
});

test('recusa autor, App, ator, assinatura e origem forjados', () => {
  const f = fixture(); f.publish();
  const issue = f.state.issues[0];
  for (const mutation of [{ user: { type: 'User', id: 456 } }, { performed_via_github_app: { id: 999 } }, { state: 'closed' }])
    assert.throws(() => f.receive({ ...issue, ...mutation }), /autenticada/);
  assert.throws(() => f.receive(issue, { actorId: '999' }), /Iniciador/);
  assert.throws(() => f.receive({ ...issue, body: issue.body.replace('patchwork-handoff:v1 ', 'patchwork-handoff:v1 x') }), /Assinatura/);
  const envelope = decodeHandoff(issue.body, publicKey);
  assert.throws(() => f.receive({ ...issue, body: encodeHandoff({ ...envelope, sourceRepository: 'evil/source' }, privateKey) }), /Origem/);
  assert.throws(() => f.receive({ ...issue, body: encodeHandoff({ ...envelope, sentry: receiver.sentry }, privateKey) }), /Origem/);
  assert.throws(() => f.receive({ ...issue, body: encodeHandoff({ ...envelope, report: { ...proposal, targetRevision: 'd'.repeat(40) } }, privateKey) }), /diverge/);
});

test('revisões incompatíveis, destino não autorizado e ciclos são bloqueados', () => {
  const f = fixture(); f.publish();
  assert.throws(() => validateHandoff(proposal, config, { ...incident, hop: 1 }), /salto/);
  assert.throws(() => validateHandoff({ ...proposal, destination: 'evil/repo' }, config, incident), /Destino/);
  assert.throws(() => validateHandoff({ ...proposal, evidence: '' }, config, incident), /Relatório/);
  for (const key of Object.keys(f.state.refs)) {
    const original = f.state.refs[key]; f.state.refs[key] = 'd'.repeat(40);
    assert.throws(() => f.receive(), /Revisão/); assert.throws(() => f.publish(), /revisão/);
    f.state.refs[key] = original;
  }
  const issue = f.state.issues[0], envelope = decodeHandoff(issue.body, publicKey);
  assert.throws(() => f.receive({ ...issue, body: encodeHandoff({ ...envelope, hop: 2 }, privateKey) }), /salto/);
});

test('token de instalação é restrito a issues e revogado mesmo se publicação falhar', async t => {
  const previous = globalThis.fetch; const requests = [];
  t.after(() => { globalThis.fetch = previous; });
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return new Response(options.method === 'DELETE' ? null : JSON.stringify({ token: 'fake-token', permissions: { issues: 'write', metadata: 'read' } }), { status: options.method === 'DELETE' ? 204 : 201 });
  };
  await assert.rejects(withIssueToken({ appId: '123', installationId: '789', privateKey, repositories: ['checkout', 'storefront'] }, async token => {
    assert.equal(token, 'fake-token'); throw new Error('publication failed');
  }), /publication failed/);
  assert.deepEqual(JSON.parse(requests[0].options.body), { repositories: ['checkout', 'storefront'], permissions: { issues: 'write' } });
  assert.equal(requests[1].options.method, 'DELETE');
});
