import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * deploy/maj/serveur.sh — DÉFAUT DU 18/10/2026 (15:20) : après une mise à jour réussie de 17561a40, relancer le même
 * commit affichait côté Mac « ⛔ RÉSULTAT INCONNU — connexion perdue ». Règle (Arno) : TOUTE fin du script serveur écrit
 * une ligne finale explicite au format exact que le Mac lit (`[hh:mm:ss] ═══ … ═══ (N s)`) — succès, refus ou échec —
 * pour que « RÉSULTAT INCONNU » reste réservé aux vraies pertes de connexion.
 *
 * Le VRAI script, lancé par /bin/bash (3.2 sur macOS), sur une racine FACTICE (SVAV_MAJ_BASE_ESSAI) ; `flock`, `id` et
 * `systemctl` sont de fausses commandes posées en tête du PATH. Rien ne sort de la machine, rien ne touche la prod.
 */
const SERVEUR = path.join(process.cwd(), 'deploy/maj/serveur.sh');
const CLIENT = path.join(process.cwd(), 'scripts/prod-mettre-a-jour.sh');
const SHA = '17561a40'.padEnd(40, '0');
const AUTRE = 'ab'.repeat(20);
/** Le format EXACT que le Mac reconnaît comme ligne finale (celui de `suivre` dans prod-mettre-a-jour.sh). */
const FINALE = /^\[[0-9:]+\] ═══ .+ ═══ \([0-9]+ s\)$/m;

let dir: string;
let base: string;
let journal: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'svav-maj-serveur-'));
  base = path.join(dir, 'base');
  for (const d of ['maj', 'releases', 'bin', `releases/${SHA}`, `releases/${AUTRE}`]) mkdirSync(path.join(base, d), { recursive: true });
  journal = path.join(base, 'maj', '20261018-152000_17561a40.log');
  const faux = (nom: string, corps: string) => { writeFileSync(path.join(base, 'bin', nom), `#!/bin/bash\n${corps}\n`); chmodSync(path.join(base, 'bin', nom), 0o755); };
  faux('flock', 'exit 0');
  faux('id', '[ "$1" = "-u" ] && { echo 0; exit 0; }; exec /usr/bin/id "$@"');
  // `systemctl is-active svav-sauvegarde.service` : selon le scénario ; « tuer » simule un arrêt de l'unité en pleine route.
  faux('systemctl', `case "$FAUX_SAUVEGARDE" in
  active) echo active ;;
  tuer) # le script serveur et le sous-shell \$(…) qui nous a lancés portent la même ligne de commande : on remonte les
        # parents (lus AVANT le signal) et on signale chacun d'eux — jamais un autre processus.
    p=$PPID
    for i in 1 2 3; do
      c=$(ps -o command= -p "$p" 2>/dev/null); q=$(ps -o ppid= -p "$p" 2>/dev/null | tr -d ' ')
      case "$c" in *serveur.sh*"$FAUX_JOURNAL"*) kill -TERM "$p" ;; esac
      [ -n "$q" ] || break; p=$q
    done
    sleep 1; echo inactive ;;
  *) echo inactive ;;
esac`);
});
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

function serveur(args: string[], o: { enService?: string; sauvegarde?: string } = {}) {
  if (o.enService !== undefined) symlinkSync(path.join(base, 'releases', o.enService), path.join(base, 'current'));
  const r = spawnSync('/bin/bash', [SERVEUR, ...args], {
    encoding: 'utf8', timeout: 20_000,
    env: { PATH: `${path.join(base, 'bin')}:/usr/bin:/bin:/usr/sbin:/sbin`, HOME: dir, SVAV_MAJ_BASE_ESSAI: base,
      FAUX_SAUVEGARDE: o.sauvegarde ?? 'inactive', FAUX_JOURNAL: journal } as unknown as NodeJS.ProcessEnv,
  });
  const lu = (() => { try { return readFileSync(journal, 'utf8'); } catch { return ''; } })();
  const finales = lu.split('\n').filter((l) => FINALE.test(l));
  // Sur le Mac, `chown ubuntu` échoue après la ligne finale (pas d'utilisateur ubuntu) : on compare la DERNIÈRE ligne finale.
  return { code: r.status, journal: lu, finales, derniere: finales.at(-1) ?? '' };
}

/** Le Mac lit ce journal (faux ssh qui le rejoue, comme prodMettreAJour.test.ts) : ce qu'il conclut. */
function conclusionDuMac(lu: string) {
  writeFileSync(path.join(dir, 'journal-lu'), lu);
  writeFileSync(path.join(dir, 'ssh'), `#!/bin/bash
case "\${@: -1}" in
  *"ls -1t"*) echo "20261018-152000_17561a40"; exit 0 ;;
  *"bash -s"*) cat > /dev/null; cat "${path.join(dir, 'journal-lu')}"; exit 0 ;;
esac
exit 99
`);
  chmodSync(path.join(dir, 'ssh'), 0o755);
  const r = spawnSync('/bin/bash', [CLIENT, '--suivre'], {
    encoding: 'utf8', timeout: 20_000,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: dir, SVAV_SSH: path.join(dir, 'ssh'), SVAV_MAJ_PAUSE: '0', SVAV_MAJ_ESSAIS: '1' } as unknown as NodeJS.ProcessEnv,
  });
  return { code: r.status, sortie: r.stdout + r.stderr };
}

