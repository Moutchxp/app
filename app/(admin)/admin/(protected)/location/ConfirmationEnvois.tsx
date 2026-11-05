'use client';

import { useCallback, useEffect, useId, useState, type ReactNode } from 'react';
import { ModaleIssue, type ActionIssue } from './ModaleIssue';
import {
  libelleMail, lienDestinataires, messagesConfirmation, titreConfirmation, type ActionLocation, type IssueEnvois,
} from '../../../../lib/location/confirmationEnvois';

/**
 * ══ 🔴 Arno (05/11/2026) — LE PICTO « i » ET LA MODALE DE CONFIRMATION des validations de la Location (nouvelle location, préavis,
 * sortie). Le picto lit, À CHAQUE OUVERTURE, les adresses configurées dans « Paramètres Location > Destinataires mails » pour ce type
 * d'action (« Destinataires » / « En copie ») ; la modale dit ce que le SERVEUR a réellement envoyé (règles : `confirmationEnvois.ts`).
 * Ni l'un ni l'autre ne change le choix « enregistrer » / « enregistrer + informer nos partenaires ».
 */

const API = '/api/admin/location';
type Adresse = { adresse: string; libelle: string };
type Lu = { etat: 'charge' } | { etat: 'erreur' } | { etat: 'ok'; destinataires: Adresse[]; copies: Adresse[] };

const ligne = (d: Adresse) => (d.libelle !== '' ? `${d.libelle} — ${d.adresse}` : d.adresse);

/** Le picto « i » : au survol ou au clic (le clic l'épingle, utile au téléphone) ; Échap le ferme. */
export function InfoDestinataires({ action }: { action: ActionLocation }) {
  const [ouvert, setOuvert] = useState(false);
  const [epingle, setEpingle] = useState(false);
  const [lu, setLu] = useState<Lu>({ etat: 'charge' });
  const id = useId();
  const lire = useCallback(async (): Promise<void> => {
    setLu({ etat: 'charge' });
    try {
      const r = await fetch(`${API}?destinatairesMails=${action}`, { cache: 'no-store' });
      const d = await r.json() as { etat?: string; data?: { destinataires: Adresse[]; copies: Adresse[] } };
      setLu(d.etat === 'ok' && d.data !== undefined ? { etat: 'ok', destinataires: d.data.destinataires, copies: d.data.copies } : { etat: 'erreur' });
    } catch {
      setLu({ etat: 'erreur' });
    }
  }, [action]);
  const montrer = (): void => { if (!ouvert) { setOuvert(true); void lire(); } };
  const cacher = (): void => { setOuvert(false); setEpingle(false); };
  useEffect(() => {
    if (!ouvert) return;
    const clavier = (e: KeyboardEvent): void => { if (e.key === 'Escape') { e.stopPropagation(); cacher(); } };
    window.addEventListener('keydown', clavier);
    return () => window.removeEventListener('keydown', clavier);
  }, [ouvert]);
  return (
    <span className="cev-info" data-info-destinataires={action} onMouseEnter={montrer} onMouseLeave={() => { if (!epingle) setOuvert(false); }}>
      <style>{CSS_CONFIRMATION_ENVOIS}</style>
      <button type="button" className="cev-i" aria-label="Voir les destinataires des mails" aria-expanded={ouvert} aria-controls={id}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (epingle) cacher(); else { setEpingle(true); montrer(); } }} data-picto-i>i</button>
      {ouvert && (
        <span id={id} className="cev-bulle" role="note" data-bulle-destinataires>
          {lu.etat === 'charge' ? <span className="cev-muet">Lecture…</span> : lu.etat === 'erreur' ? <span className="cev-muet">Lecture impossible.</span> : (
            <>
              <span className="cev-bulle-titre">Destinataires</span>
              {lu.destinataires.length === 0 ? (
                <span className="cev-vide" data-aucun-destinataire>Aucun destinataire configuré —{' '}
                  <a href={lienDestinataires(action)} data-lien-destinataires>Paramètres Location › Destinataires mails</a></span>
              ) : <span className="cev-liste">{lu.destinataires.map((d) => <span key={d.adresse} className="cev-ligne" data-destinataire={d.adresse}>{ligne(d)}</span>)}</span>}
              <span className="cev-bulle-titre">En copie</span>
              {lu.copies.length === 0 ? <span className="cev-muet">Aucune copie.</span>
                : <span className="cev-liste">{lu.copies.map((d) => <span key={d.adresse} className="cev-ligne" data-copie={d.adresse}>{ligne(d)}</span>)}</span>}
            </>
          )}
        </span>
      )}
    </span>
  );
}

