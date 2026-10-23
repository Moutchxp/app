import 'server-only';
import type { Auteur } from '../gestion/gestes';
import { lireStatutBien } from '../gestion/statutBienRepo';
import { transitionStatutAvecSuites } from '../gestion/statutBienSuites';
import { STATUTS_BIEN, type StatutBien } from '../gestion/statutBien';
import { ficheBienLocation, modifierBien, type Issue } from './locationRepo';
import type { BienLocation } from './locationBien';
import { lectureDepuisFiche, journaliser, modifierEncartBien, type LectureEncartComplete } from './encartBienRepo';
import { ajouterAnnexesCompletes } from './creationBienRepo';
import { detacherAnnexe } from './entretienAnnexeRepo';
import { sortirDuPortefeuille } from './portefeuilleRepo';
import { avecMail } from './mailPortefeuilleRepo';
import { resumeDuBien } from './resumeBienRepo';
import { GROUPES_FICHE, type ValeursEncart } from './encartBien';
import {
  changementsAnnexes, changementsFiche, empreinte, MOTIF_CONFLIT, refusFiche,
  type AnnexeLue, type AnnexeSaisie, type ChangementFiche, type SaisieFiche, type StatutLu, type TransitionSaisie,
} from './ficheBienEntiere';

/**
 * ══ 🔴🔴 LA FICHE DU BIEN MODIFIÉE EN ENTIER — LECTURE, EMPREINTE ET ÉCRITURE (Arno, 23/10/2026). IMPUR (base, Drive, mail). ════════
 *
 * Le formulaire « Nouveau bien » pré-rempli, ouvert par l'UNIQUE « Modifier » de la fiche (Gestion et Location, un seul écran).
 * Aucune écriture nouvelle : chaque partie passe par le geste qui l'écrivait déjà, avec ses contrôles et son journal —
 *   · les valeurs du bien (famille, adresse d'un bien créé dans l'application, caractéristiques, situation, copropriété, DPE,
 *     entretiens, PNO, commentaire) : `modifierEncartBien`, tous groupes ;
 *   · les annexes existantes : `modifierBien` (étage, lot, porte, nom, annotation, autre adresse d'une annexe créée ici), l'encart
 *     de l'annexe (parking), `detacherAnnexe` (« Détachée »), `sortirDuPortefeuille` (« Supprimer » = sortie, jamais un effacement,
 *     l'avertissement d'une annexe louée d'abord) ; les annexes nouvelles : `ajouterAnnexesCompletes` (l'écriture de « Nouveau bien ») ;
 *   · le statut : `transitionStatutAvecSuites` — la transition permise, son mail, et le déplacement du dossier Drive du bien (le
 *     mécanisme existant, signalé dans la contre-validation et dans l'issue ; jamais un autre dossier).
 * 🔴 L'adresse ne renomme ni ne déplace aucun dossier Drive (aucun mécanisme ne le fait) : l'issue le dit.
 * 🔴 VERSION : l'empreinte de la fiche lue à l'ouverture ; une autre en base = « Ce bien a été modifié par ailleurs — recharger ? »,
 *    et RIEN n'est écrit.
 */
export interface LectureFiche {
  version: string;
  encart: LectureEncartComplete;
  annexes: AnnexeLue[];
  statut: StatutLu | null;
  /** Rappel en lecture seule : les propriétaires du bien, et son mandat connu (lignes). */
  proprietaires: string[];
  mandat: { sorte: 'gestion' | 'transaction'; lignes: string[] } | null;
}

const t = (v: string | number | null | undefined): string => (v === null || v === undefined ? '' : String(v));

function annexeLue(a: BienLocation, parent: BienLocation): AnnexeLue {
  const autre = a.adresseAutre === true;
  return {
    id: a.id, categorie: a.categorie, etage: t(a.etage), porte: t(a.porte), numLotCopro: t(a.numLotCopro), nomAnnexe: t(a.nomAnnexe),
    annotation: t(a.annotation), detachee: a.detachee === true, parkingSituation: t(a.parkingSituation), parkingType: t(a.parkingType),
    autreAdresse: autre, adresse: t(autre ? a.adresse : parent.adresse), codePostal: t(autre ? a.codePostal : parent.codePostal),
    commune: t(autre ? a.commune : parent.commune), adresseModifiable: a.creeDansLApplication === true,
  };
}

