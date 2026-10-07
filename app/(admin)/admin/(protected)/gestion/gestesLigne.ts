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

/* 🔴🔴 LOT HISTORIQUE-BIEN-12, POINT 2 — l'étoile écrite ici est annoncée à tous les écrans montés. */
import { annoncerEtoile } from '../../../../lib/gestion/signalEtoile';
/* 🔴🔴 LOT INSTANTANE-ETOILE-CORBEILLE, POINT 2 — la corbeille écrite ici est annoncée AVANT d'être écrite. */
import { annoncerCorbeille, type ActionCorbeille } from '../../../../lib/gestion/signalCorbeille';

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
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-12, POINT 2 — L'ÉTOILE D'UN ÉCHANGE : **LA** PORTE D'ÉCRITURE ═══════════════════════
 *
 * RÈGLE D'ARNO (05/10/2026) : « C'est la MÊME fonction et le MÊME état que l'étoile de la barre de survol des
 * lignes et que l'étoile rouge affichée sur la ligne : une seule porte d'écriture, un seul état. Cliquer l'une
 * allume ou éteint les trois en direct (ligne, barre de survol, mail ouvert), dans les deux sens. »
 *
 * 🔴 ELLE EXISTAIT DÉJÀ, MAIS RECOPIÉE DANS L'ÉCRAN. `BoiteMail` appelait `/fils/[id]/etoile` depuis son propre
 * `fetch`, ce qui était invisible tant qu'un seul écran cliquait. En ajouter un second aurait fait deux appels
 * recopiés — et le jour où l'un gagnerait un garde, un journal ou un repli, l'autre ne l'aurait pas.
 *
 * 🔴 ELLE ANNONCE CE QUE LE SERVEUR A CONFIRMÉ, et c'est ce qui tient « un seul état ». La réponse porte
 * `etoilee` tel que Gmail l'a accepté ; le signal le rediffuse à tous les écrans montés. Annoncer l'état DEMANDÉ
 * aurait allumé les trois étoiles sur un geste refusé.
 *
 * ⚠️ RIEN N'EST ANNONCÉ EN CAS D'ÉCHEC : l'appelant reçoit `ok: false` et son message, et c'est à lui — celui qui
 * a cliqué — de se remettre droit. Les autres écrans n'ont rien vu, ce qui est exact : rien n'a changé.
 *
 * ⚠️ `touches` VOYAGE QUAND LE SERVEUR LE DONNE : retirer l'étoile d'un échange la retire de TOUS ses messages
 * étoilés (règle de `basculerEtoileDuFil`), et le nombre est la seule façon de dire qu'un échec partiel a laissé
 * l'échange dans le filtre.
 */
export interface IssueEtoile extends IssueGeste {
  /** L'état CONFIRMÉ par le serveur. `null` quand le geste n'a pas eu lieu. */
  etoilee: boolean | null;
  touches: number;
}

/**
 * ══ 🔴🔴 LOT INSTANTANE-ETOILE-CORBEILLE, POINT 1 — TOUTES LES ÉTOILES BASCULENT DANS LA MÊME IMAGE ═════════════
 *
 * RÈGLE D'ARNO (06/10/2026) : « UN SEUL état partagé côté écran par mail […]. Un clic sur n'importe laquelle met
 * à jour TOUTES les étoiles de ce mail dans la même image (aucun délai visible), puis enregistre en base. En cas
 * d'échec, toutes reviennent à l'état d'avant, avec un message court. »
 *
 * 🔴 TROIS ANNONCES POSSIBLES, ET L'ORDRE EST LA RÈGLE :
 *   ① AVANT L'ÉCRITURE — l'état VOULU. C'est cette annonce-là qui fait basculer toutes les étoiles ensemble ;
 *      aucun écran n'anticipe plus pour lui seul, tous écoutent la même source.
 *   ② APRÈS UNE RÉPONSE — l'état CONFIRMÉ par Gmail. Il vaut presque toujours celui qu'on avait annoncé ; on le
 *      réémet quand même, parce que « presque toujours » n'est pas « toujours » (une étoile posée depuis un
 *      téléphone entre-temps, par exemple).
 *   ③ APRÈS UN REFUS — l'état D'AVANT, réémis à tout le monde. C'est le « toutes reviennent » d'Arno : avant ce
 *      lot, seule l'étoile cliquée savait se remettre droite, et elle était la seule à avoir bougé.
 *
 * ⚠️ MESURÉ AVANT CE LOT (fil 36748) : 721 ms d'écart entre la grande étoile et celle de la ligne. Voir
 * l'encadré de `signalEtoile`.
 */
