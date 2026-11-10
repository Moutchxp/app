'use client';

import { useCallback, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { lireApercuEnvois, type ApercuEnvois, type IssueGeste } from './tachesClient';
import { CSS_MODALE_ISSUE } from '../location/ModaleIssue';
import { CSS_PARCOURS, TexteDuMail } from '../location/ParcoursPreavisSortie';
import { BlocsEnvois, CSS_CONFIRMATION_ENVOIS } from '../location/ConfirmationEnvois';
import type { MailParti } from '../../../../lib/location/confirmationEnvois';

/**
 * ══ 🔴🔴 LE RÉCAPITULATIF AVANT TOUT ENVOI, PUIS LE RÉSULTAT — TOUS LES GESTES D'UNE TÂCHE (Arno, 10/11/2026) ═════════════════════════
 *
 * Arno : « Avant tout envoi : modale de récapitulatif avec la liste des destinataires (collaborateurs et contacts extérieurs, séparés), le
 * nombre total d'invitations qui vont partir, l'aperçu du texte reçu par un collaborateur et par un extérieur, et les boutons « Revenir »
 * (garde toute la saisie) et « Confirmer et envoyer ». Après confirmation : modale de résultat qui confirme l'action, le nombre de
 * destinataires et leurs noms, d'après la réponse du serveur (échec en rouge). Même chose à la modification, au décalage, à la réaffectation
 * et au renvoi d'une invitation. »
 *
 * UN SEUL code pour tous les points d'entrée (création, modification, décalage, renvoi, changement de destinataire) : `useRecapEnvois`.
 * « Revenir » ne touche à rien : la saisie vit dans l'écran qui a demandé le récapitulatif. Aucun envoi prévu : le geste se fait sans fenêtre.
 */

type Etat =
  | { etape: 'recap'; titre: string; apercu: ApercuEnvois | null; erreur: string | null; occupe: boolean }
  | { etape: 'resultat'; titre: string; issue: IssueGeste };

interface Demande { titre: string; apercu: Record<string, unknown>; action: () => Promise<IssueGeste> }

const ETATS_PARTIS = new Set(['envoye', 'factice']);
const MOTIF_ETAT: Record<string, string> = {
  desactive: 'l’envoi des demandes par mail est désactivé dans les réglages des tâches', sans_droit: 'pas de droit d’envoi au nom de gestion@',
  echec: 'échec de l’envoi', aucun: 'aucun mail (acceptée d’office)',
};
/** Les mails du résultat, tels que le serveur les rend. PUR. */
export function mailsDuResultat(r: IssueGeste): MailParti[] {
  if (!r.ok) return [];
  return [
    ...(r.collaborateurs ?? []).map((c) => ({ sorte: 'tache_collaborateur', objet: null, a: [c.destinataire], cc: [], envoye: ETATS_PARTIS.has(c.etat),
      motif: ETATS_PARTIS.has(c.etat) ? null : MOTIF_ETAT[c.etat] ?? c.etat })),
    ...(r.exterieurs ?? []).map((e) => ({ sorte: 'tache_exterieur', objet: null, a: [e.email ? `${e.nom} <${e.email}>` : e.nom], cc: [], envoye: e.envoye, motif: e.motif })),
  ];
}

export function useRecapEnvois(): { demander: (d: Demande) => Promise<IssueGeste | null>; fenetre: ReactNode } {
  const [etat, setEtat] = useState<Etat | null>(null);
  const courant = useRef<{ d: Demande; resoudre: (r: IssueGeste | null) => void } | null>(null);
  const demander = useCallback((d: Demande) => new Promise<IssueGeste | null>((resoudre) => {
    void (async () => {
      const a = await lireApercuEnvois(d.apercu);
      if (!('erreur' in a) && a.collaborateurs.length === 0 && a.exterieurs.length === 0) {
        resoudre(await d.action()); // aucun envoi prévu : le geste, sans fenêtre
        return;
      }
      courant.current = { d, resoudre };
      setEtat({ etape: 'recap', titre: d.titre, apercu: 'erreur' in a ? null : a, erreur: 'erreur' in a ? a.erreur : null, occupe: false });
    })();
  }), []);
  const revenir = (): void => { courant.current?.resoudre(null); courant.current = null; setEtat(null); };
  const confirmer = async (): Promise<void> => {
    const c = courant.current;
    if (c === null) return;
    setEtat((e) => (e && e.etape === 'recap' ? { ...e, occupe: true } : e));
    const r = await c.d.action();
    if (!r.ok) { setEtat((e) => (e && e.etape === 'recap' ? { ...e, occupe: false, erreur: r.message } : e)); return; }
    setEtat({ etape: 'resultat', titre: c.d.titre, issue: r });
  };
  const fermer = (): void => {
    const c = courant.current;
    const r = etat?.etape === 'resultat' ? etat.issue : null;
    courant.current = null; setEtat(null); c?.resoudre(r);
  };
  return { demander, fenetre: etat === null ? null : <FenetreRecapEnvois etat={etat} onRevenir={revenir} onConfirmer={() => { void confirmer(); }} onFermer={fermer} /> };
}

function FenetreRecapEnvois({ etat, onRevenir, onConfirmer, onFermer }: { etat: Etat; onRevenir: () => void; onConfirmer: () => void; onFermer: () => void }) {
  const titreId = useId();
  let contenu: ReactNode;
  if (etat.etape === 'recap') {
    const a = etat.apercu;
    contenu = <>
      <h2 id={titreId} className="mis-titre" data-titre-recap-envois>Récapitulatif — {etat.titre}</h2>
      <p className="loc-muet pss-rien">Rien n’est encore enregistré ni envoyé : vérifiez, puis « Confirmer et envoyer ».</p>
      {a === null ? null : <>
        <p className="pss-sous-titre" data-total-envois>{a.total === 0 ? 'Aucune invitation ne partira.' : a.total === 1 ? '1 invitation partira.' : `${a.total} invitations partiront.`}</p>
        <div className="rce-groupe" data-recap-collaborateurs>
          <p className="rce-mot">Collaborateurs de l’agence ({a.collaborateurs.length})</p>
          {a.collaborateurs.length === 0 ? <p className="loc-muet">Aucun.</p> : <ul className="rce-liste">{a.collaborateurs.map((c, i) => (
            <li key={`${i}-${c.libelle}`} data-mail={c.mail ? 'oui' : 'non'}>{c.libelle}{c.mail ? ' — invitation par mail' : ` — aucun mail : ${c.motif ?? ''}`}</li>))}</ul>}
        </div>
        <div className="rce-groupe" data-recap-exterieurs>
          <p className="rce-mot">Contacts extérieurs ({a.exterieurs.length})</p>
          {a.exterieurs.length === 0 ? <p className="loc-muet">Aucun : un contact ne reçoit rien sans sa case « Envoyer une invitation ».</p>
            : <ul className="rce-liste">{a.exterieurs.map((e, i) => (
              <li key={`${i}-${e.nom}`} data-mail={e.mail ? 'oui' : 'non'}>{e.nom}{e.email ? ` <${e.email}>` : ''} — {e.mail ? (e.sorte === 'invitation' ? 'invitation' : e.sorte === 'modification' ? 'modification du rendez-vous' : 'annulation') : `aucun mail : ${e.motif ?? ''}`}</li>))}</ul>}
        </div>
        {a.texteCollaborateur !== null && <div className="rce-groupe" data-texte-collaborateur><p className="rce-mot">Texte reçu par un collaborateur (complet)</p><TexteDuMail texte={a.texteCollaborateur} ouvert={false} /></div>}
        {a.texteExterieur !== null && <div className="rce-groupe" data-texte-exterieur><p className="rce-mot">Texte reçu par un contact extérieur (sans aucune coordonnée de tiers)</p><TexteDuMail texte={a.texteExterieur} ouvert /></div>}
      </>}
      {etat.erreur !== null && <p className="cev-alerte" role="alert" data-recap-erreur>{etat.erreur}</p>}
      <div className="mis-actions">
        <button type="button" className="svv-btn svv-btn-outline gst-btn mis-action" onClick={onRevenir} disabled={etat.occupe} data-revenir-recap>Revenir</button>
        <button type="button" className="svv-btn svv-btn-primary gst-btn mis-action" onClick={onConfirmer} disabled={etat.occupe || a === null} data-confirmer-recap>
          {etat.occupe ? 'Envoi…' : 'Confirmer et envoyer'}</button>
      </div>
    </>;
  } else {
    const mails = mailsDuResultat(etat.issue);
    const partis = mails.filter((m) => m.envoye).length;
    contenu = <>
      <h2 id={titreId} className="mis-titre" data-titre-resultat-envois>✓ {etat.titre}</h2>
      <p className="cev-message" data-resultat-message>{etat.issue.message}</p>
      <p className="pss-sous-titre" data-resultat-nombre>{partis} destinataire{partis > 1 ? 's' : ''} {partis > 1 ? 'ont' : 'a'} reçu le mail{mails.length > partis ? ` ; ${mails.length - partis} non envoyé${mails.length - partis > 1 ? 's' : ''}` : ''}.</p>
      <BlocsEnvois issue={{ informer: false, mails, motifGlobal: mails.length === 0 ? 'Aucun mail n’est parti pour cette opération.' : null }} />
      <div className="mis-actions"><button type="button" className="svv-btn svv-btn-primary gst-btn mis-action" onClick={onFermer} data-fermer-resultat>Fermer</button></div>
    </>;
  }
  const echec = etat.etape === 'resultat' && mailsDuResultat(etat.issue).some((m) => !m.envoye);
  const boite = (
    <div className="mis-voile">
      <style>{CSS_PARCOURS + CSS_MODALE_ISSUE + CSS_CONFIRMATION_ENVOIS + CSS_RECAP_ENVOIS}</style>
      <div className={`mis-boite pss-boite ${etat.etape === 'resultat' ? (echec ? 'mis-boite--attention' : 'mis-boite--succes') : 'pss-boite-recap'}`} role="dialog" aria-modal="true"
        aria-labelledby={titreId} data-fenetre-envois={etat.etape}>{contenu}</div>
    </div>
  );
  return typeof document === 'undefined' ? boite : createPortal(boite, document.querySelector('.svv-adm-root') ?? document.body);
}

/* AUCUN ACCENT GRAVE DANS CE LITTERAL. Jetons du theme. */
export const CSS_RECAP_ENVOIS = `
.rce-groupe{display:flex;flex-direction:column;gap:4px}
.rce-mot{margin:0;font-weight:800}
.rce-liste{margin:0;padding-left:18px;display:flex;flex-direction:column;gap:2px;overflow-wrap:anywhere}
.rce-liste li[data-mail="non"]{color:var(--color-svv-muted)}
`;
