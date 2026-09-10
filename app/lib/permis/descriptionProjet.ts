/**
 * CR-1 — LECTURE de la « Courte description de votre projet ou de vos travaux » (champ libre du Cerfa / récapitulatif télé-service).
 * PUR (aucune I/O, aucune IA), testable. Remplace la coupe naïve de `recapCerfa.ts` qui ancrait sur le libellé et capturait VERS
 * L'AVANT : sur un Cerfa APLATI par iText, le flux pdfjs est réordonné (la valeur saisie PRÉCÈDE son libellé), si bien que la coupe
 * avant ramenait du GABARIT VIERGE au lieu de la déclaration. Mesure du témoin 468 (cerfa_13409-13.pdf) : la vraie phrase est à
 * l'offset 1229 du flux, les libellés « Courte description… » du gabarit sont à 34322 / 39090 — bien APRÈS.
 *
 * MÉCANIQUE (déterministe, deux ordres de flux) — on ne suppose PLUS « libellé puis valeur ». On cherche la DÉCLARATION elle-même,
 * par deux voies de FIABILITÉ DÉCROISSANTE ; à défaut, on REFUSE (mieux vaut vide qu'un faux) :
 *   TIER 1 — champ libre Cerfa (canonique) : dans une fenêtre APRÈS chaque étiquette « Courte description de votre projet ou de vos
 *            travaux », on découpe aux BORNES structurelles et on garde le segment qui COMMENCE par un mot-tête de projet.
 *   TIER 2 — récapitulatif télé-service (repli) : quand le champ Cerfa est vierge (page de présentation « Description du projet »),
 *            la valeur se trouve dans le bloc des valeurs, JUSTE AVANT le numéro de Cerfa « NNNNN*NN ». On prend, à gauche de chaque
 *            numéro, le segment qui commence par un mot-tête de projet.
 * Dans les deux cas : rejet du GABARIT VIERGE (`estGabaritVierge`), rejet de tout ce qui ne commence pas par un mot-tête (jamais un
 * libellé de formulaire type « Nombre total de logements créés : … »). VERBATIM : on ne recompose PAS les mots coupés par
 * l'aplatissement ; on ôte seulement la traîne de cases à cocher aplaties (« 2 1 2 1 2 1 X »).
 *
 * ⚠️ Rien n'est DEVINÉ : hors de ces deux ancres franches, on renvoie `absent` (les notices, cartouches de plan, etc. ne sont jamais
 * happés). AcroForm : voir `choisirDescriptionProjet` — un champ de formulaire RENSEIGNÉ prime sur toute coupe de texte.
 */

export type ProvenanceDescription = 'acroform' | 'texte' | 'absent';

/** Fenêtre de recherche autour d'une ancre (le champ libre du 468 démarre ~1100 caractères après son étiquette télé-service). */
const FENETRE = 1600;

/** Étiquette du CHAMP LIBRE Cerfa (canonique). Sans le « : » final — la ponctuation de tête est ôtée par `nettoyerDebut`. */
const RE_LABEL_CERFA = /Courte\s+description\s+de\s+votre\s+projet\s+ou\s+de\s+vos\s+travaux/gi;
/** Numéro de Cerfa « 13409*13 » : dans un récapitulatif télé-service, il SUIT immédiatement la valeur « Description du projet ». */
const RE_NUM_CERFA = /\b\d{4,5}\s*\*\s*\d{1,2}\b/g;

/** Mots-TÊTE d'une déclaration de projet : une vraie description COMMENCE par l'un d'eux (jamais par un libellé de formulaire). */
const RE_TETE = /^(Construction|R[ée]habilitation|R[ée]novation|Extension|Am[ée]nagement|D[ée]molition|Sur[ée]l[ée]vation|Changement|Cr[ée]ation|[ÉE]dification|Restructuration|Transformation|R[ée]alisation|Reconstruction|Immeuble|Maison|Villa|Pavillon|H[ôo]tel|Le\s+projet|Projet\s+de|Travaux|R[ée]sidence|Mise\s+en)/i;
/** Un signal de projet DOIT figurer dans le segment (garde-fou en plus du mot-tête). */
const RE_PROJET = /b[âa]timent|logements?|construction|surface|niveaux?|sous-sol|R\s*\+\s*\d|extension|r[ée]habilitation|sur[ée]l[ée]vation|d[ée]molition|am[ée]nagement|r[ée]sidence|locaux|commerc|[ée]quipement|ensemble\s+immobilier|habitation/i;

