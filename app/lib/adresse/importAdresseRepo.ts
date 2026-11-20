import type { RequeteTx } from '../db/client';
import type { Auteur } from '../gestion/gestes';
import { cleImmeuble } from '../gestion/syndics';
import { immeubleDuBien } from '../gestion/copropriete';
import { enregistrerRapprochement, rapprocherBien, type RapprochementComplet } from './banRepo';
import { formatUniqueDisponible } from './adresseSaisieRepo';
import { libelleOfficiel } from './rapprochementBan';

/**
 * ══ 🔴🔴 L'IMPORT WIPPIMMO PASSE PAR LE MODULE UNIQUE DE RAPPROCHEMENT (Arno, 20/11/2026, « Adresse officielle BAN », lot 7b). IMPUR (base). ═══════
 *
 * Chaque bien IMPORTÉ, ou dont l'adresse WIPPIMMO CHANGE, est rapproché de la Base Adresse locale, dans la transaction de l'import :
 *   • CERTAIN → rattaché à la copropriété de CETTE adresse officielle (celle qui la porte, ou créée SUR L'ADRESSE OFFICIELLE — jamais sur une simple
 *     écriture de texte) ; son écriture WIPPIMMO devient une écriture d'origine de la copropriété ; journalisé sur le bien et sur la copropriété ;
 *   • sinon (à vérifier, plage de numéros, introuvable, commune absente) → la file « Adresses à vérifier » ;
 *   • une adresse officielle que DEUX copropriétés enregistrées se disputent : rien n'est rattaché, le bien va dans la file (rien n'est écrasé).
 * Les adresses WIPPIMMO des biens ne sont JAMAIS touchées. Sans la migration 505 : rien de plus n'est écrit (l'import d'avant).
 */
export const AUTEUR_IMPORT: Auteur = { id: null, libelle: 'import WIPPIMMO' };
export interface LotImporte { id: number; immeuble: string | null; adresse: string | null; codePostal: string | null; commune: string | null }
export interface BilanImportAdresses { rapproches: number; certains: number; aVerifier: number; introuvables: number; rattaches: number; coproprietesCreees: number }

type Rattachement = { ok: true; coproId: string; creee: boolean; ecritureAjoutee: boolean } | { ok: false; motif: string };

/** Le rattachement d'un bien CERTAIN à la copropriété de son adresse officielle (dans la transaction de l'import). */
async function rattacher(q: RequeteTx, l: LotImporte, r: RapprochementComplet, auteur: Auteur): Promise<Rattachement> {
  const ban = r.ban!;
  const ecriture = immeubleDuBien(l);
  const cle = cleImmeuble(ecriture);
  const voie = libelleOfficiel(ban);
  const cleOfficielle = cleImmeuble(voie);
  const { rows: porteurs } = await q<{ id: string }>(
    `SELECT DISTINCT c.id::text FROM gestion_copropriete c LEFT JOIN gestion_copropriete_adresse a ON a.copropriete_id = c.id AND a.retire_le IS NULL
      WHERE c.ban_id = $1 OR a.ban_id = $1`, [ban.id]);
  const { rows: deLEcriture } = await q<{ id: string }>(
    `SELECT id::text FROM gestion_copropriete WHERE cle_immeuble = $1
     UNION SELECT copropriete_id::text FROM gestion_copropriete_adresse WHERE cle_immeuble = $1 AND retire_le IS NULL`, [cle]);
  const ids = new Set([...porteurs, ...deLEcriture].map((x) => x.id));
  if (ids.size > 1) return { ok: false, motif: 'Adresse officielle certaine, mais portée par plusieurs copropriétés enregistrées : à trancher dans la file.' };
  let coproId = [...ids][0] ?? null;
  let creee = false;
  if (coproId === null) {
    // aucune copropriété : celle de l'ADRESSE OFFICIELLE (une fiche existante à cette clé la reçoit ; sinon elle est créée sur l'adresse officielle)
    const { rows: [dejaOff] } = await q<{ id: string; ban_id: string | null }>('SELECT id::text, ban_id FROM gestion_copropriete WHERE cle_immeuble = $1', [cleOfficielle]);
    if (dejaOff !== undefined) {
      if (dejaOff.ban_id !== null && dejaOff.ban_id !== ban.id) return { ok: false, motif: 'Une copropriété porte déjà cette écriture avec une autre adresse officielle : à trancher dans la file.' };
      coproId = dejaOff.id;
      if (dejaOff.ban_id === null) await q('UPDATE gestion_copropriete SET ban_id = $2 WHERE id = $1 AND ban_id IS NULL', [coproId, ban.id]);
    } else {
      const { rows: [c] } = await q<{ id: string }>(
        `INSERT INTO gestion_copropriete (cle_immeuble, libelle, code_postal, commune, cree_par, cree_par_libelle, ban_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id::text`,
        [cleOfficielle, voie, r.codePostal, ban.commune, auteur.id, auteur.libelle, ban.id]);
      coproId = c.id;
      creee = true;
    }
  }
  const { rows: [copro] } = await q<{ cle: string }>('SELECT cle_immeuble AS cle FROM gestion_copropriete WHERE id = $1', [coproId]);
  let ecritureAjoutee = false;
  if (copro.cle !== cle) {
    const { rows: deja } = await q<{ id: string }>('SELECT id::text FROM gestion_copropriete_adresse WHERE copropriete_id = $1 AND cle_immeuble = $2 AND retire_le IS NULL', [coproId, cle]);
    if (deja.length === 0) {
      await q(`INSERT INTO gestion_copropriete_adresse (copropriete_id, cle_immeuble, libelle, code_postal, commune, cree_par, cree_par_libelle, sorte, ban_id)
               VALUES ($1, $2, $3, $4, $5, $6, $7, 'ecriture', $8)`, [coproId, cle, ecriture, l.codePostal, l.commune, auteur.id, auteur.libelle, ban.id]);
      ecritureAjoutee = true;
    }
  }
  if (creee || ecritureAjoutee) {
    await q(`INSERT INTO gestion_journal (entite, entite_id, action, commentaire, auteur_id, auteur_libelle) VALUES ('copropriete', $1, 'adresse_rattachee_import', $2, $3, $4)`,
      [coproId, `Import WIPPIMMO : ${creee ? 'copropriété créée sur l’adresse officielle' : 'écriture d’origine ajoutée'} — « ${ecriture} » → ${voie}`, auteur.id, auteur.libelle]);
  }
  return { ok: true, coproId, creee, ecritureAjoutee };
}

