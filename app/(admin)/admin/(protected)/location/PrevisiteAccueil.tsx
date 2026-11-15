'use client';

import { useVerrouDefilement } from '../_composants/verrouDefilement';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { EtatLecture, envoyer, useLecture } from './commun';
import { MENTION_RESERVE_LOCATION, useContextePreavis } from './preavisSynchro';
import { BlocageEmailLocataires, useEmailsLocataires } from './EmailLocataireRequis';
import { CSS_MODALE_ISSUE } from './ModaleIssue';
import { BlocsEnvois, CSS_CONFIRMATION_ENVOIS } from './ConfirmationEnvois';
import { CSS_PARCOURS, TexteDuMail } from './ParcoursPreavisSortie';
import { CSS_TEXTE_MODIFIABLE, ModifierTexteMail } from './TexteModifiableMail';
import type { EditionMail, Retouche, Retouches } from '../../../../lib/location/texteModifiable';
import { libelleMail, type MailParti } from '../../../../lib/location/confirmationEnvois';
import { ajouterMois, dateFrPreavis, EDL_MOIS_APRES_FIN, type LignePreavisAccueil } from '../../../../lib/location/preavis';
import { heureFinProposee, heureFr } from '../../../../lib/location/edls';
import {
  ALERTE_TOUS_REFUSENT, CARTOUCHE_ALERTE, LIBELLE_STATUT_PREVISITE, creneauFr, objetCompteRendu, verifierRdvPrevisite,
  type PrevisiteAffiche, type StatutPrevisite,
} from '../../../../lib/location/previsite';
import { refusPhotos, lignePhoto, legendesDuTexte, texteSansPhotos } from '../../../../lib/location/photosCompteRendu';
import { rdvDansDeuxMinutes } from '../../../../lib/location/preavisTest';
// 🔴 Arno (15/11/2026) — les trois blocs du compte rendu (texte, photos, dictaphone) : `CompteRenduSaisie.tsx` (conversion des photos et
// enregistreur chargés AU TOUCHER, jamais à l'ouverture du formulaire).
import { BlocDictaphone, BlocPhotos, BlocPresence, BlocTexte, BoutonEnvoiLocataires, BoutonTheme, Confirmation, LignesVocauxRecap, MOTIF_PHOTO_PERDUE, MOTIF_PRISE_PERDUE, motifPiecesBloquantes, piecesBloquantes, type PriseVocale, type PersonneAjouteeSaisie, CSS_COMPTE_RENDU_SAISIE, LectureFichiersVocaux, vocauxPourEnvoi, type FichierVocal, type PhotoSaisie } from './CompteRenduSaisie';
import { etatVocalLocataires, insererTranscription } from '../../../../lib/location/vocauxCompteRendu';
import { appliquerTirets, MOTIF_PRESENCE, sansTiretsOrphelins } from '../../../../lib/location/texteCompteRendu';
import { cheminCompteRendu } from '../../../../lib/location/cheminCompteRendu';
import { filtresLignes, LIBELLE_STATUT_LIGNE, type FiltreLigne, type StatutLigne } from '../../../../lib/location/statutLignePreavis';
import { ETIQUETTE_FAMILLE_MAIL, familleDuMail, ORDRE_LOCATAIRES_DABORD, trierParFamille, type FamilleMail } from '../../../../lib/location/famillesMails';
import { CarteMailFamille, CSS_FAMILLES_MAILS, RappelFamilles } from './CartesMailsFamilles';
import { CartoucheSauvegarde, CSS_CARTOUCHE_SAUVEGARDE, useBrouillonCompteRendu } from './BrouillonCompteRendu';
import { repeindre } from './repeindre';
import { BROUILLON_VIDE, heureBrouillon, type ContenuBrouillon } from '../../../../lib/location/brouillonCompteRendu';
import { AUCUN_CR, AUCUN_ENVOI_CR, LIBELLE_ETAT_CR, LIBELLE_FAMILLE_CR, quandFr, type CompteRenduAffiche } from '../../../../lib/location/compteRenduPrevisite';

/**
 * ══ 🔴🔴 LA PRÉ-VISITE SUR LE BLOC « LOCATAIRES EN PRÉAVIS » (Arno, 10/11/2026) ════════════════════════════════════════════════════
 * Les pastilles de statut (avec leur compteur ; « Alerte préavis » seulement s'il y en a), le cartouche « Aucune pré-visite fixée » et la
 * date / l'heure de la pré-visite sur la ligne ; dépliée : le bloc « Pré-visite » — « RDV pré-visite », « Déplacer », « Réaffecter » (tous
 * ont refusé), « Compte rendu pré-visite » (le rendez-vous passé), « Refus / absence de pré-visite ». Chaque geste : la saisie, puis le
 * RÉCAPITULATIF avec le texte intégral de chaque mail (rien n'est encore fait), puis la fenêtre qui dit ce qui a été fait et les mails
 * réellement envoyés d'après le serveur (échecs en rouge). RIEN de l'existant n'est retiré : « Planifier l'état des lieux de sortie » et
 * « Valider la sortie » restent à leur place.
 */

/** La mention de la pré-visite dans le détail de la ligne : « Pré-visite le 12/11/2026 à 10h00 », ou le statut. PUR. */
export function detailPrevisite(p: PrevisiteAffiche | null | undefined): string | null {
  if (!p) return null;
  if (p.statut === 'programmee' && p.rdv) return `Pré-visite le ${dateFrPreavis(p.rdv.jour)} à ${heureFr(p.rdv.heure)}`;
  if (p.statut === 'effectuee' && p.rdv) return `Pré-visite effectuée le ${dateFrPreavis(p.rdv.jour)}`;
  return LIBELLE_STATUT_PREVISITE[p.statut];
}

/** Les cartouches de la ligne : « Aucune pré-visite fixée » (alerte), « Personne n'a accepté la pré-visite ». */
export function CartouchesPrevisite({ p }: { p: PrevisiteAffiche | null | undefined }) {
  if (!p) return null;
  return <>
    {p.statut === 'alerte' && <span className="pvv-cartouche pvv-cartouche--alerte" data-cartouche-previsite="alerte">{CARTOUCHE_ALERTE}</span>}
    {p.statut === 'programmee' && p.tousRefusent && <span className="pvv-cartouche pvv-cartouche--refus" data-cartouche-previsite="tous-refusent">{ALERTE_TOUS_REFUSENT}</span>}
  </>;
}

/** 🔴🔴 Arno (15/11/2026) — le cartouche du STATUT de la ligne (arbre d'Arno) : une couleur par statut, le MOT toujours écrit. */
export function CartoucheStatutLigne({ statut }: { statut: StatutLigne }) {
  return <span className={`psl-statut psl-statut--${statut}`} data-statut-ligne={statut}>{LIBELLE_STATUT_LIGNE[statut]}</span>;
}

/**
 * 🔴🔴 Arno (15/11/2026) — les FILTRES « Statut » : un par statut de ligne (1 à 4) avec son compteur, plus « Tous » ; ils remplacent les
 * filtres « Préavis reçu / Pré-visite programmée / effectuée / refusée-absente » (accord d'Arno), sans perdre de ligne. « Alerte préavis »
 * reste en plus (il n'est pas un statut), seulement s'il y en a. Plusieurs à la fois.
 */
export function FiltresStatutLigne({ lignes, filtre, onChange }: { lignes: readonly LignePreavisAccueil[]; filtre: ReadonlySet<FiltreLigne>; onChange: (f: Set<FiltreLigne>) => void }) {
  const filtres = filtresLignes(lignes);
  const basculer = (s: FiltreLigne): void => { const n = new Set(filtre); if (n.has(s)) n.delete(s); else n.add(s); onChange(n); };
  return (
    <div className="pva-tri pvv-pastilles" role="group" aria-label="Filtrer par statut" data-pastilles-previsite data-filtres-statut>
      <span className="pva-tri-libelle">Statut</span>
      <button type="button" className="pva-segment" aria-pressed={filtre.size === 0} onClick={() => onChange(new Set())} data-filtre-previsite="tous">Tous ({lignes.length})</button>
      {filtres.map((f) => (
        <button key={f.filtre} type="button" className={`pva-segment pvv-pastille psl-filtre psl-filtre--${f.filtre}`} aria-pressed={filtre.has(f.filtre)}
          onClick={() => basculer(f.filtre)} data-filtre-previsite={f.filtre}>{f.libelle} <span className="pvv-compteur" data-compteur-previsite={f.filtre}>{f.nombre}</span></button>
      ))}
    </div>
  );
}

interface Collegue { id: number; libelle: string }
type Geste = 'rdv' | 'deplacer' | 'reaffecter' | 'compte_rendu' | 'refus';
const LIBELLE_REPONSE: Record<string, string> = { en_attente: 'en attente', acceptee: 'acceptée', refusee: 'refusée' };

/** 🔴 Arno (10/11/2026, option A) — sous des boutons inactifs (compte sans le droit « Location ») : la mention, avec le mot. */
export function MentionReserveLocation() {
  return <p className="pvv-reserve" role="note" data-reserve-location>{MENTION_RESERVE_LOCATION}</p>;
}

