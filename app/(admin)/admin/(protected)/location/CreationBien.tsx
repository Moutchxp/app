'use client';

import { ListeChoix } from './ListeChoix';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ModaleIssue } from './ModaleIssue';
import { causeDeLaReponse, explicationEchec, explicationEchecDe, type CauseEchec } from '../../../../lib/location/issueEnregistrement';
import { API, CSS_ANNEXE_CARTE, CSS_LOCATION_CREATION, CSS_LOCATION_ECRANS, EnTeteLocation, EtatLecture, envoyer, journaliserEchecPage, liste, phraseMail, useLecture } from './commun';
import { LigneManques } from './LigneManques';
import { ChampAdresseBan, CSS_CHAMP_ADRESSE } from '../gestion/ChampAdresseBan';
import {
  AVERTISSEMENT_ID_FISCAL, CHAUFFAGES, DPE_NON_SOUMIS, idFiscalInhabituel, EPOQUES_CONSTRUCTION, FAMILLES, LIBELLE_FAMILLE, LIBELLE_SITUATION_PARKING, LIBELLE_TYPE_LOCAL,
  LIBELLE_TYPE_LOGEMENT, LIBELLE_TYPE_PARKING, manquesDuBien, NOM_FAMILLE, SITUATIONS_PARKING, TYPES_LOCAL, TYPES_LOGEMENT, TYPES_PARKING,
  LIBELLE_CHARGES_COPRO, type ChargesCopro, type Famille, type SituationParking, type TypeLocal, type TypeLogement, type TypeParking,
} from '../../../../lib/location/bienComplet';
import { verifierChampsBien, type Categorie } from '../../../../lib/location/locationBien';
import type { ResultatPortefeuille } from '../../../../lib/location/recherchePortefeuille';
import { CSS_CARTES, type ChampsSaisis } from '../gestion/CartesPersonnes';
import { lireContactsEnAttente, oublierContactsEnAttente } from './contactsEnAttente';
import { CartesDuBloc, CSS_RATTACHEMENT, PanneauQuiRattacher } from './RattachementProprietaires';
import { LIBELLE_AG } from '../../../../lib/location/immeubleAg';
import { ChampFleches, CSS_CHAMP_FLECHES } from './ChampFleches';
import { BlocEntretien, CSS_ENTRETIEN, ENTRETIEN_VIDE, versEnvoiEntretien, versSaisieEntretien, type SaisieEntretien } from './EntretienBien';
import { CSS_ZONE_AUTO, ZoneAuto } from './ZoneAuto';
import { aujourdhuiParis } from '../../../../lib/location/reglagesDpe';
import { BlocDpe, CSS_DPE_PNO } from './BlocDpe';
import { resumeAnnexe } from '../../../../lib/location/annexeLocation';
import { BadgeCarte } from './SaisieCartes';
import { ajouterContacts, ajouterProprietaires, type ContactProprietaire, type PersonneProprietaire } from '../../../../lib/location/rattachementProprietaires';
import { BlocSyndic, type SyndicChoisi } from './BlocSyndicBien';
import { CSS_FETE } from './FeteOui';
import { QuestionEnGestion } from './QuestionEnGestion';
import { LignesMandat } from './LignesMandat';
// 🔴 Arno (26/10/2026, 430) — « Le bien est-il loué au moment de la prise en gestion ? » et l'enchaînement vers le locataire en place.
import { CSS_RENTRE_OCCUPE, QuestionRentreOccupe } from './QuestionRentreOccupe';
import { lienLocataireEnPlace, manquesRentreOccupe } from '../../../../lib/location/rentreOccupe';
import type { Mandat, SorteMandat } from '../../../../lib/location/mandatBien';
import { LIBELLE_OUI_NON, OUI_NON, Pilules, versOuiNon } from './Pilules';
import { BlocStatutModification } from './StatutModification';
import { annoncerBienModifie, useAvertissementSortie, type ImportBien } from '../gestion/EditionEncart';
import { contactsSyndicEnTexte, entretiensEnTexte, LIBELLE_CATEGORIE, type ValeursEncart } from '../../../../lib/location/encartBien';
import { changementsFiche, refusFiche, titreAnnexeSaisie, type ChangementFiche, type SaisieFiche, type TransitionSaisie } from '../../../../lib/location/ficheBienEntiere';
import type { LectureFiche } from '../../../../lib/location/ficheBienEntiereRepo';
import { LIBELLE_DESTINATION } from '../../../../lib/gestion/statutBien';
import { ORDRE_BOUTONS_CHARGES } from '../../../../lib/location/chargesDesLots';
import { ChampNombre } from './ChampNombre';
import { CHAMPS_DU_CHEMIN, champsRemplisDuChemin, messageEffacement, restreindreAuChemin, viderHorsChemin, type FamilleBien } from '../../../../lib/location/cheminsBien';

/**
 * ══ 🔴🔴 TUILE LOCATION — « AJOUTER UN NOUVEAU BIEN » (/admin/location/nouveau-bien), Arno, 17/10/2026 ══════════════════
 *
 * « Juste au-dessus du formulaire, une ligne de recherche qui ne cherche QUE parmi les propriétaires (nom, prénom,
 * téléphone, e-mail, et adresse postale des biens en gestion de notre portefeuille — aucune autre adresse). Choisir un
 * résultat rattache le bien à ce propriétaire (plusieurs possibles). Si on arrive depuis “Créer un nouveau propriétaire”,
 * les propriétaires sont déjà là, modifiables. »
 * 🔴 Arno, 18/10/2026 : choisir un résultat ouvre, juste en dessous, « Qui rattacher à ce bien ? » (la personne cherchée,
 * les personnes propriétaires liées, leurs contacts — `RattachementProprietaires.tsx`) ; les cartes retenues s'affichent en
 * bas du bloc 1, en lecture seule. Seules les personnes cochées deviennent propriétaires du bien.
 * « Formulaire complet, logique ENTONNOIR (du plus général / important au détail), en sections titrées » : Propriétaire(s)
 * · Adresse et situation · Le bien · Copropriété · Annexes · Caractéristiques complémentaires · Commentaires.
 * Bouton « Enregistrer le bien » toujours accessible (en bas et collant). La règle est celle de `bienComplet.ts`, la même
 * que le serveur.
 *
 * ══ FAMILLE DE BIEN (Arno, 17/10/2026) ══════════════════════════════════════════════════════════════════════════════════
 * En tête du bloc « Le bien » : « Logement » · « Un local » · « Parking nu » — tant qu'aucun n'est choisi, les champs du
 * bloc ne s'affichent pas. Un parking nu n'a ni annexes ni caractéristiques complémentaires ; les titres et phrases
 * s'adaptent, l'ordre en entonnoir ne change pas. Ascenseur et digicode pour toutes les familles ; annexes « parking » avec
 * les options du parking ; chaque annexe « Même adresse » (par défaut) ou « Autre adresse ».
 *
 * ══ « BIEN EN GESTION ? » (Arno, 20/10/2026) ════════════════════════════════════════════════════════════════════════════
 * « Ce bien n'est pas forcément en gestion : chaque bien doit porter son propre statut. » Dernier bloc, après
 * « Commentaires » : le MÊME bloc que « Propriétaire(s) en gestion ? » (`QuestionEnGestion`), réponse OBLIGATOIRE (elle
 * entre dans « Reste à renseigner » et bloque « Enregistrer le bien »). Le statut est porté par le BIEN (migration 390). En
 * continuité de « Créer un nouveau propriétaire », la question n'est pas reposée : le bien prend la réponse donnée pour
 * ses propriétaires juste au-dessus.
 */
interface Annexe {
  cle: number; categorie: Categorie; etage: string; numLotCopro: string; porte: string;
  /** Le nom d'une annexe « Autre » (Cellier, Grenier, Local vélo) — obligatoire pour elle (Arno, 18/10/2026). */
  nomAnnexe: string;
  /** Arno, 18/10/2026 — l'annotation libre ; « Détachée » (louable séparément) ; carte repliée ; suppression à confirmer. */
  annotation: string; detachee: boolean; fermee: boolean; aConfirmer: boolean;
  parkingSituation: SituationParking | null; parkingType: TypeParking | null;
  autreAdresse: boolean; adresse: string; codePostal: string; commune: string; adresseVerifiee: boolean;
  /** « Modifier » la fiche (Arno, 23/10/2026) : l'annexe EXISTANTE (son identifiant), à sortir du portefeuille, et si son adresse se modifie. */
  id?: number | null; sortir?: boolean; adresseModifiable?: boolean;
}

const VIDE = {
  adresse: '', codePostal: '', commune: '', batiment: '', escalier: '', etage: '', porte: '', precisionAcces: '', digicodeCode: '',
  nombrePieces: '', surfaceHabitableM2: '', surfaceCarrezM2: '', surfaceExterieureM2: '', surfaceM2: '',
  numLotCopro: '', syndicId: '', epoqueConstruction: '', chauffage: '', dpeClasse: '', dpeDate: '', commentaire: '', derniereAg: '',
  pnoDateAnniversaire: '', idFiscal: '',
};
type Champ = keyof typeof VIDE;

const LIBELLE_ANNEXE: Record<string, string> = { cave: 'Cave', parking: 'Parking', box: 'Box', autre: 'Autre annexe' };
const estParking = (c: Categorie): boolean => c === 'parking' || c === 'box';


/**
 * ══ « CRÉER UN NOUVEAU PROPRIÉTAIRE » → LE BIEN DANS LA CONTINUITÉ (Arno, 18/10/2026) ══════════════════════════════════
 * « Afficher JUSTE EN DESSOUS, sur la même page, exactement le même formulaire (mêmes blocs, mêmes composants, aucune
 * copie), SANS le bloc “Propriétaire(s)” : les propriétaires et contacts qu'on vient de créer sont rattachés d'office (rappel
 * en lecture seule en tête). Numérotation qui démarre à “Le bien”. Un seul enregistrement final crée les fiches puis le
 * bien (si le bien échoue, les fiches déjà créées restent et le message le dit). »
 */
export interface Continuite {
  /** Le rappel, en lecture seule : les propriétaires et les contacts saisis à l'écran. */
  proprietaires: { nom: string }[];
  contacts: ChampsSaisis[];
  /** Crée les fiches (une seule fois : un second appel rend les mêmes identifiants), ou rend le motif du refus. */
  creerFiches: () => Promise<{ ids: number[] } | { motif: string }>;
  /** « Propriétaire(s) en gestion ? » de l'écran du dessus : le statut du bien créé avec eux (Arno, 20/10/2026). */
  enGestion?: boolean | null;
}

/**
 * ══ 🔴🔴 « MODIFIER » LA FICHE DU BIEN : CE MÊME FORMULAIRE, PRÉ-REMPLI (Arno, 23/10/2026) ═════════════════════════════════════════════
 *
 * « UN seul “Modifier” qui ouvre l'intégralité du formulaire “Nouveau bien”, pré-rempli avec toutes les valeurs existantes (adresse,
 * famille, caractéristiques, situation et accès, annexes, copropriété & ID fiscal, DPE, statut et mandat, commentaire…), avec Annuler /
 * Valider, modale de contre-validation et confirmation habituelles. » Le MÊME composant dans la Gestion et dans la Location
 * (`ModifierFicheBien.tsx`). En modification :
 *   · pas de bloc « Propriétaire(s) » (rappel en lecture seule) ; « Bien en gestion ? » devient « Statut du bien » : le statut actuel et
 *     les SEULES transitions permises (`StatutModification.tsx`) ;
 *   · l'adresse d'un bien importé (tenue par WIPPIMMO) est montrée, non modifiable ; une annexe existante garde sa catégorie et son
 *     choix « même / autre adresse » ; « Supprimer » une annexe existante la SORT du portefeuille à la validation (rien n'est effacé) ;
 *   · rien n'est exigé au-delà de ce que le serveur refuserait (une fiche existante n'est jamais bloquée par les obligatoires de la
 *     création) ; « Valider les modifications » montre « Champ : ancienne valeur → nouvelle valeur » (et ce que le statut fera du
 *     dossier Drive) avant d'enregistrer ;
 *   · une empreinte différente en base (`versionDistante`, relue toutes les quelques secondes) : « Ce bien a été modifié par ailleurs —
 *     recharger ? » ; le serveur refuse aussi d'écrire sur une version dépassée.
 */
