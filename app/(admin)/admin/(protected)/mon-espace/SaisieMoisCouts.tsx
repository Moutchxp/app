'use client';

import { useMemo, useState } from 'react';
import { eur, MOT_UNITE, useAffichage } from '../transaction/commun';
import { estMontantSaisi } from '../../../../lib/mon-espace/couts';
import { coutsDuPoint } from '../../../../lib/mon-espace/couts';
import { completude, libelleMois, moisProposes, postesSaisis, type MoisAn, type PosteDuMois, type Validation } from '../../../../lib/mon-espace/saisieMois';
import { profilsPourSalaire, type ProfilCout } from '../../../../lib/admin/fonctionsCompteModele';
import type { CoutLigne, FamilleCout } from '../../../../lib/transaction/coutsSaisis';
import type { EntreesCoutsGlobaux } from '../../../../lib/transaction/coutsGlobal';
import type { MontantC } from '../../../../lib/transaction/partAgence';
import type { Societe } from '../../../../lib/transaction/modele';
import { LIBELLE_AGENCE } from '../../../../lib/mon-espace/agence';
import { lireMontant, posterCout } from './EditionCouts';

/**
 * ══ 🔴 « LES COÛTS », LOT 3 (Arno, 03/11/2026, C15 / C16 / C17) — LA PAGE « SAISIR LES COÛTS DU MOIS » ═════════════════════════════════════════════
 * Ouverte par le bouton (ou le rappel) de l'onglet « Les coûts ». En tête : le mois (le mois précédent par défaut, les 6 derniers mois révolus) et la
 * structure (CRITERIMMO ou MACJ ; FUSION ne se saisit pas). Trois blocs Vente / Location / Gestion listent TOUS les postes du mois :
 *   · les postes saisis : des champs (salariés et leurs profils, lignes « Autres », ADHOC, MONGA) et la case « complet pour ce mois » (0 compris) ;
 *   · les postes automatiques : leur montant, en lecture, et « corriger à la source » (C4).
 * « Enregistrer » écrit LES MÊMES enregistrements que la saisie dans les tableaux (lot 2 : mêmes gestes, journal, garde de version — un conflit
 * arrête tout et le dit), puis les validations, et revient à l'onglet sur l'année du mois saisi. Utilisable au téléphone (390 px).
 */
export interface DonneesPageSaisie {
  lignes: readonly CoutLigne[]; profils: readonly ProfilCout[]; validations: readonly Validation[] | null;
  versionsGestion: Readonly<Record<string, { version: number; origine: string }>>; monga: boolean;
  gestionDuMois: (m: MoisAn) => { adhoc: number | null; monga: number | null };
}
interface Brouillon { id: number | null; version: number; compte: string; libelle: string; montant: string;
  /** R2 — « Autres » : TVA 20 % (défaut) ou sans TVA. */
  tva: boolean; retirer: boolean; initial: string }
const MOT_FAMILLE: Record<FamilleCout, string> = { vente: 'Vente', location: 'Location', gestion: 'Gestion' };
const ecrireMontant = (x: number | null): string => (x === null ? '' : x.toFixed(2).replace('.', ','));
const cle = (p: Pick<PosteDuMois, 'famille' | 'poste'>): string => `${p.famille}-${p.poste}`;

