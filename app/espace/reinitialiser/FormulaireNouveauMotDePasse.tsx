'use client';

import { useState, useSyncExternalStore } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import Link from 'next/link';
import {
  INTRO_NOUVEAU_MDP, LIB_CHAMP_NOUVEAU_MDP, LIB_CHAMP_CONFIRMATION, AIDE_MDP,
  ARIA_AFFICHER_MDP, ARIA_MASQUER_MDP, LIB_VALIDER_NOUVEAU_MDP, LIB_ENREGISTREMENT_EN_COURS,
  MSG_LIEN_INVALIDE, MSG_ERREUR_REINIT, MSG_RESEAU_INDISPONIBLE, LIB_REDEMANDER_LIEN,
  validerNouveauMotDePasse,
} from '../presentation';

const styleInput: CSSProperties = {
  width: '100%', padding: '.75rem', minHeight: 44, fontSize: 16,
  borderRadius: '.6rem', border: '1px solid var(--color-svv-line)',
};
/** Champ mot de passe : réserve à droite la place de l'œil (padding droit) pour que le texte ne passe pas dessous. */
const styleChampMdp: CSSProperties = { ...styleInput, paddingRight: 48 };
/** Bouton-œil DANS le champ : pleine hauteur × 44px de large → cible tactile ≥ 44px, icône centrée, couleur de charte. */
const styleOeil: CSSProperties = {
  position: 'absolute', top: 0, right: 0, bottom: 0, width: 44,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'var(--color-svv-muted)',
};

/**
 * Icône œil monochrome (SVG inline, `currentColor`, aucune dépendance). `visible=true` (mot de passe affiché) → œil BARRÉ
 * (l'action au clic = masquer) ; sinon œil ouvert (action = afficher). `aria-hidden` : le sens est porté par l'aria-label
 * du bouton. Trait statique, aucune animation (prefers-reduced-motion sans objet).
 */
function IconeOeil({ visible }: { visible: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
      {visible && <line x1="4" y1="4" x2="20" y2="20" />}
    </svg>
  );
}

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
  const [afficherMdp, setAfficherMdp] = useState(false); // visibilité du champ « nouveau mot de passe » (indépendante)
  const [afficherConfirmation, setAfficherConfirmation] = useState(false); // visibilité du champ « confirmation » (indépendante)
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
        <div style={{ position: 'relative' }}>
          <input
            type={afficherMdp ? 'text' : 'password'}
            autoComplete="new-password"
            required
            value={mdp}
            onChange={(e) => setMdp(e.target.value)}
            className="svv-input"
            style={styleChampMdp}
          />
          <button
            type="button"
            onClick={() => setAfficherMdp((a) => !a)}
            aria-pressed={afficherMdp}
            aria-label={afficherMdp ? ARIA_MASQUER_MDP : ARIA_AFFICHER_MDP}
            style={styleOeil}
          >
            <IconeOeil visible={afficherMdp} />
          </button>
        </div>
      </label>

      <label className="flex flex-col gap-1">
        <span className="svv-label">{LIB_CHAMP_CONFIRMATION}</span>
        <div style={{ position: 'relative' }}>
          <input
            type={afficherConfirmation ? 'text' : 'password'}
            autoComplete="new-password"
            required
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            className="svv-input"
            style={styleChampMdp}
          />
          <button
            type="button"
            onClick={() => setAfficherConfirmation((a) => !a)}
            aria-pressed={afficherConfirmation}
            aria-label={afficherConfirmation ? ARIA_MASQUER_MDP : ARIA_AFFICHER_MDP}
            style={styleOeil}
          >
            <IconeOeil visible={afficherConfirmation} />
          </button>
        </div>
      </label>

      <span className="text-xs text-svv-muted">{AIDE_MDP}</span>

      {erreur && <p role="alert" className="svv-page-note" style={{ marginTop: 0 }}>{erreur}</p>}

      <button type="submit" disabled={enCours} className="svv-btn svv-btn-primary" style={{ marginTop: '.25rem' }}>
        {enCours ? LIB_ENREGISTREMENT_EN_COURS : LIB_VALIDER_NOUVEAU_MDP}
      </button>
    </form>
  );
}
