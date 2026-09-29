'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  messageSansApercu, motCompteur, positionDans, sorteApercu, voisinVers, voisinsVisualisables,
  type VoisinPossible,
} from '../../../../lib/gestion/apercuDrive';
// LOT APERCU-PAGE1 — le PDF se lit chez nous, page par page : le lecteur natif attendait le fichier entier.
import { LecteurPdf, CSS_LECTEUR_PDF } from './LecteurPdf';

/**
 * LOT DRIVE-VISUALISER-ET-DOSSIERS — « VISUALISER » : VOIR UN FICHIER DU DRIVE SANS LE JOINDRE.
 * LOT APERCU-RAPIDE — et le voir VITE, puis passer au suivant sans quitter l'aperçu.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QUE ÇA RÉPARE. Avant, pour savoir si « Devis 2.pdf » était le bon devis, il fallait le JOINDRE, envoyer, et
 * voir. Ou ouvrir le Drive dans un autre onglet, retrouver le dossier, revenir. On joignait donc au hasard, et l'on
 * s'en apercevait chez le destinataire.
 *
 * 🔴🔴 L'APERÇU NE FERME PAS LA NAVIGATION, ET C'EST LE POINT LE PLUS IMPORTANT DE CE COMPOSANT. Il est rendu À CÔTÉ
 * du sélecteur (frère, pas enfant), par-dessus lui : le sélecteur n'est pas démonté, donc rien de son état ne bouge —
 * le même dossier, la même recherche, le même compteur, les mêmes « ✓ ajouté ». Fermer l'aperçu ne « revient » pas au
 * dossier : on n'en était jamais parti.
 *
 * ⚠️ FRÈRE ET NON ENFANT, POUR UNE SECONDE RAISON. Le sélecteur ferme sur Échap et sur un clic hors de lui. Placé
 * DANS son voile, l'aperçu aurait fait remonter ses propres Échap et ses propres clics jusqu'à lui : une croix qui
 * ferme deux fenêtres au lieu d'une.
 *
 * ═══ 🔴🔴 LOT APERCU-RAPIDE — POURQUOI L'ATTENTE A DISPARU ═══════════════════════════════════════════════════════
 * Mesuré le 29/09/2026 : l'ouverture coûtait 3 à 11 secondes, dont 2 s de verdict (la chaîne des parents, en série)
 * et jusqu'à 9 s d'attente du fichier ENTIER en mémoire de la page. Deux changements, et aucun ne touche la règle :
 *
 *   ① TROIS TEMPS AU LIEU D'UN. `info` (court) dit le verdict et le nom ; la VIGNETTE de la 1re page s'affiche en
 *      grand ; le document la remplace quand il arrive. On voit quelque chose de juste presque tout de suite.
 *   ② LE CADRE POINTE SUR LA ROUTE, plus sur un `blob:`. Un `blob:` exige le fichier COMPLET avant d'afficher le
 *      premier pixel ; une adresse laisse le lecteur PDF afficher les premières pages pendant que le reste arrive.
 *      C'est le refus qui imposait le `blob:` — il est désormais lu par `info`, en français, avant d'ouvrir le cadre.
 *
 * 🔒 LECTURE SEULE, ET RIEN NE RESTE. Les octets viennent de notre route, jamais de Google directement (le jeton ne
 * quitte pas le serveur, et l'adresse signée de la vignette non plus). Aucune copie dans le Drive, aucun fichier sur
 * le disque. Sous « Documents clients scannés », la route refuse — et l'aperçu affiche son motif.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

export interface FichierAVoir {
  id: string;
  nom: string;
  typeMime: string;
  lien: string | null;
  /** Le dossier qui le contient. Il BORNE « Précédent / Suivant » — voir `voisinsVisualisables`. */
  parentId?: string | null;
  /**
   * ══ 🔴 LOT DRIVE-RETOUCHES-1 — D'OÙ VIENNENT LES OCTETS ════════════════════════════════════════════════════
   *
   * `drive` (défaut) : un fichier du Drive, servi par la route d'aperçu, avec son verdict d'archive.
   * `piece`          : une PIÈCE REÇUE qu'on est en train de ranger, servie par la route des pièces.
   *
   * 🔴 ET C'EST LA ROUTE DES PIÈCES QUI SAIT DÉJÀ LIRE UNE PIÈCE VIDÉE. Depuis le lot du vidage, elle bascule
   * toute seule sur la copie Drive quand les octets locaux ont été libérés (`stockageVide`), à la même adresse et
   * sous le même nom. L'aperçu d'une pièce vidée marche donc sans qu'une ligne de plus soit écrite ici — et sans
   * qu'une seconde définition de « où sont les octets de cette pièce » vienne contredire la première.
   */
  source?: 'drive' | 'piece';
}

