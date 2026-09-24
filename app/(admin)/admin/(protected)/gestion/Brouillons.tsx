'use client';

import { useEffect, useState } from 'react';
import { dateHeureComplete, dateHeureCourte } from '../../../../lib/gestion/ecran';
import type { VoieRedaction } from '../../../../lib/gestion/redaction';

/**
 * LOT 5e — LA LISTE DES BROUILLONS, sous son étiquette.
 *
 * 🔴 UN BROUILLON N'EST JAMAIS SUPPRIMÉ. « Abandonner » le DATE et le retire de cette liste ; il reste en base. Trois
 * paragraphes écrits puis une fenêtre fermée par mégarde, c'est du travail humain : on ne l'efface pas parce que
 * quelqu'un a cliqué trop vite.
 *
 * ⚠️ Un brouillon sans destinataire ni objet n'est pas anonyme pour autant : on affiche alors ce qu'il a — le début du
 * message. Une ligne « (sans objet) · (aucun destinataire) » ne permettrait pas de reconnaître le sien.
 */

export interface BrouillonListe {
  id: number;
  filId: number | null;
  voie: VoieRedaction;
  a: string[];
  objet: string;
  corps: string;
  majLe: string;
}

const LIBELLE_VOIE: Record<VoieRedaction, string> = {
  repondre: 'Réponse', repondre_tous: 'Réponse à tous', transferer: 'Transfert', nouveau: 'Nouveau message',
};

/** De quoi reconnaître SON brouillon quand on en a cinq. Objet, sinon début du message, sinon destinataires. PUR. */
export function resumerBrouillon(b: Pick<BrouillonListe, 'objet' | 'corps' | 'a'>): string {
  const objet = b.objet.trim();
  if (objet !== '') return objet;
  const corps = b.corps.replace(/\s+/g, ' ').trim();
  if (corps !== '') return corps.length <= 70 ? corps : `${corps.slice(0, 69).trimEnd()}…`;
  return b.a.length > 0 ? `à ${b.a.join(', ')}` : '(message vide)';
}

export function Brouillons({ maintenant, onOuvrir, onChange }: {
  maintenant: Date;
  /** Ouvrir l'échange du brouillon. `null` = brouillon hors fil : il n'y a pas de conversation à rouvrir. */
  onOuvrir: (filId: number) => void;
  /** Un brouillon abandonné change le compteur de l'étiquette : l'écran parent le relit. */
  onChange: () => void;
}) {
  const [etat, setEtat] = useState<{ v: 'charge' } | { v: 'ok'; liste: BrouillonListe[] } | { v: 'erreur' }>({ v: 'charge' });

  /** Va chercher la liste et RENVOIE le résultat : c'est l'appelant qui décide quoi en faire. Patron du dépôt. */
  const chercher = async (): Promise<{ v: 'ok'; liste: BrouillonListe[] } | { v: 'erreur' }> => {
    try {
      const res = await fetch('/api/admin/gestion/brouillons', { cache: 'no-store' });
      if (!res.ok) return { v: 'erreur' };
      const d = (await res.json()) as { brouillons?: BrouillonListe[] };
      return { v: 'ok', liste: d.brouillons ?? [] };
    } catch { return { v: 'erreur' }; }
  };
  const lire = async () => { setEtat(await chercher()); };

  // Le premier acte de l'effet est un `await` → aucun `setState` synchrone dans son corps, et `annule` empêche
  //   d'écrire dans un composant démonté entre-temps. Même patron que les autres écrans de l'admin.
  useEffect(() => {
    let annule = false;
    void (async () => { const r = await chercher(); if (!annule) setEtat(r); })();
    return () => { annule = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (etat.v === 'charge') return <p className="gst-info" role="status">Chargement des brouillons…</p>;
  if (etat.v === 'erreur') {
    return (
      <div>
        <p className="gst-erreur" role="status">Lecture impossible.</p>
        <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => void lire()}>Réessayer</button>
      </div>
    );
  }
  if (etat.liste.length === 0) {
    return (
      <>
        <h3 className="gst-titre">Brouillons</h3>
        <p className="gst-vide">Aucun brouillon en cours.</p>
      </>
    );
  }

  return (
    <>
      <h3 className="gst-titre">Brouillons <span className="gst-compte">{etat.liste.length}</span></h3>
      <ul className="gst-liste">
        {etat.liste.map((b) => (
          <li key={b.id} className="gst-item">
            <div className="gst-item-haut">
              {/* Un brouillon rattaché à un échange s'ouvre DANS son échange : c'est là qu'on le reprendra. */}
              {b.filId !== null
                ? <button type="button" className="gst-objet gst-objet-bouton" onClick={() => onOuvrir(b.filId as number)}>{resumerBrouillon(b)}</button>
                : <span className="gst-objet">{resumerBrouillon(b)}</span>}
            </div>
            <div className="gst-item-bas">
              <span>{LIBELLE_VOIE[b.voie]}</span>
              <span className="gst-sep" aria-hidden="true">·</span>
              <span title={dateHeureComplete(b.majLe)}>{dateHeureCourte(b.majLe, maintenant)}</span>
              {b.a.length > 0 && <><span className="gst-sep" aria-hidden="true">·</span><span>à {b.a.join(', ')}</span></>}
              {b.filId === null && <><span className="gst-sep" aria-hidden="true">·</span><span>hors échange</span></>}
            </div>
            <div className="gst-actions">
              {/* « Abandonner », et non « Supprimer » : le mot dit ce qui se passe vraiment — le brouillon est daté,
                  il quitte la liste, il reste en base. Appeler cela « supprimer » serait un mensonge. */}
              <button type="button" className="svv-btn svv-btn-outline gst-btn"
                onClick={() => void (async () => {
                  try {
                    await fetch(`/api/admin/gestion/brouillons?id=${b.id}`, { method: 'DELETE' });
                  } finally { await lire(); onChange(); }
                })()}>
                Abandonner
              </button>
            </div>
          </li>
        ))}
      </ul>
      <p className="gst-note">Un brouillon abandonné n’est pas supprimé : il est daté et conservé en base.</p>
    </>
  );
}