interface Lu { publique: Omit<LectureFiche, 'proprietaires' | 'mandat'>; bruts: Map<number, BienLocation> }

async function lire(id: number): Promise<Issue<Lu>> {
  const f = await ficheBienLocation(id);
  if (f.etat !== 'ok') return f;
  const e = await lectureDepuisFiche(f.data);
  if (e.etat !== 'ok') return e;
  // Les annexes DANS le portefeuille (une annexe sortie reste visible dans la section Location de la fiche, jamais modifiée ici).
  const vivantes = f.data.annexes.filter((a) => a.sorti !== true);
  const st = await lireStatutBien(id);
  const statut: StatutLu | null = st === null ? null : {
    statut: st.statut, depuis: st.depuis, gestes: st.gestes, disponible: st.disponible,
    suitLot: st.suitLot === null ? null : { id: st.suitLot.id, adresse: st.suitLot.adresse },
  };
  const base = { encart: e.data, annexes: vivantes.map((a) => annexeLue(a, f.data.bien)), statut };
  return { etat: 'ok', data: { publique: { ...base, version: empreinte(base) }, bruts: new Map(vivantes.map((a) => [a.id, a])) } };
}

/** La fiche entière, pour pré-remplir le formulaire « Modifier ». */
export async function lireFicheEntiere(id: number): Promise<Issue<LectureFiche>> {
  const l = await lire(id);
  if (l.etat !== 'ok') return l;
  const r = await resumeDuBien(id).catch(() => null);
  return { etat: 'ok', data: { ...l.data.publique, proprietaires: (r?.proprietaires ?? []).map((p) => p.nom), mandat: r?.mandat ?? null } };
}

/** La seule empreinte (la mise à jour automatique de la fiche ouverte la compare, toutes les quelques secondes). */
export async function versionDuBien(id: number): Promise<Issue<{ version: string }>> {
  const l = await lire(id);
  return l.etat !== 'ok' ? l : { etat: 'ok', data: { version: l.data.publique.version } };
}

// ── LA SAISIE ─────────────────────────────────────────────────────────────────────────────────────────────────────────

const chaine = (v: unknown, max = 4000): string | null => (typeof v === 'string' ? v.slice(0, max) : null);

function lireAnnexe(b: unknown): AnnexeSaisie | null {
  if (b === null || typeof b !== 'object') return null;
  const a = b as Record<string, unknown>;
  const id = typeof a.id === 'number' && Number.isSafeInteger(a.id) && a.id > 0 ? a.id : null;
  const s = (k: string, max = 500): string => chaine(a[k], max) ?? '';
  return {
    id, categorie: s('categorie', 20) as AnnexeSaisie['categorie'], etage: s('etage', 20), porte: s('porte', 40), numLotCopro: s('numLotCopro', 40),
    nomAnnexe: s('nomAnnexe', 80), annotation: s('annotation', 2000), detachee: a.detachee === true, parkingSituation: s('parkingSituation', 40),
    parkingType: s('parkingType', 40), autreAdresse: a.autreAdresse === true, adresse: s('adresse', 300), codePostal: s('codePostal', 10), commune: s('commune', 120),
    ...(a.sortir === true ? { sortir: true } : {}),
  };
}

function lireTransition(b: unknown): TransitionSaisie | null {
  if (b === null || typeof b !== 'object') return null;
  const x = b as Record<string, unknown>;
  if (!(STATUTS_BIEN as readonly unknown[]).includes(x.vers)) return null;
  const m = x.mandat !== null && typeof x.mandat === 'object' ? x.mandat as Record<string, unknown> : null;
  return {
    vers: x.vers as StatutBien, effetLe: chaine(x.effetLe, 10) ?? '', motif: chaine(x.motif, 500) ?? '',
    mandat: m === null || (m.sorte !== 'gestion' && m.sorte !== 'transaction') ? null
      : { sorte: m.sorte, numero: chaine(m.numero, 80), signeLe: chaine(m.signeLe, 10) },
  };
}

