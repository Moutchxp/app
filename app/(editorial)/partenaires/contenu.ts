import type { Partenaire } from "../gabarit";

/**
 * CONTENU de la page « Partenaires » — LE SEUL FICHIER À REMPLIR. Le nom de la page, l'introduction, et la LISTE des
 * partenaires. Rien de tout cela n'est de la mise en page : uniquement des données.
 */

/** Nom de la page (titre H1 + onglet). = l'entrée de menu. */
export const TITRE_PAGE = "Partenaires";

/** Texte d'introduction, au-dessus de la liste. Vide → « Contenu à venir » (jamais de faux texte). */
export const INTRO = "";

/**
 * LISTE des partenaires — VIDE au départ. Ajouter une entrée `{ nom, logo, description, lien }` SUFFIT à l'afficher :
 *  - `nom`         : nom du partenaire — sert AUSSI de texte alternatif du logo (obligatoire, jamais vide).
 *  - `logo`        : chemin d'une image placée sous `public/` (ex. `/images/partenaires/xxx.png`).
 *  - `description` : courte phrase de présentation.
 *  - `lien`        : URL du site du partenaire (https) — ouverte dans un nouvel onglet, en lien externe sûr.
 * Tant que le tableau est vide, la page affiche l'état vide « Aucun partenaire pour le moment. ».
 */
export const PARTENAIRES: Partenaire[] = [
  // { nom: "", logo: "/images/partenaires/…", description: "", lien: "https://…" },  ← décommenter et remplir
];
