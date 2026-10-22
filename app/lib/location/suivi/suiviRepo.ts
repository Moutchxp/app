import 'server-only';
import { query, withTransaction } from '../../db/client';
import { colonneExisteMemo } from '../sondeLocation';
import { familleDeCategorie } from '../bienComplet';
import {
  type ActiviteVerifiee, type Apporteur, type BaremeApporteur, type CategoriePrime, type Origine, type RegleCommission,
  type TypeApporteur, lireMontant, verifierActivite, verifierApporteur, verifierRegle, verifierRetrocession,
} from './suivi';

/**
 * ══ LOCATION — « OUTILS DE SUIVI » : ACCÈS À LA BASE (Arno, 22/10/2026, migration 406) ════════════════════════════════════
 * Référentiel des apporteurs (taux et coûts fixes datés), règle de commission datée, rétrocessions, et l'ACTIVITÉ : une ligne
 * par bail signé. Tout est en AJOUT : une version de barème ne s'efface ni ne se corrige en arrière ; une rétrocession
 * s'annule (marque), jamais supprimée. Sans la migration 406 : `suiviDisponible()` est faux et rien n'est lu ni écrit.
 */
interface Auteur { id: number | null; libelle: string }
export type Reponse<T = unknown> = { etat: 'ok'; data?: T } | { etat: 'refus'; motif: string } | { etat: 'indisponible'; motif: string };
const INDISPONIBLE: Reponse<never> = { etat: 'indisponible', motif: 'La mise à jour de la base (migration 406) n’est pas encore appliquée.' };
const num = (v: unknown): number => Number(v);
const numOuNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const iso = (v: unknown): string => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));

/** La migration 406 est-elle appliquée ? (sondé hors transaction, mémorisé). */
export function suiviDisponible(): Promise<boolean> {
  return colonneExisteMemo('gestion_location_activite', 'date_signature');
}

// ── Apporteurs ────────────────────────────────────────────────────────────────────────────────────────────────────

export async function lireApporteurs(): Promise<Apporteur[]> {
  if (!(await suiviDisponible())) return [];
  const [a, b] = await Promise.all([
    query<{ id: string; nom: string; type: TypeApporteur; archive_le: Date | null }>(
      'SELECT id, nom, type, archive_le FROM gestion_location_apporteur ORDER BY lower(nom), id'),
    query<{ apporteur_id: string; depuis: Date; taux: string; cout_fixe_mensuel: string }>(
      'SELECT apporteur_id, depuis, taux, cout_fixe_mensuel FROM gestion_location_apporteur_bareme ORDER BY depuis, id'),
  ]);
  const baremes = new Map<number, BaremeApporteur[]>();
  for (const r of b.rows) {
    const id = num(r.apporteur_id);
    baremes.set(id, [...(baremes.get(id) ?? []), { depuis: iso(r.depuis), taux: num(r.taux), coutFixeMensuel: num(r.cout_fixe_mensuel) }]);
  }
  return a.rows.map((r) => ({ id: num(r.id), nom: r.nom, type: r.type, archive: r.archive_le !== null, baremes: baremes.get(num(r.id)) ?? [] }));
}

/** Nouvel apporteur + son premier taux daté. Un nom déjà pris (hors archivés) est refusé : jamais de doublon. */
export async function creerApporteur(brut: unknown, auteur: Auteur): Promise<Reponse<{ id: number }>> {
  if (!(await suiviDisponible())) return INDISPONIBLE;
  const v = verifierApporteur(brut);
  if (!v.ok) return { etat: 'refus', motif: v.motif };
  return withTransaction(async (q) => {
    const deja = await q<{ id: string }>(
      'SELECT id FROM gestion_location_apporteur WHERE lower(btrim(nom)) = lower(btrim($1)) AND archive_le IS NULL', [v.nom]);
    if (deja.rows.length > 0) return { etat: 'refus', motif: `L’apporteur « ${v.nom} » existe déjà.` } as const;
    const { rows } = await q<{ id: string }>(
      'INSERT INTO gestion_location_apporteur (nom, type, cree_par_libelle) VALUES ($1, $2, $3) RETURNING id', [v.nom, v.type, auteur.libelle]);
    const id = num(rows[0].id);
    await q(
      `INSERT INTO gestion_location_apporteur_bareme (apporteur_id, depuis, taux, cout_fixe_mensuel, saisi_par_libelle)
       VALUES ($1, $2, $3, $4, $5)`, [id, v.depuis, v.taux, v.coutFixe, auteur.libelle]);
    return { etat: 'ok', data: { id } } as const;
  });
}

