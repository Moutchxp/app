import { query, withTransaction } from '../db/client';
import type { Auteur } from '../gestion/gestes';
import { SQL_AUJOURDHUI_PARIS } from '../temps/paris';
import { colonneExisteMemo } from './sondeLocation';
import { verifierDestinataires, type Destinataire } from './mailNouvelleLocation';
import { lireDestinatairesDefaut } from './mailNouvelleLocationRepo';
import { emailDeLAuteur } from './mailPortefeuilleRepo';
import { baremesDisponibles } from './honorairesProprietaireRepo';
import { refusVersionBareme, verifierBareme, type VersionBareme } from './honorairesProprietaire';
import type { Issue } from './locationRepo';

/**
 * ══ 🔴🔴 LOCATION — L'ESPACE « PARAMÈTRES LOCATION » (roue crantée de l'accueil, administrateurs seulement) (Arno, 21/10/2026). ═
 * IMPUR (base). Deux onglets :
 *   · « Destinataires du mail » : la liste par défaut du mail « Nouvelle location » — une NOUVELLE version de la liste à chaque
 *     enregistrement (table en ajout seul, migration 395) ; la plus récente fait foi ;
 *   · « Barèmes d'honoraires » : les VERSIONS DATÉES (migration 392, règles de la 395). 🔴 RÈGLE ABSOLUE : « Enregistrer » crée
 *     une NOUVELLE version, jamais antérieure à la précédente ; une version déjà utilisée par un bail ne se modifie ni ne se
 *     supprime (verrou en base) ; seule une version FUTURE jamais utilisée se corrige. Les honoraires ENREGISTRÉS ne sont jamais
 *     recalculés : ils vivent dans les conditions d'entrée du bail (ajout seul), avec l'identifiant de la version utilisée.
 * Tout est journalisé (`gestion_journal`).
 */

export function parametresDisponibles(): Promise<boolean> {
  return colonneExisteMemo('gestion_location_mail_destinataires', 'liste');
}
export function versionsBaremesDisponibles(): Promise<boolean> {
  return colonneExisteMemo('gestion_bareme_honoraires_location', 'corrige_le');
}

export interface ParametresLocation {
  destinataires: Destinataire[];
  /** La dernière modification de la liste (qui, quand) ; `null` : l'amorce de la migration. */
  destinatairesSaisis: { le: string; par: string } | null;
  versions: VersionBareme[];
  /** « AAAA-MM-JJ » à Paris : la date proposée par défaut pour une nouvelle version. */
  aujourdhui: string;
  /** Ce qui manque en base, pour le dire à l'écran (« migration 395 »). */
  manquantes: string[];
}

/** Les versions des barèmes, avec le nombre de baux qui les utilisent et qui les a créées / corrigées. */
export async function lireVersionsBaremes(): Promise<VersionBareme[]> {
  if (!(await baremesDisponibles())) return [];
  const corrige = (await versionsBaremesDisponibles()) ? 'b.corrige_le::text, b.corrige_par_libelle' : 'NULL::text AS corrige_le, NULL::text AS corrige_par_libelle';
  const { rows } = await query<{ id: string; depuis: string; t: string; z: string; a: string; e: string; source: string; saisi_le: string; saisi_par_libelle: string;
    corrige_le: string | null; corrige_par_libelle: string | null; baux: number }>(
    `SELECT b.id::text, b.depuis::text, b.tres_tendue_m2::text AS t, b.tendue_m2::text AS z, b.autre_m2::text AS a, b.etat_des_lieux_m2::text AS e,
            b.source, b.saisi_le::text, b.saisi_par_libelle, ${corrige},
            (SELECT count(DISTINCT coalesce('b' || c.bail_id::text, 'c' || c.bail_cle))::int FROM gestion_location_conditions_entree c WHERE c.hono_bareme_id = b.id) AS baux
       FROM gestion_bareme_honoraires_location b ORDER BY b.depuis DESC, b.id DESC`);
  return rows.map((r) => ({
    id: Number(r.id), depuis: r.depuis, tresTendue: r.t, tendue: r.z, autre: r.a, etatDesLieux: r.e, source: r.source,
    saisiLe: r.saisi_le, saisiPar: r.saisi_par_libelle, corrigeLe: r.corrige_le, corrigePar: r.corrige_par_libelle, baux: r.baux,
  }));
}

