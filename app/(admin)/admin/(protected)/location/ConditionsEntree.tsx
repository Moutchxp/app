'use client';

import type { ReactNode } from 'react';
import { LIBELLE_OUI_NON, OUI_NON, Pilules, versOuiNon } from './Pilules';
import {
  ASSURANCES, COMPTES, DEPOTS, formaterCentimes, JOURS_PRELEVEMENT, LIBELLE_ASSURANCE, LIBELLE_COMPTE, LIBELLE_DEPOT, LIBELLE_JOUR,
  LIBELLE_REGLEMENT, LIBELLE_SOMME, REGLEMENTS, SOMMES, totalCentimes, type SaisieConditions,
} from '../../../../lib/location/conditionsEntree';

/**
 * ══ 🔴🔴 TUILE LOCATION — LE BLOC « CONDITIONS D'ENTRÉE » (Arno, 20/10/2026) ═══════════════════════════════════════════════
 *
 * La fiche papier « Nouveau dossier » de l'agence, en ENCADRÉS comme l'écran « Nouveau bien » (mêmes pilules, mêmes
 * tailles, mêmes états : rouge + « ✓ », jamais la couleur seule). UN SEUL composant : le bloc 3 de « Nouveau locataire »
 * ET « Modifier » de l'encart de la fiche du locataire. La règle est `conditionsEntree.ts` (la même que le serveur).
 * Le point 4, « Entretien à prévoir », est la donnée DU BIEN : l'écran hôte le passe (`entretien`), c'est `BlocEntretien`.
 */
export function BlocConditionsEntree({ valeur, onChange, manque, entretien }: {
  valeur: SaisieConditions;
  onChange: (v: SaisieConditions) => void;
  /** Le message « ce qui manque » d'un champ (vide tant qu'on n'a pas tenté d'enregistrer). */
  manque: (cle: string) => ReactNode;
  /** Le point 4 (entretien à prévoir du bien) ; absent, il n'est pas montré (fiche du locataire, parking, cave). */
  entretien?: ReactNode;
}) {
  const s = valeur;
  const maj = (p: Partial<SaisieConditions>): void => onChange({ ...s, ...p });
  const total = totalCentimes(s.sommes);
  const illisible = SOMMES.some((k) => s.sommes[k].trim() !== '') && total === null;
  return (
    <div className="loc-cond" data-conditions-entree>
      <div className="loc-cond-bloc" data-cond="depot">
        <h4>Dépôt de garantie <span className="loc-oblig">*</span></h4>
        <Pilules etiquette="Dépôt de garantie" options={DEPOTS} libelle={LIBELLE_DEPOT} valeur={s.depot} onChoix={(v) => maj({ depot: v })} />
        {manque('depot')}
      </div>

      <div className="loc-cond-bloc" data-cond="prelevement">
        <h4>Prélèvement <span className="loc-oblig">*</span></h4>
        <Pilules etiquette="Prélèvement" options={OUI_NON} libelle={LIBELLE_OUI_NON} valeur={versOuiNon(s.prelevement)}
          onChoix={(v) => maj({ prelevement: v === null ? null : v === 'oui', jour: v === 'oui' ? s.jour : null })} />
        {s.prelevement === true && (
          <div className="loc-cond-sous" data-cond-jour>
            <span className="loc-cond-mot">Jour du prélèvement <span className="loc-oblig">*</span></span>
            <Pilules etiquette="Jour du prélèvement" options={JOURS_PRELEVEMENT} libelle={LIBELLE_JOUR} valeur={s.jour} onChoix={(v) => maj({ jour: v })} />
          </div>
        )}
        {manque('prelevement')}{manque('jour')}
      </div>

      <div className="loc-cond-bloc" data-cond="garanties">
        <h4>Garanties <span className="loc-oblig">*</span></h4>
        <div className="loc-cond-sous">
          <span className="loc-cond-mot">Garant personne physique</span>
          <Pilules etiquette="Garant personne physique" options={OUI_NON} libelle={LIBELLE_OUI_NON} valeur={versOuiNon(s.garant)}
            onChoix={(v) => maj({ garant: v === null ? null : v === 'oui' })} />
        </div>
        {manque('garant')}
        <div className="loc-cond-sous">
          <span className="loc-cond-mot">Assurance loyers impayés</span>
          <Pilules etiquette="Assurance loyers impayés" options={ASSURANCES} libelle={LIBELLE_ASSURANCE} valeur={s.assurance}
            onChoix={(v) => maj({ assurance: v, assurancePrecision: v === 'gli' || v === 'autre' ? s.assurancePrecision : '' })} />
        </div>
        {(s.assurance === 'gli' || s.assurance === 'autre') && (
          <label className="loc-champ" data-cond-precision="assurance">
            <span>{s.assurance === 'gli' ? 'GLI : laquelle ?' : 'Autre assurance : laquelle ?'} <span className="loc-oblig">*</span></span>
            <input value={s.assurancePrecision} maxLength={120} placeholder={s.assurance === 'gli' ? 'ex. nom de l’assureur ou du contrat' : 'ex. caution bancaire'}
              onChange={(e) => maj({ assurancePrecision: e.target.value })} /></label>
        )}
        {manque('assurance')}{manque('assurancePrecision')}
      </div>

      {entretien !== undefined && <div className="loc-cond-bloc" data-cond="entretien">{entretien}</div>}

      <div className="loc-cond-bloc" data-cond="honoraires">
        <h4>Honoraires <span className="loc-oblig">*</span></h4>
        <div className="loc-cond-sous">
          <span className="loc-cond-mot">Locataire</span>
          <Pilules etiquette="Honoraires du locataire" options={COMPTES} libelle={LIBELLE_COMPTE} valeur={s.honorairesLocataire}
            onChoix={(v) => maj({ honorairesLocataire: v })} />
        </div>
        {manque('honorairesLocataire')}
        <div className="loc-cond-sous">
          <span className="loc-cond-mot">Propriétaire</span>
          <Pilules etiquette="Honoraires du propriétaire" options={COMPTES} libelle={LIBELLE_COMPTE} valeur={s.honorairesProprietaire}
            onChoix={(v) => maj({ honorairesProprietaire: v })} />
        </div>
        {manque('honorairesProprietaire')}
      </div>

      <div className="loc-cond-bloc" data-cond="sommes">
        <h4>Sommes dues à l’entrée</h4>
        <div className="loc-grille">
          {SOMMES.map((k) => (
            <label key={k} className="loc-champ" data-somme={k}>{LIBELLE_SOMME[k]} (€)
              <input value={s.sommes[k]} inputMode="decimal" placeholder="ex. 1 180,50"
                onChange={(e) => maj({ sommes: { ...s.sommes, [k]: e.target.value } })} />
              {manque(`somme-${k}`)}</label>
          ))}
        </div>
        <p className="loc-cond-total" aria-live="polite" data-total>
          <span>Total</span>
          <strong>{total === null ? (illisible ? 'montant illisible' : '—') : formaterCentimes(total)}</strong>
        </p>
      </div>

      <div className="loc-cond-bloc" data-cond="reglement">
        <h4>Mode de règlement <span className="loc-oblig">*</span></h4>
        <Pilules etiquette="Mode de règlement" options={REGLEMENTS} libelle={LIBELLE_REGLEMENT} valeur={s.reglement}
          onChoix={(v) => maj({ reglement: v, reglementPrecision: v === 'autre' ? s.reglementPrecision : '' })} />
        {s.reglement === 'autre' && (
          <label className="loc-champ" data-cond-precision="reglement">
            <span>Autre mode de règlement : lequel ? <span className="loc-oblig">*</span></span>
            <input value={s.reglementPrecision} maxLength={120} placeholder="ex. espèces, mandat cash"
              onChange={(e) => maj({ reglementPrecision: e.target.value })} /></label>
        )}
        {manque('reglement')}{manque('reglementPrecision')}
      </div>

      <div className="loc-cond-bloc loc-cond-bloc--large" data-cond="commentaire">
        <h4>Commentaires</h4>
        <label className="loc-champ">Commentaire libre (facultatif)
          <textarea value={s.commentaire} maxLength={4000} onChange={(e) => maj({ commentaire: e.target.value })} /></label>
      </div>
    </div>
  );
}

