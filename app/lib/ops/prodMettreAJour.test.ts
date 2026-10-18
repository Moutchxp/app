import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * scripts/prod-mettre-a-jour.sh — DÉFAUT DU 16/10/2026 : pendant un --essai, la connexion ssh s'est coupée à l'étape 7
 * (« client_loop: send disconnect: Broken pipe ») et le script a affiché « Terminé : réussi (--essai). ».
 * Désormais la conclusion ne vient que de la LIGNE FINALE du serveur ; une coupure → reconnexion et reprise du journal ;
 * pas de ligne finale → « RÉSULTAT INCONNU », code 3. Le VRAI script est lancé avec /bin/bash (3.2 sur macOS) ; ssh est
 * remplacé par un faux serveur (SVAV_SSH) : rien ne sort de la machine.
 */
const SCRIPT = path.join(process.cwd(), 'scripts/prod-mettre-a-jour.sh');
const ID = '20261016-112600_4c8cd637';
const FINALES = {
  reussi: "[11:28:31] ═══ ESSAI RÉUSSI — rien n'a changé en service (sauvegarde et version préparée gardées) ═══ (93 s)",
  echec: '[11:28:31] ═══ ÉCHEC À LA MIGRATION 363_admin_invitation.sql — pas de bascule, version en service inchangée ═══ (40 s)',
  refus: "[11:28:31] ═══ REFUSÉ (rien n'a été modifié en service) ═══ (5 s)",
  // Le libellé du 18/10/2026 à 15:20 (avant correction du serveur), puis le libellé actuel : les deux concluent « déjà en service ».
  dejaAncien: '[15:20:04] ═══ DÉJÀ EN SERVICE ═══ (0 s)',
  deja: '[15:20:04] ═══ DÉJÀ EN SERVICE — rien à faire ═══ (0 s)',
};
const ETAPES = Array.from({ length: 9 }, (_, i) => `[11:27:${String(10 + i).padStart(2, '0')}] == étape ${i + 1} ==`);

// Le faux ssh : lit le n° de ligne de reprise dans le script envoyé (`tail -n +N`), et rejoue le journal selon le scénario.
const FAUX_SSH = `#!/bin/bash
D="$FAUX_DIR"
derniere="\${@: -1}"
case "$derniere" in
  *"ls -1t"*) echo "${ID}"; exit 0 ;;
  *"bash -s"*) ;;
  *) echo "commande inattendue : $derniere" >&2; exit 99 ;;
esac
depuis=$(cat | sed -n 's/.*tail -n +\\([0-9]*\\) -F.*/\\1/p')
n=$(( $(cat "$D/appels" 2>/dev/null || echo 0) + 1 )); echo $n > "$D/appels"
echo "$depuis" >> "$D/reprises"
total=$(wc -l < "$D/journal" | tr -d ' ')
case "$FAUX_SCENARIO:$n" in
  coupure-reprise:1|coupure-definitive:*)
    coupe=$(cat "$D/coupe"); [ "$depuis" -le "$coupe" ] && sed -n "\${depuis},\${coupe}p" "$D/journal"
    printf '[11:27:17] == étape 7 : golden en co'   # ligne coupée en plein milieu
    echo "Read from remote host 51.68.31.209: Can't assign requested address" >&2
    echo "client_loop: send disconnect: Broken pipe" >&2; exit 255 ;;
  *) sed -n "\${depuis},\${total}p" "$D/journal"; exit 0 ;;
esac
`;

