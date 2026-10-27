'use client';

import { Fragment } from 'react';
import { ListeChoix } from '../location/ListeChoix';
import { commissionNetteHt, ht, LIBELLE_PARTIE, LIBELLE_SOCIETE, partsHt, SOCIETES, type Partie, type Societe } from '../../../../lib/transaction/modele';
import { partieExterieure, partiesParDefaut, partsParSociete, pourcentageDe, totalRepartition, verifierRepartition, type NegociateurChoisi } from '../../../../lib/transaction/repartition';
import { eur } from './commun';

/**
 * ══ 🔴 TUILE « TRANSACTION », LOT D (Arno, 27/10/2026) — LE BLOC « NÉGOCIATEURS ET RÉPARTITION », PARTAGÉ ═══════════════════════
 * Le même composant dans « Nouvelle vente » et dans le formulaire d'un compromis (aucune copie) : négociateur d'ENTRÉE et de SORTIE du
 * mandat (comptes, avec leur société), apporteur (annuaire des apporteurs de la Location) et sa rétrocession, puis la RÉPARTITION de la
 * commission nette : chaque part en % OU en € HT (l'autre se calcule), « + Ajouter une partie extérieure », « Revenir au 50/50 ». Les
 * règles sont celles de `lib/transaction/repartition.ts` ; le message dit tout de suite si la somme ne fait pas 100 % (le serveur
 * revérifie et refuse, sans rien écrire : la saisie reste à l'écran).
 */

export interface NegociateurRef { id: number; nom: string; societe: Societe | null }
export interface ApporteurRef { id: number; nom: string }
/** Une partie à l'écran : sa part telle que saisie (texte), en % ou en €. */
export interface PartieEcran extends Omit<Partie, 'pourcentage' | 'montantHt'> { mode: 'pct' | 'eur'; texte: string }
export interface EtatRepartition { entreeId: number | null; sortieId: number | null; apporteurId: number | null; retroTexte: string; parties: PartieEcran[] }

export const nombre = (s: string): number | null => {
  const t = s.replace(/[\s  €%]/g, '').replace(',', '.');
  return t === '' || !/^-?\d+(\.\d+)?$/.test(t) ? null : Number(t);
};
const texteNombre = (x: number): string => String(x).replace('.', ',');

/** Partie (modèle) → partie à l'écran. */
export const versEcran = (p: Partie): PartieEcran => ({ sorte: p.sorte, compteId: p.compteId, negociateur: p.negociateur, societe: p.societe, nom: p.nom, coordonnees: p.coordonnees,
  mode: p.pourcentage !== null ? 'pct' : 'eur', texte: texteNombre(p.pourcentage ?? p.montantHt ?? 0) });
/** Partie à l'écran → partie (modèle) ; un texte illisible compte pour NaN (la vérification le refuse). */
export const versModele = (p: PartieEcran): Partie => {
  const x = nombre(p.texte) ?? Number.NaN;
  return { sorte: p.sorte, compteId: p.compteId, negociateur: p.negociateur, societe: p.societe, nom: p.nom, coordonnees: p.coordonnees,
    pourcentage: p.mode === 'pct' ? x : null, montantHt: p.mode === 'eur' ? x : null };
};

const choisi = (negos: readonly NegociateurRef[], id: number | null): NegociateurChoisi | null => {
  const n = id === null ? undefined : negos.find((x) => x.id === id);
  return n === undefined ? null : { id: n.id, nom: n.nom, societe: n.societe };
};

/** Les parties par défaut pour ces négociateurs, la partie extérieure éventuelle gardée telle quelle. PUR. */
export function partiesPour(negos: readonly NegociateurRef[], entreeId: number | null, sortieId: number | null, garder: readonly PartieEcran[] = []): PartieEcran[] {
  return [...partiesParDefaut(choisi(negos, entreeId), choisi(negos, sortieId)).map(versEcran), ...garder.filter((p) => p.sorte === 'exterieure')];
}

