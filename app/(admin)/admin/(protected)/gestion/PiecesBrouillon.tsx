'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AIDE_PIECE_INDISPONIBLE, MENTION_NON_ENVOYEE, MENTION_PIECE_INDISPONIBLE, motCasesPieces, motToutCocher,
  piecesCochees, tailleQuiPartira, TAILLE_MAX_TOTALE, taillePourHumain, verifierPiece,
  HAUTEUR_VIGNETTE,
  type PieceBrouillonAffichee,
} from '../../../../lib/gestion/piecesEnvoi';
/* 🔴🔴 LOT EDITEUR-SIGNATURE-SOMBRE-ET-MINIATURES — LA MÊME GRAMMAIRE QUE LA LECTURE, pas une seconde écriture :
   l'étiquette de type, la sorte de pièce et le mot de l'œil viennent du module que `PiecesJointes` emploie déjà. */
import { AIDE_OEIL_PIECE, etiquetteType, sortePiece } from '../../../../lib/gestion/pieces';
import { sorteApercu } from '../../../../lib/gestion/apercuDrive';
/* 🔴🔴 LOT FENETRE-BIENS-LIBELLES-ET-VIDEOS — la vignette d'une vidéo, extraite par le navigateur. */
import { useMiniatureVideo } from './miniatureVideoNavigateur';
/* 🔴 L'œil est un TRACÉ, jamais un emoji : « 👁 » est rendu par une police EN COULEUR qui ignore `color`. */
import { Oeil } from './Oeil';

/**
 * LOT 5-PJ-ENVOI — LES PIÈCES JOINTES D'UN BROUILLON, à l'écran.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 DEUX FAÇONS D'AJOUTER, ET AUCUNE N'EST CACHÉE : un bouton (qui ouvre le sélecteur du système) et le
 * GLISSER-DÉPOSER sur toute la zone. Le glisser-déposer ne se devine pas — la zone le DIT en toutes lettres, parce
 * qu'une fonction qu'il faut connaître pour la trouver n'existe pas pour celui qui ne la connaît pas.
 *
 * 🔴 LA RÈGLE EST VÉRIFIÉE DEUX FOIS, ET CE N'EST PAS UN OUBLI : ici pour DIRE tout de suite pourquoi un fichier ne
 * passera pas (sans attendre un aller-retour), et sur le serveur parce que c'est lui qui décide. Le navigateur peut
 * mentir ; l'écran, lui, doit être rapide.
 *
 * 🔒 AUCUNE URL DE STOCKAGE N'ARRIVE ICI. La liste porte un nom, un type, une taille — jamais de quoi aller chercher
 * les octets ailleurs que par nos routes.
 *
 * ═══ 🔴 LOT EDITEUR-PJ — LE BOUTON NE RESTE PLUS GRISÉ ══════════════════════════════════════════════════════════════
 * Il l'était avec « Le brouillon s'enregistre… vous pourrez joindre un fichier dans un instant », et cet instant
 * n'arrivait JAMAIS sur un message neuf : l'enregistrement automatique ne part que si l'on a SAISI quelque chose
 * (règle du lot BROUILLON-SILENCIEUX, qui évite de semer des brouillons vides), or on veut souvent joindre AVANT
 * d'écrire. Deux règles justes qui, ensemble, faisaient une impasse — et une promesse que l'écran ne tenait pas.
 *
 * 🔴 LA SORTIE : JOINDRE EST UNE SAISIE. On ne joint pas un fichier par accident. Le bouton est donc actif dès
 * l'ouverture, et c'est LUI qui fait créer le brouillon (`onBesoinDeBrouillon`) au moment où l'on s'en sert.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Une pièce déjà envoyée depuis l'ordinateur, telle que la route des « Récents » la rend. */
interface PieceRecente {
  cle: string;
  libelle: string;
  detail: string | null;
  tailleOctets: number | null;
}

