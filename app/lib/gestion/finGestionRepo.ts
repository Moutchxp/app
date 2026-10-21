import { query, withTransaction } from '../db/client';
import type { Auteur } from './gestes';
import type { Issue } from '../location/locationRepo';
import { colonneExisteMemo } from '../location/sondeLocation';
import { aArchiver, CLE_DELAI, DELAI_DEFAUT_MOIS, echeanceArchivage, phraseArchivage, verifierDelai } from './finGestion';
import { estStatutBien, type StatutBien } from './statutBien';
import { aujourdhuiParis } from './statutBien';
import { sqlArchiveBien, sqlStatutBien, statutBienDisponible } from './statutBienRepo';

/**
 * ══ 🔴🔴 LA FIN DE GESTION EN DEUX TEMPS — ARCHIVAGE AUTOMATIQUE (Arno, 21/10/2026, migration 405). IMPUR (base). ═════════════
 *
 * La passe QUOTIDIENNE (`gestion:archiver-fins`, minuteur systemd) : chaque bien en « Gestion terminée » dont la date de fin + le
 * délai est atteinte est ARCHIVÉ — son statut ACTUEL relu et verrouillé JUSTE AVANT (repris en gestion, passé en location seule,
 * déjà archivé : rien) ; la marque `statut_archive_le` posée (ses annexes rattachées suivent, déclencheur de la 405) ; une ligne à
 * l'Historique. Le dossier Drive est déplacé APRÈS, par l'appelant : un échec n'annule pas l'archivage (la fiche dit « Dossier Drive
 * à déplacer »). IDEMPOTENTE : un bien archivé ne l'est jamais deux fois. 🔴 Aucun DELETE.
 */
export function finGestionDisponible(): Promise<boolean> {
  return colonneExisteMemo('gestion_annuaire_lot', 'statut_archive_le');
}

export const MOTIF_SANS_405 = 'Mise à jour de la base à appliquer (migration 405) : l’archivage des fins de gestion n’est pas encore en place.';

/** Le délai d'archivage en vigueur (mois) : la dernière valeur réglée, sinon 24. */
export async function delaiArchivageMois(): Promise<number> {
  if (!(await colonneExisteMemo('gestion_location_reglage', 'valeur_entiere'))) return DELAI_DEFAUT_MOIS;
  const { rows } = await query<{ v: number }>(
    'SELECT valeur_entiere AS v FROM gestion_location_reglage WHERE cle = $1 ORDER BY pose_le DESC, id DESC LIMIT 1', [CLE_DELAI]);
  return rows[0]?.v ?? DELAI_DEFAUT_MOIS;
}

/** Régler le délai (Paramètres Location) : une ligne de plus, l'historique reste. Il vaut pour les biens PAS ENCORE archivés. */
export async function enregistrerDelaiArchivage(brut: unknown, auteur: Auteur): Promise<Issue<{ mois: number }>> {
  if (!(await colonneExisteMemo('gestion_location_reglage', 'valeur_entiere'))) return { etat: 'sans_schema' };
  const v = verifierDelai(brut);
  if (!v.ok) return { etat: 'refus', motif: v.motif };
  await query('INSERT INTO gestion_location_reglage (cle, valeur_entiere, pose_par) VALUES ($1, $2, $3)', [CLE_DELAI, v.mois, auteur.libelle]);
  return { etat: 'ok', data: { mois: v.mois } };
}

export interface BienEnFinDeGestion { lotId: number; titre: string; fin: string; echeance: string; aArchiver: boolean; n5: string | null }

/** Les biens en « Gestion terminée » (hors annexes rattachées), leur échéance, et s'ils sont à archiver à cette date. LECTURE SEULE. */
export async function biensEnFinDeGestion(aujourdhui: string, delai?: number): Promise<BienEnFinDeGestion[]> {
  const mois = delai ?? await delaiArchivageMois();
  /* Sans les migrations 403-405 (lecture À BLANC seulement) : le statut se déduit par la règle de reprise, et la date de fin est la
     fin de gestion réelle (à défaut la sortie du portefeuille) — exactement ce que la reprise posera. */
  const avec403 = await statutBienDisponible();
  const sorti = (await colonneExisteMemo('gestion_annuaire_lot', 'sorti_portefeuille_le')) ? `(lo.sorti_portefeuille_le AT TIME ZONE 'Europe/Paris')::date` : 'NULL::date';
  const fin = avec403 ? 'lo.statut_bien_depuis' : `coalesce(lo.gestion_fin, ${sorti})`;
  const avecDetache = await colonneExisteMemo('gestion_annuaire_lot', 'annexe_detachee_le');
  const avecAnnexe = await colonneExisteMemo('gestion_lot_annexe', 'annexe_id');
  const avecNoeuds = await colonneExisteMemo('gestion_drive_noeud', 'lot_id');
  const { rows } = await query<{ id: string; adresse: string | null; commune: string | null; fin: string | null; n5: string | null }>(
    `SELECT lo.id::text, lo.adresse, lo.commune, (${fin})::text AS fin,
            ${avecNoeuds ? `(SELECT n.drive_id FROM gestion_drive_noeud n WHERE n.sorte = 'bien' AND n.lot_id = lo.id LIMIT 1)` : 'NULL::text'} AS n5
       FROM gestion_annuaire_lot lo
      WHERE ${await sqlStatutBien('lo')} = 'ancienne_gestion' AND ${await sqlArchiveBien('lo')} IS NULL
        ${avecAnnexe ? `AND NOT EXISTS (SELECT 1 FROM gestion_lot_annexe ax WHERE ax.annexe_id = lo.id${avecDetache ? ' AND lo.annexe_detachee_le IS NULL' : ''})` : ''}
      ORDER BY ${fin} NULLS LAST, lo.id`);
  return rows.filter((r) => r.fin !== null).map((r) => {
    const b = { statut: 'ancienne_gestion' as StatutBien, archiveLe: null, fin: r.fin };
    return { lotId: Number(r.id), titre: [r.adresse, r.commune].filter((x) => x).join(', ') || `Bien ${r.id}`, fin: r.fin as string,
      echeance: echeanceArchivage(b, mois) as string, aArchiver: aArchiver(b, mois, aujourdhui), n5: r.n5 };
  });
}

