/**
 * Logique PURE de la bulle d'information « bâtiment » (carte de curation) : année de construction
 * ET nombre d'étages. Anciennement `bulleAnnee.ts` — renommé quand la bulle est passée à deux données.
 *
 * ISOLATION (invariant SVAV) : aucune dépendance Leaflet, DOM, réseau ni moteur (`app/lib/svv/**`).
 * Uniquement des fonctions déterministes → testables unitairement (comme `curationEdition.ts`).
 *
 * Les deux valeurs proviennent de `bdtopo_batiment` (année via LEFT JOIN `bdnb_annee_batiment`,
 * étages = colonne `nombre_d_etages` de la même table — aucune jointure), exposées par la route
 * emprises. C'est une AIDE UI en LECTURE SEULE : elle n'entre dans AUCUN calcul de verdict ni de
 * score. Couverture partielle → chaque absence DOIT être affichée explicitement, jamais par un vide.
 *
 * ⚠️ `0` étage est une VRAIE valeur (≠ `null`) : elle s'affiche « 0 étage » telle quelle. Ne JAMAIS
 * la traiter comme « non renseignée » (aucun test falsy `!etages` / `etages ? … : …` — un `0` serait
 * avalé). Distinction VALEUR (nombre fini, y compris 0) vs ABSENCE (`null`/`undefined`).
 */

/** Ligne « année » : année connue → « Construit en 1954 » ; sinon message explicite (jamais un vide). */
export function libelleAnnee(annee: number | null | undefined): string {
  if (typeof annee === 'number' && Number.isFinite(annee)) {
    // BDNB : millésime entier. Affiché brut, sans arrondi ni séparateur de milliers.
    return `Construit en ${annee}`;
  }
  return 'Année de construction non renseignée';
}

/**
 * Ligne « étages » : nombre connu (Y COMPRIS 0) → « N étage(s) » ; sinon message explicite. Le test
 * est `typeof number` (PAS falsy) → `0` est une valeur affichée « 0 étage », jamais « non renseigné ».
 * Pluriel : singulier pour |n| < 2 (« 0 étage », « 1 étage »), pluriel au-delà (« 2 étages »).
 */
export function libelleEtages(etages: number | null | undefined): string {
  if (typeof etages === 'number' && Number.isFinite(etages)) {
    return `${etages} étage${Math.abs(etages) < 2 ? '' : 's'}`;
  }
  return 'Nombre d’étages non renseigné';
}

/**
 * PARC-2 — FORMULATION du rattachement des dossiers à la PARCELLE (jamais au bâtiment). Un permis appartient à une PARCELLE :
 * la bulle dit « la parcelle de ce bâtiment est citée par N dossier(s) », JAMAIS « ce bâtiment a un permis ». L'ABSENCE se dit
 * « aucun dossier rattaché à cette parcelle » — JAMAIS « aucun permis » : 8 030 dossiers en commune couverte n'ont pas pu être
 * rattachés (écart cadastral), la base NE PROUVE PAS l'absence. `dossiers`/`demolir` viennent du compteur agrégé de la route
 * `/emprises` (nombres ≥ 0), ou `null`/`undefined` quand la parcelle du bâtiment n'est pas dans le cadastre chargé (75/78/92/93
 * seulement — 94/77 absents). Ce dernier cas ne dit RIEN de l'existence de dossiers (indéterminé), jamais une absence.
 */
export function libelleDossiersParcelle(
  dossiers: number | null | undefined,
  demolir: number | null | undefined,
): string {
  if (typeof dossiers !== 'number' || !Number.isFinite(dossiers)) {
    return 'Parcelle non chargée ici — rattachement des dossiers indisponible';
  }
  if (dossiers <= 0) return 'Aucun dossier rattaché à cette parcelle';
  const pd = typeof demolir === 'number' && Number.isFinite(demolir) && demolir > 0
    ? ` (dont ${demolir} permis de démolir)`
    : '';
  return `La parcelle de ce bâtiment est citée par ${dossiers} dossier${dossiers > 1 ? 's' : ''}${pd}`;
}

/**
 * PARC-2 — un bâtiment est rattaché à la parcelle sous son POINT INTÉRIEUR (`ST_PointOnSurface`) ; or une parcelle peut porter
 * PLUSIEURS bâtiments, et le dossier cite la PARCELLE, pas un bâtiment précis. Quand c'est le cas, la bulle DOIT le dire (`≥ 2`).
 * `null`/`< 2` → aucune mise en garde (parcelle mono-bâtiment ou inconnue).
 */
export function libelleParcellePartagee(nbBatiments: number | null | undefined): string | null {
  if (typeof nbBatiments === 'number' && Number.isFinite(nbBatiments) && nbBatiments >= 2) {
    return `Parcelle partagée par ${nbBatiments} bâtiments — le dossier ne désigne pas lequel est concerné`;
  }
  return null;
}

