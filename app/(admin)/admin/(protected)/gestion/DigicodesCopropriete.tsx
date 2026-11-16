'use client';

import { useState } from 'react';
import { avertissementBatiment, avertissementsDesBatiments, batimentDe, menuBatiments, refusDesBatiments, type AvertissementBatiment, type BatimentConnu, type Nomenclature } from '../../../../lib/gestion/batimentsCopropriete';
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
export interface LigneBatiment extends CodeLigne { k: string; libelle: string; nouveau: boolean; initial: CodeLigne;
  /** 🔴 (lot D) l'intitulé confirmé malgré l'avertissement (sa clé) ; changer l'intitulé retire la confirmation */
  confirme?: string | null }
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
const estConfirme = (b: Pick<LigneBatiment, 'libelle' | 'confirme'>): boolean => { const k = batimentDe(b.libelle)?.cle; return k !== undefined && b.confirme === k; };
export function digicodesModifies(s: readonly DigicodesAdresseSaisis[]): { cle: string; commun?: CodeLigne; batiments: (CodeLigne & { libelle: string; confirme?: boolean })[] }[] {
  return s.map((d) => ({ cle: d.cle, ...(memes(d.commun, d.communInitial) ? {} : { commun: { code: d.commun.code, aucun: d.commun.aucun } }),
    batiments: d.batiments.filter((b) => b.nouveau || !memes(b, b.initial)).map((b) => ({ libelle: b.libelle, code: b.code, aucun: b.aucun,
      ...(b.nouveau ? { confirme: estConfirme(b) } : {}) })) }))
    .filter((d) => d.commun !== undefined || d.batiments.length > 0);
}
/** Les nouveaux bâtiments de la saisie, dans l'ordre (toutes adresses), chacun avec son avertissement éventuel. PUR. */
export function avertissementsSaisie(s: readonly DigicodesAdresseSaisis[], nomenclature: Nomenclature | null, connus: readonly BatimentConnu[]): Map<string, AvertissementBatiment> {
  const nouveaux = s.flatMap((d) => d.batiments.filter((b) => b.nouveau && batimentDe(b.libelle) !== null));
  const av = avertissementsDesBatiments(nouveaux.map((b) => b.libelle), nomenclature, connus);
  return new Map(nouveaux.flatMap((b, i) => (av[i].avertissement === null ? [] : [[b.k, av[i].avertissement as AvertissementBatiment] as const])));
}
/**
 * Le refus de la saisie (`null` : rien) : un bâtiment sans nom, le même bâtiment deux fois à une adresse, ou — 🔴 (lot D) — un intitulé qui
 * ne suit pas la numérotation et n'a été ni confirmé ni corrigé. PUR.
 */
export function refusDigicodes(s: readonly DigicodesAdresseSaisis[], nomenclature: Nomenclature | null, connus: readonly BatimentConnu[]): string | null {
  const nouveaux = s.flatMap((d) => d.batiments.filter((b) => b.nouveau));
  if (nouveaux.some((b) => batimentDe(b.libelle) === null)) return 'Donnez un nom au bâtiment ou à la cage d’escalier.';
  for (const d of s) {
    const cles = d.batiments.map((b) => batimentDe(b.libelle)?.cle).filter(Boolean);
    if (new Set(cles).size !== cles.length) return `${d.voie} : ce bâtiment a déjà son digicode à cette adresse.`;
  }
  const av = avertissementsSaisie(s, nomenclature, connus);
  const attente = nouveaux.find((b) => av.has(b.k) && !estConfirme(b));
  return attente === undefined ? null : `Confirmez ou corrigez l’intitulé « ${attente.libelle.trim()} » : il ne suit pas la numérotation des autres bâtiments.`;
}
/** Le texte de la fenêtre d'avertissement. PUR. */
export function texteAvertissement(a: AvertissementBatiment): string[] {
  const nature = a.sorte === 'lettre' ? 'une lettre' : 'un chiffre';
  const corps = a.raison === 'autre_numerotation'
    ? `« ${a.libelle} » est ${nature}, alors que les bâtiments de cette copropriété sont ${a.reference === 'lettres' ? 'nommés par des lettres' : 'numérotés par des chiffres'}. Ce nouvel intitulé ne respecte pas la même numérotation que les autres cages d’escalier de la copropriété.`
    : `Les autres bâtiments de cette copropriété ont des intitulés personnalisés ; celui-ci est ${a.sorte === 'lettre' ? 'en lettre' : 'en chiffre'} (« ${a.libelle} »).`;
  return [corps, `Intitulés déjà utilisés : ${a.intitules.join(', ')}.`];
}
export const TITRE_AVERTISSEMENT = 'Intitulé différent des autres bâtiments';
const MOT_REGLE: Record<Nomenclature, string> = { lettres: 'bâtiments en lettres (A, B, C…)', chiffres: 'bâtiments en chiffres (1, 2, 3…)' };

