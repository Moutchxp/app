'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import type { Verdict } from '../lib/internaute/espace';
import {
  libelleVerdict, MSG_SANS_CERTIFICAT, LIB_DOCUMENTS,
  DOC_NOMINATIF, DOC_ANONYME, DOC_VISUEL, MSG_NOMINATIF_EN_PREPARATION,
} from './presentation';

/**
 * Liste UNIFIÉE de l'espace client : UNE ligne par analyse (la plus récente en haut), le certificat rattaché à sa ligne.
 * Client component car l'accordéon est interactif ; TOUTES les valeurs affichées arrivent DÉJÀ formatées côté serveur
 * (dates, score) → aucun risque de mismatch d'hydratation, aucun accès données ici. `import type` uniquement (server-only
 * de `espace.ts` erased au build).
 *
 * Comportement : une ligne PORTANT un certificat est un bouton (`aria-expanded`) qui déplie ses TROIS documents ; un seul
 * dépliement à la fois (re-clic referme). Une ligne SANS certificat est statique et affiche une mention sobre.
 */
export interface LigneEspace {
  analyseId: number;
  dateLabel: string; // formaté serveur (fr-FR)
  adresse: string; // repli « Adresse non renseignée » déjà appliqué serveur
  scoreLabel: string; // formaté serveur (« NN/100 » ou « — »)
  verdict: Verdict | null;
  certificatId: number | null; // null → analyse sans certificat (ne se déplie pas)
  nominatifPret: boolean; // le PDF nominatif est déposé (sinon mention « en préparation », anonyme/visuel restent servis)
}

/**
 * Fond/texte d'une pastille de verdict — tokens de charte UNIQUEMENT (aucun hex). Déterministe (aucune dépendance temps).
 * Liseré 1px de la PROPRE couleur de texte (`currentColor`) : rend son bord à la pilule sur le fond gris des cartes, où
 * les fonds `*-soft` se noient (green-soft vs field = 1,03:1). Aucune teinte nouvelle ; la forme (coins/hauteur/padding)
 * est inchangée (`border-box` → le trait se dessine à l'intérieur).
 */
function stylePastille(v: Verdict | null): CSSProperties {
  const border = '1px solid currentColor';
  if (v === 'SANS_VIS_A_VIS') return { background: 'var(--color-svv-green-soft)', color: 'var(--color-svv-green-ink)', border };
  if (v === 'VIS_A_VIS') return { background: 'var(--color-svv-red-soft)', color: 'var(--color-svv-red-dark)', border };
  return { background: 'var(--color-svv-field)', color: 'var(--color-svv-muted)', border };
}

/** En-tête commun (fermé, ouvert ou sans certificat) : date à gauche ; score JUSTE À GAUCHE de la pastille, à droite. */
function EnTete({ ligne, chevron }: { ligne: LigneEspace; chevron?: boolean }) {
  return (
    <>
      <div className="flex w-full items-center justify-between gap-2">
        <span className="text-xs font-semibold text-svv-muted">{ligne.dateLabel}</span>
        <span className="flex items-center gap-2">
          <span className="text-xs font-semibold text-svv-muted">{ligne.scoreLabel}</span>
          <span className="svv-pill" style={stylePastille(ligne.verdict)}>{libelleVerdict(ligne.verdict)}</span>
          {chevron !== undefined && (
            <svg className="svv-chevron" data-open={chevron} width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>
      </div>
      <p className="mt-1.5 text-sm text-svv-ink">{ligne.adresse}</p>
    </>
  );
}

/** Un document = lien vers son ÉCRAN D'APERÇU (plus d'ouverture directe du fichier, ni d'invite de téléchargement au
 *  clic) ; le téléchargement est proposé PAR un bouton de cet écran. `Link` = navigation client, retour arrière naturel. */
function DocLien({ href, doc }: { href: string; doc: { label: string; description: string } }) {
  return (
    <Link className="svv-doc" href={href}>
      <span className="svv-doc-label">{doc.label}</span>
      <span className="svv-doc-desc">{doc.description}</span>
    </Link>
  );
}

/** Écran d'aperçu du document. `analyse` n'est qu'un repère d'affichage : au retour, cette analyse est redépliée. */
function urlApercu(certificatId: number, doc: 'nominatif' | 'anonyme' | 'visuel', analyseId: number): string {
  return `/espace/certificats/${certificatId}/apercu?doc=${doc}&analyse=${analyseId}`;
}

export function ListeAnalyses({ lignes, analyseOuverte = null }: { lignes: LigneEspace[]; analyseOuverte?: number | null }) {
  // `analyseOuverte` vient de `?analyse=` (retour depuis un écran d'aperçu) : on rouvre l'analyse d'où l'on venait.
  // Valeur d'AMORÇAGE seulement — l'internaute reste ensuite libre de plier/déplier ce qu'il veut.
  const [ouvert, setOuvert] = useState<number | null>(analyseOuverte);

  return (
    <ul className="mt-3 flex flex-col gap-3">
      {lignes.map((ligne) => {
        const certificatId = ligne.certificatId;
        const estOuvert = ouvert === ligne.analyseId;
        const panelId = `doc-${ligne.analyseId}`;

        // ── Ligne SANS certificat : statique, ne se déplie pas ──
        if (certificatId === null) {
          return (
            <li key={ligne.analyseId} className="svv-card svv-card-analyse">
              <EnTete ligne={ligne} />
              <p className="mt-2 text-xs text-svv-muted">{MSG_SANS_CERTIFICAT}</p>
            </li>
          );
        }

        // ── Ligne PORTANT un certificat : dépliable ──
        return (
          <li key={ligne.analyseId} className="svv-card svv-card-analyse">
            <button
              type="button"
              className="svv-row-btn"
              aria-expanded={estOuvert}
              aria-controls={panelId}
              onClick={() => setOuvert(estOuvert ? null : ligne.analyseId)}
            >
              <EnTete ligne={ligne} chevron={estOuvert} />
            </button>

            <div id={panelId} role="region" aria-label={LIB_DOCUMENTS} hidden={!estOuvert} className="mt-3 flex flex-col gap-2">
              <span className="svv-label">{LIB_DOCUMENTS}</span>
              {ligne.nominatifPret ? (
                <DocLien href={urlApercu(certificatId, 'nominatif', ligne.analyseId)} doc={DOC_NOMINATIF} />
              ) : (
                <p className="text-xs text-svv-muted">{MSG_NOMINATIF_EN_PREPARATION}</p>
              )}
              <DocLien href={urlApercu(certificatId, 'anonyme', ligne.analyseId)} doc={DOC_ANONYME} />
              <DocLien href={urlApercu(certificatId, 'visuel', ligne.analyseId)} doc={DOC_VISUEL} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
