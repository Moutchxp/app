'use client';

import { useState } from 'react';
import { avertissementBatiment, avertissementsDesBatiments, batimentDe, LIBELLE_BATIMENT_CAGE, menuBatiments, type AvertissementBatiment, type BatimentConnu, type Nomenclature } from '../../../../lib/gestion/batimentsCopropriete';
import { adresseImmeuble } from '../../../../lib/gestion/syndics';
import type { EtatPlaceDigicode, FicheCopropriete } from '../../../../lib/gestion/copropriete';
import { dateHeure, instantDepuisParis } from '../../../../lib/gestion/digicodes';
import { bilanEnvoi, motCode, proprietairesRegroupes, type ApercuEnvoi, type IssueEnvoi, type LogementDest } from '../../../../lib/gestion/digicodesEnvoi';
import { prenomNom } from '../../../../lib/location/mailsPreavisSortie';

/**
 * ══ 🔴🔴 LES DIGICODES DE LA FICHE COPROPRIÉTÉ (Arno, 16/11/2026, chantier « Fiche Copropriété », lot 3) ═══════════════════════════════════════
 * Par adresse : le DIGICODE COMMUN (facultatif ; « pas de digicode » = le « Non » d'avant), et à côté un « + » qui ajoute le digicode d'un
 * BÂTIMENT ou d'une CAGE. Au clic sur le champ du bâtiment, un petit menu SOUS LE CHAMP : tous les bâtiments déjà connus de la copropriété
 * (toutes adresses confondues), les intitulés libres déjà utilisés, et « Ajouter nouveau bâtiment ». Règle commune à toute la copropriété : le
 * premier bâtiment en LETTRE impose les lettres, le premier en CHIFFRE les chiffres (mélange refusé, message clair) ; les intitulés libres sont
 * permis en plus. Tout part avec le « Valider » de la fiche ; les lecteurs du digicode (fiche du bien, préavis, pré-visite, état des lieux,
 * mails) lisent les mêmes tables qu'avant. ⚠️ AUCUN IMPORT QUI TIRE `pg`.
 *
 * 🔴🔴 (16/11/2026, « Digicodes unifiés », lot 3) LE COMPOSANT UNIQUE de la saisie des digicodes, avec la base unique (478) : un code CONNU se lit
 * (en vigueur, depuis quand, le changement prévu) et ne se change plus en tapant dans le champ — « Corriger une erreur » (faute de frappe :
 * immédiat, confirmé, sans date ni mail, tracé) ; les valeurs d'avant différentes d'une même place sont dans « À arbitrer » (« Garder ce code »,
 * confirmé) ; l'historique se déplie. Une place sans code connu se saisit comme avant (première valeur, avec « Valider »).
 */
export interface CodeLigne { code: string; aucun: boolean }
export interface LigneBatiment extends CodeLigne { k: string; libelle: string; nouveau: boolean; initial: CodeLigne;
  /** 🔴 (lot D) l'intitulé confirmé malgré l'avertissement (sa clé) ; changer l'intitulé retire la confirmation */
  confirme?: string | null;
  /** 🔴 (478) l'état de la place dans la base unique (absent sans la 478) ; le nombre de biens du bâtiment */
  etat?: EtatPlaceDigicode; nb?: number }
export interface DigicodesAdresseSaisis { cle: string; voie: string; codePostal: string | null; commune: string | null; commun: CodeLigne; communInitial: CodeLigne; batiments: LigneBatiment[];
  communEtat?: EtatPlaceDigicode; communNb?: number }

/** Une place se LIT (au lieu de se saisir) : son code est connu, ou elle est à arbitrer. PUR. */
export const placeLue = (e: EtatPlaceDigicode | undefined): e is EtatPlaceDigicode => e !== undefined && (e.connu || e.aArbitrer.length > 0);
/** Une valeur, en mots : « code 57B83 » / « pas de digicode ». PUR. */
export const motValeur = (v: { digicode: boolean | null; code: string | null }): string => (v.digicode === false ? 'pas de digicode' : v.code ? `code ${v.code}` : 'oui (code inconnu)');
const MOT_NATURE: Record<string, string> = { saisie: 'saisi', correction: 'corrigé (faute de frappe)', changement: 'changement de code', reprise: 'repris d’avant', arbitrage: 'choisi parmi des valeurs différentes' };
/** Un geste immédiat (correction, arbitrage) : la place, la valeur ; rend le motif d'un refus, ou `null`. */
export type GesteDigicode = (adresseCle: string, batiment: string | null, valeur: { digicode: boolean; code: string | null }) => Promise<string | null>;
/** 🔴 (lot 5) « Modifier » : la date d'application (ISO) et les codes qui changent ; « Annuler ce changement » : la ligne prévue. */
export type PlanifierDigicodes = (adresseCle: string, appliqueLe: string, changements: { batiment: string | null; digicode: boolean; code: string | null }[]) => Promise<string | null>;
export type AnnulerChangementDigicode = (adresseCle: string, ligneId: number) => Promise<string | null>;
/** 🔴 (lot 6) l'écran des destinataires d'un changement proposé, puis « Enregistrer et envoyer » ; un `string` : le refus. */
export type ApercuDigicodes = (adresseCle: string, appliqueLe: string, changements: { batiment: string | null; digicode: boolean; code: string | null }[]) => Promise<ApercuEnvoi | string>;
export type EnvoyerDigicodes = (adresseCle: string, appliqueLe: string, changements: { batiment: string | null; digicode: boolean; code: string | null }[], proprietaires: boolean) => Promise<IssueEnvoi | string>;

let n = 0;
const k = (): string => `b${++n}`;
const versLigne = (d: { digicode: boolean | null; code: string | null }): CodeLigne => ({ code: d.code ?? '', aucun: d.digicode === false });
const memes = (a: CodeLigne, b: CodeLigne): boolean => a.aucun === b.aucun && a.code.trim() === b.code.trim();

