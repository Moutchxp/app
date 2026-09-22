'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';
import {
  LIB_TELECHARGER_DOCUMENT, LIB_RETOUR_ESPACE, LIB_PREPARATION, LIB_SE_RECONNECTER,
  MSG_APERCU_INDISPONIBLE, MSG_APERCU_EN_PREPARATION, MSG_APERCU_CHARGEMENT,
  MSG_SESSION_EXPIREE, MSG_DOCUMENT_NON_PREPARE, TITRE_APERCU,
  type DocumentApercu,
} from './presentation';

/**
 * PDF.js chargé UNIQUEMENT côté client, à la demande. On RÉUTILISE le viewer déjà en service sur la page publique de
 * vérification (`app/verifier/PdfViewer.tsx`) : il rend chaque page dans un <canvas> via le build LEGACY de pdfjs-dist,
 * choisi explicitement pour Safari iOS. Aucune duplication, et aucune modification de la page `/verifier`.
 *
 * POURQUOI un canvas et pas un <embed>/<iframe> : Safari iOS rend très mal un PDF intégré dans une page (cadre vide,
 * ou première page seule sans défilement). Le rendu canvas affiche le document de façon identique sur tous les
 * navigateurs, iPhone compris.
 */
const PdfViewer = dynamic(() => import('../verifier/PdfViewer'), { ssr: false });

/** Type attendu selon le document — repli si la réponse ne porte pas de `Content-Type` exploitable. */
const TYPE_PAR_DEFAUT: Record<DocumentApercu, string> = {
  nominatif: 'application/pdf',
  anonyme: 'application/pdf',
  visuel: 'image/png',
};

/**
 * Nom de fichier lu dans `Content-Disposition` (le serveur l'y met déjà : `Certificat-SAVV-…`,
 * `Certificat-anonymise-SAVV-…`, `Visuel-annonce-SVAV-…`). PUR, exporté pour les tests.
 * `null` si l'en-tête est absent ou illisible → l'appelant applique un nom de repli.
 */
export function nomDepuisDisposition(entete: string | null): string | null {
  if (!entete) return null;
  const m = /filename="([^"]+)"/.exec(entete) ?? /filename=([^;]+)/.exec(entete);
  const nom = m?.[1]?.trim();
  return nom ? nom : null;
}

/** État de la RÉCUPÉRATION du document. `chargement` est aussi l'état rendu par le serveur → aucune divergence. */
type EtatDocument =
  | { phase: 'chargement' }
  | { phase: 'pret'; fichier: File; url: string }
  | { phase: 'session' } // 401 : session expirée → reconnexion
  | { phase: 'erreur' }; // tout le reste

/**
 * ÉCRAN D'APERÇU d'un document de certificat (corps de la page serveur `certificats/[id]/apercu`).
 *
 * Reçoit UNIQUEMENT des valeurs déjà validées côté serveur, derrière la garde de propriété : l'id du certificat, le
 * document demandé, et l'analyse d'où l'on vient (pour la rouvrir au retour). Aucune donnée nominative, aucune clé de
 * stockage, aucun jeton n'est sérialisé jusqu'ici.
 *
 * ── LE DOCUMENT EST RÉCUPÉRÉ UNE SEULE FOIS, AU MONTAGE ────────────────────────────────────────────
 * Un `fetch` same-origin (donc avec le cookie de session) rapporte les octets ; on en fait un `File` portant le nom
 * et le type réels, et une URL d'objet. Ce MÊME fichier sert à l'aperçu ET au bouton — plus aucune requête réseau
 * au moment du clic. C'est ce qui corrige le défaut observé sur iPhone (journal du 22/09, certificat 469) : Safari
 * affichait le PDF au lieu de l'enregistrer et REJOUAIT la requête sans session — 200 puis 401 sur la même URL.
 *
 * ── LE BOUTON OUVRE LA FEUILLE DE PARTAGE QUAND L'APPAREIL LA PROPOSE (décision du porteur, 22/09) ──
 * iPhone → « Enregistrer dans Fichiers », « Enregistrer l'image dans Photos », Messages, WhatsApp, mail…
 * Ordinateur, ou partage de fichiers indisponible → téléchargement, comme avant.
 * ⚠️ `navigator.share` est appelé DANS L'ÉLAN DIRECT DU GESTE, sans le moindre `await` avant : Safari refuse
 * l'appel s'il n'est plus rattaché à l'interaction. C'est la raison d'être de la récupération au montage.
 *
 * ── AUCUNE BRANCHE SERVEUR/CLIENT AU RENDU ─────────────────────────────────────────────────────────
 * Ni `typeof window`, ni `navigator` pendant le rendu : le premier rendu client est IDENTIQUE à celui du serveur
 * (état `chargement`, bouton inactif). Tout ce qui dépend de l'appareil se décide au montage (`useEffect`) ou au
 * clic. Un attribut qui différait entre serveur et client avait provoqué une erreur d'hydratation en dev.
 */
