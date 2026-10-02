'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { documentDuCadre, SANDBOX_CADRE } from '../../../../lib/gestion/cadreMail';

/**
 * ══ 🔴🔴 LOT CADRE-ISOLE-MAILS — LE CORPS D'UN MAIL REÇU, DANS SON PROPRE CADRE ═══════════════════════════════
 *
 * DÉCISION D'ARNO (03/10/2026, option « a ») : « Cadre isolé avec sandbox="allow-same-origin allow-popups
 * allow-popups-to-escape-sandbox", JAMAIS allow-scripts. »
 *
 * CE QUE LE CADRE APPORTE : les `<style>` d'en-tête du mail s'appliquent enfin (34 366 mails en portent qui
 * changent le rendu), et ils ne peuvent peindre QUE le mail — le cadre EST la portée.
 *
 * ═══ 🔴 CE QUE L'APPLICATION FAIT DEPUIS LE DEHORS, ET POURQUOI ELLE LE PEUT ═══════════════════════════════════
 *
 * `allow-same-origin` sans `allow-scripts` donne un accès À SENS UNIQUE : l'application lit le cadre, le cadre ne
 * peut rien faire du tout (aucun script ne s'y exécute — CSP `script-src 'none'`, et pas de jeton `allow-scripts`).
 * C'est ce qui permet de garder les deux fonctions qu'Arno ne voulait pas perdre :
 *
 *   ① LA HAUTEUR AUTOMATIQUE — on mesure le document et on règle le cadre à sa taille. Aucune barre de défilement
 *     interne, en cohérence avec le lot DEFILEMENT-MODALES ;
 *   ② LE CLIC POUR AGRANDIR UNE IMAGE — on branche l'écoute depuis le dehors, et la visionneuse s'ouvre comme
 *     avant.
 *
 * ⚠️ ON N'INJECTE AUCUN SCRIPT DANS LE CADRE, et on ne le pourrait pas : tout se fait depuis l'application, sur
 * le document du cadre, exactement comme sur n'importe quel nœud de la page.
 */
