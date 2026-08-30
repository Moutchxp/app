import { describe, it, expect, afterAll } from 'vitest';
import { query } from '../db/client';
import { marquerDossierPartiel, leverDossierPartiel, lireEtatPartiel } from './dossierPartielRepo';

/**
 * PART-F ① — GARDE-FOU EN BASE : le butoir CADA d'un dossier partiel est FIXE (ancré sur la 1re réclamation, partiel_le). Une 2e
 * réclamation ne doit JAMAIS repousser `partiel_le` tant que le marqueur est actif (sinon la mairie repousse l'échéance à l'infini).
 * Seul un ré-armement APRÈS une levée (nouveau cycle) repose une nouvelle ancre. Itest : vraie base.
 */
const demandeIds: number[] = [];
async function codeInseeExistant(): Promise<string> {
  const { rows } = await query<{ code_insee: string }>(`SELECT code_insee FROM demande LIMIT 1`); // FK commune : réutilise un code déjà valide
  if (!rows[0]) throw new Error('aucune demande existante pour emprunter un code_insee valide');
  return rows[0].code_insee;
}
async function creerDemande(): Promise<number> {
  // Référence au format imposé par le CHECK (^SVAV-DEM-[0-9]{4}-[0-9]{6}$) ; année 2099 = jeu d'itest, hors données réelles ; supprimée en fin.
  const ref = `SVAV-DEM-2099-${String(900001 + demandeIds.length).slice(0, 6)}`;
  const { rows } = await query<{ id: number }>(
    `INSERT INTO demande (reference, code_insee) VALUES ($1, $2) RETURNING id`, [ref, await codeInseeExistant()]);
  const id = rows[0].id;
  demandeIds.push(id);
  return id;
}
async function partielLeBrut(id: number): Promise<string | null> {
  const { rows } = await query<{ t: string | null }>(`SELECT partiel_le::text AS t FROM demande WHERE id = $1`, [id]);
  return rows[0]?.t ?? null;
}

afterAll(async () => {
  for (const id of demandeIds) await query(`DELETE FROM demande WHERE id = $1`, [id]);
});

describe('PART-F ① — marquerDossierPartiel : butoir FIXE (partiel_le ne bouge pas sur une 2e réclamation)', () => {
  it('2e réclamation active → partiel_le INCHANGÉ, mais familles rafraîchies', async () => {
    const id = await creerDemande();
    await marquerDossierPartiel(id, ['cerfa'], 'outil');
    const t1 = await partielLeBrut(id);
    expect(t1).not.toBeNull();

    await marquerDossierPartiel(id, ['cerfa', 'masse'], 'declaree'); // 2e réclamation (nouvelle vague / re-clic)
    const t2 = await partielLeBrut(id);
    expect(t2).toBe(t1); // 🔴 l'ancre du butoir n'a PAS bougé

    const etat = await lireEtatPartiel(id);
    expect(etat?.familles.sort()).toEqual(['cerfa', 'masse']); // familles rafraîchies au manquant courant
    expect(etat?.origine).toBe('outil'); // origine de la 1re réclamation CONSERVÉE (pas écrasée par la 2e)
  });

  it('ré-armement APRÈS une levée (nouveau cycle) → nouvelle ancre partiel_le', async () => {
    const id = await creerDemande();
    await marquerDossierPartiel(id, ['cerfa'], 'outil');
    const t1 = await partielLeBrut(id);
    await leverDossierPartiel(id, 'itest');
    expect(await lireEtatPartiel(id)).toBeNull(); // levé → plus actif

    await marquerDossierPartiel(id, ['masse'], 'outil'); // dossier redevenu incomplet → nouveau cycle
    const t2 = await partielLeBrut(id);
    expect(t2).not.toBe(t1); // nouvelle ancre (la levée a clos le cycle précédent)
    expect((await lireEtatPartiel(id))?.familles).toEqual(['masse']);
  });
});