export default function ApercuDocument({
  certificatId,
  doc,
  analyseId,
  disponible,
}: {
  certificatId: number;
  doc: DocumentApercu;
  analyseId: number | null;
  /** false = nominatif pas encore déposé : on n'affiche ni aperçu ni téléchargement, seulement la mention et le retour. */
  disponible: boolean;
}) {
  const [etat, setEtat] = useState<EtatDocument>({ phase: 'chargement' });
  const [imageErreur, setImageErreur] = useState(false);

  const base = `/api/internaute/espace/certificats/${certificatId}/telecharger?doc=${doc}`;
  const retour = analyseId === null ? '/espace' : `/espace?analyse=${analyseId}`;

  // ── Récupération UNIQUE au montage (jamais au rendu) ──
  useEffect(() => {
    if (!disponible) return;
    const ctrl = new AbortController();
    let urlObjet: string | null = null;
    (async () => {
      try {
        // `same-origin` est déjà le défaut ; on l'écrit pour que l'intention (envoyer le cookie) soit explicite.
        const r = await fetch(base, { signal: ctrl.signal, credentials: 'same-origin' });
        if (r.status === 401) { setEtat({ phase: 'session' }); return; }
        if (!r.ok) { setEtat({ phase: 'erreur' }); return; }
        const blob = await r.blob();
        const type = r.headers.get('Content-Type') ?? TYPE_PAR_DEFAUT[doc];
        const nom = nomDepuisDisposition(r.headers.get('Content-Disposition'))
          ?? `${TITRE_APERCU[doc]}${doc === 'visuel' ? '.png' : '.pdf'}`;
        const fichier = new File([blob], nom, { type });
        urlObjet = URL.createObjectURL(fichier);
        setEtat({ phase: 'pret', fichier, url: urlObjet });
      } catch (e) {
        // Démontage pendant la requête → pas une erreur à montrer.
        if ((e as Error)?.name !== 'AbortError') setEtat({ phase: 'erreur' });
      }
    })();
    return () => {
      ctrl.abort();
      if (urlObjet) URL.revokeObjectURL(urlObjet); // pas de fuite mémoire si l'on quitte l'écran
    };
  }, [base, doc, disponible]);

  /** Repli : enregistrement depuis l'URL d'objet déjà en main — aucune requête réseau, donc aucune session à revalider. */
  const enregistrer = useCallback((url: string, nom: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = nom; // ici `download` est légitime : URL d'objet locale, pas une route
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, []);

  /** Clic : `navigator.share` D'ABORD, sans aucun `await` avant lui (exigence Safari). */
  const auClic = useCallback(() => {
    if (etat.phase !== 'pret') return;
    const { fichier, url } = etat;
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (typeof nav.share === 'function' && nav.canShare?.({ files: [fichier] })) {
      nav.share({ files: [fichier], title: TITRE_APERCU[doc] }).catch((e: unknown) => {
        // L'internaute a fermé la feuille de partage : c'est un choix, pas une panne → rien, silencieux.
        if ((e as Error)?.name === 'AbortError') return;
        enregistrer(url, fichier.name); // refus pour une autre raison → on enregistre quand même
      });
      return;
    }
    enregistrer(url, fichier.name);
  }, [etat, doc, enregistrer]);

  const pret = etat.phase === 'pret';

  return (
    <div className="flex flex-col gap-5">
      {/* Cadre de l'aperçu : fond de surface, bordure de charte, défilement vertical borné sur petit écran. */}
      <div className="overflow-hidden rounded-xl border border-svv-line bg-svv-surface">
        {!disponible ? (
          <p className="px-4 py-12 text-center text-sm text-svv-muted">{MSG_APERCU_EN_PREPARATION}</p>
        ) : etat.phase === 'chargement' ? (
          <p className="px-4 py-12 text-center text-sm text-svv-muted">{MSG_APERCU_CHARGEMENT}</p>
        ) : etat.phase === 'session' ? (
          <p className="px-4 py-12 text-center text-sm text-svv-muted">{MSG_SESSION_EXPIREE}</p>
        ) : etat.phase === 'erreur' ? (
          <p className="px-4 py-12 text-center text-sm text-svv-muted">{MSG_DOCUMENT_NON_PREPARE}</p>
        ) : doc === 'visuel' ? (
          imageErreur ? (
            <p className="px-4 py-12 text-center text-sm text-svv-muted">{MSG_APERCU_INDISPONIBLE}</p>
          ) : (
            // Le visuel est une image : <img> suffit, aucun PDF.js. La source est l'URL d'OBJET déjà récupérée —
            // le document n'est donc téléchargé qu'une fois. `alt` vide = décoratif (le titre de l'écran le nomme).
            // eslint-disable-next-line @next/next/no-img-element
            <img src={etat.url} alt="" onError={() => setImageErreur(true)} className="block w-full" />
          )
        ) : (
          <div className="p-2">
            {/* MÊME fichier que le bouton : PDF.js lit l'URL d'objet, sans repasser par le réseau ni par la garde. */}
            <PdfViewer url={etat.url} />
          </div>
        )}
      </div>

      {/* Actions — pleine largeur, empilées, pouce-compatibles. Ordre : action principale puis retour. */}
      <div className="flex flex-col gap-3">
        {disponible && etat.phase !== 'session' && etat.phase !== 'erreur' && (
          <button type="button" className="svv-btn svv-btn-primary" onClick={auClic} disabled={!pret}>
            {pret ? LIB_TELECHARGER_DOCUMENT : LIB_PREPARATION}
          </button>
        )}
        {etat.phase === 'session' && (
          <Link className="svv-btn svv-btn-primary" href="/espace/connexion">{LIB_SE_RECONNECTER}</Link>
        )}
        <Link className="svv-btn svv-btn-outline" href={retour}>{LIB_RETOUR_ESPACE}</Link>
      </div>
    </div>
  );
}
