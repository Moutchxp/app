'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { EnTetePage } from '../_composants/EnTetePage';
import {
  construireUrl,
  fenetreDefaut,
  preset,
  estVideAudit,
  formatNombre,
  maxSerie,
  coordsSerie,
  RAPPEL_AUDIT,
  type Fenetre,
  type Grain,
  type Audit,
} from './affichage';

/**
 * M2 — LOT 7. Écran d'AUDIT DE SÉCURITÉ (agrégé). CONSOMME l'API `GET /api/admin/audit` et l'AFFICHE : courbe
 * succès/échecs de connexion + détection de pics. Client PUR (ne touche jamais la base). Vue STRICTEMENT
 * AGRÉGÉE — aucun suivi individuel, aucune IP. Accès effectif garanti par le garde SERVEUR (`exigerAdministrateur`)
 * de la route ; cet écran ne fait que refléter (un non-administrateur reçoit 403 → état « indisponible »).
 * Mobile-first 375px, focus ROUGE, AUCUN bleu, prefers-reduced-motion.
 */

const CSS_AUDIT = `
.svv-audit :is(button,input,select,a):focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.svv-audit :is(button,input,select){min-height:44px}
.svv-audit svg text{fill:var(--color-svv-muted)}
@media (prefers-reduced-motion: reduce){ .svv-audit *{transition:none!important;animation:none!important} }
`;

type Etat = { statut: 'chargement' } | { statut: 'erreur' } | { statut: 'vide' } | { statut: 'ok'; data: Audit };

const puce = (actif: boolean): CSSProperties => ({
  minHeight: 44,
  padding: '0 12px',
  borderRadius: 10,
  border: `1px solid ${actif ? 'var(--color-svv-red)' : 'var(--color-svv-line)'}`,
  background: actif ? 'var(--color-svv-red)' : '#fff',
  color: actif ? '#fff' : 'var(--color-svv-ink)',
  fontWeight: 700,
  fontSize: '.82rem',
  cursor: 'pointer',
});

export function Message({ titre, texte }: { titre: string; texte: string }) {
  return (
    <div className="svv-card" style={{ textAlign: 'center', padding: '28px 16px' }}>
      <div style={{ fontWeight: 800, color: 'var(--color-svv-ink)', marginBottom: 4 }}>{titre}</div>
      <p style={{ margin: 0, fontSize: '.85rem', color: 'var(--color-svv-muted)' }}>{texte}</p>
    </div>
  );
}

function Kpi({ valeur, libelle, couleur }: { valeur: number; libelle: string; couleur: string }) {
  return (
    <div style={{ flex: '1 1 120px', minWidth: 0 }}>
      <div style={{ fontSize: '1.7rem', fontWeight: 800, color: couleur, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{formatNombre(valeur)}</div>
      <div style={{ fontSize: '.78rem', color: 'var(--color-svv-muted)' }}>{libelle}</div>
    </div>
  );
}

const SVG_W = 320;
const SVG_H = 120;
const SVG_PAD = 6;
const LIGNES: { cle: 'succes' | 'echecs'; couleur: string; libelle: string }[] = [
  { cle: 'succes', couleur: 'var(--color-svv-green)', libelle: 'Réussies' },
  { cle: 'echecs', couleur: 'var(--color-svv-red)', libelle: 'Échouées' },
];

/** Courbe succès (vert) / échecs (rouge) dans le temps — SVG maison, aucune dépendance, aucun bleu. */
export function GraphAudit({ data }: { data: Audit }) {
  const serie = data.serie;
  const max = maxSerie(serie);
  const iw = SVG_W - SVG_PAD * 2;
  const ih = SVG_H - SVG_PAD * 2;
  return (
    <div className="svv-card" style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
      <h2 style={{ margin: 0, fontSize: '.95rem', fontWeight: 800, color: 'var(--color-svv-ink)' }}>Connexions dans le temps</h2>
      {serie.length === 0 ? (
        <span style={{ fontSize: '.8rem', color: 'var(--color-svv-muted)' }}>Aucune connexion sur la période.</span>
      ) : (
        <>
          <svg
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            width="100%"
            role="img"
            aria-label="Connexions réussies et échouées dans le temps (agrégé)"
            style={{ display: 'block', background: 'var(--color-svv-field)', borderRadius: 8, height: 'auto' }}
          >
            {LIGNES.map(({ cle, couleur }) => {
              const pts = coordsSerie(serie, cle, max, iw, ih);
              if (pts.length === 0) return null;
              const poly = pts.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
              return (
                <g key={cle} transform={`translate(${SVG_PAD},${SVG_PAD})`}>
                  <polyline points={poly} fill="none" stroke={couleur} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                  {pts.map((c, i) => (
                    <circle key={i} cx={c.x} cy={c.y} r={1.8} fill={couleur} />
                  ))}
                </g>
              );
            })}
          </svg>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '.8rem' }}>
            {LIGNES.map(({ cle, couleur, libelle }) => (
              <span key={cle} style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-svv-ink)' }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: couleur }} aria-hidden />
                {libelle}
              </span>
            ))}
            <span style={{ marginLeft: 'auto', color: 'var(--color-svv-muted)' }}>max {formatNombre(max)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.68rem', color: 'var(--color-svv-muted)' }}>
            <span>{serie[0].bucket}</span>
            <span>{serie[serie.length - 1].bucket}</span>
          </div>
        </>
      )}
    </div>
  );
}

