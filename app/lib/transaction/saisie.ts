import { estCivilite, estModeCommission, estSociete, STATUTS, type Civilite, type ModeCommission, type MontantSaisi, type RoleLigne, type Societe, type SortePartie, type StatutVente } from './modele';

/**
 * TUILE « TRANSACTION » — la LECTURE d'une saisie venue de l'écran (vente, rétrocession, gestion du mois), avant toute écriture.
 * PUR : rend la saisie propre, ou le motif du refus (en français, montré tel quel). Aucun arrondi : les montants restent ceux saisis.
 */

export interface PartSaisie { negociateur: string; role: RoleLigne; montantTtc: number | null }
export interface VenteSaisie {
  societe: Societe;
  libelle: string;
  honorairesTtc: number;
  statut: StatutVente;
  annee: number;
  mois: number | null;
  dateCompromis: string | null;
  apporteur: string | null;
  note: string | null;
  /** LOT E (435) — le prix de vente (€), facultatif. */
  prixVente?: number | null;
  parts: PartSaisie[];
}
/** Les champs modifiables d'une vente (une modification n'en porte que certains). */
export type ChampsVente = Partial<Omit<VenteSaisie, 'societe' | 'parts'>>;

export interface RetroSaisie { societe: Societe; annee: number; mois: number; negociateur: string; montantTtc: number; apporteur: string | null; venteId: number | null }
export interface GestionSaisie { nbLots: number | null; honorairesHt: number | null; adhocHt: number | null; salarieHt: number | null; resteHt: number | null; note: string | null }

type Lu<T> = { ok: true; valeur: T } | { ok: false; motif: string };
const refus = <T>(motif: string): Lu<T> => ({ ok: false, motif });

const texte = (x: unknown): string | null => (typeof x === 'string' && x.trim() !== '' ? x.trim() : null);
/** Un montant : nombre fini, ou texte « 1 234,56 » ; `undefined` : illisible. */
export function montant(x: unknown): number | null | undefined {
  if (x === null || x === undefined || x === '') return null;
  if (typeof x === 'number') return Number.isFinite(x) ? x : undefined;
  if (typeof x !== 'string') return undefined;
  const t = x.replace(/[\s  €]/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(t)) return undefined;
  return Number(t);
}
const entier = (x: unknown, min: number, max: number): number | null | undefined => {
  if (x === null || x === undefined || x === '') return null;
  const n = typeof x === 'number' ? x : Number(x);
  return Number.isInteger(n) && n >= min && n <= max ? n : undefined;
};
const dateIso = (x: unknown): string | null | undefined => {
  if (x === null || x === undefined || x === '') return null;
  return typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && !Number.isNaN(Date.parse(`${x}T00:00:00Z`)) ? x : undefined;
};
const ROLES: readonly RoleLigne[] = ['negociateur', 'part', 'vendeur'];

function lireChamps(c: Record<string, unknown>, tous: boolean): Lu<ChampsVente> {
  const v: ChampsVente = {};
  if (tous || 'libelle' in c) { const l = texte(c.libelle); if (l === null) return refus('Le libellé (vendeur / acquéreur) est obligatoire.'); v.libelle = l; }
  if (tous || 'honorairesTtc' in c) {
    const m = montant(c.honorairesTtc);
    if (m === undefined || m === null || m < 0) return refus('Les honoraires TTC doivent être un montant positif ou nul.');
    v.honorairesTtc = m;
  }
  if (tous || 'statut' in c) { if (!STATUTS.includes(c.statut as StatutVente)) return refus('Statut inconnu.'); v.statut = c.statut as StatutVente; }
  if (tous || 'annee' in c) { const a = entier(c.annee, 2000, 2100); if (a === undefined || a === null) return refus('Année invalide.'); v.annee = a; }
  if (tous || 'mois' in c) { const m = entier(c.mois, 1, 12); if (m === undefined) return refus('Mois invalide (1 à 12, ou vide : « mois à confirmer »).'); v.mois = m; }
  if (tous || 'dateCompromis' in c) { const d = dateIso(c.dateCompromis); if (d === undefined) return refus('Date du compromis invalide (AAAA-MM-JJ).'); v.dateCompromis = d; }
  if (tous || 'apporteur' in c) v.apporteur = texte(c.apporteur);
  if (tous || 'note' in c) v.note = texte(c.note);
  if ('prixVente' in c) {
    const p = montant(c.prixVente);
    if (p === undefined || (p !== null && p < 0)) return refus('Le prix de vente doit être un montant positif (ou vide).');
    v.prixVente = p;
  }
  return { ok: true, valeur: v };
}