/** La saisie de départ, d'après ce que la fiche a lu. PUR. */
export function saisieDigicodesInitiale(f: Pick<FicheCopropriete, 'digicodes'>): DigicodesAdresseSaisis[] {
  return (f.digicodes ?? []).map((d) => ({ cle: d.cle, voie: d.voie, codePostal: d.codePostal, commune: d.commune, commun: versLigne(d.commun), communInitial: versLigne(d.commun),
    ...(d.commun.etat ? { communEtat: d.commun.etat } : {}), ...(d.commun.nbBiens !== undefined ? { communNb: d.commun.nbBiens } : {}),
    batiments: d.batiments.map((b) => ({ k: k(), libelle: b.libelle, ...versLigne(b), nouveau: false, initial: versLigne(b), ...(b.etat ? { etat: b.etat } : {}),
      ...(b.nbBiens !== undefined ? { nb: b.nbBiens } : {}) })) }));
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

export function DigicodesCopropriete({ s, onChange, connus, nomenclature, desactive, onCorriger, onArbitrer, onPlanifier, onAnnulerChangement, onApercu, onEnvoyer, modeBien = false, variante = 'gestion', onPlusBatiment }: {
  s: DigicodesAdresseSaisis[]; onChange: (s: DigicodesAdresseSaisis[]) => void; connus: readonly BatimentConnu[]; nomenclature: Nomenclature | null; desactive: boolean;
  /** 🔴 (478) les gestes immédiats ; absents : la place connue se lit seulement */
  onCorriger?: GesteDigicode; onArbitrer?: GesteDigicode;
  /** 🔴 (lot 5) « Modifier » (changement daté) et « Annuler ce changement » ; absents : non proposés */
  onPlanifier?: PlanifierDigicodes; onAnnulerChangement?: AnnulerChangementDigicode;
  /** 🔴 (lot 6) l'écran des destinataires et l'envoi ; présents : « Modifier » passe par eux (sinon : enregistrement sans envoi, lot 5) */
  onApercu?: ApercuDigicodes; onEnvoyer?: EnvoyerDigicodes;
  /** 🔴 (« Digicodes unifiés », lot 4) la fiche du BIEN : son adresse, son code commun et celui de SON bâtiment (choisi au menu, à part) — sans
   *  « + » ni rappel de la règle (le menu du bâtiment les porte) */
  modeBien?: boolean;
  /** 🔴 (Arno, 17/11/2026) l'habillage de la page de création / modification d'un bien de la Location (mêmes champs, mêmes boutons arrondis) */
  variante?: 'gestion' | 'location';
  /** 🔴 (17/11/2026) en mode bien : le « + » (bâtiment ou cage) ouvre le menu du bâtiment du bien — le bien n'a qu'un bâtiment, choisi au menu */
  onPlusBatiment?: () => void;
}) {
  const [menu, setMenu] = useState<string | null>(null);
  // 🔴 (lot 5) la fenêtre « Modifier » : l'adresse et le code d'où on l'a ouverte (pré-coché)
  const [modifier, setModifier] = useState<{ cle: string; place: string } | null>(null);
  // 🔴 (lot D) la fenêtre d'avertissement : la ligne concernée et ce qui est dit
  const [alerte, setAlerte] = useState<{ cle: string; k: string; a: AvertissementBatiment } | null>(null);
  /** Au moment où le bâtiment est AJOUTÉ (choix dans le menu, ou nom saisi quand on quitte le champ) : la fenêtre, s'il ne suit pas la numérotation. */
  // 🔴 Arno (16/11/2026) — seul un intitulé NOUVEAU qui ne suit pas la numérotation ouvre la fenêtre : un intitulé déjà présent dans la
  // copropriété (déjà accepté, ou confirmé plus haut dans cette saisie pour une autre adresse) se choisit à nouveau sans fenêtre
  const verifier = (cle: string, k: string, libelle: string): void => {
    const suivante = s.map((d) => (d.cle === cle ? { ...d, batiments: d.batiments.map((b) => (b.k === k ? { ...b, libelle } : b)) } : d));
    const ligne = suivante.find((d) => d.cle === cle)?.batiments.find((b) => b.k === k);
    const a = avertissementsSaisie(suivante, nomenclature, connus).get(k);
    if (a !== undefined && ligne !== undefined && !estConfirme(ligne)) setAlerte({ cle, k, a });
  };
  // le menu : les bâtiments connus de TOUTE la copropriété, et ceux qu'on vient de saisir (autres adresses comprises)
  const saisis = s.flatMap((d) => d.batiments.map((b) => batimentDe(b.libelle))).filter((b): b is BatimentConnu => b !== null);
  const options = menuBatiments([...connus, ...saisis]);
  const maj = (cle: string, f: (d: DigicodesAdresseSaisis) => DigicodesAdresseSaisis): void => onChange(s.map((d) => (d.cle === cle ? f(d) : d)));
  const majLigne = (cle: string, kk: string, p: Partial<LigneBatiment>): void => maj(cle, (d) => ({ ...d, batiments: d.batiments.map((b) => (b.k === kk ? { ...b, ...p } : b)) }));
  const refus = refusDigicodes(s, nomenclature, connus);
  /** Le « + » d'une adresse : une ligne de bâtiment ou de cage (fiche Copropriété) ; en mode bien, le menu du bâtiment du bien. */
  const plus = (d: DigicodesAdresseSaisis): React.ReactNode => (modeBien && onPlusBatiment === undefined ? null : (
    <button type="button" className="dcp-plus" disabled={desactive} aria-label={`Ajouter un digicode de bâtiment ou de cage${d.voie ? ` — ${d.voie}` : ''}`} title="Ajouter un digicode de bâtiment ou de cage"
      onClick={() => {
        if (modeBien) { onPlusBatiment?.(); return; }
        const kk = k(); maj(d.cle, (x) => ({ ...x, batiments: [...x.batiments, { k: kk, libelle: '', code: '', aucun: false, nouveau: true, initial: { code: '', aucun: false } }] })); setMenu(kk);
      }}
      data-dcp-plus>+</button>));
  return (
    <div className={`dcp${variante === 'location' ? ' dcp--location' : ''}`} data-digicodes-copro>
      {!modeBien && <p className="loc-muet dcp-regle" data-dcp-regle>{nomenclature === null ? 'Aucune règle encore : le premier bâtiment créé en lettre ou en chiffre la fixera pour toute la copropriété (les intitulés libres sont toujours permis).'
        : `Règle de la copropriété : ${MOT_REGLE[nomenclature]}, plus des intitulés libres (« Côté cour »…). Un autre intitulé reste possible, après confirmation.`}</p>}
      <AArbitrer s={s} desactive={desactive} onArbitrer={onArbitrer} />
      {s.map((d) => (
        <div key={d.cle} className="dcp-adresse" data-dcp-adresse={d.cle}>
          {d.voie.trim() === ''
            ? <p className="loc-muet dcp-titre-vide" data-dcp-sans-adresse>Choisissez l’adresse du bien : les codes déjà connus de sa copropriété s’afficheront ici. Sinon, saisissez-les.</p>
            : <p className="dcp-titre">{adresseImmeuble(d.voie, d.codePostal, d.commune)}</p>}
          {placeLue(d.communEtat) ? (
            <div className="dcp-ligne" data-dcp-commun>
              <PlaceDigicodeLue titre="Digicode commun" etat={d.communEtat} desactive={desactive} onCorriger={onCorriger === undefined ? undefined : (v) => onCorriger(d.cle, null, v)}
                onModifier={onPlanifier === undefined ? undefined : () => setModifier({ cle: d.cle, place: '' })}
                onAnnulerChangement={onAnnulerChangement === undefined ? undefined : (id) => onAnnulerChangement(d.cle, id)} />
              {plus(d)}
            </div>) : (
          <div className="dcp-ligne" data-dcp-commun>
            <label className="dcp-champ"><span>Digicode commun</span>
              <input value={d.commun.code} disabled={desactive || d.commun.aucun} placeholder={d.commun.aucun ? 'pas de digicode' : 'facultatif'} maxLength={8}
                onChange={(e) => maj(d.cle, (x) => ({ ...x, commun: { ...x.commun, code: e.target.value } }))} data-dcp-code-commun /></label>
            <label className="dcp-aucun"><input type="checkbox" checked={d.commun.aucun} disabled={desactive}
              onChange={(e) => maj(d.cle, (x) => ({ ...x, commun: { code: e.target.checked ? '' : x.commun.code, aucun: e.target.checked } }))} /><span>pas de digicode</span></label>
            {plus(d)}
          </div>)}
          {d.communNb !== undefined && <p className="loc-muet dcp-mention" data-dcp-mention-commun>{mentionNb(d.communNb, null)}</p>}
          {d.batiments.map((b) => (placeLue(b.etat) && !b.nouveau ? (
            <div key={b.k} className="dcp-ligne dcp-ligne--batiment" data-dcp-batiment={b.libelle}>
              <PlaceDigicodeLue titre={`Bâtiment / cage ${b.libelle}`} etat={b.etat} desactive={desactive} onCorriger={onCorriger === undefined ? undefined : (v) => onCorriger(d.cle, b.libelle, v)}
                onModifier={onPlanifier === undefined ? undefined : () => setModifier({ cle: d.cle, place: batimentDe(b.libelle)?.cle ?? '' })}
                onAnnulerChangement={onAnnulerChangement === undefined ? undefined : (id) => onAnnulerChangement(d.cle, id)} />
              {b.nb !== undefined && <p className="loc-muet dcp-mention" data-dcp-mention-batiment>{mentionNb(b.nb, b.libelle)}</p>}
            </div>) : (
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
                          onClick={() => { majLigne(d.cle, b.k, { libelle: o.libelle, confirme: null }); setMenu(null); verifier(d.cle, b.k, o.libelle); }} data-dcp-option={o.libelle}>{o.libelle}</button></li>))}
                      <li><button type="button" className="dcp-option dcp-option--nouveau" onMouseDown={(e) => e.preventDefault()} onClick={() => { majLigne(d.cle, b.k, { libelle: '', confirme: null }); setMenu(null); }} data-dcp-ajouter-nouveau>Ajouter nouveau bâtiment</button></li>
                    </ul>)}
                </> : <strong className="dcp-nom" data-dcp-nom-existant>{b.libelle}</strong>}
              </div>
              <label className="dcp-champ"><span>Digicode</span>
                <input value={b.code} disabled={desactive || b.aucun} placeholder={b.aucun ? 'pas de digicode' : 'code'} maxLength={8} onChange={(e) => majLigne(d.cle, b.k, { code: e.target.value })} data-dcp-code-batiment /></label>
              <label className="dcp-aucun"><input type="checkbox" checked={b.aucun} disabled={desactive} onChange={(e) => majLigne(d.cle, b.k, { aucun: e.target.checked, code: e.target.checked ? '' : b.code })} /><span>pas de digicode</span></label>
              {b.nouveau && <button type="button" className="dcp-retirer" aria-label="Retirer cette ligne (rien n'est encore enregistré)" onClick={() => maj(d.cle, (x) => ({ ...x, batiments: x.batiments.filter((y) => y.k !== b.k) }))} data-dcp-retirer-ligne>×</button>}
              {b.etat !== undefined && !b.nouveau && <p className="loc-muet dcp-mention" data-dcp-mention-batiment>Sans code propre : ses biens lisent le digicode commun de l’adresse.</p>}
            </div>)))}
        </div>))}
      {refus !== null && <p className="cp-refus dcp-refus" role="status" data-dcp-refus>{refus}</p>}
      <HistoriqueDigicodes s={s} />
      {modifier !== null && onPlanifier !== undefined && s.find((d) => d.cle === modifier.cle) !== undefined && (
        <FenetreModifier d={s.find((d) => d.cle === modifier.cle) as DigicodesAdresseSaisis} depart={modifier.place} onFermer={() => setModifier(null)}
          onValider={(appliqueLe, changements) => onPlanifier(modifier.cle, appliqueLe, changements)}
          {...(onApercu && onEnvoyer ? { onApercu: (appliqueLe: string, ch: Parameters<ApercuDigicodes>[2]) => onApercu(modifier.cle, appliqueLe, ch),
            onEnvoyer: (appliqueLe: string, ch: Parameters<ApercuDigicodes>[2], p: boolean) => onEnvoyer(modifier.cle, appliqueLe, ch, p) } : {})} />)}
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