/** Nouvelle version datée du taux / coût fixe d'un apporteur (vaut pour les baux signés à partir de `depuis`). */
export async function ajouterBaremeApporteur(apporteurId: unknown, brut: unknown, auteur: Auteur): Promise<Reponse> {
  if (!(await suiviDisponible())) return INDISPONIBLE;
  const id = typeof apporteurId === 'number' && Number.isInteger(apporteurId) && apporteurId > 0 ? apporteurId : null;
  if (id === null) return { etat: 'refus', motif: 'Apporteur inconnu.' };
  const v = verifierApporteur({ ...(brut as Record<string, unknown>), nom: 'x', type: 'partenaire' });
  if (!v.ok) return { etat: 'refus', motif: v.motif };
  const r = await query(
    `INSERT INTO gestion_location_apporteur_bareme (apporteur_id, depuis, taux, cout_fixe_mensuel, saisi_par_libelle)
     SELECT $1, $2, $3, $4, $5 WHERE EXISTS (SELECT 1 FROM gestion_location_apporteur WHERE id = $1)
     ON CONFLICT (apporteur_id, depuis) DO NOTHING`, [id, v.depuis, v.taux, v.coutFixe, auteur.libelle]);
  return r.rowCount === 1 ? { etat: 'ok' } : { etat: 'refus', motif: 'Une version existe déjà à cette date (ou l’apporteur est inconnu) : choisissez une autre date d’effet.' };
}

// ── Règle de commission et rétrocessions ──────────────────────────────────────────────────────────────────────────

export async function lireRegles(): Promise<RegleCommission[]> {
  if (!(await suiviDisponible())) return [];
  const { rows } = await query<{ depuis: Date; taux_negociateur: string; prime_gestion_logement: string; prime_gestion_parking: string }>(
    'SELECT depuis, taux_negociateur, prime_gestion_logement, prime_gestion_parking FROM gestion_location_commission_regle ORDER BY depuis');
  return rows.map((r) => ({ depuis: iso(r.depuis), tauxNegociateur: num(r.taux_negociateur), primeLogement: num(r.prime_gestion_logement), primeParking: num(r.prime_gestion_parking) }));
}

export async function ajouterRegle(brut: unknown, auteur: Auteur): Promise<Reponse> {
  if (!(await suiviDisponible())) return INDISPONIBLE;
  const v = verifierRegle(brut);
  if (!v.ok) return { etat: 'refus', motif: v.motif };
  const r = await query(
    `INSERT INTO gestion_location_commission_regle (depuis, taux_negociateur, prime_gestion_logement, prime_gestion_parking, saisi_par_libelle)
     VALUES ($1, $2, $3, $4, $5) ON CONFLICT (depuis) DO NOTHING`,
    [v.regle.depuis, v.regle.tauxNegociateur, v.regle.primeLogement, v.regle.primeParking, auteur.libelle]);
  return r.rowCount === 1 ? { etat: 'ok' } : { etat: 'refus', motif: 'Une règle existe déjà à cette date : choisissez une autre date d’effet.' };
}

export interface Retrocession { id: number; negociateurId: number | null; negociateurLibelle: string; mois: string; montant: number; libelle: string }

export async function lireRetrocessions(): Promise<Retrocession[]> {
  if (!(await suiviDisponible())) return [];
  const { rows } = await query<{ id: string; negociateur_id: string | null; negociateur_libelle: string; mois: Date; montant: string; libelle: string }>(
    'SELECT id, negociateur_id, negociateur_libelle, mois, montant, libelle FROM gestion_location_retrocession WHERE annule_le IS NULL ORDER BY mois, id');
  return rows.map((r) => ({ id: num(r.id), negociateurId: numOuNull(r.negociateur_id), negociateurLibelle: r.negociateur_libelle, mois: iso(r.mois), montant: num(r.montant), libelle: r.libelle }));
}

