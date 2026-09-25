/**
 * MODULE « GESTION » — LOT ANNUAIRE-1 : CE QUE L'IMPORT VA ÉCRIRE, DÉCIDÉ SANS BASE. Module PUR : il reçoit trois
 * feuilles déjà lues, il rend un PLAN et un RAPPORT. Aucune requête, aucun réseau, aucune horloge.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 POURQUOI LA DÉCISION EST SÉPARÉE DE L'ÉCRITURE. Un import qui décide en écrivant ne peut pas être simulé : pour
 * savoir ce qu'il ferait, il faudrait le laisser le faire. Ici tout est tranché AVANT — quels propriétaires, quels
 * lots, quels baux, quels rejets et pourquoi — et l'écriture n'est plus qu'une transcription. C'est ce qui rend le
 * mode « à blanc » HONNÊTE : il calcule exactement la même chose, il ne la pose pas.
 *
 * 🔴 CE MODULE NE RAPPROCHE JAMAIS PAR SCORE. Mesuré sur les vrais exports : `Lots.Propriétaire` normalisé est
 * ÉGAL à « Nom prop. + Prénom prop. » normalisé pour les 270 propriétaires cités. C'est une égalité, et on s'y
 * tient. Un rapprochement approché trouverait des couples là où il n'y en a pas — et attribuerait les lots, les
 * loyers et les locataires d'un client à un autre.
 *
 * 🔴 UN NOM PORTÉ PAR DEUX BAILLEURS N'EST PAS TRANCHÉ. Mesuré : 1 cas (ids 102 et 103, même nom, même commune).
 * Les lots de ce nom gardent `proprietaireCle = null`, leur texte d'origine est conservé, et le rapport le DIT.
 * Aujourd'hui aucun lot ne cite ce nom ; le jour où l'un le citera, il ne partira pas au hasard.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import {
  clePersonne, cleProprietaire, contactsDeCellules, lireDateFr, nomComplet, normaliserTexte, plusAncienne,
  type ContactAnnuaire,
} from './annuaire';
import { dateDeSerie, type FeuilleLue } from './xlsxLecture';

// ── CE QUE LE PLAN CONTIENT ───────────────────────────────────────────────────────────────────────────────────────

export interface ProprietairePlan {
  wippimmoId: string;
  civilite: string | null;
  nom: string;
  prenom: string | null;
  nomComplet: string;
  nomNormalise: string;
  adresse: string | null;
  commune: string | null;
  codePostal: string | null;
  adresseNormalisee: string;
  /** DÉRIVÉE : la plus ancienne « Déb gest. » de ses lots. `null` s'il n'en a aucun. */
  relationDepuis: string | null;
  contacts: ContactAnnuaire[];
}

export interface LotPlan {
  wippimmoId: string;
  /** Le texte de WIPPIMMO, gardé mot pour mot. */
  proprietaireTexte: string;
  /** La clé du propriétaire, ou `null` : inconnu, ou porté par plusieurs bailleurs. */
  proprietaireCle: string | null;
  immeuble: string | null;
  nature: string | null;
  typeBien: string | null;
  adresse: string | null;
  commune: string | null;
  codePostal: string | null;
  adresseNormalisee: string;
  gestionDebut: string | null;
  gestionFin: string | null;
}

export interface LocatairePlan {
  clePersonne: string;
  wippimmoId: string;
  nom: string;
  nomNormalise: string;
  adresse: string | null;
  commune: string | null;
  codePostal: string | null;
  adresseNormalisee: string;
  contacts: ContactAnnuaire[];
}

export interface OccupationPlan {
  wippimmoId: string;
  clePersonne: string;
  lotWippimmoId: string;
  /** `false` quand le lot cité n'est pas dans l'export Lots : l'écran dira « lot hors gestion ». */
  lotConnu: boolean;
  entree: string | null;
  sortie: string | null;
}

/** Une ligne qui n'est PAS entrée, et pourquoi. Jamais un compteur seul : un rejet sans motif ne se corrige pas. */
export interface Rejet {
  source: 'lots' | 'bailleurs' | 'locataires';
  /** Le numéro de ligne DANS LE TABLEUR (en-tête comprise) : c'est celui qu'Arno voit en ouvrant le fichier. */
  ligne: number;
  motif: string;
}

