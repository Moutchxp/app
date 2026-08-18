'use client';

import { useState } from 'react';

/**
 * FUS-4 — cellule « Réf. mairie » du tableau « En cours ». Affiche la/les référence(s) et permet d'AJOUTER, MODIFIER, EFFACER
 * en place, sans ouvrir le détail. Se branche sur le MÊME chemin d'écriture que le panneau de détail (route /reference : POST
 * ajoute, DELETE retire) — les callbacks sont fournis par la Vue. « accusé reçu » est DÉRIVÉ (référence présente OU message
 * `accuse`) : effacer une référence fait revenir l'affichage, jamais un envoi défait. Mobile : cibles tactiles, pas de survol seul.
 * Les callbacks renvoient un message d'erreur (string) à afficher, ou null si l'action a réussi.
 */
export function RefMairieCellule({ references, onAjouter, onModifier, onSupprimer }: {
  references: string[];
  onAjouter: (reference: string) => Promise<string | null>;
  onModifier: (ancien: string, nouveau: string) => Promise<string | null>;
  onSupprimer: (reference: string) => Promise<string | null>;
}) {
  const [saisie, setSaisie] = useState('');
  const [edite, setEdite] = useState<string | null>(null); // référence en cours de modification
  const [valeurEdite, setValeurEdite] = useState('');
  const [erreur, setErreur] = useState('');
  const [occupe, setOccupe] = useState(false);

  const lancer = async (action: Promise<string | null>): Promise<string | null> => {
    setOccupe(true); setErreur('');
    const err = await action;
    setOccupe(false);
    if (err) setErreur(err);
    return err;
  };

  const inputStyle = { padding: '.2rem .4rem', border: '1px solid var(--color-svv-line)', borderRadius: '.35rem', fontSize: 12, fontFamily: 'var(--font-svv-mono, monospace)', maxWidth: 140 } as const;

  return (
    <td style={{ padding: '.4rem .5rem', textAlign: 'center', verticalAlign: 'middle', minWidth: 190 }}>
      {/* FUS-4 — colonne PUREMENT référence : « accusé reçu » vit dans « Retour mairie » (etatRetourMairie), plus de doublon ici. */}
      {references.length === 0 && <div style={{ color: 'var(--color-svv-muted)', marginBottom: '.2rem' }}>aucune</div>}

      {references.map((ref) => (
        <div key={ref} style={{ display: 'flex', gap: '.3rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '.25rem' }}>
          {edite === ref ? (
            <>
              <input value={valeurEdite} onChange={(e) => setValeurEdite(e.target.value)} aria-label={`Modifier la référence ${ref}`} style={inputStyle} />
              <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.15rem .5rem' }} disabled={occupe || valeurEdite.trim() === ''}
                onClick={() => void (async () => { const err = await lancer(onModifier(ref, valeurEdite.trim())); if (!err) setEdite(null); })()}>enregistrer</button>
              <button type="button" className="svv-link" style={{ width: 'auto', padding: '.15rem .3rem' }} onClick={() => { setEdite(null); setErreur(''); }}>annuler</button>
            </>
          ) : (
            <>
              <span style={{ fontFamily: 'var(--font-svv-mono, monospace)' }}>{ref}</span>
              <button type="button" className="svv-link" style={{ width: 'auto', padding: '.1rem .3rem' }}
                onClick={() => { setEdite(ref); setValeurEdite(ref); setErreur(''); }}>modifier</button>
              <button type="button" className="svv-link" style={{ width: 'auto', padding: '.1rem .3rem', color: 'var(--color-svv-red)' }} disabled={occupe}
                aria-label={`Effacer la référence ${ref}`} onClick={() => void lancer(onSupprimer(ref))}>effacer</button>
            </>
          )}
        </div>
      ))}

      <div style={{ display: 'flex', gap: '.3rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <input value={saisie} onChange={(e) => setSaisie(e.target.value)} placeholder="ajouter une référence" aria-label="Ajouter une référence mairie" style={inputStyle} />
        <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.15rem .5rem' }} disabled={occupe || saisie.trim() === ''}
          onClick={() => void (async () => { const err = await lancer(onAjouter(saisie.trim())); if (!err) setSaisie(''); })()}>ajouter</button>
      </div>

      {erreur && <div role="alert" style={{ fontSize: 11, color: 'var(--color-svv-red)', marginTop: '.2rem' }}>{erreur}</div>}
    </td>
  );
}