export async function ajouterRetrocession(brut: unknown, auteur: Auteur): Promise<Reponse> {
  if (!(await suiviDisponible())) return INDISPONIBLE;
  const v = verifierRetrocession(brut);
  if (!v.ok) return { etat: 'refus', motif: v.motif };
  await query(
    `INSERT INTO gestion_location_retrocession (negociateur_id, negociateur_libelle, mois, montant, libelle, saisi_par_libelle)
     VALUES ($1, $2, $3, $4, $5, $6)`, [v.negociateurId, v.negociateurLibelle, v.mois, v.montant, v.libelle, auteur.libelle]);
  return { etat: 'ok' };
}

/** Une rétrocession s'ANNULE (marque datée) : jamais supprimée. */
export async function annulerRetrocession(id: unknown, auteur: Auteur): Promise<Reponse> {
  if (!(await suiviDisponible())) return INDISPONIBLE;
  if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) return { etat: 'refus', motif: 'Rétrocession inconnue.' };
  const r = await query('UPDATE gestion_location_retrocession SET annule_le = now(), annule_par_libelle = $2 WHERE id = $1 AND annule_le IS NULL', [id, auteur.libelle]);
  return r.rowCount === 1 ? { etat: 'ok' } : { etat: 'refus', motif: 'Rétrocession inconnue ou déjà annulée.' };
}

// ── Négociateurs ──────────────────────────────────────────────────────────────────────────────────────────────────

export interface Negociateur { id: number; libelle: string }

/** Les comptes actifs de l'administration (les négociateurs possibles). */
export async function lireNegociateurs(): Promise<Negociateur[]> {
  const { rows } = await query<{ id: string; prenom: string | null; nom: string | null; identifiant: string | null }>(
    'SELECT id, prenom, nom, identifiant FROM admin_utilisateur WHERE actif ORDER BY prenom, nom, id');
  return rows.map((r) => ({ id: num(r.id), libelle: [r.prenom, r.nom].filter(Boolean).join(' ').trim() || (r.identifiant ?? `compte ${r.id}`) }));
}

// ── L'activité : une ligne par bail signé ─────────────────────────────────────────────────────────────────────────

/**
 * L'origine client DÉDUITE à la date de signature :
 *  · propriétaire « déjà client » s'il avait, AVANT cette date, un autre bail sur l'un de ses biens, un bien en gestion
 *    (début de gestion antérieur) ou une relation datée antérieure ; sinon « nouveau client » ;
 *  · locataire « déjà client » s'il avait, avant cette date, une autre occupation ; sinon « nouveau client ».
 */
async function deduireOrigines(
  q: typeof query, o: { bailId: number; lotId: number; proprietaireId: number | null; locataireIds: number[]; date: string },
): Promise<{ proprietaire: Origine | null; locataire: Origine | null }> {
  let proprietaire: Origine | null = null;
  if (o.proprietaireId !== null) {
    const { rows } = await q<{ deja: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM gestion_annuaire_lot l JOIN gestion_bail b ON b.lot_id = l.id
         WHERE l.proprietaire_id = $1 AND b.id <> $2 AND b.entree < $3
       ) OR EXISTS (
         SELECT 1 FROM gestion_annuaire_lot l WHERE l.proprietaire_id = $1 AND l.gestion_debut < $3
       ) OR EXISTS (
         SELECT 1 FROM gestion_annuaire_proprietaire p WHERE p.id = $1 AND p.relation_depuis < $3
       ) AS deja`, [o.proprietaireId, o.bailId, o.date]);
    proprietaire = rows[0]?.deja ? 'deja' : 'nouveau';
  }
  let locataire: Origine | null = null;
  if (o.locataireIds.length > 0) {
    const { rows } = await q<{ deja: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM gestion_annuaire_occupation oc
         WHERE oc.locataire_id = ANY($1::bigint[]) AND oc.entree < $2 AND oc.bail_id IS DISTINCT FROM $3
       ) AS deja`, [o.locataireIds, o.date, o.bailId]);
    locataire = rows[0]?.deja ? 'deja' : 'nouveau';
  }
  return { proprietaire, locataire };
}

/**
 * Enregistre (ou met à jour) le « suivi commercial » d'un bail : UNE ligne d'activité par bail (index unique partiel).
 * Les libellés, le bien, le propriétaire, les locataires et l'origine client sont lus en base ; la saisie porte la date de
 * signature, les honoraires HT, le négociateur, l'apporteur et son taux, la gestion. Rien d'autre n'est modifié.
 */
