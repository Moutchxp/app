/**
 * FRAÎCHEUR / F5 « Protocoles » — lecture PURE de `docs/PROTOCOLES_REINGESTION.md` pour l'écran /admin/sources.
 *
 * Le fichier .md est la SOURCE DE VÉRITÉ (lisible seul, versionné). Ici on ne fait que le PARSER : un marqueur explicite
 * `<!-- SOURCE: <cle> -->` ouvre chaque section, un titre `## …` la nomme, et le corps alterne prose et blocs de commande
 * (clôturés par des barrières ``` ). L'écran affiche ; il n'EXÉCUTE JAMAIS. Deux sentinelles DISTINCTES : fichier absent
 * (« protocole non documenté ») vs section manquante pour une source attendue — jamais confondues avec un protocole vide.
 */

/** Élément affichable d'une section : un paragraphe de prose, ou un bloc de commande à copier. */
export type ElementProtocole =
  | { type: 'prose'; texte: string }
  | { type: 'commande'; commande: string };

/** Section présente dans le fichier. */
export interface SectionProtocole {
  present: true;
  cle: string;
  titre: string;
  elements: ElementProtocole[];
}

/** Section ATTENDUE mais absente du fichier (sentinelle par source, distincte du fichier absent). */
export interface SectionManquante {
  present: false;
  cle: string;
  nom: string;
}

/** Résultat affichable complet. `fichierAbsent` = sentinelle GLOBALE (le .md n'a pas pu être lu). */
export interface AffichageProtocoles {
  fichierAbsent: boolean;
  intro: string;
  sections: (SectionProtocole | SectionManquante)[];
}

/**
 * Ordre d'affichage des sources, du PLUS SÛR au PLUS RISQUÉ (cf. note d'ouverture du .md) : (a) idempotent/non destructif,
 * puis (a) destructif, puis (b), puis (c). `nom` sert de repli pour la sentinelle « section manquante ».
 */
export const ORDRE_PROTOCOLES: readonly { cle: string; nom: string }[] = [
  { cle: 'cadastre', nom: 'Cadastre' },
  { cle: 'prada', nom: 'PRADA' },
  { cle: 'sitadel', nom: 'Sitadel' },
  { cle: 'dila', nom: 'DILA' },
  { cle: 'bdtopo_bati', nom: 'BD TOPO bâtiment' },
  { cle: 'patrimoine', nom: 'Patrimoine / monuments' },
  { cle: 'bdtopo_paysage', nom: 'BD TOPO paysage' },
  { cle: 'bdtopo_adresse', nom: 'BD TOPO adresse / BAN' },
  { cle: 'lidar', nom: 'LiDAR HD' },
  { cle: 'bdnb', nom: 'BDNB' },
] as const;

const RE_MARQUEUR = /<!--\s*SOURCE:\s*([a-z0-9_]+)\s*-->/gi;

/** Découpe un corps de section en éléments (prose / commande). Robuste aux barrières ``` avec ou sans langage. */
function parserCorps(corps: string): { titre: string; elements: ElementProtocole[] } {
  const lignes = corps.split('\n');
  let titre = '';
  const elements: ElementProtocole[] = [];
  let prose: string[] = [];
  let code: string[] | null = null;

  const viderProse = () => {
    const t = prose.join('\n').trim();
    if (t) elements.push({ type: 'prose', texte: t });
    prose = [];
  };

  for (const ligne of lignes) {
    const estBarriere = ligne.trimStart().startsWith('```');
    if (estBarriere) {
      if (code === null) { viderProse(); code = []; } // ouverture (langage ignoré)
      else { elements.push({ type: 'commande', commande: code.join('\n').replace(/\s+$/, '') }); code = null; } // fermeture
      continue;
    }
    if (code !== null) { code.push(ligne); continue; }
    const mTitre = /^##\s+(.*\S)\s*$/.exec(ligne);
    if (mTitre && titre === '') { titre = mTitre[1]; continue; }
    prose.push(ligne);
  }
  viderProse();
  return { titre, elements };
}

/** Parse le fichier entier → intro (avant le 1er marqueur) + une entrée par section trouvée. PUR. */
export function parserProtocoles(texte: string): { intro: string; sections: Map<string, SectionProtocole> } {
  RE_MARQUEUR.lastIndex = 0;
  const marqueurs = [...texte.matchAll(RE_MARQUEUR)];
  const intro = (marqueurs.length ? texte.slice(0, marqueurs[0].index) : texte).trim();
  const sections = new Map<string, SectionProtocole>();
  for (let i = 0; i < marqueurs.length; i += 1) {
    const cle = marqueurs[i][1];
    const debut = marqueurs[i].index + marqueurs[i][0].length;
    const fin = i + 1 < marqueurs.length ? marqueurs[i + 1].index : texte.length;
    const { titre, elements } = parserCorps(texte.slice(debut, fin));
    sections.set(cle, { present: true, cle, titre: titre || cle, elements });
  }
  return { intro, sections };
}

/**
 * Construit l'affichage dans l'ORDRE canonique (sûr → risqué). `texte` null → sentinelle GLOBALE « fichier absent ».
 * Une source attendue absente du fichier → sentinelle « section manquante » (distincte d'un protocole vide). PUR.
 */
export function construireAffichageProtocoles(
  texte: string | null,
  ordre: readonly { cle: string; nom: string }[] = ORDRE_PROTOCOLES,
): AffichageProtocoles {
  if (texte === null) return { fichierAbsent: true, intro: '', sections: [] };
  const { intro, sections } = parserProtocoles(texte);
  const out = ordre.map((o): SectionProtocole | SectionManquante =>
    sections.get(o.cle) ?? { present: false, cle: o.cle, nom: o.nom },
  );
  return { fichierAbsent: false, intro, sections: out };
}