export async function lireParametresLocation(): Promise<ParametresLocation> {
  const avec395 = await parametresDisponibles();
  let saisis: ParametresLocation['destinatairesSaisis'] = null;
  if (avec395) {
    const { rows } = await query<{ le: string; par: string }>('SELECT saisi_le::text AS le, saisi_par_libelle AS par FROM gestion_location_mail_destinataires ORDER BY id DESC LIMIT 1');
    saisis = rows[0] ?? null;
  }
  const { rows: j } = await query<{ jour: string }>(`SELECT ${SQL_AUJOURDHUI_PARIS}::text AS jour`);
  return {
    destinataires: await lireDestinatairesDefaut(), destinatairesSaisis: saisis, versions: await lireVersionsBaremes(),
    aujourdhui: j[0]?.jour ?? new Date().toISOString().slice(0, 10), manquantes: avec395 ? [] : ['395'],
  };
}

/** Enregistre une NOUVELLE version de la liste des destinataires par défaut (la précédente reste en base). */
export async function enregistrerDestinataires(brut: unknown, auteur: Auteur): Promise<Issue> {
  if (!(await parametresDisponibles())) return { etat: 'sans_schema' };
  const v = verifierDestinataires(brut);
  if (!v.ok) return { etat: 'refus', motif: v.motif };
  const { nom } = await emailDeLAuteur(auteur);
  return withTransaction(async (q): Promise<Issue> => {
    await q('INSERT INTO gestion_location_mail_destinataires (liste, saisi_par, saisi_par_libelle) VALUES ($1::jsonb, $2, $3)',
      [JSON.stringify(v.liste), auteur.id, nom || auteur.libelle]);
    await q(
      `INSERT INTO gestion_journal (entite, entite_id, action, valeur_apres, commentaire, auteur_id, auteur_libelle)
       VALUES ('annuaire', 0, 'location_mail_destinataires', $1, $2, $3, $4)`,
      [v.liste.map((d) => `${d.adresse}${d.libelle ? ` (${d.libelle})` : ''}`).join(', '), 'destinataires par défaut du mail « Nouvelle location »', auteur.id, auteur.libelle]);
    return { etat: 'ok', data: undefined };
  });
}

/** Le texte d'une erreur du verrou en base (migration 395), lisible tel quel ; `null` si ce n'en est pas une. */
function motifDuVerrou(e: unknown): string | null {
  const m = (e as { message?: string })?.message ?? '';
  return m.startsWith('Barème d\'honoraires') ? m.replace(/ — migration 395$/, '.') : null;
}

/**
 * « Enregistrer » une NOUVELLE VERSION : date « Applicable à partir du » (aujourd'hui par défaut à l'écran), jamais antérieure
 * à la version la plus récente. Les versions existantes ne changent pas. Journalisé.
 */
