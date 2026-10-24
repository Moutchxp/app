import 'server-only';
import { query, withTransaction } from '../../db/client';
import { colonneExisteMemo } from '../sondeLocation';
import { familleDeCategorie } from '../bienComplet';
import {
  type ActiviteVerifiee, type Apporteur, type BaremeApporteur, type CategoriePrime, type ChampsCommerciaux, type CollegueDate, type Origine,
  type RegleCommission, type TypeApporteur, dateIsoValide, lireMontant, lireTauxPourcent, verifierActivite, verifierApporteur, verifierCommercial,
  verifierCoordonnees, verifierRegle, verifierRetrocession, DEPUIS_TOUJOURS,
  casGestionDuBien, motPrimeDejaVersee, sqlPorteUnePrime, type CasGestion, categoriePrimeDeFamille, type ModeApporteur,
} from './suivi';
import { honorairesGestionDisponible } from '../../gestion/schema';
import { lireReglages } from '../../gestion/honorairesGestionRepo';
import { proposerTaux } from '../../gestion/honorairesGestion';
import { bailDisponible } from '../bailRepo';

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

/**
 * 🔴 Arno (24/10/2026) — la migration 413 (commission d'apporteur « One shot » / « Récurrent », part location + part gestion) est-elle
 * appliquée ? Sans elle : les règles se lisent « One shot — gestion 0 % », rien de la part gestion n'est enregistré ni compté.
 */
export function commissionGestionDisponible(): Promise<boolean> {
  return colonneExisteMemo('gestion_location_activite', 'taux_gestion_bien_ht');
}

/**
 * 413 — LE TAUX DE GESTION HT DU BIEN (en %, ex. 4,5) : celui des conditions du bail s'il en a (écrites à l'entrée du locataire),
 * sinon ce que la carte « Location » propose — location précédente du lot › taux WIPPIMMO › réglage agence (`proposerTaux`).
 * null : sans la migration 370 (rien n'est inventé).
 */
export async function tauxGestionDuBien(q: typeof query, lotId: number, bailId: number | null): Promise<number | null> {
  if (!(await honorairesGestionDisponible())) return null;
  const avecBail = await bailDisponible();
  if (bailId !== null) {
    const { rows } = await q<{ t: string }>(
      `SELECT x.taux_gestion_ht::text AS t FROM gestion_location_conditions x
        WHERE ${avecBail ? 'x.bail_id = $1 OR ' : ''}x.occupation_id IN (SELECT o.id FROM gestion_annuaire_occupation o WHERE o.bail_id = $1)
        ORDER BY x.id DESC LIMIT 1`, [bailId]);
    if (rows[0] !== undefined) return Number(rows[0].t);
  }
  const { rows } = await q<{ precedent: string | null; wippimmo: string | null }>(
    `SELECT (SELECT x.taux_gestion_ht::text FROM gestion_annuaire_occupation o
               JOIN gestion_location_conditions x ON ${avecBail ? '(x.bail_id = o.bail_id OR (o.bail_id IS NULL AND x.occupation_id = o.id))' : 'x.occupation_id = o.id'}
              WHERE o.lot_id = $1 ORDER BY o.entree DESC NULLS LAST, x.id DESC LIMIT 1) AS precedent,
            (SELECT taux_honos_wippimmo::text FROM gestion_annuaire_lot WHERE id = $1) AS wippimmo`, [lotId]);
  const r = rows[0];
  const reglages = await lireReglages(q);
  return proposerTaux({ precedent: r?.precedent == null ? null : Number(r.precedent), wippimmo: r?.wippimmo == null ? null : Number(r.wippimmo), reglage: reglages.tauxDefautHt }).taux;
}

/** Arno (24/10/2026) — la migration 414 (nom de famille et prénom des apporteurs, séparés) est-elle appliquée ? */
export function nomPrenomDisponible(): Promise<boolean> {
  return colonneExisteMemo('gestion_location_apporteur', 'nom_famille');
}

/** La migration 406 est-elle appliquée ? (sondé hors transaction, mémorisé). */
export function suiviDisponible(): Promise<boolean> {
  return colonneExisteMemo('gestion_location_activite', 'date_signature');
}

/** La migration 407 (origine du contact, annuaire des apporteurs rattachés à un collègue, choix de prime) est-elle appliquée ? */
export function annuaireDisponible(): Promise<boolean> {
  return colonneExisteMemo('gestion_location_activite', 'origine_contact');
}

/**
 * Arno (24/10/2026) — la migration 412 (la prime d'un LOCAL : montant dans la règle, catégorie « local » admise) est-elle appliquée ?
 * Sans elle : le montant local se lit comme celui du logement (vide), et une affaire « Local » s'enregistre en « logement » — le même
 * montant, la base n'admettant pas encore la valeur.
 */
export function primeLocalDisponible(): Promise<boolean> {
  return colonneExisteMemo('gestion_location_commission_regle', 'prime_gestion_local');
}
/** La catégorie ENREGISTRABLE : « local » seulement avec la 412. */
async function categorieEnregistrable(c: CategoriePrime): Promise<CategoriePrime> {
  return c === 'local' && !(await primeLocalDisponible()) ? 'logement' : c;
}

