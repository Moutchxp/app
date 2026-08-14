/**
 * T7-C — logique PURE du pré-cochage « répondu ». Décide si UN message SORTANT (lu dans le dossier envoyés, EN-TÊTES SEULS) est
 * une réponse à UN message de mairie de nature `autre` que nous suivons. Aucune I/O, aucun réseau, aucun corps de message.
 *
 * RÈGLE (fondateur) — LES DEUX conditions, jamais une seule (« en cas de doute, on ne marque pas ») :
 *   1. FIL : le sortant a `In-Reply-To`/`References` contenant le Message-ID du mail de mairie (threading RFC) ;
 *   2. DESTINATAIRE : le sortant est adressé À la mairie (To/Cc contient l'adresse d'expédition du mail de mairie).
 * Le fil seul rouvrirait le transfert à un tiers (fil correct mais To sans la mairie) ; le destinataire seul cocherait un
 * simple nouveau message à la mairie. La conjonction élimine les deux faux positifs.
 */
import { normaliserMessageId } from './rapportRejet';

/** Un message de mairie `autre` en attente de réponse (issu de demande_reponse). `messageId` = Message-ID de la mairie (stocké). */
export interface CandidatRepondu {
  reponseId: number;
  messageId: string;      // Message-ID du mail de mairie (avec ou sans chevrons)
  mairieAdresse: string;  // demande_reponse.de_adresse (expéditeur mairie) — cible du To/Cc d'une vraie réponse
  recuLe: Date;           // borne basse de la fenêtre de recherche (une réponse ne précède jamais le mail de mairie)
}

/** En-têtes SEULS d'un message sortant du dossier envoyés (jamais le corps ni les pièces). */
export interface SortantEntete {
  inReplyTo: string | null;   // en-tête In-Reply-To (un Message-ID) ou null
  references: string[];       // en-tête References (liste de Message-ID), éventuellement vide
  destinataires: string[];    // adresses To + Cc (brutes ; comparées en insensible à la casse)
}

/** Adresse e-mail normalisée pour comparaison (trim + minuscules). */
function normaliserAdresse(a: string): string {
  return a.trim().toLowerCase();
}

/**
 * VRAI si `sortant` est une réponse à `candidat` : fil (In-Reply-To/References ⊇ Message-ID mairie) ET destinataire (To/Cc ⊇
 * adresse mairie). Toute donnée manquante (Message-ID vide, adresse mairie vide) → FAUX (jamais un marquage dans le doute).
 */
export function estReponse(candidat: CandidatRepondu, sortant: SortantEntete): boolean {
  const cible = normaliserMessageId(candidat.messageId);
  if (cible === '') return false;
  const mairie = normaliserAdresse(candidat.mairieAdresse);
  if (mairie === '') return false;

  // 1. FIL : le Message-ID de la mairie figure dans In-Reply-To ou References du sortant.
  const fil = new Set<string>();
  if (sortant.inReplyTo) fil.add(normaliserMessageId(sortant.inReplyTo));
  for (const r of sortant.references) { const n = normaliserMessageId(r); if (n !== '') fil.add(n); }
  if (!fil.has(cible)) return false;

  // 2. DESTINATAIRE : le sortant est bien adressé À la mairie (garde anti-transfert-à-un-tiers).
  return sortant.destinataires.some((d) => normaliserAdresse(d) === mairie);
}
