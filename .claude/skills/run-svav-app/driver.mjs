#!/usr/bin/env node
/**
 * driver.mjs — launch & drive the Sans Vis-à-Vis app (Next.js 16 + Postgres/PostGIS + MinIO).
 *
 * Run from the app root (the dir with package.json). Loads .env + .env.local itself.
 *
 *   node .claude/skills/run-svav-app/driver.mjs preflight   # PG + MinIO + env + tools reachable
 *   node .claude/skills/run-svav-app/driver.mjs up          # launch `next dev` on :3020, wait for 200
 *   node .claude/skills/run-svav-app/driver.mjs smoke       # POST /api/certificat (idempotent → deja:true, NO email)
 *   node .claude/skills/run-svav-app/driver.mjs render      # direct-invoke prod pipeline → PDF + PNG screenshot on disk
 *   node .claude/skills/run-svav-app/driver.mjs down         # kill the launched dev server
 *   node .claude/skills/run-svav-app/driver.mjs all          # preflight → up → smoke → render → down
 *
 * `smoke` is SIDE-EFFECT-FREE: it re-emits an already-emitted projet, which returns `existant` BEFORE the
 * best-effort publish chain (certificatEmission.ts:141) → no new rows, no carte/PDF regen, NO e-mail sent.
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 3020;                       // port the driver launches on IF no dev server is already running
const CANDIDATE_PORTS = [3020, 3000, 3001, 3010]; // reuse an already-running dev server if found here
const PIDFILE = '/tmp/svav-driver-next.pid';
const BASEFILE = '/tmp/svav-driver-base'; // base URL chosen by `up`, read by smoke/render
const LOGFILE = '/tmp/svav-driver-next.log';
const SHOT = '/tmp/svav-cert';           // pdftoppm appends -1.png
const SKILL = '.claude/skills/run-svav-app';

// Health signal that AVOIDS the slow first compile of page.tsx: POST /api/certificat with a junk body.
// A live dev server answers 401 (jeton invalide) — the API route compiles fast and proves the runtime serves.
async function apiAlive(base) {
  return fetch(`${base}/api/certificat`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    signal: AbortSignal.timeout(60000),
  }).then((r) => r.status === 401).catch(() => false);
}
function baseUrl() {
  if (existsSync(BASEFILE)) return readFileSync(BASEFILE, 'utf8').trim();
  return `http://localhost:${PORT}`;
}

// ── env: parse .env then .env.local (local overrides), load into process.env ──
function loadEnv() {
  for (const f of ['.env', '.env.local']) {
    if (!existsSync(f)) continue;
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      let v = m[2].replace(/^["']|["']$/g, '');
      if (process.env[m[1]] === undefined || f === '.env.local') process.env[m[1]] = v;
    }
  }
}
const need = (k) => { if (!process.env[k]) { console.error(`✗ env manquant: ${k}`); process.exit(1); } return process.env[k]; };

async function preflight() {
  loadEnv();
  // required env
  ['DATABASE_URL', 'S3_ENDPOINT', 'S3_BUCKET', 'SITE_URL', 'INTERNAUTE_TOKEN_SECRET'].forEach(need);
  console.log('✓ env: DATABASE_URL, S3_*, SITE_URL, INTERNAUTE_TOKEN_SECRET présents');
  // tools
  for (const [bin, args] of [['node_modules/.bin/tsx', ['--version']], ['pdftoppm', ['-v']]]) {
    const r = spawnSync(bin, args, { encoding: 'utf8' });
    if (r.error) { console.error(`✗ outil absent: ${bin}`); process.exit(1); }
  }
  console.log('✓ outils: tsx, pdftoppm');
  // Postgres
  const { Client } = await import('pg');
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  try { await c.connect(); const r = await c.query('SELECT count(*) FROM internaute'); await c.end();
    console.log(`✓ Postgres joignable (${r.rows[0].count} internautes)`); }
  catch (e) { console.error('✗ Postgres injoignable:', e.message); process.exit(1); }
  // MinIO
  const code = await fetch(`${process.env.S3_ENDPOINT}/minio/health/live`, { signal: AbortSignal.timeout(3000) })
    .then((r) => r.status).catch(() => 0);
  if (code !== 200) { console.error(`✗ MinIO injoignable (${process.env.S3_ENDPOINT}) — lance-le, cf. SKILL.md`); process.exit(1); }
  console.log(`✓ MinIO joignable (${process.env.S3_ENDPOINT})`);
}

async function up() {
  loadEnv();
  // 1) REUSE: Next 16 dev enforces ONE dev server per project — never launch a second. Probe candidates.
  for (const p of CANDIDATE_PORTS) {
    const base = `http://localhost:${p}`;
    if (await apiAlive(base)) { writeFileSync(BASEFILE, base); console.log(`✓ dev déjà en service, réutilisé: ${base}`); return; }
  }
  // 2) LAUNCH: none found → start our own on :3020 (detached), wait for the API route to serve.
  const fd = (await import('node:fs')).openSync(LOGFILE, 'w');
  const child = spawn('node_modules/.bin/next', ['dev', '-p', String(PORT)], {
    env: { ...process.env, NEXT_TURBO: '0' }, stdio: ['ignore', fd, fd], detached: true,
  });
  child.unref();
  writeFileSync(PIDFILE, String(child.pid));
  const base = `http://localhost:${PORT}`;
  console.log(`· next dev lancé (pid ${child.pid}, :${PORT}), attente de l’API…`);
  const t0 = Date.now();
  while (Date.now() - t0 < 90000) {
    if (await apiAlive(base)) { writeFileSync(BASEFILE, base); console.log(`✓ app UP (lancée par le driver): ${base}`); return; }
    // hard-stop if Next refused (single-instance lock) so we don't wait 90 s for nothing
    if (existsSync(LOGFILE) && /Another .*next dev server is already running/.test(readFileSync(LOGFILE, 'utf8'))) {
      console.error('✗ Next refuse un 2e dev server (verrou mono-instance). Arrête l’autre, ou lance `up` sans en avoir un.');
      process.exit(1);
    }
    await sleep(1500);
  }
  console.error(`✗ pas de réponse API sur ${base} après 90 s — voir ${LOGFILE}`); process.exit(1);
}

function down() {
  if (!existsSync(PIDFILE)) { console.log('· aucun dev lancé par le driver'); return; }
  const pid = Number(readFileSync(PIDFILE, 'utf8').trim());
  try { process.kill(-pid, 'SIGTERM'); } catch {}
  try { process.kill(pid, 'SIGTERM'); } catch {}
  spawnSync('rm', ['-f', PIDFILE, BASEFILE]);
  console.log(`✓ dev arrêté (pid ${pid})`);
}

// Forge an emit jeton (same as jetonRectification.signerJetonEmission: HS256, scope emit-certificate, sub=projetId).
async function forgeEmitJeton(projetId) {
  const { SignJWT } = await import('jose');
  return new SignJWT({ scope: 'emit-certificate' })
    .setProtectedHeader({ alg: 'HS256' }).setSubject(String(projetId))
    .setIssuedAt().setExpirationTime('30m')
    .sign(new TextEncoder().encode(need('INTERNAUTE_TOKEN_SECRET')));
}

async function pickEmittedProjet() {
  const { Client } = await import('pg');
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const r = await c.query('SELECT projet_id, numero FROM certificat ORDER BY id DESC LIMIT 1');
  await c.end();
  if (!r.rows[0]) { console.error('✗ aucun certificat en base — émets-en un via le tunnel d’abord'); process.exit(1); }
  return { projetId: Number(r.rows[0].projet_id), numero: r.rows[0].numero };
}

async function smoke() {
  loadEnv();
  const { projetId, numero } = await pickEmittedProjet();
  const jeton = await forgeEmitJeton(projetId);
  const base = baseUrl();
  const res = await fetch(`${base}/api/certificat`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jeton, projetId }),
  });
  const body = await res.json();
  console.log(`· POST /api/certificat (projet ${projetId}, ${numero}) → HTTP ${res.status}`);
  console.log('·', JSON.stringify(body));
  if (res.status !== 200 || body.deja !== true) {
    console.error('✗ smoke inattendu (on attendait 200 + deja:true, idempotent sans effet de bord)'); process.exit(1);
  }
  console.log('✓ smoke OK: chaîne runtime + jeton d’émission + ownership + DB (aucun e-mail, aucune nouvelle ligne)');
}

async function render() {
  loadEnv();
  const { numero } = await pickEmittedProjet();
  console.log(`· direct-invoke pipeline carte+PDF pour ${numero} (tiles IGN réelles, ~qq s)…`);
  const r = spawnSync('node_modules/.bin/tsx', [`${SKILL}/render-cert.ts`, numero, `${SHOT}.pdf`],
    { stdio: 'inherit', env: process.env });
  if (r.status !== 0) { console.error('✗ render a échoué'); process.exit(1); }
  const rr = spawnSync('pdftoppm', ['-png', '-r', '130', '-f', '1', '-l', '1', `${SHOT}.pdf`, SHOT],
    { encoding: 'utf8' });
  if (rr.status !== 0) { console.error('✗ pdftoppm a échoué:', rr.stderr); process.exit(1); }
  console.log(`✓ screenshot: ${SHOT}-1.png  (rendu réel du certificat produit par les modules de prod)`);
}

const cmd = process.argv[2] ?? 'all';
try {
  if (cmd === 'preflight') await preflight();
  else if (cmd === 'up') await up();
  else if (cmd === 'down') down();
  else if (cmd === 'smoke') await smoke();
  else if (cmd === 'render') await render();
  else if (cmd === 'all') { await preflight(); await up(); await smoke(); await render(); down(); console.log('\n✓ ALL OK'); }
  else { console.error(`commande inconnue: ${cmd} — preflight|up|smoke|render|down|all`); process.exit(1); }
} catch (e) { console.error('DRIVER ERROR', e?.stack ?? e); process.exit(1); }