let dir: string;
function lancer(scenario: string, journal: string[], coupe = 6) {
  writeFileSync(path.join(dir, 'journal'), journal.join('\n') + '\n');
  writeFileSync(path.join(dir, 'coupe'), String(coupe));
  const r = spawnSync('/bin/bash', [SCRIPT, '--suivre'], {
    encoding: 'utf8', timeout: 20_000,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: dir, FAUX_DIR: dir, FAUX_SCENARIO: scenario,
      SVAV_SSH: path.join(dir, 'ssh'), SVAV_MAJ_PAUSE: '0', SVAV_MAJ_ESSAIS: '3' } as unknown as NodeJS.ProcessEnv,
  });
  const lire = (f: string) => { try { return readFileSync(path.join(dir, f), 'utf8').trim().split('\n'); } catch { return []; } };
  return { code: r.status, sortie: r.stdout + r.stderr, appels: Number(lire('appels')[0] ?? 0), reprises: lire('reprises').map(Number) };
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'svav-maj-test-'));
  writeFileSync(path.join(dir, 'ssh'), FAUX_SSH); chmodSync(path.join(dir, 'ssh'), 0o755);
});
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe('prod-mettre-a-jour.sh — la conclusion ne vient que de la ligne finale du serveur', () => {
  it('succès normal : ligne « ESSAI RÉUSSI » reçue → « Terminé : réussi », code 0, une seule connexion', () => {
    const r = lancer('normal', [...ETAPES, FINALES.reussi]);
    expect(r.code).toBe(0);
    expect(r.sortie).toContain('ESSAI RÉUSSI');
    expect(r.sortie).toContain('Terminé : réussi (suivi) — ligne finale du serveur reçue.');
    expect(r.appels).toBe(1);
  });

  it('coupure pendant l’étape 7 puis reconnexion : reprise du journal là où il s’était arrêté, puis « réussi »', () => {
    const r = lancer('coupure-reprise', [...ETAPES, FINALES.reussi], 6);
    expect(r.sortie).toContain('connexion perdue (ssh, code 255)');
    expect(r.reprises).toEqual([1, 7]); // la 2e lecture reprend APRÈS les 6 lignes complètes déjà reçues
    expect(r.sortie.match(/== étape 6 ==/g)).toHaveLength(1); // aucune ligne en double
    expect(r.sortie).toContain('ESSAI RÉUSSI');
    expect(r.code).toBe(0);
  });

  it('coupure DÉFINITIVE (le cas du 16/10) → « RÉSULTAT INCONNU — connexion perdue », commande de lecture, code 3, JAMAIS « réussi »', () => {
    const r = lancer('coupure-definitive', [...ETAPES, FINALES.reussi], 6);
    expect(r.code).toBe(3);
    expect(r.sortie).toContain('RÉSULTAT INCONNU — connexion perdue');
    expect(r.sortie).toContain(`tail -n 40 /home/ubuntu/sansvisavis/maj/${ID}.log`);
    expect(r.sortie).toContain('npm run prod:mettre-a-jour -- --suivre');
    expect(r.sortie).not.toMatch(/Terminé : réussi/);
    expect(r.appels).toBe(4); // 1 lecture + 3 reconnexions (SVAV_MAJ_ESSAIS), puis abandon
  });

  it('sortie SANS ligne finale mais ssh terminé NORMALEMENT → « SANS CONCLUSION », code 4 — pas « connexion perdue », jamais « réussi »', () => {
    // Arno (18/10/2026) : « RÉSULTAT INCONNU » est réservé aux vraies pertes de connexion.
    const r = lancer('normal', ETAPES);
    expect(r.code).toBe(4);
    expect(r.sortie).toContain('Terminé : SANS CONCLUSION');
    expect(r.sortie).toContain(`tail -n 40 /home/ubuntu/sansvisavis/maj/${ID}.log`);
    expect(r.sortie).not.toContain('RÉSULTAT INCONNU');
    expect(r.sortie).not.toMatch(/Terminé : réussi/);
    expect(r.appels).toBe(1);
  });

  it('une ligne ressemblante au milieu du journal ne vaut pas conclusion (format exact exigé)', () => {
    const r = lancer('normal', [...ETAPES, 'echo ═══ ESSAI RÉUSSI ═══ (copié dans un message)']);
    expect(r.code).toBe(4);
    expect(r.sortie).not.toMatch(/Terminé : réussi/);
  });

  it('DÉJÀ EN SERVICE (le cas du 18/10, 15:20) → « Terminé : déjà en service — rien à faire », code 0, sans « RÉSULTAT INCONNU »', () => {
    for (const [i, finale] of [FINALES.dejaAncien, FINALES.deja].entries()) {
      const r = lancer('normal', ['[15:20:02] ▶ 0. Préconditions', '  OK   ce commit est DÉJÀ en service — rien à faire', finale]);
      expect(r.code).toBe(0);
      expect(r.sortie).toContain('Terminé : déjà en service — rien à faire');
      expect(r.sortie).not.toContain('RÉSULTAT INCONNU');
      expect(r.sortie).not.toContain('connexion perdue');
      expect(r.appels).toBe(i + 1); // une seule connexion par passage (le compteur du faux ssh se cumule)
    }
  });

  it('une ligne finale au libellé inconnu de ce script : dite telle quelle, code 1, jamais « réussi » ni « connexion perdue »', () => {
    const r = lancer('normal', [...ETAPES, '[11:28:31] ═══ RÉSULTAT NOUVEAU ═══ (3 s)']);
    expect(r.code).toBe(1);
    expect(r.sortie).toContain('libellé inconnu de ce script : [11:28:31] ═══ RÉSULTAT NOUVEAU ═══ (3 s)');
    expect(r.sortie).not.toContain('RÉSULTAT INCONNU');
    expect(r.sortie).not.toMatch(/Terminé : réussi/);
  });

  it('ligne finale d’ÉCHEC → « Terminé : ÉCHEC », code 1 ; ligne de REFUS → code 2', () => {
    const e = lancer('normal', [...ETAPES, FINALES.echec]);
    expect(e.code).toBe(1);
    expect(e.sortie).toContain('Terminé : ÉCHEC');
    const f = lancer('normal', [...ETAPES, FINALES.refus]);
    expect(f.code).toBe(2);
    expect(f.sortie).toContain('Terminé : REFUSÉ');
  });

  it('le chemin --essai / --appliquer conclut par la même règle (aucun « réussi » sur le seul fichier de code)', () => {
    const src = readFileSync(SCRIPT, 'utf8');
    expect(src).toContain('suivre "$ID"; code=$?\nconclure $code "$MODE"; exit $?');
    expect(src).not.toMatch(/cat \$MAJ\/\$id\.code 2>\/dev\/null" < \/dev\/null\)/); // l'ancienne conclusion par le seul fichier .code
  });
});
