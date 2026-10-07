/* 🔴🔴 LOT ANNUAIRE-BLOC-DEDIE, POINT 3 — « en gestion », écrit une seule fois (module PUR, lu aussi par la
   fiche propriétaire). */
import { compterBiensEnGestion } from './bienEnGestion';

/**
 * ══ 🔴🔴 LOT ACCUEIL-GESTION-ANNUAIRE, POINT 3 — LES SUGGESTIONS DE LA BARRE ANNUAIRE ════════════════════════════
 *
 * Module PUR : aucune I/O, aucun React, aucun `pg`. Il ne fait qu'une chose — transformer ce que la recherche de
 * l'annuaire REND (des personnes, chacune avec un ou deux rôles) en ce que la barre AFFICHE (une suggestion PAR
 * RÔLE, qui mène à la fiche de ce rôle-là).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * RÈGLE D'ARNO (07/10/2026) :
 *   · « Chaque suggestion montre le nom et son rôle : Locataire / Propriétaire (et l'adresse du bien pour
 *     distinguer les homonymes, SANS numéro de lot interne). »
 *   · « Clic sur un locataire → ouvre directement la fiche locataire. Clic sur un propriétaire → la fiche
 *     propriétaire. Utilise les fiches et les routes existantes. »
 *   · « Un contact à la fois locataire et propriétaire apparaît en deux suggestions (une par rôle). »
 *
 * 🔴 AUCUNE SECONDE RECHERCHE. Arno : « réutilise la recherche existante de l'annuaire, pas une seconde recherche
 * maison. » La barre interroge `/api/admin/gestion/annuaire?q=…`, c'est-à-dire `rechercherPersonnes` — la MÊME
 * fonction que l'écran Annuaire. Ce module ne cherche rien : il RANGE ce qu'elle a trouvé.
 *
 * 🔴 L'ENTRÉE EST DÉCRITE ICI, EN STRUCTURE, et non importée de `annuaireRepo` : ce module est lu par un écran
 * `'use client'`, et le dépôt interdit d'y faire entrer quoi que ce soit qui tire `pg` (incident du 24/09/2026,
 * consigné dans AGENTS.md). Le typage structurel de TypeScript fait le reste : `PersonneTrouvee` est acceptée
 * telle quelle, sans conversion ni copie.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Les rôles que la recherche de l'annuaire sait rendre. Il n'y en a pas d'autres — voir l'encadré du bas. */
export type RoleSuggere = 'proprietaire' | 'locataire' | 'ancien_locataire';

/** Ce que la recherche rend d'une personne, réduit à ce dont la barre a besoin. */
export interface PersonnePourSuggestion {
  /** La fiche PRINCIPALE de cette personne : c'est `id` qui la désigne. */
  sujet: 'proprietaire' | 'locataire';
  id: number;
  nomAffiche: string;
  /** Un rôle, ou deux quand la personne est à la fois propriétaire et locataire. */
  roles: readonly RoleSuggere[];
  /** La fiche SECONDAIRE, quand la personne en porte deux. `null` sinon. */
  autreFicheId: number | null;
  /**
   * 🔴🔴 LOT ANNUAIRE-BLOC-DEDIE, POINT 3 — `fin` VOYAGE AVEC CHAQUE BIEN : c'est elle qui dit s'il est encore en
   * gestion, et c'est la MÊME règle que la fiche propriétaire (`bienEnGestion`).
   */
  biens: readonly { adresse: string | null; commune: string | null; fin: string | null }[];
}

