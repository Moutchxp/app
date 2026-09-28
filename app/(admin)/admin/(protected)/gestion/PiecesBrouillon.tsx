'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  TAILLE_MAX_TOTALE, taillePourHumain, totalJoint, verifierPiece,
  type PieceBrouillonAffichee,
} from '../../../../lib/gestion/piecesEnvoi';

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

export function PiecesBrouillon({ brouillonId, onChange, onBesoinDeBrouillon, actions }: {
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
  useEffect(() => { if (onChange) onChange(pieces.length); }, [onChange, pieces.length]);

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

  const total = totalJoint(pieces);

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

      {pieces.length > 0 && (
        <ul className="pjb-liste">
          {pieces.map((p) => (
            <li key={p.id} className="pjb-item">
              <span className="pjb-nom" title={p.nom}>{p.nom}</span>
              <span className="pjb-taille">{taillePourHumain(p.taille)}</span>
              {/* Une pièce REPRISE d'un transfert le DIT : on sait alors pourquoi elle est là sans l'avoir ajoutée. */}
              {p.origine === 'reprise' && <span className="pjb-origine">du message d’origine</span>}
              <button
                type="button" className="pjb-retirer" onClick={() => void retirer(p.id)}
                aria-label={`Retirer la pièce ${p.nom}`} title="Retirer"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Un refus DIT pourquoi, avec le nom du fichier et le chiffre en cause. Jamais « fichier invalide ». */}
      {message && <p className="pjb-refus" role="status">{message}</p>}
    </div>
  );
}

export const CSS_PIECES_BROUILLON = `
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
.pjb-liste{list-style:none;margin:2px 0 0;padding:0;display:flex;flex-direction:column;gap:3px}
.pjb-item{display:flex;flex-wrap:wrap;align-items:center;gap:6px;min-height:44px;padding:4px 6px;border-radius:8px;
  background:var(--color-svv-field);font-size:.82rem}
.pjb-nom{flex:1 1 8rem;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--color-svv-ink)}
.pjb-taille{font-size:.74rem;color:var(--color-svv-muted);white-space:nowrap}
.pjb-origine{font-size:.7rem;color:var(--color-svv-muted);white-space:nowrap}
.pjb-retirer{min-width:44px;min-height:44px;border:1px solid transparent;border-radius:.45rem;background:transparent;
  color:var(--color-svv-ink);cursor:pointer;font-size:.9rem}
.pjb-retirer:hover{background:var(--color-svv-surface);border-color:var(--color-svv-line)}
.pjb-retirer:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
/* Un refus est dit par des MOTS : il reste lisible en niveaux de gris comme aux daltoniens. */
.pjb-refus{margin:0;font-size:.78rem;font-weight:600;color:var(--color-svv-ink);line-height:1.4}
`;
