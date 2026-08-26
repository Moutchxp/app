/**
 * PARC-3 — Légende PURE du calque parcelle (aucune dépendance Leaflet/DOM/réseau → testable via `renderToStaticMarkup`).
 *
 * DEUX exigences portées ici :
 *  1. La couleur NE porte PAS l'information seule : chaque pastille est TOUJOURS accompagnée d'un LIBELLÉ texte.
 *  2. MISE EN GARDE NON NÉGOCIABLE : l'absence de marque ne prouve PAS l'absence de permis (rapprochement cadastral échoué —
 *     8 030 dossiers en commune couverte non rattachés —, ou commune hors du cadastre chargé). Un test casse si elle disparaît.
 */

/** Texte de la mise en garde (constante ré-exportée pour être asserée par le test — une seule source de vérité). */
export const AVERTISSEMENT_ABSENCE_CALQUE =
  'L’absence de marque ne prouve pas l’absence de permis : un dossier peut exister sans être rattaché (rapprochement cadastral échoué, ou commune hors du cadastre chargé).';

export function LegendeParcelles({ tronque }: { tronque: boolean }) {
  return (
    <div className="svv-cur-panneau">
      <ul className="svv-cur-legende" aria-label="Légende du calque parcelle">
        <li className="svv-cur-legende-item">
          <span className="svv-cur-legende-pastille svv-cur-legende-pastille--citee" aria-hidden="true" />
          Parcelle citée par au moins un dossier
        </li>
        <li className="svv-cur-legende-item">
          <span className="svv-cur-legende-pastille svv-cur-legende-pastille--vide" aria-hidden="true" />
          Parcelle sans dossier rattaché
        </li>
      </ul>
      <p className="svv-cur-legende-avert">{AVERTISSEMENT_ABSENCE_CALQUE}</p>
      {tronque && (
        <p className="svv-cur-legende-tronque">
          Beaucoup de parcelles ici : l’affichage est limité — zoomez pour toutes les voir.
        </p>
      )}
    </div>
  );
}
