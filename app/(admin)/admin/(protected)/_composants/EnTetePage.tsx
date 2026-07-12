import type { ReactNode } from 'react';

/**
 * En-tête STANDARD des pages admin (socle unifié — Phase 1). Composant SERVEUR, purement présentationnel : aucune
 * logique métier, aucun état, aucun style inline (tout vient des classes partagées `svv-page-*` de `globals.css`).
 *
 * - `titre`   : le H1 de la page.
 * - `intro`   : le sous-titre, OBLIGATOIRE (chaque page admin en a un ; à .9rem via `.svv-page-sub`).
 * - `actions` : zone optionnelle à droite du titre (ex. bouton « Historique » de la curation).
 * - `children`: encart(s) optionnel(s) rendus SOUS le sous-titre (ex. avertissement `.svv-page-note`).
 *
 * Remplace les en-têtes ad hoc (styles inline / classes locales dupliquées `svv-pil-*`, `svv-ca-*`, `svv-cur-*`,
 * `cpt-*`). La migration des pages est un chantier SÉPARÉ — ce composant est le socle seul.
 */
type Props = {
  titre: string;
  intro: string;
  actions?: ReactNode;
  children?: ReactNode;
};

export function EnTetePage({ titre, intro, actions, children }: Props) {
  return (
    <header className="svv-page-head">
      <div className="svv-page-head-ligne">
        <h1 className="svv-page-title">{titre}</h1>
        {actions ? <div className="svv-page-actions">{actions}</div> : null}
      </div>
      <p className="svv-page-sub">{intro}</p>
      {children}
    </header>
  );
}
