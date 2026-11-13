'use client';

import { useVerrouDefilement } from '../_composants/verrouDefilement';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
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
  ALERTE_TOUS_REFUSENT, CARTOUCHE_ALERTE, LIBELLE_STATUT_PREVISITE, creneauFr, objetCompteRendu, pastillesPrevisite, verifierRdvPrevisite,
  type PrevisiteAffiche, type StatutPrevisite,
} from '../../../../lib/location/previsite';
import { refusPhotos, lignePhoto, legendesDuTexte, texteSansPhotos } from '../../../../lib/location/photosCompteRendu';
import { convertirPhoto, enBase64 } from '../../../../lib/location/photoEcran';
import { dureeFr, insererTranscription, MENTION_TRANSCRIT, VOCAL_DUREE_MAX_S } from '../../../../lib/location/vocauxCompteRendu';
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

/** Les pastilles de statut, filtrantes (plusieurs à la fois) ; « Tous » efface le filtre. */
export function PastillesPrevisite({ lignes, filtre, onChange }: { lignes: readonly LignePreavisAccueil[]; filtre: ReadonlySet<StatutPrevisite>; onChange: (f: Set<StatutPrevisite>) => void }) {
  const statuts = lignes.map((l) => l.previsite?.statut).filter((s): s is StatutPrevisite => s !== undefined);
  const pastilles = pastillesPrevisite(statuts);
  const basculer = (s: StatutPrevisite): void => { const n = new Set(filtre); if (n.has(s)) n.delete(s); else n.add(s); onChange(n); };
  return (
    <div className="pva-tri pvv-pastilles" role="group" aria-label="Filtrer par statut de pré-visite" data-pastilles-previsite>
      <span className="pva-tri-libelle">Statut</span>
      <button type="button" className="pva-segment" aria-pressed={filtre.size === 0} onClick={() => onChange(new Set())} data-filtre-previsite="tous">Tous ({statuts.length})</button>
      {pastilles.map((p) => (
        <button key={p.statut} type="button" className={`pva-segment pvv-pastille pvv-pastille--${p.statut}`} aria-pressed={filtre.has(p.statut)}
          onClick={() => basculer(p.statut)} data-filtre-previsite={p.statut}>{p.libelle} <span className="pvv-compteur" data-compteur-previsite={p.statut}>{p.nombre}</span></button>
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
  const [voirCr, setVoirCr] = useState(false);
  // 🔴 Arno (13/11/2026) — le lien de l'invitation (`?previsite=…&geste=compte-rendu`) ouvre DIRECTEMENT le formulaire du compte rendu, une fois
  // (le paramètre est retiré de l'adresse : un rechargement ne le rouvre pas) — si le geste est possible ici (rendez-vous commencé, droit d'écrire).
  const { ecriture } = useContextePreavis();
  const peutCompteRendu = p !== null && p.rdv !== null && p.rdvPasse && p.statut === 'programmee' && ecriture;
  useEffect(() => {
    if (!peutCompteRendu) return;
    try {
      const u = new URL(window.location.href);
      if (u.searchParams.get('geste') !== 'compte-rendu' || !l.occupationIds.includes(Number(u.searchParams.get('previsite')))) return;
      u.searchParams.delete('geste');
      window.history.replaceState(window.history.state, '', `${u.pathname}${u.search}${u.hash}`);
      setGeste('compte_rendu'); // eslint-disable-line react-hooks/set-state-in-effect
    } catch { /* sans adresse lisible : rien */ }
  }, [peutCompteRendu, l.occupationIds]);
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
        {p.rdv !== null && p.rdvPasse && p.statut === 'programmee' && (
          <button type="button" className="svv-btn svv-btn-primary gst-btn" {...inactif} onClick={() => setGeste('compte_rendu')} data-compte-rendu-previsite>Compte rendu pré-visite</button>)}
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
            : <button type="button" className="svv-btn svv-btn-outline gst-btn pvv-petit" onClick={() => setVoirCr(true)} data-voir-compte-rendu="oui">Voir le compte rendu</button>}
        </div>
      )}
      </div>
      {voirCr && <FenetreCompteRendu l={l} onFermer={() => setVoirCr(false)} />}
      {geste !== null && ecriture && <FenetrePrevisite geste={geste} l={l} p={p} onFermer={(fait) => { setGeste(null); if (fait) apres(); }} />}
    </div>
  );
}

interface MailApercu { sorte: string; objet: string; a: string[]; cc: string[]; texte: string; piece?: string | null;
  /** 🔴 Arno (10/11/2026) — un mail aux locataires à texte modifiable : ses parties. */
  edition?: EditionMail }
type Etape = { etape: 'saisie' } | { etape: 'recap'; mails: MailApercu[]; sansEmail: string[] } | { etape: 'resultat'; mails: MailParti[]; lignes: [string, ReactNode][]; motif: string | null };

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
    const lire = (): void => setZ({ top: vv.offsetTop, height: vv.height });
    lire();
    vv.addEventListener('resize', lire); vv.addEventListener('scroll', lire);
    return () => { vv.removeEventListener('resize', lire); vv.removeEventListener('scroll', lire); };
  }, []);
  return z;
}