/** « Commun aux 3 biens de cette adresse » / « … du bâtiment B » (la mention de l'ancienne saisie par adresse, reprise ici). PUR. */
export function mentionNb(n: number, batiment: string | null): string {
  const ou = batiment === null ? 'de cette adresse' : `du bâtiment ${batiment}`;
  return n === 0 ? `Aucun bien du portefeuille ${ou} pour l’instant.` : n === 1 ? `Le seul bien du portefeuille ${ou} le lit.` : `Commun aux ${n} biens du portefeuille ${ou}.`;
}

/** Une saisie de code (le nouveau code, ou « pas de digicode ») ; rend la valeur, ou `null` si rien n'est saisi. PUR. */
export function valeurDeLaSaisie(c: CodeLigne): { digicode: boolean; code: string | null } | null {
  if (c.aucun) return { digicode: false, code: null };
  return c.code.trim() === '' ? null : { digicode: true, code: c.code.trim() };
}

/** 🔴 (478) Une place dont le code est CONNU (ou à arbitrer) : lue, et « Corriger une erreur » (confirmé, immédiat, sans date ni mail). */
function PlaceDigicodeLue({ titre, etat, desactive, onCorriger, onModifier, onAnnulerChangement }: { titre: string; etat: EtatPlaceDigicode; desactive: boolean;
  onCorriger?: (v: { digicode: boolean; code: string | null }) => Promise<string | null>; onModifier?: () => void; onAnnulerChangement?: (id: number) => Promise<string | null> }) {
  const [annuler, setAnnuler] = useState<number | null>(null);
  const [erreurAnnulation, setErreurAnnulation] = useState<string | null>(null);
  const [ouvert, setOuvert] = useState(false);
  const [saisie, setSaisie] = useState<CodeLigne>({ code: '', aucun: false });
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const valeur = etat.aArbitrer.length > 0 ? null : etat.valeur;
  const nouvelle = valeurDeLaSaisie(saisie);
  return (
    <div className="dcp-lue" data-dcp-lue>
      <span className="dcp-lue-titre">{titre}</span>
      {etat.aArbitrer.length > 0
        ? <span className="dcp-lue-valeur dcp-a-arbitrer" data-dcp-lue-a-arbitrer>à arbitrer — plusieurs valeurs différentes sont connues (voir « À arbitrer »)</span>
        : <span className="dcp-lue-valeur" data-dcp-lue-valeur><strong>{valeur === null ? '' : motValeur(valeur)}</strong>
          {etat.depuis ? <span className="loc-muet"> · en vigueur depuis le {dateHeure(etat.depuis)}</span> : null}
          {etat.source === 'ancien' ? <span className="loc-muet"> · valeur d’avant, pas encore dans la base unique</span> : null}</span>}
      {etat.aVenir.map((x) => (
        <span key={x.appliqueLe} className="dcp-a-venir" data-dcp-a-venir>Changement prévu : {motValeur(x)} à partir du {dateHeure(x.appliqueLe)}
          {onAnnulerChangement !== undefined && (annuler === x.id
            ? <span className="dcp-confirmer"> — annuler ce changement ? <button type="button" className="dcp-lien" disabled={desactive}
                onClick={() => { void onAnnulerChangement(x.id).then((m) => { setAnnuler(null); setErreurAnnulation(m); }); }} data-dcp-annuler-changement-oui>Oui</button>{' '}
                <button type="button" className="dcp-lien" onClick={() => setAnnuler(null)}>Non</button></span>
            : <> — <button type="button" className="dcp-lien" disabled={desactive} onClick={() => { setAnnuler(x.id); setErreurAnnulation(null); }} data-dcp-annuler-changement>Annuler ce changement</button></>)}
        </span>))}
      {erreurAnnulation !== null && <p className="cp-refus dcp-refus" role="alert">{erreurAnnulation}</p>}
      {etat.connu && !ouvert && (onCorriger !== undefined || onModifier !== undefined) && (
        <span className="dcp-gestes">
          {onModifier !== undefined && <button type="button" className="svv-btn svv-btn-outline gst-btn dcp-mini" disabled={desactive} onClick={onModifier} data-dcp-modifier>Modifier</button>}
          {onCorriger !== undefined && <button type="button" className="dcp-lien" disabled={desactive} onClick={() => { setOuvert(true); setErreur(null); setSaisie({ code: '', aucun: false }); }} data-dcp-corriger-erreur>Corriger une erreur</button>}
        </span>)}
      {ouvert && onCorriger !== undefined && valeur !== null && (
        <div className="dcp-correction" role="group" aria-label={`Corriger une erreur — ${titre}`} data-dcp-correction>
          <p className="dcp-correction-texte">Corriger une faute de frappe : le code corrigé remplace <strong>{motValeur(valeur)}</strong> tout de suite, sans date ni mail ; l’ancienne valeur reste dans l’historique. Pour un code que le syndic change, utilisez « Modifier ».</p>
          <div className="dcp-ligne">
            <label className="dcp-champ"><span>Code corrigé</span>
              <input value={saisie.code} maxLength={8} disabled={envoi || saisie.aucun} placeholder={saisie.aucun ? 'pas de digicode' : 'code'} autoFocus
                onChange={(e) => setSaisie({ ...saisie, code: e.target.value })} data-dcp-correction-code /></label>
            <label className="dcp-aucun"><input type="checkbox" checked={saisie.aucun} disabled={envoi} onChange={(e) => setSaisie({ code: '', aucun: e.target.checked })} /><span>pas de digicode</span></label>
          </div>
          {erreur !== null && <p className="cp-refus dcp-refus" role="alert" data-dcp-correction-erreur>{erreur}</p>}
          <div className="dcp-alerte-actions">
            <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={envoi} onClick={() => { setOuvert(false); setErreur(null); }} data-dcp-correction-annuler>Annuler</button>
            <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={envoi || nouvelle === null} data-dcp-correction-confirmer onClick={() => {
              if (nouvelle === null) return;
              setEnvoi(true); setErreur(null);
              void onCorriger(nouvelle).then((m) => { setEnvoi(false); if (m === null) setOuvert(false); else setErreur(m); });
            }}>{envoi ? 'Enregistrement…' : 'Confirmer la correction'}</button>
          </div>
        </div>)}
    </div>
  );
}

