'use client';

import { useEffect, useRef, useState } from 'react';
import { API, CSS_ANNEXE_CARTE, CSS_LOCATION_CREATION, CSS_LOCATION_ECRANS, EnTeteLocation, EtatLecture, envoyer, liste, phraseMail, useLecture } from './commun';
import { ChampAdresseBan, CSS_CHAMP_ADRESSE } from '../gestion/ChampAdresseBan';
import {
  CHAUFFAGES, DPE_NON_SOUMIS, EPOQUES_CONSTRUCTION, FAMILLES, LIBELLE_FAMILLE, LIBELLE_SITUATION_PARKING, LIBELLE_TYPE_LOCAL,
  LIBELLE_TYPE_LOGEMENT, LIBELLE_TYPE_PARKING, manquesDuBien, NOM_FAMILLE, SITUATIONS_PARKING, TYPES_LOCAL, TYPES_LOGEMENT, TYPES_PARKING,
  type Famille, type SituationParking, type TypeLocal, type TypeLogement, type TypeParking,
} from '../../../../lib/location/bienComplet';
import { verifierChampsBien, type Categorie } from '../../../../lib/location/locationBien';
import type { ResultatPortefeuille } from '../../../../lib/location/recherchePortefeuille';
import { CSS_CARTES, type ChampsSaisis } from '../gestion/CartesPersonnes';
import { lireContactsEnAttente, oublierContactsEnAttente } from './contactsEnAttente';
import { CartesDuBloc, CSS_RATTACHEMENT, PanneauQuiRattacher } from './RattachementProprietaires';
import { LIBELLE_AG } from '../../../../lib/location/immeubleAg';
import { ChampFleches, CSS_CHAMP_FLECHES } from './ChampFleches';
import { BlocEntretien, CSS_ENTRETIEN, ENTRETIEN_VIDE, versEnvoiEntretien, type SaisieEntretien } from './EntretienBien';
import { CSS_ZONE_AUTO, ZoneAuto } from './ZoneAuto';
import { aujourdhuiParis } from '../../../../lib/location/reglagesDpe';
import { BlocDpe, CSS_DPE_PNO } from './BlocDpe';
import { resumeAnnexe } from '../../../../lib/location/annexeLocation';
import { BadgeCarte } from './SaisieCartes';
import { ajouterContacts, ajouterProprietaires, type ContactProprietaire, type PersonneProprietaire } from '../../../../lib/location/rattachementProprietaires';
import { BlocSyndic, type SyndicChoisi } from './BlocSyndicBien';
import { CSS_FETE } from './FeteOui';
import { QuestionEnGestion } from './QuestionEnGestion';
import { LIBELLE_OUI_NON, OUI_NON, Pilules, versOuiNon } from './Pilules';

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
}