/** Arno (24/10/2026) — la migration 411 (origine « Personnalisé » et son texte) est-elle appliquée ? */
export function personnalisableDisponible(): Promise<boolean> {
  return colonneExisteMemo('gestion_location_activite', 'origine_contact_precision');
}

/**
 * ══ 🔴🔴 Arno (24/10/2026) — UNE SEULE PRIME DE NOUVELLE GESTION PAR BIEN, DANS TOUTE SA VIE DE GESTION ═══════════════════════
 * « Un bien ne peut générer qu'UNE SEULE prime de nouvelle gestion dans toute sa vie de gestion, y compris s'il sort puis revient en
 * gestion. » La première affaire (non annulée) du bien qui porte une prime — même règle que `primeDe` (`sqlPorteUnePrime`), qu'elle
 * soit saisie ou reprise du fichier — en dehors du bail ou de la ligne qu'on écrit. `null` : aucune.
 * ⚠️ UNE LIGNE REPRISE DU FICHIER SANS BIEN RAPPROCHÉ (`lot_id` vide) n'est rattachée à aucun bien : elle ne peut pas être reconnue.
 */
export async function primeDejaVersee(q: typeof query, lotId: number, exclure: { bailId?: number | null; activiteId?: number | null } = {}): Promise<{ date: string; bail: string } | null> {
  const modes = await annuaireDisponible();
  const { rows } = await q<{ date_signature: string; bail: string }>(
    `SELECT a.date_signature::text AS date_signature,
            coalesce(nullif(btrim(a.libelle_locataire), ''), CASE WHEN a.bail_id IS NULL THEN 'repris du fichier' ELSE 'n° ' || a.bail_id END) AS bail
       FROM gestion_location_activite a
      WHERE a.lot_id = $1 AND a.annule_le IS NULL AND ${sqlPorteUnePrime('a', modes)}
        AND ($2::bigint IS NULL OR a.bail_id IS DISTINCT FROM $2::bigint) AND ($3::bigint IS NULL OR a.id <> $3::bigint)
      ORDER BY a.date_signature, a.id LIMIT 1`, [lotId, exclure.bailId ?? null, exclure.activiteId ?? null]);
  return rows[0] ? { date: rows[0].date_signature.slice(0, 10), bail: rows[0].bail } : null;
}
export const MOT_PARKING_SEUL = 'Type de bien « Parking » : seulement quand le seul lot loué est un parking (pas de logement ni de local).';
const MOT_UNE_SEULE_PRIME = 'un bien ne génère qu’une seule prime de nouvelle gestion dans toute sa vie de gestion.';

// ── Apporteurs ────────────────────────────────────────────────────────────────────────────────────────────────────

export async function lireApporteurs(): Promise<Apporteur[]> {
  if (!(await suiviDisponible())) return [];
  const avecAnnuaire = await annuaireDisponible();
  const avecGestion = await commissionGestionDisponible();
  const avecNomPrenom = await nomPrenomDisponible();
  const [a, b, c] = await Promise.all([
    query<{ id: string; nom: string; type: TypeApporteur; archive_le: Date | null; societe: string | null; telephone: string | null; email: string | null;
      nom_famille: string | null; prenom: string | null }>(
      `SELECT id, nom, type, archive_le, ${avecAnnuaire ? 'societe, telephone, email' : 'NULL::text AS societe, NULL::text AS telephone, NULL::text AS email'},
              ${avecNomPrenom ? 'nom_famille, prenom' : 'NULL::text AS nom_famille, NULL::text AS prenom'}
         FROM gestion_location_apporteur ORDER BY lower(nom), id`),
    query<{ apporteur_id: string; depuis: Date; taux: string; cout_fixe_mensuel: string; mode: string | null; taux_gestion: string | null }>(
      `SELECT apporteur_id, depuis, taux, cout_fixe_mensuel, ${avecGestion ? 'mode, taux_gestion' : 'NULL::text AS mode, NULL::numeric AS taux_gestion'}
         FROM gestion_location_apporteur_bareme ORDER BY depuis, id`),
    avecAnnuaire
      ? query<{ apporteur_id: string; depuis: Date | null; collegue_id: string | null; collegue_libelle: string }>(
        'SELECT apporteur_id, depuis, collegue_id, collegue_libelle FROM gestion_location_apporteur_collegue ORDER BY depuis NULLS FIRST, id')
      : Promise.resolve({ rows: [] as { apporteur_id: string; depuis: Date | null; collegue_id: string | null; collegue_libelle: string }[] }),
  ]);
  const baremes = new Map<number, BaremeApporteur[]>();
  for (const r of b.rows) {
    const id = num(r.apporteur_id);
    // 413 — une règle d'avant (ou sans la 413) se lit « One shot — gestion 0 % ».
    baremes.set(id, [...(baremes.get(id) ?? []), { depuis: iso(r.depuis), taux: num(r.taux), coutFixeMensuel: num(r.cout_fixe_mensuel),
      mode: (r.mode === 'recurrent' ? 'recurrent' : 'one_shot') as ModeApporteur, tauxGestion: r.taux_gestion === null ? 0 : num(r.taux_gestion) }]);
  }
  const collegues = new Map<number, CollegueDate[]>();
  for (const r of c.rows) {
    const id = num(r.apporteur_id);
    collegues.set(id, [...(collegues.get(id) ?? []), { depuis: r.depuis === null ? DEPUIS_TOUJOURS : iso(r.depuis), collegueId: numOuNull(r.collegue_id), collegueLibelle: r.collegue_libelle }]);
  }
  return a.rows.map((r) => ({
    id: num(r.id), nom: r.nom, type: r.type, archive: r.archive_le !== null, baremes: baremes.get(num(r.id)) ?? [],
    // 414 — null : pas encore séparés (la séparation est proposée à l'affichage) ; '' : « pas une personne ».
    nomFamille: r.nom_famille, prenom: r.prenom,
    ...(avecAnnuaire ? { societe: r.societe, telephone: r.telephone, email: r.email, collegues: collegues.get(num(r.id)) ?? [] } : {}),
  }));
}

