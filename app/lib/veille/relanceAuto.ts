/**
 * R6b — DÉCLENCHEMENT du brouillon de relance. Branché dans le CORPS d'executerVeille APRÈS la relève approfondie, sous le
 * MÊME verrou (aucun nouveau job, aucune nouvelle clé). Ce module ne fait que PRÉPARER un texte et le ranger en base :
 * aucun envoi, aucune alerte, demande.statut jamais écrit.
 *
 * Une relance n'est générée QUE si l'état d'échéance vaut 'depassee' :
 *  - JAMAIS 'indeterminee' : sans relève fraîche on ignore si la mairie s'est tue — réclamer serait une faute ;
 *  - JAMAIS 'non_delivree' : la demande n'est jamais arrivée, il n'y a pas de refus tacite à constater ;
 *  - JAMAIS si une relance VIVANTE (non abandonnée) existe déjà (vérifié + garanti par l'unique partiel de la 076).
 * Le déclenchement journalise dans demande_journal (auteur 'systeme', motif explicite), et RIEN d'autre.
 * GARDE-FOU IDENTITÉ : aucune relance si l'identité du profil est incomplète (comme le courrier initial).
 */
import { query, withTransaction } from '../db/client';
import { chargerConfigVeille } from '../sitadel/veilleConfig';
import {
  problemesIdentite, piecesDepuisConfig,
  type ConfigDemandeur, type ProfilDemandeur, type Lot, type CandidatDossier, type Piece,
} from '../sitadel/demande';
import type { CanalContact } from '../sitadel/mairieContact';
import { echeanceDe, etatEcheance, type ReglagesEcheance } from './echeance';
import { genererRelance } from './relance';

/** Contexte au niveau du PROFIL (chargé une fois) : réglages d'échéance, identité, pièces, adresse de réponse. */
export interface ContexteRelance {
  reglages: ReglagesEcheance;
  profil: ProfilDemandeur;
  config: ConfigDemandeur;
  pieces: Piece[];
  adresseReponse: string;
}

/** Une demande envoyée candidate à la relance (acheminement agrégé + présence d'une réponse). */
export interface DemandeEnvoyeeRelance {
  demandeId: number;
  reference: string;
  envoyeLe: Date | null;
  statutAcheminement: string;
  aReponseRattachee: boolean;
}

export interface DepsRelanceAuto {
  maintenant(): Date;
  lireContexte(): Promise<ContexteRelance>;
  derniereReleveOkLe(): Promise<Date | null>;
  lireDemandesEnvoyees(profil: ProfilDemandeur): Promise<DemandeEnvoyeeRelance[]>;
  relanceVivante(demandeId: number): Promise<boolean>;
  lireLot(demandeId: number): Promise<Lot | null>;
  enregistrerRelance(demandeId: number, profil: ProfilDemandeur, objet: string, corps: string, motif: string): Promise<number>;
}

export interface BilanRelance { examinees: number; creees: number; ignorees: number; erreurs: number; identiteIncomplete: boolean }

/**
 * Génère les brouillons de relance dus. GARDE-FOU identité en tête (aucun texte si l'identité est incomplète). Puis, pour
 * chaque demande envoyée dont l'échéance est 'depassee' et sans relance vivante : compose le texte et l'enregistre (brouillon),
 * en journalisant. Un échec sur une demande n'interrompt pas les suivantes.
 */