export interface SuggestionAnnuaire {
  /** Clé d'affichage, unique : une même personne peut paraître deux fois, une par rôle. */
  cle: string;
  nom: string;
  role: RoleSuggere;
  /** Le MOT du rôle, tel qu'il s'affiche. */
  mot: string;
  /** « 67 rue de Normandie, COURBEVOIE » — SANS numéro de lot (Arno). `null` quand on n'en connaît aucune. */
  lieu: string | null;
  /**
   * ══ 🔴🔴 LOT ANNUAIRE-MENTION-PARENTHESES — « (Propriétaire de X biens au total) » ═══════════════════════════
   *
   * Arno : « si ce propriétaire a d'autres biens en gestion chez nous, on ajoute après l'adresse le nombre total.
   * X = nombre TOTAL de biens en gestion (bien affiché compris). Mention seulement si X ≥ 2 ; rien si X = 1. »
   *
   * ⚠️ LE LIBELLÉ A CHANGÉ (07/10/2026), ET LUI SEUL : « + Propriétaire de X biens au total » est devenu
   * « (Propriétaire de X biens au total) » — sans le « + », entre parenthèses. La règle d'apparition, le calcul
   * et le style discret ne bougent pas.
   *
   * 🔴 `null` DANS TOUS LES AUTRES CAS : un seul bien, aucun bien, ou un rôle de LOCATAIRE. Compter les biens
   * « en gestion » d'un locataire n'aurait pas de sens — ce ne sont pas les siens.
   */
  mention: string | null;
  /** La fiche qu'un clic ouvre. C'est celle DU RÔLE de la suggestion, jamais « la principale ». */
  fiche: { sorte: 'proprietaire' | 'locataire'; id: number };
}

/** Le mot d'un rôle, tel qu'il s'affiche. Écrit une seule fois : la liste et le lecteur d'écran le partagent. */
export function motRoleSuggere(r: RoleSuggere): string {
  if (r === 'proprietaire') return 'Propriétaire';
  if (r === 'locataire') return 'Locataire';
  return 'Ancien locataire';
}

/**
 * 🔴 L'ADRESSE, SANS LE NUMÉRO DE LOT. Arno, point 3 : « l'adresse du bien pour distinguer les homonymes, SANS
 * numéro de lot interne ». Même décision que le lot CARTE-EVENEMENT-EPUREE, et pour la même raison : le lot est
 * un identifiant de logiciel, pas un repère pour l'œil.
 *
 * ⚠️ LE PREMIER BIEN SEULEMENT : une suggestion est une ligne. Qui en a plusieurs les voit sur sa fiche.
 */
function lieuDe(p: PersonnePourSuggestion): string | null {
  const b = p.biens[0];
  if (b === undefined) return null;
  const lieu = [b.adresse, b.commune].filter((x) => x !== null && x !== '').join(', ');
  return lieu === '' ? null : lieu;
}

/**
 * 🔴 QUELLE FICHE OUVRE CE RÔLE-LÀ. La personne porte au plus deux fiches : la principale (`sujet` / `id`) et la
 * secondaire (`autreFicheId`). Le rôle dit laquelle des deux il faut, et `sujet` dit laquelle est laquelle.
 *
 * ⚠️ « ancien_locataire » EST UNE FICHE LOCATAIRE, comme « locataire » : c'est la même personne, le même écran,
 * et seule sa période d'occupation diffère. Lui inventer une troisième sorte de fiche n'ouvrirait rien.
 *
 * ⚠️ `null` = CETTE FICHE N'EXISTE PAS. On n'affiche alors pas la suggestion plutôt que de proposer un lien mort :
 * le cas n'arrive que si la recherche annonce un rôle sans la fiche qui va avec.
 */
function ficheDuRole(p: PersonnePourSuggestion, role: RoleSuggere): SuggestionAnnuaire['fiche'] | null {
  const sorte = role === 'proprietaire' ? 'proprietaire' : 'locataire';
  const id = p.sujet === sorte ? p.id : p.autreFicheId;
  return id === null ? null : { sorte, id };
}

/**
 * LES SUGGESTIONS, UNE PAR RÔLE. L'ordre des personnes est celui de la recherche — c'est elle qui sait classer
 * ses résultats — et, à l'intérieur d'une personne, l'ordre de ses rôles.
 */
