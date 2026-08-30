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
import { problemeTexteComplement, problemeDateDeclaration, estNoReply, entetesFil } from './complementPieces';
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
  recuLe: string;              // date/heure du dernier message reçu (borne basse d'une relance déclarée — PART-3e)
  motifIndisponible: string | null; // ≠ null ⇒ envoi impossible (no-reply, adresse d'expédition absente…)
}

export interface ResultatDemandePieces {
  ok: boolean;
  motif?: string;
  destinataire?: string;
  familles?: FamillePlan[];
  messageId?: string;
}

/** Ce que le journal doit conserver (trace opposable) : l'objet + le corps RÉELLEMENT ENVOYÉS, + le contexte. */
export interface TraceEnvoi { objet: string; corps: string; familles: FamillePlan[]; destinataire: string; messageId: string }

export interface DepsDemandePieces {
  lireCible(dossierId: number): Promise<CibleComplement | null>;
  envoyer(cible: CibleComplement, objet: string, corps: string): Promise<{ messageId: string }>;
  journaliser(demandeId: number, trace: TraceEnvoi, auteur: string): Promise<void>;
}

/**
 * Orchestre l'ENVOI du complément (PART-3c : le texte est fourni par l'appelant — objet + corps ÉVENTUELLEMENT MODIFIÉS À LA MAIN —
 * et envoyé VERBATIM, jamais recomposé ici). Refuse (sans envoyer) si : aucune famille, objet/corps vide, entité HTML dans le texte,
 * aucun message de mairie, adresse non répondable / expédition indisponible. L'ENVOI précède le JOURNAL. PUR par injection.
 */
export async function executerDemandePieces(deps: DepsDemandePieces, arg: { dossierId: number; familles: readonly FamillePlan[]; objet: string; corps: string; auteur: string }): Promise<ResultatDemandePieces> {
  const familles = [...new Set(arg.familles)];
  if (familles.length === 0) return { ok: false, motif: 'aucune famille sélectionnée' };
  const problemeTexte = problemeTexteComplement(arg.objet, arg.corps);
  if (problemeTexte !== null) return { ok: false, motif: problemeTexte };

  const cible = await deps.lireCible(arg.dossierId);
  if (cible === null) return { ok: false, motif: 'aucun message de mairie auquel répondre pour ce permis' };
  if (cible.motifIndisponible !== null) return { ok: false, motif: cible.motifIndisponible };

  // ENVOI VERBATIM : exactement l'objet et le corps reçus (ce qui est affiché est ce qui part).
  const { messageId } = await deps.envoyer(cible, arg.objet, arg.corps); // AVANT le journal
  await deps.journaliser(cible.demandeId, { objet: arg.objet, corps: arg.corps, familles, destinataire: cible.destinataire, messageId }, arg.auteur);
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
    messageId: m.message_id, referencesBrut: m.references_brut, from, profil: d.profil, recuLe: m.recu_le, motifIndisponible,
  };
}

/**
 * PART-3e — contexte LÉGER pour une DÉCLARATION de relance (aucun envoi) : demande du dossier + destinataire + date du dernier
 * message reçu (borne basse). N'importe RIEN du module e-mail (pas de compte SMTP) — le chemin déclaration ne peut structurellement
 * pas envoyer. `null` si aucun message de mairie.
 */
