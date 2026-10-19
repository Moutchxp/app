/**
 * ══ 🔴🔴 L'ARBORESCENCE DRIVE VALIDÉE PAR ARNO (N1 → N10), CONSTRUITE POUR TOUS LES PROPRIÉTAIRES (19/10/2026) ═══════════
 *
 *   N1 « Base de données locative »
 *   › N2 « Actifs » / « Inactifs »
 *   › N3 propriétaire                    (le dossier copié du propriétaire, sa racine, ou un dossier neuf)
 *   › N4 adresse postale normalisée BAN  (à défaut, l'adresse telle qu'en base — signalée)
 *   › N5 un dossier par BIEN, toujours   (logement + annexes liées ; une annexe liée n'a pas de dossier propre)
 *   › N6 « 0 En attente » « 1 Propriétaire » « 2 Diagnostics » « 3 Photos » « 4 Syndic » « 5 Travaux » « 6 Locataires »
 *        « 1 Propriétaire » › N7 « PNO » › N8 2026 ; N7 « Taxe foncière » › N8 2026
 *        « 6 Locataires »   › N7 « Bail JJ/MM/AAAA – NOMS » (baux en cours ET passés connus en base)
 *                             › N8 « 1 Papiers d'identité » … « 5 Assurances » › N9 « Assurance habitation » › N10 2026
 *                                                             « 6 Entretien »  › N9 « Chaudière » › N10 2026
 *
 * Exécutée par des scripts qu'Arno lance lui-même (`.captures/arborescence/`, non versionnés) : I (création), J (déplacement
 * des contenus d'origine), K (enregistrement des identifiants), L (vérification). Ce module porte leurs RÈGLES et leurs
 * VERROUS, PURS et éprouvés sans réseau.
 *
 * 🔴 CHAQUE DOSSIER PORTE UNE CLÉ MÉTIER (étiquette `svav_arbo`), et c'est elle qui fait l'idempotence : on retrouve un
 * dossier par sa clé, sous son parent — JAMAIS par son nom. Un renommage reste un renommage.
 * 🔴 « Documents clients scannés » : aucune écriture, d'aucune sorte. Écritures seulement sous « Base de données
 * locative », jamais « 00 Arrivée des mails ». Ni suppression, ni corbeille, ni copie, ni renommage : on CRÉE et on DÉPLACE.
 */
import { createHash } from 'node:crypto';
import { nettoyerNom, porteLeNomProtege } from './driveGardeFou';
import { CONTENEURS, estIdDrive, type Conteneur } from './rangementDossiersCopies';

export const ETIQUETTE_ARBO = 'svav_arbo';
export const NOM_ARRIVEE = '00 Arrivée des mails';
export const EN_ATTENTE = '0 En attente';
export const CLASSEMENT_ORIGINE = 'Classement d’origine';
export const RUBRIQUES_N6 = ['0 En attente', '1 Propriétaire', '2 Diagnostics', '3 Photos', '4 Syndic', '5 Travaux', '6 Locataires'] as const;
/** Les rubriques qu'un lot orphelin partage avec son bien d'origine : des RACCOURCIS vers celles du bien d'origine. */
export const RUBRIQUES_PARTAGEES_ORPHELIN = [1, 2, 3, 4] as const;
export const SOUS_PROPRIETAIRE = ['PNO', 'Taxe foncière'] as const;
export const PIECES_BAIL = ['1 Papiers d’identité', '2 Profil financier', '3 Garants', '4 GLI', '5 Assurances', '6 Entretien'] as const;
/** N9 sous une pièce de bail : « 5 Assurances » › « Assurance habitation », « 6 Entretien » › « Chaudière ». */
export const SOUS_PIECES_BAIL: Readonly<Record<number, string>> = { 5: 'Assurance habitation', 6: 'Chaudière' };

const MIME_DOSSIER = 'application/vnd.google-apps.folder';
const MIME_RACCOURCI = 'application/vnd.google-apps.shortcut';
const API = 'https://www.googleapis.com/drive/v3/';

const court = (s: string): string => createHash('sha256').update(s).digest('hex').slice(0, 12);
const branche1 = (b: Conteneur): 'A' | 'I' => (b === 'Actifs' ? 'A' : 'I');

// ── LES ENTRÉES ──────────────────────────────────────────────────────────────────────────────────────────────────────

export interface ProprietaireArbo {
  id: number; wippimmo: string; nom: string;
  /** Actif au sens de l'application (ni archivé, ni sorti du portefeuille, ni supprimé). */
  actif: boolean;
  /** Les N3 qui existent déjà, par branche : le dossier copié, ou la racine du propriétaire. */
  n3Existants: Partial<Record<Conteneur, { id: string; nom: string }>>;
}
export interface LotArbo {
  id: number; wippimmo: string; proprietaireId: number | null;
  adresse: string | null; codePostal: string | null; commune: string | null;
  nature: string | null; typeBien: string | null; categorie: string | null; porte: string | null;
  /** Sorti du portefeuille (vendu) ou fin de gestion : un bien dont TOUS les lots sont inactifs est inactif. */
  inactif: boolean;
  annexeDetachee: boolean;
}
export interface AnnexeArbo { annexeId: number; parentId: number }
export interface RegroupementArbo { origineId: number; teteId: number; lotIds: readonly number[] }
export interface OccupationArbo { id: number; lotId: number; entree: string | null; sortie: string | null; locataire: string }
/** L'adresse BAN retenue pour un lot : sa clé (identifiant BAN) et son libellé. `null` = non normalisable. */
export interface AdresseBan { cle: string; libelle: string }

// ── LES NOMS ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/** `AAAA-MM-JJ` → `JJ/MM/AAAA` ; chaîne vide si inconnue. PUR. */
export const dateFr = (iso: string | null): string => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? ''); return m === null ? '' : `${m[3]}/${m[2]}/${m[1]}`; };

/** Minuscules, sans accents, ponctuation → espaces. PUR. */
export const normaliser = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** L'adresse telle qu'en base : « 12 rue X, 75002 Paris ». PUR. */
export function adresseTelleQuEnBase(l: Pick<LotArbo, 'adresse' | 'codePostal' | 'commune'>): string {
  const ville = [l.codePostal, l.commune].map((x) => (x ?? '').trim()).filter((x) => x !== '').join(' ');
  return [l.adresse, ville].map((x) => (x ?? '').trim().replace(/\s+/g, ' ')).filter((x) => x !== '').join(', ');
}

/** N4 : le libellé BAN, à défaut l'adresse telle qu'en base, à défaut « Adresse non renseignée ». PUR. */
export function nomAdresse(l: Pick<LotArbo, 'adresse' | 'codePostal' | 'commune'>, ban: AdresseBan | null): string {
  return nettoyerNom(ban?.libelle ?? (adresseTelleQuEnBase(l) || 'Adresse non renseignée'));
}

/** La clé d'une adresse N4 : l'identifiant BAN, à défaut le texte normalisé. PUR. */
export const cleAdresse = (l: Pick<LotArbo, 'adresse' | 'codePostal' | 'commune'>, ban: AdresseBan | null): string =>
  ban !== null ? `ban:${ban.cle}` : `txt:${normaliser(adresseTelleQuEnBase(l))}`;

