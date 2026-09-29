/**
 * LOT 5-BOITE-3 — LES GESTES DU MENU D'UNE LIGNE. Même patron que `gestesMail.tsx` : l'appel réseau vit ICI, jamais
 * dans le composant d'écran.
 *
 * 🔴 POURQUOI CE FICHIER EXISTE. Un garde d'écran (`BoiteMail.parts.test.ts`) exige que `PleinEcranBoite` ne
 * contienne AUCUN `fetch(` : il dispose des composants, il ne va rien chercher tout seul — c'est ce qui a empêché,
 * depuis le lot 5a, qu'une seconde lecture de la boîte soit recopiée à côté de la première. Les gestes suivent la
 * même règle : ils sont ici, éprouvables et réutilisables, et l'écran ne fait que les appeler.
 *
 * 🔴 CHACUN RAPPORTE, AUCUN NE DÉCIDE. Ces fonctions rendent ce qui s'est passé ; c'est l'écran qui choisit quoi en
 * faire (relire la liste, afficher un bandeau, rendre le focus).
 */

/** Ce qu'un geste rapporte. `ok` dit s'il a eu lieu ; `message` est TOUJOURS lisible par un humain. */
export interface IssueGeste { ok: boolean; message: string }

/**
 * MARQUE UN ÉCHANGE LU OU NON LU. Passe par la route du lot 5-BOITE-2 : c'est le lu/non lu de GMAIL, commun à toute
 * l'équipe. On ne crée pas un second chemin pour le même geste.
 */
export async function marquerLectureLigne(filId: number, lu: boolean): Promise<IssueGeste> {
  try {
    const res = await fetch(`/api/admin/gestion/fils/${filId}/lecture`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lu }),
    });
    const d = (await res.json().catch(() => ({}))) as { etat?: string; message?: string };
    if (d.etat !== 'ok') return { ok: false, message: d.message ?? 'Marquage impossible.' };
    return { ok: true, message: lu ? 'Échange marqué comme lu.' : 'Échange marqué comme non lu.' };
  } catch {
    return { ok: false, message: 'Marquage impossible : le serveur n’a pas répondu.' };
  }
}

/**
 * MET UN ÉCHANGE À LA CORBEILLE DE GMAIL, ou l'en SORT.
 *
 * ══ 🔴 LOT BOITE-INTERNE-CORBEILLE — CE GESTE A CHANGÉ DE NATURE ═══════════════════════════════════════════════
 * Jusqu'au 29/09/2026, il retirait l'échange de NOS boîtes sans rien toucher dans Gmail (corbeille interne du lot
 * 5-BOITE-3). Décision d'Arno : c'est la corbeille de GMAIL qui fait foi — un seul état, synchronisé, comme le
 * spam et le lu/non lu. Le mail part donc réellement à la corbeille de la vraie boîte, exactement comme si on
 * avait cliqué dans Gmail.
 *
 * 🔴 CE QUE CELA VEUT DIRE, ET QU'IL FAUT AVOIR EN TÊTE : il disparaît AUSSI de Gmail pour toute l'équipe, et
 * GMAIL EFFACERA SON CONTENU AU BOUT DE 30 JOURS. Ce n'est plus un geste d'affichage.
 *
 * 🔴 AUCUNE CONFIRMATION N'EST DEMANDÉE POUR AUTANT, et c'est toujours délibéré : le geste reste réversible d'un
 * clic (bandeau « Annuler » de 10 s, puis l'étiquette « Corbeille » et son « Réintégrer »). La confirmation est
 * réservée à ce qui ne se défait pas — la suppression définitive. Poser une question avant chaque geste
 * réversible apprend surtout à cliquer « oui » sans lire, ce qui la rendrait inutile là où elle compte.
 *
 * ⚠️ LA CORBEILLE PORTE SUR DES MAILS, l'échange n'en est que le porteur : la route traduit le fil en ses messages,
 * comme le fait Gmail quand on supprime une conversation depuis sa liste.
 */
export async function gesteCorbeille(filId: number, versLaCorbeille: boolean): Promise<IssueGeste> {
  return appelerCorbeille({ filIds: [filId], action: versLaCorbeille ? 'corbeille' : 'reintegrer' });
}

/**
 * LES GESTES DE LA LISTE « CORBEILLE » : réintégrer une sélection, ou la supprimer définitivement.
 *
 * 🔴 LA RÉPONSE EST RENDUE TELLE QUELLE, `droitManquant` COMPRIS. L'écran doit pouvoir distinguer « Google refuse
 * ce geste à ce compte » (il faut accorder un droit, et l'on explique lequel) de « Google n'a pas répondu » (on
 * réessaie). Les confondre sous un même « échec » enverrait chercher une panne là où il n'y a qu'une autorisation.
 */
