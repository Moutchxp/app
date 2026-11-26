import { withTransaction } from '../db/client';
import { motifExclusiviteAdresse } from './adresseCoproExclusivite';
import type { Auteur } from './gestes';
import { ficheCopropriete } from './coproprieteRepo';
import { adresseImmeuble, cleImmeuble, nomAvecVille } from './syndics';
import { noterRetraitDAdressesRegroupees } from './regroupementCoproprietesRepo';
import type { FicheCopropriete } from './copropriete';
import { MOTIF_ADRESSE_ABSENTE, MOTIF_PRINCIPALE_NON_RETIRABLE, resumeAdresse, texteRetraitAdresse } from './adresseCoproGestes';

/**
 * ══ 🔴🔴 « RETIRER CETTE ADRESSE » ET « DÉFINIR COMME ADRESSE PRINCIPALE » (Arno, 26/11/2026, 12h50, point 1). IMPUR (base). ════════════════════════
 *
 * Deux gestes IMMÉDIATS de la fiche Copropriété, chacun dans UNE transaction, journalisés dans l'historique de la copropriété ; rien n'est effacé.
 *   · retirer : l'adresse secondaire reçoit `retire_le` (jamais supprimée) ; une adresse posée par un regroupement le dit à ses biens (504) ; les biens
 *     de l'adresse perdent le syndic de la copropriété (une ligne de journal par bien, comme le « × » d'avant) ; le journal de la copropriété dit
 *     l'adresse, ses digicodes et bâtiments (partis avec elle : ils restent attachés à l'adresse) et ses biens. L'adresse principale : refus.
 *   · définir comme principale : l'adresse secondaire devient l'adresse principale (clé, libellé, code postal, commune, adresse officielle de la
 *     copropriété), l'ancienne principale devient une adresse de la copropriété ; rien d'autre ne bouge (digicodes et bâtiments sont rangés par
 *     adresse, contacts, syndic, AG, arrêté des comptes par la copropriété).
 */

class RefusGeste extends Error {}
const texte = (v: unknown, max = 300): string => (typeof v === 'string' ? v.slice(0, max) : '');
type Issue = { ok: true; fiche: FicheCopropriete } | { ok: false; motif: string };

async function lireEtVerifier(b: Record<string, unknown>): Promise<{ lue: FicheCopropriete; cle: string } | { ok: false; motif: string }> {
  const lue = await ficheCopropriete(texte(b.immeuble));
  if (lue === null || !lue.declaree || lue.id === null) return { ok: false, motif: 'Cette copropriété n’est pas encore enregistrée : validez d’abord la fiche.' };
  return { lue, cle: cleImmeuble(texte(b.adresseCle)) };
}

/** « Retirer cette adresse » (« Oui, retirer cette adresse »). */
export async function retirerAdresseCopro(brut: unknown, auteur: Auteur): Promise<Issue> {
  const v = await lireEtVerifier((brut ?? {}) as Record<string, unknown>);
  if ('ok' in v) return v;
  const { lue, cle } = v;
  if (cle === lue.cle) return { ok: false, motif: MOTIF_PRINCIPALE_NON_RETIRABLE };
  const adresse = lue.adresses.find((a) => !a.principale && a.cle === cle);
  if (adresse === undefined) return { ok: false, motif: MOTIF_ADRESSE_ABSENTE };
  const d = lue.digicodes.find((x) => x.cle === cle);
  const biens = lue.biens.filter((x) => x.cle === cle);
  const resume = resumeAdresse(d === undefined ? null : { commun: d.commun, batiments: d.batiments }, biens);
  try {
    await withTransaction(async (q) => {
      const { rows } = await q<{ id: string }>(
        'SELECT id::text FROM gestion_copropriete_adresse WHERE copropriete_id = $1 AND cle_immeuble = $2 AND retire_le IS NULL FOR UPDATE', [lue.id, cle]);
      if (rows[0] === undefined) throw new RefusGeste(MOTIF_ADRESSE_ABSENTE);
      await q('UPDATE gestion_copropriete_adresse SET retire_le = now(), retire_par_libelle = $2 WHERE id = $1', [rows[0].id, auteur.libelle]);
      await noterRetraitDAdressesRegroupees(q, [rows[0].id], 'depuis la fiche copropriété (« Retirer cette adresse »)', auteur);
      if (lue.syndic !== null) {
        const syndic = nomAvecVille(lue.syndic.nom, lue.syndic.ville);
        for (const x of lue.biens.filter((y) => y.cle === cle)) {
          await q(`INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, commentaire, auteur_id, auteur_libelle) VALUES ('annuaire_lot', $1, 'syndic_retire', $2, $3, $4, $5)`,
            [x.id, syndic, `Syndic ${syndic} retiré de l’adresse ${adresse.libelle} (retirée de la copropriété ${lue.libelle}, depuis la fiche copropriété)`, auteur.id, auteur.libelle]);
        }
      }
      await q(`INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, commentaire, auteur_id, auteur_libelle) VALUES ('copropriete', $1, 'adresse_retiree', $2, $3, $4, $5)`,
        [lue.id, cle, texteRetraitAdresse(adresse, resume), auteur.id, auteur.libelle]);
    });
  } catch (e) {
    if (e instanceof RefusGeste) return { ok: false, motif: e.message };
    const m = motifExclusiviteAdresse(e); // 🔴🔴 (décision d'Arno du 26/11/2026, 520) le refus de la base, en mots
    if (m !== null) return { ok: false, motif: m };
    throw e;
  }
  return { ok: true, fiche: (await ficheCopropriete(lue.cle))! };
}