export interface ModificationBien {
  lotId: number;
  lecture: LectureFiche;
  versionDistante: string | null;
  /** Les valeurs de l'import WIPPIMMO affichées par l'encart quand la Location est vide : DITES, jamais recopiées. */
  importe?: ImportBien;
  onFermer: () => void;
  /** Après « ✓ Modifications enregistrées », fermée : la fiche se relit et le formulaire se referme. */
  onEnregistre: () => void;
  /** « Recharger » : relire la fiche (la saisie en cours est abandonnée). */
  onRecharger: () => void;
  /** Le lien « ← … » de l'en-tête : la fiche du bien d'où l'on vient (Gestion ou Location). */
  retour: { href: string; mot: string };
  /**
   * Arno (24/10/2026) — le formulaire ouvert DANS UNE MODALE (« Caractéristiques du bien loué » de « Nouveau locataire ») : le lien de
   * l'en-tête referme la modale (comme « Annuler », avec la question si la saisie a changé) au lieu de quitter la page.
   */
  dansModale?: boolean;
  /**
   * 🔴 Arno (25/10/2026, 425) — un bloc AJOUTÉ sous « Statut du bien » par l'hôte (le bloc 9 « Origine du contact », seulement depuis le
   * Suivi du mois), avec son numéro ; il a son propre enregistrement, indépendant du formulaire du bien.
   */
  blocApres?: (numero: number) => React.ReactNode;
  /**
   * Les appels de la FICHE COMMUNE (la route de la Gestion, gardée par `perm_gestion`), fournis par l'hôte : ce formulaire de la
   * Location ne parle qu'à sa propre route (garde `locationBien.test.ts`).
   */
  enregistrer: (saisie: SaisieFiche & { confirmeOccupation?: boolean }) => Promise<{ statut: number | null; corps: { etat?: string; motif?: string; message?: string; erreur?: string;
    data?: { changements?: ChangementFiche[]; notes?: string[] } } }>;
  /** Combien de locations en cours une annexe a (l'avertissement avant de la sortir du portefeuille). */
  occupationsDe: (annexeId: number) => Promise<number>;
  /**
   * 🔴 Arno (24/10/2026) — depuis « Suivi du mois » : QUI a modifié la fiche et QUAND (« modifiée par X le … à HH:MM, rechargez »),
   * dit dans le bandeau et la fenêtre du conflit ; et « Enregistrer les modifications » inactif tant que rien n'a changé. Absents :
   * l'écran d'avant, inchangé.
   */
  detailConflit?: string | null;
  desactiverSansChangement?: boolean;
}

const ouiNonDe = (v: string): boolean | null => (v === 'oui' ? true : v === 'non' ? false : null);
const enOuiNon = (v: boolean | null): string => (v === true ? 'oui' : v === false ? 'non' : '');

/** L'état du formulaire, rempli depuis la fiche lue (une seule source). */
function etatDepuisLecture(l: LectureFiche) {
  const v = l.encart.valeurs;
  const b: typeof VIDE = {
    adresse: v.adresse, codePostal: v.codePostal, commune: v.commune, batiment: v.batiment, escalier: v.escalier, etage: v.etage, porte: v.porte,
    precisionAcces: v.precisionAcces, digicodeCode: v.digicodeCode, nombrePieces: v.nombrePieces, surfaceHabitableM2: v.surfaceHabitableM2,
    surfaceCarrezM2: v.surfaceCarrezM2, surfaceExterieureM2: v.surfaceExterieureM2, surfaceM2: v.surfaceM2, numLotCopro: v.numLotCopro, syndicId: v.syndicId,
    epoqueConstruction: v.epoqueConstruction, chauffage: v.chauffage, dpeClasse: v.dpeClasse, dpeDate: v.dpeDate, commentaire: v.commentaire,
    derniereAg: v.derniereAg, pnoDateAnniversaire: v.pnoDateAnniversaire, idFiscal: v.idFiscal,
  };
  const entretiens = (() => { try { return JSON.parse(v.entretiens || '[]') as { sorte: 'chaudiere' | 'ramonage' | 'autre'; nom: string | null; dateAnniversaire: string | null }[]; } catch { return []; } })();
  return {
    b, famille: l.encart.famille, type: (v.typeLogement || null) as TypeLogement | null, typeLocal: (v.typeLocal || null) as TypeLocal | null,
    parkingSituation: (v.parkingSituation || null) as SituationParking | null, parkingType: (v.parkingType || null) as TypeParking | null,
    meuble: ouiNonDe(v.meuble), ascenseur: ouiNonDe(v.ascenseur), digicode: ouiNonDe(v.digicode),
    syndic: v.syndicId === '' ? null : { id: Number(v.syndicId), nom: v.syndicNom, ville: null, contactsIds: [], nouveauxContacts: [] } as SyndicChoisi,
    assurancePno: ouiNonDe(v.assurancePno), chargesCopro: (v.chargesCopro || null) as ChargesCopro | null,
    entretien: versSaisieEntretien(ouiNonDe(v.entretienAPrevoir), entretiens),
    annexes: l.annexes.map((a): Annexe => ({
      cle: a.id, id: a.id, categorie: a.categorie, etage: a.etage, numLotCopro: a.numLotCopro, porte: a.porte, nomAnnexe: a.nomAnnexe, annotation: a.annotation,
      detachee: a.detachee, fermee: true, aConfirmer: false, parkingSituation: (a.parkingSituation || null) as SituationParking | null,
      parkingType: (a.parkingType || null) as TypeParking | null, autreAdresse: a.autreAdresse, adresse: a.adresse, codePostal: a.codePostal, commune: a.commune,
      adresseVerifiee: true, adresseModifiable: a.adresseModifiable, sortir: false,
    })),
  };
}