export async function lireContexteDeclaration(dossierId: number): Promise<{ demandeId: number; destinataire: string; dernierMessageLe: string } | null> {
  const { rows: dRows } = await query<{ demande_id: number }>(
    `SELECT dd.demande_id
       FROM demande_dossier dd
      WHERE dd.dossier_id = $1 AND dd.actif
      ORDER BY (SELECT max(r.recu_le) FROM demande_reponse r WHERE r.demande_id = dd.demande_id AND r.nature <> 'rebond') DESC NULLS LAST, dd.demande_id
      LIMIT 1`, [dossierId]);
  const d = dRows[0];
  if (!d) return null;
  const { rows: mRows } = await query<{ de_adresse: string; recu_le: string }>(
    `SELECT de_adresse, recu_le FROM demande_reponse WHERE demande_id = $1 AND nature <> 'rebond' ORDER BY recu_le DESC LIMIT 1`, [d.demande_id]);
  const m = mRows[0];
  if (!m) return null;
  return { demandeId: d.demande_id, destinataire: m.de_adresse, dernierMessageLe: m.recu_le };
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
    journaliser: async (demandeId, trace, auteur) => {
      const motif = `${MOTIF_COMPLEMENT_PREFIXE} à ${trace.destinataire} (familles : ${trace.familles.join(', ')} ; messageId ${trace.messageId})`;
      // type/mode/dateRelance : ÉTAT UNIFIÉ avec une relance déclarée (PART-3e) — la future cascade lit un seul champ, sans deux chemins.
      const details = JSON.stringify({ type: 'complement_pieces', mode: 'envoye', dateRelance: new Date().toISOString().slice(0, 10), objet: trace.objet, corps: trace.corps, familles: trace.familles, destinataire: trace.destinataire, messageId: trace.messageId });
      try {
        await query(
          `INSERT INTO demande_journal (demande_id, statut_avant, statut_apres, motif, auteur, details) VALUES ($1, NULL, NULL, $2, $3, $4::jsonb)`,
          [demandeId, motif, auteur, details]);
      } catch (e) {
        if (typeof e === 'object' && e !== null && (e as { code?: string }).code === '42703') {
          // migration 175 absente (colonne details inexistante) → on garde la trace OPPOSABLE dans `motif` (objet + corps inclus).
          const motifComplet = `${motif}\n--- objet ---\n${trace.objet}\n--- corps ---\n${trace.corps}`;
          await query(`INSERT INTO demande_journal (demande_id, statut_avant, statut_apres, motif, auteur) VALUES ($1, NULL, NULL, $2, $3)`, [demandeId, motifComplet, auteur]);
        } else throw e;
      }
    },
  };
}

/** Préfixe des lignes de journal d'un complément ENVOYÉ par l'outil (source unique). */
export const MOTIF_COMPLEMENT_PREFIXE = 'complément de pièces demandé';
/** Préfixe des lignes de journal d'une relance DÉCLARÉE (faite hors outil) — distincte d'un envoi, et SEULE catégorie annulable. */
export const MOTIF_DECLARATION_PREFIXE = 'relance de complément déclarée';

// ── PART-3e — DÉCLARER une relance déjà effectuée HORS de l'outil (aucun envoi) ───────────────────────────────────────────────────
/** Trace d'une relance DÉCLARÉE : date affirmée + familles. Le CONTENU n'est PAS connu du système (on ne fabrique aucun faux corps). */
export interface TraceDeclaration { dateRelance: string; familles: FamillePlan[]; destinataire: string }

export interface DepsDeclaration {
  lireContexte(dossierId: number): Promise<{ demandeId: number; destinataire: string; dernierMessageLe: string } | null>;
  journaliserDeclaration(demandeId: number, trace: TraceDeclaration, auteur: string): Promise<void>;
  aujourdhui(): string; // 'YYYY-MM-DD' — injecté (pureté de la borne « pas dans le futur »)
}

/**
 * Déclare une relance déjà faite hors de l'outil. Il n'y a AUCUN `envoyer` dans les dépendances : ce chemin ne peut structurellement
 * PAS envoyer d'e-mail. Refuse si : aucune famille, aucun message de mairie, date dans le futur ou antérieure au dernier message reçu.
 * Le journal enregistre mode='declare' (contenu non connu), même ÉTAT qu'un envoi pour la suite (type + dateRelance + familles). PUR par injection.
 */
export async function declarerRelanceComplement(deps: DepsDeclaration, arg: { dossierId: number; familles: readonly FamillePlan[]; dateRelance: string; auteur: string }): Promise<ResultatDemandePieces> {
  const familles = [...new Set(arg.familles)];
  if (familles.length === 0) return { ok: false, motif: 'aucune famille sélectionnée' };
  const ctx = await deps.lireContexte(arg.dossierId);
  if (ctx === null) return { ok: false, motif: 'aucun message de mairie pour ce permis' };
  const pb = problemeDateDeclaration(arg.dateRelance, deps.aujourdhui(), ctx.dernierMessageLe);
  if (pb !== null) return { ok: false, motif: pb };
  await deps.journaliserDeclaration(ctx.demandeId, { dateRelance: arg.dateRelance.slice(0, 10), familles, destinataire: ctx.destinataire }, arg.auteur);
  return { ok: true, destinataire: ctx.destinataire, familles };
}

