import { afterAll, describe, expect, it } from 'vitest';
import { closePool } from '../db/client';
import { lireVentes } from './repo';
import { compromisDuMode, nombreParMoisMode, SOCIETES, ventesDuMois } from './modele';

/**
 * 🔴 LOT BT (Arno, 30/10/2026) — LE CONTRÔLE DU MODE « VENDU + COMPROMIS » SUR LA BASE DE RECETTE, EN LECTURE SEULE (`lireVentes` : SELECT
 * seulement). Pour chaque société et chaque année présente : le nombre total du mode combiné (la somme de ses 12 mois) = le nombre de ventes
 * signées placées dans un mois (date de l'acte) + le nombre de compromis EN COURS datés de l'année ; et aucune affaire n'y figure deux fois.
 * Se lance seul : npx vitest run --config vitest.integration.config.ts app/lib/transaction/moisModes.itest.ts
 */
afterAll(async () => { await closePool(); });

describe('🔴 LOT BT — « Vendu + compromis » sur la recette : chaque affaire comptée une seule fois', () => {
  it('total combiné = ventes signées + compromis en cours datés de l’année, sans doublon (le détail est affiché)', async () => {
    const lignes: string[] = [];
    for (const s of SOCIETES) {
      const ventes = await lireVentes(s);
      const annees = [...new Set(ventes.flatMap((v) => [v.annee, ...(v.dateCompromis ? [Number(v.dateCompromis.slice(0, 4))] : [])]))].sort();
      for (const a of annees) {
        const total = nombreParMoisMode(ventes, a, 'tous').reduce((t, x) => t + x, 0);
        const signees = Array.from({ length: 12 }, (_, i) => ventesDuMois(ventes, a, i + 1)).flat();
        const enCours = compromisDuMode(ventes, a, null, 'tous');
        const ids = Array.from({ length: 12 }, (_, i) => [...ventesDuMois(ventes, a, i + 1), ...compromisDuMode(ventes, a, i + 1, 'tous')].map((v) => v.id)).flat();
        lignes.push(`${s} ${a} : ${total} = ${signees.length} signée(s) + ${enCours.length} compromis en cours daté(s)`);
        expect(total).toBe(signees.length + enCours.length);
        expect(new Set(ids).size).toBe(ids.length);
      }
    }
    console.log(`Contrôle du mode « Vendu + compromis » :\n  · ${lignes.join('\n  · ')}`);
  });
});