/**
 * GABARIT VIERGE (fonction pure, testée à part) — marqueurs du FORMULAIRE NON REMPLI : une capture qui les porte n'est PAS une
 * déclaration mais du gabarit, elle doit être REJETÉE. On y ajoute la pagination « N / M » (pied de page du Cerfa vierge, jamais
 * dans une phrase saisie). CONSERVATEUR : à la moindre marque de gabarit, on refuse.
 */
const RE_GABARIT = /[ÀA]\s+remplir\s+pour\s+une\s+demande|En\s+cas\s+de\s+besoin,\s+vous\s+pouvez|Vous\s+pouvez\s+vous\s+dispenser|Nombre\s+maximum\s+de\s+lots|Uniquement\s+[àa]\s+remplir|Si\s+les\s+travaux\s+sont\s+r[ée]alis[ée]s\s+par\s+tranches|Par\s+application\s+du\s+coefficient|Comment\s+la\s+constructibilit[ée]|Superficie\s+du\s+\(ou\s+des\)\s+terrain|Construction\s+p[ée]riodiquement\s+d[ée]mont[ée]e|Destination\s+des\s+constructions\s+et\s+tableau|Votre\s+projet\s+porte\s+sur\s+une\s+installation|Si\s+votre\s+projet\s+n[ée]cessite/i;
const RE_PAGINATION = /\b\d{1,3}\s*\/\s*\d{1,3}\b/;

export function estGabaritVierge(extrait: string): boolean {
  return RE_GABARIT.test(extrait) || RE_PAGINATION.test(extrait);
}

