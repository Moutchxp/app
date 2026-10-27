import type { Societe } from './modele';
import type { FichierLu, Feuille, LigneCandidate, MontantMois, OngletLu } from './lectureTableau';

/**
 * ══ 🔴 TUILE « TRANSACTION » — LOT B : LE PLAN DE LA REPRISE (PUR) ══════════════════════════════════════════════════════════════
 *
 * Des fichiers lus (`lectureTableau.ts`) au plan d'écriture, sans base et sans deviner :
 *   · OCCURRENCES — chaque cellule comptée par le « CA GLOBAL » (vente ou compromis) est une occurrence ; s'y ajoutent les lignes d'un
 *     onglet compté qu'une formule « CA » place dans un mois sans que la somme de l'onglet ne les compte (« hors total », écart
 *     expliqué), et les lignes des onglets que le « CA GLOBAL » ne compte pas (« miroirs » : l'onglet CEDRIC de MACJ 2025).
 *   · D3 — UNE VENTE, UNE FOIS : dans un fichier, les occurrences d'onglets différents au même libellé sont UNE vente.
 *       - un onglet à DEUX montants (paye + honoraires, MACJ 2025) : les honoraires de l'agence se prennent UNE fois ; une autre
 *         occurrence comptée au même montant est un doublon ÉCARTÉ ; à un autre montant, un doublon DOUTEUX, listé, jamais additionné ;
 *       - un onglet à UN montant (2019 → 2024) : chaque occurrence comptée est une PART des honoraires (FAUGERE 2023 : 6 440 + 9 660),
 *         comme le total du fichier — sauf, avec `partsEgales: 'doublon'`, deux parts ÉGALES, prises pour un doublon (listé) ;
 *       - un rapprochement AMBIGU (une ligne qui ressemble à plusieurs) ne fusionne rien : il est listé ;
 *       - une occurrence miroir rattachée devient une ligne (part, paye) qui ne compte pas dans les honoraires ; non rattachée : listée.
 *   · D4 — le mois = celui de la formule « CA » qui pointe vers la ligne ; aucun (ou plusieurs) → « mois à confirmer ». Un compromis
 *     qu'une formule « CA » place dans un mois est une vente de ce mois (compté en compromis par le fichier : écart expliqué).
 *   · D2 (généralisée) — un compromis d'un fichier qui se retrouve, même libellé et même montant, dans un fichier PLUS RÉCENT de la même
 *     société, n'est compté qu'une fois : dans le fichier le plus récent (OURY / BERTRAND : 2026, pas 2025).
 *   · D5 — les rétrocessions d'un onglet et d'un mois : une seule vente de cet onglet ce mois-là → rattachées ; sinon « à répartir ».
 *   · B3 / B4 — la RÉCONCILIATION de chaque fichier au centime : total du fichier = importé + écarts expliqués ligne par ligne ; ce qui
 *     ne s'explique pas BLOQUE l'écriture de ce fichier.
 */

export interface OptionsPlan {
  partsEgales: 'parts' | 'doublon';
  /** Les fichiers dont Arno accepte qu'un total AFFICHÉ (non recalculé par Excel) diffère de la somme de ses cellules (B4 : sinon bloqué). */
  accepterNonRecalcule: readonly string[];
}
export const OPTIONS_DEFAUT: OptionsPlan = { partsEgales: 'parts', accepterNonRecalcule: [] };

/**
 * 🔴 LOT C — LES TOTAUX NON RECALCULÉS QU'ARNO A ACCEPTÉS, nommément, avec leur motif (B4 : sans cette liste, le fichier est bloqué).
 * Toujours dits au rapport. Une nouvelle acceptation s'ajoute ici (décision d'Arno), ou ponctuellement par `--accepter-non-recalcule=`.
 */
export const ACCEPTATIONS_NON_RECALCULE: readonly { fichier: string; motif: string; decision: string }[] = [
  { fichier: 'TABLEAU DE BORD MACJ 2023.xlsx', decision: 'Arno, 27/10/2026 (lot C)',
    motif: 'le TOTAL COMPROMIS du CA GLOBAL affiche 10 950 € alors que sa formule CEDRIC!C21 = SUM(C10:C67) additionne 179 935 € (valeur non recalculée par Excel) ; les ventes du fichier se réconcilient au centime' },
];
/** L'acceptation d'un fichier : celle de la liste d'Arno, ou celle de l'option du script ; null : non acceptée. PUR. */
export function acceptation(fichier: string, o: OptionsPlan): string | null {
  const a = ACCEPTATIONS_NON_RECALCULE.find((x) => x.fichier === fichier);
  if (a !== undefined) return `accepté par décision d'${a.decision} — ${a.motif}`;
  return o.accepterNonRecalcule.includes(fichier) ? 'accepté par l’option --accepter-non-recalcule' : null;
}

export const centimes = (x: number): number => Math.round((x + Number.EPSILON) * 100);
const memeMontant = (a: number, b: number): boolean => centimes(a) === centimes(b);

