/**
 * MODULE « GESTION » — LOT 5-PJ-D : LA VUE D'OUVERTURE DU SÉLECTEUR, « comme Ajouter à Drive dans Gmail ».
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CE QU'ARNO A DEMANDÉ, LE 25/09/2026 : « exactement le même fonctionnement que dans Gmail ». À l'ouverture, on ne
 * jette plus la personne à la racine d'un Drive de ~15 000 dossiers : on lui propose les DERNIERS DOSSIERS OÙ L'ON A
 * DÉPOSÉ, et un lien pour aller parcourir tout le reste. Dans la vraie vie, les pièces d'un même propriétaire
 * retournent presque toujours au même endroit.
 *
 * 🔴 LA LISTE EST DÉRIVÉE DE LA MÉMOIRE DES DÉPÔTS (lot 5-PJ-B), JAMAIS TENUE À LA MAIN. Aucune colonne « dossiers
 * favoris » à entretenir, donc aucune à laisser mentir : un dossier est récent parce qu'un dépôt y a RÉUSSI, point.
 *
 * 🔴 CHAQUE LIGNE EST VÉRIFIÉE AVEC LE JETON DE LA PERSONNE QUI REGARDE (délégation, lot 5-PJ-C2). La mémoire des
 * dépôts est commune à tous les collaborateurs ; les DROITS, eux, ne le sont pas. Un dossier qu'un collègue a alimenté
 * mais auquel je n'ai pas accès ne doit pas m'apparaître — pas même son NOM, qui trahirait déjà le nom d'un
 * propriétaire. Un dossier inaccessible, supprimé, mis à la corbeille ou remplacé par un fichier est donc OMIS, et
 * l'on prend le suivant.
 *
 * 🔴 L'OUVERTURE DOIT RESTER RAPIDE. Deux bornes, et elles sont dures : un NOMBRE MAXIMAL D'APPELS à Google et un
 * DÉLAI. Passé l'un ou l'autre, on rend ce qu'on a vérifié — jamais une ligne non vérifiée, jamais une attente sans
 * fin. Les vérifications partent par paquets, en parallèle, et les lectures sont mémorisées (`memoiserLecture`) :
 * six dossiers d'un même Drive partagent presque toujours leurs ancêtres.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * MODULE PUR : aucune base, aucun réseau, tout est injecté (`LecteurDossier`). Il s'éprouve donc entièrement hors
 * ligne, y compris les cas qui comptent — l'inaccessible, le supprimé, le budget épuisé.
 */
import { MIME_DOSSIER, type DossierDetail, type LecteurDossier } from './drive';

/** Combien de dossiers récents la vue d'ouverture propose, quand la base ne dit rien (migration 248 non appliquée). */
export const RECENTS_DEFAUT = 6;
/** Bornes du réglage. En dessous de 1 la liste n'existe plus ; au-delà de 20 ce n'est plus un raccourci, c'est un annuaire. */
export const RECENTS_MIN = 1;
export const RECENTS_MAX = 20;

/** Profondeur du CHEMIN affiché sous le nom. Au-delà, la ligne devient illisible sur un téléphone : on préfixe « … ». */
export const CHEMIN_NIVEAUX = 3;

/** Plafond d'appels à Google pour construire TOUTE la vue d'ouverture. Vérifications et chemins compris. */
export const APPELS_MAX = 40;
/** Délai au-delà duquel on cesse d'enrichir la vue : mieux vaut quatre lignes tout de suite que six dans cinq secondes. */
export const DELAI_MAX_MS = 3000;

/** Ramène le réglage dans ses bornes. Absent, nul ou aberrant ⇒ le défaut. PUR. */
export function nombreRecentsValide(brut: number | null | undefined): number {
  if (typeof brut !== 'number' || !Number.isFinite(brut) || brut <= 0) return RECENTS_DEFAUT;
  return Math.min(Math.max(Math.round(brut), RECENTS_MIN), RECENTS_MAX);
}