/** Le libellé d'un compte (« Prénom Nom »), ou null s'il n'existe pas. */
async function libelleCompte(q: typeof query, id: number): Promise<string | null> {
  const { rows } = await q<{ libelle: string }>(`SELECT coalesce(nullif(btrim(concat_ws(' ', prenom, nom)), ''), identifiant, '') AS libelle FROM admin_utilisateur WHERE id = $1`, [id]);
  return rows[0]?.libelle ?? null;
}

/** La 409 est-elle appliquée (date d'effet d'un rattachement facultative : « depuis toujours ») ? */
export async function depuisToujoursDisponible(): Promise<boolean> {
  const { rows } = await query<{ n: string }>(
    `SELECT count(*) AS n FROM information_schema.columns WHERE table_name = 'gestion_location_apporteur_collegue' AND column_name = 'depuis' AND is_nullable = 'YES'`);
  return Number(rows[0]?.n ?? 0) > 0;
}

/**
 * 🔴 LA LISTE DES COLLÈGUES — UNE SEULE pour toute la tuile Location (Arno, 23 puis 24/10/2026) : « Négociateur », « Collègue »
 * (origine « Collègue directement »), collègue de rattachement de l'annuaire des apporteurs, feuille du mois, rétrocessions.
 * TOUS les comptes de l'interface d'administration, quels que soient leur rôle (administrateurs compris) et leurs droits —
 * aucune condition sur `role` ni sur les `perm_*` —, triés par NOM. Les comptes désactivés sont rendus marqués `actif: false` :
 * la liste (`ListeChoix`) ne les propose jamais, et ne montre l'un d'eux, « désactivé », que s'il est déjà le choix en cours.
 */
export async function lireCollegues(): Promise<Negociateur[]> {
  const { rows } = await query<{ id: string; libelle: string; actif: boolean }>(
    `SELECT u.id, coalesce(nullif(btrim(concat_ws(' ', u.prenom, u.nom)), ''), u.identifiant, 'compte ' || u.id) AS libelle, u.actif
       FROM admin_utilisateur u
      ORDER BY lower(coalesce(nullif(btrim(u.nom), ''), u.prenom, u.identifiant, '')), lower(coalesce(u.prenom, '')), u.id`);
  return rows.map((r) => ({ id: num(r.id), libelle: r.libelle, actif: r.actif === true }));
}

