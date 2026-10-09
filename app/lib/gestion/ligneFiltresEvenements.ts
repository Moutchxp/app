/**
 * ══ 🔴🔴 LOT RACCOURCI-EVENEMENTS-ACCUEIL-GESTION-ET-LIGNE-DE-FILTRES, POINT 3 — LA LIGNE. Module PUR ═══════════
 *
 * Aucune I/O, aucune base, aucun réseau, aucun React : importable depuis un `'use client'` sans risque (règle du
 * module depuis l'incident du 24/09/2026, consignée dans AGENTS.md).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (09/10/2026) : « Une LIGNE DE FILTRES ET DE TRIS […] placée SOUS le tableau de bord et
 * AU-DESSUS des capsules […]. Elle REPREND la clé d'URL &evf= déjà posée par le tableau de bord (un clic sur un
 * chiffre du tableau de bord active le bouton correspondant de la ligne), et remplace le bandeau provisoire
 * “filtre actif ✕” par l'état visible des boutons. »
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ══ 🔴🔴 LES FILTRES NE RECALCULENT RIEN : ILS LISENT LES ENSEMBLES DU TABLEAU DE BORD ══════════════════════════
 *
 * Chaque bouton désigne une clé que le tableau de bord a DÉJÀ comptée et dont il rend la liste d'identifiants
 * (`idsParFiltre`, lot EVENEMENTS-TABLEAU-DE-BORD). D'où trois propriétés qu'on n'a pas eu à surveiller :
 *   ① le COMPTEUR d'un bouton est la taille de l'ensemble qu'il applique — ils ne peuvent pas se contredire ;
 *   ② cliquer « 4 devis en attente » dans le tableau de bord allume le bouton « Devis en attente » de la ligne,
 *      parce que c'est LA MÊME CLÉ, écrite au même endroit de l'adresse ;
 *   ③ la règle de chaque filtre est écrite UNE fois, en SQL, dans `tableauBordRepo` — jamais deux fois.
 *
 * ⚠️ « New » ET « Urgent » NE SONT PAS DE CETTE FAMILLE, et c'est voulu : Arno écrit « comportement actuel ».
 * Ce sont les deux TRIS existants (`&tri=`, lot FILTRES-EVENEMENTS-NEW), qui ne masquent aucune carte. Ils
 * déménagent dans la ligne, en tête, et gardent leur geste à l'identique.
 */

import type { CarteEvenement } from './fileRepo';

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LES CLÉS — l'alphabet que l'adresse écrit, et que les deux écrans lisent
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * L'ÉTAT : trois choix exclusifs, et « en cours » est le DÉFAUT — il ne s'écrit donc jamais dans l'adresse.
 *
 * ⚠️ CE DÉFAUT CACHE LES DOSSIERS CLOS, et c'est une demande explicite d'Arno (« État : En cours par défaut /
 * Clôturés / Tous »). Il est donc ÉCRIT SUR LE BOUTON, allumé dès l'arrivée : un filtre par défaut qui ne se
 * voit pas est un écran qui ment. « Tous » est à un clic.
 */
export const ETATS: readonly { cle: string; mot: string }[] = [
  { cle: 'encours', mot: 'En cours' },
  { cle: 'clos', mot: 'Clôturés' },
  { cle: 'tous', mot: 'Tous' },
];
export const ETAT_PAR_DEFAUT = 'encours';

/** MONGA : trois choix exclusifs, « tous » par défaut (aucune clé écrite). */
export const MONGAS: readonly { cle: string; mot: string }[] = [
  { cle: 'monga-tous', mot: 'Tous' },
  { cle: 'monga', mot: 'Avec Monga' },
  { cle: 'sans-monga', mot: 'Sans Monga' },
];
export const MONGA_PAR_DEFAUT = 'monga-tous';

/** Les interrupteurs indépendants : chacun RESTREINT, et ils se combinent (ET). */
export const INTERRUPTEURS: readonly { cle: string; mot: string }[] = [
  { cle: 'devis-attente', mot: 'Devis en attente' },
  { cle: 'sans-nouvelles', mot: 'Sans nouvelles > 15 j' },
  { cle: 'infos-manquantes', mot: 'Infos manquantes' },
];

/** Les trois tris de la ligne. `null` = aucun, c'est-à-dire l'ordre que « New »/« Urgent » donnent déjà. */
export const TRIS_LIGNE: readonly { cle: string; mot: string }[] = [
  { cle: 'ouverture', mot: 'Date d’ouverture' },
  { cle: 'echange', mot: 'Dernier échange' },
  { cle: 'urgence', mot: 'Urgence' },
];

/** Le rang d'un niveau d'urgence pour le tri : le plus pressant d'abord en ordre décroissant. */
const RANG_URGENCE: Record<string, number> = { urgent: 3, haute: 2, normale: 1 };

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════
   L'ÉTAT DE LA LIGNE — lu de l'adresse, écrit dans l'adresse
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