// ── Le rapprochement des libellés ───────────────────────────────────────────────────────────────────────────────────────

const MOTS_VIDES = new Set(['SCI', 'LES', 'DES', 'ET', 'DE', 'LA', 'LE', 'DU', 'MME', 'MR', 'M', 'INDIVISION', 'CONSORTS', 'VENTE', 'PARKING', 'BOX', 'SORTIE', 'AGENCE']);
export function jetons(l: string): Set<string> {
  return new Set(l.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim().split(' ')
    .filter((t) => t.length >= 3 && !MOTS_VIDES.has(t)));
}
/** Deux libellés désignent-ils la même vente ? Égalité, inclusion, ou au moins la moitié des noms en commun. PUR. */
export function memeLibelle(a: string, b: string): boolean {
  const A = jetons(a); const B = jetons(b);
  if (A.size === 0 || B.size === 0) return false;
  const commun = [...A].filter((x) => B.has(x)).length;
  if (commun === 0) return false;
  if (commun === Math.min(A.size, B.size)) return true;
  return commun / new Set([...A, ...B]).size >= 0.5;
}

// ── Les occurrences ─────────────────────────────────────────────────────────────────────────────────────────────────────

export type Nature = 'vente' | 'compromis';
export type Sorte = 'comptee' | 'hors_total' | 'miroir';
export interface Occurrence {
  cle: string;
  fichier: string;
  societe: Societe;
  annee: number;
  onglet: string;
  ligne: number;
  libelle: string;
  /** Le montant compté (ou lu) : honoraires de l'agence (onglet à deux montants) ou part (onglet à un montant). */
  montant: number;
  /** MACJ 2025 : la paye du négociateur (colonne avant les honoraires) ; un miroir à deux montants : sa part. */
  paye: number | null;
  deuxMontants: boolean;
  nature: Nature;
  sorte: Sorte;
  /** Les mois que la formule « CA » de son onglet donne à sa ligne. */
  mois: number[];
  /** D4 — un compromis compté qu'une formule « CA » place dans un mois. */
  requalifie: boolean;
}

export type Destin =
  | { type: 'importee'; venteCle: string }
  | { type: 'doublon_ecarte'; venteCle: string; motif: string }
  | { type: 'doublon_douteux'; venteCle: string; motif: string }
  | { type: 'reprise_ailleurs'; venteCle: string; fichier: string; motif: string }
  | { type: 'texte'; motif: string };

export interface LignePlan { occ: Occurrence; role: 'negociateur' | 'part' | 'vendeur'; montantTtc: number | null; compte: boolean; note: string | null }
export interface VentePlan {
  cle: string;
  societe: Societe;
  fichier: string;
  annee: number;
  libelle: string;
  honorairesTtc: number;
  statut: 'vendue' | 'compromis';
  mois: number | null;
  /** Pourquoi le mois manque (« aucune formule », « plusieurs mois : 1, 12 »). */
  motifMois: string | null;
  primaire: Occurrence;
  lignes: LignePlan[];
  notes: string[];
}
export interface RetroPlan { cle: string; societe: Societe; fichier: string; annee: number; m: MontantMois; venteCle: string | null; motif: string }
export interface ARattacherPlan { cle: string; societe: Societe; fichier: string; annee: number; m: MontantMois }
export interface GestionPlan { cle: string; fichier: string; annee: number; mois: number; nbLots: number | null; honorairesHt: number | null; adhocHt: number | null;
  salarieHt: number | null; resteHt: number | null; note: string | null }

export interface Ecart { libelle: string; montant: number }
export interface Reconciliation {
  quoi: string;
  fichierTtc: number | null;
  sommeCellules: number;
  importeTtc: number;
  ecarts: Ecart[];
  /** fichier (ou somme des cellules) − importé − Σ écarts, en centimes ; 0 : tout s'explique. */
  resteInexplique: number;
  bloquant: boolean;
}
export interface RapportFichier {
  fichier: string;
  societe: Societe;
  annee: number;
  reconciliations: Reconciliation[];
  nbVentes: number;
  ventesTtc: number;
  nbCompromis: number;
  compromisTtc: number;
  nbRetros: number;
  retrosTtc: number;
  retrosARepartir: RetroPlan[];
  moisAConfirmer: VentePlan[];
  aRattacher: ARattacherPlan[];
  rapprochements: string[];
  nonImportees: string[];
  alertes: string[];
  bloque: boolean;
}
export interface Plan {
  ventes: VentePlan[];
  retros: RetroPlan[];
  aRattacher: ARattacherPlan[];
  gestion: GestionPlan[];
  rapports: RapportFichier[];
  destins: Map<string, Destin>;
  interSocietes: string[];
  /** LOT C — la même vente notée chez les deux sociétés la même année : un groupe = ses notes (clés de ventes du plan). */
  doubles: { cle: string; annee: number; ventes: string[] }[];
}

const cleOcc = (fichier: string, onglet: string, ligne: number): string => `${fichier}|${onglet}|${ligne}`;
const numColonne = (c: string): number => [...c].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);