/** Les négociateurs et leurs parts / payes d'une saisie (une ligne sans nom ne compte pas). */
function lireParts(brut: unknown): Lu<PartSaisie[]> {
  const parts: PartSaisie[] = [];
  for (const p of Array.isArray(brut) ? brut : []) {
    const o = (p ?? {}) as Record<string, unknown>;
    const n = texte(o.negociateur);
    if (n === null) continue; // une ligne vide de l'écran ne compte pas
    if (!ROLES.includes(o.role as RoleLigne)) return refus(`Rôle inconnu pour ${n}.`);
    const m = montant(o.montantTtc);
    if (m === undefined || (m !== null && m < 0)) return refus(`Montant illisible pour ${n}.`);
    parts.push({ negociateur: n, role: o.role as RoleLigne, montantTtc: m });
  }
  return { ok: true, valeur: parts };
}

export function lireVente(brut: unknown): Lu<VenteSaisie> {
  if (brut === null || typeof brut !== 'object') return refus('Saisie illisible.');
  const c = brut as Record<string, unknown>;
  if (!estSociete(c.societe)) return refus('Société inconnue.');
  const ch = lireChamps(c, true);
  if (!ch.ok) return ch;
  const lp = lireParts(c.parts);
  if (!lp.ok) return lp;
  const parts = lp.valeur;
  const v = ch.valeur as Required<ChampsVente>;
  return { ok: true, valeur: { societe: c.societe, libelle: v.libelle, honorairesTtc: v.honorairesTtc, statut: v.statut, annee: v.annee, mois: v.mois,
    dateCompromis: v.dateCompromis, apporteur: v.apporteur, note: v.note, ...(ch.valeur.prixVente !== undefined ? { prixVente: ch.valeur.prixVente } : {}), parts } };
}

/** Une modification : au moins un champ, chacun relu comme à la saisie. */
export function lireModification(brut: unknown): Lu<ChampsVente> {
  if (brut === null || typeof brut !== 'object') return refus('Modification illisible.');
  const r = lireChamps(brut as Record<string, unknown>, false);
  if (r.ok && Object.keys(r.valeur).length === 0) return refus('Aucun champ à modifier.');
  return r;
}

export function lireRetro(brut: unknown): Lu<RetroSaisie> {
  const c = (brut ?? {}) as Record<string, unknown>;
  if (!estSociete(c.societe)) return refus('Société inconnue.');
  const annee = entier(c.annee, 2000, 2100);
  const mois = entier(c.mois, 1, 12);
  if (annee === undefined || annee === null || mois === undefined || mois === null) return refus('Mois invalide.');
  const n = texte(c.negociateur);
  if (n === null) return refus('Le négociateur est obligatoire.');
  const m = montant(c.montantTtc);
  if (m === undefined || m === null) return refus('Le montant est obligatoire.');
  const vid = entier(c.venteId, 1, Number.MAX_SAFE_INTEGER);
  if (vid === undefined) return refus('Vente inconnue.');
  return { ok: true, valeur: { societe: c.societe, annee, mois, negociateur: n, montantTtc: m, apporteur: texte(c.apporteur), venteId: vid } };
}

export function lireGestion(brut: unknown): Lu<GestionSaisie> {
  const c = (brut ?? {}) as Record<string, unknown>;
  const lots = entier(c.nbLots, 0, 100000);
  if (lots === undefined) return refus('Nombre de lots invalide.');
  const champs = ['honorairesHt', 'adhocHt', 'salarieHt', 'resteHt'] as const;
  const lus: Record<string, number | null> = {};
  for (const k of champs) {
    const m = montant(c[k]);
    if (m === undefined) return refus('Montant illisible.');
    lus[k] = m;
  }
  return { ok: true, valeur: { nbLots: lots, honorairesHt: lus.honorairesHt, adhocHt: lus.adhocHt, salarieHt: lus.salarieHt, resteHt: lus.resteHt, note: texte(c.note) } };
}

// ── LOT D (migration 434) : un compromis ou une vente avec son dossier et sa répartition ─────────────────────────────────────────