export interface IssueCorbeilleLot extends IssueGeste {
  faits: number;
  refuses: number;
  droitManquant: boolean;
}

export async function gesteCorbeilleLot(
  filIds: readonly number[], action: 'corbeille' | 'reintegrer' | 'supprimer',
): Promise<IssueCorbeilleLot> {
  const r = await appelerCorbeille({ filIds: [...filIds], action }, true);
  return r as IssueCorbeilleLot;
}

/** LES N ÉCHANGES DE LA CORBEILLE, pour « tout sélectionner ». `null` = la liste n'a pas pu être lue. */
export async function idsDeToutLaCorbeille(): Promise<{ ids: number[]; total: number; mails: number } | null> {
  try {
    const res = await fetch('/api/admin/gestion/corbeille', { cache: 'no-store' });
    const d = (await res.json().catch(() => ({}))) as {
      etat?: string; ids?: number[]; total?: number; mails?: number;
    };
    if (d.etat !== 'ok' || !Array.isArray(d.ids)) return null;
    return { ids: d.ids, total: d.total ?? d.ids.length, mails: d.mails ?? d.ids.length };
  } catch {
    return null;
  }
}

/**
 * L'ÉTAT DE LA CORBEILLE : combien elle contient, et si le droit Google d'effacer est accordé.
 *
 * 🔴 LE DROIT EST DEMANDÉ AU SERVEUR, QUI LE LIT SUR LE JETON — sans un seul appel à Google. C'est ce qui permet
 * de griser « Supprimer définitivement » AVANT le clic, au lieu de laisser découvrir un refus après coup.
 * `null` = la lecture a échoué : l'écran garde alors le bouton grisé, ce qui est la direction sûre du doute.
 */
export async function lireEtatCorbeille(): Promise<{
  total: number; mails: number; suppressionPossible: boolean; motImpossible: string;
} | null> {
  try {
    const res = await fetch('/api/admin/gestion/corbeille', { cache: 'no-store' });
    const d = (await res.json().catch(() => ({}))) as {
      etat?: string; total?: number; mails?: number;
      suppressionPossible?: boolean; motSuppressionImpossible?: string;
    };
    if (d.etat !== 'ok') return null;
    return {
      total: d.total ?? 0,
      mails: d.mails ?? 0,
      suppressionPossible: d.suppressionPossible === true,
      motImpossible: d.motSuppressionImpossible ?? MENTION_DROIT_ATTENTE,
    };
  } catch {
    return null;
  }
}

/**
 * Le repli quand le serveur n'a rien dit. Il ne prétend pas connaître la raison — il dit ce qui est sûr : le geste
 * n'est pas disponible, et pourquoi il pourrait ne pas l'être.
 */
export const MENTION_DROIT_ATTENTE =
  'La suppression définitive n’est pas disponible : elle demande un droit Google supplémentaire, qui n’est pas '
  + 'encore accordé à gestion@criterimmo.fr.';

/** Le délai du bandeau « Annuler », en millisecondes. Demandé par Arno, et déjà le rythme du Drive. */
export const DUREE_ANNULATION_MS = 10_000;

/** L'appel, écrit UNE fois : même route, même droit, même lecture de la réponse pour les trois gestes. */
async function appelerCorbeille(
  corps: Record<string, unknown>, detaille = false,
): Promise<IssueGeste | IssueCorbeilleLot> {
  const echec = (message: string): IssueCorbeilleLot =>
    ({ ok: false, message, faits: 0, refuses: 0, droitManquant: false });
  try {
    const res = await fetch('/api/admin/gestion/corbeille', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps),
    });
    const d = (await res.json().catch(() => ({}))) as {
      etat?: string; message?: string; faits?: number;
      refuses?: { messageId: number; motif: string }[]; droitManquant?: boolean;
    };
    const base = {
      ok: d.etat === 'ok',
      message: d.message ?? (d.etat === 'ok' ? 'Geste effectué.' : 'Geste impossible.'),
    };
    if (!detaille) return base;
    return {
      ...base,
      faits: d.faits ?? 0,
      refuses: (d.refuses ?? []).length,
      droitManquant: d.droitManquant === true,
    };
  } catch {
    return detaille
      ? echec('Geste impossible : le serveur n’a pas répondu.')
      : { ok: false, message: 'Geste impossible : le serveur n’a pas répondu.' };
  }
}
