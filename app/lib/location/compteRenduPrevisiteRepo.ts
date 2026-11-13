import { query } from '../db/client';
import { chargerConfigGestion } from '../gestion/config';
import { encartDuBail } from './sortieLocatairesRepo';
import { ficheDepuisEncart } from './ficheIntervention';
import { locatairesAvis, mailsAvisDisponibles, piecesDuMailDisponible } from './mailsPreavisSortieRepo';
import { metaPieces } from './piecesSortieRepo';
import { lireGroupe, previsiteDisponible, suiviOuvert } from './previsiteBase';
import { compteRenduAffiche, type AnnuaireCr, type CompteRenduAffiche, type EnvoiJournalCr } from './compteRenduPrevisite';

/**
 * ══ 🔴 Arno (13/11/2026) — LE COMPTE RENDU DE PRÉ-VISITE D'UN PRÉAVIS, EN LECTURE SEULE ═══════════════════════════════════════════════════════
 * Le suivi ouvert du préavis (`gestion_location_previsite`) et les envois du compte rendu de CE suivi (journal 457, sorte
 * `previsite_compte_rendu`, mêmes occupations, depuis la création du suivi). Les noms : les locataires du préavis, les propriétaires (encart du
 * bail), les comptes de l'agence. Rien n'est écrit. Sans la 464 / la 457 : `null`.
 */
const SQL_ENVOIS = (pieces: boolean) => `
  SELECT m.destinataires, m.copies, m.objet, m.texte, m.statut, m.erreur,
         to_char(m.envoye_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS envoye_le, m.auteur_libelle,
         ${pieces ? 'm.piece_ids::text[]' : "'{}'::text[]"} AS piece_ids
    FROM gestion_location_mail_avis m JOIN gestion_location_previsite s ON s.id = $1
   WHERE m.sorte = 'previsite_compte_rendu' AND m.lot_id = s.lot_id AND m.occupation_ids && s.occupation_ids AND m.envoye_le >= s.cree_le
   ORDER BY m.envoye_le, m.id`;

export async function lireCompteRenduPrevisite(occupationIds: readonly number[]): Promise<{ etat: 'ok'; data: CompteRenduAffiche } | { etat: 'inconnu' } | { etat: 'sans_schema' }> {
  if (!(await previsiteDisponible()) || !(await mailsAvisDisponibles())) return { etat: 'sans_schema' };
  const ids = [...new Set(occupationIds)];
  const g = await lireGroupe(query, ids);
  if (!g.ok) return { etat: 'inconnu' };
  const s = await suiviOuvert(query, g.g.cle);
  if (s === null) return { etat: 'ok', data: compteRenduAffiche([], vide(), { effectueeLe: null, effectueePar: null }) };
  const { rows } = await query<{ destinataires: string[]; copies: string[]; objet: string; texte: string; statut: 'envoye' | 'echec'; erreur: string | null;
    envoye_le: string; auteur_libelle: string; piece_ids: string[] }>(SQL_ENVOIS(await piecesDuMailDisponible().catch(() => false)), [Number(s.id)]);
  const par = await query<{ p: string | null }>('SELECT effectuee_par_libelle AS p FROM gestion_location_previsite WHERE id = $1', [Number(s.id)]);
  const envois: EnvoiJournalCr[] = rows.map((r) => ({ destinataires: r.destinataires ?? [], copies: r.copies ?? [], objet: r.objet, texte: r.texte, statut: r.statut,
    erreur: r.erreur, envoyeLe: r.envoye_le, auteur: r.auteur_libelle, pieceIds: (r.piece_ids ?? []).map(Number) }));
  const pieceIds = [...new Set(envois.flatMap((e) => e.pieceIds))];
  const pieces = (await metaPieces(pieceIds, ids)).map((p) => ({ id: p.id, nom: p.nom, taille: p.taille }));
  return { etat: 'ok', data: compteRenduAffiche(envois, await annuaire(ids), { effectueeLe: s.effectuee_le, effectueePar: par.rows[0]?.p ?? null }, pieces) };
}

const vide = (): AnnuaireCr => ({ locataires: [], proprietaires: [], internes: [], domainesAgence: [] });

async function annuaire(ids: readonly number[]): Promise<AnnuaireCr> {
  const locataires = await locatairesAvis(ids);
  const encart = ids.length === 0 ? null : await encartDuBail(ids[0]).catch(() => null);
  const proprietaires = encart === null ? [] : ficheDepuisEncart(encart).proprietaires.map((p) => ({ nom: p.nom, emails: p.emails }));
  const { rows } = await query<{ identifiant: string; prenom: string | null; nom: string | null }>(
    `SELECT identifiant, prenom, nom FROM admin_utilisateur WHERE identifiant LIKE '%@%'`);
  const internes = rows.map((r) => ({ email: r.identifiant, nom: [r.prenom ?? '', r.nom ?? ''].map((x) => x.trim()).filter(Boolean).join(' ') || r.identifiant }));
  const gestion = (await chargerConfigGestion().catch(() => null))?.adresseGestion ?? '';
  const domainesAgence = [...new Set([gestion, ...internes.map((i) => i.email)].map((x) => x.split('@')[1] ?? '').filter(Boolean))];
  return { locataires, proprietaires, internes, domainesAgence };
}