export async function executerRelanceAuto(deps: DepsRelanceAuto): Promise<BilanRelance> {
  const ctx = await deps.lireContexte();
  // Identité incomplète → AUCUNE relance générée (un corps à identité vide est un courrier à jeter — leçon du courrier initial).
  if (problemesIdentite(ctx.config, ctx.profil).length > 0) {
    return { examinees: 0, creees: 0, ignorees: 0, erreurs: 0, identiteIncomplete: true };
  }

  const derniereOk = await deps.derniereReleveOkLe();
  const demandes = await deps.lireDemandesEnvoyees(ctx.profil);
  const maintenant = deps.maintenant();

  let examinees = 0, creees = 0, ignorees = 0, erreurs = 0;
  for (const d of demandes) {
    const etat = etatEcheance(
      { envoyeLe: d.envoyeLe, statutAcheminement: d.statutAcheminement, aReponseRattachee: d.aReponseRattachee, derniereReleveOkLe: derniereOk },
      maintenant, ctx.reglages,
    );
    if (etat.etat !== 'depassee') continue; // UNIQUEMENT dépassée (jamais indéterminée / non délivrée / proche / en cours)
    const envoyeLe = d.envoyeLe;
    if (envoyeLe === null) continue;         // dépassée ⇒ envoyeLe non nul, mais on rassure le typage
    examinees += 1;

    if (await deps.relanceVivante(d.demandeId)) { ignorees += 1; continue } // une seule relance vivante par demande
    const lot = await deps.lireLot(d.demandeId);
    if (lot === null) { ignorees += 1; continue }

    try {
      const { objet, corps } = genererRelance({
        reference: d.reference, profil: ctx.profil, lot, config: ctx.config, pieces: ctx.pieces,
        envoyeeLe: envoyeLe, echeanceLe: echeanceDe(envoyeLe), adresseReponse: ctx.adresseReponse,
      });
      await deps.enregistrerRelance(d.demandeId, ctx.profil, objet, corps,
        `brouillon de relance généré : ${etat.motif}`);
      creees += 1;
    } catch { erreurs += 1; } // isolation : une demande en échec (ex. identité, course sur l'unique) n'arrête pas les autres
  }
  return { examinees, creees, ignorees, erreurs, identiteIncomplete: false };
}

// ── Implémentations RÉELLES (production) ──────────────────────────────────────
interface LigneDossierSql {
  id: number; num_dau: string; date_reelle_autorisation: string | null;
  adr_num_ter: string | null; adr_libvoie_ter: string | null; adr_localite_ter: string | null; adr_codpost_ter: string | null;
  sec_cadastre1: string | null; num_cadastre1: string | null; sec_cadastre2: string | null; num_cadastre2: string | null;
  sec_cadastre3: string | null; num_cadastre3: string | null;
}
/** Références cadastrales non vides « SEC NUM » (jusqu'à 3), comme le chargement de régénération de demandeRepo. */
function cadastreDe(d: LigneDossierSql): string[] {
  const refs: string[] = [];
  for (const [sec, num] of [[d.sec_cadastre1, d.num_cadastre1], [d.sec_cadastre2, d.num_cadastre2], [d.sec_cadastre3, d.num_cadastre3]] as const) {
    if ((sec ?? '').trim() !== '' || (num ?? '').trim() !== '') refs.push(`${(sec ?? '').trim()} ${(num ?? '').trim()}`.trim());
  }
  return refs;
}