/** Un dossier tel que la MÉMOIRE DES DÉPÔTS le connaît — avant toute vérification des droits. */
export interface CandidatRecent {
  id: string;
  /** Le nom AU MOMENT DU DÉPÔT. Il ne sert qu'à défaut : c'est le nom rendu par Google qui s'affiche. */
  nom: string | null;
  driveId: string | null;
  /** Date du dernier dépôt réussi dans ce dossier (ISO). */
  dernierDepot: string;
}

/** Un dossier récent RETENU : vérifié, accessible, avec son chemin lisible. C'est ce que l'écran affiche. */
export interface DossierRecent {
  id: string;
  nom: string;
  driveId: string | null;
  /** « GESTION LOCATIVE › 1 actifs › Dupont » — vide si Google n'a pas pu le dire dans le budget imparti. */
  chemin: string;
  dernierDepot: string;
}

/**
 * LE BUDGET, partagé par tout ce qui compose la vue d'ouverture. Mutable exprès : le dernier dossier de l'échange et
 * les dossiers récents se vérifient EN MÊME TEMPS, et doivent puiser dans la même enveloppe — deux budgets séparés
 * autoriseraient le double des appels sans que personne ne l'ait décidé.
 */
export interface BudgetRecents {
  appels: number;
  appelsMax: number;
  /** Instant (ms) au-delà duquel on n'entreprend plus rien de nouveau. */
  expireA: number;
}

export function nouveauBudget(
  maintenant: number, o: { appelsMax?: number; delaiMs?: number } = {},
): BudgetRecents {
  return {
    appels: 0,
    appelsMax: o.appelsMax ?? APPELS_MAX,
    expireA: maintenant + (o.delaiMs ?? DELAI_MAX_MS),
  };
}

/** Reste-t-il de quoi poser une question de plus ? PUR. */
function budgetOuvert(b: BudgetRecents, maintenant: number): boolean {
  return b.appels < b.appelsMax && maintenant < b.expireA;
}

export interface DepsRecents {
  lire: LecteurDossier;
  /**
   * LE NOM D'UN DRIVE PARTAGÉ, par son identifiant.
   *
   * 🔴 MESURÉ le 25/09/2026 contre le Drive réel : `files.get` sur la racine d'un Drive partagé rend le nom générique
   * « Drive » — le MÊME mot pour les dix Drive visibles — et NON leur nom. Un chemin qui commence par « Drive › … »
   * perd exactement l'information pour laquelle on affiche un chemin. `drives.list`, lui, donne le vrai nom : c'est
   * lui qu'on substitue à la racine. Absente, on garde ce que Google dit — jamais un nom inventé.
   */
  nomDuDrive?: (driveId: string) => Promise<string | null>;
  /** Injectée pour éprouver le délai sans attendre trois secondes. */
  maintenant?: () => number;
}

/**
 * LES DOSSIERS RÉCENTS RÉELLEMENT PROPOSABLES, dans l'ordre des candidats (le plus récent d'abord).
 *
 * `exclure` sert au dédoublonnage avec la ligne de tête (« dernier dossier utilisé pour cet échange ») : le même
 * dossier deux fois de suite, une fois sous chaque titre, ferait douter qu'il s'agisse du même.
 */
export async function dossiersRecentsAccessibles(
  candidats: readonly CandidatRecent[],
  deps: DepsRecents,
  o: { max?: number; exclure?: string | null; budget?: BudgetRecents; profondeur?: number } = {},
): Promise<DossierRecent[]> {
  const horloge = deps.maintenant ?? Date.now;
  const max = nombreRecentsValide(o.max);
  const budget = o.budget ?? nouveauBudget(horloge());
  const profondeur = o.profondeur ?? CHEMIN_NIVEAUX;

  // Dédoublonnage AVANT toute question à Google : on ne paie pas un appel pour une ligne qu'on n'afficherait pas.
  const vus = new Set<string>();
  if (o.exclure) vus.add(o.exclure);
  const restants = candidats.filter((c) => {
    if (c.id === '' || vus.has(c.id)) return false;
    vus.add(c.id);
    return true;
  });

  const retenus: DossierRecent[] = [];
  let i = 0;
  while (retenus.length < max && i < restants.length && budgetOuvert(budget, horloge())) {
    // Un PAQUET à la fois, de la taille de ce qu'il manque : si les six premiers passent, on n'en vérifie pas douze.
    const paquet = restants.slice(i, i + (max - retenus.length));
    i += paquet.length;
    const verdicts = await Promise.all(
      paquet.map((c) => examiner(c, deps, budget, horloge, profondeur)),
    );
    // On repousse DANS L'ORDRE du paquet : les vérifications sont parallèles, l'affichage reste chronologique.
    for (const v of verdicts) if (v !== null) retenus.push(v);
  }
  return retenus.slice(0, max);
}