export async function ajouterVersionBareme(brut: Record<string, unknown>, auteur: Auteur): Promise<Issue> {
  if (!(await versionsBaremesDisponibles())) return { etat: 'sans_schema' };
  const { nom } = await emailDeLAuteur(auteur);
  const v = verifierBareme({ ...brut, source: typeof brut.source === 'string' && brut.source.trim() !== '' ? brut.source : `Paramètres Location — saisie de ${nom || auteur.libelle}` });
  if (!v.ok) return { etat: 'refus', motif: v.motif };
  const versions = await lireVersionsBaremes();
  const refus = refusVersionBareme({ depuis: v.valeurs.depuis, versions, aujourdhui: (await lireParametresLocation()).aujourdhui });
  if (refus !== null) return { etat: 'refus', motif: refus };
  const b = v.valeurs;
  try {
    return await withTransaction(async (q): Promise<Issue> => {
      await q(
        `INSERT INTO gestion_bareme_honoraires_location (depuis, tres_tendue_m2, tendue_m2, autre_m2, etat_des_lieux_m2, source, saisi_par, saisi_par_libelle)
         VALUES ($1::date, $2, $3, $4, $5, $6, $7, $8)`, [b.depuis, b.tresTendue, b.tendue, b.autre, b.etatDesLieux, b.source, auteur.id, nom || auteur.libelle]);
      await q(
        `INSERT INTO gestion_journal (entite, entite_id, action, valeur_apres, commentaire, auteur_id, auteur_libelle)
         VALUES ('annuaire', 0, 'honoraires_location_bareme', $1, $2, $3, $4)`,
        [`nouvelle version applicable à partir du ${b.depuis} : très tendue ${b.tresTendue}, tendue ${b.tendue}, autre ${b.autre}, état des lieux ${b.etatDesLieux} (€ TTC/m²)`,
          `barème des honoraires de location — ${b.source}`, auteur.id, auteur.libelle]);
      return { etat: 'ok', data: undefined };
    });
  } catch (e) {
    const motif = motifDuVerrou(e);
    if (motif !== null) return { etat: 'refus', motif };
    throw e;
  }
}

/**
 * CORRIGER une version FUTURE jamais utilisée (date d'effet après aujourd'hui, aucun bail). Toute autre version est refusée —
 * par l'application, et par le verrou en base (migration 395). Journalisé (avant / après).
 */
export async function corrigerVersionBareme(id: number, brut: Record<string, unknown>, auteur: Auteur): Promise<Issue> {
  if (!(await versionsBaremesDisponibles())) return { etat: 'sans_schema' };
  const versions = await lireVersionsBaremes();
  const cible = versions.find((x) => x.id === id);
  if (cible === undefined) return { etat: 'inconnu' };
  const { aujourdhui } = await lireParametresLocation();
  const v = verifierBareme({ ...brut, source: typeof brut.source === 'string' && brut.source.trim() !== '' ? brut.source : cible.source });
  if (!v.ok) return { etat: 'refus', motif: v.motif };
  const refus = refusVersionBareme({ depuis: v.valeurs.depuis, versions, aujourdhui, corrigee: cible });
  if (refus !== null) return { etat: 'refus', motif: refus };
  const { nom } = await emailDeLAuteur(auteur);
  const b = v.valeurs;
  try {
    return await withTransaction(async (q): Promise<Issue> => {
      await q(
        `UPDATE gestion_bareme_honoraires_location SET depuis = $2::date, tres_tendue_m2 = $3, tendue_m2 = $4, autre_m2 = $5, etat_des_lieux_m2 = $6, source = $7,
                corrige_le = now(), corrige_par_libelle = $8 WHERE id = $1`,
        [id, b.depuis, b.tresTendue, b.tendue, b.autre, b.etatDesLieux, b.source, nom || auteur.libelle]);
      await q(
        `INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle)
         VALUES ('annuaire', 0, 'honoraires_location_bareme_corrige', $1, $2, $3, $4, $5)`,
        [`version ${id} : à partir du ${cible.depuis}, ${cible.tresTendue} / ${cible.tendue} / ${cible.autre} / EDL ${cible.etatDesLieux}`,
          `version ${id} : à partir du ${b.depuis}, ${b.tresTendue} / ${b.tendue} / ${b.autre} / EDL ${b.etatDesLieux}`,
          'correction d’une version future jamais utilisée du barème des honoraires de location', auteur.id, auteur.libelle]);
      return { etat: 'ok', data: undefined };
    });
  } catch (e) {
    const motif = motifDuVerrou(e);
    if (motif !== null) return { etat: 'refus', motif };
    throw e;
  }
}
