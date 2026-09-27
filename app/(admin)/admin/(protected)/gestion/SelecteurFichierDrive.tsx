'use client';

import { useCallback, useEffect, useState } from 'react';
import { formaterTaille } from '../../../../lib/gestion/ecran';

/**
 * LOT REDACTION-GMAIL — CHOISIR UN FICHIER DU DRIVE, POUR LE JOINDRE OU POUR EN INSÉRER LE LIEN.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 DEUX GESTES, DEUX RÉGIMES, ET LA DIFFÉRENCE N'EST PAS UNE NUANCE.
 *   · « Insérer un lien » ne lit RIEN : il pose l'adresse Drive et le nom dans le message. Le destinataire devra
 *     s'authentifier chez Google, qui appliquera SES droits. → proposé PARTOUT ;
 *   · « Joindre » télécharge les octets et les met dans un mail qui part sur l'Internet ouvert. → JAMAIS sous
 *     « Documents clients scannés ».
 *
 * Sous ce dossier, le bouton « Joindre » N'EXISTE PAS et l'écran DIT pourquoi, avec la sortie (le lien). Un bouton
 * grisé sans explication se lit comme une panne ; un bouton absent sans explication se lit comme un oubli.
 *
 * ⚠️ L'ÉCRAN N'EST PAS LA BARRIÈRE. C'est la route qui refuse (`/api/admin/gestion/drive/fichiers`), en remontant
 * la chaîne des parents — un écran se modifie, une route non. Ici, on explique ; là-bas, on protège.
 *
 * 🔒 LE NAVIGATEUR NE PARLE JAMAIS À GOOGLE : il demande à l'application, qui relit le droit et interroge le Drive
 * avec un jeton qui ne quitte pas le serveur. Navigation par DOSSIER, un niveau à la fois — le Drive fait ~15 000
 * dossiers et 13 niveaux (mesuré le 25/09/2026) : on ne charge jamais l'arborescence entière.
 *
 * MOBILE D'ABORD : une seule colonne, cibles de 44 px, rien au survol seul.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

interface Fichier {
  id: string;
  nom: string;
  typeMime: string;
  tailleOctets: number | null;
  modifieLe: string | null;
  lien: string | null;
  dossier: boolean;
}

type Vue =
  | { v: 'charge' }
  | { v: 'ok'; fichiers: Fichier[]; joindreAutorise: boolean; motifRefus: string | null }
  | { v: 'indisponible'; message: string };

export interface ChoixFichierDrive {
  /** Le fichier joint : ses octets sont déjà chez nous, prêts à devenir une pièce du brouillon. */
  joint?: { nom: string; typeMime: string; contenuBase64: string };
  /** Le lien inséré : rien n'a été lu du contenu. */
  lien?: { nom: string; url: string };
}