export async function gesteEtoileFil(filId: number, etoilee: boolean): Promise<IssueEtoile> {
  /**
   * ⚠️ `messageId: null` — CE GESTE PORTE SUR L'ÉCHANGE, PAS SUR UN MAIL (lot ETOILE-PAR-MESSAGE). C'est la porte
   * de la LIGNE de la boîte et de sa barre de survol, où une ligne REPRÉSENTE une conversation. Les écrans qui
   * affichent des mails appliquent alors la règle du serveur : poser va sur le dernier message, retirer passe
   * sur tous (voir `basculerEtoileDuFil`).
   *
   * ⚠️ `filEtoile` VAUT `etoilee` ET C'EST EXACT ICI : poser l'étoile d'un échange en fait un échange étoilé ;
   * la retirer la retire de TOUS ses messages, donc l'échange ne l'est plus. Aucun doute à transmettre.
   */
  const annonce = (e: boolean) => annoncerEtoile({ filId, messageId: null, etoilee: e, filEtoile: e });
  /* ① L'ÉTAT VOULU, TOUT DE SUITE. Toutes les étoiles de ce mail basculent dans l'image de ce clic. */
  annonce(etoilee);
  const revenir = (message: string): IssueEtoile => {
    /* ③ TOUT LE MONDE REVIENT, pas seulement le bouton cliqué. */
    annonce(!etoilee);
    return { ok: false, etoilee: null, touches: 0, message };
  };
  try {
    const res = await fetch(`/api/admin/gestion/fils/${filId}/etoile`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ etoilee }),
    });
    const d = (await res.json().catch(() => ({}))) as {
      ok?: boolean; etoilee?: boolean; touches?: number; erreur?: string;
    };
    if (!res.ok || d.ok !== true || typeof d.etoilee !== 'boolean') {
      return revenir(d.erreur ?? 'Étoile impossible.');
    }
    /* ② L'ÉTAT CONFIRMÉ. */
    annonce(d.etoilee);
    return {
      ok: true, etoilee: d.etoilee, touches: d.touches ?? 0,
      message: d.etoilee ? 'Étoile posée.' : 'Étoile retirée.',
    };
  } catch {
    return revenir('Étoile impossible : le serveur n’a pas répondu.');
  }
}

/**
 * ══ 🔴🔴 LOT ETOILE-PAR-MESSAGE — **LA** PORTE D'ÉCRITURE DE L'ÉTOILE D'UN MAIL ═════════════════════════════════
 *
 * BUG CONSTATÉ PAR ARNO (07/10/2026, fil 36764 « Facture Huissier », 3 mails) : il clique la GRANDE étoile du mail
 * déplié du 06/10 16:31, et c'est l'étoile du mail du 07/10 09:32 — le plus récent de l'échange — qui s'allume.
 *
 * 🔴 LA CAUSE : LA GRANDE ÉTOILE PASSAIT PAR LA PORTE DE L'ÉCHANGE (`gesteEtoileFil`), qui ne reçoit AUCUN
 * identifiant de message et pose donc l'étoile sur « le dernier message de l'échange ». Sur un fil d'un seul mail
 * c'était invisible ; dès le second, le clic débordait sur un autre mail.
 *
 * 🔴 RÈGLE D'ARNO : « une étoile ne concerne QUE le mail sur lequel on clique. Elle ne déborde jamais sur un autre
 * mail, ni de la conversation, ni d'ailleurs. » Cette porte-ci NOMME donc le message, et c'est la route PAR
 * MESSAGE (`messages/:id/gmail`, `action: 'etoile'`) qui écrit — la même que l'étoile de la rangée du mail
 * utilisait déjà. Les deux étoiles d'un mail passent désormais par la même fonction : elles ne peuvent plus
 * désigner deux cibles différentes.
 *
 * 🔴 MÊME DISCIPLINE D'ANNONCE QUE LA PORTE D'ÉCHANGE (lot INSTANTANE-ETOILE-CORBEILLE) : l'état VOULU avant
 * l'écriture — toutes les étoiles de ce mail basculent dans l'image du clic —, l'état CONFIRMÉ après la réponse,
 * l'état D'AVANT en cas de refus.
 *
 * ⚠️ LA ROUTE BASCULE, ELLE NE REÇOIT PAS D'ÉTAT : elle lit l'étoile DANS GMAIL et pose l'inverse (voir
 * `gmailAction.basculerEtoile`). L'état demandé ne sert donc qu'à l'ANNONCE ; c'est `etat.etoile`, rendu par
 * Gmail, qui est réannoncé comme vérité. Les deux coïncident sauf si quelqu'un a étoilé depuis son téléphone
 * entre-temps — et dans ce cas c'est Gmail qui a raison.
 *
 * ⚠️ `filAvant` / `filApres` : L'ÉTAT DE LA LIGNE DE LA BOÎTE, QUE SEUL L'APPELANT CONNAÎT. La ligne s'allume dès
 * qu'AU MOINS UN mail de l'échange est étoilé (règle inchangée, `boiteRepo.sqlEtoile`) ; retirer l'étoile d'un
 * mail parmi trois ne l'éteint donc pas. La conversation, elle, connaît l'étoile de chacun de ses mails : elle
 * seule peut trancher, et elle le fait AVANT l'appel pour que la ligne bascule dans la même image.
 */
