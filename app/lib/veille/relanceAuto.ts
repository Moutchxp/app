/**
 * R6b — DÉCLENCHEMENT du brouillon de relance. Branché dans le CORPS d'executerVeille APRÈS la relève approfondie, sous le
 * MÊME verrou (aucun nouveau job, aucune nouvelle clé). Ce module ne fait que PRÉPARER un texte et le ranger en base :
 * aucun envoi, aucune alerte, demande.statut jamais écrit.
 *
 * Une relance n'est générée QUE si l'état d'échéance vaut 'depassee' :
 *  - JAMAIS 'indeterminee' : sans relève fraîche on ignore si la mairie s'est tue — réclamer serait une faute ;
 *  - JAMAIS 'non_delivree' : la demande n'est jamais arrivée, il n'y a pas de refus tacite à constater ;
 *  - JAMAIS si une relance EXISTE DÉJÀ, QUEL QUE SOIT SON STATUT (R5c) — y compris abandonnée. Un abandon manuel est ainsi
 *    RESPECTÉ : l'auto ne ressuscite jamais une relance au tic suivant. Seul le geste manuel « régénérer » en refait une
 *    (demandeRelanceRepo). (Avant R5c on ne regardait que les relances vivantes → une abandonnée réapparaissait aussitôt.)
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
import { echeanceDe, releveEstFraiche, type ReglagesEcheance } from './echeance';
import { genererRelance, type VarianteRelance } from './relance';
import { etapeCible, saisineLeDe, rangVariante, type ReglagesCascade, type VarianteEnBase } from './cascadeRelance';

/** Contexte au niveau du PROFIL (chargé une fois) : réglages d'échéance + de cascade, identité, pièces, adresse, service. */
export interface ContexteRelance {
  reglages: ReglagesEcheance;         // fraîcheur de la relève (échéance d'alerte non utilisée par la cascade)
  cascade: ReglagesCascade;           // lot 3 : seuils rappel/avis + délai de saisine (config_veille, lot 2)
  profil: ProfilDemandeur;
  config: ConfigDemandeur;
  pieces: Piece[];
  adresseReponse: string;
  serviceDestinataire?: string;       // F : mention de service (config_veille mention_service_*), rendue seulement si active + non vide
}

/** Une demande envoyée candidate à la relance (acheminement agrégé + compteurs de satisfaction au dossier — R6c). */
export interface DemandeEnvoyeeRelance {
  demandeId: number;
  reference: string;
  envoyeLe: Date | null;
  statutAcheminement: string;
  dossiersActifs: number;      // R6c : nb de dossiers actifs
  dossiersSatisfaits: number;  // R6c : nb de dossiers dont les pièces sont obtenues
}

/** Dossiers d'une demande + les ids déjà satisfaits (pour ne relancer que les dossiers dus). */
export interface LotRelance { lot: Lot; satisfaitsIds: number[] }

/** Une entrée de l'HISTORIQUE des envois d'une demande (E) — dérivée de la jointure demande_acheminement × demande_relance. */
export interface EnvoiHistorique { date: Date; libelle: string }
/** La relance VIVANTE (non abandonnée) d'une demande, s'il y en a une — avec sa variante (pour l'idempotence/transition). */
export interface RelanceVivante { relanceId: number; variante: VarianteEnBase }

export interface DepsRelanceAuto {
  maintenant(): Date;
  lireContexte(): Promise<ContexteRelance>;
  derniereReleveOkLe(): Promise<Date | null>;
  lireDemandesEnvoyees(profil: ProfilDemandeur): Promise<DemandeEnvoyeeRelance[]>;
  lireVivante(demandeId: number): Promise<RelanceVivante | null>;       // C : la relance vivante + sa variante (null si aucune)
  relanceExiste(demandeId: number): Promise<boolean>; // R5c : TOUTE relance (même abandonnée) bloque l'auto → un abandon est respecté
  dossiersSatisfaitsDepuisRelance(demandeId: number): Promise<boolean>; // R6c : une relance vivante existe ET des dossiers ont été satisfaits après elle
  journaliser(demandeId: number, motif: string): Promise<void>;         // R6c : note « systeme » sans régénérer le courrier
  lireLot(demandeId: number): Promise<LotRelance | null>;
  lireHistorique(demandeId: number): Promise<EnvoiHistorique[]>;         // E : historique des envois (jamais stocké), trié par date
  enregistrerRelance(demandeId: number, profil: ProfilDemandeur, variante: VarianteRelance, objet: string, corps: string, motif: string): Promise<number>;
  transiterRelance(ancienneRelanceId: number, demandeId: number, profil: ProfilDemandeur, variante: VarianteRelance, objet: string, corps: string, cible: VarianteRelance): Promise<number>; // D : abandon + note + journal + insert, UNE transaction
}

