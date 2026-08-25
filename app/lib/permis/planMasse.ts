/**
 * PROJ-3d — DÉTECTION « plan de masse » pour le sélecteur du tracé d'emprise. PUR, aucune I/O. Deux niveaux :
 *  · ① SCORE PAR NOM (instantané, 0 I/O) : nomenclature réglementaire R.431-9 (PC2 = « plan de masse ») + forme « plan de masse »
 *      tolérante aux séparateurs, bonus « projet » > « existant » (on projette le FUTUR bâtiment, pas l'existant). Tri primaire.
 *  · ② CONFIRMATION PAR TEXTE (appliquée SEULEMENT à la shortlist, côté serveur) : « plan de masse » dans le texte d'une page →
 *      numéro de page proposé ; lecture d'échelle INDICATIVE, gardée contre les faux positifs (mesuré : « 1/15 » = n° de page,
 *      « 1:46 » = légende).
 * 🔴 Ne concerne QUE la sélection d'une page à AFFICHER : aucun couplage moteur / verdict / injection d'altitude.
 */

/** Normalise pour la détection : minuscules, accents retirés, séparateurs (_ - espaces multiples) réduits à un espace. */
function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const MASSE = /plan\s+(de\s+)?masse/;   // « plan de masse » / « plan masse » (séparateurs déjà normalisés en espaces)
const PC2 = /\bpc\s*2(\.\d+)*\b/;       // code PC2 (R.431-9 = plan de masse). PC20 / PC39 / PC40 NON concernés (frontière de mot).

/**
 * Score « plan de masse » d'un nom de fichier (0 = pas un plan de masse). +100 si la forme « plan de masse », +80 si le code PC2 ;
 * puis, seulement si l'un des deux a matché : +15 « projet » (le futur bâtiment) OU −5 « existant ». PUR.
 *
 * ⚠️ PROJ-3f — la métrique « 0 erreur » de PROJ-3d a été établie sur UN SEUL dossier (11430) où chaque plan était une pièce d'UNE
 * page nommée « …plan_de_masse… ». Elle NE GÉNÉRALISE PAS : mesuré sur 07512025V0035, les 45 pièces portent un tag de lot « _2D_PDM »
 * (abréviation) que la forme « plan de masse » NE matche PAS — seul le code réglementaire PC2 sauve la détection ; et la pièce est
 * MULTI-PAGES (cartouche + planches). Le NOM reste un signal FAIBLE : la vérité se joue au niveau des PAGES (cf. `pagesPlanches`).
 */
export function scoreNomPlanMasse(nomFichier: string): number {
  const n = norm(nomFichier);
  let s = 0;
  if (MASSE.test(n)) s += 100;
  if (PC2.test(n)) s += 80;
  if (s === 0) return 0;                       // ni la forme, ni le code → pas un plan de masse
  if (/\bprojet\b/.test(n)) s += 15;           // on projette le FUTUR
  else if (/\bexistant\b/.test(n)) s -= 5;     // l'existant passe après
  return s;
}

export interface PieceScorable { id: number; nomFichier: string; typeMime: string | null }

// ── PROJ-3g — TROIS FAMILLES de plans, décidées au NOM DE PIÈCE (mesuré : le titre PAR PAGE est trop bruité — sur une pièce
//   multi-pages de dessin, « coupe »/« façade »/« étage » apparaissent sur presque toutes les planches (tableaux de niveaux, cotes).
//   Le nom, lui, sépare proprement quand les plans sont des pièces nommées ; à défaut, seuls les codes réglementaires R.431-9 jouent).
export type FamillePlan = 'masse' | 'etage' | 'coupe';
const ETAGE = /plan\s+(du\s+|de\s+)?(niveau|rez|rdc|sous\s*sol|etage|r\s*\+?\s*\d)/; // « plan du R+n / RDC / niveau / étage »
const COUPE = /\bcoupes?\b|\bfacades?\b|\belevations?\b/;                            // coupe(s) OU façade(s) (vues en ÉLÉVATION), pluriel toléré
const PC3 = /\bpc\s*3(\.\d+)*\b/;                                                    // R.431-9 : PC3 = plan en coupe

/**
 * Famille d'une pièce d'après son NOM, ou null (hors bande). Priorité : masse > étage > coupe (le plan de masse — seul TRAÇABLE —
 * l'emporte). PC5 « toitures » (vue de dessus non demandée) ne matche aucune famille → null. PUR.
 */
export function familleDeNom(nomFichier: string): FamillePlan | null {
  const n = norm(nomFichier);
  if (MASSE.test(n) || PC2.test(n)) return 'masse';
  if (ETAGE.test(n)) return 'etage';
  if (COUPE.test(n) || PC3.test(n)) return 'coupe';
  return null;
}

/**
 * 🔴 VERROU MÉTIER (pur, testé, ET revérifié côté serveur) : une emprise ne se trace QUE sur un plan de masse (vue du dessus).
 * Une coupe/façade est une ÉLÉVATION, un plan d'étage une autre vue : y caler une emprise n'a aucun sens géométrique.
 */
export function estTracable(f: FamillePlan | null): boolean { return f === 'masse'; }

const RANG_FAMILLE: Record<FamillePlan, number> = { masse: 0, etage: 1, coupe: 2 };

/**
 * Classe les pièces en familles pour la BANDE : proposées = pièces d'une famille, ordonnées masse (par score PROJ-3d) → étage →
 * coupe ; autres = le reste (repli). REPLI GARANTI : aucune pièce perdue. PUR.
 */