export function SaisieMoisCouts({ d, eC, jour, societeInitiale, onRetour, onEcrit }: { d: DonneesPageSaisie; eC: EntreesCoutsGlobaux; jour: string; societeInitiale: Societe;
  onRetour: (m: MoisAn | null) => void; onEcrit: () => void }) {
  const u = useAffichage();
  const k = u === 'ht' ? 'htC' : 'ttcC';
  const choix = moisProposes(jour);
  const [mois, setMois] = useState<MoisAn>(choix[0]);
  const [societe, setSociete] = useState<Societe>(societeInitiale);
  const cleMois = `${mois.annee}-${String(mois.mois).padStart(2, '0')}`;
  const adhocImporte = d.versionsGestion[cleMois]?.origine === 'import';
  const postes = postesSaisis(societe, { adhocImporte, monga: d.monga });
  const validations = d.validations ?? [];
  // les brouillons : repris à chaque mois / structure (la clé du composant enfant)
  return (
    <section className="tdb-section mes-saisie-mois" aria-labelledby="mes-saisie-titre" data-saisie-mois={`${societe}-${cleMois}`}>
      <style>{CSS_SAISIE_MOIS}</style>
      <div className="mes-saisie-tete">
        <h3 id="mes-saisie-titre">Saisir les coûts du mois</h3>
        <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => onRetour(null)} data-retour-couts>Retour aux coûts</button>
      </div>
      <div className="mes-saisie-choix">
        <label className="mes-couts-champ">Mois
          <select value={cleMois} onChange={(e) => { const [a, m] = e.target.value.split('-').map(Number); setMois({ annee: a, mois: m }); }} data-choix-mois>
            {choix.map((m) => { const v = `${m.annee}-${String(m.mois).padStart(2, '0')}`; return <option key={v} value={v}>{libelleMois(m)}</option>; })}
          </select></label>
        <div className="trx-unites" role="group" aria-label="Structure" data-choix-structure>
          {(['criterimmo', 'macj'] as const).map((s) => <button key={s} type="button" className="trx-unite" aria-pressed={societe === s} onClick={() => setSociete(s)} data-structure={s}>{LIBELLE_AGENCE[s]}</button>)}
        </div>
      </div>
      <FormulaireMois key={`${societe}-${cleMois}`} d={d} eC={eC} mois={mois} societe={societe} postes={postes} validations={validations} k={k} unite={MOT_UNITE[u]}
        onFini={() => { onEcrit(); onRetour(mois); }} onEcrit={onEcrit} />
    </section>
  );
}

