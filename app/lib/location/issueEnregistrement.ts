/**
 * ══ 🔴🔴 PLUS AUCUN ÉCHEC SILENCIEUX (Arno, 21/10/2026) — « Nouveau bien » et « Nouveau locataire ». PUR (aucune base). ═══════
 *
 * CONSTAT (production, 21/10/2026, compte d'un collaborateur) : « Enregistrer le bien » semblait ne rien faire ; rien n'était
 * écrit. Le serveur n'avait journalisé aucune erreur ; un refus (contrôle de la page, refus du serveur, droit, base, réseau) ne
 * se lisait qu'en petit texte gris dans la barre du bas, à la place de « Reste à renseigner ». Un 403 du serveur
 * (`{ erreur: 'ACCES_REVOQUE' }`) devenait même « Enregistrement refusé. », sans dire pourquoi.
 *
 * LA RÈGLE : tout échec ouvre une MODALE ROUGE qui dit, en français simple, CE QUI a échoué, POURQUOI, et QUOI FAIRE ; la saisie
 * n'est jamais perdue. Ce module dit les mots ; l'écran les montre (`ModaleIssue`), le serveur les journalise.
 */

/** La famille d'un échec : ce qui permet de dire « pourquoi » et « quoi faire ». */
export type CauseEchec = 'champs' | 'saisie' | 'droit' | 'base' | 'technique';

/** Un compte sans le droit, ou une session expirée (403 / 401 de la garde). */
export const MOTIF_DROIT = 'Votre compte n’a pas le droit « Location », ou votre session a expiré.';
/** Le serveur n'a pas répondu (réseau, redémarrage, erreur interne). */
export const MOTIF_TECHNIQUE = 'Le serveur n’a pas répondu ou a rencontré une erreur technique.';

/** Ce que la modale d'erreur affiche. */
export interface ExplicationEchec { quoi: string; pourquoi: string; faire: string; conserve: string }

/** L'écran (et ce qu'il enregistre) : le mot de la modale. */
export type EcranCreation = 'nouveau-bien' | 'nouveau-locataire';
const QUOI: Record<EcranCreation, string> = {
  'nouveau-bien': 'Le bien n’a pas été enregistré.',
  'nouveau-locataire': 'Le locataire n’a pas été enregistré.',
};
const BOUTON: Record<EcranCreation, string> = { 'nouveau-bien': '« Enregistrer le bien »', 'nouveau-locataire': '« Enregistrer »' };

/** La réponse lue d'un enregistrement refusé, en famille d'échec. PUR. */
export function causeDeLaReponse(o: { statut: number | null; etat?: string; erreur?: string }): CauseEchec {
  if (o.statut === 401 || o.statut === 403 || o.erreur === 'ACCES_REVOQUE' || o.erreur === 'INTERDIT') return 'droit';
  if (o.etat === 'sans_schema') return 'base';
  if (o.statut === null || o.statut >= 500 || o.etat === 'erreur' || o.etat === 'echec') return 'technique';
  return 'saisie';
}

/** QUOI, POURQUOI, QUOI FAIRE — en français simple. `motif` : la raison précise (serveur ou contrôle de la page). PUR. */
export function explicationEchec(ecran: EcranCreation, cause: CauseEchec, motif: string | null): ExplicationEchec {
  const conserve = 'Rien n’a été enregistré. Votre saisie est conservée : vous pouvez réessayer.';
  const quoi = QUOI[ecran];
  switch (cause) {
    case 'champs':
      return { quoi, pourquoi: motif ?? 'Des informations obligatoires manquent.', conserve,
        faire: `Complétez ce qui manque (c’est signalé en rouge sous chaque champ), puis cliquez à nouveau sur ${BOUTON[ecran]}.` };
    case 'saisie':
      return { quoi, pourquoi: motif ?? 'Une information saisie a été refusée.', conserve,
        faire: `Corrigez ce point, puis cliquez à nouveau sur ${BOUTON[ecran]}.` };
    case 'droit':
      return { quoi, pourquoi: MOTIF_DROIT, conserve,
        faire: 'Rechargez la page et reconnectez-vous. Si le refus persiste, demandez à un administrateur d’activer le droit « Location » sur votre compte.' };
    case 'base':
      return { quoi, pourquoi: motif ?? 'La base de données n’est pas à jour pour cet enregistrement.', conserve,
        faire: 'Prévenez l’administrateur : une mise à jour de la base doit être appliquée. Réessayez ensuite.' };
    default:
      return { quoi, pourquoi: motif !== null && motif !== MOTIF_TECHNIQUE ? `${MOTIF_TECHNIQUE} (${motif})` : MOTIF_TECHNIQUE, conserve,
        faire: 'Vérifiez votre connexion et réessayez dans un instant. Si cela persiste, prévenez l’administrateur.' };
  }
}

/** La ligne de journal d'un échec, côté serveur (compte, écran, action, cause, raison). Une ligne, sans saut. PUR. */
export function ligneJournalEchec(o: { compte: string; ecran: string; action: string; cause: CauseEchec | string; raison: string | null }): string {
  const propre = (s: string): string => s.replace(/[\r\n\t]+/g, ' ').slice(0, 300);
  return `[location:echec] compte=${propre(o.compte)} ecran=${propre(o.ecran)} action=${propre(o.action)} cause=${propre(String(o.cause))} raison=${propre(o.raison ?? '—')}`;
}
