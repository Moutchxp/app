import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as metriques from './metriques';

/**
 * M2 — LOT 4. Garanties transverses du lot : (1) la couche de lecture ne touche JAMAIS les sessions
 * brutes ni le pool d'écriture ; (2) aucune métrique REFUSÉE par l'étude n'est produite.
 */
const DIR = __dirname;
const fichiersSource = () =>
  fs.readdirSync(DIR).filter((f) => (f.endsWith('.ts') || f.endsWith('.tsx')) && !f.includes('.test.'));
/** Retire commentaires bloc et ligne : on vérifie le CODE réel, pas les commentaires qui NOMMENT ce
 *  qu'on n'utilise pas (ex. « jamais analytics_session »). */
const codeSeul = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('couche de lecture — jamais les sessions brutes, jamais le pool d’écriture', () => {
  it('aucun fichier source de lecture/ ne LIT analytics_session (hors commentaires)', () => {
    for (const f of fichiersSource()) {
      const code = codeSeul(fs.readFileSync(path.join(DIR, f), 'utf8'));
      expect(code.includes('analytics_session'), `${f} ne doit jamais lire les sessions brutes`).toBe(false);
    }
  });

  it('la lecture passe par le pool APPLICATIF (db/client), pas le pool d’écriture analytics (pool.ts)', () => {
    const src = fs.readFileSync(path.join(DIR, 'requete.ts'), 'utf8');
    expect(src).toMatch(/from '\.\.\/\.\.\/db\/client'/); // pool applicatif en lecture
    // Aucun fichier de lecture n'importe le pool d'écriture dédié (poolAnalytics/queryAnalytics) — code réel.
    for (const f of fichiersSource()) {
      const code = codeSeul(fs.readFileSync(path.join(DIR, f), 'utf8'));
      // `/pool'` capte tout import du pool d'écriture quel que soit le chemin relatif (../pool, ./pool…),
      // + les symboles réels queryAnalytics/poolAnalytics (import nommé/aliasé/namespace).
      expect(code.includes("/pool'") || code.includes('queryAnalytics') || code.includes('poolAnalytics')).toBe(false);
    }
  });

  it('READ ONLY structurel : requete.ts pose SET TRANSACTION READ ONLY', () => {
    const src = fs.readFileSync(path.join(DIR, 'requete.ts'), 'utf8');
    expect(src).toMatch(/SET TRANSACTION READ ONLY/);
    expect(src).toMatch(/statement_timeout/);
  });
});

describe('métriques REFUSÉES par l’étude — non produites (test de non-existence)', () => {
  it('aucune fonction « visiteur unique », « durée moyenne », « page de sortie »', () => {
    const noms = Object.keys(metriques).map((n) => n.toLowerCase());
    const interdits = ['unique', 'recurrent', 'dureemoyenne', 'duree_moyenne', 'moyenne', 'pagesortie', 'page_sortie', 'sortie', 'exit', 'visiteur'];
    for (const mot of interdits) {
      expect(noms.some((n) => n.includes(mot)), `aucune métrique ne doit exposer « ${mot} »`).toBe(false);
    }
  });
  it('les métriques exposées sont bien celles des fiches MESURABLES', () => {
    for (const attendu of ['traficParTranche', 'repartitionVerdicts', 'comptesAnalyses', 'entonnoir', 'repartitionCommune', 'provenance']) {
      expect(typeof (metriques as Record<string, unknown>)[attendu]).toBe('function');
    }
  });
});