export function BlocRepartition({ etat, onChange, negociateurs, apporteurs, honorairesTtc, desactive = false }: {
  etat: EtatRepartition; onChange: (e: EtatRepartition) => void; negociateurs: readonly NegociateurRef[]; apporteurs: readonly ApporteurRef[];
  /** La commission TTC saisie (NaN : pas encore lisible). */
  honorairesTtc: number; desactive?: boolean;
}) {
  const retro = nombre(etat.retroTexte) ?? 0;
  const commission = Number.isFinite(honorairesTtc) ? honorairesTtc : 0;
  const net = commissionNetteHt(commission, retro);
  const parties = etat.parties.map(versModele);
  const parts = partsHt(parties, net);
  const total = totalRepartition(parties, net);
  const parSociete = partsParSociete(parties, commission, retro);
  const motif = parties.length === 0 ? null : verifierRepartition(parties, commission, retro);
  const optionsNego = negociateurs.map((n) => ({ id: n.id, libelle: `${n.nom} — ${n.societe === null ? 'société à renseigner' : LIBELLE_SOCIETE[n.societe]}` }));
  const changerNego = (cote: 'entreeId' | 'sortieId', v: string): void => {
    const suivant = { ...etat, [cote]: v === '' ? null : Number(v) };
    onChange({ ...suivant, parties: partiesPour(negociateurs, suivant.entreeId, suivant.sortieId, etat.parties) });
  };
  const changerPartie = (i: number, p: Partial<PartieEcran>): void => onChange({ ...etat, parties: etat.parties.map((x, j) => (j === i ? { ...x, ...p } : x)) });

  return (
    <fieldset className="trx-plein trx-parts" data-bloc-repartition disabled={desactive}>
      <legend className="loc-muet">Négociateurs, apporteur et répartition de la commission</legend>
      <div className="trx-form">
        <label>Négociateur d’entrée du mandat
          <ListeChoix options={optionsNego} valeur={etat.entreeId === null ? '' : String(etat.entreeId)} vide="—" libelle="Négociateur d’entrée du mandat"
            onChange={(v) => changerNego('entreeId', v)} donnees={{ 'data-champ': 'entree' }} /></label>
        <label>Négociateur de sortie du mandat
          <ListeChoix options={optionsNego} valeur={etat.sortieId === null ? '' : String(etat.sortieId)} vide="—" libelle="Négociateur de sortie du mandat"
            onChange={(v) => changerNego('sortieId', v)} donnees={{ 'data-champ': 'sortie' }} /></label>
        <label>Apporteur d’affaires
          <ListeChoix options={apporteurs.map((a) => ({ id: a.id, libelle: a.nom }))} valeur={etat.apporteurId === null ? '' : String(etat.apporteurId)} vide="Aucun"
            libelle="Apporteur d’affaires" onChange={(v) => onChange({ ...etat, apporteurId: v === '' ? null : Number(v) })} donnees={{ 'data-champ': 'apporteur-annuaire' }} />
          <span className="loc-muet">L’annuaire des apporteurs de la Location.</span></label>
        <label>Rétrocession de l’apporteur (TTC)
          <input inputMode="decimal" value={etat.retroTexte} onChange={(e) => onChange({ ...etat, retroTexte: e.target.value })} data-champ="retro" />
          <span className="loc-muet">Déduite avant toute répartition : commission nette {eur(net)} HT.</span></label>
      </div>

      {etat.parties.length === 0 ? <p className="loc-muet">Choisissez le négociateur d’entrée et de sortie : la répartition se propose (50 / 50, ou 100 % pour un seul négociateur).</p> : (
        <ul className="trx-journal" data-parties>
          {etat.parties.map((p, i) => {
            const pctAffiche = p.mode === 'pct' ? p.texte : (Number.isFinite(parts[i]) ? texteNombre(pourcentageDe(parts[i], net)) : '');
            const eurAffiche = p.mode === 'eur' ? p.texte : (Number.isFinite(parts[i]) ? texteNombre(parts[i]) : '');
            return (
              <li key={i} data-partie={p.sorte}>
                <strong>{p.sorte === 'exterieure' ? 'Partie extérieure' : LIBELLE_PARTIE[p.sorte]}</strong>
                {p.sorte !== 'exterieure' && <> — {p.negociateur} <span className="loc-muet">({p.societe === null ? 'société à renseigner dans Comptes' : LIBELLE_SOCIETE[p.societe]})</span></>}
                <div className="trx-part">
                  {p.sorte === 'exterieure' && <>
                    <label>Nom (autre agence, confrère)<input value={p.nom ?? ''} onChange={(e) => changerPartie(i, { nom: e.target.value })} data-partie-nom /></label>
                    <label>Coordonnées (facultatif)<input value={p.coordonnees ?? ''} onChange={(e) => changerPartie(i, { coordonnees: e.target.value })} data-partie-coordonnees /></label>
                  </>}
                  <label>Part (%)<input inputMode="decimal" value={pctAffiche} onChange={(e) => changerPartie(i, { mode: 'pct', texte: e.target.value })} data-partie-pct={i} /></label>
                  <label>Part (€ HT)<input inputMode="decimal" value={eurAffiche} onChange={(e) => changerPartie(i, { mode: 'eur', texte: e.target.value })} data-partie-eur={i} /></label>
                  {p.sorte === 'exterieure' && <button type="button" className="trx-bouton-lien" onClick={() => onChange({ ...etat, parties: etat.parties.filter((_, j) => j !== i) })}
                    data-retirer-exterieure>Retirer cette partie</button>}
                </div>
                <span className="loc-muet" data-part-ht={i}>soit {Number.isFinite(parts[i]) ? eur(parts[i]) : '—'} HT{p.sorte === 'exterieure' ? ' — hors de nos chiffres (dans le CA d’aucune société)' : ''}</span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="trx-actions">
        <button type="button" className="trx-bouton-lien" onClick={() => onChange({ ...etat, parties: [...etat.parties, versEcran(partieExterieure())] })} data-ajouter-exterieure>+ Ajouter une partie extérieure</button>
        <button type="button" className="trx-bouton-lien" onClick={() => onChange({ ...etat, parties: partiesPour(negociateurs, etat.entreeId, etat.sortieId) })} data-revenir-5050>Revenir au 50/50</button>
      </p>
      {etat.parties.length > 0 && (
        <dl className="trx-resultat" data-total-repartition>
          <dt>Total de la répartition</dt><dd className="trx-total">{Number.isFinite(total.pourcentage) ? `${total.pourcentage.toLocaleString('fr-FR', { maximumFractionDigits: 4 })} %` : '—'} · {Number.isFinite(total.montantHt) ? eur(total.montantHt) : '—'} HT</dd>
          {SOCIETES.map((s) => <Fragment key={s}><dt>Part {LIBELLE_SOCIETE[s]}</dt><dd data-part-societe={s}>{eur(parSociete.societe[s])} HT</dd></Fragment>)}
          {parSociete.exterieurHt > 0 && <><dt>Part extérieure (hors CA)</dt><dd data-part-exterieure>{eur(parSociete.exterieurHt)} HT</dd></>}
          <dt>Commission</dt><dd>{eur(ht(commission))} HT · {eur(commission)} TTC</dd>
        </dl>
      )}
      {motif !== null && <p className="trx-erreur" role="status" data-motif-repartition>{motif}</p>}
    </fieldset>
  );
}
