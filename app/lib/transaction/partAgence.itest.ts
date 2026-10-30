import { afterAll, describe, expect, it } from 'vitest';
import { closePool } from '../db/client';
import { lireVentes } from './repo';
import { controleVentilation } from './partAgence';
import { SOCIETES } from './modele';

/**
 * 🔴 LOT BA (Arno, 30/10/2026) — LE CONTRÔLE PERMANENT SUR LA BASE DE RECETTE, EN LECTURE SEULE (`lireVentes` : SELECT seulement). Pour
 * chaque affaire répartie (compromis en cours, vendues) de chaque société : la somme des cadres des cartes de partie = la commission de la
 * vente (porteuse) ou la part reçue (ligne miroir), au centime, HT et TTC. Les écarts sont listés (données incomplètes, à corriger dans le
 * dossier) ; aucun n'est attendu.
 * Se lance seul : npx vitest run --config vitest.integration.config.ts app/lib/transaction/partAgence.itest.ts
 */
afterAll(async () => { await closePool(); });

describe('🔴 LOT BA — toutes les affaires de la base : les cartes de partie totalisent la commission, au centime', () => {
  it('aucun écart (la liste des écarts est affichée s’il y en a)', async () => {
    const ecarts: string[] = [];
    let controlees = 0;
    for (const s of SOCIETES) {
      for (const v of await lireVentes(s)) {
        if (v.statut !== 'compromis' && v.statut !== 'vendue') continue;
        const c = controleVentilation(v, s);
        if (c === null) continue;
        controlees += 1;
        if (c.ecart.htC !== 0 || c.ecart.ttcC !== 0) {
          ecarts.push(`${s} · vente ${v.id} « ${v.libelle} » (${v.statut}) : attendu ${(c.attendu.ttcC / 100).toFixed(2)} € TTC, `
            + `non affectés ${(c.ecart.ttcC / 100).toFixed(2)} € TTC / ${(c.ecart.htC / 100).toFixed(2)} € HT`);
        }
      }
    }
    console.log(`Contrôle de la ventilation : ${controlees} affaire(s) contrôlée(s), ${ecarts.length} en écart.${ecarts.map((e) => `\n  · ${e}`).join('')}`);
    expect(ecarts).toEqual([]);
  });
});
