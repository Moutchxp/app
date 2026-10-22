import type { ReactNode } from 'react';

/**
 * En-tête STANDARD des pages admin (socle unifié — Phase 1). Composant SERVEUR, purement présentationnel : aucune
 * logique métier, aucun état, aucun style inline (tout vient des classes partagées `svv-page-*` de `globals.css`).
 *
 * - `titre`   : le H1 de la page.
 * - `intro`   : le sous-titre, OBLIGATOIRE (chaque page admin en a un ; à .9rem via `.svv-page-sub`).
 * - `actions` : zone optionnelle à droite du titre (ex. bouton « Historique » de la curation).
 * - `children`: encart(s) optionnel(s) rendus SOUS le sous-titre (ex. avertissement `.svv-page-note`).
 * - `retour`  : Arno (22/10/2026) — l'adresse de la page PARENTE dans la tuile (jamais l'historique du navigateur) ; pose
 *               « ← Retour » en haut à gauche, au-dessus du titre. Même lien partout (`LienRetour`), cible ≥ 44 px.
 *
 * Remplace les en-têtes ad hoc (styles inline / classes locales dupliquées `svv-pil-*`, `svv-ca-*`, `svv-cur-*`,
 * `cpt-*`). La migration des pages est un chantier SÉPARÉ — ce composant est le socle seul.
 */
type Props = {
  titre: string;
  intro: string;
  actions?: ReactNode;
  children?: ReactNode;
  retour?: string;
};

/** « ← Retour » vers la page parente de la tuile (Arno, 22/10/2026) : un lien ordinaire, jamais `history.back()`. */
export function LienRetour({ href }: { href: string }) {
  return (
    <p className="svv-page-retour">
      <a href={href} className="svv-page-retour-lien" data-retour-tuile="">← Retour</a>
    </p>
  );
}

export function EnTetePage({ titre, intro, actions, children, retour }: Props) {
  return (
    <header className="svv-page-head">
      {retour !== undefined ? <LienRetour href={retour} /> : null}
      <div className="svv-page-head-ligne">
        <h1 className="svv-page-title">{titre}</h1>
        {actions ? <div className="svv-page-actions">{actions}</div> : null}
      </div>
      <p className="svv-page-sub">{intro}</p>
      {children}
    </header>
  );
}