export function suggestionsAnnuaire(
  personnes: readonly PersonnePourSuggestion[],
): SuggestionAnnuaire[] {
  return personnes.flatMap((p) => p.roles.flatMap((role): SuggestionAnnuaire[] => {
    const fiche = ficheDuRole(p, role);
    if (fiche === null) return [];
    return [{
      cle: `${role}-${fiche.sorte}-${fiche.id}`,
      nom: p.nomAffiche,
      role,
      mot: motRoleSuggere(role),
      lieu: lieuDe(p),
      mention: mentionBiens(p, role),
      fiche,
    }];
  }));
}

/**
 * ══ 🔴🔴 LOT ANNUAIRE-BLOC-DEDIE, POINT 3 — LA MENTION DES AUTRES BIENS ═════════════════════════════════════════
 *
 * Arno, mot pour mot (lot ANNUAIRE-MENTION-PARENTHESES) : « (Propriétaire de X biens au total) », X ≥ 2 seulement.
 * Elle se lit à la suite de l'adresse — « 25 rue Edith Cavell, COURBEVOIE (Propriétaire de 5 biens au total) » —,
 * et les parenthèses sont ce qui la rattache à elle plutôt que d'en faire une seconde information.
 *
 * ⚠️ ELLE S'EST ÉCRITE « + Propriétaire de X biens au total » jusqu'au 07/10/2026. Seul le libellé a changé : la
 * règle d'apparition et le calcul sont ceux du lot ANNUAIRE-BLOC-DEDIE, au mot près.
 *
 * 🔴 X COMPTE LES BIENS **EN GESTION**, et la règle n'est pas écrite ici : c'est `compterBiensEnGestion`, la même
 * que la fiche propriétaire emploie pour séparer ses cartes « en gestion » de ses « anciens ». Un bien sorti de
 * gestion — vendu, mandat perdu — n'est donc pas compté.
 *
 * ⚠️ UNE SEULE SUGGESTION PAR PROPRIÉTAIRE, ET C'EST DÉJÀ LE CAS : la recherche rend UNE personne par fiche, avec
 * TOUS ses biens dans `biens` — jamais une ligne par bien. Le regroupement qu'Arno demande n'est donc pas à faire,
 * il est à NE PAS DÉFAIRE : c'est pourquoi ce calcul lit la liste entière plutôt que de produire une ligne par
 * bien, et une épreuve le tient.
 *
 * ⚠️ RIEN POUR UN LOCATAIRE : ses « biens » sont ceux qu'il occupe, pas les siens.
 */
function mentionBiens(p: PersonnePourSuggestion, role: RoleSuggere): string | null {
  if (role !== 'proprietaire') return null;
  const n = compterBiensEnGestion(p.biens);
  return n >= 2 ? `(Propriétaire de ${n} biens au total)` : null;
}

/**
 * ══ 🔴🔴 LOT PARTIES-HAUTEUR-ANNUAIRE-ROLES, POINT 2 — LES RÔLES SONT MÊLÉS, ET C'EST LA PERTINENCE QUI RANGE ═════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CONSTAT D'ARNO (07/10/2026) : en tapant « jo », tous les propriétaires sortent d'abord et les locataires
 * n'apparaissent qu'en bas, à moitié coupés. « Arno croit qu'il n'y a que des propriétaires. »
 *
 * 🔴 LA CAUSE : l'ordre était celui de la RECHERCHE, qui rend ses propriétaires puis ses locataires — deux
 * requêtes, concaténées. Ce n'était pas un classement, c'était l'ordre d'arrivée, et il dit « rôle » là où l'on
 * cherche un NOM.
 *
 * 🔴 RÈGLE D'ARNO : « classe par PERTINENCE du nom, quel que soit le rôle : correspondance en début de nom ou de
 * mot d'abord, puis ailleurs dans le nom, puis par ordre alphabétique ».
 *
 * TROIS RANGS, DANS CET ORDRE :
 *   ① le nom COMMENCE par ce qu'on tape — « JOREL » pour « jo » ;
 *   ② un MOT du nom commence par ce qu'on tape — « ALEJO FERNANDEZ Paula » pour « fer », « M. JOLY » pour « jo » ;
 *   ③ ce qu'on tape est AILLEURS dans le nom — « ALEJO » pour « jo ».
 *   ④ et le nom ne répond pas du tout : la personne a été trouvée par son adresse, son téléphone ou son e-mail.
 *      Elle reste dans la liste — la recherche l'a trouvée pour une bonne raison — mais après celles dont le nom
 *      parle, parce que c'est un nom qu'on tape.
 *
 * ⚠️ À RANG ÉGAL, L'ORDRE ALPHABÉTIQUE, et il est STABLE : `localeCompare` en français, puis la clé en secours.
 * Deux personnes du même nom ne doivent pas changer de place d'une frappe à l'autre.
 *
 * ⚠️ ON COMPARE SANS ACCENTS NI CASSE : « éric » trouve « ERIC », et « JOREL » répond à « jo » comme à « JO ».
 */
