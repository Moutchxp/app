'use client';

import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { EtatLecture, envoyer, useLecture } from './commun';
import { MENTION_RESERVE_LOCATION, useContextePreavis } from './preavisSynchro';
import { CSS_MODALE_ISSUE } from './ModaleIssue';
import { BlocsEnvois, CSS_CONFIRMATION_ENVOIS } from './ConfirmationEnvois';
import { CSS_PARCOURS, TexteDuMail } from './ParcoursPreavisSortie';
import { libelleMail, type MailParti } from '../../../../lib/location/confirmationEnvois';
import { ajouterMois, dateFrPreavis, EDL_MOIS_APRES_FIN, type LignePreavisAccueil } from '../../../../lib/location/preavis';
import { heureFinProposee, heureFr } from '../../../../lib/location/edls';
import {
  ALERTE_TOUS_REFUSENT, CARTOUCHE_ALERTE, LIBELLE_STATUT_PREVISITE, creneauFr, objetCompteRendu, pastillesPrevisite, verifierRdvPrevisite,
  type PrevisiteAffiche, type StatutPrevisite,
} from '../../../../lib/location/previsite';

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
  if (p === null) return null;
  const programmee = p.statut === 'programmee' && p.rdv !== null;
  // 🔴 Arno (10/11/2026, option A) — sans le droit « Location » : les boutons restent visibles, INACTIFS, avec la mention.
  const { ecriture } = useContextePreavis();
  const inactif = ecriture ? {} : { disabled: true, title: MENTION_RESERVE_LOCATION, 'aria-disabled': true } as const;
  return (
    <div className="pva-bloc" data-bloc-previsite data-statut-previsite={p.statut}>
      <p className="pvs-libelle" style={{ margin: 0 }}>Pré-visite d’état des lieux de sortie</p>
      <p className={`pvv-etat pvv-etat--${p.statut}`} role="status" data-previsite-etat>
        {LIBELLE_STATUT_PREVISITE[p.statut]}{p.rdv && (p.statut === 'programmee' || p.statut === 'effectuee') ? ` — le ${creneauFr(p.rdv)}` : ''}</p>
      <CartouchesPrevisite p={p} />
      {p.collegues.length > 0 && p.statut === 'programmee' && (
        <ul className="pvv-collegues" data-previsite-collegues>
          {p.collegues.map((c, i) => (
            <li key={`${i}-${c.libelle}`} data-collegue-statut={c.statut ?? 'inconnu'}>{c.libelle} : {LIBELLE_REPONSE[c.statut ?? ''] ?? '—'}{c.statut === 'refusee' && c.motif ? ` (${c.motif})` : ''}</li>
          ))}
        </ul>
      )}
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
      {geste !== null && ecriture && <FenetrePrevisite geste={geste} l={l} p={p} onFermer={(fait) => { setGeste(null); if (fait) apres(); }} />}
    </div>
  );
}

interface MailApercu { sorte: string; objet: string; a: string[]; cc: string[]; texte: string; piece?: string | null }
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

