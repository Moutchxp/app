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
  biens: readonly { adresse: string | null; commune: string | null }[];
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
      fiche,
    }];
  }));
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
