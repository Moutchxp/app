'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { assainirHtml, htmlVersTexte } from '../../../../lib/gestion/htmlMail';

/**
 * LOT REDACTION-GMAIL — LE CORPS EN TEXTE MIS EN FORME, ET SA BARRE D'OUTILS.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QUI SORT D'ICI EST TOUJOURS ASSAINI. Tout ce qui ENTRE par un collage passe par `assainirHtml` (module PUR,
 * partagé avec le serveur) AVANT d'être inséré. Le serveur réassainit à l'envoi : l'écran nettoie pour que la
 * personne VOIE ce qu'elle envoie, le serveur nettoie parce que lui seul ne peut pas être contourné.
 *
 * 🔴 LE CHAMP N'EST PAS « CONTRÔLÉ » PAR REACT, et ce n'est pas un raccourci. Réécrire `innerHTML` à chaque frappe
 * détruirait la sélection du navigateur : le curseur sauterait au début à chaque lettre, et toute mise en forme
 * partielle deviendrait impossible. On écrit donc le contenu UNE fois à l'ouverture, puis on ne fait que LIRE. Le
 * parent reçoit les deux versions (HTML et texte) à chaque frappe ; c'est lui qui les garde.
 *
 * 🔴 `document.execCommand` EST DÉPRÉCIÉ, ET C'EST POURTANT LE BON CHOIX ICI. Il reste implémenté par tous les
 * navigateurs, c'est ce qu'emploient les éditeurs de messagerie sans cadriciel, et il gère seul la partie la plus
 * délicate : appliquer une mise en forme à une sélection qui traverse plusieurs éléments. L'alternative — manipuler
 * les `Range` à la main — est un projet à part entière, et un projet où chaque bogue se voit dans un mail parti.
 * Le jour où il disparaîtra vraiment, la barre changera ; le format produit (du HTML assaini), lui, ne changera pas.
 *
 * ⚠️ ACCESSIBILITÉ : chaque bouton porte un libellé écrit (`aria-label`) et une info-bulle ; aucun ne dépend d'une
 * couleur seule ; la barre est un `toolbar` que l'on parcourt au clavier ; le champ est un `textbox` nommé.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Les polices offertes, et leur pile de repli. Les MÊMES trois que Gmail — l'équipe n'a pas à réapprendre. */
export const POLICES: readonly { cle: string; mot: string; pile: string }[] = [
  { cle: 'sans', mot: 'Sans Serif', pile: 'Arial, Helvetica, sans-serif' },
  { cle: 'serif', mot: 'Serif', pile: 'Georgia, "Times New Roman", serif' },
  { cle: 'fixe', mot: 'Largeur fixe', pile: '"Courier New", Courier, monospace' },
];

/** Les tailles, avec le MOT à côté du chiffre : « 3 » ne dit rien, « Normale » si. */
export const TAILLES: readonly { valeur: string; mot: string }[] = [
  { valeur: '2', mot: 'Petite' },
  { valeur: '3', mot: 'Normale' },
  { valeur: '4', mot: 'Grande' },
  { valeur: '6', mot: 'Très grande' },
];

/** Les couleurs de texte. Bornées, et toutes lisibles sur fond blanc — un jaune clair ne se lit pas dans un mail. */
export const COULEURS: readonly { valeur: string; mot: string }[] = [
  { valeur: '#202124', mot: 'Noir' },
  { valeur: '#a30402', mot: 'Rouge SVAV' },
  { valeur: '#1e7a3d', mot: 'Vert' },
  { valeur: '#1a56b0', mot: 'Bleu' },
  { valeur: '#6b6b6b', mot: 'Gris' },
];

export interface ValeurCorps { html: string; texte: string }

