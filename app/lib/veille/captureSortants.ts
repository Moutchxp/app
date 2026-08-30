/**
 * FIL-C — logique PURE de la CAPTURE des sortants HORS OUTIL. Décide si UN message SORTANT (lu dans le dossier envoyés) appartient à
 * UN fil de demande suivi ET est adressé à la mairie de ce fil. Aucune I/O, aucun réseau. Sœur de `preCochageRepondu.ts` (T7-C), mais
 * étendue à TOUTES les natures (pas seulement `autre`) et porteuse du CORPS (le fil doit être complet).
 *
 * RÈGLE (fondateur) — LES DEUX conditions, jamais une seule (« en cas de doute, on ne capture pas ») :
 *   1. FIL : le sortant a `In-Reply-To`/`References` contenant l'un des Message-ID du fil (envoi initial, relances, ou reçus) ;
 *   2. DESTINATAIRE : le sortant est adressé À la mairie du fil (To/Cc contient l'une de ses adresses connues).
 * Le fil seul rouvrirait un transfert à un tiers ; le destinataire seul capturerait un simple nouveau message à la mairie. La
 * conjonction élimine les deux faux positifs — exactement la garde de T7-C, appliquée ici à la capture.
 */
import { normaliserMessageId } from './rapportRejet';

/** Un message SORTANT complet (en-têtes de fil + destinataires + CORPS) lu dans le dossier envoyés. `messageId` = clé de dédup. */
export interface SortantComplet {
  messageId: string;         // Message-ID du sortant (avec chevrons) — clé de déduplication
  inReplyTo: string | null;  // en-tête In-Reply-To
  references: string[];      // en-tête References (liste de Message-ID), éventuellement vide
  destinataires: string[];   // adresses To + Cc (brutes ; comparées en insensible à la casse)
  objet: string | null;
  corpsTexte: string | null; // CORPS capturé (dérogation assumée à « en-têtes seuls » de T7-C, bornée aux fils suivis)
  envoyeLe: string | null;   // date d'envoi (en-tête Date) en ISO UTC, ou null
}

/** Un fil de demande suivi : ses Message-ID (envoi initial + relances + reçus) et les adresses mairie connues. */
export interface FilCible {
  demandeId: number;
  messageIds: string[];      // tous les Message-ID du fil de la demande
  mairieAdresses: string[];  // adresses mairie : dest_email de la demande + expéditeurs des reçus
}

/** Adresse e-mail normalisée pour comparaison (trim + minuscules). */
function normaliserAdresse(a: string): string {
  return a.trim().toLowerCase();
}

/**
 * Apparie un sortant à AU PLUS UN fil suivi : renvoie `{ demandeId, destinataire }` du premier fil dont un Message-ID figure dans
 * In-Reply-To/References du sortant ET dont une adresse mairie figure dans To/Cc ; sinon `null` (on ne capture pas). Toute donnée
 * manquante (aucun en-tête de fil, aucune adresse mairie appariée) → `null` — jamais une capture dans le doute.
 */
export function apparierSortant(s: SortantComplet, fils: readonly FilCible[]): { demandeId: number; destinataire: string } | null {
  // En-têtes de fil du sortant, normalisés (chevrons retirés). Aucun → jamais apparié (garde anti-faux-positif « fil »).
  const filSortant = new Set<string>();
  if (s.inReplyTo) { const n = normaliserMessageId(s.inReplyTo); if (n !== '') filSortant.add(n); }
  for (const r of s.references) { const n = normaliserMessageId(r); if (n !== '') filSortant.add(n); }
  if (filSortant.size === 0) return null;

  const destSortant = s.destinataires.map(normaliserAdresse).filter((d) => d !== '');

  for (const fil of fils) {
    // 1. FIL : au moins un Message-ID du fil est cité par le sortant.
    const cibles = fil.messageIds.map(normaliserMessageId).filter((m) => m !== '');
    if (!cibles.some((c) => filSortant.has(c))) continue;
    // 2. DESTINATAIRE : le sortant est adressé À la mairie de ce fil (garde anti-transfert-à-un-tiers).
    const mairie = fil.mairieAdresses.map(normaliserAdresse).filter((a) => a !== '');
    const appariee = mairie.find((m) => destSortant.includes(m));
    if (appariee !== undefined) return { demandeId: fil.demandeId, destinataire: appariee };
  }
  return null; // aucun fil apparié (fil ET destinataire) → on ne capture pas
}
