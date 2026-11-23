'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { CSS_LOCATION_ECRANS } from './commun';
import { FicheCopropriete } from '../gestion/FicheCopropriete';
import { arreteFr } from '../../../../lib/location/arreteComptes';
import {
  LIBELLE_MANQUE, libelleAlerte, libelleExercice, MENTION_INCERTAINE, nombreCoproprietesACompleter, TITRE_VINGT_POURCENT, type LigneDatesManquantes, type LigneVingtPourcent, type SuiviVingtLu,
} from '../../../../lib/location/vingtPourcent';

/**
 * ══ 🔴🔴 « 20 % À RESTITUER » (Arno, 23/11/2026) ═════════════════════════════════════════════════════════════════════════════════════════════════
 * En tête, la rubrique « DATES MANQUANTES » : les copropriétés d'au moins un locataire en attente, à qui il manque la dernière AGO et/ou la date
 * d'arrêté des comptes — ce qui manque, les locataires concernés, « Compléter la fiche Copropriété » (la fenêtre de la fiche, la même que dans
 * l'annuaire ; à sa fermeture la liste se relit : une copropriété complétée en sort). Puis les locataires sortis avec 20 % retenus : logement,
 * copropriété, date de sortie, exercice concerné, AGO qui compte (projetée / officielle, « incertaine » si besoin), limite de restitution,
 * alerte (toujours en mots). Tout est CALCULÉ à la lecture (`lireSuiviVingtPourcent`), rien n'est stocké par locataire. LECTURE SEULE.
 * Le même écran sert la Location (`/api/admin/location`) et la Gestion (`/api/admin/gestion/preavis`). Jetons --color-svv-* ; cibles ≥ 44 px.
 * ⚠️ AUCUN IMPORT QUI TIRE `pg` (les types du dépôt seulement).
 */


const dateFr = (d: string): string => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

export { nombreCoproprietesACompleter, TITRE_VINGT_POURCENT };

export function EcranVingtPourcent({ api, retour }: { api: string; retour?: ReactNode }) {
  const [lu, setLu] = useState<{ etat: 'charge' } | { etat: 'erreur'; message: string } | { etat: 'ok'; data: SuiviVingtLu }>({ etat: 'charge' });
  const [version, setVersion] = useState(0);
  const [fiche, setFiche] = useState<LigneDatesManquantes | null>(null);
  useEffect(() => {
    let vivant = true;
    fetch(`${api}?vingtPourcent=1&v=${version}`, { cache: 'no-store' })
      .then(async (r) => ({ statut: r.status, d: await r.json() as { etat?: string; data?: SuiviVingtLu; message?: string } }))
      .then(({ statut, d }) => {
        if (!vivant) return;
        if (d.etat === 'ok' && d.data) setLu({ etat: 'ok', data: d.data });
        else setLu({ etat: 'erreur', message: statut === 403 ? 'Accès refusé.' : d.message ?? 'Lecture impossible.' });
      })
      .catch(() => { if (vivant) setLu({ etat: 'erreur', message: 'Lecture impossible : le serveur n’a pas répondu.' }); });
    return () => { vivant = false; };
  }, [api, version]);
  return (
    <div className="loc-page vgp" data-ecran-vingt-pourcent>
      <style>{CSS_LOCATION_ECRANS + CSS_VINGT_POURCENT}</style>
      {retour}
      <header className="svv-page-head">
        <div className="svv-page-head-ligne"><h1 className="svv-page-title">{TITRE_VINGT_POURCENT}</h1></div>
        <p className="svv-page-sub">Les locataires sortis avec 20 % du dépôt de garantie retenus : l’AGO qui arrête leurs comptes et la date limite de restitution (un mois après l’AGO).</p>
      </header>
      {lu.etat === 'charge' ? <p className="loc-muet" role="status">Lecture…</p>
        : lu.etat === 'erreur' ? <p className="cp-refus" role="alert">{lu.message}</p> : <>
          <DatesManquantes lignes={lu.data.manquantes} onCompleter={setFiche} />
          <section className="vgp-bloc" aria-label="Locataires sortis avec 20 % retenus" data-vgp-liste={lu.data.lignes.length}>
            <h2 className="vgp-titre">Locataires sortis avec 20 % retenus <span className="loc-pastille">{lu.data.lignes.length}</span></h2>
            {lu.data.lignes.length === 0 ? <p className="loc-muet" data-vgp-aucun>Aucun locataire sorti avec 20 % retenus.</p> : (
              <ul className="vgp-liste">{lu.data.lignes.map((l) => <LigneLocataire key={l.sortieId} l={l} />)}</ul>
            )}
          </section>
        </>}
      {fiche !== null && <FicheCopropriete immeuble={fiche.immeuble} lotId={fiche.immeuble === null ? fiche.lotId : null}
        onFerme={() => { setFiche(null); setVersion((v) => v + 1); }} />}
    </div>
  );
}