export async function enregistrerActiviteBail(bailId: unknown, brut: unknown, auteur: Auteur): Promise<Reponse<{ id: number }>> {
  if (!(await suiviDisponible())) return INDISPONIBLE;
  const id = typeof bailId === 'number' && Number.isInteger(bailId) && bailId > 0 ? bailId : null;
  if (id === null) return { etat: 'refus', motif: 'Bail inconnu.' };
  const v = verifierActivite(brut);
  if (!v.ok) return { etat: 'refus', motif: v.motif };
  const br = (brut ?? {}) as Record<string, unknown>;
  const categoriePrime = br.categoriePrime === 'parking' ? 'parking' : br.categoriePrime === 'logement' ? 'logement' : null;
  // Les loyers viennent des champs « Loyer mensuel » de l'écran (déjà saisis) : repris tels quels, illisibles → non renseignés.
  const loyerHc = lireMontant(br.loyerHc) ?? null;
  const charges = lireMontant(br.charges) ?? null;
  return withTransaction(async (q) => {
    const bail = await q<{ lot_id: string; proprietaire_id: string | null; proprio: string | null; categorie: string | null }>(
      `SELECT b.lot_id, l.proprietaire_id, p.nom_complet AS proprio, l.categorie
       FROM gestion_bail b JOIN gestion_annuaire_lot l ON l.id = b.lot_id
       LEFT JOIN gestion_annuaire_proprietaire p ON p.id = l.proprietaire_id WHERE b.id = $1`, [id]);
    if (bail.rows.length === 0) return { etat: 'refus', motif: 'Bail inconnu.' } as const;
    const b = bail.rows[0];
    const locs = await q<{ id: string; libelle: string }>(
      `SELECT lo.id, coalesce(nullif(btrim(concat_ws(' ', lo.prenom, lo.nom)), ''), lo.nom, '') AS libelle
       FROM gestion_annuaire_occupation o JOIN gestion_annuaire_locataire lo ON lo.id = o.locataire_id
       WHERE o.bail_id = $1 ORDER BY lo.id`, [id]);
    const lotId = num(b.lot_id);
    const proprietaireId = numOuNull(b.proprietaire_id);
    const origines = await deduireOrigines(q as typeof query, { bailId: id, lotId, proprietaireId, locataireIds: locs.rows.map((r) => num(r.id)), date: v.valeurs.dateSignature });
    const negociateur = v.valeurs.negociateurId === null ? null
      : (await q<{ libelle: string }>(`SELECT coalesce(nullif(btrim(concat_ws(' ', prenom, nom)), ''), identifiant, '') AS libelle FROM admin_utilisateur WHERE id = $1`,
        [v.valeurs.negociateurId])).rows[0]?.libelle ?? null;
    const prime: CategoriePrime = categoriePrime ?? (familleDeCategorie(b.categorie) === 'parking' ? 'parking' : 'logement');
    const a: ActiviteVerifiee = v.valeurs;
    const { rows } = await q<{ id: string }>(
      `INSERT INTO gestion_location_activite
         (type, date_signature, bail_id, lot_id, proprietaire_id, locataire_id, libelle_proprietaire, libelle_locataire,
          hono_proprietaire_ht, hono_locataire_ht, negociateur_id, negociateur_libelle, apporteur_id, apporteur_taux,
          mandat_gestion, categorie_prime, avec_gestion, origine_proprietaire_deduite, origine_proprietaire_saisie,
          origine_locataire_deduite, origine_locataire_saisie, source, cree_par_libelle, loyer_hc, charges)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, 'saisie', $22, $23, $24)
       ON CONFLICT (bail_id) WHERE bail_id IS NOT NULL AND type = 'bail' AND annule_le IS NULL DO UPDATE SET
         date_signature = EXCLUDED.date_signature, date_signature_supposee = false,
         hono_proprietaire_ht = EXCLUDED.hono_proprietaire_ht, hono_locataire_ht = EXCLUDED.hono_locataire_ht,
         negociateur_id = EXCLUDED.negociateur_id, negociateur_libelle = EXCLUDED.negociateur_libelle,
         apporteur_id = EXCLUDED.apporteur_id, apporteur_taux = EXCLUDED.apporteur_taux, mandat_gestion = EXCLUDED.mandat_gestion,
         categorie_prime = EXCLUDED.categorie_prime, avec_gestion = EXCLUDED.avec_gestion,
         origine_proprietaire_deduite = EXCLUDED.origine_proprietaire_deduite, origine_proprietaire_saisie = EXCLUDED.origine_proprietaire_saisie,
         origine_locataire_deduite = EXCLUDED.origine_locataire_deduite, origine_locataire_saisie = EXCLUDED.origine_locataire_saisie,
         loyer_hc = EXCLUDED.loyer_hc, charges = EXCLUDED.charges,
         modifie_le = now(), modifie_par_libelle = $22
       RETURNING id`,
      [a.type === 'avenant' ? 'avenant' : 'bail', a.dateSignature, id, lotId, proprietaireId, locs.rows[0] ? num(locs.rows[0].id) : null,
        b.proprio ?? '', locs.rows.map((r) => r.libelle).join(', '), a.honoProprietaireHt, a.honoLocataireHt,
        a.negociateurId, negociateur ?? '', a.apporteurId, a.apporteurTaux, a.mandatGestion, prime, a.avecGestion,
        origines.proprietaire, a.origineProprietaire, origines.locataire, a.origineLocataire, auteur.libelle,
        loyerHc, charges]);
    return { etat: 'ok', data: { id: num(rows[0].id) } } as const;
  });
}

