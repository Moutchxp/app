/**
 * RATTACHEMENT d'une réponse entrante à une demande — module 100 % PUR (chantier R2). Aucun réseau, aucune base, aucun
 * IMAP, aucune I/O. Reçoit un message DÉJÀ parsé + la liste des demandes candidates, et décide à laquelle le rattacher —
 * ou de ne PAS le rattacher. Face au moindre doute : demandeId = null (un message en attente d'arbitrage vaut mieux qu'un
 * message mal rattaché). On ne rattache JAMAIS sur la seule adresse de l'expéditeur : la boîte de réponse est PARTAGÉE par
 * profil, deux demandes distinctes peuvent venir de la même mairie.
 *
 * `import type` (erasé au runtime) pour RattachementMethode → aucune dépendance pg/repo tirée. `referenceDiscrete` est
 * réutilisé depuis demande.ts (chaîne demande.ts → mairieContact.ts entièrement pure) : source unique du format discret.
 */
import type { RattachementMethode } from './demandeReponseRepo';
import { referenceDiscrete } from '../sitadel/demande';

export interface MessageEntrant {
  messageId: string;
  inReplyTo?: string;
  references?: string[];
  deAdresse: string;
  objet?: string;
  corpsTexte?: string;
  entetes?: Record<string, string>;
}

export interface DemandeCandidate {
  id: number;
  reference: string;                       // SVAV-DEM-AAAA-NNNNNN
  profilBoite: 'entreprise' | 'personne';
  statut: string;
  messageIdsEmis: string[];                // Message-ID des envois sortants de CETTE demande (avec ou sans chevrons)
}

export interface ResultatRattachement {
  demandeId: number | null;
  methode: RattachementMethode;
  motif: string;                           // toujours renseigné, y compris en cas de succès
}

// ── Helpers PURS ─────────────────────────────────────────────────────────────

/** Normalise un Message-ID : retire les chevrons, trim, casse insensible sur le DOMAINE (la partie locale reste sensible). */
function normaliserMessageId(brut: string): string {
  const s = brut.trim().replace(/^<+/, '').replace(/>+$/, '').trim();
  const at = s.lastIndexOf('@');
  return at === -1 ? s : `${s.slice(0, at)}@${s.slice(at + 1).toLowerCase()}`;
}

/** Références COMPLÈTES SVAV-DEM-AAAA-NNNNNN trouvées dans un texte (peut contenir des doublons). */
function refsCompletes(txt: string | undefined): string[] {
  return txt ? (txt.match(/SVAV-DEM-\d{4}-\d{6}/g) ?? []) : [];
}

/** Références DISCRÈTES AAAA-NNNNNN trouvées dans un texte (dédoublonnées). */
function refsDiscretes(txt: string | undefined): Set<string> {
  return new Set(txt ? (txt.match(/\b\d{4}-\d{6}\b/g) ?? []) : []);
}

/** Candidates dont la référence complète figure dans `refs`. */
function parReference(candidates: DemandeCandidate[], refs: string[]): DemandeCandidate[] {
  if (refs.length === 0) return [];
  const set = new Set(refs);
  return candidates.filter((c) => set.has(c.reference));
}

/** Dédoublonne une liste de candidates par id, en conservant l'ordre. */
function uniqueParId(list: DemandeCandidate[]): DemandeCandidate[] {
  const vus = new Set<number>();
  const out: DemandeCandidate[] = [];
  for (const c of list) if (!vus.has(c.id)) { vus.add(c.id); out.push(c); }
  return out;
}

const aucun = (motif: string): ResultatRattachement => ({ demandeId: null, methode: 'aucun', motif });

/**
 * Décide le rattachement selon une CASCADE DÉTERMINISTE (on s'arrête au premier succès = exactement une demande) :
 *   1. THREADING (In-Reply-To/References ∩ Message-ID émis) → 'message_id'
 *   2. RÉFÉRENCE COMPLÈTE (objet puis corps) → 'reference_objet' | 'reference_corps'
 *   3. RÉFÉRENCE DISCRÈTE (corps SEULEMENT ; l'objet du profil personne est générique) → 'reference_corps', et
 *      uniquement si la demande retenue est au statut 'envoyee'
 *   4. sinon → { null, 'aucun' }
 * Toute AMBIGUÏTÉ (plusieurs demandes désignées au même niveau) coupe la cascade → non rattaché (on ne devine pas).
 */