function sansAccent(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/**
 * LE RANG D'UNE SUGGESTION POUR CE QU'ON TAPE. Plus petit = plus haut dans la liste. PUR.
 *
 * ⚠️ LES MOTS SONT DÉCOUPÉS SUR TOUT CE QUI N'EST PAS UNE LETTRE OU UN CHIFFRE : « JULLIEN - GARRIDO » a bien
 * deux mots, et « M. ROI » en a un qui commence par « roi » — sans quoi un nom précédé de sa civilité ne serait
 * jamais en tête.
 */
export function rangPertinence(nom: string, terme: string): number {
  const t = sansAccent(terme.trim());
  if (t === '') return 3;
  const n = sansAccent(nom);
  if (n.startsWith(t)) return 0;
  if (n.split(/[^\p{L}\p{N}]+/u).some((mot) => mot !== '' && mot.startsWith(t))) return 1;
  return n.includes(t) ? 2 : 3;
}

/**
 * CLASSE LES SUGGESTIONS PAR PERTINENCE DU NOM, TOUS RÔLES MÊLÉS. PUR.
 *
 * ⚠️ IL NE FILTRE RIEN : tout ce que la recherche a trouvé reste affiché, y compris les personnes trouvées par
 * une coordonnée. Classer n'est pas écarter — une suggestion retirée serait une personne introuvable.
 */
export function classerSuggestions(
  suggestions: readonly SuggestionAnnuaire[], terme: string,
): SuggestionAnnuaire[] {
  return [...suggestions].sort((a, b) => {
    const ra = rangPertinence(a.nom, terme);
    const rb = rangPertinence(b.nom, terme);
    if (ra !== rb) return ra - rb;
    const parNom = a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' });
    return parNom !== 0 ? parNom : a.cle.localeCompare(b.cle);
  });
}

/**
 * ══ 🔴 LE DÉPLACEMENT DU CURSEUR DANS LA LISTE ═══════════════════════════════════════════════════════════════════
 *
 * Arno : « Clavier : flèches haut/bas, Entrée, Échap. » Écrit ici, et non dans l'écran, parce que c'est la seule
 * partie du clavier qui se trompe facilement — et la seule qui s'éprouve sans monter quoi que ce soit.
 *
 * 🔴 IL BOUCLE AUX DEUX BOUTS : descendre depuis la dernière revient à la première, monter depuis la première va à
 * la dernière. C'est ce que fait toute liste de suggestions, et l'inverse — rester bloqué — fait croire que la
 * touche ne répond plus.
 *
 * ⚠️ `-1` = AUCUNE SÉLECTION (on vient de taper) : « descendre » prend alors la PREMIÈRE, « monter » la DERNIÈRE.
 * ⚠️ UNE LISTE VIDE NE SÉLECTIONNE RIEN : on rend `-1`, jamais un rang qui n'existe pas.
 */
export function rangSuivant(rang: number, nombre: number, sens: 'bas' | 'haut'): number {
  if (nombre <= 0) return -1;
  if (rang < 0) return sens === 'bas' ? 0 : nombre - 1;
  return sens === 'bas' ? (rang + 1) % nombre : (rang - 1 + nombre) % nombre;
}
