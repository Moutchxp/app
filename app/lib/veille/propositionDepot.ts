import { normaliserReference } from '../sitadel/demandesListe';

/**
 * T4 (commit B) — APPARIEMENT PUR d'un message relevé NON rattaché à une demande restée EN ATTENTE (brouillon/prête, canal
 * formulaire) dont il cite le permis : num_dau (suite de chiffres) OU référence mairie (P1). Sépare deux files DISTINCTES :
 *   - « À rattacher » (ordinaire) = message qui ne cite AUCUN permis en attente ;
 *   - « Dépôts à confirmer » (T4) = message qui cite ≥ 1 permis en attente.
 * Garde d'ambiguïté du projet : plusieurs demandes candidates → AUCUNE proposition actionnable (on ne devine pas), mais le fait
 * est signalé (jamais silencieux). Un message IGNORÉ (traité) ne produit plus de proposition mais reste « citant » → il ne
 * retombe pas dans « À rattacher » (il disparaît des deux). Mêmes normalisations que la relève (releveReponses) : cohérence. PUR.
 */

/** Une demande EN ATTENTE (formulaire, brouillon/prête) et ses identifiants cherchables. */
export interface CibleDepot { demandeId: number; reference: string; communeNom: string | null; numerosDossier: string[]; referencesMairie: string[] }

/** Un message NON rattaché, avec ce qu'il faut pour l'apparier (objet + corps + noms de pièces) et son état de traitement. */
export interface MessageCandidat { id: number; objet: string | null; corpsTexte: string | null; nomsPieces: string[]; traiteLe: string | null }

/** Une proposition : un message + ses demandes candidates (1 = actionable ; ≥ 2 = ambiguë, non actionable). */
export interface PropositionDepot { messageId: number; candidats: { demandeId: number; reference: string; communeNom: string | null }[] }

/** Num_dau réduit à ses chiffres (comme releveReponses.numeroDossier) : « PC 093 001 25 00081 » → « 0930012500081 ». */
export function chiffresDossier(numDau: string): string { return numDau.replace(/\D/g, ''); }

/**
 * Apparie chaque message aux demandes en attente qu'il cite. Renvoie les PROPOSITIONS (messages citants NON ignorés) et
 * l'ensemble des ids de messages CITANTS (pour les exclure de « À rattacher », qu'ils soient ignorés ou non). PUR.
 */
export function apparierPropositions(messages: MessageCandidat[], cibles: CibleDepot[]): { propositions: PropositionDepot[]; idsCitants: Set<number> } {
  const propositions: PropositionDepot[] = [];
  const idsCitants = new Set<number>();
  for (const m of messages) {
    const foinNum = `${m.objet ?? ''}\n${m.corpsTexte ?? ''}\n${m.nomsPieces.join('\n')}`.replace(/[\s.\-/_]/gu, '');
    const foinRef = normaliserReference(`${m.objet ?? ''}\n${m.corpsTexte ?? ''}`);
    const candidats = cibles.filter((c) =>
      c.numerosDossier.some((n) => n.length >= 10 && foinNum.includes(n)) ||
      c.referencesMairie.some((r) => { const rn = normaliserReference(r); return rn.length >= 6 && foinRef.includes(rn); }),
    );
    if (candidats.length === 0) continue;               // sans rapport → reste « À rattacher »
    idsCitants.add(m.id);                                // cite un permis en attente → JAMAIS dans « À rattacher »
    if (m.traiteLe !== null) continue;                   // ignoré (traité) → aucune proposition, ne réapparaît pas
    propositions.push({ messageId: m.id, candidats: candidats.map((c) => ({ demandeId: c.demandeId, reference: c.reference, communeNom: c.communeNom })) });
  }
  return { propositions, idsCitants };
}