/** Un nom porté par plusieurs bailleurs. Signalé, jamais fusionné. */
export interface Homonyme {
  nom: string;
  wippimmoIds: string[];
  /** Combien de lots citent ce nom et restent donc sans propriétaire rattaché. */
  lotsEnAttente: number;
}

export interface PlanImport {
  proprietaires: ProprietairePlan[];
  lots: LotPlan[];
  locataires: LocatairePlan[];
  occupations: OccupationPlan[];
  rejets: Rejet[];
  homonymes: Homonyme[];
  /** Lots dont le propriétaire n'a pas pu être rattaché (inconnu OU homonyme). */
  lotsSansProprietaire: number;
  /** Baux visant un lot absent de l'export Lots. Gardés, avec la mention. */
  occupationsHorsGestion: number;
  /** Baux regroupés sous une personne déjà vue (même nom ET même contact). */
  locatairesRegroupes: number;
}

/** Le fichier entier est inutilisable : colonne obligatoire absente, feuille vide. On ne devine pas une colonne. */
export class ErreurSource extends Error {}

// ── LIRE UNE COLONNE PAR SON TITRE, SANS DÉPENDRE DE SON RANG ─────────────────────────────────────────────────────

/**
 * L'indice d'une colonne, trouvée par son TITRE normalisé.
 *
 * ⚠️ JAMAIS PAR SON RANG. Un export où l'on ajoute une colonne au milieu décalerait silencieusement tout ce qui
 * suit — les téléphones deviendraient des e-mails, et personne ne le verrait avant d'appeler.
 */
function colonne(feuille: FeuilleLue, titres: readonly string[], obligatoire: boolean, quoi: string): number {
  const vus = feuille.entetes.map((e) => normaliserTexte(e));
  for (const t of titres) {
    const i = vus.indexOf(normaliserTexte(t));
    if (i >= 0) return i;
  }
  if (obligatoire) {
    throw new ErreurSource(
      `Colonne « ${titres[0]} » introuvable dans ${quoi}. Colonnes lues : ${feuille.entetes.join(', ') || '(aucune)'}.`);
  }
  return -1;
}

const cellule = (ligne: readonly string[], i: number): string => (i < 0 ? '' : (ligne[i] ?? '').trim());
const ouNull = (s: string): string | null => (s === '' ? null : s);

/** Une date de l'export : JJ/MM/AAAA, ou le numéro de série d'un tableur (filet, cf. `dateDeSerie`). */
function date(brut: string): string | null {
  if (brut === '') return null;
  const directe = lireDateFr(brut);
  if (directe !== null) return directe;
  const serie = dateDeSerie(brut);
  return serie === null ? null : lireDateFr(serie);
}

// ── LE PLAN ───────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * CONSTRUIT LE PLAN COMPLET à partir des trois feuilles. PUR — appelable dans un test sans base ni réseau.
 *
 * L'ORDRE COMPTE : les bailleurs d'abord (ils fournissent les clés), les lots ensuite (ils les consomment et
 * dérivent la date de relation), les baux en dernier (ils consomment les lots).
 */