const NON_RENSEIGNE = /^a renseigner$/i;
/** « Appartement Type 2 (lot 100) » : la désignation d'un lot, son numéro toujours (il distingue deux biens semblables). PUR. */
export function designationLot(l: Pick<LotArbo, 'wippimmo' | 'nature' | 'typeBien' | 'porte'>): string {
  const quoi = [l.nature, l.typeBien].map((x) => (x ?? '').trim()).filter((x) => x !== '' && !NON_RENSEIGNE.test(x));
  const dedoublonne = quoi.filter((x, i) => quoi.findIndex((y) => normaliser(y) === normaliser(x)) === i);
  const porte = (l.porte ?? '').trim() !== '' ? ` n°${l.porte!.trim()}` : '';
  const numero = l.wippimmo.startsWith('app-') ? '' : ` (lot ${l.wippimmo})`;
  return `${dedoublonne.join(' ') || 'Bien'}${porte}${numero}`;
}

/** N5 : le logement, puis ses annexes liées : « Appartement Type 2 (lot 100) + Parking (lot 101) ». PUR. */
export function nomBienArbo(tete: LotArbo, annexes: readonly LotArbo[]): string {
  return nettoyerNom([tete, ...[...annexes].sort((a, b) => a.id - b.id)].map(designationLot).join(' + '));
}

/** N7 : « Bail 01/09/2022 – DUPONT Jean, MARTIN Lea » ; une date inconnue est DITE, jamais inventée. PUR. */
export function nomBail(entree: string | null, locataires: readonly string[]): string {
  const noms = [...new Set(locataires.map((n) => n.trim().replace(/\s+/g, ' ')).filter((n) => n !== ''))];
  return nettoyerNom(`Bail ${dateFr(entree) || 'date inconnue'} – ${noms.join(', ') || 'locataire inconnu'}`);
}

// ── LA BAN LOCALE : CHOISIR L'ADRESSE ────────────────────────────────────────────────────────────────────────────────

export interface CandidatBan { cle: string; numero: number; suffixe: string | null; nomVoie: string; nomCommune: string; insee: string }

const ABREVIATIONS: Record<string, string> = {
  r: 'rue', av: 'avenue', ave: 'avenue', bd: 'boulevard', bld: 'boulevard', boul: 'boulevard', pl: 'place', sq: 'square', imp: 'impasse',
  all: 'allee', ch: 'chemin', chem: 'chemin', crs: 'cours', pass: 'passage', fg: 'faubourg', fbg: 'faubourg', rte: 'route', qu: 'quai', st: 'saint', ste: 'sainte',
  gal: 'general', mal: 'marechal', pdt: 'president', prof: 'professeur', dr: 'docteur',
};
const SUFFIXES = new Set(['bis', 'ter', 'quater', 'a', 'b', 'c', 'd']);

/** « 12 bis av. de la Paix » → numéro 12, suffixe « bis », mots de voie développés. `null` sans numéro ni voie. PUR. */
export function decouperAdresse(adresse: string | null): { numero: number; suffixe: string | null; voie: string[] } | null {
  const mots = normaliser(adresse ?? '').split(' ').filter((m) => m !== '');
  const m = /^(\d{1,4})([a-z]*)$/.exec(mots[0] ?? '');
  if (m === null) return null;
  let i = 1; let suffixe: string | null = m[2] !== '' && SUFFIXES.has(m[2]) ? m[2] : null;
  if (m[2] !== '' && suffixe === null) return null;
  if (suffixe === null && SUFFIXES.has(mots[1] ?? '') && (mots[1]!.length > 1 || mots.length > 3)) { suffixe = mots[1]!; i = 2; }
  const voie = mots.slice(i).map((x) => ABREVIATIONS[x] ?? x);
  return voie.length === 0 ? null : { numero: Number(m[1]), suffixe, voie };
}

/** Code INSEE attendu d'un code postal de Paris (75002 → 75102, 75116 → 75116). `null` hors Paris. PUR. */
export function inseeParis(cp: string | null): string | null {
  const c = (cp ?? '').trim();
  if (/^750(0[1-9]|1\d|20)$/.test(c)) return `751${c.slice(3)}`;
  if (c === '75116') return '75116';
  return null;
}

/**
 * LA BAN LOCALE : l'unique adresse qui porte le numéro, le suffixe et la voie du lot, dans sa commune. `null` = non
 * normalisable (aucune, ou plusieurs adresses distinctes). Le code postal est celui du lot (la BAN locale n'en porte pas) ;
 * Paris s'écrit « Paris » (l'arrondissement est dans le code postal). PUR.
 */
export function choisirAdresseBan(l: Pick<LotArbo, 'adresse' | 'codePostal' | 'commune'>, candidats: readonly CandidatBan[]): AdresseBan | null {
  const d = decouperAdresse(l.adresse);
  const cp = (l.codePostal ?? '').trim();
  if (d === null || !/^\d{5}$/.test(cp)) return null;
  const paris = inseeParis(cp);
  const commune = normaliser(l.commune ?? '');
  const voieLot = d.voie.join(' ');
  const ok = candidats.filter((c) => {
    if (c.numero !== d.numero || (c.suffixe ?? '').toLowerCase() !== (d.suffixe ?? '')) return false;
    if (paris !== null ? c.insee !== paris : normaliser(c.nomCommune) !== commune) return false;
    const v = normaliser(c.nomVoie).split(' ').map((x) => ABREVIATIONS[x] ?? x).join(' ');
    return v === voieLot;
  });
  const cles = [...new Set(ok.map((c) => c.cle))];
  if (cles.length !== 1) return null;
  const c = ok[0];
  const ville = paris !== null ? 'Paris' : c.nomCommune;
  return { cle: c.cle, libelle: `${c.numero}${c.suffixe ? ` ${c.suffixe}` : ''} ${c.nomVoie}, ${cp} ${ville}` };
}

// ── LES BIENS : logement + annexes liées, fiches autonomes ───────────────────────────────────────────────────────────

export interface BienArbo {
  /** Le lot qui présente le bien (le logement, ou la tête de la fiche autonome). */
  teteId: number;
  lotIds: number[];
  proprietaireId: number | null;
  inactif: boolean;
  /** Lot orphelin déjà autonome en base : le bien d'origine (sa tête), dont il partage « 1 Propriétaire » à « 4 Syndic ». */
  origineTeteId: number | null;
}

/**
 * LE PARTAGE DES LOTS EN BIENS, comme la tuile Location le lit (`regroupementRepo.lireFiche`). PUR.
 *   ① une fiche autonome ouverte (`gestion_bien_regroupement`) est un bien ; s'il ne contient pas son logement d'origine,
 *     c'est un lot orphelin, rattaché au bien qui contient ce logement ;
 *   ② une annexe détachée hors fiche autonome est un bien à elle seule, orpheline de son logement ;
 *   ③ un logement et ses annexes liées (non détachées, hors fiche autonome) forment un bien ;
 *   ④ tout autre lot est un bien à lui seul.
 */