function FenetrePrevisite({ geste, l, p, onFermer }: { geste: Geste; l: LignePreavisAccueil; p: PrevisiteAffiche; onFermer: (fait: boolean) => void }) {
  // 🔴 Arno (11/11/2026) — la fenêtre bloque le défilement de la page, COMPTÉ (commun à toutes les fenêtres ; toujours rendu à la dernière fermée).
  useVerrouDefilement();
  const zone = useZoneVisible();
  const titreId = useId();
  const [etape, setEtape] = useState<Etape>({ etape: 'saisie' });
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
  const [aussiLocataires, setAussiLocataires] = useState(false);
  /** 🔴 Arno (13/11/2026, lot B) — les photos du compte rendu (déposées à l'ajout), légende obligatoire, dans l'ordre choisi. */
  const [photos, setPhotos] = useState<PhotoSaisie[]>([]);
  const [rangSansLegende, setRangSansLegende] = useState<number | null>(null);
  const photosPretes = photos.filter((x) => x.id !== null).map((x) => ({ id: x.id as number, legende: x.legende }));
  const photosEnCours = photos.some((x) => x.etat === 'envoi');
  /** 🔴 Arno (13/11/2026, lot C) — les vocaux (INTERNES, jamais envoyés) ; le curseur du compte rendu, où s'insère la transcription. */
  const [vocaux, setVocaux] = useState<VocalSaisi[]>([]);
  const [enregistrement, setEnregistrement] = useState(false);
  const curseur = useRef<number | null>(null);
  const vocauxPrets = vocaux.filter((v) => v.id !== null).map((v) => v.id as number);
  const vocauxEnCours = enregistrement || vocaux.some((v) => v.etat === 'depot');
  const insererTexteVocal = (t: string): void => setCorps((c) => { const r = insererTranscription(c, curseur.current, t); curseur.current = r.curseur; return r.texte; });
  /** Le refus des photos (légende manquante) : dit, la photo concernée en rouge ; rien ne part. */
  const verifierPhotos = (): boolean => {
    if (geste !== 'compte_rendu') return true;
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
  const liste = useMemo(() => (collegues.etat.etat === 'ok' && Array.isArray(collegues.etat.data) ? collegues.etat.data : []), [collegues.etat]);
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
    if (!verifierPhotos()) return;
    setEnvoi(true); setRefus(null);
    const r = await envoyer(geste === 'compte_rendu' ? { action: 'apercu-compte-rendu-previsite', ...corpsCommun, corps, aussiLocataires, photos: photosPretes }
      : geste === 'refus' ? { action: 'apercu-refus-previsite', ...corpsCommun, texte: texteRefus ?? '' }
        : geste === 'reaffecter' && rdvActuel ? { action: 'apercu-previsite', ...corpsCommun, jour: rdvActuel.jour, debut: rdvActuel.heure, fin: fin0 || rdvActuel.heure, destinataires: dest }
          : { action: 'apercu-previsite', ...corpsCommun, jour, debut, fin, destinataires: dest, deplacer: deplacement, retouches: rt }, { propre: true });
    setEnvoi(false);
    // Un texte modifié refusé par le serveur : le récapitulatif d'avant reste, la raison est dite (la retouche n'est pas gardée).
    if (r.motif !== null) { setRefus(r.motif); return; }
    setRetouches(rt);
    const d = (r.data ?? {}) as { mails?: MailApercu[]; sansEmail?: string[] };
    // Réaffecter : seules les invitations des collègues partent (les locataires ne sont pas prévenus d'un changement de collègue).
    const mails = (d.mails ?? []).filter((m) => geste !== 'reaffecter' || m.sorte === 'previsite_invitation');
    setEtape({ etape: 'recap', mails, sansEmail: geste === 'reaffecter' ? [] : d.sansEmail ?? [] });
  };

  const confirmer = async (): Promise<void> => {
    if (!verifierPhotos()) return;
    setEnvoi(true); setRefus(null);
    const action = geste === 'rdv' ? 'programmer-previsite' : geste === 'deplacer' ? 'deplacer-previsite' : geste === 'reaffecter' ? 'reaffecter-previsite'
      : geste === 'compte_rendu' ? 'compte-rendu-previsite' : 'refus-previsite';
    const r = await envoyer({ action, ...corpsCommun, jour, debut, fin, destinataires: dest, corps, aussiLocataires, texte: texteRefus ?? '',
      ...(geste === 'compte_rendu' ? { photos: photosPretes, vocaux: vocauxPrets } : {}),
      ...(Object.keys(retouches).length > 0 ? { retouches } : {}) }, { propre: true });
    setEnvoi(false);
    if (r.motif !== null) { setRefus(r.motif); return; }
    const d = (r.data ?? {}) as { rdv?: { jour: string; heure: string; dureeMinutes: number }; ancien?: { jour: string; heure: string; dureeMinutes: number } | null;
      collegues?: { destinataire: string; etat: string }[]; locataires?: MailParti[]; envois?: MailParti[]; sansEmail?: string[]; statut?: StatutPrevisite | null; agenda?: string;
      tacheAnnulee?: number | null };
    const mails: MailParti[] = [...(d.collegues ?? []).map(mailCollegue), ...(d.locataires ?? []), ...(d.envois ?? [])];
    const lignes: [string, ReactNode][] = [[l.locataires.length > 1 ? 'Locataires' : 'Locataire', l.locataires.map((x) => x.nom).join(', ')], ['Le logement', l.adresse ?? `Bien ${l.lotId}`]];
    if (d.rdv) lignes.push(['Rendez-vous', `le ${creneauFr(d.rdv)}`]);
    if (d.ancien) lignes.push(['Ancien rendez-vous', `le ${creneauFr(d.ancien)}`]);
    if (d.statut !== undefined) lignes.push(['Statut', d.statut === null ? 'inchangé : le mail n’est pas parti' : LIBELLE_STATUT_PREVISITE[d.statut]]);
    for (const n of d.sansEmail ?? []) lignes.push(['Sans adresse e-mail', `${n} n’a pas reçu le mail`]);
    if (typeof d.tacheAnnulee === 'number') lignes.push(['Rendez-vous', 'annulé — la tâche des collègues est annulée']);
    if (d.agenda) lignes.push(['Agenda', d.agenda]);
    setEtape({ etape: 'resultat', mails, lignes, motif: mails.length === 0 ? 'Aucun mail n’est parti pour cette opération.' : null });
  };

  let contenu: ReactNode;
  if (etape.etape === 'saisie') {
    contenu = <>
      <h2 id={titreId} className="mis-titre" data-titre-previsite>{TITRES[geste][0]}</h2>
      <p className="loc-muet pss-rien">{l.locataires.map((x) => x.nom).join(', ')} — {l.adresse ?? `Bien ${l.lotId}`}</p>
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
        <p className="pvs-champ"><span className="pvs-libelle">Objet</span><span data-objet-compte-rendu>{objetCompteRendu(rdvActuel)}</span></p>
        <label className="pvs-champ"><span className="pvs-libelle">Compte rendu *</span>
          <textarea value={corps} onChange={(e) => { setCorps(e.target.value); curseur.current = e.target.selectionStart; }} rows={10}
            // le curseur est noté à chaque geste, et surtout à la sortie du champ (le toucher de « Enregistrer un vocal ») : la transcription s'y insère
            onSelect={(e) => { curseur.current = (e.target as HTMLTextAreaElement).selectionStart; }} onBlur={(e) => { curseur.current = e.target.selectionStart; }}
            onKeyUp={(e) => { curseur.current = (e.target as HTMLTextAreaElement).selectionStart; }} onClick={(e) => { curseur.current = (e.target as HTMLTextAreaElement).selectionStart; }}
            data-corps-compte-rendu /></label>
        <VocauxDuCompteRendu vocaux={vocaux} onChange={setVocaux} occupationIds={l.occupationIds} onTranscrit={insererTexteVocal} onEnregistrement={setEnregistrement} />
        <PhotosDuCompteRendu photos={photos} onChange={(f) => { setPhotos(f); setRangSansLegende(null); setRefus(null); }} occupationIds={l.occupationIds} rangSansLegende={rangSansLegende} />
        <label className="pvv-case"><input type="checkbox" checked={aussiLocataires} onChange={(e) => setAussiLocataires(e.target.checked)} data-aussi-locataires />
          <span>Envoyer aussi aux locataires</span></label>
        <p className="loc-muet">Envoyé à tous les collaborateurs ayant accès à Gestion et/ou Location. Avec la case cochée, chaque locataire reçoit en plus SON propre mail (seul destinataire, sans copie visible).</p>
      </>}
      {geste === 'refus' && (propose.etat.etat !== 'ok' ? <EtatLecture etat={propose.etat} /> : <>
        <p className="pvs-champ"><span className="pvs-libelle">Objet</span><span>{propose.etat.data.objet}</span></p>
        <label className="pvs-champ"><span className="pvs-libelle">Texte du mail (modifiable) *</span>
          <textarea value={texteRefus ?? ''} onChange={(e) => setTexteRefus(e.target.value)} rows={14} data-texte-refus /></label>
        <p className="loc-muet" data-refus-confidentialite>Chaque locataire reçoit SON mail (seul destinataire, sans copie visible) : « [nom du locataire] » y est remplacé par son nom. Les collaborateurs ayant accès à Gestion et/ou Location reçoivent une copie interne séparée.</p>
        {p.statut === 'programmee' && p.rdv && <p className="mis-note pss-note-neutre" data-refus-annule-rdv>Une pré-visite est programmée le {creneauFr(p.rdv)} : à l’envoi, elle sera annulée (tâche des collègues annulée) et chaque collègue destinataire recevra un mail d’annulation.</p>}
      </>)}
      <BlocageEmailLocataires e={emails} />
      {verdict !== null && !verdict.ok && (jour !== '' || debut !== '') && <p className="cp-refus" role="status" data-previsite-message>{verdict.motif}</p>}
      {refus !== null && <p className="cev-alerte" role="alert" data-previsite-refus>{refus}</p>}
      <div className="mis-actions">
        <button type="button" className="svv-btn svv-btn-outline gst-btn mis-action" onClick={() => onFermer(false)} disabled={envoi} data-annuler-previsite>Annuler</button>
        <button type="button" className="svv-btn svv-btn-primary gst-btn mis-action" onClick={() => { void voirRecap({}); }} disabled={envoi || !saisieOk || photosEnCours || vocauxEnCours} data-recap-previsite>
          {envoi ? 'Préparation…' : 'Voir le récapitulatif'}</button>
      </div>
    </>;
  } else if (etape.etape === 'recap') {
    contenu = <>
      <h2 id={titreId} className="mis-titre" data-titre-previsite>Récapitulatif — {TITRES[geste][0]}</h2>
      <p className="loc-muet pss-rien" data-rien-enregistre>Rien n’est encore enregistré ni envoyé : vérifiez, puis « Confirmer et envoyer ».</p>
      {etape.mails.length === 0 ? <p className="mis-note pss-note-neutre">Aucun mail ne partira.</p> : <>
        <p className="pss-sous-titre">Les mails qui partiront :</p>
        <ul className="cev-mails" data-mails-prevus>{etape.mails.map((m, i) => (
          <li key={`${i}-${m.sorte}`} className="cev-mail" data-mail-prevu={m.sorte}>
            <p className="cev-mail-titre">{libelleMail(m)}</p>
            <dl className="cev-dl"><dt>Objet</dt><dd data-objet>{m.objet}</dd><dt>Destinataires</dt><dd data-a>{m.a.join(', ') || '—'}</dd>
              <dt>En copie</dt><dd data-cc>{m.cc.length > 0 ? m.cc.join(', ') : 'aucune'}</dd>
              {m.piece && (/\.ics$/i.test(m.piece) ? <><dt>Pièce jointe</dt><dd>{m.piece} (invitation d’agenda)</dd></>
                : <><dt>Pièces jointes</dt><dd data-pieces-prevues>{m.piece}</dd></>)}</dl>
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
          </li>))}</ul>
      </>}
      {etape.sansEmail.map((n) => <p key={n} className="mis-note" data-sans-email>⚠ {n} : pas d’adresse e-mail, il ne recevra pas ce mail</p>)}
      {geste === 'compte_rendu' && vocauxPrets.length > 0 && <p className="mis-note pss-note-neutre" data-vocaux-internes>🎙 {vocauxPrets.length === 1 ? '1 vocal reste' : `${vocauxPrets.length} vocaux restent`} INTERNE{vocauxPrets.length > 1 ? 'S' : ''} : écoutable{vocauxPrets.length > 1 ? 's' : ''} dans « Voir le compte rendu », jamais envoyé{vocauxPrets.length > 1 ? 's' : ''} (ni aux locataires, ni au propriétaire, ni en pièce jointe).</p>}
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
  const boite = (
    <div className="mis-voile pvv-voile" style={zone ? { top: zone.top, bottom: 'auto', height: zone.height } : undefined} data-zone-visible={zone ? 'oui' : undefined}>
      <style>{CSS_PARCOURS + CSS_MODALE_ISSUE + CSS_CONFIRMATION_ENVOIS + CSS_PREVISITE + CSS_TEXTE_MODIFIABLE}</style>
      <div className={`mis-boite pss-boite ${etape.etape === 'resultat' ? (echec ? 'mis-boite--attention' : 'mis-boite--succes') : 'pss-boite-recap'}`} role="dialog" aria-modal="true"
        aria-labelledby={titreId} data-fenetre-previsite={etape.etape} data-geste-previsite={geste}>
        {contenu}
      </div>
    </div>
  );
  return typeof document === 'undefined' ? boite : createPortal(boite, document.querySelector('.svv-adm-root') ?? document.body);
}