/** La rubrique « Dates manquantes » : en tête de l'écran. */
function DatesManquantes({ lignes, onCompleter }: { lignes: readonly LigneDatesManquantes[]; onCompleter: (l: LigneDatesManquantes) => void }) {
  return (
    <section className={`vgp-bloc vgp-manquantes${lignes.length > 0 ? ' vgp-manquantes--a-faire' : ''}`} aria-label="Dates manquantes" data-vgp-manquantes={lignes.length}>
      <h2 className="vgp-titre">Dates manquantes <span className={lignes.length > 0 ? 'vgp-pastille' : 'loc-pastille'}>{lignes.length}</span></h2>
      {lignes.length === 0 ? <p className="loc-muet" data-vgp-manquantes-aucune>Toutes les copropriétés concernées ont leur dernière AGO et leur date d’arrêté des comptes.</p> : <>
        <p className="loc-muet vgp-aide">Ces copropriétés ont au moins un locataire en attente de restitution des 20 % : complétez leur fiche pour un suivi complet et fiable.</p>
        <ul className="vgp-liste">
          {lignes.map((m) => (
            <li key={m.cle} className="vgp-carte" data-vgp-manque={m.cle}>
              <p className="vgp-nom">{m.libelle}{m.coproprieteId === null ? <span className="loc-muet"> — bien relié à aucune copropriété</span> : null}</p>
              <p className="vgp-manque" data-vgp-ce-qui-manque={m.manque.join(',')}>Manque : <strong>{m.manque.map((x) => LIBELLE_MANQUE[x]).join(' et ')}</strong></p>
              <p className="vgp-locataires" data-vgp-locataires={m.locataires.length}>
                {m.locataires.length} locataire{m.locataires.length > 1 ? 's' : ''} concerné{m.locataires.length > 1 ? 's' : ''} : {m.locataires.join(', ')}</p>
              <button type="button" className="svv-btn svv-btn-outline gst-btn vgp-completer" onClick={() => onCompleter(m)} data-vgp-completer={m.cle}>
                Compléter la fiche Copropriété</button>
            </li>
          ))}
        </ul>
      </>}
    </section>
  );
}