export function depsReellesDeclaration(): DepsDeclaration {
  return {
    lireContexte: lireContexteDeclaration, // n'importe RIEN de ../email → aucun envoi possible sur ce chemin
    journaliserDeclaration: async (demandeId, trace, auteur) => {
      const motif = `${MOTIF_DECLARATION_PREFIXE} le ${trace.dateRelance} (familles : ${trace.familles.join(', ')} ; destinataire ${trace.destinataire} ; contenu non connu du système)`;
      const details = JSON.stringify({ type: 'complement_pieces', mode: 'declare', dateRelance: trace.dateRelance, familles: trace.familles, destinataire: trace.destinataire });
      try {
        await query(`INSERT INTO demande_journal (demande_id, statut_avant, statut_apres, motif, auteur, details) VALUES ($1, NULL, NULL, $2, $3, $4::jsonb)`, [demandeId, motif, auteur, details]);
      } catch (e) {
        if (typeof e === 'object' && e !== null && (e as { code?: string }).code === '42703') {
          await query(`INSERT INTO demande_journal (demande_id, statut_avant, statut_apres, motif, auteur) VALUES ($1, NULL, NULL, $2, $3)`, [demandeId, motif, auteur]); // 175 absente → trace dans motif
        } else throw e;
      }
    },
    aujourdhui: () => new Date().toISOString().slice(0, 10),
  };
}

/**
 * PART-3e — RÉVERSIBILITÉ : annule une relance DÉCLARÉE par l'id de sa ligne de journal. GARDE : ne supprime QUE des déclarations
 * (motif préfixé `MOTIF_DECLARATION_PREFIXE`) — un complément ENVOYÉ (preuve opposable) n'est JAMAIS supprimable par ce chemin.
 * Corriger une déclaration = l'annuler puis en déclarer une nouvelle. Renvoie true si une ligne a été supprimée.
 */
export async function annulerDeclaration(journalId: number): Promise<boolean> {
  const r = await query(`DELETE FROM demande_journal WHERE id = $1 AND motif LIKE $2 || '%'`, [journalId, MOTIF_DECLARATION_PREFIXE]);
  return (r.rowCount ?? 0) > 0;
}

// ── FIL-B — RÉPONDRE à un message CHOISI dans le fil (réponse libre) ──────────────────────────────────────────────────────────────
/** Préfixe des lignes de journal d'une RÉPONSE LIBRE (distincte du complément et de la déclaration). */
export const MOTIF_REPONSE_LIBRE_PREFIXE = 'réponse libre envoyée';

/** La cible d'une réponse à UN message choisi : ses PROPRES en-têtes de fil + son expéditeur. */
export interface CibleReponse {
  demandeId: number;
  destinataire: string;        // de_adresse du message choisi
  messageId: string;           // Message-ID du message choisi (In-Reply-To de notre réponse)
  referencesBrut: string | null;
  objetOrigine: string | null;
  from: string;
  profil: string;
  motifIndisponible: string | null; // no-reply, expédition indisponible, demande multi-dossiers…
}

/** Lit la cible d'une réponse à partir de l'id du message reçu (ses en-têtes À LUI, pas ceux du dernier message). */
export async function lireCibleReponseReel(reponseId: number): Promise<CibleReponse | null> {
  const { rows } = await query<{ demande_id: number | null; message_id: string; references_brut: string | null; de_adresse: string; objet: string | null; profil: string; nb: number }>(
    `SELECT r.demande_id, r.message_id, r.references_brut, r.de_adresse, r.objet, d.profil_demandeur AS profil,
            (SELECT count(*) FROM demande_dossier x WHERE x.demande_id = r.demande_id AND x.actif)::int AS nb
       FROM demande_reponse r JOIN demande d ON d.id = r.demande_id
      WHERE r.id = $1`, [reponseId]);
  const r = rows[0];
  if (!r || r.demande_id === null) return null; // message inconnu ou non rattaché → pas de fil où répondre

  const { lireAdressesExpedition, INFIXE_SMTP } = await import('../sitadel/envoiDemande');
  const { lireCompteSmtp } = await import('../email');
  const from = ((await lireAdressesExpedition())[r.profil] ?? '').trim();
  const compteOk = lireCompteSmtp(INFIXE_SMTP[r.profil as 'entreprise' | 'personne'] ?? '') !== null;

  const motifIndisponible = r.nb > 1
    ? 'cette demande couvre plusieurs permis : la réponse ne peut pas être attribuée à ce permis'
    : estNoReply(r.de_adresse)
      ? `l’expéditeur de ce message n’est pas répondable (${r.de_adresse || 'adresse absente'})`
      : from === ''
        ? 'aucune adresse d’expédition configurée pour ce profil (Réglages)'
        : !compteOk
          ? 'compte SMTP d’envoi non configuré pour ce profil'
          : null;

  return {
    demandeId: r.demande_id, destinataire: r.de_adresse, messageId: r.message_id, referencesBrut: r.references_brut,
    objetOrigine: r.objet, from, profil: r.profil, motifIndisponible,
  };
}

