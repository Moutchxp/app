'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * LOT APERCU-PAGE1 — LE LECTEUR PDF, CHEZ NOUS, PAGE PAR PAGE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 CE QU'IL REMPLACE, ET POURQUOI IL A FALLU LE REMPLACER.
 *
 * Constat d'Arno après le lot précédent : « c'est presque toujours aussi long, l'application télécharge toutes les
 * pages avant d'afficher le document ». Il avait raison, et ma mesure était fausse : je chronométrais la POSE du
 * cadre (999 ms), pas le moment où la page devient lisible.
 *
 * Mesuré le 29/09/2026, au chronomètre et à la capture d'écran :
 *   · le téléchargement COMPLET des quatre PDF d'essai prend 755 à 993 ms — le réseau n'était pas le coupable ;
 *   · à +2 s, le cadre natif de Chrome était VIDE (barre d'outils et vignettes blanches, page noire) ;
 *   · le texte n'apparaissait qu'entre +3 et +5 s.
 * Le lecteur intégré attend le fichier ENTIER (un PDF non linéarisé ne lui laisse pas le choix), puis décode
 * 29 pages avant d'en peindre une. Et, pire, son cadre RECOUVRAIT la vignette Drive dès qu'il était posé : on
 * remplaçait une image juste par un rectangle vide.
 *
 * 🔴 CE LECTEUR-CI FAIT L'INVERSE : il demande à PDF.js la PAGE 1, et rien d'autre. PDF.js lit l'index du document
 * par requêtes partielles (`Range`, que notre route sait désormais servir), puis les seuls objets de cette page.
 * Les pages suivantes sont rendues quand elles approchent de l'écran, jamais avant.
 *
 * 🔒 SÉCURITÉ DU LECTEUR, et c'est la contrepartie d'exécuter le PDF chez nous :
 *   · `isEvalSupported: false` — aucune évaluation de code par PDF.js ;
 *   · `enableScripting` reste à son défaut, FAUX : le JavaScript qu'un PDF peut contenir n'est jamais exécuté ;
 *   · `worker` servi par NOUS (`/pdf.worker.min.mjs`, copie exacte de `pdfjs-dist` 4.10.38) — aucun CDN ;
 *   · le rendu se fait dans un `canvas` : rien du PDF ne devient du DOM, donc rien n'y devient cliquable.
 *
 * ⚠️ AUCUN BOUTON « IMPRIMER » NI « TÉLÉCHARGER » dans notre barre (demande d'Arno). Le lecteur natif en avait
 * deux, que nous n'avions pas choisis.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Ce dont on a besoin de PDF.js, réduit à la surface qu'on emploie. Évite un `any` qui masquerait une faute. */
interface PageRendue {
  getViewport(o: { scale: number }): { width: number; height: number };
  render(o: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }):
  { promise: Promise<void>; cancel(): void };
  cleanup(): void;
}
interface DocumentPdf {
  numPages: number;
  getPage(n: number): Promise<PageRendue>;
  destroy(): Promise<void>;
}

/** Les paliers de zoom. « Ajuster à la largeur » est à part : il se recalcule à chaque changement de fenêtre. */
const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3] as const;

/**
 * La taille des morceaux demandés à la route. 128 Kio : assez grand pour qu'une page ordinaire tienne en deux ou
 * trois requêtes, assez petit pour ne pas retomber sur un téléchargement complet déguisé.
 */
const MORCEAU = 128 * 1024;

