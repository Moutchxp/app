import { describe, it, expect, afterAll } from 'vitest';
import { query, withTransaction } from '../db/client';
import { arreterToutesRelances } from './arretRelances';
import { sortirTestVersRattachement } from './projectionFileRepo';
import { marquerTestAnalyse, lireDossiersEnTest } from './testAnalyseRepo';
import { marquerDossierPartiel } from './dossierPartielRepo';
import { lireCandidatsRelance } from '../sitadel/envoiRelance';
import { lireDemandesPartiellesActives } from '../veille/cascadePartielleRepo';
import { candidatsRelanceReponseReels } from '../veille/relanceReponsePartielleAuto';

/**
 * 🔴 LOT 51-C — TEST DE LIVRAISON (sine qua non). Le risque : une extinction INCOMPLÈTE enverrait une relance réelle à une mairie dont
 * on n'a plus besoin. On PROUVE, sur la VRAIE base, que la sortie du test coupe les TROIS systèmes de relance auto, et QUE les DEUX
 * gestes sont nécessaires (aucun seul ne suffit) — puis que le cas inverse (demande NON sortie) ne perd rien.
 *   ① ORDINAIRE  : lireCandidatsRelance (brouillon dont la demande est 'envoyee')
 *   ② PARTIELLE  : lireDemandesPartiellesActives (partiel_le actif, statut envoyee/close)
 *   ③ PART-E     : candidatsRelanceReponseReels (partiel actif + réponse mairie récente + pièces manquantes)
 * Fixtures isolées + nettoyage afterAll (motif saisissableEnCours.itest.ts).
 */
const demandeIds: number[] = [];
const dossierIds: number[] = [];
let seq = 0;

async function codeInseeExistant(): Promise<string> {
  const { rows } = await query<{ code_insee: string }>(`SELECT code_insee FROM demande LIMIT 1`);
  if (!rows[0]) throw new Error('aucune demande existante pour emprunter un code_insee');
  return rows[0].code_insee;
}

/**
 * Sème une demande PARTIELLE-ACTIVE, candidate aux TROIS systèmes :
 *  - statut 'envoyee' + email + envoi initial ancien ;
 *  - un BROUILLON de relance (→ ①) ;
 *  - un message mairie récent + une complétude VIDE (toutes familles attendues manquantes) (→ ③) ;
 *  - marqueur partiel actif (→ ② et ③).
 * `corps` : 'none' (aucun bâtiment), 'sans_alt' (1 corps sans altitude), 'avec_alt' (1 corps couvert par une projection ignorée + altitude) ;
 * `test` : pose le marqueur « testé en analyse » (pour la sortie end-to-end).
 */
async function seedCandidat(opts: { corps?: 'none' | 'sans_alt' | 'avec_alt'; test?: boolean } = {}): Promise<{ demandeId: number; dossierId: number }> {
  const ci = await codeInseeExistant();
  seq += 1;
  const { rows: d } = await query<{ id: number }>(
    `INSERT INTO demande (reference, code_insee, statut, dest_canal, dest_email)
       VALUES ($1, $2, 'envoyee', 'email', 'mairie.test@example.invalid') RETURNING id::int AS id`,
    [`SVAV-DEM-2099-${String(930000 + seq)}`, ci]);
  const demandeId = d[0].id; demandeIds.push(demandeId);
  await query(`INSERT INTO demande_acheminement (demande_id, canal, statut, envoye_le) VALUES ($1, 'email', 'envoye', now() - interval '60 days')`, [demandeId]);
  const { rows: s } = await query<{ id: number }>(
    `INSERT INTO sitadel_dossier (type, num_dau, code_insee, departement, vu_le_premier_millesime, vu_le_dernier_millesime)
       VALUES ('PC', $1, '99999', '99', '2099-01', '2099-01') RETURNING id::int AS id`, [`TESTSTOP${930000 + seq}`]);
  const dossierId = s[0].id; dossierIds.push(dossierId);
  await query(`INSERT INTO demande_dossier (demande_id, dossier_id, actif) VALUES ($1, $2, true)`, [demandeId, dossierId]);
  // ① brouillon de relance vivant
  await query(`INSERT INTO demande_relance (demande_id, type, objet, corps, profil_demandeur, statut) VALUES ($1, 'relance', 'Relance test', 'Corps test', 'entreprise', 'brouillon')`, [demandeId]);
  // ③ message mairie récent + complétude vide (classements '[]' → toutes familles attendues manquantes ; nb_pieces 0 = pas de GED → non périmé)
  await query(`INSERT INTO demande_reponse (demande_id, profil_boite, message_id, de_adresse, recu_le, nature) VALUES ($1, 'entreprise', $2, 'mairie@example.invalid', now(), 'documents')`, [demandeId, `<lot51c-${demandeId}@example.invalid>`]);
  await query(`INSERT INTO permis_completude (dossier_id, classements, nb_pieces, calcule_le) VALUES ($1, '[]'::jsonb, 0, now())`, [dossierId]);
  // bâtiments éventuels (pour la sortie)
  if (opts.corps && opts.corps !== 'none') {
    const alt = opts.corps === 'avec_alt' ? 100 : null;
    const { rows: b } = await query<{ id: number }>(
      `INSERT INTO permis_corps_batiment (dossier_id, repere, altitude_sommet_ngf, altitude_sommet_ngf_origine) VALUES ($1, 'A', $2, $3) RETURNING id::int AS id`,
      [dossierId, alt, alt === null ? null : 'saisie']);
    // couvre le corps par une projection IGNORÉE → l'empreinte est « validable » (peutValider) sans tracer de géométrie
    await query(`INSERT INTO permis_projection_ignoree (dossier_id, corps_id, motif) VALUES ($1, $2, 'test 51-C')`, [dossierId, b[0].id]);
  }
  if (opts.test) await marquerTestAnalyse(dossierId, 'test:51c');
  // ② + ③ marqueur partiel actif (aucun journal 'sortant' écrit → relanceReponseDue vrai)
  await marquerDossierPartiel(demandeId, ['etage'], 'declaree');
  return { demandeId, dossierId };
}