/** Un vocal du formulaire : sa réécoute (sur l'appareil), sa pièce déposée (`id`), sa transcription. */
interface VocalSaisi { cle: string; id: number | null; url: string; dureeS: number; etat: 'depot' | 'ok' | 'erreur'; transcription: 'en_cours' | 'ok' | 'echec' | null; motif: string | null }

/** Le type d'enregistrement que ce navigateur sait produire : Safari iOS → audio/mp4 (AAC) ; Chrome / Firefox → webm / ogg. */
function typeEnregistrement(): string | undefined {
  const MR = (globalThis as { MediaRecorder?: { isTypeSupported?: (t: string) => boolean } }).MediaRecorder;
  return ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'].find((t) => MR?.isTypeSupported?.(t) === true);
}

/**
 * 🔴 Arno (13/11/2026, lot C) — « Enregistrer un vocal » : le micro du téléphone (MediaRecorder ; Safari iOS : mp4/aac), la durée affichée,
 * Pause / Reprendre / Arrêter (10 minutes au plus : arrêt de lui-même), réécoute, suppression, plusieurs vocaux. À l'arrêt : déposé (INTERNE),
 * puis TRANSCRIT par Mistral — le texte s'insère dans le compte rendu À L'ENDROIT DU CURSEUR, modifiable, avec « (transcrit d'un vocal) ».
 * Un échec de transcription : message clair, le vocal reste joint, « Réessayer ».
 */
