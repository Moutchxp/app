// LOCATION « OUTILS DE SUIVI » — l'import du suivi d'Arno : ce qu'il LIT et ce qu'il ÉCRIT (`--reel`). Même convention que
// `comptes.ts` : pas de `import 'server-only'` (lu par le script sous tsx et par les tests). Écriture EN AJOUT SEUL, dans UNE
// transaction, rejouable (clé d'import unique) : aucune ligne existante n'est modifiée ni supprimée.
import { query, withTransaction } from '../../db/client';
import { colonneExisteMemo } from '../sondeLocation';
import { familleDeCategorie } from '../bienComplet';
import type { CandidatBail } from './rapprochementImport';
import type { ApporteurLu } from './repriseExcel';
import { type LignePlan, SOURCE_IMPORT, versActivite } from './planImport';
import type { Retrocession } from './tableauBord';
import type { RegleCommission } from './suivi';
import { estEcarte, type BienPerte, type NoteEcart, type PerteRapprochee } from './decisionsHistorique';

const n = (v: unknown): number => Number(v);
const iso = (v: unknown): string | null => (v === null || v === undefined ? null : v instanceof Date
  ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}` : String(v).slice(0, 10));

export const importDisponible = (): Promise<boolean> => colonneExisteMemo('gestion_location_activite', 'import_cle');

/** Tous les baux de l'outil, avec le propriétaire, les locataires, le statut et la famille du bien (lecture). */
export async function lireCandidats(): Promise<CandidatBail[]> {
  const statut = (await colonneExisteMemo('gestion_annuaire_lot', 'statut_bien')) ? "l.statut_bien = 'en_gestion'" : 'NULL::boolean';
  const { rows } = await query<Record<string, unknown>>(
    `SELECT b.id, b.lot_id, b.entree, l.proprietaire_id, coalesce(p.nom_complet, '') AS proprietaire, l.categorie, ${statut} AS avec_gestion,
            coalesce((SELECT string_agg(concat_ws(' ', lo.nom, lo.prenom), ', ' ORDER BY lo.id) FROM gestion_annuaire_occupation o
                      JOIN gestion_annuaire_locataire lo ON lo.id = o.locataire_id WHERE o.bail_id = b.id), '') AS locataires,
            (SELECT min(o.locataire_id) FROM gestion_annuaire_occupation o WHERE o.bail_id = b.id) AS locataire_id
       FROM gestion_bail b JOIN gestion_annuaire_lot l ON l.id = b.lot_id
       LEFT JOIN gestion_annuaire_proprietaire p ON p.id = l.proprietaire_id`);
  return rows.map((r) => ({
    bailId: n(r.id), lotId: n(r.lot_id), entree: iso(r.entree), proprietaireId: r.proprietaire_id === null ? null : n(r.proprietaire_id),
    proprietaire: String(r.proprietaire), locataires: String(r.locataires), locataireId: r.locataire_id === null ? null : n(r.locataire_id),
    avecGestion: r.avec_gestion === null ? null : r.avec_gestion === true, parking: familleDeCategorie(r.categorie as string | null) === 'parking',
  }));
}

/** Les comptes actifs (négociateurs, collaborateurs). */
export async function lireComptes(): Promise<{ id: number; prenom: string; libelle: string }[]> {
  const { rows } = await query<{ id: string; prenom: string | null; nom: string | null }>('SELECT id, prenom, nom FROM admin_utilisateur WHERE actif ORDER BY id');
  return rows.map((r) => ({ id: n(r.id), prenom: r.prenom ?? '', libelle: [r.prenom, r.nom].filter(Boolean).join(' ').trim() }));
}

/**
 * Ce qui est déjà en base : les clés des imports du suivi (toutes années : « CA_JBP_<année>#… »), les baux déjà suivis autrement
 * (saisie, reprise des TTC), les baux DÉJÀ RATTACHÉS à une ligne (quelle qu'elle soit : un bail ne sert qu'une fois), l'annuaire.
 */
export async function lireExistants(): Promise<{ dejaImportees: Set<string>; bauxSuivis: Set<number>; bauxPris: Set<number>; apporteurs: Map<string, number>; noms: string[];
  regles: RegleCommission[] }> {
  if (!(await importDisponible())) return { dejaImportees: new Set(), bauxSuivis: new Set(), bauxPris: new Set(), apporteurs: new Map(), noms: [], regles: [] };
  const [a, b, c, d, e] = await Promise.all([
    query<{ import_cle: string }>("SELECT import_cle FROM gestion_location_activite WHERE import_cle LIKE 'CA\\_JBP\\_%#%'"),
    query<{ bail_id: string }>("SELECT bail_id FROM gestion_location_activite WHERE bail_id IS NOT NULL AND type = 'bail' AND annule_le IS NULL AND source <> 'import'"),
    query<{ id: string; nom: string }>('SELECT id, nom FROM gestion_location_apporteur WHERE archive_le IS NULL ORDER BY id'),
    query<{ bail_id: string }>('SELECT DISTINCT bail_id FROM gestion_location_activite WHERE bail_id IS NOT NULL AND annule_le IS NULL'),
    query<Record<string, unknown>>('SELECT depuis, taux_negociateur, prime_gestion_logement, prime_gestion_parking FROM gestion_location_commission_regle ORDER BY depuis'),
  ]);
  return {
    dejaImportees: new Set(a.rows.map((r) => r.import_cle)), bauxSuivis: new Set(b.rows.map((r) => n(r.bail_id))), bauxPris: new Set(d.rows.map((r) => n(r.bail_id))),
    apporteurs: new Map(c.rows.map((r) => [r.nom.trim().toLowerCase(), n(r.id)])), noms: c.rows.map((r) => r.nom),
    regles: e.rows.map((r) => ({ depuis: iso(r.depuis) ?? '', tauxNegociateur: n(r.taux_negociateur), primeLogement: n(r.prime_gestion_logement), primeParking: n(r.prime_gestion_parking) })),
  };
}

export interface BilanEcriture { activites: number; apporteurs: number; retrocessions: number; regles: number; pertes: number; notes: number; apporteursRetires: number }

/** La 408 (gestions perdues du fichier, notes d'écart) est-elle appliquée ? */
export const historiqueDisponible = (): Promise<boolean> => colonneExisteMemo('gestion_location_gestion_perdue', 'import_cle');

/** Les biens, pour rapprocher une gestion perdue : propriétaire, adresse, statut, taux des conditions du dernier bail, taux WIPPIMMO. */
export async function lireBiensPerte(): Promise<BienPerte[]> {
  const statut = (await colonneExisteMemo('gestion_annuaire_lot', 'statut_bien')) ? 'l.statut_bien' : 'NULL::text';
  const wip = (await colonneExisteMemo('gestion_annuaire_lot', 'taux_honos_wippimmo')) ? 'l.taux_honos_wippimmo' : 'NULL::numeric';
  const { rows } = await query<Record<string, unknown>>(
    `SELECT l.id, coalesce(p.nom_complet, '') AS proprietaire, concat_ws(', ', nullif(btrim(l.adresse), ''), nullif(btrim(l.commune), '')) AS adresse,
            ${statut} AS statut, ${wip} AS wippimmo,
            (SELECT c.taux_gestion_ht FROM gestion_bail b JOIN gestion_location_conditions c ON c.bail_id = b.id WHERE b.lot_id = l.id
              ORDER BY b.entree DESC NULLS LAST, c.id DESC LIMIT 1) AS conditions
       FROM gestion_annuaire_lot l LEFT JOIN gestion_annuaire_proprietaire p ON p.id = l.proprietaire_id`);
  return rows.map((r) => ({ lotId: n(r.id), proprietaire: String(r.proprietaire), adresse: String(r.adresse), statut: (r.statut as string | null) ?? null,
    tauxConditions: r.conditions === null ? null : n(r.conditions), tauxWippimmo: r.wippimmo === null ? null : n(r.wippimmo) }));
}

/** Le taux de gestion par défaut de l'agence (réglage des honoraires de gestion), à défaut 4,5 % HT. */
export async function lireReglageGestion(): Promise<{ tauxHt: number }> {
  if (!(await colonneExisteMemo('gestion_honoraires_reglage', 'taux_defaut_ht'))) return { tauxHt: 4.5 };
  const { rows } = await query<{ t: string }>('SELECT taux_defaut_ht::text AS t FROM gestion_honoraires_reglage WHERE id = 1');
  return { tauxHt: rows[0] === undefined ? 4.5 : Number(rows[0].t) };
}

/** Décision 4 : les apporteurs ÉCARTÉS déjà dans l'annuaire (reconnus à l'empreinte de leur nom) — liés à une ligne ou non. */
export async function lireApporteursEcartes(): Promise<{ id: number; lie: boolean }[]> {
  if (!(await importDisponible())) return [];
  const { rows } = await query<{ id: string; nom: string; lie: boolean }>(
    `SELECT a.id, a.nom, EXISTS (SELECT 1 FROM gestion_location_activite x WHERE x.apporteur_id = a.id) AS lie FROM gestion_location_apporteur a`);
  return rows.filter((r) => estEcarte(r.nom)).map((r) => ({ id: n(r.id), lie: r.lie === true }));
}

/**
 * `--reel` : écrit le plan dans UNE transaction. Les apporteurs manquants (et leur taux au 1er janvier, le plus fréquent dans le
 * fichier), les rétrocessions absentes, puis les lignes `a_importer` (ON CONFLICT sur la clé d'import : rien n'est doublé).
 * L'origine client des lignes rattachées est déduite comme à la saisie (bail ou relation antérieurs à la date).
 */
export async function ecrireImport(o: {
  plan: readonly LignePlan[]; annee: number; negociateur: { id: number | null; libelle: string }; tauxApporteurs: ReadonlyMap<string, number>;
  retrocessions: readonly Retrocession[]; auteur: string;
  /** Historique (Arno, 23/10/2026) : le barème d'un apporteur créé vaut depuis le 1er janvier de sa PREMIÈRE année vue. */
  depuisApporteurs?: ReadonlyMap<string, string>;
  /** Les règles de commission datées des fichiers (12,5 % puis 15 %) : ajoutées si leur date manque, jamais modifiées. */
  regles?: readonly RegleCommission[];
  /** Décision 5 (408) : les gestions perdues du fichier. */
  pertes?: readonly PerteRapprochee[];
  /** Décision 3 (408) : les notes d'écart de la feuille du mois. */
  notes?: readonly NoteEcart[];
  /** Décision 4 : les apporteurs écartés, NON liés à une ligne, à retirer de l'annuaire. */
  retirerApporteurs?: readonly number[];
}): Promise<BilanEcriture> {
  const avec407 = await colonneExisteMemo('gestion_location_activite', 'origine_contact');
  return withTransaction(async (q) => {
    const bilan: BilanEcriture = { activites: 0, apporteurs: 0, retrocessions: 0, regles: 0, pertes: 0, notes: 0, apporteursRetires: 0 };
    if ((o.retirerApporteurs ?? []).length > 0) {
      // Seulement s'ils ne sont liés à AUCUNE ligne (relu ici, sous verrou) ; leur barème et leur collègue partent avec eux.
      const ids = (await q<{ id: string }>(`SELECT id FROM gestion_location_apporteur a WHERE id = ANY($1::bigint[])
        AND NOT EXISTS (SELECT 1 FROM gestion_location_activite x WHERE x.apporteur_id = a.id) FOR UPDATE`, [[...o.retirerApporteurs!]])).rows.map((r) => n(r.id));
      if (ids.length > 0) {
        await q('DELETE FROM gestion_location_apporteur_bareme WHERE apporteur_id = ANY($1::bigint[])', [ids]);
        if (await colonneExisteMemo('gestion_location_apporteur_collegue', 'apporteur_id')) await q('DELETE FROM gestion_location_apporteur_collegue WHERE apporteur_id = ANY($1::bigint[])', [ids]);
        bilan.apporteursRetires = (await q('DELETE FROM gestion_location_apporteur WHERE id = ANY($1::bigint[])', [ids])).rowCount ?? 0;
      }
    }
    for (const p of o.pertes ?? []) {
      const x = await q(`INSERT INTO gestion_location_gestion_perdue (mois, lot_id, libelle_fichier, proprietaire, loyers_cc, taux_ht, taux_source, commentaire, import_cle, cree_par_libelle)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (import_cle) DO NOTHING`,
        [`${p.perte.mois}-01`, p.lotId, p.perte.proprietaire, p.proprietaire, p.perte.loyersCc, p.tauxHt, p.tauxSource,
          [p.perte.commentaire, ...p.notes].filter(Boolean).join(' · '), p.importCle, o.auteur]);
      bilan.pertes += x.rowCount ?? 0;
    }
    for (const e of o.notes ?? []) {
      const x = await q(`INSERT INTO gestion_location_ecart_fichier (mois, champ, montant_fichier, montant_outil, libelle, import_cle, cree_par_libelle)
                         VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (import_cle) DO NOTHING`, [`${e.mois}-01`, e.champ, e.fichier, e.outil, e.libelle, e.importCle, o.auteur]);
      bilan.notes += x.rowCount ?? 0;
    }
    for (const r of o.regles ?? []) {
      const x = await q(`INSERT INTO gestion_location_commission_regle (depuis, taux_negociateur, prime_gestion_logement, prime_gestion_parking, saisi_par_libelle)
                         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (depuis) DO NOTHING`, [r.depuis, r.tauxNegociateur, r.primeLogement, r.primeParking, o.auteur]);
      bilan.regles += x.rowCount ?? 0;
    }
    const ids = new Map<string, number>();
    const existants = await q<{ id: string; nom: string }>('SELECT id, nom FROM gestion_location_apporteur WHERE archive_le IS NULL');
    for (const r of existants.rows) ids.set(r.nom.trim().toLowerCase(), n(r.id));
    const apporteurs = new Map<string, ApporteurLu>();
    for (const p of o.plan) if (p.apporteur !== null) apporteurs.set(p.apporteur.nom.trim().toLowerCase(), p.apporteur);
    for (const [cle, a] of apporteurs) {
      if (ids.has(cle)) continue;
      // 407 : créé SANS collègue de rattachement — « à rattacher » (jamais deviné).
      const { rows } = await q<{ id: string }>('INSERT INTO gestion_location_apporteur (nom, type, cree_par_libelle) VALUES ($1, $2, $3) RETURNING id', [a.nom, a.type, o.auteur]);
      const id = n(rows[0].id);
      await q(`INSERT INTO gestion_location_apporteur_bareme (apporteur_id, depuis, taux, cout_fixe_mensuel, saisi_par_libelle) VALUES ($1, $2, $3, 0, $4)
               ON CONFLICT (apporteur_id, depuis) DO NOTHING`, [id, o.depuisApporteurs?.get(cle) ?? `${o.annee}-01-01`, o.tauxApporteurs.get(cle) ?? 0, o.auteur]);
      ids.set(cle, id);
      bilan.apporteurs += 1;
    }
    for (const r of o.retrocessions) {
      const deja = await q('SELECT 1 FROM gestion_location_retrocession WHERE mois = $1 AND libelle = $2 AND montant = $3 AND annule_le IS NULL', [r.mois, r.libelle, r.montant]);
      if (deja.rows.length > 0) continue;
      await q(`INSERT INTO gestion_location_retrocession (negociateur_id, negociateur_libelle, mois, montant, libelle, saisi_par_libelle) VALUES ($1, $2, $3, $4, $5, $6)`,
        [r.negociateurId, r.negociateurLibelle, r.mois, r.montant, r.libelle, o.auteur]);
      bilan.retrocessions += 1;
    }
    for (const p of o.plan.filter((x) => x.etat === 'a_importer')) {
      const a = versActivite(p, o.negociateur);
      const c = p.bailId !== null ? p.rapprochement.candidat : null;
      const date = a.dateSignature;
      const origineP = c?.proprietaireId == null ? null : (await q<{ deja: boolean }>(
        `SELECT EXISTS (SELECT 1 FROM gestion_annuaire_lot l JOIN gestion_bail b ON b.lot_id = l.id WHERE l.proprietaire_id = $1 AND b.id <> $2 AND b.entree < $3)
             OR EXISTS (SELECT 1 FROM gestion_annuaire_proprietaire p WHERE p.id = $1 AND p.relation_depuis < $3) AS deja`, [c.proprietaireId, c.bailId, date])).rows[0]?.deja ? 'deja' : 'nouveau';
      const origineL = c?.locataireId == null ? null : (await q<{ deja: boolean }>(
        `SELECT EXISTS (SELECT 1 FROM gestion_annuaire_occupation oc WHERE oc.locataire_id = $1 AND oc.entree < $2 AND oc.bail_id IS DISTINCT FROM $3) AS deja`,
        [c.locataireId, date, c.bailId])).rows[0]?.deja ? 'deja' : 'nouveau';
      const r = await q(
        `INSERT INTO gestion_location_activite
           (type, date_signature, date_signature_supposee, bail_id, lot_id, proprietaire_id, locataire_id, libelle_proprietaire, libelle_locataire,
            hono_proprietaire_ht, hono_locataire_ht, negociateur_id, negociateur_libelle, apporteur_id, apporteur_taux, apporteur_commission_saisie,
            mandat_gestion, categorie_prime, prime_gestion_saisie, avec_gestion, origine_proprietaire_deduite, origine_locataire_deduite,
            source, rattachement, import_cle, import_score, commentaire, cree_par_libelle)
         VALUES ($1, $2, true, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, 'import', $22, $23, $24, $25, $26)
         ON CONFLICT (import_cle) DO NOTHING
         RETURNING id`,
        [a.type, date, p.bailId, c?.lotId ?? null, c?.proprietaireId ?? null, c?.locataireId ?? null, a.libelleProprietaire, a.libelleLocataire,
          a.honoProprietaireHt, a.honoLocataireHt, a.negociateurId, a.negociateurLibelle,
          p.apporteur === null ? null : ids.get(p.apporteur.nom.trim().toLowerCase()) ?? null, a.apporteurTaux, a.commissionSaisie,
          a.mandatGestion, a.categoriePrime, a.primeSaisie, a.avecGestion, origineP, origineL,
          a.rattachement, p.importCle, Math.round(p.rapprochement.score * 10000) / 10000,
          [`import ${p.importCle.split('#')[0] || SOURCE_IMPORT}, ligne ${p.ligne.rang} de « ${p.ligne.mois} »`, ...p.commentaire].join(' · '), o.auteur]);
      bilan.activites += r.rowCount ?? 0;
      const nouvelle = (r.rows as { id: string }[])[0];
      if (avec407 && nouvelle !== undefined) {
        await q('UPDATE gestion_location_activite SET origine_contact = $2, collegue_id = $3, collegue_libelle = $4, prime_mode = $5 WHERE id = $1',
          [n(nouvelle.id), a.origineContact ?? null, a.collegueId ?? null, a.collegueLibelle ?? null, a.primeMode ?? null]);
      }
    }
    return bilan;
  });
}

/** Après l'écriture : les lignes de ces imports (par défaut 2026), relues EN BASE, pour le contrôle au centime. */
export async function relireImport(sources: readonly string[] = [SOURCE_IMPORT]): Promise<{ type: string; date: string; hp: number; hl: number; prime: number | null; commission: number | null; avec: boolean; taux: number | null; cle: string; primeMode: string | null }[]> {
  const avec407 = await colonneExisteMemo('gestion_location_activite', 'origine_contact');
  const { rows } = await query<Record<string, unknown>>(
    `SELECT type, date_signature, hono_proprietaire_ht, hono_locataire_ht, prime_gestion_saisie, apporteur_commission_saisie, avec_gestion, apporteur_taux, import_cle,
            ${avec407 ? 'prime_mode' : 'NULL::text AS prime_mode'}
       FROM gestion_location_activite WHERE split_part(import_cle, '#', 1) = ANY($1::text[]) AND annule_le IS NULL`, [[...sources]]);
  return rows.map((r) => ({ type: String(r.type), date: iso(r.date_signature) ?? '', hp: n(r.hono_proprietaire_ht), hl: n(r.hono_locataire_ht),
    prime: r.prime_gestion_saisie === null ? null : n(r.prime_gestion_saisie), commission: r.apporteur_commission_saisie === null ? null : n(r.apporteur_commission_saisie),
    avec: r.avec_gestion === true, taux: r.apporteur_taux === null ? null : n(r.apporteur_taux), cle: String(r.import_cle), primeMode: (r.prime_mode as string | null) ?? null }));
}