/** LES BIENS IMPORTÉS OU CHANGÉS, rapprochés et rattachés (dans la transaction de l'import). Rend le bilan. */
export async function rapprocherLotsImportes(q: RequeteTx, lots: readonly LotImporte[], auteur: Auteur = AUTEUR_IMPORT): Promise<BilanImportAdresses> {
  const bilan: BilanImportAdresses = { rapproches: 0, certains: 0, aVerifier: 0, introuvables: 0, rattaches: 0, coproprietesCreees: 0 };
  if (lots.length === 0 || !(await formatUniqueDisponible())) return bilan;
  for (const l of lots) {
    let r = await rapprocherBien({ immeuble: l.immeuble, adresse: l.adresse, codePostal: l.codePostal, commune: l.commune });
    let rattache: Rattachement | null = null;
    if (r.statut === 'certain' && r.ban !== null) {
      rattache = await rattacher(q, l, r, auteur);
      if (!rattache.ok) r = { ...r, statut: 'a_verifier', motif: rattache.motif };
    }
    const pose = await enregistrerRapprochement(q, l.id, r, { origine: 'import_wippimmo', methode: 'similarite_voie', motifFin: 'adresse WIPPIMMO importée ou changée' }, auteur);
    bilan.rapproches += 1;
    if (r.statut === 'certain') bilan.certains += 1; else if (r.statut === 'introuvable') bilan.introuvables += 1; else bilan.aVerifier += 1;
    if (rattache?.ok === true) { bilan.rattaches += 1; if (rattache.creee) bilan.coproprietesCreees += 1; }
    if (pose) {
      await q(`INSERT INTO gestion_journal (entite, entite_id, action, commentaire, auteur_id, auteur_libelle) VALUES ('annuaire_lot', $1, 'adresse_rapprochee_import', $2, $3, $4)`,
        [l.id, r.statut === 'certain'
          ? `Import WIPPIMMO : adresse officielle ${r.ban?.libelle ?? ''} (certaine)${rattache?.ok ? `, rattaché à la copropriété n° ${rattache.coproId}` : ''}`
          : `Import WIPPIMMO : adresse « ${immeubleDuBien(l)} » ${r.statut === 'introuvable' ? 'introuvable' : 'à vérifier'} — ${r.motif} (file « Adresses à vérifier »)`, auteur.id, auteur.libelle]);
    }
  }
  return bilan;
}
