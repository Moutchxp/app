/**
 * MODULE « GESTION » — LOT 5-BOITE-3 : LE MENU D'UNE LIGNE DE LA BOÎTE. Module PUR : aucun import, aucune base,
 * aucun réseau. Il décide de l'ORDRE, des MOTS et de ce que chaque entrée fait — rien d'autre.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE MENU EST CELUI D'UN ÉCHANGE, PAS D'UN MESSAGE. Il vit sur les LIGNES des listes (Réception, Envoyés, À
 * classer, résultats de recherche). Le menu « ⋮ » d'un message (lot 5-FIDÈLE) et le menu « Actions sur cet échange »
 * de la conversation ouverte gardent TOUTES leurs entrées : ce lot n'en retire aucune, il en ajoute un troisième,
 * là où il n'y en avait aucun — mesuré avant d'écrire : `BoiteMail.tsx` ne contenait PAS un seul menu.
 *
 * 🔴 L'ORDRE EST CELUI DE GMAIL, parce que l'équipe y travaille toute la journée : Répondre, Répondre à tous,
 * Transférer, un trait, puis ce qui agit sur l'échange. Un menu qui « fait mieux » oblige chacun à chercher, chaque
 * fois, où est passé ce qu'il connaissait.
 *
 * 🔴 « ARCHIVER » N'Y EST PAS — demande explicite d'Arno. Rien ne l'imite, et aucune entrée n'en tient lieu.
 *
 * ⚠️ « TRANSFÉRER EN TANT QUE PIÈCE JOINTE » N'Y EST PAS NON PLUS, ET C'EST MESURÉ, PAS OUBLIÉ. L'éditeur du lot 5e
 * ne sait pas porter de pièce jointe : `gestion_brouillon` n'a aucune colonne pour cela, `construireRfc822` n'émet
 * qu'un `text/plain` sans partie multipart, et `VoieRedaction` ne connaît que quatre voies. L'entrée existerait
 * donc sans rien derrière — or ce module s'interdit précisément cela (cf. `gmailMenu.ts` : « un bouton qui ne
 * marcherait pas coûte plus cher qu'une absence »). Ce qu'il faudra, le jour venu : une voie de plus, une partie
 * `message/rfc822` dans `construireRfc822`, et l'original tiré de Gmail au moment de l'envoi (`lireOriginalGmail`
 * existe déjà). Rien de plus — mais rien de moins.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

export type ActionLigne =
  | 'repondre' | 'repondre_tous' | 'transferer'
  | 'corbeille' | 'restaurer'
  | 'lu' | 'non_lu';

export interface EntreeLigne {
  cle: ActionLigne;
  libelle: string;
  /** Un trait au-dessus, comme dans Gmail : il sépare « ce qui répond » de « ce qui agit sur l'échange ». */
  separateurAvant?: boolean;
  /** Vrai pour une entrée qui DÉFAIT quelque chose : mise à part, jamais rendue rouge pour effrayer. */
  discrete?: boolean;
  /** Une ligne d'explication, AFFICHÉE sous le libellé — jamais au survol seul, qui n'existe pas au doigt. */
  aide?: string;
}

export interface EtatLigne {
  /** L'échange porte-t-il au moins un message non lu (dans Gmail — c'est le seul lu/non lu, cf. lot 5-BOITE-2) ? */
  nonLu: boolean;
  /** L'échange est-il DÉJÀ à la corbeille ? On propose alors « Restaurer », jamais « Supprimer » une seconde fois. */
  enCorbeille: boolean;
  /**
   * La migration 251 est-elle appliquée ? Sinon NI « Supprimer » NI « Restaurer » : proposer une corbeille dont on
   * ne pourrait pas se souvenir ferait réapparaître l'échange au rechargement, sans un mot d'explication.
   */
  corbeilleDisponible: boolean;
  /**
   * Peut-on écrire au nom de gestion@ ? Sans ce droit, ni les trois voies de rédaction, ni le lu/non lu (qui écrit
   * dans Gmail depuis le lot 5-BOITE-2). On n'affiche pas une entrée que le serveur refuserait.
   */
  peutEcrire: boolean;
}

/**
 * LES ENTRÉES DU MENU, dans l'ordre. PUR.
 *
 * ⚠️ UNE SEULE ENTRÉE POUR LE LU/NON LU, et c'est « l'une OU l'autre » : afficher les deux obligerait à lire laquelle
 * s'applique, alors que le libellé dit déjà ce qui va se passer. Même chose pour Supprimer / Restaurer.
 */
