'use client';

import { useEffect, useRef, useState } from 'react';
import {
  colonnesAvantApres, titreApres, MENTION_RECALCULE, TITRE_AVANT, type Colonne, type GesteAvantApres,
} from '../../../../lib/gestion/avantApres';
import { motParLe } from '../../../../lib/gestion/suiviOneShot';

/**
 * ══ 🔴🔴 LOT MODALE-AVANT-APRES-DEUX-COLONNES — LA FENÊTRE AVANT / APRÈS, COMMUNE AUX DEUX PORTES ═════════════════════
 *
 * DEMANDE D'ARNO (11/10/2026) : « La fenêtre “Suivi modifié pour ce mail uniquement” (pastille one shot) et la fenêtre du
 * “i” de l'accolade utilisent la même mise en page : colonne GAUCHE “AVANT — suivi de fond”, colonne DROITE “APRÈS —
 * ce mail uniquement” ou “à partir de ce mail” ; une ligne par bien (adresse, CP ville, lot) ; à droite les biens
 * retirés barrés en rouge pâle, les ajoutés avec un “+” vert ; dessous, sur toute la largeur : “Par …, le …”, la
 * phrase de portée, puis “Fermer”. Sur petit écran, les deux colonnes s'empilent. Lecture seule. »
 *
 * 🔴 LES LIGNES DES BIENS sont lues une fois (`/api/admin/gestion/biens/lignes`, lecture seule) ; en attendant, ou
 * pour une clé inconnue, le libellé enregistré avec le classement s'affiche.
 * 🔴 AUCUNE ACTION : un seul bouton, « Fermer ».
 */
export function ModaleAvantApres({ titre, gestes, suffixeApres, phrase, complements = [], onFermer }: {
  titre: string;
  /** Un ou plusieurs gestes (un mail peut porter une exception ET une sortie du suivi) : une paire de colonnes chacun. */
  gestes: readonly GesteAvantApres[];
  /** « ce mail uniquement » ou « à partir de ce mail ». */
  suffixeApres: string;
  /** La phrase de portée, sous les colonnes. */
  phrase: string;
  /** Des lignes de plus sous « Par … » (« Sur le mail : … », « Portée : … ») — gardées de la fenêtre d'avant. */
  complements?: readonly string[];
  onFermer: () => void;
}) {
  const boite = useRef<HTMLDivElement | null>(null);
  const [lignes, setLignes] = useState<Record<string, string>>({});
  const cles = [...new Set(gestes.flatMap((g) => [g.avant, g.apres])
    .flatMap((c) => (c?.sorte === 'biens' ? c.biens.map((b) => b.cle) : [])))].join(',');

  useEffect(() => {
    const auClavier = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') { e.stopPropagation(); onFermer(); }
    };
    document.addEventListener('keydown', auClavier, true);
    boite.current?.focus();
    return () => document.removeEventListener('keydown', auClavier, true);
  }, [onFermer]);

  useEffect(() => {
    if (cles === '') return undefined;
    let vivant = true;
    void (async () => {
      try {
        const r = await fetch(`/api/admin/gestion/biens/lignes?cles=${encodeURIComponent(cles)}`, { cache: 'no-store' });
        const d = (await r.json()) as { etat?: string; lignes?: Record<string, string> };
        if (vivant && d.etat === 'ok' && d.lignes !== undefined) setLignes(d.lignes);
      } catch { /* les libellés enregistrés restent : la fenêtre reste lisible */ }
    })();
    return () => { vivant = false; };
  }, [cles]);

  return (
    /* ⚠️ LE CLIC S'ARRÊTE ICI : rendue dans une ligne-bouton (pastille), ses clics remonteraient à la ligne. */
    <div className="maa-voile" role="presentation"
      onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onFermer(); }}
      onMouseDown={(e) => e.stopPropagation()}>
      <style>{CSS_MODALE_AVANT_APRES}</style>
      <div className="maa" role="dialog" aria-modal="true" aria-labelledby="maa-titre" tabIndex={-1} ref={boite}>
        <h2 className="maa-titre" id="maa-titre">{titre}</h2>
        {gestes.map((g, i) => {
          const c = colonnesAvantApres({ avant: g.avant, interneEchangeAvant: g.interneEchangeAvant, apres: g.apres });
          return (
            <section key={i} className="maa-geste">
              <div className="maa-colonnes">
                <ColonneVue cote="avant" titre={TITRE_AVANT} mention={g.recalcule ? MENTION_RECALCULE : null}
                  colonne={c.avant} lignes={lignes} />
                <ColonneVue cote="apres" titre={titreApres(suffixeApres)} mention={null} colonne={c.apres} lignes={lignes} />
              </div>
              <p className="maa-qui">{motParLe(g.par ?? '', g.le)}</p>
            </section>
          );
        })}
        {complements.map((t) => <p key={t} className="maa-complement">{t}</p>)}
        <p className="maa-phrase">{phrase}</p>
        <div className="maa-boutons">
          <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={onFermer}>Fermer</button>
        </div>
      </div>
    </div>
  );
}

