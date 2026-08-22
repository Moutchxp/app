/**
 * RELANCE LOT 6/6 — ENVOI AUTOMATIQUE aux mairies / à la CADA. Branché dans le CORPS d'executerVeille, sous le MÊME verrou,
 * APRÈS la préparation de la cascade. ⚠️ CE MODULE LÈVE l'invariant historique « executerVeille n'écrit jamais à un tiers » :
 * il n'écrit à un tiers QUE si l'interrupteur correspondant est EXPLICITEMENT activé (défauts false → rien ne part).
 *
 * DEUX interrupteurs DISTINCTS, jamais confondus : relance_auto_active (courriers de relance aux mairies) et
 * saisine_cada_auto_active (saisine devant la CADA). Arno peut activer l'un sans l'autre.
 *
 * Ce module N'ÉCRIT AUCUNE logique d'envoi : il APPELLE envoyerRelances / envoyerSaisinesCada (leurs gardes — obsolescence,
 * close/non-brouillon, dossiers satisfaits, anti-double-envoi, forclusion, caps — restent intactes), en leur passant le plafond
 * d'envoi AUTOMATIQUE (envois_auto_max_par_run) EN PLUS des caps existants (jamais à leur place). Les deux étapes et le compte
 * rendu sont ISOLÉS : un échec ne fait jamais échouer la veille, ni l'une l'autre.
 *
 * COMPTE RENDU (à alerte_email) : dès qu'au moins un courrier est parti OU qu'au moins une saisine a été mise en file de dépôt
 * formulaire (fait qui appelle une action manuelle), un e-mail récapitule les envois (commune, permis, étape, heure) et les cas
 * écartés (obsolète, plafond, adresse manquante, dossiers satisfaits, forclusion). Rien de tout cela → aucun e-mail (pas de bruit).
 */
import { chargerConfigVeille } from '../sitadel/veilleConfig';
import { query } from '../db/client';
import { envoyerRelances, type RapportEnvoiRelance } from '../sitadel/envoiRelance';
import { envoyerSaisinesCada, type RapportEnvoiSaisine } from '../sitadel/envoiSaisineCada';

// ── Types du compte rendu (purs) ─────────────────────────────────────────────
export interface LigneEmis { reference: string; commune: string | null; numeros: string[]; etape: string }
export interface LigneEcarte { reference: string; commune: string | null; numeros: string[]; motif: string }
export interface LigneFileRendu { reference: string; commune: string | null; numeros: string[] }

const permis = (nums: string[]): string => (nums.length > 0 ? nums.join(', ') : '(aucun numéro)');

/** Heure locale (Europe/Paris) d'un envoi, pour le compte rendu. */
function heureParis(d: Date): string {
  return new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'long', timeStyle: 'short' }).format(d);
}

/**
 * COMPOSE le compte rendu (PUR, testable sans I/O) : la liste des courriers partis, la file de dépôt formulaire à traiter à la
 * main, et les cas écartés avec leur motif. Aucune section n'est muette (chaque bloc dit son décompte).
 */
export function composerCompteRenduEnvoiAuto(input: { emis: LigneEmis[]; ecartes: LigneEcarte[]; file: LigneFileRendu[]; maintenant: Date }): { sujet: string; corps: string } {
  const { emis, ecartes, file, maintenant } = input;
  const sujet = `Envoi automatique — ${emis.length} courrier(s) parti(s)`
    + (file.length > 0 ? `, ${file.length} saisine(s) à déposer` : '');
  const lignes: string[] = [`Compte rendu de l'envoi automatique du ${heureParis(maintenant)}.`, ''];

  lignes.push(`Courriers envoyés (${emis.length}) :`);
  if (emis.length === 0) lignes.push('  — aucun');
  else for (const e of emis) lignes.push(`  • ${e.commune ?? 'commune inconnue'} — permis ${permis(e.numeros)} — ${e.etape} — ${e.reference}`);
  lignes.push('');

  if (file.length > 0) {
    lignes.push(`Saisines CADA à DÉPOSER À LA MAIN sur le formulaire en ligne (${file.length}) — aucune adresse e-mail CADA configurée, rien n'est parti :`);
    for (const f of file) lignes.push(`  • ${f.commune ?? 'commune inconnue'} — permis ${permis(f.numeros)} — ${f.reference}`);
    lignes.push('');
  }

  lignes.push(`Écartés / reportés (${ecartes.length}) :`);
  if (ecartes.length === 0) lignes.push('  — aucun');
  else for (const c of ecartes) lignes.push(`  • ${c.commune ?? c.reference} — permis ${permis(c.numeros)} — ${c.motif}`);
  lignes.push('');
  lignes.push('Envoi déclenché automatiquement (interrupteurs d’envoi auto activés). Les caps d’envoi et le plafond automatique bornent chaque salve.');

  return { sujet, corps: lignes.join('\n') };
}