export function EditeurRiche({
  htmlInitial, onChange, onPret, ariaLabel = 'Message', barreVisible = true, autoFocus = false, hauteurMin = 180,
}: {
  /** Le corps à l'ouverture. Lu UNE fois : voir l'encadré (le champ n'est pas contrôlé). */
  htmlInitial: string;
  onChange: (v: ValeurCorps) => void;
  /** Donne au parent de quoi insérer du contenu (un lien, une signature) à la position du curseur. */
  onPret?: (api: ApiEditeur) => void;
  ariaLabel?: string;
  barreVisible?: boolean;
  autoFocus?: boolean;
  hauteurMin?: number;
}) {
  const zone = useRef<HTMLDivElement | null>(null);
  /** La sélection au moment où l'on quitte le champ : sans elle, un clic sur un bouton la perd avant d'agir. */
  const selection = useRef<Range | null>(null);
  const [couleurOuverte, setCouleurOuverte] = useState(false);

  // ── LE CONTENU INITIAL, POSÉ UNE SEULE FOIS ──────────────────────────────────────────────────────────────────
  const pose = useRef(false);
  useEffect(() => {
    if (pose.current || zone.current === null) return;
    pose.current = true;
    zone.current.innerHTML = assainirHtml(htmlInitial);
    /**
     * 🔴 LE CURSEUR AU TOUT DÉBUT, pas à la fin. Repris du lot REPONSE-VISIBLE : une réponse naît remplie de sa
     * signature et de sa citation ; `focus()` seul poserait le curseur APRÈS tout cela, c'est-à-dire là où
     * personne n'écrit une réponse. On le ramène donc au premier caractère.
     */
    if (autoFocus) {
      zone.current.focus();
      const s = globalThis.getSelection?.();
      if (s && typeof document.createRange === 'function') {
        const r = document.createRange();
        r.setStart(zone.current, 0);
        r.collapse(true);
        s.removeAllRanges();
        s.addRange(r);
        selection.current = r.cloneRange();
      }
    }
  }, [htmlInitial, autoFocus]);

  const remonter = useCallback(() => {
    const html = zone.current?.innerHTML ?? '';
    onChange({ html, texte: htmlVersTexte(html) });
  }, [onChange]);

  /** Mémorise la sélection : appelée à chaque frappe et à chaque clic DANS le champ. */
  const retenirSelection = useCallback(() => {
    const s = globalThis.getSelection?.();
    if (s && s.rangeCount > 0 && zone.current?.contains(s.anchorNode)) selection.current = s.getRangeAt(0).cloneRange();
  }, []);

  /**
   * 🔴 REPOSER LA SÉLECTION AVANT D'AGIR. Cliquer un bouton de la barre retire le focus du champ ; sans ce
   * rétablissement, `execCommand` s'appliquerait à… rien, et la mise en forme semblerait « ne pas marcher » une
   * fois sur deux. Les boutons empêchent aussi le navigateur de déplacer le focus (`onMouseDown` annulé).
   */
  const agir = useCallback((commande: string, valeur?: string) => {
    const el = zone.current;
    if (el === null) return;
    el.focus();
    const s = globalThis.getSelection?.();
    if (s && selection.current) { s.removeAllRanges(); s.addRange(selection.current); }
    try {
      document.execCommand('styleWithCSS', false, 'true');
      document.execCommand(commande, false, valeur);
    } catch { /* une commande refusée ne doit jamais casser l'éditeur : on laisse le texte tel quel */ }
    retenirSelection();
    remonter();
  }, [remonter, retenirSelection]);

  useEffect(() => {
    onPret?.({
      insererHtml: (html: string) => agir('insertHTML', assainirHtml(html)),
      insererLien: (texte: string, url: string) => {
        const t = texte.trim() === '' ? url : texte;
        agir('insertHTML', assainirHtml(`<a href="${url.replace(/"/g, '&quot;')}">${t.replace(/</g, '&lt;')}</a>`));
      },
      focus: () => zone.current?.focus(),
    });
  }, [agir, onPret]);

  /**
   * 🔴 LE COLLAGE EST INTERCEPTÉ, TOUJOURS. C'est par là qu'arrive le HTML d'un autre mail ou d'un site — avec ses
   * scripts, ses styles de masquage et ses images espions. On prend le presse-papiers, on l'assainit, on insère le
   * résultat. Sans cela, le navigateur insérerait le HTML BRUT dans le champ.
   */
  const coller = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const texte = e.clipboardData.getData('text/plain');
    if (html.trim() !== '') {
      agir('insertHTML', assainirHtml(html));
    } else if (texte !== '') {
      // Du texte brut : on respecte ses sauts de ligne, et on échappe ce qui ressemblerait à une balise.
      agir('insertHTML', texte.split(/\r?\n/)
        .map((l) => l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'))
        .join('<br />'));
    }
  };

  const bouton = (
    cle: string, titre: string, contenu: React.ReactNode, commande: string, valeur?: string,
  ) => (
    <button key={cle} type="button" className="edr-bouton" title={titre} aria-label={titre}
      onMouseDown={(e) => e.preventDefault()} onClick={() => agir(commande, valeur)}>
      {contenu}
    </button>
  );

  return (
    <div className="edr">
      {barreVisible && (
        <div className="edr-barre" role="toolbar" aria-label="Mise en forme du message">
          {/* La POLICE et la TAILLE : des listes, pas des icônes — leur valeur courante doit se lire. */}
          <select className="edr-liste" aria-label="Police"
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) => { const p = POLICES.find((x) => x.cle === e.target.value); if (p) agir('fontName', p.pile); }}
            defaultValue="sans">
            {POLICES.map((p) => <option key={p.cle} value={p.cle}>{p.mot}</option>)}
          </select>
          <select className="edr-liste" aria-label="Taille du texte"
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) => agir('fontSize', e.target.value)} defaultValue="3">
            {TAILLES.map((t) => <option key={t.valeur} value={t.valeur}>{t.mot}</option>)}
          </select>

          <span className="edr-sep" aria-hidden="true" />
          {bouton('gras', 'Gras', <strong>G</strong>, 'bold')}
          {bouton('italique', 'Italique', <em>I</em>, 'italic')}
          {bouton('souligne', 'Souligné', <u>S</u>, 'underline')}
          {bouton('barre', 'Barré', <s>S</s>, 'strikeThrough')}

          <span className="edr-sep" aria-hidden="true" />
          {/* LA COULEUR : un menu de cinq couleurs NOMMÉES. Un sélecteur libre donnerait du jaune sur blanc. */}
          <span className="edr-couleur">
            <button type="button" className="edr-bouton" title="Couleur du texte" aria-label="Couleur du texte"
              aria-expanded={couleurOuverte}
              onMouseDown={(e) => e.preventDefault()} onClick={() => setCouleurOuverte((v) => !v)}>
              <span aria-hidden="true">A</span><span className="edr-trait" aria-hidden="true" />
            </button>
            {couleurOuverte && (
              <span className="edr-palette" role="menu" aria-label="Couleurs">
                {COULEURS.map((c) => (
                  <button key={c.valeur} type="button" role="menuitem" className="edr-pastille"
                    title={c.mot} aria-label={c.mot} style={{ background: c.valeur }}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { agir('foreColor', c.valeur); setCouleurOuverte(false); }} />
                ))}
              </span>
            )}
          </span>

          <span className="edr-sep" aria-hidden="true" />
          {bouton('gauche', 'Aligner à gauche', '⯇', 'justifyLeft')}
          {bouton('centre', 'Centrer', '≡', 'justifyCenter')}
          {bouton('droite', 'Aligner à droite', '⯈', 'justifyRight')}

          <span className="edr-sep" aria-hidden="true" />
          {bouton('numerotee', 'Liste numérotée', '1.', 'insertOrderedList')}
          {bouton('puces', 'Liste à puces', '•', 'insertUnorderedList')}
          {bouton('retrait-moins', 'Diminuer le retrait', '⇤', 'outdent')}
          {bouton('retrait-plus', 'Augmenter le retrait', '⇥', 'indent')}
          {bouton('citation', 'Citation', '❝', 'formatBlock', 'blockquote')}

          <span className="edr-sep" aria-hidden="true" />
          {bouton('net', 'Effacer la mise en forme', '⌫', 'removeFormat')}
        </div>
      )}

      {/* 🔴 `suppressContentEditableWarning` : React sait que nous écrivons dans ce nœud sans lui. C'est voulu et
          expliqué dans l'encadré — le contrôler détruirait la sélection à chaque frappe. */}
      <div
        ref={zone}
        className="edr-zone gst-msg-corps"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={ariaLabel}
        style={{ minHeight: `${hauteurMin}px` }}
        onInput={() => { retenirSelection(); remonter(); }}
        onKeyUp={retenirSelection}
        onMouseUp={retenirSelection}
        onBlur={retenirSelection}
        onPaste={coller}
      />
    </div>
  );
}