export function classerPiecesParFamille<T extends PieceScorable>(pieces: T[]): { proposees: (T & { famille: FamillePlan })[]; autres: T[] } {
  const avec = pieces.map((p, i) => ({ p, i, f: familleDeNom(p.nomFichier), s: scoreNomPlanMasse(p.nomFichier) }));
  const proposees = avec.filter((x): x is typeof x & { f: FamillePlan } => x.f !== null)
    .sort((a, b) => RANG_FAMILLE[a.f] - RANG_FAMILLE[b.f] || b.s - a.s || a.i - b.i)
    .map((x) => ({ ...x.p, famille: x.f }));
  const autres = avec.filter((x) => x.f === null).map((x) => x.p);
  return { proposees, autres };
}

/**
 * Sépare les pièces en « proposées » (score > 0, triées par score DÉCROISSANT puis ordre d'origine) et « autres » (ordre d'origine
 * conservé). REPLI GARANTI : aucune pièce n'est retirée — « autres » contient tout le reste, toujours atteignable. PUR.
 */
export function classerPiecesPlanMasse<T extends PieceScorable>(pieces: T[]): { proposees: T[]; autres: T[] } {
  const avecScore = pieces.map((p, i) => ({ p, i, s: scoreNomPlanMasse(p.nomFichier) }));
  const proposees = avecScore.filter((x) => x.s > 0).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.p);
  const autres = avecScore.filter((x) => x.s === 0).map((x) => x.p);
  return { proposees, autres };
}

/** Le texte d'une page mentionne-t-il « plan de masse » ? (accents / séparateurs normalisés). PUR. */
export function texteEstPlanMasse(texte: string): boolean {
  return MASSE.test(norm(texte));
}

/** Première page (1-based) dont le texte est un plan de masse, sinon null. PUR. (Historique PROJ-3d : désigne en fait le CARTOUCHE.) */
export function pagePlanMasse(pagesTexte: string[]): number | null {
  const i = pagesTexte.findIndex((t) => texteEstPlanMasse(t));
  return i === -1 ? null : i + 1;
}

// PROJ-3f — le TITRE réglementaire du cartouche PC2 (« PLAN DE MASSE DES CONSTRUCTIONS À ÉDIFIER OU MODIFIER » et formes voisines)
//   devient un signal d'EXCLUSION (l'INVERSE de PROJ-3d, qui en faisait un signal de sélection). Mesuré : 0 faux positif sur les deux
//   dossiers quand la couche texte existe (le titre ne figure que sur la page de garde, jamais sur les planches).
const CARTOUCHE = /construction[s]?\s+a\s+(edifier|modifier)/;

/** Le texte d'une page est-il celui d'une page de GARDE / CARTOUCHE (porte le titre réglementaire) ? PUR. */
export function estPageCartouche(texte: string): boolean {
  return CARTOUCHE.test(norm(texte));
}

/**
 * PROJ-3f — PAGES à feuilleter d'une pièce candidate (1-based), dans l'ordre. Une pièce MULTI-PAGES est éclatée par page, en
 * EXCLUANT les pages de cartouche (titre réglementaire). Une pièce MONO-PAGE garde sa page (titre et dessin y coexistent — cas
 * 11430, non-régression). N'utilise QUE le texte (jamais getOperatorList, mesuré trop cher). Dégradations sûres :
 *  · aucune page (pièce illisible) → `[]` (l'appelant repliera sur la page 1) ;
 *  · pièce scannée sans couche texte → aucune page n'est reconnue « cartouche » → TOUTES les pages entrent (jamais une erreur bloquante) ;
 *  · toutes les pages titrées (improbable) → on dégrade à toutes les pages plutôt qu'une bande vide.
 * Conséquence ASSUMÉE : quelques pages de texte (sans titre de cartouche) restent dans la bande — Arno feuillette et tombe sur les planches.
 */
export function pagesPlanches(pagesTexte: string[]): number[] {
  if (pagesTexte.length === 0) return [];
  if (pagesTexte.length === 1) return [1];
  const gardees = pagesTexte.map((t, i) => ({ n: i + 1, t })).filter((x) => !estPageCartouche(x.t)).map((x) => x.n);
  return gardees.length > 0 ? gardees : pagesTexte.map((_, i) => i + 1);
}

/**
 * Échelle INDICATIVE lue sur le texte d'une page, ou null (jamais une valeur inventée). Gardes ANTI-FAUX-POSITIFS mesurés :
 *  · dénominateur borné [50 ; 2000] → écarte « 1:46 » (légende) ;
 *  · la forme « 1/N » n'est acceptée QUE si la page mentionne « éch »/« échelle » → écarte « 1/15 » (numéro de page) ;
 *  · la forme « 1:N » (deux-points) est acceptée seule (peu ambiguë).
 * Renvoie « 1:1000 » normalisé. L'échelle NE sert PAS à classer (tous les plans en ont une) — purement indicative. PUR.
 */
export function lireEchelleTexte(texte: string): string | null {
  const t = norm(texte);
  const dansPlage = (d: number) => d >= 50 && d <= 2000;
  for (const m of t.matchAll(/1\s*:\s*(\d{2,4})/g)) { const d = Number(m[1]); if (dansPlage(d)) return `1:${d}`; }
  if (/\bech(elle)?\b/.test(t)) for (const m of t.matchAll(/1\s*\/\s*(\d{2,4})/g)) { const d = Number(m[1]); if (dansPlage(d)) return `1:${d}`; }
  return null;
}