export function construirePlan(sources: {
  bailleurs: FeuilleLue; lots: FeuilleLue; locataires: FeuilleLue;
}): PlanImport {
  const rejets: Rejet[] = [];

  const proprietaires = lireBailleurs(sources.bailleurs, rejets);
  const parCle = new Map<string, ProprietairePlan[]>();
  for (const p of proprietaires) {
    const l = parCle.get(p.nomNormalise) ?? [];
    l.push(p);
    parCle.set(p.nomNormalise, l);
  }
  const clesAmbigues = new Set([...parCle].filter(([, v]) => v.length > 1).map(([k]) => k));

  const lots = lireLots(sources.lots, parCle, clesAmbigues, rejets);

  // ── LA DATE DE DÉBUT DE RELATION, DÉRIVÉE — recalculée à chaque import, jamais saisie ──
  const debutsParCle = new Map<string, (string | null)[]>();
  for (const lot of lots) {
    if (lot.proprietaireCle === null) continue;
    const l = debutsParCle.get(lot.proprietaireCle) ?? [];
    l.push(lot.gestionDebut);
    debutsParCle.set(lot.proprietaireCle, l);
  }
  for (const p of proprietaires) {
    // Un propriétaire dont le nom est ambigu n'a aucun lot rattaché : sa date reste nulle, ce qui est la vérité.
    p.relationDepuis = clesAmbigues.has(p.nomNormalise)
      ? null
      : plusAncienne(debutsParCle.get(p.nomNormalise) ?? []);
  }

  const idsLots = new Set(lots.map((l) => l.wippimmoId));
  const { locataires, occupations, regroupes } = lireLocataires(sources.locataires, idsLots, rejets);

  const homonymes: Homonyme[] = [...clesAmbigues].map((cle) => ({
    nom: (parCle.get(cle) ?? [])[0]?.nomComplet ?? cle,
    wippimmoIds: (parCle.get(cle) ?? []).map((p) => p.wippimmoId),
    lotsEnAttente: lots.filter((l) => l.proprietaireCle === null && normaliserTexte(l.proprietaireTexte) === cle).length,
  }));

  return {
    proprietaires, lots, locataires, occupations, rejets, homonymes,
    lotsSansProprietaire: lots.filter((l) => l.proprietaireCle === null).length,
    occupationsHorsGestion: occupations.filter((o) => !o.lotConnu).length,
    locatairesRegroupes: regroupes,
  };
}

function lireBailleurs(feuille: FeuilleLue, rejets: Rejet[]): ProprietairePlan[] {
  const iId = colonne(feuille, ['Id'], true, 'Bailleurs.xlsx');
  const iNom = colonne(feuille, ['Nom prop.', 'Nom'], true, 'Bailleurs.xlsx');
  const iPrenom = colonne(feuille, ['Prénom prop.', 'Prénom'], false, 'Bailleurs.xlsx');
  const iCiv = colonne(feuille, ['Civilité'], false, 'Bailleurs.xlsx');
  const iAdr = colonne(feuille, ['Adresse'], false, 'Bailleurs.xlsx');
  const iCom = colonne(feuille, ['Commune'], false, 'Bailleurs.xlsx');
  const iCp = colonne(feuille, ['C.P.', 'CP', 'Code postal'], false, 'Bailleurs.xlsx');
  const iTel = colonne(feuille, ['Télécoms'], false, 'Bailleurs.xlsx');
  const iMob = colonne(feuille, ['Mobile'], false, 'Bailleurs.xlsx');
  const iMail = colonne(feuille, ['Email', 'E-mail', 'Mail'], false, 'Bailleurs.xlsx');

  const out: ProprietairePlan[] = [];
  const vus = new Set<string>();
  feuille.lignes.forEach((l, n) => {
    const numero = n + 2;   // +1 pour l'en-tête, +1 parce qu'un tableur compte à partir de 1
    const id = cellule(l, iId);
    const nom = cellule(l, iNom);
    if (id === '' && nom === '') return;   // ligne vide : ce n'est pas un rejet, il n'y a rien à rejeter
    if (id === '') { rejets.push({ source: 'bailleurs', ligne: numero, motif: 'sans identifiant WIPPIMMO' }); return; }
    if (nom === '') { rejets.push({ source: 'bailleurs', ligne: numero, motif: `bailleur ${id} sans nom` }); return; }
    if (vus.has(id)) {
      rejets.push({ source: 'bailleurs', ligne: numero, motif: `identifiant ${id} présent deux fois dans l’export` });
      return;
    }
    vus.add(id);

    const prenom = ouNull(cellule(l, iPrenom));
    const complet = nomComplet(nom, prenom);
    const adresse = ouNull(cellule(l, iAdr));
    const commune = ouNull(cellule(l, iCom));
    out.push({
      wippimmoId: id,
      civilite: ouNull(cellule(l, iCiv)),
      nom, prenom,
      nomComplet: complet,
      nomNormalise: cleProprietaire(nom, prenom),
      adresse, commune,
      codePostal: ouNull(cellule(l, iCp)),
      adresseNormalisee: normaliserTexte([adresse, commune].filter((x) => x !== null).join(' ')),
      relationDepuis: null,   // dérivée plus tard, une fois les lots lus
      contacts: contactsDeCellules([
        { sorte: 'telephone', texte: cellule(l, iTel) },
        { sorte: 'telephone', texte: cellule(l, iMob) },
        { sorte: 'email', texte: cellule(l, iMail) },
      ]),
    });
  });
  return out;
}

