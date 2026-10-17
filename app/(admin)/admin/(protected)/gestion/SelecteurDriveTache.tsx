'use client';

import { useCallback, useEffect, useState } from 'react';
import { iconeType } from '../../../../lib/gestion/taches';
import {
  chercherDansLeDrive, lireDepartDrive, lireDossierDrive, type ElementDriveEcran,
} from './tachesClient';

/**
 * ══ 🔴🔴 LOT TACHES-PIECES-DRIVE — CHOISIR DES PIÈCES JOINTES DANS LE DRIVE, POUR UNE TÂCHE ══════════════════════
 *
 * Arno : « Le sélecteur s'ouvre PAR DÉFAUT sur le dossier Drive du bien […], le même dossier que le bouton “Dossier
 * Drive ↗”. Navigation dans les sous-dossiers ; remontée possible ; recherche par nom. Pour chaque fichier : icône
 * du type, nom, date de modification. Plusieurs fichiers sélectionnables. »
 *
 * 🔴 UN SÉLECTEUR À PART, EN LECTURE SEULE, ET C'EST VOULU : la grande fenêtre Drive de la boîte porte aussi des
 * gestes d'écriture (ranger, renommer, déplacer, corbeille). Celui-ci n'a AUCUN bouton qui écrive, et sa route ne
 * lit le Drive que par un `fetch` qui refuse toute écriture. Il rend une liste d'identifiants ; le serveur relit
 * chaque fichier avant d'en garder la RÉFÉRENCE.
 *
 * ⚠️ AUCUN IMPORT QUI TIRE `pg`.
 */
export interface FichierChoisi { id: string; nom: string; typeMime: string; lien: string | null }

const dateLisible = (iso: string | null): string => {
  if (iso === null) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' });
};

export function SelecteurDriveTache({ lotId, onChoisir, onFermer }: {
  /** 🔴 LOT GESTION-TACHES-SANS-BIEN — `null` : tâche sans bien, la fenêtre s'ouvre à la racine du Drive. */
  lotId: number | null;
  onChoisir: (fichiers: FichierChoisi[]) => void;
  onFermer: () => void;
}) {
  const [dossier, setDossier] = useState<{ id: string; nom: string } | null>(null);
  const [parent, setParent] = useState<{ id: string; nom: string } | null>(null);
  const [elements, setElements] = useState<ElementDriveEcran[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [recherche, setRecherche] = useState('');
  const [enRecherche, setEnRecherche] = useState(false);
  const [choisis, setChoisis] = useState<Map<string, FichierChoisi>>(new Map());

  const ouvrir = useCallback(async (id: string) => {
    setElements(null);
    setErreur(null);
    setEnRecherche(false);
    const r = await lireDossierDrive(id);
    if (r.etat !== 'ok') { setErreur(r.etat === 'indisponible' ? r.message : 'Pièces jointes non installées.'); setElements([]); return; }
    setDossier(r.valeur.dossier);
    setParent(r.valeur.parent);
    setElements(r.valeur.elements);
  }, []);

  useEffect(() => {
    let annule = false;
    void (async () => {
      const d = await lireDepartDrive(lotId);
      if (annule) return;
      if (d.etat !== 'ok') { setErreur(d.etat === 'indisponible' ? d.message : 'Pièces jointes non installées.'); setElements([]); return; }
      setMessage(d.valeur.message);
      await ouvrir(d.valeur.depart.id);
    })();
    return () => { annule = true; };
  }, [lotId, ouvrir]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onFermer(); } };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [onFermer]);

  const chercher = async () => {
    const t = recherche.trim();
    if (t.length < 2) { setErreur('Tapez au moins 2 caractères.'); return; }
    setElements(null);
    setErreur(null);
    const r = await chercherDansLeDrive(t);
    setEnRecherche(true);
    if (r.etat !== 'ok') { setErreur(r.etat === 'indisponible' ? r.message : 'Pièces jointes non installées.'); setElements([]); return; }
    setElements(r.valeur);
  };

  const basculer = (f: ElementDriveEcran) => setChoisis((m) => {
    const n = new Map(m);
    if (n.has(f.id)) n.delete(f.id); else n.set(f.id, { id: f.id, nom: f.nom, typeMime: f.typeMime, lien: f.lien });
    return n;
  });

  return (
    <div className="sdt-voile" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) onFermer(); }}>
      <style>{CSS_SELECTEUR_DRIVE_TACHE}</style>
      <div className="sdt" role="dialog" aria-modal="true" aria-labelledby="sdt-titre">
        <header className="sdt-tete">
          <h2 className="sdt-titre" id="sdt-titre">Pièce jointe depuis le Drive</h2>
          <button type="button" className="sdt-croix" onClick={onFermer} aria-label="Fermer">×</button>
        </header>
        {message && <p className="sdt-info" role="status">{message}</p>}
        <form className="sdt-recherche" onSubmit={(e) => { e.preventDefault(); void chercher(); }}>
          <input type="search" value={recherche} onChange={(e) => setRecherche(e.target.value)}
            placeholder="Chercher par nom dans le Drive" aria-label="Chercher par nom dans le Drive" />
          <button type="submit" className="svv-btn svv-btn-outline gst-btn sdt-btn">Chercher</button>
        </form>
        <div className="sdt-chemin">
          {enRecherche ? (
            <button type="button" className="svv-btn svv-btn-outline gst-btn sdt-btn"
              onClick={() => void ouvrir(dossier?.id ?? 'svav:racine')}>← Revenir au dossier</button>
          ) : (
            <>
              {parent && (
                <button type="button" className="svv-btn svv-btn-outline gst-btn sdt-btn" onClick={() => void ouvrir(parent.id)}
                  title={`Remonter dans « ${parent.nom} »`}>↑ Remonter</button>
              )}
              <span className="sdt-ici">📁 {dossier?.nom ?? '…'}</span>
            </>
          )}
        </div>
        {erreur && <p className="sdt-erreur" role="alert">{erreur}</p>}
        <ul className="sdt-liste" aria-busy={elements === null}>
          {elements === null && <li className="sdt-vide">Lecture du Drive…</li>}
          {elements !== null && elements.length === 0 && !erreur && <li className="sdt-vide">Dossier vide.</li>}
          {(elements ?? []).map((f) => (
            <li key={f.id} className="sdt-ligne" data-drive={f.id}>
              {f.dossier ? (
                <button type="button" className="sdt-dossier" onClick={() => void ouvrir(f.id)}>
                  <span aria-hidden="true">{iconeType(f.typeMime, true)}</span> {f.nom}
                </button>
              ) : (
                <label className="sdt-fichier">
                  <input type="checkbox" checked={choisis.has(f.id)} onChange={() => basculer(f)} />
                  <span aria-hidden="true">{iconeType(f.typeMime)}</span>
                  <span className="sdt-nom">{f.nom}</span>
                  <span className="sdt-date">{dateLisible(f.modifieLe)}</span>
                </label>
              )}
            </li>
          ))}
        </ul>
        <footer className="sdt-pied">
          <button type="button" className="svv-btn gst-btn sdt-btn" disabled={choisis.size === 0}
            onClick={() => { onChoisir([...choisis.values()]); onFermer(); }}>
            Ajouter {choisis.size > 0 ? `(${choisis.size})` : ''}
          </button>
          <button type="button" className="svv-btn svv-btn-outline gst-btn sdt-btn" onClick={onFermer}>Annuler</button>
        </footer>
      </div>
    </div>
  );
}

