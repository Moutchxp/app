import type { ClasseurLu, CelluleLue, FeuilleLue } from '../location/suivi/lectureExcel';
import type { Societe } from './modele';

/**
 * ══ 🔴 TUILE « TRANSACTION » — LOT B : LA LECTURE D'UN « TABLEAU DE BORD » D'ARNO (PURE) ═══════════════════════════════════════
 *
 * Un fichier = une société et une année :
 *   · D1 — l'ANNÉE est celle du NOM du fichier (« TABLEAU DE BORD MACJ 2025.xlsx »), jamais celle des en-têtes de mois ; le mois
 *     d'une colonne est son RANG parmi les colonnes datées de la ligne 1 (1re = janvier) ;
 *   · ce que le fichier COMPTE : les cellules additionnées (en remontant les formules) par les lignes « TOTAL VENTES » et
 *     « TOTAL COMPROMIS » de l'onglet « CA GLOBAL » — chaque cellule feuille est une ligne de vente (ou de compromis) comptée ;
 *   · D4 — le MOIS d'une ligne = le mois dont la formule de la ligne « CA » de son onglet pointe vers sa ligne ; aucune formule
 *     (ou plusieurs mois) → « mois à confirmer » ; un montant saisi en dur dans la ligne « CA » → « à rattacher » ;
 *   · D5 — les rétrocessions de la ligne « Apporteur » : un montant par mois ; une formule faite de constantes (« =1200+1500 ») donne
 *     une rétrocession par terme ;
 *   · D6 — ignorés : les codes DN / NP / O / ok (texte hors libellé), les couleurs, les onglets ROYALTIE, COUTS, SALAIRES,
 *     Calcul remuneration, les lignes PREVISIONNEL et les #REF! ;
 *   · l'onglet GESTION (CRITERIMMO) : lots, honoraires HT, ADHOC, salarié, reste, par mois ; l'onglet LOCATION : le CA du mois (information).
 * Aucun calcul de plan ici (`planImport.ts`) ; aucune écriture.
 */

export const ONGLETS_IGNORES = /^(CA GLOBAL|LOCATION|GESTION|COUTS|SALAIRES|CALCUL REMUNERATION|ROYALTIE)$/i;
const LIBELLE_TOTAL = /^(TOTAL|PREVISIONNEL|VENTES FACTUREES|VENTES\b|COMPROMIS\b|CA\b|APPORTEUR|PAYE|COM NEGO|RESTANT|BILAN)/i;

export interface Ref { feuille: string; col: string; ligne: number }
export const adresse = (r: Pick<Ref, 'col' | 'ligne'>): string => `${r.col}${r.ligne}`;

/** La lettre d'une colonne → son numéro (A = 1). */
export const numCol = (c: string): number => [...c].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
export const lettreCol = (n: number): string => { let s = ''; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
const decouper = (a: string): { col: string; ligne: number } | null => { const m = /^\$?([A-Z]{1,3})\$?(\d+)$/.exec(a); return m === null ? null : { col: m[1], ligne: Number(m[2]) }; };

/** Une formule, analysée : ses références (feuille nommée ou non, plages développées), ses constantes, ses erreurs. PUR. */
export interface FormuleLue { refs: (Ref & { feuilleNommee: boolean })[]; constantes: number[]; erreur: boolean; seulementConstantes: boolean; divise12: boolean }
export function analyserFormule(f: string, feuille: string): FormuleLue {
  const refs: FormuleLue['refs'] = [];
  const erreur = /#REF!/i.test(f);
  let reste = f;
  const RE = /(?:'([^']+)'|([A-Za-zÀ-ÿ_][\wÀ-ÿ ]*?))?!?(\$?[A-Z]{1,3}\$?\d+)(?::(\$?[A-Z]{1,3}\$?\d+))?/g;
  // Les références avec feuille : « 'Jean Baptiste'!B37 », « CEDRIC!B17 » ; sans : « B10 », « SUM(B8:B16) ».
  const RE_FEUILLE = /(?:'([^']+)'|([A-Za-zÀ-ÿ_][\wÀ-ÿ]*(?: [\wÀ-ÿ]+)*))!(\$?[A-Z]{1,3}\$?\d+)(?::(\$?[A-Z]{1,3}\$?\d+))?/g;
  const ajouter = (nom: string, nommee: boolean, a: string, b: string | undefined): void => {
    const x = decouper(a);
    if (x === null) return;
    const y = b === undefined ? x : decouper(b);
    if (y === null) return;
    for (let c = Math.min(numCol(x.col), numCol(y.col)); c <= Math.max(numCol(x.col), numCol(y.col)); c++) {
      for (let l = Math.min(x.ligne, y.ligne); l <= Math.max(x.ligne, y.ligne); l++) refs.push({ feuille: nom, col: lettreCol(c), ligne: l, feuilleNommee: nommee });
    }
  };
  reste = reste.replace(RE_FEUILLE, (_m, q: string | undefined, n: string | undefined, a: string, b: string | undefined) => {
    ajouter((q ?? n ?? '').trim(), true, a, b); return ' ';
  });
  void RE;
  reste = reste.replace(/#REF!/gi, ' ');
  reste = reste.replace(/\b(SUM)\b/gi, ' ');
  reste = reste.replace(/(\$?[A-Z]{1,3}\$?\d+)(?::(\$?[A-Z]{1,3}\$?\d+))?/g, (_m, a: string, b: string | undefined) => { ajouter(feuille, false, a, b); return ' '; });
  const divise12 = /\/\s*1[.,]2\b/.test(reste);
  const sansDivision = reste.replace(/\/\s*1[.,]2\b/g, ' ');
  const constantes = [...sansDivision.matchAll(/(?<![\w.])(\d+(?:[.,]\d+)?)/g)].map((m) => Number(m[1].replace(',', '.')));
  // Une formule « de constantes » : nombres, +, -, parenthèses, SUM — rien d'autre (« =1200+1500+1400 », « =SUM(1500+400) »).
  const seulementConstantes = refs.length === 0 && !erreur && /^[\s\d.,+()]*$/.test(sansDivision) && constantes.length > 0;
  return { refs, constantes, erreur, seulementConstantes, divise12 };
}