/** La date de demain (heure de Paris), pour le champ « Date d'application ». */
const demainParis = (): string => new Date(Date.now() + 86400000).toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' });

/**
 * 🔴🔴 (« Digicodes unifiés », lot 5) LA FENÊTRE « MODIFIER » : les syndics changent les codes. On COCHE le ou les codes de l'adresse qui changent
 * (commun et/ou bâtiments ; celui d'où l'on vient est coché), en face de chaque code actuel on saisit le NOUVEAU, puis la DATE ET L'HEURE
 * d'application (heure de Paris). Le nouveau code ne remplace l'ancien qu'à partir de cette date ; avant, l'ancien reste en vigueur ; ensuite il
 * reste dans l'historique. Aucun envoi ici (l'écran des destinataires vient ensuite).
 */
function FenetreModifier({ d, depart, onFermer, onValider, onApercu, onEnvoyer }: { d: DigicodesAdresseSaisis; depart: string; onFermer: () => void;
  onValider: (appliqueLe: string, changements: { batiment: string | null; digicode: boolean; code: string | null }[]) => Promise<string | null>;
  onApercu?: (appliqueLe: string, changements: Parameters<ApercuDigicodes>[2]) => Promise<ApercuEnvoi | string>;
  onEnvoyer?: (appliqueLe: string, changements: Parameters<ApercuDigicodes>[2], proprietaires: boolean) => Promise<IssueEnvoi | string> }) {
  // 🔴 (lot 6) les étapes : la saisie, l'écran des destinataires, le compte rendu de l'envoi
  const [apercu, setApercu] = useState<ApercuEnvoi | null>(null);
  const [proprietaires, setProprietaires] = useState(false);
  const [fait, setFait] = useState<IssueEnvoi | null>(null);
  const places = [...(d.communEtat?.connu ? [{ cle: '', libelle: null as string | null, titre: 'Digicode commun', etat: d.communEtat }] : []),
    ...d.batiments.filter((b) => b.etat?.connu).map((b) => ({ cle: batimentDe(b.libelle)?.cle ?? b.libelle, libelle: b.libelle as string | null, titre: `Bâtiment / cage ${b.libelle}`, etat: b.etat as EtatPlaceDigicode }))];
  const [coches, setCoches] = useState<Record<string, CodeLigne | undefined>>(() => (places.some((p) => p.cle === depart && p.etat.aVenir.length === 0) ? { [depart]: { code: '', aucun: false } } : {}));
  const [date, setDate] = useState(demainParis());
  const [heure, setHeure] = useState('09:00');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ouverture] = useState(() => Date.now()); // l'heure d'ouverture de la fenêtre (le serveur revérifie au moment d'enregistrer)
  const appliqueLe = instantDepuisParis(date, heure);
  const choisis = places.filter((p) => coches[p.cle] !== undefined);
  const changementsSaisis = () => choisis.map((p) => ({ batiment: p.libelle, ...(valeurDeLaSaisie(coches[p.cle] as CodeLigne) as { digicode: boolean; code: string | null }) }));
  if (fait !== null) return <CompteRenduEnvoi fait={fait} onFermer={onFermer} />;
  if (apercu !== null && appliqueLe !== null && onEnvoyer !== undefined) {
    return <EcranDestinataires a={apercu} proprietaires={proprietaires} onProprietaires={setProprietaires} envoi={envoi} erreur={erreur}
      onRetour={() => { setApercu(null); setErreur(null); }}
      onEnvoyer={() => { setEnvoi(true); setErreur(null); void onEnvoyer(appliqueLe, changementsSaisis(), proprietaires).then((r) => { setEnvoi(false); if (typeof r === 'string') setErreur(r); else setFait(r); }); }} />;
  }
  const manque = choisis.length === 0 ? 'Cochez au moins un digicode qui change.'
    : choisis.some((p) => valeurDeLaSaisie(coches[p.cle] as CodeLigne) === null) ? 'Saisissez le nouveau code de chaque digicode coché (ou « pas de digicode »).'
      : appliqueLe === null ? 'Indiquez la date et l’heure d’application.'
        : new Date(appliqueLe).getTime() <= ouverture ? 'La date et l’heure d’application doivent être à venir.' : null;
  return (
    <div className="dcp-voile" data-dcp-fenetre-modifier>
      <div className="dcp-alerte dcp-fenetre" role="dialog" aria-modal="true" aria-labelledby="dcp-modifier-titre"
        onKeyDown={(e) => { if (e.key === 'Escape' && !envoi) { e.stopPropagation(); onFermer(); } }}>
        <p className="dcp-alerte-titre" id="dcp-modifier-titre">Modifier un digicode — {adresseImmeuble(d.voie, d.codePostal, d.commune)}</p>
        <p className="dcp-alerte-texte loc-muet">Cochez le ou les codes qui changent, saisissez le nouveau code en face de l’actuel, puis la date et l’heure d’application. Jusque-là, le code actuel reste en vigueur ; ensuite, il reste dans l’historique.</p>
        <ul className="dcp-arbitrer-liste">{places.map((p) => {
          const prevu = p.etat.aVenir[0];
          const c = coches[p.cle];
          return (
            <li key={p.cle} className="dcp-modifier-ligne" data-dcp-modifier-place={p.libelle ?? 'commun'}>
              <label className="dcp-aucun"><input type="checkbox" checked={c !== undefined} disabled={envoi || prevu !== undefined}
                onChange={(e) => setCoches((x) => ({ ...x, [p.cle]: e.target.checked ? { code: '', aucun: false } : undefined }))} data-dcp-modifier-coche />
                <span><strong>{p.titre}</strong> — actuel : {p.etat.valeur ? motValeur(p.etat.valeur) : '—'}</span></label>
              {prevu !== undefined && <span className="loc-muet">Un changement est déjà prévu le {dateHeure(prevu.appliqueLe)} : annulez-le d’abord.</span>}
              {c !== undefined && (
                <div className="dcp-ligne">
                  <label className="dcp-champ"><span>Nouveau code</span>
                    <input value={c.code} maxLength={8} disabled={envoi || c.aucun} placeholder={c.aucun ? 'pas de digicode' : 'nouveau code'}
                      onChange={(e) => setCoches((x) => ({ ...x, [p.cle]: { ...c, code: e.target.value } }))} data-dcp-modifier-code /></label>
                  <label className="dcp-aucun"><input type="checkbox" checked={c.aucun} disabled={envoi} onChange={(e) => setCoches((x) => ({ ...x, [p.cle]: { code: '', aucun: e.target.checked } }))} /><span>plus de digicode</span></label>
                </div>)}
            </li>);
        })}</ul>
        <div className="dcp-ligne">
          <label className="dcp-champ"><span>Date d’application</span><input type="date" value={date} disabled={envoi} onChange={(e) => setDate(e.target.value)} data-dcp-modifier-date /></label>
          <label className="dcp-champ"><span>Heure (Paris)</span><input type="time" value={heure} disabled={envoi} onChange={(e) => setHeure(e.target.value)} data-dcp-modifier-heure /></label>
        </div>
        {erreur !== null && <p className="cp-refus dcp-refus" role="alert" data-dcp-modifier-erreur>{erreur}</p>}
        {manque !== null && erreur === null && <p className="loc-muet dcp-sans-marge" data-dcp-modifier-manque>{manque}</p>}
        <div className="dcp-alerte-actions">
          <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={envoi} onClick={onFermer} data-dcp-modifier-annuler>Annuler</button>
          {onApercu !== undefined ? (
            <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={envoi || manque !== null} data-dcp-modifier-suivant onClick={() => {
              if (appliqueLe === null) return;
              setEnvoi(true); setErreur(null);
              void onApercu(appliqueLe, changementsSaisis()).then((r) => { setEnvoi(false); if (typeof r === 'string') setErreur(r); else setApercu(r); });
            }}>{envoi ? 'Lecture…' : 'Suivant : vérifier les destinataires'}</button>
          ) : (
          <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={envoi || manque !== null} data-dcp-modifier-valider onClick={() => {
            if (appliqueLe === null) return;
            setEnvoi(true); setErreur(null);
            void onValider(appliqueLe, changementsSaisis())
              .then((m) => { setEnvoi(false); if (m === null) onFermer(); else setErreur(m); });
          }}>{envoi ? 'Enregistrement…' : 'Enregistrer le changement'}</button>)}
        </div>
      </div>
    </div>
  );
}

