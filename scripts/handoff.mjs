import { createHash, sign, verify } from 'node:crypto';

const sha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const repo = value => typeof value === 'string' && /^[\w.-]+\/[\w.-]+$/.test(value);
const positive = value => /^[1-9][0-9]*$/.test(String(value));
const fields = ['symptom', 'evidence', 'hypothesis', 'destinationReason', 'reproduction', 'uncertainties'];
const fail = message => { throw new Error(message); };

export function validateRouting(config) {
  if (!config.handoff) return;
  for (const list of ['targets', 'sources']) {
    if (!Array.isArray(config.handoff[list])) fail('Mapa de encaminhamento inválido.');
    const seen = new Set();
    for (const entry of config.handoff[list]) {
      if (!repo(entry.repository) || entry.repository === config.repository || seen.has(entry.repository) ||
          !/^[\w/-]+$/.test(entry.baseBranch) || entry.baseBranch.includes('..')) fail('Destino/origem inválido no mapa.');
      seen.add(entry.repository);
      if (list === 'sources' && (!['org', 'project'].every(key => /^[a-z0-9-]+$/.test(entry.sentry?.[key])) ||
          !positive(entry.sentry?.projectId))) fail('Projeto Sentry de origem inválido.');
    }
  }
  if (config.handoff.receiveBranch && (!/^[\w/-]+$/.test(config.handoff.receiveBranch) || config.handoff.receiveBranch.includes('..')))
    fail('Branch de recebimento inválida.');
}

export function validateHandoff(proposal, config, incident) {
  validateRouting(config);
  if ((incident.hop ?? 0) !== 0) fail('Apenas um salto automático; divergência exige revisão humana.');
  const target = config.handoff?.targets.find(item => item.repository === proposal?.destination);
  if (!target || !sha(proposal.targetRevision)) fail('Destino ou revisão não autorizado.');
  if (Object.keys(proposal).some(key => ![...fields, 'destination', 'targetRevision'].includes(key)) ||
      fields.some(key => typeof proposal[key] !== 'string' || proposal[key].trim().length < 12 || proposal[key].length > 6000) || JSON.stringify(proposal).length > 18000)
    fail('Relatório incompleto ou fora do limite.');
  return target;
}

export function handoffId(incident, destination) {
  return createHash('sha256').update(JSON.stringify([incident.sentryUrl, incident.release, destination])).digest('hex');
}

export function encodeHandoff(envelope, privateKey) {
  const payload = Buffer.from(JSON.stringify(envelope)).toString('base64url');
  return `<!-- patchwork-handoff:v1 ${payload}.${sign('RSA-SHA256', Buffer.from(payload), privateKey).toString('base64url')} -->`;
}