export function partagerEnBiens(lots: readonly LotArbo[], annexes: readonly AnnexeArbo[], regroupements: readonly RegroupementArbo[]): BienArbo[] {
  const parId = new Map(lots.map((l) => [l.id, l]));
  const pris = new Map<number, number>();   // lot → tête de son bien
  const biens: (BienArbo & { origineLotId: number | null })[] = [];
  const ajouter = (teteId: number, lotIds: number[], origineLotId: number | null) => {
    const ids = lotIds.filter((id) => parId.has(id) && !pris.has(id));
    if (ids.length === 0) return;
    const tete = ids.includes(teteId) ? teteId : ids[0];
    for (const id of ids) pris.set(id, tete);
    biens.push({ teteId: tete, lotIds: ids, proprietaireId: parId.get(tete)!.proprietaireId, inactif: ids.every((id) => parId.get(id)!.inactif), origineTeteId: null, origineLotId });
  };
  for (const r of [...regroupements].sort((a, b) => a.teteId - b.teteId)) ajouter(r.teteId, [...r.lotIds], r.lotIds.includes(r.origineId) ? null : r.origineId);
  const parentDe = new Map(annexes.map((a) => [a.annexeId, a.parentId]));
  for (const l of [...lots].sort((a, b) => a.id - b.id)) {
    const p = parentDe.get(l.id);
    if (p !== undefined && l.annexeDetachee && !pris.has(l.id)) ajouter(l.id, [l.id], p);
  }
  for (const l of [...lots].sort((a, b) => a.id - b.id)) {
    if (pris.has(l.id) || parentDe.has(l.id)) continue;
    const liees = annexes.filter((a) => a.parentId === l.id).map((a) => a.annexeId)
      .filter((id) => !pris.has(id) && parId.get(id)?.annexeDetachee !== true && parId.get(id)?.proprietaireId === l.proprietaireId);
    ajouter(l.id, [l.id, ...liees.sort((a, b) => a - b)], null);
  }
  for (const l of [...lots].sort((a, b) => a.id - b.id)) if (!pris.has(l.id)) ajouter(l.id, [l.id], parentDe.get(l.id) ?? null);
  return biens.map(({ origineLotId, ...b }) => {
    const o = origineLotId === null ? null : pris.get(origineLotId) ?? null;
    return { ...b, origineTeteId: o !== null && o !== b.teteId ? o : null };
  });
}

/** Un bail : les occupations des lots d'un bien à la même date d'entrée. PUR. */
export interface BailArbo { cle: string; entree: string | null; sortie: string | null; locataires: string[]; nom: string }
export function bauxDuBien(bien: Pick<BienArbo, 'teteId' | 'lotIds'>, occupations: readonly OccupationArbo[]): BailArbo[] {
  const groupes = new Map<string, OccupationArbo[]>();
  for (const o of occupations) {
    if (!bien.lotIds.includes(o.lotId)) continue;
    const k = o.entree ?? `inconnue-${o.id}`;
    groupes.set(k, [...(groupes.get(k) ?? []), o]);
  }
  return [...groupes.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, os]) => {
    const sorties = os.map((o) => o.sortie);
    const sortie = sorties.some((s) => s === null) ? null : sorties.sort().at(-1) ?? null;
    const locataires = os.map((o) => o.locataire);
    return { cle: `l:${bien.teteId}:${k}`, entree: os[0].entree, sortie, locataires, nom: nomBail(os[0].entree, locataires) };
  });
}

/** Un bail court-il dans l'année ? (en cours, ou sorti pendant l'année) — seuls ceux-là reçoivent le dossier de l'année. PUR. */
export const bailDansLAnnee = (b: Pick<BailArbo, 'sortie'>, annee: number): boolean => b.sortie === null || b.sortie >= `${annee}-01-01`;

// ── LE PLAN ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export type SorteNoeudArbo = 'proprietaire' | 'adresse' | 'bien' | 'rubrique' | 'sous_rubrique' | 'annee' | 'bail' | 'piece_bail' | 'sous_piece_bail'
  | 'classement_origine' | 'raccourci';

export interface NoeudArbo {
  cle: string; sorte: SorteNoeudArbo; niveau: number; nom: string;
  /** Clé du parent ; pour un N3, la branche (le N2 existe déjà). */
  parent: string | { branche: Conteneur };
  branche: Conteneur;
  proprietaireId: number;
  lotId: number | null;
  /** N3 déjà existant (dossier copié ou racine) : on ne le crée pas. */
  existant: string | null;
  /** Raccourci : la clé du dossier visé (une rubrique du bien d'origine). */
  cible?: string;
  annee?: number;
  bailEntree?: string | null;
}

export interface PlanArbo {
  annee: number;
  noeuds: NoeudArbo[];
  /** Le N3 que la fiche ouvre (celui de sa branche), et le N5 de chaque lot (logement ET annexes liées). */
  fiches: { id: number; wippimmo: string; n3: string }[];
  lots: { id: number; wippimmo: string; n5: string }[];
  signalements: string[];
}

/**
 * LE PLAN COMPLET, calculé AVANT la première écriture. PUR.
 * `exclus` : les propriétaires qu'on ne touche pas (les 7 « vendus/perdus mais en gestion » restés dans le dossier d'import,
 * décision 4 ; les fiches supprimées).
 */