function FormulaireMois({ d, eC, mois, societe, postes, validations, k, unite, onFini, onEcrit }: { d: DonneesPageSaisie; eC: EntreesCoutsGlobaux; mois: MoisAn; societe: Societe;
  postes: readonly PosteDuMois[]; validations: readonly Validation[]; k: 'htC' | 'ttcC'; unite: string; onFini: () => void; onEcrit: () => void }) {
  const lignesDe = (p: PosteDuMois): CoutLigne[] => d.lignes.filter((l) => l.societe === societe && l.famille === p.famille && l.poste === p.poste && l.annee === mois.annee && l.mois === mois.mois);
  const g = d.gestionDuMois(mois);
  const [brouillons, setBrouillons] = useState<Record<string, Brouillon[]>>(() => Object.fromEntries(postes.filter((p) => p.poste === 'salaires' || p.poste === 'autres')
    .map((p) => [cle(p), lignesDe(p).map((l) => { const montant = ecrireMontant(l.montantHt); const compte = String(l.compteId ?? ''); const libelle = l.libelle ?? '';
      return { id: l.id, version: l.version, compte, libelle, montant, tva: l.tva === true, retirer: false, initial: `${compte}|${libelle}|${montant}|${l.tva === true}` }; })])));
  const [gestion, setGestion] = useState<Record<'adhoc' | 'monga', string>>({ adhoc: ecrireMontant(g.adhoc), monga: ecrireMontant(g.monga) });
  const [complets, setComplets] = useState<Record<string, boolean>>(() => Object.fromEntries(postes.map((p) => [cle(p), validations.some((v) => v.societe === societe
    && v.famille === p.famille && v.poste === p.poste && v.annee === mois.annee && v.mois === mois.mois)])));
  const [message, setMessage] = useState<{ texte: string; conflit: boolean } | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const p0 = useMemo(() => coutsDuPoint(eC, societe, mois.annee, mois.mois), [eC, societe, mois]);
  const vue: Validation[] = postes.filter((p) => complets[cle(p)]).map((p) => ({ societe, famille: p.famille, poste: p.poste, annee: mois.annee, mois: mois.mois }));
  const etat = completude(postes, vue, societe, mois);
  const changer = (c: string, i: number, x: Partial<Brouillon>) => setBrouillons((b) => ({ ...b, [c]: b[c].map((y, j) => (j === i ? { ...y, ...x } : y)) }));
  const ajouterLigne = (c: string) => setBrouillons((b) => ({ ...b, [c]: [...b[c], { id: null, version: 0, compte: '', libelle: '', montant: '', tva: true, retirer: false, initial: '|||' }] }));

  const enregistrer = async (): Promise<void> => {
    setMessage(null);
    // 1. tout vérifier avant d'écrire quoi que ce soit
    const gestes: unknown[] = [];
    for (const p of postes) {
      if (p.poste === 'adhoc' || p.poste === 'monga') {
        const v = lireMontant(gestion[p.poste]);
        if (v !== null && !estMontantSaisi(v)) { setMessage({ texte: `${p.libelle} : montant invalide (un nombre positif, deux décimales au plus).`, conflit: false }); return; }
        const avant = p.poste === 'adhoc' ? g.adhoc : g.monga;
        if (v !== avant) gestes.push({ action: 'gestion-poste', annee: mois.annee, mois: mois.mois, poste: p.poste, montantHt: v, version: d.versionsGestion[`${mois.annee}-${String(mois.mois).padStart(2, '0')}`]?.version ?? 0 });
        continue;
      }
      for (const b of brouillons[cle(p)] ?? []) {
        if (b.id !== null && b.retirer) { gestes.push({ action: 'ligne-retirer', id: b.id, version: b.version }); continue; }
        const vide = b.montant.trim() === '' && b.compte === '' && b.libelle.trim() === '';
        if (b.id === null && vide) continue;
        const m = lireMontant(b.montant);
        if (m === null || !estMontantSaisi(m)) { setMessage({ texte: `${MOT_FAMILLE[p.famille]} — ${p.libelle} : montant invalide (un nombre positif, deux décimales au plus).`, conflit: false }); return; }
        if (p.poste === 'salaires' && b.compte === '') { setMessage({ texte: `${MOT_FAMILLE[p.famille]} — salaires : choisissez le salarié de chaque ligne.`, conflit: false }); return; }
        if (p.poste === 'autres' && b.libelle.trim() === '') { setMessage({ texte: `${MOT_FAMILLE[p.famille]} — autres : donnez un libellé à chaque ligne.`, conflit: false }); return; }
        if (b.id === null) gestes.push({ action: 'ligne-ajouter', ligne: { societe, famille: p.famille, poste: p.poste, annee: mois.annee, mois: mois.mois,
          compteId: p.poste === 'salaires' ? Number(b.compte) : null, libelle: p.poste === 'autres' ? b.libelle.trim() : null, montantHt: m, tva: p.poste === 'autres' ? b.tva : false } });
        else if (`${b.compte}|${b.libelle}|${b.montant}|${b.tva}` !== b.initial) gestes.push({ action: 'ligne-modifier', id: b.id, version: b.version, montantHt: m,
          ...(p.poste === 'salaires' ? { compteId: Number(b.compte) } : { libelle: b.libelle.trim(), tva: b.tva }) });
      }
    }
    if (d.validations !== null) for (const p of postes) {
      const avant = validations.some((v) => v.societe === societe && v.famille === p.famille && v.poste === p.poste && v.annee === mois.annee && v.mois === mois.mois);
      if (avant !== complets[cle(p)]) gestes.push({ action: 'valider', validation: { societe, famille: p.famille, poste: p.poste, annee: mois.annee, mois: mois.mois }, valide: complets[cle(p)] });
    }
    // 2. écrire, geste par geste ; le premier refus arrête tout (ce qui est écrit l'est, journalisé ; le message le dit)
    setEnvoi(true);
    let faits = 0;
    for (const x of gestes) {
      const r = await posterCout(x);
      if (!r.ok) {
        setEnvoi(false); if (faits > 0) onEcrit();
        setMessage({ texte: `${r.motif ?? 'Enregistrement impossible.'}${faits > 0 ? ` (${faits} modification${faits > 1 ? 's' : ''} déjà enregistrée${faits > 1 ? 's' : ''})` : ''}`, conflit: r.statut === 409 });
        return;
      }
      faits += 1;
    }
    setEnvoi(false);
    onFini();
  };

  const auto = (famille: FamilleCout): { libelle: string; m: MontantC }[] => (famille === 'vente'
    ? [{ libelle: 'Commissions des négociateurs', m: p0.vente.commissions }, { libelle: 'Apporteurs', m: p0.vente.apporteurs }, { libelle: 'Agences extérieures', m: p0.vente.exterieures }]
    : famille === 'location' && p0.location !== null ? [{ libelle: 'Apporteurs', m: p0.location.apporteurs }, { libelle: 'Primes de gestion', m: p0.location.primes },
      { libelle: 'Variable négociateur (primes incluses)', m: p0.location.variable }, { libelle: 'Part de gestion versée aux apporteurs', m: p0.location.partGestion },
      { libelle: 'Rémunération des collègues apporteurs', m: p0.location.collegues }] : []);
  const familles = (['vente', 'location', 'gestion'] as const).filter((f) => f === 'vente' || societe === 'criterimmo');
  const lien = (f: FamilleCout) => (f === 'vente' ? `/admin/transaction/${societe}?vue=mois&annee=${mois.annee}&mois=${mois.mois}` : '/admin/location/outils/mois');
  const pastille = (complet: boolean | null, attr: string) => (complet === null ? null
    : <span className={`mes-saisie-etat${complet ? ' mes-saisie-etat--ok' : ''}`} data-etat-saisie={attr}>{complet ? 'complet' : 'à compléter'}</span>);
  return (
    <div className="mes-saisie-corps">
      <p className="mes-saisie-global" data-etat-global>{libelleMois(mois)} — {LIBELLE_AGENCE[societe]} : {pastille(etat.complet, 'global')}
        {d.validations === null && <small className="loc-muet" data-validation-indisponible> (la validation sera disponible après la mise à jour de la base, migration 452)</small>}</p>
      {familles.map((f) => (
        <fieldset key={f} className="mes-saisie-bloc" data-bloc-saisie={f}>
          <legend>{MOT_FAMILLE[f]} {pastille(etat.familles[f], f)}</legend>
          {postes.filter((p) => p.famille === f).map((p) => {
            const c = cle(p);
            return (
              <div key={c} className="mes-saisie-poste" data-poste-saisie={c}>
                <div className="mes-saisie-poste-tete"><strong>{p.libelle}</strong>
                  <label className="mes-saisie-complet"><input type="checkbox" checked={complets[c] === true} disabled={d.validations === null}
                    onChange={(e) => setComplets((x) => ({ ...x, [c]: e.target.checked }))} data-complet={c} /> complet pour ce mois (0 compris)</label></div>
                {(p.poste === 'adhoc' || p.poste === 'monga')
                  ? <input type="text" inputMode="decimal" value={gestion[p.poste]} placeholder="Montant HT (vide : non saisi)" aria-label={`${p.libelle} HT`}
                    onChange={(e) => setGestion((x) => ({ ...x, [p.poste]: e.target.value }))} data-montant-poste={c} />
                  : <ul className="mes-couts-lignes">
                    {(brouillons[c] ?? []).map((b, i) => (
                      <li key={b.id ?? `n${i}`} className={b.retirer ? 'mes-saisie-retiree' : undefined} data-brouillon={`${c}-${i}`}>
                        {p.poste === 'salaires'
                          ? <select value={b.compte} onChange={(e) => changer(c, i, { compte: e.target.value })} aria-label="Salarié" disabled={b.retirer} data-profil-brouillon={`${c}-${i}`}>
                            <option value="">Choisir le salarié…</option>
                            {([1, 2, 3] as const).map((gp) => { const xs = profilsPourSalaire(p.famille, d.profils).filter((x) => x.groupe === gp); return xs.length === 0 ? null
                              : <optgroup key={gp} label={gp === 1 ? `Fonction ${MOT_FAMILLE[p.famille].toLowerCase()}` : gp === 2 ? 'Location ou gestion' : 'Autres profils'}>
                                {xs.map((x) => <option key={x.profil.id} value={x.profil.id}>{x.profil.libelle}</option>)}</optgroup>; })}
                          </select>
                          : <input type="text" value={b.libelle} placeholder="Libellé (loyer, logiciel…)" maxLength={120} disabled={b.retirer} onChange={(e) => changer(c, i, { libelle: e.target.value })} aria-label="Libellé" data-libelle-brouillon={`${c}-${i}`} />}
                        <input type="text" inputMode="decimal" value={b.montant} placeholder="Montant HT" disabled={b.retirer} onChange={(e) => changer(c, i, { montant: e.target.value })} aria-label="Montant HT" data-montant-brouillon={`${c}-${i}`} />
                        {p.poste === 'autres' && <select value={b.tva ? '20' : '0'} disabled={b.retirer} onChange={(e) => changer(c, i, { tva: e.target.value === '20' })} aria-label="TVA de la ligne" data-tva-brouillon={`${c}-${i}`}>
                          <option value="20">TVA 20 %</option><option value="0">sans TVA</option></select>}
                        {b.id !== null && <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => changer(c, i, { retirer: !b.retirer })} data-retirer-brouillon={`${c}-${i}`}>
                          {b.retirer ? 'Garder' : 'Retirer'}</button>}
                      </li>))}
                    <li><button type="button" className="trx-bouton-lien" onClick={() => ajouterLigne(c)} data-ajouter-brouillon={c}>+ Ajouter une ligne</button></li>
                  </ul>}
              </div>
            );
          })}
          {auto(f).length > 0 && (
            <div className="mes-saisie-auto" data-auto-saisie={f}>
              <p className="loc-muet">Calculés ({unite}) — ils se corrigent à la source :</p>
              <ul>{auto(f).map((a) => <li key={a.libelle}><span>{a.libelle}</span> <strong>{eur(a.m[k] / 100)}</strong></li>)}</ul>
              <a className="trx-bouton-lien" href={lien(f)} data-corriger-source={f}>Corriger à la source</a>
            </div>
          )}
        </fieldset>
      ))}
      {message !== null && <p className={message.conflit ? 'loc-alerte loc-alerte--orange' : 'trx-erreur'} role="alert" data-message-saisie={message.conflit ? 'conflit' : 'refus'}>{message.texte}</p>}
      <div className="mes-saisie-actions">
        <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={envoi} onClick={() => void enregistrer()} data-enregistrer-mois>{envoi ? 'Enregistrement…' : 'Enregistrer'}</button>
      </div>
      <p className="loc-muet mes-couts-aide">Montants en euros HT (salaires : chargés, sans TVA ; « Autres » : TVA 20 % ou sans TVA, ligne par ligne ; ADHOC et MONGA : 20 % ajoutés en TTC). Ce que vous enregistrez ici est
        exactement ce que les tableaux, le Suivi CA et le résultat net affichent.</p>
    </div>
  );
}