function lireLots(
  feuille: FeuilleLue,
  parCle: ReadonlyMap<string, ProprietairePlan[]>,
  clesAmbigues: ReadonlySet<string>,
  rejets: Rejet[],
): LotPlan[] {
  const iId = colonne(feuille, ['Id'], true, 'Lots.xlsx');
  const iProp = colonne(feuille, ['Propriétaire'], true, 'Lots.xlsx');
  const iImm = colonne(feuille, ['Immeuble'], false, 'Lots.xlsx');
  const iNat = colonne(feuille, ['Nature'], false, 'Lots.xlsx');
  const iType = colonne(feuille, ['Type'], false, 'Lots.xlsx');
  const iAdr = colonne(feuille, ['Adresse'], false, 'Lots.xlsx');
  const iCom = colonne(feuille, ['Commune'], false, 'Lots.xlsx');
  const iCp = colonne(feuille, ['C.P.', 'CP', 'Code postal'], false, 'Lots.xlsx');
  const iDeb = colonne(feuille, ['Déb gest.', 'Début gestion'], false, 'Lots.xlsx');
  const iFin = colonne(feuille, ['Fin gest.', 'Fin gestion'], false, 'Lots.xlsx');

  const out: LotPlan[] = [];
  const vus = new Set<string>();
  feuille.lignes.forEach((l, n) => {
    const numero = n + 2;
    const id = cellule(l, iId);
    if (id === '' && cellule(l, iProp) === '') return;
    if (id === '') { rejets.push({ source: 'lots', ligne: numero, motif: 'lot sans identifiant WIPPIMMO' }); return; }
    if (vus.has(id)) {
      rejets.push({ source: 'lots', ligne: numero, motif: `identifiant de lot ${id} présent deux fois dans l’export` });
      return;
    }
    vus.add(id);

    const texteProp = cellule(l, iProp);
    const cle = normaliserTexte(texteProp);
    let proprietaireCle: string | null = null;
    if (cle === '') {
      rejets.push({ source: 'lots', ligne: numero, motif: `lot ${id} sans propriétaire — gardé, mais non rattaché` });
    } else if (clesAmbigues.has(cle)) {
      // On ne tranche pas : le rapport le signale comme homonyme, le lot garde son texte.
      proprietaireCle = null;
    } else if (parCle.has(cle)) {
      proprietaireCle = cle;
    } else {
      rejets.push({
        source: 'lots', ligne: numero,
        motif: `lot ${id} : propriétaire « ${texteProp} » absent de Bailleurs.xlsx — gardé, mais non rattaché`,
      });
    }

    const debut = cellule(l, iDeb);
    if (debut !== '' && date(debut) === null) {
      rejets.push({ source: 'lots', ligne: numero, motif: `lot ${id} : date de début « ${debut} » illisible` });
    }
    const adresse = ouNull(cellule(l, iAdr));
    const commune = ouNull(cellule(l, iCom));
    out.push({
      wippimmoId: id,
      proprietaireTexte: texteProp,
      proprietaireCle,
      immeuble: ouNull(cellule(l, iImm)),
      nature: ouNull(cellule(l, iNat)),
      typeBien: ouNull(cellule(l, iType)),
      adresse, commune,
      codePostal: ouNull(cellule(l, iCp)),
      adresseNormalisee: normaliserTexte([adresse, commune].filter((x) => x !== null).join(' ')),
      gestionDebut: date(debut),
      gestionFin: date(cellule(l, iFin)),
    });
  });
  return out;
}