function occurrencesDuFichier(f: FichierLu, alertes: string[], nonImportees: string[]): { occs: Occurrence[]; textes: Feuille[] } {
  const parOnglet = new Map(f.onglets.map((o) => [o.nom, o]));
  const occs = new Map<string, Occurrence>();
  const textes: Feuille[] = [];
  const mois = (onglet: string, ligne: number): number[] => (parOnglet.get(onglet)?.moisDesLignes.get(ligne) ?? []).slice().sort((a, b) => a - b);
  const depuisFeuille = (x: Feuille, nature: Nature): void => {
    const cle = cleOcc(f.fichier, x.ref.feuille, x.ref.ligne);
    if (x.erreur) { alertes.push(`${x.ref.feuille}!${x.ref.col}${x.ref.ligne} : #REF! dans un total, ignoré (D6).`); return; }
    if (x.valeur === null) { if (x.texte !== null) textes.push(x); return; }
    const deja = occs.get(cle);
    if (deja !== undefined) {
      // Une même cellule comptée en vente ET en compromis (MACJ 2023 : la somme des compromis recouvre les ventes) : une vente, une fois.
      if (deja.nature === 'vente' && nature === 'compromis') return;
      return;
    }
    const m = mois(x.ref.feuille, x.ref.ligne);
    const requalifie = nature === 'compromis' && m.length > 0;
    occs.set(cle, { cle, fichier: f.fichier, societe: f.societe, annee: f.annee, onglet: x.ref.feuille, ligne: x.ref.ligne,
      libelle: x.libelle ?? `(sans libellé) — ${x.ref.feuille} ligne ${x.ref.ligne}`, montant: x.valeur, paye: x.paye, deuxMontants: x.paye !== null,
      nature: requalifie ? 'vente' : nature, sorte: 'comptee', mois: m, requalifie });
  };
  for (const x of f.ventes?.feuilles ?? []) depuisFeuille(x, 'vente');
  for (const x of f.compromis?.feuilles ?? []) depuisFeuille(x, 'compromis');
  const depuisCandidate = (o: OngletLu, c: LigneCandidate, sorte: Sorte): Occurrence => {
    const deux = c.montants.length >= 2;
    return { cle: cleOcc(f.fichier, o.nom, c.ligne), fichier: f.fichier, societe: f.societe, annee: f.annee, onglet: o.nom, ligne: c.ligne, libelle: c.libelle,
      montant: deux ? c.montants[1].valeur : c.montants[0].valeur, paye: deux ? c.montants[0].valeur : null, deuxMontants: deux,
      nature: 'vente', sorte, mois: mois(o.nom, c.ligne), requalifie: false };
  };
  // La colonne des montants comptés de chaque onglet (B pour CRITERIMMO, C pour MACJ 2025…) et si elle porte une paye à sa gauche.
  const colonnePrincipale = new Map<string, { col: number; paye: boolean }>();
  for (const x of [...(f.ventes?.feuilles ?? []), ...(f.compromis?.feuilles ?? [])]) {
    if (!colonnePrincipale.has(x.ref.feuille) && x.valeur !== null && x.libelle !== null) colonnePrincipale.set(x.ref.feuille, { col: numColonne(x.ref.col), paye: x.paye !== null });
  }
  for (const o of f.onglets) {
    const compte = f.ongletsComptes.includes(o.nom);
    for (const c of o.lignes) {
      const cle = cleOcc(f.fichier, o.nom, c.ligne);
      if (occs.has(cle)) continue;
      if (compte) {
        // Hors de la somme de l'onglet, mais une formule « CA » la place dans un mois : une vente (écart expliqué au rapport). Son montant
        // est lu dans la colonne des montants comptés de l'onglet (jamais une autre colonne de la ligne).
        if ((o.moisDesLignes.get(c.ligne) ?? []).length > 0) {
          const cp = colonnePrincipale.get(o.nom);
          const m = cp === undefined ? undefined : c.montants.find((x) => x.col === cp.col);
          if (cp === undefined || m === undefined) {
            nonImportees.push(`${o.nom} ligne ${c.ligne} « ${c.libelle} » : une formule « CA » la vise, mais aucun montant dans la colonne comptée de l'onglet — non importée.`);
            continue;
          }
          const paye = cp.paye ? c.montants.find((x) => x.col === cp.col - 1)?.valeur ?? null : null;
          occs.set(cle, { ...depuisCandidate(o, c, 'hors_total'), montant: m.valeur, paye, deuxMontants: cp.paye });
        }
        else nonImportees.push(`${o.nom} ligne ${c.ligne} « ${c.libelle} » ${c.montants.map((m) => m.valeur).join(' / ')} : hors des totaux du fichier, aucune formule « CA » — non importée.`);
      } else occs.set(cle, depuisCandidate(o, c, 'miroir'));
    }
  }
  return { occs: [...occs.values()], textes };
}