export function construirePlanArbo(e: {
  annee: number;
  proprietaires: readonly ProprietaireArbo[];
  lots: readonly LotArbo[];
  annexes: readonly AnnexeArbo[];
  regroupements: readonly RegroupementArbo[];
  occupations: readonly OccupationArbo[];
  adresses: ReadonlyMap<number, AdresseBan | null>;
  exclus: ReadonlySet<number>;
}): PlanArbo {
  const noeuds: NoeudArbo[] = []; const signalements: string[] = [];
  const parCle = new Map<string, NoeudArbo>();
  const poser = (n: NoeudArbo) => { if (!parCle.has(n.cle)) { parCle.set(n.cle, n); noeuds.push(n); } return parCle.get(n.cle)!; };
  const lots = new Map(e.lots.map((l) => [l.id, l]));
  const biens = partagerEnBiens(e.lots, e.annexes, e.regroupements);
  const props = new Map(e.proprietaires.map((p) => [p.id, p]));
  const fiches: PlanArbo['fiches'] = []; const lotsN5: PlanArbo['lots'] = [];

  const n3 = (p: ProprietaireArbo, b: Conteneur): NoeudArbo => poser({
    cle: `p:${p.id}:${branche1(b)}`, sorte: 'proprietaire', niveau: 3, branche: b, parent: { branche: b }, proprietaireId: p.id, lotId: null,
    existant: p.n3Existants[b]?.id ?? null,
    nom: nettoyerNom(p.n3Existants[b]?.nom ?? p.n3Existants[b === 'Actifs' ? 'Inactifs' : 'Actifs']?.nom ?? p.nom),
  });
  const brancheDuProprietaire = (p: ProprietaireArbo): Conteneur => (p.actif ? 'Actifs' : 'Inactifs');

  // Les N5 d'abord (les raccourcis d'un orphelin visent les rubriques de son bien d'origine).
  const n6Du = new Map<number, string[]>();
  const enCours: { bien: BienArbo; p: ProprietaireArbo; b: Conteneur; n5: NoeudArbo }[] = [];
  for (const bien of biens) {
    if (bien.proprietaireId === null) { signalements.push(`lot ${bien.teteId} sans propriétaire : aucun dossier`); continue; }
    if (e.exclus.has(bien.proprietaireId)) { signalements.push(`lot ${bien.teteId} : propriétaire exclu de ce lot — aucun dossier`); continue; }
    const p = props.get(bien.proprietaireId);
    if (p === undefined) { signalements.push(`lot ${bien.teteId} : propriétaire ${bien.proprietaireId} inconnu`); continue; }
    const b: Conteneur = p.actif && !bien.inactif ? 'Actifs' : 'Inactifs';
    const tete = lots.get(bien.teteId)!;
    const ban = e.adresses.get(tete.id) ?? null;
    if (ban === null) signalements.push(`lot ${tete.id} : adresse non normalisable (BAN) — « ${adresseTelleQuEnBase(tete) || 'vide'} » gardée telle qu’en base`);
    const p3 = n3(p, b);
    const n4 = poser({ cle: `a:${p.id}:${branche1(b)}:${court(cleAdresse(tete, ban))}`, sorte: 'adresse', niveau: 4, branche: b, parent: p3.cle,
      proprietaireId: p.id, lotId: null, existant: null, nom: nomAdresse(tete, ban) });
    const annexesLiees = bien.lotIds.filter((id) => id !== bien.teteId).map((id) => lots.get(id)!);
    const n5 = poser({ cle: `b:${bien.teteId}`, sorte: 'bien', niveau: 5, branche: b, parent: n4.cle, proprietaireId: p.id, lotId: bien.teteId,
      existant: null, nom: nomBienArbo(tete, annexesLiees) });
    n6Du.set(bien.teteId, RUBRIQUES_N6.map((_, i) => `r:${bien.teteId}:${i}`));
    for (const id of bien.lotIds) lotsN5.push({ id, wippimmo: lots.get(id)!.wippimmo, n5: n5.cle });
    enCours.push({ bien, p, b, n5 });
  }
  for (const { bien, p, b, n5 } of enCours) {
    const orphelin = bien.origineTeteId !== null && n6Du.has(bien.origineTeteId) ? bien.origineTeteId : null;
    if (bien.origineTeteId !== null && orphelin === null) signalements.push(`lot orphelin ${bien.teteId} : bien d’origine ${bien.origineTeteId} sans dossier — rubriques propres`);
    const annuels = !bien.inactif && p.actif;
    RUBRIQUES_N6.forEach((nom, i) => {
      const base = { niveau: 6, branche: b, parent: n5.cle, proprietaireId: p.id, lotId: bien.teteId, existant: null, nom };
      if (orphelin !== null && (RUBRIQUES_PARTAGEES_ORPHELIN as readonly number[]).includes(i)) {
        poser({ ...base, cle: `r:${bien.teteId}:${i}`, sorte: 'raccourci', cible: `r:${orphelin}:${i}` });
        return;
      }
      const r = poser({ ...base, cle: `r:${bien.teteId}:${i}`, sorte: 'rubrique' });
      if (i === 1) SOUS_PROPRIETAIRE.forEach((s, k) => {
        const sr = poser({ cle: `pr:${bien.teteId}:${k}`, sorte: 'sous_rubrique', niveau: 7, branche: b, parent: r.cle, proprietaireId: p.id, lotId: bien.teteId, existant: null, nom: s });
        if (annuels) poser({ cle: `y:${sr.cle}:${e.annee}`, sorte: 'annee', niveau: 8, branche: b, parent: sr.cle, proprietaireId: p.id, lotId: bien.teteId, existant: null, nom: String(e.annee), annee: e.annee });
      });
      if (i === 6) for (const bail of bauxDuBien(bien, e.occupations)) {
        const nb = poser({ cle: bail.cle, sorte: 'bail', niveau: 7, branche: b, parent: r.cle, proprietaireId: p.id, lotId: bien.teteId, existant: null, nom: bail.nom, bailEntree: bail.entree });
        PIECES_BAIL.forEach((pb, k) => {
          const np = poser({ cle: `${bail.cle}:${k + 1}`, sorte: 'piece_bail', niveau: 8, branche: b, parent: nb.cle, proprietaireId: p.id, lotId: bien.teteId, existant: null, nom: pb });
          const s9 = SOUS_PIECES_BAIL[k + 1];
          if (s9 === undefined) return;
          const n9 = poser({ cle: `${np.cle}:s`, sorte: 'sous_piece_bail', niveau: 9, branche: b, parent: np.cle, proprietaireId: p.id, lotId: bien.teteId, existant: null, nom: s9 });
          if (annuels && bailDansLAnnee(bail, e.annee)) poser({ cle: `y:${n9.cle}:${e.annee}`, sorte: 'annee', niveau: 10, branche: b, parent: n9.cle, proprietaireId: p.id, lotId: bien.teteId, existant: null, nom: String(e.annee), annee: e.annee });
        });
      }
    });
  }
  // Chaque propriétaire a son N3 (même sans bien), dans la branche de son statut ; la fiche ouvre celui-là.
  for (const p of e.proprietaires) {
    if (e.exclus.has(p.id)) continue;
    const b = brancheDuProprietaire(p);
    const x = n3(p, b);
    fiches.push({ id: p.id, wippimmo: p.wippimmo, n3: x.cle });
    for (const c of CONTENEURS) if (c !== b && p.n3Existants[c] !== undefined) n3(p, c);   // un N3 existant reste un N3
  }
  return { annee: e.annee, noeuds, fiches, lots: lotsN5, signalements };
}

/** « Classement d'origine » d'un N3 (créé seulement s'il reçoit quelque chose). PUR. */
export function noeudClassementOrigine(n3: NoeudArbo): NoeudArbo {
  return { cle: `co:${n3.cle}`, sorte: 'classement_origine', niveau: 4, branche: n3.branche, parent: n3.cle, proprietaireId: n3.proprietaireId, lotId: null, existant: null, nom: CLASSEMENT_ORIGINE };
}

/** Les compteurs du plan, par sorte et par niveau. PUR. */
export function compterPlan(p: PlanArbo): Record<string, number> {
  const c: Record<string, number> = {};
  for (const n of p.noeuds) {
    const k = n.existant !== null ? `${n.sorte} (existant)` : n.sorte;
    c[k] = (c[k] ?? 0) + 1;
    c[`N${n.niveau}`] = (c[`N${n.niveau}`] ?? 0) + 1;
  }
  return c;
}

// ── J — OÙ VA LE CONTENU D'ORIGINE ───────────────────────────────────────────────────────────────────────────────────

