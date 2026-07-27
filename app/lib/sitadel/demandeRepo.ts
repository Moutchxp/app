/**
 * Accès données des demandes de communication (chantier S7). ⚠️ N'ENVOIE RIEN. Lit les candidats (top du classement),
 * propose des lots (via `demande.ts`), crée/liste/lit les demandes, édite le corps, change le statut EN JOURNALISANT.
 * Le destinataire est FIGÉ à la création (copie de mairie_contact) — auditabilité.
 */
import { query, withTransaction } from '../db/client';
import type { ConfigVeille } from './veilleConfig';
import { lireDossiersPriorite, type DossierAffiche } from './veilleRepo';
import {
  type CandidatDossier, type ConfigDemandeur, type Lot, type HistoriqueDemandes,
  proposerLots, genererTexte, piecesDepuisConfig, formaterReferenceDemande, identiteManquante,
} from './demande';

type Requete = <R = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<{ rows: R[] }>;
const asQ = (q: (t: string, p?: unknown[]) => Promise<unknown>): Requete => ((t, p) => q(t, p)) as Requete;

const NB_CANDIDATS = 600; // profondeur de candidats examinés (haut du classement) — large devant un lot mensuel

function adresseDe(d: DossierAffiche): string {
  return [d.adrNumTer, d.adrLibvoieTer, d.adrLocaliteTer].filter((x) => x && x.trim() !== '').join(' ');
}
function versCandidat(d: DossierAffiche): CandidatDossier {
  return {
    dossierId: d.id, codeInsee: d.codeInsee, communeNom: d.communeNom, canal: d.destCanal,
    numDau: d.numDau, dateReelleAutorisation: d.dateReelleAutorisation, adresse: adresseDe(d), cadastre: d.cadastre,
  };
}

export async function lireConfigDemandeur(): Promise<ConfigDemandeur> {
  const r = await query<{ raison_sociale: string; forme_juridique: string; siege_adresse: string; representant_nom: string; representant_qualite: string; email_contact: string; telephone: string }>(
    `SELECT raison_sociale, forme_juridique, siege_adresse, representant_nom, representant_qualite, email_contact, telephone FROM config_demandeur WHERE id = 1`,
  );
  const x = r.rows[0] ?? { raison_sociale: '', forme_juridique: '', siege_adresse: '', representant_nom: '', representant_qualite: '', email_contact: '', telephone: '' };
  return {
    raisonSociale: x.raison_sociale, formeJuridique: x.forme_juridique, siegeAdresse: x.siege_adresse,
    representantNom: x.representant_nom, representantQualite: x.representant_qualite, emailContact: x.email_contact, telephone: x.telephone,
  };
}

/** Historique : dossiers déjà rattachés (demande active) + nombre de demandes du mois par commune (hors abandonnées). */
async function lireHistorique(): Promise<HistoriqueDemandes> {
  const [att, mois] = await Promise.all([
    query<{ dossier_id: number }>(`SELECT dossier_id FROM demande_dossier WHERE actif`),
    query<{ code_insee: string; n: number }>(
      `SELECT code_insee, count(*)::int AS n FROM demande
       WHERE statut <> 'abandonnee' AND date_trunc('month', cree_le) = date_trunc('month', now())
       GROUP BY code_insee`,
    ),
  ]);
  return {
    dejaRattaches: new Set(att.rows.map((r) => r.dossier_id)),
    demandesCeMoisParCommune: new Map(mois.rows.map((r) => [r.code_insee, r.n])),
  };
}

/** Lots PROPOSÉS (aucune écriture) — pour revue avant création. */
export async function proposition(cfg: ConfigVeille): Promise<Lot[]> {
  const [dossiers, hist] = await Promise.all([lireDossiersPriorite(cfg, NB_CANDIDATS), lireHistorique()]);
  return proposerLots(dossiers.map(versCandidat), { dossiersParDemande: cfg.dossiersParDemande, demandesParCommuneParMois: cfg.demandesParCommuneParMois }, hist);
}

