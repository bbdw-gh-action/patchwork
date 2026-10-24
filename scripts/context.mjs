import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadConfig } from './engine.mjs';

export const sentryTools = ['get_sentry_resource', 'search_issues', 'search_events'];
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function verifyTree(path) {
  if (lstatSync(path).isSymbolicLink()) throw new Error('Skills não podem conter links simbólicos.');
  if (lstatSync(path).isDirectory()) for (const child of readdirSync(path)) verifyTree(resolve(path, child));
}

// Revisões antigas podem conter material editorial removido da branch confiável.
// Só a cópia descartável é alterada; fontes, fixtures e testes da aplicação ficam intactos.
export function prepareDocumentation(automation, app) {
  const trustedRoot = realpathSync(automation);
  const appRoot = realpathSync(app);
  function checked(root, relative) {
    const target = resolve(root, relative);
    if (!target.startsWith(root + sep)) throw new Error('Documentação fora do checkout.');
    let current = root;
    for (const part of relative.split('/')) {
      current = resolve(current, part);
      if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw new Error('Documentação contém symlink.');
    }
    return target;
  }
  const docs = checked(trustedRoot, 'docs');
  verifyTree(docs);
  if (!existsSync(resolve(docs, 'SPEC.md'))) throw new Error('Especificação técnica confiável ausente.');
  for (const name of ['FALHAS.md', 'SOLUCOES.md', 'AVALIACAO.md', 'DEMO.md', 'VERIFICACAO.md', 'ROTEIRO.md']) {
    if (existsSync(resolve(docs, name))) throw new Error('Atualize a documentação confiável antes de iniciar o agente.');
  }
  const destination = checked(appRoot, 'docs');
  if (existsSync(destination)) {
    verifyTree(destination);
    rmSync(destination, { recursive: true });
  }
  cpSync(docs, destination, { recursive: true });
  for (const relative of ['README.md', '.github/pull_request_template.md']) {
    const source = checked(trustedRoot, relative);
    const target = checked(appRoot, relative);
    if (existsSync(source)) {
      verifyTree(source);
      mkdirSync(dirname(target), { recursive: true });
      cpSync(source, target);
    } else if (existsSync(target)) rmSync(target);
  }
  const legacy = ['agent-workflow.mjs', 'agent-workflow.test.mjs', 'incident.mjs', 'incident.test.mjs',
    'native-sentry.mjs', 'native-sentry.test.mjs', 'publish.test.mjs', 'sentry-to-issue.mjs', 'upload-sourcemaps.mjs'];
  for (const relative of ['specs/scenarios.json', ...legacy.map(name => `scripts/${name}`)]) {
    // Não remover arquivos de consumidores que ainda os utilizam.
    if (existsSync(checked(trustedRoot, relative))) throw new Error('Material legado ainda presente na revisão confiável.');
    const target = checked(appRoot, relative);
    if (existsSync(target)) rmSync(target);
  }
  const manifest = checked(appRoot, 'package.json');
  if (existsSync(manifest)) {
    const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
    // Limpar comandos removidos de revisões antigas sem mudar as dependências do build.
    if (['bbdw-checkout', 'bbdw-users', 'bbdw-storefront'].includes(pkg.name) && pkg.scripts) {
      if (pkg.name === 'bbdw-checkout' && pkg.scripts.test) pkg.scripts.test = pkg.scripts.test.replace(/ scripts\/\*\.test\.mjs/g, '');
      for (const name of ['sentry:bridge', 'sentry:publish', 'sentry:upload']) delete pkg.scripts[name];
      writeFileSync(manifest, JSON.stringify(pkg, null, 2) + '\n');
    }
  }
}

export function prepareContext({ config, automation = 'automation', app = 'app', home, mcpRoot = packageRoot, incident }) {
  const trustedSkills = resolve(automation, '.agents/skills');
  verifyTree(trustedSkills);
  if (!existsSync(resolve(trustedSkills, 'service-regression/SKILL.md'))) throw new Error('Skill service-regression ausente.');
  const appRoot = realpathSync(app);
  prepareDocumentation(automation, appRoot);
  const agents = resolve(appRoot, '.agents');
  if (existsSync(agents) && lstatSync(agents).isSymbolicLink()) throw new Error('.agents fora do checkout.');
  mkdirSync(agents, { recursive: true });
  const destination = resolve(agents, 'skills');
  // A única remoção é a pasta de skills da cópia descartável da aplicação.
  if (!destination.startsWith(appRoot + sep)) throw new Error('Destino fora do app.');
  if (existsSync(destination)) {
    if (lstatSync(destination).isSymbolicLink()) throw new Error('Destino de skills é symlink.');
    rmSync(destination, { recursive: true });
  }
  cpSync(trustedSkills, destination, { recursive: true });
  cpSync(resolve(packageRoot, 'skills/patchwork-investigation'), resolve(destination, 'patchwork-investigation'), { recursive: true });
  if (config.handoff) cpSync(resolve(packageRoot, 'skills/patchwork-handoff'), resolve(destination, 'patchwork-handoff'), { recursive: true });
  cpSync(resolve(automation, 'AGENTS.md'), resolve(appRoot, 'AGENTS.md'));
  const githubDir = resolve(appRoot, '.github');
  if (existsSync(githubDir) && lstatSync(githubDir).isSymbolicLink()) throw new Error('.github fora do checkout.');
  mkdirSync(githubDir, { recursive: true });
  const configFile = resolve(githubDir, 'patchwork.json');
  if (existsSync(configFile) && lstatSync(configFile).isSymbolicLink()) throw new Error('Configuração da aplicação é symlink.');
  writeFileSync(configFile, JSON.stringify(config, null, 2));
  const names = readdirSync(destination).filter(name => existsSync(resolve(destination, name, 'SKILL.md')));
  mkdirSync(home, { recursive: true });
  const server = resolve(mcpRoot, 'node_modules/@sentry/mcp-server/dist/index.js');
  if (!existsSync(server)) throw new Error('Instale as dependências do Patchwork antes de configurar o MCP.');
  // Persistir apenas referências. O executor injeta o secret diretamente no MCP.
  const sentry = incident?.sourceSentry ?? config.sentry;
  const context = {
    app: appRoot,
    skillDirectories: [destination],
    mcp: { command: process.execPath, args: [server, '--organization-slug', sentry.org, '--project-slug', sentry.project, '--skills=inspect', '--sentry-dsn='], tools: sentryTools, timeout: 60000 },
  };
  writeFileSync(resolve(home, 'context.json'), JSON.stringify(context, null, 2));
  return { skills: names, server: 'sentry', project: sentry.project, tools: sentryTools };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const config = loadConfig(process.env.PATCHWORK_CONFIG ?? '.github/patchwork.json');
  const incident = JSON.parse(readFileSync(resolve(process.env.RUNNER_TEMP, 'incident.json'), 'utf8'));
  const result = prepareContext({ config, incident, home: resolve(process.env.RUNNER_TEMP, 'patchwork-copilot') });
  writeFileSync(resolve(process.env.RUNNER_TEMP, 'agent-context.json'), JSON.stringify(result, null, 2));
  console.log(`Skills disponíveis: ${result.skills.join(', ')}. MCP sentry restrito a ${result.project}.`);
}
