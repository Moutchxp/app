'use client';

import type { ReactNode } from 'react';
import { LIBELLE_OUI_NON, OUI_NON, Pilules, versOuiNon } from './Pilules';
import {
  ASSURANCES, COMPTES, DEPOTS, formaterCentimes, JOURS_PRELEVEMENT, LIBELLE_ASSURANCE, LIBELLE_COMPTE, LIBELLE_DEPOT, LIBELLE_JOUR,
  LIBELLE_REGLEMENT, LIBELLE_SOMME, REGLEMENTS, SOMMES, enCentimes, totalCentimes, type SaisieConditions,
} from '../../../../lib/location/conditionsEntree';
import {
  eurosAffiches, LIBELLE_ZONE, lignesHonoraires, tarifAffiche, lireDecimal, totalDesHonoraires, ZERO, type CalculHonoraires,
} from '../../../../lib/location/honorairesProprietaire';

/**
 * ══ 🔴🔴 TUILE LOCATION — LE BLOC « CONDITIONS D'ENTRÉE » (Arno, 20/10/2026) ═══════════════════════════════════════════════
 *
 * La fiche papier « Nouveau dossier » de l'agence, en ENCADRÉS comme l'écran « Nouveau bien » (mêmes pilules, mêmes
 * tailles, mêmes états : rouge + « ✓ », jamais la couleur seule). UN SEUL composant : le bloc 3 de « Nouveau locataire »
 * ET « Modifier » de l'encart de la fiche du locataire. La règle est `conditionsEntree.ts` (la même que le serveur).
 * Le point 4, « Entretien à prévoir », est la donnée DU BIEN : l'écran hôte le passe (`entretien`), c'est `BlocEntretien`.
 *
 * RETOUCHES (Arno, 20/10/2026) : le montant du dépôt s'ouvre sous son choix — JUMEAU du « Dépôt de garantie (€) » des
 * sommes dues (une seule donnée) ; jours au 1er / 5 / 10 / 15 ; les GARANTS (contacts « Garant » du bloc 1) listés sous
 * « Garant personne physique », ou « Ajouter un garant » ; l'encadré « HONORAIRES PROPRIÉTAIRE » calculé (surface du bien ×
 * barème daté de la zone) et le « Total des honoraires » dessous.
 */
