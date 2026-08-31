import type { CSSProperties } from 'react';
import { libelleFamillesManquantes } from '../../../../lib/permis/completudeResume';
import { partitionnerHistorique, type EnvoiHistorique } from '../../../../lib/veille/historiqueEnvois';

/**
 * LOT 13 — RENDUS PURS de l'encart « En cours » (sans état, sans effet → testables en Node via `renderToStaticMarkup`) :
 *   • `MentionFamillesManquantes` (A) — le compteur ROUGE « — dossier incomplet (N familles manquantes) » posé DANS le titre de la
 *     famille « Complétude des pièces » (visible replié). Rien si `manquantes ≤ 0` (jamais « 0 manquante »).
 *   • `HistoriqueEnvois` (B) — l'historique chronologique de NOS envois (demande initiale puis relances), avec repli des plus
 *     anciennes quand la liste s'allonge. L'état de cascade de l'encart n'est PAS ici : cet historique s'AJOUTE, il ne remplace rien.
 * Information portée par le TEXTE (jamais la couleur seule).
 */

const muted: CSSProperties = { fontSize: 11, color: 'var(--color-svv-muted)' };

/** A — mention rouge du titre de famille. `null` si rien ne manque (point 4). Réutilise la formulation UNIQUE `libelleFamillesManquantes`. */
export function MentionFamillesManquantes({ manquantes }: { manquantes: number }) {
  if (manquantes <= 0) return null;
  return <span style={{ fontWeight: 700, color: 'var(--color-svv-red)' }}> — {libelleFamillesManquantes(manquantes)}</span>;
}

/** Date + heure d'un envoi, en heure de Paris (« 04/08/2026 à 21h21 »). PUR (déterministe pour une ISO donnée). */
export function formaterEnvoiLe(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    .formatToParts(d).reduce<Record<string, string>>((a, x) => { a[x.type] = x.value; return a; }, {});
  return `${p.day}/${p.month}/${p.year} à ${p.hour}h${p.minute}`;
}

function LigneEnvoi({ e }: { e: EnvoiHistorique }) {
  return (
    <li style={{ display: 'flex', flexDirection: 'column', gap: '.05rem' }}>
      <span>
        <span style={{ ...muted, fontVariantNumeric: 'tabular-nums' }}>{formaterEnvoiLe(e.le)}</span>{' — '}
        {/* Le MOT porte la nature (demande initiale / grade de relance) ; jamais la couleur seule. */}
        <strong>{e.libelle}</strong>
      </span>
      {e.destinataire && <span style={muted}>à {e.destinataire}</span>}
    </li>
  );
}

/** B — historique de nos envois. `envois` DÉJÀ ordonné (initiale en tête). Vide → une mention neutre (aucun envoi encore parti). */
export function HistoriqueEnvois({ envois }: { envois: EnvoiHistorique[] }) {
  const titreStyle: CSSProperties = { fontSize: 12, fontWeight: 700 };
  if (envois.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '.2rem' }}>
        <span style={titreStyle}>Nos envois à la mairie</span>
        <span style={muted}>Aucun envoi enregistré pour cette demande.</span>
      </div>
    );
  }
  const { visibles, repliees } = partitionnerHistorique(envois);
  const ul: CSSProperties = { margin: 0, paddingLeft: '1.1rem', display: 'flex', flexDirection: 'column', gap: '.25rem', fontSize: 12 };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '.3rem' }}>
      <span style={titreStyle}>Nos envois à la mairie ({envois.length})</span>
      {/* Chronologie : demande initiale (ancre), puis — si la liste s'allonge — les plus anciennes repliées, puis les récentes.
          UN SEUL clic pour dérouler (élément natif <details>), aucun BlocRepliable imbriqué (point 10 🔴). */}
      <ul style={ul}><LigneEnvoi e={visibles[0]} /></ul>
      {repliees.length > 0 && (
        <details>
          <summary style={{ cursor: 'pointer', fontSize: 12 }}>voir les {repliees.length} relance{repliees.length > 1 ? 's' : ''} plus ancienne{repliees.length > 1 ? 's' : ''}</summary>
          <ul style={{ ...ul, marginTop: '.25rem' }}>{repliees.map((e, i) => <LigneEnvoi key={`r${i}`} e={e} />)}</ul>
        </details>
      )}
      <ul style={ul}>{visibles.slice(1).map((e, i) => <LigneEnvoi key={`v${i}`} e={e} />)}</ul>
    </div>
  );
}