async function dansTrois(demandeId: number): Promise<{ ordinaire: boolean; partielle: boolean; partE: boolean }> {
  const [ord, part, pe] = await Promise.all([lireCandidatsRelance(), lireDemandesPartiellesActives(), candidatsRelanceReponseReels()]);
  return {
    ordinaire: ord.some((c) => c.demandeId === demandeId),
    partielle: part.includes(demandeId),
    partE: pe.some((c) => c.demandeId === demandeId),
  };
}

afterAll(async () => {
  const del = async (sql: string, id: number) => { try { await query(sql, [id]); } catch { /* table/colonne absente : nettoyage best-effort */ } };
  for (const id of demandeIds) {
    await del(`DELETE FROM demande_relance WHERE demande_id = $1`, id);
    await del(`DELETE FROM demande_reponse WHERE demande_id = $1`, id);
    await del(`DELETE FROM demande_journal WHERE demande_id = $1`, id);
    await del(`DELETE FROM demande_acheminement WHERE demande_id = $1`, id);
    await del(`DELETE FROM demande_dossier WHERE demande_id = $1`, id);
    await del(`DELETE FROM demande WHERE id = $1`, id);
  }
  for (const id of dossierIds) {
    await del(`DELETE FROM permis_rattachement_evenement WHERE rattachement_id IN (SELECT id FROM permis_rattachement WHERE dossier_id = $1)`, id);
    await del(`DELETE FROM permis_rattachement WHERE dossier_id = $1`, id);
    await del(`DELETE FROM permis_projection WHERE dossier_id = $1`, id);
    await del(`DELETE FROM sitadel_dossier WHERE id = $1`, id); // CASCADE : corps, ignore, completude, dossier_test_analyse
  }
});