// ── Le regroupement d'un fichier (D3) ───────────────────────────────────────────────────────────────────────────────────

interface Groupe { occs: Occurrence[] }

function regrouper(occs: Occurrence[], rapprochements: string[]): { groupes: Groupe[]; miroirs: Occurrence[] } {
  const principales = occs.filter((o) => o.sorte !== 'miroir');
  const parent = new Map<string, string>(principales.map((o) => [o.cle, o.cle]));
  const racine = (k: string): string => { let r = k; while (parent.get(r) !== r) r = parent.get(r)!; return r; };
  for (const a of principales) {
    // Les candidates d'un AUTRE onglet (ou le compromis du même onglet au même montant).
    const candidats = principales.filter((b) => b.cle !== a.cle && memeLibelle(a.libelle, b.libelle)
      && (b.onglet !== a.onglet || (a.nature !== b.nature && memeMontant(a.montant, b.montant))));
    const parOnglet = new Map<string, Occurrence[]>();
    for (const b of candidats) parOnglet.set(b.onglet + b.nature, [...(parOnglet.get(b.onglet + b.nature) ?? []), b]);
    for (const [, bs] of parOnglet) {
      if (bs.length > 1) {
        // Plusieurs lignes du même onglet ressemblent à celle-ci : on n'en choisit aucune.
        const exacte = bs.filter((b) => memeMontant(a.montant, b.montant));
        if (exacte.length === 1) { parent.set(racine(exacte[0].cle), racine(a.cle)); continue; }
        rapprochements.push(`AMBIGU : ${a.onglet} l.${a.ligne} « ${a.libelle} » ressemble à ${bs.map((b) => `${b.onglet} l.${b.ligne} « ${b.libelle} »`).join(' et ')} — rien n'est fusionné.`);
        continue;
      }
      // Réciproque : la ligne trouvée ne doit ressembler, dans l'onglet de celle-ci, qu'à elle (sinon : pas de fusion en chaîne).
      const b = bs[0];
      const retour = principales.filter((c) => c.cle !== b.cle && c.onglet === a.onglet && c.nature === a.nature && memeLibelle(b.libelle, c.libelle));
      if (retour.length > 1 && !(retour.filter((c) => memeMontant(c.montant, b.montant)).length === 1 && memeMontant(a.montant, b.montant))) continue;
      parent.set(racine(b.cle), racine(a.cle));
    }
  }
  const groupes = new Map<string, Occurrence[]>();
  for (const o of principales) groupes.set(racine(o.cle), [...(groupes.get(racine(o.cle)) ?? []), o]);
  return { groupes: [...groupes.values()].map((g) => ({ occs: g })), miroirs: occs.filter((o) => o.sorte === 'miroir') };
}

// ── Le plan ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