/* ⚠️ CSS DANS UN GABARIT : jamais d'accent grave dans un commentaire ci-dessous. */
const CSS_SELECTEUR_DRIVE_TACHE = `
.sdt-voile{position:fixed;inset:0;z-index:80;display:flex;align-items:center;justify-content:center;
  padding:2vh 16px;background:rgba(0,0,0,.45)}
.sdt{display:flex;flex-direction:column;gap:8px;width:min(640px,100%);max-height:92vh;padding:14px;
  border:1px solid var(--color-svv-line);border-radius:.8rem;background:var(--color-svv-surface);
  box-shadow:0 18px 50px rgba(0,0,0,.28);color:var(--color-svv-ink)}
.sdt-tete{display:flex;align-items:center;gap:8px}
.sdt-titre{flex:1 1 auto;margin:0;font-size:1rem;font-weight:700}
.sdt-croix{min-width:44px;min-height:44px;font-size:1.3rem;background:none;border:1px solid transparent;border-radius:.5rem;
  color:var(--color-svv-ink);cursor:pointer}
.sdt-info{margin:0;padding:6px 8px;border-radius:.4rem;background:var(--color-svv-field);font-size:.85rem}
.sdt-erreur{margin:0;padding:6px 8px;border:1px solid var(--color-svv-red);border-radius:.4rem;font-size:.85rem;
  color:var(--color-svv-ink);background:var(--color-svv-red-soft)}
.sdt-recherche{display:flex;gap:6px}
.sdt-recherche input{flex:1 1 auto;min-width:0;min-height:44px;padding:0 .5rem;border:1px solid var(--color-svv-line-strong);
  border-radius:.4rem;background:var(--color-svv-field);color:var(--color-svv-ink);font:inherit}
.sdt-btn{width:auto;min-height:44px;padding:0 .8rem;font-size:.85rem}
.sdt-chemin{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.sdt-ici{font-weight:600;overflow-wrap:anywhere}
.sdt-liste{list-style:none;margin:0;padding:0;overflow:auto;min-height:8rem;border:1px solid var(--color-svv-line);border-radius:.5rem}
.sdt-ligne + .sdt-ligne{border-top:1px solid var(--color-svv-line)}
.sdt-vide{padding:10px;color:var(--color-svv-muted);font-size:.85rem}
.sdt-dossier,.sdt-fichier{display:flex;align-items:center;gap:.5rem;width:100%;min-height:44px;padding:4px 10px;
  background:none;border:0;font:inherit;color:var(--color-svv-ink);text-align:left;cursor:pointer;box-sizing:border-box}
.sdt-dossier:hover,.sdt-fichier:hover{background:var(--color-svv-field)}
.sdt-nom{flex:1 1 auto;min-width:0;overflow-wrap:anywhere}
.sdt-date{flex:0 0 auto;font-size:.8rem;color:var(--color-svv-muted)}
.sdt-pied{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end}
`;