function VocauxDuCompteRendu({ vocaux, onChange, occupationIds, onTranscrit, onEnregistrement }: { vocaux: VocalSaisi[]; onChange: (f: (x: VocalSaisi[]) => VocalSaisi[]) => void;
  occupationIds: readonly number[]; onTranscrit: (texte: string) => void; onEnregistrement: (en: boolean) => void }) {
  const [etat, setEtat] = useState<'repos' | 'enregistre' | 'pause'>('repos');
  const [duree, setDuree] = useState(0);
  const [refusMicro, setRefusMicro] = useState<string | null>(null);
  const rec = useRef<{ r: MediaRecorder; flux: MediaStream; morceaux: Blob[]; cumul: number; depuis: number | null; type: string } | null>(null);
  const maj = (cle: string, f: (x: VocalSaisi) => VocalSaisi) => onChange((xs) => xs.map((x) => (x.cle === cle ? f(x) : x)));
  const ecoule = (): number => { const x = rec.current; return x === null ? 0 : (x.cumul + (x.depuis === null ? 0 : Date.now() - x.depuis)) / 1000; };
  useEffect(() => {
    if (etat !== 'enregistre') return;
    const t = setInterval(() => { const s = ecoule(); setDuree(s); if (s >= VOCAL_DUREE_MAX_S) arreter(); }, 250);
    return () => clearInterval(t);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { rec.current?.flux.getTracks().forEach((t) => t.stop()); }, []);
  const transcrire = async (cle: string, id: number): Promise<void> => {
    maj(cle, (x) => ({ ...x, transcription: 'en_cours', motif: null }));
    const r = await envoyer({ action: 'transcrire-vocal', occupationIds: [...occupationIds], pieceId: id }, { propre: true });
    const d = r.data as { ok?: boolean; texte?: string; motif?: string } | undefined;
    if (r.motif === null && d?.ok === true && typeof d.texte === 'string') { onTranscrit(d.texte); maj(cle, (x) => ({ ...x, transcription: 'ok' })); return; }
    maj(cle, (x) => ({ ...x, transcription: 'echec', motif: d?.motif ?? r.motif ?? 'La transcription a échoué : le vocal reste joint au compte rendu.' }));
  };
  const deposer = async (blob: Blob, type: string, dureeS: number): Promise<void> => {
    const cle = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    onChange((xs) => [...xs, { cle, id: null, url: URL.createObjectURL(blob), dureeS, etat: 'depot', transcription: null, motif: null }]);
    const deja = await new Promise<number[]>((ok) => onChange((xs) => { ok(xs.filter((x) => x.id !== null).map((x) => x.id as number)); return xs; }));
    const r = await envoyer({ action: 'vocal-compte-rendu', occupationIds: [...occupationIds], donnees: await enBase64(blob), typeMime: type, dureeS, dejaIds: deja }, { propre: true });
    const id = (r.data as { id?: number } | undefined)?.id;
    if (r.motif !== null || typeof id !== 'number') { maj(cle, (x) => ({ ...x, etat: 'erreur', motif: r.motif ?? 'Le vocal n’a pas pu être déposé.' })); return; }
    maj(cle, (x) => ({ ...x, id, etat: 'ok' }));
    await transcrire(cle, id);
  };
  const demarrer = async (): Promise<void> => {
    setRefusMicro(null);
    try {
      const flux = await navigator.mediaDevices.getUserMedia({ audio: true });
      const voulu = typeEnregistrement();
      const r = new MediaRecorder(flux, voulu ? { mimeType: voulu } : undefined);
      const x = { r, flux, morceaux: [] as Blob[], cumul: 0, depuis: Date.now() as number | null, type: r.mimeType || voulu || 'audio/mp4' };
      r.ondataavailable = (e) => { if (e.data && e.data.size > 0) x.morceaux.push(e.data); };
      r.onstop = () => {
        flux.getTracks().forEach((t) => t.stop());
        const dureeS = Math.min(ecoule(), VOCAL_DUREE_MAX_S); x.depuis = null;
        const blob = new Blob(x.morceaux, { type: x.type });
        rec.current = null; setEtat('repos'); setDuree(0); onEnregistrement(false);
        if (blob.size > 0) void deposer(blob, x.type, dureeS);
      };
      rec.current = x; r.start(1000); setEtat('enregistre'); setDuree(0); onEnregistrement(true);
    } catch {
      setRefusMicro('Le micro est inaccessible : autorisez-le pour ce site (Réglages › Safari › Micro sur iPhone), puis réessayez.');
    }
  };
  const pause = (): void => { const x = rec.current; if (!x) return; x.r.pause(); x.cumul += x.depuis === null ? 0 : Date.now() - x.depuis; x.depuis = null; setEtat('pause'); };
  const reprendre = (): void => { const x = rec.current; if (!x) return; x.r.resume(); x.depuis = Date.now(); setEtat('enregistre'); };
  function arreter(): void { const x = rec.current; if (!x) return; if (x.depuis !== null) { x.cumul += Date.now() - x.depuis; x.depuis = null; } x.r.stop(); }
  const retirer = (cle: string) => { const v = vocaux.find((x) => x.cle === cle); if (v?.url) URL.revokeObjectURL(v.url); onChange((xs) => xs.filter((x) => x.cle !== cle)); };
  return (
    <fieldset className="pvv-photos pvv-vocaux" data-vocaux-compte-rendu>
      <legend className="pvs-libelle">Vocaux <span className="loc-muet">(internes : jamais envoyés)</span></legend>
      <div className="pvv-photos-boutons">
        {etat === 'repos' ? <button type="button" className="svv-btn svv-btn-outline gst-btn pvv-photo-ajout" onClick={() => { void demarrer(); }} data-enregistrer-vocal>🎙 Enregistrer un vocal</button> : <>
          <span className="pvv-vocal-duree" role="timer" aria-live="off" data-vocal-duree>{etat === 'pause' ? '⏸' : '●'} {dureeFr(duree)} / {dureeFr(VOCAL_DUREE_MAX_S)}</span>
          {etat === 'enregistre' ? <button type="button" className="svv-btn svv-btn-outline gst-btn pvv-photo-ajout" onClick={pause} data-vocal-pause>Pause</button>
            : <button type="button" className="svv-btn svv-btn-outline gst-btn pvv-photo-ajout" onClick={reprendre} data-vocal-reprendre>Reprendre</button>}
          <button type="button" className="svv-btn svv-btn-primary gst-btn pvv-photo-ajout" onClick={arreter} data-vocal-arreter>Arrêter</button>
        </>}
      </div>
      {refusMicro !== null && <p className="pvv-photo-motif" role="alert" data-vocal-micro>{refusMicro}</p>}
      {vocaux.length > 0 && <ol className="pvv-photos-liste">{vocaux.map((v, i) => (
        <li key={v.cle} className={`pvv-photo${v.etat === 'erreur' ? ' pvv-photo--echec' : ''}`} data-vocal={i + 1} data-vocal-etat={v.etat} data-vocal-transcription={v.transcription ?? undefined}>
          <div className="pvv-photo-tete">
            <strong>Vocal {i + 1} <span className="loc-muet">({dureeFr(v.dureeS)})</span></strong>
            <button type="button" className="pvv-mini" onClick={() => retirer(v.cle)} aria-label={`Supprimer le vocal ${i + 1}`} data-vocal-supprimer>Supprimer</button>
          </div>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio className="pvv-audio" controls preload="metadata" src={v.url} data-vocal-ecoute />
          {v.etat === 'depot' && <span className="loc-muet" role="status">Enregistrement…</span>}
          {v.transcription === 'en_cours' && <span className="loc-muet" role="status" data-vocal-transcription-en-cours>Transcription en cours…</span>}
          {v.transcription === 'ok' && <span className="loc-muet" data-vocal-transcrit>Texte inséré dans le compte rendu {MENTION_TRANSCRIT} — modifiable.</span>}
          {v.motif !== null && <span className="pvv-photo-motif" role="alert" data-vocal-motif>{v.motif}</span>}
          {v.transcription === 'echec' && v.id !== null && <button type="button" className="pvv-mini" onClick={() => { void transcrire(v.cle, v.id as number); }} data-vocal-retranscrire>Réessayer la transcription</button>}
        </li>))}</ol>}
    </fieldset>
  );
}

/** Une photo du formulaire : son aperçu (sur l'appareil), sa pièce déposée (`id`), sa légende. */
interface PhotoSaisie { cle: string; id: number | null; apercu: string; legende: string; etat: 'envoi' | 'ok' | 'erreur'; motif: string | null }

/**
 * 🔴 Arno (13/11/2026, lot B) — « Photos » du compte rendu : « Ajouter une photo » ouvre l'APPAREIL PHOTO de l'iPhone (capture), « Photothèque »
 * choisit des photos existantes ; plusieurs à la fois. Chaque photo est convertie sur l'appareil (HEIC → JPEG, ~1 600 px, ~500 Ko, sans GPS),
 * puis déposée (préparée de nouveau au serveur). LÉGENDE OBLIGATOIRE juste sous la vignette ; supprimer, monter, descendre avant l'envoi.
 */
function PhotosDuCompteRendu({ photos, onChange, occupationIds, rangSansLegende }: { photos: PhotoSaisie[];
  onChange: (f: (x: PhotoSaisie[]) => PhotoSaisie[]) => void; occupationIds: readonly number[]; rangSansLegende: number | null }) {
  const camera = useId(); const galerie = useId();
  // Toujours des mises à jour FONCTIONNELLES : une légende tapée pendant qu'une photo se prépare n'est jamais écrasée.
  const maj = (cle: string, f: (x: PhotoSaisie) => PhotoSaisie) => onChange((xs) => xs.map((x) => (x.cle === cle ? f(x) : x)));
  const dejaDeposees = (): Promise<number[]> => new Promise((ok) => onChange((xs) => { ok(xs.filter((x) => x.id !== null).map((x) => x.id as number)); return xs; }));
  const ajouter = async (liste: FileList | null): Promise<void> => {
    const fichiers = [...(liste ?? [])];
    for (const f of fichiers) {
      const cle = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      onChange((xs) => [...xs, { cle, id: null, apercu: '', legende: '', etat: 'envoi', motif: null }]);
      const c = await convertirPhoto(f);
      if (!c.ok) { maj(cle, (x) => ({ ...x, etat: 'erreur', motif: c.motif })); continue; }
      const apercu = URL.createObjectURL(c.blob);
      maj(cle, (x) => ({ ...x, apercu }));
      const deja = await dejaDeposees();
      const r = await envoyer({ action: 'photo-compte-rendu', occupationIds: [...occupationIds], donnees: await enBase64(c.blob), dejaIds: deja }, { propre: true });
      const id = (r.data as { id?: number } | undefined)?.id;
      maj(cle, (x) => (r.motif === null && typeof id === 'number' ? { ...x, id, etat: 'ok' } : { ...x, etat: 'erreur', motif: r.motif ?? 'La photo n’a pas pu être déposée.' }));
    }
  };
  const deplacer = (i: number, d: -1 | 1) => onChange((xs) => { const x = [...xs]; const j = i + d; if (j < 0 || j >= x.length) return xs; [x[i], x[j]] = [x[j], x[i]]; return x; });
  const retirer = (cle: string) => { const p = photos.find((x) => x.cle === cle); if (p?.apercu) URL.revokeObjectURL(p.apercu); onChange((xs) => xs.filter((x) => x.cle !== cle)); };
  return (
    <fieldset className="pvv-photos" data-photos-compte-rendu>
      <legend className="pvs-libelle">Photos</legend>
      <div className="pvv-photos-boutons">
        <label className="svv-btn svv-btn-outline gst-btn pvv-photo-ajout" htmlFor={camera} data-ajouter-photo>Ajouter une photo</label>
        <input id={camera} className="pvv-fichier" type="file" accept="image/*" capture="environment" multiple onChange={(e) => { void ajouter(e.target.files); e.target.value = ''; }} data-photo-camera />
        <label className="svv-btn svv-btn-outline gst-btn pvv-photo-ajout" htmlFor={galerie} data-photo-galerie-bouton>Photothèque</label>
        <input id={galerie} className="pvv-fichier" type="file" accept="image/*" multiple onChange={(e) => { void ajouter(e.target.files); e.target.value = ''; }} data-photo-galerie />
      </div>
      {photos.length > 0 && <ol className="pvv-photos-liste">{photos.map((x, i) => {
        const sansLegende = rangSansLegende === i || (rangSansLegende !== null && x.legende.trim() === '');
        return (
          <li key={x.cle} className={`pvv-photo${sansLegende ? ' pvv-photo--erreur' : ''}${x.etat === 'erreur' ? ' pvv-photo--echec' : ''}`} data-photo={i + 1} data-photo-etat={x.etat}
            data-photo-sans-legende={sansLegende ? 'oui' : undefined}>
            <div className="pvv-photo-tete">
              <strong>Photo {i + 1}</strong>
              <span className="pvv-photo-gestes">
                <button type="button" className="pvv-mini" onClick={() => deplacer(i, -1)} disabled={i === 0} aria-label={`Monter la photo ${i + 1}`} data-photo-monter>↑</button>
                <button type="button" className="pvv-mini" onClick={() => deplacer(i, 1)} disabled={i === photos.length - 1} aria-label={`Descendre la photo ${i + 1}`} data-photo-descendre>↓</button>
                <button type="button" className="pvv-mini" onClick={() => retirer(x.cle)} aria-label={`Supprimer la photo ${i + 1}`} data-photo-supprimer>Supprimer</button>
              </span>
            </div>
            {x.apercu ? <img className="pvv-vignette" src={x.apercu} alt={x.legende ? lignePhoto(i, x.legende) : `Photo ${i + 1}`} /> : <span className="pvv-vignette pvv-vignette--vide" />}
            {x.etat === 'envoi' && <span className="loc-muet" role="status">Préparation…</span>}
            {x.etat === 'erreur' && <span className="pvv-photo-motif" role="alert">{x.motif}</span>}
            <label className="pvs-champ"><span className="pvs-libelle">{`Légende de la photo ${i + 1} *`}</span>
              <input type="text" value={x.legende} maxLength={200} placeholder="ex. Rayure parquet chambre" aria-invalid={sansLegende}
                onChange={(e) => { const v = e.target.value; maj(x.cle, (y) => ({ ...y, legende: v })); }} data-photo-legende /></label>
            {sansLegende && x.etat !== 'erreur' && <span className="pvv-photo-motif" role="alert" data-photo-legende-requise>Légende obligatoire avant l’envoi.</span>}
          </li>);
      })}</ol>}
    </fieldset>
  );
}

/**
 * 🔴 Arno (13/11/2026) — LE COMPTE RENDU DE PRÉ-VISITE, EN LECTURE : le texte tel qu'enregistré, qui l'a saisi et quand, les pièces jointes, et
 * l'envoi par mail (chaque destinataire : nom, famille, date et heure, état). Rien n'est modifié en l'ouvrant ; aucune adresse de client.
 */
function FenetreCompteRendu({ l, onFermer }: { l: LignePreavisAccueil; onFermer: () => void }) {
  useVerrouDefilement();
  const titreId = useId();
  const lu = useLecture<CompteRenduAffiche>(`previsiteCompteRendu=${l.occupationIds.join(',')}`);
  useEffect(() => {
    const clavier = (e: KeyboardEvent): void => { if (e.key === 'Escape') onFermer(); };
    window.addEventListener('keydown', clavier);
    return () => window.removeEventListener('keydown', clavier);
  }, [onFermer]);
  const cr = lu.etat.etat === 'ok' ? lu.etat.data : null;
  const boite = (
    <div className="mis-voile">
      <style>{CSS_PARCOURS + CSS_MODALE_ISSUE + CSS_PREVISITE}</style>
      <div className="mis-boite pss-boite pss-boite-recap" role="dialog" aria-modal="true" aria-labelledby={titreId} data-fenetre-compte-rendu>
        <h2 id={titreId} className="mis-titre">Compte rendu de pré-visite</h2>
        <p className="loc-muet pss-rien">{l.locataires.map((x) => x.nom).join(', ')} — {l.adresse ?? `Bien ${l.lotId}`}</p>
        {cr === null ? <EtatLecture etat={lu.etat} /> : cr.texte === null ? <p className="mis-note pss-note-neutre" data-cr-aucun>{AUCUN_CR}</p> : <>
          <p className="pvv-cr-qui" data-cr-saisi>Saisi{cr.saisiPar ? ` par ${cr.saisiPar}` : ''}{cr.saisiLe ? ` ${quandFr(cr.saisiLe)}` : ''}</p>
          {cr.objet && <p className="pvs-champ"><span className="pvs-libelle">Objet</span><span data-cr-objet>{cr.objet}</span></p>}
          <pre className="pvv-cr-texte" data-cr-texte>{texteSansPhotos(cr.texte)}</pre>
          {/* 🔴 Arno (13/11/2026, lot B) — structuré : le texte, puis « Photos », chaque photo numérotée, sa légende juste en dessous */}
          {(() => { const legendes = legendesDuTexte(cr.texte); const photos = cr.pieces.slice(0, legendes.length);
            return photos.length === 0 ? null : (
              <div className="pvv-cr-bloc" data-cr-photos><p className="pss-sous-titre">Photos</p>
                <ol className="pvv-cr-photos">{photos.map((x, i) => (
                  <li key={x.id} data-cr-photo={i + 1}>
                    <a href={`/api/admin/location/pieces-sortie?piece=${x.id}`} target="_blank" rel="noopener noreferrer"><img className="pvv-vignette" src={`/api/admin/location/pieces-sortie?piece=${x.id}`} alt={lignePhoto(i, legendes[i])} loading="lazy" /></a>
                    <span className="pvv-cr-legende" data-cr-legende>{lignePhoto(i, legendes[i])}</span>
                  </li>))}</ol>
              </div>); })()}
          {cr.pieces.length > legendesDuTexte(cr.texte).length && (
            <div className="pvv-cr-bloc" data-cr-pieces><p className="pss-sous-titre">Pièces jointes</p>
              <ul className="pvv-cr-liste">{cr.pieces.slice(legendesDuTexte(cr.texte).length).map((x) => (
                <li key={x.id}><a href={`/api/admin/location/pieces-sortie?piece=${x.id}`} target="_blank" rel="noopener noreferrer" data-cr-piece={x.id}>{x.nom}</a>
                  {' '}<span className="loc-muet">({(x.taille / (1024 * 1024)).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo)</span></li>))}</ul>
            </div>)}
          {(cr.vocaux ?? []).length > 0 && (
            <div className="pvv-cr-bloc" data-cr-vocaux><p className="pss-sous-titre">Vocaux <span className="loc-muet">(internes — jamais envoyés)</span></p>
              <ol className="pvv-cr-liste">{(cr.vocaux ?? []).map((v, i) => (
                <li key={v.id} data-cr-vocal={i + 1}><span className="pvv-cr-legende">Vocal {i + 1}</span>
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <audio className="pvv-audio" controls preload="none" src={`/api/admin/location/pieces-sortie?piece=${v.id}`} /></li>))}</ol>
            </div>)}
          <div className="pvv-cr-bloc" data-cr-envois><p className="pss-sous-titre">Envoi par mail</p>
            {cr.aucunEnvoi && <p className="mis-note pss-note-neutre" data-cr-aucun-envoi>{AUCUN_ENVOI_CR}</p>}
            {cr.destinataires.length > 0 && (
              <ul className="pvv-cr-liste">{cr.destinataires.map((d, i) => (
                <li key={`${i}-${d.nom}`} className={`pvv-cr-dest pvv-cr-dest--${d.famille}`} data-cr-destinataire={d.famille} data-cr-etat={d.etat}>
                  <span className="pvv-cr-famille"><span aria-hidden="true" className="pvv-cr-pastille" />{LIBELLE_FAMILLE_CR[d.famille]}</span>
                  <strong className="pvv-cr-nom">{d.nom}</strong>
                  <span className="pvv-cr-quand">{d.quand ? quandFr(d.quand) : '—'}</span>
                  <span className={`pvv-cr-etat pvv-cr-etat--${d.etat}`}>{LIBELLE_ETAT_CR[d.etat]}{d.motif ? ` (${d.motif})` : ''}</span>
                </li>))}</ul>)}
          </div>
        </>}
        <div className="mis-actions">
          <button type="button" className="svv-btn svv-btn-primary gst-btn mis-action" onClick={onFermer} data-fermer-compte-rendu>Fermer</button>
        </div>
      </div>
    </div>
  );
  return typeof document === 'undefined' ? boite : createPortal(boite, document.querySelector('.svv-adm-root') ?? document.body);
}

/** AUCUN ACCENT GRAVE DANS CE LITTERAL. Jetons du theme ; cibles de 44 px ; une colonne au telephone. */
export const CSS_PREVISITE = `
.pvv-voir-cr{margin-top:8px}
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
.pvv-cr-dest{display:flex;flex-wrap:wrap;gap:4px 12px;align-items:center;padding:6px 10px;border-radius:10px;border-left:4px solid var(--color-svv-line-strong);background:var(--color-svv-surface)}
.pvv-cr-dest--locataire{border-left-color:var(--color-svv-green)}
.pvv-cr-dest--proprietaire{border-left-color:var(--color-svv-red)}
.pvv-cr-famille{flex:0 0 7.5rem;display:inline-flex;align-items:center;gap:6px;font-size:.78rem;font-weight:900;letter-spacing:.05em;text-transform:uppercase}
.pvv-cr-pastille{display:inline-block;width:10px;height:10px;border-radius:999px;background:var(--color-svv-line-strong)}
.pvv-cr-dest--locataire .pvv-cr-pastille{background:var(--color-svv-green)}
.pvv-cr-dest--proprietaire .pvv-cr-pastille{background:var(--color-svv-red)}
.pvv-cr-nom{flex:1 1 10rem;min-width:8rem;overflow-wrap:break-word}
.pvv-cr-quand{font-size:.86rem;color:var(--color-svv-muted);white-space:nowrap}
.pvv-cr-etat{font-weight:800}
.pvv-cr-etat--envoye{color:var(--color-svv-green-ink)}
.pvv-cr-etat--echec{color:var(--color-svv-red)}
.pvv-cr-etat--non_envoye{color:var(--color-svv-red)}
@media (max-width:600px){.pvv-cr-famille{flex-basis:100%}}
.pvv-cartouche{display:inline-flex;align-items:center;padding:4px 10px;border-radius:999px;font-size:.82rem;font-weight:800;white-space:nowrap}
.pvv-cartouche--alerte{background:var(--color-svv-urgence-orange);color:var(--color-svv-surface)}
.pvv-cartouche--refus{background:var(--color-svv-red);color:var(--color-svv-surface)}
.pvv-compteur{display:inline-flex;min-width:1.4em;justify-content:center;margin-left:4px;padding:0 6px;border-radius:999px;background:var(--color-svv-field);color:var(--color-svv-ink);font-weight:800}
.pvv-pastille--alerte{border-color:var(--color-svv-urgence-orange)}
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
`;