const eur = (x: number): string => `${x.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

export function planifier(fichiers: readonly FichierLu[], o: OptionsPlan = OPTIONS_DEFAUT): Plan {
  const ordre = [...fichiers].sort((a, b) => a.societe.localeCompare(b.societe) || a.annee - b.annee);
  const destins = new Map<string, Destin>();
  const ventes: VentePlan[] = [];
  const parFichier = new Map<string, { occs: Occurrence[]; textes: Feuille[]; rapprochements: string[]; nonImportees: string[]; alertes: string[] }>();

  for (const f of ordre) {
    const rapprochements: string[] = [];
    const nonImportees: string[] = [];
    const alertes: string[] = [...f.alertes];
    const { occs, textes } = occurrencesDuFichier(f, alertes, nonImportees);
    parFichier.set(f.fichier, { occs, textes, rapprochements, nonImportees, alertes });
    const { groupes, miroirs } = regrouper(occs, rapprochements);
    const ventesDuFichier: VentePlan[] = [];
    for (const g of groupes) {
      const tri = [...g.occs].sort((a, b) => (a.sorte === 'comptee' ? 0 : 1) - (b.sorte === 'comptee' ? 0 : 1) || (a.nature === 'vente' ? 0 : 1) - (b.nature === 'vente' ? 0 : 1));
      const primaire = tri[0];
      const cle = primaire.cle;
      const deux = g.occs.some((x) => x.deuxMontants);
      const lignes: LignePlan[] = [];
      const notes: string[] = [];
      let honoraires = 0;
      const ventesG = g.occs.filter((x) => x.nature === 'vente');
      const compromisG = g.occs.filter((x) => x.nature === 'compromis');
      const statut: 'vendue' | 'compromis' = ventesG.length > 0 ? 'vendue' : 'compromis';
      const comptables = statut === 'vendue' ? ventesG : compromisG;
      const plusieursOnglets = new Set(comptables.map((x) => x.onglet)).size > 1;
      if (deux) {
        const ref = comptables[0];
        honoraires = ref.montant;
        for (const x of comptables) {
          if (x === ref) destins.set(x.cle, { type: 'importee', venteCle: cle });
          else if (memeMontant(x.montant, ref.montant)) destins.set(x.cle, { type: 'doublon_ecarte', venteCle: cle, motif: `même vente que ${ref.onglet} l.${ref.ligne} (D3 : honoraires comptés une fois)` });
          else destins.set(x.cle, { type: 'doublon_douteux', venteCle: cle, motif: `même libellé que ${ref.onglet} l.${ref.ligne} mais ${eur(x.montant)} au lieu de ${eur(ref.montant)} (listé, jamais additionné)` });
        }
      } else {
        const vus: Occurrence[] = [];
        for (const x of comptables) {
          const meme = vus.find((y) => y.onglet === x.onglet);
          const egal = vus.find((y) => memeMontant(y.montant, x.montant));
          if (meme !== undefined) destins.set(x.cle, { type: 'doublon_douteux', venteCle: cle, motif: `même libellé que ${meme.onglet} l.${meme.ligne}, même onglet (listé, jamais additionné)` });
          else if (o.partsEgales === 'doublon' && egal !== undefined) destins.set(x.cle, { type: 'doublon_ecarte', venteCle: cle, motif: `part égale à ${egal.onglet} l.${egal.ligne}, prise pour un doublon (option partsEgales=doublon)` });
          else { honoraires += x.montant; vus.push(x); destins.set(x.cle, { type: 'importee', venteCle: cle }); }
        }
      }
      // Les compromis d'une vente vendue : déjà la vente (ligne d'origine, hors honoraires).
      if (statut === 'vendue') for (const x of compromisG) destins.set(x.cle, { type: 'doublon_ecarte', venteCle: cle, motif: 'compromis de la même vente, vendue dans ce fichier (comptée une fois, en vente)' });
      for (const x of g.occs) {
        const d = destins.get(x.cle);
        const compte = d?.type === 'importee';
        const role: LignePlan['role'] = x.deuxMontants ? 'negociateur' : plusieursOnglets ? 'part' : 'vendeur';
        lignes.push({ occ: x, role, montantTtc: x.deuxMontants ? x.paye : role === 'part' ? x.montant : null, compte,
          note: d === undefined || d.type === 'importee' ? (x.sorte === 'hors_total' ? 'hors de la somme de l’onglet : comptée par sa formule « CA »' : null) : d.motif });
      }
      const moisV = [...new Set((statut === 'vendue' ? ventesG : []).flatMap((x) => x.mois))].sort((a, b) => a - b);
      const mois = moisV.length === 1 ? moisV[0] : null;
      const motifMois = statut !== 'vendue' ? null : moisV.length === 0 ? 'aucune formule « CA » ne pointe vers sa ligne' : moisV.length > 1 ? `plusieurs formules « CA » : ${moisV.join(', ')}` : null;
      if (g.occs.some((x) => x.requalifie)) notes.push('comptée en compromis par le fichier, mais une formule « CA » la place dans un mois : vente (D4)');
      const v: VentePlan = { cle, societe: f.societe, fichier: f.fichier, annee: f.annee, libelle: primaire.libelle, honorairesTtc: honoraires, statut, mois, motifMois, primaire, lignes, notes };
      ventesDuFichier.push(v);
    }
    // Les miroirs : rattachés à une seule vente du fichier → une ligne hors honoraires ; sinon listés.
    for (const m of miroirs) {
      const cands = ventesDuFichier.filter((v) => v.lignes.some((l) => memeLibelle(l.occ.libelle, m.libelle)));
      const exacts = cands.filter((v) => memeMontant(v.honorairesTtc, m.montant) || v.lignes.some((l) => memeMontant(l.occ.montant, m.montant)));
      const cible = cands.length === 1 ? cands[0] : exacts.length === 1 ? exacts[0] : null;
      if (cible === null) {
        parFichier.get(f.fichier)!.nonImportees.push(`${m.onglet} l.${m.ligne} « ${m.libelle} » ${eur(m.montant)}${m.paye === null ? '' : ` (part ${eur(m.paye)})`} : onglet hors des totaux du fichier, ${cands.length === 0 ? 'aucune vente correspondante' : `${cands.length} ventes possibles`} — non importée.`);
        continue;
      }
      const douteux = m.deuxMontants && !memeMontant(cible.honorairesTtc, m.montant) && cible.lignes.every((l) => l.occ.deuxMontants);
      cible.lignes.push({ occ: m, role: 'part', montantTtc: m.deuxMontants ? m.paye : m.montant, compte: false,
        note: douteux ? `onglet hors totaux : honoraires ${eur(m.montant)} au lieu de ${eur(cible.honorairesTtc)} — doublon douteux, listé, jamais additionné` : 'onglet hors des totaux du fichier : sa part, hors honoraires' });
      if (douteux) parFichier.get(f.fichier)!.rapprochements.push(`DOUTEUX : ${m.onglet} l.${m.ligne} « ${m.libelle} » ${eur(m.montant)} ≠ ${cible.primaire.onglet} l.${cible.primaire.ligne} ${eur(cible.honorairesTtc)} — ligne gardée hors honoraires.`);
      else parFichier.get(f.fichier)!.rapprochements.push(`${m.onglet} l.${m.ligne} « ${m.libelle} » → part de ${cible.primaire.onglet} l.${cible.primaire.ligne} « ${cible.libelle} »`);
    }
    ventes.push(...ventesDuFichier);
  }

  // ── D2 généralisée : un compromis retrouvé dans un fichier plus récent de la même société ──
  for (const v of [...ventes]) {
    if (v.statut !== 'compromis') continue;
    const plusTard = ventes.filter((w) => w !== v && w.societe === v.societe && w.annee > v.annee && memeLibelle(w.libelle, v.libelle) && memeMontant(w.honorairesTtc, v.honorairesTtc))
      .sort((a, b) => a.annee - b.annee);
    if (plusTard.length === 0) continue;
    const cible = plusTard.find((w) => w.statut === 'vendue') ?? plusTard[plusTard.length - 1];
    for (const l of v.lignes) {
      const ancien = destins.get(l.occ.cle);
      if (ancien?.type === 'importee') destins.set(l.occ.cle, { type: 'reprise_ailleurs', venteCle: cible.cle, fichier: cible.fichier,
        motif: `compromis repris ${cible.statut === 'vendue' ? 'et vendu' : 'en cours'} dans ${cible.fichier} (D2 : compté une seule fois, l'année la plus récente)` });
      cible.lignes.push({ ...l, compte: false, note: `compromis de ${v.fichier} (${l.occ.onglet} l.${l.occ.ligne}), repris ici (D2)` });
    }
    ventes.splice(ventes.indexOf(v), 1);
  }

  // ── Les rétrocessions, les montants à rattacher, la gestion ──
  const retros: RetroPlan[] = [];
  const aRattacher: ARattacherPlan[] = [];
  const gestion: GestionPlan[] = [];
  for (const f of ordre) {
    const pf = parFichier.get(f.fichier)!;
    const venteDeLigne = new Map<string, VentePlan>();
    for (const v of ventes) for (const l of v.lignes) if (l.occ.fichier === f.fichier) venteDeLigne.set(`${l.occ.onglet}|${l.occ.ligne}`, v);
    for (const og of f.onglets) {
      const actif = f.ongletsComptes.includes(og.nom) || [...venteDeLigne.keys()].some((k) => k.startsWith(`${og.nom}|`));
      const k: Record<string, number> = {};
      for (const m of og.retrocessions) {
        const n = (k[m.cellule] = (k[m.cellule] ?? 0) + 1);
        if (!actif) { pf.nonImportees.push(`${og.nom}!${m.cellule} rétrocession ${eur(m.montant)} (${m.libelle}) : onglet sans vente comptée — non importée.`); continue; }
        // D5 — les ventes de CET onglet que la formule « CA » place dans CE mois.
        const ventesMois = [...new Set([...og.moisDesLignes.entries()].filter(([, ms]) => ms.includes(m.mois))
          .map(([l]) => venteDeLigne.get(`${og.nom}|${l}`)).filter((v): v is VentePlan => v !== undefined))];
        const venteCle = ventesMois.length === 1 ? ventesMois[0].cle : null;
        retros.push({ cle: `${f.fichier}|${og.nom}|${m.cellule}|${n}`, societe: f.societe, fichier: f.fichier, annee: f.annee, m, venteCle,
          motif: venteCle !== null ? `seule vente de ${og.nom} en ${m.mois}` : ventesMois.length === 0 ? `aucune vente de ${og.nom} ce mois` : `${ventesMois.length} ventes de ${og.nom} ce mois` });
      }
      const ka: Record<string, number> = {};
      for (const m of og.aRattacher) {
        const n = (ka[m.cellule] = (ka[m.cellule] ?? 0) + 1);
        if (!actif) continue;
        aRattacher.push({ cle: `${f.fichier}|${og.nom}|${m.cellule}|${n}`, societe: f.societe, fichier: f.fichier, annee: f.annee, m });
      }
    }
    for (const g of f.gestion?.lignes ?? []) {
      gestion.push({ cle: `${f.fichier}|GESTION|${g.mois}`, fichier: f.fichier, annee: f.annee, mois: g.mois, nbLots: g.nbLots, honorairesHt: g.honorairesHt,
        adhocHt: g.adhocHt, salarieHt: g.salarieHt, resteHt: g.resteHt, note: g.note });
    }
  }

  // ── Les rapports et la réconciliation (B3 / B4) ──
  const rapports: RapportFichier[] = ordre.map((f) => rapportDe(f, ventes, retros, aRattacher, destins, o, parFichier.get(f.fichier)!));

  // ── Les ventes présentes chez les deux sociétés la même année : listées (information), jamais retirées ──
  const interSocietes: string[] = [];
  const crit = ventes.filter((v) => v.societe === 'criterimmo');
  // LOT C (Arno, 27/10/2026) — chaque rapprochement CRITERIMMO ↔ MACJ est la MÊME vente notée deux fois : les notes reliées entre elles
  // (HOPPENOT 2019 : une note CRITERIMMO, deux MACJ) forment un groupe « à attribuer ».
  const parent = new Map<string, string>();
  const racine = (k: string): string => { let r = k; while ((parent.get(r) ?? r) !== r) r = parent.get(r)!; return r; };
  for (const m of ventes.filter((v) => v.societe === 'macj' && v.statut === 'vendue')) {
    for (const c of crit.filter((x) => x.annee === m.annee && x.statut === 'vendue' && memeLibelle(x.libelle, m.libelle))) {
      interSocietes.push(`${m.annee} : CRITERIMMO « ${c.libelle} » ${eur(c.honorairesTtc)} (${c.primaire.onglet} l.${c.primaire.ligne}) ↔ MACJ « ${m.libelle} » ${eur(m.honorairesTtc)} (${m.primaire.onglet} l.${m.primaire.ligne})`);
      for (const k of [c.cle, m.cle]) if (!parent.has(k)) parent.set(k, k);
      parent.set(racine(m.cle), racine(c.cle));
    }
  }
  const groupes = new Map<string, string[]>();
  for (const k of parent.keys()) groupes.set(racine(k), [...(groupes.get(racine(k)) ?? []), k]);
  const doubles = [...groupes.values()].map((cles) => {
    const vs = cles.map((k) => ventes.find((v) => v.cle === k)!);
    return { cle: `double|${[...cles].sort()[0]}`, annee: Math.min(...vs.map((v) => v.annee)), ventes: [...cles].sort() };
  }).sort((a, b) => a.annee - b.annee || a.cle.localeCompare(b.cle));
  return { ventes, retros, aRattacher, gestion, rapports, destins, interSocietes, doubles };
}

