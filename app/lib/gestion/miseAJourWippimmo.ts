/**
 * ══ 🔴🔴 MISE À JOUR DE LA BASE CLIENTS DEPUIS UN NOUVEL EXPORT WIPPIMMO — RÈGLES D'ARNO DU 20/10/2026 ═══════════════
 *
 * L'import initial (`annuaireRepo.appliquerPlan`) remplissait un annuaire vide. Depuis, l'application a été remplie à
 * la main : sorties validées, préavis, propriétaires remplacés, coordonnées retirées, fiches créées ici. Ce module
 * reprend la LECTURE de l'import initial (`construirePlan`, même rapprochement par identifiant WIPPIMMO) et décide,
 * ligne par ligne, ce qu'une mise à jour a le droit d'écrire. PUR : il reçoit l'état d'une base, rend des opérations,
 * et le SQL qui les joue — la même fonction sert au serveur et à la recette, chacun avec son état.
 *
 *   ① Rapprochement par Id WIPPIMMO : bailleur et lot par leur Id ; locataire par l'Id de SES BAUX (une ligne de
 *     Locataires.xlsx = un bail), puis seulement par sa clé de personne. Nouvel Id = création.
 *   ② JAMAIS de suppression, ni de marque « absent » : ce qui manque à l'export est LISTÉ, rien n'est écrit.
 *   ③ Une valeur saisie dans l'application n'est jamais écrasée (verrous par champ, propriétaire remplacé, coordonnée
 *     retirée ou saisie) : la contradiction est listée comme CONFLIT.
 *   ④ Dates d'entrée et de sortie mises à jour, sauf pour un bail dont la sortie a été validée dans l'application.
 *   ⑤ Une colonne absente de l'export (le format des bailleurs a changé : « Propriétaire » remplace civilité, nom et
 *     prénom ; « Télécoms » a disparu) n'efface rien : ce qu'elle portait reste tel quel.
 *
 * Le SQL est UNE transaction : chaque mise à jour vérifie que la ligne vaut encore ce qui a été lu (sinon tout est
 * annulé), chaque création repose sur une clé unique (un doublon lève, et tout est annulé).
 */
import type { FeuilleLue } from './xlsxLecture';
import type { PlanImport, ProprietairePlan } from './annuaireImport';
import { normaliserTexte, type ContactAnnuaire } from './annuaire';
import { choisirFicheARapprocher, type CandidateRapprochement } from './rapprochementImport';

// ══ L'EXPORT DES BAILLEURS, QUEL QUE SOIT SON FORMAT ═══════════════════════════════════════════════════════════════

/** Les colonnes de l'ancien export que le nouveau ne porte plus : ce qu'elles avaient posé reste intact. */
export type ColonneAbsente = 'civilite' | 'prenom' | 'telecoms';

/**
 * L'export du 20/10/2026 nomme le bailleur d'une seule colonne « Propriétaire » (« NOM Prénom ») au lieu de « Civilité »,
 * « Nom prop. » et « Prénom prop. ». On la lit comme le nom entier : sa forme normalisée est celle que les lots citent,
 * et celle de 305 fiches sur 307 en base. PUR.
 */
export function adapterBailleurs(f: FeuilleLue): { feuille: FeuilleLue; absentes: ColonneAbsente[] } {
  const vus = f.entetes.map((e) => normaliserTexte(e));
  const a = (t: string) => vus.includes(normaliserTexte(t));
  const absentes: ColonneAbsente[] = [];
  if (!a('Civilité')) absentes.push('civilite');
  if (!a('Prénom prop.') && !a('Prénom')) absentes.push('prenom');
  if (!a('Télécoms')) absentes.push('telecoms');
  if (a('Nom prop.') || a('Nom')) return { feuille: f, absentes };
  const i = vus.indexOf(normaliserTexte('Propriétaire'));
  if (i < 0) return { feuille: f, absentes };
  return { feuille: { entetes: f.entetes.map((e, k) => (k === i ? 'Nom' : e)), lignes: f.lignes }, absentes };
}

// ══ L'ÉTAT D'UNE BASE (lu en lecture seule) ═════════════════════════════════════════════════════════════════════════

type T = string | null;
export interface ProprietaireBase {
  id: string; wippimmo_id: string; cle_import: T; civilite: T; nom: T; prenom: T; nom_complet: T; nom_normalise: T;
  adresse: T; commune: T; code_postal: T; adresse_normalisee: T; relation_depuis: T;
  absent_le: T; archive_le: T; supprime_le: T; sorti_portefeuille_le: T;
}
export interface LotBase {
  id: string; wippimmo_id: string; proprietaire_id: T; proprietaire_texte: T; immeuble: T; nature: T; type_bien: T;
  adresse: T; commune: T; code_postal: T; adresse_normalisee: T; gestion_debut: T; gestion_fin: T;
  taux_honos_wippimmo: number | null; base_honos_wippimmo: T; absent_le: T; sorti_portefeuille_le: T;
}
export interface LocataireBase {
  id: string; cle_personne: string; wippimmo_id: string; cle_import: T; nom: T; nom_normalise: T; adresse: T;
  commune: T; code_postal: T; adresse_normalisee: T; absent_le: T; archive_le: T; supprime_le: T; sorti_portefeuille_le: T;
}
export interface OccupationBase {
  id: string; wippimmo_id: string; cle_import: T; locataire_id: string; lot_id: T; lot_wippimmo_id: T;
  entree: T; sortie: T; absent_le: T;
}
export interface ContactBase {
  id: string; sujet: 'proprietaire' | 'locataire'; sujet_id: string; sorte: 'telephone' | 'email'; valeur: string;
  valeur_brute: T; rang: number; libelle_source: T; absent_le: T; archive_le: T; origine: T;
}
export interface EtatBase {
  proprietaires: ProprietaireBase[]; lots: LotBase[]; locataires: LocataireBase[]; occupations: OccupationBase[];
  contacts: ContactBase[];
  verrous: { sujet: string; sujet_id: string; champ: string }[];
  /** Les liens bien ↔ propriétaire de la migration 278 (co-propriétaires, remplacements). */
  lotProprietaires: { lot_id: string; proprietaire_id: string; jusqu_a: T; cree_par_libelle: T }[];
  /** Les gestes de sortie journalisés (sortie, correction, annulation, clôture d'archivage). */
  journalSorties: { action: string; entite_id: string; valeur_apres: T; commentaire: T }[];
  /** Les préavis EN COURS (ni remplacés ni annulés). */
  preavis: { occupation_id: string; date_max: string }[];
  /** Colonnes facultatives présentes dans cette base. */
  avecTaux: boolean;
}

