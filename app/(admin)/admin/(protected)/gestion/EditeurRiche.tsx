'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { assainirHtml, htmlVersTexte } from '../../../../lib/gestion/htmlMail';
// 🔴 LOT SOMBRE-ET-RECHERCHE — relever le texte sombre À L'ÉCRAN, et le retirer de tout ce qui remonte.
import { CSS_LISIBILITE_SOMBRE, htmlSansMarques, useLisibiliteSombre } from './lisibiliteSombre';

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

/**
 * LES COULEURS DE TEXTE. Bornées, et toutes lisibles sur fond blanc — un jaune clair ne se lit pas dans un mail.
 *
 * ⚠️ ÉCRITES EN DUR, ET C'EST LA SEULE FORME POSSIBLE. Ce ne sont pas des couleurs d'INTERFACE mais des valeurs de
 * CONTENU : elles partent dans le HTML du message, chez le destinataire. Un jeton de charte (`var(--color-svv-…)`)
 * n'y voudrait rien dire — la feuille de style de notre application n'existe pas dans sa messagerie, et le texte
 * arriverait sans couleur du tout. Le rouge est celui de la charte, recopié ici pour cette raison précise.
 */
export const COULEURS: readonly { valeur: string; mot: string }[] = [
  { valeur: '#202124', mot: 'Noir' },
  { valeur: '#a30402', mot: 'Rouge SVAV' },
  { valeur: '#1e7a3d', mot: 'Vert' },
  { valeur: '#1a56b0', mot: 'Bleu' },
  { valeur: '#6b6b6b', mot: 'Gris' },
];

/**
 * ══ 🔴 LOT EDITEUR-PJ — « AUTOMATIQUE », LA SORTIE QUI MANQUAIT ══════════════════════════════════════════════════════
 *
 * LE DÉFAUT, CONSTATÉ PAR ARNO. En thème sombre, le texte s'écrit en clair — non pas parce qu'on a choisi du blanc,
 * mais parce qu'AUCUNE couleur n'est posée : il hérite de celle de l'écran. Dès qu'on choisit une couleur, cet état
 * « aucune couleur » disparaît, et RIEN dans la palette ne permettait d'y revenir. Une porte sans retour.
 *
 * 🔴 CETTE PASTILLE NE POSE PAS DE COULEUR : ELLE EN RETIRE UNE. C'est toute la différence, et c'est ce qui la rend
 * juste. Ajouter du blanc aurait « marché » à l'écran sombre et envoyé du BLANC SUR BLANC chez le destinataire —
 * un message invisible. Ici, le HTML repart sans la moindre déclaration `color`, donc :
 *   · à l'écran, le texte suit le thème (clair sur fond sombre, sombre sur fond clair) ;
 *   · dans le mail, il prend la couleur par défaut du lecteur, c'est-à-dire du noir.
 *
 * ⚠️ SA PASTILLE EST PEINTE AVEC `--color-svv-ink` — le seul cas où une couleur de cette barre est un jeton de
 * charte, et c'est cohérent : elle ne représente pas une couleur de CONTENU, elle montre l'état « la couleur de
 * l'écran ». Elle est donc noire en thème clair et blanche en thème sombre, ce qui est exactement ce qu'elle promet.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export const MOT_COULEUR_AUTOMATIQUE = 'Automatique (couleur du thème)';

/** Les surlignages. Tous PÂLES : un fond saturé rend le texte noir illisible chez le destinataire. */
export const SURLIGNAGES: readonly { valeur: string; mot: string }[] = [
  { valeur: '#fff2a8', mot: 'Jaune' },
  { valeur: '#c9f0d2', mot: 'Vert pâle' },
  { valeur: '#cfe2ff', mot: 'Bleu pâle' },
  { valeur: '#ffd6d4', mot: 'Rose' },
];

/**
 * 🔴 UNE DÉCLARATION `color: …` EST-ELLE DU BLANC, OU PRESQUE ? PUR.
 *
 * Garde-fou du lot EDITEUR-PJ : « en aucun cas du blanc en dur ne doit partir dans un mail ». Du texte blanc arrive
 * noir sur blanc chez le destinataire — c'est-à-dire invisible. Aucune couleur de la palette n'est blanche, mais
 * cette fonction existe pour que la règle soit VÉRIFIABLE et non seulement respectée par habitude.
 */
