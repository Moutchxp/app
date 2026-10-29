'use client';

import { useState } from 'react';
import { ListeChoix, type OptionChoix } from '../location/ListeChoix';
import { NouvelApporteur } from './NouvelApporteur';
import { bilanVente, commissionNetteHt, LIBELLE_PARTIE, societePorteuse, LIBELLE_SOCIETE, partsHt, SOCIETES, sommeSocietes, TVA, type Partie, type Societe, type Unite } from '../../../../lib/transaction/modele';
import { autreUnite, LIBELLE_UNITE, TAUX_REMUNERATION_DEFAUT, tauxDuMontant, UNITES } from '../../../../lib/transaction/commissions';
import { LES_DEUX, LIBELLE_SOCIETE_COMPTE, societeDOffice, type SocieteCompte } from '../../../../lib/transaction/societeNegociateur';
import { commissionneDePartie } from '../../../../lib/transaction/statutLigne';
import { auCentime, centimesRepartition, motifSomme, partieExterieure, partsParSociete, pourcentageDe, pourcentagesParSociete, totalRepartition, verifierRepartition } from '../../../../lib/transaction/repartition';
import { eur } from './commun';

/**
 * ══ 🔴 TUILE « TRANSACTION », LOTS D ET E (Arno, 27/10/2026) — LE BLOC « NÉGOCIATEURS ET RÉPARTITION », PARTAGÉ ═══════════════
 * Le même composant dans « Nouvelle vente » et dans le formulaire d'un compromis (aucune copie).
 *   · Apporteur (annuaire des apporteurs de la Location) et sa rétrocession TTC, déduite avant toute répartition.
 *   · LOT E — le TABLEAU DES PARTIES est affiché DÈS L'OUVERTURE, même sans négociateur : une ligne « Entrée du mandat » et une ligne
 *     « Sortie du mandat », chacune avec son négociateur (tous les comptes actifs, ceux sans société signalés), sa société, son % ET son
 *     montant € HT (l'un recalcule l'autre) ; « + Ajouter une partie extérieure » ajoute une ligne (nom, coordonnées, %, €) qu'une croix
 *     retire ; une ligne « Total » (% et commission nette) ; « Revenir au 50/50 » toujours visible.
 *   · Par défaut : deux négociateurs différents ⇒ 50 / 50 ; un seul, ou le même des deux côtés ⇒ 100 % (l'autre ligne à 0).
 *   · Somme ≠ 100 % : message en rouge sur la ligne Total ; le formulaire désactive « Enregistrer » avec l'explication (`etatSomme`), et
 *     la saisie reste à l'écran. Le serveur revérifie tout.
 */

/** LOT K — `societe` : « les_deux » pour un collaborateur des deux sociétés (la société se choisit alors vente par vente). */
export interface NegociateurRef { id: number; nom: string; societe: SocieteCompte | null;
  /** LOT S (441) — commissionné aujourd'hui (absent : oui ; un collaborateur l'est toujours). */
  commissionne?: boolean }
export interface ApporteurRef { id: number; nom: string;
  /** 🔴 LOT AC — le libellé de l'annuaire (NOM Prénom) et le texte cherchable (nom, prénom, société, téléphones, e-mails). */
  libelle?: string; recherche?: string }
/** Une partie à l'écran : sa part telle que saisie (texte), en % ou en €. */
export interface PartieEcran extends Omit<Partie, 'pourcentage' | 'montantHt'> { mode: 'pct' | 'eur'; texte: string }
/** Un montant à l'écran, tel que saisi, avec SON unité (LOT I). */
export interface MontantEcran { texte: string; unite: Unite;
  /**
   * LOT O — vrai : la commission n'est pas saisie, elle est PROPOSÉE (part de ce côté × commission TTC), recalculée à l'écran et convertie
   * quand l'unité change ; une frappe la rend saisie. Rien n'est écrit avant « Valider » / « Enregistrer ».
   */
  auto?: boolean;
  /**
   * 🔴 LOT R — le taux de rémunération (%) d'une commission de négociateur, tel que saisi ; absent ou vide : 50 %. Le montant proposé =
   * taux × la base (le CA que la vente apporte à sa société) ; un montant saisi recalcule le taux (l'un recalcule l'autre).
   */
  taux?: string }
/**
 * `parties[0]` : la ligne « Entrée du mandat », `parties[1]` : « Sortie du mandat » (toujours là) ; ensuite les parties extérieures.
 * LOT I (437) — `retroUnite` : l'unité de la rétrocession ; `commissions` : les commissions versées aux négociateurs d'entrée et de sortie
 * (null : la 437 n'est pas appliquée — rien ne se saisit, rien ne s'envoie, tout reste en TTC comme avant).
 */
export interface EtatRepartition { entreeId: number | null; sortieId: number | null; apporteurId: number | null; retroTexte: string; retroUnite?: Unite;
  commissions?: Record<'entree' | 'sortie', MontantEcran> | null; parties: PartieEcran[] }

/** LOT I — la rétrocession saisie, en TTC (ce que la répartition déduit) ; vide : 0. PUR. */
export const retroTtcDe = (etat: Pick<EtatRepartition, 'retroTexte' | 'retroUnite'>): number => {
  const x = nombre(etat.retroTexte) ?? 0;
  return etat.retroUnite === 'ht' ? x * TVA : x;
};

export function nombre(s: string): number | null {
  const t = s.replace(/[\s  €%]/g, '').replace(',', '.');
  return t === '' || !/^-?\d+(\.\d+)?$/.test(t) ? null : Number(t);
}
const texteNombre = (x: number): string => String(x).replace('.', ',');