// ══ CE QUE LA MISE À JOUR REND ═════════════════════════════════════════════════════════════════════════════════════

export type Table = 'proprietaire' | 'lot' | 'locataire' | 'occupation' | 'contact';
/** Une référence : une ligne existante, ou une ligne créée par CETTE mise à jour (retrouvée par sa clé unique). */
export type Ref = { id: string } | { proprietaire: string } | { lot: string } | { locataire: string };
export type Val = string | number | null | Ref;
export type Op =
  | { sorte: 'creer'; table: Table; cle: string; valeurs: Record<string, Val> }
  | { sorte: 'maj'; table: Table; id: string; cle: string; avant: Record<string, Val>; apres: Record<string, Val> };

export interface Conflit { table: Table; cle: string; qui: string; champ: string; wippimmo: string | null; appli: string | null; motif: string }
export interface Absent { table: Exclude<Table, 'contact'>; id: string; cle: string; qui: string; dejaMarque: boolean }
export interface Signalement { table: Table; cle: string; qui: string; texte: string }
export interface Compte { crees: number; majs: number; inchanges: number }

export interface ResultatMaj {
  ops: Op[];
  comptes: Record<Table, Compte>;
  conflits: Conflit[];
  absents: Absent[];
  /** Coordonnées de l'import encore en base mais plus dans l'export : listées, jamais marquées. */
  contactsAbsents: { sujet: string; sujetId: string; sorte: string; colonneDisparue: boolean }[];
  signalements: Signalement[];
  revenus: number;
  /** Pour l'arborescence Drive : les nouveaux bailleurs, et les nouveaux lots avec leur bailleur. */
  nouveaux: { proprietaires: string[]; lots: { lot: string; proprietaire: Ref | null }[] };
}

// Colonnes WIPPIMMO de chaque table (celles qu'une mise à jour peut écrire), et leur type SQL.
const COLS_PROPRIETAIRE_NOM = ['civilite', 'nom', 'prenom', 'nom_complet', 'nom_normalise'] as const;
const COLS_PROPRIETAIRE = ['adresse', 'commune', 'code_postal', 'adresse_normalisee', 'relation_depuis'] as const;
const COLS_LOT = ['proprietaire_texte', 'immeuble', 'nature', 'type_bien', 'adresse', 'commune', 'code_postal',
  'adresse_normalisee', 'gestion_debut', 'gestion_fin'] as const;
const COLS_LOCATAIRE = ['nom', 'nom_normalise', 'adresse', 'commune', 'code_postal', 'adresse_normalisee'] as const;
export const TYPES_SQL: Readonly<Record<string, string>> = {
  relation_depuis: 'date', gestion_debut: 'date', gestion_fin: 'date', entree: 'date', sortie: 'date',
  taux_honos_wippimmo: 'numeric', proprietaire_id: 'bigint', lot_id: 'bigint', locataire_id: 'bigint', sujet_id: 'bigint',
  rang: 'integer', absent_le: 'timestamptz',
};
const ACTIONS_SORTIE = ['location_sortie_locataire', 'location_sortie_corrigee', 'location_sortie_annulee', 'location_cloture_archivage'];

/** Deux valeurs égales pour la base : `null` et `undefined` se valent, un nombre se compare en nombre. */
const forme = (v: Val | undefined): string | null => (v === null || v === undefined ? null
  : typeof v === 'object' ? ('id' in v ? v.id : JSON.stringify(v)) : typeof v === 'number' ? String(Number(v)) : String(v));
const memeVal = (a: Val | undefined, b: Val | undefined): boolean => forme(a) === forme(b);
const txt = (v: Val | undefined): string | null => (v === null || v === undefined ? null : typeof v === 'object' ? JSON.stringify(v) : String(v));

/**
 * Les occupations dont la sortie a été VALIDÉE dans l'application : chaque geste de sortie passe par
 * `ecrireDateSortie` et se journalise en nommant ses occupations (« occupation(s) 12, 13 ») ; la clôture d'un archivage
 * nomme le locataire (entite_id) et le bien (« location du bien 42 »). PUR.
 */
export function occupationsASortieValidee(
  journal: EtatBase['journalSorties'], occupations: readonly OccupationBase[],
): Set<string> {
  const out = new Set<string>();
  for (const j of journal) {
    if (!ACTIONS_SORTIE.includes(j.action)) continue;
    const c = j.commentaire ?? '';
    const liste = /occupation\(s\)\s+([0-9][0-9,\s]*)/.exec(c);
    if (liste) for (const id of liste[1].split(/[,\s]+/).filter((x) => x !== '')) out.add(id);
    const bien = /location du bien (\d+)/.exec(c);
    if (j.action === 'location_cloture_archivage' && bien) {
      for (const o of occupations) if (o.locataire_id === j.entite_id && o.lot_id === bien[1]) out.add(o.id);
    }
  }
  return out;
}

/**
 * ══ LE CŒUR : CE QUE CET EXPORT CHANGE À CETTE BASE ═══════════════════════════════════════════════════════════════
 * `aujourdhui` (AAAA-MM-JJ, Paris) sert à dire si WIPPIMMO tient un bien pour actif. PUR.
 */