export function SelecteurFichierDrive({ onChoisir, onFermer }: {
  onChoisir: (c: ChoixFichierDrive) => void;
  onFermer: () => void;
}) {
  const [vue, setVue] = useState<Vue>({ v: 'charge' });
  /** Le fil d'Ariane : deux dossiers « Documents » à deux endroits sont la règle, pas l'exception. */
  const [ariane, setAriane] = useState<{ id: string; nom: string }[]>([]);
  const [occupe, setOccupe] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async (dossierId: string) => {
    setVue({ v: 'charge' });
    setErreur(null);
    try {
      const res = await fetch(`/api/admin/gestion/drive/fichiers?dossier=${encodeURIComponent(dossierId)}`,
        { cache: 'no-store' });
      const d = (await res.json()) as {
        etat?: string; message?: string; fichiers?: Fichier[]; joindreAutorise?: boolean; motifRefus?: string | null;
      };
      if (d.etat !== 'ok') { setVue({ v: 'indisponible', message: d.message ?? 'Drive indisponible.' }); return; }
      setVue({
        v: 'ok', fichiers: d.fichiers ?? [],
        joindreAutorise: d.joindreAutorise !== false,
        motifRefus: d.motifRefus ?? null,
      });
    } catch {
      setVue({ v: 'indisponible', message: 'Le Drive n’a pas répondu.' });
    }
  }, []);

  useEffect(() => { void charger(''); }, [charger]);

  const entrer = (f: Fichier) => {
    setAriane((a) => [...a, { id: f.id, nom: f.nom }]);
    void charger(f.id);
  };
  const remonter = (i: number) => {
    const coupe = ariane.slice(0, i);
    setAriane(coupe);
    void charger(coupe.at(-1)?.id ?? '');
  };

  /** JOINDRE : on demande les octets. La route REFUSE si le fichier est sous le dossier interdit. */
  const joindre = async (f: Fichier) => {
    setOccupe(f.id);
    setErreur(null);
    try {
      const res = await fetch(`/api/admin/gestion/drive/fichiers?fichier=${encodeURIComponent(f.id)}&contenu=1`,
        { cache: 'no-store' });
      const d = (await res.json()) as { etat?: string; message?: string; contenuBase64?: string };
      if (d.etat !== 'ok' || !d.contenuBase64) {
        setErreur(d.message ?? 'Ce fichier n’a pas pu être joint.');
        return;
      }
      onChoisir({ joint: { nom: f.nom, typeMime: f.typeMime, contenuBase64: d.contenuBase64 } });
    } catch {
      setErreur('Le Drive n’a pas répondu.');
    } finally {
      setOccupe(null);
    }
  };

  /** INSÉRER UN LIEN : aucun contenu n'est lu. C'est pour cela qu'il reste permis partout. */
  const lier = (f: Fichier) => {
    if (f.lien === null || f.lien === '') { setErreur('Ce fichier n’a pas d’adresse Drive partageable.'); return; }
    onChoisir({ lien: { nom: f.nom, url: f.lien } });
  };

  return (
    <div className="sfd-voile" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) onFermer(); }}>
      <style>{CSS_SELECTEUR_FICHIER}</style>
      <div className="sfd" role="dialog" aria-modal="true" aria-labelledby="sfd-titre"
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onFermer(); } }}>
        <h2 className="sfd-titre" id="sfd-titre">Insérer depuis Google Drive</h2>

        <nav className="sfd-ariane" aria-label="Chemin">
          <button type="button" className="gst-lien-bouton" onClick={() => remonter(0)}>Mon Drive</button>
          {ariane.map((e, i) => (
            <span key={e.id}>
              <span className="sfd-fleche" aria-hidden="true"> › </span>
              <button type="button" className="gst-lien-bouton" onClick={() => remonter(i + 1)}>{e.nom}</button>
            </span>
          ))}
        </nav>

        {vue.v === 'charge' && <p className="gst-info" role="status">Lecture du Drive…</p>}
        {vue.v === 'indisponible' && <p className="gst-tronc" role="alert">{vue.message}</p>}
        {erreur !== null && <p className="gst-tronc" role="alert">{erreur}</p>}

        {/* 🔴🔴 LE DOSSIER INTERDIT SE DIT EN TOUTES LETTRES, avec la sortie — et AVANT la liste, pour qu'on le lise
            avant de chercher un bouton qui n'y est pas. */}
        {vue.v === 'ok' && !vue.joindreAutorise && vue.motifRefus !== null && (
          <p className="sfd-interdit" role="status">🔒 {vue.motifRefus}</p>
        )}

        {vue.v === 'ok' && vue.fichiers.length === 0 && <p className="gst-tronc">Ce dossier est vide.</p>}

        {vue.v === 'ok' && vue.fichiers.length > 0 && (
          <ul className="sfd-liste">
            {vue.fichiers.map((f) => (
              <li key={f.id} className="sfd-item">
                {f.dossier ? (
                  <button type="button" className="sfd-dossier" onClick={() => entrer(f)}>
                    <span aria-hidden="true">📁</span> {f.nom}
                  </button>
                ) : (
                  <>
                    <span className="sfd-nom" title={f.nom}>
                      <span aria-hidden="true">📄</span> {f.nom}
                      {f.tailleOctets !== null && <span className="sfd-taille"> · {formaterTaille(f.tailleOctets)}</span>}
                    </span>
                    <span className="sfd-gestes">
                      {/* 🔴🔴 « Joindre » N'EXISTE PAS sous « Documents clients scannés ». Le motif est affiché
                          au-dessus : on n'aligne pas un bouton grisé qu'on ne saurait pas expliquer ligne à ligne. */}
                      {vue.joindreAutorise && (
                        <button type="button" className="gst-lien-bouton" disabled={occupe !== null}
                          onClick={() => void joindre(f)}>
                          {occupe === f.id ? 'Téléchargement…' : 'Joindre'}
                        </button>
                      )}
                      <button type="button" className="gst-lien-bouton" onClick={() => lier(f)}>
                        Insérer un lien
                      </button>
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="sfd-boutons">
          <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={onFermer}>Fermer</button>
        </div>
      </div>
    </div>
  );
}

export const CSS_SELECTEUR_FICHIER = `
.sfd-voile{position:fixed;inset:0;z-index:70;display:flex;align-items:center;justify-content:center;padding:16px;
  background:rgba(0,0,0,.38)}
.sfd{display:flex;flex-direction:column;gap:10px;width:min(640px,100%);max-height:86vh;overflow-y:auto;padding:16px;
  background:var(--color-svv-surface);border:1px solid var(--color-svv-line);border-radius:.8rem;
  box-shadow:0 10px 40px rgba(0,0,0,.2)}
.sfd-titre{margin:0;font-size:1.05rem;font-weight:700;color:var(--color-svv-ink)}
.sfd-ariane{display:flex;flex-wrap:wrap;align-items:center;font-size:.82rem;color:var(--color-svv-muted)}
.sfd-fleche{color:var(--color-svv-line-strong)}
/* 🔴🔴 Le dossier interdit : dit en MOTS, avec un fond qui le distingue — jamais la couleur seule. */
.sfd-interdit{margin:0;padding:8px 10px;font-size:.82rem;color:var(--color-svv-ink);
  background:var(--color-svv-field);border-left:3px solid var(--color-svv-red);border-radius:0 .4rem .4rem 0}
.sfd-liste{display:flex;flex-direction:column;gap:0;margin:0;padding:0;list-style:none}
.sfd-item{display:flex;flex-wrap:wrap;align-items:center;gap:6px;min-height:44px;padding:6px 2px;
  border-bottom:1px solid var(--color-svv-line);min-width:0}
.sfd-dossier{flex:1 1 auto;min-height:44px;padding:0;font:inherit;font-size:.9rem;text-align:left;
  color:var(--color-svv-ink);background:none;border:0;cursor:pointer;overflow-wrap:anywhere}
.sfd-dossier:hover{text-decoration:underline}
.sfd-nom{flex:1 1 12rem;min-width:0;font-size:.88rem;color:var(--color-svv-ink);overflow-wrap:anywhere}
.sfd-taille{color:var(--color-svv-muted)}
.sfd-gestes{display:flex;flex-wrap:wrap;gap:10px;margin-left:auto}
.sfd-boutons{display:flex;justify-content:flex-end;gap:8px;padding-top:4px}
`;
