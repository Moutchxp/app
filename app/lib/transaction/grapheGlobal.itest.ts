import { afterAll, describe, expect, it } from 'vitest';
import { closePool } from '../db/client';
import { lireCaLocationHtTtc, lireLocationCa } from './locationLue';
import { libellesDePaye, lireGestion, lireNotesDoubles, lireRetrocessions, lireStatutsNegociateurs, lireVentes } from './repo';
import { resolveurDe } from './statutLigne';
import { celluleGlobalAnnees } from './globalUnite';
import { coutsGlobaux } from './coutsGlobal';
import { atomesDesMois, atomesDuPoint, FILTRES_GRAPHE_DEFAUT as D, seriesDuPoint, type FiltresGraphe } from './grapheGlobal';

/**
 * 🔴 LOT CG11 (Arno, 01/11/2026) — LE CONTRÔLE PERMANENT SUR LA BASE DE RECETTE, EN LECTURE SEULE (les lectures de la page CA global : SELECT
 * seulement). Pour chaque année de 2019 à 2026, chaque structure seule et les deux, chaque mesure (CA, coûts, résultat), HT et TTC, avec et sans
 * salaires, Location & Gestion séparées et réunies, et chaque comparaison (total, activités, structures) : la fin d'année du graphique (les 12 mois
 * + « Mois à confirmer » ; lot CG12 : l'écart d'arrondi reporté sur le dernier mois affiché, sans point « arrondi ») = le total de l'année = les tuiles / le Bilan (hors ventes à attribuer, lot CG10), au centime ; et la somme des séries =
 * le total. Les écarts sont listés ; aucun n'est attendu.
 * Se lance seul : npx vitest run --config vitest.integration.config.ts app/lib/transaction/grapheGlobal.itest.ts
 */
afterAll(async () => { await closePool(); });

describe('🔴 LOT CG11 — le graphique du CA global : fin d’année = tuiles / Bilan, au centime (base de recette)', () => {
  it('aucun écart, 2019 → 2026 (la liste des écarts est affichée s’il y en a)', async () => {
    const loc = await lireCaLocationHtTtc(); const lu = await lireLocationCa(); const gestion = await lireGestion();
    const [ventes, retrocessions, doubles] = await Promise.all([lireVentes(null), lireRetrocessions(null), lireNotesDoubles(null)]);
    const statutDuLibelle = resolveurDe(await lireStatutsNegociateurs(libellesDePaye([...ventes, ...doubles])).catch(() => ({})));
    const eG = { ventes, location: loc?.ht ?? null, locationTtcC: loc?.ttcC ?? null, gestion };
    const eC = { ventes, retrocessions, statutDuLibelle, location: { lignes: lu.lignes, retrocessions: lu.retrocessions, salaires: lu.salaires }, gestion };
    const c = (x: number): number => Math.round(x * 100);
    const ecarts: string[] = []; let n = 0;
    for (let a = 2019; a <= 2026; a++) for (const sal of [true, false]) {
      // 🔴 LOT CG12 — les points du graphique : les 12 mois (l'écart d'arrondi reporté sur le dernier mois affiché), puis « Mois à confirmer »
      const ajd = new Date().toISOString(); const enCours = Number(ajd.slice(0, 4));
      const dernier = a < enCours ? 12 : a > enCours ? 0 : Number(ajd.slice(5, 7));
      const { mois, aConfirmer: hors } = atomesDesMois(eG, eC, a, sal, dernier); const an = atomesDuPoint(eG, eC, a, null, sal);
      // sans vente signée sans mois, « Mois à confirmer » est vide (plus de point « arrondi » : l'écart de centime est dans le dernier mois)
      const sansMois = ventes.some((v) => v.statut === 'vendue' && v.annee === a && v.mois === null);
      if (!sansMois && hors.some((x) => x.m.htC !== 0 || x.m.ttcC !== 0)) ecarts.push(`${a} : « Mois à confirmer » non vide sans vente sans mois`);
      const cel = { htC: celluleGlobalAnnees(eG, [a], 'ht'), ttcC: celluleGlobalAnnees(eG, [a], 'ttc') };
      const couts = coutsGlobaux(eC, a, null, sal).total;
      for (const structures of [['criterimmo'], ['macj'], ['criterimmo', 'macj']] as const) for (const mesure of ['ca', 'couts', 'net'] as const)
        for (const reunies of [false, true]) for (const comparer of ['n1', 'activites', 'structures'] as const) {
          const f: FiltresGraphe = { ...D, structures: [...structures], mesure, reunies, comparer };
          for (const u of ['htC', 'ttcC'] as const) {
            n += 1;
            const fin = [...mois, hors].reduce((t, x) => t + seriesDuPoint(x, f).total[u], 0);
            const series = [...mois, hors].reduce((t, x) => t + seriesDuPoint(x, f).series.reduce((s, y) => s + y.m[u], 0), 0);
            const annee = seriesDuPoint(an, f).total[u];
            // les tuiles / le Bilan : CRITERIMMO, MACJ, ou le CA global moins les ventes à attribuer ; coûts et résultat des deux : le Bilan
            const k = cel[u];
            const ca = structures.length === 2 ? c(k.totalHt) - c(k.aAttribuerHt) : structures[0] === 'criterimmo' ? c(k.criterimmoHt) : c(k.macjHt);
            const bilan = mesure === 'ca' ? ca : structures.length === 2 ? (mesure === 'couts' ? couts[u] : ca - couts[u]) : annee;
            if (fin !== annee || fin !== bilan || (comparer !== 'n1' && series !== fin)) {
              ecarts.push(`${a} · ${structures.join('+')} · ${mesure} · ${comparer} · ${reunies ? 'réunies' : 'séparées'} · ${sal ? 'avec' : 'sans'} salaires · `
                + `${u === 'htC' ? 'HT' : 'TTC'} : fin d’année ${(fin / 100).toFixed(2)} ; année ${(annee / 100).toFixed(2)} ; Bilan ${(bilan / 100).toFixed(2)}`);
            }
          }
        }
    }
    console.log(`Graphique du CA global : ${n} combinaison(s) contrôlée(s), ${ecarts.length} en écart.${ecarts.map((e) => `\n  · ${e}`).join('')}`);
    expect(n).toBe(8 * 2 * 3 * 3 * 2 * 3 * 2);
    expect(ecarts).toEqual([]);
  });
});