function ColonneVue({ cote, titre, mention, colonne, lignes }: {
  cote: 'avant' | 'apres'; titre: string; mention: string | null; colonne: Colonne; lignes: Record<string, string>;
}) {
  return (
    <div className={`maa-col maa-col--${cote}`}>
      <h3 className="maa-col-titre">
        {titre}
        {/* 🔴 DISCRÈTE : l'avant n'a pas été photographié au geste, il est recalculé aujourd'hui. */}
        {mention !== null && <span className="maa-recalcule"> {mention}</span>}
      </h3>
      <p className="maa-statut"><span className="maa-mot">Statut :</span> {colonne.statut}</p>
      {colonne.biens.length === 0
        ? <p className="maa-vide">aucun bien</p>
        : (
          <ul className="maa-biens">
            {colonne.biens.map((b) => (
              <li key={`${b.cle}-${b.etat ?? ''}`} className={`maa-bien${b.etat === null ? '' : ` maa-bien--${b.etat}`}`}>
                {/* 🔴 LE « + » ET LE BARRÉ SONT DITS AUSSI EN MOTS (lecteur d'écran, niveaux de gris). */}
                {b.etat === 'ajoute' && <span className="maa-plus" aria-label="ajouté">+</span>}
                <span className="maa-ligne">{lignes[b.cle] ?? b.libelle}</span>
                {b.etat === 'retire' && <span className="maa-sr"> (retiré)</span>}
              </li>
            ))}
          </ul>
        )}
      {colonne.parties.length > 0 && (
        <p className="maa-parties"><span className="maa-mot">Parties :</span> {colonne.parties.join(', ')}</p>
      )}
    </div>
  );
}

/* ⚠️ AUCUN ACCENT GRAVE DANS CE LITTERAL. Couleurs : jetons seulement (Clair et Sombre). */
export const CSS_MODALE_AVANT_APRES = `
.maa-voile{position:fixed;inset:0;z-index:85;display:flex;align-items:center;justify-content:center;padding:16px;
  background:rgba(17,19,24,.45);text-align:left;cursor:default}
.maa{width:min(52rem,100%);max-height:90vh;overflow:auto;display:flex;flex-direction:column;gap:.7rem;padding:16px;
  border-radius:12px;background:var(--color-svv-surface);border:1px solid var(--color-svv-line);
  box-shadow:0 12px 40px rgba(17,19,24,.25);color:var(--color-svv-ink)}
.maa:focus{outline:none}
.maa-titre{margin:0;font-size:1rem;font-weight:700;color:var(--color-svv-ink)}
.maa-geste{display:flex;flex-direction:column;gap:.4rem}
.maa-colonnes{display:grid;grid-template-columns:1fr 1fr;gap:10px;min-width:0}
.maa-col{min-width:0;padding:10px 12px;border-radius:10px;background:var(--color-svv-field)}
.maa-col--apres{box-shadow:inset 3px 0 0 var(--color-svv-red)}
.maa-col-titre{margin:0 0 .4rem;font-size:.72rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;
  color:var(--color-svv-muted)}
.maa-recalcule{font-size:.7rem;font-weight:400;font-style:italic;letter-spacing:0;text-transform:none}
.maa-statut,.maa-parties,.maa-vide{margin:.2rem 0;font-size:.84rem;color:var(--color-svv-ink);overflow-wrap:anywhere}
.maa-vide{font-style:italic;color:var(--color-svv-muted)}
.maa-mot{font-weight:700;color:var(--color-svv-muted)}
.maa-biens{margin:.3rem 0;padding:0;list-style:none;display:flex;flex-direction:column;gap:3px}
.maa-bien{display:flex;align-items:baseline;gap:.35rem;font-size:.84rem;color:var(--color-svv-ink);overflow-wrap:anywhere}
.maa-ligne{min-width:0}
/* Retire : barre, en rouge pale (le texte reste lisible, c'est un etat et non une alerte). */
.maa-bien--retire .maa-ligne{text-decoration:line-through;text-decoration-color:var(--color-svv-red);
  color:color-mix(in srgb, var(--color-svv-red) 55%, var(--color-svv-muted))}
/* Ajoute : un « + » vert devant la ligne. */
.maa-plus{flex:0 0 auto;font-weight:700;color:var(--color-svv-green-ink)}
.maa-bien--ajoute .maa-ligne{font-weight:600}
.maa-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.maa-qui{margin:0;font-size:.8rem;color:var(--color-svv-muted)}
.maa-complement{margin:0;font-size:.78rem;color:var(--color-svv-muted);overflow-wrap:anywhere}
.maa-phrase{margin:0;font-size:.85rem;color:var(--color-svv-ink)}
.maa-boutons{display:flex;justify-content:flex-end;gap:8px}
/* Petit ecran : AVANT, puis APRES. */
@media (max-width:640px){.maa-colonnes{grid-template-columns:1fr}}
`;