function FenetrePrevisite({ geste, l, p, onFermer }: { geste: Geste; l: LignePreavisAccueil; p: PrevisiteAffiche; onFermer: (fait: boolean) => void }) {
  const titreId = useId();
  const [etape, setEtape] = useState<Etape>({ etape: 'saisie' });
  const [envoi, setEnvoi] = useState(false);
  const [refus, setRefus] = useState<string | null>(null);
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
  const saisieOk = avecDate ? verdict?.ok === true : geste === 'reaffecter' ? dest.length > 0 : geste === 'compte_rendu' ? corps.trim() !== '' : (texteRefus ?? '').trim() !== '';
  const corpsCommun = { occupationIds: l.occupationIds };
  const rdvActuel = p.rdv;

  const voirRecap = async (): Promise<void> => {
    setEnvoi(true); setRefus(null);
    const r = await envoyer(geste === 'compte_rendu' ? { action: 'apercu-compte-rendu-previsite', ...corpsCommun, corps, aussiLocataires }
      : geste === 'refus' ? { action: 'apercu-refus-previsite', ...corpsCommun, texte: texteRefus ?? '' }
        : geste === 'reaffecter' && rdvActuel ? { action: 'apercu-previsite', ...corpsCommun, jour: rdvActuel.jour, debut: rdvActuel.heure, fin: fin0 || rdvActuel.heure, destinataires: dest }
          : { action: 'apercu-previsite', ...corpsCommun, jour, debut, fin, destinataires: dest, deplacer: deplacement }, { propre: true });
    setEnvoi(false);
    if (r.motif !== null) { setRefus(r.motif); return; }
    const d = (r.data ?? {}) as { mails?: MailApercu[]; sansEmail?: string[] };
    // Réaffecter : seules les invitations des collègues partent (les locataires ne sont pas prévenus d'un changement de collègue).
    const mails = (d.mails ?? []).filter((m) => geste !== 'reaffecter' || m.sorte === 'previsite_invitation');
    setEtape({ etape: 'recap', mails, sansEmail: geste === 'reaffecter' ? [] : d.sansEmail ?? [] });
  };

  const confirmer = async (): Promise<void> => {
    setEnvoi(true); setRefus(null);
    const action = geste === 'rdv' ? 'programmer-previsite' : geste === 'deplacer' ? 'deplacer-previsite' : geste === 'reaffecter' ? 'reaffecter-previsite'
      : geste === 'compte_rendu' ? 'compte-rendu-previsite' : 'refus-previsite';
    const r = await envoyer({ action, ...corpsCommun, jour, debut, fin, destinataires: dest, corps, aussiLocataires, texte: texteRefus ?? '' }, { propre: true });
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
        <div className="pva-grille-edls">
          <label className="pvs-champ"><span className="pvs-libelle">Date de la pré-visite *</span>
            <input type="date" value={jour} min={l.recuLe} max={ajouterMois(l.dateMax, EDL_MOIS_APRES_FIN)} onChange={(e) => { setJour(e.target.value); setRefus(null); }} data-previsite-jour /></label>
          <label className="pvs-champ"><span className="pvs-libelle">Heure de début *</span>
            <input type="time" value={debut} onChange={(e) => { setDebut(e.target.value); if (!finTouchee) setFin(heureFinProposee(e.target.value)); setRefus(null); }} data-previsite-debut /></label>
          <label className="pvs-champ"><span className="pvs-libelle">Heure de fin *</span>
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
          <textarea value={corps} onChange={(e) => setCorps(e.target.value)} rows={10} data-corps-compte-rendu /></label>
        <label className="pvv-case"><input type="checkbox" checked={aussiLocataires} onChange={(e) => setAussiLocataires(e.target.checked)} data-aussi-locataires />
          <span>Envoyer aussi aux locataires</span></label>
        <p className="loc-muet">Envoyé à tous les collaborateurs ayant accès à Gestion et/ou Location.</p>
      </>}
      {geste === 'refus' && (propose.etat.etat !== 'ok' ? <EtatLecture etat={propose.etat} /> : <>
        <p className="pvs-champ"><span className="pvs-libelle">Objet</span><span>{propose.etat.data.objet}</span></p>
        <label className="pvs-champ"><span className="pvs-libelle">Texte du mail (modifiable) *</span>
          <textarea value={texteRefus ?? ''} onChange={(e) => setTexteRefus(e.target.value)} rows={14} data-texte-refus /></label>
        <p className="loc-muet">Aux locataires, copie à tous les collaborateurs ayant accès à Gestion et/ou Location.</p>
        {p.statut === 'programmee' && p.rdv && <p className="mis-note pss-note-neutre" data-refus-annule-rdv>Une pré-visite est programmée le {creneauFr(p.rdv)} : à l’envoi, elle sera annulée (tâche des collègues annulée) et chaque collègue destinataire recevra un mail d’annulation.</p>}
      </>)}
      {verdict !== null && !verdict.ok && (jour !== '' || debut !== '') && <p className="cp-refus" role="status" data-previsite-message>{verdict.motif}</p>}
      {refus !== null && <p className="cev-alerte" role="alert" data-previsite-refus>{refus}</p>}
      <div className="mis-actions">
        <button type="button" className="svv-btn svv-btn-outline gst-btn mis-action" onClick={() => onFermer(false)} disabled={envoi} data-annuler-previsite>Annuler</button>
        <button type="button" className="svv-btn svv-btn-primary gst-btn mis-action" onClick={() => { void voirRecap(); }} disabled={envoi || !saisieOk} data-recap-previsite>
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
              {m.piece && <><dt>Pièce jointe</dt><dd>{m.piece} (invitation d’agenda)</dd></>}</dl>
            <TexteDuMail texte={m.texte} ouvert />
          </li>))}</ul>
      </>}
      {etape.sansEmail.map((n) => <p key={n} className="mis-note" data-sans-email>⚠ {n} : pas d’adresse e-mail, il ne recevra pas ce mail</p>)}
      {refus !== null && <p className="cev-alerte" role="alert" data-previsite-refus>{refus}</p>}
      <div className="mis-actions">
        <button type="button" className="svv-btn svv-btn-outline gst-btn mis-action" onClick={() => setEtape({ etape: 'saisie' })} disabled={envoi} data-revenir-previsite>Revenir</button>
        <button type="button" className="svv-btn svv-btn-primary gst-btn mis-action" onClick={() => { void confirmer(); }} disabled={envoi} data-confirmer-previsite>
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
    <div className="mis-voile">
      <style>{CSS_PARCOURS + CSS_MODALE_ISSUE + CSS_CONFIRMATION_ENVOIS + CSS_PREVISITE}</style>
      <div className={`mis-boite pss-boite ${etape.etape === 'resultat' ? (echec ? 'mis-boite--attention' : 'mis-boite--succes') : 'pss-boite-recap'}`} role="dialog" aria-modal="true"
        aria-labelledby={titreId} data-fenetre-previsite={etape.etape} data-geste-previsite={geste}>
        {contenu}
      </div>
    </div>
  );
  return typeof document === 'undefined' ? boite : createPortal(boite, document.querySelector('.svv-adm-root') ?? document.body);
}

