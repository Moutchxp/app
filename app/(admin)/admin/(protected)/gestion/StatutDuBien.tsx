'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { ModaleIssue } from '../location/ModaleIssue';
import {
  aujourdhuiParis, LIBELLE_DESTINATION, LIBELLE_STATUT, mandatPropose, TEINTE_STATUT, type GesteStatut, type StatutBien,
} from '../../../../lib/gestion/statutBien';
import { LIBELLE_MANDAT, type Mandat } from '../../../../lib/location/mandatBien';
import { texteBandeauGestionTerminee } from '../../../../lib/gestion/finGestion';

/**
 * ══ 🔴🔴 LE STATUT DU BIEN SUR SA FICHE — EN GESTION · ANCIENNE GESTION · LOCATION SEULE (Arno, 21/10/2026, migration 403) ══════
 *
 * Sur la fiche du bien (la MÊME fiche dans la Gestion et la Location) : la pastille du statut (vert / bleu / gris), sa date
 * d'effet, et les gestes permis — « Passer en gestion », « Sortie de gestion » (destination OBLIGATOIRE : ancienne gestion ou
 * location seule), « Reprendre en gestion », « Remettre en location seule ». Chaque geste passe par une CONFIRMATION : date
 * d'effet (aujourd'hui par défaut, jamais dans le futur), motif facultatif, mandat proposé facultatif.
 * Une annexe RATTACHÉE suit son bien principal : aucun geste sur elle, la fiche le dit.
 * Sans la migration 403 : la pastille (statut déduit) seulement, sans geste.
 */
const API = '/api/admin/gestion/annuaire/location';

interface LectureStatut {
  archiveLe?: string | null;
  disponible: boolean;
  lotId: number;
  statut: StatutBien;
  depuis: string | null;
  suitLot: { id: number; adresse: string | null; commune: string | null } | null;
  gestes: GesteStatut[];
}

const dateFr = (iso: string): string => iso.slice(0, 10).split('-').reverse().join('/');

/**
 * Arno (21/10/2026, 405) — LE BANDEAU GRIS d'un bien en « Gestion terminée », en tête de sa carte et de sa fiche :
 * « Gestion terminée le jj/mm/aaaa — plus en gestion active ».
 */
export function BandeauGestionTerminee({ fin }: { fin: string | null | undefined }) {
  return <p className="sdb-bandeau-fin" role="note" data-gestion-terminee>{texteBandeauGestionTerminee(fin ?? null)}</p>;
}

/** Un bien en « Gestion terminée » (ancienne gestion pas encore archivée) ? */
export const enGestionTerminee = (b: { statut?: StatutBien; archiveLe?: string | null }): boolean => b.statut === 'ancienne_gestion' && (b.archiveLe ?? null) === null;

/**
 * La pastille du statut : vert (en gestion), bleu (location seule), gris (ancienne gestion). Son style (`CSS_PASTILLE_STATUT`) est posé
 * UNE fois par l'écran hôte — jamais un <style> par pastille.
 */
export function PastilleStatut({ statut, petite = false, archive }: { statut: StatutBien; petite?: boolean;
  /** Ancienne gestion : `false` = pas encore archivée → « Gestion terminée » (405) ; sinon « Ancienne gestion ». */
  archive?: boolean }) {
  return (
    <span className={`sdb-pastille sdb-pastille--${TEINTE_STATUT[statut]}${petite ? ' sdb-pastille--petite' : ''}`} data-statut-bien={statut}>
      {statut === 'ancienne_gestion' && archive === false ? 'Gestion terminée' : LIBELLE_STATUT[statut]}
    </span>
  );
}