/** La saisie brute → la saisie lue ; une valeur absente garde celle de la fiche (jamais un champ vidé par omission). */
export function lireSaisie(brut: Record<string, unknown>, valeursLues: ValeursEncart): SaisieFiche {
  const v = brut.valeurs !== null && typeof brut.valeurs === 'object' ? brut.valeurs as Record<string, unknown> : {};
  const valeurs = { ...valeursLues };
  for (const k of Object.keys(valeurs) as (keyof ValeursEncart)[]) { const x = chaine(v[k]); if (x !== null) valeurs[k] = x; }
  return {
    version: chaine(brut.version, 64) ?? '',
    valeurs,
    annexes: Array.isArray(brut.annexes) ? brut.annexes.slice(0, 40).map(lireAnnexe).filter((a): a is AnnexeSaisie => a !== null) : [],
    statut: lireTransition(brut.statut),
    ...(brut.confirmeOccupation === true ? { confirmeOccupation: true } : {}),
  };
}

export type IssueFiche = Issue<{ changements: ChangementFiche[]; notes: string[] }> | { etat: 'conflit'; motif: string };

/**
 * « Valider les modifications » de la fiche entière : version, refus, puis chaque partie par son geste. Une partie refusée
 * arrête la suite ; ce qui a déjà été écrit reste (journalisé) et le refus le dit.
 */