/** Une ligne de locataire sorti avec 20 % retenus. */
function LigneLocataire({ l }: { l: LigneVingtPourcent }) {
  const s = l.suivi;
  const alerte = s.etat === 'ok' ? s.alerte : 'sans';
  return (
    <li className={`vgp-carte vgp-carte--${alerte}`} data-vgp-sortie={l.sortieId} data-vgp-alerte={alerte}>
      <p className="vgp-nom">{l.locataires.length > 0 ? l.locataires.join(', ') : `Sortie n° ${l.sortieId}`}</p>
      <dl className="vgp-dl">
        <div><dt>Logement</dt><dd>{l.logement ?? `Bien ${l.lotId}`}</dd></div>
        <div><dt>Copropriété</dt><dd>{l.copropriete === null ? 'non renseignée' : l.copropriete.libelle}{l.copropriete?.aRattacher ? ' (à rattacher à une copropriété)' : ''}</dd></div>
        <div><dt>Date de sortie</dt><dd>{dateFr(l.dateSortie)}</dd></div>
        <div><dt>Exercice concerné</dt><dd data-vgp-exercice>{libelleExercice(s.exercice)}{l.arrete !== null ? ` (arrêté au ${arreteFr(l.arrete)})` : ''}</dd></div>
        <div><dt>AGO qui compte</dt><dd data-vgp-ago={s.etat === 'ok' ? `${s.ago.date}:${s.ago.statut}` : 'inconnue'}>
          {s.etat !== 'ok' ? <span className="vgp-inconnue">{s.mention}</span> : <>
            <span className={s.ago.statut === 'projetee' ? 'vgp-projetee' : 'vgp-officielle'}>{dateFr(s.ago.date)} — {s.ago.statut === 'projetee' ? 'date projetée' : 'date officielle'}</span>
            {s.incertaine && <span className="vgp-incertaine" data-vgp-incertaine> · {MENTION_INCERTAINE}</span>}
          </>}</dd></div>
        <div><dt>Restitution au plus tard le</dt><dd data-vgp-limite={s.etat === 'ok' ? s.limite : ''}>{s.etat === 'ok' ? dateFr(s.limite) : '—'}</dd></div>
      </dl>
      {s.etat === 'ok'
        ? <p className={`vgp-alerte vgp-alerte--${s.alerte}`} role={s.alerte === 'a_venir' ? undefined : 'status'} data-vgp-alerte-texte>{libelleAlerte(s.alerte, s.limite, s.joursRestants)}</p>
        : <p className="vgp-alerte vgp-alerte--sans" data-vgp-alerte-texte>Pas de date limite — {s.mention} : à compléter dans la fiche Copropriété.</p>}
    </li>
  );
}

/** AUCUN ACCENT GRAVE DANS CE LITTERAL. Jetons du theme ; cibles de 44 px ; une colonne au telephone. */
export const CSS_VINGT_POURCENT = `
.vgp{display:flex;flex-direction:column;gap:14px;min-width:0}
.vgp-bloc{display:flex;flex-direction:column;gap:10px;padding:14px;border:1px solid var(--color-svv-line);border-radius:16px;background:var(--color-svv-field);min-width:0}
.vgp-manquantes--a-faire{border-color:var(--color-svv-red)}
.vgp-titre{margin:0;font-size:1.05rem;font-weight:800;color:var(--color-svv-ink);display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.vgp-pastille{display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:24px;padding:0 7px;border-radius:999px;background:var(--color-svv-red);color:var(--color-svv-surface);font-size:.8rem;font-weight:800}
.vgp-aide{margin:0;font-size:.9rem}
.vgp-liste{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
.vgp-carte{display:flex;flex-direction:column;gap:6px;padding:12px;border:1px solid var(--color-svv-line);border-radius:12px;background:var(--color-svv-surface);min-width:0;overflow-wrap:anywhere}
.vgp-carte--depassee{border-left:4px solid var(--color-svv-red)}
.vgp-carte--proche{border-left:4px solid var(--color-svv-urgence-orange)}
.vgp-nom{margin:0;font-weight:800;color:var(--color-svv-ink)}
.vgp-manque,.vgp-locataires{margin:0;color:var(--color-svv-ink)}
.vgp-completer{align-self:flex-start;min-height:44px;width:auto}
.vgp-dl{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,220px),1fr));gap:6px 16px;margin:0}
.vgp-dl > div{display:flex;flex-direction:column;gap:1px;min-width:0}
.vgp-dl dt{font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.03em;color:var(--color-svv-muted)}
.vgp-dl dd{margin:0;color:var(--color-svv-ink)}
.vgp-projetee{font-style:italic;text-decoration:underline dashed;text-underline-offset:3px}
.vgp-officielle{font-weight:700}
.vgp-incertaine,.vgp-inconnue{color:var(--color-svv-urgence-orange);font-weight:700}
.vgp-alerte{margin:0;padding:8px 10px;border-radius:10px;font-weight:700;background:var(--color-svv-field);color:var(--color-svv-ink);border:1px solid var(--color-svv-line-strong)}
.vgp-alerte--depassee{background:var(--color-svv-red-soft);color:var(--color-svv-red-dark);border-color:var(--color-svv-red)}
.vgp-alerte--proche{background:var(--color-svv-amber-soft);border-color:var(--color-svv-urgence-orange)}
.vgp-alerte--sans{border-style:dashed;color:var(--color-svv-muted)}
@media (max-width:640px){ .vgp-completer{align-self:stretch;width:100%} }
`;
