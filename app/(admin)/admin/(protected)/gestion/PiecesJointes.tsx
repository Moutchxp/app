'use client';

import { useState } from 'react';
import {
  etatArchive, etiquetteType, formaterTaille, sortePiece, tronquerNom,
  type PieceAffichee,
} from '../../../../lib/gestion/pieces';

/**
 * LOT 5-PJ-A — LES PIÈCES JOINTES, COMME DANS GMAIL. Composant PARTAGÉ : un seul endroit rend les pièces, partout où
 * un message s'affiche (boîte plein écran, écran partagé, carte d'événement). Deux rendus divergents finiraient par
 * se contredire, et l'un des deux serait oublié à la première correction.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CE QUI EST TENU ICI, ET POURQUOI :
 *   · AUCUNE ACTION AU SEUL SURVOL. Le bouton « Télécharger » est TOUJOURS visible, et sa cible fait 44 px : sur un
 *     iPhone, il n'y a pas de survol, et une action qui n'apparaît qu'au passage de la souris n'existe pas ;
 *   · AUCUNE URL DE STOCKAGE. Miniatures et fichiers sont servis par l'application, qui relit le droit à chaque fois ;
 *   · LA PLACE DU BOUTON « DRIVE » (lot 5-PJ-B) EST DÉJÀ PRÉVUE dans la barre d'actions de chaque carte et dans la
 *     barre du haut. Aucun bouton Drive n'est affiché par ce lot, pas même désactivé : promettre un geste qui n'existe
 *     pas est pire que de ne rien montrer ;
 *   · UNE INFORMATION N'EST JAMAIS PORTÉE PAR LA SEULE COULEUR : une pièce non conservée le dit EN MOTS, avec son motif.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * 🔴 CE FICHIER EST CHARGÉ PAR LE NAVIGATEUR : il n'importe que `lib/gestion/pieces` (module PUR). Rien qui touche la
 * base, sous peine de faire tomber toute l'application (incident du 24/09/2026).
 */

/** Les dimensions réservées à la vignette. Fixées ICI et dans le CSS : sans elles, la page saute quand les images arrivent. */
const VIGNETTE_H = 108;

export function PiecesJointes({ messageId, vraies, signatures }: {
  messageId: number;
  vraies: PieceAffichee[];
  signatures: PieceAffichee[];
}) {
  if (vraies.length === 0 && signatures.length === 0) return null;
  return (
    <div className="pj">
      {vraies.length > 0 && <BlocPieces messageId={messageId} pieces={vraies} />}
      {/* Les images de signature restent À PART et repliées : elles ne doivent pas noyer les vraies pièces (lot 4d-C). */}
      {signatures.length > 0 && (
        <details className="pj-signatures">
          <summary className="pj-signatures-titre">
            {signatures.length} image{signatures.length > 1 ? 's' : ''} de signature
          </summary>
          <BlocPieces messageId={messageId} pieces={signatures} archive={false} />
        </details>
      )}
    </div>
  );
}

