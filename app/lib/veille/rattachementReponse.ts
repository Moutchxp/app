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
import { normaliserReference } from '../sitadel/demandesListe';

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
  numerosDossier: string[];                // R3e : n° de dossier Sitadel (chiffres) des dossiers de la demande — ancre de rattachement
  referencesExternes?: string[];           // R3f : références MAIRIE (P1, demande_reference_externe) — ancre de rattachement
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

/** R3e — plancher : un vrai n° de dossier Sitadel fait ~13 chiffres ; en-dessous on refuse (jamais un rapprochement flou). */
const LONGUEUR_MIN_NUM = 10;
/** Supprime espaces/séparateurs (garde lettres+chiffres) pour une comparaison LITTÉRALE tolérant la mise en forme du n°. */
function normaliserTexte(s: string): string { return s.replace(/[\s.\-/_]/gu, ''); }
/**
 * Candidates dont un numéro de dossier COMPLET apparaît LITTÉRALEMENT (après normalisation) dans le texte. Correspondance
 * exacte du numéro entier — aucun rapprochement approximatif (même exigence que satisfactionDossier).
 */
function parNumeroDossier(candidates: DemandeCandidate[], texte: string): DemandeCandidate[] {
  const foin = normaliserTexte(texte);
  return uniqueParId(candidates.filter((c) => c.numerosDossier.some((n) => n.length >= LONGUEUR_MIN_NUM && foin.includes(n))));
}

/** R3f — plancher d'une référence MAIRIE : assez longue pour être discriminante (évite qu'un code court fasse un faux positif
 *  par simple sous-chaîne). Les références de téléservice réelles (ex. « SLC260810440700 ») dépassent largement ce seuil. */
const LONGUEUR_MIN_REF = 6;
/**
 * R3f — candidates dont une RÉFÉRENCE MAIRIE enregistrée (P1) apparaît LITTÉRALEMENT dans le texte. Comparaison sur la forme
 * NORMALISÉE de P1 (MAJUSCULES, sans espaces ni tirets — `normaliserReference`, alignée sur l'index SQL), au-dessus d'un
 * plancher de longueur. Correspondance EXACTE de la référence entière (sous-chaîne normalisée), jamais approximative.
 */
function parReferenceMairie(candidates: DemandeCandidate[], texte: string): DemandeCandidate[] {
  const foin = normaliserReference(texte);
  return uniqueParId(candidates.filter((c) => (c.referencesExternes ?? []).some((r) => {
    const rn = normaliserReference(r);
    return rn.length >= LONGUEUR_MIN_REF && foin.includes(rn);
  })));
}

const aucun = (motif: string): ResultatRattachement => ({ demandeId: null, methode: 'aucun', motif });

