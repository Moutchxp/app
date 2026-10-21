import {
  LIBELLE_TYPE_LOCAL, LIBELLE_TYPE_LOGEMENT, LIBELLE_SITUATION_PARKING, LIBELLE_TYPE_PARKING, PAYEES_PAR, DPE_NON_SOUMIS, LIBELLE_DPE_NON_SOUMIS,
  type ComplementsFiche, type Famille,
} from './bienComplet';
import type { BienLocation } from './locationBien';

/**
 * ══ 🔴🔴 L'ENCART DU BIEN MODIFIABLE SUR PLACE (Arno, 21/10/2026). PUR. ═════════════════════════════════════════════════════════
 *
 * L'encart résumé de la fiche du bien (Location et Gestion) et l'écran « Nouveau bien » ont UNE SEULE source en base : les colonnes
 * du bien (`gestion_annuaire_lot`). Chaque groupe de l'encart — Caractéristiques, Situation et accès, Copropriété, DPE et
 * entretiens, Commentaire — se modifie sur place, seul, avec les règles de « Nouveau bien », par les MÊMES écritures du serveur
 * (`modifierBien` pour les champs de base, `modifierComplementsBien` pour les compléments). Ce module dit QUELS champs porte chaque
 * groupe, leurs mots, et calcule « Champ : ancienne valeur → nouvelle valeur » (contre-validation, Historique).
 *
 * Toutes les valeurs sont tenues en TEXTE dans la saisie (comme « Nouveau bien ») : '' = non renseigné ; 'oui' / 'non' pour un choix.
 */
export type GroupeEncart = 'caracteristiques' | 'situation' | 'copropriete' | 'dpe' | 'commentaire';
export const TITRE_GROUPE: Record<GroupeEncart, string> = {
  caracteristiques: 'Caractéristiques', situation: 'Situation et accès', copropriete: 'Copropriété', dpe: 'DPE et entretiens', commentaire: 'Commentaire',
};

/** Les valeurs de l'encart, en texte. */
export interface ValeursEncart {
  // base (`modifierBien`)
  etage: string; porte: string; numLotCopro: string; surfaceCarrezM2: string; surfaceExterieureM2: string;
  // compléments (`modifierComplementsBien`)
  typeLogement: string; typeLocal: string; parkingSituation: string; parkingType: string; meuble: string; nombrePieces: string;
  surfaceHabitableM2: string; surfaceM2: string; epoqueConstruction: string; chauffage: string;
  batiment: string; escalier: string; precisionAcces: string; ascenseur: string; digicode: string; digicodeCode: string;
  syndicId: string; syndicNom: string; chargesCopro: string; idFiscal: string; derniereAg: string;
  /**
   * Les contacts du syndic désignés ou créés POUR CE BIEN dans la saisie (comme « Nouveau bien ») : texte JSON
   * `{ contactsIds, nouveauxContacts }` — '' = aucun ajout. Un AJOUT : la lecture du bien le rend toujours vide.
   */
  syndicContacts: string;
  dpeClasse: string; dpeDate: string; entretienAPrevoir: string; entretiens: string;
  commentaire: string;
}
export type CleEncart = keyof ValeursEncart;

/** Les champs de BASE (écrits par `modifierBien`) ; les autres sont des compléments. */
export const CHAMPS_BASE: readonly CleEncart[] = ['etage', 'porte', 'numLotCopro', 'surfaceCarrezM2', 'surfaceExterieureM2'];

const t = (v: string | number | null | undefined): string => (v === null || v === undefined ? '' : String(v));
const nombre = (v: number | null | undefined): string => (v === null || v === undefined ? '' : String(v).replace('.', ','));
const on = (v: boolean | null | undefined): string => (v === true ? 'oui' : v === false ? 'non' : '');

/** Les valeurs ACTUELLES, lues à la source (le bien et ses compléments). PUR. */
export function valeursDepuis(b: Pick<BienLocation, 'etage' | 'porte' | 'numLotCopro' | 'surfaceCarrezM2' | 'surfaceExterieureM2'>, c: ComplementsFiche): ValeursEncart {
  return {
    etage: t(b.etage), porte: t(b.porte), numLotCopro: t(b.numLotCopro), surfaceCarrezM2: nombre(b.surfaceCarrezM2), surfaceExterieureM2: nombre(b.surfaceExterieureM2),
    typeLogement: t(c.typeLogement), typeLocal: t(c.typeLocal), parkingSituation: t(c.parkingSituation), parkingType: t(c.parkingType),
    meuble: on(c.meuble), nombrePieces: t(c.nombrePieces), surfaceHabitableM2: nombre(c.surfaceHabitableM2), surfaceM2: nombre(c.surfaceM2),
    epoqueConstruction: t(c.epoqueConstruction), chauffage: t(c.chauffage),
    batiment: t(c.batiment), escalier: t(c.escalier), precisionAcces: t(c.precisionAcces), ascenseur: on(c.ascenseur), digicode: on(c.digicode),
    digicodeCode: t(c.digicodeCode), syndicId: t(c.syndicId), syndicNom: t(c.syndicNom), chargesCopro: t(c.chargesCopro), idFiscal: t(c.idFiscal),
    derniereAg: t(c.derniereAg), syndicContacts: '',
    dpeClasse: c.dpeNonSoumis === true ? DPE_NON_SOUMIS : t(c.dpeClasse), dpeDate: c.dpeNonSoumis === true ? '' : t(c.dpeDate),
    entretienAPrevoir: on(c.entretienAPrevoir), entretiens: entretiensEnTexte(c.entretienAPrevoir === true ? c.entretiens ?? [] : []),
    commentaire: t(c.commentaire),
  };
}

