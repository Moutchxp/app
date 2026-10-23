'use client';

import { useRef, useState } from 'react';
import { MOT_DEPOT, natureDuCollage, nomDuCollage, transporteDesFichiers } from '../../../../lib/gestion/depotPieces';

/**
 * ══ 🔴🔴 GLISSER-DÉPOSER ET COLLER DES PIÈCES JOINTES SUR TOUT LE BLOC D'ÉCRITURE (Arno, 23/10/2026) ════════════════════════════
 *
 * UN SEUL COMPOSANT RÉUTILISABLE, posé sur la racine du bloc d'écriture : `Redaction`, que rendent TOUTES les fenêtres d'envoi de
 * la Gestion (nouveau mail, réponse, réponse à tous, transfert, envoi ADHOC & MONGA, fiche du bien, plein écran). Les fichiers
 * déposés ou collés partent dans `onFichiers`, c'est-à-dire dans le MÊME ajout que le bouton « Joindre » (`PiecesBrouillon`) :
 * même liste, mêmes vignettes, même retrait, même envoi, mêmes limites. Le bouton reste ; rien n'est retiré.
 *
 *   · glisser des FICHIERS : le calque en pointillés « Déposer ici pour joindre » recouvre le bloc ; au dépôt, ils sont joints, et
 *     le navigateur ne les ouvre jamais ni ne les insère comme texte ;
 *   · glisser du TEXTE : rien — le geste natif (déplacer un mot dans l'éditeur) reste intact ;
 *   · Cmd+V d'une image ou d'un fichier : jointe (une capture devient « capture-AAAA-MM-JJ-HHMM.png ») ; Cmd+V de texte : collage
 *     normal (`natureDuCollage` tranche, voir le piège de Word).
 *
 * ⚠️ UN COMPTEUR, ET NON UN BOOLÉEN, pour le survol : chaque enfant franchi émet `dragleave` puis `dragenter` ; un booléen ferait
 * clignoter le calque à chaque champ traversé.
 */
export function useDepotPieces({ actif, onFichiers }: { actif: boolean; onFichiers: (fichiers: File[]) => void }) {
  const [survol, setSurvol] = useState(false);
  const profondeur = useRef(0);
  if (!actif) return { proprietes: {}, calque: null };
  const fichiersDe = (dt: DataTransfer | null): File[] => Array.from(dt?.files ?? []);
  const fin = () => { profondeur.current = 0; setSurvol(false); };
  const proprietes = {
    onDragEnter: (e: React.DragEvent) => {
      if (!transporteDesFichiers(Array.from(e.dataTransfer?.types ?? []))) return;
      e.preventDefault();
      profondeur.current += 1;
      setSurvol(true);
    },
    onDragOver: (e: React.DragEvent) => {
      if (!transporteDesFichiers(Array.from(e.dataTransfer?.types ?? []))) return;
      e.preventDefault();   // sans lui, le navigateur ouvrirait le fichier au lâcher
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!transporteDesFichiers(Array.from(e.dataTransfer?.types ?? []))) return;
      profondeur.current = Math.max(0, profondeur.current - 1);
      if (profondeur.current === 0) setSurvol(false);
    },
    onDrop: (e: React.DragEvent) => {
      if (!transporteDesFichiers(Array.from(e.dataTransfer?.types ?? []))) return;
      e.preventDefault();
      e.stopPropagation();
      fin();
      const f = fichiersDe(e.dataTransfer);
      if (f.length > 0) onFichiers(f);
    },
    onPaste: (e: React.ClipboardEvent) => {
      const f = fichiersDe(e.clipboardData);
      if (natureDuCollage({ nbFichiers: f.length, html: e.clipboardData?.getData('text/html') ?? '' }) !== 'fichiers') return;
      e.preventDefault();
      const maintenant = new Date();
      onFichiers(f.map((x) => {
        const nom = nomDuCollage(x.name, x.type, maintenant);
        return nom === x.name ? x : new File([x], nom, { type: x.type, lastModified: x.lastModified });
      }));
    },
  };
  const calque = survol ? <div className="pjd-calque" data-calque-depot="" aria-hidden="true"><span>{MOT_DEPOT}</span></div> : null;
  return { proprietes, calque };
}

/** AUCUN ACCENT GRAVE DANS CE LITTERAL. Jetons du theme, clair et sombre. Le calque ne capte rien (pointer-events:none). */
export const CSS_DEPOT_PIECES = `
.pjd-cible{position:relative}
.pjd-calque{position:absolute;inset:0;z-index:30;display:flex;align-items:center;justify-content:center;padding:16px;
  border:3px dashed var(--color-svv-red);border-radius:12px;background:color-mix(in srgb,var(--color-svv-surface) 86%,transparent);
  pointer-events:none}
.pjd-calque span{padding:10px 18px;border-radius:999px;background:var(--color-svv-surface);color:var(--color-svv-ink);
  font-weight:700;font-size:1rem;text-align:center;box-shadow:0 2px 10px rgba(0,0,0,.18)}
`;