export interface DepsReponse {
  lireCible(reponseId: number): Promise<CibleReponse | null>;
  envoyer(cible: CibleReponse, objet: string, corps: string): Promise<{ messageId: string }>;
  journaliser(demandeId: number, trace: { objet: string; corps: string; destinataire: string; messageId: string; enReponseA: string }, auteur: string): Promise<void>;
}

/**
 * Répond à UN message choisi (réponse libre). Le texte (objet + corps) est FOURNI et envoyé VERBATIM (comme PART-3c) DANS LE FIL DE
 * CE message (ses en-têtes à lui). Refuse : objet/corps vide, entité HTML, message inconnu, expéditeur non répondable, demande
 * multi-dossiers. L'ENVOI précède le JOURNAL. PUR par injection.
 */
export async function executerReponseLibre(deps: DepsReponse, arg: { reponseId: number; objet: string; corps: string; auteur: string }): Promise<ResultatDemandePieces> {
  const problemeTexte = problemeTexteComplement(arg.objet, arg.corps);
  if (problemeTexte !== null) return { ok: false, motif: problemeTexte };
  const cible = await deps.lireCible(arg.reponseId);
  if (cible === null) return { ok: false, motif: 'message introuvable' };
  if (cible.motifIndisponible !== null) return { ok: false, motif: cible.motifIndisponible };

  const { messageId } = await deps.envoyer(cible, arg.objet, arg.corps); // AVANT le journal ; en-têtes = ceux du message choisi
  await deps.journaliser(cible.demandeId, { objet: arg.objet, corps: arg.corps, destinataire: cible.destinataire, messageId, enReponseA: cible.messageId }, arg.auteur);
  return { ok: true, destinataire: cible.destinataire, messageId };
}

export function depsReellesReponse(): DepsReponse {
  return {
    lireCible: lireCibleReponseReel,
    envoyer: async (cible, objet, corps) => {
      const { obtenirTransporteur, lireCompteSmtp, envoyerComplementPieces } = await import('../email');
      const { INFIXE_SMTP } = await import('../sitadel/envoiDemande');
      const compte = lireCompteSmtp(INFIXE_SMTP[cible.profil as 'entreprise' | 'personne'] ?? '');
      if (compte === null) throw new Error('compte SMTP non configuré');
      const { inReplyTo, references } = entetesFil(cible.messageId, cible.referencesBrut); // fil DU message choisi
      const emission = await envoyerComplementPieces(obtenirTransporteur(compte), cible.from, {
        to: cible.destinataire, replyTo: cible.from, objet, corps, inReplyTo, references,
      });
      return { messageId: emission.messageId };
    },
    journaliser: async (demandeId, trace, auteur) => {
      const motif = `${MOTIF_REPONSE_LIBRE_PREFIXE} à ${trace.destinataire} (en réponse à ${trace.enReponseA} ; messageId ${trace.messageId})`;
      const details = JSON.stringify({ type: 'reponse_libre', mode: 'envoye', dateRelance: new Date().toISOString().slice(0, 10), objet: trace.objet, corps: trace.corps, destinataire: trace.destinataire, messageId: trace.messageId, enReponseA: trace.enReponseA });
      try {
        await query(`INSERT INTO demande_journal (demande_id, statut_avant, statut_apres, motif, auteur, details) VALUES ($1, NULL, NULL, $2, $3, $4::jsonb)`, [demandeId, motif, auteur, details]);
      } catch (e) {
        if (typeof e === 'object' && e !== null && (e as { code?: string }).code === '42703') {
          await query(`INSERT INTO demande_journal (demande_id, statut_avant, statut_apres, motif, auteur) VALUES ($1, NULL, NULL, $2, $3)`, [demandeId, `${motif}\n--- objet ---\n${trace.objet}\n--- corps ---\n${trace.corps}`, auteur]);
        } else throw e;
      }
    },
  };
}

