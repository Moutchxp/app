import 'server-only';
import { query } from '../../db/client';
import { colonneExisteMemo } from '../sondeLocation';
import { familleDeCategorie } from '../bienComplet';
import type { Origine, TypeActivite, CategoriePrime } from './suivi';
import { estRecurrent, historiqueAnnees, type EcartFichier, type ActiviteCalcul, type ActiviteLue, type Assurance, type DonneesTableau, type LigneGestion, type Transition } from './tableauBord';
import type { ModeApporteur, ModePrime, OrigineContact } from './suivi';
import { annuaireDisponible, commissionGestionDisponible, origineDejaClientDisponible, lireApporteurs, lireCollegues, lireRegles, lireRetrocessions, suiviDisponible } from './suiviRepo';

/**
 * ══ LOCATION — « OUTILS DE SUIVI » : CE QUE LE TABLEAU DE BORD LIT (Arno, 22/10/2026) ════════════════════════════════════════
 * LECTURE SEULE. Les lignes d'activité des années demandées (non annulées), enrichies de ce que la base sait du bail :
 * l'assurance des loyers (conditions d'entrée, migration 391), la vacance avant l'entrée (sortie du bail précédent du même
 * bien), le parking (famille du bien). Et pour la gestion récurrente : les transitions de statut du bien (migration 403), le
 * nombre de biens en gestion aujourd'hui, les préavis reçus par mois. Une table absente (migration non appliquée) : rien.
 */