/** Les termes d'une formule de constantes « =1200+1500+1400 » (additions seulement) ; null si autre chose. PUR. */
export function termesConstants(f: string): number[] | null {
  const t = f.replace(/^=/, '').replace(/\bSUM\b/gi, '').replace(/[()\s]/g, '');
  if (!/^\d+(?:[.,]\d+)?(?:\+\d+(?:[.,]\d+)?)*$/.test(t)) return null;
  return t.split('+').map((x) => Number(x.replace(',', '.')));
}

// ── Lecture d'un onglet ─────────────────────────────────────────────────────────────────────────────────────────────────

const cellule = (f: FeuilleLue, a: string): CelluleLue | undefined => f.cellules[a];
const texteDe = (c: CelluleLue | undefined): string | null => (c !== undefined && typeof c.v === 'string' && c.f === undefined && /[A-Za-zÀ-ÿ]/.test(c.v) ? c.v.trim() : null);
const nombreDe = (c: CelluleLue | undefined): number | null => (c !== undefined && typeof c.v === 'number' && Number.isFinite(c.v) ? c.v : null);
const lignesDe = (f: FeuilleLue): Map<number, Map<number, CelluleLue>> => {
  const m = new Map<number, Map<number, CelluleLue>>();
  for (const [a, c] of Object.entries(f.cellules)) {
    const x = decouper(a);
    if (x === null || numCol(x.col) > 20) continue; // au-delà de T : des copies parasites (MACJ 2019-2020), jamais lues
    if (!m.has(x.ligne)) m.set(x.ligne, new Map());
    m.get(x.ligne)!.set(numCol(x.col), c);
  }
  return m;
};

/** La ligne d'un intitulé dans les premières lignes (colonnes A à D). */
function ligneLibellee(lignes: Map<number, Map<number, CelluleLue>>, motif: RegExp, max = 8): number | null {
  for (let l = 1; l <= max; l++) {
    for (let c = 1; c <= 4; c++) { const t = texteDe(lignes.get(l)?.get(c)); if (t !== null && motif.test(t)) return l; }
  }
  return null;
}

/** Les colonnes des 12 mois : les cellules DATÉES de la ligne 1, dans l'ordre (D1 : le rang fait le mois, pas l'année affichée). */
export function colonnesMois(f: FeuilleLue): { col: string; mois: number }[] | null {
  const l1 = lignesDe(f).get(1);
  if (l1 === undefined) return null;
  const dates = [...l1.entries()].filter(([, c]) => typeof c.v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(c.v)).sort((a, b) => a[0] - b[0]);
  if (dates.length !== 12) return null;
  return dates.map(([n], i) => ({ col: lettreCol(n), mois: i + 1 }));
}

