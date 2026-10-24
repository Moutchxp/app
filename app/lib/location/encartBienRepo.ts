import { query } from '../db/client';
import { colonnesTrace, traceCourante } from '../gestion/traceJournal';
import type { Auteur } from '../gestion/gestes';
import { familleDeCategorie, type Famille } from './bienComplet';
import { annexeNomPnoDisponible, modifierComplementsBien } from './creationBienRepo';
import { ficheBienLocation, modifierBien, type FicheBienLocation, type Issue } from './locationRepo';
import { rattacherSyndicAuBien, refusNouveauxContacts } from './syndicLocationRepo';
import {
  CHAMPS_BASE, champsDuGroupe, changementsEncart, contactsSyndicDe, GROUPES_FICHE, phraseChangement, TITRE_GROUPE, valeursDepuis,
  type ChangementEncart, type GroupeEncart, type PorteeEncart, type ValeursEncart,
} from './encartBien';

/**
 * ══ 🔴🔴 L'ENCART DU BIEN MODIFIABLE SUR PLACE — LECTURE ET ÉCRITURE (Arno, 21/10/2026). IMPUR (base). ═══════════════════════════
 *
 * UNE SEULE source : les colonnes du bien, lues FRAÎCHES à chaque demande. Une modification d'un groupe :
 *   · relit l'état complet du bien (jamais une copie tenue par l'écran), y pose les SEULS champs du groupe ;
 *   · passe par les MÊMES écritures que « Nouveau bien » et la fiche — `modifierComplementsBien` (compléments : contrôles,
 *     digicode porté par l'immeuble / le bâtiment, ID fiscal, AG, entretiens) puis `modifierBien` (étage, porte, lot, surfaces) —,
 *     seulement pour la partie qui change, avec leurs contrôles ; un refus n'écrit rien de la partie refusée ;
 *   · journalise dans l'Historique du bien « Champ : ancienne valeur → nouvelle valeur », qui et quand.
 */
export interface LectureEncart extends PorteeEncart {
  valeurs: ValeursEncart;
  famille: Famille | null; annexe: boolean;
  avecIdFiscal: boolean; avecCharges: boolean; avecAg: boolean; avecEntretien: boolean;
  adresseModifiable: boolean; avecPno: boolean;
  digicodeImmeuble: { mention: string | null; source: string | null } | null;
}

export const GROUPES_ENCART: readonly GroupeEncart[] = GROUPES_FICHE;
export const estGroupeEncart = (x: unknown): x is GroupeEncart => typeof x === 'string' && (GROUPES_ENCART as readonly string[]).includes(x);

export type LectureEncartComplete = LectureEncart & { categorie: string; adresse: string | null; codePostal: string | null; commune: string | null; nomAnnexe: string | null };

export async function lireEncartBien(id: number): Promise<Issue<LectureEncartComplete>> {
  const f = await ficheBienLocation(id);
  if (f.etat !== 'ok') return f;
  return lectureDepuisFiche(f.data);
}

/** La lecture de l'encart depuis une fiche DÉJÀ lue (la fiche entière la réutilise : une seule lecture). */
export async function lectureDepuisFiche(fiche: Pick<FicheBienLocation, 'bien' | 'complements'>): Promise<Issue<LectureEncartComplete>> {
  const c = fiche.complements;
  if (c === null) return { etat: 'sans_schema' };
  const b = fiche.bien;
  const annexe = b.parentId !== null;
  return { etat: 'ok', data: {
    valeurs: valeursDepuis(b, c), famille: familleDeCategorie(b.categorie), annexe,
    avecIdFiscal: c.idFiscal !== undefined, avecCharges: c.chargesCopro !== undefined, avecAg: c.agApplicable === true, avecEntretien: c.entretienAPrevoir !== undefined,
    // L'adresse d'un bien importé est tenue par WIPPIMMO (`modifierBien` ne l'écrit pas) : jamais proposée à la saisie.
    adresseModifiable: b.creeDansLApplication === true, avecPno: !annexe && (await annexeNomPnoDisponible()),
    digicodeImmeuble: c.digicodeImmeuble === undefined ? null : { mention: c.digicodeImmeuble.mention, source: c.digicodeImmeuble.source },
    categorie: b.categorie, adresse: b.adresse, codePostal: b.codePostal, commune: b.commune, nomAnnexe: (b as { nomAnnexe?: string | null }).nomAnnexe ?? null,
  } };
}