/** « Définir comme adresse principale ». */
export async function definirAdressePrincipale(brut: unknown, auteur: Auteur): Promise<Issue> {
  const v = await lireEtVerifier((brut ?? {}) as Record<string, unknown>);
  if ('ok' in v) return v;
  const { lue, cle } = v;
  if (cle === lue.cle) return { ok: false, motif: 'C’est déjà l’adresse principale de la copropriété.' };
  try {
    await withTransaction(async (q) => {
      const { rows: [c] } = await q<{ cle: string; libelle: string; code_postal: string | null; commune: string | null; ban_id: string | null }>(
        'SELECT cle_immeuble AS cle, libelle, code_postal, commune, ban_id FROM gestion_copropriete WHERE id = $1 FOR UPDATE', [lue.id]);
      const { rows: [a] } = await q<{ id: string; libelle: string; code_postal: string | null; commune: string | null; ban_id: string | null; sorte: string | null; regroupement_id: string | null }>(
        `SELECT id::text, libelle, code_postal, commune, ban_id, sorte, regroupement_id::text FROM gestion_copropriete_adresse
          WHERE copropriete_id = $1 AND cle_immeuble = $2 AND retire_le IS NULL FOR UPDATE`, [lue.id, cle]);
      if (c === undefined || a === undefined) throw new RefusGeste(MOTIF_ADRESSE_ABSENTE);
      if (a.sorte === 'ecriture') throw new RefusGeste('Une écriture d’origine (WIPPIMMO) ne peut pas devenir l’adresse principale : choisissez une adresse de la copropriété.');
      if (a.regroupement_id !== null) throw new RefusGeste('Cette adresse vient d’un regroupement de copropriétés : elle ne peut pas devenir l’adresse principale d’ici.');
      // l'ordre compte (index uniques) : l'adresse devient la principale, puis l'ancienne principale devient une adresse
      await q('UPDATE gestion_copropriete_adresse SET retire_le = now(), retire_par_libelle = $2 WHERE id = $1', [a.id, auteur.libelle]);
      await q(`UPDATE gestion_copropriete SET cle_immeuble = $2, libelle = $3, code_postal = coalesce($4, code_postal), commune = coalesce($5, commune), ban_id = $6 WHERE id = $1`,
        [lue.id, cle, a.libelle, a.code_postal, a.commune, a.ban_id]);
      await q(`INSERT INTO gestion_copropriete_adresse (copropriete_id, cle_immeuble, libelle, code_postal, commune, cree_par, cree_par_libelle, sorte, ban_id) VALUES ($1, $2, $3, $4, $5, $6, $7, 'adresse', $8)`,
        [lue.id, c.cle, c.libelle, c.code_postal, c.commune, auteur.id, auteur.libelle, c.ban_id]);
      await q(`INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle) VALUES ('copropriete', $1, 'adresse_principale_changee', $2, $3, $4, $5, $6)`,
        [lue.id, c.cle, cle, `Adresse principale : ${adresseImmeuble(a.libelle, a.code_postal ?? c.code_postal, a.commune ?? c.commune)} (avant : ${adresseImmeuble(c.libelle, c.code_postal, c.commune)}, qui reste une adresse de la copropriété)`,
          auteur.id, auteur.libelle]);
    });
  } catch (e) {
    if (e instanceof RefusGeste) return { ok: false, motif: e.message };
    const m = motifExclusiviteAdresse(e); // 🔴🔴 (décision d'Arno du 26/11/2026, 520) le refus de la base, en mots
    if (m !== null) return { ok: false, motif: m };
    throw e;
  }
  return { ok: true, fiche: (await ficheCopropriete(cle))! };
}