export function CreationBien({ proprietairesInitiaux, continuite, modification }: { proprietairesInitiaux: number[]; continuite?: Continuite; modification?: ModificationBien }) {
  const [init] = useState(() => (modification === undefined ? null : etatDepuisLecture(modification.lecture)));
  const [proprietaires, setProprietaires] = useState<PersonneProprietaire[]>([]);
  /** Les contacts EXISTANTS de la Gestion cochés dans « Qui rattacher à ce bien ? ». */
  const [contactsExistants, setContactsExistants] = useState<ContactProprietaire[]>([]);
  /** Le résultat de la recherche dont le panneau « Qui rattacher à ce bien ? » est ouvert. */
  const [enChoix, setEnChoix] = useState<number | null>(null);
  const [texte, setTexte] = useState('');
  const [terme, setTerme] = useState('');
  const [b, setB] = useState(init?.b ?? VIDE);
  const [famille, setFamille] = useState<Famille | null>(init?.famille ?? null);
  const [type, setType] = useState<TypeLogement | null>(init?.type ?? null);
  const [typeLocal, setTypeLocal] = useState<TypeLocal | null>(init?.typeLocal ?? null);
  const [parkingSituation, setParkingSituation] = useState<SituationParking | null>(init?.parkingSituation ?? null);
  const [parkingType, setParkingType] = useState<TypeParking | null>(init?.parkingType ?? null);
  const [meuble, setMeuble] = useState<boolean | null>(init?.meuble ?? null);
  const [ascenseur, setAscenseur] = useState<boolean | null>(init?.ascenseur ?? null);
  const [digicode, setDigicode] = useState<boolean | null>(init?.digicode ?? null);
  const [adresseVerifiee, setAdresseVerifiee] = useState(init !== null);
  /* 🔴 Arno (25/10/2026) — CHOIX EN CASCADE REMIS À ZÉRO : quitter une famille vide ses sous-choix et ses champs propres (type, meublé,
     pièces, surfaces, type de local, parking) ; les champs communs ne bougent pas. Le message dit ce qui a été effacé. */
  const [effaces, setEffaces] = useState<FamilleBien | null>(null);
  const changerFamille = (f: Famille): void => {
    if (f === famille) return;
    if (famille !== null) {
      const avant = famille as FamilleBien;
      const valeurs: Record<string, unknown> = { ...b, typeLogement: type, typeLocal, parkingSituation, parkingType, meuble };
      // Le message reste tant qu'un autre effacement ne le remplace pas (il est toujours vrai).
      if (champsRemplisDuChemin(avant, valeurs).length > 0) setEffaces(avant);
      const propres = CHAMPS_DU_CHEMIN[avant];
      if (propres.includes('typeLogement')) setType(null);
      if (propres.includes('meuble')) setMeuble(null);
      if (propres.includes('typeLocal')) setTypeLocal(null);
      if (propres.includes('parkingSituation')) setParkingSituation(null);
      if (propres.includes('parkingType')) setParkingType(null);
      setB((x) => ({ ...x, ...Object.fromEntries(propres.filter((k) => k in x).map((k) => [k, ''])) }));
    }
    setFamille(f);
  };
  const [annexes, setAnnexes] = useState<Annexe[]>(init?.annexes ?? []);
  const [tente, setTente] = useState(false);
  const [motif, setMotif] = useState<string | null>(null);
  /** Le bien est enregistré, mais le mail « nouveau mandat » n'est pas parti (Arno, 18/10/2026). */
  const [mailEchec, setMailEchec] = useState<{ phrase: string; cible: string } | null>(null);
  /* Arno (21/10/2026, 397) — LE MANDAT selon « Bien en gestion ? » : les deux lignes gardées en mémoire, pré-remplies depuis la
     fiche des propriétaires choisis (tant qu'on n'y a pas touché) ; seul le mandat du choix final part avec le bien. */
  const [mandats, setMandats] = useState<Record<SorteMandat, Mandat>>({ gestion: { numero: null, signeLe: null }, transaction: { numero: null, signeLe: null } });
  const mandatTouche = useRef<Record<SorteMandat, boolean>>({ gestion: false, transaction: false });
  const [notesMandat, setNotesMandat] = useState<Partial<Record<SorteMandat, string | null>>>({});
  const [envoi, setEnvoi] = useState(false);
  /* Arno (21/10/2026) — PLUS AUCUN ÉCHEC SILENCIEUX : l'issue de « Enregistrer le bien » s'ouvre en MODALE (succès : résumé et
     gestes suivants ; échec : quoi, pourquoi, quoi faire). `enCours` interdit le double clic (avant même le rendu suivant) ;
     `enregistre` : le bien est créé — le bouton ne le recrée jamais. */
  const [issue, setIssue] = useState<{ sorte: 'succes'; cible: string; notes: string[]; suite?: string } | { sorte: 'erreur'; cause: CauseEchec; motif: string | null }
    | { sorte: 'selection' } | { sorte: 'doublon'; motif: string; lotId: number }
    // « Modifier » la fiche (Arno, 23/10/2026) : contre-validation, succès, version dépassée, abandon de la saisie.
    | { sorte: 'contre'; changements: ChangementFiche[]; notes: string[]; confirmeOccupation: boolean } | { sorte: 'succes-modif'; changements: ChangementFiche[]; notes: string[] }
    | { sorte: 'conflit' } | { sorte: 'abandon' } | { sorte: 'aucune' } | null>(null);
  /* Arno (21/10/2026) — GARDE-FOU « SÉLECTION EN ATTENTE » : le panneau « Qui rattacher à ce bien ? » confie ici son geste
     « Rattacher la sélection » tant que des cases cochées n'ont pas été rattachées ; « Rattacher et enregistrer » l'emploie,
     puis enregistre dès que les cartes sont posées. */
  const selectionEnAttente = useRef<(() => boolean) | null>(null);
  const surEnAttente = useCallback((f: (() => boolean) | null) => { selectionEnAttente.current = f; }, []);
  const [enregistrerApresRattachement, setEnregistrerApresRattachement] = useState(false);
  const [enregistre, setEnregistre] = useState<string | null>(null);
  const enCours = useRef(false);
  /** Le contrôle de la PAGE qui bloque l'envoi : dit au journal du serveur (best effort, jamais bloquant). */
  const journalEchec = (cause: CauseEchec | 'selection', raison: string): void => {
    journaliserEchecPage({ ecran: 'nouveau-bien', pour: 'creer-bien', cause, raison });
  };
  /** Les CONTACTS DU PROPRIÉTAIRE saisis à l'écran précédent : enregistrés avec le bien (ils se rangent sur lui). */
  const [contacts, setContacts] = useState<ChampsSaisis[]>([]);
  /** Le SYNDIC choisi (loupe, suggestion « déjà connu pour cette adresse », ou créé dans la modale de la Gestion). */
  const [syndic, setSyndic] = useState<SyndicChoisi | null>(init?.syndic ?? null);
  useEffect(() => { if (continuite === undefined && modification === undefined) setContacts(lireContactsEnAttente(proprietairesInitiaux)); }, [proprietairesInitiaux, continuite, modification]);
  /** L'ASSURANCE PNO (Arno, 18/10/2026) : oui / non / non renseigné ; Non vide la date anniversaire. */
  const [assurancePno, setAssurancePno] = useState<boolean | null>(init?.assurancePno ?? null);
  /** « PAIEMENT DES CHARGES » (Arno, 21/10/2026, migration 400) : Propriétaire / Agence / non renseigné — FACULTATIF. */
  const [chargesCopro, setChargesCopro] = useState<ChargesCopro | null>(init?.chargesCopro ?? null);
  /** L'ENTRETIEN À PRÉVOIR (Arno, 18/10/2026) : Non vide le tout. */
  const [entretien, setEntretien] = useState<SaisieEntretien>(init?.entretien ?? ENTRETIEN_VIDE);
  /**
   * « BIEN EN GESTION ? » (Arno, 20/10/2026) : `null` tant qu'on n'a pas répondu. En continuité, la question n'est pas
   * posée : la réponse du dessus (toujours donnée avant que ce formulaire s'ouvre), sinon rien (« en gestion » par défaut).
   */
  const [enGestionSaisi, setEnGestion] = useState<boolean | null>(null);
  const enGestion: boolean | null | undefined = continuite !== undefined ? continuite.enGestion ?? undefined : enGestionSaisi;
  /* 🔴 Arno (26/10/2026, 430) — « LOUÉ AU MOMENT DE LA PRISE EN GESTION ? » : obligatoire pour un bien en gestion (création seulement).
     La date du mandat est le champ EXISTANT « Mandat de gestion — date de signature » (hors continuité, où ce champ n'existe pas). */
  const [entreOccupe, setEntreOccupe] = useState<boolean | null>(null);
  const [dateMandatContinuite, setDateMandatContinuite] = useState('');
  const schemaOccupe = useLecture<boolean>(modification === undefined ? 'rentreOccupeDisponible' : null);
  const occupeDisponible = schemaOccupe.etat.etat === 'ok' && schemaOccupe.etat.data === true;

  // Les propriétaires arrivés de « Créer un nouveau propriétaire » : déjà rattachés, modifiables (retirables).
  const initiaux = useLecture<PersonneProprietaire[]>(proprietairesInitiaux.length > 0 ? `cartesProprietaires=${proprietairesInitiaux.join(',')}` : null);
  const [initiauxPoses, setInitiauxPoses] = useState(false);
  useEffect(() => {
    if (!initiauxPoses && initiaux.etat.etat === 'ok') {
      setProprietaires(liste(initiaux.etat.data).slice());
      setInitiauxPoses(true);
    }
  }, [initiaux.etat, initiauxPoses]);

  useEffect(() => { const t = setTimeout(() => setTerme(texte.trim()), 200); return () => clearTimeout(t); }, [texte]);

  // La DERNIÈRE AG (Arno, 18/10/2026) : partagée par l'immeuble — pré-remplie si elle est déjà connue pour l'adresse saisie,
  // tant qu'on n'y a pas touché ; la modifier ici met à jour l'immeuble à l'enregistrement.
  // En modification, la fiche a déjà SA valeur : rien n'est pré-rempli par-dessus.
  const agTouchee = useRef(modification !== undefined);
  const [agConnue, setAgConnue] = useState<string | null>(null);
  useEffect(() => {
    const adresse = b.adresse.trim();
    if (adresse.length < 5) { setAgConnue(null); return; }
    let vivant = true;
    const t = setTimeout(() => {
      void fetch(`${API}?agPourAdresse=${encodeURIComponent(adresse)}`, { cache: 'no-store' }).then((r) => r.json() as Promise<{ etat?: string; data?: string | null }>)
        .then((d) => {
          if (!vivant || d.etat !== 'ok') return;
          const connue = typeof d.data === 'string' ? d.data : null;
          setAgConnue(connue);
          if (!agTouchee.current) setB((x) => ({ ...x, derniereAg: connue ?? '' }));
        }).catch(() => {});
    }, 500);
    return () => { vivant = false; clearTimeout(t); };
  }, [b.adresse]);
  /* Arno (21/10/2026, 396) — LE DIGICODE EST CELUI DE L'IMMEUBLE de l'adresse : connu, il pré-remplit le champ (tant qu'on n'y a
     pas touché), et la mention « Commun à tous les biens du … (N biens) » s'affiche ; le modifier ici le modifie pour l'immeuble. */
  const digicodeTouche = useRef(modification !== undefined);
  const [digicodeImmeuble, setDigicodeImmeuble] = useState<{ mention: string | null; source: string | null; portee?: string } | null>(null);
  useEffect(() => {
    const voie = b.adresse.trim();
    if (voie.length < 5) { setDigicodeImmeuble(null); return; }
    let vivant = true;
    const t = setTimeout(() => {
      // Arno (21/10/2026, 399) : le code du BÂTIMENT saisi (le code général de l'adresse sans bâtiment, ou si le bâtiment n'en a pas).
      const q = `digicodePourAdresse=${encodeURIComponent(voie)}&cp=${encodeURIComponent(b.codePostal.trim())}&commune=${encodeURIComponent(b.commune.trim())}&batiment=${encodeURIComponent(b.batiment.trim())}`;
      void fetch(`${API}?${q}`, { cache: 'no-store' }).then((r) => r.json() as Promise<{ etat?: string; data?: { digicode: boolean | null; code: string | null; source: string | null; mention: string | null; portee?: string } | null }>)
        .then((d) => {
          if (!vivant || d.etat !== 'ok' || d.data === null || d.data === undefined) { if (vivant) setDigicodeImmeuble(null); return; }
          const lu = d.data;
          setDigicodeImmeuble({ mention: lu.mention, source: lu.source, portee: lu.portee });
          if (!digicodeTouche.current && lu.source === 'immeuble') {
            setDigicode(lu.digicode);
            setB((x) => ({ ...x, digicodeCode: lu.code ?? '' }));
          }
        }).catch(() => {});
    }, 500);
    return () => { vivant = false; clearTimeout(t); };
  }, [b.adresse, b.codePostal, b.commune, b.batiment]);
  const idsProprietaires = proprietaires.map((p) => p.id).join(',');
  useEffect(() => {
    if (idsProprietaires === '' || continuite !== undefined) return;
    let vivant = true;
    void fetch(`${API}?mandatsProprietaires=${idsProprietaires}`, { cache: 'no-store' })
      .then((r) => r.json() as Promise<{ etat?: string; data?: { nom: string; gestion: Mandat; transaction: Mandat }[] }>)
      .then((d) => {
        if (!vivant || d.etat !== 'ok' || !Array.isArray(d.data)) return;
        const notes: Partial<Record<SorteMandat, string | null>> = {};
        const suivants: Partial<Record<SorteMandat, Mandat>> = {};
        for (const sorte of ['gestion', 'transaction'] as const) {
          const connu = d.data.find((p) => p[sorte].numero !== null || p[sorte].signeLe !== null);
          if (connu === undefined || mandatTouche.current[sorte]) continue;
          suivants[sorte] = connu[sorte];
          notes[sorte] = `Pré-rempli avec le ${sorte === 'gestion' ? 'mandat de gestion' : 'mandat de transaction locative'} existant de ${connu.nom} — modifiable.`;
        }
        setMandats((m) => ({ ...m, ...suivants }));
        setNotesMandat(notes);
      }).catch(() => {});
    return () => { vivant = false; };
  }, [idsProprietaires, continuite]);
  const recherche = useLecture<ResultatPortefeuille[]>(terme.length >= 2 ? `proprietairesRecherche=${encodeURIComponent(terme)}` : null);

  const champ = (k: Champ, mot: React.ReactNode, props: React.InputHTMLAttributes<HTMLInputElement> = {}, aide?: string) => (
    <label className="loc-champ">{mot}{props.inputMode === 'decimal' ? <ChampNombre value={b[k]} onChange={(e) => { const val = e.target.value; setB((x) => ({ ...x, [k]: val })); }} {...props} /> : <input value={b[k]} onChange={(e) => { const val = e.target.value; setB((x) => ({ ...x, [k]: val })); }} {...props} />}
      {aide !== undefined && <small className="loc-aide">{aide}</small>}</label>
  );
  const choix = (k: Champ, mot: string, options: readonly string[]) => (
    <label className="loc-champ">{mot}
      {/* 🔴 Arno (24/10/2026) — la liste verte de Location ; une valeur hors liste (déjà en base) reste montrée et choisie. */}
      <ListeChoix options={[...options, ...(b[k] !== '' && !options.includes(b[k]) ? [b[k]] : [])].map((o) => ({ id: o, libelle: o }))} valeur={b[k]} vide="— non renseigné —" libelle={mot}
        onChange={(val) => setB((x) => ({ ...x, [k]: val }))} donnees={{ 'data-choix-bien': k }} /></label>
  );
  const changerAnnexe = (i: number, f: (a: Annexe) => Annexe): void => setAnnexes((l) => l.map((x, j) => (j === i ? f(x) : x)));
  const ajouterAnnexe = (categorie: Categorie): void => setAnnexes((a) => [...a, {
    cle: Date.now() + a.length, categorie, etage: '', numLotCopro: '', porte: '', nomAnnexe: '', annotation: '', detachee: false, fermee: false, aConfirmer: false,
    parkingSituation: null, parkingType: null,
    autreAdresse: false, adresse: '', codePostal: '', commune: '', adresseVerifiee: false,
  }]);

  const nom = famille === null ? 'bien' : NOM_FAMILLE[famille];
  /** En modification : ce que la fiche montre (une annexe n'a pas d'annexes ; l'ID fiscal, la PNO… seulement là où le serveur les écrit). */
  const lu = modification?.lecture.encart;
  const ficheAnnexe = lu?.annexe === true;
  const avecAnnexes = famille !== 'parking' && !ficheAnnexe;
  const avecComplements = famille !== 'parking';
  const montre = (cle: 'avecAg' | 'avecIdFiscal' | 'avecCharges' | 'avecPno' | 'avecEntretien'): boolean =>
    lu === undefined || (lu[cle] === true && (cle === 'avecAg' || cle === 'avecEntretien' || !lu.annexe));
  /** « Entretien à prévoir » : dans le bloc des caractéristiques complémentaires (pas pour un parking), là où la fiche le porte. */
  const avecEntretienEncadre = avecComplements && montre('avecEntretien');
  const [transition, setTransition] = useState<TransitionSaisie | null>(null);
  /** Les valeurs de l'import WIPPIMMO que l'encart affiche quand la Location est vide : DITES au-dessus des champs vides, jamais recopiées. */
  const importesModif: string[] = (() => {
    const imp = modification?.importe;
    const v = lu?.valeurs;
    if (imp === undefined || v === undefined) return [];
    const parking = famille === 'parking';
    const local = famille === 'local';
    const vide = (avant: string, maintenant: string): boolean => avant === '' && maintenant === '';
    const [typeAvant, typeMaintenant] = parking ? [v.parkingType, parkingType ?? ''] : local ? [v.typeLocal, typeLocal ?? ''] : [v.typeLogement, type ?? ''];
    return [
      ...(imp.type && vide(typeAvant, typeMaintenant) ? [`Type : ${imp.type}`] : []),
      ...(!parking && imp.meuble === true && vide(v.meuble, enOuiNon(meuble)) ? ['Meublé : oui'] : []),
      ...(!parking && imp.pieces != null && vide(v.nombrePieces, b.nombrePieces) ? [`Pièces : ${imp.pieces}`] : []),
      ...(imp.surface != null && vide(parking ? v.surfaceM2 : v.surfaceHabitableM2, parking ? b.surfaceM2 : b.surfaceHabitableM2)
        ? [`Surface : ${String(imp.surface).replace('.', ',')} m²`] : []),
    ];
  })();
  /** La saisie de « Modifier » : les valeurs de l'encart (texte), les annexes, la transition de statut. */
  const saisieModification = (): SaisieFiche | null => {
    if (modification === undefined) return null;
    const l = modification.lecture;
    const v = l.encart.valeurs;
    const e = versEnvoiEntretien(entretien);
    const categorie = l.encart.annexe || famille === null ? v.categorie : famille === 'parking' ? (v.categorie === 'box' ? 'box' : 'parking') : famille;
    // 🔴 25/10/2026 — seuls les champs du chemin choisi partent : ceux des autres chemins sont vidés (viderHorsChemin, plus bas).
    const valeurs: ValeursEncart = {
      ...v, categorie, adresse: b.adresse, codePostal: b.codePostal, commune: b.commune,
      assurancePno: enOuiNon(assurancePno), pnoDateAnniversaire: assurancePno === true ? b.pnoDateAnniversaire : '',
      etage: b.etage, porte: b.porte, numLotCopro: b.numLotCopro, surfaceCarrezM2: b.surfaceCarrezM2, surfaceExterieureM2: b.surfaceExterieureM2,
      typeLogement: type ?? '', typeLocal: typeLocal ?? '', parkingSituation: parkingSituation ?? '', parkingType: parkingType ?? '', meuble: enOuiNon(meuble),
      nombrePieces: b.nombrePieces, surfaceHabitableM2: b.surfaceHabitableM2, surfaceM2: b.surfaceM2, epoqueConstruction: b.epoqueConstruction, chauffage: b.chauffage,
      batiment: b.batiment, escalier: b.escalier, precisionAcces: b.precisionAcces, ascenseur: enOuiNon(ascenseur), digicode: enOuiNon(digicode), digicodeCode: b.digicodeCode,
      syndicId: syndic === null ? '' : String(syndic.id), syndicNom: syndic?.nom ?? '',
      syndicContacts: syndic === null ? '' : contactsSyndicEnTexte({ contactsIds: syndic.contactsIds, nouveauxContacts: syndic.nouveauxContacts }),
      chargesCopro: chargesCopro ?? '', idFiscal: b.idFiscal, derniereAg: b.derniereAg, dpeClasse: b.dpeClasse, dpeDate: b.dpeDate,
      entretienAPrevoir: enOuiNon(e.entretienAPrevoir), entretiens: entretiensEnTexte(e.entretiens), commentaire: b.commentaire,
    };
    const valeursDuChemin = l.encart.annexe || famille === null ? valeurs : viderHorsChemin(valeurs, famille as FamilleBien);
    return {
      version: l.version, valeurs: valeursDuChemin, statut: transition,
      annexes: annexes.map((a) => ({
        id: a.id ?? null, categorie: a.categorie, etage: a.etage, porte: a.porte, numLotCopro: a.numLotCopro, nomAnnexe: a.nomAnnexe, annotation: a.annotation,
        detachee: a.detachee, parkingSituation: a.parkingSituation ?? '', parkingType: a.parkingType ?? '', autreAdresse: a.autreAdresse,
        adresse: a.adresse, codePostal: a.codePostal, commune: a.commune, ...(a.sortir === true ? { sortir: true } : {}),
      })),
    };
  };
  const saisieModif = saisieModification();
  const changementsModif = modification === undefined || saisieModif === null ? [] : changementsFiche(modification.lecture, saisieModif);
  const conflit = modification !== undefined && enregistre === null && modification.versionDistante !== null && modification.versionDistante !== modification.lecture.version;
  useAvertissementSortie(modification !== undefined && enregistre === null && changementsModif.length > 0);
  const annulerModification = (): void => {
    if (modification === undefined) return;
    if (changementsModif.length > 0 && enregistre === null) { setIssue({ sorte: 'abandon' }); return; }
    if (enregistre !== null) modification.onEnregistre(); else modification.onFermer();
  };
  const annulerRef = useRef(annulerModification);
  useEffect(() => { annulerRef.current = annulerModification; });
  // Échap referme le formulaire (avec la question si la saisie a changé) — jamais quand une modale est ouverte par-dessus.
  useEffect(() => {
    if (modification === undefined) return;
    const surTouche = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (document.querySelectorAll('[aria-modal="true"]').length > 1) return;
      e.preventDefault();
      annulerRef.current();
    };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, [modification]);
  const validerModification = async (): Promise<void> => {
    if (modification === undefined || saisieModif === null || enCours.current || enregistre !== null) return;
    if (changementsModif.length === 0) { setIssue({ sorte: 'aucune' }); return; }
    const refus = refusFiche(modification.lecture, saisieModif);
    if (refus !== null) { setIssue({ sorte: 'erreur', cause: 'saisie', motif: refus }); return; }
    // « Supprimer » une annexe LOUÉE : l'avertissement de la fiche, dit dans la contre-validation (la sortie clôt ses locations).
    const occupation: string[] = [];
    for (const a of saisieModif.annexes.filter((x) => x.id !== null && x.sortir === true)) {
      try {
        const k = await modification.occupationsDe(a.id as number);
        if (k > 0) occupation.push(`L’annexe ${titreAnnexeSaisie(a)} est louée : la sortir du portefeuille clôt ${k === 1 ? 'sa location en cours' : `ses ${k} locations en cours`}.`);
      } catch { /* le serveur redira le refus */ }
    }
    const st = modification.lecture.statut;
    const notes = [
      ...(saisieModif.statut !== null ? [`Dossier Drive : ${LIBELLE_DESTINATION[saisieModif.statut.vers]} (le déplacement habituel du changement de statut ; aucun autre dossier n’est touché).`,
        ...(st !== null && (st.statut === 'en_gestion' || saisieModif.statut.vers === 'en_gestion') ? ['Le mail de portefeuille part, comme pour le geste de la fiche.'] : [])] : []),
      ...(changementsModif.some((c) => c.cle === 'adresse' || c.cle === 'codePostal' || c.cle === 'commune')
        ? ['Le dossier Drive du bien garde son nom et sa place : un changement d’adresse ne le renomme ni ne le déplace.'] : []),
      ...occupation,
    ];
    setIssue({ sorte: 'contre', changements: changementsModif, notes, confirmeOccupation: occupation.length > 0 });
  };
  const confirmerModification = async (confirmeOccupation: boolean): Promise<void> => {
    if (modification === undefined || saisieModif === null || enCours.current) return;
    enCours.current = true;
    setEnvoi(true);
    try {
      const { statut, corps: d } = await modification.enregistrer({ ...saisieModif, ...(confirmeOccupation ? { confirmeOccupation: true } : {}) });
      if (statut !== null && statut < 400 && d.etat === 'ok') {
        setEnregistre('modifie');
        setIssue({ sorte: 'succes-modif', changements: d.data?.changements ?? changementsModif, notes: d.data?.notes ?? [] });
        annoncerBienModifie(modification.lotId);
        return;
      }
      if (d.etat === 'conflit') { setIssue({ sorte: 'conflit' }); return; }
      setIssue({ sorte: 'erreur', cause: causeDeLaReponse({ statut, etat: d.etat, erreur: d.erreur }),
        motif: d.etat === 'sans_schema' ? 'La base de données n’est pas à jour pour cet enregistrement.' : d.motif ?? d.message ?? null });
    } catch {
      setIssue({ sorte: 'erreur', cause: 'technique', motif: null });
    } finally {
      enCours.current = false;
      setEnvoi(false);
    }
  };
  // Arno (18/10/2026) : DPE et « Entretien à prévoir » obligatoires pour un logement / local (la règle de `bienComplet.ts`).
  const aujourdhui = aujourdhuiParis();
  const dpeNonSoumis = b.dpeClasse === DPE_NON_SOUMIS;
  // En continuité, les propriétaires sont ceux qu'on vient de saisir (au moins un, vérifié par l'écran du dessus).
  // En modification : le bien a ses propriétaires, et son statut ne se « choisit » pas (il change par une transition) ; une annexe
  // n'a pas de famille à choisir. « Reste à renseigner » y est une INFORMATION, jamais un blocage.
  const questionOccupe = modification === undefined && enGestion !== false && (continuite !== undefined || enGestionSaisi === true);
  const dateMandatVue = continuite !== undefined ? dateMandatContinuite : (mandats.gestion.signeLe ?? '');
  const poserDateMandat = (d: string): void => {
    if (continuite !== undefined) { setDateMandatContinuite(d); return; }
    mandatTouche.current.gestion = true;
    setMandats((x) => ({ ...x, gestion: { ...x.gestion, signeLe: d === '' ? null : d } }));
  };
  const choisirOccupe = (oui: boolean): void => {
    setEntreOccupe(oui);
    // Pré-remplie au jour de la saisie (une date de mandat déjà connue est gardée) ; modifiable.
    if (oui && dateMandatVue === '') poserDateMandat(aujourdhui);
  };
  const manque = ficheAnnexe ? {} : { ...manquesDuBien({
    proprietaireIds: continuite !== undefined || modification !== undefined ? [1] : proprietaires.map((p) => p.id), adresse: b.adresse, famille, typeLogement: type, typeLocal, parkingType,
    dpeClasse: b.dpeClasse, dpeDate: b.dpeDate, entretienAPrevoir: entretien.aPrevoir, entretiens: versEnvoiEntretien(entretien).entretiens, aujourdhui,
    annexes: avecAnnexes ? annexes.map((a) => ({ autreAdresse: a.autreAdresse, adresse: a.adresse, categorie: a.categorie, nomAnnexe: a.nomAnnexe })) : [],
    ...(enGestion !== undefined && modification === undefined ? { enGestion } : {}),
  }), ...(questionOccupe ? manquesRentreOccupe({ enGestion: enGestion ?? true, disponible: occupeDisponible, entreOccupe, dateMandat: dateMandatVue }) : {}) };
  const manqueDe = (k: string): React.ReactNode => (tente && manque[k] !== undefined ? <p className="loc-manque" role="alert">{manque[k]}</p> : null);
  // La liste de « Reste à renseigner » (barre du bas) : la ligne, son compteur et la bulle la lisent toutes trois.
  const manquesLigne = Object.values(manque).map((m) => m.replace(/\.$/, ''));

  const enregistrer = async (options: { confirmeDoublon?: boolean } = {}): Promise<void> => {
    if (modification !== undefined) { await validerModification(); return; }
    if (enCours.current || enregistre !== null) return;
    // Une sélection cochée mais pas rattachée : jamais d'enregistrement silencieux sans elle (Arno, 21/10/2026).
    if (enChoix !== null && selectionEnAttente.current !== null) {
      setIssue({ sorte: 'selection' });
      journalEchec('selection', 'Propriétaire sélectionné sans « Rattacher la sélection ».');
      return;
    }
    setTente(true);
    if (Object.keys(manque).length > 0) {
      // Arno (21/10/2026) : jamais de silence — la modale dit ce qui manque ; la page garde ses messages et descend au premier.
      const raison = `Il manque : ${Object.values(manque).map((m) => m.replace(/\.$/, '')).join(' · ')}.`;
      setIssue({ sorte: 'erreur', cause: 'champs', motif: raison });
      journalEchec('champs', raison);
      // La barre collante dit, EN DIRECT, ce qui reste à renseigner (elle se vide au fur et à mesure) ; les messages
      // apparaissent sous chaque champ manquant.
      setMotif(null);
      // « Un message qui dit quoi remplir et défile jusqu'au bloc » (Arno, 18/10/2026) : le premier manque, dans l'ordre du formulaire.
      setTimeout(() => {
        const premier = document.querySelector('.loc-page .loc-manque');
        // Le bloc entier s'il tient à l'écran ; sinon le message lui-même (jamais caché sous la barre collante au téléphone).
        const conteneur = premier?.closest('.loc-dpe-pno-bloc, .loc-sous-section, .loc-section') ?? null;
        const bloc = conteneur !== null && conteneur.getBoundingClientRect().height < window.innerHeight * 0.6 ? conteneur : premier;
        const reduit = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (bloc instanceof HTMLElement && typeof bloc.scrollIntoView === 'function') bloc.scrollIntoView({ block: 'center', behavior: reduit ? 'auto' : 'smooth' });
      }, 0);
      return;
    }
    const v = verifierChampsBien(b);
    if (!v.ok) { setMotif(v.motif); setIssue({ sorte: 'erreur', cause: 'saisie', motif: v.motif }); journalEchec('saisie', v.motif); return; }
    enCours.current = true;
    setEnvoi(true);
    // Continuité : les fiches d'abord (une seule fois), puis le bien.
    let proprietaireIds = proprietaires.map((p) => p.id);
    if (continuite !== undefined) {
      const f = await continuite.creerFiches();
      if ('motif' in f) { enCours.current = false; setEnvoi(false); setMotif(f.motif); setIssue({ sorte: 'erreur', cause: 'saisie', motif: f.motif }); return; }
      proprietaireIds = f.ids;
    }
    const r = await envoyer({
      action: 'creer-bien', proprietaireIds, contactsExistants: contactsExistants.map((c) => c.id), enGestion,
      // 🔴 Arno (26/10/2026, 430) — la réponse, et la date du mandat (Oui) : la date d'entrée de la gestion dans le suivi.
      ...(questionOccupe && occupeDisponible && entreOccupe !== null ? { entreOccupe, ...(entreOccupe ? { dateMandat: dateMandatVue } : {}) } : {}),
      ...(options.confirmeDoublon === true ? { confirmeDoublon: true } : {}),
      // Seul le mandat du choix FINAL (Oui → gestion, Non → transaction locative) ; rien s'il n'est pas saisi.
      ...(continuite === undefined && enGestionSaisi !== null ? (() => {
        const sorte: SorteMandat = enGestionSaisi ? 'gestion' : 'transaction';
        const m = mandats[sorte];
        return (m.numero ?? '').trim() !== '' || m.signeLe !== null ? { mandat: { sorte, numero: (m.numero ?? '').trim(), signeLe: m.signeLe ?? '' } } : {};
      })() : {}),
      // 🔴 25/10/2026 — seuls les champs du chemin CHOISI partent (ceux des autres familles sont retirés de l'envoi).
      logement: restreindreAuChemin({ ...b, syndicId: syndic === null ? '' : String(syndic.id), famille, typeLogement: type, typeLocal, parkingSituation, parkingType, meuble, ascenseur, digicode,
        assurancePno, pnoDateAnniversaire: assurancePno === true ? b.pnoDateAnniversaire : '', ...(famille === 'parking' ? {} : versEnvoiEntretien(entretien)),
        ...(chargesCopro === null ? {} : { chargesCopro }) } as Record<string, unknown>, famille as FamilleBien | null),
      syndic: syndic === null ? null : { id: syndic.id, contactsIds: syndic.contactsIds, nouveauxContacts: syndic.nouveauxContacts },
      contacts: continuite !== undefined ? continuite.contacts : contacts,
      annexes: avecAnnexes ? annexes.map(({ categorie, etage, numLotCopro, porte, nomAnnexe, annotation, detachee, parkingSituation: s, parkingType: t, autreAdresse, adresse, codePostal, commune }) => ({
        categorie, etage, numLotCopro, porte, parkingSituation: s, parkingType: t, autreAdresse, annotation, detachee,
        ...(categorie === 'autre' ? { nomAnnexe } : {}),
        ...(autreAdresse ? { adresse, codePostal, commune } : {}),
      })) : [],
    });
    enCours.current = false;
    setEnvoi(false);
    // Arno (21/10/2026) — ANTI-DOUBLON : « Ce bien semble déjà exister » (rien n'est créé) ; « Créer quand même » repasse.
    if (r.etat === 'doublon') {
      const d = r.data as { lotId?: number } | undefined;
      setIssue({ sorte: 'doublon', motif: r.motif ?? 'Un bien pareil existe déjà pour ce propriétaire.', lotId: Number(d?.lotId) });
      return;
    }
    if (r.motif !== null) {
      const dit = continuite !== undefined
        ? `Les fiches des propriétaires sont créées, mais le bien n’est pas encore enregistré : ${r.motif} Corrigez puis enregistrez à nouveau (les fiches ne seront pas recréées).`
        : r.motif;
      setMotif(dit);
      setIssue({ sorte: 'erreur', cause: r.cause ?? 'saisie', motif: dit });
      return;
    }
    oublierContactsEnAttente();
    const id = (r.data as { logementId?: number } | undefined)?.logementId;
    const cible = id !== undefined ? `/admin/location/bien/${id}` : '/admin/location/proprietaires';
    setEnregistre(cible);
    // Arno (18/10/2026) : le mail « nouveau mandat » n'est jamais bloquant — mais s'il n'est pas parti, on le DIT (modale et page).
    const echec = [phraseMail(r.mail), (r.data as { mandatRefus?: string | null } | undefined)?.mandatRefus ?? null].filter((x) => x !== null).join(' ') || null;
    if (echec !== null) setMailEchec({ phrase: echec, cible });
    // Arno (21/10/2026, 404) : le dossier Drive du bien n'est jamais bloquant — s'il n'a pas pu être créé, on le DIT (la fiche
    // propose « Créer le dossier »).
    const drive = r.drive !== undefined && !r.drive.ok
      ? `Dossier Drive à créer : ${r.drive.motif ?? 'le Drive n’a pas répondu'}. Ouvrez la fiche du bien et cliquez « Créer le dossier ».` : null;
    // Arno (21/10/2026) : le succès s'ouvre en modale (résumé, « Voir la fiche du bien », « Créer un autre bien », « Fermer »).
    const notes = [echec, drive].filter((x): x is string => x !== null);
    /* 🔴 Arno (26/10/2026, 430) — RENTRÉ OCCUPÉ : dans la foulée, le formulaire complet « Nouveau locataire » pour le locataire en place. Une
       note à lire (mail, Drive) : la modale d'abord, avec « Saisir le locataire en place » en premier geste. */
    const suite = questionOccupe && entreOccupe === true && id !== undefined ? lienLocataireEnPlace(id) : undefined;
    if (suite !== undefined && notes.length === 0) { window.location.assign(suite); return; }
    setIssue({ sorte: 'succes', cible, notes, ...(suite !== undefined ? { suite } : {}) });
  };
  // « Rattacher et enregistrer » : dès que la sélection est posée (panneau refermé, cartes ajoutées), l'enregistrement repart.
  useEffect(() => {
    if (!enregistrerApresRattachement || enChoix !== null) return;
    setEnregistrerApresRattachement(false);
    void enregistrer();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- relancé UNE fois, quand le panneau s'est refermé sur les cartes posées
  }, [enregistrerApresRattachement, enChoix, proprietaires]);
  const nomsProprietaires = (continuite !== undefined ? continuite.proprietaires.map((p) => p.nom) : proprietaires.map((p) => p.nom)).filter((x) => x).join(', ');
  const adresseComplete = [b.adresse, [b.codePostal, b.commune].filter((x) => x).join(' ')].filter((x) => x.trim() !== '').join(', ');

  const resultats = recherche.etat.etat === 'ok' ? liste(recherche.etat.data).filter((r) => !proprietaires.some((p) => p.id === r.id)) : [];
  // La numérotation suit les sections AFFICHÉES (un parking nu n'a ni annexes ni caractéristiques complémentaires).
  // Arno (23/10/2026) : en modification, le bloc 1 « Propriétaire(s) » n'apparaît pas, et les suivants GARDENT leur numéro (2, 3, 4…).
  const sections = [...(continuite !== undefined ? [] : ['proprietaires']), 'bien', 'adresse', 'copro', ...(avecAnnexes ? ['annexes'] : []), 'complements', 'commentaires',
    ...(continuite !== undefined ? (enGestion !== false ? ['occupe'] : []) : ['gestion'])];
  const n = (cle: string): number => sections.indexOf(cle) + 1;

  return (
    // noValidate : les refus sont ceux de la règle (`bienComplet.ts`), dits sous chaque champ — jamais la bulle du navigateur
    // (la date du DPE porte `max` = aujourd'hui pour griser le futur dans le sélecteur).
    <form className="loc-page loc-ample" noValidate onSubmit={(e) => { e.preventDefault(); void enregistrer(); }}>
      <style>{CSS_LOCATION_ECRANS + CSS_LOCATION_CREATION + CSS_CARTES + CSS_RATTACHEMENT + CSS_CHAMP_ADRESSE + CSS_CHAMP_FLECHES + CSS_ENTRETIEN + CSS_ZONE_AUTO + CSS_ANNEXE_CARTE + CSS_DPE_PNO + CSS_FETE + CSS_RENTRE_OCCUPE}</style>
      {modification !== undefined ? (
        <>
          {/* Arno (23/10/2026) : la page « Ajouter un nouveau bien », à l'identique, sans le bloc « Propriétaire(s) » (le bien y est
              déjà rattaché) ; tout est pré-rempli. */}
          <EnTeteLocation titre="Modifier le bien" retourVers={modification.dansModale === true ? { ...modification.retour, surClic: annulerModification } : modification.retour}
            sous={<>Toutes les informations du bien, pré-remplies. « Enregistrer les modifications » montre d’abord ce qui change (ancienne valeur → nouvelle valeur), puis enregistre.</>} />
          {conflit && (
            <div className="mfb-conflit" role="alert" data-conflit-version>
              <span>{modification.detailConflit ?? 'Ce bien a été modifié par ailleurs — recharger ?'}</span>
              <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={modification.onRecharger} data-recharger>Recharger</button>
              <span className="mfb-note">Recharger reprend les valeurs enregistrées ; la saisie en cours est abandonnée.</span>
            </div>
          )}
        </>
      ) : continuite === undefined ? (
        <EnTeteLocation titre="Ajouter un nouveau bien"
          sous={<>Obligatoires : au moins un propriétaire, l’adresse, la famille du bien et son type ; pour un logement ou un local, le DPE et l’entretien à prévoir ; et si le bien est en gestion <span className="loc-oblig">*</span>. Tout le reste se complète plus tard.</>} />
      ) : (
        <section className="loc-section loc-rappel" aria-labelledby="loc-rappel-titre" data-rappel-proprietaires>
          <h3 id="loc-rappel-titre">Le bien de ce nouveau propriétaire</h3>
          <p className="loc-section-phrase">Rattachés d’office (lecture seule — à modifier dans les cartes ci-dessus) :</p>
          <ul className="loc-rappel-liste">
            {continuite.proprietaires.map((p, i) => <li key={`p${i}`}><BadgeCarte cote="proprietaire" sorte="client" /> <strong>{p.nom}</strong></li>)}
            {continuite.contacts.map((c, i) => (
              <li key={`c${i}`}><BadgeCarte cote="proprietaire" sorte="contact" /> <strong>{[(c.nom ?? '').toUpperCase(), c.prenom].filter((x) => x).join(' ')}</strong>{c.qualite ? ` · ${c.qualite}` : ''}</li>
            ))}
          </ul>
          <p className="loc-muet" style={{ margin: 0 }}>Obligatoires : l’adresse, la famille du bien et son type ; pour un logement ou un local, le DPE et l’entretien à prévoir <span className="loc-oblig">*</span>. Un seul « Enregistrer le bien » crée les fiches puis le bien.</p>
        </section>
      )}

      {continuite === undefined && modification === undefined && <section className="loc-section" aria-labelledby="loc-b1">
        <h3 id="loc-b1"><span className="loc-num">{n('proprietaires')}</span>Propriétaire(s) <span className="loc-oblig">*</span></h3>
        <label className="loc-recherche" aria-label="Chercher un propriétaire">
          <span aria-hidden="true">🔎</span>
          <input type="search" value={texte} onChange={(e) => setTexte(e.target.value)}
            placeholder="Chercher un propriétaire : nom, prénom, téléphone, e-mail, ou adresse d’un bien du portefeuille" />
        </label>
        {terme.length >= 2 && (recherche.etat.etat !== 'ok' ? <EtatLecture etat={recherche.etat} /> : resultats.length === 0
          ? <p className="loc-muet">Aucun propriétaire ne correspond à « {terme} ».</p> : (
            <ul className="loc-choix" data-resultats-proprietaires>
              {resultats.map((r) => (
                <li key={r.id}><button type="button" aria-pressed={false}
                  onClick={() => { setEnChoix(r.id); setTexte(''); setTerme(''); }}>
                  <span><strong>{r.titre}</strong></span><span className="loc-muet">{r.detail ?? ''}</span></button></li>
              ))}
            </ul>
          ))}
        {enChoix !== null && (
          <PanneauQuiRattacher key={enChoix} proprietaireId={enChoix} dejaProprietaires={proprietaires.map((p) => p.id)} dejaContacts={contactsExistants}
            onEnAttente={surEnAttente}
            onAnnuler={() => setEnChoix(null)}
            onValider={(ps, cs) => { setProprietaires((l) => ajouterProprietaires(l, ps)); setContactsExistants((l) => ajouterContacts(l, cs)); setEnChoix(null); }} />
        )}
        {proprietaires.length === 0 && enChoix === null
          ? <p className="loc-muet" style={{ margin: 0 }}>Aucun propriétaire rattaché. Cherchez-le ci-dessus, ou <a href="/admin/location/nouveau-proprietaire">créez un nouveau propriétaire</a>.</p> : null}
        <CartesDuBloc proprietaires={proprietaires} contacts={contactsExistants} saisis={contacts}
          onRetirerProprietaire={(id) => setProprietaires((l) => l.filter((x) => x.id !== id))}
          onRetirerContact={(id) => setContactsExistants((l) => l.filter((x) => x.id !== id))}
          onRetirerSaisi={(i) => setContacts((l) => l.filter((_, j) => j !== i))} />
        {manqueDe('proprietaires')}
      </section>}

      <section className="loc-section" aria-labelledby="loc-b3" data-bloc-bien>
        <h3 id="loc-b3"><span className="loc-num">{n('bien')}</span>Le bien <span className="loc-oblig">*</span></h3>
        {importesModif.length > 0 && (
          <p className="loc-aide loc-aide--long" data-importe>Affiché d’après l’import WIPPIMMO tant que ces champs sont vides : {importesModif.join(' · ')}.</p>
        )}
        {ficheAnnexe ? (
          <p className="loc-muet" style={{ margin: 0 }} data-categorie-annexe>Annexe : {LIBELLE_CATEGORIE[modification?.lecture.encart.valeurs.categorie ?? ''] ?? 'Annexe'} — elle garde sa catégorie.</p>
        ) : (
        <div className="loc-gros-boutons loc-gros-boutons--3d loc-familles" role="group" aria-label="Famille du bien">
          {FAMILLES.map((f) => (
            <button key={f} type="button" className="loc-gros-bouton loc-gros-bouton--centre" aria-pressed={famille === f} data-famille={f}
              onClick={() => changerFamille(f)}>{famille === f ? `✓ ${LIBELLE_FAMILLE[f]}` : LIBELLE_FAMILLE[f]}</button>
          ))}
        </div>
        )}
        {effaces !== null && <p className="loc-muet" role="status" style={{ margin: 0 }} data-chemin-efface={effaces}>{messageEffacement(effaces)}</p>}
        {manqueDe('famille')}
        {famille === 'logement' && (
          <>
            <div className="loc-sous-section">
              <h4>Type de logement <span className="loc-oblig">*</span></h4>
              <Pilules etiquette="Type de logement" options={TYPES_LOGEMENT} libelle={LIBELLE_TYPE_LOGEMENT} valeur={type} onChoix={setType} />
              {manqueDe('typeLogement')}
            </div>
            <div className="loc-sous-section">
              <h4>Meublé ?</h4>
              <div className="loc-pilules" role="group" aria-label="Meublé ou non">
                <button type="button" aria-pressed={meuble === true} onClick={() => setMeuble(meuble === true ? null : true)}>Meublé</button>
                <button type="button" aria-pressed={meuble === false} onClick={() => setMeuble(meuble === false ? null : false)}>Non meublé</button>
              </div>
            </div>
          </>
        )}
        {famille === 'local' && (
          <div className="loc-sous-section">
            <h4>Type de local <span className="loc-oblig">*</span></h4>
            <div className="loc-gros-boutons loc-oui-non" role="group" aria-label="Type de local">
              {TYPES_LOCAL.map((t) => (
                <button key={t} type="button" className="loc-gros-bouton loc-gros-bouton--centre" aria-pressed={typeLocal === t}
                  onClick={() => setTypeLocal(t)}>{typeLocal === t ? `✓ ${LIBELLE_TYPE_LOCAL[t]}` : LIBELLE_TYPE_LOCAL[t]}</button>
              ))}
            </div>
            {manqueDe('typeLocal')}
          </div>
        )}
        {famille === 'parking' && (
          <>
            <div className="loc-sous-section">
              <h4>Intérieur ou extérieur ?</h4>
              <Pilules etiquette="Intérieur ou extérieur" options={SITUATIONS_PARKING} libelle={LIBELLE_SITUATION_PARKING} valeur={parkingSituation} onChoix={setParkingSituation} />
            </div>
            <div className="loc-sous-section">
              <h4>Type de parking <span className="loc-oblig">*</span></h4>
              <Pilules etiquette="Type de parking" options={TYPES_PARKING} libelle={LIBELLE_TYPE_PARKING} valeur={parkingType} onChoix={setParkingType} />
              {manqueDe('parkingType')}
            </div>
            <div className="loc-sous-section">
              <h4>Surface</h4>
              <div className="loc-grille">{champ('surfaceM2', 'Surface (m², facultative)', { inputMode: 'decimal' })}</div>
            </div>
          </>
        )}
        {(famille === 'logement' || famille === 'local' || (ficheAnnexe && famille === null)) && (
          <div className="loc-sous-section">
            <h4>{famille === 'local' ? 'Bureaux / pièces et surfaces' : 'Pièces et surfaces'}</h4>
            <div className="loc-grille" data-ligne-surfaces>
              <ChampFleches sorte="pieces" libelle={famille === 'local' ? 'Nombre de bureaux / pièces' : 'Nombre de pièces'} placeholder="ex. 3"
                valeur={b.nombrePieces} onChange={(v) => setB((x) => ({ ...x, nombrePieces: v }))} />
              {champ('surfaceHabitableM2', famille === 'local' ? 'Surface (m²)' : 'Surface habitable (m²)', { inputMode: 'decimal' })}
              {champ('surfaceCarrezM2', 'Surface Carrez/Boutin m²', { inputMode: 'decimal' })}
              {champ('surfaceExterieureM2', 'Surface extérieure (m²)', { inputMode: 'decimal' }, 'balcon, terrasse, jardin')}
            </div>
          </div>
        )}
      </section>

      <section className="loc-section" aria-labelledby="loc-b2">
        <h3 id="loc-b2"><span className="loc-num">{n('adresse')}</span>Adresse et situation</h3>
        {lu !== undefined && !lu.adresseModifiable ? (
          /* L'adresse d'un bien importé est tenue par WIPPIMMO (l'import la réécrirait) : montrée, jamais modifiable ici. */
          <div className="loc-grille mfb-fige" data-adresse-figee>
            <label className="loc-champ loc-pleine"><span>Adresse</span><input value={b.adresse} disabled />
              <small className="loc-aide loc-aide--long">Tenue par l’import WIPPIMMO : elle ne se modifie pas ici.</small></label>
            {champ('codePostal', 'Code postal', { disabled: true })}
            {champ('commune', 'Commune', { disabled: true })}
          </div>
        ) : (
        <div className="loc-grille">
          <label className="loc-champ loc-pleine">
            <span>Adresse <span className="loc-oblig">*</span></span>
            <ChampAdresseBan exemple="ex. 12 rue de l’Église" valeur={b.adresse} verifiee={adresseVerifiee}
              onChange={(v) => { setB((x) => ({ ...x, adresse: v })); setAdresseVerifiee(false); }}
              onChoisir={(a) => { setB((x) => ({ ...x, adresse: a.voie, codePostal: a.codePostal, commune: a.commune })); setAdresseVerifiee(true); }} />
          </label>
          {champ('codePostal', 'Code postal', { inputMode: 'numeric', maxLength: 5 })}
          {champ('commune', 'Commune')}
        </div>
        )}
        {lu !== undefined && lu.adresseModifiable && (b.adresse !== lu.valeurs.adresse || b.codePostal !== lu.valeurs.codePostal || b.commune !== lu.valeurs.commune) && (
          <p className="mfb-note" data-note-drive-adresse>Le dossier Drive du bien garde son nom et sa place : un changement d’adresse ne le renomme ni ne le déplace.</p>
        )}
        {manqueDe('adresse')}
        <div className="loc-sous-section">
          <h4>Situation dans l’immeuble</h4>
          <div className="loc-grille" data-ligne-situation>
            {champ('batiment', 'Bâtiment', { placeholder: 'ex. B' })}
            {champ('escalier', 'Escalier', { placeholder: 'ex. 2' })}
            <ChampFleches sorte="etage" libelle="Étage" placeholder="ex. 3, RDC, -1" valeur={b.etage} onChange={(v) => setB((x) => ({ ...x, etage: v }))} />
            {champ('porte', famille === 'parking' ? 'N° de place' : 'N° de porte')}
            <label className="loc-champ loc-pleine" data-precision>Précision
              <input value={b.precisionAcces} onChange={(e) => { const val = e.target.value; setB((x) => ({ ...x, precisionAcces: val })); }}
                placeholder="ex. À droite en sortant de l’ascenseur, deuxième porte à gauche" maxLength={500} /></label>
          </div>
        </div>
        <div className="loc-sous-section">
          <h4>Accès</h4>
          <div className="loc-acces">
            <div className="loc-acces-bloc"><span className="loc-acces-mot">Ascenseur</span>
              <Pilules etiquette="Ascenseur" options={OUI_NON} libelle={LIBELLE_OUI_NON} valeur={versOuiNon(ascenseur)}
                onChoix={(v) => setAscenseur(v === null ? null : v === 'oui')} /></div>
            <div className="loc-acces-bloc" data-digicode><span className="loc-acces-mot">Digicode</span>
              <Pilules etiquette="Digicode" options={OUI_NON} libelle={LIBELLE_OUI_NON} valeur={versOuiNon(digicode)}
                onChoix={(v) => { digicodeTouche.current = true; setDigicode(v === null ? null : v === 'oui'); if (v !== 'oui') setB((x) => ({ ...x, digicodeCode: '' })); }} />
              {/* Arno (17/10/2026) : le « Code » À DROITE des boutons, 8 caractères au plus ; actif seulement si Oui, vidé sur Non. */}
              <label className="loc-code-digicode">Code
                <input value={b.digicodeCode} maxLength={8} placeholder="ex. 57B83" disabled={digicode !== true} aria-label="Code du digicode"
                  onChange={(e) => { digicodeTouche.current = true; const val = e.target.value.slice(0, 8); setB((x) => ({ ...x, digicodeCode: val })); }} /></label>
              {digicodeImmeuble?.mention ? <small className="loc-aide loc-aide--long" data-digicode-immeuble>{digicodeImmeuble.mention}{lu !== undefined ? ' — le modifier vaut pour tout l’immeuble (son bâtiment)' : digicodeImmeuble.source === 'immeuble' ? (digicodeImmeuble.portee === 'batiment' ? ' — code du bâtiment, pré-rempli' : ' — pré-rempli') : ''}.</small>
                : lu?.digicodeImmeuble?.mention ? <small className="loc-aide loc-aide--long" data-digicode-immeuble>{lu.digicodeImmeuble.mention} — le modifier vaut pour tout l’immeuble (son bâtiment).</small> : null}
            </div>
          </div>
        </div>
      </section>

      <section className="loc-section" aria-labelledby="loc-b4">
        <h3 id="loc-b4"><span className="loc-num">{n('copro')}</span>Copropriété &amp; ID fiscal</h3>
        {/* Arno (21/10/2026) : le N° de lot et l'« ID FISCAL DU BIEN » (migration 401) côte à côte, même largeur, libellés alignés en
            haut ; le syndic dessous ; au téléphone, l'un sous l'autre. L'ID fiscal : le BIEN principal des trois familles (jamais
            une annexe), visible dès l'ouverture ; FACULTATIF ; espaces retirés à l'enregistrement ; avertissement discret, non
            bloquant, s'il ne compte pas 12 chiffres. */}
        <div className="loc-grille loc-grille--debut loc-grille--copro" data-ligne-copro>
          {champ('numLotCopro', 'N° de lot (règlement de copropriété)')}
          {montre('avecIdFiscal') && <label className="loc-champ" data-id-fiscal>ID fiscal du bien
            <input value={b.idFiscal} inputMode="numeric" maxLength={60} placeholder="ex. 921234567890" aria-describedby="loc-id-fiscal-aide"
              onChange={(e) => { const val = e.target.value; setB((x) => ({ ...x, idFiscal: val })); }} />
            <small className="loc-aide loc-aide--long" id="loc-id-fiscal-aide">Sur l’avis de taxe foncière</small>
            {idFiscalInhabituel(b.idFiscal) && <small className="loc-aide loc-aide--long loc-aide--avert" role="status" data-id-fiscal-avert>{AVERTISSEMENT_ID_FISCAL}</small>}
          </label>}
          <BlocSyndic adresse={{ libelle: b.adresse, codePostal: b.codePostal, commune: b.commune }} choisi={syndic} onChoisi={setSyndic} />
        </div>
      </section>

      {avecAnnexes && (
        <section className="loc-section" aria-labelledby="loc-b5">
          <h3 id="loc-b5"><span className="loc-num">{n('annexes')}</span>Annexes</h3>
          <p className="loc-section-phrase">Rattachées au {nom} pour toujours ; à son adresse par défaut, ou à une autre adresse.</p>
          <ul className="loc-annexes" data-annexes>
            <li className="loc-racine">{famille === null ? 'Le bien' : `${nom.charAt(0).toUpperCase()}${nom.slice(1)}`}{b.adresse.trim() !== '' ? ` · ${b.adresse}` : ''}</li>
            {annexes.map((a, i) => (
              a.sortir === true ? (
                <li key={a.cle} className="loc-enfant loc-enfant--fermee mfb-sortie" data-annexe={a.categorie} data-annexe-sortie={a.id ?? undefined}>
                  <div className="loc-annexe-tete">
                    <span className="loc-annexe-titre">{resumeAnnexe({ ...a })}</span>
                    <span className="loc-etiquette-detachee">Sortie du portefeuille à la validation</span>
                    <span className="loc-annexe-actions">
                      <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => changerAnnexe(i, (x) => ({ ...x, sortir: false }))} data-annuler-sortie>Annuler la sortie</button>
                    </span>
                  </div>
                </li>
              ) : (
              <li key={a.cle} className={`loc-enfant${a.fermee ? ' loc-enfant--fermee' : ''}`} data-annexe={a.categorie} data-fermee={a.fermee ? 'oui' : undefined} data-annexe-id={a.id ?? undefined}>
                {/* Arno (18/10/2026) : « Retirer » devient Supprimer (après confirmation) · Détacher / Rattacher · Fermer / Ouvrir. */}
                <div className="loc-annexe-tete">
                  {a.fermee
                    ? <button type="button" className="loc-annexe-resume" onClick={() => changerAnnexe(i, (x) => ({ ...x, fermee: false }))} aria-expanded={false} data-resume-annexe>
                      {resumeAnnexe({ ...a, numLotCopro: a.numLotCopro, porte: a.porte })}</button>
                    : <span className="loc-annexe-titre">{a.categorie === 'autre' && a.nomAnnexe.trim() !== '' ? a.nomAnnexe.trim() : LIBELLE_ANNEXE[a.categorie] ?? 'Annexe'}</span>}
                  {a.detachee && <span className="loc-etiquette-detachee">Détachée</span>}
                  <span className="loc-annexe-actions">
                    {/* 🔴 LOT LS4 (Arno) — une annexe EXISTANTE : le lien vers SA fiche (le bouton « Fiche du bien » du Suivi du mois compte les annexes
                        sans lien propre ; c'est ici qu'on les ouvre). Nouvel onglet : la saisie en cours de cette fiche n'est jamais perdue. */}
                    {a.id != null && <a className="svv-btn svv-btn-outline gst-btn" href={`/admin/location/bien/${a.id}`} target="_blank" rel="noopener noreferrer"
                      data-lien-fiche-annexe={a.id}>Fiche de l’annexe ↗</a>}
                    <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => changerAnnexe(i, (x) => ({ ...x, aConfirmer: true }))}>Supprimer</button>
                    <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => changerAnnexe(i, (x) => ({ ...x, detachee: !x.detachee }))}>{a.detachee ? 'Rattacher' : 'Détacher'}</button>
                    <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => changerAnnexe(i, (x) => ({ ...x, fermee: !x.fermee }))} aria-expanded={!a.fermee}>{a.fermee ? 'Ouvrir' : 'Fermer'}</button>
                  </span>
                </div>
                {a.aConfirmer && (
                  <div className="loc-confirmer" role="alert" data-confirmer-suppression>
                    {/* Une annexe EXISTANTE ne s'efface jamais : « Supprimer » la sort du portefeuille, à la validation (la règle de la fiche). */}
                    <span>{a.id != null ? 'Sortir cette annexe du portefeuille à la validation ? Rien n’est effacé : son historique et son lien avec le bien restent.' : 'Supprimer cette annexe du formulaire ?'}</span>
                    <button type="button" className="svv-btn svv-btn-primary gst-btn"
                      onClick={() => (a.id != null ? changerAnnexe(i, (x) => ({ ...x, sortir: true, aConfirmer: false })) : setAnnexes((l) => l.filter((_, j) => j !== i)))}>Oui, supprimer</button>
                    <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => changerAnnexe(i, (x) => ({ ...x, aConfirmer: false }))}>Non</button>
                  </div>
                )}
                {a.detachee && !a.fermee && <p className="loc-muet" style={{ margin: 0 }}>Louable séparément : elle sort de l’ensemble loué avec le {nom}, mais reste rattachée à lui pour toujours.</p>}
                {!a.fermee && <>
                {a.categorie === 'autre' && (
                  <div className="loc-grille">
                    <label className="loc-champ loc-pleine" data-nom-annexe>
                      <span>Nom de l’annexe <span className="loc-oblig">*</span></span>
                      <input value={a.nomAnnexe} maxLength={80} placeholder="ex. Cellier, Grenier, Local vélo"
                        onChange={(e) => { const val = e.target.value; changerAnnexe(i, (x) => ({ ...x, nomAnnexe: val })); }} /></label>
                  </div>
                )}
                {manqueDe(`annexe-nom-${i}`)}
                {a.id != null ? (
                  /* Une annexe existante garde son choix « même / autre adresse » ; l'autre adresse se modifie si l'annexe a été créée ici. */
                  <p className="loc-muet" style={{ margin: 0 }} data-adresse-annexe-fixe>{a.autreAdresse ? 'À une autre adresse que le bien' : 'À l’adresse du bien'}
                    {a.autreAdresse && a.adresseModifiable !== true ? ' — tenue par l’import WIPPIMMO : elle ne se modifie pas ici.' : '.'}</p>
                ) : (
                <div className="loc-pilules loc-annexe-adresse" role="group" aria-label="Adresse de l’annexe">
                  <button type="button" aria-pressed={!a.autreAdresse} onClick={() => changerAnnexe(i, (x) => ({ ...x, autreAdresse: false }))}>Même adresse</button>
                  <button type="button" aria-pressed={a.autreAdresse} onClick={() => changerAnnexe(i, (x) => ({ ...x, autreAdresse: true }))}>Autre adresse</button>
                </div>
                )}
                {a.autreAdresse && (a.id == null || a.adresseModifiable === true) && (
                  <div className="loc-grille" data-autre-adresse>
                    <label className="loc-champ loc-pleine">
                      <span>Adresse de l’annexe <span className="loc-oblig">*</span></span>
                      <ChampAdresseBan exemple="ex. 12 rue de l’Église" valeur={a.adresse} verifiee={a.adresseVerifiee}
                        onChange={(v) => changerAnnexe(i, (x) => ({ ...x, adresse: v, adresseVerifiee: false }))}
                        onChoisir={(ad) => changerAnnexe(i, (x) => ({ ...x, adresse: ad.voie, codePostal: ad.codePostal, commune: ad.commune, adresseVerifiee: true }))} />
                    </label>
                    <label className="loc-champ">Code postal<input value={a.codePostal} inputMode="numeric" maxLength={5}
                      onChange={(e) => { const val = e.target.value; changerAnnexe(i, (x) => ({ ...x, codePostal: val })); }} /></label>
                    <label className="loc-champ">Commune<input value={a.commune}
                      onChange={(e) => { const val = e.target.value; changerAnnexe(i, (x) => ({ ...x, commune: val })); }} /></label>
                  </div>
                )}
                {manqueDe(`annexe-${i}`)}
                {estParking(a.categorie) && (
                  <div className="loc-annexe-parking">
                    <Pilules etiquette="Intérieur ou extérieur" options={SITUATIONS_PARKING} libelle={LIBELLE_SITUATION_PARKING} valeur={a.parkingSituation}
                      onChoix={(v) => changerAnnexe(i, (x) => ({ ...x, parkingSituation: v }))} />
                    <Pilules etiquette="Type de parking" options={TYPES_PARKING} libelle={LIBELLE_TYPE_PARKING} valeur={a.parkingType}
                      onChoix={(v) => changerAnnexe(i, (x) => ({ ...x, parkingType: v }))} />
                  </div>
                )}
                <div className="loc-grille">
                  <ChampFleches sorte="etage" libelle="Étage" placeholder="ex. -1" valeur={a.etage} onChange={(v) => changerAnnexe(i, (x) => ({ ...x, etage: v }))} />
                  {(['numLotCopro', 'porte'] as const).map((k) => (
                    <label key={k} className="loc-champ">
                      {k === 'numLotCopro' ? 'N° de lot' : estParking(a.categorie) ? 'N° de place' : 'N° de porte'}
                      <input value={a[k]} onChange={(e) => { const val = e.target.value; changerAnnexe(i, (x) => ({ ...x, [k]: val })); }} />
                    </label>
                  ))}
                </div>
                <div className="loc-grille">
                  <ZoneAuto etiquette="Annotation" valeur={a.annotation} placeholder="ex. Accès par la cour, clé chez le gardien"
                    onChange={(v) => changerAnnexe(i, (x) => ({ ...x, annotation: v }))} />
                </div>
                </>}
              </li>
              )
            ))}
          </ul>
          <div className="loc-pilules">
            <button type="button" onClick={() => ajouterAnnexe('cave')}>+ Cave</button>
            <button type="button" onClick={() => ajouterAnnexe('parking')}>+ Parking</button>
            <button type="button" onClick={() => ajouterAnnexe('autre')}>+ Autre</button>
          </div>
        </section>
      )}

      {/* Arno (21/10/2026) : le bloc 6 existe aussi pour un parking nu — il n'y porte que « Paiement des charges ». */}
      <section className="loc-section" aria-labelledby="loc-b6">
          <h3 id="loc-b6"><span className="loc-num">{n('complements')}</span>Caractéristiques complémentaires</h3>
          {avecComplements && <>
          {/* Arno (18/10/2026) : libellés et champs sur la MÊME ligne (alignés en haut) ; la légende de l'AG reste dessous. */}
          <div className="loc-grille loc-grille--debut" data-ligne-epoque>
            {choix('epoqueConstruction', 'Époque de construction', EPOQUES_CONSTRUCTION)}
            {choix('chauffage', 'Chauffage', CHAUFFAGES)}
            {montre('avecAg') && <label className="loc-champ" data-derniere-ag>{LIBELLE_AG}
              <input type="date" value={b.derniereAg} onChange={(e) => { agTouchee.current = true; const val = e.target.value; setB((x) => ({ ...x, derniereAg: val })); }} />
              <small className="loc-aide loc-aide--long">{agConnue !== null && b.derniereAg === agConnue
                ? 'Déjà connue pour cet immeuble : la modifier met à jour tous ses lots.' : 'Assemblée générale de copropriété — partagée par tous les lots de l’immeuble.'}</small></label>}
          </div>
          {/* Arno (18/10/2026) : DPE (gauche) et assurance PNO (droite), deux blocs de même hauteur aux rangées partagées —
              choix sur une ligne, dates sur la suivante ; la date reste à sa place, grisée, quand elle est sans objet. */}
          <div className="loc-dpe-pno" data-ligne-dpe-pno>
            <BlocDpe classe={b.dpeClasse} date={b.dpeDate} aujourdhui={aujourdhui}
              onClasse={(c) => setB((x) => ({ ...x, dpeClasse: c }))} onDate={(d) => setB((x) => ({ ...x, dpeDate: d }))}
              manque={(k) => manqueDe(k)} />
            {montre('avecPno') && <div className="loc-dpe-pno-bloc" data-pno>
              <h4>Assurance PNO</h4>
              <div className="loc-dpe-pno-choix">
                <Pilules etiquette="Assurance PNO" options={OUI_NON} libelle={LIBELLE_OUI_NON} valeur={versOuiNon(assurancePno)}
                  onChoix={(v) => { setAssurancePno(v === null ? null : v === 'oui'); if (v !== 'oui') setB((x) => ({ ...x, pnoDateAnniversaire: '' })); }} />
              </div>
              <div className="loc-dpe-pno-date">
                <label className="loc-champ" data-pno-date><span>Date anniversaire</span>
                  <input type="date" value={b.pnoDateAnniversaire} disabled={assurancePno !== true}
                    onChange={(e) => { const val = e.target.value; setB((x) => ({ ...x, pnoDateAnniversaire: val })); }} /></label>
              </div>
              <div className="loc-dpe-pno-notes" />
            </div>}
          </div>
          </>}
          {/* 🔴 Arno (25/10/2026) — « ENTRETIEN À PRÉVOIR » dans un petit encadré gris identique à « Paiement des charges », et les deux
              CÔTE À CÔTE sur une même rangée, de même hauteur (comme DPE / Assurance PNO au-dessus) ; au téléphone, l'un sous l'autre.
              « PAIEMENT DES CHARGES » (Arno, 21/10/2026) : FACULTATIF (ne bloque pas « Enregistrer le bien », absent de « Reste à
              renseigner ») ; pour les trois familles ; boutons Agence puis Propriétaire, comme « Nouveau locataire ». */}
          {(avecEntretienEncadre || montre('avecCharges')) && (
            <div className={`loc-charges${avecEntretienEncadre && montre('avecCharges') ? ' loc-charges--paire' : ''}`} data-ligne-entretien-charges>
              {avecEntretienEncadre && <div className="loc-charges-bloc loc-entretien-encadre" data-entretien-encadre>
                <BlocEntretien valeur={entretien} onChange={setEntretien} obligatoire={modification === undefined}
                  manques={{ reponse: manqueDe('entretien'), liste: manqueDe('entretienListe'), autre: (k) => manqueDe(`entretien-autre-${k}`) }} />
              </div>}
              {montre('avecCharges') && <div className="loc-charges-bloc" data-charges-copro>
                <h4>Paiement des charges</h4>
                <Pilules etiquette="Paiement des charges" options={ORDRE_BOUTONS_CHARGES} libelle={LIBELLE_CHARGES_COPRO} valeur={chargesCopro} onChoix={setChargesCopro} />
                <small className="loc-charges-mention">Qui règle les charges de copropriété au syndic</small>
              </div>}
            </div>
          )}
        </section>

      <section className="loc-section" aria-labelledby="loc-b7">
        <h3 id="loc-b7"><span className="loc-num">{n('commentaires')}</span>Commentaires</h3>
        <label className="loc-champ">Commentaire libre
          <textarea value={b.commentaire} onChange={(e) => { const val = e.target.value; setB((x) => ({ ...x, commentaire: val })); }} maxLength={4000} /></label>
      </section>

      {modification !== undefined ? (
        <>
          <BlocStatutModification numero={n('gestion')} lu={modification.lecture.statut} mandat={modification.lecture.mandat} valeur={transition} onChange={setTransition} />
          {modification.blocApres?.(n('gestion') + 1)}
        </>
      ) : continuite === undefined && (
        <QuestionEnGestion id="loc-b8" numero={n('gestion')} titre="Statut du bien" sorte="bien" obligatoire valeur={enGestionSaisi}
          libelles={{ oui: 'En gestion', non: 'Location seule' }}
          onChoix={setEnGestion}>{manqueDe('enGestion')}
          <LignesMandat enGestion={enGestionSaisi} mandats={mandats} notes={notesMandat}
            onChange={(sorte, m) => { mandatTouche.current[sorte] = true; setMandats((x) => ({ ...x, [sorte]: m })); }} />
          {questionOccupe && <QuestionRentreOccupe valeur={entreOccupe} onChoix={choisirOccupe} dateMandat={dateMandatVue} onDateMandat={poserDateMandat}
            disponible={occupeDisponible} aujourdhui={aujourdhui} memeQueMandat manque={<>{manqueDe('entreOccupe')}{manqueDe('dateMandat')}</>} />}</QuestionEnGestion>
      )}
      {/* 🔴 Arno (26/10/2026, 430) — depuis « Nouveau propriétaire » (le statut vient de l'écran du dessus) : la question a sa propre section. */}
      {continuite !== undefined && questionOccupe && (
        <section className="loc-section" aria-labelledby="loc-b9">
          <h3 id="loc-b9"><span className="loc-num">{n('occupe')}</span>Prise en gestion</h3>
          <QuestionRentreOccupe valeur={entreOccupe} onChoix={choisirOccupe} dateMandat={dateMandatVue} onDateMandat={poserDateMandat}
            disponible={occupeDisponible} aujourdhui={aujourdhui} manque={<>{manqueDe('entreOccupe')}{manqueDe('dateMandat')}</>} />
        </section>
      )}

      {modification === undefined && mailEchec !== null && (
        <div className="loc-alerte loc-alerte--orange" role="alert" data-mail-echec>
          <p style={{ margin: '0 0 8px' }}>{mailEchec.phrase}</p>
          <a className="svv-btn svv-btn-primary gst-btn" href={mailEchec.cible}>Ouvrir la fiche du bien</a>
        </div>
      )}
      {modification !== undefined ? (
      <div className="loc-collant" data-collant>
        {/* La barre de « Nouveau bien » : « Reste à renseigner » (information — une fiche existante n'est jamais bloquée par les
            obligatoires de la création, règle de `bienComplet.ts`), « Annuler », le bouton rouge. */}
        {!conflit && enregistre === null && manquesLigne.length > 0 ? <LigneManques manques={manquesLigne} attributs={{ 'data-etat-modification': '' }} /> : (
        <p className={`loc-manques${conflit ? ' loc-manques--refus' : ''}`} role="status" data-etat-modification>
          {conflit ? 'Ce bien a été modifié par ailleurs — recharger ?' : enregistre !== null ? '✓ Modifications enregistrées.' : 'Tout l’obligatoire est renseigné.'}
        </p>
        )}
        <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={annulerModification} data-annuler-modification>Annuler</button>
        <button type="submit" className="svv-btn svv-btn-primary gst-btn" aria-busy={envoi} data-valider-modification
          disabled={envoi || enregistre !== null || (modification.desactiverSansChangement === true && changementsModif.length === 0)}>
          {envoi ? 'Enregistrement…' : 'Enregistrer les modifications'}</button>
      </div>
      ) : (
      <div className="loc-collant" data-collant>
        {/* Arno (26/10/2026) — « Reste à renseigner » sur UNE ligne, la liste dans une bulle ; un refus garde sa ligne rouge entière. */}
        {motif === null && manquesLigne.length > 0 ? <LigneManques manques={manquesLigne} /> : (
        <p className={`loc-manques${motif !== null ? ' loc-manques--refus' : ''}`} role="status">
          {motif ?? 'Tout l’obligatoire est renseigné.'}
        </p>
        )}
        <a className="svv-btn svv-btn-outline gst-btn" href="/admin/location/proprietaires">Annuler</a>
        <button type="submit" className="svv-btn svv-btn-primary gst-btn" disabled={envoi || enregistre !== null} aria-busy={envoi}>
          {envoi ? 'Enregistrement…' : enregistre !== null ? '✓ Bien enregistré' : 'Enregistrer le bien'}</button>
      </div>
      )}
      {modification !== undefined && issue !== null && (issue.sorte === 'contre' ? (
        <ModaleIssue sorte="attention" titre="Valider les modifications ?" onFermer={() => setIssue(null)} notes={issue.notes}
          actions={[{ libelle: 'Revenir à la saisie', onClick: () => setIssue(null), repere: 'revenir-saisie' },
            { libelle: envoi ? 'Enregistrement…' : 'Confirmer', onClick: () => { void confirmerModification(issue.confirmeOccupation); }, principal: true, repere: 'confirmer-modification' }]}>
          <ul className="eden-liste" data-contre-validation>{issue.changements.map((c) => <li key={c.cle} data-changement={c.cle}>{`${c.champ} : ${c.avant} → ${c.apres}`}</li>)}</ul>
        </ModaleIssue>
      ) : issue.sorte === 'succes-modif' ? (
        <ModaleIssue sorte="succes" titre="Modifications enregistrées" onFermer={modification.onEnregistre} notes={issue.notes}
          lignes={issue.changements.map((c) => [c.champ, `${c.avant} → ${c.apres}`] as [string, string])}
          actions={[{ libelle: 'Fermer', onClick: modification.onEnregistre, principal: true, repere: 'fermer-succes-modification' }]} />
      ) : issue.sorte === 'conflit' ? (
        <ModaleIssue sorte="attention" titre="Ce bien a été modifié par ailleurs — recharger ?" onFermer={() => setIssue(null)}
          notes={[modification.detailConflit ?? 'Rien n’a été enregistré : la fiche a changé depuis l’ouverture du formulaire.', '« Recharger » reprend les valeurs enregistrées (votre saisie est abandonnée).']}
          actions={[{ libelle: 'Revenir à la saisie', onClick: () => setIssue(null), repere: 'revenir-saisie' },
            { libelle: 'Recharger', onClick: () => { setIssue(null); modification.onRecharger(); }, principal: true, repere: 'recharger-conflit' }]} />
      ) : issue.sorte === 'abandon' ? (
        <ModaleIssue sorte="attention" titre="Abandonner les modifications ?" onFermer={() => setIssue(null)}
          notes={[`${changementsModif.length} modification${changementsModif.length > 1 ? 's' : ''} non enregistrée${changementsModif.length > 1 ? 's' : ''} : fermer les perdra.`]}
          actions={[{ libelle: 'Revenir à la saisie', onClick: () => setIssue(null), principal: true, repere: 'revenir-saisie' },
            { libelle: 'Abandonner', onClick: () => { setIssue(null); modification.onFermer(); }, repere: 'abandonner-modification' }]} />
      ) : issue.sorte === 'aucune' ? (
        <ModaleIssue sorte="attention" titre="Aucune modification" onFermer={() => setIssue(null)}
          notes={['Rien n’a changé par rapport à la fiche du bien : il n’y a rien à enregistrer.']}
          actions={[{ libelle: 'Fermer', onClick: () => setIssue(null), principal: true, repere: 'fermer-aucune' }]} />
      ) : issue.sorte === 'erreur' ? (
        <ModaleIssue sorte="erreur" titre="Modifications non enregistrées" onFermer={() => setIssue(null)}
          echec={explicationEchecDe('Les modifications n’ont pas été enregistrées.', '« Valider les modifications »', issue.cause, issue.motif)}
          actions={[{ libelle: 'Fermer', onClick: () => setIssue(null), principal: true, repere: 'fermer-erreur-modification' }]} />
      ) : null)}
      {modification === undefined && issue !== null && (issue.sorte === 'succes' ? (
        <ModaleIssue sorte="succes" titre="Bien enregistré" onFermer={() => setIssue(null)} notes={issue.notes}
          lignes={[[nomsProprietaires.includes(',') ? 'Propriétaires' : 'Propriétaire', nomsProprietaires || '—'], ['Adresse', adresseComplete || '—'],
            ...(famille !== null ? [['Bien', LIBELLE_FAMILLE[famille]] as [string, string]] : [])]}
          actions={[
            ...(issue.suite !== undefined ? [{ libelle: 'Saisir le locataire en place', href: issue.suite, principal: true, repere: 'saisir-locataire-en-place' }] : []),
            { libelle: 'Voir la fiche du bien', href: issue.cible, principal: issue.suite === undefined, repere: 'voir-fiche-bien' },
            { libelle: 'Créer un autre bien', href: '/admin/location/nouveau-bien', repere: 'creer-autre' },
            { libelle: 'Fermer', onClick: () => setIssue(null), repere: 'fermer-issue' },
          ]} />
      ) : issue.sorte === 'selection' ? (
        <ModaleIssue sorte="erreur" titre="Sélection non rattachée" onFermer={() => setIssue(null)}
          echec={{ quoi: 'Le bien n’a pas été enregistré.', pourquoi: 'Vous avez sélectionné un propriétaire sans cliquer sur « Rattacher la sélection ».',
            faire: '« Rattacher et enregistrer » rattache la sélection au bien, puis l’enregistre. Ou fermez pour vérifier la sélection.',
            conserve: 'Rien n’a été enregistré. Votre saisie est conservée.' }}
          actions={[
            // « Fermer » d'abord : le focus ne tombe jamais sur un geste qui écrit (une touche Entrée n'enregistre rien).
            { libelle: 'Fermer', onClick: () => setIssue(null), repere: 'fermer-issue' },
            { libelle: 'Rattacher et enregistrer', principal: true, repere: 'rattacher-et-enregistrer', onClick: () => {
              setIssue(null);
              const f = selectionEnAttente.current;
              if (f !== null && f()) setEnregistrerApresRattachement(true);
            } },
          ]} />
      ) : issue.sorte === 'doublon' ? (
        <ModaleIssue sorte="attention" titre="Ce bien semble déjà exister" onFermer={() => setIssue(null)}
          notes={[issue.motif, 'Rien n’a été créé. Vérifiez le bien existant, ou créez-le quand même s’il s’agit bien d’un autre bien.']}
          actions={[
            { libelle: 'Voir le bien existant', href: `/admin/location/bien/${issue.lotId}`, principal: true, repere: 'voir-bien-existant' },
            { libelle: 'Créer quand même', repere: 'creer-quand-meme', onClick: () => { setIssue(null); void enregistrer({ confirmeDoublon: true }); } },
            { libelle: 'Fermer', onClick: () => setIssue(null), repere: 'fermer-issue' },
          ]} />
      ) : issue.sorte === 'erreur' ? (
        <ModaleIssue sorte="erreur" titre={issue.cause === 'champs' ? 'Il manque des informations' : 'Enregistrement impossible'}
          echec={explicationEchec('nouveau-bien', issue.cause, issue.motif)}
          onFermer={() => setIssue(null)}
          actions={[{ libelle: issue.cause === 'champs' ? 'Compléter' : 'Fermer', onClick: () => setIssue(null), principal: true, repere: 'fermer-issue' }]} />
      ) : null)}
      {/* Après la modale fermée : le succès reste dit sur la page (le bien n'est jamais recréé par erreur). */}
      {modification === undefined && enregistre !== null && issue === null && mailEchec === null && (
        <div className="loc-alerte loc-alerte--verte" role="status" data-bien-enregistre>
          <p style={{ margin: '0 0 8px' }}><strong>✓ Bien enregistré.</strong></p>
          <a className="svv-btn svv-btn-primary gst-btn" href={enregistre}>Ouvrir la fiche du bien</a>
        </div>
      )}
    </form>
  );
}