export function LecteurPdf({ url, nom, onPremierePage }: {
  url: string;
  nom: string;
  /** Appelé dès que la PAGE 1 est peinte. C'est LUI qui retire la vignette — jamais un minuteur. */
  onPremierePage?: () => void;
}) {
  const [doc, setDoc] = useState<DocumentPdf | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState<number | 'largeur'>('largeur');
  const [erreur, setErreur] = useState<string | null>(null);
  const scene = useRef<HTMLDivElement | null>(null);
  /** Les rendus en cours, par numéro de page : on les annule au démontage et au changement de zoom. */
  const enCours = useRef<Map<number, { cancel(): void }>>(new Map());
  const pagesPeintes = useRef<Set<number>>(new Set());
  /**
   * ══ 🔴 DEUX RENDUS NE PARTAGENT JAMAIS UN CANVAS — défaut trouvé à l'écran le 29/09/2026 ════════════════════
   *
   * PDF.js jette « Cannot use the same canvas during multiple render() operations » dès que deux rendus se
   * chevauchent sur la même toile. Et ils se chevauchent facilement : React relance l'effet d'une page quand la
   * fonction de rendu change d'identité (le document arrive, le zoom bouge), et le mode strict du développement
   * monte les effets deux fois. Le premier appel n'a pas encore atteint son `render()` que le second démarre.
   *
   * ⇒ UNE FILE PAR PAGE. Chaque demande s'enchaîne à la précédente au lieu de courir à côté, et un JETON dit à un
   * rendu dépassé de renoncer au lieu de peindre par-dessus ce qui vient d'être peint. Un simple drapeau
   * « occupé » n'aurait pas suffi : il est posé APRÈS les `await`, donc trop tard.
   */
  const file = useRef<Map<number, Promise<void>>>(new Map());
  const jetons = useRef<Map<number, number>>(new Map());
  const compteur = useRef(0);
  /**
   * ══ 🔴 LE RAPPEL « PAGE 1 PEINTE » VIT DANS UNE RÉFÉRENCE, ET C'EST LA CORRECTION QUI COMPTE ═════════════════
   *
   * Défaut mesuré à l'écran le 29/09/2026 : la page 1 mettait PLUS DE TRENTE SECONDES à apparaître, et la toile
   * restait blanche. Cause : le parent passe `onPremierePage` en fonction écrite sur place, donc d'identité NEUVE
   * à chacun de ses rendus. Cette identité remontait dans `peindreVraiment`, puis dans `peindre`, puis dans les
   * dépendances de l'effet de chaque page — qui redemandait alors un rendu, lequel provoquait un rendu du parent,
   * qui changeait encore l'identité… Le lecteur se relançait sans fin et n'arrivait jamais au bout d'un rendu.
   *
   * ⇒ On le lit par référence : la fonction appelée est toujours la dernière reçue, mais elle ne fait plus bouger
   * l'identité de quoi que ce soit. `peindre` ne dépend plus que du DOCUMENT et du ZOOM — les deux seules choses
   * qui doivent vraiment faire repeindre.
   */
  const rappelPage1 = useRef(onPremierePage);
  rappelPage1.current = onPremierePage;

  /**
   * ══ 🔴 L'OUVERTURE DU DOCUMENT ═══════════════════════════════════════════════════════════════════════════════
   *
   * `disableAutoFetch: true` évite que PDF.js tire, EN PLUS, tout ce qu'il n'a pas demandé.
   *
   * ══ 🔴🔴 `disableStream: false` EST MESURÉ, PAS HÉRITÉ — NE PAS LE PASSER À `true` ═════════════════════════════
   *
   * C'est contre-intuitif, et c'est pourquoi il faut l'écrire ici. Chronométré le 29/09/2026 depuis la page, sur
   * « Acte de propriété.pdf » (3,3 Mo, 29 pages), servi par notre route depuis le Drive :
   *
   *     disableStream: false                    1 requête  · 3,3 Mo ·  1 117 ms  ← ce qu'on garde
   *     disableStream: true, tranches 512 Kio   8 requêtes · 3,3 Mo ·  5 711 ms
   *     disableStream: true, tranches 128 Kio  20 requêtes · 2,4 Mo · 13 646 ms  ← douze fois PIRE
   *
   * LA RAISON : une tranche servie depuis le Drive coûte un ALLER-RETOUR GOOGLE d'environ 600 ms, et un PDF non
   * linéarisé oblige PDF.js à sauter d'un bout à l'autre du fichier. Vingt sauts valent treize secondes ; une seule
   * lecture continue vaut une seconde. Les requêtes partielles restent servies par la route (elles sont exigées par
   * le lot, et elles deviennent gratuites dès que la mémoire courte du serveur tient le fichier) — mais ce n'est
   * PAS par elles qu'on ouvre un document neuf.
   *
   * ⚠️ ET LE TRAMAGE N'A JAMAIS ÉTÉ LE PROBLÈME : la page 1 se peint en 46 à 155 ms. Tout le temps est du transport.
   */
  useEffect(() => {
    let annule = false;
    let ouvert: DocumentPdf | null = null;
    pagesPeintes.current = new Set();
    setDoc(null); setTotal(0); setPage(1); setErreur(null);

    void (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        if (annule) return;
        // 🔒 LE WORKER VIENT DE CHEZ NOUS, jamais d'un CDN : c'est du code qui lit des documents de clients.
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        const tache = pdfjs.getDocument({
          url,
          disableAutoFetch: true,
          disableStream: false,
          rangeChunkSize: MORCEAU,
          // 🔒 Aucune évaluation de code, aucune police récupérée ailleurs que dans le paquet.
          isEvalSupported: false,
          withCredentials: true,
        });
        const d = (await tache.promise) as unknown as DocumentPdf;
        if (annule) { void d.destroy(); return; }
        ouvert = d;
        setDoc(d);
        setTotal(d.numPages);
      } catch (e) {
        if (!annule) {
          setErreur(e instanceof Error && /password/i.test(e.message)
            ? 'Ce PDF est protégé par un mot de passe : il ne peut pas être affiché ici.'
            : 'Ce document n’a pas pu être lu.');
        }
      }
    })();

    return () => {
      annule = true;
      for (const t of enCours.current.values()) { try { t.cancel(); } catch { /* rendu déjà fini */ } }
      enCours.current.clear();
      if (ouvert !== null) void fermerDocument(ouvert);
    };
  }, [url]);

  /**
   * ══ 🔴 LE RENDU D'UNE PAGE, À LA DEMANDE ═════════════════════════════════════════════════════════════════════
   *
   * ⚠️ UN SEUL RENDU PAR PAGE À LA FOIS : `render()` de PDF.js jette si on le relance sur le même canvas avant la
   * fin. On annule donc le précédent avant d'en lancer un autre — ce qui arrive à chaque changement de zoom.
   */
  const peindreVraiment = useCallback(async (
    n: number, cible: HTMLCanvasElement, monJeton: number,
  ): Promise<void> => {
    if (doc === null) return;
    try {
      const p = await doc.getPage(n);
      const largeurUtile = Math.max((scene.current?.clientWidth ?? 800) - 32, 240);
      const base = p.getViewport({ scale: 1 });
      const echelle = zoom === 'largeur' ? largeurUtile / base.width : zoom;
      // ⚠️ On tient compte de la densité de l'écran : sans cela, un PDF est flou sur un écran Retina.
      const densite = Math.min(globalThis.devicePixelRatio || 1, 2);
      const vue = p.getViewport({ scale: echelle * densite });
      const ctx = cible.getContext('2d');
      if (ctx === null) return;
      // Entre la demande et ici, une autre a pu être posée (zoom, changement de document) : elle a la priorité.
      if (jetons.current.get(n) !== monJeton) { p.cleanup(); return; }
      /**
       * 🔴 ON NE PEINT JAMAIS DIRECTEMENT SUR LA TOILE AFFICHÉE. PDF.js refuse deux rendus sur une même toile
       * (« Cannot use the same canvas during multiple render() operations ») ; un rendu écrit donc sur une toile
       * de brouillon, neuve à chaque fois, et l'image n'est recopiée sur la toile visible qu'une fois FINIE.
       * Bénéfice second : une page déjà lisible ne redevient pas blanche pendant qu'on la repeint.
       */
      const tampon = document.createElement('canvas');
      tampon.width = Math.floor(vue.width);
      tampon.height = Math.floor(vue.height);
      const ctxTampon = tampon.getContext('2d');
      if (ctxTampon === null) return;
      const tache = p.render({ canvasContext: ctxTampon, viewport: vue });
      enCours.current.set(n, tache);
      await tache.promise;
      enCours.current.delete(n);
      p.cleanup();
      // Une demande plus récente a pu aboutir entre-temps : on ne recouvre pas son image par la nôtre, périmée.
      if (jetons.current.get(n) !== monJeton) return;
      cible.width = tampon.width;
      cible.height = tampon.height;
      cible.style.width = `${Math.floor(vue.width / densite)}px`;
      cible.style.height = `${Math.floor(vue.height / densite)}px`;
      ctx.drawImage(tampon, 0, 0);
      if (!pagesPeintes.current.has(n)) {
        pagesPeintes.current.add(n);
        // 🔴 LA VIGNETTE NE S'EFFACE QUE MAINTENANT : quand il y a vraiment quelque chose à sa place.
        if (n === 1) rappelPage1.current?.();
      }
    } catch (e) {
      enCours.current.delete(n);
      /**
       * ⚠️ UN RENDU ANNULÉ N'EST PAS UNE ERREUR : changer de zoom ou fermer la fenêtre annule le rendu en cours,
       * et la page sera repeinte (ou la fenêtre est partie). PDF.js le dit par le nom de son exception.
       *
       * 🔴 TOUT LE RESTE EST DIT. Un `catch` muet ici a coûté une demi-heure de recherche le 29/09/2026 : la page
       * ne se peignait pas, et l'écran n'avait rien à en dire — ni erreur, ni vignette qui s'en va, rien.
       */
      const nom = (e as { name?: string } | null)?.name ?? '';
      if (nom === 'RenderingCancelledException' || nom === 'AbortException') return;
      // Un rendu DÉPASSÉ non plus : c'est le nôtre qu'on a nous-même écarté au profit d'un plus récent.
      if (jetons.current.get(n) !== monJeton) return;
      console.error('[gestion/lecteurPdf] page %d non rendue', n, e);
      setErreur('Cette page n’a pas pu être affichée.');
    }
    // ⚠️ NE JAMAIS AJOUTER `onPremierePage` ICI : c'est ce qui relançait le lecteur en boucle (voir `rappelPage1`).
  }, [doc, zoom]);


  /**
   * ══ LA DEMANDE DE RENDU : elle pose un JETON, annule ce qui court, et S'ENCHAÎNE au lieu de courir à côté. ═══
   *
   * 🔴 DÉFAUT TROUVÉ À L'ÉCRAN LE 29/09/2026 : PDF.js jetait « Cannot use the same canvas during multiple
   * render() operations », et la page 1 ne se peignait jamais. Deux rendus se chevauchaient sur la même toile —
   * React relance l'effet d'une page quand la fonction de rendu change d'identité (le document arrive, le zoom
   * bouge), et le mode strict du développement monte les effets deux fois.
   *
   * ⚠️ UN SIMPLE DRAPEAU « OCCUPÉ » N'AURAIT PAS SUFFI : il ne serait posé qu'APRÈS les `await` du rendu, donc
   * trop tard — le second appel serait déjà passé. Le jeton, lui, est posé au premier instant, sans attendre.
   */
  const peindre = useCallback(async (n: number, cible: HTMLCanvasElement): Promise<void> => {
    const jeton = (compteur.current += 1);
    jetons.current.set(n, jeton);
    const deja = enCours.current.get(n);
    if (deja) { try { deja.cancel(); } catch { /* rendu déjà fini */ } enCours.current.delete(n); }
    const precedent = file.current.get(n) ?? Promise.resolve();
    const suite = precedent.catch(() => {}).then(() => peindreVraiment(n, cible, jeton));
    file.current.set(n, suite);
    return suite;
  }, [peindreVraiment]);

  /** Le zoom change ⇒ tout ce qui était peint doit l'être à nouveau. */
  useEffect(() => { pagesPeintes.current = new Set(); }, [zoom]);

  /**
   * ⚠️ LE LECTEUR GARDE SA RACINE MÊME EN ÉCHEC. Rendre un simple paragraphe à la place ferait disparaître le
   * conteneur — et avec lui la place qu'il occupe dans la pile, donc la vignette sauterait d'un coup. On montre
   * le motif DANS le lecteur, qui reste le lecteur.
   */
  if (erreur !== null) {
    return (
      <div className="lpd">
        <p className="lpd-erreur" role="status">{erreur}</p>
      </div>
    );
  }

  return (
    <div className="lpd">
      {/* ══ LA BARRE — la nôtre, à nos couleurs, et SANS imprimer ni télécharger ═══════════════════════════════ */}
      <div className="lpd-barre">
        <span className="lpd-pages" aria-live="polite">
          {total === 0 ? '…' : `page ${Math.min(page, total)} / ${total}`}
        </span>
        <span className="lpd-zooms">
          <button type="button" className="gst-lien-bouton" aria-label="Réduire"
            disabled={typeof zoom === 'number' && zoom <= ZOOMS[0]}
            onClick={() => setZoom((z) => {
              const i = typeof z === 'number' ? ZOOMS.indexOf(z as (typeof ZOOMS)[number]) : 2;
              return ZOOMS[Math.max(0, i - 1)];
            })}>−</button>
          <span className="lpd-zoom-mot">
            {zoom === 'largeur' ? 'largeur' : `${Math.round(zoom * 100)} %`}
          </span>
          <button type="button" className="gst-lien-bouton" aria-label="Agrandir"
            disabled={typeof zoom === 'number' && zoom >= ZOOMS[ZOOMS.length - 1]}
            onClick={() => setZoom((z) => {
              const i = typeof z === 'number' ? ZOOMS.indexOf(z as (typeof ZOOMS)[number]) : 2;
              return ZOOMS[Math.min(ZOOMS.length - 1, i + 1)];
            })}>+</button>
          <button type="button" className={`gst-lien-bouton${zoom === 'largeur' ? ' lpd-actif' : ''}`}
            onClick={() => setZoom('largeur')}>Ajuster à la largeur</button>
        </span>
      </div>

      <div className="lpd-scene" ref={scene}
        onScroll={(e) => {
          // Quelle page est sous les yeux ? La barre le dit, sans rien recalculer d'autre.
          const el = e.currentTarget;
          const pages = [...el.querySelectorAll('.lpd-page')] as HTMLElement[];
          const haut = el.scrollTop + el.clientHeight * 0.3;
          const i = pages.findIndex((p) => p.offsetTop + p.offsetHeight > haut);
          if (i >= 0) setPage(i + 1);
        }}>
        {doc !== null && Array.from({ length: total }, (_, i) => i + 1).map((n) => (
          <PageCanvas key={`${n}:${String(zoom)}`} numero={n} nom={nom} peindre={peindre} />
        ))}
      </div>
    </div>
  );
}