export function estPresqueBlanc(valeur: string): boolean {
  const v = valeur.trim().toLowerCase();
  if (v === 'white' || /^#(f{3}|f{6})$/.test(v)) return true;
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(v);
  if (!rgb) return false;
  return [rgb[1], rgb[2], rgb[3]].every((n) => Number(n) >= 245);
}

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
  const [surlignageOuvert, setSurlignageOuvert] = useState(false);

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

  /**
   * ══ 🔴🔴 LOT SOMBRE-ET-RECHERCHE — CE QUI REMONTE N'A JAMAIS VU LE THÈME SOMBRE ═════════════════════════
   *
   * Arno : « NE MODIFIE PAS le HTML envoyé ni stocké : le mail part avec ses couleurs d'origine, noir sur blanc
   * pour le destinataire. »
   *
   * 🔴 LA PASSE D'AFFICHAGE POSE UN ATTRIBUT (`data-svv-sombre`) sur ce qu'elle a jugé illisible. Il ne porte
   * aucune couleur, mais il SE VERRAIT dans `innerHTML` — donc dans le brouillon enregistré, donc dans le mail.
   * `htmlSansMarques` remonte une COPIE nettoyée : le corps est identique au caractère près, que l'écran soit en
   * Clair ou en Sombre. Un test l'exige.
   */
  const remonter = useCallback(() => {
    const html = zone.current === null ? '' : htmlSansMarques(zone.current);
    onChange({ html, texte: htmlVersTexte(html) });
  }, [onChange]);

  /**
   * 🔴 LE TEXTE SOMBRE DE LA SIGNATURE, RELEVÉ À L'ÉCRAN. C'est le constat d'Arno : « la signature HTML s'écrit
   * en noir sur fond sombre, donc illisible ». La passe ne touche ni au HTML remonté (voir `remonter`) ni aux
   * couleurs vives — elle ne relève que ce qui est sombre ET terne.
   */
  useLisibiliteSombre(zone, [htmlInitial]);

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

  /**
   * ══ 🔴 REMETTRE LA COULEUR « AUTOMATIQUE » ═══════════════════════════════════════════════════════════════════
   *
   * En deux temps, et il en faut deux :
   *   ① `foreColor` à `inherit` — c'est LUI qui fait le travail difficile : normaliser une sélection qui traverse
   *      plusieurs éléments, défaire un `<font color>` venu d'un collage, découper les nœuds aux bonnes bornes.
   *      Écrire cela à la main sur des `Range` serait un projet à part, et chaque bogue se verrait dans un mail.
   *   ② on RETIRE ensuite les `color: inherit` que la première étape a posés. Sans ce second temps, le mail
   *      partirait avec `color: inherit` — inoffensif, mais c'est une déclaration qui ne dit rien et qu'un lecteur
   *      de mail n'a pas à interpréter. « Aucune couleur » doit vouloir dire aucune couleur.
   *
   * ⚠️ ON NE TOUCHE QUE `inherit`, jamais une couleur choisie : la valeur exacte `inherit` est la signature de
   * l'étape ①, et elle ne peut pas venir d'ailleurs — aucune entrée de la palette ne la produit.
   *
   * ⚠️ ET LA BALISE VIDÉE DISPARAÎT : un `<span>` dont il ne reste plus aucun attribut est déballé. Le laisser
   * empilerait un `<span>` par passage, et trois allers-retours donneraient un mail imbriqué sur dix niveaux.
   */
  const retirerCouleur = useCallback(() => {
    agir('foreColor', 'inherit');
    const el = zone.current;
    if (el === null) return;
    for (const n of [...el.querySelectorAll<HTMLElement>('[style]')]) {
      const style = n.getAttribute('style') ?? '';
      if (!/(^|;)\s*color\s*:\s*inherit\s*(;|$)/i.test(style)) continue;
      const reste = style.split(';')
        .filter((d) => !/^\s*color\s*:\s*inherit\s*$/i.test(d) && d.trim() !== '')
        .join('; ');
      if (reste === '') n.removeAttribute('style'); else n.setAttribute('style', reste);
      // Un `span` réduit à rien n'est plus qu'une enveloppe : on le remplace par son contenu.
      if (n.tagName === 'SPAN' && n.attributes.length === 0) n.replaceWith(...n.childNodes);
    }
    retenirSelection();
    remonter();
  }, [agir, remonter, retenirSelection]);

  useEffect(() => {
    onPret?.({
      insererHtml: (html: string) => agir('insertHTML', assainirHtml(html)),
      insererLien: (texte: string, url: string) => {
        const t = texte.trim() === '' ? url : texte;
        agir('insertHTML', assainirHtml(`<a href="${url.replace(/"/g, '&quot;')}">${t.replace(/</g, '&lt;')}</a>`));
      },
      focus: () => zone.current?.focus(),
      /**
       * 🔴 LE TEXTE SÉLECTIONNÉ, pour que « Insérer un lien » n'oblige pas à le retaper. On sélectionne « le
       * contrat », on clique, et le champ « Texte affiché » est déjà rempli : c'est le geste de Gmail, et sans lui
       * on obtient des mails truffés d'URL nues parce que retaper le libellé est une corvée.
       */
      texteSelectionne: () => (selection.current?.toString() ?? '').trim(),
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
          {/* LA COULEUR : un menu de couleurs NOMMÉES. Un sélecteur libre donnerait du jaune sur blanc. */}
          <span className="edr-couleur">
            <button type="button" className="edr-bouton" title="Couleur du texte" aria-label="Couleur du texte"
              aria-expanded={couleurOuverte}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { setSurlignageOuvert(false); setCouleurOuverte((v) => !v); }}>
              <span aria-hidden="true">A</span><span className="edr-trait" aria-hidden="true" />
            </button>
            {couleurOuverte && (
              <span className="edr-palette" role="menu" aria-label="Couleurs">
                {/* 🔴 « AUTOMATIQUE » EN PREMIÈRE POSITION, et c'est la seule place qui convienne : c'est l'état
                    de départ du texte, celui où l'on revient. Voir l'encadré de `MOT_COULEUR_AUTOMATIQUE`. */}
                <button type="button" role="menuitem" className="edr-pastille edr-pastille--auto"
                  title={MOT_COULEUR_AUTOMATIQUE} aria-label={MOT_COULEUR_AUTOMATIQUE}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { retirerCouleur(); setCouleurOuverte(false); }} />
                {COULEURS.map((c) => (
                  <button key={c.valeur} type="button" role="menuitem" className="edr-pastille"
                    title={c.mot} aria-label={c.mot} style={{ background: c.valeur }}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { agir('foreColor', c.valeur); setCouleurOuverte(false); }} />
                ))}
              </span>
            )}
          </span>

          {/* LE SURLIGNAGE. Il MANQUAIT à cette barre — d'où « des options ne marchent pas » : elles n'existaient
              pas. `hiliteColor` produit un `background-color`, que l'assainissement laisse passer. */}
          <span className="edr-couleur">
            <button type="button" className="edr-bouton" title="Surlignage" aria-label="Surlignage"
              aria-expanded={surlignageOuvert}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { setCouleurOuverte(false); setSurlignageOuvert((v) => !v); }}>
              <span aria-hidden="true">🖍</span>
            </button>
            {surlignageOuvert && (
              <span className="edr-palette" role="menu" aria-label="Surlignages">
                {/* « Aucun » retire le fond : la même porte de sortie que pour la couleur du texte. */}
                <button type="button" role="menuitem" className="edr-pastille edr-pastille--aucun"
                  title="Aucun surlignage" aria-label="Aucun surlignage"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { agir('hiliteColor', 'transparent'); setSurlignageOuvert(false); }} />
                {SURLIGNAGES.map((c) => (
                  <button key={c.valeur} type="button" role="menuitem" className="edr-pastille"
                    title={c.mot} aria-label={`Surligner en ${c.mot.toLowerCase()}`} style={{ background: c.valeur }}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { agir('hiliteColor', c.valeur); setSurlignageOuvert(false); }} />
                ))}
              </span>
            )}
          </span>

          <span className="edr-sep" aria-hidden="true" />
          {bouton('gauche', 'Aligner à gauche', '⯇', 'justifyLeft')}
          {bouton('centre', 'Centrer', '≡', 'justifyCenter')}
          {bouton('droite', 'Aligner à droite', '⯈', 'justifyRight')}
          {bouton('justifie', 'Justifier', '☰', 'justifyFull')}

          <span className="edr-sep" aria-hidden="true" />
          {bouton('numerotee', 'Liste numérotée', '1.', 'insertOrderedList')}
          {bouton('puces', 'Liste à puces', '•', 'insertUnorderedList')}
          {bouton('retrait-moins', 'Diminuer le retrait', '⇤', 'outdent')}
          {bouton('retrait-plus', 'Augmenter le retrait', '⇥', 'indent')}
          {bouton('citation', 'Citation', '❝', 'formatBlock', 'blockquote')}

          <span className="edr-sep" aria-hidden="true" />
          {bouton('net', 'Effacer la mise en forme', '⌫', 'removeFormat')}

          {/* ANNULER / RÉTABLIR. Ils MANQUAIENT aussi. ⚠️ Ils doivent passer par `agir`, donc par le rétablissement
              de la sélection : `execCommand('undo')` appliqué hors du champ défait la frappe d'ailleurs dans la
              page, ou ne fait rien du tout. Le raccourci clavier du navigateur continue de fonctionner en plus. */}
          <span className="edr-sep" aria-hidden="true" />
          {bouton('annuler', 'Annuler', '↶', 'undo')}
          {bouton('retablir', 'Rétablir', '↷', 'redo')}
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
  /** Le texte actuellement sélectionné, pour pré-remplir le libellé d'un lien. Vide s'il n'y a pas de sélection. */
  texteSelectionne: () => string;
}

