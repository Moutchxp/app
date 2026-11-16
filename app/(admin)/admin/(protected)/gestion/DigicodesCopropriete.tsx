'use client';

import { useState } from 'react';
import { batimentDe, menuBatiments, refusDesBatiments, type BatimentConnu, type Nomenclature } from '../../../../lib/gestion/batimentsCopropriete';
import { adresseImmeuble } from '../../../../lib/gestion/syndics';
import type { FicheCopropriete } from '../../../../lib/gestion/copropriete';

/**
 * ══ 🔴🔴 LES DIGICODES DE LA FICHE COPROPRIÉTÉ (Arno, 16/11/2026, chantier « Fiche Copropriété », lot 3) ═══════════════════════════════════════
 * Par adresse : le DIGICODE COMMUN (facultatif ; « pas de digicode » = le « Non » d'avant), et à côté un « + » qui ajoute le digicode d'un
 * BÂTIMENT ou d'une CAGE. Au clic sur le champ du bâtiment, un petit menu SOUS LE CHAMP : tous les bâtiments déjà connus de la copropriété
 * (toutes adresses confondues), les intitulés libres déjà utilisés, et « Ajouter nouveau bâtiment ». Règle commune à toute la copropriété : le
 * premier bâtiment en LETTRE impose les lettres, le premier en CHIFFRE les chiffres (mélange refusé, message clair) ; les intitulés libres sont
 * permis en plus. Tout part avec le « Valider » de la fiche ; les lecteurs du digicode (fiche du bien, préavis, pré-visite, état des lieux,
 * mails) lisent les mêmes tables qu'avant. ⚠️ AUCUN IMPORT QUI TIRE `pg`.
 */
export interface CodeLigne { code: string; aucun: boolean }
export interface LigneBatiment extends CodeLigne { k: string; libelle: string; nouveau: boolean; initial: CodeLigne }
export interface DigicodesAdresseSaisis { cle: string; voie: string; codePostal: string | null; commune: string | null; commun: CodeLigne; communInitial: CodeLigne; batiments: LigneBatiment[] }

let n = 0;
const k = (): string => `b${++n}`;
const versLigne = (d: { digicode: boolean | null; code: string | null }): CodeLigne => ({ code: d.code ?? '', aucun: d.digicode === false });
const memes = (a: CodeLigne, b: CodeLigne): boolean => a.aucun === b.aucun && a.code.trim() === b.code.trim();

/** La saisie de départ, d'après ce que la fiche a lu. PUR. */
export function saisieDigicodesInitiale(f: Pick<FicheCopropriete, 'digicodes'>): DigicodesAdresseSaisis[] {
  return (f.digicodes ?? []).map((d) => ({ cle: d.cle, voie: d.voie, codePostal: d.codePostal, commune: d.commune, commun: versLigne(d.commun), communInitial: versLigne(d.commun),
    batiments: d.batiments.map((b) => ({ k: k(), libelle: b.libelle, ...versLigne(b), nouveau: false, initial: versLigne(b) })) }));
}
/** Ce qui part au serveur : seulement ce qui a changé (une ligne nouvelle part toujours). PUR. */
export function digicodesModifies(s: readonly DigicodesAdresseSaisis[]): { cle: string; commun?: CodeLigne; batiments: (CodeLigne & { libelle: string })[] }[] {
  return s.map((d) => ({ cle: d.cle, ...(memes(d.commun, d.communInitial) ? {} : { commun: { code: d.commun.code, aucun: d.commun.aucun } }),
    batiments: d.batiments.filter((b) => b.nouveau || !memes(b, b.initial)).map((b) => ({ libelle: b.libelle, code: b.code, aucun: b.aucun })) }))
    .filter((d) => d.commun !== undefined || d.batiments.length > 0);
}
/** Le refus de la saisie (`null` : rien) : un bâtiment sans nom, ou le mélange lettres / chiffres. PUR. */
export function refusDigicodes(s: readonly DigicodesAdresseSaisis[], nomenclature: Nomenclature | null, connus: readonly BatimentConnu[]): string | null {
  const nouveaux = s.flatMap((d) => d.batiments.filter((b) => b.nouveau).map((b) => b.libelle));
  if (nouveaux.some((l) => batimentDe(l) === null)) return 'Donnez un nom au bâtiment ou à la cage d’escalier.';
  for (const d of s) {
    const cles = d.batiments.map((b) => batimentDe(b.libelle)?.cle).filter(Boolean);
    if (new Set(cles).size !== cles.length) return `${d.voie} : ce bâtiment a déjà son digicode à cette adresse.`;
  }
  return refusDesBatiments(nouveaux, nomenclature, connus);
}
const MOT_REGLE: Record<Nomenclature, string> = { lettres: 'bâtiments en lettres (A, B, C…)', chiffres: 'bâtiments en chiffres (1, 2, 3…)' };