// ── Orchestration ─────────────────────────────────────────────────────────────
export interface DepsEnvoiAuto {
  lireConfig(): Promise<{ relanceActive: boolean; saisineActive: boolean; plafondAuto: number; alerteEmail: string }>;
  envoyerRelances(plafondAuto: number): Promise<RapportEnvoiRelance>;
  envoyerSaisines(plafondAuto: number): Promise<RapportEnvoiSaisine>;
  envoyerCompteRendu(destinataire: string, sujet: string, corps: string): Promise<void>;
  journaliser(demandeIds: number[], motif: string): Promise<void>; // best-effort, ancré sur les demandes concernées
  maintenant(): Date;
}

export interface IssueEnvoiAuto {
  resultat: 'ignore' | 'termine';
  relancesEnvoyees: number;
  saisinesEnvoyees: number;
  saisinesEnFile: number;
  ecartes: number;
  compteRenduEmis: boolean;
  raison: string;
}

const nomErr = (e: unknown): string => (e instanceof Error ? e.name : 'Error');

/**
 * Exécute les DEUX étapes d'envoi automatique (chacune sous SON interrupteur), puis, s'il s'est passé quelque chose, le compte
 * rendu. Aucun interrupteur actif → 'ignore' (aucun e-mail). Chaque étape et le compte rendu sont isolés (un échec n'arrête rien).
 */
export async function executerEnvoiAuto(deps: DepsEnvoiAuto): Promise<IssueEnvoiAuto> {
  const cfg = await deps.lireConfig();
  if (!cfg.relanceActive && !cfg.saisineActive) {
    return { resultat: 'ignore', relancesEnvoyees: 0, saisinesEnvoyees: 0, saisinesEnFile: 0, ecartes: 0, compteRenduEmis: false, raison: 'aucun interrupteur d’envoi automatique activé' };
  }

  // ÉTAPE relances (isolée). Le plafond auto = envois_auto_max_par_run (par run, relances + saisines cumulées).
  let rRel: RapportEnvoiRelance | null = null;
  if (cfg.relanceActive) {
    try { rRel = await deps.envoyerRelances(cfg.plafondAuto); }
    catch (e) { await deps.journaliser([], `envoi automatique des relances en échec (${nomErr(e)}) — isolé, la veille continue`); }
  }
  const relEnvoyees = rRel ? rRel.resultats.filter((x) => x.issue === 'envoye') : [];

  // ÉTAPE saisines (isolée). Budget auto RESTANT après les relances (le plafond est PARTAGÉ sur le run) ; le budget quotidien
  // l'est déjà via compterEmisAujourdhui (les lignes des relances committées sont comptées). cada_email vide → mise en file.
  const restantAuto = Math.max(0, cfg.plafondAuto - relEnvoyees.length);
  let rSai: RapportEnvoiSaisine | null = null;
  if (cfg.saisineActive) {
    try { rSai = await deps.envoyerSaisines(restantAuto); }
    catch (e) { await deps.journaliser([], `envoi automatique des saisines en échec (${nomErr(e)}) — isolé, la veille continue`); }
  }
  const saiEnvoyees = rSai ? rSai.resultats.filter((x) => x.issue === 'envoye') : [];

  // COMPTE RENDU — normalisation des faits (courriers partis, file, écartés) depuis les deux rapports.
  const emis: LigneEmis[] = [
    ...relEnvoyees.flatMap((r) => {
      const d = rRel!.destinataires.find((x) => x.relanceId === r.relanceId);
      return d ? [{ reference: d.reference, commune: d.commune, numeros: d.numeros, etape: `relance « ${d.variante} »` }] : [];
    }),
    ...saiEnvoyees.flatMap((r) => {
      const d = rSai!.destinataires.find((x) => x.saisineId === r.saisineId);
      return d ? [{ reference: d.reference, commune: d.commune, numeros: d.numeros, etape: 'saisine CADA' }] : [];
    }),
  ];
  const ecartes: LigneEcarte[] = [];
  if (rRel) {
    for (const b of rRel.bloqueesObsoletes) ecartes.push({ reference: b.reference, commune: null, numeros: [], motif: b.motif });
    for (const b of rRel.bloqueesCompte) ecartes.push({ reference: b.reference, commune: null, numeros: [], motif: b.motif });
    for (const b of rRel.bloqueesCorps) ecartes.push({ reference: b.reference, commune: null, numeros: [], motif: b.motif });
    for (const b of rRel.reportes) ecartes.push({ reference: b.reference, commune: b.commune, numeros: b.numeros, motif: b.motif });
  }
  if (rSai) {
    for (const b of rSai.bloqueesForclusion) ecartes.push({ reference: b.reference, commune: null, numeros: [], motif: `forclusion : ${b.motif}` });
    for (const b of rSai.bloqueesPiece) ecartes.push({ reference: b.reference, commune: null, numeros: [], motif: b.motif });
    for (const b of rSai.bloqueesCorps) ecartes.push({ reference: b.reference, commune: null, numeros: [], motif: b.motif });
    for (const b of rSai.bloqueesCompte) ecartes.push({ reference: b.reference, commune: null, numeros: [], motif: b.motif });
    for (const b of rSai.reportes) ecartes.push({ reference: b.reference, commune: b.commune, numeros: b.numeros, motif: b.motif });
  }
  const file: LigneFileRendu[] = rSai ? rSai.fileADeposer.map((f) => ({ reference: f.reference, commune: f.communeNom, numeros: f.numeros })) : [];
  const idsConcernes = [
    ...relEnvoyees.flatMap((r) => { const d = rRel!.destinataires.find((x) => x.relanceId === r.relanceId); return d ? [d.demandeId] : []; }),
    ...saiEnvoyees.flatMap((r) => { const d = rSai!.destinataires.find((x) => x.saisineId === r.saisineId); return d ? [d.demandeId] : []; }),
  ];

  // Le compte rendu part si quelque chose S'EST PASSÉ : au moins un courrier envoyé OU au moins une saisine en file (fait qui
  // appelle une action manuelle). Sinon aucun e-mail (pas de bruit quotidien).
  let compteRenduEmis = false;
  if (emis.length >= 1 || file.length >= 1) {
    const { sujet, corps } = composerCompteRenduEnvoiAuto({ emis, ecartes, file, maintenant: deps.maintenant() });
    if (cfg.alerteEmail.trim() === '') {
      await deps.journaliser(idsConcernes, 'compte rendu d’envoi automatique NON émis : aucune adresse d’alerte configurée (les envois sont faits et tracés)');
    } else {
      try { await deps.envoyerCompteRendu(cfg.alerteEmail, sujet, corps); compteRenduEmis = true; }
      catch (e) { await deps.journaliser(idsConcernes, `compte rendu d’envoi automatique en échec (${nomErr(e)}) — les envois restent faits et tracés`); }
    }
  }

  return {
    resultat: 'termine',
    relancesEnvoyees: relEnvoyees.length, saisinesEnvoyees: saiEnvoyees.length, saisinesEnFile: file.length,
    ecartes: ecartes.length, compteRenduEmis,
    raison: `relances=${relEnvoyees.length}, saisines=${saiEnvoyees.length}, en file=${file.length}, écartés=${ecartes.length}`,
  };
}