/** Attribue une référence SVAV-DEM-AAAA-NNNNNN (compteur atomique, verrou de ligne). */
async function attribuerReference(q: Requete, annee: number): Promise<string> {
  const r = await q<{ dernier: number }>(
    `INSERT INTO demande_compteur (annee, dernier) VALUES ($1, 1)
     ON CONFLICT (annee) DO UPDATE SET dernier = demande_compteur.dernier + 1 RETURNING dernier`, [annee],
  );
  return formaterReferenceDemande(annee, r.rows[0].dernier);
}

/**
 * Crée les demandes à partir des lots proposés. Pour chaque lot (transaction) : référence, destinataire FIGÉ (copie de
 * mairie_contact), texte généré, liens dossiers (actif), journal (→brouillon). L'index unique partiel
 * `demande_dossier_unique_actif` est le filet anti-double : si un dossier a été rattaché entre-temps, le lot est ignoré.
 * Retourne les références créées. AUCUN ENVOI.
 */
export async function creerDemandes(cfg: ConfigVeille, annee: number, auteur: string | null): Promise<{ crees: string[]; ignores: number }> {
  const lots = await proposition(cfg);
  const cfgDem = await lireConfigDemandeur();
  const pieces = piecesDepuisConfig(cfg.piecesDemandees);
  const crees: string[] = [];
  let ignores = 0;
  for (const lot of lots) {
    try {
      const ref = await withTransaction(async (tx) => {
        const q = asQ(tx);
        const reference = await attribuerReference(q, annee);
        const { objet, corps } = genererTexte(lot, cfgDem, reference, pieces);
        const contact = await q<{ email: string | null; url_formulaire: string | null; adresse_postale: string | null }>(
          `SELECT email, url_formulaire, adresse_postale FROM mairie_contact WHERE code_insee = $1`, [lot.codeInsee],
        );
        const ct = contact.rows[0] ?? { email: null, url_formulaire: null, adresse_postale: null };
        const dem = await q<{ id: number }>(
          `INSERT INTO demande (reference, code_insee, statut, objet, corps, dest_canal, dest_email, dest_url_formulaire, dest_adresse_postale)
           VALUES ($1, $2, 'brouillon', $3, $4, $5, $6, $7, $8) RETURNING id`,
          [reference, lot.codeInsee, objet, corps, lot.canal, ct.email, ct.url_formulaire, ct.adresse_postale],
        );
        const id = dem.rows[0].id;
        for (const d of lot.dossiers) {
          await q(`INSERT INTO demande_dossier (demande_id, dossier_id, actif) VALUES ($1, $2, true)`, [id, d.dossierId]);
        }
        await q(`INSERT INTO demande_journal (demande_id, statut_avant, statut_apres, motif, auteur) VALUES ($1, NULL, 'brouillon', 'création', $2)`, [id, auteur]);
        return reference;
      });
      crees.push(ref);
    } catch {
      ignores += 1; // conflit d'unicité (dossier déjà rattaché entre-temps) → lot ignoré, pas d'écriture partielle
    }
  }
  return { crees, ignores };
}

export interface DemandeListe { id: number; reference: string; codeInsee: string; communeNom: string | null; canal: string | null; nbDossiers: number; statut: string; creeLe: string }

export async function listerDemandes(): Promise<{ demandes: DemandeListe[]; identiteManquante: string[] }> {
  const r = await query<{ id: number; reference: string; code_insee: string; commune_nom: string | null; dest_canal: string | null; nb: number; statut: string; cree_le: string }>(
    `SELECT d.id, d.reference, d.code_insee, c.nom AS commune_nom, d.dest_canal, d.statut, d.cree_le::text AS cree_le,
            (SELECT count(*)::int FROM demande_dossier dd WHERE dd.demande_id = d.id) AS nb
     FROM demande d LEFT JOIN commune c ON c.code_insee = d.code_insee ORDER BY d.cree_le DESC`,
  );
  return {
    demandes: r.rows.map((x) => ({ id: x.id, reference: x.reference, codeInsee: x.code_insee, communeNom: x.commune_nom, canal: x.dest_canal, nbDossiers: x.nb, statut: x.statut, creeLe: x.cree_le })),
    identiteManquante: identiteManquante(await lireConfigDemandeur()),
  };
}