/** Partie (modèle) → partie à l'écran. */
export const versEcran = (p: Partie): PartieEcran => ({ sorte: p.sorte, compteId: p.compteId, negociateur: p.negociateur, societe: p.societe, nom: p.nom, coordonnees: p.coordonnees,
  mode: p.pourcentage !== null ? 'pct' : 'eur', texte: texteNombre(p.pourcentage ?? p.montantHt ?? 0),
  // LOT S — non commissionné sur cette vente (figé, sinon son compte) : l'écran ne propose ni commission, ni calcul.
  ...(p.compteId !== null && !commissionneDePartie(p) ? { commissionne: false } : {}) });
const versModeleUne = (p: PartieEcran): Partie => {
  const x = nombre(p.texte) ?? (p.texte.trim() === '' ? 0 : Number.NaN);
  return { sorte: p.sorte, compteId: p.compteId, negociateur: p.negociateur, societe: p.societe, nom: p.nom, coordonnees: p.coordonnees,
    pourcentage: p.mode === 'pct' ? x : null, montantHt: p.mode === 'eur' ? x : null };
};
/**
 * Les lignes à l'écran → les parties enregistrées : une ligne interne SANS négociateur n'est pas une partie ; la ligne « Sortie » du
 * MÊME négociateur que l'entrée, à 0, non plus (il porte tout, une fois). PUR.
 */
export function versModele(parties: readonly PartieEcran[]): Partie[] {
  const entree = parties.find((p) => p.sorte === 'entree' || p.sorte === 'entree_sortie');
  return parties.filter((p) => {
    if (p.sorte === 'exterieure') return true;
    if (p.compteId === null) return false;
    if (p.sorte === 'sortie' && entree !== undefined && entree.compteId === p.compteId) return (nombre(p.texte) ?? 0) !== 0;
    return true;
  }).map(versModeleUne);
}

const ligne = (sorte: 'entree' | 'sortie', n: NegociateurRef | undefined, pct: number): PartieEcran => ({ sorte, compteId: n?.id ?? null, negociateur: n?.nom ?? null,
  societe: societeDOffice(n?.societe), nom: null, coordonnees: null, mode: 'pct', texte: texteNombre(pct), ...(n?.commissionne === false ? { commissionne: false } : {}) });
/** 🔴 LOT S — la partie (à l'écran) est-elle celle d'un négociateur NON COMMISSIONNÉ ? PUR. */
export const nonCommissionne = (p: Pick<PartieEcran, 'commissionne'> | undefined): boolean => p?.commissionne === false;
/** Les pourcentages par défaut des deux lignes : différents ⇒ 50/50 ; un seul ou le même ⇒ 100/0 ; aucun ⇒ 50/50 (à choisir). PUR. */
export function defautsLignes(entreeId: number | null, sortieId: number | null): [number, number] {
  if (entreeId !== null && sortieId !== null) return entreeId === sortieId ? [100, 0] : [50, 50];
  if (entreeId !== null) return [100, 0];
  if (sortieId !== null) return [0, 100];
  return [50, 50];
}
/** Les deux lignes internes par défaut, la ou les parties extérieures gardées (`garder`). PUR. */
export function partiesPour(negos: readonly NegociateurRef[], entreeId: number | null, sortieId: number | null, garder: readonly PartieEcran[] = []): PartieEcran[] {
  const [e, s] = defautsLignes(entreeId, sortieId);
  return [ligne('entree', negos.find((x) => x.id === entreeId), e), ligne('sortie', negos.find((x) => x.id === sortieId), s), ...garder.filter((p) => p.sorte === 'exterieure')];
}
/** Une répartition enregistrée → les lignes de l'écran (toujours une ligne d'entrée et une de sortie). PUR. */
export function lignesDe(parties: readonly Partie[], negos: readonly NegociateurRef[]): PartieEcran[] {
  const es = parties.find((p) => p.sorte === 'entree_sortie');
  const e = parties.find((p) => p.sorte === 'entree');
  const s = parties.find((p) => p.sorte === 'sortie');
  const vide = (sorte: 'entree' | 'sortie'): PartieEcran => ligne(sorte, undefined, 0);
  const entree = es !== undefined ? { ...versEcran(es), sorte: 'entree' as const } : e !== undefined ? versEcran(e) : vide('entree');
  const sortie = s !== undefined ? versEcran(s) : es !== undefined ? { ...ligne('sortie', negos.find((x) => x.id === es.compteId), 0), negociateur: es.negociateur, societe: es.societe } : vide('sortie');
  return [entree, sortie, ...parties.filter((p) => p.sorte === 'exterieure').map(versEcran)];
}

/**
 * 🔴 LOT G (Arno) — SAISIR UNE PART. Exactement DEUX lignes : AUTO-COMPENSATION — la part saisie (en % ou en € HT) est bornée entre 0 et
 * 100 %, et l'autre ligne passe à son complément (60 → 40), le total fait toujours 100 %. Trois lignes ou plus (une partie extérieure) :
 * chaque ligne se saisit librement, la ligne Total vérifie la somme. PUR.
 */
export function saisirPart(parties: readonly PartieEcran[], i: number, mode: 'pct' | 'eur', texte: string, netHt: number): PartieEcran[] {
  const lignes = parties.map((p, j) => (j === i ? { ...p, mode, texte } : p));
  if (lignes.length !== 2) return lignes;
  const x = nombre(texte);
  const pct = x === null ? 0 : mode === 'pct' ? x : pourcentageDe(x, netHt);
  const borne = Math.min(100, Math.max(0, pct));
  if (x !== null && borne !== pct) lignes[i] = { ...lignes[i], mode: 'pct', texte: texteNombre(borne) };
  lignes[1 - i] = { ...lignes[1 - i], mode: 'pct', texte: texteNombre(Number((100 - borne).toPrecision(12))) };
  return lignes;
}

/** LOT G — retirer une partie extérieure : revenu à deux lignes, la première garde sa valeur et la seconde se recale sur 100 %. PUR. */
export function retirerPartie(parties: readonly PartieEcran[], i: number, netHt: number): PartieEcran[] {
  const reste = parties.filter((_, j) => j !== i);
  return reste.length === 2 ? saisirPart(reste, 0, reste[0].mode, reste[0].texte, netHt) : reste;
}