export async function modifierFicheEntiere(id: number, brut: Record<string, unknown>, auteur: Auteur, tuile: 'Location' | 'Gestion'): Promise<IssueFiche> {
  const l = await lire(id);
  if (l.etat !== 'ok') return l;
  const lu = l.data.publique;
  const s = lireSaisie(brut, lu.encart.valeurs);
  if (s.version !== lu.version) return { etat: 'conflit', motif: MOTIF_CONFLIT };
  // Les annexes de la saisie : seulement celles de la fiche lue (un identifiant inconnu n'est jamais écrit).
  s.annexes = s.annexes.filter((a) => a.id === null || l.data.bruts.has(a.id));
  const refus = refusFiche(lu, s);
  if (refus !== null) return { etat: 'refus', motif: refus };
  const changements = changementsFiche(lu, s);
  if (changements.length === 0) return { etat: 'ok', data: { changements, notes: [] } };
  const faits: string[] = [];
  const notes: string[] = [];
  const partiel = (motif: string): IssueFiche => ({ etat: 'refus', motif: faits.length === 0 ? motif : `${motif} Ont été enregistrés : ${faits.join(', ')}.` });

  // ① LE BIEN — tous les groupes de l'encart, par l'écriture de l'encart (mêmes contrôles, une ligne d'Historique par groupe).
  const v = await modifierEncartBien(id, GROUPES_FICHE, s.valeurs as unknown as Record<string, unknown>, auteur);
  if (v.etat !== 'ok') return v.etat === 'refus' ? partiel(v.motif) : v;
  faits.push(...v.data.changements.map((c) => c.champ));
  const adresseChangee = lu.encart.adresseModifiable && v.data.changements.some((c) => c.cle === 'adresse' || c.cle === 'codePostal' || c.cle === 'commune');
  if (adresseChangee) notes.push('Le dossier Drive du bien garde son nom et sa place : un changement d’adresse ne le renomme ni ne le déplace.');

  // ② LES ANNEXES EXISTANTES — chacune par ses gestes ; journalisées aussi sur le bien (l'Historique de sa fiche).
  for (const a of s.annexes) {
    if (a.id === null) continue;
    const avant = lu.annexes.find((x) => x.id === a.id)!;
    const brute = l.data.bruts.get(a.id)!;
    const lignes = changementsAnnexes([avant], [a]);
    if (lignes.length === 0) continue;
    if (a.sortir === true) {
      const r = await sortirDuPortefeuille('bien', a.id, auteur, { confirmeOccupation: s.confirmeOccupation === true });
      const m = await avecMail(r, r.etat !== 'ok' ? null : { sens: 'sortie', proprietaireId: null, lotIds: r.data.lots ?? [], origine: null }, { auteur, tuile });
      if (m.etat !== 'ok') return partiel('motif' in m && typeof m.motif === 'string' ? m.motif : 'L’annexe n’a pas pu sortir du portefeuille.');
      if (m.mail && !m.mail.ignore && !m.mail.envoye) notes.push(`Annexe sortie, mais le mail de portefeuille n’est pas parti : ${m.mail.motif ?? 'raison inconnue'}.`);
    } else {
      const base = ['etage', 'porte', 'numLotCopro', 'nomAnnexe', 'annotation', 'adresse'] as const;
      if (base.some((k) => (avant[k] ?? '') !== (a[k] ?? '') || (k === 'adresse' && (avant.codePostal !== a.codePostal || avant.commune !== a.commune)))) {
        const autre = avant.autreAdresse && avant.adresseModifiable;
        const r = await modifierBien(a.id, {
          categorie: brute.categorie, adresse: autre ? a.adresse : t(brute.adresse), codePostal: autre ? a.codePostal : t(brute.codePostal), commune: autre ? a.commune : t(brute.commune),
          etage: a.etage, porte: a.porte, numLotCopro: a.numLotCopro, surfaceCarrezM2: t(brute.surfaceCarrezM2), surfaceExterieureM2: t(brute.surfaceExterieureM2),
          nomAnnexe: a.nomAnnexe, annotation: a.annotation,
        }, auteur);
        if (r.etat !== 'ok') return partiel('motif' in r && typeof r.motif === 'string' ? r.motif : 'L’annexe n’a pas pu être modifiée.');
      }
      if (avant.parkingSituation !== a.parkingSituation || avant.parkingType !== a.parkingType) {
        const r = await modifierEncartBien(a.id, 'caracteristiques', { parkingSituation: a.parkingSituation, parkingType: a.parkingType }, auteur);
        if (r.etat !== 'ok') return partiel('motif' in r && typeof r.motif === 'string' ? r.motif : 'Le parking de l’annexe n’a pas pu être modifié.');
      }
      if (avant.detachee !== a.detachee) {
        const r = await detacherAnnexe(a.id, a.detachee, auteur);
        if (r.etat !== 'ok') return partiel(r.etat === 'refus' ? r.motif : 'L’annexe n’a pas pu être détachée.');
      }
    }
    await journaliser(id, { titre: 'Annexes' }, lignes, auteur);
    faits.push(...lignes.map((x) => x.champ));
  }

  // ③ LES ANNEXES NOUVELLES — l'écriture de « Nouveau bien ».
  const nouvelles = s.annexes.filter((a) => a.id === null && a.sortir !== true);
  if (nouvelles.length > 0) {
    const r = await ajouterAnnexesCompletes(id, nouvelles as unknown as Record<string, unknown>[], auteur);
    if (r.etat !== 'ok') return r.etat === 'refus' ? partiel(r.motif) : r;
    const lignes = changementsAnnexes([], nouvelles);
    await journaliser(id, { titre: 'Annexes' }, lignes, auteur);
    faits.push(...lignes.map((x) => x.champ));
  }

  // ④ LE STATUT — la transition et ses suites (mail, déplacement du dossier Drive du bien), le mécanisme du geste de la fiche.
  if (s.statut !== null) {
    const r = await transitionStatutAvecSuites(id, s.statut, auteur, tuile);
    if (r.etat !== 'ok') return partiel('motif' in r && typeof r.motif === 'string' ? r.motif : 'Le statut du bien n’a pas pu changer.');
    const d = r as typeof r & { mail?: { envoye: boolean; ignore: boolean; motif: string | null }; drive?: { ok: boolean; motif: string | null } };
    const suivies = (d.data.lots?.length ?? 1) - 1;
    if (suivies > 0) notes.push(suivies === 1 ? 'Son annexe rattachée a suivi le statut.' : `Ses ${suivies} annexes rattachées ont suivi le statut.`);
    if (d.data.avertissement) notes.push(d.data.avertissement);
    if (d.mail && !d.mail.ignore && !d.mail.envoye) notes.push(`Statut enregistré, mais le mail de portefeuille n’est pas parti : ${d.mail.motif ?? 'raison inconnue'}.`);
    if (d.drive) notes.push(d.drive.ok ? 'Le dossier Drive du bien a été déplacé dans l’arbre de son nouveau statut.'
      : `Statut enregistré, mais le dossier Drive n’a pas été déplacé : ${d.drive.motif ?? 'le Drive n’a pas répondu'}. « Déplacer maintenant » (sur la fiche) le rejoue.`);
  }
  return { etat: 'ok', data: { changements, notes } };
}
