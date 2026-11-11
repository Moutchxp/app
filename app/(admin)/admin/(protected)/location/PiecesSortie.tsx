'use client';

import { useVerrouDefilement } from '../_composants/verrouDefilement';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ACCEPT_PIECES, mo, PIECE_MAX_OCTETS, PIECES_MAX_OCTETS, refusPiece, TYPES_PIECE_LIBELLE,
} from '../../../../lib/location/validationSortie';
import { dateFrPreavis } from '../../../../lib/location/preavis';

/**
 * ══ 🔴🔴 LES PIÈCES JOINTES AU COMPTE RENDU DE L'ÉTAT DES LIEUX DE SORTIE (Arno, 11/11/2026, migration 468) ══════════════════════════════════
 * Trois façons d'ajouter, UNE liste : « Depuis le Drive du bien » (fenêtre : nom, date, type, taille, plus récents d'abord, recherche, filtre
 * « États des lieux », cases, « Joindre »), le glisser-déposer sur la zone, et « Parcourir mon ordinateur ». La liste : nom, taille, provenance,
 * « Retirer ». Types : PDF, JPG, PNG, HEIC, Word ; 10 Mo par fichier, 15 Mo au total (affichés). Le Drive n'est que LU : ni copie, ni déplacement.
 * ⚠️ AUCUN IMPORT QUI TIRE `pg`.
 */
export interface PieceListee { id: number; nom: string; typeMime: string; taille: number; provenance: 'drive' | 'ordinateur' }
interface FichierDrive { id: string; nom: string; typeMime: string; taille: number | null; modifieLe: string | null; chemin: string[]; joignable: boolean; etatDesLieux: boolean }
const API = '/api/admin/location/pieces-sortie';
const MOT_TYPE = (t: string): string => (t.includes('pdf') ? 'PDF' : t.startsWith('image/') ? t.slice(6).toUpperCase().replace('JPEG', 'JPG') : t.includes('word') ? 'Word' : t.includes('google-apps') ? 'Document Google' : t.split('/').pop() ?? t);

export function PiecesSortie({ occupationId, lotId, pieces, onChange, desactive = false }: {
  occupationId: number; lotId: number | null; pieces: readonly PieceListee[]; onChange: (p: PieceListee[]) => void; desactive?: boolean;
}) {
  const [refus, setRefus] = useState<string[]>([]);
  const [envoi, setEnvoi] = useState(false);
  const [survol, setSurvol] = useState(false);
  const [drive, setDrive] = useState(false);
  const champ = useRef<HTMLInputElement>(null);
  const total = pieces.reduce((n, p) => n + p.taille, 0);

  const ajouter = async (reponse: Promise<Response>, avant: string[] = []): Promise<void> => {
    setEnvoi(true);
    try {
      const r = await reponse;
      const d = await r.json().catch(() => null) as { etat?: string; motif?: string; data?: { pieces: PieceListee[]; refus: string[] } } | null;
      if (d?.etat !== 'ok' || !d.data) { setRefus([...avant, d?.motif ?? 'Ajout impossible : rien n’a été joint.']); return; }
      onChange([...pieces, ...d.data.pieces]);
      setRefus([...avant, ...d.data.refus]);
    } catch {
      setRefus([...avant, 'Le serveur n’a pas répondu : rien n’a été joint.']);
    } finally { setEnvoi(false); }
  };
  /** Depuis l'ordinateur : le contrôle d'abord (type, taille, total), à l'écran ; le serveur le refait. */
  const depuisOrdinateur = (liste: FileList | File[]): void => {
    const acceptes: File[] = [];
    const avant: string[] = [];
    for (const f of Array.from(liste)) {
      const r = refusPiece({ nom: f.name, typeMime: f.type || null, taille: f.size }, [...pieces, ...acceptes.map((x) => ({ taille: x.size }))]);
      if (r !== null) avant.push(r); else acceptes.push(f);
    }
    if (acceptes.length === 0) { setRefus(avant); return; }
    const fd = new FormData();
    fd.set('occupationId', String(occupationId));
    fd.set('dejaJointes', JSON.stringify(pieces.map((p) => p.taille)));
    for (const f of acceptes) fd.append('fichier', f, f.name);
    void ajouter(fetch(API, { method: 'POST', body: fd }), avant);
  };
  const depuisDrive = (ids: string[]): void => {
    setDrive(false);
    void ajouter(fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ occupationId, driveIds: ids, dejaJointes: pieces.map((p) => p.taille) }) }));
  };

  return (
    <fieldset className="pvv-choix vps" data-pieces-sortie disabled={desactive}>
      <legend className="pvs-libelle">Pièces jointes au compte rendu</legend>
      <p className="loc-muet vps-regle" data-regle-pieces>{TYPES_PIECE_LIBELLE} — {mo(PIECE_MAX_OCTETS)} par fichier, {mo(PIECES_MAX_OCTETS)} au total. Les mêmes pièces partent avec chaque mail et la copie interne.</p>
      <div className="vps-boutons">
        <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setDrive(true)} disabled={envoi} data-pieces-drive>Depuis le Drive du bien</button>
        <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => champ.current?.click()} disabled={envoi} data-pieces-parcourir>Parcourir mon ordinateur</button>
        <input ref={champ} type="file" multiple accept={ACCEPT_PIECES} hidden onChange={(e) => { if (e.target.files) depuisOrdinateur(e.target.files); e.target.value = ''; }} data-pieces-champ />
      </div>
      <div className={`vps-zone${survol ? ' vps-zone--survol' : ''}`} data-pieces-zone
        onDragOver={(e) => { e.preventDefault(); setSurvol(true); }} onDragLeave={() => setSurvol(false)}
        onDrop={(e) => { e.preventDefault(); setSurvol(false); if (e.dataTransfer?.files?.length) depuisOrdinateur(e.dataTransfer.files); }}>
        {envoi ? 'Ajout en cours…' : 'Glissez-déposez ici des fichiers de votre ordinateur'}
      </div>
      {refus.map((m) => <p key={m} className="cev-alerte vps-refus" role="alert" data-piece-refus>{m}</p>)}
      {pieces.length > 0 && (
        <ul className="vps-liste" data-pieces-liste>
          {pieces.map((p) => (
            <li key={p.id} data-piece={p.id}>
              <span className="vps-nom">{p.nom}</span>
              <span className="vps-meta">{mo(p.taille)} · {p.provenance === 'drive' ? 'Drive' : 'ordinateur'}</span>
              <button type="button" className="svv-btn svv-btn-outline gst-btn vps-retirer" onClick={() => onChange(pieces.filter((x) => x.id !== p.id))} data-retirer-piece={p.id}>Retirer</button>
            </li>))}
        </ul>
      )}
      {pieces.length > 0 && <p className="loc-muet" data-pieces-total>{pieces.length} pièce{pieces.length > 1 ? 's' : ''} — {mo(total)} sur {mo(PIECES_MAX_OCTETS)}</p>}
      {drive && <FenetreDriveBien occupationId={occupationId} lotId={lotId} onFermer={() => setDrive(false)} onJoindre={depuisDrive} />}
      <style>{CSS_PIECES_SORTIE}</style>
    </fieldset>
  );
}