export function PiecesBrouillon({ brouillonId, onChange, onBesoinDeBrouillon, actions, onVisualiser }: {
  /** `null` = le brouillon n'est pas encore enregistré. Il le sera à la première pièce (voir l'encadré). */
  brouillonId: number | null;
  /** Prévient l'éditeur du nombre de pièces (il l'affiche à côté du bouton « Envoyer »). */
  onChange?: (n: number) => void;
  /**
   * 🔴 CRÉE LE BROUILLON S'IL N'EXISTE PAS ENCORE, et rend son identifiant. Absent ⇒ comportement d'avant ce lot :
   * le bouton attend qu'un brouillon existe.
   */
  onBesoinDeBrouillon?: () => Promise<number | null>;
  /** Les outils qui partagent cette barre : le Drive et le lien (lot EDITEUR-PJ). */
  actions?: React.ReactNode;
  /**
   * 🔴🔴 L'ŒIL D'UNE VIGNETTE — la MÊME visionneuse que la lecture (`ApercuFichierDrive`, `source: 'piece'`).
   *
   * ⚠️ ABSENT ⇒ AUCUN ŒIL, et c'est la règle du module depuis le lot 5-PJ-A : un bouton qui n'ouvrirait rien est
   * pire que pas de bouton. Il ne paraît donc que sur une pièce REPRISE d'un message, la seule que cette
   * visionneuse sache ouvrir.
   */
  onVisualiser?: (piece: { id: number; nom: string; typeMime: string | null }) => void;
}) {
  const [pieces, setPieces] = useState<PieceBrouillonAffichee[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [survol, setSurvol] = useState(false);
  const [recentsOuverts, setRecentsOuverts] = useState(false);
  /** `null` = pas encore lus. `disponible: false` = migration 269 absente ⇒ la section n'existe pas. */
  const [recents, setRecents] = useState<{ lignes: PieceRecente[]; disponible: boolean } | null>(null);
  const champ = useRef<HTMLInputElement | null>(null);

  const relire = useCallback(async (): Promise<void> => {
    if (brouillonId === null) { setPieces([]); return; }
    try {
      const res = await fetch(`/api/admin/gestion/brouillons/${brouillonId}/pieces`, { cache: 'no-store' });
      const d = (await res.json()) as { etat?: string; pieces?: PieceBrouillonAffichee[] };
      setPieces(d.pieces ?? []);
    } catch { /* la liste reste ce qu'elle était : mieux qu'une liste vide qui ferait croire à une perte */ }
  }, [brouillonId]);

  useEffect(() => { void relire(); }, [relire]);
  // Le compte remonte à l'éditeur À CHAQUE changement — y compris après un retrait.
  /**
   * 🔴🔴 LOT TRANSFERT-AVEC-PIECES — LE COMPTE QUI REMONTE EST CELUI DES PIÈCES **COCHÉES**, et c'est ce qui
   * compte : c'est lui que le bouton « Envoyer (N pièces jointes) » affiche, et il doit annoncer ce qui PART.
   * Remonter le total ferait promettre trois pièces pour un envoi qui en porte deux.
   */
  const nbCochees = piecesCochees(pieces).length;
  useEffect(() => { if (onChange) onChange(nbCochees); }, [onChange, nbCochees]);

  /**
   * ══ 🔴 « RÉCENTS » — LES PIÈCES DÉJÀ ENVOYÉES DEPUIS L'ORDINATEUR ════════════════════════════════════════════
   *
   * ⚠️ POURQUOI ELLES VIENNENT DE CHEZ NOUS, ET PAS DU DISQUE. Un navigateur n'a PAS accès à l'historique des
   * fichiers du Mac, et c'est une protection, pas un manque : une page web qui saurait ce que vous avez ouvert en
   * saurait beaucoup trop. On s'appuie donc sur NOS propres pièces, celles qui sont déjà passées par ici.
   */
  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/gestion/pieces-recentes?sorte=locale', { cache: 'no-store' });
        const d = (await res.json()) as { etat?: string; lignes?: PieceRecente[]; disponible?: boolean };
        if (annule) return;
        setRecents(d.etat === 'ok'
          ? { lignes: d.lignes ?? [], disponible: d.disponible !== false }
          : { lignes: [], disponible: false });
      } catch { if (!annule) setRecents({ lignes: [], disponible: false }); }
    })();
    return () => { annule = true; };
  }, []);

  /* ⚠️ LE POIDS EST CELUI DE CE QUI PARTIRA : une pièce décochée ou indisponible ne pèse rien dans l'envoi, et
     la compter ferait refuser un message parfaitement acceptable. */
  const total = tailleQuiPartira(pieces);

  /** L'identifiant du brouillon, créé à la demande s'il n'existe pas encore. Voir l'encadré du composant. */
  const brouillonPret = async (): Promise<number | null> => {
    if (brouillonId !== null) return brouillonId;
    return (await onBesoinDeBrouillon?.()) ?? null;
  };

  const ajouter = async (fichiers: FileList | File[]): Promise<void> => {
    /**
     * 🔴 LA LISTE EST COPIÉE AVANT TOUT `await`, ET CE N'EST PAS UNE PRÉCAUTION DÉCORATIVE.
     *
     * Le champ natif est remis à zéro juste après cet appel (`e.target.value = ''`, indispensable pour pouvoir
     * redéposer deux fois le même fichier) — et vider la valeur d'un `<input type="file">` VIDE AUSSI son
     * `FileList`, qui est une vue vivante, pas une copie. Tant que rien n'était attendu avant la boucle, celle-ci
     * tournait dans le même temps d'exécution et ne voyait pas le vidage. Depuis que le brouillon est créé à la
     * demande, il y a un `await` avant : sans cette copie, la liste était VIDE au moment de la lire, aucune
     * requête ne partait, et l'écran n'affichait ni pièce ni erreur. Mesuré dans Chrome avant correction.
     */
    const lot = Array.from(fichiers);
    setOccupe(true);
    setMessage(null);
    const id = await brouillonPret();
    if (id === null) {
      setMessage('Le brouillon n’a pas pu être créé : la pièce n’a pas été jointe.');
      setOccupe(false);
      return;
    }
    let courant = total;
    for (const f of lot) {
      // ① LA RÈGLE, AVANT L'ENVOI : inutile de pousser 30 Mo pour se les faire refuser.
      const verdict = verifierPiece({ nom: f.name, taille: f.size, dejaJoint: courant });
      if (!verdict.ok) { setMessage(verdict.motif); continue; }
      const corps = new FormData();
      corps.append('fichier', f);
      try {
        const res = await fetch(`/api/admin/gestion/brouillons/${id}/pieces`, { method: 'POST', body: corps });
        const d = (await res.json()) as { etat?: string; message?: string };
        if (d.etat !== 'ok') { setMessage(d.message ?? 'Cette pièce n’a pas pu être jointe.'); continue; }
        courant += f.size;
      } catch {
        setMessage('La pièce n’a pas pu être jointe : le serveur n’a pas répondu.');
      }
    }
    await relire();
    setOccupe(false);
  };

  /**
   * REJOINDRE UNE PIÈCE DÉJÀ ENVOYÉE. Les octets sont chez nous : on ne redemande rien au Mac.
   *
   * 🔴 LA CLÉ N'EST PAS CRUE SUR PAROLE PAR LE SERVEUR : la route vérifie qu'elle figure dans l'historique DE CE
   * COMPTE avant de relire le moindre octet. Sans cela, une clé de stockage envoyée d'ici ferait de n'importe quel
   * objet du seau une pièce jointe.
   */
  const rejoindre = async (r: PieceRecente): Promise<void> => {
    setOccupe(true);
    setMessage(null);
    const id = await brouillonPret();
    if (id === null) {
      setMessage('Le brouillon n’a pas pu être créé : la pièce n’a pas été jointe.');
      setOccupe(false);
      return;
    }
    const verdict = verifierPiece({ nom: r.libelle, taille: r.tailleOctets ?? 0, dejaJoint: total });
    if (!verdict.ok) { setMessage(verdict.motif); setOccupe(false); return; }
    try {
      const corps = new FormData();
      corps.append('recent', r.cle);
      const res = await fetch(`/api/admin/gestion/brouillons/${id}/pieces`, { method: 'POST', body: corps });
      const d = (await res.json()) as { etat?: string; message?: string };
      if (d.etat !== 'ok') setMessage(d.message ?? 'Cette pièce n’a pas pu être jointe.');
    } catch {
      setMessage('La pièce n’a pas pu être jointe : le serveur n’a pas répondu.');
    }
    await relire();
    setRecentsOuverts(false);
    setOccupe(false);
  };

  /**
   * ══ 🔴🔴 LOT TRANSFERT-AVEC-PIECES — COCHER OU DÉCOCHER ════════════════════════════════════════════════════
   *
   * ⚠️ L'ÉCRAN SUIT TOUT DE SUITE, puis on relit. Attendre le serveur pour bouger la case ferait un clic qui
   * « ne répond pas » sur un geste qu'on enchaîne trois fois de suite ; et la relecture, elle, dit la vérité —
   * y compris quand le serveur a refusé (une pièce sans octets ne se recoche pas).
   */
  const cocher = async (id: number, cochee: boolean): Promise<void> => {
    if (brouillonId === null) return;
    setMessage(null);
    setPieces((liste) => liste.map((p) => (p.id === id ? { ...p, cochee } : p)));
    try {
      const res = await fetch(`/api/admin/gestion/brouillons/${brouillonId}/pieces`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ piece: id, cochee }),
      });
      const d = (await res.json().catch(() => ({}))) as { etat?: string; message?: string };
      if (d.etat !== 'ok' && typeof d.message === 'string') setMessage(d.message);
      await relire();
    } catch {
      setMessage('Le changement n’a pas abouti : le serveur n’a pas répondu.');
      await relire();
    }
  };

  /** 🔴 TOUT COCHER / TOUT DÉCOCHER — demandé par Arno. Les indisponibles sont sautées : elles ne peuvent pas. */
  const toutBasculer = async (): Promise<void> => {
    const basculables = pieces.filter((p) => p.disponible !== false);
    const toutesCochees = basculables.length > 0 && basculables.every((p) => p.cochee !== false);
    for (const p of basculables) {
      if ((p.cochee !== false) === !toutesCochees) continue;
      await cocher(p.id, !toutesCochees);
    }
  };

  const retirer = async (id: number): Promise<void> => {
    if (brouillonId === null) return;
    setMessage(null);
    try {
      await fetch(`/api/admin/gestion/brouillons/${brouillonId}/pieces?piece=${id}`, { method: 'DELETE' });
      await relire();
    } catch { setMessage('Le retrait n’a pas abouti : le serveur n’a pas répondu.'); }
  };

  return (
    <div
      className={`pjb${survol ? ' pjb--survol' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setSurvol(true); }}
      onDragLeave={() => setSurvol(false)}
      onDrop={(e) => {
        e.preventDefault();
        setSurvol(false);
        if (e.dataTransfer.files.length > 0) void ajouter(e.dataTransfer.files);
      }}
    >
      <div className="pjb-barre">
        <span className="red-label">Pièces jointes</span>
        {/* 🔴 ACTIF DÈS L'OUVERTURE. Le brouillon est créé au moment du clic, s'il n'existe pas encore : joindre
            un fichier EST une saisie, et le brouillon a désormais quelque chose à garder. */}
        <button
          type="button" className="pjb-ajouter" disabled={occupe}
          onClick={() => champ.current?.click()}
        >
          {occupe ? 'Ajout en cours…' : '📎 Joindre un fichier'}
        </button>
        {/* ⚠️ `multiple` : la sélection multiple du sélecteur du Mac. Elle existait déjà et reste acquise. */}
        <input
          ref={champ} type="file" multiple className="pjb-champ" tabIndex={-1} aria-hidden="true"
          onChange={(e) => { if (e.target.files) void ajouter(e.target.files); e.target.value = ''; }}
        />
        {/* 🔴 LOT EDITEUR-PJ — les deux icônes venues de la barre du bas : le Drive, puis le lien. Même hauteur
            que « Joindre un fichier », parce que c'est le même geste avec une autre source. */}
        {actions}
        {/* « Récents » : un panneau, pas une liste toujours ouverte — la zone des pièces doit rester courte. */}
        {recents?.disponible === true && recents.lignes.length > 0 && (
          <button type="button" className="pjb-recents-bouton" aria-expanded={recentsOuverts} disabled={occupe}
            onClick={() => setRecentsOuverts((v) => !v)}>
            Récents ({recents.lignes.length})
          </button>
        )}
      </div>

      {/* ══ 🔴 LES PIÈCES DÉJÀ ENVOYÉES DEPUIS L'ORDINATEUR ══════════════════════════════════════════════════ */}
      {recentsOuverts && recents?.disponible === true && (
        <ul className="pjb-recents" aria-label="Pièces récentes">
          {recents.lignes.map((r) => (
            <li key={r.cle} className="pjb-recent">
              <button type="button" className="pjb-recent-bouton" disabled={occupe}
                onClick={() => void rejoindre(r)} title={`Rejoindre ${r.libelle}`}>
                📎 {r.libelle}
                {r.tailleOctets !== null && (
                  <span className="pjb-taille"> · {taillePourHumain(r.tailleOctets)}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Le glisser-déposer ne se devine pas : on l'écrit. Et le total joint est TOUJOURS visible — on découvre
          sinon la limite au moment où l'on croyait envoyer. */}
      <p className="pjb-aide">
        Glissez vos fichiers ici, ou utilisez le bouton. {taillePourHumain(total)} joints
        sur {taillePourHumain(TAILLE_MAX_TOTALE)} au maximum.
      </p>

      {/* ══ 🔴🔴 LOT EDITEUR-SIGNATURE-SOMBRE-ET-MINIATURES — LA GRILLE DE VIGNETTES ═══════════════════════════
          Arno : « le transfert avec pièces cochées est parfait, mais les pièces apparaissent en lignes de texte.
          Je veux le format MINIATURE, comme dans la lecture des mails, pour vérifier ce que j'envoie. »
          Voir l'encadré de `VignettePiece`. */}
      {pieces.length > 0 && (
        <ul className="pjb-grille">
          {pieces.map((p) => (
            <VignettePiece
              key={p.id} piece={p} brouillonId={brouillonId}
              onCocher={(c) => void cocher(p.id, c)}
              onRetirer={() => void retirer(p.id)}
              onVisualiser={onVisualiser}
            />
          ))}
        </ul>
      )}

      {/* ══ 🔴🔴 LE COMPTEUR ET LE LIEN, demandés par Arno : « N pièce(s) jointe(s) sur M » et « Tout cocher ».
          ⚠️ ILS N'APPARAISSENT QUE S'IL Y A PLUS D'UNE PIÈCE : sur une seule, la case dit déjà tout, et un
          compteur « 1 sur 1 » avec un lien « Tout cocher » serait du bruit au-dessus d'une ligne. */}
      {pieces.length > 1 && (
        <p className="pjb-compte">
          <span>{motCasesPieces(piecesCochees(pieces).length, pieces.length)}</span>
          {pieces.some((p) => p.disponible !== false) && (
            <button type="button" className="pjb-tout" onClick={() => void toutBasculer()}>
              {motToutCocher(pieces.filter((p) => p.disponible !== false).every((p) => p.cochee !== false))}
            </button>
          )}
        </p>
      )}

      {/* Un refus DIT pourquoi, avec le nom du fichier et le chiffre en cause. Jamais « fichier invalide ». */}
      {message && <p className="pjb-refus" role="status">{message}</p>}
    </div>
  );
}

/**
 * ══ 🔴🔴 LOT EDITEUR-SIGNATURE-SOMBRE-ET-MINIATURES — UNE PIÈCE DU BROUILLON, EN VIGNETTE ════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CONSTAT D'ARNO (03/10/2026) : « le transfert avec pièces cochées est parfait, mais les pièces apparaissent en
 * lignes de texte. Je veux le format MINIATURE, comme dans la lecture des mails, pour vérifier ce que j'envoie. »
 *
 * 🔴 MÊMES DIMENSIONS ET MÊME STYLE QUE LA LECTURE, et pas « à peu près » : la hauteur de vignette, le recadrage
 * par le haut, la grille `auto-fill minmax(180px, 1fr)` et la cible de 44 px sont repris tels quels de
 * `PiecesJointes`. Deux grilles qui se ressemblent sans être identiques se mettent à diverger au premier réglage.
 *
 * 🔴 CE QUI NE CHANGE PAS, ET C'EST LA MOITIÉ DU TRAVAIL : la case à cocher, la mention « du message d'origine »,
 * le compteur « N pièce(s) jointe(s) sur M », « Tout cocher / Tout décocher », « Joindre un fichier », le Drive, le
 * lien et « Récents ». Arno l'a demandé explicitement — on change la FORME d'une liste, pas ce qu'elle fait.
 *
 * ⚠️ UNE VIGNETTE CASSÉE N'EXISTE PAS ICI. Trois cas donnent une tuile NEUTRE qui DIT son état, jamais une image
 * morte : un type sans aperçu (une étiquette « DOCX », « XML », qui en dit plus qu'une icône générique), un fichier
 * dont les octets sont introuvables, et l'instant où la vignette n'est pas encore arrivée.
 *
 * ⚠️ UNE PIÈCE DÉCOCHÉE RESTE VISIBLE, estompée, avec « non envoyée » en toutes lettres. Arno : « on la décoche
 * pour ne pas l'envoyer, on la recoche. » La faire disparaître reviendrait à confondre décocher et retirer — deux
 * gestes qui coexistent, et que la croix ✕ distingue.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
function VignettePiece({ piece: p, brouillonId, onCocher, onRetirer, onVisualiser }: {
  piece: PieceBrouillonAffichee;
  brouillonId: number | null;
  onCocher: (cochee: boolean) => void;
  onRetirer: () => void;
  onVisualiser?: (piece: { id: number; nom: string; typeMime: string | null }) => void;
}) {
  const [vignetteMorte, setVignetteMorte] = useState(false);
  const indisponible = p.disponible === false;
  const cochee = p.cochee !== false;
  const etiquette = etiquetteType(p.nom, p.typeMime);
  /**
   * ⚠️ `sortePiece` DÉCIDE S'IL Y A UNE IMAGE À DEMANDER : inutile d'aller chercher la vignette d'un .docx pour
   * se faire répondre 404 et retomber sur l'étiquette. C'est le même test que la lecture.
   *
   * ⚠️ ET ON NE LA DEMANDE PAS NON PLUS SI LES OCTETS SONT INTROUVABLES : la route répondrait 404, et l'étiquette
   * est de toute façon ce qu'il faut montrer.
   */
  const sorte = sortePiece(p.typeMime, p.nom);
  /** 🔴 L'ŒIL N'EXISTE QUE S'IL OUVRE QUELQUE CHOSE. Voir l'encadré de `onVisualiser`. */
  const pieceReçue = p.pieceId ?? null;
  /**
   * ══ 🔴🔴 LOT FENETRE-BIENS-LIBELLES-ET-VIDEOS — LA VIGNETTE D'UNE VIDÉO, ICI AUSSI ═══════════════════════════
   *
   * Arno : « vaut PARTOUT où il y a des miniatures (lecture du mail, récapitulatif des pièces, ÉDITEUR) ».
   *
   * ⚠️ ET SA PORTÉE EXACTE, QU'IL FAUT DIRE : elle couvre les pièces REÇUES qu'on fait suivre (`p.pieceId`,
   * c'est-à-dire le cas d'Arno : transférer une vidéo arrivée par mail). Une vidéo DÉPOSÉE DEPUIS LE DISQUE dans
   * un brouillon n'est pas une `gestion_piece` : elle n'a pas de vignette à conserver, et sa tuile garde son
   * étiquette de type. Lui en donner une demanderait une colonne de plus sur les pièces de brouillon — une
   * migration qu'Arno n'a pas demandée, et que je ne pose pas de mon propre chef.
   */
  const lienPieceRecue = pieceReçue === null ? null : `/api/admin/gestion/pieces/${pieceReçue}`;
  const { pret: vignetteVideoPrete } = useMiniatureVideo({
    pieceId: pieceReçue ?? 0,
    urlOctets: lienPieceRecue ?? '',
    urlMiniature: lienPieceRecue === null ? '' : `${lienPieceRecue}/miniature`,
    estVideo: sorte === 'video' && lienPieceRecue !== null,
    sansVignette: vignetteMorte,
  });
  const avecImage = brouillonId !== null && !indisponible
    && sorte !== 'autre' && (!vignetteMorte || vignetteVideoPrete);
  const voirIci = onVisualiser !== undefined && pieceReçue !== null
    && sorteApercu(p.typeMime ?? '') !== 'aucun';

  return (
    <li className={`pjb-carte${cochee ? '' : ' pjb-carte--decochee'}`
      + `${indisponible ? ' pjb-carte--indisponible' : ''}`}>
      <div className="pjb-apercu">
        {avecImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- fichier privé servi par une route, jamais optimisable par Next
          <img
            className="pjb-vignette"
            /* ⚠️ `?v=1` UNE FOIS LA VIGNETTE VIDÉO DÉPOSÉE : le 404 d'il y a un instant est encore dans la mémoire
               de la page, et seule une adresse neuve force la relecture. */
            src={`/api/admin/gestion/brouillons/${brouillonId}/pieces/miniature?piece=${p.id}`
              + (vignetteVideoPrete ? '&v=1' : '')}
            alt=""
            height={HAUTEUR_VIGNETTE}
            loading="lazy"
            decoding="async"
            draggable={false}
            /* 🔴 PAS DE VIGNETTE ⇒ L'ÉTIQUETTE DE TYPE, jamais une image cassée (règle d'Arno). */
            onError={() => setVignetteMorte(true)}
            onLoad={() => { if (vignetteVideoPrete) setVignetteMorte(false); }}
          />
        ) : (
          <span className="pjb-type" aria-hidden="true">{etiquette}</span>
        )}
      </div>

      <div className="pjb-pied">
        {/* La case et le nom sont LIÉS : cliquer le nom coche, comme dans toute liste à cases. */}
        <label className="pjb-ligne-nom" htmlFor={`pjb-case-${p.id}`}>
          <input type="checkbox" className="pjb-case" checked={cochee} disabled={indisponible}
            id={`pjb-case-${p.id}`}
            aria-label={`Joindre ${p.nom}`}
            title={indisponible ? AIDE_PIECE_INDISPONIBLE : 'Joindre cette pièce'}
            onChange={(e) => onCocher(e.currentTarget.checked)} />
          <span className="pjb-nom" title={p.nom}>{p.nom}</span>
        </label>
        <span className="pjb-taille">{taillePourHumain(p.taille)}</span>
        {/* Une pièce REPRISE d'un transfert le DIT : on sait alors pourquoi elle est là sans l'avoir ajoutée. */}
        {p.origine === 'reprise' && <span className="pjb-origine">du message d’origine</span>}
        {/* 🔴 DÉCOCHÉE : elle reste là, estompée, et son état se LIT. */}
        {!cochee && !indisponible && <span className="pjb-nonenvoyee">{MENTION_NON_ENVOYEE}</span>}
        {/* 🔴 ET SI SES OCTETS SONT INTROUVABLES, ON LE DIT — jamais un envoi qui échoue en silence. */}
        {indisponible && (
          <span className="pjb-indisponible" title={AIDE_PIECE_INDISPONIBLE}>{MENTION_PIECE_INDISPONIBLE}</span>
        )}
      </div>

      {/* LA RANGÉE D'ACTIONS, toujours visible, cible de 44 px — comme en lecture. */}
      <div className="pjb-actions">
        {voirIci && (
          <button
            type="button" className="pjb-action pjb-oeil" onClick={() => onVisualiser?.({ id: pieceReçue, nom: p.nom, typeMime: p.typeMime })}
            aria-label={`${AIDE_OEIL_PIECE} ${p.nom}`} title={AIDE_OEIL_PIECE}
          >
            <Oeil taille={17} />
          </button>
        )}
        <button
          type="button" className="pjb-action pjb-retirer" onClick={onRetirer}
          aria-label={`Retirer la pièce ${p.nom}`} title="Retirer"
        >
          ✕
        </button>
      </div>
    </li>
  );
}

export const CSS_PIECES_BROUILLON = `
/* 🔴 LOT TRANSFERT-AVEC-PIECES — la case, le compteur, et la ligne grisee d'une piece introuvable.
   AUCUN ACCENT GRAVE ICI : ce bloc vit dans un litteral de gabarit (piege TS1005 du depot). */
.pjb-case{width:16px;height:16px;flex:0 0 auto;accent-color:var(--color-svv-red);cursor:pointer}
.pjb-case:disabled{cursor:not-allowed}
.pjb-item--indisponible{opacity:.55}
.pjb-item--indisponible .pjb-nom{text-decoration:line-through}
.pjb-indisponible{font-size:.74rem;font-weight:700;color:var(--color-svv-red)}
.pjb-compte{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:0;font-size:.78rem;
  color:var(--color-svv-muted)}
.pjb-tout{padding:0;font:inherit;font-size:.78rem;color:var(--color-svv-red);background:none;border:0;
  text-decoration:underline;text-underline-offset:2px;cursor:pointer}
.pjb-tout:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.pjb{display:flex;flex-direction:column;gap:6px;padding:10px;border:1px dashed var(--color-svv-line-strong);
  border-radius:10px;background:var(--color-svv-surface)}
/* La zone DIT qu'elle accepte le dépôt — par un cadre plein, jamais par la seule couleur. */
.pjb--survol{border-style:solid;border-color:var(--color-svv-red);background:var(--color-svv-field)}
.pjb-barre{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.pjb-ajouter{min-height:44px;padding:0 .8rem;border-radius:.5rem;border:1px solid var(--color-svv-line-strong);
  background:var(--color-svv-field);color:var(--color-svv-ink);font:inherit;font-size:.82rem;cursor:pointer}
.pjb-ajouter:hover:not(:disabled){border-color:var(--color-svv-ink)}
.pjb-ajouter:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.pjb-ajouter:disabled{opacity:.55;cursor:default}
/* Le champ natif est masqué mais JAMAIS retiré du DOM : c'est lui qui ouvre le sélecteur du système. */
.pjb-champ{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}
/* 🔴 LOT EDITEUR-PJ — le Drive et le lien, venus de la barre du bas. MÊME HAUTEUR que « Joindre un fichier »
   (44 px) pour que la rangée s'aligne : c'etait la demande, et une icone plus petite se rate au doigt. */
.pjb-outil{display:inline-flex;align-items:center;justify-content:center;min-width:44px;min-height:44px;padding:0;
  font:inherit;font-size:1.05rem;color:var(--color-svv-ink);background:var(--color-svv-field);
  border:1px solid var(--color-svv-line-strong);border-radius:.5rem;cursor:pointer}
.pjb-outil:hover:not(:disabled){border-color:var(--color-svv-ink)}
.pjb-outil:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.pjb-recents-bouton{min-height:44px;padding:0 .7rem;border-radius:.5rem;border:1px solid var(--color-svv-line-strong);
  background:var(--color-svv-surface);color:var(--color-svv-ink);font:inherit;font-size:.8rem;cursor:pointer}
.pjb-recents-bouton:hover:not(:disabled){border-color:var(--color-svv-ink)}
.pjb-recents-bouton:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.pjb-recents{list-style:none;margin:0;padding:6px;display:flex;flex-direction:column;gap:2px;
  background:var(--color-svv-field);border-radius:.5rem}
.pjb-recent{min-width:0}
.pjb-recent-bouton{width:100%;min-height:40px;padding:0 .4rem;text-align:left;font:inherit;font-size:.82rem;
  color:var(--color-svv-ink);background:transparent;border:1px solid transparent;border-radius:.4rem;cursor:pointer;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pjb-recent-bouton:hover:not(:disabled){background:var(--color-svv-surface);border-color:var(--color-svv-line)}
.pjb-recent-bouton:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.pjb-aide{margin:0;font-size:.76rem;color:var(--color-svv-muted);line-height:1.4}
/* ══ LOT EDITEUR-SIGNATURE-SOMBRE-ET-MINIATURES — LA GRILLE DE VIGNETTES ════════════════════════════════════════
   Arno : « format MINIATURE, comme dans la lecture des mails, pour verifier ce que j'envoie », et « memes
   dimensions et meme style que les miniatures de lecture ». Les valeurs sont donc celles de .pj-grille /
   .pj-carte / .pj-apercu, a l'identique — y compris le repli en UNE colonne a 390 px, sans media query.
   ⚠️ AUCUN ACCENT GRAVE DANS CE BLOC : il vit dans un litteral de gabarit (piege TS1005 du depot). */
.pjb-grille{list-style:none;margin:2px 0 0;padding:0;display:grid;gap:8px;
  grid-template-columns:repeat(auto-fill,minmax(180px,1fr))}
.pjb-carte{display:flex;flex-direction:column;border:1px solid var(--color-svv-line);border-radius:.6rem;
  background:var(--color-svv-surface);overflow:hidden;min-width:0}
/* 🔴 DECOCHEE : estompee, mais TOUJOURS LA — et le mot « Non envoyee » dit ce que le gris ne dit pas. */
.pjb-carte--decochee{opacity:.5}
.pjb-carte--indisponible{opacity:.55;border-style:dashed}
.pjb-carte--indisponible .pjb-nom{text-decoration:line-through}
/* L'apercu : hauteur RESERVEE, pour que la zone ne saute pas quand les vignettes arrivent. */
.pjb-apercu{display:flex;align-items:center;justify-content:center;height:${HAUTEUR_VIGNETTE}px;
  background:var(--color-svv-field);border-bottom:1px solid var(--color-svv-line);overflow:hidden}
/* cover + object-position:top : on garde le HAUT du document, ce qui permet de le reconnaitre sans l'ouvrir. */
.pjb-vignette{width:100%;height:${HAUTEUR_VIGNETTE}px;object-fit:cover;object-position:top;display:block}
/* L'etiquette de TYPE en toutes lettres : lisible en niveaux de gris, la ou une icone seule ne dirait rien. */
.pjb-type{font-size:.95rem;font-weight:600;letter-spacing:.06em;color:var(--color-svv-muted)}
.pjb-pied{display:flex;flex-direction:column;gap:2px;padding:.4rem .5rem 0;min-width:0}
/* La case et le nom sur une meme ligne : cliquer le nom coche, comme dans toute liste a cases. */
.pjb-ligne-nom{display:flex;align-items:center;gap:6px;min-width:0;cursor:pointer}
.pjb-nom{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  font-size:.8rem;color:var(--color-svv-ink)}
.pjb-taille{font-size:.74rem;color:var(--color-svv-muted);white-space:nowrap}
.pjb-origine{font-size:.7rem;color:var(--color-svv-muted);white-space:nowrap}
.pjb-nonenvoyee{font-size:.72rem;font-weight:700;color:var(--color-svv-ink);white-space:nowrap}
/* Les actions : TOUJOURS visibles (jamais au survol seul), cible de 44 px — comme en lecture. */
.pjb-actions{display:flex;align-items:center;gap:2px;padding:.2rem .35rem .35rem;margin-top:auto}
.pjb-action{display:inline-flex;align-items:center;justify-content:center;min-width:44px;min-height:44px;
  color:var(--color-svv-ink);background:transparent;border:1px solid transparent;border-radius:.45rem;
  cursor:pointer;font:inherit;font-size:1.05rem;line-height:1}
.pjb-action:hover{background:var(--color-svv-field);border-color:var(--color-svv-line)}
.pjb-action:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.pjb-retirer{margin-left:auto}
/* Un refus est dit par des MOTS : il reste lisible en niveaux de gris comme aux daltoniens. */
.pjb-refus{margin:0;font-size:.78rem;font-weight:600;color:var(--color-svv-ink);line-height:1.4}
`;