export function CadreMail({ html, cssMail, onVisualiser, titre }: {
  /** Le corps DÉJÀ ASSAINI par le serveur (`assainirHtml(..., 'reception')`). */
  html: string;
  /** Le CSS d'en-tête du mail, DÉJÀ FILTRÉ par le serveur. `''` quand le mail n'en a pas. */
  cssMail?: string | null;
  /** Agrandir une image de pièce jointe dans la visionneuse — le geste d'avant ce lot, conservé. */
  onVisualiser?: (pieceId: number) => void;
  titre?: string;
}) {
  const cadre = useRef<HTMLIFrameElement | null>(null);
  const [hauteur, setHauteur] = useState(0);

  const doc = useMemo(
    () => documentDuCadre({ corpsAssaini: html, cssDuMail: cssMail ?? '' }), [html, cssMail]);

  /**
   * 🔴 LA MESURE. `scrollHeight` du document, pas du corps : un mail dont le dernier bloc porte une marge basse
   * la perdrait sur `body.scrollHeight`, et la dernière ligne se retrouverait collée au bord.
   *
   * ⚠️ `+2` : une fraction de pixel suffit à faire apparaître une barre de défilement, et le document du cadre
   * l'interdit (`overflow-y:hidden`) — mais sans ces deux pixels, la dernière ligne peut être rognée d'un cheveu.
   */
  const mesurer = useCallback(() => {
    const d = cadre.current?.contentDocument ?? null;
    if (d === null) return;
    const h = Math.max(d.documentElement?.scrollHeight ?? 0, d.body?.scrollHeight ?? 0);
    if (h > 0) setHauteur((avant) => (Math.abs(avant - (h + 2)) < 2 ? avant : h + 2));
  }, []);

  /**
   * ══ 🔴 AU CHARGEMENT : MESURER, PUIS BRANCHER CE QUI DOIT L'ÊTRE ══════════════════════════════════════════
   *
   * ⚠️ ON REMESURE À CHAQUE IMAGE QUI ARRIVE. Une image distante relayée met parfois une seconde : mesurer une
   * seule fois au chargement donnerait un cadre trop court, et la fin du mail serait coupée — sans barre pour
   * aller la chercher, puisqu'on les a supprimées.
   *
   * ⚠️ ET À CHAQUE CHANGEMENT DE LARGEUR : un mail à colonne fluide ne fait pas la même hauteur dans un volet
   * étroit et en plein écran.
   */
  useEffect(() => {
    const f = cadre.current;
    if (f === null) return undefined;
    const nettoyages: (() => void)[] = [];

    const brancher = (): void => {
      const d = f.contentDocument;
      if (d === null) return;
      mesurer();

      // ① LES IMAGES : on remesure quand elles arrivent, et on ouvre la visionneuse au clic.
      for (const img of Array.from(d.images)) {
        if (!img.complete) {
          const surCharge = () => mesurer();
          img.addEventListener('load', surCharge);
          img.addEventListener('error', surCharge);
          nettoyages.push(() => { img.removeEventListener('load', surCharge); img.removeEventListener('error', surCharge); });
        }
        /**
         * 🔴 LE CLIC POUR AGRANDIR, CONSERVÉ. La règle est celle d'avant ce lot, au caractère près : une image
         * venue d'une PIÈCE (`/api/admin/gestion/pieces/N`) s'ouvre dans la visionneuse ; une autre s'ouvre dans
         * un onglet, ce que `<base target="_blank">` fait déjà pour les liens.
         */
        const src = img.getAttribute('src') ?? '';
        const piece = /\/api\/admin\/gestion\/pieces\/(\d+)/.exec(src);
        if (img.hasAttribute('data-absente') || src === '') continue;
        if (piece !== null && onVisualiser !== undefined) {
          img.setAttribute('data-agrandir', '');
          const surClic = (e: Event) => { e.preventDefault(); onVisualiser(Number(piece[1])); };
          img.addEventListener('click', surClic);
          nettoyages.push(() => img.removeEventListener('click', surClic));
          continue;
        }
        /**
         * 🔴 LE REPLI D'AVANT CE LOT, CONSERVÉ LUI AUSSI. Une image INTÉGRÉE (`data:`) ou relayée n'a pas de
         * pièce à désigner : la visionneuse maison, qui fait le tour des pièces du fil, n'a rien à lui montrer.
         * Elle s'ouvrait donc en pleine taille dans un onglet, et c'est ce qui continue — sans cette ligne, le
         * clic ne ferait plus rien du tout, et ce serait une fonction perdue en silence.
         */
        img.setAttribute('data-agrandir', '');
        const surClicOnglet = (e: Event) => {
          e.preventDefault();
          window.open(img.src, '_blank', 'noopener,noreferrer');
        };
        img.addEventListener('click', surClicOnglet);
        nettoyages.push(() => img.removeEventListener('click', surClicOnglet));
      }

      /**
       * ② LES LIENS : nouvel onglet, sans rendre la main à la page ouverte. Ils portent déjà `target` et `rel`
       * depuis l'assainissement, et `<base target="_blank">` couvre le reste ; on le réaffirme ici parce qu'un
       * lien sans `rel` resterait une porte ouverte, et que cela ne coûte rien.
       */
      for (const a of Array.from(d.links)) {
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
      }

      // ③ LA LARGEUR : un volet qu'on redimensionne change la hauteur du mail.
      if (typeof ResizeObserver !== 'undefined' && d.body !== null) {
        const ro = new ResizeObserver(() => mesurer());
        ro.observe(d.body);
        nettoyages.push(() => ro.disconnect());
      }
    };

    f.addEventListener('load', brancher);
    // Le document d'un `srcdoc` peut être déjà prêt au moment où l'effet tourne.
    if (f.contentDocument?.readyState === 'complete') brancher();
    return () => {
      f.removeEventListener('load', brancher);
      for (const n of nettoyages) n();
    };
  }, [doc, mesurer, onVisualiser]);

  return (
    <iframe
      ref={cadre}
      className="cnv-cadre"
      title={titre ?? 'Corps du message'}
      /**
       * 🔒 LE BAC À SABLE, LU DEPUIS LE MODULE PUR — une seule écriture, et un test garde-fou qui échoue si
       * `allow-scripts` y apparaît un jour.
       */
      sandbox={SANDBOX_CADRE}
      srcDoc={doc}
      style={{ height: hauteur === 0 ? undefined : `${hauteur}px` }}
    />
  );
}

/**
 * LA FEUILLE DU CADRE, côté application. Elle n'habille QUE la boîte ; ce qu'il y a dedans est au mail.
 *
 * ⚠️ AUCUN ACCENT GRAVE DANS CE LITTERAL : un seul le terminerait (piege consigne dans ce depot).
 */
export const CSS_CADRE_MAIL = `
/* 🔴 LOT CADRE-ISOLE-MAILS — le cadre prend toute la largeur et la hauteur que l'application lui calcule.
   Fond blanc meme en theme Sombre : un mail est ecrit pour du papier blanc (demande d'Arno, et c'est Gmail). */
.cnv-cadre{display:block;width:100%;min-height:2rem;border:1px solid var(--color-svv-line);border-radius:10px;
  background:#fff;color-scheme:light}
@media print{.cnv-cadre{border:0}}
`;