const VIDE = {
  adresse: '', codePostal: '', commune: '', batiment: '', escalier: '', etage: '', porte: '', precisionAcces: '', digicodeCode: '',
  nombrePieces: '', surfaceHabitableM2: '', surfaceCarrezM2: '', surfaceExterieureM2: '', surfaceM2: '',
  numLotCopro: '', syndicId: '', epoqueConstruction: '', chauffage: '', dpeClasse: '', dpeDate: '', commentaire: '', derniereAg: '',
  pnoDateAnniversaire: '',
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

export function CreationBien({ proprietairesInitiaux, continuite }: { proprietairesInitiaux: number[]; continuite?: Continuite }) {
  const [proprietaires, setProprietaires] = useState<PersonneProprietaire[]>([]);
  /** Les contacts EXISTANTS de la Gestion cochés dans « Qui rattacher à ce bien ? ». */
  const [contactsExistants, setContactsExistants] = useState<ContactProprietaire[]>([]);
  /** Le résultat de la recherche dont le panneau « Qui rattacher à ce bien ? » est ouvert. */
  const [enChoix, setEnChoix] = useState<number | null>(null);
  const [texte, setTexte] = useState('');
  const [terme, setTerme] = useState('');
  const [b, setB] = useState(VIDE);
  const [famille, setFamille] = useState<Famille | null>(null);
  const [type, setType] = useState<TypeLogement | null>(null);
  const [typeLocal, setTypeLocal] = useState<TypeLocal | null>(null);
  const [parkingSituation, setParkingSituation] = useState<SituationParking | null>(null);
  const [parkingType, setParkingType] = useState<TypeParking | null>(null);
  const [meuble, setMeuble] = useState<boolean | null>(null);
  const [ascenseur, setAscenseur] = useState<boolean | null>(null);
  const [digicode, setDigicode] = useState<boolean | null>(null);
  const [adresseVerifiee, setAdresseVerifiee] = useState(false);
  const [annexes, setAnnexes] = useState<Annexe[]>([]);
  const [tente, setTente] = useState(false);
  const [motif, setMotif] = useState<string | null>(null);
  /** Le bien est enregistré, mais le mail « nouveau mandat » n'est pas parti (Arno, 18/10/2026). */
  const [mailEchec, setMailEchec] = useState<{ phrase: string; cible: string } | null>(null);
  const [envoi, setEnvoi] = useState(false);
  /** Les CONTACTS DU PROPRIÉTAIRE saisis à l'écran précédent : enregistrés avec le bien (ils se rangent sur lui). */
  const [contacts, setContacts] = useState<ChampsSaisis[]>([]);
  /** Le SYNDIC choisi (loupe, suggestion « déjà connu pour cette adresse », ou créé dans la modale de la Gestion). */
  const [syndic, setSyndic] = useState<SyndicChoisi | null>(null);
  useEffect(() => { if (continuite === undefined) setContacts(lireContactsEnAttente(proprietairesInitiaux)); }, [proprietairesInitiaux, continuite]);
  /** L'ASSURANCE PNO (Arno, 18/10/2026) : oui / non / non renseigné ; Non vide la date anniversaire. */
  const [assurancePno, setAssurancePno] = useState<boolean | null>(null);
  /** L'ENTRETIEN À PRÉVOIR (Arno, 18/10/2026) : Non vide le tout. */
  const [entretien, setEntretien] = useState<SaisieEntretien>(ENTRETIEN_VIDE);
  /**
   * « BIEN EN GESTION ? » (Arno, 20/10/2026) : `null` tant qu'on n'a pas répondu. En continuité, la question n'est pas
   * posée : la réponse du dessus (toujours donnée avant que ce formulaire s'ouvre), sinon rien (« en gestion » par défaut).
   */
  const [enGestionSaisi, setEnGestion] = useState<boolean | null>(null);
  const enGestion: boolean | null | undefined = continuite !== undefined ? continuite.enGestion ?? undefined : enGestionSaisi;

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
  const agTouchee = useRef(false);
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
  const digicodeTouche = useRef(false);
  const [digicodeImmeuble, setDigicodeImmeuble] = useState<{ mention: string | null; source: string | null } | null>(null);
  useEffect(() => {
    const voie = b.adresse.trim();
    if (voie.length < 5) { setDigicodeImmeuble(null); return; }
    let vivant = true;
    const t = setTimeout(() => {
      const q = `digicodePourAdresse=${encodeURIComponent(voie)}&cp=${encodeURIComponent(b.codePostal.trim())}&commune=${encodeURIComponent(b.commune.trim())}`;
      void fetch(`${API}?${q}`, { cache: 'no-store' }).then((r) => r.json() as Promise<{ etat?: string; data?: { digicode: boolean | null; code: string | null; source: string | null; mention: string | null } | null }>)
        .then((d) => {
          if (!vivant || d.etat !== 'ok' || d.data === null || d.data === undefined) { if (vivant) setDigicodeImmeuble(null); return; }
          const lu = d.data;
          setDigicodeImmeuble({ mention: lu.mention, source: lu.source });
          if (!digicodeTouche.current && lu.source === 'immeuble') {
            setDigicode(lu.digicode);
            setB((x) => ({ ...x, digicodeCode: lu.code ?? '' }));
          }
        }).catch(() => {});
    }, 500);
    return () => { vivant = false; clearTimeout(t); };
  }, [b.adresse, b.codePostal, b.commune]);
  const recherche = useLecture<ResultatPortefeuille[]>(terme.length >= 2 ? `proprietairesRecherche=${encodeURIComponent(terme)}` : null);

  const champ = (k: Champ, mot: React.ReactNode, props: React.InputHTMLAttributes<HTMLInputElement> = {}, aide?: string) => (
    <label className="loc-champ">{mot}<input value={b[k]} onChange={(e) => { const val = e.target.value; setB((x) => ({ ...x, [k]: val })); }} {...props} />
      {aide !== undefined && <small className="loc-aide">{aide}</small>}</label>
  );
  const choix = (k: Champ, mot: string, options: readonly string[]) => (
    <label className="loc-champ">{mot}
      <select value={b[k]} onChange={(e) => { const val = e.target.value; setB((x) => ({ ...x, [k]: val })); }}>
        <option value="">— non renseigné —</option>{options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select></label>
  );
  const changerAnnexe = (i: number, f: (a: Annexe) => Annexe): void => setAnnexes((l) => l.map((x, j) => (j === i ? f(x) : x)));
  const ajouterAnnexe = (categorie: Categorie): void => setAnnexes((a) => [...a, {
    cle: Date.now() + a.length, categorie, etage: '', numLotCopro: '', porte: '', nomAnnexe: '', annotation: '', detachee: false, fermee: false, aConfirmer: false,
    parkingSituation: null, parkingType: null,
    autreAdresse: false, adresse: '', codePostal: '', commune: '', adresseVerifiee: false,
  }]);

  const nom = famille === null ? 'bien' : NOM_FAMILLE[famille];
  const avecAnnexes = famille !== 'parking';
  // Arno (18/10/2026) : DPE et « Entretien à prévoir » obligatoires pour un logement / local (la règle de `bienComplet.ts`).
  const aujourdhui = aujourdhuiParis();
  const dpeNonSoumis = b.dpeClasse === DPE_NON_SOUMIS;
  // En continuité, les propriétaires sont ceux qu'on vient de saisir (au moins un, vérifié par l'écran du dessus).
  const manque = manquesDuBien({
    proprietaireIds: continuite !== undefined ? [1] : proprietaires.map((p) => p.id), adresse: b.adresse, famille, typeLogement: type, typeLocal, parkingType,
    dpeClasse: b.dpeClasse, dpeDate: b.dpeDate, entretienAPrevoir: entretien.aPrevoir, entretiens: versEnvoiEntretien(entretien).entretiens, aujourdhui,
    annexes: avecAnnexes ? annexes.map((a) => ({ autreAdresse: a.autreAdresse, adresse: a.adresse, categorie: a.categorie, nomAnnexe: a.nomAnnexe })) : [],
    ...(enGestion !== undefined ? { enGestion } : {}),
  });
  const manqueDe = (k: string): React.ReactNode => (tente && manque[k] !== undefined ? <p className="loc-manque" role="alert">{manque[k]}</p> : null);

  const enregistrer = async (): Promise<void> => {
    setTente(true);
    if (Object.keys(manque).length > 0) {
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
    if (!v.ok) { setMotif(v.motif); return; }
    setEnvoi(true);
    // Continuité : les fiches d'abord (une seule fois), puis le bien.
    let proprietaireIds = proprietaires.map((p) => p.id);
    if (continuite !== undefined) {
      const f = await continuite.creerFiches();
      if ('motif' in f) { setEnvoi(false); setMotif(f.motif); return; }
      proprietaireIds = f.ids;
    }
    const r = await envoyer({
      action: 'creer-bien', proprietaireIds, contactsExistants: contactsExistants.map((c) => c.id), enGestion,
      logement: { ...b, syndicId: syndic === null ? '' : String(syndic.id), famille, typeLogement: type, typeLocal, parkingSituation, parkingType, meuble, ascenseur, digicode,
        assurancePno, pnoDateAnniversaire: assurancePno === true ? b.pnoDateAnniversaire : '', ...(famille === 'parking' ? {} : versEnvoiEntretien(entretien)) },
      syndic: syndic === null ? null : { id: syndic.id, contactsIds: syndic.contactsIds, nouveauxContacts: syndic.nouveauxContacts },
      contacts: continuite !== undefined ? continuite.contacts : contacts,
      annexes: avecAnnexes ? annexes.map(({ categorie, etage, numLotCopro, porte, nomAnnexe, annotation, detachee, parkingSituation: s, parkingType: t, autreAdresse, adresse, codePostal, commune }) => ({
        categorie, etage, numLotCopro, porte, parkingSituation: s, parkingType: t, autreAdresse, annotation, detachee,
        ...(categorie === 'autre' ? { nomAnnexe } : {}),
        ...(autreAdresse ? { adresse, codePostal, commune } : {}),
      })) : [],
    });
    setEnvoi(false);
    if (r.motif !== null) {
      setMotif(continuite !== undefined
        ? `Les fiches des propriétaires sont créées, mais le bien n’est pas encore enregistré : ${r.motif} Corrigez puis enregistrez à nouveau (les fiches ne seront pas recréées).`
        : r.motif);
      return;
    }
    oublierContactsEnAttente();
    const id = (r.data as { logementId?: number } | undefined)?.logementId;
    const cible = id !== undefined ? `/admin/location/bien/${id}` : '/admin/location/proprietaires';
    // Arno (18/10/2026) : le mail « nouveau mandat » n'est jamais bloquant — mais s'il n'est pas parti, on le DIT avant de partir.
    const echec = phraseMail(r.mail);
    if (echec !== null) { setMailEchec({ phrase: echec, cible }); return; }
    window.location.href = cible;
  };

  const resultats = recherche.etat.etat === 'ok' ? liste(recherche.etat.data).filter((r) => !proprietaires.some((p) => p.id === r.id)) : [];
  // La numérotation suit les sections AFFICHÉES (un parking nu n'a ni annexes ni caractéristiques complémentaires).
  const sections = [...(continuite !== undefined ? [] : ['proprietaires']), 'bien', 'adresse', 'copro', ...(avecAnnexes ? ['annexes', 'complements'] : []), 'commentaires',
    ...(continuite !== undefined ? [] : ['gestion'])];
  const n = (cle: string): number => sections.indexOf(cle) + 1;

  return (
    // noValidate : les refus sont ceux de la règle (`bienComplet.ts`), dits sous chaque champ — jamais la bulle du navigateur
    // (la date du DPE porte `max` = aujourd'hui pour griser le futur dans le sélecteur).
    <form className="loc-page loc-ample" noValidate onSubmit={(e) => { e.preventDefault(); void enregistrer(); }}>
      <style>{CSS_LOCATION_ECRANS + CSS_LOCATION_CREATION + CSS_CARTES + CSS_RATTACHEMENT + CSS_CHAMP_ADRESSE + CSS_CHAMP_FLECHES + CSS_ENTRETIEN + CSS_ZONE_AUTO + CSS_ANNEXE_CARTE + CSS_DPE_PNO + CSS_FETE}</style>
      {continuite === undefined ? (
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

      {continuite === undefined && <section className="loc-section" aria-labelledby="loc-b1">
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
        <div className="loc-gros-boutons loc-gros-boutons--3d loc-familles" role="group" aria-label="Famille du bien">
          {FAMILLES.map((f) => (
            <button key={f} type="button" className="loc-gros-bouton loc-gros-bouton--centre" aria-pressed={famille === f} data-famille={f}
              onClick={() => setFamille(f)}>{famille === f ? `✓ ${LIBELLE_FAMILLE[f]}` : LIBELLE_FAMILLE[f]}</button>
          ))}
        </div>
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
        {(famille === 'logement' || famille === 'local') && (
          <div className="loc-sous-section">
            <h4>{famille === 'logement' ? 'Pièces et surfaces' : 'Bureaux / pièces et surfaces'}</h4>
            <div className="loc-grille" data-ligne-surfaces>
              <ChampFleches sorte="pieces" libelle={famille === 'logement' ? 'Nombre de pièces' : 'Nombre de bureaux / pièces'} placeholder="ex. 3"
                valeur={b.nombrePieces} onChange={(v) => setB((x) => ({ ...x, nombrePieces: v }))} />
              {champ('surfaceHabitableM2', famille === 'logement' ? 'Surface habitable (m²)' : 'Surface (m²)', { inputMode: 'decimal' })}
              {champ('surfaceCarrezM2', 'Surface Carrez/Boutin m²', { inputMode: 'decimal' })}
              {champ('surfaceExterieureM2', 'Surface extérieure (m²)', { inputMode: 'decimal' }, 'balcon, terrasse, jardin')}
            </div>
          </div>
        )}
      </section>

      <section className="loc-section" aria-labelledby="loc-b2">
        <h3 id="loc-b2"><span className="loc-num">{n('adresse')}</span>Adresse et situation</h3>
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
              {digicodeImmeuble?.mention && <small className="loc-aide loc-aide--long" data-digicode-immeuble>{digicodeImmeuble.mention}{digicodeImmeuble.source === 'immeuble' ? ' — code de l’immeuble, pré-rempli' : ''}.</small>}
            </div>
          </div>
        </div>
      </section>

      <section className="loc-section" aria-labelledby="loc-b4">
        <h3 id="loc-b4"><span className="loc-num">{n('copro')}</span>Copropriété</h3>
        <div className="loc-grille">
          {champ('numLotCopro', 'N° de lot (règlement de copropriété)')}
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
              <li key={a.cle} className={`loc-enfant${a.fermee ? ' loc-enfant--fermee' : ''}`} data-annexe={a.categorie} data-fermee={a.fermee ? 'oui' : undefined}>
                {/* Arno (18/10/2026) : « Retirer » devient Supprimer (après confirmation) · Détacher / Rattacher · Fermer / Ouvrir. */}
                <div className="loc-annexe-tete">
                  {a.fermee
                    ? <button type="button" className="loc-annexe-resume" onClick={() => changerAnnexe(i, (x) => ({ ...x, fermee: false }))} aria-expanded={false} data-resume-annexe>
                      {resumeAnnexe({ ...a, numLotCopro: a.numLotCopro, porte: a.porte })}</button>
                    : <span className="loc-annexe-titre">{a.categorie === 'autre' && a.nomAnnexe.trim() !== '' ? a.nomAnnexe.trim() : LIBELLE_ANNEXE[a.categorie] ?? 'Annexe'}</span>}
                  {a.detachee && <span className="loc-etiquette-detachee">Détachée</span>}
                  <span className="loc-annexe-actions">
                    <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => changerAnnexe(i, (x) => ({ ...x, aConfirmer: true }))}>Supprimer</button>
                    <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => changerAnnexe(i, (x) => ({ ...x, detachee: !x.detachee }))}>{a.detachee ? 'Rattacher' : 'Détacher'}</button>
                    <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => changerAnnexe(i, (x) => ({ ...x, fermee: !x.fermee }))} aria-expanded={!a.fermee}>{a.fermee ? 'Ouvrir' : 'Fermer'}</button>
                  </span>
                </div>
                {a.aConfirmer && (
                  <div className="loc-confirmer" role="alert" data-confirmer-suppression>
                    <span>Supprimer cette annexe du formulaire ?</span>
                    <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={() => setAnnexes((l) => l.filter((_, j) => j !== i))}>Oui, supprimer</button>
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
                <div className="loc-pilules loc-annexe-adresse" role="group" aria-label="Adresse de l’annexe">
                  <button type="button" aria-pressed={!a.autreAdresse} onClick={() => changerAnnexe(i, (x) => ({ ...x, autreAdresse: false }))}>Même adresse</button>
                  <button type="button" aria-pressed={a.autreAdresse} onClick={() => changerAnnexe(i, (x) => ({ ...x, autreAdresse: true }))}>Autre adresse</button>
                </div>
                {a.autreAdresse && (
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
            ))}
          </ul>
          <div className="loc-pilules">
            <button type="button" onClick={() => ajouterAnnexe('cave')}>+ Cave</button>
            <button type="button" onClick={() => ajouterAnnexe('parking')}>+ Parking</button>
            <button type="button" onClick={() => ajouterAnnexe('autre')}>+ Autre</button>
          </div>
        </section>
      )}

      {avecAnnexes && (
        <section className="loc-section" aria-labelledby="loc-b6">
          <h3 id="loc-b6"><span className="loc-num">{n('complements')}</span>Caractéristiques complémentaires</h3>
          {/* Arno (18/10/2026) : libellés et champs sur la MÊME ligne (alignés en haut) ; la légende de l'AG reste dessous. */}
          <div className="loc-grille loc-grille--debut" data-ligne-epoque>
            {choix('epoqueConstruction', 'Époque de construction', EPOQUES_CONSTRUCTION)}
            {choix('chauffage', 'Chauffage', CHAUFFAGES)}
            <label className="loc-champ" data-derniere-ag>{LIBELLE_AG}
              <input type="date" value={b.derniereAg} onChange={(e) => { agTouchee.current = true; const val = e.target.value; setB((x) => ({ ...x, derniereAg: val })); }} />
              <small className="loc-aide loc-aide--long">{agConnue !== null && b.derniereAg === agConnue
                ? 'Déjà connue pour cet immeuble : la modifier met à jour tous ses lots.' : 'Assemblée générale de copropriété — partagée par tous les lots de l’immeuble.'}</small></label>
          </div>
          {/* Arno (18/10/2026) : DPE (gauche) et assurance PNO (droite), deux blocs de même hauteur aux rangées partagées —
              choix sur une ligne, dates sur la suivante ; la date reste à sa place, grisée, quand elle est sans objet. */}
          <div className="loc-dpe-pno" data-ligne-dpe-pno>
            <BlocDpe classe={b.dpeClasse} date={b.dpeDate} aujourdhui={aujourdhui}
              onClasse={(c) => setB((x) => ({ ...x, dpeClasse: c }))} onDate={(d) => setB((x) => ({ ...x, dpeDate: d }))}
              manque={(k) => manqueDe(k)} />
            <div className="loc-dpe-pno-bloc" data-pno>
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
            </div>
          </div>
          <BlocEntretien valeur={entretien} onChange={setEntretien} obligatoire
            manques={{ reponse: manqueDe('entretien'), liste: manqueDe('entretienListe'), autre: (k) => manqueDe(`entretien-autre-${k}`) }} />
        </section>
      )}

      <section className="loc-section" aria-labelledby="loc-b7">
        <h3 id="loc-b7"><span className="loc-num">{n('commentaires')}</span>Commentaires</h3>
        <label className="loc-champ">Commentaire libre
          <textarea value={b.commentaire} onChange={(e) => { const val = e.target.value; setB((x) => ({ ...x, commentaire: val })); }} maxLength={4000} /></label>
      </section>

      {continuite === undefined && (
        <QuestionEnGestion id="loc-b8" numero={n('gestion')} titre="Bien en gestion ?" sorte="bien" obligatoire valeur={enGestionSaisi}
          onChoix={setEnGestion}>{manqueDe('enGestion')}</QuestionEnGestion>
      )}

      {mailEchec !== null && (
        <div className="loc-alerte loc-alerte--orange" role="alert" data-mail-echec>
          <p style={{ margin: '0 0 8px' }}>{mailEchec.phrase}</p>
          <a className="svv-btn svv-btn-primary gst-btn" href={mailEchec.cible}>Ouvrir la fiche du bien</a>
        </div>
      )}
      <div className="loc-collant" data-collant>
        <p className="loc-manques" role="status">
          {motif ?? (Object.keys(manque).length > 0 ? `Reste à renseigner : ${Object.values(manque).map((m) => m.replace(/\.$/, '')).join(' · ')}.` : 'Tout l’obligatoire est renseigné.')}
        </p>
        <a className="svv-btn svv-btn-outline gst-btn" href="/admin/location/proprietaires">Annuler</a>
        <button type="submit" className="svv-btn svv-btn-primary gst-btn" disabled={envoi}>{envoi ? 'Enregistrement…' : 'Enregistrer le bien'}</button>
      </div>
    </form>
  );
}