/** Type de dossier Sitadel (liste FERMÉE, CHECK migration 047) → libellé vérifié. Toute autre valeur → « Type inconnu » (jamais fabriqué). */
export function libelleTypeDossier(type: string | null | undefined): string {
  if (type === 'PC') return 'Permis de construire';
  if (type === 'PD') return 'Permis de démolir';
  return 'Type inconnu';
}

/**
 * État d'avancement `etat_dau` (liste FERMÉE du dictionnaire SDES, cf. migration 060) → libellé vérifié. C'est un code sûr
 * (2/4/5/6), PAS la `nature_projet` (codes 1..6 sans libellé vérifié, INTERDITE d'affichage — cf. PARC-2). Autre/null → « État non précisé ».
 */
export function libelleEtatDau(code: string | null | undefined): string {
  switch (code) {
    case '2': return 'Autorisé';
    case '4': return 'Annulé';
    case '5': return 'Commencé';
    case '6': return 'Terminé';
    default: return 'État non précisé';
  }
}

/** Échappement HTML des valeurs injectées (num_dau Sitadel, nom de fichier uploadé) — aucune surface d'injection dans la bulle. */
function echapperHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'));
}

/** Un dossier de la parcelle, tel que renvoyé par la route de détail (PARC-2). `gedPieces` = pièces GED RÉELLES (jamais la fiche générée). */
export interface DossierParcelle {
  numDau: string;
  type: string | null;
  dateAutorisation: string | null;
  etat: string | null;
  gedPieces: { id: number; nom: string }[];
}

/**
 * Contenu HTML de la bulle Leaflet (popup) : année, étages, PUIS la ligne de rattachement à la parcelle (PARC-2). Chaque ligne
 * gère sa propre absence. `role="status"` → annoncé aux lecteurs d'écran. Seules variables injectées : des entiers (année,
 * étages, compteurs) → aucune surface d'injection. Aucun jargon de source dans la bulle.
 */
export function contenuBulleBatiment(
  annee: number | null | undefined,
  etages: number | null | undefined,
  dossiers?: number | null,
  demolir?: number | null,
): string {
  return (
    `<span class="svv-cur-bulle" role="status">` +
    `<span class="svv-cur-bulle-l">${libelleAnnee(annee)}</span>` +
    `<span class="svv-cur-bulle-l">${libelleEtages(etages)}</span>` +
    `<span class="svv-cur-bulle-l svv-cur-bulle-parc">${libelleDossiersParcelle(dossiers, demolir)}</span>` +
    `</span>`
  );
}

/**
 * Bloc de DÉTAIL injecté dans la bulle au CLIC (« à l'ouverture seulement », PARC-2) : mise en garde « parcelle partagée » si
 * besoin, puis la liste des dossiers (type vérifié + num_dau + date + état vérifié + raccourci GED UNIQUEMENT si pièces réelles).
 * N'AFFICHE JAMAIS la nature (codes nus). Le raccourci GED porte `data-piece-id` (le clic est câblé par la carte via url_piece).
 * Liste vide → répète l'absence rattachée à la PARCELLE (jamais « aucun permis »).
 */
export function htmlDetailDossiers(dossiers: DossierParcelle[], nbBatiments: number | null | undefined): string {
  const caveat = libelleParcellePartagee(nbBatiments);
  const entete = caveat ? `<span class="svv-cur-bulle-caveat">${caveat}</span>` : '';
  if (dossiers.length === 0) {
    return `<span class="svv-cur-bulle-detail">${entete}<span class="svv-cur-bulle-vide">Aucun dossier rattaché à cette parcelle</span></span>`;
  }
  const lignes = dossiers
    .map((d) => {
      const date = d.dateAutorisation ? echapperHtml(d.dateAutorisation) : 'date inconnue';
      const ged = d.gedPieces
        .map(
          (p) =>
            `<button type="button" class="svv-cur-ged" data-piece-id="${p.id}" title="Ouvrir la pièce « ${echapperHtml(p.nom)} » (GED)">` +
            `<span aria-hidden="true">📎</span> GED</button>`,
        )
        .join('');
      return (
        `<span class="svv-cur-dossier">` +
        `<span class="svv-cur-dossier-t">${echapperHtml(libelleTypeDossier(d.type))} ${echapperHtml(d.numDau)}</span>` +
        `<span class="svv-cur-dossier-m">${date} · ${echapperHtml(libelleEtatDau(d.etat))}${ged ? ' · ' : ''}${ged}</span>` +
        `</span>`
      );
    })
    .join('');
  return `<span class="svv-cur-bulle-detail">${entete}<span class="svv-cur-dossiers-liste">${lignes}</span></span>`;
}

/**
 * Règle de résolution du conflit d'interaction sur la couche de fond : le double-clic crée un tag
 * UNIQUEMENT quand le mode bulle est INACTIF. Mode bulle actif → la création par double-clic est
 * SUSPENDUE (le geste sert alors la lecture). Le rattachement (couche bleue, pane au-dessus) garde sa
 * priorité indépendamment de ce drapeau. (Règle ACQUISE au lot précédent, inchangée ici.)
 */
export function doitCreerAuDoubleClic(modeBulle: boolean): boolean {
  return !modeBulle;
}