export function menuLigne(etat: EtatLigne): EntreeLigne[] {
  const entrees: EntreeLigne[] = [];

  if (etat.peutEcrire) {
    entrees.push(
      { cle: 'repondre', libelle: 'Répondre' },
      { cle: 'repondre_tous', libelle: 'Répondre à tous' },
      { cle: 'transferer', libelle: 'Transférer' },
    );
  }

  if (etat.corbeilleDisponible) {
    entrees.push(etat.enCorbeille
      ? {
        cle: 'restaurer', libelle: 'Restaurer', separateurAvant: entrees.length > 0,
        aide: 'L’échange revient dans sa boîte, avec tous ses messages.',
      }
      : {
        cle: 'corbeille', libelle: 'Supprimer', separateurAvant: entrees.length > 0, discrete: true,
        aide: 'Rien n’est supprimé : l’échange part à la corbeille, reste intact dans Gmail, et revient tout seul si un nouveau message arrive.',
      });
  }

  if (etat.peutEcrire) {
    entrees.push({
      cle: etat.nonLu ? 'lu' : 'non_lu',
      libelle: etat.nonLu ? 'Marquer comme lu' : 'Marquer comme non lu',
      separateurAvant: entrees.length > 0 && !etat.corbeilleDisponible,
      aide: 'Le lu/non lu est celui de Gmail : il vaut pour toute l’équipe.',
    });
  }

  return entrees;
}

/**
 * LE DÉPLACEMENT AU CLAVIER dans un menu ouvert. Rend l'index à activer, ou `null` si la touche ne nous concerne pas.
 *
 * 🔴 IL BOUCLE AUX DEUX BOUTS, comme tout menu : arrivé en bas, la flèche descendante revient en haut. Sans cela, on
 * croit le menu bloqué. `Home` et `Fin` sautent aux extrémités — ce sont les touches que les lecteurs d'écran
 * annoncent. PUR.
 */
export function deplacerDansMenu(touche: string, index: number, nombre: number): number | null {
  if (nombre <= 0) return null;
  switch (touche) {
    case 'ArrowDown': return (index + 1) % nombre;
    case 'ArrowUp': return (index - 1 + nombre) % nombre;
    case 'Home': return 0;
    case 'End': return nombre - 1;
    default: return null;
  }
}

/** Le délai d'un APPUI LONG, en millisecondes. 500 ms : celui d'iOS — au-dessous, un simple tapotement l'ouvrirait. */
export const APPUI_LONG_MS = 500;
/** De combien le doigt peut bouger sans que ce soit un défilement. Au-delà, on annule : la liste défile, on n'ouvre pas. */
export const APPUI_LONG_TOLERANCE_PX = 10;

/**
 * L'APPUI LONG, SORTI DU COMPOSANT POUR ÊTRE ÉPROUVÉ.
 *
 * 🔴 POURQUOI IL VIT ICI. Fabriquer un `TouchEvent` à la main ne reproduit PAS un doigt : mesuré le 25/09/2026, les
 * événements tactiles synthétiques n'arrivaient pas à React dans l'ordre émis, et le harnais rendait un résultat
 * décalé d'une séquence — impossible d'en conclure quoi que ce soit. La règle, elle, ne dépend d'aucun navigateur :
 * un départ, un mouvement, une fin, une horloge. Sortie ici, elle s'éprouve sans ambiguïté ; le composant ne fait
 * plus que lui transmettre ce que le doigt fait.
 *
 * TROIS FAÇONS DE RENONCER, et chacune compte : le doigt BOUGE (c'est un défilement), le doigt SE LÈVE (c'est un
 * tapotement, qui doit ouvrir l'échange), ou la PAGE DÉFILE (le navigateur a pris la main et cesse parfois d'émettre
 * des mouvements vers nous).
 */
export interface AppuiLong {
  /** Le doigt se pose. */
  commencer(x: number, y: number): void;
  /** Le doigt bouge : rend `true` si l'appui est ABANDONNÉ à cause de ce mouvement. */
  bouger(x: number, y: number): boolean;
  /** Le doigt se lève, ou la page défile, ou le composant disparaît. */
  annuler(): void;
  /** Un appui est-il armé ? Sert aux épreuves ; le composant n'en a pas besoin. */
  arme(): boolean;
}

export function creerAppuiLong(o: {
  /** Ce qu'on fait quand l'appui est tenu assez longtemps. */
  ouvrir: () => void;
  programmer?: (rappel: () => void, ms: number) => unknown;
  annulerMinuterie?: (jeton: unknown) => void;
  delaiMs?: number;
  tolerancePx?: number;
}): AppuiLong {
  const programmer = o.programmer ?? ((rappel, ms) => setTimeout(rappel, ms));
  const annulerMinuterie = o.annulerMinuterie ?? ((j) => clearTimeout(j as ReturnType<typeof setTimeout>));
  const delai = o.delaiMs ?? APPUI_LONG_MS;
  const tolerance = o.tolerancePx ?? APPUI_LONG_TOLERANCE_PX;

  let jeton: unknown = null;
  let depart: { x: number; y: number } | null = null;

  const annuler = (): void => {
    if (jeton !== null) { annulerMinuterie(jeton); jeton = null; }
    depart = null;
  };

  return {
    commencer(x, y) {
      annuler(); // un second contact ne doit jamais laisser deux minuteries derrière lui
      depart = { x, y };
      jeton = programmer(() => { jeton = null; depart = null; o.ouvrir(); }, delai);
    },
    bouger(x, y) {
      if (depart === null) return false;
      if (Math.abs(x - depart.x) <= tolerance && Math.abs(y - depart.y) <= tolerance) return false;
      annuler(); // le doigt a bougé : c'est un DÉFILEMENT, pas une intention d'ouvrir
      return true;
    },
    annuler,
    arme: () => jeton !== null,
  };
}
