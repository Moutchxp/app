'use client';

import { useState } from 'react';
import { Ligne } from '../gestion/CartesPersonnes';
import {
  formaterEuros, formaterTaux, honorairesMensuels, LIBELLE_BASE, LIBELLE_SOURCE_TAUX, MOT_LOYER_A_SAISIR,
  nombrePourSaisie, verifierConditions, type BaseHonoraires, type LocationAffichee,
} from '../../../../lib/gestion/honorairesGestion';

/**
 * ══ 🔴🔴 LOT L1 — LA LOCATION SUR LA CARTE DU LOCATAIRE : LOYER DE DÉPART, TAUX, HONORAIRES DE GESTION ═════════════
 *
 * Demande d'Arno (17/10/2026) : « saisir le loyer mensuel de départ et le taux de gestion, les ranger sur la location,
 * les afficher sur la carte du locataire ET sur le bien ». Correction d'Arno (17/10/2026) : ce composant ne vit QUE dans
 * les écrans de la tuile Location (fiche du bien, fiche du locataire) — jamais dans la Gestion.
 *
 * 🔴 LOYER ABSENT : on écrit « loyer de départ à saisir », jamais un montant inventé, et aucun honoraire n'est affiché.
 * 🔴 TAUX PRÉ-REMPLI : celui de la conditions en place, sinon le taux proposé (location précédente du lot › taux
 *    WIPPIMMO › réglage agence) — et l'on dit d'où il vient.
 * ⚠️ SANS LA MIGRATION 370, `location` vaut `null`/absent : rien ne s'affiche.
 */
export function LocationCarte({ location, modifiable, onEnregistrer, lecture = false }: {
  location: LocationAffichee | null | undefined;
  modifiable: boolean;
  /** Rend `null` si c'est enregistré, sinon le motif du refus. */
  onEnregistrer: (occupationId: number, conditions: Record<string, unknown>) => Promise<string | null>;
  /** Une location terminée : on la montre, on ne propose pas de la saisir (on peut la corriger par « Modifier »). */
  lecture?: boolean;
}) {
  const [edition, setEdition] = useState(false);
  if (location === null || location === undefined) return null;
  const c = location.conditions;
  const taux = c?.tauxHt ?? location.tauxPropose.taux;
  const origineTaux = c === null
    ? `proposé — ${LIBELLE_SOURCE_TAUX[location.tauxPropose.source]}`
    : c.origine === 'reprise' ? 'repris de WIPPIMMO' : null;
  const h = c === null ? null : honorairesMensuels(c, location.tvaPct);

  if (edition) {
    return (
      <Ligne libelle="Location">
        <FormulaireLocation location={location} onAnnuler={() => setEdition(false)}
          onEnregistrer={async (v) => {
            const motif = await onEnregistrer(location.occupationId, v);
            if (motif === null) setEdition(false);
            return motif;
          }} />
      </Ligne>
    );
  }

  const bouton = modifiable ? (
    <button type="button" className="cp-lien loc-geste" onClick={() => setEdition(true)}
      title={c === null || c.loyerHc === null ? 'Saisir le loyer de départ et le taux de gestion' : 'Corriger (une ligne est ajoutée, l’ancienne reste)'}>
      {c === null || c.loyerHc === null ? (lecture ? 'Compléter' : 'Saisir') : 'Modifier'}
    </button>
  ) : null;

  return (
    <>
      <Ligne libelle="Loyer de départ" apres={bouton}>
        {c === null || c.loyerHc === null
          ? <span className="loc-a-saisir" data-loyer-a-saisir>{MOT_LOYER_A_SAISIR}</span>
          : (
            <span data-loyer-depart>
              {formaterEuros(c.loyerHc)} HC{c.provisions === null ? '' : ` + ${formaterEuros(c.provisions)} de provisions`}
            </span>
          )}
      </Ligne>
      <Ligne libelle="Gestion">
        <span data-taux-gestion>
          {formaterTaux(taux)} HT · {LIBELLE_BASE[c?.base ?? location.baseProposee]}
          {origineTaux !== null && <span className="loc-origine"> ({origineTaux})</span>}
        </span>
        {h !== null && (
          <span className="loc-honoraires" data-honoraires-gestion>
            {' '}→ <strong>{formaterEuros(h.ht)} HT</strong>
            {h.ttc !== null && <> · {formaterEuros(h.ttc)} TTC</>} / mois
          </span>
        )}
      </Ligne>
    </>
  );
}

