'use client';

import { useEffect, useState } from 'react';
import {
  META,
  FAMILLES_ORDRE,
  MODES_COMBINAISON,
  estOrientation,
  formaterMalusPct,
  type ColonneMeta,
} from './mappingConfig';

/** Réponse de GET /api/admin/config (LECTURE SEULE). */
interface ReponseConfig {
  present: boolean;
  valeurs?: Record<string, unknown>;
  repli?: { actif: boolean; raisons: string[] };
  erreur?: string;
}

type Etat =
  | { statut: 'chargement' }
  | { statut: 'erreur' }
  | { statut: 'vide' }
  | { statut: 'ok'; data: ReponseConfig };

/** Formate une valeur brute pour l'affichage (sans arrondi — EX-7/EX-20). */
function formaterValeur(colonne: string, valeur: unknown): string {
  if (valeur === null || valeur === undefined) return '—';
  if (colonne === 'couloir_malus_pct' && typeof valeur === 'number') {
    return formaterMalusPct(valeur);
  }
  if (Array.isArray(valeur)) return valeur.join(', ');
  return String(valeur);
}

/** Formate un défaut (issu de META, codé en dur). */
function formaterDefaut(meta: ColonneMeta): string {
  if (meta.colonne === 'couloir_malus_pct' && typeof meta.defaut === 'number') {
    return formaterMalusPct(meta.defaut);
  }
  if (Array.isArray(meta.defaut)) return meta.defaut.join(', ');
  return String(meta.defaut);
}

/** Libellé lisible du statut. */
const LIBELLE_STATUT: Record<ColonneMeta['statut'], string> = {
  VIVE: 'Vive',
  VESTIGIALE: 'Vestigiale · sans effet',
  'DE GARDE': 'De garde',
  MIROIR: 'Miroir · garde-fou',
  technique: 'Technique',
};

export default function PilotagePage() {
  const [etat, setEtat] = useState<Etat>({ statut: 'chargement' });

  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/config');
        const data: ReponseConfig = await res.json();
        if (annule) return;
        if (!res.ok || data.erreur) {
          setEtat({ statut: 'erreur' });
        } else if (!data.present) {
          setEtat({ statut: 'vide' });
        } else {
          setEtat({ statut: 'ok', data });
        }
      } catch {
        if (!annule) setEtat({ statut: 'erreur' });
      }
    })();
    return () => {
      annule = true;
    };
  }, []);

  return (
    <section className="svv-pil">
      <style>{CSS}</style>

      <header className="svv-pil-head">
        <h1 className="svv-pil-title">Pilotage</h1>
        <p className="svv-pil-sub">
          Configuration du moteur de score en vigueur (<code>config_scoring</code>, singleton id=1) —
          <strong> lecture seule</strong>.
        </p>
      </header>

      <p className="svv-pil-banniere" role="note">
        <code>config_scoring</code> = <strong>Couche 1 (dégagement)</strong> seule. La{' '}
        <strong>Couche 2 (photo/paysage)</strong> est en dur dans <code>config.ts</code>, non pilotable ici.
      </p>

      {etat.statut === 'chargement' && (
        <p className="svv-pil-message" aria-live="polite">Chargement de la configuration…</p>
      )}

      {etat.statut === 'erreur' && (
        <p className="svv-pil-message svv-pil-message--alerte" role="alert">
          Configuration indisponible.
        </p>
      )}

      {etat.statut === 'vide' && (
        <p className="svv-pil-message svv-pil-message--alerte" role="alert">
          Profil non initialisé (aucune ligne id=1 en base).
        </p>
      )}

      {etat.statut === 'ok' && (
        <>
          <BadgeRepli repli={etat.data.repli} />
          {FAMILLES_ORDRE.map((famille) => (
            <FamilleBloc key={famille} famille={famille} valeurs={etat.data.valeurs ?? {}} />
          ))}
        </>
      )}
    </section>
  );
}