/** Les entretiens saisis (texte normalisé) → l'envoi attendu par `modifierComplementsBien`. */
function entretiensEnvoi(v: ValeursEncart): { entretienAPrevoir: boolean | null; entretiens: { sorte: string; nom?: string; dateAnniversaire: string }[] } {
  const aPrevoir = v.entretienAPrevoir === 'oui' ? true : v.entretienAPrevoir === 'non' ? false : null;
  const l = (() => { try { return JSON.parse(v.entretiens || '[]') as { sorte: string; nom: string | null; dateAnniversaire: string | null }[]; } catch { return []; } })();
  return { entretienAPrevoir: aPrevoir, entretiens: aPrevoir === true ? l.map((e) => ({ sorte: e.sorte, ...(e.nom ? { nom: e.nom } : {}), dateAnniversaire: e.dateAnniversaire ?? '' })) : [] };
}

/**
 * Un groupe (l'ancien « Modifier » d'un bloc) ou PLUSIEURS — la fiche entière, Arno (23/10/2026) : les mêmes écritures, une ligne
 * d'Historique par groupe et par écriture.
 */
export async function modifierEncartBien(id: number, quoi: GroupeEncart | readonly GroupeEncart[], brut: Record<string, unknown>, auteur: Auteur): Promise<Issue<{ changements: ChangementEncart[] }>> {
  const lu = await lireEncartBien(id);
  if (lu.etat !== 'ok') return lu;
  const e = lu.data;
  const avant = e.valeurs;
  const groupes: readonly GroupeEncart[] = typeof quoi === 'string' ? [quoi] : GROUPES_FICHE.filter((g) => quoi.includes(g));
  const avec = (g: GroupeEncart): boolean => groupes.includes(g);
  // Un champ porté par deux groupes (le n° de porte : Caractéristiques pour un parking, Situation sinon) n'est compté qu'une fois.
  const groupeDe = new Map<string, GroupeEncart>();
  for (const g of groupes) for (const ch of champsDuGroupe(g, e)) if (!groupeDe.has(ch.cle)) groupeDe.set(ch.cle, g);
  const champs = groupes.flatMap((g) => champsDuGroupe(g, e).filter((ch) => groupeDe.get(ch.cle) === g));
  const apres: ValeursEncart = { ...avant };
  for (const ch of champs) if (typeof brut[ch.cle] === 'string') apres[ch.cle] = (brut[ch.cle] as string).slice(0, 4000);
  if (champs.some((ch) => ch.cle === 'syndicId') && typeof brut.syndicNom === 'string') apres.syndicNom = brut.syndicNom.slice(0, 200);
  const changements = changementsEncart(champs, avant, apres);
  if (changements.length === 0) return { etat: 'ok', data: { changements } };
  const estBase = (c: ChangementEncart) => (CHAMPS_BASE as readonly string[]).includes(c.cle);
  const changementsComplements = changements.filter((c) => !estBase(c) && c.cle !== 'syndicContacts');
  const changementsBase = changements.filter(estBase);
  // LE SYNDIC, comme « Nouveau bien » : choisi (ou ses contacts désignés / créés pour ce bien) → rattaché par l'immeuble du bien,
  // contacts désignés, nouveaux contacts ajoutés à son annuaire. Les nouveaux contacts sont vérifiés AVANT toute écriture.
  const contacts = contactsSyndicDe(apres.syndicContacts);
  const changementSyndic = changements.filter((c) => c.cle === 'syndicId' || c.cle === 'syndicContacts');
  const rattacher = avec('copropriete') && apres.syndicId !== '' && changementSyndic.length > 0;
  if (rattacher) {
    const refus = refusNouveauxContacts(contacts.nouveauxContacts);
    if (refus !== null) return { etat: 'refus', motif: refus };
  }
  // Chaque partie ÉCRITE est journalisée aussitôt : si la seconde est refusée, la première reste dans l'Historique (rien d'écrit
  // sans trace), et le refus dit ce qui a été enregistré.
  let enregistres: ChangementEncart[] = [];
  if (changementsComplements.length > 0) {
    const envoi: Record<string, unknown> = {
      batiment: apres.batiment, escalier: apres.escalier, typeLogement: apres.typeLogement, nombrePieces: apres.nombrePieces, meuble: apres.meuble,
      surfaceHabitableM2: apres.surfaceHabitableM2, syndicId: apres.syndicId, epoqueConstruction: apres.epoqueConstruction, chauffage: apres.chauffage,
      dpeClasse: apres.dpeClasse, dpeDate: apres.dpeDate, commentaire: apres.commentaire, typeLocal: apres.typeLocal, parkingSituation: apres.parkingSituation,
      parkingType: apres.parkingType, surfaceM2: apres.surfaceM2, ascenseur: apres.ascenseur, digicode: apres.digicode, digicodeCode: apres.digicodeCode,
      precisionAcces: apres.precisionAcces,
      // Les champs qui écrivent AILLEURS (immeuble, entretiens) ou qui ne sont pas partout : seulement avec LEUR groupe.
      ...(avec('copropriete') && e.avecCharges && !e.annexe ? { chargesCopro: apres.chargesCopro || null } : {}),
      ...(avec('copropriete') && e.avecIdFiscal && !e.annexe ? { idFiscal: apres.idFiscal } : {}),
      ...(avec('copropriete') && e.avecAg ? { derniereAg: apres.derniereAg } : {}),
      ...(avec('dpe') && e.avecEntretien ? entretiensEnvoi(apres) : {}),
      // L'assurance PNO (migration 378) : Non (ou non renseigné) vide la date, la règle de « Nouveau bien ».
      ...(avec('dpe') && e.avecPno ? { assurancePno: apres.assurancePno === 'oui' ? true : apres.assurancePno === 'non' ? false : null,
        pnoDateAnniversaire: apres.assurancePno === 'oui' ? apres.pnoDateAnniversaire : '' } : {}),
    };
    const r = await modifierComplementsBien(id, envoi, auteur);
    if (r.etat !== 'ok') return r;
    await journaliserParGroupe(id, groupeDe, changementsComplements, auteur);
    enregistres = changementsComplements;
  }
  if (rattacher) {
    const r = await rattacherSyndicAuBien(id, { id: Number(apres.syndicId), contactsIds: contacts.contactsIds, nouveauxContacts: contacts.nouveauxContacts },
      { libelle: e.adresse ?? '', codePostal: e.codePostal ?? '', commune: e.commune ?? '' }, auteur)
      .catch((x: unknown) => ({ ok: false as const, motif: x instanceof Error ? x.message : 'erreur' }));
    if (!r.ok) {
      const motif = `Le syndic n’a pas pu être rattaché : ${r.motif}`;
      return { etat: 'refus', motif: enregistres.length === 0 ? motif : `${motif} Ont été enregistrés : ${enregistres.map((c) => c.champ).join(', ')}.` };
    }
    const lignes = changements.filter((c) => c.cle === 'syndicContacts');
    if (lignes.length > 0) await journaliser(id, 'copropriete', lignes, auteur);
    enregistres = [...enregistres, ...lignes];
  }
  if (changementsBase.length > 0) {
    const r = await modifierBien(id, {
      // La famille et l'adresse : celles de la saisie quand la fiche les propose (sinon, celles du bien, inchangées).
      categorie: apres.categorie || e.categorie, adresse: e.adresseModifiable ? apres.adresse : e.adresse ?? '',
      codePostal: e.adresseModifiable ? apres.codePostal : e.codePostal ?? '', commune: e.adresseModifiable ? apres.commune : e.commune ?? '', nomAnnexe: e.nomAnnexe ?? '',
      etage: apres.etage, porte: apres.porte, numLotCopro: apres.numLotCopro, surfaceCarrezM2: apres.surfaceCarrezM2, surfaceExterieureM2: apres.surfaceExterieureM2,
    }, auteur);
    if (r.etat !== 'ok') {
      if (enregistres.length === 0 || !('motif' in r)) return r;
      return { ...r, motif: `${r.motif} Ont été enregistrés : ${enregistres.map((c) => c.champ).join(', ')}.` };
    }
    await journaliserParGroupe(id, groupeDe, changementsBase, auteur);
  }
  return { etat: 'ok', data: { changements } };
}