export function DigicodesCopropriete({ s, onChange, connus, nomenclature, desactive }: {
  s: DigicodesAdresseSaisis[]; onChange: (s: DigicodesAdresseSaisis[]) => void; connus: readonly BatimentConnu[]; nomenclature: Nomenclature | null; desactive: boolean;
}) {
  const [menu, setMenu] = useState<string | null>(null);
  // le menu : les bâtiments connus de TOUTE la copropriété, et ceux qu'on vient de saisir (autres adresses comprises)
  const saisis = s.flatMap((d) => d.batiments.map((b) => batimentDe(b.libelle))).filter((b): b is BatimentConnu => b !== null);
  const options = menuBatiments([...connus, ...saisis]);
  const maj = (cle: string, f: (d: DigicodesAdresseSaisis) => DigicodesAdresseSaisis): void => onChange(s.map((d) => (d.cle === cle ? f(d) : d)));
  const majLigne = (cle: string, kk: string, p: Partial<LigneBatiment>): void => maj(cle, (d) => ({ ...d, batiments: d.batiments.map((b) => (b.k === kk ? { ...b, ...p } : b)) }));
  const refus = refusDigicodes(s, nomenclature, connus);
  return (
    <div className="dcp" data-digicodes-copro>
      <p className="loc-muet dcp-regle" data-dcp-regle>{nomenclature === null ? 'Aucune règle encore : le premier bâtiment créé en lettre ou en chiffre la fixera pour toute la copropriété (les intitulés libres sont toujours permis).'
        : `Règle de la copropriété : ${MOT_REGLE[nomenclature]}, plus des intitulés libres (« Côté cour »…).`}</p>
      {s.map((d) => (
        <div key={d.cle} className="dcp-adresse" data-dcp-adresse={d.cle}>
          <p className="dcp-titre">{adresseImmeuble(d.voie, d.codePostal, d.commune)}</p>
          <div className="dcp-ligne" data-dcp-commun>
            <label className="dcp-champ"><span>Digicode commun</span>
              <input value={d.commun.code} disabled={desactive || d.commun.aucun} placeholder={d.commun.aucun ? 'pas de digicode' : 'facultatif'} maxLength={8}
                onChange={(e) => maj(d.cle, (x) => ({ ...x, commun: { ...x.commun, code: e.target.value } }))} data-dcp-code-commun /></label>
            <label className="dcp-aucun"><input type="checkbox" checked={d.commun.aucun} disabled={desactive}
              onChange={(e) => maj(d.cle, (x) => ({ ...x, commun: { code: e.target.checked ? '' : x.commun.code, aucun: e.target.checked } }))} /><span>pas de digicode</span></label>
            <button type="button" className="dcp-plus" disabled={desactive} aria-label={`Ajouter un digicode de bâtiment ou de cage — ${d.voie}`} title="Ajouter un digicode de bâtiment ou de cage"
              onClick={() => { const kk = k(); maj(d.cle, (x) => ({ ...x, batiments: [...x.batiments, { k: kk, libelle: '', code: '', aucun: false, nouveau: true, initial: { code: '', aucun: false } }] })); setMenu(kk); }}
              data-dcp-plus>+</button>
          </div>
          {d.batiments.map((b) => (
            <div key={b.k} className="dcp-ligne dcp-ligne--batiment" data-dcp-batiment={b.nouveau ? 'nouveau' : b.libelle}>
              <div className="dcp-champ dcp-champ-bat">
                <span>Bâtiment / cage</span>
                {b.nouveau ? <>
                  <input value={b.libelle} disabled={desactive} placeholder="A, 1, Côté cour…" aria-expanded={menu === b.k}
                    onFocus={() => setMenu(b.k)} onClick={() => setMenu(b.k)} onChange={(e) => { majLigne(d.cle, b.k, { libelle: e.target.value }); setMenu(b.k); }}
                    onBlur={() => setTimeout(() => setMenu((m) => (m === b.k ? null : m)), 180)} onKeyDown={(e) => { if (e.key === 'Escape') setMenu(null); }} data-dcp-nom-batiment />
                  {menu === b.k && (
                    <ul className="dcp-menu" role="listbox" aria-label="Bâtiments connus de la copropriété" data-dcp-menu>
                      {/* ce qui est tapé filtre le menu ; « Ajouter nouveau bâtiment » reste toujours proposé */}
                      {options.filter((o) => b.libelle.trim() === '' || o.cle.includes(batimentDe(b.libelle)?.cle ?? '')).map((o) => (
                        <li key={o.cle}><button type="button" role="option" aria-selected={false} className="dcp-option" onMouseDown={(e) => e.preventDefault()}
                          onClick={() => { majLigne(d.cle, b.k, { libelle: o.libelle }); setMenu(null); }} data-dcp-option={o.libelle}>{o.libelle}</button></li>))}
                      <li><button type="button" className="dcp-option dcp-option--nouveau" onMouseDown={(e) => e.preventDefault()} onClick={() => { majLigne(d.cle, b.k, { libelle: '' }); setMenu(null); }} data-dcp-ajouter-nouveau>Ajouter nouveau bâtiment</button></li>
                    </ul>)}
                </> : <strong className="dcp-nom" data-dcp-nom-existant>{b.libelle}</strong>}
              </div>
              <label className="dcp-champ"><span>Digicode</span>
                <input value={b.code} disabled={desactive || b.aucun} placeholder={b.aucun ? 'pas de digicode' : 'code'} maxLength={8} onChange={(e) => majLigne(d.cle, b.k, { code: e.target.value })} data-dcp-code-batiment /></label>
              <label className="dcp-aucun"><input type="checkbox" checked={b.aucun} disabled={desactive} onChange={(e) => majLigne(d.cle, b.k, { aucun: e.target.checked, code: e.target.checked ? '' : b.code })} /><span>pas de digicode</span></label>
              {b.nouveau && <button type="button" className="dcp-retirer" aria-label="Retirer cette ligne (rien n'est encore enregistré)" onClick={() => maj(d.cle, (x) => ({ ...x, batiments: x.batiments.filter((y) => y.k !== b.k) }))} data-dcp-retirer-ligne>×</button>}
            </div>))}
        </div>))}
      {refus !== null && <p className="cp-refus dcp-refus" role="status" data-dcp-refus>{refus}</p>}
      <style>{CSS_DIGICODES_COPRO}</style>
    </div>
  );
}