export function StatutDuBien({ lotId, modifiable, onChange, onOuvrir }: {
  lotId: number;
  modifiable: boolean;
  /** Après une transition réussie : relire la fiche (titre, listes, boutons Drive). */
  onChange?: () => void;
  /** Ouvrir la fiche du bien principal (annexe rattachée). */
  onOuvrir?: (id: number) => void;
}) {
  const [lu, setLu] = useState<LectureStatut | null>(null);
  const [geste, setGeste] = useState<GesteStatut | null>(null);
  const [note, setNote] = useState<string[]>([]);
  // Arno (21/10/2026, 404) — relire l'état du dossier Drive après une transition (le bloc le relit à chaque changement de clé).
  const [cleDrive, setCleDrive] = useState(0);
  const lire = useCallback(() => {
    let vivant = true;
    fetch(`${API}?statut=${lotId}`, { headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then((r) => r.json())
      .then((d: { etat?: string; data?: LectureStatut }) => { if (vivant) setLu(d.etat === 'ok' && d.data ? d.data : null); })
      .catch(() => { if (vivant) setLu(null); });
    return () => { vivant = false; };
  }, [lotId]);
  useEffect(() => lire(), [lire]);
  if (lu === null) return null;
  return (
    <section className="sdb" data-statut-du-bien={lu.statut}>
      <style>{CSS_PASTILLE_STATUT + CSS_STATUT_DU_BIEN}</style>
      <div className="sdb-ligne">
        <span className="sdb-mot">Statut du bien</span>
        <PastilleStatut statut={lu.statut} archive={lu.archiveLe === undefined ? undefined : lu.archiveLe !== null} />
        {lu.depuis !== null && <span className="sdb-depuis">depuis le {dateFr(lu.depuis)}</span>}
        {lu.statut === 'ancienne_gestion' && lu.archiveLe && <span className="sdb-depuis">· archivé le {dateFr(lu.archiveLe)}</span>}
      </div>
      {lu.suitLot !== null && (
        <p className="sdb-suit" data-statut-suit={lu.suitLot.id}>
          Annexe rattachée : elle suit le statut de son bien principal
          {' '}{onOuvrir ? <button type="button" className="sdb-lien" onClick={() => onOuvrir(lu.suitLot!.id)}>{lu.suitLot.adresse ?? `bien ${lu.suitLot.id}`}</button>
            : <strong>{lu.suitLot.adresse ?? `bien ${lu.suitLot.id}`}</strong>}.
        </p>
      )}
      {modifiable && lu.gestes.length > 0 && (
        <div className="sdb-gestes">
          {lu.gestes.map((g) => (
            <button key={g.cle} type="button" className="svv-btn svv-btn-outline gst-btn sdb-geste" data-geste-statut={g.cle} onClick={() => setGeste(g)}>
              {g.libelle}
            </button>
          ))}
        </div>
      )}
      {lu.suitLot === null && <DossierDriveDuBien key={cleDrive} lotId={lotId} modifiable={modifiable} />}
      {note.length > 0 && <div className="sdb-notes" role="status">{note.map((n) => <p key={n}>{n}</p>)}</div>}
      {geste !== null && (
        <ConfirmerTransition lotId={lotId} depuis={lu.statut} geste={geste} onFermer={() => setGeste(null)}
          onFait={(notes) => { setGeste(null); setNote(notes); lire(); setCleDrive((k) => k + 1); onChange?.(); }} />
      )}
    </section>
  );
}

function ConfirmerTransition({ lotId, depuis, geste, onFermer, onFait }: {
  lotId: number; depuis: StatutBien; geste: GesteStatut; onFermer: () => void; onFait: (notes: string[]) => void;
}) {
  const id = useId();
  const [vers, setVers] = useState<StatutBien | null>(geste.vers.length === 1 ? geste.vers[0] : null);
  const [effetLe, setEffetLe] = useState(aujourdhuiParis());
  const [motif, setMotif] = useState('');
  const [mandat, setMandat] = useState<Mandat>({ numero: null, signeLe: null });
  const [refus, setRefus] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const sorteMandat = vers === null ? null : mandatPropose(depuis, vers);
  const confirmer = async (): Promise<void> => {
    if (enCours) return;
    if (vers === null) { setRefus('Choisissez la destination du bien.'); return; }
    setEnCours(true);
    setRefus(null);
    try {
      const res = await fetch(API, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'statut-bien', id: lotId, vers, effetLe, motif,
          mandat: sorteMandat === null || (mandat.numero === null && mandat.signeLe === null) ? null : { sorte: sorteMandat, ...mandat } }),
      });
      const d = await res.json() as { etat?: string; motif?: string; message?: string; data?: { lots?: number[]; avertissement?: string | null };
        mail?: { envoye: boolean; ignore: boolean; motif: string | null }; drive?: { ok: boolean; motif: string | null } };
      if (d.etat === 'ok') {
        const notes = [`✓ ${geste.libelle} : le bien est désormais « ${LIBELLE_STATUT[vers]} » (au ${dateFr(effetLe)}).`];
        const annexes = (d.data?.lots?.length ?? 1) - 1;
        if (annexes > 0) notes.push(`${annexes === 1 ? 'Son annexe rattachée a suivi.' : `Ses ${annexes} annexes rattachées ont suivi.`}`);
        if (d.data?.avertissement) notes.push(d.data.avertissement);
        if (d.mail && !d.mail.ignore && !d.mail.envoye) notes.push(`Statut enregistré, mais le mail de portefeuille n’est pas parti : ${d.mail.motif ?? 'raison inconnue'}.`);
        if (d.drive && !d.drive.ok) notes.push(`Statut enregistré, mais le dossier Drive n’a pas été déplacé : ${d.drive.motif ?? 'le Drive n’a pas répondu'}. « Déplacer maintenant » le rejoue.`);
        onFait(notes);
        return;
      }
      setRefus(d.etat === 'sans_schema' ? 'La mise à jour de la base (migration 403) n’est pas appliquée : le statut ne peut pas encore changer.'
        : d.motif ?? d.message ?? 'Changement refusé.');
    } catch {
      setRefus('Le serveur n’a pas répondu. Rien n’a été modifié.');
    } finally {
      setEnCours(false);
    }
  };
  return (
    <ModaleIssue sorte="attention" titre={`${geste.libelle} ?`} onFermer={onFermer}
      actions={[
        { libelle: 'Annuler', onClick: onFermer, repere: 'statut-annuler' },
        { libelle: enCours ? 'Enregistrement…' : 'Confirmer', onClick: () => { void confirmer(); }, principal: true, repere: 'statut-confirmer' },
      ]}>
      <div className="sdb-form" data-confirmer-statut={geste.cle}>
        <p className="sdb-depuis-vers">Statut actuel : <PastilleStatut statut={depuis} petite /></p>
        {geste.vers.length > 1 ? (
          <fieldset className="sdb-choix">
            <legend>Destination <span className="sdb-oblig">(obligatoire)</span></legend>
            {geste.vers.map((v) => (
              <label key={v} className={`sdb-option${vers === v ? ' sdb-option--choisie' : ''}`}>
                <input type="radio" name={`${id}-vers`} value={v} checked={vers === v} onChange={() => setVers(v)} data-destination={v} />
                <span><PastilleStatut statut={v} petite /> <span className="sdb-explique">{LIBELLE_DESTINATION[v]}</span></span>
              </label>
            ))}
          </fieldset>
        ) : (
          <p className="sdb-explique">{LIBELLE_DESTINATION[geste.vers[0]]}</p>
        )}
        <label className="sdb-champ">Date d’effet
          <input type="date" value={effetLe} max={aujourdhuiParis()} onChange={(e) => setEffetLe(e.target.value)} data-effet-le /></label>
        <label className="sdb-champ">Motif <span className="sdb-facultatif">(facultatif)</span>
          <textarea value={motif} maxLength={500} rows={2} onChange={(e) => setMotif(e.target.value)} data-motif-statut /></label>
        {sorteMandat !== null && (
          <fieldset className="sdb-mandat" data-mandat-propose={sorteMandat}>
            <legend>{LIBELLE_MANDAT[sorteMandat]} <span className="sdb-facultatif">(facultatif)</span></legend>
            <label className="sdb-champ">N° de mandat
              <input value={mandat.numero ?? ''} maxLength={80} onChange={(e) => setMandat({ ...mandat, numero: e.target.value === '' ? null : e.target.value })} /></label>
            <label className="sdb-champ">Date de signature
              <input type="date" value={mandat.signeLe ?? ''} onChange={(e) => setMandat({ ...mandat, signeLe: e.target.value === '' ? null : e.target.value })} /></label>
          </fieldset>
        )}
        <p className="sdb-rappel">Les mails du bien ne bougent pas : il les garde tous, quel que soit son statut.</p>
        {refus !== null && <p className="sdb-refus" role="alert" data-refus-statut>{refus}</p>}
      </div>
    </ModaleIssue>
  );
}