export const CSS_EDITEUR_RICHE = `
${CSS_LISIBILITE_SOMBRE}
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
  box-shadow:0 4px 14px color-mix(in srgb, var(--color-svv-ink) 12%, transparent)}
.edr-pastille{width:22px;height:22px;padding:0;border:1px solid var(--color-svv-line);border-radius:50%;cursor:pointer}
.edr-pastille:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
/* 🔴 « Automatique » : peinte avec la couleur de TEXTE du theme — noire en clair, blanche en sombre. C'est le seul
   endroit de cette barre ou un jeton de charte est juste : elle ne montre pas une couleur, elle montre l'etat
   « celle de l'ecran ». Le liseré plus marque la distingue d'une pastille de couleur ordinaire. */
.edr-pastille--auto{background:var(--color-svv-ink);border-color:var(--color-svv-line-strong);border-width:2px}
/* « Aucun surlignage » : un damier clair, qui dit « rien » sans etre une 5e couleur. */
.edr-pastille--aucun{background:
  linear-gradient(45deg,var(--color-svv-line) 25%,transparent 25%,transparent 75%,var(--color-svv-line) 75%),
  linear-gradient(45deg,var(--color-svv-line) 25%,transparent 25%,transparent 75%,var(--color-svv-line) 75%),
  var(--color-svv-surface);
  background-size:10px 10px;background-position:0 0,5px 5px}
/* La zone d'ecriture. overflow-wrap:anywhere : une URL collee ne doit pas elargir la fenetre. */
.edr-zone{padding:8px 2px;overflow-wrap:anywhere;overflow-y:auto;max-height:46vh}
.edr-zone:focus{outline:none}
.edr-zone:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.edr-zone blockquote{margin:0 0 0 .2rem;padding-left:.8rem;border-left:2px solid var(--color-svv-line-strong);
  color:var(--color-svv-muted)}
.edr-zone ul,.edr-zone ol{margin:.3rem 0;padding-left:1.4rem}
.edr-zone a{color:var(--color-svv-red);text-decoration:underline}
`;