/** Une ligne d'Historique par groupe (dans l'ordre du formulaire). */
async function journaliserParGroupe(id: number, groupeDe: ReadonlyMap<string, GroupeEncart>, changements: ChangementEncart[], auteur: Auteur): Promise<void> {
  for (const g of GROUPES_FICHE) {
    const l = changements.filter((c) => groupeDe.get(c.cle) === g);
    if (l.length > 0) await journaliser(id, g, l, auteur);
  }
}

/** Une ligne de l'Historique du bien : « Champ : ancienne valeur → nouvelle valeur », qui et quand (horodatage de la base). */
export async function journaliser(id: number, groupe: GroupeEncart | { titre: string }, changements: readonly Pick<ChangementEncart, 'champ' | 'avant' | 'apres'>[], auteur: Auteur): Promise<void> {
  const titre = typeof groupe === 'string' ? TITRE_GROUPE[groupe] : groupe.titre;
  // 🔴 Arno (24/10/2026, 417) — depuis un écran tracé (« Suivi du mois ») : UNE ligne par champ (champ, ancienne, nouvelle valeur),
  // avec la session et l'écran ; sinon la ligne par groupe d'avant (l'Historique de la fiche les montre de la même façon).
  const parChamp = traceCourante() !== null;
  for (const lot of parChamp ? changements.map((c) => [c]) : [changements]) {
    const t = await colonnesTrace({ sujet: 'lot', champ: parChamp ? lot[0].champ : null }, 7);
    await query(
      `INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle${t.colonnes})
       VALUES ('annuaire_lot', $1, 'location_encart_modifie', $2, $3, $4, $5, $6${t.marques})`,
      [id, lot.map((c) => (parChamp ? c.avant : `${c.champ} : ${c.avant}`)).join('\n'), lot.map((c) => (parChamp ? c.apres : `${c.champ} : ${c.apres}`)).join('\n'),
        `${titre} — ${lot.map(phraseChangement).join(' · ')}`, auteur.id, auteur.libelle, ...t.valeurs]);
  }
}

/** Les modifications de l'encart journalisées pour CE bien (l'Historique), du plus récent. */
export async function modificationsEncart(id: number): Promise<{ id: number; quand: string; texte: string; par: string }[]> {
  const { rows } = await query<{ id: string; quand: string; commentaire: string | null; auteur_libelle: string | null }>(
    `SELECT id::text, survenu_le::text AS quand, commentaire, auteur_libelle FROM gestion_journal
      WHERE entite = 'annuaire_lot' AND entite_id = $1 AND action = 'location_encart_modifie' ORDER BY survenu_le DESC, id DESC LIMIT 200`, [id]);
  return rows.map((r) => ({ id: Number(r.id), quand: r.quand, texte: r.commentaire ?? '', par: r.auteur_libelle ?? '—' }));
}