/** Envoi RÉEL du compte rendu via le compte SMTP par défaut (import dynamique : nodemailer hors du graphe statique). */
async function envoyerCompteRenduReel(destinataire: string, sujet: string, corps: string): Promise<void> {
  const { lireConfigEmail, obtenirTransporteur } = await import('../email');
  const cfg = lireConfigEmail();
  if (cfg === null) throw new Error('compte SMTP par défaut non configuré (SMTP_* / MAIL_FROM)');
  await obtenirTransporteur(cfg).sendMail({ from: cfg.from, to: destinataire, subject: sujet, text: corps });
}

export function depsReellesEnvoiAuto(): DepsEnvoiAuto {
  return {
    lireConfig: async () => {
      const c = await chargerConfigVeille();
      return { relanceActive: c.relanceAutoActive === true, saisineActive: c.saisineCadaAutoActive === true, plafondAuto: c.envoisAutoMaxParRun, alerteEmail: c.alerteEmail };
    },
    envoyerRelances: (plafondAuto) => envoyerRelances({ appliquer: true, auteur: 'auto', plafondAuto }),
    envoyerSaisines: (plafondAuto) => envoyerSaisinesCada({ appliquer: true, auteur: 'auto', plafondAuto }),
    envoyerCompteRendu: envoyerCompteRenduReel,
    journaliser: async (demandeIds, motif) => {
      // Ancré sur CHAQUE demande concernée (append-only, statut_avant/apres NULL, jamais demande.statut). Best-effort : une
      // écriture de journal qui échoue n'annule rien. Sans demande à ancrer (échec d'une ÉTAPE globale), rien n'est écrit.
      for (const id of demandeIds) {
        try { await query(`INSERT INTO demande_journal (demande_id, statut_avant, statut_apres, motif, auteur) VALUES ($1, NULL, NULL, $2, 'systeme')`, [id, motif]); }
        catch { /* best-effort */ }
      }
    },
    maintenant: () => new Date(),
  };
}