/** Les noms d'un logement, une ligne : « Léa MARTIN et Paul MARTIN ». PUR. */
const noms = (xs: readonly { nom: string; prenom: string | null }[]): string => (xs.length <= 1 ? xs.map((x) => prenomNom(x)).join('')
  : `${xs.slice(0, -1).map((x) => prenomNom(x)).join(', ')} et ${prenomNom(xs[xs.length - 1])}`);

/**
 * 🔴🔴 (« Digicodes unifiés », lot 6) L'ÉCRAN DES DESTINATAIRES, AVANT L'ENVOI : bâtiment par bâtiment, UNE LIGNE PAR LOGEMENT (couple ou
 * colocataires ensemble), ses codes ; les locataires partis (règle des 7 jours) dits avec la raison ; « pas d'e-mail — à prévenir autrement » ;
 * « Prévenir aussi les propriétaires » décochée par défaut (un mail par propriétaire, ses logements regroupés) ; le total.
 */
function EcranDestinataires({ a, proprietaires, onProprietaires, envoi, erreur, onRetour, onEnvoyer }: { a: ApercuEnvoi; proprietaires: boolean;
  onProprietaires: (b: boolean) => void; envoi: boolean; erreur: string | null; onRetour: () => void; onEnvoyer: () => void }) {
  const b = bilanEnvoi(a, proprietaires);
  const groupes = new Map<string, LogementDest[]>();
  for (const l of a.logements) { const k = l.batiment ?? ''; groupes.set(k, [...(groupes.get(k) ?? []), l]); }
  const total = b.mailsLocataires + b.mailsProprietaires;
  return (
    <div className="dcp-voile" data-dcp-destinataires>
      <div className="dcp-alerte dcp-fenetre" role="dialog" aria-modal="true" aria-labelledby="dcp-dest-titre" onKeyDown={(e) => { if (e.key === 'Escape' && !envoi) { e.stopPropagation(); onRetour(); } }}>
        <p className="dcp-alerte-titre" id="dcp-dest-titre">Qui sera prévenu ?</p>
        <p className="dcp-alerte-texte">{a.adresse} — nouveau code à partir du {dateHeure(a.appliqueLe)}. Chaque personne reçoit SON mail, à son nom, sans autre destinataire, avec seulement le code commun et celui de son bâtiment.</p>
        <p className="dcp-total" data-dcp-total>{a.logements.length} logement{a.logements.length > 1 ? 's' : ''} concerné{a.logements.length > 1 ? 's' : ''}</p>
        {[...groupes.entries()].sort(([x], [y]) => x.localeCompare(y, 'fr', { numeric: true })).map(([bat, ls]) => (
          <div key={bat} className="dcp-dest-groupe" data-dcp-dest-batiment={bat === '' ? 'sans' : bat}>
            <p className="dcp-titre">{bat === '' ? 'Sans bâtiment (code commun seulement)' : `Bâtiment ${bat}`}</p>
            <ul className="dcp-arbitrer-liste">{ls.map((l) => {
              const inclus = l.locataires.filter((x) => x.inclus);
              return (
                <li key={l.lotId} className="dcp-dest-logement" data-dcp-dest-logement={l.lotId}>
                  <span><strong>{l.libelle}</strong> — {inclus.length === 0 ? <span className="loc-muet">aucun locataire à prévenir</span> : noms(inclus)}</span>
                  <span className="loc-muet dcp-dest-codes">codes : commun {motCode(l.codes.commun)}{l.batiment !== null ? ` ; bâtiment ${l.batiment} ${motCode(l.codes.batiment)}` : ''}</span>
                  {inclus.filter((x) => x.emails.length === 0).map((x) => <span key={x.occupationId} className="dcp-a-arbitrer" data-dcp-sans-email>{prenomNom(x)} — pas d’e-mail — à prévenir autrement</span>)}
                  {l.locataires.filter((x) => !x.inclus).map((x) => <span key={x.occupationId} className="loc-muet" data-dcp-exclu>{prenomNom(x)} — {x.raison} : non prévenu</span>)}
                </li>);
            })}</ul>
          </div>))}
        <label className="dcp-aucun"><input type="checkbox" checked={proprietaires} disabled={envoi} onChange={(e) => onProprietaires(e.target.checked)} data-dcp-proprietaires />
          <span>Prévenir aussi les propriétaires</span></label>
        {proprietaires && <ul className="dcp-arbitrer-liste" data-dcp-liste-proprietaires>{proprietairesRegroupes(a).map((p) => (
          <li key={p.personne.id}>{prenomNom(p.personne)} — {p.logements.length} logement{p.logements.length > 1 ? 's' : ''} (un seul mail){p.personne.emails.length === 0 ? <span className="dcp-a-arbitrer"> — pas d’e-mail — à prévenir autrement</span> : null}</li>))}</ul>}
        <p className="dcp-total" data-dcp-bilan>{b.mailsLocataires} mail{b.mailsLocataires > 1 ? 's' : ''} aux locataires{proprietaires ? ` · ${b.mailsProprietaires} aux propriétaires` : ''}{b.sansEmail.length > 0 ? ` · ${b.sansEmail.length} à prévenir autrement` : ''}</p>
        {erreur !== null && <p className="cp-refus dcp-refus" role="alert" data-dcp-envoi-erreur>{erreur}</p>}
        <div className="dcp-alerte-actions">
          <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={envoi} onClick={onRetour} data-dcp-dest-retour>Retour</button>
          <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={envoi} onClick={onEnvoyer} data-dcp-envoyer>
            {envoi ? 'Envoi…' : total === 0 ? 'Enregistrer le changement' : `Enregistrer et envoyer ${total} mail${total > 1 ? 's' : ''}`}</button>
        </div>
      </div>
    </div>
  );
}

/** 🔴 (lot 6) Le compte rendu, APRÈS l'envoi : chaque mail (pour qui, parti ou non), et ce qui reste à faire autrement. */
function CompteRenduEnvoi({ fait, onFermer }: { fait: IssueEnvoi; onFermer: () => void }) {
  const partis = fait.envois.filter((e) => e.envoye).length;
  return (
    <div className="dcp-voile" data-dcp-compte-rendu>
      <div className="dcp-alerte dcp-fenetre" role="dialog" aria-modal="true" aria-labelledby="dcp-cr-titre" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onFermer(); } }}>
        <p className="dcp-alerte-titre" id="dcp-cr-titre">Changement enregistré</p>
        <p className="dcp-alerte-texte">{partis} mail{partis > 1 ? 's' : ''} parti{partis > 1 ? 's' : ''} sur {fait.envois.length}. Chacun est rangé dans l’historique du bien et de la personne.</p>
        <ul className="dcp-arbitrer-liste">{fait.envois.map((e, i) => (
          <li key={i} data-dcp-envoi={e.envoye ? 'parti' : 'echec'}><strong>{e.pour}</strong> — {e.envoye ? 'envoyé' : `non envoyé : ${e.motif ?? 'erreur'}`}</li>))}</ul>
        {fait.sansEmail.length > 0 && <p className="dcp-a-arbitrer dcp-sans-marge" data-dcp-cr-sans-email>À prévenir autrement (pas d’e-mail) : {fait.sansEmail.join(', ')}.</p>}
        {fait.exclus.length > 0 && <p className="loc-muet dcp-sans-marge">Non prévenus : {fait.exclus.join(' ; ')}.</p>}
        <div className="dcp-alerte-actions"><button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={onFermer} data-dcp-cr-fermer>Fermer</button></div>
      </div>
    </div>
  );
}