/**
 * L'adresse des réponses de la route. Écrite une fois : des recopies dériveraient. PUR.
 *
 * ⚠️ UNE PIÈCE REÇUE N'A NI `info` NI `vignette` : son type et son nom sont DÉJÀ connus de l'écran qui l'affiche
 * (le panneau « À ranger » les a reçus avec la pièce), et `sorteApercu` est une fonction pure. Un aller-retour
 * pour redemander ce qu'on tient dans la main ne servirait qu'à retarder l'ouverture.
 */
export function adresseApercu(
  id: string, quoi: 'info' | 'vignette' | 'octets', source: 'drive' | 'piece' = 'drive',
): string {
  if (source === 'piece') return `/api/admin/gestion/pieces/${encodeURIComponent(id)}`;
  const base = `/api/admin/gestion/drive/apercu?fichier=${encodeURIComponent(id)}`;
  return quoi === 'octets' ? base : `${base}&${quoi}=1`;
}

/** Ce que `info` répond, réduit à ce que l'écran en fait. */
interface Info {
  etat?: string;
  nom?: string;
  sorte?: 'pdf' | 'image' | 'texte' | 'export_pdf' | 'aucun';
  vignette?: boolean;
  message?: string;
}

type Etat =
  | { e: 'charge'; vignette: boolean }
  | { e: 'pret'; sorte: 'pdf' | 'image' | 'texte'; vignette: boolean }
  /**
   * `regle` distingue LES DEUX RAISONS de ne rien montrer, et ce n'est pas une nuance d'affichage :
   *   · un format dont on ne sait pas faire d'aperçu — on peut tout de même le JOINDRE ;
   *   · « Documents clients scannés » — on ne peut RIEN en faire, et proposer « Joindre ce fichier » juste sous la
   *     phrase « son contenu n'est jamais lu » serait se contredire d'une ligne à l'autre.
   *
   * ⚠️ LE CAS ARRIVE VRAIMENT : dans des résultats de recherche, l'écran ne connaît pas l'emplacement des fichiers
   * (ils viennent de tout le Drive), donc il propose les trois liens et c'est le SERVEUR qui tranche au clic.
   * Mesuré à l'écran le 28/09/2026 sur « 5_trois dernières quittances de loyer.pdf ».
   */
  | { e: 'sans'; message: string; regle: boolean };

/** Les paliers de zoom de l'image. Le PDF, lui, a le zoom du navigateur, qui est meilleur que tout ce qu'on écrirait. */
const ZOOMS = [0.5, 0.75, 1, 1.5, 2, 3] as const;

/**
 * 🔴 LA TAILLE AU-DELÀ DE LAQUELLE ON N'AMORCE PLUS LE VOISIN. Deux voisins de douze mégaoctets chasseraient de la
 * mémoire du serveur le document qu'on est précisément en train de lire — l'amorçage se retournerait contre lui.
 */
const AMORCE_TAILLE_MAX = 8 * 1024 * 1024;

