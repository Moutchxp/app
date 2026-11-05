'use client';

import { useEffect, useState } from 'react';
import { dateHeureEnvoi, libelleEnvoiHistorique } from '../../../../lib/location/mailNouvelleLocation';
import { EVENEMENT_ENVOI_LOCATION } from '../location/EnvoiAdhocMonga';

/**
 * ══ 🔴 « ENVOIS ADHOC & MONGA (N) » DANS L'HISTORIQUE DU BIEN (Arno, 21/10/2026) ═══════════════════════════════════════════
 *
 * ARNO : « Chaque envoi apparaît dans l'“Historique” du bien (événement “Mail Nouvelle location envoyé à N destinataires par
 * <Prénom Nom>”, avec le message d'accompagnement s'il y en a un). »
 *
 * 🔴 UNE BANDE REPLIABLE, À CÔTÉ DE « Historique des tâches » (même gabarit `hdb-groupe`) : la liste des mails de l'Historique
 * n'est pas touchée (elle ne porte que des mails rattachés). Une ligne par envoi RÉUSSI, du plus récent au plus ancien : date et
 * heure, la phrase, et le message d'accompagnement dessous. Sans aucun envoi : la bande n'apparaît pas. Repliée par défaut.
 *
 * ⚠️ AUCUN IMPORT QUI TIRE `pg` : la lecture passe par la route `/api/admin/gestion/historique/envois-location`.
 */
interface EnvoiLu { id: number; bailId: number; quand: string; par: string; n: number; message: string | null }
/** Arno (05/11/2026) — un mail de préavis ou de sortie du bien (journal 457), lu par la même route. */
interface AvisLu { id: number; sorte: string; quand: string; par: string; a: string[]; cc: string[]; objet: string; texte: string; statut: string }