/** 🔴 (478) « À ARBITRER » : les places où des valeurs d'avant DIFFÉRENTES sont connues — « Garder ce code », confirmé. Rien n'est écrasé. */
function AArbitrer({ s, desactive, onArbitrer }: { s: readonly DigicodesAdresseSaisis[]; desactive: boolean; onArbitrer?: GesteDigicode }) {
  const [choix, setChoix] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const places = s.flatMap((d) => [...(d.communEtat && d.communEtat.aArbitrer.length > 0 ? [{ d, batiment: null as string | null, etat: d.communEtat }] : []),
    ...d.batiments.filter((b) => b.etat && b.etat.aArbitrer.length > 0).map((b) => ({ d, batiment: b.libelle as string | null, etat: b.etat as EtatPlaceDigicode }))]);
  if (places.length === 0) return null;
  return (
    <div className="dcp-arbitrer" role="region" aria-label="Digicodes à arbitrer" data-dcp-a-arbitrer>
      <p className="dcp-arbitrer-titre">À arbitrer</p>
      <p className="loc-muet dcp-sans-marge">Des valeurs différentes ont été saisies pour le même digicode (fiches d’avant). Rien n’a été choisi ni effacé : gardez la bonne.</p>
      {places.map((p) => (
        <div key={`${p.d.cle}#${p.batiment ?? ''}`} className="dcp-arbitrer-place" data-dcp-arbitrer-place={`${p.d.cle}#${p.batiment ?? ''}`}>
          <p className="dcp-titre">{adresseImmeuble(p.d.voie, p.d.codePostal, p.d.commune)} — {p.batiment === null ? 'digicode commun' : `bâtiment / cage ${p.batiment}`}</p>
          <ul className="dcp-arbitrer-liste">{p.etat.aArbitrer.map((c, i) => {
            const id = `${p.d.cle}#${p.batiment ?? ''}#${i}`;
            const v = c.digicode === false ? { digicode: false, code: null } : c.code ? { digicode: true, code: c.code } : null;
            return (
              <li key={id} data-dcp-candidat={id}><strong>{motValeur(c)}</strong> <span className="loc-muet">— {c.origines.join(' ; ')}</span>{' '}
                {onArbitrer !== undefined && v !== null && (choix === id ? <span className="dcp-confirmer">Garder {motValeur(c)} ? <button type="button" className="dcp-lien" disabled={envoi || desactive}
                  onClick={() => { setEnvoi(true); setErreur(null); void onArbitrer(p.d.cle, p.batiment, v).then((m) => { setEnvoi(false); setChoix(null); setErreur(m); }); }} data-dcp-garder-oui>Oui</button>{' '}
                  <button type="button" className="dcp-lien" disabled={envoi} onClick={() => setChoix(null)}>Non</button></span>
                  : <button type="button" className="svv-btn svv-btn-outline gst-btn dcp-mini" disabled={envoi || desactive} onClick={() => setChoix(id)} data-dcp-garder>Garder ce code</button>)}</li>);
          })}</ul>
        </div>))}
      {erreur !== null && <p className="cp-refus dcp-refus" role="alert">{erreur}</p>}
    </div>
  );
}

/** 🔴 (478) L'HISTORIQUE des digicodes de la copropriété (base unique : saisies, corrections, changements, reprises, arbitrages), le plus récent d'abord. */
function HistoriqueDigicodes({ s }: { s: readonly DigicodesAdresseSaisis[] }) {
  const lignes = s.flatMap((d) => [...(d.communEtat?.historique ?? []).map((h) => ({ h, d, place: 'digicode commun' })),
    ...d.batiments.flatMap((b) => (b.etat?.historique ?? []).map((h) => ({ h, d, place: `bâtiment ${b.libelle}` })))])
    .sort((a, b) => new Date(b.h.creeLe).getTime() - new Date(a.h.creeLe).getTime() || b.h.id - a.h.id);
  if (lignes.length === 0) return null;
  return (
    <details className="dcp-historique" data-dcp-historique>
      <summary>Historique des digicodes ({lignes.length})</summary>
      <ul className="dcp-arbitrer-liste">{lignes.map(({ h, d, place }) => (
        <li key={h.id} data-dcp-historique-ligne={h.nature}>{dateHeure(h.creeLe)} — {d.voie}, {place} : <strong>{motValeur(h)}</strong> — {MOT_NATURE[h.nature] ?? h.nature}
          {h.nature === 'changement' ? `, à partir du ${dateHeure(h.appliqueLe)}` : ''}{h.annule ? ' (annulé)' : ''} <span className="loc-muet">— {h.par}</span></li>))}</ul>
    </details>
  );
}

// ══ 🔴🔴 (« Digicodes unifiés », lot 4) LA FICHE DU BIEN EN LOCATION : LE MÊME COMPOSANT ═══════════════════════════════════════════════════════

/** Ce que la fiche du bien lit du serveur (`digicodesPourBien`) — la forme de la fiche Copropriété pour SA place. */
export interface DigicodesPourBienLu {
  adresseCle: string; adresse: NonNullable<FicheCopropriete['digicodes']>[number]; connus: BatimentConnu[]; nomenclature: Nomenclature | null;
  copropriete: { cle: string; libelle: string; codePostal: string | null; commune: string | null }; batiment: string | null; batimentLie: boolean; escalier: string | null;
}

/** Une réponse du serveur est-elle bien des digicodes d'un bien (sinon : `null`, comme une base sans la 478) ? PUR. */
export const digicodesBienLisibles = (x: unknown): DigicodesPourBienLu | null => {
  const d = x as Partial<DigicodesPourBienLu> | null | undefined;
  return d !== null && d !== undefined && typeof d === 'object' && typeof d.adresse?.cle === 'string' && Array.isArray(d.adresse?.batiments) && Array.isArray(d.connus) ? d as DigicodesPourBienLu : null;
};

/** La saisie de départ de la fiche du bien (sa place seulement). PUR. */
export const saisieDigicodesBien = (d: DigicodesPourBienLu): DigicodesAdresseSaisis => saisieDigicodesInitiale({ digicodes: [d.adresse] })[0];

/**
 * 🔴 (17/11/2026) L'ADRESSE DU BIEN CHANGE (ou arrive) : la place se relit, et ce qui a DÉJÀ été saisi pour une place encore sans code connu
 * est REPORTÉ (rien n'est perdu ; un code connu de la nouvelle place, lui, se lit et n'est jamais écrasé). PUR.
 */
export function reporterSaisieBien(avant: DigicodesAdresseSaisis | null, apres: DigicodesAdresseSaisis): DigicodesAdresseSaisis {
  if (avant === null) return apres;
  const commun = !placeLue(apres.communEtat) && !memes(avant.commun, avant.communInitial) ? avant.commun : apres.commun;
  let batiments = apres.batiments;
  for (const l of avant.batiments) {
    if (placeLue(l.etat) || memes(l, l.initial)) continue;
    const cle = batimentDe(l.libelle)?.cle;
    const ici = batiments.find((x) => batimentDe(x.libelle)?.cle === cle);
    if (ici === undefined) batiments = [...batiments, { ...l, etat: undefined, initial: { code: '', aucun: false } }];
    else if (!placeLue(ici.etat)) batiments = batiments.map((x) => (x === ici ? { ...x, code: l.code, aucun: l.aucun } : x));
  }
  return { ...apres, commun, batiments };
}

/** La ligne du bâtiment CHOISI (celle de la place, ou une ligne nouvelle à saisir) ; `null` sans bâtiment. PUR. */
export function ligneDuBatiment(s: DigicodesAdresseSaisis, batiment: string): LigneBatiment | null {
  const b = batimentDe(batiment);
  if (b === null) return null;
  return s.batiments.find((x) => batimentDe(x.libelle)?.cle === b.cle) ?? { k: `choisi-${b.cle}`, libelle: b.libelle, code: '', aucun: false, nouveau: false, initial: { code: '', aucun: false } };
}

/**
 * Ce que la fiche du bien ENVOIE : le bâtiment choisi (et sa confirmation), et la PREMIÈRE valeur des places sans code connu (un code connu ne
 * part jamais d'ici : « Corriger une erreur »). PUR.
 */
