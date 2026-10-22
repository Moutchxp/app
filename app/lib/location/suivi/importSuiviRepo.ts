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

/** Ce qui est déjà en base : les clés de cet import, et les baux déjà suivis autrement (saisie, reprise des TTC). */
export async function lireExistants(): Promise<{ dejaImportees: Set<string>; bauxSuivis: Set<number>; apporteurs: Map<string, number> }> {
  if (!(await importDisponible())) return { dejaImportees: new Set(), bauxSuivis: new Set(), apporteurs: new Map() };
  const [a, b, c] = await Promise.all([
    query<{ import_cle: string }>('SELECT import_cle FROM gestion_location_activite WHERE import_cle LIKE $1', [`${SOURCE_IMPORT}#%`]),
    query<{ bail_id: string }>("SELECT bail_id FROM gestion_location_activite WHERE bail_id IS NOT NULL AND type = 'bail' AND annule_le IS NULL AND source <> 'import'"),
    query<{ id: string; nom: string }>('SELECT id, nom FROM gestion_location_apporteur WHERE archive_le IS NULL'),
  ]);
  return {
    dejaImportees: new Set(a.rows.map((r) => r.import_cle)), bauxSuivis: new Set(b.rows.map((r) => n(r.bail_id))),
    apporteurs: new Map(c.rows.map((r) => [r.nom.trim().toLowerCase(), n(r.id)])),
  };
}

export interface BilanEcriture { activites: number; apporteurs: number; retrocessions: number }

/**
 * `--reel` : écrit le plan dans UNE transaction. Les apporteurs manquants (et leur taux au 1er janvier, le plus fréquent dans le
 * fichier), les rétrocessions absentes, puis les lignes `a_importer` (ON CONFLICT sur la clé d'import : rien n'est doublé).
 * L'origine client des lignes rattachées est déduite comme à la saisie (bail ou relation antérieurs à la date).
 */
export async function ecrireImport(o: {
  plan: readonly LignePlan[]; annee: number; negociateur: { id: number | null; libelle: string }; tauxApporteurs: ReadonlyMap<string, number>;
  retrocessions: readonly Retrocession[]; auteur: string;
}): Promise<BilanEcriture> {
  return withTransaction(async (q) => {
    const bilan: BilanEcriture = { activites: 0, apporteurs: 0, retrocessions: 0 };
    const ids = new Map<string, number>();
    const existants = await q<{ id: string; nom: string }>('SELECT id, nom FROM gestion_location_apporteur WHERE archive_le IS NULL');
    for (const r of existants.rows) ids.set(r.nom.trim().toLowerCase(), n(r.id));
    const apporteurs = new Map<string, ApporteurLu>();
    for (const p of o.plan) if (p.apporteur !== null) apporteurs.set(p.apporteur.nom.trim().toLowerCase(), p.apporteur);
    for (const [cle, a] of apporteurs) {
      if (ids.has(cle)) continue;
      const { rows } = await q<{ id: string }>('INSERT INTO gestion_location_apporteur (nom, type, cree_par_libelle) VALUES ($1, $2, $3) RETURNING id', [a.nom, a.type, o.auteur]);
      const id = n(rows[0].id);
      await q(`INSERT INTO gestion_location_apporteur_bareme (apporteur_id, depuis, taux, cout_fixe_mensuel, saisi_par_libelle) VALUES ($1, $2, $3, 0, $4)
               ON CONFLICT (apporteur_id, depuis) DO NOTHING`, [id, `${o.annee}-01-01`, o.tauxApporteurs.get(cle) ?? 0, o.auteur]);
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
         ON CONFLICT (import_cle) DO NOTHING`,
        [a.type, date, p.bailId, c?.lotId ?? null, c?.proprietaireId ?? null, c?.locataireId ?? null, a.libelleProprietaire, a.libelleLocataire,
          a.honoProprietaireHt, a.honoLocataireHt, a.negociateurId, a.negociateurLibelle,
          p.apporteur === null ? null : ids.get(p.apporteur.nom.trim().toLowerCase()) ?? null, a.apporteurTaux, a.commissionSaisie,
          a.mandatGestion, a.categoriePrime, a.primeSaisie, a.avecGestion, origineP, origineL,
          a.rattachement, p.importCle, Math.round(p.rapprochement.score * 10000) / 10000,
          [`import ${SOURCE_IMPORT}, ligne ${p.ligne.rang} de « ${p.ligne.mois} »`, ...p.commentaire].join(' · '), o.auteur]);
      bilan.activites += r.rowCount ?? 0;
    }
    return bilan;
  });
}

/** Après l'écriture : les lignes de cet import, relues EN BASE, pour le contrôle au centime. */
export async function relireImport(): Promise<{ type: string; date: string; hp: number; hl: number; prime: number | null; commission: number | null; avec: boolean; taux: number | null; cle: string }[]> {
  const { rows } = await query<Record<string, unknown>>(
    `SELECT type, date_signature, hono_proprietaire_ht, hono_locataire_ht, prime_gestion_saisie, apporteur_commission_saisie, avec_gestion, apporteur_taux, import_cle
       FROM gestion_location_activite WHERE import_cle LIKE $1 AND annule_le IS NULL`, [`${SOURCE_IMPORT}#%`]);
  return rows.map((r) => ({ type: String(r.type), date: iso(r.date_signature) ?? '', hp: n(r.hono_proprietaire_ht), hl: n(r.hono_locataire_ht),
    prime: r.prime_gestion_saisie === null ? null : n(r.prime_gestion_saisie), commission: r.apporteur_commission_saisie === null ? null : n(r.apporteur_commission_saisie),
    avec: r.avec_gestion === true, taux: r.apporteur_taux === null ? null : n(r.apporteur_taux), cle: String(r.import_cle) }));
}