export interface BilanRelance { examinees: number; creees: number; ignorees: number; erreurs: number; signalees: number; identiteIncomplete: boolean }

/**
 * Lot 3/6 — ORDONNANCE la cascade de relance : pour chaque demande envoyée, calcule l'ÉTAPE CIBLE du jour (rappel/avis/saisine)
 * et PRÉPARE le brouillon correspondant (jamais d'envoi). GARDE-FOU identité en tête. Un échec sur une demande n'interrompt pas
 * les suivantes. ⚠️ INVARIANT : l'ordonnanceur n'envoie JAMAIS rien à une mairie — il ne fait que ranger des brouillons.
 *
 * Par demande : B qualification (délivrée + relève fraîche + ≥1 dossier dû) → A fenêtre cible → C idempotence par la variante de
 * la vivante (== → rien ; précède → D transition en UNE transaction ; pas de vivante mais relance existante → R5c stop ; aucune →
 * création). Le texte porte l'historique (E) et le service (F) ; la saisine annonce sa date (G).
 */
export async function executerRelanceAuto(deps: DepsRelanceAuto): Promise<BilanRelance> {
  const ctx = await deps.lireContexte();
  // Identité incomplète → AUCUNE relance générée (un corps à identité vide est un courrier à jeter — leçon du courrier initial).
  if (problemesIdentite(ctx.config, ctx.profil).length > 0) {
    return { examinees: 0, creees: 0, ignorees: 0, erreurs: 0, signalees: 0, identiteIncomplete: true };
  }

  const derniereOk = await deps.derniereReleveOkLe();
  const demandes = await deps.lireDemandesEnvoyees(ctx.profil);
  const maintenant = deps.maintenant();

  let examinees = 0, creees = 0, ignorees = 0, erreurs = 0, signalees = 0;
  for (const d of demandes) {
    const envoyeLe = d.envoyeLe;
    // B — QUALIFICATION : délivrée (acheminement 'envoye', jamais rebond/échec), envoi connu, relève FRAÎCHE (sinon le silence
    //   n'est pas vérifié → aucune étape n'est visée).
    if (d.statutAcheminement !== 'envoye' || envoyeLe === null) continue;
    if (!releveEstFraiche(derniereOk, maintenant, ctx.reglages.releveFraicheurHeures)) continue;
    // A — FENÊTRE CIBLE : quelle étape aujourd'hui (ou null = trop tôt, aucune étape).
    const cible = etapeCible(envoyeLe, maintenant, ctx.cascade);
    if (cible === null) continue;
    examinees += 1;

    // C — IDEMPOTENCE par la variante de la VIVANTE.
    const vivante = await deps.lireVivante(d.demandeId);
    let transiter = false;
    if (vivante !== null) {
      if (rangVariante(vivante.variante) >= rangVariante(cible)) {
        // Même étape (ou déjà plus avancée) → ne rien régénérer. On CONSERVE le signalement R6c d'une vivante devenue obsolète.
        if (await deps.dossiersSatisfaitsDepuisRelance(d.demandeId)) {
          await deps.journaliser(d.demandeId, 'des dossiers ont été satisfaits depuis la relance en cours ; relance NON régénérée automatiquement');
          signalees += 1;
        }
        ignorees += 1;
        continue;
      }
      transiter = true; // la vivante PRÉCÈDE la cible → transition (D)
    } else if (await deps.relanceExiste(d.demandeId)) {
      // R5c — pas de vivante MAIS une relance existe (abandonnée) : un abandon manuel arrête la cascade. NE RIEN FAIRE.
      ignorees += 1;
      continue;
    }
    // sinon (pas de vivante, aucune relance) → création fraîche

    const lot = await deps.lireLot(d.demandeId);
    if (lot === null) { ignorees += 1; continue; }
    if (lot.lot.dossiers.length - lot.satisfaitsIds.length <= 0) { ignorees += 1; continue; } // aucun dossier dû

    try {
      const echeanceLe = echeanceDe(envoyeLe);
      const historique = await deps.lireHistorique(d.demandeId); // E — construit par jointure, JAMAIS stocké
      const { objet, corps } = genererRelance({
        reference: d.reference, profil: ctx.profil, lot: lot.lot, dossiersSatisfaitsIds: lot.satisfaitsIds,
        config: ctx.config, pieces: ctx.pieces, envoyeeLe: envoyeLe, echeanceLe,
        saisineLe: saisineLeDe(envoyeLe, ctx.cascade.saisineDelaiJours),   // G — délai de saisine RÉGLAGE
        adresseReponse: ctx.adresseReponse, historique, serviceDestinataire: ctx.serviceDestinataire, // E + F
      }, cible);
      if (transiter && vivante !== null) {
        // D — UNE SEULE TRANSACTION : abandon de la vivante (+ note) + journal + INSERT de la nouvelle étape.
        await deps.transiterRelance(vivante.relanceId, d.demandeId, ctx.profil, cible, objet, corps, cible);
      } else {
        await deps.enregistrerRelance(d.demandeId, ctx.profil, cible, objet, corps, `brouillon de relance « ${cible} » généré`);
      }
      creees += 1;
    } catch { erreurs += 1; } // isolation : une demande en échec n'arrête pas les suivantes
  }
  return { examinees, creees, ignorees, erreurs, signalees, identiteIncomplete: false };
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

/**
 * R5c — contexte de relance au niveau du PROFIL (réglages d'échéance, identité, pièces, adresse de réponse). EXPORTÉ pour être
 * réutilisé par la régénération MANUELLE (demandeRelanceRepo). `profilOverride` cible un profil précis (relance d'UNE demande
 * donnée) ; sans lui on prend le profil global de la veille (cfg.releveProfil) — comportement historique de depsReellesRelance.
 */
export async function chargerContexteRelance(profilOverride?: ProfilDemandeur): Promise<ContexteRelance> {
  const cfg = await chargerConfigVeille();
  const profil: ProfilDemandeur = profilOverride ?? (cfg.releveProfil === 'personne' ? 'personne' : 'entreprise'); // garde : liste fermée
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
    cascade: { rappelJoursAvant: cfg.relanceRappelJoursAvant, avisJoursAvant: cfg.relanceAvisJoursAvant, saisineDelaiJours: cfg.relanceSaisineDelaiJours },
    profil, config, pieces: piecesDepuisConfig(cfg.piecesDemandees), adresseReponse: cfg.adresseReponse,
    // F — service destinataire : la mention S40 (config_veille), passée SEULEMENT si active ET non vide (aucun littéral en dur).
    serviceDestinataire: cfg.mentionServiceActive && cfg.mentionServiceTexte.trim() !== '' ? cfg.mentionServiceTexte : undefined,
  };
}