export interface MontantMois { onglet: string; cellule: string; mois: number; montant: number; libelle: string }
export interface OngletLu {
  nom: string;
  /** La ligne « CA » et, pour chaque ligne de la feuille, les mois dont la formule la vise. */
  ligneCa: number | null;
  moisDesLignes: Map<number, number[]>;
  /** D4 — montants saisis en dur (ou constantes) dans la ligne « CA » : à rattacher. */
  aRattacher: MontantMois[];
  /** D5 — les rétrocessions (ligne « Apporteur ») : un terme par rétrocession. */
  retrocessions: MontantMois[];
  /** Les lignes de vente « candidates » (libellé + montant(s)), pour les onglets miroirs et les lignes hors total. */
  lignes: LigneCandidate[];
  alertes: string[];
}
export interface LigneCandidate { ligne: number; libelle: string; colLibelle: number; montants: { col: number; valeur: number }[] }

export function lireOnglet(f: FeuilleLue): OngletLu {
  const nom = f.nom.trim();
  const lignes = lignesDe(f);
  const alertes: string[] = [];
  const cols = colonnesMois(f);
  const ligneCa = ligneLibellee(lignes, /^CA( (CRITERIMMO|MACJ))?$/i);
  const ligneApp = ligneLibellee(lignes, /^Apporteur/i);
  const moisDesLignes = new Map<number, number[]>();
  const aRattacher: MontantMois[] = [];
  const retrocessions: MontantMois[] = [];
  if (cols === null) alertes.push(`${nom} : les 12 colonnes de mois (ligne 1) sont introuvables — aucun mois lu.`);
  if (cols !== null && ligneCa !== null) {
    for (const { col, mois } of cols) {
      const c = cellule(f, `${col}${ligneCa}`);
      if (c === undefined) continue;
      if (c.f === undefined) {
        const n = nombreDe(c);
        if (n !== null && n !== 0) aRattacher.push({ onglet: nom, cellule: `${col}${ligneCa}`, mois, montant: n, libelle: 'montant saisi en dur' });
        continue;
      }
      const a = analyserFormule(c.f, nom);
      if (a.erreur) { alertes.push(`${nom}!${col}${ligneCa} : formule en #REF! ignorée (D6).`); }
      for (const r of a.refs) if (!r.feuilleNommee || r.feuille === nom) moisDesLignes.set(r.ligne, [...new Set([...(moisDesLignes.get(r.ligne) ?? []), mois])]);
      if (a.refs.length === 0 && !a.erreur) {
        const n = nombreDe(c);
        if (n !== null && n !== 0) aRattacher.push({ onglet: nom, cellule: `${col}${ligneCa}`, mois, montant: n, libelle: `formule « =${c.f} » sans vente` });
      } else for (const k of a.constantes) aRattacher.push({ onglet: nom, cellule: `${col}${ligneCa}`, mois, montant: k, libelle: `constante de « =${c.f} »` });
    }
  }
  if (cols !== null && ligneApp !== null) {
    for (const { col, mois } of cols) {
      const c = cellule(f, `${col}${ligneApp}`);
      if (c === undefined) continue;
      const termes = c.f === undefined ? (nombreDe(c) === null ? [] : [nombreDe(c) as number]) : termesConstants(c.f);
      if (termes !== null) {
        termes.forEach((t, i) => { if (t !== 0) retrocessions.push({ onglet: nom, cellule: `${col}${ligneApp}`, mois, montant: t,
          libelle: c.f === undefined ? 'montant saisi' : `terme ${i + 1} de « =${c.f} »` }); });
      } else {
        const n = nombreDe(c);
        if (n !== null && n !== 0) retrocessions.push({ onglet: nom, cellule: `${col}${ligneApp}`, mois, montant: n, libelle: `résultat de « =${c.f} »` });
      }
    }
  }
  // Les lignes candidates : un libellé (texte, colonne A ou B), puis au moins un montant à sa droite (colonnes ≤ D).
  const candidates: LigneCandidate[] = [];
  for (const [l, cs] of [...lignes.entries()].sort((a, b) => a[0] - b[0])) {
    if (l <= 6) continue;
    const libCol = [1, 2].find((c) => texteDe(cs.get(c)) !== null);
    if (libCol === undefined) continue;
    const lib = texteDe(cs.get(libCol))!;
    if (LIBELLE_TOTAL.test(lib)) continue;
    // Une somme (« =SUM(C16:C26) ») posée sur la ligne n'est pas un montant de la vente.
    const montants = [...cs.entries()].filter(([c, x]) => c > libCol && c <= 4 && nombreDe(x) !== null && !(x.f !== undefined && /#REF!|:/.test(x.f)))
      .map(([c, x]) => ({ col: c, valeur: nombreDe(x) as number })).sort((a, b) => a.col - b.col);
    if (montants.length === 0) continue;
    candidates.push({ ligne: l, libelle: lib, colLibelle: libCol, montants });
  }
  return { nom, ligneCa, moisDesLignes, aRattacher, retrocessions, lignes: candidates, alertes };
}

// ── Ce que le fichier compte : les cellules feuilles des totaux du « CA GLOBAL » ─────────────────────────────────────────

export interface Feuille {
  ref: Ref;
  /** La valeur (nombre) ; null : texte ou vide. */
  valeur: number | null;
  texte: string | null;
  libelle: string | null;
  colLibelle: number | null;
  /** Le montant à gauche de la cellule, entre le libellé et elle (MACJ 2025 : la paye du négociateur, colonne B). */
  paye: number | null;
  erreur: boolean;
}
export interface TotalLu {
  libelle: string;
  cellule: string;
  formule: string | null;
  /** La valeur du fichier (résultat de la formule), telle quelle ; ×1,2 si la formule divise par 1,2 (CRITERIMMO). */
  valeurFichier: number | null;
  valeurFichierTtc: number | null;
  divise12: boolean;
  /** Les cellules d'onglet que la formule additionne (« CEDRIC!B17 »), et leur valeur. */
  sources: { ref: Ref; valeur: number | null }[];
  feuilles: Feuille[];
  /** Ce que la remontée n'a pas su expliquer (constante dans un total, référence vers une autre feuille…). */
  alertes: string[];
}

function libelleDeLigne(f: FeuilleLue, ligne: number, avant: number): { libelle: string | null; col: number | null; paye: number | null } {
  const cs = lignesDe(f).get(ligne);
  if (cs === undefined) return { libelle: null, col: null, paye: null };
  let col: number | null = null;
  for (let c = 1; c < avant; c++) if (texteDe(cs.get(c)) !== null) { col = c; break; }
  const libelle = col === null ? null : texteDe(cs.get(col));
  let paye: number | null = null;
  if (col !== null) for (let c = col + 1; c < avant; c++) { const n = nombreDe(cs.get(c)); if (n !== null) { paye = n; break; } }
  return { libelle, col, paye };
}

/** Remonte une cellule d'onglet jusqu'à ses feuilles : une somme ou un total se développe ; une ligne de vente est une feuille. PUR. */
function remonter(cl: ClasseurLu, ref: Ref, alertes: string[], vus: Set<string>, dansPlage = false): Feuille[] {
  const cle = `${ref.feuille}!${adresse(ref)}`;
  if (vus.has(cle)) return [];
  vus.add(cle);
  const f = cl.feuilles.find((x) => x.nom.trim() === ref.feuille);
  if (f === undefined) { alertes.push(`${cle} : onglet introuvable.`); return []; }
  const c = f.cellules[adresse(ref)];
  const lib = libelleDeLigne(f, ref.ligne, numCol(ref.col));
  const estTotal = lib.libelle !== null && LIBELLE_TOTAL.test(lib.libelle);
  const feuille = (): Feuille[] => {
    if (c === undefined || (c.v === null && c.f === undefined)) return [];
    if (c.f !== undefined && /#REF!/i.test(c.f)) return [{ ref, valeur: null, texte: null, libelle: lib.libelle, colLibelle: lib.col, paye: lib.paye, erreur: true }];
    if (typeof c.v === 'number') return [{ ref, valeur: c.v, texte: null, libelle: lib.libelle, colLibelle: lib.col, paye: lib.paye, erreur: false }];
    if (typeof c.v === 'string') return [{ ref, valeur: null, texte: c.v, libelle: lib.libelle, colLibelle: lib.col, paye: lib.paye, erreur: false }];
    return [];
  };
  if (c === undefined || c.f === undefined) return feuille();
  // Une cellule dans une plage additionnée, qui n'est pas elle-même un total : une ligne de vente (sa formule donne son montant).
  if (dansPlage && !estTotal) return feuille();
  const a = analyserFormule(c.f, ref.feuille);
  if (!estTotal && !dansPlage && a.refs.length > 0 && !/SUM/i.test(c.f) && lib.libelle !== null) return feuille();
  if (a.refs.length === 0) return feuille();
  if (a.constantes.length > 0) alertes.push(`${cle} « =${c.f} » : constante(s) ${a.constantes.join(', ')} dans un total — non rattachée(s) à une vente.`);
  const plage = /SUM\s*\(\s*\$?[A-Z]+\$?\d+\s*:/i.test(c.f);
  const autres = a.refs.filter((r) => r.feuilleNommee && r.feuille !== ref.feuille);
  for (const r of autres) alertes.push(`${cle} « =${c.f} » : référence à ${r.feuille}!${adresse(r)} (autre onglet) non remontée.`);
  return a.refs.filter((r) => !r.feuilleNommee || r.feuille === ref.feuille).flatMap((r) => remonter(cl, { feuille: ref.feuille, col: r.col, ligne: r.ligne }, alertes, vus, plage));
}

/** Les deux totaux du « CA GLOBAL » : TOTAL VENTES et TOTAL COMPROMIS (EN COURS). PUR. */
export function lireTotaux(cl: ClasseurLu): { ventes: TotalLu | null; compromis: TotalLu | null; alertes: string[] } {
  const g = cl.feuilles.find((f) => f.nom.trim().toUpperCase() === 'CA GLOBAL');
  if (g === undefined) return { ventes: null, compromis: null, alertes: ['Onglet « CA GLOBAL » introuvable.'] };
  const lignes = lignesDe(g);
  const lire = (motif: RegExp): TotalLu | null => {
    const l = ligneLibellee(lignes, motif, 30);
    if (l === null) return null;
    const libelle = texteDe(lignes.get(l)?.get(1)) ?? '';
    const c = g.cellules[`B${l}`];
    const alertes: string[] = [];
    if (c === undefined || c.f === undefined) return { libelle, cellule: `B${l}`, formule: null, valeurFichier: nombreDe(c), valeurFichierTtc: nombreDe(c), divise12: false, sources: [], feuilles: [], alertes };
    const a = analyserFormule(c.f, 'CA GLOBAL');
    const sources = a.refs.filter((r) => r.feuilleNommee).map((r) => {
      const f = cl.feuilles.find((x) => x.nom.trim() === r.feuille);
      return { ref: { feuille: r.feuille, col: r.col, ligne: r.ligne }, valeur: f === undefined ? null : nombreDe(f.cellules[adresse(r)]) };
    });
    const vus = new Set<string>();
    const feuilles = sources.flatMap((s) => remonter(cl, s.ref, alertes, vus));
    const v = nombreDe(c);
    return { libelle, cellule: `B${l}`, formule: c.f, valeurFichier: v, valeurFichierTtc: v === null ? null : a.divise12 ? v * 1.2 : v, divise12: a.divise12, sources, feuilles, alertes };
  };
  return { ventes: lire(/^TOTAL VENTES/i), compromis: lire(/^TOTAL COMPROMIS/i), alertes: [] };
}

// ── GESTION et LOCATION ─────────────────────────────────────────────────────────────────────────────────────────────────

export interface GestionLue { mois: number; nbLots: number | null; honorairesHt: number | null; adhocHt: number | null; salarieHt: number | null; resteHt: number | null; note: string | null }
export interface OngletGestion { lignes: GestionLue[]; totalFichier: number | null; celluleTotal: string | null; alertes: string[] }

/** L'onglet GESTION : les colonnes par leur en-tête (« Nombre de lots », « Honos », « ADHOC », « Salarié », « Restant ») ; sans en-tête
 * de lots (2019 → 2024) : B = honoraires, C = ADHOC, D = Restant. Un texte (« 7233,99/1,2 ») n'est pas un montant : note, valeur vide. */
export function lireGestion(cl: ClasseurLu): OngletGestion | null {
  const g = cl.feuilles.find((f) => f.nom.trim().toUpperCase() === 'GESTION');
  if (g === undefined) return null;
  const lignes = lignesDe(g);
  const entete = new Map<string, number>();
  for (const [c, x] of lignes.get(1) ?? new Map()) { const t = texteDe(x); if (t !== null) entete.set(t.toUpperCase(), c); }
  const avecLots = entete.has('NOMBRE DE LOTS');
  const col = avecLots
    ? { lots: entete.get('NOMBRE DE LOTS')!, honos: entete.get('HONOS') ?? 3, adhoc: entete.get('ADHOC') ?? 4, salarie: entete.get('SALARIÉ') ?? entete.get('SALARIE') ?? 5, reste: entete.get('RESTANT') ?? 6 }
    : { lots: null, honos: 2, adhoc: entete.get('ADHOC') ?? 3, salarie: null, reste: entete.get('RESTANT') ?? 4 };
  const alertes: string[] = [];
  const res: GestionLue[] = [];
  for (let l = 2; l <= 13; l++) {
    const cs = lignes.get(l);
    if (cs === undefined) continue;
    const mois = l - 1;
    const notes: string[] = [];
    const lire = (c: number | null, mot: string): number | null => {
      if (c === null) return null;
      const x = cs.get(c);
      if (x === undefined) return null;
      if (typeof x.v === 'string' && x.f === undefined) { notes.push(`${mot} saisi en texte « ${x.v} » (${lettreCol(c)}${l}) : non compté par le fichier, à confirmer`); return null; }
      if (x.f !== undefined && termesConstants(x.f) !== null && termesConstants(x.f)!.length > 1) notes.push(`${mot} = « =${x.f} » (${lettreCol(c)}${l})`);
      return nombreDe(x);
    };
    const r: GestionLue = { mois, nbLots: lire(col.lots, 'lots'), honorairesHt: lire(col.honos, 'honoraires'), adhocHt: lire(col.adhoc, 'ADHOC'),
      salarieHt: lire(col.salarie, 'salarié'), resteHt: lire(col.reste, 'reste'), note: null };
    r.note = notes.length === 0 ? null : notes.join(' ; ');
    if ([r.nbLots, r.honorairesHt, r.adhocHt, r.salarieHt, r.resteHt].some((x) => x !== null) || r.note !== null) res.push(r);
  }
  const lt = ligneLibellee(lignes, /^TOTAL GESTION/i, 20);
  const ct = lt === null ? null : `${lettreCol(col.honos)}${lt}`;
  return { lignes: res, totalFichier: ct === null ? null : nombreDe(g.cellules[ct]), celluleTotal: ct, alertes };
}

/** L'onglet LOCATION : le CA de location du mois (colonne B, lignes 2 à 13) — comparé au Suivi, pour information. */
export function lireLocation(cl: ClasseurLu): { mois: number; montant: number }[] | null {
  const g = cl.feuilles.find((f) => f.nom.trim().toUpperCase() === 'LOCATION');
  if (g === undefined) return null;
  const r: { mois: number; montant: number }[] = [];
  for (let l = 2; l <= 13; l++) { const n = nombreDe(g.cellules[`B${l}`]); if (n !== null) r.push({ mois: l - 1, montant: n }); }
  return r;
}

// ── Le fichier ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface FichierLu {
  fichier: string;
  societe: Societe;
  annee: number;
  onglets: OngletLu[];
  /** Les onglets de négociateurs comptés par le « CA GLOBAL » (au moins une source dans un total). */
  ongletsComptes: string[];
  ventes: TotalLu | null;
  compromis: TotalLu | null;
  gestion: OngletGestion | null;
  location: { mois: number; montant: number }[] | null;
  alertes: string[];
}

/** D1 — la société et l'année du NOM du fichier. null : nom illisible (le fichier n'est pas lu). PUR. */
export function identifierFichier(nom: string): { societe: Societe; annee: number } | null {
  const m = /TABLEAU\s*DE\s*BORD\s*(MACJ\s*)?(20\d{2})/i.exec(nom);
  return m === null ? null : { societe: m[1] === undefined ? 'criterimmo' : 'macj', annee: Number(m[2]) };
}

export function lireFichier(nom: string, cl: ClasseurLu): FichierLu {
  const id = identifierFichier(nom);
  if (id === null) throw new Error(`« ${nom} » : ni société ni année lisibles dans le nom (D1) — fichier non lu.`);
  const onglets = cl.feuilles.filter((f) => !ONGLETS_IGNORES.test(f.nom.trim())).map(lireOnglet).filter((o) => o.ligneCa !== null);
  const t = lireTotaux(cl);
  const ongletsComptes = [...new Set([...(t.ventes?.sources ?? []), ...(t.compromis?.sources ?? [])].map((s) => s.ref.feuille))];
  return { fichier: nom, ...id, onglets, ongletsComptes, ventes: t.ventes, compromis: t.compromis,
    gestion: id.societe === 'criterimmo' ? lireGestion(cl) : null, location: id.societe === 'criterimmo' ? lireLocation(cl) : null,
    alertes: [...t.alertes, ...onglets.flatMap((o) => o.alertes), ...(t.ventes?.alertes ?? []), ...(t.compromis?.alertes ?? [])] };
}
