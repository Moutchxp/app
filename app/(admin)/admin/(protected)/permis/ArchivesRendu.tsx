import type { CSSProperties } from 'react';
import { ConteneurTableDefilant } from './DemandesRendu';
import { formaterDateJour } from '../../../../lib/sitadel/priorite';
import type { LigneArchive, PieceArchive } from '../../../../lib/sitadel/demandeRepo';

/**
 * A1a/A1b — Rendu PUR de l'onglet Archives (permis renseignés par les mairies + leurs pièces, reçues par e-mail OU ajoutées à
 * la main). Aucun état, aucun effet → testable en Node via `renderToStaticMarkup`. ⚠️ SÉCURITÉ : la CLÉ de stockage n'existe
 * PAS dans ces props (seul un booléen `deposee` + l'id de la pièce) — elle ne peut jamais apparaître dans le HTML. Le
 * téléchargement passe par un id + une `source`, signés côté serveur. Mobile-first (conteneur défilant a11y). Aucune animation.
 */

const styleTd: CSSProperties = { padding: '.4rem .55rem', whiteSpace: 'nowrap', verticalAlign: 'top' };
const muted: CSSProperties = { color: 'var(--color-svv-muted)' };

/** Libellé FR de l'origine du marquage « satisfait » (`satisfait_par`). Valeur inattendue/nulle → « — » (jamais muet). */
export function libelleOrigineSatisfaction(satisfaitPar: string | null): string {
  return satisfaitPar === 'automatique' ? 'automatique' : satisfaitPar === 'manuel' ? 'manuel' : '—';
}

/** Pastille d'ORIGINE d'une pièce : reçue par e-mail (registre) vs ajoutée à la main. Texte porteur, couleur en appui. */
function PastilleOrigine({ manuel }: { manuel: boolean }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '.03rem .3rem', borderRadius: '.3rem', whiteSpace: 'nowrap',
      background: manuel ? 'var(--color-svv-green-soft)' : 'var(--color-svv-field)', color: manuel ? 'var(--color-svv-green-ink)' : 'var(--color-svv-muted)' }}>
      {manuel ? 'ajoutée à la main' : 'reçue par e-mail'}
    </span>
  );
}

/**
 * Une pièce : ORIGINE visible + DÉPOSÉE → bouton « télécharger » (le serveur signera l'URL — la clé ne transite JAMAIS ;
 * `source` dérivée de l'origine) ; NON déposée → son MOTIF, jamais un bouton mort. Un document AJOUTÉ À LA MAIN est
 * supprimable ; une pièce reçue par e-mail ne l'est jamais (pas de bouton — et le serveur refuse aussi). PURE.
 */
export function PieceLien({ piece, onTelecharger, onSupprimer }: {
  piece: PieceArchive; onTelecharger?: (id: number, source: 'reponse' | 'dossier') => void; onSupprimer?: (documentId: number) => void;
}) {
  const manuel = piece.origine === 'manuel';
  const source = manuel ? 'dossier' : 'reponse';
  return (
    <span style={{ display: 'inline-flex', gap: '.3rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
      <PastilleOrigine manuel={manuel} />
      {piece.deposee
        ? <button type="button" className="svv-link" style={{ width: 'auto', padding: '.1rem .3rem', textAlign: 'left' }} onClick={() => onTelecharger?.(piece.id, source)}>{piece.nomFichier} ↓</button>
        : <span style={{ fontSize: 12, ...muted }}>{piece.nomFichier} — <em>non déposée{piece.motifNonStocke ? ` : ${piece.motifNonStocke}` : ''}</em></span>}
      {manuel && onSupprimer ? <button type="button" className="svv-link" style={{ width: 'auto', padding: '.1rem .3rem', color: 'var(--color-svv-red)' }} onClick={() => onSupprimer(piece.id)}>supprimer</button> : null}
    </span>
  );
}

/** Cellule « pièces » : la liste des pièces (e-mail + manuelles), ou « aucun document attaché » si le permis est renseigné sans
 *  document (T2 : jamais une archive vide muette — la ligne le DIT). PURE. */
export function CellulePieces({ pieces, onTelecharger, onSupprimer }: {
  pieces: PieceArchive[]; onTelecharger?: (id: number, source: 'reponse' | 'dossier') => void; onSupprimer?: (documentId: number) => void;
}) {
  if (pieces.length === 0) return <span style={{ fontSize: 12, ...muted }}>aucun document attaché</span>;
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '.15rem' }}>
      {pieces.map((p) => <li key={`${p.origine}-${p.id}`}><PieceLien piece={p} onTelecharger={onTelecharger} onSupprimer={onSupprimer} /></li>)}
    </ul>
  );
}