/**
 * R5c — charge le LOT d'une demande (tous ses dossiers ACTIFS + les ids déjà satisfaits). EXPORTÉ et réutilisé par la
 * régénération manuelle : genererRelance ne listera que les dossiers DUS. `null` si la demande est introuvable.
 */
export async function chargerLotRelance(demandeId: number): Promise<LotRelance | null> {
  const meta = await query<{ code_insee: string; commune_nom: string | null; dest_canal: string | null }>(
    `SELECT d.code_insee, c.nom AS commune_nom, d.dest_canal FROM demande d LEFT JOIN commune c ON c.code_insee = d.code_insee WHERE d.id = $1`,
    [demandeId]);
  const m = meta.rows[0];
  if (!m) return null;
  // Tous les dossiers ACTIFS (satisfaits ou non) + le drapeau de satisfaction : genererRelance ne listera que les dus.
  const doss = await query<LigneDossierSql & { satisfait: boolean }>(
    `SELECT s.id, s.num_dau, s.date_reelle_autorisation::text AS date_reelle_autorisation,
            s.adr_num_ter, s.adr_libvoie_ter, s.adr_localite_ter, s.adr_codpost_ter,
            s.sec_cadastre1, s.num_cadastre1, s.sec_cadastre2, s.num_cadastre2, s.sec_cadastre3, s.num_cadastre3,
            (dd.satisfait_le IS NOT NULL) AS satisfait
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
  const satisfaitsIds = doss.rows.filter((d) => d.satisfait).map((d) => d.id);
  return { lot: { codeInsee: m.code_insee, communeNom, canal: (m.dest_canal as CanalContact) ?? 'email', dossiers }, satisfaitsIds };
}

/**
 * R6c/W1 — une relance VIVANTE de la demande existe-t-elle ET des dossiers ont-ils été satisfaits APRÈS sa génération ?
 * (le brouillon figé ne liste plus les bons dossiers → il est obsolète). EXPORTÉ pour être réutilisé À L'IDENTIQUE par l'envoi
 * des relances (W1) comme garde-fou anti-envoi d'un brouillon périmé — jamais réimplémenté.
 */
export async function dossiersSatisfaitsDepuisRelance(demandeId: number): Promise<boolean> {
  const { rows } = await query<{ obsolete: boolean }>(
    `SELECT EXISTS (
        SELECT 1 FROM demande_relance rl
          JOIN demande_dossier dd ON dd.demande_id = rl.demande_id
         WHERE rl.demande_id = $1 AND rl.type = 'relance' AND rl.statut <> 'abandonnee'
           AND dd.satisfait_le IS NOT NULL AND dd.satisfait_le > rl.generee_le
      ) AS obsolete`,
    [demandeId]);
  return rows[0]?.obsolete === true;
}

export function depsReellesRelance(): DepsRelanceAuto {
  return {
    maintenant: () => new Date(),
    lireContexte: () => chargerContexteRelance(),
    derniereReleveOkLe: async () => {
      const { rows } = await query<{ t: Date | null }>(`SELECT max(termine_le) AS t FROM releve_run WHERE resultat = 'ok'`);
      return rows[0]?.t ?? null;
    },
    lireDemandesEnvoyees: async (profil) => {
      const { rows } = await query<{ id: number; reference: string; envoye_le: Date | null; statut_acheminement: string; dossiers_actifs: number; dossiers_satisfaits: number }>(
        `SELECT d.id::int AS id, d.reference,
                min(a.envoye_le) AS envoye_le,
                CASE WHEN bool_or(a.statut = 'envoye') THEN 'envoye'
                     WHEN bool_or(a.statut = 'rebond') THEN 'rebond'
                     WHEN bool_or(a.statut = 'echec')  THEN 'echec'
                     ELSE 'en_attente' END AS statut_acheminement,
                (SELECT count(*)::int FROM demande_dossier dd WHERE dd.demande_id = d.id AND dd.actif) AS dossiers_actifs,
                (SELECT count(*)::int FROM demande_dossier dd WHERE dd.demande_id = d.id AND dd.actif AND dd.satisfait_le IS NOT NULL) AS dossiers_satisfaits
           FROM demande d
           -- B2 — ancre d'échéance agnostique au canal (un dépôt téléservice écrit canal='formulaire', pas 'email').
           LEFT JOIN demande_acheminement a ON a.demande_id = d.id
          WHERE d.statut = 'envoyee' AND d.profil_demandeur = $1
          GROUP BY d.id, d.reference`,
        [profil]);
      return rows.map((r) => ({ demandeId: r.id, reference: r.reference, envoyeLe: r.envoye_le, statutAcheminement: r.statut_acheminement, dossiersActifs: r.dossiers_actifs, dossiersSatisfaits: r.dossiers_satisfaits }));
    },
    lireVivante: async (demandeId) => {
      // C — la relance VIVANTE (non abandonnée) et sa variante. L'unique partiel (076) en garantit au plus une.
      const { rows } = await query<{ id: number; variante: string }>(
        `SELECT id::int AS id, variante FROM demande_relance WHERE demande_id = $1 AND type = 'relance' AND statut <> 'abandonnee' LIMIT 1`,
        [demandeId]);
      const r = rows[0];
      return r ? { relanceId: r.id, variante: r.variante as VarianteEnBase } : null;
    },
    relanceExiste: async (demandeId) => {
      // R5c — TOUTE relance bloque l'auto, y compris une abandonnée (plus de filtre `statut <> 'abandonnee'`) : un abandon
      // manuel doit être respecté. Seul le geste manuel « régénérer » (demandeRelanceRepo) en refait une.
      const { rows } = await query<{ existe: boolean }>(
        `SELECT EXISTS (SELECT 1 FROM demande_relance WHERE demande_id = $1 AND type = 'relance') AS existe`,
        [demandeId]);
      return rows[0]?.existe === true;
    },
    dossiersSatisfaitsDepuisRelance: (demandeId) => dossiersSatisfaitsDepuisRelance(demandeId), // W1 : délègue à la fonction exportée (SQL inchangé)
    journaliser: async (demandeId, motif) => {
      await query(
        `INSERT INTO demande_journal (demande_id, statut_avant, statut_apres, motif, auteur) VALUES ($1, NULL, NULL, $2, 'systeme')`,
        [demandeId, motif]);
    },
    lireLot: (demandeId) => chargerLotRelance(demandeId),
    lireHistorique: (demandeId) => chargerHistoriqueEnvois(demandeId), // E — jointure acheminement × relance (exportée, testable)
    enregistrerRelance: async (demandeId, profil, variante, objet, corps, motif) => {
      return withTransaction(async (q) => {
        const { rows } = await q<{ id: number }>(
          `INSERT INTO demande_relance (demande_id, type, variante, objet, corps, profil_demandeur, statut)
           VALUES ($1, 'relance', $5, $2, $3, $4, 'brouillon') RETURNING id`,
          [demandeId, objet, corps, profil, variante]);
        // Journal APPEND-ONLY : aucune transition de statut de la DEMANDE (statut_avant/apres NULL) — on n'écrit jamais demande.statut.
        await q(
          `INSERT INTO demande_journal (demande_id, statut_avant, statut_apres, motif, auteur) VALUES ($1, NULL, NULL, $2, 'systeme')`,
          [demandeId, motif]);
        return rows[0].id;
      });
    },
    transiterRelance: async (ancienneRelanceId, demandeId, profil, variante, objet, corps, cible) => {
      // D — UNE SEULE TRANSACTION : abandon de la vivante (+ note lisible) → INSERT de la nouvelle étape → journal. En deux
      //   transactions, une interruption laisserait la demande SANS vivante et relanceExiste=true la bloquerait à jamais.
      return withTransaction(async (q) => {
        await q(
          `UPDATE demande_relance SET statut = 'abandonnee', note = btrim(coalesce(note || chr(10), '') || $2)
            WHERE id = $1 AND statut <> 'abandonnee'`,
          [ancienneRelanceId, `remplacée par l'étape « ${cible} »`]);
        const { rows } = await q<{ id: number }>(
          `INSERT INTO demande_relance (demande_id, type, variante, objet, corps, profil_demandeur, statut)
           VALUES ($1, 'relance', $5, $2, $3, $4, 'brouillon') RETURNING id`,
          [demandeId, objet, corps, profil, variante]);
        const nouvelId = rows[0].id;
        await q(
          `INSERT INTO demande_journal (demande_id, statut_avant, statut_apres, motif, auteur) VALUES ($1, NULL, NULL, $2, 'systeme')`,
          [demandeId, `relance ${ancienneRelanceId} remplacée par l'étape « ${cible} » → nouvelle relance ${nouvelId}`]);
        return nouvelId;
      });
    },
  };
}

