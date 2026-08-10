import type { CSSProperties } from 'react';
import { ConteneurTableDefilant } from './DemandesRendu';
import { formaterDateJour } from '../../../../lib/sitadel/priorite';
import type { LigneArchive, PieceArchive } from '../../../../lib/sitadel/demandeRepo';

/**
 * A1a — Rendu PUR de l'onglet Archives (permis renseignés par les mairies + leurs pièces). Aucun état, aucun effet →
 * testable en Node via `renderToStaticMarkup`. ⚠️ SÉCURITÉ : la CLÉ de stockage n'existe PAS dans ces props (seul un booléen
 * `deposee` + l'id de la pièce) — elle ne peut donc jamais apparaître dans le HTML. Le téléchargement passe par un id
 * (`onTelecharger`), signé côté serveur. Mobile-first (conteneur défilant a11y). Aucune animation → prefers-reduced-motion sans objet.
 */

const styleTd: CSSProperties = { padding: '.4rem .55rem', whiteSpace: 'nowrap', verticalAlign: 'top' };
const muted: CSSProperties = { color: 'var(--color-svv-muted)' };

/** Libellé FR de l'origine du marquage « satisfait » (`satisfait_par`). Valeur inattendue/nulle → « — » (jamais muet). */
export function libelleOrigineSatisfaction(satisfaitPar: string | null): string {
  return satisfaitPar === 'automatique' ? 'automatique' : satisfaitPar === 'manuel' ? 'manuel' : '—';
}

/**
 * Une pièce : DÉPOSÉE → bouton « télécharger » (le serveur signera l'URL via `url_piece` — la clé ne transite JAMAIS) ; NON
 * déposée → son MOTIF en clair, jamais un bouton mort. PURE.
 */
export function PieceLien({ piece, onTelecharger }: { piece: PieceArchive; onTelecharger?: (id: number) => void }) {
  if (piece.deposee) {
    return (
      <button type="button" className="svv-link" style={{ width: 'auto', padding: '.1rem .3rem', textAlign: 'left' }}
        onClick={() => onTelecharger?.(piece.id)}>
        {piece.nomFichier} ↓
      </button>
    );
  }
  return (
    <span style={{ fontSize: 12, ...muted }}>
      {piece.nomFichier} — <em>non déposée{piece.motifNonStocke ? ` : ${piece.motifNonStocke}` : ''}</em>
    </span>
  );
}

/** Cellule « pièces » : la liste des pièces, ou « aucune pièce » si le permis est renseigné mais sans document. PURE. */
export function CellulePieces({ pieces, onTelecharger }: { pieces: PieceArchive[]; onTelecharger?: (id: number) => void }) {
  if (pieces.length === 0) return <span style={{ fontSize: 12, ...muted }}>aucune pièce</span>;
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '.15rem' }}>
      {pieces.map((p) => <li key={p.id}><PieceLien piece={p} onTelecharger={onTelecharger} /></li>)}
    </ul>
  );
}

export const MESSAGE_VIDE_ARCHIVES = 'Aucun permis renseigné pour l’instant.';
export const EXPLICATION_VIDE_ARCHIVES =
  'Ces lignes apparaîtront quand une mairie aura répondu à une demande et que les pièces reçues auront été rattachées au dossier (onglet Réponses) : le permis passe alors en « renseigné » et rejoint les archives.';

/**
 * A1a — TABLEAU des archives, PUR. Une ligne = un permis renseigné. Colonnes : N° Sitadel · Commune · Type · Autorisation ·
 * Satisfaction · Origine · Demande · Pièces. Conteneur défilant a11y (mobile). État vide EXPLICITE (message + d'où viennent
 * les lignes), jamais un tableau muet. Le tri (satisfaction décroissante) est fait côté serveur.
 */
export function TableArchives({ lignes, onTelecharger }: { lignes: LigneArchive[]; onTelecharger?: (id: number) => void }) {
  if (lignes.length === 0) {
    return (
      <div className="svv-card" role="note" style={{ fontSize: 13 }}>
        <strong>{MESSAGE_VIDE_ARCHIVES}</strong>
        <p style={{ fontSize: 12, ...muted, margin: '.4rem 0 0', lineHeight: 1.5 }}>{EXPLICATION_VIDE_ARCHIVES}</p>
      </div>
    );
  }
  return (
    <ConteneurTableDefilant ariaLabel="Tableau des permis archivés, défilement horizontal">
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: 'left', ...muted, borderBottom: '1px solid var(--color-svv-line)' }}>
            <th style={{ ...styleTd, minWidth: 130 }}>N° Sitadel</th>
            <th style={{ ...styleTd, whiteSpace: 'normal' }}>Commune</th>
            <th style={styleTd}>Type</th>
            <th style={styleTd}>Autorisation</th>
            <th style={styleTd}>Satisfaction</th>
            <th style={styleTd}>Origine</th>
            <th style={styleTd}>Demande</th>
            <th style={{ ...styleTd, whiteSpace: 'normal', minWidth: 180 }}>Pièces</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((l) => (
            <tr key={l.dossierId} style={{ borderBottom: '1px solid var(--color-svv-line)' }}>
              <td style={{ ...styleTd, fontFamily: 'var(--font-svv-mono, monospace)' }}>{l.numDau}</td>
              <td style={{ ...styleTd, whiteSpace: 'normal' }}>{l.communeNom ?? l.codeInsee} <span style={{ fontSize: 11, ...muted }}>({l.codeInsee})</span></td>
              <td style={styleTd}>{l.libelleCategorie}</td>
              <td style={styleTd}>{formaterDateJour(l.dateAutorisation)}</td>
              <td style={styleTd}>{formaterDateJour(l.satisfaitLe)}</td>
              <td style={styleTd}>{libelleOrigineSatisfaction(l.satisfaitPar)}</td>
              <td style={{ ...styleTd, fontFamily: 'var(--font-svv-mono, monospace)' }}>{l.demandeReference}</td>
              <td style={{ ...styleTd, whiteSpace: 'normal' }}><CellulePieces pieces={l.pieces} onTelecharger={onTelecharger} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </ConteneurTableDefilant>
  );
}