/** AUCUN ACCENT GRAVE DANS CE LITTERAL. Mobile d'abord : une colonne ; les champs a 44 px ; les jetons de la charte. */
const CSS_SAISIE_MOIS = `
.mes-saisie-tete{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px}
.mes-saisie-tete h3{margin:0}
.mes-saisie-tete .gst-btn,.mes-saisie-actions .gst-btn{width:auto;min-height:44px;padding:0 1.1rem}
.mes-saisie-choix{display:flex;flex-wrap:wrap;align-items:flex-end;gap:12px;margin:10px 0}
.mes-saisie-choix select{min-height:44px;padding:0 .6rem;font:inherit;color:var(--color-svv-ink);background:var(--color-svv-field);border:1px solid var(--color-svv-line);border-radius:8px}
.mes-saisie-choix .trx-unite{min-height:44px}
.mes-saisie-global{margin:6px 0 10px;font-weight:700}
.mes-saisie-etat{display:inline-block;margin-left:6px;padding:1px 8px;border-radius:999px;font-size:.78rem;font-weight:700;background:var(--color-svv-amber-soft);color:var(--color-svv-ink);border:1px solid var(--color-svv-amber)}
.mes-saisie-etat--ok{background:color-mix(in srgb, var(--color-svv-green) 15%, transparent);border-color:var(--color-svv-green)}
.mes-saisie-bloc{margin:0 0 12px;padding:10px 12px;border:1px solid var(--color-svv-line);border-radius:12px}
.mes-saisie-bloc legend{padding:0 6px;font-weight:800}
.mes-saisie-poste{padding:8px 0;border-bottom:1px solid var(--color-svv-line)}
.mes-saisie-poste:last-of-type{border-bottom:0}
.mes-saisie-poste-tete{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:6px;margin:0 0 6px}
.mes-saisie-complet{display:inline-flex;align-items:center;gap:6px;min-height:44px;font-size:.9rem}
.mes-saisie-complet input{width:20px;height:20px;accent-color:var(--color-svv-red)}
.mes-saisie-poste input[type=text],.mes-saisie-poste select{min-height:44px;padding:0 .6rem;font:inherit;color:var(--color-svv-ink);background:var(--color-svv-field);border:1px solid var(--color-svv-line);border-radius:8px}
.mes-saisie-poste input[inputmode=decimal]{width:9rem;text-align:right}
.mes-saisie-poste select{min-width:12rem;max-width:100%}
.mes-saisie-poste input[type=text]:not([inputmode]){flex:1 1 12rem;min-width:0}
.mes-saisie-retiree{opacity:.5;text-decoration:line-through}
.mes-saisie-auto{margin:8px 0 0;padding:8px 10px;border-radius:8px;background:var(--color-svv-field)}
.mes-saisie-auto p{margin:0 0 4px;font-size:.85rem}
.mes-saisie-auto ul{margin:0 0 6px;padding:0;list-style:none;display:flex;flex-direction:column;gap:2px}
.mes-saisie-auto li{display:flex;justify-content:space-between;gap:8px;font-size:.9rem}
.mes-saisie-actions{display:flex;justify-content:flex-end;margin:8px 0}
@media (max-width:640px){
  .mes-saisie-poste input[inputmode=decimal],.mes-saisie-poste select{flex:1 1 100%;width:100%}
  .mes-saisie-actions .gst-btn{flex:1 1 auto}
}
`;
