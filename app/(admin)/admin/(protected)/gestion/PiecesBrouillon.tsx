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
 * ⚠️ UNE PIÈCE NE PEUT ÊTRE JOINTE QU'À UN BROUILLON DÉJÀ ENREGISTRÉ : il faut un identifiant pour l'y rattacher.
 * L'éditeur enregistre tout seul après une seconde de silence ; en attendant, la zone le DIT plutôt que d'avaler un
 * fichier qui n'irait nulle part.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export function PiecesBrouillon({ brouillonId, onChange }: {
  /** `null` = le brouillon n'est pas encore enregistré : on ne peut rien y rattacher, et on le dit. */
  brouillonId: number | null;
  /** Prévient l'éditeur du nombre de pièces (il l'affiche à côté du bouton « Envoyer »). */
  onChange?: (n: number) => void;
}) {
  const [pieces, setPieces] = useState<PieceBrouillonAffichee[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [survol, setSurvol] = useState(false);
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

  const total = totalJoint(pieces);

  const ajouter = async (fichiers: FileList | File[]): Promise<void> => {
    if (brouillonId === null) return;
    setOccupe(true);
    setMessage(null);
    let courant = total;
    for (const f of Array.from(fichiers)) {
      // ① LA RÈGLE, AVANT L'ENVOI : inutile de pousser 30 Mo pour se les faire refuser.
      const verdict = verifierPiece({ nom: f.name, taille: f.size, dejaJoint: courant });
      if (!verdict.ok) { setMessage(verdict.motif); continue; }
      const corps = new FormData();
      corps.append('fichier', f);
      try {
        const res = await fetch(`/api/admin/gestion/brouillons/${brouillonId}/pieces`, { method: 'POST', body: corps });
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
        <button
          type="button" className="pjb-ajouter" disabled={brouillonId === null || occupe}
          onClick={() => champ.current?.click()}
        >
          {occupe ? 'Ajout en cours…' : '📎 Joindre un fichier'}
        </button>
        <input
          ref={champ} type="file" multiple className="pjb-champ" tabIndex={-1} aria-hidden="true"
          onChange={(e) => { if (e.target.files) void ajouter(e.target.files); e.target.value = ''; }}
        />
      </div>

      {/* Le glisser-déposer ne se devine pas : on l'écrit. Et le total joint est TOUJOURS visible — on découvre
          sinon la limite au moment où l'on croyait envoyer. */}
      <p className="pjb-aide">
        {brouillonId === null
          ? 'Le brouillon s’enregistre… vous pourrez joindre un fichier dans un instant.'
          : <>Glissez vos fichiers ici, ou utilisez le bouton. {taillePourHumain(total)} joints sur {taillePourHumain(TAILLE_MAX_TOTALE)} au maximum.</>}
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
