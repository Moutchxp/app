'use client';

import { useId } from 'react';
import { LIBELLE_DESTINATION, LIBELLE_STATUT, mandatPropose, type StatutBien } from '../../../../lib/gestion/statutBien';
import { LIBELLE_MANDAT } from '../../../../lib/location/mandatBien';
import { aujourdhuiParis } from '../../../../lib/location/reglagesDpe';
import type { StatutLu, TransitionSaisie } from '../../../../lib/location/ficheBienEntiere';
import { CSS_PASTILLE_STATUT, CSS_STATUT_DU_BIEN, PastilleStatut } from '../gestion/StatutDuBien';

/**
 * ══ 🔴🔴 « STATUT DU BIEN » DANS « MODIFIER » LA FICHE ENTIÈRE (Arno, 23/10/2026) ═══════════════════════════════════════════════════
 *
 * Le dernier bloc du formulaire « Nouveau bien », en modification : le statut ACTUEL (pastille, depuis), le mandat connu (lecture
 * seule), et SEULEMENT les transitions permises pour ce bien (`gestesPour`, la règle du geste de la fiche) — « Ne pas changer »
 * par défaut. Une transition choisie demande, comme le geste de la fiche : la date d'effet (aujourd'hui par défaut, jamais dans le
 * futur), un motif facultatif, le mandat proposé facultatif. Ce qu'elle fera du dossier Drive est DIT (`LIBELLE_DESTINATION`) :
 * le mécanisme existant le déplace, rien d'autre. Une annexe rattachée suit son bien principal : aucun choix, la fiche le dit.
 */
export function BlocStatutModification({ numero, lu, mandat, valeur, onChange }: {
  numero: number;
  lu: StatutLu | null;
  mandat: { sorte: 'gestion' | 'transaction'; lignes: string[] } | null;
  valeur: TransitionSaisie | null;
  onChange: (t: TransitionSaisie | null) => void;
}) {
  const id = useId();
  if (lu === null) return null;
  const destinations: { vers: StatutBien; geste: string }[] = lu.gestes.flatMap((g) => g.vers.map((v) => ({ vers: v, geste: g.libelle })));
  const choisir = (vers: StatutBien | null): void => {
    if (vers === null) { onChange(null); return; }
    onChange({ vers, effetLe: valeur?.effetLe ?? aujourdhuiParis(), motif: valeur?.motif ?? '', mandat: null });
  };
  const sorteMandat = valeur === null ? null : mandatPropose(lu.statut, valeur.vers);
  const m = valeur?.mandat ?? { sorte: sorteMandat ?? 'gestion', numero: null, signeLe: null };
  const poserMandat = (x: { numero?: string | null; signeLe?: string | null }): void => {
    if (valeur === null || sorteMandat === null) return;
    const suivant = { sorte: sorteMandat, numero: x.numero !== undefined ? x.numero : m.numero, signeLe: x.signeLe !== undefined ? x.signeLe : m.signeLe };
    onChange({ ...valeur, mandat: (suivant.numero ?? '') === '' && (suivant.signeLe ?? '') === '' ? null : suivant });
  };
  return (
    <section className="loc-section" aria-labelledby={`${id}-t`} data-bloc-statut-modification>
      <style>{CSS_PASTILLE_STATUT + CSS_STATUT_DU_BIEN}</style>
      <h3 id={`${id}-t`}><span className="loc-num">{numero}</span>Statut du bien</h3>
      <p className="sdb-depuis-vers" style={{ margin: 0 }}>Statut actuel : <PastilleStatut statut={lu.statut} />
        {lu.depuis !== null && <span className="sdb-depuis"> depuis le {lu.depuis.slice(0, 10).split('-').reverse().join('/')}</span>}</p>
      {mandat !== null && (
        <p className="loc-muet" style={{ margin: 0 }} data-mandat-connu>{LIBELLE_MANDAT[mandat.sorte]} : {mandat.lignes.join(' · ')}
          <span> (sur la fiche du propriétaire — un mandat se saisit au changement de statut)</span></p>
      )}
      {lu.suitLot !== null ? (
        <p className="sdb-suit" data-statut-suit={lu.suitLot.id}>Annexe rattachée : elle suit le statut de son bien principal ({lu.suitLot.adresse ?? `bien ${lu.suitLot.id}`}).</p>
      ) : !lu.disponible || destinations.length === 0 ? (
        <p className="loc-muet" style={{ margin: 0 }}>Le statut ne peut pas changer d’ici pour ce bien.</p>
      ) : (
        <>
          <fieldset className="sdb-choix" data-choix-statut>
            <legend>Changer le statut ?</legend>
            <label className={`sdb-option${valeur === null ? ' sdb-option--choisie' : ''}`}>
              <input type="radio" name={`${id}-vers`} checked={valeur === null} onChange={() => choisir(null)} data-statut-vers="inchange" />
              <span className="sdb-explique">Ne pas changer — rester « {LIBELLE_STATUT[lu.statut]} »</span>
            </label>
            {destinations.map((d) => (
              <label key={d.vers} className={`sdb-option${valeur?.vers === d.vers ? ' sdb-option--choisie' : ''}`}>
                <input type="radio" name={`${id}-vers`} checked={valeur?.vers === d.vers} onChange={() => choisir(d.vers)} data-statut-vers={d.vers} />
                <span><strong>{d.geste}</strong> → <PastilleStatut statut={d.vers} petite /> <span className="sdb-explique">{LIBELLE_DESTINATION[d.vers]}</span></span>
              </label>
            ))}
          </fieldset>
          {valeur !== null && (
            <div className="sdb-form" data-transition-choisie={valeur.vers}>
              <label className="sdb-champ">Date d’effet
                <input type="date" value={valeur.effetLe} max={aujourdhuiParis()} onChange={(e) => onChange({ ...valeur, effetLe: e.target.value })} data-effet-le /></label>
              <label className="sdb-champ">Motif <span className="sdb-facultatif">(facultatif)</span>
                <textarea value={valeur.motif} maxLength={500} rows={2} onChange={(e) => onChange({ ...valeur, motif: e.target.value })} data-motif-statut /></label>
              {sorteMandat !== null && (
                <fieldset className="sdb-mandat" data-mandat-propose={sorteMandat}>
                  <legend>{LIBELLE_MANDAT[sorteMandat]} <span className="sdb-facultatif">(facultatif)</span></legend>
                  <label className="sdb-champ">N° de mandat
                    <input value={m.numero ?? ''} maxLength={80} onChange={(e) => poserMandat({ numero: e.target.value === '' ? null : e.target.value })} /></label>
                  <label className="sdb-champ">Date de signature
                    <input type="date" value={m.signeLe ?? ''} onChange={(e) => poserMandat({ signeLe: e.target.value === '' ? null : e.target.value })} /></label>
                </fieldset>
              )}
              <p className="sdb-rappel">Les mails du bien ne bougent pas : il les garde tous, quel que soit son statut.</p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
