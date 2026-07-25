'use client';

import { useState, useSyncExternalStore } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { ChampMotDePasse } from '../ChampMotDePasse';
import {
  INTRO_NOUVEAU_MDP, LIB_CHAMP_NOUVEAU_MDP, LIB_CHAMP_CONFIRMATION, AIDE_MDP,
  LIB_VALIDER_NOUVEAU_MDP, LIB_ENREGISTREMENT_EN_COURS,
  MSG_LIEN_INVALIDE, MSG_ERREUR_REINIT, MSG_RESEAU_INDISPONIBLE, LIB_REDEMANDER_LIEN,
  validerNouveauMotDePasse,
} from '../presentation';

/** `window.location.search` ne change pas ici → abonnement no-op. */
const sabonner = () => () => {};
const lireRecherche = () => window.location.search;
/** Snapshot SERVEUR = `null` (inconnu) : l'hydratation rend « … », puis le client fournit le vrai `search`. */
const rechercheServeur = () => null;

/**
 * SAISIE d'un nouveau mot de passe depuis le lien de reset (client). Le SECRET est lu CÔTÉ CLIENT depuis
 * `window.location.search` (jamais sérialisé par un Server Component — même règle que /verifier). Validation immédiate
 * (≥ 12 + égalité) AVANT tout envoi : le lien reste valide tant que le mot de passe est refusé. Comme le client
 * pré-valide, un `400` du serveur = jeton invalide/expiré/déjà consommé → on propose de redemander un lien. Un `200`
 * pose le cookie de session → on recharge vers /espace, comme après un login. Aucune animation.
 */
export function FormulaireNouveauMotDePasse() {
  // Secret lu CÔTÉ CLIENT via useSyncExternalStore (jamais sérialisé par le serveur — même règle que /verifier). Aucun
  // setState d'effet : `recherche` vaut `null` à l'hydratation (snapshot serveur) puis le vrai `search` côté client.
  const recherche = useSyncExternalStore<string | null>(sabonner, lireRecherche, rechercheServeur);
  const pret = recherche !== null;
  const secret = pret ? new URLSearchParams(recherche).get('j') : null; // URLSearchParams retire le « ? » de tête

  const [mdp, setMdp] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [lienMort, setLienMort] = useState(false); // jeton absent/refusé → propose de redemander

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    if (enCours) return; // anti-double-clic
    setErreur(null);
    const v = validerNouveauMotDePasse(mdp, confirmation);
    if (!v.ok) { setErreur(v.erreur); return; } // retour immédiat, AUCUN appel → le lien reste valide
    if (!secret) { setLienMort(true); return; }
    setEnCours(true);
    try {
      const res = await fetch('/api/internaute/auth/reinitialiser/confirmer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jeton: secret, motDePasse: mdp, motDePasseConfirmation: confirmation }),
      });
      if (res.ok) { window.location.href = '/espace'; return; } // cookie posé → rechargement complet vers l'espace
      if (res.status === 400) { setLienMort(true); return; } // pré-validé côté client → 400 = jeton invalide/expiré
      setErreur(MSG_ERREUR_REINIT); // 500 et autres
    } catch {
      setErreur(MSG_RESEAU_INDISPONIBLE);
    } finally {
      setEnCours(false);
    }
  }

  if (!pret) return <p className="text-sm text-svv-muted" style={{ margin: 0 }}>…</p>; // bref, avant lecture de l'URL

  // Aucun secret dans l'URL, OU jeton refusé par la route → invalidité + retour vers la demande (sans appeler la route).
  if (!secret || lienMort) {
    return (
      <div className="flex flex-col gap-3">
        <p role="alert" className="svv-page-note" style={{ marginTop: 0 }}>{MSG_LIEN_INVALIDE}</p>
        <Link href="/espace/mot-de-passe-oublie" className="svv-btn svv-btn-outline">{LIB_REDEMANDER_LIEN}</Link>
      </div>
    );
  }

  return (
    <form onSubmit={soumettre} className="flex flex-col gap-3">
      <p className="text-sm text-svv-muted" style={{ margin: 0 }}>{INTRO_NOUVEAU_MDP}</p>

      <label className="flex flex-col gap-1">
        <span className="svv-label">{LIB_CHAMP_NOUVEAU_MDP}</span>
        <ChampMotDePasse value={mdp} onChange={setMdp} autoComplete="new-password" required />
      </label>

      <label className="flex flex-col gap-1">
        <span className="svv-label">{LIB_CHAMP_CONFIRMATION}</span>
        <ChampMotDePasse value={confirmation} onChange={setConfirmation} autoComplete="new-password" required />
      </label>

      <span className="text-xs text-svv-muted">{AIDE_MDP}</span>

      {erreur && <p role="alert" className="svv-page-note" style={{ marginTop: 0 }}>{erreur}</p>}

      <button type="submit" disabled={enCours} className="svv-btn svv-btn-primary" style={{ marginTop: '.25rem' }}>
        {enCours ? LIB_ENREGISTREMENT_EN_COURS : LIB_VALIDER_NOUVEAU_MDP}
      </button>
    </form>
  );
}