/** Nouvel apporteur + son premier taux daté. Un nom déjà pris (hors archivés) est refusé : jamais de doublon. */
export async function creerApporteur(brut: unknown, auteur: Auteur): Promise<Reponse<{ id: number }>> {
  if (!(await suiviDisponible())) return INDISPONIBLE;
  const avecAnnuaire = await annuaireDisponible();
  // 407 : un nouvel apporteur a TOUJOURS son collègue de rattachement (la reprise du fichier seule les crée « à rattacher »).
  const v = verifierApporteur(brut, { collegueObligatoire: avecAnnuaire });
  if (!v.ok) return { etat: 'refus', motif: v.motif };
  return withTransaction(async (q) => {
    const collegue = v.collegueId === null ? null : await libelleCompte(q as typeof query, v.collegueId);
    if (avecAnnuaire && collegue === null) return { etat: 'refus', motif: 'Le collègue de rattachement est inconnu.' } as const;
    const deja = await q<{ id: string }>(
      'SELECT id FROM gestion_location_apporteur WHERE lower(btrim(nom)) = lower(btrim($1)) AND archive_le IS NULL', [v.nom]);
    if (deja.rows.length > 0) return { etat: 'refus', motif: `L’apporteur « ${v.nom} » existe déjà.` } as const;
    const { rows } = avecAnnuaire
      ? await q<{ id: string }>('INSERT INTO gestion_location_apporteur (nom, type, cree_par_libelle, societe, telephone, email) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
        [v.nom, v.type, auteur.libelle, v.societe, v.telephone, v.email])
      : await q<{ id: string }>('INSERT INTO gestion_location_apporteur (nom, type, cree_par_libelle) VALUES ($1, $2, $3) RETURNING id', [v.nom, v.type, auteur.libelle]);
    const id = num(rows[0].id);
    if (avecAnnuaire && collegue !== null) {
      await q('INSERT INTO gestion_location_apporteur_collegue (apporteur_id, depuis, collegue_id, collegue_libelle, saisi_par_libelle) VALUES ($1, $2, $3, $4, $5)',
        [id, v.depuis, v.collegueId, collegue, auteur.libelle]);
    }
    await ((await commissionGestionDisponible())
      ? q(`INSERT INTO gestion_location_apporteur_bareme (apporteur_id, depuis, taux, cout_fixe_mensuel, saisi_par_libelle, mode, taux_gestion)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`, [id, v.depuis, v.taux, v.coutFixe, auteur.libelle, v.mode, v.tauxGestion])
      : q(`INSERT INTO gestion_location_apporteur_bareme (apporteur_id, depuis, taux, cout_fixe_mensuel, saisi_par_libelle)
           VALUES ($1, $2, $3, $4, $5)`, [id, v.depuis, v.taux, v.coutFixe, auteur.libelle]));
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
  // 413 — le mode et le taux sur la gestion ; sans la 413, une règle autre que « One shot — gestion 0 % » est refusée (elle serait perdue).
  const avecGestion = await commissionGestionDisponible();
  if (!avecGestion && (v.mode !== 'one_shot' || v.tauxGestion !== 0)) {
    return { etat: 'refus', motif: 'Mise à jour de la base à appliquer (migration 413) : le mode « Récurrent » et le taux sur la gestion ne peuvent pas encore être enregistrés.' };
  }
  const r = await query(
    `INSERT INTO gestion_location_apporteur_bareme (apporteur_id, depuis, taux, cout_fixe_mensuel, saisi_par_libelle${avecGestion ? ', mode, taux_gestion' : ''})
     SELECT $1, $2, $3, $4, $5${avecGestion ? ', $6, $7' : ''} WHERE EXISTS (SELECT 1 FROM gestion_location_apporteur WHERE id = $1)
     ON CONFLICT (apporteur_id, depuis) DO NOTHING`, [id, v.depuis, v.taux, v.coutFixe, auteur.libelle, ...(avecGestion ? [v.mode, v.tauxGestion] : [])]);
  return r.rowCount === 1 ? { etat: 'ok' } : { etat: 'refus', motif: 'Une version existe déjà à cette date (ou l’apporteur est inconnu) : choisissez une autre date d’effet.' };
}

/** La fiche de l'apporteur : société, téléphone, e-mail, type (le nom ne change pas : il identifie l'apporteur). */
export async function modifierApporteur(apporteurId: unknown, brut: unknown, auteur: Auteur): Promise<Reponse> {
  if (!(await annuaireDisponible())) return { etat: 'indisponible', motif: 'La mise à jour de la base (migration 407) n’est pas encore appliquée.' };
  const id = typeof apporteurId === 'number' && Number.isInteger(apporteurId) && apporteurId > 0 ? apporteurId : null;
  if (id === null) return { etat: 'refus', motif: 'Apporteur inconnu.' };
  const b = (brut ?? {}) as Record<string, unknown>;
  const c = verifierCoordonnees(b);
  if (!c.ok) return { etat: 'refus', motif: c.motif };
  const type = ['partenaire', 'agence', 'internet', 'collaborateur'].includes(String(b.type)) ? String(b.type) : null;
  // 414 — le nom de famille et le prénom, corrigés dans la fiche (absents de la requête : inchangés ; vides : « pas une personne »).
  const avecNomPrenom = await nomPrenomDisponible();
  const texte = (v: unknown): string | null => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : null);
  const nomFamille = texte(b.nomFamille);
  const prenom = texte(b.prenom);
  if (nomFamille === '' && prenom !== null && prenom !== '') return { etat: 'refus', motif: 'Un prénom sans nom de famille : saisissez le nom de famille (ou videz les deux pour une structure).' };
  const r = await query(
    `UPDATE gestion_location_apporteur SET societe = $2, telephone = $3, email = $4, type = coalesce($5, type), modifie_le = now(), modifie_par_libelle = $6
       ${avecNomPrenom && nomFamille !== null ? ', nom_famille = $7, prenom = $8' : ''}
      WHERE id = $1 AND archive_le IS NULL`,
    [id, c.valeurs.societe, c.valeurs.telephone, c.valeurs.email, type, auteur.libelle, ...(avecNomPrenom && nomFamille !== null ? [nomFamille, prenom === '' ? null : prenom] : [])]);
  return r.rowCount === 1 ? { etat: 'ok' } : { etat: 'refus', motif: 'Apporteur inconnu.' };
}

/** Le collègue de rattachement, DATÉ : une nouvelle version à partir de `depuis` ; les affaires d'avant restent au collègue d'alors. */
export async function rattacherApporteur(apporteurId: unknown, brut: unknown, auteur: Auteur): Promise<Reponse> {
  if (!(await annuaireDisponible())) return { etat: 'indisponible', motif: 'La mise à jour de la base (migration 407) n’est pas encore appliquée.' };
  const id = typeof apporteurId === 'number' && Number.isInteger(apporteurId) && apporteurId > 0 ? apporteurId : null;
  const b = (brut ?? {}) as Record<string, unknown>;
  const collegueId = typeof b.collegueId === 'number' && Number.isInteger(b.collegueId) && b.collegueId > 0 ? b.collegueId : null;
  if (id === null) return { etat: 'refus', motif: 'Apporteur inconnu.' };
  if (collegueId === null) return { etat: 'refus', motif: 'Choisissez le collègue de rattachement.' };
  // Arno (23/10/2026, 409) — « depuis toujours » : la date d'effet est vide ; tout l'historique et ce qui suit, jusqu'à un rattachement daté.
  const toujours = b.depuisToujours === true;
  if (!toujours && !dateIsoValide(b.depuis)) return { etat: 'refus', motif: 'La date d’effet du rattachement est obligatoire (ou « Depuis toujours »).' };
  const libelle = await libelleCompte(query, collegueId);
  if (libelle === null) return { etat: 'refus', motif: 'Le collègue de rattachement est inconnu.' };
  if (toujours) {
    if (!(await depuisToujoursDisponible())) return { etat: 'indisponible', motif: 'La mise à jour de la base (migration 409) n’est pas encore appliquée : « Depuis toujours » n’est pas encore possible.' };
    const r = await query(
      `INSERT INTO gestion_location_apporteur_collegue (apporteur_id, depuis, collegue_id, collegue_libelle, saisi_par_libelle)
       SELECT $1, NULL, $2, $3, $4 WHERE EXISTS (SELECT 1 FROM gestion_location_apporteur WHERE id = $1)
         AND NOT EXISTS (SELECT 1 FROM gestion_location_apporteur_collegue WHERE apporteur_id = $1 AND depuis IS NULL)`, [id, collegueId, libelle, auteur.libelle]);
    return r.rowCount === 1 ? { etat: 'ok' } : { etat: 'refus', motif: 'Cet apporteur est déjà rattaché « depuis toujours » : pour changer de collègue, choisissez une date d’effet.' };
  }
  const r = await query(
    `INSERT INTO gestion_location_apporteur_collegue (apporteur_id, depuis, collegue_id, collegue_libelle, saisi_par_libelle)
     SELECT $1, $2, $3, $4, $5 WHERE EXISTS (SELECT 1 FROM gestion_location_apporteur WHERE id = $1)
     ON CONFLICT (apporteur_id, depuis) DO NOTHING`, [id, b.depuis, collegueId, libelle, auteur.libelle]);
  return r.rowCount === 1 ? { etat: 'ok' } : { etat: 'refus', motif: 'Un rattachement existe déjà à cette date (ou l’apporteur est inconnu) : choisissez une autre date d’effet.' };
}

// ── Règle de commission et rétrocessions ──────────────────────────────────────────────────────────────────────────

export async function lireRegles(): Promise<RegleCommission[]> {
  if (!(await suiviDisponible())) return [];
  const local = await primeLocalDisponible();
  const { rows } = await query<{ depuis: Date; taux_negociateur: string; prime_gestion_logement: string; prime_gestion_parking: string; prime_gestion_local: string | null }>(
    `SELECT depuis, taux_negociateur, prime_gestion_logement, prime_gestion_parking, ${local ? 'prime_gestion_local' : 'NULL::numeric AS prime_gestion_local'}
       FROM gestion_location_commission_regle ORDER BY depuis`);
  return rows.map((r) => ({ depuis: iso(r.depuis), tauxNegociateur: num(r.taux_negociateur), primeLogement: num(r.prime_gestion_logement), primeParking: num(r.prime_gestion_parking),
    primeLocal: numOuNull(r.prime_gestion_local) }));
}

export async function ajouterRegle(brut: unknown, auteur: Auteur): Promise<Reponse> {
  if (!(await suiviDisponible())) return INDISPONIBLE;
  const v = verifierRegle(brut);
  if (!v.ok) return { etat: 'refus', motif: v.motif };
  const local = await primeLocalDisponible();
  const r = await query(
    `INSERT INTO gestion_location_commission_regle (depuis, taux_negociateur, prime_gestion_logement, prime_gestion_parking, saisi_par_libelle${local ? ', prime_gestion_local' : ''})
     VALUES ($1, $2, $3, $4, $5${local ? ', $6' : ''}) ON CONFLICT (depuis) DO NOTHING`,
    [v.regle.depuis, v.regle.tauxNegociateur, v.regle.primeLogement, v.regle.primeParking, auteur.libelle, ...(local ? [v.regle.primeLocal ?? null] : [])]);
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

/** Un compte de l'administration (négociateur, collègue) — `lireCollegues`, la seule liste. */
export interface Negociateur { id: number; libelle: string; actif: boolean }


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
 * 407 — écrit les CHAMPS COMMERCIAUX d'une ligne d'activité : origine du contact, collègue (« collègue directement »),
 * apporteur et commission saisie, choix de prime. Un apporteur « à rattacher » (sans collègue) ne peut pas être CHOISI ; il
 * reste sur une ligne qui l'avait déjà (reprise du fichier). Rend le motif d'un refus, ou null.
 */
async function ecrireCommercial(q: typeof query, activiteId: number, c: ChampsCommerciaux, tauxApporteur: number | null, auteur: Auteur,
  conserverMontants = false): Promise<string | null> {
  const avant = (await q<{ apporteur_id: string | null; lot_id: string | null }>('SELECT apporteur_id, lot_id FROM gestion_location_activite WHERE id = $1 FOR UPDATE', [activiteId])).rows[0];
  if (avant === undefined) return 'Ligne inconnue.';
  // Arno (24/10/2026, 411) — « Personnalisé » n'existe en base qu'avec la 411 ; et UNE prime par bien.
  const avecPrecision = await personnalisableDisponible();
  if (c.origineContact === 'personnalise' && !avecPrecision) return 'L’origine « Personnalisé » demande la mise à jour de la base (migration 411).';
  const porteUnePrime = c.primeMode === 'regle' || (c.primeMode === 'personnalise' && (c.primeMontant ?? 0) > 0);
  const lot = numOuNull(avant.lot_id);
  if (porteUnePrime && lot !== null) {
    const deja = await primeDejaVersee(q, lot, { activiteId });
    if (deja !== null) return `${motPrimeDejaVersee(deja)} : ${MOT_UNE_SEULE_PRIME}`;
  }
  if (c.apporteurId !== null) {
    const ap = (await q<{ archive: boolean; rattache: boolean }>(
      `SELECT archive_le IS NOT NULL AS archive, EXISTS (SELECT 1 FROM gestion_location_apporteur_collegue WHERE apporteur_id = a.id) AS rattache
         FROM gestion_location_apporteur a WHERE id = $1`, [c.apporteurId])).rows[0];
    if (ap === undefined) return 'Apporteur inconnu.';
    const nouveauChoix = numOuNull(avant.apporteur_id) !== c.apporteurId;
    if (nouveauChoix && (ap.archive || !ap.rattache)) return 'Cet apporteur est « à rattacher » : rattachez-le d’abord à un collègue (roue Paramètres → Apporteurs).';
  }
  const collegue = c.collegueId === null ? null : await libelleCompte(q, c.collegueId);
  if (c.collegueId !== null && collegue === null) return 'Le collègue est inconnu.';
  // Arno (23/10/2026) : taux et montant d'apporteur NON TOUCHÉS dans la feuille → la valeur exacte en base reste (jamais
  // arrondie par une autre correction : le contrôle au centime du fichier en dépend). Seulement si l'apporteur ne change pas.
  const garder = conserverMontants && c.apporteurId !== null && numOuNull(avant.apporteur_id) === c.apporteurId;
  await q(
    `UPDATE gestion_location_activite SET origine_contact = $2, collegue_id = $3, collegue_libelle = $4, apporteur_id = $5,
            apporteur_taux = CASE WHEN $5::bigint IS NULL THEN NULL WHEN $11::boolean THEN apporteur_taux ELSE $6::numeric END,
            apporteur_commission_saisie = CASE WHEN $11::boolean THEN apporteur_commission_saisie ELSE $7 END,
            prime_mode = $8, prime_gestion_saisie = CASE $8::text WHEN 'personnalise' THEN $9::numeric WHEN 'aucune' THEN 0 ELSE CASE WHEN $8::text IS NULL THEN prime_gestion_saisie END END,
            mandat_gestion = CASE WHEN $8::text IS NULL THEN mandat_gestion ELSE $8::text <> 'aucune' END,
            modifie_le = now(), modifie_par_libelle = $10
      WHERE id = $1`,
    [activiteId, c.origineContact, c.collegueId, collegue, c.apporteurId, tauxApporteur, c.commissionApporteur, c.primeMode, c.primeMontant, auteur.libelle, garder]);
  if (avecPrecision) {
    await q('UPDATE gestion_location_activite SET origine_contact_precision = $2 WHERE id = $1', [activiteId, c.origineContactPrecision ?? null]);
  }
  return null;
}

/**
 * 407 — la feuille du mois : corrige les champs commerciaux d'UNE ligne (origine, collègue, apporteur, commission, prime),
 * quelle que soit sa provenance (saisie, reprise du fichier). Rien d'autre n'est touché.
 */
export async function modifierActivite(activiteId: unknown, brut: unknown, auteur: Auteur): Promise<Reponse> {
  if (!(await annuaireDisponible())) return { etat: 'indisponible', motif: 'La mise à jour de la base (migration 407) n’est pas encore appliquée.' };
  const id = typeof activiteId === 'number' && Number.isInteger(activiteId) && activiteId > 0 ? activiteId : null;
  if (id === null) return { etat: 'refus', motif: 'Ligne inconnue.' };
  const b = (brut ?? {}) as Record<string, unknown>;
  const c = verifierCommercial(b, true);
  if (!c.ok) return { etat: 'refus', motif: c.motif };
  const taux = lireTauxPourcent(b.apporteurTaux);
  if (taux === undefined) return { etat: 'refus', motif: 'Taux de l’apporteur : un pourcentage entre 0 et 100.' };
  return withTransaction(async (q) => {
    const motif = await ecrireCommercial(q as typeof query, id, c.valeurs, taux, auteur, b.conserverMontants === true);
    return motif === null ? { etat: 'ok' } as const : { etat: 'refus', motif } as const;
  });
}

/**
 * Enregistre (ou met à jour) le « suivi commercial » d'un bail : UNE ligne d'activité par bail (index unique partiel).
 * Les libellés, le bien, le propriétaire, les locataires et l'origine client sont lus en base ; la saisie porte la date de
 * signature, les honoraires HT, le négociateur, l'apporteur et son taux, la gestion. Rien d'autre n'est modifié.
 */
class RefusSuivi extends Error {}

export async function enregistrerActiviteBail(bailId: unknown, brut: unknown, auteur: Auteur): Promise<Reponse<{ id: number }>> {
  try {
    return await enregistrerActiviteBailTx(bailId, brut, auteur);
  } catch (e) {
    if (e instanceof RefusSuivi) return { etat: 'refus', motif: e.message };
    throw e;
  }
}

async function enregistrerActiviteBailTx(bailId: unknown, brut: unknown, auteur: Auteur): Promise<Reponse<{ id: number }>> {
  if (!(await suiviDisponible())) return INDISPONIBLE;
  const id = typeof bailId === 'number' && Number.isInteger(bailId) && bailId > 0 ? bailId : null;
  if (id === null) return { etat: 'refus', motif: 'Bail inconnu.' };
  const avecAnnuaire = await annuaireDisponible();
  // 407 : l'origine du contact est obligatoire — seulement quand la base sait l'enregistrer.
  const v = verifierActivite(brut, { origineObligatoire: avecAnnuaire });
  if (!v.ok) return { etat: 'refus', motif: v.motif };
  const br = (brut ?? {}) as Record<string, unknown>;
  const categoriePrime: CategoriePrime | null = br.categoriePrime === 'parking' || br.categoriePrime === 'logement' || br.categoriePrime === 'local' ? br.categoriePrime : null;
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
    // 🔴 Arno (24/10/2026) — « Parking » seulement si TOUS les lots loués par ce bail sont des parkings (place ou box) : lu avant d'écrire.
    if (categoriePrime === 'parking' && await colonneExisteMemo('gestion_annuaire_lot', 'categorie')) {
      const lots = await q<{ tous: boolean | null }>(
        `SELECT bool_and(l.categorie IN ('parking', 'box')) AS tous FROM gestion_annuaire_occupation o JOIN gestion_annuaire_lot l ON l.id = o.lot_id
          WHERE o.bail_id = $1`, [id]);
      if (lots.rows[0]?.tous === false) return { etat: 'refus', motif: MOT_PARKING_SEUL } as const;
    }
    const prime: CategoriePrime = await categorieEnregistrable(categoriePrime ?? categoriePrimeDeFamille(familleDeCategorie(b.categorie)));
    const a: ActiviteVerifiee = v.valeurs;
    // 🔴 Arno (24/10/2026) — UNE seule prime de nouvelle gestion par bien : le serveur refuse la seconde (lu AVANT d'écrire).
    const veutUnePrime = a.primeMode === 'aucune' ? false : a.primeMode === 'personnalise' ? (a.primeMontant ?? 0) > 0
      : a.primeMode === 'regle' ? true : a.mandatGestion;
    if (veutUnePrime) {
      const deja = await primeDejaVersee(q as typeof query, lotId, { bailId: id });
      if (deja !== null) return { etat: 'refus', motif: `${motPrimeDejaVersee(deja)} : ${MOT_UNE_SEULE_PRIME}` } as const;
    }
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
    const activiteId = num(rows[0].id);
    // 413 — la part gestion : le mode et le taux de l'apporteur pour CE bail (vides : la règle à la signature), et le taux de gestion
    // du bien RELEVÉ à la signature (ce qui fait les honoraires de gestion du bail, lu à l'écriture, jamais recalculé ensuite).
    if (await commissionGestionDisponible()) {
      await q('UPDATE gestion_location_activite SET apporteur_mode = $2, apporteur_taux_gestion = $3, taux_gestion_bien_ht = $4 WHERE id = $1',
        [activiteId, a.apporteurMode, a.apporteurTauxGestion, await tauxGestionDuBien(q as typeof query, lotId, id)]);
    }
    if (avecAnnuaire) {
      const motif = await ecrireCommercial(q as typeof query, activiteId, {
        origineContact: a.origineContact, collegueId: a.collegueId, apporteurId: a.apporteurId, commissionApporteur: a.commissionApporteur,
        primeMode: a.primeMode, primeMontant: a.primeMontant,
        origineContactPrecision: a.origineContactPrecision,
      }, a.apporteurTaux, auteur);
      // Un refus (apporteur à rattacher) annule TOUTE l'écriture : rien de la ligne ne reste (lu avant d'écrire : piège withTransaction).
      if (motif !== null) throw new RefusSuivi(motif);
    }
    return { etat: 'ok', data: { id: activiteId } } as const;
  });
}