export interface ElementSource { id: string; nom: string; dossier: boolean; raccourci: boolean; vide?: boolean }
export interface DeplacementArbo { id: string; nom: string; de: string; versCle: string; motif: string }

/**
 * LE CONTENU D'ORIGINE D'UN PROPRIÉTAIRE, et où il va (décisions 2 et 3). PUR. Aucun tri, aucun renommage : on DÉPLACE
 * des éléments entiers, leur structure interne conservée.
 *   · `copie` : le dossier copié EST le N3 ; ses enfants vont dans « 0 En attente » du bien (le bien qui le cite comme dossier
 *     attitré, sinon le bien unique du propriétaire), sinon dans « Classement d'origine » ;
 *   · `racine` : chaque dossier copié sous la racine va, ENTIER, dans « 0 En attente » du bien qui le cite (ou du bien unique) ;
 *     un sous-dossier d'adresse cité par un bien y va d'abord, seul ; le reste va dans « Classement d'origine » ;
 *   · `ancien` : le dossier de l'ancien squelette « 1 Propriétaires » reste où il est ; ses fichiers et dossiers vont dans
 *     « 0 En attente » du bien unique, sinon dans « Classement d'origine » — sauf les raccourcis vers l'ancien squelette et
 *     les « En attente » vides, qui ne sont pas du contenu (un « En attente » non vide : son contenu est déplacé).
 * `biens` : les biens du propriétaire (tête) et le dossier attitré de chacun de leurs lots. `n3Cle` : le N3 du dossier source.
 */
export function deplacementsDuProprietaire(o: {
  sorte: 'copie' | 'racine' | 'ancien';
  sourceId: string;
  n3Cle: string;
  enfants: readonly ElementSource[];
  /** Pour `racine` : les enfants de chaque dossier copié (pour y trouver un sous-dossier d'adresse cité par un bien). */
  petitsEnfants?: ReadonlyMap<string, readonly ElementSource[]>;
  /** Pour `ancien` : le contenu d'un « En attente » non vide. */
  contenuEnAttente?: ReadonlyMap<string, readonly ElementSource[]>;
  biens: readonly { teteId: number; dossiers: readonly string[]; branche?: Conteneur }[];
  /** La branche du N3 source : le « bien unique » ne vaut que dans la MÊME branche (un dossier rangé dans « Inactifs » ne
   *  rejoint pas un bien actif sans y être rattaché). */
  brancheSource?: Conteneur;
}): DeplacementArbo[] {
  const attente = (t: number) => `r:${t}:0`;
  const co = `co:${o.n3Cle}`;
  const citePar = (id: string) => o.biens.filter((b) => b.dossiers.includes(id));
  const memeBranche = o.biens.filter((b) => o.brancheSource === undefined || b.branche === undefined || b.branche === o.brancheSource);
  const unique = o.biens.length === 1 && memeBranche.length === 1 ? o.biens[0].teteId : null;
  const vers = (id: string): { cle: string; motif: string } => {
    const c = citePar(id);
    if (c.length === 1) return { cle: attente(c[0].teteId), motif: `dossier attitré du bien ${c[0].teteId}` };
    if (c.length === 0 && unique !== null) return { cle: attente(unique), motif: 'bien unique du propriétaire' };
    return { cle: co, motif: c.length > 1 ? 'cité par plusieurs biens' : o.biens.length === 0 ? 'propriétaire sans bien'
      : memeBranche.length === 0 ? 'dossier rangé dans l’autre branche que le bien : rattachement non établi' : 'plusieurs biens : rattachement impossible' };
  };
  const out: DeplacementArbo[] = [];
  if (o.sorte === 'copie') {
    const d = citePar(o.sourceId).length === 1 ? vers(o.sourceId) : null;
    for (const x of o.enfants) {
      const v = x.dossier && citePar(x.id).length === 1 ? vers(x.id) : d ?? vers(o.sourceId);
      out.push({ id: x.id, nom: x.nom, de: o.sourceId, versCle: v.cle, motif: v.motif });
    }
    return out;
  }
  if (o.sorte === 'racine') {
    for (const x of o.enfants) {
      if (x.dossier) for (const s of o.petitsEnfants?.get(x.id) ?? []) {
        const c = citePar(s.id);
        if (s.dossier && c.length === 1) out.push({ id: s.id, nom: s.nom, de: x.id, versCle: attente(c[0].teteId), motif: `sous-dossier d’adresse, dossier attitré du bien ${c[0].teteId}` });
      }
      const v = vers(x.id);
      const partiel = out.some((m) => m.de === x.id);
      const v2 = partiel && citePar(x.id).length === 0 ? { cle: co, motif: 'reste d’un dossier partagé entre plusieurs biens' } : v;
      out.push({ id: x.id, nom: x.nom, de: o.sourceId, versCle: v2.cle, motif: v2.motif });
    }
    return out;
  }
  for (const x of o.enfants) {
    if (x.raccourci) continue;
    if (x.dossier && x.nom.trim() === 'En attente') {
      for (const y of o.contenuEnAttente?.get(x.id) ?? []) if (!y.raccourci) { const v = vers(x.id); out.push({ id: y.id, nom: y.nom, de: x.id, versCle: v.cle, motif: v.motif }); }
      continue;
    }
    if (x.dossier && x.vide === true) continue;
    const v = vers(o.sourceId);
    out.push({ id: x.id, nom: x.nom, de: o.sourceId, versCle: v.cle, motif: v.motif });
  }
  return out;
}

// ── LE VERROU DES REQUÊTES DRIVE (I, J) ──────────────────────────────────────────────────────────────────────────────

export type ModeArbo = 'lecture' | 'creation' | 'deplacement';
export interface ContexteRequetesArbo {
  /** Les dossiers sous lesquels I peut créer : « Actifs », « Inactifs », les N3 existants, et les nœuds déjà créés. */
  parentsPermis: ReadonlySet<string>;
  /** Clé de chaque nœud permis à la création → son parent attendu (identifiant Drive), et la cible d'un raccourci. */
  creations: ReadonlyMap<string, { parent: string; nom: string; mime: 'dossier' | 'raccourci'; cible?: string }>;
  /** J : élément → { de, vers } exacts. */
  deplacements: ReadonlyMap<string, { de: string; vers: string }>;
  /** Jamais un parent ni une destination : la racine, « 00 Arrivée des mails », « Documents clients scannés » et ses ancêtres, le dossier d'import. */
  interdits: ReadonlySet<string>;
}

const corpsJson = (corps: string): Record<string, unknown> | null => {
  try { const o = JSON.parse(corps) as unknown; return o !== null && typeof o === 'object' && !Array.isArray(o) ? o as Record<string, unknown> : null; } catch { return null; }
};
const memesCles = (o: Record<string, unknown>, cles: readonly string[]) => Object.keys(o).sort().join(',') === [...cles].sort().join(',');
export const CLE_ARBO_VALIDE = /^(p|a|b|r|pr|l|y|co):[A-Za-z0-9:._-]{1,100}$/;