export function ApercuFichierDrive({
  fichier, voisinage = [], joindreAutorise, estDeja, onJoindre, onFermer,
}: {
  fichier: FichierAVoir;
  /**
   * 🔴 LA LISTE AFFICHÉE AU MOMENT DU CLIC. Le périmètre du parcours en est TIRÉ, jamais donné : c'est le module
   * pur `voisinsVisualisables` qui écarte les dossiers, les types sans aperçu, et tout ce qui n'a pas le MÊME
   * dossier parent que le document ouvert. Passer un périmètre déjà filtré aurait mis cette règle dans l'écran.
   */
  voisinage?: readonly VoisinPossible[];
  /** Faux sous « Documents clients scannés » : le bouton « Joindre » de l'aperçu n'y est pas non plus. */
  joindreAutorise: boolean;
  /** Ce fichier-ci est-il déjà ajouté au message ? Suit le document AFFICHÉ, pas celui qu'on a ouvert en premier. */
  estDeja: (id: string) => boolean;
  onJoindre: (f: FichierAVoir) => void;
  onFermer: () => void;
}) {
  /** Le document AFFICHÉ. Il change avec « Précédent / Suivant » ; `fichier` est seulement celui d'où l'on part. */
  const [vu, setVu] = useState<FichierAVoir>(fichier);
  /**
   * 🔴 D'OÙ VIENNENT LES OCTETS, pour tout le tour. Elle est prise sur le document D'OUVERTURE et non sur celui
   * qu'on regarde : un tour ne mélange jamais des pièces reçues et des fichiers du Drive — `voisinsVisualisables`
   * ne retient que ce qui a le même parent, et les deux mondes n'en partagent aucun.
   */
  const source = fichier.source ?? 'drive';
  const [etat, setEtat] = useState<Etat>({ e: 'charge', vignette: false });
  const [zoom, setZoom] = useState(1);
  /**
   * 🔴 LOT APERCU-PAGE1 — LA PAGE 1 EST-ELLE PEINTE ?
   *
   * C'est ce drapeau, et LUI SEUL, qui retire la vignette Drive. Le défaut du lot précédent était là : le cadre du
   * PDF recouvrait la vignette dès qu'il était POSÉ, c'est-à-dire alors qu'il était encore vide — on remplaçait
   * une image juste par un rectangle noir, pendant deux à cinq secondes.
   */
  const [page1Peinte, setPage1Peinte] = useState(false);
  /**
   * ⚠️ LE RAPPEL DOIT GARDER LA MÊME IDENTITÉ D'UN RENDU À L'AUTRE. Écrit sur place (`() => setPage1Peinte(true)`),
   * il changeait d'identité à chaque rendu de cet écran, et le lecteur PDF repartait de zéro à chaque fois — la
   * page 1 n'arrivait jamais au bout de son rendu (mesuré le 29/09/2026 : plus de trente secondes, toile blanche).
   * Le lecteur s'en protège aussi de son côté, mais la faute était ICI : on la corrige ici aussi.
   */
  const direPage1Peinte = useCallback(() => setPage1Peinte(true), []);
  const croix = useRef<HTMLButtonElement | null>(null);

  // Rouvrir l'aperçu sur un autre fichier depuis la liste doit repartir de celui-là.
  useEffect(() => { setVu(fichier); }, [fichier]);

  const voisins = useMemo(
    () => voisinsVisualisables(voisinage, { id: vu.id, typeMime: vu.typeMime, parentId: vu.parentId ?? null }),
    [voisinage, vu.id, vu.typeMime, vu.parentId]);
  const position = positionDans(voisins, vu.id);
  const idPrecedent = voisinVers(voisins, vu.id, -1);
  const idSuivant = voisinVers(voisins, vu.id, 1);

  const allerVers = useCallback((id: string | null) => {
    if (id === null) return;
    const v = voisinage.find((x) => x.id === id);
    if (v === undefined) return;
    setZoom(1);
    setPage1Peinte(false);
    setVu({ id: v.id, nom: v.nom, typeMime: v.typeMime, lien: null, parentId: v.parentId });
  }, [voisinage]);

  /**
   * ══ CE QU'ON PEUT MONTRER DE CE DOCUMENT ═════════════════════════════════════════════════════════════════════
   *
   * 🔴 `info` D'ABORD, ET LUI SEUL EST ATTENDU. Il est court (le verdict et les métadonnées, tous deux mémorisés
   * 60 s côté serveur) et il porte le refus EN FRANÇAIS. Une fois qu'il a dit oui, le cadre et la vignette partent
   * en parallèle : plus rien n'est attendu ici.
   *
   * ⚠️ UN FORMAT HORS LISTE BLANCHE EST TRANCHÉ SANS APPELER LE SERVEUR : on connaît déjà la réponse, et demander
   * pour rien ajouterait un aller-retour à un « non » certain.
   */
  useEffect(() => {
    const sorte = sorteApercu(vu.typeMime);
    if (sorte === 'aucun') {
      setEtat({ e: 'sans', message: messageSansApercu(vu.typeMime), regle: false });
      return undefined;
    }
    let annule = false;
    setPage1Peinte(false);
    setEtat({ e: 'charge', vignette: false });

    /* ══ 🔴 UNE PIÈCE REÇUE N'A RIEN À DEMANDER ═════════════════════════════════════════════════════════════
       Son nom et son type sont DÉJÀ connus de l'écran qui l'affiche (le panneau « À ranger » les a reçus avec
       elle), et le format hors liste blanche vient d'être tranché juste au-dessus, par la MÊME fonction pure. Un
       aller-retour pour redemander ce qu'on tient dans la main ne ferait que retarder l'ouverture.
       ⚠️ AUCUNE VIGNETTE : la route des pièces sert les octets, pas une image de première page. Le lecteur PDF
       affiche sa propre page 1, comme pour un fichier du Drive dont Google n'aurait pas de vignette. */
    if (source === 'piece') {
      setEtat({
        e: 'pret',
        sorte: sorte === 'image' ? 'image' : sorte === 'texte' ? 'texte' : 'pdf',
        vignette: false,
      });
      return undefined;
    }

    void (async () => {
      try {
        const res = await fetch(adresseApercu(vu.id, 'info'), { cache: 'no-store' });
        const d = (await res.json().catch(() => ({}))) as Info;
        if (annule) return;
        if (!res.ok || d.etat === 'refus') {
          // 403 = LA RÈGLE (« Documents clients scannés »), et non un format sans aperçu : rien n'est proposé après.
          setEtat({ e: 'sans', message: d.message ?? 'Aperçu impossible pour ce fichier.', regle: res.status === 403 });
          return;
        }
        if (d.etat === 'sans_apercu') {
          setEtat({ e: 'sans', message: d.message ?? messageSansApercu(vu.typeMime), regle: false });
          return;
        }
        if (d.etat !== 'ok') {
          setEtat({ e: 'sans', message: d.message ?? 'Aperçu impossible pour ce fichier.', regle: false });
          return;
        }
        setEtat({
          e: 'pret',
          sorte: d.sorte === 'image' ? 'image' : d.sorte === 'texte' ? 'texte' : 'pdf',
          vignette: d.vignette === true,
        });
      } catch {
        if (!annule) {
          setEtat({ e: 'sans', message: 'Le Drive n’a pas répondu : aperçu impossible pour le moment.', regle: false });
        }
      }
    })();
    return () => { annule = true; };
  }, [vu.id, vu.typeMime, source]);

  /**
   * ══ 🔴 LE PRÉCHARGEMENT DU VOISIN ════════════════════════════════════════════════════════════════════════════
   *
   * On demande `info` du précédent et du suivant dès que le document courant est prêt. C'est COURT, et ça réchauffe
   * ce qui coûte vraiment : côté serveur, le verdict et les métadonnées sont alors mémorisés, et le pas suivant
   * n'attend plus que les octets.
   *
   * ⚠️ DEUX VOISINS, PAS DAVANTAGE. Précharger tout un dossier ferait quarante appels pour un aperçu qu'on ferme
   * au deuxième — et le lot borne explicitement les préchargements simultanés.
   *
   * 🔒 ET JAMAIS HORS DU PÉRIMÈTRE : les voisins sortent de `voisinsVisualisables`, qui n'en laisse aucun sortir du
   * dossier. Aucun préchargement ne peut donc atteindre « Documents clients scannés » depuis un autre dossier.
   */
  useEffect(() => {
    /**
     * 🔴 ON N'AMORCE QU'APRÈS LA PAGE 1 : le document qu'on est venu voir passe en premier, toujours. Amorcer
     * pendant son chargement lui disputerait la connexion, pour une page que personne ne regarde encore.
     */
    if (etat.e !== 'pret' || !page1Peinte || source === 'piece') return undefined;
    let annule = false;
    for (const id of [idSuivant, idPrecedent]) {
      if (id === null) continue;
      void (async () => {
        try {
          const res = await fetch(adresseApercu(id, 'info'), { cache: 'no-store' });
          const d = (await res.json()) as { etat?: string; sorte?: string; tailleOctets?: number | null };
          if (annule || d.etat !== 'ok') return;
          /**
           * ══ 🔴🔴 ON TIRE AUSSI LES OCTETS DU VOISIN, ET C'EST CE QUI REND « SUIVANT » INSTANTANÉ ═══════════
           *
           * Mesuré le 29/09/2026 : passer à un document JAMAIS VU coûtait 1,9 à 2,9 s ; revenir sur un document
           * déjà vu, 407 ms. Toute la différence est le trajet des octets depuis Google. On le fait donc AVANT
           * qu'on appuie, pendant qu'on lit la page 1 — le serveur garde le fichier une minute, et le pas suivant
           * ne paie plus que le tramage.
           *
           * ⚠️ ON LES JETTE AUSSITÔT LUS. Ce qu'on réchauffe est la mémoire du SERVEUR, pas celle de la page :
           * la route répond `no-store`, et garder trois documents dans le navigateur ne servirait à rien.
           *
           * ⚠️ PAS POUR UN DOCUMENT GOOGLE EXPORTÉ (`export_pdf`) : son PDF est CALCULÉ à chaque demande, jamais
           * mémorisé — l'amorcer ferait travailler Google pour rien. Ni au-delà de 8 Mo : deux voisins de douze
           * mégaoctets chasseraient de la mémoire le document qu'on est en train de lire.
           */
          if (d.sorte === 'export_pdf') return;
          if ((d.tailleOctets ?? 0) > AMORCE_TAILLE_MAX) return;
          const octets = await fetch(adresseApercu(id, 'octets'), { cache: 'no-store' });
          await octets.arrayBuffer();
        } catch { /* un amorçage raté n'est pas une panne : le pas suivant sera simplement moins rapide */ }
      })();
    }
    /**
     * ⚠️ ON N'INTERROMPT PAS L'AMORÇAGE EN COURS, et c'est voulu : l'interrompre ferait perdre au serveur les
     * octets à moitié lus, donc le bénéfice entier. Il se termine seul, `annule` empêchant seulement d'enchaîner.
     */
    return () => { annule = true; };
  }, [etat.e, page1Peinte, idSuivant, idPrecedent, source]);

  /**
   * ÉCHAP FERME, LES FLÈCHES NAVIGUENT — même quand le focus est DANS le cadre de l'aperçu.
   *
   * ⚠️ UN ÉCOUTEUR SUR LA FENÊTRE, pas seulement sur la boîte : le lecteur PDF du navigateur prend le focus, et un
   * `onKeyDown` de React ne verrait jamais la touche. `capture` pour passer avant tout le reste.
   *
   * ⚠️ LES FLÈCHES SONT IGNORÉES DANS UN CHAMP DE SAISIE — il n'y en a pas dans cet aperçu aujourd'hui, mais le
   * jour où il y en aura un, elles doivent déplacer le curseur et non changer de document.
   */
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      const cible = e.target as HTMLElement | null;
      const saisie = cible !== null
        && (cible.tagName === 'INPUT' || cible.tagName === 'TEXTAREA' || cible.isContentEditable);
      if (e.key === 'Escape') { e.stopPropagation(); onFermer(); return; }
      if (saisie) return;
      if (e.key === 'ArrowRight' && idSuivant !== null) { e.preventDefault(); allerVers(idSuivant); }
      if (e.key === 'ArrowLeft' && idPrecedent !== null) { e.preventDefault(); allerVers(idPrecedent); }
    };
    window.addEventListener('keydown', surTouche, true);
    return () => window.removeEventListener('keydown', surTouche, true);
  }, [onFermer, allerVers, idSuivant, idPrecedent]);

  useEffect(() => { croix.current?.focus(); }, []);

  const iZoom = ZOOMS.indexOf(zoom as (typeof ZOOMS)[number]);
  const deja = estDeja(vu.id);

  return (
    <div className="apd-voile" role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) onFermer(); }}>
      <style>{CSS_APERCU}</style>
      <style>{CSS_LECTEUR_PDF}</style>
      <div className="apd" role="dialog" aria-modal="true" aria-label={`Aperçu de ${vu.nom}`}>
        <header className="apd-tete">
          <span className="apd-nom" title={vu.nom}>
            <span aria-hidden="true">👁</span> {vu.nom}
          </span>
          {/* Le ZOOM de l'en-tête n'existe que pour l'IMAGE : le PDF a le sien dans SA barre (page, zoom, largeur),
              et du texte se lit à sa taille. */}
          {etat.e === 'pret' && etat.sorte === 'image' && (
            <span className="apd-zoom">
              <button type="button" className="gst-lien-bouton" disabled={iZoom <= 0}
                onClick={() => setZoom(ZOOMS[Math.max(0, iZoom - 1)])} aria-label="Réduire">−</button>
              <span className="apd-zoom-mot">{Math.round(zoom * 100)} %</span>
              <button type="button" className="gst-lien-bouton" disabled={iZoom >= ZOOMS.length - 1}
                onClick={() => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, iZoom + 1)])} aria-label="Agrandir">+</button>
            </span>
          )}
          <button ref={croix} type="button" className="apd-croix" onClick={onFermer}
            aria-label="Fermer l’aperçu">×</button>
        </header>

        <div className={`apd-scene${etat.e === 'pret' && etat.sorte === 'image' ? ' apd-scene--image' : ''}`}>
          {/* 🔴 LA VIGNETTE DE LA 1re PAGE, EN GRAND, DÈS QU'ON SAIT QU'ELLE EXISTE. Elle est là avant le document,
              et le document la RECOUVRE quand il arrive — sans saut de mise en page, puisque les deux occupent la
              même case de la grille. */}
          {etat.e !== 'sans' && (
            <div className="apd-pile">
              {/* 🔴 LA VIGNETTE RESTE JUSQU'À CE QUE LA PAGE 1 SOIT PEINTE — jamais jusqu'à ce que le lecteur soit
                  POSÉ. C'est tout le défaut du lot précédent, corrigé : `page1Peinte` est levé par le lecteur
                  lui-même, quand il a vraiment quelque chose à montrer. */}
              {(etat.e === 'charge' || (etat.vignette && !page1Peinte)) && (
                <img className="apd-vignette" src={adresseApercu(vu.id, 'vignette', source)} alt=""
                  aria-hidden="true" />
              )}
              {(etat.e === 'charge' || (etat.e === 'pret' && etat.sorte === 'pdf' && !page1Peinte)) && (
                <p className="apd-attente" role="status">Lecture du fichier…</p>
              )}
              {etat.e === 'pret' && etat.sorte === 'image' && (
                <img className="apd-image" src={adresseApercu(vu.id, 'octets', source)} alt={vu.nom}
                  style={{ width: `${zoom * 100}%` }} />
              )}
              {/*
                🔴🔴 LE PDF EST LU CHEZ NOUS, PAGE PAR PAGE. Le lecteur natif de Chrome attendait le fichier entier
                puis décodait toutes les pages avant d'en peindre une (2 à 5 s mesurées sur un acte de 29 pages).
                PDF.js ne demande que les octets de la page 1, par requêtes partielles que notre route sert.
                `key` force un lecteur NEUF à chaque document : sans elle, on garderait le rendu du précédent.
              */}
              {etat.e === 'pret' && etat.sorte === 'pdf' && (
                <LecteurPdf key={vu.id} url={adresseApercu(vu.id, 'octets', source)} nom={vu.nom}
                  onPremierePage={direPage1Peinte} />
              )}
              {/* Le TEXTE BRUT garde le cadre : il n'y a rien à décoder, le navigateur l'affiche tel quel. */}
              {etat.e === 'pret' && etat.sorte === 'texte' && (
                <iframe key={vu.id} className="apd-cadre" src={adresseApercu(vu.id, 'octets', source)}
                  title={`Aperçu de ${vu.nom}`} />
              )}
            </div>
          )}
          {/* 🔴 « Aperçu indisponible » EST UNE RÉPONSE, PAS UNE PANNE : le mot le dit, et la sortie est juste à côté. */}
          {etat.e === 'sans' && <p className="apd-sans" role="status">{etat.message}</p>}
        </div>

        {/* ══ 🔴 LA NAVIGATION — BORNÉE AU DOSSIER DU DOCUMENT AFFICHÉ ═══════════════════════════════════════════
            Elle n'apparaît que s'il y a quelque chose à parcourir : un unique document ne mérite pas deux boutons
            éteints et un « 1 / 1 » qui n'apprend rien. */}
        {voisins.length > 1 && (
          <nav className="apd-nav" aria-label="Documents du dossier">
            <button type="button" className="svv-btn gst-btn" disabled={idPrecedent === null}
              onClick={() => allerVers(idPrecedent)}>◀ Précédent</button>
            <span className="apd-compteur" aria-live="polite">
              <span className="apd-compteur-n">{motCompteur(position, voisins.length)}</span>
              <span className="apd-compteur-nom">{vu.nom}</span>
            </span>
            <button type="button" className="svv-btn gst-btn" disabled={idSuivant === null}
              onClick={() => allerVers(idSuivant)}>Suivant ▶</button>
          </nav>
        )}

        <footer className="apd-pied">
          {/* 🔴 « JOINDRE » EST DANS L'APERÇU (demande d'Arno) : on regarde, on reconnaît, on joint — sans refermer.
              ⚠️ SAUF QUAND C'EST LA RÈGLE QUI A REFUSÉ L'APERÇU : le proposer une ligne sous « son contenu n'est
              jamais lu » se contredirait, et le clic serait refusé par le serveur de toute façon. */}
          {joindreAutorise && !(etat.e === 'sans' && etat.regle) && (
            deja
              ? <span className="sfd-ajoute">✓ ajouté</span>
              : (
                <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={() => onJoindre(vu)}>
                  Joindre ce fichier
                </button>
              )
          )}
          <button type="button" className="svv-btn gst-btn" onClick={onFermer}>Fermer l’aperçu</button>
        </footer>
      </div>
    </div>
  );
}