/** Badge « profil actif » vs « repli sur défaut » + raisons (EX-17). */
function BadgeRepli({ repli }: { repli?: { actif: boolean; raisons: string[] } }) {
  if (!repli) return null;
  if (repli.actif) {
    return (
      <div className="svv-pil-repli svv-pil-repli--actif" role="status">
        <span className="svv-pil-repli-pastille" aria-hidden="true" />
        Profil actif — la configuration en base est réellement utilisée par le moteur.
      </div>
    );
  }
  return (
    <div className="svv-pil-repli svv-pil-repli--repli" role="status">
      <span className="svv-pil-repli-pastille" aria-hidden="true" />
      <div>
        <strong>Repli sur défaut</strong> — le moteur ignore la base et retombe sur le profil par défaut.
        <ul className="svv-pil-repli-raisons">
          {repli.raisons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Bloc d'une famille : ses variables (accordéon/carte). */
function FamilleBloc({ famille, valeurs }: { famille: string; valeurs: Record<string, unknown> }) {
  const metas = META.filter((m) => m.famille === famille);
  if (metas.length === 0) return null;

  const orientations = metas.filter((m) => estOrientation(m.colonne));
  const autres = metas.filter((m) => !estOrientation(m.colonne));
  // Position d'insertion du bloc orientation (à la place de la 1re colonne orientation).
  const premierIndexOrientation = metas.findIndex((m) => estOrientation(m.colonne));
  const orientationEnFin =
    orientations.length > 0 && premierIndexOrientation + orientations.length >= metas.length;

  return (
    <details className="svv-pil-famille" open>
      <summary className="svv-pil-famille-titre">
        {famille} <span className="svv-pil-famille-compte">{metas.length}</span>
      </summary>
      <div className="svv-pil-cartes">
        {autres.map((m) => {
          // Insérer le bloc orientation groupé juste avant la 1re variable qui suivait les orientations.
          const indexDansMetas = metas.indexOf(m);
          const doitInsererOrientationAvant =
            orientations.length > 0 &&
            premierIndexOrientation !== -1 &&
            indexDansMetas === premierIndexOrientation + orientations.length;
          return (
            <div key={m.colonne} style={{ display: 'contents' }}>
              {doitInsererOrientationAvant && (
                <BlocOrientation orientations={orientations} valeurs={valeurs} />
              )}
              <CarteVariable meta={m} valeurs={valeurs} />
            </div>
          );
        })}
        {/* Cas où les orientations sont en fin de famille (aucune variable après). */}
        {orientationEnFin && <BlocOrientation orientations={orientations} valeurs={valeurs} />}
      </div>
    </details>
  );
}

/** Carte d'une variable simple. */
function CarteVariable({ meta, valeurs }: { meta: ColonneMeta; valeurs: Record<string, unknown> }) {
  const vestigiale = meta.statut === 'VESTIGIALE';
  return (
    <article className="svv-pil-carte" data-vestigiale={vestigiale}>
      <div className="svv-pil-carte-tete">
        <span className="svv-pil-libelle">{meta.libelle}</span>
        <span className={`svv-pil-statut svv-pil-statut--${meta.statut.replace(/\s+/g, '-').toLowerCase()}`}>
          {LIBELLE_STATUT[meta.statut]}
        </span>
      </div>
      <code className="svv-pil-colonne">{meta.colonne}</code>
      <div className="svv-pil-carte-corps">
        <div className="svv-pil-champ">
          <span className="svv-pil-champ-label">Valeur actuelle</span>
          <span className="svv-pil-champ-valeur">{formaterValeur(meta.colonne, valeurs[meta.colonne])}</span>
        </div>
        <div className="svv-pil-champ">
          <span className="svv-pil-champ-label">Défaut</span>
          <span className="svv-pil-champ-valeur svv-pil-champ-valeur--defaut">{formaterDefaut(meta)}</span>
        </div>
        <div className="svv-pil-champ">
          <span className="svv-pil-champ-label">Unité</span>
          <span className="svv-pil-champ-valeur">{meta.unite}</span>
        </div>
      </div>
      {meta.colonne === 'mode_combinaison' && (
        <p className="svv-pil-note">Liste fermée : {MODES_COMBINAISON.map((m) => `{${m}}`).join(' ')}</p>
      )}
      {meta.colonne === 'analysis_range_m' && (
        <p className="svv-pil-note">Garde-fou (n’agit pas sur la géométrie).</p>
      )}
    </article>
  );
}

/** Barème d'orientation : les 8 secteurs côte à côte (EX-18). */
function BlocOrientation({
  orientations,
  valeurs,
}: {
  orientations: readonly ColonneMeta[];
  valeurs: Record<string, unknown>;
}) {
  return (
    <article className="svv-pil-carte svv-pil-carte--orientation">
      <div className="svv-pil-carte-tete">
        <span className="svv-pil-libelle">Barème d’orientation (points par secteur)</span>
        <span className="svv-pil-statut svv-pil-statut--vive">Vive</span>
      </div>
      <div className="svv-pil-orientation-grille">
        {orientations.map((m) => {
          const secteur = m.colonne.replace('orientation_', '').toUpperCase();
          return (
            <div key={m.colonne} className="svv-pil-orientation-cell">
              <span className="svv-pil-orientation-secteur">{secteur}</span>
              <span className="svv-pil-orientation-val">{formaterValeur(m.colonne, valeurs[m.colonne])}</span>
              <code className="svv-pil-orientation-col">{m.colonne}</code>
            </div>
          );
        })}
      </div>
      <p className="svv-pil-note">Unité : points (0–10) — secteurs N, NE, E, SE, S, SO, O, NO.</p>
    </article>
  );
}

const CSS = `
.svv-pil{max-width:960px}
.svv-pil-head{margin-bottom:.75rem}
.svv-pil-title{font-size:1.35rem;font-weight:800;color:var(--color-svv-ink);margin:0 0 4px}
.svv-pil-sub{color:var(--color-svv-muted);font-size:.9rem;margin:0}
.svv-pil code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.85em;background:var(--color-svv-field);padding:.05rem .3rem;border-radius:.3rem;color:var(--color-svv-ink)}

.svv-pil-banniere{margin:.75rem 0;padding:.6rem .75rem;border:1px solid var(--color-svv-line);border-left:3px solid var(--color-svv-red);border-radius:.6rem;background:var(--color-svv-field);color:var(--color-svv-gray);font-size:.85rem;line-height:1.4}

.svv-pil-message{padding:1rem;color:var(--color-svv-muted);font-size:.95rem}
.svv-pil-message--alerte{color:var(--color-svv-red);font-weight:600}

.svv-pil-repli{display:flex;gap:.55rem;align-items:flex-start;padding:.7rem .85rem;border-radius:.7rem;margin:.75rem 0;font-size:.88rem;line-height:1.45}
.svv-pil-repli--actif{background:var(--color-svv-green-soft);color:var(--color-svv-green-ink)}
.svv-pil-repli--repli{background:#fdecec;color:var(--color-svv-red-dark);border:1px solid #f3c9c9}
.svv-pil-repli-pastille{flex:0 0 auto;width:10px;height:10px;border-radius:999px;margin-top:.3rem;background:currentColor}
.svv-pil-repli-raisons{margin:.35rem 0 0;padding-left:1.1rem}

.svv-pil-famille{border:1px solid var(--color-svv-line);border-radius:.75rem;margin-bottom:.65rem;background:#fff;overflow:hidden}
.svv-pil-famille-titre{cursor:pointer;list-style:none;padding:.7rem .9rem;font-weight:700;color:var(--color-svv-ink);font-size:.95rem;display:flex;align-items:center;gap:.5rem}
.svv-pil-famille-titre::-webkit-details-marker{display:none}
.svv-pil-famille-titre::before{content:"▸";color:var(--color-svv-muted);transition:transform .15s ease}
.svv-pil-famille[open] .svv-pil-famille-titre::before{transform:rotate(90deg)}
.svv-pil-famille-compte{margin-left:auto;font-weight:600;font-size:.78rem;color:var(--color-svv-muted);background:var(--color-svv-field);border-radius:999px;padding:.1rem .5rem}

.svv-pil-cartes{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:.6rem;padding:.7rem .9rem .9rem}
.svv-pil-carte{border:1px solid var(--color-svv-line);border-radius:.6rem;padding:.6rem .7rem;background:#fff;min-width:0}
.svv-pil-carte[data-vestigiale="true"]{opacity:.6;background:var(--color-svv-field)}
.svv-pil-carte--orientation{grid-column:1/-1}
.svv-pil-carte-tete{display:flex;gap:.4rem;align-items:flex-start;justify-content:space-between}
.svv-pil-libelle{font-weight:700;color:var(--color-svv-ink);font-size:.88rem;line-height:1.3;min-width:0}
.svv-pil-colonne{display:inline-block;margin:.35rem 0 .5rem;word-break:break-all}
.svv-pil-carte-corps{display:flex;flex-wrap:wrap;gap:.5rem .9rem}
.svv-pil-champ{display:flex;flex-direction:column;min-width:0}
.svv-pil-champ-label{font-size:.68rem;font-weight:700;letter-spacing:.02em;text-transform:uppercase;color:var(--color-svv-muted)}
.svv-pil-champ-valeur{font-size:.9rem;color:var(--color-svv-ink);font-weight:600;word-break:break-word}
.svv-pil-champ-valeur--defaut{color:var(--color-svv-muted);font-weight:500}
.svv-pil-note{margin:.5rem 0 0;font-size:.78rem;color:var(--color-svv-muted);line-height:1.35}

.svv-pil-statut{flex:0 0 auto;font-size:.68rem;font-weight:700;border-radius:999px;padding:.12rem .5rem;white-space:nowrap;line-height:1.3}
.svv-pil-statut--vive{background:var(--color-svv-green-soft);color:var(--color-svv-green-ink)}
.svv-pil-statut--vestigiale{background:#eceef1;color:var(--color-svv-muted)}
.svv-pil-statut--de-garde{background:#fff4e0;color:#8a5a00}
.svv-pil-statut--miroir{background:#e6eefb;color:#2c4d84}
.svv-pil-statut--technique{background:var(--color-svv-field);color:var(--color-svv-gray)}

.svv-pil-orientation-grille{display:grid;grid-template-columns:repeat(4,1fr);gap:.4rem;margin-top:.5rem}
.svv-pil-orientation-cell{display:flex;flex-direction:column;align-items:center;gap:.15rem;border:1px solid var(--color-svv-line);border-radius:.5rem;padding:.4rem .25rem;background:var(--color-svv-field);min-width:0}
.svv-pil-orientation-secteur{font-weight:800;font-size:.72rem;color:var(--color-svv-muted)}
.svv-pil-orientation-val{font-weight:700;font-size:1rem;color:var(--color-svv-ink)}
.svv-pil-orientation-col{font-size:.6rem !important;padding:0 !important;background:none !important}

@media (max-width:420px){
  .svv-pil-cartes{grid-template-columns:1fr}
  .svv-pil-orientation-grille{grid-template-columns:repeat(2,1fr)}
}

@media (prefers-reduced-motion:reduce){
  .svv-pil-famille-titre::before{transition:none}
}
`;