export async function gesteEtoileMessage(o: {
  filId: number;
  messageId: number;
  /** L'état VOULU pour ce mail — celui qu'on annonce d'avance. */
  etoilee: boolean;
  /** L'échange était-il étoilé AVANT ce geste ? Réémis tel quel si le serveur refuse. */
  filAvant: boolean;
  /** L'échange sera-t-il encore étoilé APRÈS ce geste ? « au moins un mail », l'appelant l'a calculé. */
  filApres: boolean;
}): Promise<IssueEtoile> {
  const annonce = (etoilee: boolean, filEtoile: boolean) =>
    annoncerEtoile({ filId: o.filId, messageId: o.messageId, etoilee, filEtoile });
  /* ① L'ÉTAT VOULU, TOUT DE SUITE : les étoiles de CE mail basculent dans l'image du clic, et elles seules. */
  annonce(o.etoilee, o.filApres);
  const revenir = (message: string): IssueEtoile => {
    /* ③ TOUT LE MONDE REVIENT — le mail à son étoile d'avant, la ligne à la sienne. */
    annonce(!o.etoilee, o.filAvant);
    return { ok: false, etoilee: null, touches: 0, message };
  };
  try {
    const res = await fetch(`/api/admin/gestion/messages/${o.messageId}/gmail`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'etoile' }),
    });
    const d = (await res.json().catch(() => ({}))) as {
      ok?: boolean; message?: string; erreur?: string; etat?: { etoile: boolean } | null;
    };
    if (!res.ok || d.ok !== true) return revenir(d.erreur ?? 'Étoile impossible.');
    /**
     * ② L'ÉTAT CONFIRMÉ PAR GMAIL. `etat` absent (connexion perdue entre l'action et la relecture) ⇒ on garde ce
     * qu'on avait annoncé plutôt que d'inventer l'inverse : l'action, elle, a bien abouti (`ok: true`).
     */
    const confirme = d.etat?.etoile ?? o.etoilee;
    annonce(confirme, confirme === o.etoilee ? o.filApres : o.filAvant);
    return {
      ok: true, etoilee: confirme, touches: 1,
      message: d.message ?? (confirme ? 'Étoile ajoutée dans Gmail.' : 'Étoile retirée dans Gmail.'),
    };
  } catch {
    return revenir('Étoile impossible : le serveur n’a pas répondu.');
  }
}

/**
 * ══ 🔴🔴 LOT ETOILE-PAR-MESSAGE — QUELS **MAILS** DE L'ÉCHANGE PORTENT UNE ÉTOILE ══════════════════════════════
 *
 * Pour un écran qui ne tient pas la liste : la conversation.
 *
 * 🔴 ELLE RENDAIT UN BOOLÉEN D'ÉCHANGE (« au moins un mail est étoilé »), et c'est ce grain-là qui a produit le
 * bug d'Arno : la grande étoile de CHACUN des trois mails du fil 36764 affichait le même état, et le clic ne
 * pouvait désigner aucun d'eux en particulier. Elle rend maintenant la LISTE DES MAILS étoilés — l'échange
 * s'en déduit (`ids.size > 0`), l'inverse n'est pas vrai.
 *
 * ⚠️ `disponible: false` VEUT DIRE « LE GESTE N'EST PAS POSSIBLE » (migration 277 absente, ou lecture en échec),
 * et l'écran n'affiche alors AUCUNE étoile dans le bloc d'en-tête — plutôt qu'une étoile éteinte, qui dirait
 * faussement « ce mail n'est pas suivi ». C'est déjà la règle de la barre de survol (`etoileDisponible`).
 */