// Délai de 30 s pour ce fichier seul (défaut vitest : 5 s) : chaque test lance de VRAIS scripts bash (1,7 s pour le plus long, seul) et
// dépassait 5 s sous la charge de la suite complète. Ce qui est vérifié ne change pas (cf. docs/FLAKES_CONNUS.md).
describe('serveur.sh — chaque fin écrit une ligne finale explicite', { timeout: 30_000 }, () => {
  it('commit DÉJÀ en service : ligne finale de SUCCÈS, code 0 ; le Mac affiche « Terminé : déjà en service — rien à faire »', () => {
    const s = serveur(['--essai', SHA, `--journal=${journal}`], { enService: SHA });
    expect(s.code).toBe(0);
    expect(s.journal).toContain('ce commit est DÉJÀ en service — rien à faire');
    expect(s.finales).toHaveLength(1);
    expect(s.derniere).toMatch(/^\[[0-9:]+\] ═══ DÉJÀ EN SERVICE — rien à faire ═══ \(\d+ s\)$/);
    expect(readFileSync(path.join(base, 'maj', '20261018-152000_17561a40.code'), 'utf8').trim()).toBe('0');
    const mac = conclusionDuMac(s.journal);
    expect(mac.code).toBe(0);
    expect(mac.sortie).toContain('Terminé : déjà en service — rien à faire');
    expect(mac.sortie).not.toContain('RÉSULTAT INCONNU');
  });

  it('précondition non remplie (sauvegarde nocturne en cours) : ligne finale « REFUSÉ », code 2 ; le Mac dit REFUSÉ', () => {
    const s = serveur(['--essai', SHA, `--journal=${journal}`], { enService: AUTRE, sauvegarde: 'active' });
    expect(s.code).toBe(2);
    expect(s.journal).toContain('sauvegarde nocturne en cours : réessayer après sa fin');
    expect(s.finales).toEqual([expect.stringMatching(/═══ REFUSÉ \(rien n'a été modifié en service\) ═══/)]);
    const mac = conclusionDuMac(s.journal);
    expect(mac.code).toBe(2);
    expect(mac.sortie).toContain('Terminé : REFUSÉ');
    expect(mac.sortie).not.toContain('RÉSULTAT INCONNU');
  });

  it('`current` n’est pas un lien : ligne finale « REFUSÉ », code 2', () => {
    const s = serveur(['--essai', SHA, `--journal=${journal}`]);
    expect(s.code).toBe(2);
    expect(s.journal).toContain("n'est pas un lien");
    expect(s.finales).toHaveLength(1);
    expect(s.derniere).toMatch(/═══ REFUSÉ/);
  });

  it('appel invalide (option inconnue, mode ou commit invalide) : écrit DANS le journal avec la ligne finale « REFUSÉ », code 2', () => {
    for (const args of [['--essai', SHA, `--journal=${journal}`, '--inconnue'], ['--tout', SHA, `--journal=${journal}`], ['--essai', 'pas-un-sha', `--journal=${journal}`]]) {
      rmSync(journal, { force: true });
      const s = serveur(args);
      expect(s.code).toBe(2);
      expect(s.journal).toContain('appel invalide —');
      expect(s.finales).toHaveLength(1);
      expect(s.derniere).toMatch(/═══ REFUSÉ \(rien n'a été modifié en service\) ═══/);
      expect(conclusionDuMac(s.journal).sortie).toContain('Terminé : REFUSÉ');
    }
  });

  it('arrêt INATTENDU en pleine route (unité arrêtée, signal) : ligne finale « ÉCHEC — ARRÊT INATTENDU », code 1 ; le Mac dit ÉCHEC', () => {
    const s = serveur(['--essai', SHA, `--journal=${journal}`], { enService: AUTRE, sauvegarde: 'tuer' });
    expect(s.code).toBe(1);
    expect(s.finales).toHaveLength(1);
    expect(s.derniere).toMatch(/═══ ÉCHEC — ARRÊT INATTENDU DU SCRIPT \(code 143\) : lire le journal, l'état en service est à vérifier ═══/);
    const mac = conclusionDuMac(s.journal);
    expect(mac.code).toBe(1);
    expect(mac.sortie).toContain('Terminé : ÉCHEC');
    expect(mac.sortie).not.toContain('RÉSULTAT INCONNU');
  });

  it('dans le source : plus aucune sortie (`exit`) avant le journal, sauf l’appel SANS journal ; un piège EXIT conclut toute fin', () => {
    const src = readFileSync(SERVEUR, 'utf8');
    const avantJournal = src.slice(0, src.indexOf('exec >>"$JOURNAL" 2>&1'));
    expect(avantJournal.match(/\bexit\b/g)).toHaveLength(1);
    expect(avantJournal).toContain('[[ -n $JOURNAL ]] || { echo "--journal manquant"; exit 2; }');
    expect(src).toContain("trap 'fin_inattendue $?' EXIT");
    // Après le journal, les seules sorties du SHELL sont celle de `terminer` (qui écrit la ligne finale) et celles des pièges
    // de signal (qui passent par le piège EXIT, donc par `terminer`) ; `process.exit` est du JavaScript (contrôle du golden).
    const apres = src.slice(src.indexOf('exec >>"$JOURNAL" 2>&1')).split('\n').filter((l) => /\bexit\b/.test(l) && !/process\.exit/.test(l)).map((l) => l.trim());
    expect(apres).toEqual(['exit "$code"', "trap 'exit 143' TERM", "trap 'exit 130' INT", "trap 'exit 129' HUP"]);
  });
});