/**
 * LOT G — CHOISIR, CHANGER OU RETIRER le négociateur d'un côté (le formulaire ET le bouton de la carte : la même règle). Deux négociateurs
 * différents avant et après : la répartition personnalisée est CONSERVÉE ; sinon, les parts par défaut (50/50, ou 100 % pour un seul ou le
 * même négociateur). Avec une partie extérieure, les pourcentages restent tels quels (la ligne Total dit s'il faut les revoir). PUR.
 */
export function changerNegociateur(etat: EtatRepartition, cote: 'entree' | 'sortie', id: number | null, negos: readonly NegociateurRef[]): EtatRepartition {
  const entreeId = cote === 'entree' ? id : etat.entreeId;
  const sortieId = cote === 'sortie' ? id : etat.sortieId;
  const n = id === null ? undefined : negos.find((x) => x.id === id);
  const i = cote === 'entree' ? 0 : 1;
  const garder = (): PartieEcran[] => etat.parties.map((p, j) => (j === i ? { ...p, compteId: n?.id ?? null, negociateur: n?.nom ?? null, societe: societeDOffice(n?.societe),
    commissionne: n?.commissionne === false ? false : undefined } : p));
  const deux = (e: number | null, s: number | null): boolean => e !== null && s !== null && e !== s;
  // LOT I — le négociateur retiré : la commission de ce côté n'a plus de destinataire, elle est vidée (rien n'est encore enregistré).
  // LOT S — le négociateur d'avant était NON COMMISSIONNÉ : sa commission (gardée en base) n'est jamais reportée sur le nouveau ; ce côté repart proposé.
  const avant = etat.parties[i];
  const commissions = id === null && etat.commissions != null ? { ...etat.commissions, [cote]: { ...etat.commissions[cote], texte: '', auto: false } }
    : nonCommissionne(avant) && avant?.compteId !== id && etat.commissions != null ? { ...etat.commissions, [cote]: { texte: '', unite: etat.commissions[cote].unite, auto: true } } : etat.commissions;
  if (etat.parties.some((p) => p.sorte === 'exterieure') || (deux(etat.entreeId, etat.sortieId) && deux(entreeId, sortieId))) return { ...etat, entreeId, sortieId, commissions, parties: garder() };
  return { ...etat, entreeId, sortieId, commissions, parties: partiesPour(negos, entreeId, sortieId) };
}

/** LOT E — l'état de la somme pour le formulaire : les parties retenues et, si elle ne fait pas 100 %, la phrase (Enregistrer désactivé). PUR. */
export function etatSomme(etat: EtatRepartition, honorairesTtc: number): { parties: Partie[]; netHt: number; motif: string | null } {
  const commission = Number.isFinite(honorairesTtc) ? honorairesTtc : 0;
  const netHt = commissionNetteHt(commission, retroTtcDe(etat));
  const parties = versModele(etat.parties);
  return { parties, netHt, motif: parties.length === 0 ? null : motifSomme(parties, netHt) };
}