/**
 * Décide le rattachement selon une CASCADE DÉTERMINISTE (on s'arrête au premier succès = exactement une demande) :
 *   1. THREADING (In-Reply-To/References ∩ Message-ID émis) → 'message_id'
 *   2. RÉFÉRENCE COMPLÈTE (objet puis corps) → 'reference_objet' | 'reference_corps'
 *   2bis. NUMÉRO DE DOSSIER SITADEL (objet + corps ; R3e) → 'numero_dossier' (ancre non ambiguë : 1 dossier = 1 demande active)
 *   2ter. RÉFÉRENCE MAIRIE (objet + corps ; R3f) → 'reference_mairie'. Placée APRÈS le n° de dossier (unique PAR CONSTRUCTION
 *      via l'index partiel actif) et AVANT la discrète (plus lâche, gated envoyee) : c'est un identifiant mairie EXACT, mais
 *      dont l'unicité n'est qu'au niveau donnée (le schéma P1 autorise une même référence sur plusieurs demandes) → garde
 *      d'ambiguïté indispensable.
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

  // 2bis) NUMÉRO DE DOSSIER SITADEL (objet + corps) — R3e. Ancre NON AMBIGUË PAR CONSTRUCTION : un dossier n'appartient
  //   qu'à UNE demande active (garanti par l'index unique partiel `demande_dossier_unique_actif`). Placée APRÈS la
  //   référence complète et AVANT la référence discrète. Si les numéros trouvés désignent PLUSIEURS demandes → ambigu → aucun.
  const parDossier = parNumeroDossier(candidates, `${message.objet ?? ''}\n${message.corpsTexte ?? ''}`);
  if (parDossier.length > 1) return aucun(`numéro de dossier ambigu : ${parDossier.length} demandes désignées`);
  if (parDossier.length === 1) {
    return { demandeId: parDossier[0].id, methode: 'numero_dossier', motif: `numéro de dossier Sitadel de ${parDossier[0].reference} reconnu dans le message` };
  }

  // 2ter) RÉFÉRENCE MAIRIE (objet + corps) — R3f. Identifiant EXACT émis par la mairie (téléservice/accusé), enregistré en P1.
  //   Unicité seulement AU NIVEAU DONNÉE (schéma UNIQUE(demande_id, reference), pas reference seule) → si la même référence
  //   désigne PLUSIEURS demandes candidates, on NE devine PAS → 'aucun'.
  const parRefMairie = parReferenceMairie(candidates, `${message.objet ?? ''}\n${message.corpsTexte ?? ''}`);
  if (parRefMairie.length > 1) return aucun(`référence mairie ambiguë : ${parRefMairie.length} demandes désignées`);
  if (parRefMairie.length === 1) {
    return { demandeId: parRefMairie[0].id, methode: 'reference_mairie', motif: `référence mairie de ${parRefMairie[0].reference} reconnue dans le message` };
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
 * T3 — détecte un REBOND de NON-REMISE (DSN / NDR). NÉCESSAIRE parce que : (a) le Return-Path n'est PAS posé par notre code
 * (il est décidé par le MTA), et (b) un rebond peut arriver dans une AUTRE boîte que le Reply-To relu — on doit donc
 * reconnaître un NDR au CONTENU du message, jamais par l'enveloppe. DEUX signaux FIABLES (un seul suffit) :
 *   - expéditeur mailer-daemon / postmaster (comparaison sur la partie locale, insensible à la casse) ;
 *   - Content-Type multipart/report avec report-type=delivery-status (rapport de non-remise standard, RFC 6522/3464).
 * ⚠️ L'en-tête `Auto-Submitted` NE figure PLUS ici : il marque TOUT message automatique (RFC 3834) — donc AUSSI un accusé de
 * réception de téléservice ou une réponse d'absence, PAS seulement un NDR. Le mêler à la non-remise faisait passer un accusé
 * pour un rebond, puis (faute de Message-ID d'origine) le jetait en « rebond étranger », en silence. C'est désormais
 * `estAccuseAutomatique` qui porte ce signal. Un vrai NDR reste attrapé par ses deux signaux fiables (les sondes serveur
 * cherchent d'ailleurs mailer-daemon / postmaster).
 */
export function estRebondNonRemise(message: MessageEntrant): boolean {
  const local = partieLocale(message.deAdresse);
  if (local === 'mailer-daemon' || local === 'postmaster') return true;

  const contentType = entete(message, 'Content-Type') ?? '';
  if (/multipart\/report/i.test(contentType) && /report-type\s*=\s*"?delivery-status"?/i.test(contentType)) return true;

  return false;
}

/**
 * T3 — détecte un ACCUSÉ AUTOMATIQUE (accusé de réception de téléservice/mairie, réponse d'absence…). Signal : en-tête
 * `Auto-Submitted` présent et ≠ 'no' (message automatique, RFC 3834), à condition que le message NE soit PAS un rebond de
 * non-remise (`estRebondNonRemise` d'abord : un DSN est traité comme rebond, pas comme accusé). Un accusé est un signal FORT et
 * VÉRIFIABLE que « la mairie a écrit » — il doit être ENREGISTRÉ (nature 'accuse'), mais il ne fait PAS entrer la demande dans
 * « Réponses » (il n'est pas « a répondu »). La classification fine (gabarit de téléservice reconnu) viendra plus tard ; ici,
 * seul l'en-tête sert. Tout message SANS ce signal reste 'indetermine' et se comporte comme un vrai retour (défaut = MONTRER).
 */
export function estAccuseAutomatique(message: MessageEntrant): boolean {
  if (estRebondNonRemise(message)) return false; // un DSN est un rebond, jamais un accusé
  const autoSubmitted = entete(message, 'Auto-Submitted');
  return autoSubmitted !== undefined && autoSubmitted.trim().toLowerCase() !== 'no';
}