/** Les encadrés : les jetons du thème seulement, le même dessin que les blocs DPE / PNO de « Nouveau bien ». */
export const CSS_CONDITIONS = `
.loc-cond{display:grid;grid-template-columns:minmax(0,1fr);gap:18px}
@media (min-width:900px){ .loc-cond{grid-template-columns:repeat(2,minmax(0,1fr))} .loc-cond-bloc--large,.loc-cond-bloc[data-cond="sommes"],.loc-cond-bloc[data-cond="entretien"]{grid-column:1 / -1} }
.loc-cond-bloc{display:flex;flex-direction:column;gap:12px;min-width:0;border:2px solid var(--color-svv-line);border-radius:20px;padding:18px 20px;background:var(--color-svv-field);box-sizing:border-box}
@media (max-width:480px){ .loc-cond-bloc{padding:16px 12px} }
.loc-cond-bloc > h4{margin:0;font-size:1.08rem;font-weight:700;color:var(--color-svv-ink)}
.loc-cond-bloc[data-cond="entretien"] > .loc-sous-section{padding-top:0}
.loc-cond-sous{display:flex;flex-direction:column;gap:8px;min-width:0}
.loc-cond-mot{font-weight:700;color:var(--color-svv-ink)}
.loc-cond-bloc .loc-champ input,.loc-cond-bloc .loc-champ textarea{min-height:48px;box-sizing:border-box}
.loc-cond-total{display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin:0;padding-top:12px;border-top:2px solid var(--color-svv-line);font-size:1.08rem;color:var(--color-svv-ink)}
.loc-cond-lecture{display:grid;grid-template-columns:minmax(0,1fr);gap:4px 16px;margin:0}
@media (min-width:640px){ .loc-cond-lecture{grid-template-columns:minmax(10rem,16rem) minmax(0,1fr)} }
.loc-cond-lecture dt{font-weight:700;color:var(--color-svv-ink)}
.loc-cond-lecture dd{margin:0 0 6px;color:var(--color-svv-ink);overflow-wrap:anywhere;white-space:pre-wrap}
`;
