import { describe, it, expect, afterAll } from 'vitest';
import { query, closePool } from './client';

afterAll(async () => {
  await closePool();
});

/**
 * Jeu SCELLÉ — flags patrimoine (`is_mh`, `is_inv`, `is_emblematique`) lus via le modèle UNIFIÉ
 * `patrimoine_entite` + `patrimoine_entite_batiment` (migration 009). Filet de régression de
 * l'équivalence prouvée au build (instrumentation « divergences=0 » sur les 401 cleabs patrimoine).
 * Les `cleabs` sont RÉELS, figés au build — représentent les catégories de classification :
 *   - bi-famille MH∩Inventaire → (is_mh, is_inv) tous deux vrais, INDÉPENDANTS (OQ3) ;
 *   - MH pure (sans filtre actif) ; Inventaire pure active (filtre PAR-LIAISON `peb.actif`) ;
 *   - Mondial seul (filtre ENTITÉ `pe.actif`).
 * (Les catégories « badge_actif=false » et « emblématique+MH » n'ont AUCUNE donnée réelle — 0 ligne ;
 *  les cas année/cumul/couloir relèvent du chemin SCORE, couverts par le golden Asnières.)
 */
const CAS: { nom: string; cleabs: string; attendu: [boolean, boolean, boolean] }[] = [
  { nom: 'bi-famille MH∩Inventaire', cleabs: 'BATIMENT0000000240775043', attendu: [true, true, false] },
  { nom: 'MH pure', cleabs: 'BATIMENT0000000000468538', attendu: [true, false, false] },
  { nom: 'Inventaire pure (active)', cleabs: 'BATIMENT0000000000460570', attendu: [false, true, false] },
  { nom: 'Mondial seul', cleabs: 'BATIMENT0000000000157326', attendu: [false, false, true] },
];

interface FlagRow {
  cleabs: string;
  is_mh: boolean;
  is_inv: boolean;
  is_emblematique: boolean;
}

describe('patrimoine unifié — flags scellés (is_mh/is_inv/is_emblematique)', () => {
  it('reproduit les triplets figés via patrimoine_entite/_batiment', async () => {
    const cleabs = CAS.map((c) => c.cleabs);
    const { rows } = await query<FlagRow>(
      `SELECT t.cleabs,
              EXISTS (SELECT 1 FROM patrimoine_entite_batiment peb JOIN patrimoine_entite pe ON pe.id = peb.entite_id
                      WHERE peb.cleabs = t.cleabs AND pe.famille = 'mh')                          AS is_mh,
              EXISTS (SELECT 1 FROM patrimoine_entite_batiment peb JOIN patrimoine_entite pe ON pe.id = peb.entite_id
                      WHERE peb.cleabs = t.cleabs AND pe.famille = 'inventaire' AND peb.actif)     AS is_inv,
              EXISTS (SELECT 1 FROM patrimoine_entite_batiment peb JOIN patrimoine_entite pe ON pe.id = peb.entite_id
                      WHERE peb.cleabs = t.cleabs AND pe.famille = 'mondial' AND pe.actif = true)  AS is_emblematique
       FROM unnest($1::text[]) AS t(cleabs)`,
      [cleabs],
    );
    const par = new Map(rows.map((r) => [r.cleabs, r]));
    for (const c of CAS) {
      const r = par.get(c.cleabs);
      expect(r, c.nom).toBeDefined();
      expect([r!.is_mh, r!.is_inv, r!.is_emblematique], c.nom).toEqual(c.attendu);
    }
  });
});
