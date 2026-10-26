import { lireMontant, lireTauxPourcent, verifierActivite, type TypeActivite } from './suivi/suivi';
import type { SuiviDossier } from './dossierLocation';

/**
 * ══ 🔴🔴 « SUIVI COMMERCIAL » DANS LA FICHE LOCATAIRE (Arno, 26/10/2026) — LES RÈGLES PURES ══════════════════════════════════════════
 * La fiche locataire (« Fiche locataire » du Suivi du mois, et la fiche du locataire dans la Location) montre AUSSI le bloc 4 de
 * « Nouveau locataire » — le MÊME composant (`BlocSuiviCommercial`), la MÊME vérification (`verifierActivite`), le MÊME calcul des
 * changements que le Dossier de location (`changementsSuivi`).
 *   · RATTACHEMENT (aujourd'hui) : une ligne de suivi appartient à un bail par `gestion_location_activite.bail_id` — une seule ligne
 *     « Bail » vivante par bail (index unique `gestion_location_activite_bail_uniq`, migration 406), créée ou mise à jour par
 *     `enregistrerActiviteBailTx` (`suiviRepo.ts`, INSERT … ON CONFLICT (bail_id) … DO UPDATE). Les lignes REPRISES du fichier de suivi
 *     (`source = 'import'`) peuvent n'avoir AUCUN bail (`bail_id` NULL, « non rattachées ») : elles n'ont ni dossier ni fiche de bail.
 *   · PRÉ-REMPLI quand le bloc a été VALIDÉ pour ce bail : la ligne porte une origine du contact. VIDE sinon — aucune ligne (bail repris
 *     sans suivi), ou une ligne dont l'origine est encore « à renseigner » (« À qualifier » dans le Suivi du mois : la même règle,
 *     `natureBienCalculee`). Un bloc vide n'écrase rien tant qu'on n'y a pas touché : les valeurs de la ligne restent.
 *   · ENREGISTRER modifie la MÊME ligne (jamais une seconde) ; sans ligne, il la crée, rattachée au bail. Journalisé (une ligne par champ).
 *   · LOCATAIRE EN PLACE : une ligne « Mandat de gestion seul » est montrée comme telle (nature, date du mandat, aucun honoraire de location).
 */
export const ECRAN_FICHE_LOCATAIRE_LOCATION = 'Fiche locataire (Location)' as const;

/** Une conversion « Bail » → « Mandat de gestion seul » (migration 431), telle que le Suivi du mois la lit. */
export interface ConversionLue { le: string; par: string; typeOrigine: string; dateOrigine: string }

/** Une ligne de suivi d'un bail du locataire, résumée (la liste repliée des autres baux et lignes : lecture seule). */
export interface ResumeLigneSuivi {
  activiteId: number; type: TypeActivite; dateSignature: string; negociateur: string; origine: string | null; honoHt: number;
  valide: boolean; conversion: ConversionLue | null;
}
export interface BailDuLocataire { bailId: number; titre: string; entree: string | null; sortie: string | null; lignes: ResumeLigneSuivi[] }

export type CourantSuivi =
  /** La ligne de suivi du bail : ses valeurs (pré-remplissage), la version (conflit), est-elle validée ? */
  | { sorte: 'ligne'; activiteId: number; bailId: number; lotId: number; titre: string; version: string; suivi: SuiviDossier; valide: boolean;
    locataireIds: number[]; conversion: ConversionLue | null; enPlace: { dateMandat: string | null } | null }
  /** Un bail sans ligne de suivi : le bloc est vide ; enregistrer CRÉE la ligne, rattachée à ce bail. */
  | { sorte: 'sans_ligne'; bailId: number; lotId: number; titre: string; locataireIds: number[]; enPlace: { dateMandat: string | null } | null }
  /** La ligne du Suivi n'a pas de bail (reprise du fichier, « non rattachée ») : rien n'est lu ni écrit ici. */
  | { sorte: 'non_rattache' }
  /** Le locataire n'a aucun bail : rien à suivre. */
  | { sorte: 'sans_bail' };

export interface LectureSuiviLocataire { locataireId: number; courant: CourantSuivi; autres: BailDuLocataire[] }

/** Le bloc a-t-il été validé pour ce bail ? L'origine du contact est renseignée (sinon : « À qualifier »). PUR. */
export const suiviValide = (s: { origineContact?: SuiviDossier['origineContact'] }): boolean => s.origineContact !== null && s.origineContact !== undefined;