const n = (v: unknown): number => Number(v);
const nOuNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const iso = (v: unknown): string => (v instanceof Date ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}` : String(v).slice(0, 10));

export async function lireActivites(annees: readonly number[]): Promise<ActiviteLue[]> {
  if (!(await suiviDisponible()) || annees.length === 0) return [];
  const avecAssurance = await colonneExisteMemo('gestion_location_conditions_entree', 'bail_id');
  const avec407 = await annuaireDisponible();
  const avec411 = await colonneExisteMemo('gestion_location_activite', 'origine_contact_precision');
  const avec413 = await commissionGestionDisponible();
  const avecStatut = await colonneExisteMemo('gestion_bien_statut_transition', 'effet_le');
  const { rows } = await query<Record<string, unknown>>(
    `SELECT a.id, a.type, a.date_signature, a.date_signature_supposee, a.libelle_proprietaire, a.libelle_locataire,
            a.hono_proprietaire_ht, a.hono_locataire_ht, a.prime_gestion_saisie, a.mandat_gestion, a.categorie_prime,
            a.apporteur_id, ap.nom AS apporteur_nom, a.apporteur_taux, a.apporteur_commission_saisie,
            a.negociateur_id, a.negociateur_libelle, a.avec_gestion,
            coalesce(a.origine_proprietaire_saisie, a.origine_proprietaire_deduite) AS origine_proprietaire,
            coalesce(a.origine_locataire_saisie, a.origine_locataire_deduite) AS origine_locataire,
            a.loyer_hc, a.charges, a.rattachement, a.source, a.lot_id, a.bail_id, l.categorie,
            ${avec407 ? 'a.origine_contact, a.collegue_id, a.collegue_libelle, a.prime_mode' : 'NULL::text AS origine_contact, NULL::bigint AS collegue_id, NULL::text AS collegue_libelle, NULL::text AS prime_mode'},
            ${avec411 ? 'a.origine_contact_precision' : 'NULL::text AS origine_contact_precision'},
            ${avec413 ? 'a.apporteur_mode, a.apporteur_taux_gestion, a.taux_gestion_bien_ht' : 'NULL::text AS apporteur_mode, NULL::numeric AS apporteur_taux_gestion, NULL::numeric AS taux_gestion_bien_ht'},
            ${avecStatut ? `(SELECT min(t.effet_le) FROM gestion_bien_statut_transition t
                              WHERE t.lot_id = a.lot_id AND t.avant = 'en_gestion' AND t.apres <> 'en_gestion' AND t.effet_le >= a.date_signature)` : 'NULL::date'} AS fin_gestion,
            ${avecAssurance ? `(SELECT ce.assurance_loyers FROM gestion_location_conditions_entree ce WHERE ce.bail_id = a.bail_id ORDER BY ce.id DESC LIMIT 1)` : 'NULL::text'} AS assurance,
            (SELECT b.entree - max(p.sortie) FROM gestion_bail b JOIN gestion_bail p ON p.lot_id = b.lot_id AND p.id <> b.id AND p.sortie IS NOT NULL AND p.sortie <= b.entree
              WHERE b.id = a.bail_id GROUP BY b.entree) AS vacance
       FROM gestion_location_activite a
       LEFT JOIN gestion_location_apporteur ap ON ap.id = a.apporteur_id
       LEFT JOIN gestion_annuaire_lot l ON l.id = a.lot_id
      WHERE a.annule_le IS NULL AND extract(year FROM a.date_signature)::int = ANY($1::int[])
      ORDER BY a.date_signature, a.id`, [[...annees]]);
  return rows.map((r) => ({
    id: n(r.id), type: r.type as TypeActivite, dateSignature: iso(r.date_signature), dateSupposee: r.date_signature_supposee === true,
    libelleProprietaire: String(r.libelle_proprietaire ?? ''), libelleLocataire: String(r.libelle_locataire ?? ''),
    honoProprietaireHt: n(r.hono_proprietaire_ht), honoLocataireHt: n(r.hono_locataire_ht),
    primeSaisie: nOuNull(r.prime_gestion_saisie), mandatGestion: r.mandat_gestion === true, categoriePrime: (r.categorie_prime as CategoriePrime | null) ?? null,
    apporteurId: nOuNull(r.apporteur_id), apporteurNom: (r.apporteur_nom as string | null) ?? null, apporteurTaux: nOuNull(r.apporteur_taux),
    commissionSaisie: nOuNull(r.apporteur_commission_saisie),
    negociateurId: nOuNull(r.negociateur_id), negociateurLibelle: String(r.negociateur_libelle ?? ''), avecGestion: r.avec_gestion === true,
    origineProprietaire: (r.origine_proprietaire as Origine | null) ?? null, origineLocataire: (r.origine_locataire as Origine | null) ?? null,
    loyerHc: nOuNull(r.loyer_hc), charges: nOuNull(r.charges), assurance: (r.assurance as Assurance | null) ?? null,
    parking: r.categorie_prime === 'parking' || familleDeCategorie(r.categorie as string | null) === 'parking',
    vacanceJours: nOuNull(r.vacance), rattachement: r.rattachement as ActiviteCalcul['rattachement'],
    lotId: nOuNull(r.lot_id), bailId: nOuNull(r.bail_id), source: String(r.source),
    origineContact: (r.origine_contact as OrigineContact | null) ?? null, collegueId: nOuNull(r.collegue_id),
    collegueLibelle: (r.collegue_libelle as string | null) ?? null, primeMode: (r.prime_mode as ModePrime | null) ?? null,
    origineContactPrecision: (r.origine_contact_precision as string | null) ?? null,
    apporteurMode: r.apporteur_mode === 'recurrent' || r.apporteur_mode === 'one_shot' ? r.apporteur_mode as ModeApporteur : null,
    apporteurTauxGestion: nOuNull(r.apporteur_taux_gestion), tauxGestionBien: nOuNull(r.taux_gestion_bien_ht),
    finGestion: r.fin_gestion === null || r.fin_gestion === undefined ? null : iso(r.fin_gestion),
  }));
}

/** Les années où il y a de l'activité (pour le filtre « Année »). */
export async function anneesActives(): Promise<number[]> {
  if (!(await suiviDisponible())) return [];
  const { rows } = await query<{ annee: number }>(
    'SELECT DISTINCT extract(year FROM date_signature)::int AS annee FROM gestion_location_activite WHERE annule_le IS NULL ORDER BY 1');
  return rows.map((r) => n(r.annee));
}

/** Les transitions de statut du bien depuis `depuis` (AAAA-MM-JJ), et le nombre de biens en gestion aujourd'hui. */
export async function lireGestion(depuis: string): Promise<{ transitions: Transition[]; stock: number; disponible: boolean }> {
  const avecStatut = await colonneExisteMemo('gestion_annuaire_lot', 'statut_bien');
  if (!avecStatut) return { transitions: [], stock: 0, disponible: false };
  const [t, s] = await Promise.all([
    query<{ lot_id: string; avant: string | null; apres: string; effet_le: Date }>(
      'SELECT lot_id, avant, apres, effet_le FROM gestion_bien_statut_transition WHERE effet_le >= $1 ORDER BY effet_le, id', [depuis]),
    query<{ nb: string }>("SELECT count(*) AS nb FROM gestion_annuaire_lot WHERE statut_bien = 'en_gestion'"),
  ]);
  return {
    transitions: t.rows.map((r) => ({ lotId: n(r.lot_id), avant: r.avant, apres: r.apres, effetLe: iso(r.effet_le) })),
    stock: n(s.rows[0]?.nb ?? 0), disponible: true,
  };
}

/**
 * 407 — les ENTRÉES en gestion et les SORTIES (mandats perdus) d'une période, avec le bien, son propriétaire, et le loyer et le
 * taux de gestion du bail en cours à la date (le dernier bail entré au plus tard deux mois après) : de quoi chiffrer les
 * honoraires de gestion gagnés et perdus. Sans loyer saisi : la ligne est là, sans montant (rien n'est inventé).
 */
export async function lireLignesGestion(debut: string, fin: string): Promise<LigneGestion[]> {
  if (!(await colonneExisteMemo('gestion_annuaire_lot', 'statut_bien'))) return [];
  const { rows } = await query<Record<string, unknown>>(
    `SELECT t.lot_id, t.avant, t.apres, t.effet_le, concat_ws(', ', nullif(btrim(l.adresse), ''), nullif(btrim(l.commune), '')) AS libelle,
            coalesce(p.nom_complet, '') AS proprietaire, c.loyer_hc, c.provisions, c.base, c.taux_gestion_ht
       FROM gestion_bien_statut_transition t
       JOIN gestion_annuaire_lot l ON l.id = t.lot_id
       LEFT JOIN gestion_annuaire_proprietaire p ON p.id = l.proprietaire_id
       LEFT JOIN LATERAL (
         SELECT x.loyer_hc, x.provisions, x.base, x.taux_gestion_ht FROM gestion_bail b JOIN gestion_location_conditions x ON x.bail_id = b.id
          WHERE b.lot_id = t.lot_id AND (b.entree IS NULL OR b.entree <= t.effet_le + 62)
          ORDER BY b.entree DESC NULLS LAST, x.id DESC LIMIT 1) c ON true
      WHERE t.effet_le BETWEEN $1 AND $2 AND (t.apres = 'en_gestion' OR t.avant = 'en_gestion')
      ORDER BY t.effet_le, t.id`, [debut, fin]);
  return rows.map((r) => ({
    lotId: n(r.lot_id), libelle: String(r.libelle || `Bien n° ${r.lot_id}`), proprietaire: String(r.proprietaire), effetLe: iso(r.effet_le),
    avant: (r.avant as string | null) ?? null, apres: String(r.apres), loyerHc: nOuNull(r.loyer_hc), provisions: nOuNull(r.provisions),
    base: (r.base as 'cc' | 'hc' | null) ?? null, tauxHt: nOuNull(r.taux_gestion_ht),
  }));
}

/**
 * 408 — les gestions perdues notées dans le suivi mensuel (décision d'Arno, 23/10/2026), en lignes du bloc « Mandats de gestion
 * perdus » : le bien rapproché (ou aucun), les loyers cc du fichier comme assiette (base cc), le taux retenu et sa source.
 */
export async function lireGestionsPerduesFichier(debut: string, fin: string): Promise<LigneGestion[]> {
  if (!(await colonneExisteMemo('gestion_location_gestion_perdue', 'import_cle'))) return [];
  const { rows } = await query<Record<string, unknown>>(
    `SELECT g.mois, g.lot_id, g.libelle_fichier, g.proprietaire, g.loyers_cc, g.taux_ht, g.taux_source, g.commentaire,
            concat_ws(', ', nullif(btrim(l.adresse), ''), nullif(btrim(l.commune), '')) AS adresse
       FROM gestion_location_gestion_perdue g LEFT JOIN gestion_annuaire_lot l ON l.id = g.lot_id
      WHERE g.annule_le IS NULL AND g.mois BETWEEN $1 AND $2 ORDER BY g.mois, g.id`, [debut, fin]);
  return rows.map((r) => ({
    lotId: nOuNull(r.lot_id), libelle: String(r.adresse || r.libelle_fichier), proprietaire: String(r.proprietaire ?? r.libelle_fichier), effetLe: iso(r.mois),
    avant: 'en_gestion', apres: 'perdue_fichier', loyerHc: nOuNull(r.loyers_cc), provisions: 0, base: 'cc', tauxHt: nOuNull(r.taux_ht),
    origine: 'fichier', tauxSource: (r.taux_source as LigneGestion['tauxSource']) ?? null, commentaire: (r.commentaire as string | null) ?? null,
  }));
}

/** 408 — les écarts expliqués avec le fichier, sur la période. */
export async function lireEcartsFichier(debut: string, fin: string): Promise<EcartFichier[]> {
  if (!(await colonneExisteMemo('gestion_location_ecart_fichier', 'import_cle'))) return [];
  const { rows } = await query<Record<string, unknown>>(
    `SELECT mois, champ, montant_fichier, montant_outil, libelle FROM gestion_location_ecart_fichier
      WHERE annule_le IS NULL AND mois BETWEEN $1 AND $2 ORDER BY mois, id`, [debut, fin]);
  return rows.map((r) => ({ mois: iso(r.mois).slice(0, 7), champ: r.champ as EcartFichier['champ'], fichier: n(r.montant_fichier), outil: n(r.montant_outil), libelle: String(r.libelle) }));
}

/** Les préavis reçus, par mois (« AAAA-MM » → nombre), pour les années demandées ; ni annulés ni remplacés. */
export async function preavisParMois(annees: readonly number[]): Promise<Record<string, number>> {
  if (!(await colonneExisteMemo('gestion_location_preavis', 'recu_le'))) return {};
  const { rows } = await query<{ mois: string; nb: string }>(
    `SELECT to_char(recu_le, 'YYYY-MM') AS mois, count(*) AS nb FROM gestion_location_preavis
      WHERE annule_le IS NULL AND remplace_le IS NULL AND extract(year FROM recu_le)::int = ANY($1::int[]) GROUP BY 1`, [[...annees]]);
  return Object.fromEntries(rows.map((r) => [r.mois, n(r.nb)]));
}


/**
 * Tout ce que l'écran calcule, pour `annee` et l'année précédente. 🔒 Sans « Voir les commissions » : ni règle (taux du
 * négociateur, primes), ni rétrocession, ni prime saisie ne partent — la commission du négociateur n'est pas calculable.
 */
export async function donneesTableau(annee: number, voirCommissions: boolean, aujourdhui: string): Promise<DonneesTableau> {
  const disponible = await suiviDisponible();
  const moisFin = annee === Number(aujourdhui.slice(0, 4)) ? aujourdhui.slice(0, 7) : `${annee}-12`;
  const [a, m] = moisFin.split('-').map(Number);
  const depuis = new Date(Date.UTC(a, m - 12, 1)).toISOString().slice(0, 10);
  const [activites, annees, reglesLues, apporteurs, retrocessions, gestion, preavis, gestionTransitions, collegues, annuaire, pertesFichier, ecartsFichier] = await Promise.all([
    lireActivites([annee - 1, annee]), anneesActives(), lireRegles(), lireApporteurs(),
    voirCommissions ? lireRetrocessions() : Promise.resolve([]), lireGestion(depuis), preavisParMois([annee - 1, annee]),
    lireLignesGestion(`${annee}-01-01`, `${annee}-12-31`), lireCollegues(), annuaireDisponible(),
    lireGestionsPerduesFichier(`${annee}-01-01`, `${annee}-12-31`), lireEcartsFichier(`${annee}-01-01`, `${annee}-12-31`),
  ]);
  const gestionLignes = [...gestionTransitions, ...pertesFichier];
  /* 🔒 Arno (23/10/2026) — les PRIMES de gestion se voient dans la feuille du mois (colonne « Gestion ») ; le TAUX du négociateur
     (et donc sa commission) et les rétrocessions restent réservés au droit « Voir les commissions ». */
  const regles = voirCommissions ? reglesLues : reglesLues.map((r) => ({ ...r, tauxNegociateur: 0 }));
  const visibles = activites;
  // L'historique de toutes les années (Suivi annuel, « année par année ») : calculé ici, seules les sommes partent.
  const toutes = annees.length > 0 ? await lireActivites(annees) : [];
  // 413 — les affaires « Récurrent » de toutes les années : leur part gestion est due chaque mois tant que le bien est en gestion.
  const recurrents = toutes.filter((x) => estRecurrent(x, apporteurs));
  const historique = historiqueAnnees(toutes, { regles, apporteurs, retrocessions, recurrents, aujourdhui }, voirCommissions);
  const negociateurs = new Map<string, string>();
  for (const x of activites) negociateurs.set(x.negociateurId !== null ? `id:${x.negociateurId}` : `nom:${x.negociateurLibelle.trim().toLowerCase()}`, x.negociateurLibelle || '—');
  return {
    disponible, annee, annees: [...new Set([...annees, annee, Number(aujourdhui.slice(0, 4))])].sort(), aujourdhui, activites: visibles,
    regles, apporteurs, retrocessions, negociateurs: [...negociateurs.entries()].map(([cle, libelle]) => ({ cle, libelle })).sort((x, y) => x.libelle.localeCompare(y.libelle)),
    gestion, preavis, voirCommissions, gestionLignes, collegues, annuaire, historique, recurrents,
    personnalisable: await colonneExisteMemo('gestion_location_activite', 'origine_contact_precision'),
    dejaClient: await origineDejaClientDisponible(),
    // La commission d'un écart n'est montrée qu'à qui peut « Voir les commissions ».
    ecartsFichier: ecartsFichier.map((e) => (e.champ === 'commission' && !voirCommissions ? { ...e, fichier: 0, outil: 0 } : e)),
  };
}