export interface EtatLigne {
  /** `encours` (défaut), `clos` ou `tous`. */
  etat: string;
  /** `monga-tous` (défaut), `monga` ou `sans-monga`. */
  monga: string;
  /** Les types retenus, en UNION entre eux (Arno : « choix multiples »). Vide = tous les types. */
  types: string[];
  /** Les interrupteurs allumés, en INTERSECTION. */
  interrupteurs: string[];
  /** Le tri de la ligne, ou `null` = aucun (l'ordre de « New »/« Urgent » s'applique seul). */
  tri: string | null;
  /** Le sens du tri. `desc` = du plus récent / plus urgent au moins. */
  sens: 'asc' | 'desc';
}

export const LIGNE_PAR_DEFAUT: EtatLigne = {
  etat: ETAT_PAR_DEFAUT, monga: MONGA_PAR_DEFAUT, types: [], interrupteurs: [], tri: null, sens: 'desc',
};

/** Rien n'est choisi : ni filtre hors défaut, ni tri. C'est ce qui décide d'offrir « Réinitialiser ». */
export function ligneParDefaut(e: EtatLigne): boolean {
  return e.etat === ETAT_PAR_DEFAUT && e.monga === MONGA_PAR_DEFAUT
    && e.types.length === 0 && e.interrupteurs.length === 0 && e.tri === null;
}

const CLES_INTERRUPTEURS = new Set(INTERRUPTEURS.map((i) => i.cle));
const CLES_ETATS = new Set(ETATS.map((e) => e.cle));
const CLES_MONGA = new Set(MONGAS.map((m) => m.cle));

/**
 * Lire l'état de la ligne depuis la valeur de `&evf=` (clés séparées par des virgules), `&tric=` et `&sens=`.
 *
 * ⚠️ TOUT CE QU'ON NE RECONNAÎT PAS EST IGNORÉ, jamais une erreur : une adresse abîmée, un lien d'hier, une clé
 * d'un lot futur — l'écran montre alors plus, jamais moins. C'est la règle de `lireEtatUrl` pour tout le module.
 */
export function lireLigne(evf: string | null, tric: string | null, sens: string | null): EtatLigne {
  const cles = (evf ?? '').split(',').map((c) => c.trim()).filter((c) => c !== '');
  return {
    etat: cles.find((c) => CLES_ETATS.has(c)) ?? ETAT_PAR_DEFAUT,
    monga: cles.find((c) => CLES_MONGA.has(c)) ?? MONGA_PAR_DEFAUT,
    types: cles.filter((c) => c.startsWith('type:')),
    interrupteurs: cles.filter((c) => CLES_INTERRUPTEURS.has(c)),
    tri: TRIS_LIGNE.some((t) => t.cle === tric) ? tric : null,
    sens: sens === 'asc' ? 'asc' : 'desc',
  };
}

/**
 * Écrire l'état de la ligne en valeur de `&evf=`. `null` quand tout est au défaut : un défaut écrit dans
 * l'adresse n'est plus un défaut, et l'adresse nue de l'écran doit rester l'adresse nue de l'écran.
 */
export function ecrireLigne(e: EtatLigne): string | null {
  const cles = [
    ...(e.etat === ETAT_PAR_DEFAUT ? [] : [e.etat]),
    ...(e.monga === MONGA_PAR_DEFAUT ? [] : [e.monga]),
    ...e.types,
    ...e.interrupteurs,
  ];
  return cles.length === 0 ? null : cles.join(',');
}

/**
 * Basculer UNE clé, quel que soit son groupe. C'est le geste de TOUS les boutons de la ligne — et celui des
 * chiffres du tableau de bord, qui écrivent la même clé.
 *
 * 🔴 CHAQUE GROUPE A SA RÈGLE, ET ELLE EST ÉCRITE ICI UNE SEULE FOIS :
 *   · ÉTAT et MONGA sont EXCLUSIFS — choisir remplace, recliquer l'actif revient au défaut ;
 *   · les TYPES s'ajoutent et se retirent (union) ;
 *   · les INTERRUPTEURS s'allument et s'éteignent.
 */
export function basculer(e: EtatLigne, cle: string): EtatLigne {
  if (CLES_ETATS.has(cle)) return { ...e, etat: e.etat === cle ? ETAT_PAR_DEFAUT : cle };
  if (CLES_MONGA.has(cle)) return { ...e, monga: e.monga === cle ? MONGA_PAR_DEFAUT : cle };
  if (cle.startsWith('type:')) {
    return {
      ...e,
      types: e.types.includes(cle) ? e.types.filter((t) => t !== cle) : [...e.types, cle],
    };
  }
  if (CLES_INTERRUPTEURS.has(cle)) {
    return {
      ...e,
      interrupteurs: e.interrupteurs.includes(cle)
        ? e.interrupteurs.filter((i) => i !== cle)
        : [...e.interrupteurs, cle],
    };
  }
  /* ⚠️ UNE CLÉ INCONNUE NE FAIT RIEN, et surtout ne jette pas : le tableau de bord pourrait en nommer une que
     la ligne ne connaît pas encore (« reouverts », par exemple). Mieux vaut un bouton sans effet qu'un écran
     qui tombe. */
  return e;
}