export function digicodesBienEnvoi(s: DigicodesAdresseSaisis, batiment: string, confirme: boolean): { batiment: string | null; batimentConfirme: boolean;
  commun: CodeLigne | null; codeBatiment: CodeLigne | null } {
  const ligne = batiment.trim() === '' ? null : ligneDuBatiment(s, batiment);
  const libre = (e: EtatPlaceDigicode | undefined, c: CodeLigne, init: CodeLigne): CodeLigne | null => (placeLue(e) || memes(c, init) ? null : { code: c.code.trim(), aucun: c.aucun });
  return { batiment: ligne === null ? null : ligne.libelle, batimentConfirme: confirme, commun: libre(s.communEtat, s.commun, s.communInitial),
    codeBatiment: ligne === null ? null : libre(ligne.etat, ligne, ligne.initial) };
}

/**
 * LE BÂTIMENT (ou la cage) DU BIEN, CHOISI DANS LE MENU de la copropriété — le même menu, la même règle lettres / chiffres et la même fenêtre
 * d'avertissement que la fiche Copropriété ; « Aucun bâtiment » : le bien lit le code commun. L'« Escalier » du bien PROPOSE le bon choix quand
 * c'est un bâtiment connu (rien n'est écrasé).
 */
export function ChoixBatimentCopro({ valeur, connus, nomenclature, escalier, desactive, onChoix, variante = 'gestion' }: {
  valeur: string; connus: readonly BatimentConnu[]; nomenclature: Nomenclature | null; escalier: string; desactive: boolean;
  onChoix: (libelle: string, confirme: boolean) => void;
  /** 🔴 (17/11/2026) l'habillage de la page Location : le champ prend le gabarit des autres champs de la grille (`loc-champ`) */
  variante?: 'gestion' | 'location';
}) {
  const [ouvert, setOuvert] = useState(false);
  const [alerte, setAlerte] = useState<AvertissementBatiment | null>(null);
  const options = menuBatiments(connus);
  const choisir = (libelle: string): void => {
    setOuvert(false);
    const a = libelle.trim() === '' ? null : avertissementBatiment(libelle, nomenclature, connus);
    if (a !== null) { setAlerte(a); onChoix(libelle, false); return; }
    onChoix(libelle.trim() === '' ? '' : batimentDe(libelle)?.libelle ?? libelle, false);
  };
  /* 🔴 (Arno, 17/11/2026 : « « Bâtiment / cage » et « Escalier » traitent la même information » — le champ « Escalier » est retiré) un bien qui
     a un escalier noté et pas encore de bâtiment : sa valeur est PROPOSÉE (« Escalier noté : 2 — choisir ce bâtiment ? »), jamais écrite toute seule ;
     un bâtiment connu de la copropriété est repris tel qu'au registre, sinon c'est un nouveau bâtiment (même avertissement de numérotation) */
  const proposeEscalier = valeur.trim() === '' && escalier.trim() !== ''
    ? (options.find((o) => o.cle === batimentDe(escalier)?.cle) ?? { libelle: escalier.trim() }) : undefined;
  return (
    <div className={`${variante === 'location' ? 'loc-champ dcp-cbc--location ' : ''}dcp-champ dcp-champ-bat`} data-cbc>
      {/* 🔴 (Arno, 17/11/2026) renommé « Bâtiment / cage d'escalier » ; un texte d'aide court, entier à 390 px comme à l'ordinateur */}
      <span>{LIBELLE_BATIMENT_CAGE}</span>
      <input value={valeur} disabled={desactive} placeholder="ex. A ou 1 (facultatif)" aria-expanded={ouvert} maxLength={60} aria-label={LIBELLE_BATIMENT_CAGE}
        onFocus={() => setOuvert(true)} onClick={() => setOuvert(true)} onChange={(e) => { onChoix(e.target.value, false); setOuvert(true); }}
        onBlur={(e) => { const v = e.target.value; setTimeout(() => setOuvert(false), 180); if (v.trim() !== '') choisir(v); }}
        onKeyDown={(e) => { if (e.key === 'Escape') setOuvert(false); if (e.key === 'Enter') { e.preventDefault(); choisir((e.target as HTMLInputElement).value); } }}
        data-cbc-champ />
      {ouvert && (
        <ul className="dcp-menu" role="listbox" aria-label="Bâtiments connus de la copropriété" data-cbc-menu>
          {options.filter((o) => valeur.trim() === '' || o.cle.includes(batimentDe(valeur)?.cle ?? '')).map((o) => (
            <li key={o.cle}><button type="button" role="option" aria-selected={batimentDe(valeur)?.cle === o.cle} className="dcp-option" onMouseDown={(e) => e.preventDefault()}
              onClick={() => choisir(o.libelle)} data-cbc-option={o.libelle}>{o.libelle}</button></li>))}
          <li><button type="button" className="dcp-option" onMouseDown={(e) => e.preventDefault()} onClick={() => { setOuvert(false); onChoix('', false); }} data-cbc-aucun>Aucun bâtiment (code commun)</button></li>
          <li><button type="button" className="dcp-option dcp-option--nouveau" onMouseDown={(e) => e.preventDefault()} onClick={() => { onChoix('', false); setOuvert(false); }} data-cbc-nouveau>Ajouter nouveau bâtiment</button></li>
        </ul>)}
      {proposeEscalier !== undefined && (
        <button type="button" className="dcp-lien" disabled={desactive} onClick={() => choisir(proposeEscalier.libelle)} data-cbc-escalier>
          Escalier noté : {escalier.trim()} — choisir ce bâtiment ?</button>)}
      {alerte !== null && (
        <div className="dcp-voile" data-dcp-avertissement>
          <div className="dcp-alerte" role="alertdialog" aria-modal="true" aria-labelledby="cbc-alerte-titre" aria-describedby="cbc-alerte-texte"
            onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); (e.currentTarget.querySelector('[data-dcp-corriger]') as HTMLButtonElement | null)?.click(); } }}>
            <p className="dcp-alerte-titre" id="cbc-alerte-titre">{TITRE_AVERTISSEMENT}</p>
            <div id="cbc-alerte-texte">{texteAvertissement(alerte).map((t) => <p key={t} className="dcp-alerte-texte">{t}</p>)}</div>
            <div className="dcp-alerte-actions">
              <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => {
                setAlerte(null); onChoix('', false);
                setTimeout(() => (document.querySelector('[data-cbc-champ]') as HTMLInputElement | null)?.focus(), 0);
              }} data-dcp-corriger>Corriger</button>
              <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={() => { const a = alerte; setAlerte(null); onChoix(a.libelle, true); }} data-dcp-confirmer>Confirmer cet intitulé</button>
            </div>
          </div>
        </div>)}
      <style>{CSS_DIGICODES_COPRO}</style>
    </div>
  );
}

/**
 * LES DIGICODES DU BIEN : le composant unique (`DigicodesCopropriete`, mode « bien ») sur SA place — le code commun de l'adresse et celui de SON
 * bâtiment ; un code connu se lit (« Corriger une erreur »), une place sans code se saisit (première valeur, avec l'enregistrement du bien).
 */