describe('LOT 51-C — arrêt EXHAUSTIF des relances : « close + levé ⇒ 0 candidat aux TROIS systèmes »', () => {
  it('la demande est candidate aux TROIS AVANT, à AUCUN APRÈS ; et la preuve que les deux gestes sont nécessaires', async () => {
    const { demandeId } = await seedCandidat();

    const avant = await dansTrois(demandeId);
    expect(avant, 'AVANT : candidate aux trois systèmes (test non vacide)').toEqual({ ordinaire: true, partielle: true, partE: true });

    // Contre-preuve 1 — CLOSE SEUL : coupe ① mais PAS ② ni ③ (ils acceptent 'close').
    await query(`UPDATE demande SET statut = 'close' WHERE id = $1`, [demandeId]);
    const closeSeul = await dansTrois(demandeId);
    expect(closeSeul.ordinaire, 'close coupe la cascade ORDINAIRE').toBe(false);
    expect(closeSeul.partielle || closeSeul.partE, 'close NE coupe PAS ② ni ③').toBe(true);
    await query(`UPDATE demande SET statut = 'envoyee' WHERE id = $1`, [demandeId]); // restaure l'état

    // Contre-preuve 2 — LEVÉ SEUL : coupe ② et ③, mais la demande RESTE 'envoyee' → ① revit.
    await query(`UPDATE demande SET partiel_leve_le = now() WHERE id = $1`, [demandeId]);
    const leveSeul = await dansTrois(demandeId);
    expect(leveSeul.partielle, 'levé coupe la cascade PARTIELLE').toBe(false);
    expect(leveSeul.partE, 'levé coupe la relance sur réponse (PART-E)').toBe(false);
    expect(leveSeul.ordinaire, 'levé seul laisse ① vivante (demande encore envoyee)').toBe(true);
    await query(`UPDATE demande SET partiel_leve_le = NULL WHERE id = $1`, [demandeId]); // restaure

    // LES DEUX ENSEMBLE (le geste réel) → 0 candidat partout.
    await withTransaction((q) => arreterToutesRelances(q, demandeId, 'test:51c'));
    const apres = await dansTrois(demandeId);
    expect(apres, 'APRÈS close+levé : AUCUN des trois ne retient la demande').toEqual({ ordinaire: false, partielle: false, partE: false });

    // Les deux écritures sont bien posées.
    const { rows } = await query<{ statut: string; leve: string | null }>(`SELECT statut, partiel_leve_le::text AS leve FROM demande WHERE id = $1`, [demandeId]);
    expect(rows[0].statut).toBe('close');
    expect(rows[0].leve).not.toBeNull();
  });

  it('NON-RÉGRESSION : une AUTRE demande partielle non sortie reste candidate aux trois après l’arrêt de la première', async () => {
    const cible = await seedCandidat();
    const temoin = await seedCandidat();
    expect(await dansTrois(temoin.demandeId)).toEqual({ ordinaire: true, partielle: true, partE: true });

    await withTransaction((q) => arreterToutesRelances(q, cible.demandeId, 'test:51c'));

    expect(await dansTrois(cible.demandeId), 'la cible est coupée').toEqual({ ordinaire: false, partielle: false, partE: false });
    expect(await dansTrois(temoin.demandeId), '🔴 le témoin ne perd RIEN').toEqual({ ordinaire: true, partielle: true, partE: true });
    // Le témoin garde son marqueur partiel intact (échéances inchangées).
    const { rows } = await query<{ statut: string; leve: string | null; partiel: string | null }>(
      `SELECT statut, partiel_leve_le::text AS leve, partiel_le::text AS partiel FROM demande WHERE id = $1`, [temoin.demandeId]);
    expect(rows[0].statut).toBe('envoyee');
    expect(rows[0].leve).toBeNull();
    expect(rows[0].partiel).not.toBeNull();
  });
});

describe('LOT 51-C — sortirTestVersRattachement : double condition + sortie end-to-end', () => {
  it('REFUS empreinte : 0 bâtiment → { manque: empreinte } (rien écrit)', async () => {
    const { dossierId } = await seedCandidat({ corps: 'none', test: true });
    const r = await sortirTestVersRattachement(dossierId, 'test:51c');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.manque).toBe('empreinte');
    expect(await lireDossiersEnTest()).toContain(dossierId); // marqueur intact (aucune sortie)
  });

  it('REFUS altitude : empreinte OK mais 1 bâtiment sans altitude NGF → { manque: altitude }', async () => {
    const { dossierId } = await seedCandidat({ corps: 'sans_alt', test: true });
    const r = await sortirTestVersRattachement(dossierId, 'test:51c');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.manque).toBe('altitude');
    expect(await lireDossiersEnTest()).toContain(dossierId);
  });

  it('SUCCÈS : empreinte + altitude → Rattachement, marqueur effacé, relances coupées (0 candidat aux trois)', async () => {
    const { demandeId, dossierId } = await seedCandidat({ corps: 'avec_alt', test: true });
    expect(await dansTrois(demandeId)).toEqual({ ordinaire: true, partielle: true, partE: true });

    const r = await sortirTestVersRattachement(dossierId, 'test:51c');
    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (r.ok) expect(r.demandesArretees).toBe(1);

    // Passage en Rattachement écrit.
    const proj = await query(`SELECT 1 FROM permis_projection WHERE dossier_id = $1`, [dossierId]);
    expect(proj.rows.length).toBe(1);
    const ratt = await query<{ etat: string }>(`SELECT etat FROM permis_rattachement WHERE dossier_id = $1`, [dossierId]);
    expect(ratt.rows[0]?.etat).toBe('en_attente_bati');
    // Marqueur test effacé.
    expect(await lireDossiersEnTest()).not.toContain(dossierId);
    // Relances coupées + les deux gestes posés.
    expect(await dansTrois(demandeId)).toEqual({ ordinaire: false, partielle: false, partE: false });
    const { rows } = await query<{ statut: string; leve: string | null }>(`SELECT statut, partiel_leve_le::text AS leve FROM demande WHERE id = $1`, [demandeId]);
    expect(rows[0].statut).toBe('close');
    expect(rows[0].leve).not.toBeNull();
  });
});
