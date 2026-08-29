/**
 * PART-3a — GESTE MANUEL « demander à la mairie les pièces manquantes », DANS LE FIL de son dernier message. IMPUR (base + SMTP).
 *
 * ENVOI MANUEL STRICTEMENT : appelé UNIQUEMENT par la route admin (action explicite). L'ordonnanceur n'y touche pas — l'invariant
 * « la veille n'écrit jamais à une mairie » reste entier (aucun branchement dans executerVeille).
 *
 * Orchestrateur PUR-par-injection (`executerDemandePieces`) + implémentation réelle (`depsReellesDemandePieces`) : les tests
 * injectent un `envoyer` factice → AUCUN e-mail réel. Journalise dans `demande_journal` (foyer unique, pas de 2e journal).
 */
import { query } from '../db/client';
import { composerComplementPieces, estNoReply, entetesFil } from './complementPieces';
import type { FamillePlan } from './planMasse';

/** La cible du geste : le dernier message répondable de la mairie + de quoi répondre dans le fil. */
export interface CibleComplement {
  demandeId: number;
  numDau: string;
  destinataire: string;        // de_adresse du dernier message reçu
  deNom: string | null;
  messageId: string;           // Message-ID reçu (In-Reply-To de notre réponse)
  referencesBrut: string | null;
  from: string;                // adresse d'expédition du profil (= reply-to : la mairie répond dans la boîte relue)
  profil: string;              // profil_demandeur (entreprise|personne) → compte SMTP
  motifIndisponible: string | null; // ≠ null ⇒ envoi impossible (no-reply, adresse d'expédition absente…)
}

export interface ResultatDemandePieces {
  ok: boolean;
  motif?: string;
  destinataire?: string;
  familles?: FamillePlan[];
  messageId?: string;
}

export interface DepsDemandePieces {
  lireCible(dossierId: number): Promise<CibleComplement | null>;
  envoyer(cible: CibleComplement, objet: string, corps: string): Promise<{ messageId: string }>;
  journaliser(demandeId: number, motif: string, auteur: string): Promise<void>;
}

/**
 * Orchestre le geste. Refuse (sans envoyer) si : aucun message de mairie, adresse non répondable / expédition indisponible, ou
 * aucune famille demandée. L'ENVOI précède le JOURNAL (un envoi échoué ne laisse pas de trace « envoyé »). PUR par injection.
 */
export async function executerDemandePieces(deps: DepsDemandePieces, arg: { dossierId: number; familles: readonly FamillePlan[]; auteur: string }): Promise<ResultatDemandePieces> {
  const familles = [...new Set(arg.familles)];
  if (familles.length === 0) return { ok: false, motif: 'aucune famille sélectionnée' };

  const cible = await deps.lireCible(arg.dossierId);
  if (cible === null) return { ok: false, motif: 'aucun message de mairie auquel répondre pour ce permis' };
  if (cible.motifIndisponible !== null) return { ok: false, motif: cible.motifIndisponible };

  const mail = composerComplementPieces(cible.numDau, familles);
  if (mail === null) return { ok: false, motif: 'aucune famille sélectionnée' }; // filet

  const { messageId } = await deps.envoyer(cible, mail.objet, mail.corps); // AVANT le journal
  await deps.journaliser(
    cible.demandeId,
    `complément de pièces demandé à ${cible.destinataire} (familles : ${familles.join(', ')} ; dans le fil, messageId ${messageId})`,
    arg.auteur,
  );
  return { ok: true, destinataire: cible.destinataire, familles, messageId };
}

// ── Implémentation RÉELLE ─────────────────────────────────────────────────────