export function BlocRepartition({ etat, onChange, negociateurs, apporteurs, honorairesTtc, societeVente, desactive = false, seulementParts = false, collegues }: {
  etat: EtatRepartition; onChange: (e: EtatRepartition) => void; negociateurs: readonly NegociateurRef[]; apporteurs: readonly ApporteurRef[];
  /** La commission TTC saisie (NaN : pas encore lisible). */
  honorairesTtc: number;
  /** La société où la vente est saisie (sans négociateur : toute la commission lui revient, comme avant). */
  societeVente: Societe;
  desactive?: boolean;
  /**
   * 🔴 LOT T — le réglage de la répartition ouvert depuis le bouton « CRITERIMMO · 40 % » d'une colonne de la carte : les parts seules (% / €,
   * auto-compensation à deux parties, partie extérieure, société d'un collaborateur des deux sociétés) ; ni apporteur, ni choix du négociateur,
   * ni commission (ils restent dans « Modifier » et sous le bouton du négociateur). Absent : le bloc complet, inchangé.
   */
  seulementParts?: boolean;
  /**
   * 🔴 LOT AC — les comptes de l'interface (collègue rattaché, compte d'un interne) : avec eux, « + Ajouter un nouvel apporteur » sous la liste
   * des apporteurs (absents : réponse d'avant ce lot, pas de création).
   */
  collegues?: readonly OptionChoix[];
}) {
  // LOT AC — les apporteurs créés ici s'ajoutent à la liste (l'annuaire est relu au prochain chargement) ; la fenêtre de création.
  const [ajoutes, setAjoutes] = useState<ApporteurRef[]>([]);
  const [nouveau, setNouveau] = useState<string | null>(null);
  const annuaire = [...apporteurs, ...ajoutes.filter((a) => !apporteurs.some((x) => x.id === a.id))];
  const creation = collegues !== undefined;
  const retro = retroTtcDe(etat);
  const commission = Number.isFinite(honorairesTtc) ? honorairesTtc : 0;
  const net = commissionNetteHt(commission, retro);
  const lignesModele = etat.parties.map(versModeleUne);
  const parts = partsHt(lignesModele, net);
  // LOT U — les montants des cases « Part (€ HT) » calculées, au centime, la somme juste sur la base.
  // 🔴 LOT AH — la règle unique des centimes (celle du tableau de la carte) : la porteuse absorbe l'écart ; à défaut (somme ≠ 100 %), la règle du lot U.
  const porteuseEcran = societePorteuse({ societe: societeVente, repartition: { parties: lignesModele, retroApporteurTtc: retro } });
  const eurAffiches = centimesRepartition(lignesModele, commission, retro, porteuseEcran)?.parts ?? montantsAffiches(etat.parties, parts, net);
  const { parties, motif: motifTotal } = etatSomme(etat, honorairesTtc);
  // Sans aucun négociateur (rien n'est encore une partie), le total se lit sur les lignes affichées.
  const total = totalRepartition(parties.length === 0 ? lignesModele : parties, net);
  const parSociete = partsParSociete(parties, commission, retro);
  const pcts = pourcentagesParSociete(parties, net);
  const pctTexte = (x: number): string => `${x.toLocaleString('fr-FR', { maximumFractionDigits: 4 })} %`;
  const autre = parties.length === 0 ? null : verifierRepartition(parties, commission, retro);
  const motifAutre = autre !== null && motifTotal === null && motifSocieteVente(etat, negociateurs) === null ? autre : null;
  const optionsNego = negociateurs.map((n) => ({ id: n.id, libelle: `${n.nom} — ${n.societe === null ? 'société à renseigner dans Comptes' : LIBELLE_SOCIETE_COMPTE[n.societe]}` }));
  // LOT K — un collaborateur des deux sociétés : la société de SA partie se choisit pour cette vente (obligatoire).
  const deux = (p: PartieEcran): boolean => estDesDeux(p, negociateurs);
  const motifChoix = motifSocieteVente(etat, negociateurs);
  const choisirNego = (i: 0 | 1, v: string): void => onChange(changerNegociateur(etat, i === 0 ? 'entree' : 'sortie', v === '' ? null : Number(v), negociateurs));
  const changerPartie = (i: number, p: Partial<PartieEcran>): void => onChange({ ...etat, parties: etat.parties.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  const changerPart = (i: number, mode: 'pct' | 'eur', texte: string): void => onChange({ ...etat, parties: saisirPart(etat.parties, i, mode, texte, net) });

  return (
    <fieldset className="trx-plein trx-parts" data-bloc-repartition disabled={desactive}>
      <legend className="loc-muet">{seulementParts ? 'Répartition de la commission' : 'Apporteur et répartition de la commission'}</legend>
      {!seulementParts && <div className="trx-form">
        <label>Apporteur d’affaires
          {/* 🔴 LOT AC (Arno) — le sélecteur avec recherche (celui des négociateurs) : « Rechercher un apporteur » (nom, prénom, société) ; tout en
              bas, et seul choix quand rien n'est trouvé : « + Ajouter un nouvel apporteur « texte » ». */}
          <ListeChoix options={[...annuaire.map((a) => ({ id: a.id, libelle: a.nom, ...(a.recherche !== undefined ? { recherche: a.recherche } : {}) })),
            ...(creation ? [{ id: '+', libelle: '+ Ajouter un nouvel apporteur' }] : [])]} valeur={etat.apporteurId === null ? '' : String(etat.apporteurId)} vide="Aucun"
            libelle="Apporteur d’affaires" onChange={(v) => { if (v === '+') { setNouveau(''); return; } onChange({ ...etat, apporteurId: v === '' ? null : Number(v) }); }}
            donnees={{ 'data-champ': 'apporteur-annuaire' }}
            recherche={{ placeholder: 'Rechercher un apporteur', ...(creation ? { onCreer: (t: string) => setNouveau(t), libelleCreer: (t: string) => `+ Ajouter un nouvel apporteur « ${t} »` } : {}) }} />
          <span className="loc-muet">L’annuaire des apporteurs de la Location.</span></label>
        {nouveau !== null && collegues !== undefined && (
          <div className="trx-plein">
            <NouvelApporteur texte={nouveau} annuaire={annuaire} collegues={collegues} onFermer={() => setNouveau(null)}
              onChoisir={(id) => { setNouveau(null); onChange({ ...etat, apporteurId: id }); }}
              onCree={(a) => { setAjoutes((x) => [...x, a]); setNouveau(null); onChange({ ...etat, apporteurId: a.id }); }} />
          </div>
        )}
        <ChampMontantUnite mot="Rétrocession de l’apporteur" valeur={{ texte: etat.retroTexte, unite: etat.retroUnite ?? 'ttc' }} avecHt={etat.commissions != null}
          onChange={(m) => onChange({ ...etat, retroTexte: m.texte, retroUnite: m.unite })} champ="retro" aide="Déduite avant toute répartition." />
      </div>}

      {/* 🔴 LOT U (Arno) — en tête, la base de répartition : commission de la vente − apporteur(s) = base (TTC et HT), en direct. */}
      <ResumeBase commissionTtc={commission} apporteurs={etat.apporteurId === null && retro === 0 ? []
        : [{ nom: apporteurs.find((a) => a.id === etat.apporteurId)?.nom ?? null, ttc: retro }]} />
      <ul className="trx-journal trx-parties" data-parties>
        {etat.parties.map((p, i) => {
          const interne = p.sorte !== 'exterieure';
          const pctAffiche = p.mode === 'pct' ? p.texte : (Number.isFinite(parts[i]) ? texteNombre(pourcentageDe(parts[i], net)) : '');
          const eurAffiche = p.mode === 'eur' ? p.texte : (Number.isFinite(eurAffiches[i]) ? texteCentimes(eurAffiches[i]) : '');
          return (
            <li key={i} className="trx-partie" data-partie={p.sorte} data-ligne-partie={i}>
              <div className="trx-partie-tete">
                <strong>{interne ? LIBELLE_PARTIE[p.sorte] : 'Partie extérieure'}</strong>
                {interne && <span className={p.compteId !== null && p.societe === null ? 'trx-alerte' : 'loc-muet'} data-societe-partie={i}>
                  {p.compteId === null ? 'négociateur à choisir' : p.societe === null ? (deux(p) ? 'société à choisir pour cette vente' : '⚠ société à renseigner dans Comptes') : LIBELLE_SOCIETE[p.societe]}</span>}
                {!interne && <button type="button" className="trx-croix" aria-label="Retirer cette partie extérieure" title="Retirer cette partie extérieure"
                  onClick={() => onChange({ ...etat, parties: retirerPartie(etat.parties, i, net) })} data-retirer-exterieure>×</button>}
              </div>
              <div className="trx-part">
                {interne && seulementParts ? <span className="trx-partie-nego" data-nego-partie={i}>{p.negociateur ?? 'négociateur à choisir'}</span> : interne ? (
                  <label>Négociateur
                    <ListeChoix options={optionsNego} valeur={p.compteId === null ? '' : String(p.compteId)} vide="— à choisir —" libelle={LIBELLE_PARTIE[p.sorte]}
                      onChange={(v) => choisirNego(i === 0 ? 0 : 1, v)} donnees={{ 'data-champ': i === 0 ? 'entree' : 'sortie' }} recherche={{ placeholder: 'Rechercher un négociateur' }} /></label>
                ) : <>
                  <label>Nom (autre agence, confrère)<input value={p.nom ?? ''} onChange={(e) => changerPartie(i, { nom: e.target.value })} data-partie-nom /></label>
                  <label>Coordonnées (facultatif)<input value={p.coordonnees ?? ''} onChange={(e) => changerPartie(i, { coordonnees: e.target.value })} data-partie-coordonnees /></label>
                </>}
                <label>Part (%)<input inputMode="decimal" value={pctAffiche} onChange={(e) => changerPart(i, 'pct', e.target.value)} data-partie-pct={i} /></label>
                <label>Part (€ HT)<input inputMode="decimal" value={eurAffiche} onChange={(e) => changerPart(i, 'eur', e.target.value)} data-partie-eur={i} /></label>
              </div>
              {interne && deux(p) && <ChoixSocieteVente valeur={p.societe} onChoisir={(s) => onChange(choisirSocietePartie(etat, i, s))} cle={`partie-${i}`} />}
              {interne && p.compteId !== null && p.societe === null && !deux(p) && (
                <span className="trx-alerte" role="status" data-explication-societe={i}>
                  La répartition ne peut pas affecter cette part : {p.negociateur} n’a pas de société (CRITERIMMO ou MACJ). Renseignez-la dans Comptes.</span>
              )}
              {interne && p.compteId === null && (nombre(p.texte) ?? 0) !== 0 && <span className="loc-muet">Sans négociateur, cette part n’est pas comptée.</span>}
              {/* LOT I — la commission versée au négociateur de ce côté (entrée : ligne 0, sortie : ligne 1), HT ou TTC au choix. */}
              {interne && i < 2 && !seulementParts && (etat.commissions != null ? (
                p.compteId === null ? <span className="loc-muet" data-commission-sans-negociateur={i === 0 ? 'entree' : 'sortie'}>Commission versée : choisissez d’abord le négociateur.</span>
                  // 🔴 LOT S — non commissionné : ni commission, ni taux, ni calcul ; sa part reste dans la répartition.
                  : nonCommissionne(p) ? <span className="loc-muet" data-non-commissionne-form={i === 0 ? 'entree' : 'sortie'}>Non commissionné</span>
                  : <ChampMontantUnite mot={`Commission versée à ${p.negociateur ?? 'ce négociateur'}`} valeur={etat.commissions[i === 0 ? 'entree' : 'sortie']} avecHt
                    propose={propositionCommission(etat, i === 0 ? 'entree' : 'sortie', commission)}
                    onChange={(m) => onChange({ ...etat, commissions: { ...etat.commissions!, [i === 0 ? 'entree' : 'sortie']: m } })} champ={`commission-${i === 0 ? 'entree' : 'sortie'}`} />
              ) : <span className="loc-muet" data-commission-indisponible>Commission versée au négociateur : disponible après la mise à jour de la base (migration 437).</span>)}
              {!interne && <span className="loc-muet">Inter-cabinet extérieur : reversé par la société porteuse (dans ses commissions versées).</span>}
            </li>
          );
        })}
        <li className="trx-partie trx-partie--total" data-total-repartition>
          <div className="trx-partie-tete">
            <strong>Total</strong>
            <span className="trx-total" data-total-pct>{Number.isFinite(total.pourcentage) ? `${total.pourcentage.toLocaleString('fr-FR', { maximumFractionDigits: 4 })} %` : '—'}</span>
            <span data-total-eur>{Number.isFinite(total.montantHt) ? eur(total.montantHt) : '—'} HT</span>
          </div>
          {parties.length === 0 && <span className="loc-muet" data-sans-repartition>Aucun négociateur choisi : pas de répartition, toute la commission va à {LIBELLE_SOCIETE[societeVente]}.</span>}
          {motifTotal !== null && <span className="trx-alerte" role="status" data-motif-repartition>{motifTotal}</span>}
          {motifAutre !== null && <span className="trx-alerte" role="status" data-motif-repartition-autre>{motifAutre}</span>}
          {motifChoix !== null && <span className="trx-alerte" role="status" data-motif-societe-vente>{motifChoix}</span>}
          {parties.length > 0 && (() => {
            // 🔴 LOT R — la société PORTEUSE (négociateur d'entrée) encaisse le CA de la vente ; la part de l'autre société lui est reversée.
            const b = bilanVente({ societe: societeVente, honorairesTtc: commission, repartition: { parties, retroApporteurTtc: retro } }, null);
            const porteuse = b.porteuse;
            const verse = bilanVente({ societe: societeVente, honorairesTtc: commission, repartition: { parties, retroApporteurTtc: retro } }, porteuse);
            return <span className="loc-muet" data-inter-cabinet-form>CA de la vente : {LIBELLE_SOCIETE[porteuse]} (société porteuse), {eur(b.caHt)} HT
              {sommeSocietes(verse.verseHt) + verse.exterieurHt > 0 ? ` · dont reversé en inter-cabinet : ${[...SOCIETES.filter((s) => verse.verseHt[s] > 0).map((s) => `vers ${LIBELLE_SOCIETE[s]} ${eur(verse.verseHt[s])} HT`),
                ...(verse.exterieurHt > 0 ? [`extérieur ${eur(verse.exterieurHt)} HT`] : [])].join(' · ')}` : ' · rien de reversé en inter-cabinet'}</span>;
          })()}
          {parties.length > 0 && (
            // LOT N — chaque part avec son % de la commission nette, comme dans le tableau de la carte.
            <span className="loc-muet" data-parts-societes>{SOCIETES.map((s) => `Part ${LIBELLE_SOCIETE[s]} : ${eur(parSociete.societe[s])} HT (${pctTexte(pcts.societe[s])})`).join(' · ')}
              {parSociete.exterieurHt > 0 ? ` · part extérieure (inter-cabinet extérieur) : ${eur(parSociete.exterieurHt)} HT (${pctTexte(pcts.exterieur)})` : ''}</span>
          )}
        </li>
      </ul>
      <p className="trx-actions">
        <button type="button" className="trx-bouton-lien" onClick={() => onChange({ ...etat, parties: [...etat.parties, versEcran(partieExterieure())] })} data-ajouter-exterieure>+ Ajouter une partie extérieure</button>
        <button type="button" className="trx-bouton-lien" onClick={() => onChange({ ...etat, parties: partiesPour(negociateurs, etat.entreeId, etat.sortieId) })} data-revenir-5050>Revenir au 50/50</button>
      </p>
    </fieldset>
  );
}

/** LOT I — le montant dans l'autre unité, pour la ligne « soit … » (vide : rien). PUR. */
export function equivalent(m: MontantEcran): string | null {
  const x = nombre(m.texte);
  if (x === null) return null;
  const a = autreUnite({ montant: x, unite: m.unite });
  return `soit ${eur(a.montant)} ${LIBELLE_UNITE[a.unite]}`;
}

/**
 * 🔴 LOT I (Arno) — UN MONTANT AVEC SON UNITÉ « HT / TTC » AU CHOIX : le champ, deux boutons (cibles de 44 px, le bouton choisi est
 * enfoncé et dit « HT » ou « TTC » — jamais la couleur seule), et l'équivalent dans l'autre unité dessous. Sans la 437 : « HT » grisé.
 */
export function ChampMontantUnite({ mot, valeur: brute, onChange, avecHt, champ, aide, propose = null }: {
  mot: string; valeur: MontantEcran; onChange: (m: MontantEcran) => void; avecHt: boolean; champ: string; aide?: string;
  /**
   * LOT O / R — la rémunération proposée (taux × la part de ce côté) ; montrée tant que le champ n'est pas saisi (`auto`). Avec elle, le
   * champ « Taux de rémunération (%) » (l'un recalcule l'autre) et, pour une valeur saisie qui diffère du calcul, « Appliquer le calcul ».
   */
  propose?: Proposition | null;
}) {
  const valeur = montantEffectif(brute, propose);
  const eq = equivalent(valeur);
  const avecTaux = propose !== undefined;
  const pctTexte = (x: number): string => x.toLocaleString('fr-FR', { maximumFractionDigits: 4 });
  return (
    <div className="trx-montant-unite" data-montant-unite={champ}>
      {avecTaux && <label>Taux de rémunération (%)
        <input inputMode="decimal" value={brute.taux ?? texteTaux(TAUX_REMUNERATION_DEFAUT)} onChange={(e) => onChange(saisirTaux(brute, e.target.value))} data-taux={champ} /></label>}
      <label>{mot} ({LIBELLE_UNITE[valeur.unite]})
        <input inputMode="decimal" value={valeur.texte} onChange={(e) => onChange(avecTaux ? saisirMontant({ ...brute, unite: valeur.unite }, e.target.value, propose ?? null) : { texte: e.target.value, unite: valeur.unite, auto: false })} data-champ={champ} /></label>
      <div className="trx-unites" role="group" aria-label={`Unité : ${mot}`}>
        {UNITES.map((u) => (
          <button key={u} type="button" className="trx-unite" aria-pressed={valeur.unite === u} disabled={u === 'ht' && !avecHt}
            onClick={() => onChange({ ...brute, unite: u })} data-unite={u} data-unite-de={champ}>{LIBELLE_UNITE[u]}</button>
        ))}
      </div>
      {eq !== null && <span className="loc-muet" data-equivalent={champ}>{eq}</span>}
      {brute.auto === true && propose != null && <span className="loc-muet" data-propose={champ}>
        proposé : {pctTexte(propose.taux)} % de {eur(propose.baseTtc)} TTC (sa part : {pctTexte(propose.pct)} % de la commission nette)</span>}
      {ecartCalcul(brute, propose ?? null) && propose != null && <span className="trx-ecart-calcul" data-ecart-calcul={champ}>
        <span className="trx-alerte">valeur saisie — calcul proposé : {eur(propose.ttc)} TTC</span>
        <button type="button" className="trx-bouton-lien" onClick={() => onChange({ ...brute, auto: true })} data-appliquer-calcul={champ}>Appliquer le calcul</button></span>}
      {aide !== undefined && <span className="loc-muet">{aide}</span>}
      {!avecHt && <span className="loc-muet" data-ht-indisponible={champ}>Saisie en HT : disponible après la mise à jour de la base (migration 437).</span>}
    </div>
  );
}

// ── LOT K : un collaborateur des deux sociétés ───────────────────────────────────────────────────────────────────────────

/** La partie est-elle celle d'un collaborateur « CRITERIMMO et MACJ » (sa société se choisit pour la vente) ? PUR. */
export const estDesDeux = (p: Pick<PartieEcran, 'sorte' | 'compteId'>, negos: readonly NegociateurRef[]): boolean =>
  p.sorte !== 'exterieure' && p.compteId !== null && negos.find((n) => n.id === p.compteId)?.societe === LES_DEUX;

/** La société choisie pour cette vente sur la partie `i`. PUR. */
export const choisirSocietePartie = (etat: EtatRepartition, i: number, societe: Societe): EtatRepartition =>
  ({ ...etat, parties: etat.parties.map((p, j) => (j === i ? { ...p, societe } : p)) });

/**
 * 🔴 LOT K — LE CHOIX OBLIGATOIRE : null si chaque collaborateur des deux sociétés a sa société pour cette vente, sinon la phrase (le
 * formulaire désactive « Enregistrer », la saisie reste ; le serveur refuse aussi). PUR.
 */
export function motifSocieteVente(etat: Pick<EtatRepartition, 'parties'>, negos: readonly NegociateurRef[]): string | null {
  const p = etat.parties.find((x, i) => estDesDeux(x, negos) && x.societe === null && !(i === 1 && x.compteId === etat.parties[0]?.compteId && (nombre(x.texte) ?? 0) === 0));
  return p === undefined ? null
    : `${p.negociateur ?? 'Ce négociateur'} travaille pour CRITERIMMO et pour MACJ : choisissez pour quelle société il travaille sur cette vente (${p.sorte === 'sortie' ? 'sortie' : 'entrée'} du mandat).`;
}

/** « Pour cette vente, il travaille pour : CRITERIMMO / MACJ » — deux boutons de 44 px, le choisi enfoncé (le mot, jamais la couleur seule). */
export function ChoixSocieteVente({ valeur, onChoisir, cle }: { valeur: Societe | null; onChoisir: (s: Societe) => void; cle: string }) {
  return (
    <div className="trx-societe-vente" role="group" aria-label="Pour cette vente, il travaille pour" data-choix-societe-vente={cle}>
      <span className="trx-societe-vente-mot">Pour cette vente, il travaille pour :</span>
      <div className="trx-unites">
        {SOCIETES.map((s) => (
          <button key={s} type="button" className="trx-unite" aria-pressed={valeur === s} onClick={() => onChoisir(s)} data-societe-vente={s}>{LIBELLE_SOCIETE[s]}</button>
        ))}
      </div>
      {valeur === null && <span className="trx-alerte" data-societe-vente-manque>choix obligatoire</span>}
    </div>
  );
}

// ── LOT O : la commission versée proposée ─────────────────────────────────────────────────────────────────────────────────

/**
 * La rémunération proposée d'un côté : la part de ce côté (en % de la commission nette), sa BASE (le CA que la vente apporte à la société
 * du négociateur, TTC), le taux de rémunération (%), et le calcul (TTC).
 */
export interface Proposition { pct: number; baseTtc: number; taux: number; ttc: number }

/**
 * 🔴 LOT R (Arno) — LA RÉMUNÉRATION PROPOSÉE d'un côté = taux de rémunération (50 % par défaut, modifiable) × la BASE : la part de ce côté
 * dans la répartition (sa ligne : en %, ou en € HT ramenée en %) × la commission nette de l'apporteur, en TTC — le CA que la vente apporte
 * à sa société (ex. Pierre : 50 % × 2 000 € = 1 000 € TTC). Remplace la proposition du lot O (100 % de la part, sur la commission
 * entière). null : pas de négociateur, part nulle, ou commission illisible — le champ reste vide. PUR.
 */
export function propositionCommission(etat: Pick<EtatRepartition, 'parties' | 'retroTexte' | 'retroUnite'> & Partial<Pick<EtatRepartition, 'commissions'>>, cote: 'entree' | 'sortie', honorairesTtc: number): Proposition | null {
  const p = etat.parties[cote === 'entree' ? 0 : 1];
  // LOT S — un négociateur non commissionné : aucune proposition (le champ ne s'affiche pas, rien ne s'écrit pour lui).
  if (p === undefined || p.compteId === null || nonCommissionne(p) || !Number.isFinite(honorairesTtc) || honorairesTtc <= 0) return null;
  const x = nombre(p.texte);
  if (x === null) return null;
  const netTtc = honorairesTtc - retroTtcDe(etat);
  const pct = p.mode === 'pct' ? x : pourcentageDe(x, commissionNetteHt(honorairesTtc, retroTtcDe(etat)));
  const taux = tauxDe(etat.commissions?.[cote]);
  const baseTtc = (netTtc * pct) / 100;
  return pct > 0 ? { pct, baseTtc, taux, ttc: (baseTtc * taux) / 100 } : null;
}

/** Le taux de rémunération d'un champ (saisi, sinon 50 %). PUR. */
export const tauxDe = (m: Pick<MontantEcran, 'taux'> | null | undefined): number => nombre(m?.taux ?? '') ?? TAUX_REMUNERATION_DEFAUT;
/** Le texte d'un taux (« 50 », « 62,5 »). PUR. */
export const texteTaux = (x: number): string => String(Number(x.toPrecision(12))).replace('.', ',');

/** 🔴 LOT R — un montant saisi recalcule le taux (montant TTC ÷ base) ; sans base, le taux reste. PUR. */
export function saisirMontant(m: MontantEcran, texte: string, propose: Proposition | null): MontantEcran {
  const x = nombre(texte);
  const ttc = x === null ? null : m.unite === 'ttc' ? x : x * TVA;
  const t = ttc === null || propose === null ? null : tauxDuMontant(ttc, propose.baseTtc);
  return { ...m, texte, auto: false, ...(t !== null ? { taux: texteTaux(t) } : {}) };
}
/** 🔴 LOT R — un taux saisi recalcule le montant : le champ redevient « proposé » (taux × base). PUR. */
export const saisirTaux = (m: MontantEcran, taux: string): MontantEcran => ({ ...m, taux, auto: true });

/** 🔴 LOT R — la valeur saisie diffère-t-elle du calcul (« valeur saisie — calcul proposé : X € ») ? PUR. */
export function ecartCalcul(m: MontantEcran, propose: Proposition | null): boolean {
  if (m.auto === true || propose === null) return false;
  const x = nombre(m.texte);
  if (x === null) return false;
  return Math.abs((m.unite === 'ttc' ? x : x * TVA) - propose.ttc) >= 0.005;
}

const texteCentimes = (x: number): string => x.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Ce que le champ montre (et ce qui s'enverra) : une commission saisie, telle quelle ; une commission PROPOSÉE, le montant proposé dans
 * l'unité choisie (TTC ; HT = TTC ÷ 1,2), sans proposition : vide. PUR.
 */
export function montantEffectif(m: MontantEcran, propose: Proposition | null): MontantEcran {
  if (m.auto !== true) return m;
  if (propose === null) return { texte: '', unite: m.unite, auto: true };
  return { texte: texteCentimes(m.unite === 'ttc' ? propose.ttc : propose.ttc / TVA), unite: m.unite, auto: true };
}

/** Les commissions telles qu'elles s'enregistrent : la proposition affichée devient le montant envoyé (« Enregistrer » la valide). PUR. */
export function commissionsResolues(etat: EtatRepartition, honorairesTtc: number): EtatRepartition {
  if (etat.commissions == null) return etat;
  const c = etat.commissions;
  const r = (cote: 'entree' | 'sortie'): MontantEcran => { const e = montantEffectif(c[cote], propositionCommission(etat, cote, honorairesTtc));
    return { texte: e.texte, unite: e.unite, ...(c[cote].taux !== undefined ? { taux: c[cote].taux } : {}) }; };
  return { ...etat, commissions: { entree: r('entree'), sortie: r('sortie') } };
}

// ── 🔴 LOT U : la base de répartition en tête ; les parts en € au centime ────────────────────────────────────────────────────


/**
 * 🔴 LOT U (Arno) — LES MONTANTS AFFICHÉS des cases « Part (€ HT) » : chaque part CALCULÉE (saisie en %) arrondie au centime pour l'affichage
 * seulement (le calcul garde sa précision) ; quand les parts font la base, l'écart d'arrondi est reporté sur la DERNIÈRE part calculée, pour
 * que la somme affichée tombe juste au centime sur la base. Une part saisie en € garde sa saisie (comptée au centime). PUR.
 */
export function montantsAffiches(lignes: readonly Pick<PartieEcran, 'mode' | 'texte'>[], parts: readonly number[], netHt: number): number[] {
  const c = (x: number): number => Math.round(x * 100) / 100;
  const affiches = parts.map((x, i) => (lignes[i]?.mode === 'eur' ? x : c(x)));
  const somme = parts.reduce((t, x) => t + (Number.isFinite(x) ? x : Number.NaN), 0);
  const derniere = lignes.map((l, i) => (l.mode === 'eur' ? -1 : i)).filter((i) => i >= 0).at(-1);
  if (derniere === undefined || !Number.isFinite(somme) || Math.abs(somme - netHt) > 1e-6) return affiches;
  const autres = affiches.reduce((t, x, i) => t + (i === derniere ? 0 : c(x)), 0);
  affiches[derniere] = c(c(netHt) - autres);
  return affiches;
}

/**
 * 🔴 LOT U (Arno) — LA BASE DE RÉPARTITION, en tête du panneau (carte et formulaire) : « Commission de la vente », une ligne « − Apporteur :
 * Nom » par apporteur (le MONTANT en rouge, le signe et le mot avec lui ; aucun : « Aucun apporteur », sans rouge), puis « = Base de
 * répartition » en gras — HT (gras) puis TTC (vert, entre parenthèses) en colonnes alignées à droite (lot V). Elle se lit sur la saisie en cours : elle suit l'apporteur et la commission.
 */
export function ResumeBase({ commissionTtc, apporteurs }: { commissionTtc: number; apporteurs: readonly { nom: string | null; ttc: number }[] }) {
  const baseTtc = commissionTtc - apporteurs.reduce((t, a) => t + a.ttc, 0);
  // 🔴 LOT V (Arno) — le HT en gras d'abord, puis le TTC entre parenthèses, en vert (« TTC » écrit) ; l'apporteur : tout en rouge.
  // 🔴 LOT W — HT et TTC l'un sous l'autre, dans une colonne de largeur fixe alignée à droite : les montants ne se coupent jamais.
  // 🔴 LOT AH — la base HT = la commission au centime − l'apporteur au centime (la même que le tableau de la carte : tout tombe juste).
  const baseHt = auCentime(auCentime(commissionTtc / TVA) - apporteurs.reduce((t, a) => t + auCentime(a.ttc / TVA), 0));
  const montants = (ttc: number, rouge?: boolean, donnee?: string, htForce?: number) => (
    <td className="trx-resume-montants"><span className={rouge ? 'trx-rouge' : undefined} data-resume-ht={donnee}><strong>{eur(htForce ?? ttc / TVA)} HT</strong></span>{' '}
      <span className={rouge ? 'trx-rouge' : 'trx-vert'} data-resume-ttc={donnee}>({eur(ttc)} TTC)</span></td>);
  return (
    <table className="trx-resume-base" aria-label="Base de répartition" data-resume-base>
      <thead><tr><td /><th scope="col">HT (TTC)</th></tr></thead>
      <tbody>
        <tr data-resume="commission"><th scope="row">Commission de la vente</th>{montants(commissionTtc, false, 'commission')}</tr>
        {apporteurs.length === 0
          ? <tr data-resume="aucun-apporteur"><th scope="row" className="loc-muet">Aucun apporteur</th><td /></tr>
          : apporteurs.map((a, i) => <tr key={i} data-resume="apporteur"><th scope="row">− Apporteur{a.nom === null ? '' : ` : ${a.nom}`}</th>{montants(a.ttc, true, `apporteur-${i}`)}</tr>)}
        <tr className="trx-resume-base-total" data-resume="base"><th scope="row">= Base de répartition{' '}
          <span className="trx-resume-base-note">tous les calculs ci-dessous partent de cette base</span></th>{montants(baseTtc, false, 'base', baseHt)}</tr>
      </tbody>
    </table>
  );
}
