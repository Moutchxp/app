'use client';

import { useEffect, useRef, useState } from 'react';
import {
  grouperParMessage, INFOBULLE_PIECES_CONVERSATION, libelleOrdrePieces, mentionExpediteurPiece, motPieces,
  TITRE_PIECES_CONVERSATION, type OrdrePieces, type PieceDeConversation,
} from '../../../../lib/gestion/piecesConversation';
import { etiquetteType, formaterTaille, sortePiece, tronquerNom } from '../../../../lib/gestion/pieces';
import { dateHeureComplete, dateHeureCourte } from '../../../../lib/gestion/ecran';
import { messageSansApercu, sorteApercu } from '../../../../lib/gestion/apercuDrive';
import type { DepotAffiche } from './PiecesJointes';

/**
 * LOT PIECES-DE-LA-CONVERSATION — LE RÉCAPITULATIF DES PIÈCES D'UN ÉCHANGE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 CE QUE ÇA RÉPARE, DANS LES MOTS D'ARNO : « dans toute conversation qui contient au moins une pièce jointe,
 * un petit trombone + le nombre total, en haut et en bas. Un clic ouvre une fenêtre “Pièces jointes de la
 * conversation” : une grille de vignettes, avec sous chacune le nom, la taille, la date, l'expéditeur, et l'état
 * “Dans le Drive” si elle y est déjà. »
 *
 * Avant, pour retrouver « la troisième quittance » d'un échange de douze messages, il fallait déplier les douze et
 * regarder dans chacun. Sur un échange de syndic qui traîne depuis six mois, personne ne le fait : on redemande le
 * document au correspondant.
 *
 * 🔴 AUCUNE RÈGLE N'EST ÉCRITE ICI. Ce qui compte comme pièce, l'ordre, le regroupement, les mots : tout vient du
 * module PUR `piecesConversation.ts`, qui est éprouvé sans écran. Cet écran ne fait que placer et peindre — c'est ce
 * qui garantit que le nombre du trombone et le nombre de cartes sortent du MÊME calcul.
 *
 * 🔒 AUCUNE URL DE STOCKAGE, AUCUNE ÉCRITURE. Les vignettes et les octets sont servis par nos routes, qui relisent
 * le droit à chaque fois ; le dépôt, lui, passe par la fenêtre Drive habituelle — cette fenêtre-ci ne fait que la
 * demander pour une pièce précise.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** La hauteur RÉSERVÉE d'une vignette. Fixée ici et dans le CSS : sans elle, la grille saute quand les images arrivent. */
const VIGNETTE_H = 132;

/**
 * ══ 🔴 LE TROMBONE, EN HAUT ET EN BAS ════════════════════════════════════════════════════════════════════════════
 *
 * Arno : « une petite icône trombone + le nombre total (“📎 7 pièces”) à DEUX endroits ».
 *
 * 🔴 UN SEUL COMPOSANT POUR LES DEUX PLACES. Deux boutons écrits séparément auraient fini par porter deux libellés,
 * deux infobulles, ou deux comptes — et c'est toujours celui qu'on regarde le moins qui garde le défaut.
 *
 * ⚠️ RIEN DU TOUT QUAND IL N'Y A AUCUNE PIÈCE (demande d'Arno) : un trombone à zéro promettrait une fenêtre vide.
 * C'est l'appelant qui ne le rend pas ; on le redit ici pour que ce soit vrai même s'il l'oublie.
 */
export function BoutonPiecesConversation({ nombre, onOuvrir }: { nombre: number; onOuvrir: () => void }) {
  if (nombre <= 0) return null;
  return (
    <button type="button" className="pdc-trombone" onClick={onOuvrir}
      title={INFOBULLE_PIECES_CONVERSATION} aria-label={`${INFOBULLE_PIECES_CONVERSATION} (${motPieces(nombre)})`}>
      <span aria-hidden="true">📎</span> {motPieces(nombre)}
    </button>
  );
}

/** Ce qu'une carte peut demander. Chaque geste est rendu par l'écran PARENT : la fenêtre ne décide de rien. */
export interface GestesPiece {
  /** Ouvre la visionneuse sur cette pièce, avec le tour de TOUTE la conversation. */
  onVoir: (pieceId: number) => void;
  /** Ouvre la fenêtre Drive en mode « ranger » sur cette seule pièce. */
  onRanger: (piece: PieceDeConversation) => void;
  /** Ferme la fenêtre et déplie le message dans le fil (demande d'Arno). */
  onAllerAuMessage: (messageId: number) => void;
}