function BlocPieces({ messageId, pieces, archive = true }: {
  messageId: number; pieces: PieceAffichee[]; archive?: boolean;
}) {
  const dispo = pieces.filter((p) => p.disponible);
  const refusees = pieces.filter((p) => !p.disponible);
  const etat = etatArchive(pieces);

  return (
    <>
      {/* ══ LA BARRE ══ Conçue pour accueillir « Tout ajouter au Drive » (lot B) à côté de « Tout télécharger », sans
          rien déplacer : c'est une rangée d'actions, pas un bouton posé là. */}
      <div className="pj-barre">
        <span className="pj-compte">
          {pieces.length} pièce{pieces.length > 1 ? 's' : ''} jointe{pieces.length > 1 ? 's' : ''}
        </span>
        {archive && dispo.length > 1 && (
          <span className="pj-actions-barre">
            {etat.possible ? (
              <a className="pj-bouton" href={`/api/admin/gestion/messages/${messageId}/archive`}>
                <span aria-hidden="true">⤓</span> Tout télécharger
                <span className="pj-poids"> ({formaterTaille(etat.octets)})</span>
              </a>
            ) : (
              // Le bouton DIT pourquoi il ne peut pas, au lieu d'échouer après une minute d'attente.
              <span className="pj-bouton pj-bouton--muet" role="note">Archive impossible : {etat.motif}</span>
            )}
          </span>
        )}
      </div>

      <ul className="pj-grille">
        {dispo.map((p) => <CartePiece key={p.pieceId} piece={p} />)}
      </ul>

      {/* ══ LES PIÈCES REFUSÉES À LA CAPTURE ══ Listées À PART, avec leur motif. Elles ne sont jamais silencieusement
          absentes : une pièce qu'on n'a pas doit se voir, sinon on la croit reçue. */}
      {refusees.length > 0 && (
        <ul className="pj-refusees">
          {refusees.map((p) => (
            <li key={p.pieceId} className="pj-refusee">
              <span className="pj-refusee-nom" title={p.nomFichier}>{tronquerNom(p.nomFichier, 40)}</span>
              {' — non conservée'}{p.motifNonStocke ? ` (${p.motifNonStocke})` : ''}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * UNE CARTE. La vignette n'est demandée que pour ce qui peut en avoir une ; pour le reste, une étiquette de TYPE en
 * toutes lettres (« XML », « DOCX »), qui dit bien plus qu'une icône générique.
 *
 * `loading="lazy"` + dimensions réservées : vingt pièces ne déclenchent pas vingt requêtes au chargement, et la page
 * ne saute pas quand les images arrivent.
 */
function CartePiece({ piece: p }: { piece: PieceAffichee }) {
  const sorte = sortePiece(p.typeMime, p.nomFichier);
  const [vignetteMorte, setVignetteMorte] = useState(false);
  const avecVignette = sorte !== 'autre' && !vignetteMorte;
  const etiquette = etiquetteType(p.nomFichier, p.typeMime);
  const lien = `/api/admin/gestion/pieces/${p.pieceId}`;
  // Un PDF et une image s'OUVRENT (nouvel onglet) ; tout le reste se TÉLÉCHARGE — ouvrir un .xml dans un onglet
  //   n'apprend rien, et ouvrir un type inconnu revient à laisser le navigateur décider quoi en faire.
  const ouvrable = sorte !== 'autre';

  return (
    <li className="pj-carte">
      <a
        className="pj-apercu"
        href={ouvrable ? lien : `${lien}?telecharger=1`}
        {...(ouvrable ? { target: '_blank', rel: 'noreferrer' } : {})}
        aria-label={`${ouvrable ? 'Ouvrir' : 'Télécharger'} ${p.nomFichier} (${etiquette}, ${formaterTaille(p.tailleOctets)})`}
      >
        {avecVignette ? (
          // eslint-disable-next-line @next/next/no-img-element -- fichier privé servi par une route, jamais optimisable par Next
          <img
            className="pj-vignette"
            src={`${lien}/miniature`}
            alt=""
            height={VIGNETTE_H}
            loading="lazy"
            decoding="async"
            // Pas de vignette (migration 244 non appliquée, type sans image, fichier illisible) : on retombe sur
            //   l'étiquette de type, sans jamais laisser une image cassée à l'écran.
            onError={() => setVignetteMorte(true)}
          />
        ) : (
          <span className="pj-type" aria-hidden="true">{etiquette}</span>
        )}
      </a>

      <div className="pj-pied">
        <span className="pj-nom" title={p.nomFichier}>{tronquerNom(p.nomFichier)}</span>
        <span className="pj-taille">{formaterTaille(p.tailleOctets)}</span>
      </div>

      {/* ══ LA RANGÉE D'ACTIONS ══ Toujours visible, jamais au survol. Le bouton « Drive » du lot B viendra ICI, à
          côté de celui-ci, sans rien réorganiser. */}
      <div className="pj-actions">
        <a className="pj-action" href={`${lien}?telecharger=1`} aria-label={`Télécharger ${p.nomFichier}`} title="Télécharger">
          <span aria-hidden="true">⤓</span>
        </a>
      </div>
    </li>
  );
}

/**
 * Le style des pièces jointes. Uniquement des jetons `--color-svv-*` : aucune couleur en dur, et la grille se replie
 * en colonne étroite sur un iPhone en portrait (390 px).
 */
export const CSS_PIECES = `
.pj{margin-top:.6rem;min-width:0}
/* ── LA BARRE ── prête à recevoir un second bouton (Drive, lot B) sans rien déplacer. */
.pj-barre{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:.45rem}
.pj-compte{font-size:.82rem;color:var(--color-svv-ink-soft)}
.pj-actions-barre{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-left:auto}
.pj-bouton{display:inline-flex;align-items:center;gap:.35rem;min-height:44px;padding:0 .7rem;border-radius:.5rem;
  font-size:.82rem;color:var(--color-svv-ink);background:var(--color-svv-field);
  border:1px solid var(--color-svv-line);text-decoration:none;cursor:pointer}
.pj-bouton:hover{border-color:var(--color-svv-ink-soft)}
.pj-bouton:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
/* Un refus n'est pas un bouton : il ne se clique pas, et il DIT pourquoi. */
.pj-bouton--muet{background:transparent;border-style:dashed;color:var(--color-svv-ink-soft);cursor:default}
.pj-poids{color:var(--color-svv-ink-soft)}

/* ── LA GRILLE ── auto-fill + minmax : trois cartes sur un écran large, UNE seule à 390 px, sans media query.
   (Pas d'accent grave dans ce commentaire : il est DANS un littéral gabarit, qu'il terminerait — piège déjà payé.) */
.pj-grille{list-style:none;margin:0;padding:0;display:grid;gap:8px;
  grid-template-columns:repeat(auto-fill,minmax(180px,1fr))}
.pj-carte{display:flex;flex-direction:column;border:1px solid var(--color-svv-line);border-radius:.6rem;
  background:var(--color-svv-surface);overflow:hidden;min-width:0}

/* L'aperçu : hauteur RÉSERVÉE, pour que la page ne saute pas quand les vignettes arrivent. */
.pj-apercu{display:flex;align-items:center;justify-content:center;height:${VIGNETTE_H}px;
  background:var(--color-svv-field);border-bottom:1px solid var(--color-svv-line);text-decoration:none;overflow:hidden}
.pj-apercu:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px}
.pj-vignette{max-width:100%;height:${VIGNETTE_H}px;object-fit:contain;display:block}
/* L'étiquette de TYPE en toutes lettres : elle reste lisible en niveaux de gris, là où une icône seule ne dirait rien. */
.pj-type{font-size:.95rem;font-weight:600;letter-spacing:.06em;color:var(--color-svv-ink-soft)}

.pj-pied{display:flex;flex-direction:column;gap:2px;padding:.4rem .5rem 0;min-width:0}
.pj-nom{font-size:.8rem;color:var(--color-svv-ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pj-taille{font-size:.74rem;color:var(--color-svv-ink-soft)}

/* Les actions : TOUJOURS visibles (jamais au survol seul), cible de 44 px. */
.pj-actions{display:flex;align-items:center;gap:2px;padding:.2rem .35rem .35rem;margin-top:auto}
.pj-action{display:inline-flex;align-items:center;justify-content:center;min-width:44px;min-height:44px;
  color:var(--color-svv-ink);background:transparent;border:1px solid transparent;border-radius:.45rem;
  text-decoration:none;font-size:1.05rem;line-height:1}
.pj-action:hover{background:var(--color-svv-field);border-color:var(--color-svv-line)}
.pj-action:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}

.pj-refusees{list-style:none;margin:.45rem 0 0;padding:0;display:flex;flex-direction:column;gap:.2rem}
.pj-refusee{font-size:.78rem;color:var(--color-svv-ink-soft)}
.pj-refusee-nom{color:var(--color-svv-ink)}

.pj-signatures{margin-top:.5rem}
.pj-signatures-titre{cursor:pointer;font-size:.78rem;color:var(--color-svv-ink-soft);min-height:44px;
  display:flex;align-items:center}
.pj-signatures-titre:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}

@media (prefers-reduced-motion:reduce){
  .pj-bouton,.pj-action,.pj-apercu{transition:none}
}
`;
