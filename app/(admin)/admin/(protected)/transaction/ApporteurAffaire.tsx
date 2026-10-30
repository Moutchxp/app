'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ListeChoix, type OptionChoix } from '../location/ListeChoix';
import { NouvelApporteur } from './NouvelApporteur';
import { ChampMontantUnite, nombre, type ApporteurRef, type MontantEcran } from './Repartition';
import { montantAffiche, Montants, useAffichage } from './commun';
import { enHt, enTtc, type MontantSaisi } from '../../../../lib/transaction/commissions';

/**
 * ══ 🔴 LOT BH (Arno, 30/10/2026) — L'APPORTEUR D'UNE AFFAIRE DÉJÀ CRÉÉE : l'ajouter, le modifier, le retirer ══════════════════════════════════
 * Le même composant sur la ligne « Apporteur » des Informations communes (chaque geste s'enregistre aussitôt, journalisé : la route
 * `dossier-enregistrer`) et dans le formulaire « Modifier » (le geste change le formulaire ; « Enregistrer » l'écrit). Un apporteur par vente
 * (le modèle de la base) :
 *   · sans apporteur : « + Ajouter un apporteur » ; avec : « Modifier » et « Supprimer » ;
 *   · la fenêtre : la recherche dans l'annuaire des apporteurs (et « + Ajouter un nouvel apporteur », comme à la création) et le montant de sa
 *     commission (dans l'unité du sélecteur HT | TTC) ; un montant vide ou nul est refusé — retirer l'apporteur, c'est « Supprimer » ;
 *   · « Supprimer » (accord d'Arno) : une confirmation ; seul le lien apporteur ↔ affaire est retiré, sa fiche reste dans l'annuaire.
 * Un observateur ne voit aucun de ces boutons (et le serveur refuse toute écriture de sa part).
 */

export interface ApporteurActuel {
  /** Sa fiche dans l'annuaire ; null : un nom écrit (import) ou aucun. */
  id: number | null;
  nom: string | null;
  /** Sa commission, dans son unité ; null : aucune. */
  montant: MontantSaisi | null;
}
export interface ChoixApporteur { id: number | null; nom: string | null; montant: MontantEcran }

/** Le motif d'un choix refusé (aucun apporteur, montant vide ou nul) ; null : le choix peut s'enregistrer. PUR. */
export function motifChoixApporteur(c: ChoixApporteur): string | null {
  if (c.id === null && (c.nom ?? '').trim() === '') return 'Choisissez l’apporteur dans l’annuaire (ou créez-le). Rien n’a été enregistré.';
  const x = nombre(c.montant.texte);
  if (x === null || x <= 0) return 'Le montant de la commission de l’apporteur doit être supérieur à 0. Pour retirer l’apporteur de cette affaire, utilisez « Supprimer ».';
  return null;
}

const texteDe = (m: MontantSaisi): string => String(m.montant).replace('.', ',');

