'use client';

import type { Entretien } from '../../../../lib/location/entretien';

/**
 * ══ 🔴🔴 TUILE LOCATION — « ENTRETIEN À PRÉVOIR » (formulaire du bien ET fiche commune), Arno, 18/10/2026 ════════════════
 *
 * « Oui / Non (même style). Si Oui, en dessous : “Chaudière” (case) + “Date anniversaire d'entretien” (facultative) ;
 * “Ramonage” (case) + date ; “+ Autre entretien” : nom libre + date, autant de fois que nécessaire, chacun supprimable.
 * Repasser à Non vide le tout. » La règle (et la vérification) est celle du module pur `entretien.ts`, la même que le serveur.
 */
export interface SaisieEntretien {
  aPrevoir: boolean | null;
  chaudiere: { coche: boolean; date: string };
  ramonage: { coche: boolean; date: string };
  autres: { cle: number; nom: string; date: string }[];
}

export const ENTRETIEN_VIDE: SaisieEntretien = { aPrevoir: null, chaudiere: { coche: false, date: '' }, ramonage: { coche: false, date: '' }, autres: [] };

/** Les entretiens lus → la saisie. PUR. */
export function versSaisieEntretien(aPrevoir: boolean | null | undefined, l: readonly Entretien[] | undefined): SaisieEntretien {
  const liste = l ?? [];
  const de = (s: 'chaudiere' | 'ramonage') => { const e = liste.find((x) => x.sorte === s); return { coche: e !== undefined, date: e?.dateAnniversaire ?? '' }; };
  return {
    aPrevoir: aPrevoir ?? null, chaudiere: de('chaudiere'), ramonage: de('ramonage'),
    autres: liste.filter((x) => x.sorte === 'autre').map((x, i) => ({ cle: i + 1, nom: x.nom ?? '', date: x.dateAnniversaire ?? '' })),
  };
}

/** La saisie → ce qu'on envoie au serveur (Non ⇒ aucune ligne). PUR. */
export function versEnvoiEntretien(s: SaisieEntretien): { entretienAPrevoir: boolean | null; entretiens: { sorte: string; nom?: string; dateAnniversaire: string }[] } {
  if (s.aPrevoir !== true) return { entretienAPrevoir: s.aPrevoir, entretiens: [] };
  return {
    entretienAPrevoir: true,
    entretiens: [
      ...(s.chaudiere.coche ? [{ sorte: 'chaudiere', dateAnniversaire: s.chaudiere.date }] : []),
      ...(s.ramonage.coche ? [{ sorte: 'ramonage', dateAnniversaire: s.ramonage.date }] : []),
      ...s.autres.map((a) => ({ sorte: 'autre', nom: a.nom, dateAnniversaire: a.date })),
    ],
  };
}

/**
 * `obligatoire` (Arno, 18/10/2026) : à la CRÉATION d'un logement / local, le titre porte « * » et `manques` reçoit les
 * messages (Oui / Non sous les boutons, la liste sous les entretiens, le nom sous chaque « Autre »). La fiche commune ne
 * passe rien : elle n'est jamais bloquée.
 */
export function BlocEntretien({ valeur, onChange, obligatoire = false, manques }: {
  valeur: SaisieEntretien; onChange: (v: SaisieEntretien) => void; obligatoire?: boolean;
  manques?: { reponse?: React.ReactNode; liste?: React.ReactNode; autre?: (k: number) => React.ReactNode };
}) {
  const s = valeur;
  const ligne = (k: 'chaudiere' | 'ramonage', mot: string) => (
    <div className="loc-entretien-ligne" data-entretien={k}>
      <label className="loc-coche"><input type="checkbox" checked={s[k].coche}
        onChange={(e) => onChange({ ...s, [k]: { coche: e.target.checked, date: e.target.checked ? s[k].date : '' } })} /> {mot}</label>
      <label className="loc-champ">Date anniversaire d’entretien (facultative)
        <input type="date" value={s[k].date} disabled={!s[k].coche} onChange={(e) => onChange({ ...s, [k]: { ...s[k], date: e.target.value } })} /></label>
    </div>
  );
  return (
    <div className="loc-sous-section" data-entretien-bloc>
      <h4>Entretien à prévoir{obligatoire && <> <span className="loc-oblig">*</span></>}</h4>
      <div className="loc-pilules" role="group" aria-label="Entretien à prévoir">
        {(['oui', 'non'] as const).map((v) => {
          const actif = s.aPrevoir === (v === 'oui');
          return (
            <button key={v} type="button" aria-pressed={actif} data-entretien-reponse={v}
              onClick={() => onChange(actif ? { ...ENTRETIEN_VIDE } : v === 'oui' ? { ...s, aPrevoir: true } : { ...ENTRETIEN_VIDE, aPrevoir: false })}>
              {v === 'oui' ? 'Oui' : 'Non'}</button>
          );
        })}
      </div>
      {manques?.reponse}
      {s.aPrevoir === true && (
        <div className="loc-entretiens">
          {ligne('chaudiere', 'Chaudière')}
          {ligne('ramonage', 'Ramonage')}
          {s.autres.map((a, i) => (
            <div key={a.cle} className="loc-entretien-ligne" data-entretien="autre">
              <label className="loc-champ"><span>Autre entretien <span className="loc-oblig">*</span></span>
                <input value={a.nom} maxLength={120} placeholder="ex. Climatisation, VMC, adoucisseur"
                  onChange={(e) => onChange({ ...s, autres: s.autres.map((x, j) => (j === i ? { ...x, nom: e.target.value } : x)) })} /></label>
              <label className="loc-champ">Date anniversaire (facultative)
                <input type="date" value={a.date} onChange={(e) => onChange({ ...s, autres: s.autres.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)) })} /></label>
              <button type="button" className="svv-btn svv-btn-outline gst-btn loc-entretien-suppr" aria-label={`Supprimer l’entretien ${a.nom || i + 1}`}
                onClick={() => onChange({ ...s, autres: s.autres.filter((_, j) => j !== i) })}>Supprimer</button>
              {manques?.autre?.(i)}
            </div>
          ))}
          <div className="loc-pilules">
            <button type="button" onClick={() => onChange({ ...s, autres: [...s.autres, { cle: Date.now() + s.autres.length, nom: '', date: '' }] })} data-ajouter-entretien>+ Autre entretien</button>
          </div>
          {manques?.liste}
        </div>
      )}
    </div>
  );
}

export const CSS_ENTRETIEN = `
.loc-entretiens{display:flex;flex-direction:column;gap:14px}
.loc-entretien-ligne{display:grid;grid-template-columns:minmax(0,1fr);gap:10px 18px;align-items:end;border:1px solid var(--color-svv-line);border-radius:16px;padding:12px 14px;background:var(--color-svv-field)}
@media (min-width:760px){ .loc-entretien-ligne{grid-template-columns:minmax(10rem,14rem) minmax(0,1fr)} .loc-entretien-ligne[data-entretien="autre"]{grid-template-columns:minmax(0,1fr) minmax(0,1fr) auto} }
.loc-coche{display:flex;align-items:center;gap:10px;min-height:48px;font-weight:700;color:var(--color-svv-ink);cursor:pointer}
.loc-coche input{width:22px;height:22px;accent-color:var(--color-svv-red)}
.loc-entretien-ligne input:disabled{background:var(--color-svv-field);color:var(--color-svv-muted);cursor:not-allowed}
.loc-entretien-suppr{width:auto;min-height:48px}
`;
