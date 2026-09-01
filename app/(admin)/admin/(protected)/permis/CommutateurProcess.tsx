'use client';

import { useState, type CSSProperties } from 'react';
import { PROCESS_META, PROCESS_ORDRE, type Process } from '../../../../lib/sitadel/process';

/**
 * D2 — COMMUTATEUR de process en tête de l'onglet Demandes. Choix entre les DEUX process (un actif à la fois) qui scope les
 * onglets en aval, + un TROISIÈME groupe (hors process : communes sans adresse, vestige courrier) JAMAIS masqué en silence.
 * Mobile-first (cibles ≥ 44px, repli en colonne), pas d'icône (glyphes unicode aria-hidden), la couleur ne porte JAMAIS l'info
 * seule (texte « actif » + ●/○ + aria-pressed). Pas de dark mode.
 */
export interface CompteursProcess {
  email: { communes: number; demandesEnCours: number };
  formulaire: { communes: number; demandesEnCours: number };
  hors: { communesSansAdresse: number; courrierDemandes: number; communes: { codeInsee: string; nom: string | null }[]; courrier: { reference: string; communeNom: string | null }[] };
}

/**
 * LOT 36 — style de la mention « N demande(s) en cours » d'UN bouton : ROUGE + GRAS dès que le compteur est strictement > 0 (attire
 * l'œil), sinon l'apparence muette par défaut. La couleur N'EST PAS le seul signal (gras aussi → daltonisme). Rouge = la valeur
 * d'alerte DÉJÀ employée (« familles manquantes » : var(--color-svv-red) + fontWeight 700), aucun rouge de plus. Par bouton, indépendant.
 */
export function styleMentionEnCours(demandesEnCours: number): CSSProperties | undefined {
  return demandesEnCours > 0 ? { color: 'var(--color-svv-red)', fontWeight: 700 } : undefined;
}

export function CommutateurProcess({ actif, onChoisir, compteurs }: { actif: Process; onChoisir: (p: Process) => void; compteurs: CompteursProcess | null }) {
  const [horsOuvert, setHorsOuvert] = useState(false);
  const hors = compteurs?.hors;
  const nHors = (hors?.communesSansAdresse ?? 0) + (hors?.courrierDemandes ?? 0);

  return (
    <div className="svv-card" style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
      <div role="group" aria-label="Choix du process de demande" style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem' }}>
        {PROCESS_ORDRE.map((p) => {
          const c = compteurs ? compteurs[p] : null;
          const estActif = p === actif;
          return (
            <button key={p} type="button" aria-pressed={estActif} onClick={() => onChoisir(p)}
              className="svv-btn"
              style={{
                flex: '1 1 12rem', minHeight: 44, textAlign: 'left', padding: '.5rem .7rem', borderRadius: '.6rem',
                border: `2px solid ${estActif ? 'var(--color-svv-red)' : 'var(--color-svv-line)'}`,
                background: estActif ? 'var(--color-svv-red-soft, #fdecec)' : 'var(--color-svv-field)',
                color: 'var(--color-svv-ink)', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '.15rem',
              }}>
              <span style={{ fontWeight: 800, fontSize: '.9rem' }}>
                <span aria-hidden="true">{estActif ? '● ' : '○ '}</span>{PROCESS_META[p].titre}{estActif ? ' — actif' : ''}
              </span>
              <span style={{ fontSize: '.76rem', color: 'var(--color-svv-muted)' }}>
                {c ? (
                  <>
                    {c.communes} commune(s) ·{' '}
                    {/* LOT 36 — seule cette mention rougit (gras) quand des demandes sont en cours ; « commune(s) » et le titre restent inchangés. */}
                    <span style={styleMentionEnCours(c.demandesEnCours)}>{c.demandesEnCours} demande(s) en cours</span>
                  </>
                ) : '…'}
              </span>
            </button>
          );
        })}
      </div>

      {/* 3e groupe — JAMAIS masqué : ligne persistante + détail dépliable. */}
      <div style={{ fontSize: '.78rem' }}>
        <button type="button" aria-expanded={horsOuvert} onClick={() => setHorsOuvert((v) => !v)}
          className="svv-btn svv-btn-outline" style={{ minHeight: 34, padding: '.25rem .6rem', fontSize: '.76rem' }}>
          <span aria-hidden="true">{horsOuvert ? '▾ ' : '▸ '}</span>
          Hors process : {hors?.communesSansAdresse ?? 0} commune(s) sans adresse ni téléservice
          {hors && hors.courrierDemandes > 0 ? ` · ${hors.courrierDemandes} demande(s) « courrier » (vestige)` : ''}
        </button>
        {horsOuvert && hors && (
          <div className="svv-card" style={{ marginTop: '.4rem', background: 'var(--color-svv-field)', fontSize: '.76rem' }}>
            <p style={{ margin: '0 0 .3rem', color: 'var(--color-svv-muted)' }}>
              Ces communes ne peuvent alimenter aucun des deux process (aucune adresse e-mail ni téléservice connu). Le canal
              « courrier » est un vestige : la ligne historique reste lisible, mais aucune nouvelle demande n’y naît.
            </p>
            {hors.communes.length > 0 && (
              <div style={{ marginBottom: '.3rem' }}>
                <strong>Communes sans adresse ({hors.communes.length})</strong>
                <ul style={{ margin: '.15rem 0 0 1rem' }}>
                  {hors.communes.map((cm) => <li key={cm.codeInsee}>{cm.nom ?? '—'} <span style={{ color: 'var(--color-svv-muted)' }}>({cm.codeInsee})</span></li>)}
                </ul>
              </div>
            )}
            {hors.courrier.length > 0 && (
              <div>
                <strong>Demandes « courrier » (vestige, {hors.courrier.length})</strong>
                <ul style={{ margin: '.15rem 0 0 1rem' }}>
                  {hors.courrier.map((d) => <li key={d.reference}>{d.reference}{d.communeNom ? ` — ${d.communeNom}` : ''}</li>)}
                </ul>
              </div>
            )}
            {nHors === 0 && <p style={{ margin: 0 }}>Aucune commune ni demande hors process.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