export function ApporteurAffaire({ actuel, annuaire: annuaireBase, collegues, modifiable, avecUnite, affichage = false, onValider, onRetirer }: {
  actuel: ApporteurActuel;
  annuaire: readonly ApporteurRef[];
  /** Les comptes de l'interface (création d'un apporteur, comme à la création de l'affaire) ; absent : pas de création. */
  collegues?: readonly OptionChoix[];
  /** Faux (observateur, base sans migration) : aucun bouton. */
  modifiable: boolean;
  /** Avec la 437 : le montant se saisit en HT ou en TTC (le sélecteur) ; sinon en TTC. */
  avecUnite: boolean;
  /** Vrai (formulaire « Modifier ») : le nom et le montant sont écrits devant les boutons. */
  affichage?: boolean;
  /** Le choix validé ; rend le motif d'un refus (rien n'est changé), ou null. */
  onValider: (c: ChoixApporteur) => Promise<string | null> | string | null;
  onRetirer: () => Promise<string | null> | string | null;
}) {
  const u = useAffichage();
  const present = actuel.id !== null || (actuel.nom ?? '').trim() !== '' || (actuel.montant !== null && actuel.montant.montant !== 0);
  const [fenetre, setFenetre] = useState<'choix' | 'retrait' | null>(null);
  const [choix, setChoix] = useState<ChoixApporteur | null>(null);
  const [ajoutes, setAjoutes] = useState<ApporteurRef[]>([]);
  const [nouveau, setNouveau] = useState<string | null>(null);
  const [motif, setMotif] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const annuaire = [...annuaireBase, ...ajoutes.filter((a) => !annuaireBase.some((x) => x.id === a.id))];
  const fermer = (): void => { setFenetre(null); setChoix(null); setNouveau(null); setMotif(null); };
  useEffect(() => {
    if (fenetre === null) return;
    const touche = (e: globalThis.KeyboardEvent): void => { if (e.key === 'Escape' && nouveau === null) fermer(); };
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  }, [fenetre, nouveau]);
  const ouvrir = (): void => {
    setMotif(null);
    setChoix({ id: actuel.id, nom: actuel.id === null ? actuel.nom : null,
      montant: actuel.montant === null ? { texte: '', unite: avecUnite ? u : 'ttc' } : { texte: texteDe(actuel.montant), unite: actuel.montant.unite } });
    setFenetre('choix');
  };
  const valider = async (): Promise<void> => {
    if (choix === null) return;
    const refus = motifChoixApporteur(choix);
    if (refus !== null) { setMotif(refus); return; }
    setEnvoi(true);
    const r = await onValider(choix);
    setEnvoi(false);
    if (r === null) fermer(); else setMotif(r);
  };
  const retirer = async (): Promise<void> => {
    setEnvoi(true);
    const r = await onRetirer();
    setEnvoi(false);
    if (r === null) fermer(); else setMotif(r);
  };
  const nomActuel = actuel.nom ?? (actuel.id === null ? null : annuaire.find((a) => a.id === actuel.id)?.nom ?? null);
  const montantTexte = actuel.montant === null ? null : montantAffiche(u, enHt(actuel.montant), enTtc(actuel.montant));
  return (
    <span className="trx-apporteur-affaire" data-apporteur-affaire>
      {affichage && (present
        ? <span className="trx-apporteur" data-apporteur-affiche><span>{nomActuel ?? 'Apporteur sans nom'}</span>
          {actuel.montant !== null && <Montants disposition="ligne" sens="verse" ht={enHt(actuel.montant)} ttc={enTtc(actuel.montant)} />}</span>
        : <span className="loc-muet" data-apporteur-affiche>Aucun apporteur</span>)}
      {modifiable && (present ? <>
        <button type="button" className="trx-bouton-lien" onClick={ouvrir} data-modifier-apporteur>Modifier</button>
        <button type="button" className="trx-bouton-lien" onClick={() => { setMotif(null); setFenetre('retrait'); }} data-supprimer-apporteur>Supprimer</button>
      </> : <button type="button" className="trx-bouton-lien" onClick={ouvrir} data-ajouter-apporteur>+ Ajouter un apporteur</button>)}
      {fenetre !== null && typeof document !== 'undefined' && createPortal(
        <div className="trx-ap-voile" onClick={(e) => { if (e.target === e.currentTarget && nouveau === null) fermer(); }}>
          <div className="trx-ap-fenetre" role="dialog" aria-modal="true" aria-label={fenetre === 'retrait' ? 'Retirer l’apporteur' : 'Apporteur de l’affaire'}
            data-fenetre-apporteur={fenetre}>
            {fenetre === 'retrait' ? <>
              <p className="trx-ap-titre">Retirer l’apporteur</p>
              <p data-question-retrait>Retirer {nomActuel ?? 'l’apporteur'} de cette affaire ? Sa commission{montantTexte === null ? '' : ` de ${montantTexte}`} ne sera plus déduite.</p>
              <div className="trx-actions">
                <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={envoi} onClick={() => void retirer()} data-confirmer-retrait-apporteur>Oui, retirer</button>
                <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={fermer} data-annuler-apporteur>Annuler</button>
              </div>
            </> : choix !== null && <>
              <p className="trx-ap-titre">{present ? 'Modifier l’apporteur' : 'Ajouter un apporteur'}</p>
              <label className="trx-ap-champ">Apporteur d’affaires
                <ListeChoix options={[...annuaire.map((a) => ({ id: a.id, libelle: a.nom, ...(a.recherche !== undefined ? { recherche: a.recherche } : {}) })),
                  ...(collegues !== undefined ? [{ id: '+', libelle: '+ Ajouter un nouvel apporteur' }] : [])]}
                  valeur={choix.id === null ? '' : String(choix.id)} vide={choix.id === null && choix.nom !== null ? `${choix.nom} (hors annuaire)` : '— à choisir —'}
                  libelle="Apporteur d’affaires" onChange={(x) => { if (x === '+') { setNouveau(''); return; } setChoix({ ...choix, id: x === '' ? null : Number(x), nom: x === '' ? choix.nom : null }); setMotif(null); }}
                  donnees={{ 'data-champ': 'apporteur-fenetre-annuaire' }}
                  recherche={{ placeholder: 'Rechercher un apporteur', ...(collegues !== undefined ? { onCreer: (t: string) => setNouveau(t), libelleCreer: (t: string) => `+ Ajouter un nouvel apporteur « ${t} »` } : {}) }} />
              </label>
              {nouveau !== null && collegues !== undefined && (
                <NouvelApporteur texte={nouveau} annuaire={annuaire} collegues={collegues} onFermer={() => setNouveau(null)}
                  onChoisir={(id) => { setNouveau(null); setChoix({ ...choix, id, nom: null }); }}
                  onCree={(a) => { setAjoutes((x) => [...x, a]); setNouveau(null); setChoix({ ...choix, id: a.id, nom: null }); }} />
              )}
              <ChampMontantUnite mot="Commission de l’apporteur" valeur={choix.montant} avecHt={avecUnite} champ="apporteur-fenetre"
                onChange={(m) => { setChoix({ ...choix, montant: m }); setMotif(null); }} />
              <div className="trx-actions">
                <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={envoi} onClick={() => void valider()} data-valider-apporteur>Valider</button>
                <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={fermer} data-annuler-apporteur>Annuler</button>
              </div>
            </>}
            {motif !== null && <p className="trx-erreur" role="alert" data-motif-apporteur>{motif}</p>}
          </div>
        </div>, document.querySelector('.svv-adm-root') ?? document.body)}
    </span>
  );
}