export function ModalePiecesConversation({
  pieces, ordre, onOrdre, depots, maintenant, gestes, ecouterEchap, onFermer,
}: {
  /** DÉJÀ CLASSÉES par le module pur : cette fenêtre ne trie jamais, elle affiche l'ordre qu'on lui donne. */
  pieces: readonly PieceDeConversation[];
  ordre: OrdrePieces;
  onOrdre: () => void;
  /** Les dépôts connus, par pièce. Vide = migration 245 absente, ou aucune pièce rangée : aucune mention. */
  depots: ReadonlyMap<number, DepotAffiche>;
  maintenant: Date;
  gestes: GestesPiece;
  /**
   * 🔴 ÉCHAP NE FERME QUE LA FENÊTRE DU DESSUS. La visionneuse et la fenêtre Drive vivent AU-DESSUS de celle-ci et
   * posent leurs propres écouteurs sur `window` ; le premier inscrit répond le premier, et ce serait celui-ci.
   * L'appelant éteint donc cet écouteur tant qu'une fenêtre est ouverte par-dessus — sans quoi une seule touche
   * refermait les deux, et l'on perdait la liste en croyant fermer l'aperçu.
   */
  ecouterEchap: boolean;
  onFermer: () => void;
}) {
  const croix = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { croix.current?.focus(); }, []);

  useEffect(() => {
    if (!ecouterEchap) return undefined;
    const surTouche = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onFermer(); } };
    window.addEventListener('keydown', surTouche, true);
    return () => window.removeEventListener('keydown', surTouche, true);
  }, [ecouterEchap, onFermer]);

  const groupes = grouperParMessage(pieces);

  return (
    <div className="pdc-voile" role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) onFermer(); }}>
      <style>{CSS_PIECES_CONVERSATION}</style>
      <div className="pdc" role="dialog" aria-modal="true" aria-label={TITRE_PIECES_CONVERSATION}>
        <header className="pdc-tete">
          <h2 className="pdc-titre">
            <span aria-hidden="true">📎</span> {TITRE_PIECES_CONVERSATION}
            <span className="pdc-compte"> · {motPieces(pieces.length)}</span>
          </h2>
          {/* 🔴 LE BOUTON DIT L'ORDRE EN COURS, pas celui qu'il donnerait — même convention que l'ordre de lecture
              des messages. `aria-pressed` porte la même information au clavier. */}
          <button type="button" className="gst-lien-bouton pdc-ordre" aria-pressed={ordre === 'recent'}
            title="Inverser l’ordre des pièces" onClick={onOrdre}>
            {libelleOrdrePieces(ordre)}
          </button>
          <button ref={croix} type="button" className="pdc-croix" onClick={onFermer}
            aria-label="Fermer la liste des pièces">×</button>
        </header>

        <div className="pdc-corps">
          {groupes.map((g) => (
            <section key={g.messageId} className="pdc-groupe">
              {/* ══ 🔴 LA DATE DU MESSAGE, AU-DESSUS DE SES PIÈCES (demande d'Arno) ═══════════════════════════
                  C'est le repère qu'on cherche vraiment : on se souvient de « le devis reçu fin août », jamais du
                  nom du fichier. L'objet du mail est donné à sa suite, en gris — il aide à reconnaître le moment. */}
              <h3 className="pdc-groupe-titre">
                <span className="pdc-groupe-date">{dateHeureComplete(g.recuLe)}</span>
                <span className="pdc-groupe-qui"> · {mentionExpediteurPiece(g)}</span>
                {(g.objet ?? '').trim() !== '' && (
                  <span className="pdc-groupe-objet"> · {tronquerNom(g.objet!.trim(), 60)}</span>
                )}
              </h3>
              <ul className="pdc-grille">
                {g.pieces.map((p) => (
                  <CartePieceConversation key={p.pieceId} piece={p} depot={depots.get(p.pieceId)}
                    maintenant={maintenant} gestes={gestes} />
                ))}
              </ul>
            </section>
          ))}
        </div>

        <footer className="pdc-pied">
          {/* ⚠️ LA NOTE DIT CE QUE LA FENÊTRE NE FAIT PAS : elle ne renomme rien et ne dépose rien elle-même. Le
              renommage vit dans la fenêtre « Ranger », où le nom part vraiment — cf. lot RENOMMER-AVANT-RANGER. */}
          <p className="gst-note pdc-note">
            « Ranger dans le Drive » ouvre la fenêtre habituelle : c’est là qu’on choisit le dossier, et qu’on peut
            renommer la pièce avant de la déposer. Rien n’est déposé depuis cette liste.
          </p>
          <button type="button" className="svv-btn gst-btn" onClick={onFermer}>Fermer</button>
        </footer>
      </div>
    </div>
  );
}

