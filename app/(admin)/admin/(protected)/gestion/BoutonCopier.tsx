'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * LOT FICHE-PROPOSITION — COPIER UNE ADRESSE E-MAIL OU UN NUMÉRO, D'UN CLIC.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 POURQUOI IL EXISTE. On classe un mail, et dans la foulée on écrit au locataire ou on appelle le propriétaire.
 * Sélectionner une adresse à la souris dans un bloc dense rate un caractère une fois sur trois — et une adresse
 * e-mail ratée d'un caractère ne produit pas une erreur, elle produit un mail qui n'arrive jamais.
 *
 * 🔴 IL DIT CE QU'IL A FAIT. « Copié » s'affiche brièvement à la place de « Copier » : sans retour, on reclique, et
 * on ne sait jamais si le presse-papiers a vraiment pris. L'annonce passe aussi par `role="status"`, pour que les
 * lecteurs d'écran la reçoivent.
 *
 * ⚠️ LE PRESSE-PAPIERS PEUT REFUSER, et ce n'est pas rare : `navigator.clipboard` n'existe pas hors HTTPS (ou
 * localhost), et le navigateur peut le bloquer. On retombe alors sur `document.execCommand('copy')`, et si les deux
 * échouent on le DIT (« Échec ») au lieu de laisser croire que c'est copié.
 *
 * ⚠️ LE MINUTEUR EST ANNULÉ AU DÉMONTAGE. Sans cela, fermer la fenêtre pendant les deux secondes d'affichage
 * déclencherait un `setState` sur un composant démonté — l'avertissement classique de React, et une fuite.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export function BoutonCopier({ valeur, quoi }: {
  valeur: string;
  /** Ce qu'on copie, pour le libellé accessible : « l’adresse e-mail de DUPONT Claire ». */
  quoi: string;
}) {
  const [etat, setEtat] = useState<'repos' | 'copie' | 'echec'>('repos');
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (minuteur.current !== null) clearTimeout(minuteur.current); }, []);

  const copier = async (): Promise<void> => {
    let ok = false;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(valeur);
        ok = true;
      }
    } catch { ok = false; }

    if (!ok) {
      /**
       * LE REPLI HISTORIQUE. `execCommand` est obsolète, mais c'est le seul chemin quand `clipboard` manque — et
       * il manque sur toute page servie en HTTP simple, ce qui arrive en réseau local.
       */
      try {
        const zone = document.createElement('textarea');
        zone.value = valeur;
        zone.setAttribute('readonly', '');
        zone.style.position = 'fixed';
        zone.style.opacity = '0';
        document.body.appendChild(zone);
        zone.select();
        ok = document.execCommand('copy');
        document.body.removeChild(zone);
      } catch { ok = false; }
    }

    setEtat(ok ? 'copie' : 'echec');
    if (minuteur.current !== null) clearTimeout(minuteur.current);
    minuteur.current = setTimeout(() => setEtat('repos'), 2000);
  };

  return (
    <button type="button" className={`bcp bcp--${etat}`} onClick={() => void copier()}
      aria-label={`Copier ${quoi}`} title={`Copier ${quoi}`}>
      {/* LE MOT EST TOUJOURS ÉCRIT : une icône seule ne se lit ni en niveaux de gris, ni par un lecteur d'écran. */}
      <span role="status">{etat === 'copie' ? 'Copié' : etat === 'echec' ? 'Échec' : 'Copier'}</span>
    </button>
  );
}

export const CSS_BOUTON_COPIER = `
/* Discret au repos : c'est un outil, pas une action principale. Cible tactile de 32 px de haut malgre sa finesse. */
.bcp{flex:0 0 auto;min-height:32px;padding:.1rem .45rem;font:inherit;font-size:.7rem;font-weight:700;
  color:var(--color-svv-muted);background:var(--color-svv-surface);border:1px solid var(--color-svv-line);
  border-radius:999px;cursor:pointer;white-space:nowrap}
.bcp:hover{color:var(--color-svv-ink);border-color:var(--color-svv-line-strong)}
.bcp:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
/* Le retour se lit au MOT ; la couleur ne fait que l'appuyer. */
.bcp--copie{color:var(--color-svv-green-ink);border-color:var(--color-svv-green-ink)}
.bcp--echec{color:var(--color-svv-red);border-color:var(--color-svv-red)}
`;