function reconcilier(quoi: string, fichierTtc: number | null, cellules: Occurrence[], textes: Feuille[], importes: VentePlan[], destins: Map<string, Destin>,
  ajouts: Ecart[], acceptation: string | null, horsCellules: number): Reconciliation {
  const accepte = acceptation !== null;
  const somme = cellules.reduce((s, x) => s + x.montant, 0) + horsCellules;
  const ecarts: Ecart[] = [];
  for (const x of cellules) {
    const d = destins.get(x.cle);
    const ici = `${x.onglet} l.${x.ligne} « ${x.libelle} » ${eur(x.montant)}`;
    if (d === undefined) continue;
    if (d.type === 'doublon_ecarte') ecarts.push({ libelle: `− ${ici} : doublon écarté — ${d.motif}`, montant: -x.montant });
    else if (d.type === 'doublon_douteux') ecarts.push({ libelle: `− ${ici} : doublon douteux — ${d.motif}`, montant: -x.montant });
    else if (d.type === 'reprise_ailleurs') ecarts.push({ libelle: `− ${ici} : ${d.motif}`, montant: -x.montant });
  }
  for (const t of textes) ecarts.push({ libelle: `  ${t.ref.feuille}!${t.ref.col}${t.ref.ligne} « ${t.texte} » : texte, compté 0 par le fichier, non importé`, montant: 0 });
  ecarts.push(...ajouts);
  const importe = importes.reduce((s, v) => s + v.honorairesTtc, 0);
  const base = fichierTtc ?? somme;
  if (fichierTtc !== null && centimes(fichierTtc) !== centimes(somme)) {
    ecarts.push({ libelle: `⚠ le total AFFICHÉ par le fichier (${eur(fichierTtc)}) n'est pas la somme des cellules de sa formule (${eur(somme)}) : valeur non recalculée par Excel — ${accepte ? `✔ ${acceptation}` : 'BLOQUANT tant qu’Arno ne l’accepte pas (liste ACCEPTATIONS_NON_RECALCULE ou --accepter-non-recalcule)'}`, montant: somme - fichierTtc });
  }
  const reste = centimes(base) + centimes(ecarts.reduce((s, e) => s + e.montant, 0)) - centimes(importe);
  const stale = fichierTtc !== null && centimes(fichierTtc) !== centimes(somme);
  return { quoi, fichierTtc, sommeCellules: somme, importeTtc: importe, ecarts, resteInexplique: reste,
    bloquant: reste !== 0 || (stale && !accepte) };
}