/** Un bloc vide : rien n'est deviné. La nature reste celle de la ligne (un avenant reste un avenant), l'origine celle de la ligne (vide). PUR. */
export function suiviVide(o: { type?: TypeActivite; categoriePrime?: SuiviDossier['categoriePrime'] } = {}): SuiviDossier {
  return {
    type: o.type ?? 'bail', dateSignature: '', honoProprietaireHt: '', honoLocataireHt: '', negociateurId: null, apporteurId: null, apporteurTaux: '',
    mandatGestion: false, avecGestion: false, origineProprietaire: null, origineLocataire: null, origineContact: null, collegueId: null,
    commissionApporteur: '', primeMode: 'aucune', primeMontant: '', origineContactPrecision: '', apporteurMode: null, apporteurTauxGestion: '',
    categoriePrime: o.categoriePrime ?? null,
  };
}

/**
 * L'état de DÉPART du bloc : la ligne validée telle quelle ; sinon le bloc vide. Locataire en place (« Mandat de gestion seul ») : la
 * nature, la date du mandat et les honoraires à 0 sont posés d'office (le composant les fige), sans compter comme une modification. PUR.
 */
export function suiviDeDepart(c: CourantSuivi): SuiviDossier | null {
  if (c.sorte !== 'ligne' && c.sorte !== 'sans_ligne') return null;
  const base = c.sorte === 'ligne' && c.valide ? c.suivi
    : suiviVide(c.sorte === 'ligne' ? { type: c.suivi.type, categoriePrime: c.suivi.categoriePrime } : {});
  if (c.enPlace === null) return base;
  return { ...base, type: 'gestion_seule', honoProprietaireHt: '0', honoLocataireHt: '0', ...(c.enPlace.dateMandat !== null ? { dateSignature: c.enPlace.dateMandat } : {}) };
}

const MONTANTS = new Set<keyof SuiviDossier>(['honoProprietaireHt', 'honoLocataireHt', 'commissionApporteur', 'primeMontant']);
const TAUX = new Set<keyof SuiviDossier>(['apporteurTaux', 'apporteurTauxGestion']);
const normal = (k: keyof SuiviDossier, v: unknown): string => {
  if (v === null || v === undefined) return '';
  if (MONTANTS.has(k) || TAUX.has(k)) {
    const n = MONTANTS.has(k) ? lireMontant(v) : lireTauxPourcent(v);
    return n === undefined ? `?${String(v).trim()}` : n === null ? '' : String(n);
  }
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : String(v);
};

/** A-t-on touché au bloc depuis son état de départ ? (montants et taux comparés par leur valeur : « 500 » = « 500,00 ».) PUR. */
export function suiviTouche(depart: SuiviDossier, saisie: SuiviDossier): boolean {
  const cles = new Set([...Object.keys(depart), ...Object.keys(saisie)] as (keyof SuiviDossier)[]);
  return [...cles].some((k) => normal(k, depart[k]) !== normal(k, saisie[k]));
}

/**
 * « RESTE À RENSEIGNER » du bloc 4 — ce que « Nouveau locataire » exige pour l'enregistrer : la date de signature, l'origine du contact
 * (et son collègue, son apporteur ou son texte), les deux honoraires HT (0 si aucun ; le TTC des conditions d'entrée les porte à la
 * création) ; puis tout autre motif de la vérification commune. Locataire en place : aucun honoraire de location n'est demandé. PUR.
 */
export function manquesSuiviCommercial(s: SuiviDossier, o: { annuaire: boolean; enPlace?: boolean }): string[] {
  const m: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.dateSignature)) m.push('Suivi commercial : la date de signature');
  if (o.annuaire) {
    if (s.origineContact === null || s.origineContact === undefined) m.push('Suivi commercial : l’origine du contact');
    else if (s.origineContact === 'collegue' && (s.collegueId === null || s.collegueId === undefined)) m.push('Suivi commercial : le collègue');
    else if (s.origineContact === 'apporteur' && (s.apporteurId === null || s.apporteurId === undefined)) m.push('Suivi commercial : l’apporteur');
    else if (s.origineContact === 'personnalise' && (s.origineContactPrecision ?? '').trim() === '') m.push('Suivi commercial : l’origine personnalisée');
  }
  if (o.enPlace !== true) {
    if (s.honoProprietaireHt.trim() === '') m.push('Suivi commercial : honoraires propriétaire HT (0 si aucun)');
    if (s.honoLocataireHt.trim() === '') m.push('Suivi commercial : honoraires locataire HT (0 si aucun)');
  }
  if (m.length === 0) {
    const v = verifierActivite(s, { origineObligatoire: o.annuaire });
    if (!v.ok) m.push(`Suivi commercial : ${v.motif.replace(/\.$/, '')}`);
  }
  return m;
}