/** AUCUN ACCENT GRAVE DANS CE LITTERAL. Jetons du theme ; cibles de 44 px ; une colonne au telephone. */
export const CSS_PREVISITE = `
.pvv-cartouche{display:inline-flex;align-items:center;padding:4px 10px;border-radius:999px;font-size:.82rem;font-weight:800;white-space:nowrap}
.pvv-cartouche--alerte{background:var(--color-svv-urgence-orange);color:var(--color-svv-surface)}
.pvv-cartouche--refus{background:var(--color-svv-red);color:var(--color-svv-surface)}
.pvv-compteur{display:inline-flex;min-width:1.4em;justify-content:center;margin-left:4px;padding:0 6px;border-radius:999px;background:var(--color-svv-field);color:var(--color-svv-ink);font-weight:800}
.pvv-pastille--alerte{border-color:var(--color-svv-urgence-orange)}
.pvv-etat{margin:0;padding:8px 10px;border-radius:10px;background:var(--color-svv-field);color:var(--color-svv-ink);font-weight:700;overflow-wrap:anywhere}
.pvv-etat--alerte{background:var(--color-svv-urgence-orange);color:var(--color-svv-surface)}
.pvv-etat--programmee{background:var(--color-svv-blue-soft);color:var(--color-svv-blue)}
.pvv-collegues{margin:0;padding-left:18px;font-size:.9rem}
.pvv-choix{border:0;margin:0;padding:0;display:flex;flex-direction:column;gap:2px}
.pvv-case{display:flex;align-items:center;gap:8px;min-height:44px;cursor:pointer}
.pvv-case input{width:20px;height:20px}
.pss-boite textarea{width:100%;box-sizing:border-box;font:inherit}
.pvv-reserve{margin:0;font-size:.88rem;font-weight:700;color:var(--color-svv-muted)}
`;