/** Ce que l'écran « Nouveau locataire » propose avant la saisie : le statut de gestion du bien et l'origine déduite. */
export async function proposerActivite(lotId: unknown, locataireIds: unknown, dateSignature: unknown): Promise<Reponse<{
  avecGestion: boolean; categoriePrime: CategoriePrime; origineProprietaire: Origine | null; origineLocataire: Origine | null;
}>> {
  const lot = typeof lotId === 'number' && Number.isInteger(lotId) && lotId > 0 ? lotId : null;
  const date = typeof dateSignature === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateSignature) ? dateSignature : null;
  if (lot === null || date === null) return { etat: 'refus', motif: 'Bien ou date inconnus.' };
  const ids = Array.isArray(locataireIds) ? locataireIds.filter((x): x is number => typeof x === 'number' && Number.isInteger(x) && x > 0) : [];
  const { rows } = await query<{ statut_bien: string | null; categorie: string | null; proprietaire_id: string | null }>(
    `SELECT ${(await colonneExisteMemo('gestion_annuaire_lot', 'statut_bien')) ? 'statut_bien' : "CASE WHEN en_gestion THEN 'en_gestion' END AS statut_bien"},
            categorie, proprietaire_id FROM gestion_annuaire_lot WHERE id = $1`, [lot]);
  if (rows.length === 0) return { etat: 'refus', motif: 'Bien inconnu.' };
  const origines = await deduireOrigines(query, { bailId: 0, lotId: lot, proprietaireId: numOuNull(rows[0].proprietaire_id), locataireIds: ids, date });
  return {
    etat: 'ok',
    data: {
      avecGestion: rows[0].statut_bien === 'en_gestion',
      categoriePrime: familleDeCategorie(rows[0].categorie) === 'parking' ? 'parking' : 'logement',
      origineProprietaire: origines.proprietaire, origineLocataire: origines.locataire,
    },
  };
}

// ── Le droit « Voir les commissions » ─────────────────────────────────────────────────────────────────────────────

/**
 * Peut voir les commissions (négociateurs, apporteurs, rétrocessions) : administrateur (implicite), OU droit
 * `perm_commissions` (migration 406). RELU EN BASE à chaque appel (un droit retiré l'est aussitôt). Voie de secours (compte
 * sans identifiant, garde administrateur déjà passée) : oui.
 */
export async function peutVoirCommissions(auteurId: number | null): Promise<boolean> {
  if (auteurId === null) return true;
  const avecDroit = await colonneExisteMemo('admin_utilisateur', 'perm_commissions');
  const { rows } = await query<{ ok: boolean }>(
    `SELECT (role = 'administrateur' ${avecDroit ? 'OR perm_commissions IS TRUE' : ''}) AS ok FROM admin_utilisateur WHERE id = $1 AND actif`, [auteurId]);
  return rows[0]?.ok === true;
}
