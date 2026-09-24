'use client';

import { useState } from 'react';
import { ChoisirEvenement } from './ChoisirEvenement';

/**
 * LOT 5b — LES BRIQUES PARTAGÉES DES GESTES SUR UN MAIL, extraites de `CarteVive` sans être modifiées.
 *
 * POURQUOI CE FICHIER EXISTE, et ce n'est pas du rangement : la vue conversation (`Conversation.tsx`) doit porter les
 * MÊMES gestes par message que la carte — déplacer un mail, le détacher. Si elle les importait de `CarteVive`, qui
 * l'importe elle-même, on créerait un cycle d'imports : fragile en React, et le genre de défaut qui se manifeste par
 * un composant « undefined » au premier rendu, longtemps après le commit. Les briques communes vivent donc ici, et les
 * deux vues en dépendent sans dépendre l'une de l'autre.
 *
 * 🔒 AUCUNE LOGIQUE N'A CHANGÉ : mêmes routes, mêmes messages, même réversibilité qu'avant ce lot.
 */

/** Comment un geste rend compte : un message pour l'écran, et s'il faut relire tout le reste. */
export type Rapport = (message: string, options?: { rechargerTout?: boolean }) => void;

/**
 * Déplace UN mail vers une autre carte, ou l'y remet. Le mail n'est JAMAIS copié ni supprimé : seul son rattachement
 * change, et son échange d'origine continue de l'annoncer.
 */
export async function agirSurLeMail(messageId: number, cible: number | null, onGeste: Rapport): Promise<void> {
  try {
    const res = cible === null
      ? await fetch(`/api/admin/gestion/messages/${messageId}/affectation`, { method: 'DELETE' })
      : await fetch(`/api/admin/gestion/messages/${messageId}/affectation`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ evenementId: cible }),
      });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; reference?: string; erreur?: string };
    if (!res.ok || !data.ok) { onGeste(data.erreur ?? 'Geste impossible sur ce mail.'); return; }
    onGeste(cible === null
      ? 'Mail remis dans son échange.'
      : `Mail déplacé vers ${data.reference ?? 'l’événement choisi'} — il reste dans son échange d’origine, qui l’annonce.`,
    { rechargerTout: true });
  } catch {
    onGeste('Geste impossible : le serveur n’a pas répondu.');
  }
}

/** Le petit panneau de destination : la MÊME recherche que partout ailleurs, et rien d'autre. */
export function DeplacerVers({ titre, exclure, onValider, onAnnuler }: {
  titre: string; exclure: number | null;
  onValider: (evenementId: number) => Promise<void> | void;
  onAnnuler: () => void;
}) {
  const [choisi, setChoisi] = useState<number | null>(null);
  const [enCours, setEnCours] = useState(false);
  return (
    <div className="gst-panneau">
      <p className="gst-panneau-titre">{titre}</p>
      <ChoisirEvenement choisi={choisi} onChoisir={setChoisi} exclure={exclure} autoFocus />
      <div className="gst-actions">
        <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={choisi === null || enCours}
          onClick={() => { setEnCours(true); void Promise.resolve(onValider(choisi as number)).finally(() => setEnCours(false)); }}>
          {enCours ? 'Déplacement…' : 'Déplacer'}
        </button>
        <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={enCours} onClick={onAnnuler}>Annuler</button>
      </div>
    </div>
  );
}