export function calculerMiseAJour(
  plan: PlanImport, etat: EtatBase, o: { absentes: readonly ColonneAbsente[]; aujourdhui: string },
): ResultatMaj {
  const ops: Op[] = [];
  const conflits: Conflit[] = [];
  const signalements: Signalement[] = [];
  const zero = (): Compte => ({ crees: 0, majs: 0, inchanges: 0 });
  const comptes: Record<Table, Compte> = { proprietaire: zero(), lot: zero(), locataire: zero(), occupation: zero(), contact: zero() };
  let revenus = 0;
  const verrou = new Set(etat.verrous.map((v) => `${v.sujet}|${v.sujet_id}|${v.champ}`));
  const verrouille = (sujet: string, id: string, champ: string) => verrou.has(`${sujet}|${id}|${champ}`);
  const absentes = new Set(o.absentes);
  const nouveaux: ResultatMaj['nouveaux'] = { proprietaires: [], lots: [] };

  /** Compare, écarte les champs verrouillés (conflit), et pousse la mise à jour s'il reste quelque chose. */
  const majSi = (table: Table, ligne: Record<string, unknown> & { id: string }, cle: string, qui: string,
    voulu: Record<string, Val>, sujetVerrou: string | null, extra: Record<string, Val> = {}): boolean => {
    const avant: Record<string, Val> = {}; const apres: Record<string, Val> = {};
    for (const [col, v] of Object.entries(voulu)) {
      const actuel = (ligne[col] ?? null) as Val;
      if (memeVal(actuel, v)) continue;
      if (sujetVerrou !== null && (verrouille(sujetVerrou, ligne.id, col)
        || ((col === 'nom_complet' || col === 'nom_normalise') && (verrouille(sujetVerrou, ligne.id, 'nom') || verrouille(sujetVerrou, ligne.id, 'prenom'))))) {
        conflits.push({ table, cle, qui, champ: col, wippimmo: txt(v), appli: txt(actuel), motif: 'champ saisi dans l’application (verrou)' });
        continue;
      }
      avant[col] = actuel; apres[col] = v;
    }
    for (const [col, v] of Object.entries(extra)) { avant[col] = (ligne[col] ?? null) as Val; apres[col] = v; }
    if (Object.keys(apres).length === 0) return false;
    ops.push({ sorte: 'maj', table, id: ligne.id, cle, avant, apres });
    return true;
  };

  // ── ① LES PROPRIÉTAIRES ─────────────────────────────────────────────────────────────────────────────────────────
  const propParW = new Map(etat.proprietaires.map((p) => [p.wippimmo_id, p]));
  const propParCleImport = new Map(etat.proprietaires.filter((p) => p.cle_import !== null).map((p) => [p.cle_import as string, p]));
  const contactsVivants = (sujet: string, id: string) => etat.contacts
    .filter((c) => c.sujet === sujet && c.sujet_id === id && c.absent_le === null && c.archive_le === null).map((c) => c.valeur);
  let candidatsProp: CandidateRapprochement[] = etat.proprietaires
    .filter((p) => p.wippimmo_id.startsWith('app-') && p.cle_import === null && p.supprime_le === null)
    .map((p) => ({ id: p.id, nomNormalise: p.nom_normalise ?? '', valeurs: contactsVivants('proprietaire', p.id) }));
  const propParId = new Map(etat.proprietaires.map((p) => [p.id, p]));
  /** Bailleur de l'export (Id WIPPIMMO) → sa ligne en base, ou la clé de sa création. */
  const refProp = new Map<string, Ref>();
  const vusProp = new Set<string>();
  /** Bailleurs dont l'export porte un autre nom que la fiche : le texte de leurs lots ne change pas non plus. */
  const nomEnConflit = new Set<string>();

  for (const p of plan.proprietaires) {
    let b = propParW.get(p.wippimmoId) ?? propParCleImport.get(p.wippimmoId);
    let rapprochement = false;
    if (b === undefined) {
      const choix = choisirFicheARapprocher(candidatsProp, { nomNormalise: p.nomNormalise, valeurs: p.contacts.map((c) => c.valeur) });
      if (choix.etat === 'unique') { b = propParId.get(choix.id); rapprochement = true; candidatsProp = candidatsProp.filter((c) => c.id !== choix.id); }
      else if (choix.etat !== 'aucun') signalements.push({ table: 'proprietaire', cle: p.wippimmoId, qui: p.nomComplet, texte: `ressemble à la fiche ${choix.ids.join(', ')} créée dans l’application, sans certitude : fiche créée depuis l’export, rapprochement à décider` });
    }
    if (b === undefined) {
      comptes.proprietaire.crees += 1;
      ops.push({ sorte: 'creer', table: 'proprietaire', cle: p.wippimmoId, valeurs: valeursProprietaire(p) });
      refProp.set(p.wippimmoId, { proprietaire: p.wippimmoId });
      nouveaux.proprietaires.push(p.wippimmoId);
      continue;
    }
    vusProp.add(b.id);
    refProp.set(p.wippimmoId, { id: b.id });
    const voulu: Record<string, Val> = {};
    for (const c of COLS_PROPRIETAIRE) voulu[c] = valeursProprietaire(p)[c];
    // Le NOM : avec l'ancien format, champ par champ ; avec le nouveau, seule la forme normalisée se compare — une
    // différence est listée (on ne sait plus découper nom et prénom, et un autre nom sur le même Id se vérifie).
    if (!absentes.has('prenom') && !absentes.has('civilite')) for (const c of COLS_PROPRIETAIRE_NOM) voulu[c] = valeursProprietaire(p)[c];
    else if ((b.nom_normalise ?? '') !== p.nomNormalise) {
      nomEnConflit.add(p.wippimmoId);
      conflits.push({ table: 'proprietaire', cle: p.wippimmoId, qui: b.nom_complet ?? '', champ: 'nom', wippimmo: p.nomComplet, appli: b.nom_complet, motif: 'nom différent sur le même Id WIPPIMMO (export sans nom ni prénom séparés) : non appliqué' });
    }
    if (b.supprime_le !== null || b.archive_le !== null || b.sorti_portefeuille_le !== null) {
      conflits.push({ table: 'proprietaire', cle: p.wippimmoId, qui: b.nom_complet ?? '', champ: 'statut', wippimmo: 'présent dans l’export', appli: b.supprime_le !== null ? 'fiche supprimée' : b.archive_le !== null ? 'fiche archivée' : 'sorti du portefeuille', motif: 'statut saisi dans l’application conservé' });
    }
    const extra: Record<string, Val> = {};
    if (b.absent_le !== null) extra.absent_le = null;
    if (rapprochement) extra.cle_import = p.wippimmoId;
    if (majSi('proprietaire', b as never, p.wippimmoId, b.nom_complet ?? '', voulu, 'proprietaire', extra)) {
      comptes.proprietaire.majs += 1; if (b.absent_le !== null) revenus += 1;
    } else comptes.proprietaire.inchanges += 1;
  }

  // ── ② LES LOTS ──────────────────────────────────────────────────────────────────────────────────────────────────
  const parNom = new Map<string, ProprietairePlan[]>();
  for (const p of plan.proprietaires) parNom.set(p.nomNormalise, [...(parNom.get(p.nomNormalise) ?? []), p]);
  const lotParW = new Map(etat.lots.map((l) => [l.wippimmo_id, l]));
  const refLot = new Map<string, Ref>();
  const vusLot = new Set<string>();
  const liensApp = new Map<string, { proprietaire_id: string; jusqu_a: T; cree_par_libelle: T }[]>();
  for (const x of etat.lotProprietaires) liensApp.set(x.lot_id, [...(liensApp.get(x.lot_id) ?? []), x]);

  for (const l of plan.lots) {
    const bp = l.proprietaireCle === null ? undefined : parNom.get(l.proprietaireCle);
    const proprietaire: Ref | null = bp !== undefined && bp.length === 1 ? refProp.get(bp[0].wippimmoId) ?? null : null;
    const voulu: Record<string, Val> = {
      proprietaire_texte: l.proprietaireTexte, immeuble: l.immeuble, nature: l.nature, type_bien: l.typeBien,
      adresse: l.adresse, commune: l.commune, code_postal: l.codePostal, adresse_normalisee: l.adresseNormalisee,
      gestion_debut: l.gestionDebut, gestion_fin: l.gestionFin,
    };
    if (etat.avecTaux && l.tauxHonos !== undefined) { voulu.taux_honos_wippimmo = l.tauxHonos ?? null; voulu.base_honos_wippimmo = l.baseHonos ?? null; }
    const b = lotParW.get(l.wippimmoId);
    if (b !== undefined && bp !== undefined && bp.length === 1 && nomEnConflit.has(bp[0].wippimmoId) && (b.proprietaire_texte ?? '') !== l.proprietaireTexte) {
      delete voulu.proprietaire_texte;
      conflits.push({ table: 'lot', cle: l.wippimmoId, qui: b.proprietaire_texte ?? '', champ: 'proprietaire_texte', wippimmo: l.proprietaireTexte, appli: b.proprietaire_texte, motif: 'suit le nom du bailleur, lui-même en conflit : non appliqué' });
    }
    if (b === undefined) {
      // Un bien créé dans l'application, chez ce bailleur, à cette adresse : on ne le double pas.
      const pid = proprietaire !== null && 'id' in proprietaire ? proprietaire.id : null;
      const jumeaux = etat.lots.filter((x) => x.wippimmo_id.startsWith('app-') && pid !== null && x.proprietaire_id === pid
        && (x.adresse_normalisee ?? '') !== '' && x.adresse_normalisee === l.adresseNormalisee);
      if (jumeaux.length > 0) {
        conflits.push({ table: 'lot', cle: l.wippimmoId, qui: l.proprietaireTexte, champ: 'création', wippimmo: `nouveau lot ${l.wippimmoId}`, appli: `bien(s) ${jumeaux.map((x) => x.id).join(', ')} créé(s) dans l’application à la même adresse`, motif: 'doublon possible : lot non créé, rapprochement à décider' });
        continue;
      }
      comptes.lot.crees += 1;
      ops.push({ sorte: 'creer', table: 'lot', cle: l.wippimmoId, valeurs: { wippimmo_id: l.wippimmoId, proprietaire_id: proprietaire, ...voulu } });
      refLot.set(l.wippimmoId, { lot: l.wippimmoId });
      nouveaux.lots.push({ lot: l.wippimmoId, proprietaire });
      if (proprietaire === null) signalements.push({ table: 'lot', cle: l.wippimmoId, qui: l.proprietaireTexte, texte: 'nouveau lot sans bailleur rattaché (inconnu ou homonyme dans l’export)' });
      continue;
    }
    vusLot.add(b.id);
    refLot.set(l.wippimmoId, { id: b.id });
    // Le bailleur : jamais vidé ; jamais changé si l'application tient les propriétaires de ce bien (migration 278).
    const pidVoulu = proprietaire === null ? null : 'id' in proprietaire ? proprietaire.id : null;
    const extra: Record<string, Val> = {};
    if (proprietaire !== null && !(pidVoulu !== null && pidVoulu === b.proprietaire_id)) {
      const liens = (liensApp.get(b.id) ?? []).filter((x) => x.jusqu_a !== null || x.proprietaire_id !== pidVoulu);
      if (liens.length > 0) conflits.push({ table: 'lot', cle: l.wippimmoId, qui: l.proprietaireTexte, champ: 'propriétaire', wippimmo: l.proprietaireTexte, appli: `fiche ${b.proprietaire_id ?? 'aucune'} (propriétaires tenus dans l’application)`, motif: 'propriétaire saisi dans l’application : non remplacé' });
      else { extra.proprietaire_id = proprietaire; signalements.push({ table: 'lot', cle: l.wippimmoId, qui: l.proprietaireTexte, texte: `changement de bailleur : fiche ${b.proprietaire_id ?? 'aucune'} → ${pidVoulu ?? `nouveau bailleur ${JSON.stringify(proprietaire)}`}` }); }
    } else if (proprietaire === null && b.proprietaire_id !== null) {
      conflits.push({ table: 'lot', cle: l.wippimmoId, qui: l.proprietaireTexte, champ: 'propriétaire', wippimmo: `« ${l.proprietaireTexte} » non rattachable (inconnu ou homonyme)`, appli: `fiche ${b.proprietaire_id}`, motif: 'bailleur conservé' });
    }
    if (b.sorti_portefeuille_le !== null && (l.gestionFin === null || l.gestionFin > o.aujourdhui)) {
      conflits.push({ table: 'lot', cle: l.wippimmoId, qui: l.proprietaireTexte, champ: 'gestion', wippimmo: l.gestionFin === null ? 'en gestion (pas de fin)' : `fin de gestion le ${l.gestionFin}`, appli: 'sorti du portefeuille', motif: 'sortie du portefeuille saisie dans l’application conservée' });
    }
    if (b.absent_le !== null) extra.absent_le = null;
    if (majSi('lot', b as never, l.wippimmoId, l.proprietaireTexte, voulu, null, extra)) { comptes.lot.majs += 1; if (b.absent_le !== null) revenus += 1; }
    else comptes.lot.inchanges += 1;
  }

  // ── ③ LES LOCATAIRES : par l'Id de leurs baux d'abord ──────────────────────────────────────────────────────────
  const occParW = new Map(etat.occupations.map((x) => [x.wippimmo_id, x]));
  const occParCleImport = new Map(etat.occupations.filter((x) => x.cle_import !== null).map((x) => [x.cle_import as string, x]));
  const locParId = new Map(etat.locataires.map((x) => [x.id, x]));
  const locParCle = new Map(etat.locataires.map((x) => [x.cle_personne, x]));
  const locParCleImport = new Map(etat.locataires.filter((x) => x.cle_import !== null).map((x) => [x.cle_import as string, x]));
  let candidatsLoc: CandidateRapprochement[] = etat.locataires
    .filter((x) => x.wippimmo_id.startsWith('app-') && x.cle_import === null && x.supprime_le === null)
    .map((x) => ({ id: x.id, nomNormalise: x.nom_normalise ?? '', valeurs: contactsVivants('locataire', x.id) }));
  const occsDe = new Map<string, typeof plan.occupations>();
  for (const x of plan.occupations) occsDe.set(x.clePersonne, [...(occsDe.get(x.clePersonne) ?? []), x]);
  const refLoc = new Map<string, Ref>();
  const vusLoc = new Set<string>();
  const occBase = (w: string) => occParW.get(w) ?? occParCleImport.get(w);

  for (const p of plan.locataires) {
    const parBaux = new Set((occsDe.get(p.clePersonne) ?? []).map((x) => occBase(x.wippimmoId)?.locataire_id).filter((x): x is string => x !== undefined));
    let b: LocataireBase | undefined;
    let rapprochement = false;
    if (parBaux.size > 1) {
      // L'export réunit sous une personne des baux que la base tient pour plusieurs : on ne fusionne pas.
      conflits.push({ table: 'locataire', cle: p.wippimmoId, qui: p.nom, champ: 'personne', wippimmo: 'une seule personne pour ces baux', appli: `fiches ${[...parBaux].join(', ')}`, motif: 'regroupement non appliqué : chaque bail garde sa fiche' });
      for (const id of parBaux) vusLoc.add(id);
      continue;
    }
    if (parBaux.size === 1) b = locParId.get([...parBaux][0]);
    else b = locParCle.get(p.clePersonne) ?? locParCleImport.get(p.clePersonne);
    if (b === undefined) {
      const choix = choisirFicheARapprocher(candidatsLoc, { nomNormalise: p.nomNormalise, valeurs: p.contacts.map((c) => c.valeur) });
      if (choix.etat === 'unique') { b = locParId.get(choix.id); rapprochement = true; candidatsLoc = candidatsLoc.filter((c) => c.id !== choix.id); }
      else if (choix.etat !== 'aucun') signalements.push({ table: 'locataire', cle: p.wippimmoId, qui: p.nom, texte: `ressemble à la fiche ${choix.ids.join(', ')} créée dans l’application, sans certitude : fiche créée depuis l’export` });
    }
    if (b === undefined) {
      if (locParCle.has(p.clePersonne)) throw new Error(`clé de personne déjà prise : ${p.wippimmoId}`);
      comptes.locataire.crees += 1;
      ops.push({ sorte: 'creer', table: 'locataire', cle: p.clePersonne, valeurs: {
        cle_personne: p.clePersonne, wippimmo_id: p.wippimmoId, nom: p.nom, nom_normalise: p.nomNormalise,
        adresse: p.adresse, commune: p.commune, code_postal: p.codePostal, adresse_normalisee: p.adresseNormalisee } });
      refLoc.set(p.clePersonne, { locataire: p.clePersonne });
      continue;
    }
    vusLoc.add(b.id);
    refLoc.set(p.clePersonne, { id: b.id });
    const voulu: Record<string, Val> = { nom: p.nom, nom_normalise: p.nomNormalise, adresse: p.adresse, commune: p.commune,
      code_postal: p.codePostal, adresse_normalisee: p.adresseNormalisee };
    const extra: Record<string, Val> = {};
    if (b.absent_le !== null) extra.absent_le = null;
    if (rapprochement) extra.cle_import = p.clePersonne;
    if (b.supprime_le !== null || b.archive_le !== null || b.sorti_portefeuille_le !== null) {
      const enCours = (occsDe.get(p.clePersonne) ?? []).some((x) => x.sortie === null || x.sortie > o.aujourdhui);
      if (enCours) conflits.push({ table: 'locataire', cle: p.wippimmoId, qui: b.nom ?? '', champ: 'statut', wippimmo: 'bail en cours', appli: b.supprime_le !== null ? 'fiche supprimée' : b.archive_le !== null ? 'fiche archivée' : 'sorti du portefeuille', motif: 'statut saisi dans l’application conservé' });
    }
    if (majSi('locataire', b as never, p.wippimmoId, b.nom ?? '', voulu, 'locataire', extra)) { comptes.locataire.majs += 1; if (b.absent_le !== null) revenus += 1; }
    else comptes.locataire.inchanges += 1;
  }

  // ── ④ LES BAUX ──────────────────────────────────────────────────────────────────────────────────────────────────
  const protegees = occupationsASortieValidee(etat.journalSorties, etat.occupations);
  const preavis = new Map(etat.preavis.map((x) => [x.occupation_id, x.date_max]));
  const candidatsOcc = new Map<string, OccupationBase[]>();
  for (const x of etat.occupations) {
    if (x.cle_import !== null || !x.wippimmo_id.startsWith('app-')) continue;
    const k = `${x.locataire_id}|${x.lot_id}`; candidatsOcc.set(k, [...(candidatsOcc.get(k) ?? []), x]);
  }
  const vusOcc = new Set<string>();
  const nomLoc = new Map(plan.locataires.map((x) => [x.clePersonne, x.nom]));

  for (const x of plan.occupations) {
    const qui = nomLoc.get(x.clePersonne) ?? '';
    let b = occBase(x.wippimmoId);
    const lot: Ref | null = refLot.get(x.lotWippimmoId) ?? null;
    let loc: Ref | null = refLoc.get(x.clePersonne) ?? null;
    if (b !== undefined && loc === null) loc = { id: b.locataire_id };   // personne en conflit de regroupement
    if (loc === null) {
      conflits.push({ table: 'occupation', cle: x.wippimmoId, qui, champ: 'création', wippimmo: `nouveau bail ${x.wippimmoId}`, appli: 'locataire en conflit de regroupement', motif: 'bail non créé tant que la personne n’est pas tranchée' });
      continue;
    }
    let rapprochement = false;
    if (b === undefined && 'id' in loc && lot !== null && 'id' in lot) {
      const liste = candidatsOcc.get(`${loc.id}|${lot.id}`) ?? [];
      if (liste.length === 1) { b = liste[0]; rapprochement = true; candidatsOcc.delete(`${loc.id}|${lot.id}`); }
      else if (liste.length > 1) signalements.push({ table: 'occupation', cle: x.wippimmoId, qui, texte: 'plusieurs baux saisis dans l’application pour ce locataire et ce bien : bail créé depuis l’export' });
    }
    if (b === undefined) {
      comptes.occupation.crees += 1;
      ops.push({ sorte: 'creer', table: 'occupation', cle: x.wippimmoId, valeurs: {
        wippimmo_id: x.wippimmoId, locataire_id: loc, lot_id: lot, lot_wippimmo_id: x.lotWippimmoId, entree: x.entree, sortie: x.sortie } });
      continue;
    }
    vusOcc.add(b.id);
    const voulu: Record<string, Val> = {};
    const extra: Record<string, Val> = {};
    if (rapprochement || b.wippimmo_id.startsWith('app-')) {
      // Un bail saisi ici : l'export ne fait que compléter une date vide ; une date saisie qui diffère est listée.
      if (rapprochement) extra.cle_import = x.wippimmoId;
      for (const [col, w] of [['entree', x.entree], ['sortie', x.sortie]] as const) {
        const a = b[col];
        if (a === null && w !== null) voulu[col] = w;
        else if (a !== null && w !== null && a !== w) conflits.push({ table: 'occupation', cle: x.wippimmoId, qui, champ: col, wippimmo: w, appli: a, motif: 'bail saisi dans l’application : date conservée' });
      }
    } else {
      if (!b.wippimmo_id.startsWith('app-')) {
        voulu.lot_wippimmo_id = x.lotWippimmoId;
        if (lot !== null) voulu.lot_id = lot;
        else if (b.lot_id !== null) conflits.push({ table: 'occupation', cle: x.wippimmoId, qui, champ: 'lot', wippimmo: `lot ${x.lotWippimmoId} absent de l’export des lots`, appli: `bien ${b.lot_id}`, motif: 'bien conservé' });
      }
      if (protegees.has(b.id)) {
        for (const [col, w] of [['entree', x.entree], ['sortie', x.sortie]] as const) {
          if ((b[col] ?? null) !== w) conflits.push({ table: 'occupation', cle: x.wippimmoId, qui, champ: col, wippimmo: w, appli: b[col], motif: 'sortie validée dans l’application : dates conservées' });
        }
      } else { voulu.entree = x.entree; voulu.sortie = x.sortie; }
    }
    const dm = preavis.get(b.id);
    if (dm !== undefined && x.sortie !== null && x.sortie !== dm) {
      signalements.push({ table: 'occupation', cle: x.wippimmoId, qui, texte: `préavis saisi (date maximale ${dm}) et sortie WIPPIMMO ${x.sortie} : le préavis n’est pas touché` });
    }
    // La contrainte de la base (sortie ≥ entrée) vaut aussi pour un mélange d'une date gardée et d'une date écrite.
    const e = (voulu.entree ?? b.entree) as string | null; const s = (voulu.sortie ?? b.sortie) as string | null;
    if (e !== null && s !== null && s < e) {
      conflits.push({ table: 'occupation', cle: x.wippimmoId, qui, champ: 'dates', wippimmo: `${x.entree} → ${x.sortie}`, appli: `${b.entree} → ${b.sortie}`, motif: 'sortie antérieure à l’entrée une fois combinées : dates non écrites' });
      delete voulu.entree; delete voulu.sortie;
    }
    if (b.absent_le !== null) extra.absent_le = null;
    if (majSi('occupation', b as never, x.wippimmoId, qui, voulu, null, extra)) { comptes.occupation.majs += 1; if (b.absent_le !== null) revenus += 1; }
    else comptes.occupation.inchanges += 1;
  }

  // ── ⑤ LES COORDONNÉES ───────────────────────────────────────────────────────────────────────────────────────────
  const contactsAbsents: ResultatMaj['contactsAbsents'] = [];
  const parSujet = new Map<string, ContactBase[]>();
  for (const c of etat.contacts) { const k = `${c.sujet}|${c.sujet_id}`; parSujet.set(k, [...(parSujet.get(k) ?? []), c]); }
  const sujets: { sujet: 'proprietaire' | 'locataire'; ref: Ref; qui: string; cle: string; contacts: ContactAnnuaire[] }[] = [];
  for (const p of plan.proprietaires) { const r = refProp.get(p.wippimmoId); if (r) sujets.push({ sujet: 'proprietaire', ref: r, qui: p.nomComplet, cle: p.wippimmoId, contacts: p.contacts }); }
  for (const p of plan.locataires) { const r = refLoc.get(p.clePersonne); if (r) sujets.push({ sujet: 'locataire', ref: r, qui: p.nom, cle: p.wippimmoId, contacts: p.contacts }); }
  for (const s of sujets) {
    const id = 'id' in s.ref ? s.ref.id : null;
    const deja = id === null ? [] : parSujet.get(`${s.sujet}|${id}`) ?? [];
    if (id !== null && verrouille(s.sujet, id, 'contacts')) {
      for (const c of s.contacts) if (!deja.some((d) => d.sorte === c.sorte && d.valeur === c.valeur && d.absent_le === null && d.archive_le === null)) {
        conflits.push({ table: 'contact', cle: s.cle, qui: s.qui, champ: `coordonnée ${c.sorte}`, wippimmo: c.valeurBrute, appli: 'retirée ou absente', motif: 'coordonnées tenues dans l’application (verrou)' });
      }
      continue;
    }
    let rangSuivant = { telephone: Math.max(-1, ...deja.filter((d) => d.sorte === 'telephone').map((d) => d.rang)) + 1, email: Math.max(-1, ...deja.filter((d) => d.sorte === 'email').map((d) => d.rang)) + 1 };
    for (const c of s.contacts) {
      const d = deja.find((x) => x.sorte === c.sorte && x.valeur === c.valeur);
      if (d === undefined) {
        comptes.contact.crees += 1;
        const rang = id === null ? c.rang : rangSuivant[c.sorte];
        if (id !== null) rangSuivant = { ...rangSuivant, [c.sorte]: rang + 1 };
        ops.push({ sorte: 'creer', table: 'contact', cle: `${s.sujet}:${s.cle}:${c.sorte}:${c.valeur}`, valeurs: {
          sujet: s.sujet, sujet_id: s.ref, sorte: c.sorte, valeur: c.valeur, valeur_brute: c.valeurBrute, rang, libelle_source: c.libelleSource === '' ? null : c.libelleSource } });
        continue;
      }
      if (d.archive_le !== null) { conflits.push({ table: 'contact', cle: s.cle, qui: s.qui, champ: `coordonnée ${c.sorte}`, wippimmo: c.valeurBrute, appli: 'retirée dans l’application', motif: 'coordonnée retirée à la main : non rétablie' }); continue; }
      if (d.origine === 'saisie') { comptes.contact.inchanges += 1; continue; }
      const voulu: Record<string, Val> = { valeur_brute: c.valeurBrute, libelle_source: c.libelleSource === '' ? null : c.libelleSource };
      const extra: Record<string, Val> = d.absent_le !== null ? { absent_le: null } : {};
      if (majSi('contact', d as never, s.cle, s.qui, voulu, null, extra)) comptes.contact.majs += 1; else comptes.contact.inchanges += 1;
    }
    for (const d of deja) {
      if (d.absent_le !== null || d.archive_le !== null || d.origine === 'saisie') continue;
      if (s.contacts.some((c) => c.sorte === d.sorte && c.valeur === d.valeur)) continue;
      contactsAbsents.push({ sujet: s.sujet, sujetId: d.sujet_id, sorte: d.sorte, colonneDisparue: absentes.has('telecoms') && /^t[ée]l[ée]coms/i.test(d.libelle_source ?? '') });
    }
  }

  // ── ⑥ LES ABSENTS DE L'EXPORT : listés, jamais touchés ──────────────────────────────────────────────────────────
  const absents: Absent[] = [];
  for (const p of etat.proprietaires) if (!vusProp.has(p.id) && !p.wippimmo_id.startsWith('app-')) absents.push({ table: 'proprietaire', id: p.id, cle: p.wippimmo_id, qui: p.nom_complet ?? '', dejaMarque: p.absent_le !== null });
  for (const l of etat.lots) if (!vusLot.has(l.id) && !l.wippimmo_id.startsWith('app-')) absents.push({ table: 'lot', id: l.id, cle: l.wippimmo_id, qui: l.proprietaire_texte ?? '', dejaMarque: l.absent_le !== null });
  for (const l of etat.locataires) if (!vusLoc.has(l.id) && !l.wippimmo_id.startsWith('app-')) absents.push({ table: 'locataire', id: l.id, cle: l.wippimmo_id, qui: l.nom ?? '', dejaMarque: l.absent_le !== null });
  for (const x of etat.occupations) if (!vusOcc.has(x.id) && !x.wippimmo_id.startsWith('app-')) absents.push({ table: 'occupation', id: x.id, cle: x.wippimmo_id, qui: locParId.get(x.locataire_id)?.nom ?? '', dejaMarque: x.absent_le !== null });

  return { ops, comptes, conflits, absents, contactsAbsents, signalements, revenus, nouveaux };
}