export function depsReellesRelance(): DepsRelanceAuto {
  return {
    maintenant: () => new Date(),
    lireContexte: async () => {
      const cfg = await chargerConfigVeille();
      const profil: ProfilDemandeur = cfg.releveProfil === 'personne' ? 'personne' : 'entreprise'; // garde : liste fermée
      const { rows } = await query<{ raison_sociale: string; forme_juridique: string; siege_adresse: string; representant_nom: string; representant_qualite: string; email_contact: string; telephone: string }>(
        `SELECT raison_sociale, forme_juridique, siege_adresse, representant_nom, representant_qualite, email_contact, telephone FROM config_demandeur WHERE profil = $1`,
        [profil]);
      const x = rows[0] ?? { raison_sociale: '', forme_juridique: '', siege_adresse: '', representant_nom: '', representant_qualite: '', email_contact: '', telephone: '' };
      const config: ConfigDemandeur = {
        raisonSociale: x.raison_sociale, formeJuridique: x.forme_juridique, siegeAdresse: x.siege_adresse,
        representantNom: x.representant_nom, representantQualite: x.representant_qualite, emailContact: x.email_contact, telephone: x.telephone,
      };
      return {
        reglages: { echeanceAlerteJours: cfg.echeanceAlerteJours, releveFraicheurHeures: cfg.releveFraicheurHeures },
        profil, config, pieces: piecesDepuisConfig(cfg.piecesDemandees), adresseReponse: cfg.adresseReponse,
      };
    },
    derniereReleveOkLe: async () => {
      const { rows } = await query<{ t: Date | null }>(`SELECT max(termine_le) AS t FROM releve_run WHERE resultat = 'ok'`);
      return rows[0]?.t ?? null;
    },
    lireDemandesEnvoyees: async (profil) => {
      const { rows } = await query<{ id: number; reference: string; envoye_le: Date | null; statut_acheminement: string; a_reponse: boolean }>(
        `SELECT d.id::int AS id, d.reference,
                min(a.envoye_le) AS envoye_le,
                CASE WHEN bool_or(a.statut = 'envoye') THEN 'envoye'
                     WHEN bool_or(a.statut = 'rebond') THEN 'rebond'
                     WHEN bool_or(a.statut = 'echec')  THEN 'echec'
                     ELSE 'en_attente' END AS statut_acheminement,
                EXISTS (SELECT 1 FROM demande_reponse r WHERE r.demande_id = d.id) AS a_reponse
           FROM demande d
           LEFT JOIN demande_acheminement a ON a.demande_id = d.id AND a.canal = 'email'
          WHERE d.statut = 'envoyee' AND d.profil_demandeur = $1
          GROUP BY d.id, d.reference`,
        [profil]);
      return rows.map((r) => ({ demandeId: r.id, reference: r.reference, envoyeLe: r.envoye_le, statutAcheminement: r.statut_acheminement, aReponseRattachee: r.a_reponse }));
    },
    relanceVivante: async (demandeId) => {
      const { rows } = await query<{ vivante: boolean }>(
        `SELECT EXISTS (SELECT 1 FROM demande_relance WHERE demande_id = $1 AND type = 'relance' AND statut <> 'abandonnee') AS vivante`,
        [demandeId]);
      return rows[0]?.vivante === true;
    },
    lireLot: async (demandeId) => {
      const meta = await query<{ code_insee: string; commune_nom: string | null; dest_canal: string | null }>(
        `SELECT d.code_insee, c.nom AS commune_nom, d.dest_canal FROM demande d LEFT JOIN commune c ON c.code_insee = d.code_insee WHERE d.id = $1`,
        [demandeId]);
      const m = meta.rows[0];
      if (!m) return null;
      const doss = await query<LigneDossierSql>(
        `SELECT s.id, s.num_dau, s.date_reelle_autorisation::text AS date_reelle_autorisation,
                s.adr_num_ter, s.adr_libvoie_ter, s.adr_localite_ter, s.adr_codpost_ter,
                s.sec_cadastre1, s.num_cadastre1, s.sec_cadastre2, s.num_cadastre2, s.sec_cadastre3, s.num_cadastre3
           FROM demande_dossier dd JOIN sitadel_dossier s ON s.id = dd.dossier_id
          WHERE dd.demande_id = $1 AND dd.actif ORDER BY s.num_dau`,
        [demandeId]);
      const communeNom = m.commune_nom ?? m.code_insee;
      const dossiers: CandidatDossier[] = doss.rows.map((d) => ({
        dossierId: d.id, codeInsee: m.code_insee, communeNom, canal: (m.dest_canal as CanalContact | null),
        numDau: d.num_dau, dateReelleAutorisation: d.date_reelle_autorisation,
        adresse: [d.adr_num_ter, d.adr_libvoie_ter, d.adr_localite_ter].filter((v) => v && v.trim() !== '').join(' '),
        codePostal: d.adr_codpost_ter, cadastre: cadastreDe(d), etatDau: null, absentDuDernierMillesime: false,
      }));
      return { codeInsee: m.code_insee, communeNom, canal: (m.dest_canal as CanalContact) ?? 'email', dossiers };
    },
    enregistrerRelance: async (demandeId, profil, objet, corps, motif) => {
      return withTransaction(async (q) => {
        const { rows } = await q<{ id: number }>(
          `INSERT INTO demande_relance (demande_id, type, objet, corps, profil_demandeur, statut)
           VALUES ($1, 'relance', $2, $3, $4, 'brouillon') RETURNING id`,
          [demandeId, objet, corps, profil]);
        // Journal APPEND-ONLY : aucune transition de statut de la DEMANDE (statut_avant/apres NULL) — on n'écrit jamais demande.statut.
        await q(
          `INSERT INTO demande_journal (demande_id, statut_avant, statut_apres, motif, auteur)
           VALUES ($1, NULL, NULL, $2, 'systeme')`,
          [demandeId, motif]);
        return rows[0].id;
      });
    },
  };
}