export async function lireEtoilesDuFil(filId: number): Promise<{ disponible: boolean; etoiles: number[] }> {
  try {
    const res = await fetch(`/api/admin/gestion/fils/${filId}/etoile`, { cache: 'no-store' });
    const d = (await res.json().catch(() => ({}))) as { etoiles?: unknown; disponible?: boolean };
    if (!res.ok || d.disponible !== true) return { disponible: false, etoiles: [] };
    /* ⚠️ ON NE FAIT CONFIANCE QU'À DES NOMBRES : une réponse abîmée ne doit pas peupler l'état d'un `NaN`. */
    const etoiles = Array.isArray(d.etoiles)
      ? d.etoiles.filter((n): n is number => typeof n === 'number' && Number.isInteger(n))
      : [];
    return { disponible: true, etoiles };
  } catch {
    return { disponible: false, etoiles: [] };
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
 * ══ 🔴🔴 LOT COMPTEURS-CORBEILLE-RECEPTION, POINT 2 — UN SEUL MESSAGE À LA CORBEILLE ═════════════════════════════
 *
 * RÈGLE D'ARNO (03/10/2026) : « une grande icône corbeille dans le bloc d'en-tête d'un message ouvert. Clic : ce
 * MESSAGE va à la corbeille (mécanisme de corbeille existant, synchronisé avec Gmail comme aujourd'hui). […]
 * Jamais de suppression définitive. Restaurable depuis la Corbeille. »
 *
 * 🔴 C'EST LA MÊME ROUTE, LE MÊME GESTE, LE MÊME JOURNAL que la corbeille d'un échange : seule la DÉSIGNATION
 * change — un message plutôt qu'un fil. Écrire un second chemin aurait donné deux corbeilles, dont une qui
 * oublierait un jour de se synchroniser avec Gmail.
 *
 * 🔴 ET AUCUNE SUPPRESSION DÉFINITIVE N'EST ATTEIGNABLE D'ICI : les deux seules actions offertes sont
 * « corbeille » et « reintegrer ». La troisième (`supprimer`) reste réservée à l'écran de la Corbeille, où elle
 * est confirmée — c'est la règle du module depuis le lot BOITE-INTERNE-CORBEILLE.
 */
/**
 * ══ 🔴🔴 LOT INSTANTANE-ETOILE-CORBEILLE, POINT 2 — `filQuiSuit` : L'ÉCHANGE PART-IL AVEC CE MESSAGE ? ══════════
 *
 * CONSTAT D'ARNO : le mail jeté depuis le mail ouvert « reste visible dans la boîte quelques secondes ».
 *
 * 🔴 ET CETTE LISTE-LÀ NE PEUT PAS LE DEVINER. Ses lignes sont des ÉCHANGES ; or jeter UN message n'emporte
 * l'échange que s'il n'en reste aucun autre hors de la corbeille. L'échange de douze mails dont on jette le
 * troisième DOIT rester affiché — le faire disparaître serait un mensonge pire que le retard qu'on corrige.
 *
 * 🔴 SEULE LA CONVERSATION OUVERTE LE SAIT, et elle le sait exactement : elle a tous les messages du fil, chacun
 * avec son `aLaCorbeille` (lot REINTEGRER-PARTOUT-ET-BANDEAU). Elle passe donc l'identifiant du fil quand, et
 * seulement quand, ce message est le dernier à en sortir. Dans le doute, elle ne passe rien : la ligne reste, et
 * la relecture suivante la retirera — c'est la direction sûre, celle qui ne fait jamais disparaître à tort.
 *
 * ⚠️ CE N'EST PAS AU SERVEUR DE LE DIRE, même s'il le sait aussi : il ne le dirait qu'une fois le geste écrit,
 * c'est-à-dire trop tard pour « la même image ».
 */
export async function gesteCorbeilleMessage(
  messageId: number, versLaCorbeille: boolean, filQuiSuit?: number,
): Promise<IssueGeste> {
  return appelerCorbeille(
    { messageIds: [messageId], action: versLaCorbeille ? 'corbeille' : 'reintegrer' },
    false,
    /**
     * ⚠️ IL VOYAGE À CÔTÉ DU CORPS, JAMAIS DEDANS. Le corps est envoyé tel quel à
     * `/api/admin/gestion/corbeille`, qui n'attend que `filIds`, `messageIds` et `action` : y glisser un
     * quatrième champ ferait porter au serveur l'ordre de jeter TOUT l'échange, alors qu'on ne jette qu'un
     * message. Ce fil-ci ne concerne que l'ANNONCE — ce que les listes doivent masquer.
     */
    filQuiSuit === undefined ? [] : [filQuiSuit],
  );
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

/**
 * ══ 🔴🔴 LOT INSTANTANE-ETOILE-CORBEILLE, POINT 2 — LE CORPS DE L'APPEL EST TYPÉ, et ce n'est pas cosmétique ═════
 *
 * Il était `Record<string, unknown>`. Pour annoncer le geste avant de l'écrire, il faut SAVOIR ce qu'il porte —
 * quels fils, quels messages, quelle action. Un sac de clés inconnues aurait obligé à le relire à l'aveugle
 * (`corps.filIds as number[]`), c'est-à-dire à répéter ici la forme que les trois appelants connaissent déjà.
 */
interface CorpsCorbeille {
  filIds?: number[];
  messageIds?: number[];
  action: ActionCorbeille;
}

/**
 * L'appel, écrit UNE fois : même route, même droit, même lecture de la réponse pour les trois gestes.
 *
 * ═══ 🔴🔴 ET **LA** PORTE D'ANNONCE, pour la même raison qu'elle est la porte d'écriture ════════════════════════
 *
 * Les trois gestes (`gesteCorbeille`, `gesteCorbeilleMessage`, `gesteCorbeilleLot`) passent tous par ici. Annoncer
 * dans chacun aurait donné trois occasions d'oublier l'annonce de retour — celle qui remet la ligne quand le
 * serveur refuse, et qui est la moitié à laquelle personne ne pense parce qu'elle ne se voit jamais.
 *
 * ① L'ANNONCE VOULUE, AVANT LE `fetch` : chaque liste montée retire la ligne dans la même image. C'est la règle
 *    d'Arno mot pour mot — « dans la même image, le mail QUITTE la liste de sa boîte ».
 * ② L'ANNONCE D'ANNULATION, si et seulement si le serveur a refusé : la ligne revient à sa place, et l'écran qui a
 *    cliqué dit pourquoi (il a le `message` dans l'issue, comme avant).
 *
 * ⚠️ RIEN N'EST ANNONCÉ AU SUCCÈS. L'étoile, elle, réannonce l'état CONFIRMÉ, parce que Gmail peut rendre un
 * booléen différent de celui demandé. Ici le geste n'a pas d'autre résultat que « parti » ou « resté » : une
 * seconde annonce identique ne ferait que redemander aux listes ce qu'elles ont déjà fait.
 *
 * ⚠️ UN LOT PARTIELLEMENT REFUSÉ (`faits` < demandés) N'EST PAS UNE ANNULATION : `etat` vaut « ok », les lignes
 * faites sont bien parties, et l'écran de la Corbeille affiche déjà le compte des refusées. Tout remettre serait
 * faux pour la majorité qui a réussi ; sa relecture — qu'il fait déjà — rétablit les refusées.
 */
async function appelerCorbeille(
  corps: CorpsCorbeille, detaille = false, filsAnnonces: readonly number[] = [],
): Promise<IssueGeste | IssueCorbeilleLot> {
  const echec = (message: string): IssueCorbeilleLot =>
    ({ ok: false, message, faits: 0, refuses: 0, droitManquant: false });
  /* ① CE QU'ON VEUT, TOUT DE SUITE — avant le réseau, donc dans l'image du clic. */
  const signal = {
    /* ⚠️ `filsAnnonces` S'AJOUTE AU SIGNAL SEUL, et n'est jamais dans `corps` : voir `gesteCorbeilleMessage`. */
    filIds: [...(corps.filIds ?? []), ...filsAnnonces],
    messageIds: corps.messageIds ?? [],
    action: corps.action,
  };
  annoncerCorbeille({ ...signal, annule: false });
  const revenir = <T>(issue: T): T => {
    annoncerCorbeille({ ...signal, annule: true });   /* ② LA LIGNE REVIENT À SA PLACE */
    return issue;
  };
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
    const issue = !detaille ? base : {
      ...base,
      faits: d.faits ?? 0,
      refuses: (d.refuses ?? []).length,
      droitManquant: d.droitManquant === true,
    };
    return base.ok ? issue : revenir(issue);
  } catch {
    return revenir(detaille
      ? echec('Geste impossible : le serveur n’a pas répondu.')
      : { ok: false, message: 'Geste impossible : le serveur n’a pas répondu.' });
  }
}