function rapportDe(f: FichierLu, ventes: VentePlan[], retros: RetroPlan[], aRattacher: ARattacherPlan[], destins: Map<string, Destin>, o: OptionsPlan,
  pf: { occs: Occurrence[]; textes: Feuille[]; rapprochements: string[]; nonImportees: string[]; alertes: string[] }): RapportFichier {
  const ici = ventes.filter((v) => v.fichier === f.fichier);
  const vendues = ici.filter((v) => v.statut === 'vendue');
  const compromis = ici.filter((v) => v.statut === 'compromis');
  const comptees = pf.occs.filter((x) => x.sorte === 'comptee');
  const venteCells = new Set((f.ventes?.feuilles ?? []).map((x) => cleOcc(f.fichier, x.ref.feuille, x.ref.ligne)));
  const compCells = new Set((f.compromis?.feuilles ?? []).map((x) => cleOcc(f.fichier, x.ref.feuille, x.ref.ligne)));
  const cellsV = comptees.filter((x) => venteCells.has(x.cle));
  const cellsC = comptees.filter((x) => compCells.has(x.cle) && !venteCells.has(x.cle));
  // Une cellule que le total des compromis compte ET que le total des ventes compte déjà : une vente, comptée une fois.
  const dejaVentes = (f.compromis?.feuilles ?? []).filter((x) => x.valeur !== null && venteCells.has(cleOcc(f.fichier, x.ref.feuille, x.ref.ligne)));
  // Ce que le plan ajoute ou déplace entre ventes et compromis (expliqué ligne par ligne).
  const ajoutsV: Ecart[] = [];
  const ajoutsC: Ecart[] = [];
  for (const v of vendues) {
    for (const l of v.lignes) {
      if (!l.compte || l.occ.fichier !== f.fichier) continue;
      const x = l.occ;
      const t = `${x.onglet} l.${x.ligne} « ${x.libelle} » ${eur(x.montant)}`;
      if (x.sorte === 'hors_total') ajoutsV.push({ libelle: `+ ${t} : hors de la somme de son onglet, mais sa formule « CA » la place en ${x.mois.join(', ')} — importée (D4)`, montant: x.montant });
      if (x.requalifie) { ajoutsV.push({ libelle: `+ ${t} : comptée en compromis par le fichier, sa formule « CA » la place en ${x.mois.join(', ')} — vente (D4)`, montant: x.montant });
        ajoutsC.push({ libelle: `− ${t} : devenue vente (D4)`, montant: -x.montant }); }
    }
  }
  // Une vente d'un AUTRE fichier qui compte une ligne de celui-ci (D2 : compromis repris l'année suivante) n'est pas importée ici.
  for (const x of dejaVentes) ajoutsC.push({ libelle: `− ${x.ref.feuille} l.${x.ref.ligne} « ${x.libelle ?? ''} » ${eur(x.valeur as number)} : déjà comptée par le TOTAL VENTES — une vente, comptée une fois`, montant: -(x.valeur as number) });
  const motifAcceptation = acceptation(f.fichier, o);
  const reconciliations = [
    reconcilier('Ventes (TOTAL VENTES du CA GLOBAL)', f.ventes?.valeurFichierTtc ?? null, cellsV, pf.textes.filter((t) => venteCells.has(cleOcc(f.fichier, t.ref.feuille, t.ref.ligne))), vendues, destins, ajoutsV, motifAcceptation, 0),
    reconcilier('Compromis en cours (TOTAL COMPROMIS du CA GLOBAL)', f.compromis?.valeurFichierTtc ?? null, cellsC, [], compromis, destins, ajoutsC, motifAcceptation,
      dejaVentes.reduce((s, x) => s + (x.valeur as number), 0)),
  ];
  // Les apporteurs : la somme de la ligne « Apporteur » de chaque onglet = les rétrocessions importées + les non importées.
  const rf = retros.filter((r) => r.fichier === f.fichier);
  const toutes = f.onglets.flatMap((o) => o.retrocessions);
  const ecartsR: Ecart[] = f.onglets.filter((o) => !f.ongletsComptes.includes(o.nom) && !rf.some((r) => r.m.onglet === o.nom))
    .flatMap((o) => o.retrocessions.map((m) => ({ libelle: `− ${o.nom}!${m.cellule} ${eur(m.montant)} : onglet sans vente comptée, non importée`, montant: -m.montant })));
  const sommeR = toutes.reduce((s, m) => s + m.montant, 0);
  const importeR = rf.reduce((s, r) => s + r.m.montant, 0);
  reconciliations.push({ quoi: 'Apporteurs (lignes « Apporteur » des onglets)', fichierTtc: sommeR, sommeCellules: sommeR, importeTtc: importeR, ecarts: ecartsR,
    resteInexplique: centimes(sommeR) + centimes(ecartsR.reduce((s, e) => s + e.montant, 0)) - centimes(importeR), bloquant: false });
  reconciliations[2].bloquant = reconciliations[2].resteInexplique !== 0;
  const bloque = reconciliations.some((r) => r.bloquant);
  return { fichier: f.fichier, societe: f.societe, annee: f.annee, reconciliations,
    nbVentes: vendues.length, ventesTtc: vendues.reduce((s, v) => s + v.honorairesTtc, 0), nbCompromis: compromis.length, compromisTtc: compromis.reduce((s, v) => s + v.honorairesTtc, 0),
    nbRetros: rf.length, retrosTtc: importeR, retrosARepartir: rf.filter((r) => r.venteCle === null), moisAConfirmer: vendues.filter((v) => v.mois === null),
    aRattacher: aRattacher.filter((a) => a.fichier === f.fichier), rapprochements: pf.rapprochements, nonImportees: pf.nonImportees, alertes: pf.alertes, bloque };
}