/** 🔴 LOT BJ — un représentant d'une société, tel que saisi (une fiche de l'annuaire, particulier). */
export interface RepresentantSaisie { id: number | null; civilite: Civilite | null; nom: string; prenom: string | null; telephone: string | null; email: string | null; adresse: string | null }
export interface PersonneSaisie { id: number | null; role: 'vendeur' | 'acquereur'; nom: string; telephone: string | null; email: string | null; adresse: string | null;
  /** 🔴 LOT BJ (443) — particulier (défaut) ou société ; civilité et prénom d'un particulier ; les représentants d'une société. */
  type?: 'particulier' | 'societe'; civilite?: Civilite | null; prenom?: string | null; representants?: RepresentantSaisie[] }
/** LOT K — `societe` : la société CHOISIE pour cette vente (collaborateur des deux sociétés) ; pour les autres, le serveur l'ignore. */
export interface PartieSaisie { sorte: SortePartie; compteId: number | null; nom: string | null; coordonnees: string | null; pourcentage: number | null; montantHt: number | null; societe?: Societe | null }
export interface DossierSaisie {
  societe: Societe;
  statut: 'compromis' | 'vendue';
  /** Vide : tiré des personnes (« VENDEURS / ACQUÉREURS »). */
  libelle: string | null;
  honorairesTtc: number;
  dateCompromis: string | null;
  dateActePrevue: string | null;
  /** Le jour de l'acte (obligatoire pour une vente) : son mois est le mois du CA. */
  dateActe: string | null;
  adresseBien: string | null;
  note: string | null;
  entreeId: number | null;
  sortieId: number | null;
  apporteurId: number | null;
  apporteurNom: string | null;
  /** 🔴 LOT BH — « Supprimer » l'apporteur d'une affaire existante : le lien est retiré (nom, fiche, rétrocession), même un nom écrit d'import. */
  retirerApporteur?: boolean;
  /** La rétrocession de l'apporteur, dans l'unité de `retroUnite` (le nom d'avant est gardé : sans unité, c'est du TTC, comme avant). */
  retroApporteurTtc: number;
  /** LOT I (437) — l'unité de la rétrocession saisie ; absente de la saisie : 'ttc' (comme avant). */
  retroUnite: 'ht' | 'ttc';
  /**
   * LOT I (437) — les commissions versées aux négociateurs d'entrée et de sortie, chacune dans SON unité ; null : rien de saisi pour ce
   * côté. Absent (une saisie qui n'en parle pas) : les commissions enregistrées restent telles quelles.
   */
  commissions?: { entree: MontantSaisi | null; sortie: MontantSaisi | null;
    /** LOT R (440) — le taux de rémunération de chaque côté (%) ; null ou absent : le défaut (50 %). */
    taux?: { entree: number | null; sortie: number | null };
    /**
     * 🔴 LOT V — le mode de chaque côté : « calculee » (le serveur recalcule : honoraires du côté × taux, sur la répartition enregistrée) ou
     * « manuelle » (le montant envoyé, tel quel) ; null ou absent (écran d'avant ce lot) : le montant envoyé, comme avant.
     */
    mode?: { entree: ModeCommission | null; sortie: ModeCommission | null } };
  personnes: PersonneSaisie[];
  parties: PartieSaisie[];
  /** LOT E (435) — le prix de vente (€), facultatif. */
  prixVente: number | null;
  /** « Nouvelle vente » : les négociateurs et leurs parts / payes saisis comme avant (posés à la création seulement). */
  lignes: PartSaisie[];
}
const SORTES: readonly SortePartie[] = ['entree', 'sortie', 'entree_sortie', 'exterieure'];
const idOuNull = (x: unknown): number | null | undefined => entier(x, 1, Number.MAX_SAFE_INTEGER);