/**
 * UNE CARTE. La vignette n'est demandée que pour ce qui peut en avoir une ; pour le reste, l'étiquette de TYPE en
 * toutes lettres (« XML », « DOCX »), qui dit bien plus qu'une icône générique — même règle que les cartes d'un
 * message, et la même route de miniature.
 *
 * ⚠️ `loading="lazy"` + hauteur réservée : une conversation de quarante pièces ne déclenche pas quarante requêtes à
 * l'ouverture, et la grille ne saute pas quand les images arrivent.
 */
function CartePieceConversation({ piece: p, depot, maintenant, gestes }: {
  piece: PieceDeConversation;
  depot: DepotAffiche | undefined;
  maintenant: Date;
  gestes: GestesPiece;
}) {
  const sorte = sortePiece(p.typeMime, p.nomFichier);
  const [vignetteMorte, setVignetteMorte] = useState(false);
  const avecVignette = p.disponible && sorte !== 'autre' && !vignetteMorte;
  const etiquette = etiquetteType(p.nomFichier, p.typeMime);
  const lien = `/api/admin/gestion/pieces/${p.pieceId}`;
  /**
   * 🔴 POURQUOI « VISUALISER » EST PARFOIS ÉTEINT, ET CE QU'IL DIT ALORS. Un type hors liste blanche n'a pas
   * d'aperçu du tout (`sorteApercu`), et une pièce non conservée n'a pas d'octets. Un bouton éteint sans motif se
   * lit comme une panne ; avec son motif, il se lit comme une règle. C'est la MÊME fonction pure que la visionneuse
   * emploie pour décider ce qu'elle sait montrer — aucune seconde liste à tenir.
   */
  const refusApercu = !p.disponible
    ? (p.motifNonStocke ?? 'Pièce non conservée : il n’y a rien à afficher.')
    : (sorteApercu(p.typeMime ?? '') === 'aucun' ? messageSansApercu(p.typeMime ?? '') : null);

  return (
    <li className="pdc-carte">
      {refusApercu === null ? (
        <button type="button" className="pdc-apercu" onClick={() => gestes.onVoir(p.pieceId)}
          aria-label={`Visualiser ${p.nomFichier} (${etiquette}, ${formaterTaille(p.tailleOctets)})`}>
          {avecVignette ? (
            // eslint-disable-next-line @next/next/no-img-element -- fichier privé servi par une route, jamais optimisable par Next
            <img className="pdc-vignette" src={`${lien}/miniature`} alt="" height={VIGNETTE_H}
              loading="lazy" decoding="async"
              // Pas de vignette (migration 244 non appliquée, type sans image, fichier illisible) : on retombe sur
              //   l'étiquette de type, sans jamais laisser une image cassée à l'écran.
              onError={() => setVignetteMorte(true)} />
          ) : (
            <span className="pdc-type" aria-hidden="true">{etiquette}</span>
          )}
        </button>
      ) : (
        <span className="pdc-apercu pdc-apercu--muet" role="note" title={refusApercu}>
          <span className="pdc-type" aria-hidden="true">{etiquette}</span>
        </span>
      )}

      <div className="pdc-pied-carte">
        <span className="pdc-nom" title={p.nomFichier}>{tronquerNom(p.nomFichier, 30)}</span>
        <span className="pdc-meta">{formaterTaille(p.tailleOctets)}</span>
        {/* ⚠️ LA DATE ET L'EXPÉDITEUR SONT REDITS SUR LA CARTE (demande d'Arno), en court : la fenêtre se parcourt
            des yeux, et l'en-tête du groupe peut être remonté hors de vue sur un échange de quarante pièces. */}
        <span className="pdc-meta" title={dateHeureComplete(p.recuLe)}>
          {dateHeureCourte(p.recuLe, maintenant)} · {mentionExpediteurPiece(p)}
        </span>
        {/* DÉJÀ DANS LE DRIVE : dit en MOTS, avec le nom du dossier, et un lien pour y aller — même mention que la
            carte d'un message, puisque c'est la même information. */}
        {depot && (
          <span className="pdc-drive">
            Dans le Drive{depot.dossierNom ? ` · ${tronquerNom(depot.dossierNom, 20)}` : ''}
            {depot.webViewLink ? <> · <a className="pdc-lien" href={depot.webViewLink} target="_blank" rel="noreferrer">ouvrir</a></> : null}
          </span>
        )}
        {/* Une pièce qu'on n'a pas doit se voir, avec son motif : sinon on la croit reçue. */}
        {!p.disponible && (
          <span className="pdc-meta">non conservée{p.motifNonStocke ? ` (${p.motifNonStocke})` : ''}</span>
        )}
      </div>

      {/* ══ LES ACTIONS ══ Toujours visibles, jamais au survol : sur un iPhone, une action qui n'apparaît qu'au
          passage de la souris n'existe pas. Cible de 44 px, et le mot en infobulle ET en libellé accessible. */}
      <div className="pdc-actions">
        {refusApercu === null ? (
          <button type="button" className="pdc-action" onClick={() => gestes.onVoir(p.pieceId)}
            title="Visualiser" aria-label={`Visualiser ${p.nomFichier}`}>
            <span aria-hidden="true">👁</span>
          </button>
        ) : (
          <span className="pdc-action pdc-action--muette" role="note" title={refusApercu}
            aria-label={refusApercu}><span aria-hidden="true">👁</span></span>
        )}
        {p.disponible ? (
          <a className="pdc-action" href={`${lien}?telecharger=1`} title="Télécharger"
            aria-label={`Télécharger ${p.nomFichier}`}><span aria-hidden="true">⤓</span></a>
        ) : (
          <span className="pdc-action pdc-action--muette" role="note"
            title="Pièce non conservée : rien à télécharger."><span aria-hidden="true">⤓</span></span>
        )}
        {p.disponible ? (
          <button type="button" className="pdc-action" onClick={() => gestes.onRanger(p)}
            title="Ranger dans le Drive" aria-label={`Ranger ${p.nomFichier} dans le Drive`}>
            <span aria-hidden="true">▲</span>
          </button>
        ) : (
          <span className="pdc-action pdc-action--muette" role="note"
            title="Pièce non conservée : rien à ranger."><span aria-hidden="true">▲</span></span>
        )}
        {/* 🔴 « ALLER AU MESSAGE » : la fenêtre se ferme et le message se déplie dans le fil (demande d'Arno). Une
            pièce ne se comprend souvent qu'avec le courrier qui l'accompagne. */}
        <button type="button" className="pdc-action pdc-action--mot"
          onClick={() => gestes.onAllerAuMessage(p.messageId)}
          title="Aller au message" aria-label={`Aller au message du ${dateHeureComplete(p.recuLe)}`}>
          Aller au message
        </button>
      </div>
    </li>
  );
}