/** Les entretiens, en texte normalisé (vide → `null`, sans nom pour chaudière / ramonage) : deux saisies égales donnent le même texte. PUR. */
export function entretiensEnTexte(l: readonly { sorte: string; nom?: string | null; dateAnniversaire?: string | null }[]): string {
  return JSON.stringify(l.map((e) => ({ sorte: e.sorte, nom: e.sorte === 'autre' ? (e.nom ?? '').trim() || null : null, dateAnniversaire: (e.dateAnniversaire ?? '') || null })));
}

interface Champ { cle: CleEncart; mot: string; mots?: Record<string, string> }
const OUI_NON: Record<string, string> = { oui: 'oui', non: 'non' };

/** Les champs d'un groupe, pour la famille du bien (logement, local, parking) et ce que la fiche montre. PUR. */
export function champsDuGroupe(g: GroupeEncart, f: { famille: Famille | null; annexe: boolean; avecIdFiscal: boolean; avecCharges: boolean; avecAg: boolean; avecEntretien: boolean }): Champ[] {
  const parking = f.famille === 'parking';
  const local = f.famille === 'local';
  switch (g) {
    case 'caracteristiques': return [
      ...(f.famille === 'logement' ? [{ cle: 'typeLogement' as const, mot: 'Type de logement', mots: LIBELLE_TYPE_LOGEMENT as Record<string, string> },
        { cle: 'meuble' as const, mot: 'Meublé', mots: OUI_NON }] : []),
      ...(local ? [{ cle: 'typeLocal' as const, mot: 'Type de local', mots: LIBELLE_TYPE_LOCAL as Record<string, string> }] : []),
      ...(parking ? [{ cle: 'parkingSituation' as const, mot: 'Intérieur ou extérieur', mots: LIBELLE_SITUATION_PARKING as Record<string, string> },
        { cle: 'parkingType' as const, mot: 'Type de parking', mots: LIBELLE_TYPE_PARKING as Record<string, string> }] : []),
      ...(!parking ? [{ cle: 'nombrePieces' as const, mot: local ? 'Bureaux / pièces' : 'Pièces' }] : []),
      { cle: 'etage', mot: 'Étage' },
      ...(parking ? [{ cle: 'porte' as const, mot: 'N° de place' }, { cle: 'surfaceM2' as const, mot: 'Surface' }]
        : [{ cle: 'surfaceHabitableM2' as const, mot: 'Surface habitable' }, { cle: 'surfaceCarrezM2' as const, mot: 'Surface Carrez / Boutin' },
          { cle: 'surfaceExterieureM2' as const, mot: 'Surface extérieure' },
          { cle: 'epoqueConstruction' as const, mot: 'Époque de construction' }, { cle: 'chauffage' as const, mot: 'Chauffage' }]),
    ];
    case 'situation': return [
      { cle: 'batiment', mot: 'Bâtiment' }, { cle: 'escalier', mot: 'Escalier' },
      ...(!parking ? [{ cle: 'porte' as const, mot: 'N° de porte' }] : []),
      { cle: 'precisionAcces', mot: 'Précision' }, { cle: 'ascenseur', mot: 'Ascenseur', mots: OUI_NON },
      { cle: 'digicode', mot: 'Digicode', mots: OUI_NON }, { cle: 'digicodeCode', mot: 'Code du digicode' },
    ];
    case 'copropriete': return [
      { cle: 'numLotCopro', mot: 'N° de lot' },
      ...(f.avecIdFiscal && !f.annexe ? [{ cle: 'idFiscal' as const, mot: 'ID fiscal' }] : []),
      { cle: 'syndicId', mot: 'Syndic' }, { cle: 'syndicContacts', mot: 'Contacts du syndic pour ce bien' },
      ...(f.avecCharges && !f.annexe ? [{ cle: 'chargesCopro' as const, mot: 'Charges de copropriété', mots: PAYEES_PAR as Record<string, string> }] : []),
      ...(f.avecAg ? [{ cle: 'derniereAg' as const, mot: 'Dernière AG' }] : []),
    ];
    case 'dpe': return [
      { cle: 'dpeClasse', mot: 'DPE (classe)' }, { cle: 'dpeDate', mot: 'DPE (date)' },
      ...(f.avecEntretien ? [{ cle: 'entretienAPrevoir' as const, mot: 'Entretien à prévoir', mots: OUI_NON }, { cle: 'entretiens' as const, mot: 'Entretiens' }] : []),
    ];
    case 'commentaire': return [{ cle: 'commentaire', mot: 'Commentaire libre' }];
  }
}