export function lireDossier(brut: unknown): Lu<DossierSaisie> {
  if (brut === null || typeof brut !== 'object') return refus('Saisie illisible.');
  const c = brut as Record<string, unknown>;
  if (!estSociete(c.societe)) return refus('Société inconnue.');
  if (c.statut !== 'compromis' && c.statut !== 'vendue') return refus('Statut inconnu (compromis ou vendue).');
  const h = montant(c.honorairesTtc);
  if (h === undefined || h === null || h < 0) return refus('La commission TTC doit être un montant positif ou nul.');
  const r = montant(c.retroApporteurTtc);
  if (r === undefined || (r !== null && r < 0)) return refus('La rétrocession de l’apporteur doit être un montant positif ou nul.');
  const dates: Record<string, string | null> = {};
  for (const [k, mot] of [['dateCompromis', 'du compromis'], ['dateActePrevue', 'prévue de l’acte'], ['dateActe', 'de l’acte']] as const) {
    const d = dateIso(c[k]);
    if (d === undefined) return refus(`Date ${mot} invalide (AAAA-MM-JJ).`);
    dates[k] = d;
  }
  if (c.statut === 'vendue' && dates.dateActe === null) return refus('Une vente porte la date de l’acte (son mois est le mois du CA).');
  const ids: Record<string, number | null> = {};
  for (const k of ['entreeId', 'sortieId', 'apporteurId'] as const) {
    const v = idOuNull(c[k]);
    if (v === undefined) return refus('Négociateur ou apporteur inconnu.');
    ids[k] = v;
  }
  const personnes: PersonneSaisie[] = [];
  for (const p of Array.isArray(c.personnes) ? c.personnes : []) {
    const o = (p ?? {}) as Record<string, unknown>;
    const nom = texte(o.nom);
    const id = idOuNull(o.id);
    if (id === undefined) return refus('Personne inconnue.');
    if (nom === null && id === null) { if (texte(o.telephone) ?? texte(o.email) ?? texte(o.adresse)) return refus('Chaque vendeur ou acquéreur a un nom.'); continue; }
    if (o.role !== 'vendeur' && o.role !== 'acquereur') return refus('Rôle inconnu (vendeur ou acquéreur).');
    // 🔴 LOT BJ — particulier (défaut) ou société ; une civilité inconnue est refusée ; une société garde ses représentants (un représentant vide
    // est ignoré, un représentant sans nom refusé).
    const type = o.type === 'societe' ? 'societe' as const : 'particulier' as const;
    const civ = o.civilite === undefined || o.civilite === null || o.civilite === '' ? null : estCivilite(o.civilite) ? o.civilite : undefined;
    if (civ === undefined) return refus('Civilité inconnue (M., Mme ou non renseignée).');
    const representants: RepresentantSaisie[] = [];
    if (type === 'societe') {
      for (const x of Array.isArray(o.representants) ? o.representants : []) {
        const r = (x ?? {}) as Record<string, unknown>;
        const rid = idOuNull(r.id);
        if (rid === undefined) return refus('Représentant inconnu.');
        const rciv = r.civilite === undefined || r.civilite === null || r.civilite === '' ? null : estCivilite(r.civilite) ? r.civilite : undefined;
        if (rciv === undefined) return refus('Civilité inconnue pour un représentant (M., Mme ou non renseignée).');
        const rnom = texte(r.nom);
        if (rnom === null && rid === null) { if (texte(r.prenom) ?? texte(r.telephone) ?? texte(r.email) ?? texte(r.adresse)) return refus('Chaque représentant a un nom (ou enlevez-le).'); continue; }
        representants.push({ id: rid, civilite: rciv, nom: rnom ?? '', prenom: texte(r.prenom), telephone: texte(r.telephone), email: texte(r.email), adresse: texte(r.adresse) });
      }
    }
    personnes.push({ id, role: o.role, nom: nom ?? '', telephone: texte(o.telephone), email: texte(o.email), adresse: texte(o.adresse),
      ...(o.type !== undefined || civ !== null || texte(o.prenom) !== null || representants.length > 0
        ? { type, civilite: type === 'societe' ? null : civ, prenom: type === 'societe' ? null : texte(o.prenom), representants } : {}) });
  }
  const parties: PartieSaisie[] = [];
  for (const p of Array.isArray(c.parties) ? c.parties : []) {
    const o = (p ?? {}) as Record<string, unknown>;
    if (!SORTES.includes(o.sorte as SortePartie)) return refus('Partie inconnue.');
    const compteId = idOuNull(o.compteId);
    if (compteId === undefined) return refus('Négociateur inconnu.');
    const pc = montant(o.pourcentage);
    const m = montant(o.montantHt);
    if (pc === undefined || m === undefined) return refus('Part illisible : un pourcentage ou un montant en chiffres.');
    if (o.societe != null && !estSociete(o.societe)) return refus('Société inconnue pour cette vente (CRITERIMMO ou MACJ).');
    parties.push({ sorte: o.sorte as SortePartie, compteId, nom: texte(o.nom), coordonnees: texte(o.coordonnees), pourcentage: pc, montantHt: pc === null ? m : null,
      societe: estSociete(o.societe) ? o.societe : null });
  }
  const lignes = lireParts(c.lignes);
  if (!lignes.ok) return lignes;
  const unite = (x: unknown): 'ht' | 'ttc' | undefined => (x === undefined || x === null || x === '' ? 'ttc' : x === 'ht' || x === 'ttc' ? x : undefined);
  const retroUnite = unite(c.retroApporteurUnite);
  if (retroUnite === undefined) return refus('Unité inconnue pour la rétrocession de l’apporteur (HT ou TTC).');
  let commissions: DossierSaisie['commissions'];
  if (c.commissions !== undefined && c.commissions !== null) {
    const o = c.commissions as Record<string, unknown>;
    const lus: Record<'entree' | 'sortie', MontantSaisi | null> = { entree: null, sortie: null };
    const taux: Record<'entree' | 'sortie', number | null> = { entree: null, sortie: null };
    const mode: Record<'entree' | 'sortie', ModeCommission | null> = { entree: null, sortie: null };
    for (const [k, mot] of [['entree', 'd’entrée'], ['sortie', 'de sortie']] as const) {
      const x = (o[k] ?? {}) as Record<string, unknown>;
      const m = montant(x.montant);
      if (m === undefined || (m !== null && m < 0)) return refus(`La commission du négociateur ${mot} doit être un montant positif (ou vide).`);
      const u = unite(x.unite);
      if (u === undefined) return refus(`Unité inconnue pour la commission du négociateur ${mot} (HT ou TTC).`);
      lus[k] = m === null ? null : { montant: m, unite: u };
      // LOT R — le taux de rémunération (%) : vide, le défaut.
      const t = montant(x.taux);
      if (t === undefined || (t !== null && t < 0)) return refus(`Le taux de rémunération du négociateur ${mot} doit être un pourcentage positif (ou vide).`);
      taux[k] = t;
      // LOT V — le mode : « calculee » ou « manuelle » ; toute autre valeur : inconnu (le montant envoyé, comme avant).
      mode[k] = estModeCommission(x.mode) ? x.mode : null;
    }
    commissions = { ...lus, taux, mode };
  }
  const prix = montant(c.prixVente);
  if (prix === undefined || (prix !== null && prix < 0)) return refus('Le prix de vente doit être un montant positif (ou vide).');
  return { ok: true, valeur: { prixVente: prix, lignes: lignes.valeur, societe: c.societe, statut: c.statut, libelle: texte(c.libelle), honorairesTtc: h, dateCompromis: dates.dateCompromis,
    dateActePrevue: dates.dateActePrevue, dateActe: dates.dateActe, adresseBien: texte(c.adresseBien), note: texte(c.note),
    entreeId: ids.entreeId, sortieId: ids.sortieId, apporteurId: c.retirerApporteur === true ? null : ids.apporteurId, apporteurNom: c.retirerApporteur === true ? null : texte(c.apporteurNom),
    retroApporteurTtc: c.retirerApporteur === true ? 0 : r ?? 0, retroUnite, ...(c.retirerApporteur === true ? { retirerApporteur: true } : {}),
    ...(commissions !== undefined ? { commissions } : {}), personnes, parties } };
}

