/**
 * ══ 🔴🔴 LOT GES-16/21 (Arno, 10/11/2026) — REJOUER LA RÈGLE « UNE RÉPONSE SUIT LE MAIL AUQUEL ELLE RÉPOND » SUR LE PASSÉ. PUR.
 *
 * `suivreLeMailDeplace` lit désormais le parent le plus proche (gestes.ts). Les réponses rangées AVANT ce correctif l'ont été
 * par l'ancienne lecture — n'importe quel mail déplacé de la conversation suffisait. Cette fonction rejoue la règle d'aujourd'hui,
 * dans l'ordre d'arrivée, sur les réponses qu'un événement a reçues automatiquement, et dit pour chacune : la garder, ou la
 * remettre dans son échange. Le script `reaffecter-reponses-suivies.ts` l'appelle ; elle n'écrit rien.
 *
 * ⚠️ DANS L'ORDRE, ET EN CHAÎNE : une réponse remise dans son échange n'est plus « déplacée » pour celles qui lui répondent
 * ensuite. C'est exactement ce qu'aurait fait la relève avec la règle d'aujourd'hui.
 */
export interface ReponseSuivie {
  affectationId: number;
  messageId: number;
  /** Les `Message-ID` cités, du plus proche au plus lointain (`citationsDuMessage`). */
  citations: readonly string[];
}

export interface Verdict {
  affectationId: number;
  messageId: number;
  /** Le mail connu le plus proche que cette réponse cite, ou `null` si aucun n'est connu. */
  parent: number | null;
  /** L'événement de ce parent (affectation de mail active, rejouée), ou `null` : il est dans son échange. */
  evenementDuParent: number | null;
  garder: boolean;
}

export function rejouerReponsesSuivies(
  evenementId: number,
  suivies: readonly ReponseSuivie[],
  /** `Message-ID` → les mails qui le portent (le même mail peut être relevé deux fois). */
  connus: ReadonlyMap<string, readonly number[]>,
  /** Mail → l'événement de son affectation de MAIL active aujourd'hui (absent : aucune). */
  evenementDuMail: ReadonlyMap<number, number>,
): Verdict[] {
  const etat = new Map(evenementDuMail);
  const out: Verdict[] = [];
  for (const r of suivies) {
    let parent: number | null = null;
    let evenementDuParent: number | null = null;
    for (const mid of r.citations) {
      const ids = (connus.get(mid) ?? []).filter((id) => id !== r.messageId);
      if (ids.length === 0) continue;
      const deplace = ids.find((id) => etat.has(id));
      parent = deplace ?? ids[0];
      evenementDuParent = deplace === undefined ? null : etat.get(deplace) ?? null;
      break;
    }
    const garder = evenementDuParent === evenementId;
    if (!garder) etat.delete(r.messageId);
    out.push({ affectationId: r.affectationId, messageId: r.messageId, parent, evenementDuParent, garder });
  }
  return out;
}