/**
 * UNE PAGE. Elle ne se peint que lorsqu'elle APPROCHE de l'écran (`IntersectionObserver`, marge d'un écran).
 *
 * 🔴 LA PAGE 1 EST PEINTE TOUT DE SUITE, sans attendre l'observateur : c'est elle qu'on est venu voir, et attendre
 * un tour de boucle pour la demander coûterait le seul temps qui compte.
 */
function PageCanvas({ numero, nom, peindre }: {
  numero: number;
  nom: string;
  peindre: (n: number, cible: HTMLCanvasElement) => Promise<void>;
}) {
  const toile = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const el = toile.current;
    if (el === null) return undefined;
    if (numero === 1) { void peindre(1, el); return undefined; }
    if (typeof IntersectionObserver !== 'function') { void peindre(numero, el); return undefined; }
    const obs = new IntersectionObserver((entrees) => {
      for (const e of entrees) {
        if (!e.isIntersecting) continue;
        obs.disconnect();
        void peindre(numero, el);
      }
    }, { rootMargin: '150% 0px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [numero, peindre]);

  return (
    <div className="lpd-page">
      <canvas ref={toile} className="lpd-toile" aria-label={`${nom} — page ${numero}`} role="img" />
    </div>
  );
}

/** Ferme un document PDF.js sans jamais jeter : la fenêtre est déjà partie, l'erreur n'irait nulle part. */
async function fermerDocument(d: DocumentPdf): Promise<void> {
  try { await d.destroy(); } catch { /* document déjà fermé */ }
}

export const CSS_LECTEUR_PDF = `
.lpd{display:flex;flex-direction:column;width:100%;height:100%;min-height:0}
/* La barre est la NÔTRE : mêmes jetons de couleur que le reste du module, et rien qu'on n'ait choisi. */
.lpd-barre{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;
  padding:4px 8px;background:var(--color-svv-surface);border-bottom:1px solid var(--color-svv-line)}
.lpd-pages{font-size:.78rem;font-weight:700;color:var(--color-svv-ink)}
.lpd-zooms{display:flex;align-items:center;gap:10px}
.lpd-zoom-mot{min-width:4.2rem;text-align:center;font-size:.78rem;color:var(--color-svv-muted)}
.lpd-actif{text-decoration:none;border-bottom:2px solid var(--color-svv-red)}
.lpd-scene{flex:1 1 auto;min-height:0;overflow:auto;padding:12px 0;background:var(--color-svv-field)}
.lpd-page{display:flex;justify-content:center;margin-bottom:12px}
/* Un fond BLANC sous la page : une page de PDF est blanche, et un canvas vide sur fond sombre se lit « panne ».
   ⚠️ LE JETON --color-svv-page NE SUIT PAS LE THÈME, et c'est expres : le papier d'un acte notarie est blanc en
   mode sombre comme en mode clair. Teinter la page reviendrait a teinter le document lui-meme.
   (Pas d'accent grave dans ce bloc : il fermerait le litteral de style — piege deja rencontre le 28/09/2026.) */
.lpd-toile{max-width:100%;background:var(--color-svv-page);
  box-shadow:0 1px 6px color-mix(in srgb, var(--color-svv-ink) 22%, transparent)}
.lpd-erreur{margin:0;padding:14px 16px;font-size:.9rem;color:var(--color-svv-ink);
  background:var(--color-svv-surface);border-left:3px solid var(--color-svv-red);border-radius:0 .4rem .4rem 0}
`;