/** Carte de détection de pics : rouge contour + liste des tranches anormales SI applicable, sinon rassurant. */
export function AlertePics({ data }: { data: Audit }) {
  if (data.pics.length === 0) {
    return (
      <div className="svv-card" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h2 style={{ margin: 0, fontSize: '.95rem', fontWeight: 800, color: 'var(--color-svv-ink)' }}>Détection de pics</h2>
        <p style={{ margin: 0, fontSize: '.82rem', color: 'var(--color-svv-muted)' }}>
          Aucun pic d’échecs sur la période (seuil ≥ {formatNombre(data.seuilPic)} échecs / tranche).
        </p>
      </div>
    );
  }
  return (
    <div className="svv-card" style={{ display: 'flex', flexDirection: 'column', gap: 8, border: '1px solid var(--color-svv-red)' }}>
      <h2 style={{ margin: 0, fontSize: '.95rem', fontWeight: 800, color: 'var(--color-svv-red)' }}>Pic(s) d’échecs détecté(s)</h2>
      <p style={{ margin: 0, fontSize: '.78rem', color: 'var(--color-svv-muted)' }}>
        Tranche(s) au-dessus du seuil de {formatNombre(data.seuilPic)} échecs — signal AGRÉGÉ (aucune identité, aucune IP).
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {data.pics.map((p) => (
          <div key={p.bucket} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.82rem' }}>
            <span style={{ color: 'var(--color-svv-ink)' }}>{p.bucket}</span>
            <strong style={{ color: 'var(--color-svv-red)', fontVariantNumeric: 'tabular-nums' }}>{formatNombre(p.echecs)} échecs</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AuditPage() {
  const [fenetre, setFenetre] = useState<Fenetre>(() => fenetreDefaut());
  const [etat, setEtat] = useState<Etat>({ statut: 'chargement' });

  useEffect(() => {
    let annule = false;
    void (async () => {
      setEtat({ statut: 'chargement' });
      try {
        const res = await fetch(construireUrl(fenetre));
        if (annule) return;
        if (!res.ok) {
          setEtat({ statut: 'erreur' });
          return;
        }
        const data = (await res.json()) as Audit;
        if (annule) return;
        setEtat(estVideAudit(data) ? { statut: 'vide' } : { statut: 'ok', data });
      } catch {
        if (!annule) setEtat({ statut: 'erreur' });
      }
    })();
    return () => {
      annule = true;
    };
  }, [fenetre]);

  return (
    <section className="svv-audit" style={{ maxWidth: 760, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <style>{CSS_AUDIT}</style>
      <EnTetePage titre="Audit de sécurité" intro={RAPPEL_AUDIT} />

      <div className="svv-card" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} role="group" aria-label="Période">
        <button type="button" style={puce(false)} onClick={() => setFenetre(preset(7, fenetre.grain))}>7 jours</button>
        <button type="button" style={puce(false)} onClick={() => setFenetre(preset(30, fenetre.grain))}>30 jours</button>
        <button type="button" style={puce(false)} onClick={() => setFenetre(preset(90, fenetre.grain))}>90 jours</button>
        {(['jour', 'semaine', 'mois'] as Grain[]).map((g) => (
          <button key={g} type="button" aria-pressed={fenetre.grain === g} style={puce(fenetre.grain === g)} onClick={() => setFenetre({ ...fenetre, grain: g })}>
            {g === 'jour' ? 'Par jour' : g === 'semaine' ? 'Par semaine' : 'Par mois'}
          </button>
        ))}
      </div>

      {etat.statut === 'chargement' && <Message titre="Chargement…" texte="Lecture de l’audit de la période." />}
      {etat.statut === 'erreur' && <Message titre="Audit indisponible" texte="Impossible de charger l’audit (réservé au rôle administrateur)." />}
      {etat.statut === 'vide' && (
        <Message titre="Aucune connexion sur cette période" texte="Normal en l’absence d’activité admin — ou si le traitement de maintenance quotidien n’a pas encore consolidé les compteurs." />
      )}
      {etat.statut === 'ok' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 12 }}>
          <div className="svv-card" style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <Kpi valeur={etat.data.totaux.succes} libelle="connexions réussies" couleur="var(--color-svv-green)" />
            <Kpi valeur={etat.data.totaux.echecs} libelle="connexions échouées" couleur="var(--color-svv-red)" />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <GraphAudit data={etat.data} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <AlertePics data={etat.data} />
          </div>
        </div>
      )}
    </section>
  );
}
