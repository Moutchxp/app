'use client';

import { useEffect, useRef, useState } from 'react';
import { avertissementBatiment, avertissementsDesBatiments, batimentDe, LIBELLE_BATIMENT_CAGE, menuBatiments, type AvertissementBatiment, type BatimentConnu, type Nomenclature } from '../../../../lib/gestion/batimentsCopropriete';
import { adresseImmeuble } from '../../../../lib/gestion/syndics';
import type { EtatPlaceDigicode, FicheCopropriete } from '../../../../lib/gestion/copropriete';
import { dateHeure, instantDepuisParis, MAX_CODE_DIGICODE_UNIFIE } from '../../../../lib/gestion/digicodes';
import { bilanEnvoi, codesEnLigne, enteteLogement, locataireCochable, proprietairesRegroupes, resumeChangements, totalSelection, type ApercuEnvoi, type IssueEnvoi, type LogementDest, type ModePrevenir } from '../../../../lib/gestion/digicodesEnvoi';
import { adressesUniques, prenomNom } from '../../../../lib/location/mailsPreavisSortie';

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
  etat?: EtatPlaceDigicode; nb?: number;
  /** 🔴 (Arno, 17/11/2026 : « UNE LIGNE PAR BÂTIMENT […] supprime l'en-tête « Bâtiment / cage » et la ligne qui affiche le nom seul (ex. « 1 »). L'intitulé du champ devient « Digicode bâtiment 1 » […] Pour une nouvelle ligne pas encore nommée, l'intitulé reste le menu de choix du bâtiment, puis devient « Digicode bâtiment X » une fois validé. ») : le nom d'une NOUVELLE ligne a été choisi (menu, « + Ajouter … », encadré) — l'intitulé devient « Digicode bâtiment X » */
  choisi?: boolean }
/** L'intitulé d'une ligne de bâtiment : « Digicode bâtiment 1 », « Digicode bâtiment Côté cour ». PUR. */
export const intituleDigicodeBatiment = (libelle: string): string => `Digicode bâtiment ${libelle}`;
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
/** 🔴 (Arno, 17/11/2026) un code qui change : sa place, sa valeur, SA date (instant) et si une heure a été donnée */
export type ChangementEcran = { batiment: string | null; digicode: boolean; code: string | null; appliqueLe: string; avecHeure: boolean };
export type PlanifierDigicodes = (adresseCle: string, appliqueLe: string, changements: ChangementEcran[]) => Promise<string | null>;
export type AnnulerChangementDigicode = (adresseCle: string, ligneId: number) => Promise<string | null>;
/** 🔴 (lot 6) l'écran des destinataires d'un changement proposé, puis « Enregistrer et envoyer » ; un `string` : le refus. */
export type ApercuDigicodes = (adresseCle: string, appliqueLe: string, changements: ChangementEcran[]) => Promise<ApercuEnvoi | string>;
export type EnvoyerDigicodes = (adresseCle: string, appliqueLe: string, changements: ChangementEcran[], proprietaires: boolean,
  /** 🔴🔴 (Arno, 17/11/2026 : « DEUX CHOIX, obligatoires, après la saisie : A. « Prévenir la Gestion seulement » […] B. « Écrire maintenant aux locataires » : affiche la liste des destinataires, regroupée par logement (un bloc par logement, avec son adresse, son bâtiment et son étage/porte) ; dans chaque bloc, une ligne par locataire avec une case cochée par défaut, décochable une à une ; total « N logements · M locataires sélectionnés » mis à jour en direct […] En bas : « Valider la mise à jour et envoyer ». ») le choix et les locataires décochés (leurs occupations) */
  options?: OptionsPrevenir) => Promise<IssueEnvoi | string>;
export interface OptionsPrevenir { mode: ModePrevenir; decoches: number[] }

let n = 0;
const k = (): string => `b${++n}`;
const versLigne = (d: { digicode: boolean | null; code: string | null }): CodeLigne => ({ code: d.code ?? '', aucun: d.digicode === false });
const memes = (a: CodeLigne, b: CodeLigne): boolean => a.aucun === b.aucun && a.code.trim() === b.code.trim();

/**
 * 🔴🔴 (Arno, 17/11/2026 : « Chaque bâtiment créé dans la copropriété doit avoir SA ligne, visible et persistante (créé, connu en base ou en attente
 * d'enregistrement). ») Les bâtiments connus (registre de la copropriété, bâtiments de ses biens) et ceux en attente d'enregistrement qui n'ont pas
 * encore de ligne en reçoivent une, à saisir (aucune valeur inventée) ; un bâtiment qui a déjà sa ligne n'est jamais répété. PUR.
 */
export function avecTousLesBatiments(lignes: readonly LigneBatiment[], connus: readonly Pick<BatimentConnu, 'cle' | 'libelle'>[], deja: ReadonlySet<string> = new Set()): LigneBatiment[] {
  const vus = new Set([...deja, ...lignes.map((b) => batimentDe(b.libelle)?.cle).filter((x): x is string => x !== undefined)]);
  const plus: LigneBatiment[] = [];
  for (const c of connus) {
    if (vus.has(c.cle)) continue;
    vus.add(c.cle);
    plus.push({ k: `bat-${c.cle}`, libelle: c.libelle, code: '', aucun: false, nouveau: false, initial: { code: '', aucun: false } });
  }
  return plus.length === 0 ? [...lignes] : [...lignes, ...plus].sort((x, y) => (x.nouveau === y.nouveau ? x.libelle.localeCompare(y.libelle, 'fr', { numeric: true, sensitivity: 'base' }) : x.nouveau ? 1 : -1));
}