function lireLocataires(feuille: FeuilleLue, idsLots: ReadonlySet<string>, rejets: Rejet[]): {
  locataires: LocatairePlan[]; occupations: OccupationPlan[]; regroupes: number;
} {
  const iId = colonne(feuille, ['Id'], true, 'Locataires.xlsx');
  const iNom = colonne(feuille, ['Locataire'], true, 'Locataires.xlsx');
  const iLot = colonne(feuille, ['Lot'], true, 'Locataires.xlsx');
  const iEff = colonne(feuille, ['Effet'], false, 'Locataires.xlsx');
  const iSor = colonne(feuille, ['Sortie'], false, 'Locataires.xlsx');
  const iAdr = colonne(feuille, ['Adresse'], false, 'Locataires.xlsx');
  const iCom = colonne(feuille, ['Commune'], false, 'Locataires.xlsx');
  const iCp = colonne(feuille, ['C.P.', 'CP', 'Code postal'], false, 'Locataires.xlsx');
  const iMob = colonne(feuille, ['Mobile'], false, 'Locataires.xlsx');
  const iMail = colonne(feuille, ['Email', 'E-mail', 'Mail'], false, 'Locataires.xlsx');

  const locataires = new Map<string, LocatairePlan>();
  const occupations: OccupationPlan[] = [];
  const vus = new Set<string>();
  let regroupes = 0;

  feuille.lignes.forEach((l, n) => {
    const numero = n + 2;
    const id = cellule(l, iId);
    const nom = cellule(l, iNom);
    if (id === '' && nom === '') return;
    if (id === '') { rejets.push({ source: 'locataires', ligne: numero, motif: 'bail sans identifiant WIPPIMMO' }); return; }
    if (nom === '') { rejets.push({ source: 'locataires', ligne: numero, motif: `bail ${id} sans nom de locataire` }); return; }
    if (vus.has(id)) {
      rejets.push({ source: 'locataires', ligne: numero, motif: `identifiant de bail ${id} présent deux fois dans l’export` });
      return;
    }
    vus.add(id);

    const contacts = contactsDeCellules([
      { sorte: 'telephone', texte: cellule(l, iMob) },
      { sorte: 'email', texte: cellule(l, iMail) },
    ]);
    const normalise = normaliserTexte(nom);
    const cle = clePersonne(normalise, contacts, id);
    const adresse = ouNull(cellule(l, iAdr));
    const commune = ouNull(cellule(l, iCom));

    const deja = locataires.get(cle);
    if (deja === undefined) {
      locataires.set(cle, {
        clePersonne: cle, wippimmoId: id, nom, nomNormalise: normalise,
        adresse, commune, codePostal: ouNull(cellule(l, iCp)),
        adresseNormalisee: normaliserTexte([adresse, commune].filter((x) => x !== null).join(' ')),
        contacts,
      });
    } else {
      regroupes += 1;
      // 🔴 LES CONTACTS SE CUMULENT, ILS NE S'ÉCRASENT PAS : un second bail peut porter un numéro que le premier
      //   n'avait pas. Écraser perdrait un moyen de joindre quelqu'un — le défaut le plus coûteux d'un annuaire.
      for (const c of contacts) {
        if (!deja.contacts.some((x) => x.sorte === c.sorte && x.valeur === c.valeur)) {
          deja.contacts.push({ ...c, rang: deja.contacts.filter((x) => x.sorte === c.sorte).length });
        }
      }
    }

    const lotRef = cellule(l, iLot);
    if (lotRef === '') {
      rejets.push({ source: 'locataires', ligne: numero, motif: `bail ${id} sans référence de lot` });
      return;
    }
    const entree = date(cellule(l, iEff));
    const sortie = date(cellule(l, iSor));
    if (entree !== null && sortie !== null && sortie < entree) {
      rejets.push({
        source: 'locataires', ligne: numero,
        motif: `bail ${id} : sortie (${cellule(l, iSor)}) antérieure à l’entrée (${cellule(l, iEff)}) — bail non repris`,
      });
      return;
    }
    occupations.push({
      wippimmoId: id, clePersonne: cle, lotWippimmoId: lotRef,
      lotConnu: idsLots.has(lotRef), entree, sortie,
    });
  });

  return { locataires: [...locataires.values()], occupations, regroupes };
}

/** Un résumé lisible du plan, pour la sortie console et pour le journal. PUR. */
export function resumerPlan(p: PlanImport): string[] {
  return [
    `propriétaires : ${p.proprietaires.length}`,
    `lots : ${p.lots.length} (dont ${p.lotsSansProprietaire} sans propriétaire rattaché)`,
    `locataires : ${p.locataires.length} personnes pour ${p.occupations.length} baux ` +
      `(${p.locatairesRegroupes} baux regroupés sous une personne déjà vue)`,
    `baux visant un lot hors gestion : ${p.occupationsHorsGestion}`,
    `homonymes de propriétaires signalés : ${p.homonymes.length}`,
    `rejets : ${p.rejets.length}`,
  ];
}
