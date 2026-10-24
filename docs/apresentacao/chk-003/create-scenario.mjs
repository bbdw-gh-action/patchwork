// Material do operador; nunca copiado para o contexto do agente.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = resolve(fileURLToPath(new URL('../../../', import.meta.url)), '../bbdw-storefront');
const git = (args, options = {}) => execFileSync('git', args, { cwd: app, encoding: 'utf8', ...options }).trim();
for (const branch of ['demo/chk-003-base', 'demo/chk-003']) {
  if (git(['branch', '--list', branch])) throw new Error(`Branch ${branch} já existe; não sobrescrever.`);
}
const directory = mkdtempSync(resolve(tmpdir(), 'chk003-index-'));
const env = { ...process.env, GIT_INDEX_FILE: resolve(directory, 'index'), GIT_AUTHOR_NAME: 'Demo preparation', GIT_AUTHOR_EMAIL: 'demo@example.invalid', GIT_COMMITTER_NAME: 'Demo preparation', GIT_COMMITTER_EMAIL: 'demo@example.invalid' };
const isolated = (args, options = {}) => git(args, { env, ...options });
try {
  isolated(['read-tree', 'HEAD']);
  isolated(['add', '--update']);
  isolated(['add', '--', 'tests/idempotency.spec.ts', 'tests/pending-submission.spec.ts']);
  const healthy = isolated(['commit-tree', isolated(['write-tree']), '-p', git(['rev-parse', 'HEAD']), '-m', 'feat: identifica intencao de compra e preserva exclusao mutua']);
  const appSource = isolated(['show', `${healthy}:src/App.tsx`]);
  const panelSource = isolated(['show', `${healthy}:src/CheckoutPanel.tsx`]);
  function replace(source, before, after) {
    if (source.split(before).length !== 2) throw new Error(`Trecho esperado mudou: ${before}`);
    return source.replace(before, after);
  }
  const defective = replace(replace(appSource, 'if (inFlight.current || order || items.length === 0) return;', 'if (order || items.length === 0) return;'), '    inFlight.current = true;\n', '');
  const panel = replace(panelSource, 'disabled={pending || items.length === 0}', 'disabled={items.length === 0}');
  for (const [path, content] of [['src/App.tsx', defective], ['src/CheckoutPanel.tsx', panel]]) {
    const blob = isolated(['hash-object', '-w', '--stdin'], { input: content + '\n' });
    isolated(['update-index', '--cacheinfo', `100644,${blob},${path}`]);
  }
  const broken = isolated(['commit-tree', isolated(['write-tree']), '-p', healthy, '-m', 'demo: reproduz submissao concorrente no checkout']);
  git(['update-ref', '--stdin'], { input: `start\ncreate refs/heads/demo/chk-003-base ${healthy}\ncreate refs/heads/demo/chk-003 ${broken}\nprepare\ncommit\n` });
  console.log(JSON.stringify({ healthy, broken, unchangedWorkingTree: true }, null, 2));
} finally { rmSync(directory, { recursive: true, force: true }); }