/** Lit la cible : demande du dossier (celle qui a reçu le plus récemment) + son dernier message répondable + profil/expéditeur. */
export async function lireCibleComplementReel(dossierId: number): Promise<CibleComplement | null> {
  // 1) La demande du dossier ayant la réponse la plus récente (1 demande = 1 dossier en pratique) + num_dau + profil.
  const { rows: dRows } = await query<{ demande_id: number; num_dau: string; profil: string }>(
    `SELECT dd.demande_id, s.num_dau, d.profil_demandeur AS profil
       FROM demande_dossier dd
       JOIN sitadel_dossier s ON s.id = dd.dossier_id
       JOIN demande d ON d.id = dd.demande_id
      WHERE dd.dossier_id = $1 AND dd.actif
      ORDER BY (SELECT max(r.recu_le) FROM demande_reponse r WHERE r.demande_id = dd.demande_id AND r.nature <> 'rebond') DESC NULLS LAST,
               dd.demande_id
      LIMIT 1`, [dossierId]);
  const d = dRows[0];
  if (!d) return null;

  // 2) Le dernier message reçu (hors rebond) de cette demande, avec ses en-têtes de fil.
  const { rows: mRows } = await query<{ message_id: string; references_brut: string | null; de_adresse: string; de_nom: string | null; recu_le: string }>(
    `SELECT message_id, references_brut, de_adresse, de_nom, recu_le
       FROM demande_reponse
      WHERE demande_id = $1 AND nature <> 'rebond'
      ORDER BY recu_le DESC LIMIT 1`, [d.demande_id]);
  const m = mRows[0];
  if (!m) return null; // aucune réponse → rien à quoi répondre dans le fil

  // 3) Adresse d'expédition du profil (= reply-to). Absente → envoi indisponible (jamais un repli silencieux).
  const { lireAdressesExpedition, INFIXE_SMTP } = await import('../sitadel/envoiDemande');
  const { lireCompteSmtp } = await import('../email');
  const from = ((await lireAdressesExpedition())[d.profil] ?? '').trim();
  const compteOk = lireCompteSmtp(INFIXE_SMTP[d.profil as 'entreprise' | 'personne'] ?? '') !== null;

  const motifIndisponible = estNoReply(m.de_adresse)
    ? `le dernier message de la mairie provient d’une adresse non répondable (${m.de_adresse || 'adresse absente'}) — envoi impossible`
    : from === ''
      ? 'aucune adresse d’expédition configurée pour ce profil (Réglages)'
      : !compteOk
        ? 'compte SMTP d’envoi non configuré pour ce profil'
        : null;

  return {
    demandeId: d.demande_id, numDau: d.num_dau, destinataire: m.de_adresse, deNom: m.de_nom,
    messageId: m.message_id, referencesBrut: m.references_brut, from, profil: d.profil, motifIndisponible,
  };
}

export function depsReellesDemandePieces(): DepsDemandePieces {
  return {
    lireCible: lireCibleComplementReel,
    envoyer: async (cible, objet, corps) => {
      const { obtenirTransporteur, lireCompteSmtp, envoyerComplementPieces } = await import('../email');
      const { INFIXE_SMTP } = await import('../sitadel/envoiDemande');
      const compte = lireCompteSmtp(INFIXE_SMTP[cible.profil as 'entreprise' | 'personne'] ?? '');
      if (compte === null) throw new Error('compte SMTP non configuré');
      const { inReplyTo, references } = entetesFil(cible.messageId, cible.referencesBrut); // fil = dernier message reçu
      const emission = await envoyerComplementPieces(obtenirTransporteur(compte), cible.from, {
        to: cible.destinataire, replyTo: cible.from, objet, corps, inReplyTo, references,
      });
      return { messageId: emission.messageId };
    },
    journaliser: async (demandeId, motif, auteur) => {
      await query(
        `INSERT INTO demande_journal (demande_id, statut_avant, statut_apres, motif, auteur) VALUES ($1, NULL, NULL, $2, $3)`,
        [demandeId, motif, auteur]);
    },
  };
}

/** Préfixe des lignes de journal de ce geste (écriture ET lecture d'historique — source unique). */
export const MOTIF_COMPLEMENT_PREFIXE = 'complément de pièces demandé';

/** État pour l'écran : cible (destinataire, répondable, motif) + historique des envois de complément (depuis demande_journal). */
export interface EtatDemandePieces {
  destinataire: string | null;
  repliable: boolean;
  motif: string | null;
  historique: { le: string; motif: string }[];
}

export async function lireEtatDemandePieces(dossierId: number): Promise<EtatDemandePieces> {
  const cible = await lireCibleComplementReel(dossierId);
  if (cible === null) {
    return { destinataire: null, repliable: false, motif: 'aucun message de mairie auquel répondre pour ce permis', historique: [] };
  }
  const { rows } = await query<{ le: string; motif: string }>(
    `SELECT horodatage::text AS le, motif FROM demande_journal
      WHERE demande_id = $1 AND motif LIKE $2 || '%' ORDER BY horodatage DESC LIMIT 10`,
    [cible.demandeId, MOTIF_COMPLEMENT_PREFIXE]);
  return {
    destinataire: cible.destinataire,
    repliable: cible.motifIndisponible === null,
    motif: cible.motifIndisponible,
    historique: rows.map((r) => ({ le: r.le, motif: r.motif })),
  };
}