interface EtatDrive {
  etat: { etat: 'ok' } | { etat: 'a_creer' } | { etat: 'a_deplacer' };
  libelleAttendu: string;
  libelleActuel: string | null;
}

/**
 * Arno (21/10/2026, 404) — LE DOSSIER DRIVE DU BIEN, selon son statut : à sa place (dit sobrement), « Dossier Drive à créer » +
 * « Créer le dossier », ou « Dossier Drive à déplacer » + « Déplacer maintenant » (gestes rejoués, idempotents). Rien sans la 404.
 */
export function DossierDriveDuBien({ lotId, modifiable }: { lotId: number; modifiable: boolean }) {
  const [lu, setLu] = useState<EtatDrive | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [refus, setRefus] = useState<string | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    let vivant = true;
    fetch(`${API}?driveBien=${lotId}`, { headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then((r) => r.json())
      .then((d: { etat?: string; data?: EtatDrive | null }) => { if (vivant) setLu(d.etat === 'ok' && d.data ? d.data : null); })
      .catch(() => { if (vivant) setLu(null); });
    return () => { vivant = false; };
  }, [lotId, n]);
  if (lu === null) return null;
  const geste = async (quoi: 'creer' | 'deplacer'): Promise<void> => {
    if (enCours) return;
    setEnCours(true); setRefus(null);
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'dossier-drive-bien', id: lotId, geste: quoi }) });
      const d = await r.json() as { etat?: string; motif?: string; message?: string };
      if (d.etat !== 'ok') setRefus(d.motif ?? d.message ?? 'Le Drive a refusé.');
      setN((x) => x + 1);
    } catch {
      setRefus('Le serveur n’a pas répondu.');
    } finally {
      setEnCours(false);
    }
  };
  const e = lu.etat.etat;
  return (
    <div className={`sdb-drive sdb-drive--${e}`} data-drive-etat={e}>
      {e === 'ok' ? <span className="sdb-muet">Dossier Drive : {lu.libelleAttendu}</span> : (
        <span><strong>{e === 'a_creer' ? 'Dossier Drive à créer' : 'Dossier Drive à déplacer'}</strong>
          <span className="sdb-muet"> — {e === 'a_creer' ? `dans « ${lu.libelleAttendu} »` : `de « ${lu.libelleActuel ?? '?'} » vers « ${lu.libelleAttendu} »`}</span></span>
      )}
      {e !== 'ok' && modifiable && (
        <button type="button" className="svv-btn svv-btn-outline gst-btn sdb-geste" disabled={enCours} data-drive-geste={e === 'a_creer' ? 'creer' : 'deplacer'}
          onClick={() => { void geste(e === 'a_creer' ? 'creer' : 'deplacer'); }}>
          {enCours ? 'En cours…' : e === 'a_creer' ? 'Créer le dossier' : 'Déplacer maintenant'}</button>
      )}
      {refus !== null && <p className="sdb-refus" role="alert" data-drive-refus>{refus}</p>}
    </div>
  );
}