function valeursProprietaire(p: ProprietairePlan): Record<string, Val> {
  return { wippimmo_id: p.wippimmoId, civilite: p.civilite, nom: p.nom, prenom: p.prenom, nom_complet: p.nomComplet,
    nom_normalise: p.nomNormalise, adresse: p.adresse, commune: p.commune, code_postal: p.codePostal,
    adresse_normalisee: p.adresseNormalisee, relation_depuis: p.relationDepuis };
}

// ══ LE SQL : UNE TRANSACTION, CHAQUE LIGNE VÉRIFIÉE ═════════════════════════════════════════════════════════════════

const TABLE_SQL: Record<Table, string> = {
  proprietaire: 'gestion_annuaire_proprietaire', lot: 'gestion_annuaire_lot', locataire: 'gestion_annuaire_locataire',
  occupation: 'gestion_annuaire_occupation', contact: 'gestion_annuaire_contact',
};
const COL = /^[a-z_]{1,40}$/;

function litteral(v: Val, col: string, refs: Map<string, string>): string {
  if (v === null) return 'NULL';
  if (typeof v === 'object') {
    if ('id' in v) { if (!/^\d+$/.test(v.id)) throw new Error(`identifiant invalide : ${v.id}`); return `${v.id}::bigint`; }
    const k = JSON.stringify(v); const r = refs.get(k);
    if (r === undefined) throw new Error(`référence non résolue : ${k}`);
    return r;
  }
  const t = TYPES_SQL[col] ?? 'text';
  const s = `'${String(v).replace(/'/g, "''")}'`;
  return t === 'text' ? s : `${s}::${t}`;
}