export function DigicodesCopropriete({ s, onChange, connus, nomenclature, desactive }: {
  s: DigicodesAdresseSaisis[]; onChange: (s: DigicodesAdresseSaisis[]) => void; connus: readonly BatimentConnu[]; nomenclature: Nomenclature | null; desactive: boolean;
}) {
  const [menu, setMenu] = useState<string | null>(null);
  // 🔴 (lot D) la fenêtre d'avertissement : la ligne concernée et ce qui est dit
  const [alerte, setAlerte] = useState<{ cle: string; k: string; a: AvertissementBatiment } | null>(null);
  /** Au moment où le bâtiment est AJOUTÉ (choix dans le menu, ou nom saisi quand on quitte le champ) : la fenêtre, s'il ne suit pas la numérotation. */
  const verifier = (cle: string, k: string, libelle: string, depuisMenu = false): void => {
    const suivante = s.map((d) => (d.cle === cle ? { ...d, batiments: d.batiments.map((b) => (b.k === k ? { ...b, libelle } : b)) } : d));
    const ligne = suivante.find((d) => d.cle === cle)?.batiments.find((b) => b.k === k);
    // choisi dans le MENU : même un bâtiment déjà connu de la copropriété est signalé s'il ne suit pas la numérotation en place
    const kChoisi = batimentDe(libelle)?.cle;
    const viaMenu = depuisMenu ? avertissementBatiment(libelle, nomenclature, connus.filter((x) => x.cle !== kChoisi)) : null;
    const a = viaMenu !== null ? { ...viaMenu, intitules: menuBatiments(connus).map((x) => x.libelle) } : avertissementsSaisie(suivante, nomenclature, connus).get(k);
    if (a !== undefined && ligne !== undefined && !estConfirme(ligne)) setAlerte({ cle, k, a });
  };
  // le menu : les bâtiments connus de TOUTE la copropriété, et ceux qu'on vient de saisir (autres adresses comprises)
  const saisis = s.flatMap((d) => d.batiments.map((b) => batimentDe(b.libelle))).filter((b): b is BatimentConnu => b !== null);
  const options = menuBatiments([...connus, ...saisis]);
  const maj = (cle: string, f: (d: DigicodesAdresseSaisis) => DigicodesAdresseSaisis): void => onChange(s.map((d) => (d.cle === cle ? f(d) : d)));
  const majLigne = (cle: string, kk: string, p: Partial<LigneBatiment>): void => maj(cle, (d) => ({ ...d, batiments: d.batiments.map((b) => (b.k === kk ? { ...b, ...p } : b)) }));
  const refus = refusDigicodes(s, nomenclature, connus);
  return (
    <div className="dcp" data-digicodes-copro>
      <p className="loc-muet dcp-regle" data-dcp-regle>{nomenclature === null ? 'Aucune règle encore : le premier bâtiment créé en lettre ou en chiffre la fixera pour toute la copropriété (les intitulés libres sont toujours permis).'
        : `Règle de la copropriété : ${MOT_REGLE[nomenclature]}, plus des intitulés libres (« Côté cour »…). Un autre intitulé reste possible, après confirmation.`}</p>
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
                    onFocus={() => setMenu(b.k)} onClick={() => setMenu(b.k)} onChange={(e) => { majLigne(d.cle, b.k, { libelle: e.target.value, confirme: null }); setMenu(b.k); }}
                    onBlur={(e) => { const v = e.target.value; setTimeout(() => setMenu((m) => (m === b.k ? null : m)), 180); if (v.trim() !== '') verifier(d.cle, b.k, v); }}
                    onKeyDown={(e) => { if (e.key === 'Escape') setMenu(null); if (e.key === 'Enter') { e.preventDefault(); setMenu(null); verifier(d.cle, b.k, (e.target as HTMLInputElement).value); } }}
                    data-dcp-nom-batiment={b.k} />
                  {menu === b.k && (
                    <ul className="dcp-menu" role="listbox" aria-label="Bâtiments connus de la copropriété" data-dcp-menu>
                      {/* ce qui est tapé filtre le menu ; « Ajouter nouveau bâtiment » reste toujours proposé */}
                      {options.filter((o) => b.libelle.trim() === '' || o.cle.includes(batimentDe(b.libelle)?.cle ?? '')).map((o) => (
                        <li key={o.cle}><button type="button" role="option" aria-selected={false} className="dcp-option" onMouseDown={(e) => e.preventDefault()}
                          onClick={() => { majLigne(d.cle, b.k, { libelle: o.libelle, confirme: null }); setMenu(null); verifier(d.cle, b.k, o.libelle, true); }} data-dcp-option={o.libelle}>{o.libelle}</button></li>))}
                      <li><button type="button" className="dcp-option dcp-option--nouveau" onMouseDown={(e) => e.preventDefault()} onClick={() => { majLigne(d.cle, b.k, { libelle: '', confirme: null }); setMenu(null); }} data-dcp-ajouter-nouveau>Ajouter nouveau bâtiment</button></li>
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
      {alerte !== null && (
        <div className="dcp-voile" data-dcp-avertissement>
          <div className="dcp-alerte" role="alertdialog" aria-modal="true" aria-labelledby="dcp-alerte-titre" aria-describedby="dcp-alerte-texte"
            onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); (e.currentTarget.querySelector('[data-dcp-corriger]') as HTMLButtonElement | null)?.click(); } }}>
            <p className="dcp-alerte-titre" id="dcp-alerte-titre">{TITRE_AVERTISSEMENT}</p>
            <div id="dcp-alerte-texte">{texteAvertissement(alerte.a).map((t) => <p key={t} className="dcp-alerte-texte">{t}</p>)}</div>
            <div className="dcp-alerte-actions">
              <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => {
                // « Corriger » : rien n'est gardé, la main revient au champ
                const { cle, k: kk } = alerte; setAlerte(null); majLigne(cle, kk, { libelle: '', confirme: null });
                setTimeout(() => (document.querySelector(`[data-dcp-nom-batiment="${kk}"]`) as HTMLInputElement | null)?.focus(), 0);
              }} data-dcp-corriger>Corriger</button>
              <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={() => {
                const { cle, k: kk, a } = alerte; setAlerte(null); majLigne(cle, kk, { libelle: a.libelle, confirme: batimentDe(a.libelle)?.cle ?? null });
              }} data-dcp-confirmer>Confirmer cet intitulé</button>
            </div>
          </div>
        </div>)}
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
.dcp-voile{position:fixed;inset:0;z-index:96;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;background:color-mix(in srgb, var(--color-svv-ink) 45%, transparent)}
.dcp-alerte{width:min(480px,100%);display:flex;flex-direction:column;gap:10px;padding:16px;box-sizing:border-box;border-radius:14px;border:1px solid var(--color-svv-line-strong);
  background:var(--color-svv-surface);color:var(--color-svv-ink);box-shadow:0 18px 48px color-mix(in srgb, var(--color-svv-ink) 30%, transparent)}
.dcp-alerte-titre{margin:0;font-weight:900;font-size:1.05rem;overflow-wrap:anywhere}
.dcp-alerte-texte{margin:0;line-height:1.45;overflow-wrap:anywhere}
.dcp-alerte-actions{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end}
@media (max-width:600px){.dcp-alerte-actions .svv-btn{flex:1 1 100%}}
`;