/* AUCUN ACCENT GRAVE DANS CE LITTERAL. Jetons du theme ; telephone : les champs passent a la ligne. */
export const CSS_DIGICODES_COPRO = `
.dcp{display:flex;flex-direction:column;gap:10px;min-width:0}
.dcp-regle{margin:0;font-size:.85rem}
.dcp-adresse{display:flex;flex-direction:column;gap:6px;padding:8px 10px;border-radius:10px;background:var(--color-svv-field);min-width:0}
.dcp-titre{margin:0;font-weight:800;color:var(--color-svv-ink);overflow-wrap:anywhere}
.dcp-ligne{display:flex;flex-wrap:wrap;align-items:flex-end;gap:8px;min-width:0}
.dcp-champ{display:flex;flex-direction:column;gap:3px;font-size:.85rem;font-weight:700;color:var(--color-svv-ink);min-width:0;flex:1 1 140px;position:relative}
.dcp-champ input{min-height:44px;box-sizing:border-box;width:100%;max-width:100%;border:1px solid var(--color-svv-line-strong);border-radius:10px;background:var(--color-svv-surface);color:var(--color-svv-ink);padding:8px 10px;font:inherit;font-weight:400}
.dcp-champ input:disabled{opacity:.6}
.dcp-nom{min-height:44px;display:flex;align-items:center;font-size:1rem;color:var(--color-svv-ink)}
.dcp-aucun{display:flex;align-items:center;gap:6px;min-height:44px;font-size:.85rem;color:var(--color-svv-ink)}
.dcp-plus{min-width:44px;min-height:44px;border-radius:999px;border:1px solid var(--color-svv-line-strong);background:var(--color-svv-surface);color:var(--color-svv-ink);font-weight:900;font-size:1.2rem;cursor:pointer}
.dcp-retirer{min-width:44px;min-height:44px;border:0;background:transparent;color:var(--color-svv-ink);font-size:1.2rem;cursor:pointer}
.dcp-menu{list-style:none;margin:2px 0 0;padding:4px;border:1px solid var(--color-svv-line-strong);border-radius:10px;background:var(--color-svv-surface);display:flex;flex-direction:column;gap:2px;max-height:220px;overflow-y:auto;z-index:2}
.dcp-option{width:100%;min-height:40px;text-align:left;border:0;border-radius:8px;background:transparent;color:var(--color-svv-ink);font:inherit;font-weight:600;padding:6px 10px;cursor:pointer}
.dcp-option:hover,.dcp-option:focus-visible{background:var(--color-svv-field)}
.dcp-option--nouveau{color:var(--color-svv-red);font-weight:800}
.dcp-refus{margin:0}
`;