export function HistoriqueEnvoisLocation({ lotId }: { lotId: number }) {
  const [envois, setEnvois] = useState<EnvoiLu[] | null>(null);
  const [avis, setAvis] = useState<AvisLu[]>([]);
  const [ouvert, setOuvert] = useState(false);
  // Relue après un envoi réussi depuis la même page (fenêtre « Envoi ADHOC & MONGA »).
  const [tour, setTour] = useState(0);
  useEffect(() => {
    const relire = (): void => setTour((t) => t + 1);
    window.addEventListener(EVENEMENT_ENVOI_LOCATION, relire);
    return () => window.removeEventListener(EVENEMENT_ENVOI_LOCATION, relire);
  }, []);
  useEffect(() => {
    let vivant = true;
    fetch(`/api/admin/gestion/historique/envois-location?lot=${lotId}`, { headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then((r) => r.json())
      .then((d: { etat?: string; envois?: unknown; avis?: unknown }) => {
        if (!vivant) return;
        setEnvois(d.etat === 'ok' && Array.isArray(d.envois) ? d.envois as EnvoiLu[] : []);
        setAvis(d.etat === 'ok' && Array.isArray(d.avis) ? d.avis as AvisLu[] : []);
      })
      .catch(() => { if (vivant) setEnvois([]); });
    return () => { vivant = false; };
  }, [lotId, tour]);

  if (envois === null) return null;
  return (
    <>
      {envois.length > 0 && <BandeEnvois envois={envois} ouvert={ouvert} setOuvert={setOuvert} />}
      {avis.length > 0 && <BandeMailsAvis avis={avis} />}
    </>
  );
}

function BandeEnvois({ envois, ouvert, setOuvert }: { envois: EnvoiLu[]; ouvert: boolean; setOuvert: (f: (v: boolean) => boolean) => void }) {
  return (
    <section className="hdb-groupe hdb-groupe--bande hdb-groupe--envois" data-historique-envois-location>
      <style>{CSS_HISTORIQUE_ENVOIS}</style>
      <div className="hdb-groupe-tete">
        <button type="button" className="hdb-replier" aria-expanded={ouvert} onClick={() => setOuvert((v) => !v)}>
          <span aria-hidden="true" className={`hdb-triangle${ouvert ? ' hdb-triangle--ouvert' : ''}`}>▶</span>
          Envois ADHOC &amp; MONGA
          <span className="gst-compte">{envois.length}</span>
        </button>
      </div>
      {ouvert && (
        <ul className="hde-liste">
          {envois.map((e) => (
            <li key={e.id} className="hde-ligne" data-envoi-historique={e.id}>
              <span className="hde-date">{dateHeureEnvoi(e.quand)}</span>
              <span className="hde-titre">{libelleEnvoiHistorique(e)}</span>
              {e.message !== null && e.message.trim() !== '' && <span className="hde-message" data-envoi-message>{e.message}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const LIBELLE_AVIS: Record<string, string> = {
  preavis_locataires: 'Accusé de réception du congé (locataires)',
  preavis_adhoc: 'Information préavis (ADHOC)',
  sortie_adhoc: 'Information sortie (ADHOC)',
};

/**
 * ══ 🔴 Arno (05/11/2026) — « MAILS DE PRÉAVIS ET DE SORTIE (N) » : chaque mail envoyé depuis la Location pour CE bien (accusé aux
 * locataires, information à ADHOC), même gabarit que la bande ci-dessus, repliée par défaut. Une ligne par mail : date et heure,
 * sorte, objet, destinataires et copies, qui l'a validé ; le texte tel qu'il est parti se déplie. Un envoi en échec le dit.
 */
function BandeMailsAvis({ avis }: { avis: AvisLu[] }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <section className="hdb-groupe hdb-groupe--bande hdb-groupe--envois" data-historique-mails-avis>
      <style>{CSS_HISTORIQUE_ENVOIS}</style>
      <div className="hdb-groupe-tete">
        <button type="button" className="hdb-replier" aria-expanded={ouvert} onClick={() => setOuvert((v) => !v)}>
          <span aria-hidden="true" className={`hdb-triangle${ouvert ? ' hdb-triangle--ouvert' : ''}`}>▶</span>
          Mails de préavis et de sortie
          <span className="gst-compte">{avis.length}</span>
        </button>
      </div>
      {ouvert && (
        <ul className="hde-liste">
          {avis.map((m) => (
            <li key={m.id} className="hde-ligne" data-mail-avis={m.id} data-sorte={m.sorte}>
              <span className="hde-date">{dateHeureEnvoi(m.quand)}</span>
              <span className="hde-titre">{LIBELLE_AVIS[m.sorte] ?? m.sorte} — « {m.objet} »{m.statut === 'echec' ? ' — NON ENVOYÉ' : ''}</span>
              <span className="hde-message">À : {m.a.join(', ')}{m.cc.length > 0 ? ` · Cc : ${m.cc.join(', ')}` : ''} · validé par {m.par}</span>
              <details className="hde-details"><summary>Lire le mail</summary><div className="hde-message" data-texte-avis>{m.texte}</div></details>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* AUCUN ACCENT GRAVE DANS CE LITTERAL. Jetons seulement (Clair et Sombre). Sur telephone, les informations passent l une sous l autre. */
export const CSS_HISTORIQUE_ENVOIS = `
.hde-liste{list-style:none;margin:4px 0 0;padding:0;display:flex;flex-direction:column;gap:4px}
.hde-ligne{display:flex;flex-wrap:wrap;align-items:baseline;gap:.25rem .75rem;padding:.5rem .6rem;min-height:44px;box-sizing:border-box;
  font-size:.86rem;color:var(--color-svv-ink);background:var(--color-svv-surface);border:1px solid var(--color-svv-line);border-radius:.5rem}
.hde-date{font-weight:600;white-space:nowrap}
.hde-titre{font-weight:600;flex:1 1 14rem;min-width:0;overflow-wrap:anywhere}
.hde-details{flex:1 1 100%;min-width:0}
.hde-details summary{cursor:pointer;min-height:44px;display:flex;align-items:center;font-weight:600}
.hde-message{flex:1 1 100%;color:var(--color-svv-muted);white-space:pre-wrap;overflow-wrap:anywhere;border-left:3px solid var(--color-svv-line-strong);padding-left:.6rem}
`;
