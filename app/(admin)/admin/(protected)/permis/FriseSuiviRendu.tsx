import type { CSSProperties, ReactNode } from 'react';
import { libelleFamillesManquantes } from '../../../../lib/permis/completudeResume';
import { partitionnerFrise, type EvenementFrise } from '../../../../lib/veille/friseSuivi';

/**
 * LOT 13/15 — RENDUS PURS de l'encart « En cours » (sans état, sans effet → testables en Node via `renderToStaticMarkup`) :
 *   • `MentionFamillesManquantes` (LOT 13-A) — compteur ROUGE « — dossier incomplet (N familles manquantes) » posé DANS le titre de la
 *     famille « Complétude des pièces » (visible replié). Rien si `manquantes ≤ 0`.
 *   • `FriseSuivi` (LOT 15) — la FRISE unique de la famille « Suivi et actions » : nos envois ET l'état de cascade fondus en UNE liste
 *     chronologique, à la MÊME forme (date/heure en gris — nature en gras — précision dessous). Les ÉCHÉANCES à venir (butoir, prochaine
 *     étape) sont VISUELLEMENT DISTINCTES (grisées, préfixées « À venir ») et jamais repliées : on ne fait jamais passer une échéance
 *     pour un fait accompli (point 3). Repli des seuls FAITS anciens (point 6), un seul clic (élément natif <details>).
 * Information portée par le TEXTE (jamais la couleur seule).
 */

const muted: CSSProperties = { fontSize: 11, color: 'var(--color-svv-muted)' };

/** LOT 13-A — mention rouge du titre de famille. `null` si rien ne manque. Réutilise la formulation UNIQUE `libelleFamillesManquantes`. */
export function MentionFamillesManquantes({ manquantes }: { manquantes: number }) {
  if (manquantes <= 0) return null;
  return <span style={{ fontWeight: 700, color: 'var(--color-svv-red)' }}> — {libelleFamillesManquantes(manquantes)}</span>;
}

/** Date + heure d'un fait, en heure de Paris (« 04/08/2026 à 21h21 »). PUR (déterministe pour une ISO donnée). */
export function formaterEnvoiLe(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    .formatToParts(d).reduce<Record<string, string>>((a, x) => { a[x.type] = x.value; return a; }, {});
  return `${p.day}/${p.month}/${p.year} à ${p.hour}h${p.minute}`;
}

/** Date SEULE d'une échéance à venir (« 07/09/2026 ») — une échéance n'a pas d'heure de survenue. PUR. */
export function formaterEcheanceLe(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric' })
    .formatToParts(d).reduce<Record<string, string>>((a, x) => { a[x.type] = x.value; return a; }, {});
  return `${p.day}/${p.month}/${p.year}`;
}

function LigneFrise({ e }: { e: EvenementFrise }) {
  const avenir = e.quand === 'avenir';
  // LOT 16 (point 2) — BASCULE DE PROCESS : liseré rouge DISCRET (une bordure fine à gauche, jamais un bandeau plein ni un fond). Rouge de la charte.
  const lisereBascule: CSSProperties = e.bascule ? { borderLeft: '2px solid var(--color-svv-red)', paddingLeft: '.5rem', marginLeft: '-.15rem' } : {};
  return (
    <li style={{ display: 'flex', flexDirection: 'column', gap: '.05rem', opacity: avenir ? 0.75 : 1, ...lisereBascule }}>
      <span>
        <span style={{ ...muted, fontVariantNumeric: 'tabular-nums' }}>{avenir ? formaterEcheanceLe(e.le) : formaterEnvoiLe(e.le)}</span>{' — '}
        {/* Le MOT porte la nature ; « À venir » écrit distingue l'échéance du fait (jamais la couleur/opacité seule). */}
        {avenir && <span style={{ ...muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em' }}>à venir · </span>}
        <strong>{e.libelle}</strong>
      </span>
      {e.detail && <span style={muted}>{e.detail}</span>}
    </li>
  );
}

/**
 * LOT 15 — la frise. `evenements` DÉJÀ ordonné (construireFriseSuivi). `actionAvenir` = le geste attaché à la prochaine étape (brouillon
 * de relance/annonce à préparer), rendu SOUS la frise. Vide et sans action → mention neutre (aucun événement).
 */
export function FriseSuivi({ evenements, actionAvenir = null }: { evenements: EvenementFrise[]; actionAvenir?: ReactNode }) {
  const titre: CSSProperties = { fontSize: 12, fontWeight: 700 };
  const ul: CSSProperties = { margin: 0, paddingLeft: '1.1rem', display: 'flex', flexDirection: 'column', gap: '.25rem', fontSize: 12 };
  if (evenements.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '.2rem' }}>
        <span style={titre}>Suivi et actions de la demande</span>
        <span style={muted}>Aucun événement enregistré pour cette demande.</span>
        {actionAvenir}
      </div>
    );
  }
  const { passeVisible, passeReplie, avenir } = partitionnerFrise(evenements);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '.3rem' }}>
      <span style={titre}>Suivi et actions de la demande</span>
      {/* Chronologie : le 1er fait (ancre), puis — si la liste s'allonge — les faits anciens repliés (un seul clic, <details> natif,
          aucun BlocRepliable imbriqué), puis les faits récents, enfin les ÉCHÉANCES à venir (toujours visibles) et leur geste. */}
      {passeVisible[0] && <ul style={ul}><LigneFrise e={passeVisible[0]} /></ul>}
      {passeReplie.length > 0 && (
        <details>
          <summary style={{ cursor: 'pointer', fontSize: 12 }}>voir les {passeReplie.length} entrée{passeReplie.length > 1 ? 's' : ''} plus ancienne{passeReplie.length > 1 ? 's' : ''}</summary>
          <ul style={{ ...ul, marginTop: '.25rem' }}>{passeReplie.map((e, i) => <LigneFrise key={`r${i}`} e={e} />)}</ul>
        </details>
      )}
      {passeVisible.length > 1 && <ul style={ul}>{passeVisible.slice(1).map((e, i) => <LigneFrise key={`v${i}`} e={e} />)}</ul>}
      {avenir.length > 0 && <ul style={ul}>{avenir.map((e, i) => <LigneFrise key={`a${i}`} e={e} />)}</ul>}
      {actionAvenir}
    </div>
  );
}