/** LA FENÊTRE « DEPUIS LE DRIVE DU BIEN » : lecture seule. */
function FenetreDriveBien({ occupationId, lotId, onFermer, onJoindre }: { occupationId: number; lotId: number | null; onFermer: () => void; onJoindre: (ids: string[]) => void }) {
  // 🔴 Arno (11/11/2026) — la fenêtre bloque le défilement de la page, COMPTÉ (commun à toutes les fenêtres ; toujours rendu à la dernière fermée).
  useVerrouDefilement();
  const titreId = useId();
  const [lu, setLu] = useState<{ etat: 'chargement' } | { etat: 'ok'; fichiers: FichierDrive[]; tronque: boolean } | { etat: 'sans_dossier' | 'refus'; motif: string }>({ etat: 'chargement' });
  const [recherche, setRecherche] = useState('');
  const [edl, setEdl] = useState(false);
  const [coches, setCoches] = useState<string[]>([]);
  useEffect(() => {
    let vivant = true;
    void (async () => {
      try {
        const r = await fetch(`${API}?drive=${occupationId}`, { cache: 'no-store' });
        const d = await r.json() as { etat?: string; motif?: string; data?: { fichiers: FichierDrive[]; tronque: boolean } };
        if (!vivant) return;
        if (d.etat === 'ok' && d.data) setLu({ etat: 'ok', fichiers: d.data.fichiers, tronque: d.data.tronque });
        else setLu({ etat: d.etat === 'sans_dossier' ? 'sans_dossier' : 'refus', motif: d.motif ?? 'Lecture du Drive impossible.' });
      } catch { if (vivant) setLu({ etat: 'refus', motif: 'Le serveur n’a pas répondu.' }); }
    })();
    return () => { vivant = false; };
  }, [occupationId]);
  useEffect(() => {
    const clavier = (e: KeyboardEvent): void => { if (e.key === 'Escape') onFermer(); };
    window.addEventListener('keydown', clavier);
    return () => window.removeEventListener('keydown', clavier);
  }, [onFermer]);
  const visibles = useMemo(() => {
    if (lu.etat !== 'ok') return [];
    const t = recherche.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
    return lu.fichiers.filter((f) => (!edl || f.etatDesLieux) && (t === '' || f.nom.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().includes(t)));
  }, [lu, recherche, edl]);
  const lienBien = lotId !== null ? `/admin/location/bien/${lotId}` : null;
  const boite = (
    <div className="mis-voile vps-voile">
      <div className="mis-boite pss-boite pss-boite-recap vps-fenetre" role="dialog" aria-modal="true" aria-labelledby={titreId} data-fenetre-drive-bien>
        <h2 id={titreId} className="mis-titre">Depuis le Drive du bien</h2>
        <p className="loc-muet">Lecture seule : rien n’est copié ni déplacé dans le Drive.</p>
        {lu.etat === 'chargement' && <p className="loc-muet" data-drive-chargement>Lecture du dossier du bien…</p>}
        {(lu.etat === 'sans_dossier' || lu.etat === 'refus') && (
          <p className="cev-alerte" role="alert" data-drive-sans-dossier={lu.etat === 'sans_dossier' ? '' : undefined}>
            {lu.motif}{lu.etat === 'sans_dossier' && lienBien && <> <a href={lienBien} target="_blank" rel="noopener" data-lien-fiche-bien-drive>Ouvrir la fiche du bien</a></>}</p>
        )}
        {lu.etat === 'ok' && <>
          <div className="vps-outils">
            <input type="search" placeholder="ex. état des lieux" value={recherche} onChange={(e) => setRecherche(e.target.value)} aria-label="Rechercher par nom" data-drive-recherche />
            <label className="pvv-case"><input type="checkbox" checked={edl} onChange={(e) => setEdl(e.target.checked)} data-drive-filtre-edl /><span>États des lieux</span></label>
          </div>
          {visibles.length === 0 ? <p className="loc-muet" data-drive-vide>Aucun fichier.</p> : (
            <ul className="vps-drive" data-drive-liste>
              {visibles.map((f) => (
                <li key={f.id} data-fichier-drive={f.id} data-joignable={f.joignable ? 'oui' : 'non'}>
                  <label className="pvv-case">
                    <input type="checkbox" disabled={!f.joignable} checked={coches.includes(f.id)}
                      onChange={(e) => setCoches((c) => (e.target.checked ? [...c, f.id] : c.filter((x) => x !== f.id)))} data-cocher-fichier={f.id} />
                    <span className="vps-drive-texte">
                      <span className="vps-nom">{f.nom}</span>
                      <span className="vps-meta">{f.modifieLe ? dateFrPreavis(f.modifieLe.slice(0, 10)) : '—'} · {MOT_TYPE(f.typeMime)} · {f.taille !== null ? mo(f.taille) : '—'}{f.chemin.length > 0 ? ` · ${f.chemin.join(' › ')}` : ''}
                        {f.joignable ? '' : ' · non joignable (type ou taille)'}</span>
                    </span>
                  </label>
                </li>))}
            </ul>
          )}
          {lu.tronque && <p className="mis-note">Liste tronquée : affinez avec la recherche.</p>}
        </>}
        <div className="mis-actions">
          <button type="button" className="svv-btn svv-btn-outline gst-btn mis-action" onClick={onFermer} data-drive-annuler>Annuler</button>
          <button type="button" className="svv-btn svv-btn-primary gst-btn mis-action" disabled={coches.length === 0} onClick={() => onJoindre(coches)} data-drive-joindre>
            Joindre{coches.length > 0 ? ` (${coches.length})` : ''}</button>
        </div>
      </div>
    </div>
  );
  return typeof document === 'undefined' ? boite : createPortal(boite, document.querySelector('.svv-adm-root') ?? document.body);
}