/** Le bloc « Pré-visite » de la ligne dépliée. */
export function BlocPrevisite({ l, apres }: { l: LignePreavisAccueil; apres: () => void }) {
  const p = l.previsite ?? null;
  const [geste, setGeste] = useState<Geste | null>(null);
  /** 🔴 (9e retour) la fenêtre du compte rendu : envoyé (« Voir le compte rendu ») ou brouillon (« Compte rendu pré-visite » de la frise) */
  const [voirCr, setVoirCr] = useState<false | 'envoye' | 'brouillon'>(false);
  const { ecriture } = useContextePreavis();
  // 🔴 Arno (15/11/2026) — le compte rendu est une PAGE à part entière (`PageCompteRendu`) : l'ancien lien de l'invitation y est redirigé par
  // le serveur. Au retour de l'envoi, la fenêtre de résultat habituelle s'affiche ICI (rangée par la page le temps de revenir, une seule fois).
  const [resultat, setResultat] = useState<EtapeResultat | null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { const r = prendreResultatCompteRendu(l.occupationIds); if (r !== null) setResultat(r); }, [l.occupationIds]);
  if (p === null) return null;
  const programmee = p.statut === 'programmee' && p.rdv !== null;
  // 🔴 Arno (10/11/2026, option A) — sans le droit « Location » : les boutons restent visibles, INACTIFS, avec la mention.
  const inactif = ecriture ? {} : { disabled: true, title: MENTION_RESERVE_LOCATION, 'aria-disabled': true } as const;
  return (
    <div className="pva-bloc" data-bloc-previsite data-statut-previsite={p.statut}>
      {/* 🔴 Arno (11/11/2026, lot 5) — dans la case « 2. Pré-visite » : plus de sous-titre (le titre de la case le dit), plus de bandeau « Préavis
          reçu » (doublon de la case 1) ; les autres états restent. Deux zones — informations, puis boutons — alignées d'une case à l'autre. */}
      <div className="frp-infos">
      {p.statut !== 'recu' && <p className={`pvv-etat pvv-etat--${p.statut}`} role="status" data-previsite-etat>
        {LIBELLE_STATUT_PREVISITE[p.statut]}{p.rdv && (p.statut === 'programmee' || p.statut === 'effectuee') ? ` — le ${creneauFr(p.rdv)}` : ''}</p>}
      <CartouchesPrevisite p={p} />
      {p.collegues.length > 0 && p.statut === 'programmee' && (
        <ul className="pvv-collegues" data-previsite-collegues>
          {p.collegues.map((c, i) => (
            <li key={`${i}-${c.libelle}`} data-collegue-statut={c.statut ?? 'inconnu'}>{c.libelle} : {LIBELLE_REPONSE[c.statut ?? ''] ?? '—'}{c.statut === 'refusee' && c.motif ? ` (${c.motif})` : ''}</li>
          ))}
        </ul>
      )}
      </div>
      <div className="frp-actions">
      <div className="loc-boutons" style={{ justifyContent: 'flex-start' }}>
        {!programmee && p.statut !== 'effectuee' && <button type="button" className="svv-btn svv-btn-primary gst-btn" {...inactif} onClick={() => setGeste('rdv')} data-rdv-previsite>RDV pré-visite</button>}
        {programmee && <button type="button" className="svv-btn svv-btn-outline gst-btn" {...inactif} onClick={() => setGeste('deplacer')} data-deplacer-previsite>Déplacer la pré-visite</button>}
        {programmee && p.tousRefusent && <button type="button" className="svv-btn svv-btn-primary gst-btn" {...inactif} onClick={() => setGeste('reaffecter')} data-reaffecter-previsite>Réaffecter la pré-visite</button>}
        {/* 🔴🔴 Arno (15/11/2026, 9e retour) — le bouton ouvre la FENÊTRE du compte rendu (le brouillon en cours, lecture seule) ; « Continuer la
            saisie » y ouvre la PAGE du formulaire (un lien : le « ← Retour » commun note d'où l'on vient) ; inactif sans droit */}
        {p.rdv !== null && p.rdvPasse && p.statut === 'programmee' && (ecriture
          ? <button type="button" className="svv-btn svv-btn-primary gst-btn pvv-lien-cr" onClick={() => setVoirCr('brouillon')} data-compte-rendu-previsite>Compte rendu pré-visite</button>
          : <button type="button" className="svv-btn svv-btn-primary gst-btn" {...inactif} data-compte-rendu-previsite>Compte rendu pré-visite</button>)}
        {p.statut !== 'effectuee' && p.statut !== 'refusee' && (
          <button type="button" className="svv-btn svv-btn-outline gst-btn" {...inactif} onClick={() => setGeste('refus')} data-refus-previsite>Refus / absence de pré-visite</button>)}
      </div>
      {!ecriture && <MentionReserveLocation />}
      {/* 🔴 Arno (13/11/2026) — la pré-visite effectuée : « Voir le compte rendu » (lecture seule, ouvert à tout compte Location) ; aucun compte rendu
          saisi : le bouton le dit, inactif (pas de nouvelle saisie). */}
      {p.statut === 'effectuee' && (
        <div className="loc-boutons pvv-voir-cr" style={{ justifyContent: 'flex-start' }}>
          {p.compteRendu === false
            ? <button type="button" className="svv-btn svv-btn-outline gst-btn pvv-petit" disabled aria-disabled="true" data-voir-compte-rendu="aucun">{AUCUN_CR}</button>
            : <button type="button" className="svv-btn svv-btn-outline gst-btn pvv-petit" onClick={() => setVoirCr('envoye')} data-voir-compte-rendu="oui">Voir le compte rendu</button>}
        </div>
      )}
      </div>
      {voirCr !== false && <FenetreCompteRendu l={l} p={p} mode={voirCr} onFermer={() => setVoirCr(false)} />}
      {geste !== null && ecriture && <FenetrePrevisite geste={geste} l={l} p={p} onFermer={(fait) => { setGeste(null); if (fait) apres(); }} />}
      {resultat !== null && <FenetrePrevisite geste="compte_rendu" l={l} p={p} resultatInitial={resultat} onFermer={() => { setResultat(null); apres(); }} />}
    </div>
  );
}

interface MailApercu { sorte: string; objet: string; a: string[]; cc: string[]; texte: string; piece?: string | null;
  /** 🔴 Arno (10/11/2026) — un mail aux locataires à texte modifiable : ses parties. */
  edition?: EditionMail;
  /** 🔴 Arno (15/11/2026) — sa famille, le locataire qu'il vise, ses pièces jointes, ce qui part vraiment en recette (dits par le serveur). */
  famille?: FamilleMail; destinataire?: string; pieces?: string[]; recette?: string }
type EtapeResultat = { etape: 'resultat'; mails: MailParti[]; lignes: [string, ReactNode][]; motif: string | null };
type Etape = { etape: 'saisie' } | { etape: 'recap'; mails: MailApercu[]; sansEmail: string[]; notesInternes?: string[] } | EtapeResultat;

/**
 * 🔴 Arno (15/11/2026) — « En présence de … » EN TÊTE du texte de chaque mail du compte rendu : l'écran le VÉRIFIE sur l'aperçu rendu par le
 * serveur. Constaté le 15/11/2026 : un serveur de recette qui servait une version périmée du module (rechargement à chaud incomplet) rendait
 * des mails sans la phrase, et rien ne le disait. Désormais le récapitulatif ne s'affiche pas : la raison est dite, rien n'est parti. PUR.
 */
export const MOTIF_PHRASE_ABSENTE = 'Le récapitulatif ne porte pas « En présence de … » : le serveur doit être relancé (version périmée). Rien n’est parti.';
/** 🔴 (6e retour) le mail interne porte la phrase « En présence de … » ; celui des locataires, « … en présence de … » dans son introduction. */
export function refusSansPhrase(phrase: unknown, mails: readonly { texte: string }[], presence?: unknown): string | null {
  if (typeof phrase !== 'string' || !phrase.startsWith('En présence')) return MOTIF_PHRASE_ABSENTE;
  const liste = typeof presence === 'string' && presence !== '' ? `en présence ${presence}` : null;
  return mails.every((m) => m.texte.includes(phrase) || (liste !== null && m.texte.includes(liste))) ? null : MOTIF_PHRASE_ABSENTE;
}

/**
 * 🔴 Arno (15/11/2026) — LE RÉSULTAT DE L'ENVOI, DE LA PAGE DU COMPTE RENDU À LA LOCATION : rangé dans l'onglet (sessionStorage) le temps de
 * revenir, puis lu UNE fois par le bloc « Pré-visite » du même préavis, qui affiche la fenêtre de résultat habituelle. Sans stockage : rien
 * (l'envoi est fait ; la ligne relue dit « Pré-visite effectuée »). Périmé au-delà de 10 minutes.
 */
export const CLE_RESULTAT_CR = 'svav.previsite.resultat-compte-rendu';
const RESULTAT_PERIME_MS = 10 * 60_000;
export function noterResultatCompteRendu(occupationIds: readonly number[], r: { mails: MailParti[]; lignes: [string, string][]; motif: string | null }): void {
  try { window.sessionStorage.setItem(CLE_RESULTAT_CR, JSON.stringify({ occupationIds, le: Date.now(), ...r })); } catch { /* sans stockage : rien */ }
}
export function prendreResultatCompteRendu(occupationIds: readonly number[]): EtapeResultat | null {
  try {
    const brut = window.sessionStorage.getItem(CLE_RESULTAT_CR);
    if (brut === null) return null;
    const r = JSON.parse(brut) as { occupationIds?: number[]; le?: number; mails?: MailParti[]; lignes?: [string, string][]; motif?: string | null };
    if (!Array.isArray(r.occupationIds) || !r.occupationIds.some((x) => occupationIds.includes(x))) return null;
    window.sessionStorage.removeItem(CLE_RESULTAT_CR);
    if (typeof r.le !== 'number' || Date.now() - r.le > RESULTAT_PERIME_MS) return null;
    return { etape: 'resultat', mails: Array.isArray(r.mails) ? r.mails : [], lignes: Array.isArray(r.lignes) ? r.lignes : [], motif: r.motif ?? null };
  } catch { return null; }
}

const TITRES: Record<Geste, [string, string]> = {
  rdv: ['RDV pré-visite', 'Pré-visite programmée'],
  deplacer: ['Déplacer la pré-visite', 'Pré-visite déplacée'],
  reaffecter: ['Réaffecter la pré-visite', 'Pré-visite réaffectée'],
  compte_rendu: ['Compte rendu pré-visite', 'Compte rendu envoyé'],
  refus: ['Refus / absence de pré-visite', 'Mail de refus / absence envoyé'],
};

/** Un mail du module de tâches, tel que la route le rend (`{ destinataire, etat }`), en ligne de la fenêtre de résultat. PUR. */
export function mailCollegue(c: { destinataire: string; etat: string }): MailParti {
  const envoye = c.etat === 'envoye' || c.etat === 'factice';
  const motif = envoye ? null : c.etat === 'desactive' ? 'les mails des tâches sont désactivés dans les réglages des tâches'
    : c.etat === 'sans_droit' ? 'pas de droit d’envoi au nom de gestion@' : c.etat === 'echec' ? 'échec de l’envoi' : c.etat;
  return { sorte: 'previsite_invitation', objet: null, a: [c.destinataire], cc: [], envoye, motif };
}

/**
 * 🔴 Arno (13/11/2026, iPhone) — la ZONE VISIBLE de l'écran : sur Safari iOS, le clavier ne réduit pas la page (`100vh` reste l'écran entier) et
 * masquait le bouton d'envoi. La fenêtre prend la hauteur réellement visible (`visualViewport`), le bouton collé en bas reste au-dessus du clavier.
 */
