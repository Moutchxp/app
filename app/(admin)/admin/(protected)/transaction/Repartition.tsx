'use client';

import { ListeChoix } from '../location/ListeChoix';
import { commissionNetteHt, ht, LIBELLE_PARTIE, LIBELLE_SOCIETE, partsHt, SOCIETES, type Partie, type Societe } from '../../../../lib/transaction/modele';
import { motifSomme, partieExterieure, partsParSociete, pourcentageDe, totalRepartition, verifierRepartition } from '../../../../lib/transaction/repartition';
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

export interface NegociateurRef { id: number; nom: string; societe: Societe | null }
export interface ApporteurRef { id: number; nom: string }
/** Une partie à l'écran : sa part telle que saisie (texte), en % ou en €. */
export interface PartieEcran extends Omit<Partie, 'pourcentage' | 'montantHt'> { mode: 'pct' | 'eur'; texte: string }
/** `parties[0]` : la ligne « Entrée du mandat », `parties[1]` : « Sortie du mandat » (toujours là) ; ensuite les parties extérieures. */
export interface EtatRepartition { entreeId: number | null; sortieId: number | null; apporteurId: number | null; retroTexte: string; parties: PartieEcran[] }

export const nombre = (s: string): number | null => {
  const t = s.replace(/[\s  €%]/g, '').replace(',', '.');
  return t === '' || !/^-?\d+(\.\d+)?$/.test(t) ? null : Number(t);
};
const texteNombre = (x: number): string => String(x).replace('.', ',');

/** Partie (modèle) → partie à l'écran. */
export const versEcran = (p: Partie): PartieEcran => ({ sorte: p.sorte, compteId: p.compteId, negociateur: p.negociateur, societe: p.societe, nom: p.nom, coordonnees: p.coordonnees,
  mode: p.pourcentage !== null ? 'pct' : 'eur', texte: texteNombre(p.pourcentage ?? p.montantHt ?? 0) });
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
  societe: n?.societe ?? null, nom: null, coordonnees: null, mode: 'pct', texte: texteNombre(pct) });
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
  const garder = (): PartieEcran[] => etat.parties.map((p, j) => (j === i ? { ...p, compteId: n?.id ?? null, negociateur: n?.nom ?? null, societe: n?.societe ?? null } : p));
  const deux = (e: number | null, s: number | null): boolean => e !== null && s !== null && e !== s;
  if (etat.parties.some((p) => p.sorte === 'exterieure') || (deux(etat.entreeId, etat.sortieId) && deux(entreeId, sortieId))) return { ...etat, entreeId, sortieId, parties: garder() };
  return { ...etat, entreeId, sortieId, parties: partiesPour(negos, entreeId, sortieId) };
}

/** LOT E — l'état de la somme pour le formulaire : les parties retenues et, si elle ne fait pas 100 %, la phrase (Enregistrer désactivé). PUR. */
export function etatSomme(etat: EtatRepartition, honorairesTtc: number): { parties: Partie[]; netHt: number; motif: string | null } {
  const commission = Number.isFinite(honorairesTtc) ? honorairesTtc : 0;
  const netHt = commissionNetteHt(commission, nombre(etat.retroTexte) ?? 0);
  const parties = versModele(etat.parties);
  return { parties, netHt, motif: parties.length === 0 ? null : motifSomme(parties, netHt) };
}