/**
 * La requête Drive est-elle permise ? `null` = oui ; sinon le motif. PUR.
 *   · toujours : GET de métadonnées (jamais `alt=media`) ;
 *   · « creation » : POST files qui crée un DOSSIER (ou un RACCOURCI vers une rubrique du bien d'origine) DU PLAN : nom,
 *     parent et étiquette `svav_arbo` exactement ceux du plan, et rien d'autre ;
 *   · « deplacement » : PATCH files/<id>?addParents=<vers>&removeParents=<de>, corps vide, exactement le couple du plan.
 * Tout le reste est refusé : DELETE, corbeille, copie, renommage, partage, upload, untrash, emptyTrash…
 */
export function refusRequeteArbo(url: string, init: { method?: string; body?: unknown } | undefined, mode: ModeArbo, ctx: ContexteRequetesArbo): string | null {
  let u: URL;
  try { u = new URL(url); } catch { return 'adresse illisible'; }
  if (!url.startsWith(API)) return `hors de l’API Drive v3 : ${u.origin}${u.pathname}`;
  const methode = (init?.method ?? 'GET').toUpperCase();
  const chemin = u.pathname.replace(/^\/drive\/v3\//, '');
  if (methode === 'GET') return u.searchParams.get('alt') === 'media' ? 'lecture de contenu (alt=media) refusée : métadonnées seulement' : null;
  if (mode === 'lecture') return `${methode} refusé : ce script ne fait que lire`;
  if (methode === 'DELETE') return 'DELETE refusé';
  if (/emptyTrash|permissions|revisions|comments|watch|upload|untrash|copy/i.test(chemin)) return `${chemin} refusé`;
  const corps = typeof init?.body === 'string' ? init.body : init?.body === undefined ? '' : null;
  if (corps === null) return 'corps de requête illisible';
  if (/"trashed"/.test(corps)) return 'la corbeille est refusée ici';

  if (mode === 'creation') {
    if (methode !== 'POST' || chemin !== 'files') return `${methode} ${chemin} refusé en mode création`;
    if ([...u.searchParams.keys()].some((k) => k === 'addParents' || k === 'removeParents')) return 'création refusée : aucun déplacement';
    const o = corpsJson(corps); if (o === null) return 'création refusée : corps illisible';
    const e = o.appProperties as Record<string, unknown> | null;
    const cle = e !== null && typeof e === 'object' && memesCles(e, [ETIQUETTE_ARBO]) ? String(e[ETIQUETTE_ARBO]) : '';
    if (!CLE_ARBO_VALIDE.test(cle)) return `création refusée : l’étiquette ${ETIQUETTE_ARBO} (et elle seule) est exigée`;
    const attendu = ctx.creations.get(cle);
    if (attendu === undefined) return `création refusée : ${cle} n’est pas un nœud du plan`;
    if (typeof o.name !== 'string' || o.name !== attendu.nom || porteLeNomProtege(o.name) || o.name.trim() === NOM_ARRIVEE || /[\u0000-\u001f\u007f]/.test(o.name)) return `création refusée : nom « ${String(o.name)} » différent du plan ou interdit`;
    if (!Array.isArray(o.parents) || o.parents.length !== 1 || o.parents[0] !== attendu.parent) return 'création refusée : le parent n’est pas celui du plan';
    if (!ctx.parentsPermis.has(attendu.parent) || ctx.interdits.has(attendu.parent)) return 'création refusée : parent hors de l’arborescence';
    if (attendu.mime === 'dossier') {
      if (!memesCles(o, ['appProperties', 'mimeType', 'name', 'parents']) || o.mimeType !== MIME_DOSSIER) return 'création refusée : un dossier, et rien d’autre';
      return null;
    }
    if (!memesCles(o, ['appProperties', 'mimeType', 'name', 'parents', 'shortcutDetails']) || o.mimeType !== MIME_RACCOURCI) return 'création refusée : un raccourci, et rien d’autre';
    const s = o.shortcutDetails as Record<string, unknown> | null;
    if (s === null || typeof s !== 'object' || !memesCles(s, ['targetId']) || s.targetId !== attendu.cible || !estIdDrive(s.targetId) || ctx.interdits.has(String(s.targetId))) return 'création refusée : la cible du raccourci n’est pas celle du plan';
    return null;
  }

  // déplacement
  const fichier = /^files\/([A-Za-z0-9_-]{10,128})$/.exec(chemin);
  if (methode !== 'PATCH' || fichier === null) return `${methode} ${chemin} refusé en mode déplacement`;
  const d = ctx.deplacements.get(fichier[1]);
  if (d === undefined) return `déplacement refusé : ${fichier[1]} n’est pas au plan`;
  const ajout = u.searchParams.getAll('addParents'); const retrait = u.searchParams.getAll('removeParents');
  if (ajout.length !== 1 || retrait.length !== 1 || ajout[0] !== d.vers || retrait[0] !== d.de) return 'déplacement refusé : origine ou destination différente du plan';
  if (ctx.interdits.has(d.vers) || ctx.interdits.has(fichier[1])) return 'déplacement refusé : élément ou destination protégé';
  if (corps !== '' && corps !== '{}') return 'déplacement refusé : aucun autre changement (nom, étiquette, corbeille) n’est permis';
  return null;
}

// ── K — L'ENREGISTREMENT DES IDENTIFIANTS, EN UNE TRANSACTION ────────────────────────────────────────────────────────

export interface LigneNoeudK {
  cle: string; sorte: SorteNoeudArbo; niveau: number; driveId: string; parentDriveId: string; branche: Conteneur;
  proprietaireId: number; lotId: number | null; nom: string; cibleDriveId: string | null; annee: number | null; bailEntree: string | null;
}
export interface LigneRepointageK { id: number; wippimmo: string; ancien: string | null; nouveau: string }

const lit = (s: string | null): string => (s === null ? 'NULL' : `'${s.replace(/'/g, "''")}'`);

/**
 * Le script psql de l'étape K (serveur puis recette). PUR. Il refuse de s'écrire si une ligne est malformée ou vise un
 * identifiant interdit. Joué :
 *   · s'arrête si la table `gestion_drive_noeud` manque (migration 389 pas encore appliquée) ou si la table des fiches
 *     ou des lots porte un déclencheur ;
 *   · vérifie CHAQUE nœud (clé déjà enregistrée = même identifiant Drive ; identifiant déjà pris par une autre clé =
 *     discordance), CHAQUE fiche et CHAQUE lot (même n° WIPPIMMO, dossier actuel = celui vu au plan, ou déjà le nouveau) ;
 *     une seule discordance annule TOUT ;
 *   · essai : READ ONLY, rien n'est écrit ; réel : insère les nœuds manquants, repointe `drive_dossier_id` des fiches (→ N3)
 *     et des lots (→ N5), relit, puis COMMIT.
 */
export function sqlEnregistrementArbo(
  noeuds: readonly LigneNoeudK[], fiches: readonly LigneRepointageK[], lots: readonly LigneRepointageK[],
  interdits: ReadonlySet<string>, auteur: string, reel: boolean,
): string {
  if (noeuds.length === 0) throw new Error('aucun nœud à enregistrer');
  const vus = new Set<string>(); const ids = new Set<string>();
  for (const n of noeuds) {
    if (!CLE_ARBO_VALIDE.test(n.cle)) throw new Error(`clé invalide : ${n.cle}`);
    if (!estIdDrive(n.driveId) || !estIdDrive(n.parentDriveId)) throw new Error(`${n.cle} : identifiant Drive invalide`);
    if (interdits.has(n.driveId)) throw new Error(`${n.cle} : ${n.driveId} est un dossier interdit`);
    if (vus.has(n.cle) || ids.has(n.driveId)) throw new Error(`${n.cle} : clé ou identifiant en double`);
    if (!Number.isSafeInteger(n.proprietaireId) || n.proprietaireId <= 0 || (n.lotId !== null && (!Number.isSafeInteger(n.lotId) || n.lotId <= 0))) throw new Error(`${n.cle} : identifiant de fiche ou de lot invalide`);
    if (n.cibleDriveId !== null && !estIdDrive(n.cibleDriveId)) throw new Error(`${n.cle} : cible invalide`);
    if (n.bailEntree !== null && !/^\d{4}-\d{2}-\d{2}$/.test(n.bailEntree)) throw new Error(`${n.cle} : date de bail invalide`);
    vus.add(n.cle); ids.add(n.driveId);
  }
  const verifier = (quoi: string, ls: readonly LigneRepointageK[], unique: boolean) => {
    const v = new Set<number>(); const nv = new Set<string>();
    for (const l of ls) {
      if (!Number.isSafeInteger(l.id) || l.id <= 0 || !/^[A-Za-z0-9_-]{1,64}$/.test(l.wippimmo)) throw new Error(`${quoi} ${l.id} invalide`);
      if (l.ancien !== null && !estIdDrive(l.ancien)) throw new Error(`${quoi} ${l.id} : ancien dossier invalide`);
      if (!ids.has(l.nouveau)) throw new Error(`${quoi} ${l.id} : ${l.nouveau} n’est pas un nœud enregistré`);
      if (v.has(l.id) || (unique && nv.has(l.nouveau))) throw new Error(`${quoi} ${l.id} en double`);
      v.add(l.id); nv.add(l.nouveau);
    }
  };
  verifier('fiche', fiches, true); verifier('lot', lots, false);
  const arret = (m: string) => `DO $x$ BEGIN RAISE EXCEPTION '${m.replace(/'/g, "''")}'; END $x$;`;
  const vn = noeuds.map((n) => `(${lit(n.cle)}, ${lit(n.sorte)}, ${n.niveau}, ${lit(n.driveId)}, ${lit(n.parentDriveId)}, ${lit(n.branche)}, ${n.proprietaireId}::bigint, ${n.lotId ?? 'NULL'}::bigint, ${lit(n.nom)}, ${lit(n.cibleDriveId)}, ${n.annee ?? 'NULL'}::smallint, ${lit(n.bailEntree)}::date)`).join(',\n  ');
  const rn = `rn(cle, sorte, niveau, drive_id, parent_drive_id, branche, proprietaire_id, lot_id, nom, cible_drive_id, annee, bail_entree) AS (VALUES\n  ${vn})`;
  const vr = (ls: readonly LigneRepointageK[]) => ls.length === 0 ? '(NULL::bigint, NULL::text, NULL::text, NULL::text)'
    : ls.map((l) => `(${l.id}::bigint, ${lit(l.wippimmo)}::text, ${lit(l.ancien)}::text, ${lit(l.nouveau)}::text)`).join(',\n  ');
  const rf = `rf(id, wippimmo, ancien, nouveau) AS (SELECT * FROM (VALUES\n  ${vr(fiches)}) v(id, wippimmo, ancien, nouveau) WHERE id IS NOT NULL)`;
  const rl = `rl(id, wippimmo, ancien, nouveau) AS (SELECT * FROM (VALUES\n  ${vr(lots)}) v(id, wippimmo, ancien, nouveau) WHERE id IS NOT NULL)`;
  return `-- ARBORESCENCE N3 → N10 : ENREGISTREMENT DES IDENTIFIANTS (Arno 19/10/2026) — ${reel ? 'RÉEL' : 'ESSAI À BLANC (READ ONLY)'} — ${noeuds.length} nœud(s), ${fiches.length} fiche(s), ${lots.length} lot(s)
\\set ON_ERROR_STOP 1
\\pset footer off
${reel ? 'BEGIN;' : 'BEGIN TRANSACTION READ ONLY;'}
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '300s';
SELECT (to_regclass('gestion_drive_noeud') IS NULL) AS sans_table \\gset
\\if :sans_table
  \\echo 'ARRÊT : la table gestion_drive_noeud n’existe pas — appliquer d’abord la migration 389.'
  ${arret('ENREGISTREMENT ANNULÉ : migration 389 absente')}
\\endif
SELECT count(*) AS colonne_lot FROM information_schema.columns WHERE table_name = 'gestion_annuaire_lot' AND column_name = 'drive_dossier_id' \\gset
SELECT (:colonne_lot = 0) AS sans_colonne \\gset
\\if :sans_colonne
  ${arret('ENREGISTREMENT ANNULÉ : migration 388 absente')}
\\endif
SELECT count(*) AS declencheurs FROM pg_trigger WHERE tgrelid IN ('gestion_annuaire_proprietaire'::regclass, 'gestion_annuaire_lot'::regclass) AND NOT tgisinternal \\gset
SELECT (:declencheurs > 0) AS avec_declencheur \\gset
\\if :avec_declencheur
  ${arret('ENREGISTREMENT ANNULÉ : déclencheur présent sur les fiches ou les lots')}
\\endif
${reel ? `LOCK TABLE gestion_drive_noeud IN SHARE ROW EXCLUSIVE MODE;
SELECT id FROM gestion_annuaire_proprietaire WHERE id IN (${fiches.map((l) => l.id).join(',') || '0'}) ORDER BY id FOR UPDATE;
SELECT id FROM gestion_annuaire_lot WHERE id IN (${lots.map((l) => l.id).join(',') || '0'}) ORDER BY id FOR UPDATE;` : ''}
WITH ${rn}
SELECT count(*) AS n_attendus,
       count(*) FILTER (WHERE g.id IS NULL AND d.id IS NULL) AS n_a_inserer,
       count(*) FILTER (WHERE g.id IS NOT NULL AND g.drive_id = rn.drive_id) AS n_deja,
       count(*) FILTER (WHERE (g.id IS NOT NULL AND g.drive_id <> rn.drive_id) OR (d.id IS NOT NULL AND d.cle <> rn.cle)) AS n_discordants,
       count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM gestion_annuaire_proprietaire p WHERE p.id = rn.proprietaire_id)
                         OR (rn.lot_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM gestion_annuaire_lot l WHERE l.id = rn.lot_id))) AS n_sans_fiche
  FROM rn LEFT JOIN gestion_drive_noeud g ON g.cle = rn.cle LEFT JOIN gestion_drive_noeud d ON d.drive_id = rn.drive_id AND d.cle <> rn.cle \\gset
WITH ${rf}, j AS (SELECT rf.*, p.id AS pid, p.wippimmo_id, p.drive_dossier_id FROM rf LEFT JOIN gestion_annuaire_proprietaire p ON p.id = rf.id)
SELECT count(*) AS f_attendues,
       count(*) FILTER (WHERE pid IS NULL OR wippimmo_id IS DISTINCT FROM wippimmo) AS f_absentes,
       count(*) FILTER (WHERE pid IS NOT NULL AND drive_dossier_id IS NOT DISTINCT FROM ancien AND drive_dossier_id IS DISTINCT FROM nouveau) AS f_a_repointer,
       count(*) FILTER (WHERE pid IS NOT NULL AND drive_dossier_id = nouveau) AS f_deja,
       count(*) FILTER (WHERE pid IS NOT NULL AND drive_dossier_id IS DISTINCT FROM ancien AND drive_dossier_id IS DISTINCT FROM nouveau) AS f_change,
       (SELECT count(*) FROM gestion_annuaire_proprietaire x JOIN rf r2 ON x.drive_dossier_id = r2.nouveau AND x.id <> r2.id) AS f_pris_ailleurs
  FROM j \\gset
WITH ${rl}, j AS (SELECT rl.*, l.id AS lid, l.wippimmo_id, l.drive_dossier_id FROM rl LEFT JOIN gestion_annuaire_lot l ON l.id = rl.id)
SELECT count(*) AS l_attendus,
       count(*) FILTER (WHERE lid IS NULL OR wippimmo_id IS DISTINCT FROM wippimmo) AS l_absents,
       count(*) FILTER (WHERE lid IS NOT NULL AND drive_dossier_id IS NOT DISTINCT FROM ancien AND drive_dossier_id IS DISTINCT FROM nouveau) AS l_a_repointer,
       count(*) FILTER (WHERE lid IS NOT NULL AND drive_dossier_id = nouveau) AS l_deja,
       count(*) FILTER (WHERE lid IS NOT NULL AND drive_dossier_id IS DISTINCT FROM ancien AND drive_dossier_id IS DISTINCT FROM nouveau) AS l_change
  FROM j \\gset
\\echo 'nœuds attendus :' :n_attendus '· à enregistrer :' :n_a_inserer '· déjà enregistrés :' :n_deja ' — fiches :' :f_attendues '· à repointer :' :f_a_repointer '· déjà :' :f_deja ' — lots :' :l_attendus '· à repointer :' :l_a_repointer '· déjà :' :l_deja
\\echo 'discordances — nœuds :' :n_discordants '· nœuds sans fiche/lot :' :n_sans_fiche '· fiches absentes :' :f_absentes '· dossier de fiche changé :' :f_change '· N3 déjà pris :' :f_pris_ailleurs '· lots absents :' :l_absents '· dossier de lot changé :' :l_change
SELECT (:n_discordants + :n_sans_fiche + :f_absentes + :f_change + :f_pris_ailleurs + :l_absents + :l_change > 0) AS discordance,
       (:n_a_inserer + :n_deja <> :n_attendus OR :f_a_repointer + :f_deja <> :f_attendues OR :l_a_repointer + :l_deja <> :l_attendus) AS compte_faux \\gset
\\if :discordance
  \\echo 'ARRÊT : au moins une discordance — RIEN n’est écrit.'
  ${arret('ENREGISTREMENT ANNULÉ : discordance')}
\\endif
\\if :compte_faux
  ${arret('ENREGISTREMENT ANNULÉ : compte incohérent')}
\\endif
${reel ? `WITH ${rn}, i AS (INSERT INTO gestion_drive_noeud (cle, sorte, niveau, drive_id, parent_drive_id, branche, proprietaire_id, lot_id, nom_a_la_creation, cible_drive_id, annee, bail_entree, enregistre_par)
  SELECT cle, sorte, niveau, drive_id, parent_drive_id, branche, proprietaire_id, lot_id, nom, cible_drive_id, annee, bail_entree, ${lit(auteur)} FROM rn
   WHERE NOT EXISTS (SELECT 1 FROM gestion_drive_noeud g WHERE g.cle = rn.cle) RETURNING 1)
SELECT count(*) AS n_inseres FROM i \\gset
WITH ${rf}, u AS (UPDATE gestion_annuaire_proprietaire p SET drive_dossier_id = rf.nouveau FROM rf
   WHERE p.id = rf.id AND p.wippimmo_id = rf.wippimmo AND p.drive_dossier_id IS NOT DISTINCT FROM rf.ancien AND p.drive_dossier_id IS DISTINCT FROM rf.nouveau RETURNING p.id)
SELECT count(*) AS f_modifiees FROM u \\gset
WITH ${rl}, u AS (UPDATE gestion_annuaire_lot l SET drive_dossier_id = rl.nouveau FROM rl
   WHERE l.id = rl.id AND l.wippimmo_id = rl.wippimmo AND l.drive_dossier_id IS NOT DISTINCT FROM rl.ancien AND l.drive_dossier_id IS DISTINCT FROM rl.nouveau RETURNING l.id)
SELECT count(*) AS l_modifies FROM u \\gset
WITH ${rn} SELECT count(*) AS n_relus FROM rn JOIN gestion_drive_noeud g ON g.cle = rn.cle AND g.drive_id = rn.drive_id \\gset
WITH ${rf} SELECT count(*) AS f_relues FROM rf JOIN gestion_annuaire_proprietaire p ON p.id = rf.id AND p.drive_dossier_id = rf.nouveau \\gset
WITH ${rl} SELECT count(*) AS l_relus FROM rl JOIN gestion_annuaire_lot l ON l.id = rl.id AND l.drive_dossier_id = rl.nouveau \\gset
SELECT (:n_inseres <> :n_a_inserer OR :n_relus <> :n_attendus OR :f_modifiees <> :f_a_repointer OR :f_relues <> :f_attendues OR :l_modifies <> :l_a_repointer OR :l_relus <> :l_attendus) AS ecart_apres \\gset
\\if :ecart_apres
  \\echo 'ARRÊT : relecture incohérente — nœuds' :n_inseres '/' :n_a_inserer 'relus' :n_relus '/' :n_attendus '· fiches' :f_modifiees 'relues' :f_relues '· lots' :l_modifies 'relus' :l_relus
  ${arret('ENREGISTREMENT ANNULÉ : relecture incohérente')}
\\endif
COMMIT;
\\echo 'ENREGISTREMENT FAIT : nœuds' :n_inseres 'enregistré(s),' :n_deja 'déjà là — fiches' :f_modifiees 'repointée(s),' :f_deja 'déjà faite(s) — lots' :l_modifies 'repointé(s),' :l_deja 'déjà fait(s)'` : `ROLLBACK;
\\echo 'ESSAI À BLANC TERMINÉ : rien n’est écrit — nœuds' :n_a_inserer 'à enregistrer — fiches' :f_a_repointer 'à repointer — lots' :l_a_repointer 'à repointer.'`}
`;
}