export type IssueArchivage = { archive: true; phrase: string } | { archive: false; motif: string };

/**
 * ARCHIVER UN BIEN, si — et seulement si — son statut ACTUEL (relu et verrouillé) est toujours « Gestion terminée » et l'échéance
 * atteinte à `maintenant`. Journalisé dans l'Historique du bien (et de ses annexes rattachées).
 */
export async function archiverBien(lotId: number, maintenant: Date, auteur: Auteur): Promise<IssueArchivage> {
  if (!(await finGestionDisponible())) return { archive: false, motif: MOTIF_SANS_405 };
  const mois = await delaiArchivageMois();
  const aujourdhui = aujourdhuiParis(maintenant);
  return withTransaction(async (q) => {
    const { rows } = await q<{ s: string; fin: string | null; a: string | null }>(
      'SELECT statut_bien AS s, statut_bien_depuis::text AS fin, statut_archive_le::text AS a FROM gestion_annuaire_lot WHERE id = $1 FOR UPDATE', [lotId]);
    const r = rows[0];
    if (r === undefined || !estStatutBien(r.s)) return { archive: false, motif: 'Ce bien n’existe pas.' };
    const b = { statut: r.s as StatutBien, archiveLe: r.a, fin: r.fin };
    if (r.s !== 'ancienne_gestion') return { archive: false, motif: `Le bien n’est plus en fin de gestion (statut actuel : ${r.s}) : rien n’est archivé.` };
    if (r.a !== null) return { archive: false, motif: 'Le bien est déjà archivé.' };
    if (!aArchiver(b, mois, aujourdhui)) return { archive: false, motif: `L’échéance (${echeanceArchivage(b, mois)}) n’est pas atteinte.` };
    const phrase = phraseArchivage(r.fin as string, mois);
    await q('UPDATE gestion_annuaire_lot SET statut_archive_le = $2::timestamptz WHERE id = $1', [lotId, maintenant.toISOString()]);
    const { rows: suivis } = await q<{ id: string }>(
      `SELECT an.id::text FROM gestion_lot_annexe ax JOIN gestion_annuaire_lot an ON an.id = ax.annexe_id
        WHERE ax.parent_id = $1 AND an.annexe_detachee_le IS NULL AND an.statut_archive_le IS NOT NULL`, [lotId]);
    for (const id of [lotId, ...suivis.map((x) => Number(x.id))]) {
      await q(`INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle)
               VALUES ('annuaire_lot', $1, 'statut_bien_archive', 'gestion terminée', 'ancienne gestion archivée', $2, $3, $4)`,
        [id, id === lotId ? phrase : `${phrase} (annexe : suit le bien ${lotId})`, auteur.id, auteur.libelle]);
    }
    return { archive: true, phrase };
  });
}

/** Les archivages journalisés d'un bien (l'Historique). */
export async function archivagesDuBien(lotId: number): Promise<{ id: number; quand: string; texte: string; par: string }[]> {
  const { rows } = await query<{ id: string; quand: string; commentaire: string | null; auteur_libelle: string | null }>(
    `SELECT id::text, survenu_le::text AS quand, commentaire, auteur_libelle FROM gestion_journal
      WHERE entite = 'annuaire_lot' AND entite_id = $1 AND action = 'statut_bien_archive' ORDER BY survenu_le DESC, id DESC LIMIT 50`, [lotId]);
  return rows.map((r) => ({ id: Number(r.id), quand: r.quand, texte: r.commentaire ?? 'Archivage automatique', par: r.auteur_libelle ?? '—' }));
}

export interface PasseArchivage {
  reel: boolean; aujourdhui: string; delai: number;
  enCours: BienEnFinDeGestion[];
  archives: { lotId: number; phrase: string; drive: { ok: boolean; motif: string | null } | null }[];
  ignores: { lotId: number; motif: string }[];
}

/**
 * LA PASSE : à blanc (par défaut), la liste des biens qui SERAIENT archivés ; réelle, l'archivage de chacun (relu juste avant),
 * puis son dossier Drive (`deplacer`, injecté ; un échec est rendu, jamais bloquant).
 */
export async function passerArchivage(o: { reel: boolean; maintenant: Date; auteur: Auteur;
  deplacer?: (lotId: number) => Promise<{ ok: boolean; motif: string | null }> }): Promise<PasseArchivage> {
  const aujourdhui = aujourdhuiParis(o.maintenant);
  const delai = await delaiArchivageMois();
  const enCours = await biensEnFinDeGestion(aujourdhui, delai);
  const passe: PasseArchivage = { reel: o.reel, aujourdhui, delai, enCours, archives: [], ignores: [] };
  if (!o.reel) return passe;
  for (const b of enCours.filter((x) => x.aArchiver)) {
    const r = await archiverBien(b.lotId, o.maintenant, o.auteur);
    if (!r.archive) { passe.ignores.push({ lotId: b.lotId, motif: r.motif }); continue; }
    const drive = o.deplacer === undefined ? null
      : await o.deplacer(b.lotId).catch((e: unknown) => ({ ok: false, motif: (e as Error)?.message ?? 'Le Drive n’a pas répondu.' }));
    passe.archives.push({ lotId: b.lotId, phrase: r.phrase, drive });
  }
  return passe;
}