// ── Historique des envois (E) — dérivé, jamais stocké ─────────────────────────
/**
 * Lot 3/6 — HISTORIQUE des envois d'une demande, par la jointure demande_acheminement × demande_relance : chaque ÉMISSION réelle
 * (`envoye_le` non nul, statut 'envoye') donne sa DATE et sa NATURE — `relance_id IS NULL` = demande initiale, sinon la variante
 * de la relance. Trié par date CROISSANTE. JAMAIS stocké (reconstruit à chaque génération). Exporté pour être testé.
 */
export async function chargerHistoriqueEnvois(demandeId: number): Promise<EnvoiHistorique[]> {
  const { rows } = await query<{ envoye_le: Date; relance_id: number | null; variante: string | null }>(
    `SELECT a.envoye_le, a.relance_id::int AS relance_id, rl.variante
       FROM demande_acheminement a
       LEFT JOIN demande_relance rl ON rl.id = a.relance_id
      WHERE a.demande_id = $1 AND a.envoye_le IS NOT NULL AND a.statut = 'envoye'
      ORDER BY a.envoye_le ASC`,
    [demandeId]);
  return rows.map((r) => ({ date: r.envoye_le, libelle: libelleEnvoi(r.relance_id, r.variante) }));
}

/** Libellé d'un envoi de l'historique : demande initiale, ou étape de relance (rappel/avis → « nouvelle demande »). */
export function libelleEnvoi(relanceId: number | null, variante: string | null): string {
  if (relanceId === null) return 'demande initiale, adressée par courrier électronique';
  if (variante === 'saisine') return 'information de la saisine à venir';
  return 'nouvelle demande'; // rappel, avis (et 'formelle' héritée)
}