export function BlocConditionsEntree({ valeur, onChange, manque, entretien, garants, honoraires }: {
  valeur: SaisieConditions;
  onChange: (v: SaisieConditions) => void;
  /** Le message « ce qui manque » d'un champ (vide tant qu'on n'a pas tenté d'enregistrer). */
  manque: (cle: string) => ReactNode;
  /** Le point 4 (entretien à prévoir du bien) ; absent, il n'est pas montré (fiche du locataire, parking, cave). */
  entretien?: ReactNode;
  /** Les garants connus (« NOM Prénom ») et le geste « Ajouter un garant » ; absent : rien de plus sous Oui / Non (fiche). */
  garants?: { noms: string[]; onAjouter: () => void };
  /**
   * Les honoraires propriétaire : le calcul (serveur), `charge` pendant la lecture, `null` sans bien choisi ; `lienBien` : la
   * fiche du bien (surface manquante). Absent : l'encadré n'est pas montré.
   */
  honoraires?: ProprieteHonoraires;
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
        {/* JUMEAU de « Dépôt de garantie (€) » des sommes dues : la MÊME donnée (`sommes.depotGarantie`). */}
        {s.depot !== null && (
          <label className="loc-champ" data-depot-montant>Montant du dépôt de garantie (€)
            <input value={s.sommes.depotGarantie} inputMode="decimal" placeholder="ex. 1 180"
              onChange={(e) => maj({ sommes: { ...s.sommes, depotGarantie: e.target.value } })} /></label>
        )}
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
          {garants !== undefined && garants.noms.length > 0 && (
            <ul className="loc-cond-garants" aria-label="Garants" data-garants>
              {garants.noms.map((n, i) => <li key={`${i}-${n}`}>{n}</li>)}
            </ul>
          )}
          {garants !== undefined && garants.noms.length === 0 && s.garant === true && (
            <button type="button" className="svv-btn svv-btn-outline gst-btn loc-cond-ajout" onClick={garants.onAjouter} data-ajouter-garant>Ajouter un garant</button>
          )}
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

      {honoraires !== undefined && <EncadreHonoraires h={honoraires} agence={enCentimes(s.sommes.honorairesAgence)} />}

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

export interface ProprieteHonoraires { calcul: CalculHonoraires | null; charge?: boolean; lienBien: string | null }

/**
 * L'encadré « HONORAIRES PROPRIÉTAIRE » (calculé, en lecture) et, dessous, le « Total des honoraires » = honoraires agence
 * (locataire, des sommes dues) + total honoraires propriétaire. Surface manquante : on le dit, avec le lien vers la fiche.
 */
function EncadreHonoraires({ h, agence }: { h: ProprieteHonoraires; agence: number | null | undefined }) {
  // Une réponse inattendue se lit comme « pas de calcul » (jamais un écran qui tombe).
  const c = h.calcul != null && ['ok', 'surface_manquante', 'sans_bareme'].includes((h.calcul as { etat?: string }).etat ?? '') ? h.calcul : null;
  const total = totalDesHonoraires(agence === undefined ? null : agence, c);
  return (
    <>
      <div className="loc-cond-bloc" data-cond="honoraires-proprietaire" aria-live="polite">
        <h4>Honoraires propriétaire</h4>
        {h.charge === true ? <p className="loc-muet" style={{ margin: 0 }}>Calcul…</p>
          : c === null ? <p className="loc-muet" style={{ margin: 0 }}>Choisissez le bien loué : le calcul part de sa surface Carrez/Boutin.</p>
            : c.etat === 'surface_manquante' ? (
              <p className="loc-alerte loc-alerte--orange" style={{ margin: 0 }} data-surface-manquante>
                {c.motif}.{h.lienBien !== null && <>{' '}<a href={h.lienBien}>Ouvrir la fiche du bien</a></>}</p>
            ) : c.etat === 'sans_bareme' ? (
              <p className="loc-alerte loc-alerte--orange" style={{ margin: 0 }} data-sans-bareme>{c.motif}.</p>
            ) : (
              <>
                <dl className="loc-cond-calcul">
                  {lignesHonoraires(c).map((l) => (
                    <div key={l.mot} className={l.detail === undefined ? 'loc-cond-calcul-total' : undefined}>
                      <dt>{l.mot}{l.detail !== undefined && <small>{l.detail}</small>}</dt><dd>{l.valeur}</dd>
                    </div>
                  ))}
                </dl>
                <p className="loc-muet" style={{ margin: 0 }} data-zone-tarif>
                  Zone : <strong>{LIBELLE_ZONE[c.zone]}</strong> — tarif {tarifAffiche(lireDecimal(c.tarifZone) ?? ZERO)}, état des lieux {tarifAffiche(lireDecimal(c.tarifEdl) ?? ZERO)} ;
                  barème du {c.baremeDepuis.split('-').reverse().join('/')}{c.dateSupposee ? ' (date d’entrée non saisie : barème du jour)' : ''}.</p>
              </>
            )}
      </div>
      <p className="loc-cond-total loc-cond-total--general" data-total-honoraires>
        <span>Total des honoraires <small>(agence + propriétaire)</small></span>
        <strong>{total === null ? '—' : eurosAffiches(total)}</strong>
      </p>
    </>
  );
}

/** Les encadrés : les jetons du thème seulement, le même dessin que les blocs DPE / PNO de « Nouveau bien ». */
export const CSS_CONDITIONS = `
.loc-cond{display:grid;grid-template-columns:minmax(0,1fr);gap:18px}
@media (min-width:900px){ .loc-cond{grid-template-columns:repeat(2,minmax(0,1fr))} .loc-cond-bloc--large,.loc-cond-bloc[data-cond="sommes"],.loc-cond-bloc[data-cond="entretien"],.loc-cond-bloc[data-cond="honoraires-proprietaire"],.loc-cond-total--general{grid-column:1 / -1} }
.loc-cond-bloc{display:flex;flex-direction:column;gap:12px;min-width:0;border:2px solid var(--color-svv-line);border-radius:20px;padding:18px 20px;background:var(--color-svv-field);box-sizing:border-box}
@media (max-width:480px){ .loc-cond-bloc{padding:16px 12px} }
.loc-cond-bloc > h4{margin:0;font-size:1.08rem;font-weight:700;color:var(--color-svv-ink)}
.loc-cond-bloc[data-cond="entretien"] > .loc-sous-section{padding-top:0}
.loc-cond-sous{display:flex;flex-direction:column;gap:8px;min-width:0}
.loc-cond-mot{font-weight:700;color:var(--color-svv-ink)}
.loc-cond-bloc .loc-champ input,.loc-cond-bloc .loc-champ textarea{min-height:48px;box-sizing:border-box}
.loc-cond-total{display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin:0;padding-top:12px;border-top:2px solid var(--color-svv-line);font-size:1.08rem;color:var(--color-svv-ink)}
.loc-cond-total strong{white-space:nowrap}
.loc-cond-total--general{border:2px solid var(--color-svv-line);border-radius:20px;padding:14px 20px;background:var(--color-svv-surface)}
.loc-cond-garants{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px;font-weight:700;color:var(--color-svv-ink)}
.loc-cond-garants li::before{content:"Garant : ";font-weight:400;color:var(--color-svv-muted)}
.loc-cond-ajout{width:auto;min-height:48px;align-self:flex-start}
.loc-cond-calcul{display:flex;flex-direction:column;gap:8px;margin:0}
.loc-cond-calcul > div{display:flex;justify-content:space-between;align-items:baseline;gap:12px}
.loc-cond-calcul dt{display:flex;flex-direction:column;gap:2px;font-weight:700;color:var(--color-svv-ink);min-width:0}
.loc-cond-calcul dt small{font-weight:400;color:var(--color-svv-muted);overflow-wrap:anywhere}
.loc-cond-calcul dd{margin:0;font-weight:700;color:var(--color-svv-ink);white-space:nowrap}
.loc-cond-calcul-total{border-top:2px solid var(--color-svv-line);padding-top:8px}
.loc-cond-lecture{display:grid;grid-template-columns:minmax(0,1fr);gap:4px 16px;margin:0}
@media (min-width:640px){ .loc-cond-lecture{grid-template-columns:minmax(10rem,16rem) minmax(0,1fr)} }
.loc-cond-lecture dt{font-weight:700;color:var(--color-svv-ink)}
.loc-cond-lecture dd{margin:0 0 6px;color:var(--color-svv-ink);overflow-wrap:anywhere;white-space:pre-wrap}
`;