/**
 * Le style du récapitulatif. Uniquement des jetons `--color-svv-*` : aucune couleur en dur, et la grille se replie en
 * colonne étroite sur un iPhone en portrait (390 px).
 *
 * ⚠️ AUCUN ACCENT GRAVE DANS LES COMMENTAIRES CI-DESSOUS : ils vivent dans un littéral gabarit, qu'un accent grave
 * terminerait au milieu du CSS (piège déjà payé une vingtaine de fois dans ce module).
 */
export const CSS_PIECES_CONVERSATION = `
/* ── LE TROMBONE ── Discret, mais c'est un BOUTON : il en a la cible (44 px de haut) et le focus visible. */
.pdc-trombone{display:inline-flex;align-items:center;gap:.3rem;min-height:44px;padding:0 .5rem;border-radius:.5rem;
  font:inherit;font-size:.82rem;color:var(--color-svv-ink);background:transparent;
  border:1px solid var(--color-svv-line);cursor:pointer}
.pdc-trombone:hover{background:var(--color-svv-field)}
.pdc-trombone:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}

/* ── LA FENETRE ── z-index 68 : SOUS le selecteur Drive (70) et SOUS la visionneuse (80), qui s'ouvrent par-dessus. */
.pdc-voile{position:fixed;inset:0;z-index:68;display:flex;align-items:center;justify-content:center;padding:2vh 2vw;
  background:color-mix(in srgb, var(--color-svv-ink) 62%, transparent)}
.pdc{display:grid;grid-template-rows:auto minmax(0,1fr) auto;gap:10px;width:min(1100px,100%);height:min(90vh,100%);
  padding:12px;background:var(--color-svv-surface);border:1px solid var(--color-svv-line);border-radius:.8rem;
  box-shadow:0 12px 48px color-mix(in srgb, var(--color-svv-ink) 34%, transparent)}
/* ⚠️ minmax(0,1fr) ET NON 1fr : une rangee 1fr a min-height:auto et ne borne RIEN — le corps depasserait la
   fenetre, qui deviendrait defilable par programme et emporterait la barre de titre hors de vue (defaut du
   30/09/2026 sur les fenetres de redaction, meme cause). */
.pdc-tete{display:flex;flex-wrap:wrap;align-items:center;gap:10px;min-width:0}
.pdc-titre{flex:1 1 14rem;min-width:0;margin:0;font-size:.95rem;font-weight:700;color:var(--color-svv-ink)}
.pdc-compte{font-weight:400;color:var(--color-svv-ink-soft)}
.pdc-ordre{font-size:.8rem}
.pdc-croix{min-width:44px;min-height:44px;font-size:1.3rem;line-height:1;color:var(--color-svv-ink);
  background:transparent;border:1px solid transparent;border-radius:.45rem;cursor:pointer}
.pdc-croix:hover{background:var(--color-svv-field);border-color:var(--color-svv-line)}
.pdc-croix:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}

.pdc-corps{overflow:auto;min-height:0;display:flex;flex-direction:column;gap:14px}
.pdc-groupe{min-width:0}
.pdc-groupe-titre{margin:0 0 .4rem;font-size:.8rem;font-weight:600;color:var(--color-svv-ink);
  padding-bottom:.25rem;border-bottom:1px solid var(--color-svv-line)}
.pdc-groupe-qui{font-weight:400;color:var(--color-svv-ink-soft)}
.pdc-groupe-objet{font-weight:400;color:var(--color-svv-ink-soft)}

/* auto-fill + minmax : quatre cartes sur un ecran large, UNE seule a 390 px, sans media query. */
.pdc-grille{list-style:none;margin:0;padding:0;display:grid;gap:8px;
  grid-template-columns:repeat(auto-fill,minmax(190px,1fr))}
.pdc-carte{display:flex;flex-direction:column;border:1px solid var(--color-svv-line);border-radius:.6rem;
  background:var(--color-svv-surface);overflow:hidden;min-width:0}

/* La vignette : hauteur RESERVEE et fond gris — c'est le cadre gris qu'Arno demande en attendant l'image. */
.pdc-apercu{display:flex;align-items:center;justify-content:center;width:100%;height:${VIGNETTE_H}px;padding:0;
  background:var(--color-svv-field);border:0;border-bottom:1px solid var(--color-svv-line);cursor:pointer;
  overflow:hidden}
.pdc-apercu:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px}
.pdc-apercu--muet{cursor:default;opacity:.7}
/* cover + object-position:top garde le HAUT du document (en-tete, objet) : ce qui permet de le reconnaitre. */
.pdc-vignette{width:100%;height:${VIGNETTE_H}px;object-fit:cover;object-position:top;display:block}
.pdc-type{font-size:.95rem;font-weight:600;letter-spacing:.06em;color:var(--color-svv-ink-soft)}

.pdc-pied-carte{display:flex;flex-direction:column;gap:2px;padding:.4rem .5rem 0;min-width:0}
.pdc-nom{font-size:.8rem;color:var(--color-svv-ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pdc-meta{font-size:.72rem;color:var(--color-svv-ink-soft);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pdc-drive{font-size:.72rem;color:var(--color-svv-ink-soft);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pdc-lien{color:var(--color-svv-ink);text-decoration:underline}
.pdc-lien:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}

.pdc-actions{display:flex;flex-wrap:wrap;align-items:center;gap:2px;padding:.2rem .35rem .35rem;margin-top:auto}
.pdc-action{display:inline-flex;align-items:center;justify-content:center;min-width:44px;min-height:44px;
  font:inherit;font-size:1.05rem;line-height:1;color:var(--color-svv-ink);background:transparent;
  border:1px solid transparent;border-radius:.45rem;text-decoration:none;cursor:pointer}
.pdc-action:hover{background:var(--color-svv-field);border-color:var(--color-svv-line)}
.pdc-action:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
/* Une action indisponible n'est PAS un bouton : elle ne se clique pas, et son titre dit pourquoi. */
.pdc-action--muette{opacity:.55;cursor:default}
/* « Aller au message » est un MOT, pas une icone : aucun pictogramme ne dit cela sans ambiguite. */
.pdc-action--mot{font-size:.74rem;padding:0 .5rem;min-width:0}

.pdc-pied{display:flex;flex-wrap:wrap;align-items:center;gap:10px;min-width:0}
.pdc-note{flex:1 1 16rem;min-width:0;margin:0}

@media (prefers-reduced-motion:reduce){
  .pdc-trombone,.pdc-action,.pdc-apercu{transition:none}
}
`;