export function DigicodesBien({ donnees, s, onChange, batiment, desactive, onCorriger, onArbitrer, onPlanifier, onAnnulerChangement, onApercu, onEnvoyer, variante, onPlusBatiment }: {
  donnees: DigicodesPourBienLu; s: DigicodesAdresseSaisis; onChange: (s: DigicodesAdresseSaisis) => void; batiment: string; desactive: boolean;
  onCorriger?: GesteDigicode; onArbitrer?: GesteDigicode; onPlanifier?: PlanifierDigicodes; onAnnulerChangement?: AnnulerChangementDigicode;
  onApercu?: ApercuDigicodes; onEnvoyer?: EnvoyerDigicodes;
  variante?: 'gestion' | 'location'; onPlusBatiment?: () => void;
}) {
  const ligne = batiment.trim() === '' ? null : ligneDuBatiment(s, batiment);
  const vue: DigicodesAdresseSaisis = { ...s, batiments: ligne === null ? [] : [ligne] };
  const recevoir = (ns: DigicodesAdresseSaisis[]): void => {
    const n = ns[0];
    const l = n.batiments[0];
    const batiments = l === undefined ? s.batiments : s.batiments.some((x) => x.k === l.k) ? s.batiments.map((x) => (x.k === l.k ? l : x)) : [...s.batiments, l];
    onChange({ ...s, commun: n.commun, batiments });
  };
  return <div data-digicodes-bien>
    <DigicodesCopropriete s={[vue]} onChange={recevoir} connus={donnees.connus} nomenclature={donnees.nomenclature} desactive={desactive} modeBien
      {...(variante ? { variante } : {})} {...(onPlusBatiment ? { onPlusBatiment } : {})}
      {...(onCorriger ? { onCorriger } : {})} {...(onArbitrer ? { onArbitrer } : {})} {...(onPlanifier ? { onPlanifier } : {})} {...(onAnnulerChangement ? { onAnnulerChangement } : {})}
      {...(onApercu ? { onApercu } : {})} {...(onEnvoyer ? { onEnvoyer } : {})} />
  </div>;
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
.dcp-lue{display:flex;flex-direction:column;gap:4px;flex:1 1 220px;min-width:0}
.dcp-lue-titre{font-size:.85rem;font-weight:700;color:var(--color-svv-ink)}
.dcp-lue-valeur{min-height:36px;display:flex;flex-wrap:wrap;align-items:center;gap:4px;color:var(--color-svv-ink);overflow-wrap:anywhere}
.dcp-a-arbitrer{color:var(--color-svv-orange);font-weight:800}
.dcp-a-venir{font-size:.85rem;font-weight:700;color:var(--color-svv-ink);padding:4px 8px;border-radius:8px;background:var(--color-svv-orange-soft)}
.dcp-lien{align-self:flex-start;border:0;background:transparent;color:var(--color-svv-ink);text-decoration:underline;cursor:pointer;padding:4px 0;min-height:32px;font:inherit;font-weight:700}
.dcp-correction{display:flex;flex-direction:column;gap:8px;padding:10px;border-radius:10px;border:1px solid var(--color-svv-line-strong);background:var(--color-svv-surface)}
.dcp-correction-texte{margin:0;line-height:1.4;font-size:.88rem}
.dcp-arbitrer{display:flex;flex-direction:column;gap:8px;padding:10px 12px;border-radius:10px;border:1px solid var(--color-svv-orange);background:var(--color-svv-orange-soft);min-width:0}
.dcp-arbitrer-titre{margin:0;font-weight:900;text-transform:uppercase;letter-spacing:.05em;font-size:.82rem;color:var(--color-svv-ink)}
.dcp-arbitrer-place{display:flex;flex-direction:column;gap:4px}
.dcp-arbitrer-liste{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px;overflow-wrap:anywhere}
.dcp-mini{min-height:40px}
.dcp-confirmer{font-weight:700}
.dcp-sans-marge{margin:0}
.dcp-mention{margin:0;font-size:.82rem;flex-basis:100%}
.dcp-gestes{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px}
.dcp-total{margin:0;font-weight:800;color:var(--color-svv-ink)}
.dcp-dest-groupe{display:flex;flex-direction:column;gap:4px;padding:8px 10px;border-radius:10px;background:var(--color-svv-field)}
.dcp-dest-logement{display:flex;flex-direction:column;gap:2px;padding:4px 0}
.dcp-dest-codes{font-size:.85rem}
.dcp-fenetre{width:min(560px,100%);max-height:calc(100dvh - 32px);overflow-y:auto}
.dcp-modifier-ligne{display:flex;flex-direction:column;gap:6px;padding:8px 0;border-bottom:1px solid var(--color-svv-line)}
.dcp-historique summary{cursor:pointer;font-weight:800;min-height:36px;display:flex;align-items:center;color:var(--color-svv-ink)}
.dcp-historique{font-size:.88rem}
@media (max-width:600px){.dcp-alerte-actions .svv-btn{flex:1 1 100%}}
.dcp-titre-vide{margin:0;font-size:.95rem}
.dcp--location{gap:14px}
.dcp--location .dcp-adresse{background:transparent;padding:0;gap:14px}
.dcp--location .dcp-titre{font-size:1rem;font-weight:700}
.dcp--location .dcp-ligne{gap:12px 14px}
.dcp--location .dcp-champ{font-size:1rem;font-weight:600;gap:8px;flex:1 1 230px}
.dcp--location .dcp-champ input{min-height:58px;font-size:1.1rem;border-radius:16px;border:2px solid var(--color-svv-line);padding:0 16px}
.dcp--location .dcp-champ input:focus{border-color:var(--color-svv-ink);outline:none}
.dcp--location .dcp-aucun{min-height:54px;padding:0 20px;border-radius:999px;border:2px solid var(--color-svv-line-strong);background:var(--color-svv-surface);font-size:1rem;font-weight:700;cursor:pointer}
.dcp--location .dcp-aucun input{width:1.1rem;height:1.1rem;accent-color:var(--color-svv-red)}
.dcp--location .dcp-plus{min-width:54px;min-height:54px;border-width:2px;font-size:1.4rem}
.dcp--location .dcp-lue{padding:14px 16px;border:2px solid var(--color-svv-line);border-radius:16px;background:var(--color-svv-surface)}
.dcp--location .dcp-lue-titre{font-size:1rem;font-weight:600}
.dcp--location .dcp-lue-valeur strong{font-size:1.15rem}
.dcp--location .dcp-mini{min-height:52px;border-radius:999px;border-width:2px;padding:0 22px;font-size:1.02rem;width:auto;flex:0 0 auto}
.dcp--location .dcp-gestes{display:flex;flex-direction:row;flex-wrap:wrap;align-items:center;justify-content:flex-start;gap:10px 18px}
.dcp--location .dcp-ligne{align-items:center}
.dcp--location .dcp-lue{flex:1 1 260px}
.dcp--location .dcp-lien{min-height:44px;font-size:1rem}
.dcp--location .dcp-mention{font-size:.9rem}
.dcp-cbc--location{position:relative}
/* 🔴 (Arno, 17/11/2026) le champ d'un digicode et ses deux boutons (« pas de digicode », « + ») : même ligne, même hauteur, centrés */
.dcp--location .dcp-ligne:has(> .dcp-champ){align-items:flex-end;flex-wrap:nowrap}
.dcp--location .dcp-ligne:has(> .dcp-champ) > .dcp-champ{flex:1 1 auto;min-width:0}
.dcp--location .dcp-ligne:has(> .dcp-champ) > .dcp-aucun,.dcp--location .dcp-ligne:has(> .dcp-champ) > .dcp-plus,.dcp--location .dcp-ligne:has(> .dcp-champ) > .dcp-retirer{flex:0 0 auto;box-sizing:border-box;height:58px;min-height:58px;align-self:flex-end;display:inline-flex;align-items:center;justify-content:center}
.dcp--location .dcp-ligne:has(> .dcp-champ) > .dcp-plus{width:58px;padding:0}
.dcp--location .dcp-aucun{white-space:nowrap}
.dcp--location .dcp-ligne.dcp-ligne--batiment:has(> .dcp-champ){flex-wrap:wrap}
.dcp--location .dcp-ligne.dcp-ligne--batiment > .dcp-champ.dcp-champ-bat{flex:1 1 100%}
.dcp--location .dcp-ligne.dcp-ligne--batiment > .dcp-champ:not(.dcp-champ-bat){flex:1 1 0;min-width:110px}
.dcp--location .dcp-ligne--batiment > .dcp-mention{flex:1 1 100%}
@media (max-width:600px){
  .dcp--location .dcp-aucun{padding:0 10px;font-size:.86rem;gap:6px;white-space:normal;line-height:1.1;max-width:7.2rem;text-align:left}
  .dcp--location .dcp-ligne:has(> .dcp-champ){gap:8px}
  .dcp--location .dcp-champ input{padding:0 12px}
  .dcp--location .dcp-champ > span{white-space:nowrap}
}
.dcp-cbc--location > span{font-size:1rem;font-weight:600;color:var(--color-svv-ink)}
`;