export function rattacherReponse(message: MessageEntrant, candidates: DemandeCandidate[]): ResultatRattachement {
  // 1) THREADING ---------------------------------------------------------------
  const fil = new Set<string>();
  if (message.inReplyTo) fil.add(normaliserMessageId(message.inReplyTo));
  for (const r of message.references ?? []) fil.add(normaliserMessageId(r));
  if (fil.size > 0) {
    const parFil = candidates.filter((c) => c.messageIdsEmis.some((m) => fil.has(normaliserMessageId(m))));
    if (parFil.length === 1) {
      return { demandeId: parFil[0].id, methode: 'message_id', motif: `fil de discussion : un Message-ID émis de ${parFil[0].reference} figure dans In-Reply-To/References` };
    }
    if (parFil.length > 1) return aucun(`fil de discussion ambigu : ${parFil.length} demandes partagent ce fil`);
  }

  // 2) RÉFÉRENCE COMPLÈTE (objet puis corps) -----------------------------------
  const candObjet = parReference(candidates, refsCompletes(message.objet));
  const candCorps = parReference(candidates, refsCompletes(message.corpsTexte));
  const union = uniqueParId([...candObjet, ...candCorps]);
  if (union.length > 1) return aucun(`référence complète ambiguë : ${union.length} demandes candidates désignées`);
  if (union.length === 1) {
    const c = union[0];
    const dansObjet = candObjet.some((x) => x.id === c.id);
    return {
      demandeId: c.id,
      methode: dansObjet ? 'reference_objet' : 'reference_corps',
      motif: `référence complète ${c.reference} trouvée ${dansObjet ? "dans l'objet" : 'dans le corps'}`,
    };
  }

  // 3) RÉFÉRENCE DISCRÈTE (corps seulement) ------------------------------------
  const discretes = refsDiscretes(message.corpsTexte);
  const candDisc = uniqueParId(candidates.filter((c) => discretes.has(referenceDiscrete(c.reference))));
  if (candDisc.length > 1) return aucun(`référence discrète ambiguë : ${candDisc.length} demandes candidates`);
  if (candDisc.length === 1) {
    const c = candDisc[0];
    if (c.statut === 'envoyee') {
      return { demandeId: c.id, methode: 'reference_corps', motif: `référence discrète ${referenceDiscrete(c.reference)} (corps) rattachée à la demande envoyée ${c.reference}` };
    }
    return aucun(`référence discrète ${referenceDiscrete(c.reference)} trouvée, mais la demande ${c.reference} n'est pas « envoyee » (statut « ${c.statut} »)`);
  }

  // 4) AUCUN -------------------------------------------------------------------
  return aucun('aucune référence rattachable trouvée (ni fil de discussion, ni référence complète, ni référence discrète)');
}

/** Partie locale d'une adresse (avant @), en minuscules. */
function partieLocale(adresse: string): string {
  const at = adresse.indexOf('@');
  return (at === -1 ? adresse : adresse.slice(0, at)).trim().toLowerCase();
}

/** Lecture d'un en-tête INSENSIBLE À LA CASSE du nom (les noms d'en-tête ne sont pas sensibles à la casse). */
function entete(message: MessageEntrant, nom: string): string | undefined {
  if (!message.entetes) return undefined;
  const cible = nom.toLowerCase();
  for (const cle of Object.keys(message.entetes)) if (cle.toLowerCase() === cible) return message.entetes[cle];
  return undefined;
}

/**
 * Détecte un accusé de REBOND (NDR). NÉCESSAIRE parce que : (a) le Return-Path n'est PAS posé par notre code (il est décidé
 * par le MTA), et (b) un rebond peut arriver dans une AUTRE boîte que le Reply-To relu — on doit donc reconnaître un NDR au
 * contenu du message lui-même, jamais par l'enveloppe. Trois signaux (un seul suffit) :
 *   - expéditeur mailer-daemon / postmaster (comparaison sur la partie locale, insensible à la casse) ;
 *   - Content-Type multipart/report avec report-type=delivery-status (rapport de non-remise standard, RFC 6522/3464) ;
 *   - en-tête Auto-Submitted présent et différent de 'no' (message automatique, RFC 3834).
 */
export function estAccuseDeRebond(message: MessageEntrant): boolean {
  const local = partieLocale(message.deAdresse);
  if (local === 'mailer-daemon' || local === 'postmaster') return true;

  const contentType = entete(message, 'Content-Type') ?? '';
  if (/multipart\/report/i.test(contentType) && /report-type\s*=\s*"?delivery-status"?/i.test(contentType)) return true;

  const autoSubmitted = entete(message, 'Auto-Submitted');
  if (autoSubmitted !== undefined && autoSubmitted.trim().toLowerCase() !== 'no') return true;

  return false;
}