const dateFr = (iso: string): string => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10).split('-').reverse().join('/') : iso);

/** Une valeur, en mots (« non renseigné » pour le vide). PUR. */
export function libelleValeur(ch: Champ, v: ValeursEncart): string {
  const x = v[ch.cle];
  if (ch.cle === 'syndicId') return v.syndicNom || (x === '' ? 'non renseigné' : `syndic ${x}`);
  if (ch.cle === 'syndicContacts') {
    const c = contactsSyndicDe(x);
    const k = c.contactsIds.length;
    const parts = [...(k > 0 ? [`${k} contact${k > 1 ? 's' : ''} désigné${k > 1 ? 's' : ''}`] : []), ...c.nouveauxContacts.map((n) => `${[n.prenom, n.nom].filter((y) => (y ?? '').trim() !== '').join(' ')} (nouveau)`)];
    return parts.length === 0 ? 'aucun ajout' : parts.join(', ');
  }
  if (ch.cle === 'entretiens') {
    const l = (() => { try { return JSON.parse(x || '[]') as { sorte: string; nom: string | null; dateAnniversaire: string | null }[]; } catch { return []; } })();
    return l.length === 0 ? 'aucun' : l.map((e) => `${e.sorte === 'chaudiere' ? 'Chaudière' : e.sorte === 'ramonage' ? 'Ramonage' : e.nom ?? 'Autre'}${e.dateAnniversaire ? ` (${dateFr(e.dateAnniversaire)})` : ''}`).join(' · ');
  }
  if (x === '') return 'non renseigné';
  if (ch.cle === 'dpeClasse' && x === DPE_NON_SOUMIS) return LIBELLE_DPE_NON_SOUMIS;
  if (ch.mots) return ch.mots[x] ?? x;
  if (ch.cle === 'dpeDate' || ch.cle === 'derniereAg') return dateFr(x);
  if (/^surface/.test(ch.cle)) return `${x} m²`;
  return x;
}

export interface ContactsSyndicSaisis {
  contactsIds: number[];
  nouveauxContacts: { civilite?: 'M.' | 'Mme' | null; prenom?: string; nom?: string; fonction?: string; email?: string; telephone?: string }[];
}
/** Le texte des contacts du syndic → la saisie (vide ou illisible → aucun). PUR. */
export function contactsSyndicDe(x: string): ContactsSyndicSaisis {
  try {
    const o = JSON.parse(x || '{}') as Partial<ContactsSyndicSaisis>;
    return { contactsIds: Array.isArray(o.contactsIds) ? o.contactsIds.map(Number).filter((n) => Number.isInteger(n) && n > 0) : [],
      nouveauxContacts: Array.isArray(o.nouveauxContacts) ? o.nouveauxContacts.slice(0, 20) : [] };
  } catch { return { contactsIds: [], nouveauxContacts: [] }; }
}
/** La saisie → le texte ('' quand il n'y a rien à ajouter, pour que « rien » reste égal à « rien »). PUR. */
export function contactsSyndicEnTexte(c: ContactsSyndicSaisis): string {
  return c.contactsIds.length === 0 && c.nouveauxContacts.length === 0 ? '' : JSON.stringify({ contactsIds: c.contactsIds, nouveauxContacts: c.nouveauxContacts });
}

/** Comparer deux valeurs : sans les blancs de bord, et « 41.8 » = « 41,8 » pour un nombre. PUR. */
const egal = (cle: CleEncart, a: string, b: string): boolean => {
  const n = (s: string) => s.trim().replace(/\s+/g, ' ');
  if (/^surface|nombrePieces/.test(cle)) return n(a).replace('.', ',') === n(b).replace('.', ',');
  return n(a) === n(b);
};

export interface ChangementEncart { cle: CleEncart; champ: string; avant: string; apres: string }

/** LES CHANGEMENTS d'un groupe : « Champ : ancienne valeur → nouvelle valeur ». Vide = rien n'a changé. PUR. */
export function changementsEncart(champs: readonly Champ[], avant: ValeursEncart, apres: ValeursEncart): ChangementEncart[] {
  return champs.filter((ch) => !egal(ch.cle, avant[ch.cle], apres[ch.cle]))
    .map((ch) => ({ cle: ch.cle, champ: ch.mot, avant: libelleValeur(ch, avant), apres: libelleValeur(ch, apres) }));
}

/** La ligne de l'Historique et de la contre-validation. PUR. */
export const phraseChangement = (c: ChangementEncart): string => `${c.champ} : ${c.avant} → ${c.apres}`;