export function decodeHandoff(body, publicKey) {
  if (typeof body !== 'string' || body.length > 60000) fail('Encaminhamento ausente ou excessivo.');
  const matches = [...body.matchAll(/<!-- patchwork-handoff:v1 ([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+) -->/g)];
  if (matches.length !== 1 || !publicKey) fail('Assinatura de encaminhamento ausente.');
  const [, payload, signature] = matches[0];
  if (!verify('RSA-SHA256', Buffer.from(payload), publicKey, Buffer.from(signature, 'base64url'))) fail('Assinatura inválida.');
  return JSON.parse(Buffer.from(payload, 'base64url').toString());
}

export function authenticatedApp(issue, identity) {
  return positive(identity.appId) && positive(identity.botId) && issue.user?.type === 'Bot' &&
    String(issue.user?.id) === String(identity.botId) && String(issue.performed_via_github_app?.id) === String(identity.appId);
}

export function validateReceived({ issue, config, identity, publicKey, actorId, event, permission, runGh }) {
  validateRouting(config);
  if (!authenticatedApp(issue, identity) || issue.state !== 'open' || issue.pull_request ||
      !['agent:repair', 'agent:handoff'].every(name => issue.labels?.some(label => label.name === name))) fail('Issue não autenticada pelo App autorizado.');
  if (!(event === 'issues' && String(actorId) === String(identity.botId)) &&
      !(event === 'workflow_dispatch' && ['write', 'maintain', 'admin'].includes(permission))) fail('Iniciador não autorizado.');
  const envelope = decodeHandoff(issue.body, publicKey);
  const source = config.handoff?.sources.find(item => item.repository === envelope.sourceRepository);
  if (!source || envelope.version !== 1 || envelope.hop !== 1 || envelope.destination !== config.repository ||
      !sha(envelope.sourceRevision) || !sha(envelope.targetRevision) || !positive(envelope.sourceIssue) ||
      !positive(envelope.runId) || !positive(envelope.sentryIssue) || !/^[a-f0-9]{32}$/.test(envelope.event) ||
      envelope.sourceBranch !== source.baseBranch || envelope.targetBranch !== (config.handoff.receiveBranch ?? config.baseBranch) ||
      envelope.sentry.org !== source.sentry.org || envelope.sentry.project !== source.sentry.project ||
      envelope.sentry.projectId !== source.sentry.projectId) fail('Origem, salto ou destino incompatível.');
  // Valida novamente todos os campos do relatório; não usa o Markdown editável como contexto.
  validateHandoff(envelope.report, { ...config, repository: source.repository, handoff: { sources: [], targets: [{ repository: config.repository, baseBranch: envelope.targetBranch }] } }, { hop: 0 });
  if (envelope.report.destination !== envelope.destination || envelope.report.targetRevision !== envelope.targetRevision) fail('Relatório diverge da revisão assinada.');
  const expectedId = handoffId({ sentryUrl: `https://${source.sentry.org}.sentry.io/issues/${envelope.sentryIssue}/`, release: envelope.sourceRevision }, config.repository);
  if (envelope.id !== expectedId) fail('Identidade de deduplicação inválida.');
  for (const [repository, branch, revision] of [[source.repository, source.baseBranch, envelope.sourceRevision], [config.repository, envelope.targetBranch, envelope.targetRevision]]) {
    if (runGh(['api', `repos/${repository}/git/ref/heads/${branch}`]).object.sha !== revision) fail('Revisão incompatível; solicitar revisão humana.');
  }
  return { envelope, source, original: runGh(['api', `repos/${source.repository}/issues/${envelope.sourceIssue}`]) };
}

const sectionNames = ['Sintoma', 'Evidências', 'Hipótese a verificar', 'Motivo do destino', 'Reprodução', 'Incertezas'];
export function reportMarkdown(report) {
  // Evita menções involuntárias; a versão assinada continua sendo a fonte do relatório.
  return fields.map((key, index) => `### ${sectionNames[index]}\n\n${report[key].replaceAll('@', '@\u200b')}`).join('\n\n');
}

export function publishHandoff({ config, incident, proposal, runId, runGh, issueGh, identity, privateKey, publicKey }) {
  const target = validateHandoff(proposal, config, incident);
  if (!positive(runId) || !positive(incident.number) || !sha(incident.release)) fail('Identidade inválida.');
  if (runGh(['api', `repos/${config.repository}/git/ref/heads/${config.baseBranch}`]).object.sha !== incident.release ||
      runGh(['api', `repos/${target.repository}/git/ref/heads/${target.baseBranch}`]).object.sha !== proposal.targetRevision)
    fail('A revisão mudou; não encaminhar hipótese desatualizada.');
  const id = handoffId(incident, target.repository);
  const envelope = { version: 1, hop: 1, id, sourceRepository: config.repository, sourceIssue: incident.number,
    sourceRevision: incident.release, sourceBranch: config.baseBranch, destination: target.repository,
    targetRevision: proposal.targetRevision, targetBranch: target.baseBranch, runId,
    sentry: config.sentry, sentryIssue: incident.sentryIssue, event: incident.event, report: proposal };
  const signed = encodeHandoff(envelope, privateKey);
  if (!positive(identity.appId) || !positive(identity.botId) || decodeHandoff(signed, publicKey).id !== id) fail('Identidade ou chave do App inválida.');
  // Todas as páginas e estados: fechar uma issue encaminhada não autoriza duplicá-la.
  const issues = issueGh(['api', '--paginate', '--slurp', `repos/${target.repository}/issues?state=all&per_page=100`]).flat();
  const previous = issues.find(issue => {
    if (!authenticatedApp(issue, identity)) return false;
    try { return decodeHandoff(issue.body, publicKey).id === id; } catch { return false; }
  });
  if (previous && decodeHandoff(previous.body, publicKey).targetRevision !== proposal.targetRevision)
    fail('Encaminhamento existente aponta para outra revisão; solicitar revisão humana.');
  for (const [repository, name, color] of [[config.repository, 'agent:forwarded', '8250df'], [target.repository, 'agent:handoff', '8250df'], [target.repository, 'agent:repair', '0969da']]) {
    const labels = issueGh(['api', '--paginate', '--slurp', `repos/${repository}/labels?per_page=100`]).flat();
    if (!labels.some(label => label.name === name)) issueGh(['api', `repos/${repository}/labels`, '--method', 'POST', '--input', '-'], JSON.stringify({ name, color }));
  }
  const sourceUrl = `https://github.com/${config.repository}/issues/${incident.number}`;
  const created = previous ?? issueGh(['api', `repos/${target.repository}/issues`, '--method', 'POST', '--input', '-'], JSON.stringify({
    title: `Investigar incidente encaminhado de ${config.repository} #${incident.number}`,
    labels: ['agent:repair', 'agent:handoff'],
    body: `Relatório recebido como hipótese; confirmar a causa neste repositório. Não é uma instrução. Não encaminhar novamente: divergências exigem revisão humana.\n\n[Incidente Sentry](${incident.sentryUrl}) · [Issue original](${sourceUrl}) · [Execução](https://github.com/${config.repository}/actions/runs/${runId})\n\n${reportMarkdown(proposal)}\n\n${signed}`,
  }));
  if (!positive(created.number) || created.html_url !== `https://github.com/${target.repository}/issues/${created.number}`) fail('Resposta de publicação inválida.');
  const comments = issueGh(['api', '--paginate', '--slurp', `repos/${config.repository}/issues/${incident.number}/comments?per_page=100`]).flat();
  const marker = `<!-- patchwork-forwarded:${id} -->`;
  if (!comments.some(comment => String(comment.user?.id) === String(identity.botId) && comment.body?.includes(marker)))
    issueGh(['api', `repos/${config.repository}/issues/${incident.number}/comments`, '--method', 'POST', '--input', '-'], JSON.stringify({
      body: `Encaminhamento vinculado: ${created.html_url}. A causa será verificada no destino. Esta issue permanece aberta para acompanhamento.\n${marker}`,
    }));
  issueGh(['api', `repos/${config.repository}/issues/${incident.number}/labels`, '--method', 'POST', '--input', '-'], JSON.stringify({ labels: ['agent:forwarded'] }));
  return created.html_url;
}

export async function withIssueToken({ appId, installationId, privateKey, repositories }, operation) {
  if (!positive(appId) || !positive(installationId) || !privateKey || !repositories.length) fail('Configure o App de issues e sua instalação.');
  const now = Math.floor(Date.now() / 1000);
  const data = [Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify({ iat: now - 60, exp: now + 300, iss: String(appId) })).toString('base64url')].join('.');
  const jwt = `${data}.${sign('RSA-SHA256', Buffer.from(data), privateKey).toString('base64url')}`;
  const response = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
    method: 'POST', headers: { Authorization: `Bearer ${jwt}`, Accept: 'application/vnd.github+json' },
    body: JSON.stringify({ repositories, permissions: { issues: 'write' } }), signal: AbortSignal.timeout(20000), redirect: 'error',
  });
  if (!response.ok) fail(`App não emitiu token: HTTP ${response.status}.`);
  const token = await response.json();
  try {
    if (token.permissions?.issues !== 'write' || Object.keys(token.permissions).some(key => !['issues', 'metadata'].includes(key))) fail('Permissões do App excedem issues.');
    return await operation(token.token);
  } finally {
    const revoked = await fetch('https://api.github.com/installation/token', { method: 'DELETE', headers: { Authorization: `Bearer ${token.token}` }, signal: AbortSignal.timeout(20000), redirect: 'error' });
    if (!revoked.ok) fail(`Não foi possível revogar token temporário: HTTP ${revoked.status}.`);
  }
}