/** L'Historique du bien : ses transitions de statut (journal en ajout seul de la 403), du plus récent. */
export function HistoriqueStatut({ lotId }: { lotId: number }) {
  const [lignes, setLignes] = useState<{ id: number; avant: StatutBien | null; apres: StatutBien; effetLe: string; source: string; viaLotId: number | null;
    motif: string | null; mandat: string | null; par: string; quand: string }[] | null>(null);
  const [ouvert, setOuvert] = useState(false);
  useEffect(() => {
    let vivant = true;
    fetch(`${API}?transitions=${lotId}`, { headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then((r) => r.json())
      .then((d: { etat?: string; data?: unknown }) => { if (vivant) setLignes(d.etat === 'ok' && Array.isArray(d.data) ? d.data as never : []); })
      .catch(() => { if (vivant) setLignes([]); });
    return () => { vivant = false; };
  }, [lotId]);
  if (lignes === null || lignes.length === 0) return null;
  const SOURCE: Record<string, string> = { reprise: 'reprise', creation: 'création', geste: '', annexe: 'suit son bien principal', auto: 'automatique', archivage: 'archivage automatique' };
  return (
    <section className="hdb-groupe hdb-groupe--bande" data-historique-statut>
      <style>{CSS_PASTILLE_STATUT + CSS_STATUT_DU_BIEN}</style>
      <div className="hdb-groupe-tete">
        <button type="button" className="hdb-replier" aria-expanded={ouvert} onClick={() => setOuvert((v) => !v)}>
          <span aria-hidden="true" className={`hdb-triangle${ouvert ? ' hdb-triangle--ouvert' : ''}`}>▶</span>
          Statut du bien : transitions
          <span className="gst-compte">{lignes.length}</span>
        </button>
      </div>
      {ouvert && (
        <ul className="sdb-histo">
          {lignes.map((l) => (
            <li key={l.id} data-transition-statut={l.id}>
              <span className="sdb-histo-date">au {dateFr(l.effetLe)}</span>
              {l.source === 'archivage'
                ? <span><PastilleStatut statut="ancienne_gestion" petite archive={false} /> → <PastilleStatut statut="ancienne_gestion" petite archive /></span>
                : <span>{l.avant !== null && <><PastilleStatut statut={l.avant} petite /> → </>}<PastilleStatut statut={l.apres} petite /></span>}
              {SOURCE[l.source] ? <span className="sdb-muet">{SOURCE[l.source]}{l.viaLotId !== null ? ` (bien ${l.viaLotId})` : ''}</span> : null}
              {l.motif && <span className="sdb-muet">{l.motif}</span>}
              {l.mandat && <span className="sdb-muet">{l.mandat}</span>}
              <span className="sdb-muet">par {l.par}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** AUCUN ACCENT GRAVE DANS CE LITTERAL. Jetons du theme seulement. */
export const CSS_PASTILLE_STATUT = `
.sdb-bandeau-fin{margin:0 0 8px;padding:8px 12px;border-radius:10px;background:var(--color-svv-field);color:var(--color-svv-muted);border:1px solid var(--color-svv-line-strong);font-weight:700;overflow-wrap:anywhere}
.sdb-pastille{display:inline-flex;align-items:center;gap:4px;border-radius:999px;padding:3px 10px;font-weight:800;font-size:.82rem;line-height:1.3;border:1px solid transparent;white-space:nowrap}
.sdb-pastille--petite{padding:1px 8px;font-size:.74rem}
.sdb-pastille--vert{background:var(--color-svv-green-soft);color:var(--color-svv-green-ink);border-color:var(--color-svv-green-ink)}
.sdb-pastille--bleu{background:var(--color-svv-blue-soft);color:var(--color-svv-blue);border-color:var(--color-svv-blue)}
.sdb-pastille--gris{background:var(--color-svv-field);color:var(--color-svv-muted);border-color:var(--color-svv-line-strong)}
`;

export const CSS_STATUT_DU_BIEN = `
.sdb{display:flex;flex-direction:column;gap:8px;margin:10px 0;padding:10px 14px;border:1px solid var(--color-svv-line);border-radius:14px;background:var(--color-svv-surface);min-width:0}
.sdb-ligne{display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px;min-width:0}
.sdb-mot{font-weight:800;color:var(--color-svv-ink)}
.sdb-depuis,.sdb-muet{color:var(--color-svv-muted);font-size:.9rem}
.sdb-suit{margin:0;color:var(--color-svv-muted);overflow-wrap:anywhere}
.sdb-lien{background:none;border:0;padding:0;color:var(--color-svv-ink);font-weight:700;text-decoration:underline;cursor:pointer;font:inherit}
.sdb-gestes{display:flex;flex-wrap:wrap;gap:8px}
.sdb-gestes .sdb-geste{min-height:44px;width:auto;margin:0}
.sdb-notes p{margin:0;padding:8px 10px;border-radius:10px;background:var(--color-svv-green-soft);color:var(--color-svv-ink);overflow-wrap:anywhere}
.sdb-notes{display:flex;flex-direction:column;gap:6px}
.sdb-form{display:flex;flex-direction:column;gap:12px;min-width:0}
.sdb-form p{margin:0}
.sdb-choix,.sdb-mandat{border:1px solid var(--color-svv-line);border-radius:12px;margin:0;padding:10px 12px;display:flex;flex-direction:column;gap:8px;min-width:0}
.sdb-choix legend,.sdb-mandat legend{font-weight:800;padding:0 4px}
.sdb-oblig{color:var(--color-svv-red);font-weight:700}
.sdb-facultatif{color:var(--color-svv-muted);font-weight:400}
.sdb-option{display:flex;gap:10px;align-items:flex-start;padding:8px;border-radius:10px;border:1px solid var(--color-svv-line);cursor:pointer;min-height:44px;box-sizing:border-box}
.sdb-option--choisie{border-color:var(--color-svv-ink)}
.sdb-option input{margin-top:4px;flex:none}
.sdb-explique{color:var(--color-svv-ink);line-height:1.4;overflow-wrap:anywhere}
.sdb-champ{display:flex;flex-direction:column;gap:4px;font-weight:700;min-width:0}
.sdb-champ input,.sdb-champ textarea{font:inherit;font-weight:400;min-height:44px;box-sizing:border-box;width:100%;padding:8px 10px;border-radius:10px;border:1px solid var(--color-svv-line-strong);background:var(--color-svv-field);color:var(--color-svv-ink)}
.sdb-rappel{color:var(--color-svv-muted);font-size:.9rem}
.sdb-refus{padding:8px 10px;border-radius:10px;border:1px solid var(--color-svv-red);background:var(--color-svv-red-soft);color:var(--color-svv-ink);font-weight:700}
.sdb-drive{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;min-width:0;overflow-wrap:anywhere}
.sdb-drive--a_creer,.sdb-drive--a_deplacer{padding:8px 10px;border-radius:10px;border:1px solid var(--color-svv-amber);background:var(--color-svv-amber-soft);color:var(--color-svv-ink)}
.sdb-drive .sdb-refus{flex-basis:100%;margin:0}
.sdb-histo{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-direction:column;gap:8px}
.sdb-histo li{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;overflow-wrap:anywhere}
.sdb-histo-date{font-weight:700}
`;