export function useZoneVisible(): { top: number; height: number } | null {
  const [z, setZ] = useState<{ top: number; height: number } | null>(null);
  useEffect(() => {
    const vv = typeof window === 'undefined' ? undefined : window.visualViewport;
    if (!vv) return;
    // 🔴 Arno (14/11/2026, iPhone) — au plus UNE lecture par image, et un rendu SEULEMENT si la zone a bougé d'au moins un pixel : le
    // déplacement de la fenêtre ne peut pas relancer à l'infini le défilement de l'écran (et l'inverse) — jamais de boucle qui fige la page.
    let image: number | null = null;
    const lire = (): void => {
      image = null;
      setZ((avant) => (avant !== null && Math.abs(avant.top - vv.offsetTop) < 1 && Math.abs(avant.height - vv.height) < 1 ? avant : { top: vv.offsetTop, height: vv.height }));
    };
    const planifier = (): void => { if (image === null) image = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(lire) : (lire(), null); };
    lire();
    vv.addEventListener('resize', planifier); vv.addEventListener('scroll', planifier);
    return () => {
      vv.removeEventListener('resize', planifier); vv.removeEventListener('scroll', planifier);
      if (image !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(image);
    };
  }, []);
  return z;
}

export function FenetrePrevisite({ geste, l, p, onFermer, page = false, resultatInitial }: { geste: Geste; l: LignePreavisAccueil; p: PrevisiteAffiche; onFermer: (fait: boolean) => void;
  /** 🔴 Arno (15/11/2026) — le compte rendu en PAGE à part entière : aucune fenêtre, aucun voile, rien de la page d'avant dessous ; après
   *  l'envoi, le résultat est rangé pour la Location et la page y retourne (`onFermer(true)`). */
  page?: boolean;
  /** Le résultat d'un envoi fait sur la page du compte rendu : la fenêtre s'ouvre directement dessus (sur la Location). */
  resultatInitial?: EtapeResultat }) {
  // 🔴 Arno (11/11/2026) — la fenêtre bloque le défilement de la page, COMPTÉ (commun à toutes les fenêtres ; toujours rendu à la dernière fermée).
  useVerrouDefilement(!page);
  const zone = useZoneVisible();
  const titreId = useId();
  const [etape, setEtape] = useState<Etape>(resultatInitial ?? { etape: 'saisie' });
  const [envoi, setEnvoi] = useState(false);
  const [refus, setRefus] = useState<string | null>(null);
  /** 🔴 Arno (10/11/2026) — le texte modifié des mails aux locataires (confirmation, modification), par sorte. */
  const [retouches, setRetouches] = useState<Retouches>({});
  const deplacement = geste === 'deplacer';
  const avecDate = geste === 'rdv' || geste === 'deplacer';
  const avecCollegues = geste === 'rdv' || geste === 'reaffecter';
  const fin0 = p.rdv ? heureFinProposee(p.rdv.heure) : '';
  const [jour, setJour] = useState(deplacement && p.rdv ? p.rdv.jour : '');
  const [debut, setDebut] = useState(deplacement && p.rdv ? p.rdv.heure : '');
  const [fin, setFin] = useState(deplacement && p.rdv ? (() => {
    const [h, m] = p.rdv!.heure.split(':').map(Number); const t = Math.min(h * 60 + m + p.rdv!.dureeMinutes, 23 * 60 + 59);
    return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  })() : fin0);
  const [finTouchee, setFinTouchee] = useState(deplacement);
  const [choisis, setChoisis] = useState<number[] | null>(null);
  const [corps, setCorps] = useState('');
  // 🔴 Arno (15/11/2026) — l'envoi aux locataires est ACTIVÉ PAR DÉFAUT (gros bouton bascule)
  const [aussiLocataires, setAussiLocataires] = useState(true);
  /** 🔴 Arno (13/11/2026, lot B) — les photos du compte rendu (déposées à l'ajout), légende obligatoire, dans l'ordre choisi. */
  const [photos, setPhotos] = useState<PhotoSaisie[]>([]);
  const [rangSansLegende, setRangSansLegende] = useState<number | null>(null);
  const photosPretes = photos.filter((x) => x.id !== null).map((x) => ({ id: x.id as number, legende: x.legende }));
  /** 🔴 Arno (15/11/2026) — le DICTAPHONE : des fichiers vocaux (INTERNES, jamais envoyés), chacun ses prises ; le curseur du texte, où
   *  s'insèrent la dictée et la transcription d'un fichier. */
  const [fichiers, setFichiers] = useState<FichierVocal[]>([]);
  /** 🔴 Arno (15/11/2026, 8e retour) — le fichier vocal ACTIF (destination des prochaines prises), mémorisé dans le brouillon */
  const [fichierActif, setFichierActif] = useState<string | null>(null);
  /* 🔴🔴 Arno (15/11/2026, 9e retour) — une photo ou une prise pas encore CONFIRMÉE par le serveur, ou vide ou perdue, bloque le récapitulatif
     et l'envoi : le refus la NOMME (le bouton n'est plus grisé sans explication). */
  const bloquantes = piecesBloquantes(photos, fichiers);
  const motifBloquantes = geste === 'compte_rendu' ? motifPiecesBloquantes(bloquantes) : null;
  /** 🔴 Arno (15/11/2026) — la présence : locataires cochés (occupations), personnes ajoutées ; au moins une pour voir le récapitulatif. */
  const [presents, setPresents] = useState<number[]>([]);
  const [ajoutees, setAjoutees] = useState<PersonneAjouteeSaisie[]>([]);
  const [refusPresence, setRefusPresence] = useState<string | null>(null);
  const presences = { occupations: presents, personnes: ajoutees.filter((x) => x.present).map((x) => ({ civilite: x.civilite, nom: x.nom, prenom: x.prenom, ...(x.note.trim() ? { note: x.note.trim() } : {}) })) };
  const presenceOk = presences.occupations.length + presences.personnes.length > 0;
  // une case cochée efface le refus
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (presenceOk) setRefusPresence(null); }, [presenceOk]);
  const [dictaphoneOccupe, setDictaphoneOccupe] = useState(false);
  const [dicteeOccupee, setDicteeOccupee] = useState(false);
  /** 🔴 Arno (15/11/2026) — une légende de photo en cours de dictée ou de transcription */
  const [legendeOccupee, setLegendeOccupee] = useState(false);
  const curseur = useRef<number | null>(null);
  const lireCurseur = useCallback((): number | null => curseur.current, []);
  const noterCurseur = useCallback((n: number | null): void => { curseur.current = n; }, []);
  const envoiVocaux = vocauxPourEnvoi(fichiers);
  const vocauxPrets = envoiVocaux.vocaux;
  const vocauxEnCours = dictaphoneOccupe || dicteeOccupee || legendeOccupee;
  /* 🔴🔴 Arno (15/11/2026, 6e retour) — LA SAUVEGARDE AUTOMATIQUE : le contenu du formulaire (les photos et prises DÉJÀ déposées, par leur
     numéro de pièce), enregistré tout seul ; restauré à la réouverture. Les photos et prises pas encore déposées vivent dans le téléphone. */
  const urlPiece = (id: number): string => `/api/admin/location/pieces-sortie?piece=${id}`;
  const contenuBrouillon: ContenuBrouillon = {
    // 🔴 (6e retour) le tiret orphelin d'une ligne restée vide n'est pas enregistré
    corps: sansTiretsOrphelins(corps), presents, ajoutees: ajoutees.map((a) => ({ cle: a.cle, civilite: a.civilite, nom: a.nom, prenom: a.prenom, present: a.present, note: a.note })),
    // 🔴🔴 (9e retour) les photos et prises PAS ENCORE confirmées sont référencées aussi (par leur clé) : à la réouverture, celle qu'on ne
    // retrouve nulle part est signalée « vide ou perdue » au lieu de disparaître ; une pièce perdue reste référencée telle quelle
    photos: photos.filter((x) => x.etat !== 'erreur').map((x) => (x.id !== null ? { id: x.id, legende: x.legende } : { cle: x.cle, legende: x.legende })),
    fichiers: fichiers.map((f) => ({ cle: f.cle, nom: f.nom, locataires: f.locataires === true,
      prises: f.prises.filter((x) => x.etat !== 'erreur').map((x) => (x.id !== null ? { id: x.id, dureeS: x.dureeS } : { cle: x.cle, dureeS: x.dureeS })) })),
    aussiLocataires, fichierActif,
  };
  const appliquerBrouillon = useCallback((c: ContenuBrouillon): void => {
    setCorps(c.corps); setPresents(c.presents.filter((x) => l.occupationIds.includes(x))); setAjoutees(c.ajoutees.map((a) => ({ ...a })));
    setAussiLocataires(c.aussiLocataires);
    setFichierActif(c.fichierActif);
    // « Effacer le brouillon » : le formulaire est vidé, pièces en attente comprises (le téléphone vient d'être vidé)
    if (c === BROUILLON_VIDE) { setPhotos([]); setFichiers([]); return; }
    /** une pièce qui attend VRAIMENT dans le téléphone (pas une pièce perdue ou refusée) */
    const enAttenteLocale = (e: PhotoSaisie['etat'] | PriseVocale['etat']): boolean => e === 'envoi' || e === 'depot' || e === 'attente';
    // les pièces DÉPOSÉES viennent du brouillon ; celles qui attendent encore dans le téléphone (remises par la file locale) gardent leur état ;
    // 🔴🔴 (9e retour) une pièce référencée qu'on ne retrouve NULLE PART revient « vide ou perdue » (rouge, bloquante) — jamais en silence
    setPhotos((xs) => {
      const out = c.photos.map((x): PhotoSaisie => {
        if (x.id !== undefined) { const deja = xs.find((y) => y.id === x.id); return { cle: deja?.cle ?? `b${x.id}`, id: x.id, apercu: deja?.apercu ?? urlPiece(x.id), legende: x.legende, etat: 'ok', motif: null }; }
        const deja = x.perdue ? undefined : xs.find((y) => y.cle === x.cle && enAttenteLocale(y.etat));
        return deja ? { ...deja, legende: deja.legende || x.legende } : { cle: x.cle ?? `p${Math.random().toString(36).slice(2)}`, id: null, apercu: '', legende: x.legende, etat: 'perdue', motif: MOTIF_PHOTO_PERDUE };
      });
      for (const y of xs) if (y.id === null && enAttenteLocale(y.etat) && !out.some((z) => z.cle === y.cle)) out.push(y);
      return out;
    });
    setFichiers((xs) => {
      const out: FichierVocal[] = c.fichiers.map((f) => {
        const deja = xs.find((y) => y.cle === f.cle);
        const prises: PriseVocale[] = f.prises.map((x): PriseVocale => {
          if (x.id !== undefined) return { cle: `b${x.id}`, id: x.id, url: urlPiece(x.id), dureeS: x.dureeS, etat: 'ok', motif: null };
          const local = x.perdue ? undefined : deja?.prises.find((y) => y.cle === x.cle && enAttenteLocale(y.etat));
          return local ?? { cle: x.cle ?? `p${Math.random().toString(36).slice(2)}`, id: null, url: '', dureeS: x.dureeS, etat: 'perdue', motif: MOTIF_PRISE_PERDUE };
        });
        for (const y of deja?.prises ?? []) if (y.id === null && enAttenteLocale(y.etat) && !prises.some((z) => z.cle === y.cle)) prises.push(y);
        return { cle: f.cle, nom: f.nom, locataires: f.locataires, transcription: null, motif: null, prises };
      });
      for (const y of xs) if (!out.some((f) => f.cle === y.cle) && y.prises.some((x) => x.id === null && enAttenteLocale(x.etat))) out.push({ ...y, prises: y.prises.filter((x) => x.id !== null || enAttenteLocale(x.etat)) });
      return out;
    });
  }, [l.occupationIds]);
  const brouillon = useBrouillonCompteRendu({ actif: geste === 'compte_rendu' && resultatInitial === undefined, occupationIds: l.occupationIds, contenu: contenuBrouillon, appliquer: appliquerBrouillon });
  const [effacerBrouillon, setEffacerBrouillon] = useState(false);
  // 🔴 (9e retour) le brouillon restauré : la page est repeinte d'elle-même (jamais blanche jusqu'au défilement, iPhone)
  useEffect(() => { if (page && brouillon.pret) repeindre(); }, [page, brouillon.pret]);
  /** 🔴 (7e retour) la place du cartouche de sauvegarde : la ligne de « ← Retour » de la page */
  const [placeCartouche, setPlaceCartouche] = useState<Element | null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (page && geste === 'compte_rendu') setPlaceCartouche(document.querySelector('[data-cartouche-sauvegarde]')); }, [page, geste]);
  // 🔴 (7e retour) le curseur lu AVANT la mise à jour (React la rejoue en développement)
  const insererTexteVocal = (t: string): void => { const p = curseur.current; setCorps((c) => { const r = insererTranscription(c, p, t); const x = appliquerTirets(r.texte, r.curseur); curseur.current = x.curseur; return x.texte; }); };
  /** Le refus des photos (légende manquante) : dit, la photo concernée en rouge ; rien ne part. */
  const verifierPhotos = (): boolean => {
    if (geste !== 'compte_rendu') return true;
    if (motifBloquantes !== null) {
      setRefus(motifBloquantes);
      setTimeout(() => { try { document.querySelector('[data-photo-etat="perdue"],[data-photo-etat="erreur"],[data-prise-etat="perdue"],[data-prise-etat="erreur"],[data-photo-etat="attente"],[data-prise-etat="attente"],[data-prise-etat="depot"],[data-photo-etat="envoi"]')?.scrollIntoView({ block: 'center' }); } catch { /* rien */ } }, 0);
      return false;
    }
    const echec = photos.findIndex((x) => x.etat === 'erreur');
    if (echec >= 0) { setRangSansLegende(echec); setRefus(`La photo ${echec + 1} n’a pas pu être déposée : retirez-la (ou ajoutez-la de nouveau).`); return false; }
    const r = refusPhotos(photos);
    setRangSansLegende(r === null ? null : r.rang);
    if (r !== null) {
      setRefus(r.motif);
      // la photo concernée, à l'écran (au-dessus des boutons collés en bas), le curseur dans sa légende
      setTimeout(() => { try { const li = document.querySelector(`[data-photo="${r.rang + 1}"]`); li?.scrollIntoView({ block: 'center' }); (li?.querySelector('[data-photo-legende]') as HTMLInputElement | null)?.focus(); } catch { /* rien */ } }, 0);
      return false;
    }
    return true;
  };
  const [texteRefus, setTexteRefus] = useState<string | null>(null);
  const collegues = useLecture<Collegue[]>(avecCollegues ? 'previsiteCollegues=1' : null);
  const propose = useLecture<{ texte: string; objet: string; sansEmail: string[] }>(geste === 'refus' ? `previsiteRefus=${l.occupationIds.join(',')}` : null);
  // 🔴 Arno (14/11/2026, 473) — un préavis de TEST ne se confie qu'à vous (en tête de liste) : jamais un collègue (le serveur le refuse aussi).
  const liste = useMemo(() => { const x = collegues.etat.etat === 'ok' && Array.isArray(collegues.etat.data) ? collegues.etat.data : []; return l.test ? x.slice(0, 1) : x; }, [collegues.etat, l.test]);
  // Par défaut : le compte connecté (en tête de liste) — sauf pour réaffecter, où l'on choisit.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (choisis === null && liste.length > 0) setChoisis(geste === 'rdv' ? [liste[0].id] : []); }, [choisis, liste, geste]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (texteRefus === null && propose.etat.etat === 'ok') setTexteRefus(propose.etat.data.texte); }, [propose.etat, texteRefus]);
  useEffect(() => {
    const clavier = (e: KeyboardEvent): void => { if (e.key === 'Escape' && !envoi) onFermer(etape.etape === 'resultat'); };
    window.addEventListener('keydown', clavier);
    return () => window.removeEventListener('keydown', clavier);
  }, [envoi, etape, onFermer]);

  const dest = choisis ?? [];
  const verdict = avecDate ? verifierRdvPrevisite({ jour, debut, fin, destinataires: deplacement ? [1] : dest }, [{ recuLe: l.recuLe, dateMax: l.dateMax }]) : null;
  // 🔴 Arno (11/11/2026) — un RENDEZ-VOUS (programmer, déplacer, réaffecter) demande l'e-mail d'au moins un locataire ; le refus et le compte
  // rendu n'y sont pas soumis. Relu au retour sur la fenêtre.
  const emails = useEmailsLocataires(l, geste === 'rdv' || geste === 'deplacer' || geste === 'reaffecter');
  const saisieOk = !emails.bloque && (avecDate ? verdict?.ok === true : geste === 'reaffecter' ? dest.length > 0 : geste === 'compte_rendu' ? corps.trim() !== '' : (texteRefus ?? '').trim() !== '');
  const corpsCommun = { occupationIds: l.occupationIds };
  const rdvActuel = p.rdv;

  const voirRecap = async (rt: Retouches = {}): Promise<void> => {
    if (geste === 'compte_rendu' && !presenceOk) {
      setRefusPresence(MOTIF_PRESENCE);
      setTimeout(() => { try { document.querySelector('[data-bloc-presence]')?.scrollIntoView({ block: 'start' }); } catch { /* rien */ } }, 0);
      return;
    }
    if (!verifierPhotos()) return;
    setEnvoi(true); setRefus(null);
    const r = await envoyer(geste === 'compte_rendu' ? { action: 'apercu-compte-rendu-previsite', ...corpsCommun, corps: sansTiretsOrphelins(corps), aussiLocataires, photos: photosPretes, presences,
      ...(envoiVocaux.fichiersVocaux.some((f) => f.locataires) ? { vocaux: vocauxPrets, fichiersVocaux: envoiVocaux.fichiersVocaux } : {}) }
      : geste === 'refus' ? { action: 'apercu-refus-previsite', ...corpsCommun, texte: texteRefus ?? '' }
        : geste === 'reaffecter' && rdvActuel ? { action: 'apercu-previsite', ...corpsCommun, jour: rdvActuel.jour, debut: rdvActuel.heure, fin: fin0 || rdvActuel.heure, destinataires: dest }
          : { action: 'apercu-previsite', ...corpsCommun, jour, debut, fin, destinataires: dest, deplacer: deplacement, retouches: rt }, { propre: true });
    setEnvoi(false);
    // Un texte modifié refusé par le serveur : le récapitulatif d'avant reste, la raison est dite (la retouche n'est pas gardée).
    if (r.motif !== null) { setRefus(r.motif); return; }
    setRetouches(rt);
    const d = (r.data ?? {}) as { mails?: MailApercu[]; sansEmail?: string[]; phrase?: unknown; presence?: unknown; notesInternes?: string[] };
    // Réaffecter : seules les invitations des collègues partent (les locataires ne sont pas prévenus d'un changement de collègue).
    const mails = (d.mails ?? []).filter((m) => geste !== 'reaffecter' || m.sorte === 'previsite_invitation');
    const sansPhrase = geste === 'compte_rendu' ? refusSansPhrase(d.phrase, mails, d.presence) : null;
    if (sansPhrase !== null) { setRefus(sansPhrase); return; }
    setEtape({ etape: 'recap', mails, sansEmail: geste === 'reaffecter' ? [] : d.sansEmail ?? [], ...(Array.isArray(d.notesInternes) ? { notesInternes: d.notesInternes } : {}) });
  };

  const confirmer = async (): Promise<void> => {
    if (!verifierPhotos()) return;
    setEnvoi(true); setRefus(null);
    const action = geste === 'rdv' ? 'programmer-previsite' : geste === 'deplacer' ? 'deplacer-previsite' : geste === 'reaffecter' ? 'reaffecter-previsite'
      : geste === 'compte_rendu' ? 'compte-rendu-previsite' : 'refus-previsite';
    const r = await envoyer({ action, ...corpsCommun, jour, debut, fin, destinataires: dest, corps: sansTiretsOrphelins(corps), aussiLocataires, texte: texteRefus ?? '',
      ...(geste === 'compte_rendu' ? { photos: photosPretes, vocaux: vocauxPrets, fichiersVocaux: envoiVocaux.fichiersVocaux, presences } : {}),
      ...(Object.keys(retouches).length > 0 ? { retouches } : {}) }, { propre: true });
    setEnvoi(false);
    if (r.motif !== null) { setRefus(r.motif); return; }
    const d = (r.data ?? {}) as { rdv?: { jour: string; heure: string; dureeMinutes: number }; ancien?: { jour: string; heure: string; dureeMinutes: number } | null;
      collegues?: { destinataire: string; etat: string }[]; locataires?: MailParti[]; envois?: MailParti[]; sansEmail?: string[]; statut?: StatutPrevisite | null; agenda?: string;
      tacheAnnulee?: number | null };
    const mails: MailParti[] = [...(d.collegues ?? []).map(mailCollegue), ...(d.locataires ?? []), ...(d.envois ?? [])];
    const lignes: [string, string][] = [[l.locataires.length > 1 ? 'Locataires' : 'Locataire', l.locataires.map((x) => x.nom).join(', ')], ['Le logement', l.adresse ?? `Bien ${l.lotId}`]];
    if (d.rdv) lignes.push(['Rendez-vous', `le ${creneauFr(d.rdv)}`]);
    if (d.ancien) lignes.push(['Ancien rendez-vous', `le ${creneauFr(d.ancien)}`]);
    if (d.statut !== undefined) lignes.push(['Statut', d.statut === null ? 'inchangé : le mail n’est pas parti' : LIBELLE_STATUT_PREVISITE[d.statut]]);
    for (const n of d.sansEmail ?? []) lignes.push(['Sans adresse e-mail', `${n} n’a pas reçu le mail`]);
    if (typeof d.tacheAnnulee === 'number') lignes.push(['Rendez-vous', 'annulé — la tâche des collègues est annulée']);
    if (d.agenda) lignes.push(['Agenda', d.agenda]);
    const motif = mails.length === 0 ? 'Aucun mail n’est parti pour cette opération.' : null;
    // 🔴 Arno (15/11/2026) — le compte rendu est parti : le brouillon n'a plus lieu d'être (le serveur l'a marqué « envoyé ») ; le téléphone est vidé
    if (geste === 'compte_rendu' && d.statut === 'effectuee') await brouillon.terminer();
    // 🔴 Arno (15/11/2026) — la page du compte rendu : retour à la Location, qui affiche ce résultat (la fenêtre habituelle)
    if (page) { noterResultatCompteRendu(l.occupationIds, { mails, lignes, motif }); onFermer(true); return; }
    setEtape({ etape: 'resultat', mails, lignes, motif });
  };

  let contenu: ReactNode;
  if (etape.etape === 'saisie') {
    contenu = <>
      {geste === 'compte_rendu' ? <>
        {/* 🔴 Arno (15/11/2026) — le titre, et sur téléphone le petit bouton clair / sombre à droite ; sous l'adresse, chaque locataire et sa date d'entrée */}
        <div className="pvv-titre-ligne"><h2 id={titreId} className="mis-titre" data-titre-previsite>{TITRES[geste][0]}</h2><BoutonTheme /></div>
        {/* 🔴 Arno (15/11/2026, 7e retour) — l'adresse du bien en GRAND et en gras, juste sous le titre : on vérifie d'un coup d'œil le logement */}
        <p className="pvv-adresse-cr" data-cr-adresse>{l.adresse ?? `Bien ${l.lotId}`}</p>
        {/* 🔴 (9e retour) la restauration du brouillon tarde : c'est dit, le formulaire reste visible */}
        {geste === 'compte_rendu' && !brouillon.pret && <p className="loc-muet pvv-restauration" role="status" data-brouillon-chargement>Restauration du brouillon…</p>}
      </> : <>
        <h2 id={titreId} className="mis-titre" data-titre-previsite>{TITRES[geste][0]}</h2>
        <p className="loc-muet pss-rien">{l.locataires.map((x) => x.nom).join(', ')} — {l.adresse ?? `Bien ${l.lotId}`}</p>
      </>}
      {avecDate && (
        // 🔴 Arno (11/11/2026, présentation) — les trois champs sur UNE ligne, même hauteur, même largeur ; libellés courts sur une ligne,
        // l'astérisque collé (espace insécable) ; empilés dans le même ordre sur écran étroit. Une grille PROPRE à la pré-visite (la grille de
        // l'état des lieux de sortie, partagée, ne change pas).
        <div className="pvv-grille" data-previsite-champs>
          <label className="pvs-champ"><span className="pvs-libelle">{'Date\u00a0*'}</span>
            <input type="date" value={jour} min={l.recuLe} max={ajouterMois(l.dateMax, EDL_MOIS_APRES_FIN)} onChange={(e) => { setJour(e.target.value); setRefus(null); }} data-previsite-jour /></label>
          <label className="pvs-champ"><span className="pvs-libelle">{'Début\u00a0*'}</span>
            <input type="time" value={debut} onChange={(e) => { setDebut(e.target.value); if (!finTouchee) setFin(heureFinProposee(e.target.value)); setRefus(null); }} data-previsite-debut /></label>
          <label className="pvs-champ"><span className="pvs-libelle">{'Fin\u00a0*'}</span>
            <input type="time" value={fin} onChange={(e) => { setFin(e.target.value); setFinTouchee(true); setRefus(null); }} data-previsite-fin /></label>
        </div>
      )}
      {avecDate && l.test && (
        <div className="loc-boutons" style={{ justifyContent: 'flex-start' }}>
          <button type="button" className="svv-btn svv-btn-outline gst-btn pvv-petit" data-previsite-deux-minutes
            onClick={() => { const r = rdvDansDeuxMinutes(); setJour(r.jour); setDebut(r.debut); setFin(r.fin); setFinTouchee(true); setRefus(null); }}>Dans 2 minutes</button>
          <span className="loc-muet" data-previsite-test-note>Préavis de test : l’invitation de début de pré-visite part à l’heure de début, à vous seul.</span>
        </div>
      )}
      {deplacement && rdvActuel && <p className="mis-note pss-note-neutre" data-previsite-ancien>Rendez-vous actuel : le {creneauFr(rdvActuel)}. Chaque collègue recevra la nouvelle date à valider (statuts remis à zéro) ; les locataires, un mail de modification.</p>}
      {avecCollegues && (
        <fieldset className="pvv-choix" data-previsite-destinataires>
          <legend className="pvs-libelle">Destinataires (collègues de l’agence) *</legend>
          {collegues.etat.etat !== 'ok' ? <EtatLecture etat={collegues.etat} /> : liste.length === 0
            ? <p className="loc-muet">Aucun collègue n’a accès à Gestion ou Location avec une adresse de notre Workspace.</p>
            : liste.map((c) => (
              <label key={c.id} className="pvv-case">
                <input type="checkbox" checked={dest.includes(c.id)} onChange={(e) => setChoisis(e.target.checked ? [...dest, c.id] : dest.filter((x) => x !== c.id))} data-destinataire={c.id} />
                <span>{c.libelle}</span>
              </label>
            ))}
        </fieldset>
      )}
      {geste === 'compte_rendu' && rdvActuel && <>
        <p className="pvv-objet" data-objet-ligne><span className="pvs-libelle">Objet :</span> <span data-objet-compte-rendu>{objetCompteRendu(rdvActuel)}</span></p>
        {/* 🔴 Arno (15/11/2026) — TROIS BLOCS, dans cet ordre : TEXTE (dictée maintenue, clavier), PHOTOS, DICTAPHONE (fichiers vocaux internes) */}
        <BlocPresence locataires={l.locataires} presents={presents} setPresents={setPresents} ajoutees={ajoutees} setAjoutees={setAjoutees} erreur={refusPresence} dateFr={dateFrPreavis} />
        <BlocTexte corps={corps} setCorps={setCorps} lireCurseur={lireCurseur} noterCurseur={noterCurseur} occupationIds={l.occupationIds} onOccupe={setDicteeOccupee} />
        <BlocPhotos photos={photos} onChange={(f) => { setPhotos(f); setRangSansLegende(null); setRefus(null); }} occupationIds={l.occupationIds} rangSansLegende={rangSansLegende} onOccupe={setLegendeOccupee} />
        <BlocDictaphone fichiers={fichiers} setFichiers={setFichiers} occupationIds={l.occupationIds} onTranscrit={insererTexteVocal} onOccupe={setDictaphoneOccupe}
          courant={fichierActif} setCourant={setFichierActif} />
        <BoutonEnvoiLocataires actif={aussiLocataires} onBasculer={() => setAussiLocataires((v) => !v)} occupationIds={l.occupationIds}
          nomsConnus={l.locataires.map((x) => x.nom)} />
      </>}
      {geste === 'refus' && (propose.etat.etat !== 'ok' ? <EtatLecture etat={propose.etat} /> : <>
        <p className="pvv-objet" data-objet-ligne><span className="pvs-libelle">Objet :</span> <span>{propose.etat.data.objet}</span></p>
        <label className="pvs-champ"><span className="pvs-libelle">Texte du mail (modifiable) *</span>
          <textarea value={texteRefus ?? ''} onChange={(e) => setTexteRefus(e.target.value)} rows={14} data-texte-refus /></label>
        <p className="loc-muet" data-refus-confidentialite>Chaque locataire reçoit SON mail (seul destinataire, sans copie visible) : « [nom du locataire] » y est remplacé par son nom. Les collaborateurs ayant accès à Gestion et/ou Location reçoivent une copie interne séparée.</p>
        {p.statut === 'programmee' && p.rdv && <p className="mis-note pss-note-neutre" data-refus-annule-rdv>Une pré-visite est programmée le {creneauFr(p.rdv)} : à l’envoi, elle sera annulée (tâche des collègues annulée) et chaque collègue destinataire recevra un mail d’annulation.</p>}
      </>)}
      <BlocageEmailLocataires e={emails} />
      {verdict !== null && !verdict.ok && (jour !== '' || debut !== '') && <p className="cp-refus" role="status" data-previsite-message>{verdict.motif}</p>}
      {refus !== null && <p className="cev-alerte" role="alert" data-previsite-refus>{refus}</p>}
      {/* 🔴🔴 (9e retour) tant qu'une pièce n'est pas sauvegardée (ou est perdue), c'est dit en permanence au-dessus des boutons */}
      {motifBloquantes !== null && refus !== motifBloquantes && <p className={bloquantes.perdues.length > 0 ? 'cev-alerte' : 'loc-muet'} role="status" data-blocage-envoi={bloquantes.perdues.length > 0 ? 'perdue' : 'en_cours'}>{motifBloquantes}</p>}
      {/* 🔴 Arno (15/11/2026) — « Annuler » garde le brouillon ; « Effacer le brouillon » (confirmé) le supprime */}
      {geste === 'compte_rendu' && (
        <div className="pvv-effacer-ligne">
          <button type="button" className="pvv-choix pvv-effacer-brouillon" onClick={() => setEffacerBrouillon(true)} disabled={envoi} data-effacer-brouillon>Effacer le brouillon</button>
          {effacerBrouillon && (
            <Confirmation question="Effacer le brouillon ? Le texte, les présences, les photos et les vocaux saisis seront retirés du formulaire." action="Effacer"
              onGarder={() => setEffacerBrouillon(false)} onConfirmer={() => { setEffacerBrouillon(false); void brouillon.effacer(); }}
              attributs={{ 'data-effacer-brouillon-confirmer': '' }} attributsOui={{ 'data-effacer-brouillon-oui': '' }} attributsNon={{ 'data-effacer-brouillon-non': '' }} />)}
        </div>)}
      <div className="mis-actions">
        <button type="button" className="svv-btn svv-btn-outline gst-btn mis-action" onClick={() => onFermer(false)} disabled={envoi} data-annuler-previsite>Annuler</button>
        <button type="button" className="svv-btn svv-btn-primary gst-btn mis-action" onClick={() => { void voirRecap({}); }} disabled={envoi || !saisieOk || vocauxEnCours} data-recap-previsite>
          {envoi ? 'Préparation…' : 'Voir le récapitulatif'}</button>
      </div>
    </>;
  } else if (etape.etape === 'recap') {
    contenu = <>
      <h2 id={titreId} className="mis-titre" data-titre-previsite>Récapitulatif — {TITRES[geste][0]}</h2>
      <p className="loc-muet pss-rien" data-rien-enregistre>Rien n’est encore enregistré ni envoyé : vérifiez, puis « Confirmer et envoyer ».</p>
      {etape.mails.length === 0 ? <p className="mis-note pss-note-neutre">Aucun mail ne partira.</p> : (() => {
        // 🔴 Arno (15/11/2026) — chaque carte dit sa FAMILLE (étiquette et couleur) ; 🔴 (9e retour) au compte rendu, les LOCATAIRES d'abord,
        // puis l'interne (comme « Voir le compte rendu ») ; les autres gestes gardent l'interne d'abord ; le rappel des comptes au-dessus, dans le même ordre. Ce qui ne part QU'en interne (notes de
        // présence, vocaux internes) est montré dans la carte interne.
        const ordre = geste === 'compte_rendu' ? ORDRE_LOCATAIRES_DABORD : undefined;
        const cartes = trierParFamille(etape.mails.map((m) => ({ ...m, famille: familleDuMail(m) })), ordre);
        const vocauxInternes = geste === 'compte_rendu' ? envoiVocaux.fichiersVocaux.filter((f) => !(f.locataires && aussiLocataires)) : [];
        return <>
          <p className="pss-sous-titre">Les mails qui partiront :</p>
          <RappelFamilles mails={cartes} ordre={ordre} />
          <ul className="cev-mails" data-mails-prevus>{cartes.map((m, i) => (
            <CarteMailFamille key={`${i}-${m.sorte}`} famille={m.famille} sorte={m.sorte} titre={libelleMail(m)} objet={m.objet} a={m.a} cc={m.cc}
              destinataire={m.destinataire} recette={m.recette}
              pieces={m.pieces ?? (m.piece ? m.piece.split(', ') : geste === 'compte_rendu' ? [] : null)}>
              {geste === 'compte_rendu' && m.famille === 'interne' && (etape.notesInternes ?? []).length > 0 && (
                <div className="mfa-bloc" data-notes-internes-carte><p className="mfa-bloc-titre">Notes de présence (internes)</p>
                  <ul className="mfa-liste">{(etape.notesInternes ?? []).map((n) => <li key={n}>{n}</li>)}</ul></div>)}
              {geste === 'compte_rendu' && m.famille === 'interne' && vocauxInternes.length > 0 && (
                <div className="mfa-bloc" data-vocaux-internes-carte><p className="mfa-bloc-titre">Vocaux internes — rangés avec le compte rendu, jamais joints</p>
                  <ul className="mfa-liste">{vocauxInternes.map((f, k) => <li key={`${k}-${f.nom}`}>{f.nom} — {etatVocalLocataires(false)}</li>)}</ul></div>)}
              <TexteDuMail key={m.texte} texte={m.texte} ouvert />
              {/* 🔴 Arno (10/11/2026) — « Modifier le texte » sous la confirmation / la modification aux locataires ; « Texte modifié ». */}
              {m.edition !== undefined && (
                <ModifierTexteMail edition={m.edition} retouche={retouches[m.edition.cle]} desactive={envoi}
                  plusieurs={etape.mails.filter((x) => x.edition?.cle === m.edition?.cle).length > 1}
                  onAppliquer={(r: Retouche | undefined) => {
                    const cle = m.edition!.cle;
                    const suivantes: Retouches = { ...retouches };
                    if (r === undefined) delete suivantes[cle]; else suivantes[cle] = r;
                    void voirRecap(suivantes);
                  }} />
              )}
            </CarteMailFamille>))}</ul>
        </>;
      })()}
      {etape.sansEmail.map((n) => <p key={n} className="mis-note" data-sans-email>⚠ {n} : pas d’adresse e-mail, il ne recevra pas ce mail</p>)}
      {/* 🔴 Arno (15/11/2026) — une ligne TRÈS visible par vocal : envoyé aux locataires (vert) ou non envoyé, interne (rouge) */}
      {/* 🔴 Arno (15/11/2026, 6e retour) — chaque ligne de vocal a son bouton « Écouter » (prises enchaînées) : vérifier l'affectation avant de confirmer */}
      {geste === 'compte_rendu' && <LignesVocauxRecap fichiers={fichiers} aussiLocataires={aussiLocataires} />}
      <BlocageEmailLocataires e={emails} />
      {refus !== null && <p className="cev-alerte" role="alert" data-previsite-refus>{refus}</p>}
      <div className="mis-actions">
        <button type="button" className="svv-btn svv-btn-outline gst-btn mis-action" onClick={() => setEtape({ etape: 'saisie' })} disabled={envoi} data-revenir-previsite>Revenir</button>
        <button type="button" className="svv-btn svv-btn-primary gst-btn mis-action" onClick={() => { void confirmer(); }} disabled={envoi || emails.bloque} data-confirmer-previsite>
          {envoi ? 'Envoi…' : 'Confirmer et envoyer'}</button>
      </div>
    </>;
  } else {
    contenu = <>
      <h2 id={titreId} className="mis-titre" data-titre-previsite>✓ {TITRES[geste][1]}</h2>
      <dl className="mis-resume" data-resume>{etape.lignes.map(([mot, valeur]) => <div key={mot}><dt>{mot}</dt><dd>{valeur}</dd></div>)}</dl>
      <BlocsEnvois issue={{ informer: false, mails: etape.mails, motifGlobal: etape.motif }} />
      <div className="mis-actions">
        <button type="button" className="svv-btn svv-btn-primary gst-btn mis-action" onClick={() => onFermer(true)} data-fermer-previsite>Fermer</button>
      </div>
    </>;
  }
  const echec = etape.etape === 'resultat' && (etape.motif !== null || etape.mails.some((m) => !m.envoye));
  // 🔴 Arno (15/11/2026) — le formulaire du compte rendu (saisie) : fond opaque, boutons en fin de formulaire (classes propres : les autres fenêtres ne changent pas)
  const saisieCr = geste === 'compte_rendu' && etape.etape === 'saisie';
  const styles = CSS_PARCOURS + CSS_MODALE_ISSUE + CSS_CONFIRMATION_ENVOIS + CSS_PREVISITE + CSS_TEXTE_MODIFIABLE + CSS_COMPTE_RENDU_SAISIE + CSS_FAMILLES_MAILS;
  if (page) {
    // 🔴 Arno (15/11/2026) — EN PAGE : ni voile ni fenêtre, rien dessous ; la hauteur suit la ZONE VISIBLE (clavier iOS ouvert : la marge du
    // bas vaut la hauteur du clavier, le bas du formulaire reste atteignable) ; fond de la page jusqu'au bord inférieur.
    const clavier = zone !== null && typeof window !== 'undefined' ? Math.max(0, window.innerHeight - zone.height - zone.top) : 0;
    return (
      <div className="pvv-page-cr" style={{ ['--pvv-clavier' as string]: `${clavier}px` }} data-clavier-ios={clavier > 0 ? 'ouvert' : 'ferme'}>
        <style>{styles + CSS_PAGE_COMPTE_RENDU + CSS_CARTOUCHE_SAUVEGARDE}</style>
        {placeCartouche !== null && geste === 'compte_rendu' && createPortal(<CartoucheSauvegarde b={brouillon} />, placeCartouche)}
        <div className={`pss-boite pvv-boite-cr pvv-boite-page${etape.etape === 'recap' ? ' pss-boite-recap' : ''}`} role="region"
          aria-labelledby={titreId} data-fenetre-previsite={etape.etape} data-geste-previsite={geste}>
          {contenu}
        </div>
      </div>
    );
  }
  const boite = (
    <div className={`mis-voile pvv-voile${saisieCr ? ' pvv-voile-cr' : ''}`} style={zone && !saisieCr ? { top: zone.top, bottom: 'auto', height: zone.height } : undefined}
      data-zone-visible={zone && !saisieCr ? 'oui' : undefined}>
      <style>{styles}</style>
      <div className={`mis-boite pss-boite ${etape.etape === 'resultat' ? (echec ? 'mis-boite--attention' : 'mis-boite--succes') : 'pss-boite-recap'}${saisieCr ? ' pvv-boite-cr' : ''}`} role="dialog" aria-modal="true"
        aria-labelledby={titreId} data-fenetre-previsite={etape.etape} data-geste-previsite={geste}>
        {contenu}
      </div>
    </div>
  );
  return typeof document === 'undefined' ? boite : createPortal(boite, document.querySelector('.svv-adm-root') ?? document.body);
}