/**
 * UN candidat, vérifié. `null` = à ne pas montrer, et c'est le cas qui compte : inaccessible (Google refuse ou ne
 * connaît pas), à la corbeille, ou ce n'est plus un dossier. Aucun de ces cas ne doit laisser filtrer un NOM.
 */
async function examiner(
  c: CandidatRecent, deps: DepsRecents, budget: BudgetRecents, horloge: () => number, profondeur: number,
): Promise<DossierRecent | null> {
  if (!budgetOuvert(budget, horloge())) return null;
  budget.appels += 1;
  const d = await deps.lire(c.id);
  if (!d.ok) return null;                                   // 403 / 404 : on n'en dit RIEN, on prend le suivant
  if (d.valeur.corbeille) return null;                      // la corbeille répond 200 : il faut le demander pour le voir
  if (d.valeur.mimeType !== MIME_DOSSIER) return null;       // remplacé par un fichier : ce n'est plus une destination

  return {
    id: c.id,
    nom: d.valeur.nom,
    driveId: d.valeur.driveId ?? c.driveId,
    chemin: await cheminLisible(d.valeur, deps, budget, horloge, profondeur),
    dernierDepot: c.dernierDepot,
  };
}

/**
 * LE CHEMIN, remonté de parent en parent, BORNÉ EN PROFONDEUR. « Documents » ne dit rien dans un Drive qui en compte
 * vingt ; « GESTION LOCATIVE › 1 actifs › Dupont » dit tout.
 *
 * AU MIEUX-EFFORT, et c'est délibéré : un chemin qu'on n'a pas pu lire (budget épuisé, ancêtre refusé) rend une
 * chaîne VIDE, et la ligne s'affiche avec son seul nom. Renoncer à la ligne parce que son chemin manque serait
 * cacher un dossier parfaitement accessible.
 */
async function cheminLisible(
  d: DossierDetail, deps: DepsRecents, budget: BudgetRecents, horloge: () => number, profondeur: number,
): Promise<string> {
  /** Chaque étape, avec ce qu'il faut pour renommer la racine : son identifiant, et si elle EST la racine. */
  const etapes: { nom: string; racine: boolean }[] = [];
  const vus = new Set<string>([d.id]);
  let courant = d.parents[0] ?? null;
  let tronque = false;
  for (let n = 0; courant !== null; n += 1) {
    if (n >= profondeur) { tronque = true; break; }
    if (vus.has(courant) || !budgetOuvert(budget, horloge())) break;
    vus.add(courant);
    budget.appels += 1;
    const p: Awaited<ReturnType<LecteurDossier>> = await deps.lire(courant);
    if (!p.ok) break;
    const suivant = p.valeur.parents[0] ?? null;
    etapes.push({ nom: p.valeur.nom, racine: suivant === null });
    courant = suivant;
  }
  if (etapes.length === 0) return '';
  etapes.reverse();

  // LA RACINE, RENOMMÉE. Mesuré : Google appelle « Drive » la racine de N'IMPORTE quel Drive partagé, et « My Drive »
  //   (en anglais) celle du Mon Drive. Aucun des deux ne dit OÙ l'on est — et c'est toute la raison d'afficher un chemin.
  const tete = etapes[0];
  if (tete.racine && !tronque) {
    if (d.driveId !== null && deps.nomDuDrive !== undefined) {
      const vrai = await deps.nomDuDrive(d.driveId);
      if (vrai !== null && vrai !== '') tete.nom = vrai;
    } else if (d.driveId === null) {
      tete.nom = 'Mon Drive';
    }
  }

  const chemin = etapes.map((e) => e.nom).join(' › ');
  return tronque ? `… › ${chemin}` : chemin;
}