/* AUCUN ACCENT GRAVE DANS CE LITTERAL. Jetons du theme ; cibles de 44 px ; une colonne au telephone. */
export const CSS_PIECES_SORTIE = `
.vps{display:flex;flex-direction:column;gap:8px;min-width:0}
.vps > *:not(legend){align-self:stretch}
.vps-boutons{display:flex;flex-wrap:wrap;gap:8px}
.vps-boutons .svv-btn{min-height:44px;flex:1 1 220px;justify-content:center}
@media (max-width:600px){.vps-boutons .svv-btn{flex:1 1 100%}}
.vps-zone{border:2px dashed var(--color-svv-line-strong);border-radius:12px;padding:18px 12px;text-align:center;color:var(--color-svv-muted);background:var(--color-svv-field)}
.vps-zone--survol{border-color:var(--color-svv-ink);color:var(--color-svv-ink)}
.vps-liste,.vps-drive{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px;min-width:0}
.vps-liste li{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:4px 10px;padding:6px 8px;border-radius:8px;background:var(--color-svv-field);min-width:0}
.vps-nom{font-weight:800;overflow-wrap:anywhere}
.vps-meta{color:var(--color-svv-muted);font-size:.85rem;overflow-wrap:anywhere}
.vps-retirer{margin-left:auto;min-height:36px;flex:0 0 auto;width:auto}
.vps-refus{margin:0}
.mis-voile.vps-voile{z-index:95}
.vps-fenetre{max-width:720px}
.vps-outils{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center}
.vps-outils input[type=search]{flex:1 1 220px;min-height:44px;padding:0 10px;border-radius:10px;border:1px solid var(--color-svv-line-strong);background:var(--color-svv-surface);color:var(--color-svv-ink)}
.vps-drive{max-height:50vh;overflow:auto}
.vps-drive li[data-joignable=non]{opacity:.6}
.vps-drive-texte{display:flex;flex-direction:column;min-width:0}
`;
