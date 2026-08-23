import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { preparerCommande, aUneProcedure, TERMINAL_RAPPEL } from './commandeReingestion';

/**
 * FRAÎCHEUR lot 3 — préparation de commande. Vérifie : bloc complet (cd absolu + env + commande), sources SANS procédure
 * (null), avertissement pour commande lourde, et AUCUNE exécution de processus dans le chemin (test statique du module).
 */

const REPO = '/Users/x/sansvisavis/app';

describe('preparerCommande — bloc copiable complet', () => {
  it('DILA → cd absolu + chargement env + commande, dans cet ordre', () => {
    const p = preparerCommande('dila', null, REPO)!;
    expect(p.commande).toBe(
      `cd ${REPO}\nset -a && source .env && set +a\nnpm run dila:ingest`,
    );
  });

  it('PRADA → commande légère, sans avertissement', () => {
    const p = preparerCommande('prada', null, REPO)!;
    expect(p.commande).toContain(`cd ${REPO}`);
    expect(p.commande).toContain('set -a && source .env && set +a');
    expect(p.commande).toContain('npm run prada:ingest');
    expect(p.avertissement).toBeNull();
  });

  it('cadastre/bdtopo injectent le millésime distant détecté', () => {
    expect(preparerCommande('cadastre', '2026-09-01', REPO)!.commande).toContain('--millesime 2026-09-01');
    expect(preparerCommande('bdtopo_bati', '2026-09-15', REPO)!.commande).toContain('--edition 2026-09-15');
  });
});

describe('preparerCommande — sources SANS procédure → null (jamais de commande inventée)', () => {
  it('LiDAR, BDNB, adresse orpheline, Sitadel (auto) → null', () => {
    for (const cle of ['lidar', 'bdnb', 'bdtopo_adresse', 'sitadel']) {
      expect(preparerCommande(cle, null, REPO)).toBeNull();
      expect(aUneProcedure(cle)).toBe(false);
    }
  });
  it('les sources manuelles ont bien une procédure', () => {
    for (const cle of ['dila', 'prada', 'cadastre', 'bdtopo_bati']) expect(aUneProcedure(cle)).toBe(true);
  });
});

describe('AVERTISSEMENT — commande lourde ou destructive (test nommé)', () => {
  it('BD TOPO → avertit du poids ET de l’étape séparée (basculement + golden)', () => {
    const p = preparerCommande('bdtopo_bati', '2026-09-15', REPO)!;
    expect(p.avertissement).toMatch(/basculement/i);
    expect(p.avertissement).toMatch(/golden/i);
  });
  it('DILA → avertit du téléchargement lourd (~360 Mo) et du remplacement du millésime', () => {
    const p = preparerCommande('dila', null, REPO)!;
    expect(p.avertissement).toMatch(/360/);
    expect(p.avertissement).toMatch(/remplace/i);
  });
  it('aucune commande d’ingestion n’est marquée destructive (aucun TRUNCATE global)', () => {
    for (const cle of ['dila', 'prada', 'cadastre', 'bdtopo_bati']) {
      expect(preparerCommande(cle, null, REPO)!.destructif).toBe(false);
    }
  });
});

describe('AUCUNE exécution de processus (test négatif, statique)', () => {
  it('le module n’IMPORTE ni child_process, ni n’APPELLE exec/spawn (la prose peut les nommer, pas le code)', () => {
    // On retire les commentaires : le docstring MENTIONNE honnêtement child_process/exec/spawn ; c'est le CODE qui ne doit
    // ni les importer ni les appeler.
    const src = readFileSync(new URL('./commandeReingestion.ts', import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(src).not.toMatch(/from ['"]node:child_process['"]|from ['"]child_process['"]|require\(['"]child_process['"]\)/);
    expect(src).not.toMatch(/\b(execSync|execFileSync|execFile|spawnSync|spawn)\s*\(/);
    expect(src).not.toMatch(/\bexec\s*\(/);
  });
  it('le rappel terminal désigne une fenêtre neuve, pas l’onglet de l’agent', () => {
    expect(TERMINAL_RAPPEL).toMatch(/Terminal/);
    expect(TERMINAL_RAPPEL).toMatch(/neuve/i);
  });
});