/**
 * 🔴 Arno (13/11/2026) — LE COMPTE RENDU DE PRÉ-VISITE, EN LECTURE : le texte tel qu'enregistré, qui l'a saisi et quand, les pièces jointes, et
 * l'envoi par mail (chaque destinataire : nom, famille, date et heure, état). Rien n'est modifié en l'ouvrant ; aucune adresse de client.
 * 🔴🔴 Arno (15/11/2026, 9e retour) — LA MÊME FENÊTRE, centrée, ouverte depuis la frise (« Compte rendu pré-visite ») :
 *  · envoyé : objet, adresse, présences et notes internes, texte, photos et légendes (vignettes qui s'AGRANDISSENT), chaque vocal (titre,
 *    statut, lecteur), les envois par famille (locataires en vert d'abord, interne en gris), dates et états ;
 *  · pas encore envoyé : le BROUILLON tel qu'enregistré (« Brouillon — non envoyé, dernier enregistrement à HHhMM »), en lecture seule, et
 *    « Continuer la saisie », qui ouvre la page du formulaire.
 * Défilement de la page bloqué, page de fond masquée et inerte au téléphone (fenêtre modale, comme les autres).
 */
function FenetreCompteRendu({ l, p, mode, onFermer }: { l: LignePreavisAccueil; p: PrevisiteAffiche; mode: 'envoye' | 'brouillon'; onFermer: () => void }) {
  useVerrouDefilement();
  const titreId = useId();
  const lu = useLecture<CompteRenduAffiche>(mode === 'envoye' ? `previsiteCompteRendu=${l.occupationIds.join(',')}` : null);
  const luB = useLecture<{ brouillon: ContenuBrouillon | null; enregistreLe: string | null }>(mode === 'brouillon' ? `previsiteBrouillon=${l.occupationIds.join(',')}` : null);
  const [agrandie, setAgrandie] = useState<{ url: string; legende: string } | null>(null);
  const zone = useZoneVisible();
  useEffect(() => {
    const clavier = (e: KeyboardEvent): void => { if (e.key === 'Escape') { if (agrandie !== null) setAgrandie(null); else onFermer(); } };
    window.addEventListener('keydown', clavier);
    return () => window.removeEventListener('keydown', clavier);
  }, [onFermer, agrandie]);
  const cr = mode === 'envoye' && lu.etat.etat === 'ok' ? lu.etat.data : null;
  const nomOccupation = (id: number): string => l.locataires.find((x) => x.occupationId === id)?.nom ?? `Locataire ${id}`;
  const urlPiece = (id: number): string => `/api/admin/location/pieces-sortie?piece=${id}`;
  const vignettes = (photos: { id: number | null; legende: string }[]) => photos.length === 0 ? null : (
    <div className="pvv-cr-bloc" data-cr-photos><p className="pss-sous-titre">Photos</p>
      <ol className="pvv-cr-photos">{photos.map((x, i) => (
        <li key={`${i}-${x.id ?? 'x'}`} data-cr-photo={i + 1}>
          {x.id === null ? <span className="pvv-vignette pvv-vignette--vide" data-cr-photo-attente>Pas encore déposée</span>
            : <button type="button" className="pvv-cr-vignette" onClick={() => setAgrandie({ url: urlPiece(x.id as number), legende: lignePhoto(i, x.legende) })}
              aria-label={`Agrandir — ${lignePhoto(i, x.legende)}`} data-cr-agrandir={i + 1}>
              <img className="pvv-vignette" src={urlPiece(x.id)} alt={lignePhoto(i, x.legende)} loading="lazy" /></button>}
          <span className="pvv-cr-legende" data-cr-legende>{lignePhoto(i, x.legende)}</span>
        </li>))}</ol>
    </div>);
  const presencesBloc = (pr: { occupations: number[]; personnes: { civilite: string; nom: string; prenom: string; note: string }[] } | null | undefined) => (pr == null ? null : (
    <div className="pvv-cr-bloc" data-cr-presences><p className="pss-sous-titre">Présences</p>
      {pr.occupations.length + pr.personnes.length === 0 ? <p className="loc-muet">Personne n’est coché présent.</p> : (
        <ul className="pvv-cr-liste">
          {pr.occupations.map((id) => <li key={`o${id}`} data-cr-present="locataire">{nomOccupation(id)} <span className="loc-muet">(locataire)</span></li>)}
          {pr.personnes.map((x, i) => (
            <li key={`p${i}`} data-cr-present="personne">{x.civilite} {[x.prenom, x.nom].filter(Boolean).join(' ')}
              {x.note.trim() !== '' && <span className="pvv-cr-note" data-cr-note-interne> — note interne : {x.note}</span>}</li>))}
        </ul>)}
    </div>));
  let corps: ReactNode;
  if (mode === 'brouillon') {
    const b = luB.etat.etat === 'ok' ? luB.etat.data : null;
    const c = b?.brouillon ?? null;
    corps = <>
      <p className="pvv-objet" data-objet-ligne><span className="pvs-libelle">Objet :</span> <span data-cr-objet>{p.rdv ? objetCompteRendu(p.rdv) : '—'}</span></p>
      {luB.etat.etat !== 'ok' ? <EtatLecture etat={luB.etat} /> : c === null ? <p className="mis-note pss-note-neutre" data-cr-brouillon="aucun">Aucune saisie enregistrée pour l’instant.</p> : <>
        <p className="pvv-cr-brouillon" role="status" data-cr-brouillon="oui">Brouillon — non envoyé{b?.enregistreLe ? `, dernier enregistrement à ${heureBrouillon(b.enregistreLe)}` : ''}</p>
        {presencesBloc({ occupations: c.presents, personnes: c.ajoutees.filter((x) => x.present) })}
        <div className="pvv-cr-bloc"><p className="pss-sous-titre">Texte</p>
          {c.corps.trim() === '' ? <p className="loc-muet" data-cr-texte>Aucun texte pour l’instant.</p> : <pre className="pvv-cr-texte" data-cr-texte>{c.corps}</pre>}</div>
        {vignettes(c.photos.map((x) => ({ id: x.id ?? null, legende: x.legende })))}
        {c.fichiers.some((f) => f.prises.length > 0) && (
          <div className="pvv-cr-bloc" data-cr-vocaux><p className="pss-sous-titre">Vocaux</p>
            <LectureFichiersVocaux fichiers={c.fichiers.filter((f) => f.prises.length > 0).map((f, i) => ({ nom: f.nom.trim() || `Vocal ${i + 1}`, locataires: f.locataires && c.aussiLocataires,
              prises: f.prises.flatMap((x, k) => (x.id !== undefined ? [{ id: x.id, nom: `Prise ${k + 1}`, dureeS: x.dureeS }] : [])) }))} url={urlPiece} />
          </div>)}
        <div className="pvv-cr-bloc" data-cr-envois><p className="pss-sous-titre">Envoi par mail</p>
          <p className="mis-note pss-note-neutre" data-cr-pas-envoye>Rien n’est encore envoyé.</p></div>
      </>}
    </>;
  } else {
    corps = cr === null ? <EtatLecture etat={lu.etat} /> : cr.texte === null ? <p className="mis-note pss-note-neutre" data-cr-aucun>{AUCUN_CR}</p> : <>
      <p className="pvv-cr-qui" data-cr-saisi>Saisi{cr.saisiPar ? ` par ${cr.saisiPar}` : ''}{cr.saisiLe ? ` ${quandFr(cr.saisiLe)}` : ''}</p>
      {cr.objet && <p className="pvv-objet" data-objet-ligne><span className="pvs-libelle">Objet :</span> <span data-cr-objet>{cr.objet}</span></p>}
      {presencesBloc(cr.presences)}
      <pre className="pvv-cr-texte" data-cr-texte>{texteSansPhotos(cr.texte)}</pre>
      {/* 🔴 Arno (13/11/2026, lot B) — structuré : le texte, puis « Photos », chaque photo numérotée, sa légende juste en dessous */}
      {(() => { const legendes = legendesDuTexte(cr.texte); return vignettes(cr.pieces.slice(0, legendes.length).map((x, i) => ({ id: x.id, legende: legendes[i] }))); })()}
      {cr.pieces.length > legendesDuTexte(cr.texte).length && (
        <div className="pvv-cr-bloc" data-cr-pieces><p className="pss-sous-titre">Pièces jointes</p>
          <ul className="pvv-cr-liste">{cr.pieces.slice(legendesDuTexte(cr.texte).length).map((x) => (
            <li key={x.id}><a href={urlPiece(x.id)} target="_blank" rel="noopener noreferrer" data-cr-piece={x.id}>{x.nom}</a>
              {' '}<span className="loc-muet">({(x.taille / (1024 * 1024)).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo)</span></li>))}</ul>
        </div>)}
      {(cr.vocaux ?? []).length > 0 && (
        <div className="pvv-cr-bloc" data-cr-vocaux><p className="pss-sous-titre">Vocaux</p>
          {/* 🔴 Arno (15/11/2026) — les fichiers vocaux du dictaphone, leur statut, leurs prises, réécoute enchaînée ; LECTURE SEULE ;
              🔴 (accord d'Arno, 15/11/2026) l'intitulé : « Vocaux » tout court — chaque vocal dit lui-même s'il est parti aux locataires */}
          <LectureFichiersVocaux fichiers={(cr.fichiersVocaux ?? []).length > 0 ? cr.fichiersVocaux ?? [] : (cr.vocaux ?? []).map((v, i) => ({ nom: `Vocal ${i + 1}`, prises: [v] }))}
            url={urlPiece} />
        </div>)}
      <div className="pvv-cr-bloc" data-cr-envois><p className="pss-sous-titre">Envoi par mail</p>
        {cr.aucunEnvoi && <p className="mis-note pss-note-neutre" data-cr-aucun-envoi>{AUCUN_ENVOI_CR}</p>}
        {cr.destinataires.length > 0 && (
          // 🔴 Arno (15/11/2026) — même mise en forme que le récapitulatif : l'ÉTIQUETTE de famille très visible, la barre de la couleur de la
          // famille ; les LOCATAIRES d'abord, puis l'interne (ordre rendu par le serveur)
          <ul className="pvv-cr-liste">{cr.destinataires.map((d, i) => (
            <li key={`${i}-${d.nom}`} className={`pvv-cr-dest pvv-cr-dest--${d.famille}`} data-cr-destinataire={d.famille} data-cr-etat={d.etat}>
              <span className="pvv-cr-famille" data-etiquette-famille={d.famille} title={LIBELLE_FAMILLE_CR[d.famille]}>{ETIQUETTE_ENVOI_CR[d.famille]}</span>
              <strong className="pvv-cr-nom">{d.nom}</strong>
              <span className="pvv-cr-quand">{d.quand ? quandFr(d.quand) : '—'}</span>
              <span className={`pvv-cr-etat pvv-cr-etat--${d.etat}`}>{LIBELLE_ETAT_CR[d.etat]}{d.motif ? ` (${d.motif})` : ''}</span>
            </li>))}</ul>)}
      </div>
    </>;
  }
  /* 🔴🔴 Arno (15/11/2026, 11e retour) — au téléphone : PLEIN ÉCRAN, fond opaque jusqu'en bas, hauteur de la ZONE VISIBLE, rien de la
     Location derrière, UN SEUL défilement (aucun bloc à hauteur fixe ni à défilement propre) ; « ← Fermer » toujours accessible en haut,
     « Fermer » du bas en fin de contenu, jamais par-dessus. À l'ordinateur : la fenêtre centrée, sans bloc tronqué. */
  const boite = (
    <div className="mis-voile pvv-voile-consultation" style={zone ? { top: zone.top, bottom: 'auto', height: zone.height } : undefined} data-zone-visible={zone ? 'oui' : undefined}>
      <style>{CSS_PARCOURS + CSS_MODALE_ISSUE + CSS_PREVISITE + CSS_COMPTE_RENDU_SAISIE}</style>
      <div className="mis-boite pss-boite pss-boite-recap pvv-boite-consultation" role="dialog" aria-modal="true" aria-labelledby={titreId} data-fenetre-compte-rendu={mode}>
        <div className="pvv-cr-barre"><button type="button" className="pvv-cr-fermer-haut" onClick={onFermer} aria-label="Fermer le compte rendu" data-fermer-haut>← Fermer</button></div>
        <h2 id={titreId} className="mis-titre">Compte rendu de pré-visite</h2>
        <p className="loc-muet pss-rien" data-cr-adresse>{l.locataires.map((x) => x.nom).join(', ')} — {l.adresse ?? `Bien ${l.lotId}`}</p>
        {corps}
        <div className="mis-actions">
          <button type="button" className={`svv-btn ${mode === 'brouillon' ? 'svv-btn-outline' : 'svv-btn-primary'} gst-btn mis-action`} onClick={onFermer} data-fermer-compte-rendu>Fermer</button>
          {mode === 'brouillon' && (
            <a className="svv-btn svv-btn-primary gst-btn mis-action" href={cheminCompteRendu(l.occupationIds[0])} data-continuer-saisie>
              {luB.etat.etat === 'ok' && luB.etat.data.brouillon === null ? 'Commencer la saisie' : 'Continuer la saisie'}</a>)}
        </div>
      </div>
      {agrandie !== null && (
        <div className="pvv-agrandie" role="dialog" aria-modal="true" aria-label={agrandie.legende} data-cr-photo-agrandie onClick={() => setAgrandie(null)}>
          <img src={agrandie.url} alt={agrandie.legende} />
          <p className="pvv-agrandie-legende">{agrandie.legende}</p>
          <div className="pvv-agrandie-boutons">
            <a className="svv-btn svv-btn-outline gst-btn" href={agrandie.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} data-cr-photo-ouvrir>Ouvrir</a>
            <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={() => setAgrandie(null)} data-cr-photo-fermer>Fermer</button>
          </div>
        </div>)}
    </div>
  );
  return typeof document === 'undefined' ? boite : createPortal(boite, document.querySelector('.svv-adm-root') ?? document.body);
}

/** 🔴 Arno (15/11/2026) — l'étiquette de chaque envoi de « Voir le compte rendu » : celle des cartes du récapitulatif. */
export const ETIQUETTE_ENVOI_CR: Record<CompteRenduAffiche['destinataires'][number]['famille'], string> = {
  interne: ETIQUETTE_FAMILLE_MAIL.interne, locataire: ETIQUETTE_FAMILLE_MAIL.locataire, proprietaire: ETIQUETTE_FAMILLE_MAIL.proprietaire, autre: 'AUTRE DESTINATAIRE',
};

/** AUCUN ACCENT GRAVE DANS CE LITTERAL. Jetons du theme ; cibles de 44 px ; une colonne au telephone. */
export const CSS_PREVISITE = `
.pvv-voir-cr{margin-top:8px}
/* Arno (15/11/2026, 9e retour) : la fenetre du compte rendu, CENTREE (aussi au telephone), son contenu defile dedans */
.pvv-voile-consultation{align-items:center;padding:12px}
.pvv-voile-consultation .mis-boite{width:min(640px,100%);max-height:calc(100dvh - 24px);border-radius:18px}
/* Arno (15/11/2026, 11e retour) : aucun bloc ecrase ni tronque (la boite est une colonne qui defile : ses enfants ne retrecissent jamais) ;
   le texte du compte rendu en entier, sans hauteur maximale ni defilement propre */
.pvv-boite-consultation > *{flex-shrink:0}
.pvv-boite-consultation .pvv-cr-texte{max-height:none;overflow:visible}
/* le « Fermer » du bas : en FIN de contenu, jamais colle par-dessus les prises (la barre des fenetres de parcours est collante) */
.pvv-boite-consultation .mis-actions{position:static;margin:18px 0 0;padding:12px 0 16px;border-top:1px solid var(--color-svv-line);background:transparent}
.pvv-cr-barre{position:sticky;top:0;z-index:2;display:flex;justify-content:flex-start;margin:-6px 0 0;padding:6px 0;background:var(--color-svv-surface)}
.pvv-cr-fermer-haut{min-height:44px;padding:0 6px;border:0;background:none;color:var(--color-svv-ink);font:inherit;font-weight:800;cursor:pointer}
@media (max-width:640px){
  .pvv-voile-consultation{inset:0;padding:0;align-items:stretch;justify-content:stretch;display:block;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;background:var(--color-svv-surface);box-shadow:0 0 0 100vmax var(--color-svv-surface);z-index:200}
  .pvv-voile-consultation .mis-boite{width:100%;max-height:none;min-height:100%;overflow:visible;border:0;border-radius:0;box-shadow:none;padding:6px 16px calc(20px + env(safe-area-inset-bottom))}
}
.pvv-cr-brouillon{margin:0;padding:8px 12px;border-radius:10px;border:1px dashed var(--color-svv-line-strong);background:var(--color-svv-field);font-weight:800}
.pvv-cr-note{color:var(--color-svv-muted)}
.pvv-cr-vignette{display:block;padding:0;margin:0;border:0;background:none;cursor:zoom-in;border-radius:8px;min-height:44px}
.pvv-agrandie{position:fixed;inset:0;z-index:120;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:16px;background:color-mix(in srgb, var(--color-svv-ink) 88%, transparent)}
.pvv-agrandie img{max-width:100%;max-height:calc(100dvh - 160px);object-fit:contain;border-radius:8px;background:var(--color-svv-surface)}
.pvv-agrandie-legende{margin:0;color:var(--color-svv-surface);font-weight:800;text-align:center;overflow-wrap:anywhere}
.pvv-agrandie-boutons{display:flex;gap:10px}
.pvv-agrandie-boutons .svv-btn{min-height:48px;width:auto;padding:0 18px;display:inline-flex;align-items:center}
.pvv-photos{position:relative;border:0;margin:12px 0 0;padding:0;display:flex;flex-direction:column;gap:8px;min-width:0}
.pvv-photos legend{padding:0;margin:0 0 6px}
.pvv-photos-boutons{display:flex;flex-wrap:wrap;gap:8px}
.pvv-photo-ajout{width:auto;min-height:48px;padding:0 1rem;display:inline-flex;align-items:center;cursor:pointer}
.pvv-fichier{position:absolute;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none}
.pvv-photos-liste{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:10px}
.pvv-photo{display:flex;flex-direction:column;gap:6px;padding:10px;border-radius:12px;border:2px solid var(--color-svv-line);background:var(--color-svv-surface)}
.pvv-photo--erreur,.pvv-photo--echec{border-color:var(--color-svv-red);background:color-mix(in srgb, var(--color-svv-red) 6%, var(--color-svv-surface))}
.pvv-photo--erreur .pvs-libelle{color:var(--color-svv-red)}
.pvv-photo-tete{display:flex;align-items:center;justify-content:space-between;gap:8px}
.pvv-photo-gestes{display:inline-flex;gap:6px}
.pvv-mini{min-width:44px;min-height:44px;padding:0 10px;border-radius:10px;border:1px solid var(--color-svv-line-strong);background:var(--color-svv-surface);color:var(--color-svv-ink);font:inherit;font-weight:700;cursor:pointer}
.pvv-mini:disabled{opacity:.4;cursor:default}
.pvv-vignette{display:block;width:100%;max-width:320px;max-height:240px;object-fit:contain;border-radius:8px;background:var(--color-svv-field)}
.pvv-vignette--vide{height:120px}
.pvv-photo-motif{color:var(--color-svv-red);font-weight:700}
.pvv-cr-photos{margin:0;padding:0;list-style:none;display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}
.pvv-cr-photos li{display:flex;flex-direction:column;gap:4px}
.pvv-cr-legende{font-weight:700;overflow-wrap:anywhere}
.pvv-audio{width:100%;max-width:420px;min-height:40px}
.pvv-vocal-duree{display:inline-flex;align-items:center;min-height:48px;padding:0 12px;border-radius:12px;background:color-mix(in srgb, var(--color-svv-red) 10%, var(--color-svv-surface));color:var(--color-svv-red);font-weight:800;font-variant-numeric:tabular-nums}
.pvv-petit{min-height:40px;width:auto;padding:0 .9rem;font-size:.88rem}
.pvv-cr-qui{margin:0;font-weight:700}
.pvv-cr-texte{margin:0;padding:10px 12px;border-radius:10px;background:var(--color-svv-field);color:var(--color-svv-ink);font:inherit;white-space:pre-wrap;overflow-wrap:anywhere;max-height:40vh;overflow:auto}
.pvv-cr-bloc{display:flex;flex-direction:column;gap:6px}
.pvv-cr-liste{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px}
/* Arno (15/11/2026) : meme mise en forme que les cartes du recapitulatif — barre et etiquette de la couleur de la famille
   (locataire vert, interne gris, proprietaire rouge) */
.pvv-cr-dest{--pvv-famille:var(--color-svv-gray);display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;padding:8px 10px;border-radius:10px;border:1px solid var(--color-svv-line);border-left:8px solid var(--pvv-famille);background:var(--color-svv-surface)}
.pvv-cr-dest--locataire{--pvv-famille:var(--color-svv-green-ink)}
.pvv-cr-dest--proprietaire{--pvv-famille:var(--color-svv-red)}
.pvv-cr-dest--interne{--pvv-famille:var(--color-svv-gray)}
.pvv-cr-famille{flex:0 0 100%;align-self:flex-start;max-width:max-content;display:inline-flex;align-items:center;padding:4px 10px;border-radius:999px;background:var(--pvv-famille);color:var(--color-svv-surface);font-size:.8rem;font-weight:900;letter-spacing:.06em;line-height:1.25}
.pvv-cr-nom{flex:1 1 10rem;min-width:8rem;overflow-wrap:break-word}
.pvv-cr-quand{font-size:.86rem;color:var(--color-svv-muted);white-space:nowrap}
.pvv-cr-etat{font-weight:800}
.pvv-cr-etat--envoye{color:var(--color-svv-green-ink)}
.pvv-cr-etat--echec{color:var(--color-svv-red)}
.pvv-cr-etat--non_envoye{color:var(--color-svv-red)}
.pvv-cartouche{display:inline-flex;align-items:center;padding:4px 10px;border-radius:999px;font-size:.82rem;font-weight:800;white-space:nowrap}
.pvv-cartouche--alerte{background:var(--color-svv-urgence-orange);color:var(--color-svv-surface)}
.pvv-cartouche--refus{background:var(--color-svv-red);color:var(--color-svv-surface)}
.pvv-compteur{display:inline-flex;min-width:1.4em;justify-content:center;margin-left:4px;padding:0 6px;border-radius:999px;background:var(--color-svv-field);color:var(--color-svv-ink);font-weight:800}
.pvv-pastille--alerte{border-color:var(--color-svv-urgence-orange)}
/* Arno (15/11/2026) : le STATUT de la ligne (arbre d'Arno) — fond clair et texte fonce de la meme famille (jetons du theme, clair et sombre) ;
   seul « En preavis » reste bleu */
.psl-statut{display:inline-block;border-radius:999px;padding:2px 10px;font-size:.85rem;font-weight:800;border:1px solid currentColor;white-space:nowrap}
.psl-statut--en_preavis{background:var(--color-svv-blue-soft);color:var(--color-svv-blue)}
.psl-statut--rdv_previsite{background:var(--color-svv-sarcelle-soft);color:var(--color-svv-sarcelle)}
.psl-statut--refus_previsite{background:var(--color-svv-orange-soft);color:var(--color-svv-orange)}
.psl-statut--previsite_effectuee{background:var(--color-svv-green-soft);color:var(--color-svv-green-ink)}
.psl-statut--rdv_edl{background:var(--color-svv-violet-soft);color:var(--color-svv-violet)}
.psl-statut--edl_effectue{background:var(--color-svv-field);color:var(--color-svv-gray)}
/* Arno (15/11/2026) : chaque FILTRE porte la couleur de son statut, identique au cartouche de la ligne ; choisi : plein de sa couleur */
.psl-filtre{--psl-fond:var(--color-svv-blue-soft);--psl-encre:var(--color-svv-blue);background:var(--psl-fond);color:var(--psl-encre);border-color:var(--psl-encre);font-weight:700}
.psl-filtre--rdv_previsite{--psl-fond:var(--color-svv-sarcelle-soft);--psl-encre:var(--color-svv-sarcelle)}
.psl-filtre--refus_previsite{--psl-fond:var(--color-svv-orange-soft);--psl-encre:var(--color-svv-orange)}
.psl-filtre--previsite_effectuee{--psl-fond:var(--color-svv-green-soft);--psl-encre:var(--color-svv-green-ink)}
.psl-filtre--rdv_edl{--psl-fond:var(--color-svv-violet-soft);--psl-encre:var(--color-svv-violet)}
.psl-filtre--alerte{--psl-fond:var(--color-svv-orange-soft);--psl-encre:var(--color-svv-urgence-orange)}
.pva-segment.psl-filtre[aria-pressed="true"]{background:var(--psl-encre);color:var(--color-svv-surface);border-color:var(--psl-encre);font-weight:900}
.psl-filtre .pvv-compteur{background:var(--color-svv-surface);color:var(--psl-encre)}
.pvv-etat{margin:0;padding:8px 10px;border-radius:10px;background:var(--color-svv-field);color:var(--color-svv-ink);font-weight:700;overflow-wrap:anywhere}
.pvv-etat--alerte{background:var(--color-svv-urgence-orange);color:var(--color-svv-surface)}
/* Arno (13/11/2026) : un rendez-vous fixe est VERT, comme la pre-visite effectuee */
.pvv-etat--programmee{background:var(--color-svv-green-soft);color:var(--color-svv-green-ink)}
.pvv-etat--effectuee{background:var(--color-svv-green-soft);color:var(--color-svv-green-ink)}
.pvv-etat--refusee{background:color-mix(in srgb, var(--color-svv-urgence-orange) 18%, var(--color-svv-surface));color:var(--color-svv-ink)}
.pvv-collegues{margin:0;padding-left:18px;font-size:.9rem}
.pvv-grille{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;align-items:end;min-width:0}
.pvv-grille .pvs-libelle{white-space:nowrap}
.pvv-grille .pvs-champ input{max-width:none;width:100%;height:48px;min-width:0}
@media (max-width:600px){.pvv-grille{grid-template-columns:1fr}}
.pvv-choix{border:0;margin:12px 0 0;padding:0;display:flex;flex-direction:column;align-items:flex-start;gap:4px;min-width:0}
.pvv-choix legend{padding:0;margin:0 0 6px}
.pvv-case{display:flex;align-items:center;gap:8px;min-height:44px;cursor:pointer}
.pvv-case input{width:20px;height:20px}
.pss-boite textarea{width:100%;box-sizing:border-box;font:inherit}
/* iPhone (Arno, 13/11/2026) : la fenetre tient dans la zone visible (clavier ouvert) ; champs pleine largeur en 16 px (Safari ne zoome plus) ;
   gros boutons ; le bouton d'envoi reste colle en bas, au-dessus du clavier */
.pvv-voile .mis-boite{max-height:100%}
@media (max-width:640px){
  .pss-boite textarea,.pss-boite input[type=text],.pss-boite input[type=date],.pss-boite input[type=time]{font-size:16px;width:100%;max-width:none;min-height:48px}
  .pss-boite textarea{min-height:40vh}
  .pss-boite .mis-actions .mis-action{min-height:52px;font-size:1.02rem}
}
.pvv-reserve{margin:0;font-size:.88rem;font-weight:700;color:var(--color-svv-muted)}
/* Arno (15/11/2026) : « Objet : … » — le libelle, deux-points, une espace, puis le texte (plus jamais colles) */
.pvv-objet{margin:0;overflow-wrap:anywhere;color:var(--color-svv-ink)}
.pvv-adresse-cr{margin:0;font-size:1.3rem;font-weight:900;line-height:1.3;color:var(--color-svv-ink);overflow-wrap:anywhere}
.pvv-lien-cr{display:inline-flex;align-items:center;justify-content:center;text-decoration:none}
`;

/**
 * AUCUN ACCENT GRAVE DANS CE LITTERAL. 🔴 Arno (15/11/2026) — LA PAGE DU COMPTE RENDU : fond opaque de la page jusqu'au bord inferieur (racine,
 * html, body), hauteur sur la zone visible (dvh ; marge du bas = hauteur du clavier iOS, lue sur visualViewport), aucune zone transparente.
 */
export const CSS_PAGE_COMPTE_RENDU = `
.pvv-page{min-height:100dvh;box-sizing:border-box;display:flex;flex-direction:column;gap:12px}
.pvv-page-cr{--pvv-clavier:0px;flex:1 0 auto;background:var(--color-svv-surface);color:var(--color-svv-ink);padding-bottom:var(--pvv-clavier)}
.pvv-boite-page{display:flex;flex-direction:column;gap:14px;width:min(640px,100%);margin:0 auto;padding:18px 16px;box-sizing:border-box;background:var(--color-svv-surface);color:var(--color-svv-ink);border:2px solid var(--color-svv-line);border-radius:20px}
.pvv-boite-page.pss-boite-recap{border-color:var(--color-svv-ink)}
@media (max-width:640px){
  .pvv-boite-page{border:0;border-radius:0;padding:4px 0 calc(16px + env(safe-area-inset-bottom))}
}
`;