/** BORNES structurelles : là où une déclaration ne va JAMAIS — on coupe le flux en segments à chacune. */
const SEP = '\u0000'; // sentinelle de decoupe : caractere NUL, GARANTI absent d'une couche texte PDF
const BORNES: RegExp[] = [
  /\b\d{4,5}\s*\*\s*\d{1,2}\b/g,     // numéro de Cerfa « 13409*13 »
  /\b\d{1,3}\s*\/\s*\d{1,3}\b/g,     // pagination « 6 / 23 »
  /\b\d\s*\.\s*\d\b/g,               // numéro de section « 4.4 » (un seul chiffre de chaque côté — « 818.0 » n'est PAS coupé)
  /[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,   // adresse e-mail
  /\b\d{2}\/\d{2}\/\d{4}\b/g,        // date
];
/** Phrases de STRUCTURE (formulaire + page de présentation télé-service) : jamais au milieu d'une déclaration → séparateurs. */
const RE_BORNES_PHRASES = /Page\s+de\s+pr[ée]sentation|CGU|CERFA\s+de\s+la\s+demande|Formulaire\b|Synth[èe]se\s+de\s+donn[ée]es|Raison\s+sociale|Compte\s+utilisateur|Nom\/Pr[ée]nom|Date\s+de\s+(?:cr[ée]ation|derni[èe]re|d[ée]p[oô]t)|R[ée]ference\s+dossier|Num[ée]ro\s+du\s+dossier|Demande\s+d['’]autorisation|La\s+Mairie\s+de|Ce\s+document\s+r[ée]capitule|D[ée]p[oô]t\s+num[ée]rique|Document\s+cr[éé]{1,2}\s+par\s+voie|Dossier\s+d[ée]pos[ée]\s+en\s+ligne|Si\s+votre\s+projet\s+n[ée]cessite|Informations\s+compl[ée]mentaires|Votre\s+projet\s+porte\s+sur\s+une\s+installation|[ÀA]\s+remplir|Uniquement\s+[àa]\s+remplir|Construction\s+p[ée]riodiquement\s+d[ée]mont[ée]e|Destination\s+des\s+constructions|Superficie|En\s+cas\s+de\s+besoin|Nombre\s+maximum\s+de\s+lots|Vous\s+pouvez\s+vous\s+dispenser|Type\s+de\s+dossier|Adresse\s+principale|Demandeur|Verrouillage\s+du\s+brouillon|informations\s+sur\s+le\s+processus|se\s+r[ée]f[ée]rer|Empr\s*ei\s*nte|avoir\s+re[çc]u\s+par\s+voie/gi;

/** Ôte la tête non-alphabétique (« : », « ) », espaces) pour tester le mot-tête sur la vraie 1re lettre. */
const nettoyerDebut = (s: string): string => s.replace(/^[^A-Za-zÀ-ÿ]+/, '').trim();
/** Ôte UNIQUEMENT la traîne de cases à cocher aplaties (≥ 2 jetons « chiffre|X » isolés), jamais la ponctuation de phrase (verbatim). */
const nettoyerFin = (s: string): string => s.replace(/(?:\s+(?:\d{1,3}|[XxOo])){2,}\s*$/, '').replace(/\s+$/, '');

/** Découpe une fenêtre en segments aux bornes structurelles. */
function decouperSegments(fenetre: string): string[] {
  let s = fenetre;
  for (const re of BORNES) s = s.replace(re, (m) => SEP + m + SEP);
  s = s.replace(RE_BORNES_PHRASES, (m) => SEP + m + SEP);
  return s.split(SEP).map((x) => x.trim()).filter(Boolean);
}

/** Segments d'une fenêtre qui sont de VRAIES déclarations : commencent par un mot-tête, portent un signal projet, hors gabarit. */
function candidatsDeclaration(fenetre: string): string[] {
  const out: string[] = [];
  for (const brut of decouperSegments(fenetre)) {
    const seg = nettoyerFin(nettoyerDebut(brut));
    if (seg.length < 25) continue;                 // trop court pour une description
    if (!RE_TETE.test(seg)) continue;              // ne commence pas par un mot-tête → libellé/valeur voisine, pas une déclaration
    if (!RE_PROJET.test(seg)) continue;            // garde-fou : aucun signal projet
    if (estGabaritVierge(seg)) continue;           // gabarit vierge → refusé
    if (!/[a-zà-ÿ]{3,}/i.test(seg)) continue;      // pas de mot lisible
    out.push(seg);
  }
  return out;
}

const plusLong = (arr: string[]): string | null => (arr.length ? arr.slice().sort((a, b) => b.length - a.length)[0] : null);

/**
 * Lit la description de projet dans le TEXTE (couche pdfjs concaténée). Renvoie la déclaration VERBATIM, ou null si aucune ancre
 * franche (TIER 1 puis TIER 2) ne donne de segment fiable — l'abstention est un choix (mieux vaut vide qu'un gabarit).
 */
export function lireDescriptionProjetTexte(texte: string): string | null {
  const t = (texte ?? '').replace(/\s+/g, ' ');

  // TIER 1 — champ libre Cerfa : segment après « Courte description de votre projet ou de vos travaux ».
  const t1: string[] = [];
  let m: RegExpExecArray | null;
  RE_LABEL_CERFA.lastIndex = 0;
  while ((m = RE_LABEL_CERFA.exec(t))) {
    const debut = m.index + m[0].length;
    t1.push(...candidatsDeclaration(t.slice(debut, debut + FENETRE)));
  }
  const v1 = plusLong(t1);
  if (v1) return v1;

  // TIER 2 — récapitulatif télé-service : segment JUSTE AVANT le numéro de Cerfa « NNNNN*NN ».
  const t2: string[] = [];
  RE_NUM_CERFA.lastIndex = 0;
  while ((m = RE_NUM_CERFA.exec(t))) {
    t2.push(...candidatsDeclaration(t.slice(Math.max(0, m.index - FENETRE), m.index)));
  }
  const v2 = plusLong(t2);
  if (v2) return v2;

  return null;
}

/**
 * Choisit la description en respectant la HIÉRARCHIE de fiabilité (requirement CR-1 §3) :
 *   ① AcroForm RENSEIGNÉ (le champ de formulaire, source la plus sûre) → prime sur toute coupe de texte ;
 *   ② à défaut, coupe déterministe du texte (`lireDescriptionProjetTexte`) ;
 *   ③ sinon, absent (champ vide, motif journalisable en amont).
 * Un AcroForm vide, purement blanc, ou qui ne porte que du gabarit est ignoré (repli sur le texte).
 */
export function choisirDescriptionProjet(opts: { acroform?: string | null; texte: string }): { valeur: string | null; provenance: ProvenanceDescription } {
  const acro = (opts.acroform ?? '').trim();
  if (acro && !estGabaritVierge(acro)) return { valeur: acro, provenance: 'acroform' };
  const texte = lireDescriptionProjetTexte(opts.texte);
  if (texte) return { valeur: texte, provenance: 'texte' };
  return { valeur: null, provenance: 'absent' };
}