export const CSS_APERCU = `
/* Au-dessus du sélecteur (z-index 70), jamais dedans : voir l'en-tête du composant. */
.apd-voile{position:fixed;inset:0;z-index:80;display:flex;align-items:center;justify-content:center;padding:12px;
  background:color-mix(in srgb, var(--color-svv-ink) 62%, transparent)}
.apd{display:flex;flex-direction:column;gap:8px;width:min(1040px,100%);height:min(92vh,100%);padding:12px;
  background:var(--color-svv-surface);border:1px solid var(--color-svv-line);border-radius:.8rem;
  box-shadow:0 12px 48px color-mix(in srgb, var(--color-svv-ink) 34%, transparent)}
.apd-tete{display:flex;flex-wrap:wrap;align-items:center;gap:10px;min-width:0}
.apd-nom{flex:1 1 12rem;min-width:0;font-size:.92rem;font-weight:700;color:var(--color-svv-ink);
  overflow-wrap:anywhere}
.apd-zoom{display:flex;align-items:center;gap:8px;font-size:.82rem}
.apd-zoom-mot{min-width:3.4rem;text-align:center;color:var(--color-svv-muted)}
.apd-croix{min-width:44px;min-height:44px;padding:0;font:inherit;font-size:1.4rem;line-height:1;
  color:var(--color-svv-ink);background:none;border:0;border-radius:.4rem;cursor:pointer}
.apd-croix:hover{background:var(--color-svv-field)}
.apd-croix:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
/* La scène prend toute la hauteur restante : un aperçu qui n'occupe pas la place ne sert à rien. */
.apd-scene{flex:1 1 auto;display:flex;align-items:center;justify-content:center;min-height:0;overflow:auto;
  background:var(--color-svv-field);border:1px solid var(--color-svv-line);border-radius:.5rem}
/* Zoomée, l'image déborde : elle s'aligne en haut à gauche pour qu'on puisse la parcourir. */
.apd-scene--image{align-items:flex-start;justify-content:flex-start}
/* 🔴 LA PILE — la vignette et le document occupent la MÊME case : le second recouvre la première SANS saut de
   mise en page. Empiler par la grille, et non par « position:absolute », garde la hauteur juste dans les deux cas. */
.apd-pile{display:grid;width:100%;height:100%;min-height:0}
.apd-pile > *{grid-area:1 / 1}
.apd-vignette{width:100%;height:100%;object-fit:contain;object-position:center top;background:var(--color-svv-field)}
.apd-attente{align-self:end;justify-self:center;margin:0 0 12px;padding:4px 12px;font-size:.82rem;
  color:var(--color-svv-ink);background:var(--color-svv-surface);border-radius:999px;
  box-shadow:0 2px 10px color-mix(in srgb, var(--color-svv-ink) 16%, transparent)}
.apd-cadre{width:100%;height:100%;border:0;background:var(--color-svv-surface)}
.apd-image{display:block;height:auto;max-width:none;align-self:start;justify-self:start}
.apd-sans{margin:0;padding:14px 16px;max-width:34rem;font-size:.9rem;color:var(--color-svv-ink);
  background:var(--color-svv-surface);border-left:3px solid var(--color-svv-red);border-radius:0 .4rem .4rem 0}
/* ══ LA NAVIGATION ════════════════════════════════════════════════════════════════════════════════════════════ */
.apd-nav{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px}
.apd-compteur{display:flex;flex-direction:column;align-items:center;min-width:0;flex:1 1 8rem}
.apd-compteur-n{font-size:.84rem;font-weight:700;color:var(--color-svv-ink)}
.apd-compteur-nom{max-width:100%;font-size:.74rem;color:var(--color-svv-muted);overflow:hidden;
  text-overflow:ellipsis;white-space:nowrap}
.apd-pied{display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:10px}
@media (max-width:520px){
  .apd{height:100%;padding:10px}
  .apd-nom{flex-basis:100%}
}
`;