/** Le petit formulaire de saisie : loyer HC, provisions, taux HT, base. Le serveur revérifie avec la MÊME fonction. */
function FormulaireLocation({ location, onEnregistrer, onAnnuler }: {
  location: LocationAffichee;
  onEnregistrer: (v: Record<string, unknown>) => Promise<string | null>;
  onAnnuler: () => void;
}) {
  const c = location.conditions;
  const [loyer, setLoyer] = useState(nombrePourSaisie(c?.loyerHc ?? null));
  const [provisions, setProvisions] = useState(nombrePourSaisie(c?.provisions ?? null));
  const [taux, setTaux] = useState(nombrePourSaisie(c?.tauxHt ?? location.tauxPropose.taux));
  const [base, setBase] = useState<BaseHonoraires>(c?.base ?? location.baseProposee);
  const [refus, setRefus] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const soumettre = (): void => {
    const v = { loyerHc: loyer, provisions, tauxHt: taux, base };
    const verdict = verifierConditions(v);
    if (!verdict.ok) { setRefus(verdict.motif); return; }
    setEnvoi(true);
    void onEnregistrer(v).then((motif) => { setRefus(motif); setEnvoi(false); });
  };

  return (
    <form className="loc-form" onSubmit={(e) => { e.preventDefault(); soumettre(); }}>
      <label className="loc-champ">
        <span>Loyer de départ HC (€)</span>
        <input className="cp-saisie" inputMode="decimal" value={loyer} onChange={(e) => setLoyer(e.target.value)}
          placeholder="ex. 1 180" autoFocus />
      </label>
      <label className="loc-champ">
        <span>Provisions (€)</span>
        <input className="cp-saisie" inputMode="decimal" value={provisions}
          onChange={(e) => setProvisions(e.target.value)} placeholder="ex. 90" />
      </label>
      <label className="loc-champ">
        <span>Taux de gestion (% HT)</span>
        <input className="cp-saisie" inputMode="decimal" value={taux} onChange={(e) => setTaux(e.target.value)} />
      </label>
      <label className="loc-champ">
        <span>Base</span>
        <select className="cp-saisie" value={base} onChange={(e) => setBase(e.target.value === 'hc' ? 'hc' : 'cc')}>
          <option value="cc">{LIBELLE_BASE.cc}</option>
          <option value="hc">{LIBELLE_BASE.hc}</option>
        </select>
      </label>
      {c === null && (
        <p className="loc-note">Taux pré-rempli : {LIBELLE_SOURCE_TAUX[location.tauxPropose.source]}.</p>
      )}
      {refus !== null && <p className="cp-refus" role="alert">{refus}</p>}
      <div className="loc-boutons">
        <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={onAnnuler}>Annuler</button>
        <button type="submit" className="svv-btn gst-btn" disabled={envoi}>{envoi ? 'Enregistrement…' : 'Enregistrer'}</button>
      </div>
    </form>
  );
}

/* Une seule feuille, montée une fois par l'écran qui rend des cartes (jamais une par carte). */
export const CSS_LOCATION = `
.loc-a-saisir{color:var(--color-svv-amber);font-style:italic;font-weight:600}
.loc-origine{color:var(--color-svv-muted);font-size:.85em}
.loc-honoraires{white-space:nowrap}
.loc-geste{white-space:nowrap}
.loc-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(9rem,1fr));gap:.5rem;align-items:end;width:100%}
.loc-champ{display:flex;flex-direction:column;gap:.2rem;font-size:.85em;color:var(--color-svv-muted)}
.loc-champ .cp-saisie{min-height:2.75rem}
.loc-note{grid-column:1/-1;margin:0;font-size:.85em;color:var(--color-svv-muted)}
.loc-boutons{grid-column:1/-1;display:flex;gap:.5rem;justify-content:flex-end}
.loc-form .cp-refus{grid-column:1/-1}
.ann-carte-location{padding:0 14px 10px}
`;