/** LOT G — l'annulation d'un compromis : « Défaut de crédit » (par défaut) ou un autre motif ÉCRIT (obligatoire), la date, une note. */
export const MOTIF_DEFAUT_CREDIT = 'Défaut de crédit';
export interface AnnulationSaisie { motif: string; date: string; note: string | null }
export function lireAnnulation(brut: unknown): Lu<AnnulationSaisie> {
  const c = (brut ?? {}) as Record<string, unknown>;
  let motif: string | null;
  if (c.motif === 'defaut_credit') motif = MOTIF_DEFAUT_CREDIT;
  else if (c.motif === 'autre') { motif = texte(c.autre); if (motif === null) return refus('Écrivez le motif de l’annulation (« Autre motif »).'); }
  else return refus('Choisissez le motif de l’annulation.');
  const d = dateIso(c.date);
  if (d === undefined || d === null) return refus('Date de l’annulation invalide (AAAA-MM-JJ).');
  return { ok: true, valeur: { motif, date: d, note: texte(c.note) } };
}

/** « Acte signé » : le jour de l'acte. */
export function lireDateActe(x: unknown): Lu<string> {
  const d = dateIso(x);
  return d === undefined || d === null ? refus('Date de l’acte invalide (AAAA-MM-JJ).') : { ok: true, valeur: d };
}
