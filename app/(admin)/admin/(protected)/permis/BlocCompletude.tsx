'use client';

import { useEffect, useState } from 'react';
import { BlocDemandePieces } from './BlocDemandePieces';

/**
 * PART-2 — DIAGNOSTIC DE COMPLÉTUDE des pièces, en tête de la ligne dépliée d'« Analyse et projection ». Lit le diagnostic MÉMORISÉ
 * (GET /api/admin/permis/completude), recomposé selon les familles attendues vives — AUCUNE relecture de PDF au rendu. Le calcul
 * (coûteux) se fait au geste « Relancer l'analyse » ; ce bloc se remonte ensuite (key liée à vAnalyse) et relit la mémoire.
 *
 * Information portée par le TEXTE (jamais la couleur seule) : « Présent »/« Manquant » + nombre de pièces par famille, désaccords
 * nom/contenu, pièces non classées, et péremption (une pièce ajoutée depuis le calcul). Mobile-first (colonne, pas de tableau large).
 */
type Famille = 'masse' | 'coupe' | 'etage' | 'cerfa';
const LIBELLE: Record<Famille, string> = { masse: 'Plan de masse', coupe: 'Plan de coupe', etage: 'Plans d’étages', cerfa: 'Formulaire Cerfa' };

interface LigneCompletude { famille: Famille; presente: boolean; pieces: string[] }
interface Desaccord { nomFichier: string; parContenu: Famille | null; parNom: Famille | null }
interface Completude {
  diagnostic: { lignes: LigneCompletude[]; desaccords: Desaccord[]; nonClassees: string[] };
  calculeLe: string;
  perime: boolean;
}

const muted: React.CSSProperties = { fontSize: 12, color: 'var(--color-svv-muted)' };

export function BlocCompletude({ dossierId }: { dossierId: number }) {
  const [etat, setEtat] = useState<{ statut: 'chargement' } | { statut: 'erreur' } | { statut: 'ok'; completude: Completude | null }>({ statut: 'chargement' });

  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/permis/completude?dossierId=${dossierId}`, { cache: 'no-store' });
        if (annule) return;
        if (res.ok) setEtat({ statut: 'ok', completude: ((await res.json()) as { completude: Completude | null }).completude });
        else setEtat({ statut: 'erreur' });
      } catch { if (!annule) setEtat({ statut: 'erreur' }); }
    })();
    return () => { annule = true; };
  }, [dossierId]);

  return (
    <div className="svv-card flex flex-col gap-2" style={{ minWidth: 0 }}>
      <h4 style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>Complétude des pièces <span style={{ fontWeight: 400, ...muted }}>— par contenu</span></h4>
      {etat.statut === 'chargement' && <span style={muted} aria-live="polite">Analyse des pièces…</span>}
      {etat.statut === 'erreur' && <span role="alert" style={{ fontSize: 12, color: 'var(--color-svv-red)' }}>Diagnostic indisponible.</span>}
      {etat.statut === 'ok' && etat.completude === null && (
        <span style={muted}>Diagnostic non calculé pour ce permis — cliquez « Relancer l’analyse » ci-dessus pour l’établir.</span>
      )}
      {etat.statut === 'ok' && etat.completude !== null && <Contenu c={etat.completude} dossierId={dossierId} />}
    </div>
  );
}

function Contenu({ c, dossierId }: { c: Completude; dossierId: number }) {
  const manquantes = c.diagnostic.lignes.filter((l) => !l.presente).map((l) => l.famille);
  return (
    <div className="flex flex-col gap-1" style={{ fontSize: 13 }}>
      {c.perime && (
        <p role="note" style={{ margin: 0, fontSize: 12, color: 'var(--color-svv-red)' }}>
          ⚠ Une pièce a été ajoutée depuis ce diagnostic — relancez l’analyse pour l’actualiser.
        </p>
      )}
      <ul style={{ margin: 0, paddingLeft: '1.1rem', display: 'flex', flexDirection: 'column', gap: '.15rem' }}>
        {c.diagnostic.lignes.map((l) => (
          <li key={l.famille}>
            {/* Texte porteur : le MOT « Présent »/« Manquant » dit l'état, la couleur n'est qu'un appui. */}
            <strong>{LIBELLE[l.famille]}</strong> :{' '}
            {l.presente
              ? <span style={{ color: 'var(--color-svv-green-ink)' }}>Présent ({l.pieces.length} pièce{l.pieces.length > 1 ? 's' : ''})</span>
              : <span style={{ color: 'var(--color-svv-red)', fontWeight: 700 }}>Manquant</span>}
            {l.presente && l.pieces.length > 0 && <span style={muted}> — {l.pieces.join(', ')}</span>}
          </li>
        ))}
      </ul>
      {c.diagnostic.desaccords.length > 0 && (
        <div style={{ ...muted, marginTop: '.2rem' }}>
          Désaccord nom / contenu (le contenu l’emporte) :
          <ul style={{ margin: '.1rem 0 0', paddingLeft: '1.1rem' }}>
            {c.diagnostic.desaccords.map((d) => (
              <li key={d.nomFichier}>{d.nomFichier} — nom : {d.parNom ? LIBELLE[d.parNom] : '—'} ; contenu : {d.parContenu ? LIBELLE[d.parContenu] : '—'}</li>
            ))}
          </ul>
        </div>
      )}
      {c.diagnostic.nonClassees.length > 0 && (
        <span style={muted}>{c.diagnostic.nonClassees.length} pièce{c.diagnostic.nonClassees.length > 1 ? 's' : ''} non classée{c.diagnostic.nonClassees.length > 1 ? 's' : ''} (contenu illisible ou nom sans indice) : {c.diagnostic.nonClassees.join(', ')}</span>
      )}
      <span style={{ ...muted, fontSize: 11 }}>Diagnostic établi le {c.calculeLe.slice(0, 10)}.</span>
      {/* PART-3a — demander à la mairie les familles MANQUANTES (envoi manuel, dans le fil). Rien à demander si tout est présent. */}
      {manquantes.length > 0 && <BlocDemandePieces dossierId={dossierId} famillesManquantes={manquantes} />}
    </div>
  );
}