/** Une référence vers une ligne créée ici : relue par sa clé unique (STRICT : absente ou double, tout s'annule). */
function lecturesRefs(valeurs: Record<string, Val>, refs: Map<string, string>): string[] {
  const out: string[] = [];
  let n = 0;
  for (const v of Object.values(valeurs)) {
    if (v === null || typeof v !== 'object' || 'id' in v) continue;
    n += 1; const nom = `r${n}`;
    const [table, col, cle] = 'proprietaire' in v ? ['gestion_annuaire_proprietaire', 'wippimmo_id', v.proprietaire]
      : 'lot' in v ? ['gestion_annuaire_lot', 'wippimmo_id', v.lot] : ['gestion_annuaire_locataire', 'cle_personne', v.locataire];
    out.push(`  SELECT id INTO STRICT ${nom} FROM ${table} WHERE ${col} = '${cle.replace(/'/g, "''")}';`);
    refs.set(JSON.stringify(v), nom);
  }
  return out;
}

/**
 * Le script psql complet. `reel` : COMMIT ; sinon ROLLBACK (la transaction est jouée jusqu'au bout puis défaite — à
 * n'employer que sur une base jetable). `registre` : la passe inscrite dans `gestion_annuaire_import` et le journal.
 */
export function sqlMiseAJour(r: ResultatMaj, o: { reel: boolean; dossier: string; auteur: string; resume: string }): string {
  const corps: string[] = [];
  for (const op of r.ops) {
    const table = TABLE_SQL[op.table];
    const refs = new Map<string, string>();
    if (op.sorte === 'creer') {
      const cols = Object.keys(op.valeurs).filter((c) => op.valeurs[c] !== undefined);
      for (const c of cols) if (!COL.test(c)) throw new Error(`colonne invalide : ${c}`);
      corps.push(...lecturesRefs(op.valeurs, refs));
      corps.push(`  INSERT INTO ${table} (${cols.join(', ')}, importe_le) VALUES (${cols.map((c) => litteral(op.valeurs[c], c, refs)).join(', ')}, now());`);
    } else {
      const cols = Object.keys(op.apres);
      for (const c of cols) if (!COL.test(c)) throw new Error(`colonne invalide : ${c}`);
      corps.push(...lecturesRefs(op.apres, refs));
      const set = cols.map((c) => `${c} = ${litteral(op.apres[c], c, refs)}`).join(', ');
      const garde = cols.map((c) => `${c} IS NOT DISTINCT FROM ${litteral(op.avant[c], c, refs)}`).join(' AND ');
      corps.push(`  UPDATE ${table} SET ${set}, importe_le = now() WHERE id = ${litteral({ id: op.id }, 'id', refs)} AND ${garde};`);
      corps.push(`  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION 'DISCORDANCE : % % a changé depuis la lecture — tout est annulé', '${op.table}', '${op.cle.replace(/'/g, "''")}'; END IF;`);
    }
  }
  const c = r.comptes;
  const absentsNombre = r.absents.length;
  const registre = [
    `  INSERT INTO gestion_annuaire_import (mode, dossier, auteur_libelle, termine_le, resultat,`,
    `    proprietaires_crees, proprietaires_majs, proprietaires_inchanges, lots_crees, lots_majs, lots_inchanges,`,
    `    locataires_crees, locataires_majs, locataires_inchanges, occupations_creees, occupations_majs, occupations_inchangees,`,
    `    contacts_crees, contacts_retires, disparus, revenus)`,
    `  VALUES ('applique', ${litteral(o.dossier, 'x', new Map())}, ${litteral(o.auteur, 'x', new Map())}, now(), 'ok',`,
    `    ${c.proprietaire.crees}, ${c.proprietaire.majs}, ${c.proprietaire.inchanges}, ${c.lot.crees}, ${c.lot.majs}, ${c.lot.inchanges},`,
    `    ${c.locataire.crees}, ${c.locataire.majs}, ${c.locataire.inchanges}, ${c.occupation.crees}, ${c.occupation.majs}, ${c.occupation.inchanges},`,
    `    ${c.contact.crees}, 0, ${absentsNombre}, ${r.revenus}) RETURNING id INTO imp;`,
    `  INSERT INTO gestion_journal (entite, entite_id, action, commentaire, auteur_libelle)`,
    `  VALUES ('annuaire', imp, 'import', ${litteral(o.resume, 'x', new Map())}, ${litteral(o.auteur, 'x', new Map())});`,
  ];
  const bloc = [...corps, ...registre].join('\n');
  if (bloc.includes('$maj$')) throw new Error('le délimiteur $maj$ apparaît dans les données');
  return [
    '\\set ON_ERROR_STOP on',
    'BEGIN;',
    'SET LOCAL lock_timeout = \'10s\';',
    'DO $maj$',
    'DECLARE n integer; imp bigint; r1 bigint; r2 bigint; r3 bigint;',
    'BEGIN',
    bloc,
    `  RAISE NOTICE 'MISE À JOUR JOUÉE : % opération(s), passe %', ${r.ops.length}, imp;`,
    'END',
    '$maj$;',
    o.reel ? 'COMMIT;' : 'ROLLBACK;',
    '',
  ].join('\n');
}

/** Les compteurs, une ligne par table — pour le terminal et le rapport. PUR. */
export function resumerMiseAJour(r: ResultatMaj): string[] {
  const absents = (t: Absent['table']) => r.absents.filter((a) => a.table === t).length;
  const conflits = (t: Table) => r.conflits.filter((x) => x.table === t).length;
  const ligne = (t: Table, nom: string) => `${nom.padEnd(14)} ${String(r.comptes[t].crees).padStart(4)} à créer  ${String(r.comptes[t].majs).padStart(4)} à mettre à jour  ${String(r.comptes[t].inchanges).padStart(4)} inchangé(s)  ${t === 'contact' ? `${String(r.contactsAbsents.length).padStart(4)} absent(s) de l’export` : `${String(absents(t as Absent['table'])).padStart(4)} absent(s) de l’export`}  ${String(conflits(t)).padStart(3)} conflit(s)`;
  return [ligne('proprietaire', 'propriétaires'), ligne('lot', 'lots'), ligne('locataire', 'locataires'), ligne('occupation', 'baux'), ligne('contact', 'coordonnées')];
}