/** Ce que l'écran « Nouveau locataire » propose avant la saisie : le statut de gestion du bien et l'origine déduite. */
export async function proposerActivite(lotId: unknown, locataireIds: unknown, dateSignature: unknown): Promise<Reponse<{
  avecGestion: boolean; categoriePrime: CategoriePrime; origineProprietaire: Origine | null; origineLocataire: Origine | null;
  /** 407 — le bien était-il déjà en gestion AVANT la date (dernier statut daté avant elle) ? */
  enGestionAvant: boolean;
  /** 413 — le taux de gestion HT du bien (en %), pour la part gestion de l'apporteur ; null : inconnu. */
  tauxGestionBien: number | null;
  /** 🔴 Arno (24/10/2026) — la situation du bien et ce qui en découle (voir `casGestionDuBien`). */
  cas: CasGestion;
  entreeGestion: string | null;
  dejaLoueEnGestion: boolean;
  primeDejaVersee: { date: string; bail: string } | null;
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
  const avecTransitions = await colonneExisteMemo('gestion_bien_statut_transition', 'effet_le');
  const enGestionAvant = avecTransitions && (await query<{ apres: string }>(
    'SELECT apres FROM gestion_bien_statut_transition WHERE lot_id = $1 AND effet_le < $2 ORDER BY effet_le DESC, id DESC LIMIT 1', [lot, date])).rows[0]?.apres === 'en_gestion';
  /**
   * 🔴 Arno (24/10/2026) — « DÉJÀ LOUÉ PAR NOUS DEPUIS L'ENTRÉE EN GESTION ». L'entrée en gestion : la DERNIÈRE transition vers « en
   * gestion » à la date de signature ou avant (historique du statut, 403). Déjà loué : un bail du bien (fiche, import WIPPIMMO) ENTRÉ
   * depuis cette entrée et au plus tard à la signature, OU une affaire du suivi (saisie ou reprise du fichier) signée dans le même
   * intervalle. Un locataire DÉJÀ EN PLACE quand le mandat a été pris (bail entré avant) ne compte pas : notre première location sera
   * celle du nouveau mandat. Sans historique de statut : toute location antérieure du bien compte (prudence : pas de prime d'office).
   */
  const enGestion = rows[0].statut_bien === 'en_gestion';
  const entreeGestion = !enGestion || !avecTransitions ? null : (await query<{ effet_le: string }>(
    `SELECT effet_le::text FROM gestion_bien_statut_transition WHERE lot_id = $1 AND apres = 'en_gestion' AND effet_le <= $2
      ORDER BY effet_le DESC, id DESC LIMIT 1`, [lot, date])).rows[0]?.effet_le ?? null;
  const dejaLoueEnGestion = enGestion && (await query<{ deja: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM gestion_bail b WHERE b.lot_id = $1 AND b.entree IS NOT NULL AND b.entree <= $2::date
                      AND ($3::date IS NULL OR b.entree >= $3::date))
         OR EXISTS (SELECT 1 FROM gestion_location_activite a WHERE a.lot_id = $1 AND a.annule_le IS NULL AND a.type = 'bail'
                      AND a.date_signature <= $2::date AND ($3::date IS NULL OR a.date_signature >= $3::date)) AS deja`,
    [lot, date, entreeGestion])).rows[0]?.deja === true;
  const deja = await primeDejaVersee(query, lot);
  return {
    etat: 'ok',
    data: {
      avecGestion: enGestion,
      categoriePrime: categoriePrimeDeFamille(familleDeCategorie(rows[0].categorie)),
      origineProprietaire: origines.proprietaire, origineLocataire: origines.locataire, enGestionAvant,
      tauxGestionBien: await tauxGestionDuBien(query, lot, null),
      cas: casGestionDuBien({ enGestion, dejaLoueEnGestion, primeDejaVersee: deja !== null }), entreeGestion, dejaLoueEnGestion, primeDejaVersee: deja,
    },
  };
}

// ── Le droit « Voir les commissions » ─────────────────────────────────────────────────────────────────────────────

/**
 * Peut voir les commissions des négociateurs (section « Négociateurs », primes, rétrocessions) : administrateur (implicite), OU droit
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
