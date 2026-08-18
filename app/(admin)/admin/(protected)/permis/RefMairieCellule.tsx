'use client';

import { useState } from 'react';

/**
 * FUS — ÉDITEUR de LA référence mairie d'une demande. RÈGLE MÉTIER (une seule référence par demande) :
 *  - référence ABSENTE → champ de saisie + bouton « ajouter » (le SEUL cas où ils sont rendus) ;
 *  - référence PRÉSENTE → « modifier » et « effacer » UNIQUEMENT ; le champ et « ajouter » ne sont PAS rendus du tout
 *    (pas seulement grisés) → on ne peut plus empiler une 2ᵉ référence ;
 *  - après un EFFACEMENT → le champ « ajouter » revient (dérivé de `references`, aucun rechargement de page).
 * « modifier » = ajouter le nouveau PUIS retirer l'ancien (jamais d'état sans référence si l'ajout échoue) — logique côté Vue.
 * SOURCE UNIQUE, partagée par la CELLULE du tableau « En cours » (RefMairieCellule) ET le PANNEAU DE DÉTAIL : un seul
 * comportement, jamais deux. Les callbacks renvoient un message d'erreur (string) à afficher, ou null si l'action a réussi.
 * NB : si une demande porte anormalement PLUSIEURS références (le schéma l'autorise), elles sont toutes affichées avec
 * modifier/effacer (pour permettre le ménage) et « ajouter » reste masqué tant qu'il en reste au moins une.
 */
export function EditeurReferenceMairie({ references, onAjouter, onModifier, onSupprimer }: {
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
  const aReference = references.length > 0;

  return (
    <div>
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

      {/* RÈGLE : champ + « ajouter » rendus UNIQUEMENT quand il n'y a AUCUNE référence (jamais grisés — absents). */}
      {!aReference && (
        <div style={{ display: 'flex', gap: '.3rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input value={saisie} onChange={(e) => setSaisie(e.target.value)} placeholder="ajouter une référence" aria-label="Ajouter une référence mairie" style={inputStyle} />
          <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.15rem .5rem' }} disabled={occupe || saisie.trim() === ''}
            onClick={() => void (async () => { const err = await lancer(onAjouter(saisie.trim())); if (!err) setSaisie(''); })()}>ajouter</button>
        </div>
      )}

      {erreur && <div role="alert" style={{ fontSize: 11, color: 'var(--color-svv-red)', marginTop: '.2rem' }}>{erreur}</div>}
    </div>
  );
}

/** FUS-4 — cellule « Réf. mairie » du tableau « En cours » : l'éditeur PARTAGÉ dans une cellule centrée. */
export function RefMairieCellule(props: Parameters<typeof EditeurReferenceMairie>[0]) {
  return (
    <td style={{ padding: '.4rem .5rem', textAlign: 'center', verticalAlign: 'middle', minWidth: 190 }}>
      <EditeurReferenceMairie {...props} />
    </td>
  );
}
