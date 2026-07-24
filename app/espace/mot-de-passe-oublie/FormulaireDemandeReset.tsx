'use client';

import { useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import Link from 'next/link';
import {
  INTRO_MDP_OUBLIE, LIB_CHAMP_EMAIL, LIB_ENVOYER_LIEN, LIB_ENVOI_EN_COURS,
  MSG_DEMANDE_ENVOYEE, LIB_RETOUR_CONNEXION, MSG_RESEAU_INDISPONIBLE,
} from '../presentation';

/** Style d'input calqué sur le formulaire de connexion (inline), + `min-height`/`font-size` pour cible ≥ 44px et anti-zoom iOS. */
const styleInput: CSSProperties = {
  width: '100%', padding: '.75rem', minHeight: 44, fontSize: 16,
  borderRadius: '.6rem', border: '1px solid var(--color-svv-line)',
};

/**
 * DEMANDE de réinitialisation (client). POST `/api/internaute/auth/reinitialiser/demander` — la route répond TOUJOURS un
 * générique 200 (anti-énumération). L'écran affiche donc TOUJOURS le MÊME message de confirmation, succès comme échec :
 * il ne révèle JAMAIS si l'adresse a un compte. Aucune animation (prefers-reduced-motion respecté).
 */
export function FormulaireDemandeReset() {
  const [email, setEmail] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [envoye, setEnvoye] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    if (enCours) return; // anti-double-clic
    setErreur(null);
    setEnCours(true);
    try {
      await fetch('/api/internaute/auth/reinitialiser/demander', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      setEnvoye(true); // réponse toujours générique → même écran quelle que soit l'issue
    } catch {
      setErreur(MSG_RESEAU_INDISPONIBLE); // panne réseau navigateur : neutre, ne révèle rien
    } finally {
      setEnCours(false);
    }
  }

  // Écran de confirmation : identique que l'adresse ait un compte ou non.
  if (envoye) {
    return (
      <div className="flex flex-col gap-3">
        <p role="status" className="svv-page-note" style={{ marginTop: 0 }}>{MSG_DEMANDE_ENVOYEE}</p>
        <Link href="/espace/connexion" className="svv-link" style={{ minHeight: 44 }}>{LIB_RETOUR_CONNEXION}</Link>
      </div>
    );
  }

  return (
    <form onSubmit={soumettre} className="flex flex-col gap-3">
      <p className="text-sm text-svv-muted" style={{ margin: 0 }}>{INTRO_MDP_OUBLIE}</p>
      <label className="flex flex-col gap-1">
        <span className="svv-label">{LIB_CHAMP_EMAIL}</span>
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="svv-input"
          style={styleInput}
        />
      </label>

      {erreur && <p role="alert" className="svv-page-note" style={{ marginTop: 0 }}>{erreur}</p>}

      <button type="submit" disabled={enCours} className="svv-btn svv-btn-primary" style={{ marginTop: '.25rem' }}>
        {enCours ? LIB_ENVOI_EN_COURS : LIB_ENVOYER_LIEN}
      </button>
      <Link href="/espace/connexion" className="svv-link" style={{ minHeight: 44 }}>{LIB_RETOUR_CONNEXION}</Link>
    </form>
  );
}