/** Choisir un tri. Recliquer le tri actif INVERSE le sens (Arno) ; en choisir un autre repart en décroissant. */
export function choisirTri(e: EtatLigne, cle: string): EtatLigne {
  if (e.tri === cle) return { ...e, sens: e.sens === 'desc' ? 'asc' : 'desc' };
  return { ...e, tri: cle, sens: 'desc' };
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════
   APPLIQUER — des ensembles d'identifiants à la liste affichée
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Les événements retenus, dans l'ordre reçu. PUR.
 *
 * 🔴 LES ENSEMBLES VIENNENT DU TABLEAU DE BORD (`idsParFiltre`). Tant qu'ils ne sont pas arrivés (`null`), la
 * liste est ENTIÈRE : « je ne sais pas encore » n'est pas « rien ne correspond ». Afficher une liste vide
 * pendant la lecture ferait croire que le filtre n'a rien trouvé.
 *
 * ⚠️ UNE CLÉ QUE LES ENSEMBLES NE CONNAISSENT PAS NE RESTREINT RIEN, plutôt que de tout masquer : une adresse
 * d'hier ne doit pas rendre un écran vide et inexplicable.
 */
export function appliquerFiltres(
  cartes: readonly CarteEvenement[],
  e: EtatLigne,
  ids: Record<string, number[]> | null,
): CarteEvenement[] {
  if (ids === null) return [...cartes];
  const dans = (cle: string): Set<number> | null => {
    const l = ids[cle];
    return l === undefined ? null : new Set(l);
  };
  let out = [...cartes];
  /* ① L'ÉTAT — « tous » ne restreint rien ; les deux autres sont des ensembles du tableau de bord. */
  if (e.etat !== 'tous') {
    const s = dans(e.etat);
    if (s !== null) out = out.filter((c) => s.has(c.evenementId));
  }
  /* ② MONGA — même forme. */
  if (e.monga !== MONGA_PAR_DEFAUT) {
    const s = dans(e.monga);
    if (s !== null) out = out.filter((c) => s.has(c.evenementId));
  }
  /* ③ LES TYPES, EN UNION : un événement passe s'il appartient à AU MOINS un des types cochés. */
  if (e.types.length > 0) {
    const union = new Set<number>();
    let connu = false;
    for (const t of e.types) {
      const s = dans(t);
      if (s === null) continue;
      connu = true;
      for (const id of s) union.add(id);
    }
    if (connu) out = out.filter((c) => union.has(c.evenementId));
  }
  /* ④ LES INTERRUPTEURS, EN INTERSECTION : chacun restreint ce que les précédents ont laissé. */
  for (const i of e.interrupteurs) {
    const s = dans(i);
    if (s !== null) out = out.filter((c) => s.has(c.evenementId));
  }
  return out;
}

/**
 * Ranger la liste selon le tri de la ligne. `tri === null` ⇒ l'ordre reçu est conservé TEL QUEL — c'est celui
 * de « New » / « Urgent », qui continue de faire foi quand on ne demande rien d'autre. PUR.
 *
 * ⚠️ UNE DATE ABSENTE PASSE TOUJOURS EN DERNIER, dans les deux sens : un dossier sans dernier échange n'est ni
 * le plus récent ni le plus ancien, il est hors de la question posée. Le mettre à une extrémité en ferait une
 * réponse.
 */
export function trierLigne(cartes: readonly CarteEvenement[], e: EtatLigne): CarteEvenement[] {
  if (e.tri === null) return [...cartes];
  const signe = e.sens === 'desc' ? -1 : 1;
  const valeur = (c: CarteEvenement): number | null => {
    if (e.tri === 'ouverture') return Date.parse(c.ouvertLe);
    if (e.tri === 'echange') return c.dernierEchangeLe === null ? null : Date.parse(c.dernierEchangeLe);
    return c.urgence === null ? null : (RANG_URGENCE[c.urgence] ?? null);
  };
  return [...cartes].sort((a, b) => {
    const va = valeur(a);
    const vb = valeur(b);
    if (va === null && vb === null) return a.evenementId - b.evenementId;
    if (va === null) return 1;
    if (vb === null) return -1;
    if (va === vb) return a.evenementId - b.evenementId;
    return (va < vb ? -1 : 1) * signe;
  });
}

/**
 * Le compteur d'un bouton : combien d'événements cette clé désigne. `null` = on ne sait pas encore (les
 * ensembles ne sont pas arrivés), et le bouton s'affiche alors SANS nombre — jamais avec un zéro.
 */
export function compteDe(cle: string, ids: Record<string, number[]> | null): number | null {
  if (ids === null) return null;
  return ids[cle]?.length ?? null;
}