export interface DemandeDetail extends DemandeListe { objet: string | null; corps: string | null; destEmail: string | null; destUrlFormulaire: string | null; destAdressePostale: string | null; dossiers: { numDau: string; date: string | null }[] }

export async function lireDemande(id: number): Promise<DemandeDetail | null> {
  const r = await query<{ id: number; reference: string; code_insee: string; commune_nom: string | null; statut: string; objet: string | null; corps: string | null; dest_canal: string | null; dest_email: string | null; dest_url_formulaire: string | null; dest_adresse_postale: string | null; cree_le: string }>(
    `SELECT d.id, d.reference, d.code_insee, c.nom AS commune_nom, d.statut, d.objet, d.corps,
            d.dest_canal, d.dest_email, d.dest_url_formulaire, d.dest_adresse_postale, d.cree_le::text AS cree_le
     FROM demande d LEFT JOIN commune c ON c.code_insee = d.code_insee WHERE d.id = $1`, [id],
  );
  const x = r.rows[0];
  if (!x) return null;
  const doss = await query<{ num_dau: string; date: string | null }>(
    `SELECT s.num_dau, s.date_reelle_autorisation::text AS date FROM demande_dossier dd JOIN sitadel_dossier s ON s.id = dd.dossier_id WHERE dd.demande_id = $1 ORDER BY s.num_dau`, [id],
  );
  return {
    id: x.id, reference: x.reference, codeInsee: x.code_insee, communeNom: x.commune_nom, canal: x.dest_canal,
    nbDossiers: doss.rows.length, statut: x.statut, creeLe: x.cree_le, objet: x.objet, corps: x.corps,
    destEmail: x.dest_email, destUrlFormulaire: x.dest_url_formulaire, destAdressePostale: x.dest_adresse_postale,
    dossiers: doss.rows.map((d) => ({ numDau: d.num_dau, date: d.date })),
  };
}

/** Édite le corps (et l'objet) d'une demande brouillon. */
export async function majCorps(id: number, corps: string, objet: string | null): Promise<void> {
  await query(`UPDATE demande SET corps = $2, objet = COALESCE($3, objet), maj_le = now() WHERE id = $1 AND statut = 'brouillon'`, [id, corps, objet]);
}

/** Erreur de garde-fou identité (transition bloquée) — champs manquants exposés. */
export class IdentiteIncompleteError extends Error {
  constructor(public champs: string[]) { super('identité du demandeur incomplète'); this.name = 'IdentiteIncompleteError'; }
}

/**
 * Change le statut EN JOURNALISANT. Quitter 'brouillon' (→ 'prete') exige une identité demandeur COMPLÈTE (sinon
 * `IdentiteIncompleteError` avec la liste des champs). Abandonner libère les dossiers (demande_dossier.actif=false).
 * ⚠️ 'envoyee' N'EST PAS gérée ici (l'envoi est un chantier ultérieur).
 */
export async function changerStatut(id: number, nouveau: 'prete' | 'abandonnee', auteur: string | null): Promise<void> {
  if (nouveau === 'prete') {
    const manque = identiteManquante(await lireConfigDemandeur());
    if (manque.length > 0) throw new IdentiteIncompleteError(manque);
  }
  await withTransaction(async (tx) => {
    const q = asQ(tx);
    const av = await q<{ statut: string }>(`SELECT statut FROM demande WHERE id = $1`, [id]);
    const avant = av.rows[0]?.statut ?? null;
    await q(`UPDATE demande SET statut = $2, maj_le = now() WHERE id = $1`, [nouveau, id]);
    if (nouveau === 'abandonnee') await q(`UPDATE demande_dossier SET actif = false WHERE demande_id = $1`, [id]);
    await q(`INSERT INTO demande_journal (demande_id, statut_avant, statut_apres, motif, auteur) VALUES ($1, $2, $3, $4, $5)`, [id, avant, nouveau, 'transition', auteur]);
  });
}