/** Ce que l'éditeur offre à son parent pour insérer du contenu à la position du curseur. */
export interface ApiEditeur {
  insererHtml: (html: string) => void;
  insererLien: (texte: string, url: string) => void;
  focus: () => void;
}

export const CSS_EDITEUR_RICHE = `
.edr{display:flex;flex-direction:column;min-width:0}
/* La barre PASSE À LA LIGNE plutôt que de deborder : sur telephone elle tient sur deux ou trois rangees. */
.edr-barre{display:flex;flex-wrap:wrap;align-items:center;gap:2px;padding:4px 2px;
  border-bottom:1px solid var(--color-svv-line)}
.edr-bouton{display:inline-flex;align-items:center;justify-content:center;min-width:32px;min-height:32px;
  padding:0 .3rem;font:inherit;font-size:.9rem;color:var(--color-svv-ink);background:transparent;
  border:1px solid transparent;border-radius:.35rem;cursor:pointer}
.edr-bouton:hover{background:var(--color-svv-field)}
.edr-bouton:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:1px}
.edr-liste{min-height:32px;padding:0 .2rem;font:inherit;font-size:.8rem;color:var(--color-svv-ink);
  background:var(--color-svv-surface);border:1px solid var(--color-svv-line);border-radius:.35rem}
.edr-sep{width:1px;height:20px;margin:0 3px;background:var(--color-svv-line)}
.edr-couleur{position:relative;display:inline-flex}
.edr-trait{display:block;width:12px;height:3px;margin-left:2px;background:currentColor;border-radius:2px}
.edr-palette{position:absolute;top:100%;left:0;z-index:5;display:flex;gap:4px;padding:5px;
  background:var(--color-svv-surface);border:1px solid var(--color-svv-line);border-radius:.4rem;
  box-shadow:0 4px 14px rgba(0,0,0,.12)}
.edr-pastille{width:22px;height:22px;padding:0;border:1px solid var(--color-svv-line);border-radius:50%;cursor:pointer}
.edr-pastille:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
/* La zone d'ecriture. overflow-wrap:anywhere : une URL collee ne doit pas elargir la fenetre. */
.edr-zone{padding:8px 2px;overflow-wrap:anywhere;overflow-y:auto;max-height:46vh}
.edr-zone:focus{outline:none}
.edr-zone:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.edr-zone blockquote{margin:0 0 0 .2rem;padding-left:.8rem;border-left:2px solid var(--color-svv-line-strong);
  color:var(--color-svv-muted)}
.edr-zone ul,.edr-zone ol{margin:.3rem 0;padding-left:1.4rem}
.edr-zone a{color:var(--color-svv-red);text-decoration:underline}
`;