/** Les messages et les blocs de mails (un par mail, avec objet, destinataires, copies) — d'après la réponse du serveur. */
export function BlocsEnvois({ issue }: { issue: IssueEnvois }) {
  return (
    <div className="cev-corps" data-confirmation-envois>
      <style>{CSS_CONFIRMATION_ENVOIS}</style>
      {messagesConfirmation(issue).map((m) => (
        <p key={m.texte} className={m.alerte ? 'cev-alerte' : 'cev-message'} {...(m.alerte ? { role: 'alert', 'data-message-echec': '' } : { 'data-message-confirmation': '' })}>{m.texte}</p>
      ))}
      {issue.mails.length > 0 && (
        <ul className="cev-mails">
          {issue.mails.map((m, i) => (
            <li key={`${i}-${m.sorte}`} className={m.envoye ? 'cev-mail' : 'cev-mail cev-mail--echec'} data-mail-parti={m.sorte} data-envoye={m.envoye ? 'oui' : 'non'}>
              <p className="cev-mail-titre">{libelleMail(m)} <span className={m.envoye ? 'cev-ok' : 'cev-ko'}>{m.envoye ? '— envoyé' : '— NON ENVOYÉ'}</span></p>
              <dl className="cev-dl">
                <dt>Objet</dt><dd data-objet>{m.objet ?? '—'}</dd>
                <dt>Destinataires</dt><dd data-a>{m.a.length > 0 ? m.a.join(', ') : '—'}</dd>
                <dt>En copie</dt><dd data-cc>{m.cc.length > 0 ? m.cc.join(', ') : 'aucune'}</dd>
              </dl>
              {!m.envoye && <p className="cev-alerte" role="alert" data-echec-envoi>Échec de l’envoi à {m.a.length > 0 ? m.a.join(', ') : 'aucune adresse'}{m.motif ? ` : ${m.motif}` : ''}.</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** La modale de confirmation : le rappel de l'action, les blocs des mails ; « Fermer » seul (sauf actions fournies). */
export function ModaleEnvois({ issue, rappel, onFermer, actions }: {
  issue: IssueEnvois; rappel: [string, ReactNode][]; onFermer: () => void; actions?: ActionIssue[];
}) {
  const echec = issue.motifGlobal !== null || issue.mails.some((m) => !m.envoye);
  return (
    <ModaleIssue sorte={echec ? 'attention' : 'succes'} titre={titreConfirmation(issue)} lignes={rappel} onFermer={onFermer}
      actions={actions ?? [{ libelle: 'Fermer', onClick: onFermer, principal: true, repere: 'fermer-confirmation' }]}>
      <BlocsEnvois issue={issue} />
    </ModaleIssue>
  );
}

/** AUCUN ACCENT GRAVE DANS CE LITTERAL. Jetons du theme ; cible de 44 px pour le picto au telephone. */
export const CSS_CONFIRMATION_ENVOIS = `
.cev-info{position:relative;display:inline-flex;align-items:center;vertical-align:middle}
.cev-i{appearance:none;width:26px;height:26px;min-width:26px;border-radius:999px;border:1.5px solid var(--color-svv-ink);background:var(--color-svv-surface);color:var(--color-svv-ink);font:inherit;font-size:.85rem;font-weight:800;font-style:italic;line-height:1;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0;margin:9px}
.cev-i[aria-expanded="true"]{background:var(--color-svv-ink);color:var(--color-svv-surface)}
.cev-bulle{position:absolute;z-index:70;bottom:calc(100% + 4px);right:0;width:min(340px,80vw);display:flex;flex-direction:column;gap:4px;padding:12px 14px;border-radius:12px;border:1px solid var(--color-svv-line-strong);background:var(--color-svv-surface);color:var(--color-svv-ink);box-shadow:0 16px 32px -12px color-mix(in srgb, var(--color-svv-ink) 40%, transparent);font-size:.88rem;font-weight:400;line-height:1.4;text-align:left;white-space:normal;overflow-wrap:anywhere}
.cev-bulle-titre{font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.03em;color:var(--color-svv-muted);margin-top:4px}
.cev-liste{display:flex;flex-direction:column;gap:2px}
.cev-muet{color:var(--color-svv-muted)}
.cev-vide a{color:var(--color-svv-red);font-weight:700}
.cev-corps{display:flex;flex-direction:column;gap:10px}
.cev-message{margin:0;line-height:1.45}
.cev-alerte{margin:0;color:var(--color-svv-red);font-weight:700;overflow-wrap:anywhere}
.cev-mails{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.cev-mail{border:1px solid var(--color-svv-line);border-left:4px solid var(--color-svv-green-ink);border-radius:10px;padding:10px 12px}
.cev-mail--echec{border-color:var(--color-svv-red);border-left-color:var(--color-svv-red)}
.cev-mail-titre{margin:0 0 6px;font-weight:800}
.cev-ok{color:var(--color-svv-green-ink);font-weight:700}
.cev-ko{color:var(--color-svv-red);font-weight:800}
.cev-dl{margin:0;display:grid;grid-template-columns:auto minmax(0,1fr);gap:2px 10px;font-size:.9rem}
.cev-dl dt{color:var(--color-svv-muted);font-weight:700}
.cev-dl dd{margin:0;overflow-wrap:anywhere}
@media (max-width:640px){ .cev-bulle{position:fixed;left:16px;right:16px;bottom:auto;top:30%;width:auto} }
`;