export function BlocRepartition({ etat, onChange, negociateurs, apporteurs, honorairesTtc, societeVente, desactive = false }: {
  etat: EtatRepartition; onChange: (e: EtatRepartition) => void; negociateurs: readonly NegociateurRef[]; apporteurs: readonly ApporteurRef[];
  /** La commission TTC saisie (NaN : pas encore lisible). */
  honorairesTtc: number;
  /** La société où la vente est saisie (sans négociateur : toute la commission lui revient, comme avant). */
  societeVente: Societe;
  desactive?: boolean;
}) {
  const retro = nombre(etat.retroTexte) ?? 0;
  const commission = Number.isFinite(honorairesTtc) ? honorairesTtc : 0;
  const net = commissionNetteHt(commission, retro);
  const lignesModele = etat.parties.map(versModeleUne);
  const parts = partsHt(lignesModele, net);
  const { parties, motif: motifTotal } = etatSomme(etat, honorairesTtc);
  // Sans aucun négociateur (rien n'est encore une partie), le total se lit sur les lignes affichées.
  const total = totalRepartition(parties.length === 0 ? lignesModele : parties, net);
  const parSociete = partsParSociete(parties, commission, retro);
  const autre = parties.length === 0 ? null : verifierRepartition(parties, commission, retro);
  const motifAutre = autre !== null && motifTotal === null ? autre : null;
  const optionsNego = negociateurs.map((n) => ({ id: n.id, libelle: `${n.nom} — ${n.societe === null ? 'société à renseigner dans Comptes' : LIBELLE_SOCIETE[n.societe]}` }));
  const choisirNego = (i: 0 | 1, v: string): void => onChange(changerNegociateur(etat, i === 0 ? 'entree' : 'sortie', v === '' ? null : Number(v), negociateurs));
  const changerPartie = (i: number, p: Partial<PartieEcran>): void => onChange({ ...etat, parties: etat.parties.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  const changerPart = (i: number, mode: 'pct' | 'eur', texte: string): void => onChange({ ...etat, parties: saisirPart(etat.parties, i, mode, texte, net) });

  return (
    <fieldset className="trx-plein trx-parts" data-bloc-repartition disabled={desactive}>
      <legend className="loc-muet">Apporteur et répartition de la commission</legend>
      <div className="trx-form">
        <label>Apporteur d’affaires
          <ListeChoix options={apporteurs.map((a) => ({ id: a.id, libelle: a.nom }))} valeur={etat.apporteurId === null ? '' : String(etat.apporteurId)} vide="Aucun"
            libelle="Apporteur d’affaires" onChange={(v) => onChange({ ...etat, apporteurId: v === '' ? null : Number(v) })} donnees={{ 'data-champ': 'apporteur-annuaire' }} />
          <span className="loc-muet">L’annuaire des apporteurs de la Location.</span></label>
        <label>Rétrocession de l’apporteur (TTC)
          <input inputMode="decimal" value={etat.retroTexte} onChange={(e) => onChange({ ...etat, retroTexte: e.target.value })} data-champ="retro" />
          <span className="loc-muet">Déduite avant toute répartition.</span></label>
      </div>

      <ul className="trx-journal trx-parties" data-parties>
        {etat.parties.map((p, i) => {
          const interne = p.sorte !== 'exterieure';
          const pctAffiche = p.mode === 'pct' ? p.texte : (Number.isFinite(parts[i]) ? texteNombre(pourcentageDe(parts[i], net)) : '');
          const eurAffiche = p.mode === 'eur' ? p.texte : (Number.isFinite(parts[i]) ? texteNombre(parts[i]) : '');
          return (
            <li key={i} className="trx-partie" data-partie={p.sorte} data-ligne-partie={i}>
              <div className="trx-partie-tete">
                <strong>{interne ? LIBELLE_PARTIE[p.sorte] : 'Partie extérieure'}</strong>
                {interne && <span className={p.compteId !== null && p.societe === null ? 'trx-alerte' : 'loc-muet'} data-societe-partie={i}>
                  {p.compteId === null ? 'négociateur à choisir' : p.societe === null ? '⚠ société à renseigner dans Comptes' : LIBELLE_SOCIETE[p.societe]}</span>}
                {!interne && <button type="button" className="trx-croix" aria-label="Retirer cette partie extérieure" title="Retirer cette partie extérieure"
                  onClick={() => onChange({ ...etat, parties: retirerPartie(etat.parties, i, net) })} data-retirer-exterieure>×</button>}
              </div>
              <div className="trx-part">
                {interne ? (
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
              {interne && p.compteId !== null && p.societe === null && (
                <span className="trx-alerte" role="status" data-explication-societe={i}>
                  La répartition ne peut pas affecter cette part : {p.negociateur} n’a pas de société (CRITERIMMO ou MACJ). Renseignez-la dans Comptes.</span>
              )}
              {interne && p.compteId === null && (nombre(p.texte) ?? 0) !== 0 && <span className="loc-muet">Sans négociateur, cette part n’est pas comptée.</span>}
              {!interne && <span className="loc-muet">Hors de nos chiffres : dans le CA d’aucune société.</span>}
            </li>
          );
        })}
        <li className="trx-partie trx-partie--total" data-total-repartition>
          <div className="trx-partie-tete">
            <strong>Total</strong>
            <span className="trx-total" data-total-pct>{Number.isFinite(total.pourcentage) ? `${total.pourcentage.toLocaleString('fr-FR', { maximumFractionDigits: 4 })} %` : '—'}</span>
            <span data-total-eur>{Number.isFinite(total.montantHt) ? eur(total.montantHt) : '—'} HT</span>
            <span className="loc-muet">sur {eur(net)} HT de commission nette ({eur(ht(commission))} HT − rétrocession)</span>
          </div>
          {parties.length === 0 && <span className="loc-muet" data-sans-repartition>Aucun négociateur choisi : pas de répartition, toute la commission va à {LIBELLE_SOCIETE[societeVente]}.</span>}
          {motifTotal !== null && <span className="trx-alerte" role="status" data-motif-repartition>{motifTotal}</span>}
          {motifAutre !== null && <span className="trx-alerte" role="status" data-motif-repartition-autre>{motifAutre}</span>}
          {parties.length > 0 && (
            <span className="loc-muet" data-parts-societes>{SOCIETES.map((s) => `Part ${LIBELLE_SOCIETE[s]} : ${eur(parSociete.societe[s])} HT`).join(' · ')}
              {parSociete.exterieurHt > 0 ? ` · part extérieure (hors CA) : ${eur(parSociete.exterieurHt)} HT` : ''}</span>
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