/** La saisie de départ, d'après ce que la fiche a lu ; les bâtiments du registre sans ligne en reçoivent une (à la première adresse). PUR. */
export function saisieDigicodesInitiale(f: Pick<FicheCopropriete, 'digicodes'> & { batimentsConnus?: readonly BatimentConnu[] }): DigicodesAdresseSaisis[] {
  const lues = saisieDigicodesLues(f);
  if (lues.length === 0 || (f.batimentsConnus ?? []).length === 0) return lues;
  const ailleurs = new Set(lues.slice(1).flatMap((d) => d.batiments.map((b) => batimentDe(b.libelle)?.cle).filter((x): x is string => x !== undefined)));
  return [{ ...lues[0], batiments: avecTousLesBatiments(lues[0].batiments, f.batimentsConnus ?? [], ailleurs) }, ...lues.slice(1)];
}
function saisieDigicodesLues(f: Pick<FicheCopropriete, 'digicodes'>): DigicodesAdresseSaisis[] {
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

export function DigicodesCopropriete({ s, onChange, connus, nomenclature, desactive, onCorriger, onArbitrer, onPlanifier, onAnnulerChangement, onApercu, onEnvoyer, modeBien = false, variante = 'gestion', onPlusBatiment, tente = false, concerne }: {
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
  /** 🔴 (Arno, 17/11/2026 : « Le message n'apparaît qu'après une tentative de validation, sous la ligne, entièrement lisible ») une validation a été tentée */
  tente?: boolean;
  /** 🔴 (Arno, 17/11/2026 : LISERÉ) la fiche du bien : le bâtiment choisi (sa clé ; `null` : aucun) — sa ligne et celle de la copropriété sont entourées ;
   *  absent (fiche Copropriété) : aucun liseré */
  concerne?: string | null;
}) {
  /** la ligne touche-t-elle le logement ? (la copropriété : toujours, dès qu'il y a un bien ; un bâtiment : le sien) */
  const lisere = (cle: string | null): { className: string; 'data-dcp-concerne'?: '' } => (concerne === undefined || (cle !== null && cle !== concerne)
    ? { className: '' } : { className: ' dcp-ligne--concerne', 'data-dcp-concerne': '' });
  const [menu, setMenu] = useState<string | null>(null);
  // 🔴 (lot 5) la fenêtre « Modifier » : l'adresse et le code d'où on l'a ouverte (pré-coché)
  const [modifier, setModifier] = useState<{ cle: string; place: string } | null>(null);
  /** L'avertissement d'un NOUVEL intitulé pour une ligne (la fenêtre s'ouvre dans le champ du bâtiment), s'il ne suit pas la numérotation. */
  // 🔴 Arno (16/11/2026) — seul un intitulé NOUVEAU qui ne suit pas la numérotation ouvre la fenêtre : un intitulé déjà présent dans la
  // copropriété (déjà accepté, ou saisi plus haut pour une autre adresse) se choisit à nouveau sans fenêtre ; la saisie en cours compte
  // (le premier bâtiment saisi peut fixer la règle)
  const avertirLigne = (cle: string, k: string, libelle: string): AvertissementBatiment | null => {
    const suivante = s.map((d) => (d.cle === cle ? { ...d, batiments: d.batiments.map((b) => (b.k === k ? { ...b, libelle, confirme: null } : b)) } : d));
    return avertissementsSaisie(suivante, nomenclature, connus).get(k) ?? null;
  };
  /* 🔴🔴 (Arno, 17/11/2026 : « rends la différence visible : un code DÉJÀ ENREGISTRÉ s'affiche en lecture (le code en clair, pas un champ), avec « Modifier »
     (changement daté, fenêtre existante) et « Corriger » ; un code EN COURS DE SAISIE reste un champ, avec la mention discrète « nouveau — enregistré avec le
     bien » (ou « …avec la copropriété ») ») — la mention, sous un champ dès qu'on y a saisi quelque chose (un code, ou « pas de digicode ») */
  const mentionNouveau = (c: CodeLigne): React.ReactNode => (c.code.trim() === '' && !c.aucun ? null
    : <p className="loc-muet dcp-nouveau" data-dcp-nouveau>nouveau — enregistré avec {modeBien ? 'le bien' : 'la copropriété'}</p>);
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
            <div className={`dcp-ligne${lisere(null).className}`} data-dcp-commun {...(lisere(null)['data-dcp-concerne'] !== undefined ? { 'data-dcp-concerne': '' } : {})}>
              <PlaceDigicodeLue titre="Digicode copropriété" enLigne={variante === 'location'} etat={d.communEtat} desactive={desactive} onCorriger={onCorriger === undefined ? undefined : (v) => onCorriger(d.cle, null, v)}
                onModifier={onPlanifier === undefined ? undefined : () => setModifier({ cle: d.cle, place: '' })}
                onAnnulerChangement={onAnnulerChangement === undefined ? undefined : (id) => onAnnulerChangement(d.cle, id)} />
              {plus(d)}
            </div>) : (
          <div className={`dcp-ligne${lisere(null).className}`} data-dcp-commun {...(lisere(null)['data-dcp-concerne'] !== undefined ? { 'data-dcp-concerne': '' } : {})}>
            {/* 🔴 (Arno, 17/11/2026) le code, « pas de digicode » et « + » : un groupe qui ne se coupe jamais (toujours sur la même ligne) */}
            <span className="dcp-code-groupe">
            <label className="dcp-champ dcp-champ-code"><span>Digicode copropriété</span>
              <input value={d.commun.code} disabled={desactive || d.commun.aucun} placeholder={d.commun.aucun ? 'pas de digicode' : 'facultatif'} maxLength={MAX_CODE_DIGICODE_UNIFIE}
                onChange={(e) => maj(d.cle, (x) => ({ ...x, commun: { ...x.commun, code: e.target.value } }))} data-dcp-code-commun /></label>
            <label className="dcp-aucun"><input type="checkbox" checked={d.commun.aucun} disabled={desactive}
              onChange={(e) => maj(d.cle, (x) => ({ ...x, commun: { code: e.target.checked ? '' : x.commun.code, aucun: e.target.checked } }))} /><span>pas de digicode</span></label>
            {plus(d)}
            </span>
            {mentionNouveau(d.commun)}
          </div>)}
          {d.communNb !== undefined && <p className="loc-muet dcp-mention" data-dcp-mention-commun>{mentionNb(d.communNb, null)}</p>}
          {d.batiments.map((b) => (placeLue(b.etat) && !b.nouveau ? (
            <div key={b.k} className={`dcp-ligne dcp-ligne--batiment${lisere(batimentDe(b.libelle)?.cle ?? '').className}`} data-dcp-batiment={b.libelle}
              {...(lisere(batimentDe(b.libelle)?.cle ?? '')['data-dcp-concerne'] !== undefined ? { 'data-dcp-concerne': '' } : {})}>
              <PlaceDigicodeLue titre={intituleDigicodeBatiment(b.libelle)} enLigne etat={b.etat} desactive={desactive} onCorriger={onCorriger === undefined ? undefined : (v) => onCorriger(d.cle, b.libelle, v)}
                onModifier={onPlanifier === undefined ? undefined : () => setModifier({ cle: d.cle, place: batimentDe(b.libelle)?.cle ?? '' })}
                onAnnulerChangement={onAnnulerChangement === undefined ? undefined : (id) => onAnnulerChangement(d.cle, id)} />
              {b.nb !== undefined && <p className="loc-muet dcp-mention" data-dcp-mention-batiment>{mentionNb(b.nb, b.libelle)}</p>}
            </div>) : (
            <div key={b.k} className={`dcp-ligne dcp-ligne--batiment${b.nouveau ? '' : lisere(batimentDe(b.libelle)?.cle ?? '').className}`} data-dcp-batiment={b.nouveau ? 'nouveau' : b.libelle}
              {...(!b.nouveau && lisere(batimentDe(b.libelle)?.cle ?? '')['data-dcp-concerne'] !== undefined ? { 'data-dcp-concerne': '' } : {})}>
              {/* 🔴 (Arno, 17/11/2026 : « UNE LIGNE PAR BÂTIMENT […] supprime l'en-tête « Bâtiment / cage » et la ligne qui affiche le nom seul (ex. « 1 »). L'intitulé du champ devient « Digicode bâtiment 1 » […] Pour une nouvelle ligne pas encore nommée, l'intitulé reste le menu de choix du bâtiment, puis devient « Digicode bâtiment X » une fois validé. ») */}
              {b.nouveau && <div className={b.choisi === true ? 'dcp-champ-bat-replie' : 'dcp-champ dcp-champ-bat'}>
                {b.choisi !== true && <span>Bâtiment / cage</span>}
                <>
                  {/* 🔴 (Arno, 17/11/2026) le COMPOSANT UNIQUE du choix / de l'ajout d'un bâtiment (menu superposé, « + Ajouter le bâtiment … »,
                      encadré « Ajouter nouveau bâtiment », avertissement de numérotation) */}
                  <ChampBatiment cle={b.k} marque="dcp" contexte="copropriete" valeur={b.libelle} desactive={desactive} nomenclature={nomenclature} ouvrirAuDebut={menu === b.k}
                    connus={[...connus, ...s.flatMap((x) => x.batiments.filter((y) => y.k !== b.k).map((y) => batimentDe(y.libelle))).filter((y): y is BatimentConnu => y !== null)]}
                    avertir={(nom) => avertirLigne(d.cle, b.k, nom)} placeholder="A, 1, Côté cour…"
                    onSaisie={(v) => majLigne(d.cle, b.k, { libelle: v, confirme: null, choisi: false })}
                    onChoix={(l, c) => majLigne(d.cle, b.k, { libelle: l, confirme: c ? (batimentDe(l)?.cle ?? null) : null, choisi: batimentDe(l) !== null })}
                    replie={b.choisi === true} />
                </>
              </div>}
              <span className="dcp-code-groupe">
              <label className="dcp-champ dcp-champ-code"><span data-dcp-intitule-batiment={b.nouveau && b.choisi !== true ? undefined : b.libelle}>{b.nouveau && b.choisi !== true ? 'Digicode' : intituleDigicodeBatiment(b.libelle)}</span>
                <input value={b.code} disabled={desactive || b.aucun} placeholder={b.aucun ? 'pas de digicode' : 'code'} maxLength={MAX_CODE_DIGICODE_UNIFIE} onChange={(e) => majLigne(d.cle, b.k, { code: e.target.value })} data-dcp-code-batiment /></label>
              <label className="dcp-aucun"><input type="checkbox" checked={b.aucun} disabled={desactive} onChange={(e) => majLigne(d.cle, b.k, { aucun: e.target.checked, code: e.target.checked ? '' : b.code })} /><span>pas de digicode</span></label>
              {b.nouveau && <button type="button" className="dcp-retirer" aria-label="Retirer cette ligne (rien n'est encore enregistré)" onClick={() => maj(d.cle, (x) => ({ ...x, batiments: x.batiments.filter((y) => y.k !== b.k) }))} data-dcp-retirer-ligne>×</button>}
              </span>
              {mentionNouveau(b)}
              {b.etat !== undefined && !b.nouveau && <p className="loc-muet dcp-mention" data-dcp-mention-batiment>Sans code propre : ses biens lisent le digicode copropriété.</p>}
              {tente && b.nouveau && batimentDe(b.libelle) === null && <p className="dcp-ligne-erreur" role="alert" data-dcp-erreur-ligne>Donnez un nom au bâtiment ou à la cage d’escalier.</p>}
            </div>)))}
        </div>))}
      {/* le refus d'ensemble (ex. numérotation non confirmée) : seulement après une tentative ; le nom manquant se dit sous SA ligne */}
      {tente && refus !== null && !s.some((d) => d.batiments.some((b) => b.nouveau && batimentDe(b.libelle) === null))
        && <p className="dcp-ligne-erreur" role="alert" data-dcp-refus>{refus}</p>}
      <HistoriqueDigicodes s={s} />
      {modifier !== null && onPlanifier !== undefined && s.find((d) => d.cle === modifier.cle) !== undefined && (
        <FenetreModifier d={s.find((d) => d.cle === modifier.cle) as DigicodesAdresseSaisis} depart={modifier.place} onFermer={() => setModifier(null)}
          onValider={(appliqueLe, changements) => onPlanifier(modifier.cle, appliqueLe, changements)}
          {...(onApercu && onEnvoyer ? { onApercu: (appliqueLe: string, ch: Parameters<ApercuDigicodes>[2]) => onApercu(modifier.cle, appliqueLe, ch),
            onEnvoyer: (appliqueLe: string, ch: Parameters<ApercuDigicodes>[2], p: boolean, o?: OptionsPrevenir) => onEnvoyer(modifier.cle, appliqueLe, ch, p, o) } : {})} />)}
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
function PlaceDigicodeLue({ titre, etat, desactive, onCorriger, onModifier, onAnnulerChangement, enLigne = false }: { titre: string; etat: EtatPlaceDigicode; desactive: boolean;
  /** 🔴 (Arno, 17/11/2026 : « UNE LIGNE PAR BÂTIMENT […] supprime l'en-tête « Bâtiment / cage » et la ligne qui affiche le nom seul (ex. « 1 »). L'intitulé du champ devient « Digicode bâtiment 1 » […] Pour une nouvelle ligne pas encore nommée, l'intitulé reste le menu de choix du bâtiment, puis devient « Digicode bâtiment X » une fois validé. ») : la valeur et « Modifier » / « Corriger » sur la MÊME ligne (lignes de bâtiment) */
  enLigne?: boolean;
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
    <div className={`dcp-lue${enLigne ? ' dcp-lue--en-ligne' : ''}`} data-dcp-lue>
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
              <input value={saisie.code} maxLength={MAX_CODE_DIGICODE_UNIFIE} disabled={envoi || saisie.aucun} placeholder={saisie.aucun ? 'pas de digicode' : 'code'} autoFocus
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
/** La saisie d'un code coché : le nouveau code, sa date d'activation, une heure facultative. */
type SaisieCode = CodeLigne & { date: string; heure: string };
/** L'instant d'activation d'une saisie : la date et l'heure de Paris ; sans heure, le début de la journée. PUR. */
const instantDeLaSaisie = (c: SaisieCode): string | null => instantDepuisParis(c.date, c.heure.trim() === '' ? '00:00' : c.heure);

function FenetreModifier({ d, depart, onFermer, onValider, onApercu, onEnvoyer }: { d: DigicodesAdresseSaisis; depart: string; onFermer: () => void;
  onValider: (appliqueLe: string, changements: ChangementEcran[]) => Promise<string | null>;
  onApercu?: (appliqueLe: string, changements: Parameters<ApercuDigicodes>[2]) => Promise<ApercuEnvoi | string>;
  onEnvoyer?: (appliqueLe: string, changements: Parameters<ApercuDigicodes>[2], proprietaires: boolean, options?: OptionsPrevenir) => Promise<IssueEnvoi | string> }) {
  // 🔴 (lot 6) les étapes : la saisie, l'écran des destinataires, le compte rendu de l'envoi
  const [apercu, setApercu] = useState<ApercuEnvoi | null>(null);
  // 🔴🔴 (Arno, 17/11/2026 : « DEUX CHOIX, obligatoires, après la saisie : A. « Prévenir la Gestion seulement » […] B. « Écrire maintenant aux locataires » : affiche la liste des destinataires, regroupée par logement (un bloc par logement, avec son adresse, son bâtiment et son étage/porte) ; dans chaque bloc, une ligne par locataire avec une case cochée par défaut, décochable une à une ; total « N logements · M locataires sélectionnés » mis à jour en direct […] En bas : « Valider la mise à jour et envoyer ». »)
  const [choix, setChoix] = useState<ModePrevenir>('locataires');
  const [decoches, setDecoches] = useState<Set<number>>(() => new Set());
  const [proprietaires, setProprietaires] = useState(false);
  const [fait, setFait] = useState<IssueEnvoi | null>(null);
  const places = [...(d.communEtat?.connu ? [{ cle: '', libelle: null as string | null, titre: 'Digicode copropriété', etat: d.communEtat }] : []),
    ...d.batiments.filter((b) => b.etat?.connu).map((b) => ({ cle: batimentDe(b.libelle)?.cle ?? b.libelle, libelle: b.libelle as string | null, titre: `Bâtiment / cage ${b.libelle}`, etat: b.etat as EtatPlaceDigicode }))];
  /* 🔴🔴 (Arno, 17/11/2026 : « PLUSIEURS CODES DANS UN SEUL MAIL : dans la fenêtre « Modifier », on peut cocher un ou plusieurs codes (copropriété et/ou
     bâtiments), avec pour CHACUN son nouveau code, sa date d'activation et une heure facultative (sans heure : début de journée, et le mail n'affiche que la
     date). Un seul enregistrement, un seul écran de destinataires. […] Chaque code bascule à sa propre date. ») */
  const nouvelleSaisie = (): SaisieCode => ({ code: '', aucun: false, date: demainParis(), heure: '' });
  const [coches, setCoches] = useState<Record<string, SaisieCode | undefined>>(() => (places.some((p) => p.cle === depart && p.etat.aVenir.length === 0) ? { [depart]: nouvelleSaisie() } : {}));
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ouverture] = useState(() => Date.now()); // l'heure d'ouverture de la fenêtre (le serveur revérifie au moment d'enregistrer)
  const choisis = places.filter((p) => coches[p.cle] !== undefined);
  const instants = choisis.map((p) => instantDeLaSaisie(coches[p.cle] as SaisieCode));
  // le premier instant (la règle des 7 jours, l'objet du mail) ; chaque code part avec le sien
  const appliqueLe = instants.length === 0 || instants.some((x) => x === null) ? null : (instants as string[]).slice().sort()[0];
  const changementsSaisis = (): ChangementEcran[] => choisis.map((p) => {
    const c = coches[p.cle] as SaisieCode;
    return { batiment: p.libelle, ...(valeurDeLaSaisie(c) as { digicode: boolean; code: string | null }), appliqueLe: instantDeLaSaisie(c) as string, avecHeure: c.heure.trim() !== '' };
  });
  if (fait !== null) return <CompteRenduEnvoi fait={fait} onFermer={onFermer} />;
  if (apercu !== null && appliqueLe !== null && onEnvoyer !== undefined) {
    return <EcranDestinataires a={apercu} mode={choix} decoches={decoches} onDecoches={setDecoches} proprietaires={proprietaires} onProprietaires={setProprietaires} envoi={envoi} erreur={erreur}
      onRetour={() => { setApercu(null); setErreur(null); }}
      onEnvoyer={() => { setEnvoi(true); setErreur(null); void onEnvoyer(appliqueLe, changementsSaisis(), choix === 'locataires' && proprietaires, { mode: choix, decoches: [...decoches] })
        .then((r) => { setEnvoi(false); if (typeof r === 'string') setErreur(r); else setFait(r); }); }} />;
  }
  const manque = choisis.length === 0 ? 'Cochez au moins un digicode qui change.'
    : choisis.some((p) => valeurDeLaSaisie(coches[p.cle] as CodeLigne) === null) ? 'Saisissez le nouveau code de chaque digicode coché (ou « pas de digicode »).'
      : instants.some((x) => x === null) ? 'Indiquez la date d’activation de chaque code coché (l’heure est facultative).'
        : instants.some((x) => new Date(x as string).getTime() <= ouverture) ? 'La date (et l’heure) d’activation de chaque code doivent être à venir.' : null;
  return (
    <div className="dcp-voile" data-dcp-fenetre-modifier>
      <div className="dcp-alerte dcp-fenetre" role="dialog" aria-modal="true" aria-labelledby="dcp-modifier-titre"
        onKeyDown={(e) => { if (e.key === 'Escape' && !envoi) { e.stopPropagation(); onFermer(); } }}>
        <p className="dcp-alerte-titre" id="dcp-modifier-titre">Modifier un digicode — {adresseImmeuble(d.voie, d.codePostal, d.commune)}</p>
        <p className="dcp-alerte-texte loc-muet">Cochez le ou les codes qui changent ; pour chacun, saisissez le nouveau code, sa date d’activation et, si besoin, l’heure (sans heure : il change en début de journée). Jusque-là, le code actuel reste en vigueur ; ensuite, il reste dans l’historique.</p>
        <ul className="dcp-arbitrer-liste">{places.map((p) => {
          const prevu = p.etat.aVenir[0];
          const c = coches[p.cle];
          return (
            <li key={p.cle} className="dcp-modifier-ligne" data-dcp-modifier-place={p.libelle ?? 'commun'}>
              <label className="dcp-aucun"><input type="checkbox" checked={c !== undefined} disabled={envoi || prevu !== undefined}
                onChange={(e) => setCoches((x) => ({ ...x, [p.cle]: e.target.checked ? nouvelleSaisie() : undefined }))} data-dcp-modifier-coche />
                <span><strong>{p.titre}</strong> — actuel : {p.etat.valeur ? motValeur(p.etat.valeur) : '—'}</span></label>
              {prevu !== undefined && <span className="loc-muet">Un changement est déjà prévu le {dateHeure(prevu.appliqueLe)} : annulez-le d’abord.</span>}
              {c !== undefined && (
                <div className="dcp-modifier-champs" data-dcp-modifier-champs>
                  <label className="dcp-champ"><span>Nouveau code</span>
                    <input value={c.code} maxLength={MAX_CODE_DIGICODE_UNIFIE} disabled={envoi || c.aucun} placeholder={c.aucun ? 'pas de digicode' : 'nouveau code'}
                      onChange={(e) => setCoches((x) => ({ ...x, [p.cle]: { ...c, code: e.target.value } }))} data-dcp-modifier-code /></label>
                  <label className="dcp-aucun"><input type="checkbox" checked={c.aucun} disabled={envoi} onChange={(e) => setCoches((x) => ({ ...x, [p.cle]: { ...c, code: '', aucun: e.target.checked } }))} /><span>plus de digicode</span></label>
                  <label className="dcp-champ"><span>Date d’activation</span>
                    <input type="date" value={c.date} disabled={envoi} onChange={(e) => setCoches((x) => ({ ...x, [p.cle]: { ...c, date: e.target.value } }))} data-dcp-modifier-date /></label>
                  <label className="dcp-champ"><span>Heure (facultative)</span>
                    <input type="time" value={c.heure} disabled={envoi} onChange={(e) => setCoches((x) => ({ ...x, [p.cle]: { ...c, heure: e.target.value } }))} data-dcp-modifier-heure /></label>
                </div>)}
            </li>);
        })}</ul>
        {erreur !== null && <p className="cp-refus dcp-refus" role="alert" data-dcp-modifier-erreur>{erreur}</p>}
        {manque !== null && erreur === null && <p className="loc-muet dcp-sans-marge" data-dcp-modifier-manque>{manque}</p>}
        <div className="dcp-alerte-actions">
          <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={envoi} onClick={onFermer} data-dcp-modifier-annuler>Annuler</button>
          {onApercu !== undefined ? (
            /* 🔴🔴 (Arno, 17/11/2026 : « DEUX CHOIX, obligatoires, après la saisie : A. « Prévenir la Gestion seulement » […] B. « Écrire maintenant aux locataires » : affiche la liste des destinataires, regroupée par logement (un bloc par logement, avec son adresse, son bâtiment et son étage/porte) ; dans chaque bloc, une ligne par locataire avec une case cochée par défaut, décochable une à une ; total « N logements · M locataires sélectionnés » mis à jour en direct […] En bas : « Valider la mise à jour et envoyer ». ») — deux choix obligatoires (l'un ou l'autre ouvre la liste, rien ne part avant « Valider ») */
            (['gestion', 'locataires'] as const).map((m) => (
              <button key={m} type="button" className={`svv-btn gst-btn ${m === 'locataires' ? 'svv-btn-primary' : 'svv-btn-outline'}`} disabled={envoi || manque !== null}
                data-dcp-modifier-suivant={m === 'locataires' ? '' : undefined} data-dcp-choix-prevenir={m} onClick={() => {
                  if (appliqueLe === null) return;
                  setEnvoi(true); setErreur(null); setChoix(m);
                  void onApercu(appliqueLe, changementsSaisis()).then((r) => { setEnvoi(false); if (typeof r === 'string') setErreur(r); else { setApercu(r); setDecoches(new Set()); } });
                }}>{envoi && choix === m ? 'Lecture…' : m === 'gestion' ? 'A. Prévenir la Gestion seulement' : 'B. Écrire maintenant aux locataires'}</button>))
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
function EcranDestinataires({ a, mode, decoches, onDecoches, proprietaires, onProprietaires, envoi, erreur, onRetour, onEnvoyer }: { a: ApercuEnvoi; mode: ModePrevenir;
  decoches: ReadonlySet<number>; onDecoches: (d: Set<number>) => void; proprietaires: boolean;
  onProprietaires: (b: boolean) => void; envoi: boolean; erreur: string | null; onRetour: () => void; onEnvoyer: () => void }) {
  // 🔴🔴 (Arno, 17/11/2026 : « DEUX CHOIX, obligatoires, après la saisie : A. « Prévenir la Gestion seulement » […] B. « Écrire maintenant aux locataires » : affiche la liste des destinataires, regroupée par logement (un bloc par logement, avec son adresse, son bâtiment et son étage/porte) ; dans chaque bloc, une ligne par locataire avec une case cochée par défaut, décochable une à une ; total « N logements · M locataires sélectionnés » mis à jour en direct […] En bas : « Valider la mise à jour et envoyer ». »)
  const b = bilanEnvoi(a, mode === 'locataires' && proprietaires);
  const t = totalSelection(a, decoches);
  const basculer = (occ: number, coche: boolean): void => { const n = new Set(decoches); if (coche) n.delete(occ); else n.add(occ); onDecoches(n); };
  const locataires = mode === 'locataires';
  return (
    <div className="dcp-voile" data-dcp-destinataires data-dcp-mode={mode}>
      <div className="dcp-alerte dcp-fenetre" role="dialog" aria-modal="true" aria-labelledby="dcp-dest-titre" onKeyDown={(e) => { if (e.key === 'Escape' && !envoi) { e.stopPropagation(); onRetour(); } }}>
        <p className="dcp-alerte-titre" id="dcp-dest-titre">{locataires ? 'B. Écrire maintenant aux locataires' : 'A. Prévenir la Gestion seulement'}</p>
        <p className="dcp-alerte-texte">{a.adresse} — {resumeChangements(a)}. {locataires
          ? 'Seuls les locataires cochés reçoivent SON mail, à leur nom, sans autre destinataire, avec seulement le digicode copropriété et celui de leur bâtiment (une personne qui a plusieurs adresses e-mail reçoit un mail à chacune, séparément). Ensuite, la Gestion reçoit un mail qui liste les locataires prévenus.'
          : `Le changement est enregistré et un mail interne part à la Gestion (${a.adresseGestion ?? 'adresse des préférences'}) avec la date et la liste des logements concernés : la Gestion écrit elle-même aux locataires. AUCUN mail aux locataires.`}</p>
        <p className="dcp-total" data-dcp-total>{locataires ? t.phrase : `${a.logements.length} logement${a.logements.length > 1 ? 's' : ''} concerné${a.logements.length > 1 ? 's' : ''}`}</p>
        <ul className="dcp-dest-blocs">{a.logements.map((l) => (
          <li key={l.lotId} className="dcp-dest-logement" data-dcp-dest-logement={l.lotId} data-dcp-dest-batiment={l.batiment ?? 'sans'}>
            <p className="dcp-dest-entete"><strong>{enteteLogement(l)}</strong></p>
            <span className="loc-muet dcp-dest-codes">{codesEnLigne(a, l)}</span>
            {l.locataires.length === 0 && <span className="loc-muet">aucun locataire en place</span>}
            {l.locataires.map((x) => !x.inclus
              ? <span key={x.occupationId} className="loc-muet" data-dcp-exclu>{prenomNom(x)} — {x.raison} : non prévenu</span>
              : x.emails.length === 0
                ? <span key={x.occupationId} className="dcp-a-arbitrer" data-dcp-sans-email>{prenomNom(x)} — pas d’e-mail — à prévenir autrement</span>
                : locataires
                  ? <label key={x.occupationId} className="dcp-aucun dcp-dest-locataire"><input type="checkbox" checked={locataireCochable(x) && !decoches.has(x.occupationId)} disabled={envoi}
                      onChange={(e) => basculer(x.occupationId, e.target.checked)} data-dcp-dest-locataire={x.occupationId} /><span>{prenomNom(x)}</span></label>
                  : <span key={x.occupationId} data-dcp-dest-a-prevenir>{prenomNom(x)}</span>)}
          </li>))}</ul>
        {locataires && <>
          <label className="dcp-aucun"><input type="checkbox" checked={proprietaires} disabled={envoi} onChange={(e) => onProprietaires(e.target.checked)} data-dcp-proprietaires />
            <span>Prévenir aussi les propriétaires</span></label>
          {proprietaires && <ul className="dcp-arbitrer-liste" data-dcp-liste-proprietaires>{proprietairesRegroupes(a).map((p) => (
            <li key={p.personne.id}>{prenomNom(p.personne)} — {p.logements.length} logement{p.logements.length > 1 ? 's' : ''} ({adressesUniques(p.personne.emails).length > 1 ? `${adressesUniques(p.personne.emails).length} mails, un par adresse` : 'un seul mail'}){p.personne.emails.length === 0 ? <span className="dcp-a-arbitrer"> — pas d’e-mail — à prévenir autrement</span> : null}</li>))}</ul>}
          <p className="dcp-total" data-dcp-bilan>{t.mails} mail{t.mails > 1 ? 's' : ''} aux locataires{proprietaires ? ` · ${b.mailsProprietaires} aux propriétaires` : ''}{b.sansEmail.length > 0 ? ` · ${b.sansEmail.length} à prévenir autrement` : ''} · puis 1 mail à la Gestion</p>
        </>}
        {erreur !== null && <p className="cp-refus dcp-refus" role="alert" data-dcp-envoi-erreur>{erreur}</p>}
        <div className="dcp-alerte-actions">
          <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={envoi} onClick={onRetour} data-dcp-dest-retour>Retour</button>
          <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={envoi} onClick={onEnvoyer} data-dcp-envoyer>
            {envoi ? 'Envoi…' : locataires ? 'Valider la mise à jour et envoyer' : 'Valider la mise à jour et prévenir la Gestion'}</button>
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
        {(fait.nonCoches ?? []).length > 0 && <p className="loc-muet dcp-sans-marge" data-dcp-cr-non-coches>Décochés (non prévenus) : {(fait.nonCoches ?? []).join(', ')}.</p>}
        {fait.gestion && <p className="dcp-sans-marge" data-dcp-cr-gestion={fait.gestion.envoye ? 'parti' : 'echec'}><strong>Mail à la Gestion</strong> — {fait.gestion.envoye ? `envoyé (${fait.gestion.a.join(', ')})` : `non envoyé : ${fait.gestion.motif ?? 'erreur'}`}</p>}
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
          <p className="dcp-titre">{adresseImmeuble(p.d.voie, p.d.codePostal, p.d.commune)} — {p.batiment === null ? 'digicode copropriété' : `bâtiment / cage ${p.batiment}`}</p>
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
  const lignes = s.flatMap((d) => [...(d.communEtat?.historique ?? []).map((h) => ({ h, d, place: 'digicode copropriété' })),
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
export function digicodesBienEnvoi(s: DigicodesAdresseSaisis, batiment: string, confirme: boolean,
  /** 🔴 (Arno, 17/11/2026) les bâtiments CRÉÉS au menu pendant la saisie (en attente d'enregistrement) */
  crees: readonly { libelle: string; confirme: boolean }[] = [],
  /** les bâtiments déjà connus de la copropriété (un créé déjà connu n'est plus « en attente ») */
  connus: readonly BatimentConnu[] = []): { batiment: string | null; batimentConfirme: boolean;
  commun: CodeLigne | null; codeBatiment: CodeLigne | null; autres: { libelle: string; confirme: boolean; code: CodeLigne | null }[] } {
  const ligne = batiment.trim() === '' ? null : ligneDuBatiment(s, batiment);
  const libre = (e: EtatPlaceDigicode | undefined, c: CodeLigne, init: CodeLigne): CodeLigne | null => (placeLue(e) || memes(c, init) ? null : { code: c.code.trim(), aucun: c.aucun });
  // 🔴 (Arno, 17/11/2026) les AUTRES bâtiments : chaque bâtiment créé en attente (il entre au registre de la copropriété), et la première valeur
  // saisie sur la ligne d'un autre bâtiment sans code connu ; jamais le bâtiment du bien (il part à part), jamais un code connu
  const choisi = ligne === null ? null : batimentDe(ligne.libelle)?.cle ?? null;
  const enAttente = crees.filter((c) => { const b = batimentDe(c.libelle); return b !== null && !connus.some((x) => x.cle === b.cle); });
  const toutes = avecTousLesBatiments(s.batiments, [...connus, ...enAttente.map((c) => batimentDe(c.libelle) as BatimentConnu)]);
  const autres: { libelle: string; confirme: boolean; code: CodeLigne | null }[] = [];
  for (const l of toutes) {
    const cle = batimentDe(l.libelle)?.cle;
    if (cle === undefined || cle === choisi || l.nouveau) continue;
    const cree = enAttente.find((c) => batimentDe(c.libelle)?.cle === cle);
    const code = libre(l.etat, l, l.initial);
    if (cree !== undefined || code !== null) autres.push({ libelle: l.libelle, confirme: cree?.confirme ?? false, code });
  }
  return { batiment: ligne === null ? null : ligne.libelle, batimentConfirme: confirme, commun: libre(s.communEtat, s.commun, s.communInitial),
    codeBatiment: ligne === null ? null : libre(ligne.etat, ligne, ligne.initial), autres };
}

/**
 * 🔴🔴 (Arno, 17/11/2026 : « DIGICODE OUI / NON EN PREMIER […] « Non » enregistre l'immeuble sans digicode (même effet que « pas de digicode » sur le
 * code commun). Si la copropriété a déjà des codes connus, « Oui » est sélectionné d'office […]. Choisir « Non » alors ouvre une confirmation […], et
 * aucun code n'est effacé par ce choix. ») La copropriété du bien a-t-elle des codes CONNUS (commun ou bâtiment) ? PUR.
 */
export const codesConnusDuBien = (s: DigicodesAdresseSaisis | null): boolean => s !== null && (placeLue(s.communEtat) || s.batiments.some((b) => placeLue(b.etat)));
/** Le choix « Digicode : Oui / Non » de la fiche du bien : `null` (rien choisi) — « Oui » d'office quand des codes sont connus. PUR. */
export const choixDigicodeEffectif = (choix: boolean | null, connus: boolean): boolean | null => choix ?? (connus ? true : null);
/**
 * Ce qui part selon ce choix : « Oui » (ou rien choisi) : la saisie telle quelle ; « Non » sans code connu : le commun « pas de digicode », aucun code de
 * bâtiment ; « Non » avec des codes connus : AUCUN code (rien n'est effacé). Le bâtiment choisi part toujours. PUR.
 */
export function envoiSelonChoixDigicode(e: ReturnType<typeof digicodesBienEnvoi>, choix: boolean | null, connus: boolean): ReturnType<typeof digicodesBienEnvoi> {
  if (choix !== false) return e;
  // les bâtiments créés entrent quand même au registre : seuls leurs codes ne partent pas
  return { ...e, commun: connus ? null : { code: '', aucun: true }, codeBatiment: null, autres: e.autres.map((a) => ({ ...a, code: null })) };
}

/** 🔴 (Arno, 17/11/2026) la durée de la bulle de confirmation d'un bâtiment ajouté (« environ 4 secondes »). */
export const DUREE_BULLE_MS = 4000;

/** La règle de numérotation en une phrase, et l'exemple adapté, pour l'encadré d'ajout d'un bâtiment. PUR. */
export const phraseRegle = (n: Nomenclature | null): string => (n === null
  ? 'Aucune règle encore : le premier bâtiment en lettre ou en chiffre la fixera pour toute la copropriété (un intitulé libre reste possible).'
  : `Règle de la copropriété : ${MOT_REGLE[n]} ; un autre intitulé reste possible, après confirmation.`);
export const exempleNom = (n: Nomenclature | null): string => (n === 'lettres' ? 'ex. A' : n === 'chiffres' ? 'ex. 1' : 'ex. A, 1 ou Côté cour');

/**
 * ══ 🔴🔴 LE CHAMP DU BÂTIMENT / CAGE — CHOISIR OU AJOUTER (Arno, 17/11/2026 : « impossible d'ajouter un bâtiment. Cliquer sur « Ajouter nouveau
 * bâtiment » referme le menu et ramène dans le champ : on tourne en rond. Le menu pousse aussi « Étage » et « N° de porte » vers le bas. ») ══
 * Le COMPOSANT UNIQUE du choix d'un bâtiment : fiche Copropriété (ligne « + »), « Nouveau bien », « Modifier le bien », l'annexe et la fiche du
 * bien côté Gestion.
 *   ① le menu s'ouvre PAR-DESSUS la page (superposé, ombre légère) : il ne décale aucun champ ;
 *   ② un nom tapé qui n'existe pas : « + Ajouter le bâtiment « 1 » » en premier, puis les bâtiments connus qui correspondent ;
 *   ③ « Ajouter nouveau bâtiment » ouvre SOUS le champ un encadré qui ne se referme pas tout seul (nom, règle, « Valider ce bâtiment » /
 *      « Annuler » ; Entrée = Valider, Échap = Annuler) ;
 *   ④ validation : nom vide refusé ; nom existant simplement choisi ; hors numérotation → la fenêtre d'avertissement (Confirmer / Corriger) ;
 *      le bâtiment est alors CHOISI, ajouté au menu, et un message le confirme ;
 *   ⑤ adresse inconnue : le menu le dit, l'encadré reste utilisable ;
 *   ⑥ clavier (flèches, Entrée, Échap) et doigt ; cibles de 44 px au moins.
 */
export function ChampBatiment({ valeur, connus, nomenclature, desactive, onSaisie, onChoix, contexte, marque, cle = '', sansAdresse = false, avecAucun = false,
  ouvrirAuDebut = false, avertir, proposition, placeholder, ariaLabel, replie = false }: {
  valeur: string; connus: readonly BatimentConnu[]; nomenclature: Nomenclature | null; desactive: boolean;
  /** la frappe dans le champ (le texte du bâtiment suit) */
  onSaisie: (texte: string) => void;
  /** un bâtiment CHOISI ou AJOUTÉ (`confirme` : l'intitulé hors numérotation a été confirmé dans la fenêtre) */
  onChoix: (libelle: string, confirme: boolean) => void;
  /** où il sera enregistré : « avec le bien » ou « avec la copropriété » */
  contexte: 'bien' | 'copropriete';
  /** les repères de l'écran (épreuves) : ceux du champ du bien (`cbc`) ou de la ligne « + » de la fiche Copropriété (`dcp`) */
  marque: 'cbc' | 'dcp';
  cle?: string; sansAdresse?: boolean; avecAucun?: boolean; ouvrirAuDebut?: boolean;
  /** l'avertissement de numérotation d'un NOUVEL intitulé (par défaut : la règle de la copropriété et les bâtiments connus) */
  avertir?: (nom: string) => AvertissementBatiment | null;
  /** une valeur à proposer (l'escalier noté du bien) */
  proposition?: { texte: string; nom: string };
  placeholder: string; ariaLabel?: string;
  /** 🔴 (Arno, 17/11/2026, une ligne par bâtiment) le nom est choisi : le champ laisse la place à l'intitulé, seule la bulle de confirmation reste */
  replie?: boolean;
}) {
  const [ouvert, setOuvert] = useState(ouvrirAuDebut);
  const [actif, setActif] = useState(-1);
  // 🔴 (Arno, 17/11/2026 : « un clic dans le champ qui contient déjà une valeur montre TOUTE la liste (la valeur actuelle mise en évidence) ; le filtre ne
  // s'applique que lorsqu'on tape ») : vrai dès qu'on tape, remis à faux à chaque ouverture du menu
  const [tape, setTape] = useState(false);
  const [ajout, setAjout] = useState<{ nom: string; erreur: string | null } | null>(null);
  const [alerte, setAlerte] = useState<{ a: AvertissementBatiment; depuisEncadre: boolean } | null>(null);
  const [ajoutes, setAjoutes] = useState<BatimentConnu[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const champ = useRef<HTMLInputElement | null>(null);
  const champEncadre = useRef<HTMLInputElement | null>(null);
  const racine = useRef<HTMLDivElement | null>(null);
  // 🔴 (Arno, 17/11/2026 : « Le menu se ferme dès qu'on clique ailleurs ») — même ouvert sans que le champ ait le focus (le « + » de la fiche Copropriété)
  useEffect(() => {
    if (!ouvert) return;
    const ailleurs = (e: Event): void => { if (racine.current !== null && !racine.current.contains(e.target as Node)) { setOuvert(false); setActif(-1); } };
    document.addEventListener('mousedown', ailleurs);
    document.addEventListener('touchstart', ailleurs);
    return () => { document.removeEventListener('mousedown', ailleurs); document.removeEventListener('touchstart', ailleurs); };
  }, [ouvert]);
  // 🔴 (Arno, 17/11/2026) la confirmation est une BULLE temporaire, superposée à la page : elle disparaît seule après 4 secondes
  useEffect(() => {
    if (message === null) return;
    const t = setTimeout(() => setMessage(null), DUREE_BULLE_MS);
    return () => clearTimeout(t);
  }, [message]);
  const A = marque === 'cbc'
    ? { champ: 'data-cbc-champ', menu: 'data-cbc-menu', option: 'data-cbc-option', aucun: 'data-cbc-aucun', nouveau: 'data-cbc-nouveau' }
    : { champ: 'data-dcp-nom-batiment', menu: 'data-dcp-menu', option: 'data-dcp-option', aucun: 'data-dcp-aucun', nouveau: 'data-dcp-ajouter-nouveau' };
  const tous = menuBatiments([...connus, ...ajoutes]);
  const existe = (nom: string): BatimentConnu | undefined => { const c = batimentDe(nom)?.cle; return c === undefined ? undefined : tous.find((o) => o.cle === c); };
  const t = valeur.trim();
  const cleT = batimentDe(t)?.cle ?? '';
  // le filtre : seulement ce qui est TAPÉ depuis l'ouverture du menu
  const filtre = tape ? t : '';
  const cleFiltre = tape ? cleT : '';
  const fermer = (): void => { setOuvert(false); setActif(-1); };
  const retenir = (libelle: string, confirme: boolean): void => {
    setAjout(null); setAlerte(null);
    const b = batimentDe(libelle);
    if (b !== null && !tous.some((o) => o.cle === b.cle)) setAjoutes((x) => [...x, b]);
    onChoix(libelle, confirme);
    setMessage(`Bâtiment ${libelle} ajouté — il sera enregistré avec ${contexte === 'bien' ? 'le bien' : 'la copropriété'}`);
  };
  const valider = (nom: string, depuisEncadre: boolean): void => {
    const n = nom.trim();
    if (n === '') { if (depuisEncadre) setAjout((x) => (x === null ? x : { ...x, erreur: 'Donnez un nom au bâtiment ou à la cage.' })); return; }
    fermer();
    const deja = existe(n);
    if (deja !== undefined) { setAjout(null); setMessage(null); onChoix(deja.libelle, false); return; }
    const a = (avertir ?? ((x: string) => avertissementBatiment(x, nomenclature, [...connus, ...ajoutes])))(n);
    if (a !== null) { setAlerte({ a, depuisEncadre }); return; }
    retenir(batimentDe(n)?.libelle ?? n, false);
  };
  /* 🔴 (Arno, 17/11/2026) l'ordre du menu : « + Ajouter le bâtiment « … » » si le nom tapé est nouveau, « Aucun bâtiment (code commun) », TOUS les
     bâtiments déjà enregistrés pour la copropriété dans l'ordre naturel (1, 2… 10 après 9 ; A, B…), les intitulés libres par ordre alphabétique
     (menuBatiments), et « Ajouter nouveau bâtiment » tout en bas ; en tapant, la liste se filtre */
  const options: { k: string; mot: string; agir: () => void; attr: Record<string, string>; nouveau?: boolean; choisi?: boolean }[] = [
    ...(filtre !== '' && existe(filtre) === undefined ? [{ k: '+saisi', mot: `+ Ajouter le bâtiment « ${filtre} »`, agir: () => valider(filtre, false), attr: { 'data-cb-ajouter-saisi': '' }, nouveau: true }] : []),
    ...(avecAucun ? [{ k: '∅', mot: 'Aucun bâtiment (digicode copropriété)', agir: () => { fermer(); setMessage(null); onChoix('', false); }, attr: { [A.aucun]: '' } }] : []),
    ...tous.filter((o) => filtre === '' || o.cle.includes(cleFiltre)).map((o) => ({ k: o.cle, mot: o.libelle, agir: () => valider(o.libelle, false), attr: { [A.option]: o.libelle }, choisi: cleT !== '' && cleT === o.cle })),
    { k: '+nouveau', mot: 'Ajouter nouveau bâtiment', agir: () => { fermer(); setAjout({ nom: '', erreur: null }); }, attr: { [A.nouveau]: '' }, nouveau: true },
  ];
  const idMenu = `cb-menu-${marque}-${cle}`;
  if (replie) return message !== null ? <p className="cb-bulle" role="status" aria-live="polite" data-cb-message>{message}</p> : null;
  return (
    <div className="cb" ref={racine} data-champ-batiment>
      <div className="cb-zone">
      <input ref={champ} value={valeur} disabled={desactive} placeholder={placeholder} maxLength={60} role="combobox" aria-expanded={ouvert} aria-controls={idMenu}
        aria-autocomplete="list" aria-label={ariaLabel} aria-activedescendant={ouvert && actif >= 0 ? `${idMenu}-${actif}` : undefined} {...{ [A.champ]: marque === 'dcp' ? cle : '' }}
        onFocus={() => { setOuvert(true); setTape(false); }} onClick={() => { if (!ouvert) setTape(false); setOuvert(true); }}
        onChange={(e) => { setMessage(null); onSaisie(e.target.value); setOuvert(true); setTape(true); setActif(-1); }}
        onBlur={(e) => { const v = e.target.value; setTimeout(fermer, 180); if (v.trim() !== '' && existe(v)?.libelle !== v.trim()) valider(v, false); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOuvert(true); setActif((i) => Math.min(i + 1, options.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActif((i) => Math.max(i - 1, 0)); }
          else if (e.key === 'Escape') fermer();
          else if (e.key === 'Enter') { e.preventDefault(); if (ouvert && actif >= 0) options[actif].agir(); else valider((e.target as HTMLInputElement).value, false); }
        }} />
      {ouvert && !desactive && (
        <ul className="dcp-menu cb-menu" role="listbox" id={idMenu} aria-label="Bâtiments connus de la copropriété" {...{ [A.menu]: '' }}>
          {sansAdresse && <li className="cb-sans-adresse loc-muet" data-cb-sans-adresse>Choisissez d’abord l’adresse du bien pour voir ses bâtiments</li>}
          {options.map((o, i) => (
            <li key={o.k}><button type="button" role="option" id={`${idMenu}-${i}`} aria-selected={i === actif || o.choisi === true}
              className={`dcp-option${o.nouveau ? ' dcp-option--nouveau' : ''}${i === actif ? ' cb-actif' : ''}${o.choisi ? ' cb-choisi' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={o.agir} {...o.attr}>{o.mot}</button></li>))}
        </ul>)}
      </div>
      {proposition !== undefined && t === '' && (
        <button type="button" className="dcp-lien" disabled={desactive} onClick={() => valider(proposition.nom, false)} data-cbc-escalier>{proposition.texte}</button>)}
      {ajout !== null && (
        <div className="cb-encadre" role="group" aria-label="Ajouter un bâtiment ou une cage" data-cb-encadre>
          <label className="dcp-champ cb-encadre-champ"><span>Nom du bâtiment / cage</span>
            <input ref={champEncadre} value={ajout.nom} placeholder={exempleNom(nomenclature)} maxLength={60} data-cb-encadre-nom autoFocus
              onChange={(e) => setAjout({ nom: e.target.value, erreur: null })}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); valider(ajout.nom, true); } if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setAjout(null); champ.current?.focus(); } }} /></label>
          <p className="loc-muet cb-regle" data-cb-regle>{phraseRegle(nomenclature)}</p>
          {ajout.erreur !== null && <p className="cp-refus dcp-refus" role="alert" data-cb-erreur>{ajout.erreur}</p>}
          <div className="cb-encadre-actions">
            <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => { setAjout(null); champ.current?.focus(); }} data-cb-annuler>Annuler</button>
            <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={() => valider(ajout.nom, true)} data-cb-valider>Valider ce bâtiment</button>
          </div>
        </div>)}
      {/* 🔴 (Arno, 17/11/2026 : le message « s'affiche aujourd'hui SOUS le champ et décale l'alignement des cases ») une bulle superposée, qui ne décale
          aucun champ et disparaît seule ; les messages d'erreur restent à leur place */}
      {message !== null && <p className="cb-bulle" role="status" aria-live="polite" data-cb-message>{message}</p>}
      {alerte !== null && (
        <div className="dcp-voile" data-dcp-avertissement>
          <div className="dcp-alerte" role="alertdialog" aria-modal="true" aria-labelledby={`${idMenu}-alerte-titre`}
            onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); (e.currentTarget.querySelector('[data-dcp-corriger]') as HTMLButtonElement | null)?.click(); } }}>
            <p className="dcp-alerte-titre" id={`${idMenu}-alerte-titre`}>{TITRE_AVERTISSEMENT}</p>
            <div>{texteAvertissement(alerte.a).map((x) => <p key={x} className="dcp-alerte-texte">{x}</p>)}</div>
            <div className="dcp-alerte-actions">
              <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => {
                // « Corriger » : rien n'est gardé ; la main revient à l'encadré (s'il y était) ou au champ, vidé
                const depuis = alerte.depuisEncadre; setAlerte(null);
                if (depuis) { setAjout({ nom: '', erreur: null }); setTimeout(() => champEncadre.current?.focus(), 0); }
                else { onSaisie(''); setTimeout(() => champ.current?.focus(), 0); }
              }} data-dcp-corriger>Corriger</button>
              <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={() => retenir(alerte.a.libelle, true)} data-dcp-confirmer>Confirmer cet intitulé</button>
            </div>
          </div>
        </div>)}
    </div>
  );
}

/**
 * LE BÂTIMENT (ou la cage) DU BIEN, CHOISI DANS LE MENU de la copropriété — le même menu, la même règle lettres / chiffres et la même fenêtre
 * d'avertissement que la fiche Copropriété ; « Aucun bâtiment » : le bien lit le code commun. L'« Escalier » du bien PROPOSE le bon choix quand
 * c'est un bâtiment connu (rien n'est écrasé).
 */
export function ChoixBatimentCopro({ valeur, connus, nomenclature, escalier, desactive, onChoix, onCree, variante = 'gestion', sansAdresse = false }: {
  valeur: string; connus: readonly BatimentConnu[]; nomenclature: Nomenclature | null; escalier: string; desactive: boolean;
  onChoix: (libelle: string, confirme: boolean) => void;
  /** 🔴 (Arno, 17/11/2026) un bâtiment NOUVEAU retenu (menu, « + Ajouter le bâtiment … », encadré) — jamais une simple frappe : il garde sa ligne */
  onCree?: (libelle: string, confirme: boolean) => void;
  /** 🔴 (17/11/2026) l'habillage de la page Location : le champ prend le gabarit des autres champs de la grille (`loc-champ`) */
  variante?: 'gestion' | 'location';
  /** 🔴 (17/11/2026) l'adresse du bien n'est pas encore choisie : la copropriété (et ses bâtiments) n'est pas connue */
  sansAdresse?: boolean;
}) {
  /* 🔴 (Arno, 17/11/2026 : « « Bâtiment / cage » et « Escalier » traitent la même information » — le champ « Escalier » est retiré) un bien qui
     a un escalier noté et pas encore de bâtiment : sa valeur est PROPOSÉE (« Escalier noté : 2 — choisir ce bâtiment ? »), jamais écrite toute seule ;
     un bâtiment connu de la copropriété est repris tel qu'au registre, sinon c'est un nouveau bâtiment (même avertissement de numérotation) */
  const connu = menuBatiments(connus).find((o) => o.cle === batimentDe(escalier)?.cle);
  const proposition = valeur.trim() === '' && escalier.trim() !== ''
    ? { texte: `Escalier noté : ${escalier.trim()} — choisir ce bâtiment ?`, nom: connu?.libelle ?? escalier.trim() } : undefined;
  return (
    <div className={`${variante === 'location' ? 'loc-champ dcp-cbc--location ' : ''}dcp-champ dcp-champ-bat`} data-cbc>
      {/* 🔴 (Arno, 17/11/2026) renommé « Bâtiment / cage d'escalier » ; un texte d'aide court, entier à 390 px comme à l'ordinateur */}
      <span>{LIBELLE_BATIMENT_CAGE}</span>
      <ChampBatiment valeur={valeur} connus={connus} nomenclature={nomenclature} desactive={desactive} contexte="bien" marque="cbc" avecAucun sansAdresse={sansAdresse}
        onSaisie={(v) => onChoix(v, false)} placeholder="ex. A ou 1 (facultatif)" ariaLabel={LIBELLE_BATIMENT_CAGE}
        onChoix={(l, c) => { onChoix(l, c); const b = batimentDe(l); if (onCree !== undefined && b !== null && !connus.some((x) => x.cle === b.cle)) onCree(l, c); }}
        {...(proposition !== undefined ? { proposition } : {})} />
      <style>{CSS_DIGICODES_COPRO}</style>
    </div>
  );
}

/**
 * LES DIGICODES DU BIEN : le composant unique (`DigicodesCopropriete`, mode « bien ») sur SA place — le code commun de l'adresse et celui de SON
 * bâtiment ; un code connu se lit (« Corriger une erreur »), une place sans code se saisit (première valeur, avec l'enregistrement du bien).
 */
export function DigicodesBien({ donnees, s, onChange, batiment, desactive, onCorriger, onArbitrer, onPlanifier, onAnnulerChangement, onApercu, onEnvoyer, variante, onPlusBatiment, tente, enAttente = [] }: {
  donnees: DigicodesPourBienLu; s: DigicodesAdresseSaisis; onChange: (s: DigicodesAdresseSaisis) => void; batiment: string; desactive: boolean;
  /** 🔴 (Arno, 17/11/2026) les bâtiments créés au menu pendant la saisie (en attente d'enregistrement) : chacun garde sa ligne */
  enAttente?: readonly string[];
  onCorriger?: GesteDigicode; onArbitrer?: GesteDigicode; onPlanifier?: PlanifierDigicodes; onAnnulerChangement?: AnnulerChangementDigicode;
  onApercu?: ApercuDigicodes; onEnvoyer?: EnvoyerDigicodes;
  variante?: 'gestion' | 'location'; onPlusBatiment?: () => void; tente?: boolean;
}) {
  /* 🔴🔴 (Arno, 17/11/2026 : « BUG : après la création des bâtiments A puis B, une seule ligne de bâtiment reste affichée […]. Chaque bâtiment créé dans
     la copropriété doit avoir SA ligne, visible et persistante (créé, connu en base ou en attente d'enregistrement). ») — CAUSE : seule la ligne du
     bâtiment CHOISI était montrée (et seule elle revenait de la saisie). DÉSORMAIS : une ligne par bâtiment de la place, de la copropriété et en attente,
     plus celle du bâtiment en cours de saisie dans le champ ; toutes reviennent de la saisie */
  const ligne = batiment.trim() === '' ? null : ligneDuBatiment(s, batiment);
  const enPlus = [...donnees.connus, ...enAttente.map((x) => batimentDe(x)).filter((x): x is BatimentConnu => x !== null)];
  const avecChoisi = ligne === null || s.batiments.some((x) => x.k === ligne.k) ? s.batiments : [...s.batiments, ligne];
  const vue: DigicodesAdresseSaisis = { ...s, batiments: avecTousLesBatiments(avecChoisi, enPlus) };
  const recevoir = (ns: DigicodesAdresseSaisis[]): void => {
    const n = ns[0];
    // une ligne touchée (un code saisi) entre dans la saisie ; les autres restent ce qu'elles étaient
    let batiments = s.batiments;
    for (const l of n.batiments) {
      const avant = vue.batiments.find((x) => x.k === l.k);
      if (avant !== undefined && avant.code === l.code && avant.aucun === l.aucun && batiments.some((x) => x.k === l.k) === false) continue;
      batiments = batiments.some((x) => x.k === l.k) ? batiments.map((x) => (x.k === l.k ? l : x)) : [...batiments, l];
    }
    onChange({ ...s, commun: n.commun, batiments });
  };
  return <div data-digicodes-bien>
    <DigicodesCopropriete s={[vue]} onChange={recevoir} connus={donnees.connus} nomenclature={donnees.nomenclature} desactive={desactive} modeBien
      concerne={ligne === null ? null : batimentDe(ligne.libelle)?.cle ?? null}
      {...(variante ? { variante } : {})} {...(onPlusBatiment ? { onPlusBatiment } : {})} tente={tente === true}
      {...(onCorriger ? { onCorriger } : {})} {...(onArbitrer ? { onArbitrer } : {})} {...(onPlanifier ? { onPlanifier } : {})} {...(onAnnulerChangement ? { onAnnulerChangement } : {})}
      {...(onApercu ? { onApercu } : {})} {...(onEnvoyer ? { onEnvoyer } : {})} />
  </div>;
}

/**
 * 🔴🔴 (Arno, 17/11/2026 : « Fiche du bien côté Gestion, hors édition : à côté de chaque digicode affiché (commun et bâtiment), un bouton « Modifier »
 * directement visible, qui ouvre la même fenêtre de changement daté avec ce code présélectionné. Rien d'autre ne change dans la section. »)
 * Les codes CONNUS du bien (le commun de son adresse, celui de son bâtiment), chacun avec son « Modifier » : la MÊME fenêtre que partout ailleurs.
 */
export function ModifierDigicodesLus({ donnees, s, batiment, onPlanifier, onApercu, onEnvoyer }: {
  donnees: DigicodesPourBienLu; s: DigicodesAdresseSaisis; batiment: string; onPlanifier: PlanifierDigicodes; onApercu?: ApercuDigicodes; onEnvoyer?: EnvoyerDigicodes;
}) {
  const [depart, setDepart] = useState<string | null>(null);
  const ligne = batiment.trim() === '' ? null : ligneDuBatiment(s, batiment);
  const d: DigicodesAdresseSaisis = { ...s, batiments: ligne !== null && ligne.etat?.connu ? [ligne] : [] };
  const places = [...(d.communEtat?.connu ? [{ cle: '', repere: 'commun', mot: 'Digicode copropriété' }] : []),
    ...d.batiments.map((b) => ({ cle: batimentDe(b.libelle)?.cle ?? b.libelle, repere: b.libelle, mot: `Code du bâtiment ${b.libelle}` }))];
  if (donnees.adresseCle === '' || places.length === 0) return null;
  return (
    <span className="dcp-lus" data-dcp-modifier-lus>
      {places.map((p) => (
        <span key={p.repere} className="dcp-lus-place" data-dcp-lu-place={p.repere}>
          <span className="loc-muet">{p.mot}</span>
          <button type="button" className="svv-btn svv-btn-outline gst-btn dcp-mini" onClick={() => setDepart(p.cle)} aria-label={`Modifier — ${p.mot.toLowerCase()}`} data-dcp-modifier-lu>Modifier</button>
        </span>))}
      {depart !== null && (
        <FenetreModifier d={d} depart={depart} onFermer={() => setDepart(null)} onValider={(appliqueLe, changements) => onPlanifier(d.cle, appliqueLe, changements)}
          {...(onApercu && onEnvoyer ? { onApercu: (appliqueLe: string, ch: Parameters<ApercuDigicodes>[2]) => onApercu(d.cle, appliqueLe, ch),
            onEnvoyer: (appliqueLe: string, ch: Parameters<ApercuDigicodes>[2], p: boolean, o?: OptionsPrevenir) => onEnvoyer(d.cle, appliqueLe, ch, p, o) } : {})} />)}
      <style>{CSS_DIGICODES_COPRO}</style>
    </span>
  );
}

/* AUCUN ACCENT GRAVE DANS CE LITTERAL. Jetons du theme ; telephone : les champs passent a la ligne. */
export const CSS_DIGICODES_COPRO = `
.dcp{display:flex;flex-direction:column;gap:10px;min-width:0}
.dcp-regle{margin:0;font-size:.85rem}
.dcp-adresse{display:flex;flex-direction:column;gap:6px;padding:8px 10px;border-radius:10px;background:var(--color-svv-field);min-width:0}
.dcp-titre{margin:0;font-weight:800;color:var(--color-svv-ink);overflow-wrap:anywhere}
.dcp-ligne{display:flex;flex-wrap:wrap;align-items:flex-end;gap:8px;min-width:0}
.dcp-nouveau{flex:1 1 100%;margin:0;font-size:.8rem;font-style:italic}
.dcp-ligne--concerne{outline:2px solid var(--color-svv-red);outline-offset:6px;border-radius:14px}
/* 🔴 (Arno, 17/11/2026 : « MÈRE / FILLE : […] Les lignes « Digicode bâtiment X » sont légèrement décalées vers la droite sous la ligne copropriété (retrait
   régulier, avec un trait vertical discret à gauche qui les rattache), et restent alignées entre elles. Au téléphone 390 px, retrait réduit, rien ne déborde. ») */
.dcp-ligne.dcp-ligne--batiment{margin-left:22px;padding-left:16px;border-left:2px solid var(--color-svv-line);box-sizing:border-box;max-width:calc(100% - 22px)}
@media (max-width:640px){.dcp-ligne.dcp-ligne--batiment{margin-left:8px;padding-left:10px;max-width:calc(100% - 8px)}}
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
/* 🔴 (Arno, 17/11/2026) une ligne par bâtiment : la valeur puis « Modifier » / « Corriger » sur la même ligne */
.dcp-champ-bat-replie{display:contents}
.dcp-lue--en-ligne{display:grid;grid-template-columns:auto 1fr;align-items:center;column-gap:14px;row-gap:4px}
.dcp-lue--en-ligne > .dcp-lue-titre{grid-column:1 / -1}
.dcp-lue--en-ligne > .dcp-gestes{justify-self:start}
.dcp-lue--en-ligne > .dcp-a-venir,.dcp-lue--en-ligne > .dcp-correction,.dcp-lue--en-ligne > .cp-refus{grid-column:1 / -1}
.dcp-total{margin:0;font-weight:800;color:var(--color-svv-ink)}
.dcp-dest-groupe{display:flex;flex-direction:column;gap:4px;padding:8px 10px;border-radius:10px;background:var(--color-svv-field)}
.dcp-dest-logement{display:flex;flex-direction:column;gap:2px;padding:4px 0}
.dcp-dest-codes{font-size:.85rem}
.dcp-fenetre{width:min(560px,100%);max-height:calc(100dvh - 32px);overflow-y:auto}
.dcp-modifier-ligne{display:flex;flex-direction:column;gap:6px;padding:8px 0;border-bottom:1px solid var(--color-svv-line)}
/* 🔴 (Arno, 17/11/2026) chaque code coché : nouveau code, « plus de digicode », date d'activation, heure facultative — en ligne, repliés au besoin (jamais de débordement) */
.dcp-modifier-champs{display:flex;flex-wrap:wrap;align-items:flex-end;gap:10px 12px;min-width:0}
.dcp-modifier-champs > .dcp-champ{flex:1 1 150px;min-width:0;width:auto}
.dcp-modifier-champs > .dcp-aucun{flex:0 1 auto;max-width:100%}
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
.dcp-dest-blocs{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
.dcp-dest-logement{display:flex;flex-direction:column;gap:4px;padding:10px 12px;border:1px solid var(--color-svv-line-strong);border-radius:10px;background:var(--color-svv-surface)}
.dcp-dest-entete{margin:0;overflow-wrap:anywhere}
.dcp-dest-locataire{min-height:44px}
/* 🔴 (Arno, 17/11/2026 : « bloc « Accès » : bien aligner tous les champs à la verticale ») (fiche du bien seulement : variante « location ») — chaque ligne sur la MÊME grille : le champ (ou le code lu), « pas de digicode »,
   puis « + » / « × » ; « Modifier » / « Corriger » au même endroit dans chaque code lu ; même espacement vertical */
.dcp--location{--dcp-c1:13.5rem;--dcp-c2:20rem;--dcp-c3:54px;--dcp-ecart:12px}
.dcp--location .dcp-ligne{display:grid;grid-template-columns:var(--dcp-c1) var(--dcp-c2) var(--dcp-c3);column-gap:var(--dcp-ecart);row-gap:8px;align-items:end;justify-content:start}
.dcp--location .dcp-ligne > .dcp-lue{grid-column:1 / span 2;width:auto;min-width:0}
.dcp--location .dcp-ligne > .dcp-code-groupe{display:contents}
.dcp--location .dcp-champ.dcp-champ-code{grid-column:1;width:100%}
.dcp--location .dcp-champ.dcp-champ-code input{width:100%}
.dcp--location .dcp-code-groupe .dcp-aucun{grid-column:2;justify-self:start;box-sizing:border-box;max-width:100%}
.dcp--location .dcp-ligne > .dcp-plus,.dcp--location .dcp-code-groupe .dcp-plus,.dcp--location .dcp-code-groupe .dcp-retirer,.dcp--location .dcp-ligne > .dcp-retirer{grid-column:3;justify-self:start}
.dcp--location .dcp-ligne > .dcp-lue + .dcp-plus{align-self:center}
.dcp--location .dcp-ligne > p,.dcp--location .dcp-ligne > .dcp-champ-bat{grid-column:1 / -1}
.dcp--location .dcp-lue--en-ligne{grid-template-columns:minmax(0,1fr) auto}
.dcp--location .dcp-lue--en-ligne > .dcp-gestes{justify-self:end}
.dcp--location .dcp-code-groupe{gap:12px;align-items:flex-end}
.dcp--location .dcp-champ.dcp-champ-code{flex:0 0 auto}
@media (max-width:640px){
  .dcp-code-groupe{gap:6px}
  .dcp--location .dcp-code-groupe{gap:4px}
  .dcp--location .dcp-champ.dcp-champ-code input{font-size:.9rem;padding:0 7px;width:100%}
  .dcp--location{--dcp-c1:9.9rem;--dcp-c2:6.4rem;--dcp-c3:44px;--dcp-ecart:4px}
  .dcp--location .dcp-code-groupe .dcp-aucun{width:100%}
  .dcp--location .dcp-lue--en-ligne{grid-template-columns:minmax(0,1fr)}
  .dcp--location .dcp-lue--en-ligne > .dcp-gestes{justify-self:start}
  .dcp--location .dcp-code-groupe .dcp-aucun{padding:0 8px;gap:4px;font-size:.78rem;line-height:1.15}
  .dcp--location .dcp-code-groupe .dcp-plus{min-width:44px;min-height:44px;width:44px}
  .dcp-code-groupe .dcp-aucun{font-size:.85rem;line-height:1.15}
}
.dcp-cbc--location{position:relative}
/* 🔴 (Arno, 17/11/2026) le choix / l'ajout d'un bâtiment : le menu PAR-DESSUS la page (il ne décale aucun champ) ; l'encadré d'ajout sous le champ */
.cb{position:relative;display:flex;flex-direction:column;gap:6px;min-width:0}
.cb-menu{position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:40;margin:0;max-height:260px;box-shadow:0 10px 28px color-mix(in srgb, var(--color-svv-ink) 18%, transparent)}
.cb-zone{position:relative;min-width:0}
/* 🔴 (Arno, 17/11/2026) le champ du code : une largeur pour 15 caractères, mesurée dans SA police (commun et bâtiments, même largeur) ;
   « pas de digicode » et « + » juste à côté, dans un groupe qui ne se coupe jamais (seul le libellé peut passer sur deux lignes) */
.dcp-code-groupe{display:flex;flex-wrap:nowrap;align-items:flex-end;gap:8px;min-width:0;max-width:100%}
.dcp-code-groupe .dcp-aucun{flex:0 1 auto;min-width:0}
.dcp-code-groupe .dcp-plus{flex:0 0 auto}
.dcp-champ.dcp-champ-code{flex:0 0 auto;width:auto;min-width:0}
.dcp-champ.dcp-champ-code input{width:calc(15ch + 20px);max-width:100%}
.dcp-lus{display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:6px;white-space:normal}
.dcp-lus-place{display:inline-flex;align-items:center;gap:8px;min-width:0}
.dcp-lus .dcp-mini{min-height:44px}
/* 🔴 (Arno, 17/11/2026) un message d'erreur sous sa ligne, entièrement lisible en clair et en sombre (jetons rouge foncé sur fond rouge pâle), jamais recouvert */
.dcp-ligne-erreur{flex:1 1 100%;margin:4px 0 0;padding:8px 12px;border-radius:10px;border-left:4px solid var(--color-svv-red);background:var(--color-svv-red-soft);
  color:var(--color-svv-red-dark);font-size:.9rem;font-weight:700;line-height:1.4;position:relative;z-index:1}
.cb-zone > input{width:100%;box-sizing:border-box}
.cb-menu .dcp-option{min-height:44px;display:flex;align-items:center}
.cb-menu .cb-choisi{font-weight:800;background:color-mix(in srgb, var(--color-svv-red) 10%, transparent)}
.cb-menu .cb-choisi::before{content:"✓ "}
.cb-menu .cb-actif{background:var(--color-svv-field);outline:2px solid var(--color-svv-ink);outline-offset:-2px}
.cb-sans-adresse{padding:8px 10px;font-size:.88rem;line-height:1.35}
.cb-encadre{display:flex;flex-direction:column;gap:8px;padding:12px;border:1px solid var(--color-svv-line-strong);border-radius:12px;background:var(--color-svv-surface)}
.cb-encadre-champ{flex:1 1 auto}
.dcp-champ-bat:has(.cb-encadre){flex:1 1 100%}
.cb-encadre .cb-encadre-champ input{max-width:420px}
.cb-regle{margin:0;font-size:.85rem;line-height:1.4}
.cb-encadre-actions{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end}
.cb-encadre-actions .svv-btn{min-height:44px}
.cb-bulle{position:fixed;left:50%;top:88px;transform:translateX(-50%);z-index:120;margin:0;box-sizing:border-box;max-width:min(92vw,520px);padding:12px 18px;border-radius:14px;
  background:var(--color-svv-ink);color:var(--color-svv-surface);font-size:.95rem;font-weight:700;line-height:1.35;text-align:center;
  box-shadow:0 12px 32px color-mix(in srgb, var(--color-svv-ink) 30%, transparent);pointer-events:none;animation:cb-bulle-apparait .2s ease-out}
@keyframes cb-bulle-apparait{from{opacity:0;transform:translate(-50%,-6px)}to{opacity:1;transform:translate(-50%,0)}}
@media (prefers-reduced-motion: reduce){.cb-bulle{animation:none}}
@media (max-width:600px){.cb-encadre-actions .svv-btn{flex:1 1 100%}}
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