/** Une ligne d'historique unifiée : un complément ENVOYÉ par l'outil OU une relance DÉCLARÉE. `id` = ligne de journal (pour annuler). */
export interface LigneHistoriqueComplement {
  id: number;
  le: string;                     // horodatage de l'enregistrement (ISO)
  mode: 'envoye' | 'declare';
  dateRelance: string | null;     // date de la relance (envoi = jour d'émission ; déclaration = date affirmée) ; null si 175 absente
  objet: string | null;           // objet envoyé (mode envoye) ; null pour une déclaration (contenu non connu)
  familles: string[];
}

/** État pour l'écran : cible (numDau, destinataire, répondable, motif) + historique unifié (envoyé / déclaré). */
export interface EtatDemandePieces {
  numDau: string | null;
  destinataire: string | null;
  repliable: boolean;
  motif: string | null;
  historique: LigneHistoriqueComplement[];
}

/** Historique unifié des compléments (envoyés + déclarés). Lit `details` si présent ; sinon dérive du `motif` — résilient à la 175 absente. */
async function lireHistoriqueComplement(demandeId: number): Promise<LigneHistoriqueComplement[]> {
  const estDeclare = (motif: string, mode?: string): boolean => motif.startsWith(MOTIF_DECLARATION_PREFIXE) || mode === 'declare';
  try {
    const { rows } = await query<{ id: number; le: string; motif: string; details: { mode?: string; dateRelance?: string; objet?: string; familles?: string[] } | null }>(
      `SELECT id, horodatage::text AS le, motif, details FROM demande_journal
        WHERE demande_id = $1 AND (motif LIKE $2 || '%' OR motif LIKE $3 || '%') ORDER BY horodatage DESC LIMIT 20`,
      [demandeId, MOTIF_COMPLEMENT_PREFIXE, MOTIF_DECLARATION_PREFIXE]);
    return rows.map((r) => {
      const declare = estDeclare(r.motif, r.details?.mode);
      return { id: r.id, le: r.le, mode: declare ? 'declare' as const : 'envoye' as const, dateRelance: r.details?.dateRelance ?? null, objet: declare ? null : (r.details?.objet ?? r.motif), familles: r.details?.familles ?? [] };
    });
  } catch (e) {
    if (typeof e === 'object' && e !== null && (e as { code?: string }).code === '42703') {
      const { rows } = await query<{ id: number; le: string; motif: string }>(
        `SELECT id, horodatage::text AS le, motif FROM demande_journal
          WHERE demande_id = $1 AND (motif LIKE $2 || '%' OR motif LIKE $3 || '%') ORDER BY horodatage DESC LIMIT 20`,
        [demandeId, MOTIF_COMPLEMENT_PREFIXE, MOTIF_DECLARATION_PREFIXE]);
      return rows.map((r) => { const declare = estDeclare(r.motif); return { id: r.id, le: r.le, mode: declare ? 'declare' as const : 'envoye' as const, dateRelance: null, objet: declare ? null : r.motif, familles: [] }; });
    }
    throw e;
  }
}

export async function lireEtatDemandePieces(dossierId: number): Promise<EtatDemandePieces> {
  const cible = await lireCibleComplementReel(dossierId);
  if (cible === null) {
    return { numDau: null, destinataire: null, repliable: false, motif: 'aucun message de mairie auquel répondre pour ce permis', historique: [] };
  }
  return {
    numDau: cible.numDau,
    destinataire: cible.destinataire,
    repliable: cible.motifIndisponible === null,
    motif: cible.motifIndisponible,
    historique: await lireHistoriqueComplement(cible.demandeId),
  };
}