/**
 * A1b — contrôle d'ajout d'un document À LA MAIN sur un permis. PUR : le fichier choisi est remonté à la Vue (`onFichier`),
 * qui le téléverse. Pas d'attribut `accept` : la whitelist MIME reste l'AUTORITÉ du serveur (aucune copie côté client). Le
 * champ `file` est masqué derrière un libellé cliquable (cible tactile suffisante, pas d'input brut disgracieux).
 */
export function AjoutDocument({ dossierId, onFichier, enCours }: { dossierId: number; onFichier?: (dossierId: number, fichier: File) => void; enCours?: boolean }) {
  return (
    <label style={{ display: 'inline-flex', gap: '.3rem', alignItems: 'center', fontSize: 12, cursor: enCours ? 'default' : 'pointer' }}>
      <span className="svv-link" style={{ padding: '.1rem .3rem' }} aria-hidden="true">{enCours ? 'Envoi…' : '+ ajouter un document'}</span>
      <input type="file" style={{ position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden' }} disabled={enCours}
        aria-label={`Ajouter un document au permis ${dossierId}`}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFichier?.(dossierId, f); e.target.value = ''; }} />
    </label>
  );
}

export const MESSAGE_VIDE_ARCHIVES = 'Aucun permis renseigné pour l’instant.';
export const EXPLICATION_VIDE_ARCHIVES =
  'Ces lignes apparaîtront quand une mairie aura répondu à une demande et que les pièces reçues auront été rattachées au dossier (onglet Réponses) : le permis passe alors en « renseigné » et rejoint les archives.';

/**
 * A1a/A1b — TABLEAU des archives, PUR. Une ligne = un permis renseigné. Colonnes : N° permis · Commune · Type · Autorisation ·
 * Satisfaction · Origine · Demande · Pièces (les deux origines + l'ajout à la main). Conteneur défilant a11y (mobile). État
 * vide EXPLICITE (message + d'où viennent les lignes), jamais un tableau muet. Tri (satisfaction décroissante) côté serveur.
 */
export function TableArchives({ lignes, onTelecharger, onSupprimer, onFichier, uploadEnCours }: {
  lignes: LigneArchive[];
  onTelecharger?: (id: number, source: 'reponse' | 'dossier') => void;
  onSupprimer?: (documentId: number) => void;
  onFichier?: (dossierId: number, fichier: File) => void;
  uploadEnCours?: number | null;
}) {
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
            <th style={{ ...styleTd, minWidth: 130 }}>N° permis</th>
            <th style={{ ...styleTd, whiteSpace: 'normal' }}>Commune</th>
            <th style={styleTd}>Type</th>
            <th style={styleTd}>Autorisation</th>
            <th style={styleTd}>Satisfaction</th>
            <th style={styleTd}>Origine</th>
            <th style={styleTd}>Demande</th>
            <th style={{ ...styleTd, whiteSpace: 'normal', minWidth: 200 }}>Pièces</th>
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
              <td style={{ ...styleTd, whiteSpace: 'normal' }}>
                <CellulePieces pieces={l.pieces} onTelecharger={onTelecharger} onSupprimer={onSupprimer} />
                <div style={{ marginTop: '.35rem' }}><AjoutDocument dossierId={l.dossierId} onFichier={onFichier} enCours={uploadEnCours === l.dossierId} /></div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ConteneurTableDefilant>
  );
}
