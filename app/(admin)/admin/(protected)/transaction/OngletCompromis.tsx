'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ventePorteeAilleurs } from '../../../../lib/transaction/interCabinet';
import { bilanVente, commissionNetteHt, ht, LIBELLE_SOCIETE, SOCIETES, societePorteuse, TVA, type MontantSaisi, type Societe, type Vente } from '../../../../lib/transaction/modele';
import { apporteurVerseHt, classeDeCommission, commissionDuCote, statutDeCommission, commissionneDuCote, enHt, enTtc, honorairesDuCote, partDuCote, remuneration, remunerationDuCote, resolveurDe, retroApporteurDe, statutDePartie, tauxDuCote, tuilesCompromis,
  type HonorairesCote, type Remuneration, type StatutDuLibelle } from '../../../../lib/transaction/commissions';
import { classeCommission, libelleStatut, type ClasseCommission, type Statut } from '../../../../lib/admin/statut';
import { centimesRepartition, libellePartie, partsParSociete, pourcentageDe, pourcentagesParSociete } from '../../../../lib/transaction/repartition';
import { BoutonAffichage, ESPACE, eur, FournisseurAffichage, FournisseurChangerAffichage, SelecteurAffichage, htTtcDe, montantAffiche, Montants, montantsTexte, MOT_UNITE, nombreFr, parametre, posterTransaction, useAffichage, useAffichageRetenu, useTransaction } from './commun';
import { pctFr as pctFormat } from '../../../../lib/transaction/format';
import { corpsDossier, etatRepartitionDe, FormulaireDossier, type References } from './FormulaireDossier';
import { BlocRepartition, changerNegociateur, montantsAffiches, retroTtcDe, ChampMontantUnite, ChoixSocieteVente, choisirSocietePartie, etatSomme, montantEffectif, motifSocieteVente, nombre, propositionCommission, tauxDe,
  texteTaux, versModele, type EtatRepartition, type MontantEcran, type PartieEcran } from './Repartition';
import { LES_DEUX, LIBELLE_SOCIETE_COMPTE, type SocieteCompte } from '../../../../lib/transaction/societeNegociateur';
import { ListeChoix } from '../location/ListeChoix';
import { CSS_MODALE_ARCHIVAGE } from '../location/ModaleArchivage';
import { BlocReplie } from '../location/BlocReplie';
import { A_RENSEIGNER, carteCompromis, libelleTaux, trierCompromis } from '../../../../lib/transaction/compromisCarte';
import { Journal } from './FormulaireVente';
import { detailCa, detailCommissions, detailDu, detailSolde } from '../../../../lib/transaction/detailCommissions';
import { controleVentilation, mentionPartAgence, ventilationVente, type MontantC, type VentilationCote } from '../../../../lib/transaction/partAgence';
import { FenetreCommissions, FenetreSolde } from './FenetreCommissions';
import { BlocDu } from './BlocDu';
import { ApporteurAffaire } from './ApporteurAffaire';
import { BoutonPersonne, personneEcranDe, type PersonneEcran } from './PersonnesDossier';
import { FenetrePersonnes } from './FenetrePersonnes';

/**
 * ══ 🔴 TUILE « TRANSACTION », LOT D (Arno, 27/10/2026) — L'ONGLET « COMPROMIS » ═══════════════════════════════════════════════════
 * Tous les compromis signés et pas encore encaissés (acte non signé) de la société — ou des deux, dans le CA global. Pour chacun : vendeurs
 * et acquéreurs avec leurs coordonnées, adresse du bien, date du compromis et date prévue de l'acte, commission HT et TTC, négociateurs
 * d'entrée et de sortie, apporteur et sa rétrocession, la RÉPARTITION (la part de chaque partie et de chaque société). « Acte signé » fait
 * passer le compromis en vente encaissée au mois de l'acte (journalisé ; « Revenir en compromis » le défait). Totaux : nombre, commission HT
 * en cours, part par société. Un compromis de l'historique importé se lit tel quel et se complète ici.
 * LOT F (Arno) — la carte repliée : titre et ligne discrète à gauche, commission TTC / HT / % du prix à droite ; dépliée : Vendeurs |
 * Acquéreurs (chacun avec « + Ajouter … »), les informations communes en grille, la répartition, puis Modifier · Acte signé · Historique.
 */

interface DonneesCompromis extends References { disponible: boolean; aujourdhui: string; compromis: Vente[];
  /** LOT G — les compromis annulés par « Annulation » (absent : réponse d'avant ce lot). */
  annules?: Vente[];
  /** LOT Q — le statut du compte rapproché des négociateurs payés (paye importée). */
  statutsNegociateurs?: Record<string, Statut | null> }
const date = (d: string | null | undefined): string => (d ? d.split('-').reverse().join('/') : A_RENSEIGNER);
const ouManque = (x: string | null | undefined): string => (x == null || x.trim() === '' ? A_RENSEIGNER : x);

export function OngletCompromis({ societe }: { societe: Societe | 'tous' }) {
  const { lu, relire } = useTransaction<DonneesCompromis>(`vue=compromis&societe=${societe}`);
  // LOT F — « + Ajouter un vendeur / un acquéreur » ouvre le formulaire du compromis sur une ligne neuve de ce côté (personne existante ou neuve).
  const [edition, setEdition] = useState<{ vente: Vente; ajouter: 'vendeur' | 'acquereur' | null; repartition?: EtatRepartition; message?: string; personneVisee?: number } | 'nouveau' | null>(null);
  // 🔴 LOT BM — la fenêtre « Vendeurs — … » / « Acquéreurs — … » : « + Ajouter … » de la carte, ou « Modifier » d'une personne (elle seule, dépliée).
  const [fenetrePersonnes, setFenetrePersonnes] = useState<{ venteId: number; role: 'vendeur' | 'acquereur'; personneVisee: number | null } | null>(null);
  // LOT G — la modale « Annulation » ouverte sur un compromis.
  const [annulation, setAnnulation] = useState<Vente | null>(null);
  const [acte, setActe] = useState<{ id: number; date: string } | null>(null);
  const [fait, setFait] = useState<{ id: number; libelle: string } | null>(null);
  // 🔴 LOT AE — la vente vient d'être enregistrée ici mais elle est PORTÉE par l'autre société (son négociateur d'entrée y travaille).
  const [portee, setPortee] = useState<{ id: number; porteuse: Societe; recue: boolean } | null>(null);
  const [motif, setMotif] = useState<string | null>(null);
  const [historique, setHistorique] = useState<number | null>(null);
  // 🔴 LOT R — « Voir la vente d'origine » (depuis une ligne miroir) : la carte visée (?vente=N) s'ouvre et vient à l'écran.
  const [venteVisee] = useState<number | null>(() => { const x = Number(parametre('vente')); return Number.isInteger(x) && x > 0 ? x : null; });
  useEffect(() => {
    if (venteVisee === null || lu.etat !== 'ok') return;
    document.querySelector(`[data-compromis="${venteVisee}"]`)?.scrollIntoView?.({ block: 'start' });
  }, [venteVisee, lu.etat]);
  // 🔴 LOT AL (Arno) — la tuile « Commissions versées » ne se déploie plus : elle ouvre la fenêtre du détail.
  const [fenetre, setFenetre] = useState(false);
  const tuileCommissions = useRef<HTMLButtonElement | null>(null);
  // 🔴 LOT AO (Arno) — la tuile « Solde net » ouvre la fenêtre de son détail (le CA, chaque commission versée, le solde).
  const [fenetreSolde, setFenetreSolde] = useState(false);
  const tuileSolde = useRef<HTMLButtonElement | null>(null);
  // 🔴 LOT AM (Arno) — « HT | TTC » : l'unité affichée en grand dans tout le bloc, retenue dans le navigateur (partagée CRITERIMMO / MACJ).
  const [unite, setUnite] = useAffichageRetenu();
  if (lu.etat === 'charge') return <p className="gst-info" role="status">Chargement…</p>;
  if (lu.etat === 'erreur') return <p className="gst-erreur" role="alert">{lu.message}</p>;
  const d = lu.data;
  const vue: Societe | null = societe === 'tous' ? null : societe;
  // 🔴 LOT BH — l'apporteur d'une affaire : le dossier tel qu'il est, avec ce seul changement, par le même geste que « Modifier » (journalisé ;
  // les commissions « calculées » suivent, celles saisies à la main restent) ; puis tout se relit (tuiles, cartes, fenêtres, synthèse).
  const enregistrerApporteur = async (v: Vente, change: Partial<EtatRepartition>, personnes: PersonneEcran[] = personnesDe(v)): Promise<string | null> => {
    const etat: EtatRepartition = { ...etatRepartitionDe(v, d.negociateurs, d.uniteCommission === true), ...change };
    const r = await posterTransaction({ action: 'dossier-enregistrer', id: v.id, dossier: corpsDossier(v.societe, v.statut === 'vendue' ? 'vendue' : 'compromis', champsDe(v), personnes, etat) });
    if (r === null) relire();
    return r;
  };
  // 🔴 LOT BM — une fiche validée (ou enlevée) dans la fenêtre des personnes : le dossier tel qu'il est, avec cette seule liste de personnes, par le
  // même geste (journalisé, réversible) ; puis tout se relit.
  const enregistrerPersonnes = (v: Vente, personnes: PersonneEcran[]): Promise<string | null> => enregistrerApporteur(v, {}, personnes);
  // LOT E — la date butoir la plus proche d'abord ; les compromis sans date à la fin.
  const liste = trierCompromis(d.compromis);
  // 🔴 LOT I — les 4 tuiles, sur les compromis EN COURS (les annulés n'y sont pas), selon la répartition par société.
  const statutDuLibelle = resolveurDe(d.statutsNegociateurs);
  const tu = tuilesCompromis(liste, vue, statutDuLibelle);
  // 🔴 LOT AL — le détail des « Commissions versées » (la fenêtre) ; la tuile en affiche le total : la somme, au centime, des montants des
  // cartes (règle du lot AH) — le Solde net le suit (CA − commissions versées = le « Reste à … » des cartes, au centime).
  const dc = detailCommissions(liste, vue, statutDuLibelle);
  // 🔴 LOT AN — le détail du « Chiffre d'affaires » ; la tuile en affiche le total : la somme, au centime, des montants des cartes (règle du lot AH).
  const dca = detailCa(liste, vue, statutDuLibelle);
  const soldeHtC = dca.totalHtC - dc.totalHtC;
  const soldeTtcC = dca.totalTtcC - dc.totalTtcC;
  // LOT AA — la commission d'un négociateur de l'autre société est payée et comptée chez elle seule (mention de la fenêtre).
  const autreSociete = vue !== null && liste.some((v) => v.miroir == null && (v.repartition?.parties ?? []).some((p) => p.compteId !== null && p.societe !== null && p.societe !== vue));
  /** LOT AL — le nom d'une affaire dans la fenêtre : la fenêtre se ferme, sa carte se déplie et vient à l'écran. */
  const allerA = (id: number): void => {
    setFenetre(false); setFenetreSolde(false);
    setTimeout(() => {
      const b = document.querySelector<HTMLButtonElement>(`[data-deplier="compromis-${id}"], [data-deplier="miroir-${id}"]`);
      if (b !== null && b.getAttribute('aria-expanded') !== 'true') b.click();
      document.querySelector(`[data-compromis="${id}"]`)?.scrollIntoView?.({ block: 'start' });
    }, 0);
  };
  const signer = async (): Promise<void> => {
    if (acte === null) return;
    const r = await posterTransaction({ action: 'acte-signe', id: acte.id, dateActe: acte.date });
    setMotif(r);
    if (r === null) { setFait({ id: acte.id, libelle: liste.find((v) => v.id === acte.id)?.libelle ?? '' }); setActe(null); relire(); }
  };
  const revenir = async (): Promise<void> => {
    if (fait === null) return;
    const r = await posterTransaction({ action: 'retour-compromis', id: fait.id });
    setMotif(r);
    if (r === null) { setFait(null); relire(); }
  };
  const societeSaisie: Societe = vue ?? 'criterimmo';
  /** LOT AE — après un enregistrement (formulaire, ou geste de la carte) : la vente est-elle portée par l'autre société ? Le dire. */
  const signalerPorteuse = (id: number, etat: EtatRepartition, honorairesTtc: number): void => {
    if (vue === null) return;
    const r = ventePorteeAilleurs({ societe: vue, honorairesTtc, repartition: { parties: versModele(etat.parties), retroApporteurTtc: retroTtcDe(etat) } }, vue);
    setPortee(r === null ? null : { id, ...r });
  };
  const MOT = MOT_UNITE[unite];
  return (
    <FournisseurAffichage value={unite}><FournisseurChangerAffichage value={setUnite}>
    <section className="tdb-section trx-onglet-compromis" aria-labelledby="trx-compromis-titre" data-onglet-compromis={societe}>
      <div className="trx-barre">
        <h3 id="trx-compromis-titre">Compromis en cours <span className="loc-pastille">{liste.length}</span></h3>
        {/* 🔴 LOT AM — le sélecteur « HT | TTC » juste à gauche de « + Nouveau compromis » (CA global : sans sélecteur, le choix retenu). */}
        {vue !== null && <div className="trx-actions"><BoutonAffichage unite={unite} onChange={setUnite} />
          <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={() => setEdition('nouveau')}
          disabled={!d.disponible} data-nouveau-compromis>+ Nouveau compromis</button></div>}
      </div>
      {!d.lotD && <p className="loc-alerte loc-alerte--orange" role="status" data-sans-434>Personnes, négociateurs d’entrée et de sortie et répartition : disponibles après la mise à jour de la base (migration 434).</p>}
      {/* 🔴 LOT I (Arno) — QUATRE TUILES, dans cet ordre : le nombre ; le CA (TTC en grand, en vert, HT en gris dessous ; la part de la société
          après répartition) ; les commissions versées (négociateurs + apporteurs : TTC en grand, en rouge, HT dessous, détail au toucher ou
          au survol) ; le solde net (CA HT − commissions HT, négatif tel quel). Le mot accompagne toujours la couleur. */}
      <ul className="tdb-tuiles trx-tuiles4" aria-label="Les compromis en cours" data-totaux-compromis>
        <li><div className="tdb-tuile" data-tuile="nombre"><span className="tdb-tuile-mot">Compromis en cours</span><strong className="tdb-tuile-valeur" data-nb-compromis>{tu.nb}</strong>
          <span className="tdb-tuile-n1">acte non signé, hors annulés</span></div></li>
        {/* 🔴 LOT AN / AO (Arno) — la tuile « Chiffre d'affaires » : le titre et le total (grand / petit selon « HT | TTC ») ; elle n'ouvre plus
            de fenêtre (« Voir le détail » et la fenêtre « Chiffre d'affaires » retirés, accord d'Arno : leur contenu est dans « Solde net »). */}
        <li><div className="tdb-tuile" data-tuile="ca">
          <span className="tdb-tuile-mot">Chiffre d’affaires</span>
          <Montants ht={dca.totalHtC / 100} ttc={dca.totalTtcC / 100} sens="recu" classe="trx-tuile-montants" donneesHt={{ 'data-ca-ht': '' }} donneesTtc={{ 'data-ca-ttc': '' }} />
        </div></li>
        {/* 🔴 LOT AL (Arno) — la tuile garde le titre, le total en rouge, le HT et « Voir le détail » ; toute la tuile ouvre la fenêtre (souris,
            Entrée / Espace, toucher). Les lignes du détail et la bulle au survol l'ont quittée : tout leur contenu est dans la fenêtre. */}
        <li><button type="button" className="tdb-tuile" data-tuile="commissions" aria-haspopup="dialog" aria-expanded={fenetre} ref={tuileCommissions} onClick={() => setFenetre(true)}>
          <span className="tdb-tuile-mot">Commissions versées</span>
          <Montants ht={dc.totalHtC / 100} ttc={dc.totalTtcC / 100} sens="verse" classe="trx-tuile-montants" suffixe={<small> versées</small>}
            donneesHt={{ 'data-commissions-ht': '' }} donneesTtc={{ 'data-commissions-ttc': '' }} />
          <span className="tdb-tuile-n1 trx-tuile-voir" data-voir-detail-commissions>Voir le détail</span>
        </button></li>
        {/* LOT L (Arno) — le Solde net, en VERT ; LOT AM : l'unité choisie en grand, l'autre dessous. 🔴 LOT AO — comme « Commissions versées » :
            le titre, le total et « Voir le détail » ; toute la tuile ouvre la fenêtre ; « CA − commissions versées » y est passée (accord d'Arno). */}
        <li><button type="button" className="tdb-tuile" data-tuile="solde" aria-haspopup="dialog" aria-expanded={fenetreSolde} ref={tuileSolde} onClick={() => setFenetreSolde(true)}>
          <span className="tdb-tuile-mot">Solde net</span>
          <Montants ht={soldeHtC / 100} ttc={soldeTtcC / 100} sens="recu" classe="trx-tuile-montants" donneesHt={{ 'data-solde-ht': '' }} donneesTtc={{ 'data-solde-ttc': '' }} />
          <span className="tdb-tuile-n1 trx-tuile-voir" data-voir-detail-solde>Voir le détail</span>
        </button></li>
      </ul>
      {fenetre && <FenetreCommissions detail={dc} societe={vue} autreSociete={autreSociete}
        titres={Object.fromEntries(liste.map((v) => [v.id, v.miroir != null ? v.libelle : carteCompromis(v, d.aujourdhui).titre]))}
        onFermer={() => { setFenetre(false); tuileCommissions.current?.focus(); }} onAller={allerA} />}
      {fenetreSolde && <FenetreSolde detail={detailSolde(dca, dc)} societe={vue} autreSociete={autreSociete}
        titres={Object.fromEntries(liste.map((v) => [v.id, v.miroir != null ? v.libelle : carteCompromis(v, d.aujourdhui).titre]))}
        onFermer={() => { setFenetreSolde(false); tuileSolde.current?.focus(); }} onAller={allerA} />}
      {motif !== null && <p className="trx-erreur" role="alert">{motif}</p>}
      {/* 🔴 LOT AE (Arno) — la règle de la société porteuse, dite au moment de l'enregistrement. */}
      {portee !== null && (
        <p className="loc-alerte" role="status" data-portee-par={portee.porteuse}>Le négociateur côté vendeurs est chez {LIBELLE_SOCIETE[portee.porteuse]} : la vente est portée par
          {' '}{LIBELLE_SOCIETE[portee.porteuse]}. {portee.recue ? 'Elle apparaît ici en inter-cabinet reçu.' : `Elle n’apparaît que chez ${LIBELLE_SOCIETE[portee.porteuse]}.`}
          {' '}<a className="trx-lien" href={adresseOrigine(portee.porteuse, portee.id)} data-voir-chez-porteuse>Voir chez {LIBELLE_SOCIETE[portee.porteuse]}</a></p>
      )}
      {fait !== null && (
        <p className="loc-alerte" role="status" data-acte-fait>Acte enregistré : « {fait.libelle} » est une vente encaissée au mois de l’acte.
          {' '}<button type="button" className="trx-bouton-lien" onClick={() => void revenir()} data-revenir-compromis>Revenir en compromis</button></p>
      )}
      {liste.length === 0 ? <p className="loc-muet">Aucun compromis en cours.</p> : (
        <ul className="trx-cartes" data-liste-compromis>
          {liste.map((v) => {
            // 🔴 LOT R — la LIGNE MIROIR de l'inter-cabinet : sa seule part, non modifiable d'ici (sauf la rémunération du négociateur).
            if (v.miroir != null) return <CarteMiroir key={`miroir-${v.id}`} v={v} references={d} aujourdhui={d.aujourdhui} disponible={d.disponible && d.lotD} onFait={relire} statutDuLibelle={statutDuLibelle}
              ouvertInitial={venteVisee === v.id} />;
            const r = v.repartition ?? null;
            const ps = r === null ? null : partsParSociete(r.parties, v.honorairesTtc, r.retroApporteurTtc);
            // LOT N — le % de la commission nette de chaque société et de la part extérieure (même format que les lignes des parties).
            const pcts = r === null || ps === null ? null : pourcentagesParSociete(r.parties, ps.netHt);
            const pct = (x: number): string => pctFormat(x);
            const c = carteCompromis(v, d.aujourdhui);
            // 🔴 LOT F — LA CARTE REPLIÉE : à gauche le titre (libellé, ou « VENDEURS / ACQUÉREURS ») et, plus discret, adresse · prix · acte au
            // plus tard ; à droite la commission TTC en grand et en vert (« TTC » écrit), le HT dessous, puis le % du prix (si le prix est connu).
            // Toute la ligne est le bouton qui déplie (triangle à gauche). Déplié : Vendeurs | Acquéreurs, puis les informations communes.
            const titre = (
              <span className="trx-carte-gauche">
                <span className="trx-carte-titre" data-carte="titre">{c.titre}</span>
                <span className="trx-carte-infos" data-carte-ligne="infos">
                  <span className={c.manque.adresse ? 'trx-a-renseigner' : undefined} data-carte="adresse">{c.adresse}</span>
                  <span className="trx-sep" aria-hidden="true">{'\u00a0·\u00a0'}</span>
                  <span data-carte="prix">{c.prix === null ? <span className="trx-a-renseigner">prix {A_RENSEIGNER}</span> : `prix ${eur(c.prix)}`}</span>
                  <span className="trx-sep" aria-hidden="true">{'\u00a0·\u00a0'}</span>
                  <span data-carte="butoir" className={c.depassee ? 'trx-depassee' : c.butoir === null ? 'trx-a-renseigner' : undefined}>
                    {c.butoir === null ? `acte au plus tard le : ${A_RENSEIGNER}` : `acte au plus tard le ${date(c.butoir)}${c.depassee ? ' — dépassée' : ''}`}</span>
                </span>
              </span>
            );
            const droite = (
              <span className="trx-carte-droite" data-carte="montants">
                <Montants ht={c.commissionHt} ttc={c.commissionTtc} sens="recu" classe="trx-carte-montants" donneesHt={{ 'data-carte': 'commission-ht' }} donneesTtc={{ 'data-carte': 'commission' }} />
                {c.pctPrix !== null && <span className="trx-carte-pct" data-carte="pct-prix">{nombreFr(c.pctPrix, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{ESPACE}% du prix</span>}
              </span>
            );
            // 🔴 LOT AY — la ventilation des honoraires de chaque partie, lue avec la société de l'écran (part de l'agence, rattachement associé).
            const ventilation = ventilationVente(v, vue);
            const colonne = (role: 'vendeur' | 'acquereur', mot: string) => {
              const gens = (v.dossier?.personnes ?? []).filter((p) => p.role === role);
              return (
                <section className="trx-colonne" aria-label={mot} data-colonne={role}>
                  {/* 🔴 LOT T (Arno) — la première ligne : le titre à gauche, à droite la société de ce côté et sa part (« CRITERIMMO · 40 % »),
                      qui ouvre le réglage de la répartition ; sur téléphone, le bouton passe sous le titre. */}
                  <BoutonSocieteCote titre={mot} v={v} cote={role === 'vendeur' ? 'entree' : 'sortie'} references={d} disponible={d.disponible && d.lotD} onFait={relire}
                    onEnregistre={(e) => signalerPorteuse(v.id, e, v.honorairesTtc)} />
                  {gens.length === 0 ? <p className="loc-muet" data-aucune-personne={role}>{role === 'vendeur' ? 'Aucun vendeur enregistré' : 'Aucun acquéreur enregistré'}</p>
                    // 🔴 LOT BJ (retrait autorisé par Arno : plus de coordonnées en clair) — un bouton par personne, sa fenêtre de détail ; sans la 443 : la liste d'avant.
                    : d.personneType === true ? (
                    <div className="trx-personnes-boutons" data-personnes-compromis={role}>
                      {gens.map((p) => <BoutonPersonne key={`${p.role}-${p.id}`} p={p}
                        onModifier={d.disponible ? () => setFenetrePersonnes({ venteId: v.id, role: p.role, personneVisee: p.id }) : undefined} />)}
                    </div>
                  ) : (
                    <ul className="trx-personnes" data-personnes-compromis={role}>
                      {gens.map((p) => (
                        <li key={`${p.role}-${p.id}`}><strong>{p.nom}</strong>
                          <span>{p.telephone ? <a href={`tel:${p.telephone.replace(/\s/g, '')}`}>{p.telephone}</a> : <span className="trx-a-renseigner">téléphone {A_RENSEIGNER}</span>}</span>
                          <span>{p.email ? <a href={`mailto:${p.email}`}>{p.email}</a> : <span className="trx-a-renseigner">e-mail {A_RENSEIGNER}</span>}</span>
                          <span>{p.adresse ?? <span className="trx-a-renseigner">adresse {A_RENSEIGNER}</span>}</span></li>
                      ))}
                    </ul>
                  )}
                  <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setFenetrePersonnes({ venteId: v.id, role, personneVisee: null })} disabled={!d.disponible}
                    data-ajouter-personne-carte={role}>{role === 'vendeur' ? '+ Ajouter un vendeur' : '+ Ajouter un acquéreur'}</button>
                  {/* LOT G — le négociateur de ce côté : d'ENTRÉE du mandat chez les vendeurs, de SORTIE chez les acquéreurs (la même donnée que
                      « Négociateur d'entrée / de sortie » du formulaire et des informations communes). */}
                  <BoutonNegociateur v={v} cote={role === 'vendeur' ? 'entree' : 'sortie'} references={d} disponible={d.disponible && d.lotD} onFait={relire} statutDuLibelle={statutDuLibelle} vue={vue}
                    onEnregistre={(e) => signalerPorteuse(v.id, e, v.honorairesTtc)} ventilation={ventilation[role === 'vendeur' ? 'entree' : 'sortie']}
                    onRevoir={(repartition, message) => setEdition({ vente: v, ajouter: null, repartition, message })} />
                </section>
              );
            };
            const info = (mot: string, valeur: ReactNode, cle?: string) => <div className="trx-info" data-info={cle}><dt>{mot}</dt><dd>{valeur}</dd></div>;
            return (
              <li key={v.id} data-compromis={v.id} data-depassee={c.depassee ? '' : undefined}>
                <BlocReplie id={`trx-compromis-${v.id}`} section={`compromis-${v.id}`} titre={titre} resume={droite} chevronAGauche defilement={false} classe="trx-carte"
                  donnees={{ 'data-carte-compromis': String(v.id) }} ouvertInitial={venteVisee === v.id}>
                  <div className="trx-carte-detail">
                    <AlerteVentilation v={v} vue={vue} />
                    <div className="trx-colonnes">
                      {colonne('vendeur', 'Vendeurs')}
                      {colonne('acquereur', 'Acquéreurs')}
                    </div>
                    {/* 🔴 LOT AB (Arno) — chaque PARTIE EXTÉRIEURE : ses honoraires, versés par la société porteuse (inter-cabinet extérieur), dans ses
                        « Commissions versées » — même liseré rouge et même mention que les honoraires versés à l'autre société. */}
                    {r !== null && ps !== null && r.parties.some((p) => p.sorte === 'exterieure') && (
                      <section className="trx-exterieures" aria-label="Parties extérieures" data-exterieures>
                        {r.parties.filter((p) => p.sorte === 'exterieure').map((p, i) => {
                          const pct = p.pourcentage ?? (ps.netHt === 0 ? 0 : ((p.montantHt ?? 0) / ps.netHt) * 100);
                          const partHt = p.pourcentage !== null ? (ps.netHt * p.pourcentage) / 100 : p.montantHt ?? 0;
                          const nom = p.nom ?? 'la partie extérieure';
                          // LOT AD — la règle des tuiles : l'inter-cabinet extérieur versé par la société affichée (`bilanVente`).
                          const verse = bilanVente(v, vue).exterieurHt > 0;
                          return <LigneCalcul key={i} donnees={{ 'data-honoraires-exterieure': String(i) }} encadre={verse ? 'deduite' : null} mention={verse ? mentionVersement(nom) : undefined} ttc={partHt * TVA}
                            libelle={<><span className="trx-calcul-mot">Honoraires partie extérieure — {nom}</span> : <span className="trx-calcul-operation">{montantAffiche(unite, ps.netHt, ps.netHt * TVA)} × {pctFr(pct)} % =</span></>} />;
                        })}
                      </section>
                    )}
                    <section className="trx-communes" aria-label="Informations communes" data-informations-communes>
                      <h4>Informations communes
                        <span className="trx-pastilles">
                          {societe === 'tous' && r === null && <span className="loc-pastille">{LIBELLE_SOCIETE[v.societe]}</span>}
                          {v.origine === 'import' && <span className="loc-pastille" title={`${v.sourceFichier ?? ''} › ${v.sourceOnglet ?? ''} › ligne ${v.sourceLigne ?? ''}`}>import</span>}
                        </span></h4>
                      <dl className="trx-grille">
                        {/* 🔴 LOT H (Arno) — ZÉRO DOUBLON : ni l'adresse, ni le prix, ni la commission, ni la date butoir (en tête de carte), ni les
                            négociateurs (sous les colonnes) ; le libellé seulement pour un import (« Libellé du fichier ») ; le taux de commission. */}
                        {v.origine === 'import' && info('Libellé du fichier', v.libelle, 'libelle')}
                        {/* LOT J — calculé : commission TTC ÷ prix de vente ; sans prix, « calculé dès la saisie du prix de vente ». */}
                        {info('Taux de commission', <span className={c.pctPrix === null ? 'trx-a-renseigner' : undefined}>{libelleTaux(c.pctPrix)}</span>, 'taux')}
                        {/* 🔴 LOT K (Arno) — UNE case « Dates », l'une au-dessus de l'autre : le compromis signé, puis la vente définitive au plus
                            tard (rouge et « dépassée » si la date est passée) ; chacune « à renseigner » si absente. (Accord d'Arno : la date
                            butoir revient ici malgré la règle « zéro doublon » du lot H.) */}
                        {info('Dates', <span className="trx-dates">
                          <span data-date="compromis" className={v.dateCompromis ? undefined : 'trx-a-renseigner'}>
                            {v.dateCompromis ? `Compromis signé le ${date(v.dateCompromis)}` : `Compromis signé le : ${A_RENSEIGNER}`}</span>
                          <span data-date="butoir" className={c.depassee ? 'trx-depassee' : c.butoir === null ? 'trx-a-renseigner' : undefined}>
                            {c.butoir === null ? `Vente définitive au plus tard le : ${A_RENSEIGNER}` : `Vente définitive au plus tard le ${date(c.butoir)}${c.depassee ? ' — dépassée' : ''}`}</span>
                        </span>, 'dates')}
                        {/* LOT I — la rétrocession dans SON unité, avec son équivalent (« 500,00 € HT (soit 600,00 € TTC) »). */}
                        {/* LOT J (Arno) — sur la même ligne, à droite du nom : le montant de la rétrocession, son unité et son équivalent ;
                            sans rétrocession, « montant à renseigner ». */}
                        {info('Apporteur', (() => { const m = retroApporteurDe(v) ?? (r !== null && r.retroApporteurTtc > 0 ? { montant: r.retroApporteurTtc, unite: 'ttc' as const } : null);
                          return <span className="trx-apporteur"><span data-apporteur-nom>{ouManque(v.apporteur)}</span>
                            {/* 🔴 LOT AD — la rétrocession entre dans les « Commissions versées » de la société affichée (règle des tuiles) : en rouge. */}
                            <span className={m === null ? 'trx-apporteur-montant trx-a-renseigner' : apporteurVerseHt(v, vue) > 0 ? 'trx-apporteur-montant trx-rouge' : 'trx-apporteur-montant'} data-apporteur-montant>{m === null ? `montant ${A_RENSEIGNER}`
                              : <Montants disposition="ligne" sens={apporteurVerseHt(v, vue) > 0 ? 'verse' : 'neutre'} {...htTtcDe(m)} />}</span>
                            {/* 🔴 LOT BH (Arno) — ajouter, modifier ou retirer l'apporteur de l'affaire ; chaque geste s'enregistre aussitôt (journalisé) et
                                tout se recalcule (relecture, sans recharger la page). Un observateur ne voit pas ces boutons. */}
                            <ApporteurAffaire actuel={{ id: v.dossier?.apporteurId ?? null, nom: v.apporteur ?? null, montant: m }} annuaire={d.apporteurs} collegues={d.collegues}
                              modifiable={d.disponible && d.lotD} avecUnite={d.uniteCommission === true}
                              onValider={(c) => enregistrerApporteur(v, { apporteurId: c.id, apporteurNom: c.id === null ? c.nom : null, retroTexte: c.montant.texte, retroUnite: c.montant.unite, retirerApporteur: false })}
                              onRetirer={() => enregistrerApporteur(v, { apporteurId: null, apporteurNom: null, retroTexte: '', retirerApporteur: true })} /></span>; })(), 'apporteur')}
                      </dl>
                      {r !== null && ps !== null ? (() => {
                        // 🔴 LOT AH (Arno) — LA RÉPARTITION EN LOGIQUE COMPTABLE, de haut en bas : la commission de la vente (CA de la porteuse), − l'apporteur,
                        // = la base ; les parties ; les parts par société ; − les reversements de la porteuse, = son reste. Chaque montant au centime par
                        // LA règle unique (`centimesRepartition`) : un même montant identique partout (parties, parts, reversement, tuiles, ligne miroir),
                        // et reste + reversements + apporteur = commission de la vente. LOT AM : l'unité choisie en grand, l'autre dessous ; couleur selon le
                        // sens (versé en rouge ; la commission de la vente et le reste, en vert ; sinon l'encre).
                        const porteuse = societePorteuse(v);
                        const cHt = centimesRepartition(r.parties, v.honorairesTtc, r.retroApporteurTtc, porteuse);
                        const cTtc = centimesRepartition(r.parties, v.honorairesTtc, r.retroApporteurTtc, porteuse, 'ttc');
                        const brutes = r.parties.map((p) => (p.pourcentage !== null ? (ps.netHt * p.pourcentage) / 100 : p.montantHt ?? 0));
                        const repli = montantsAffiches(r.parties.map((p) => ({ mode: p.pourcentage !== null ? 'pct' as const : 'eur' as const, texte: '' })), brutes, ps.netHt);
                        const montant = (h: number, t: number, o: { rouge?: boolean; vert?: boolean; donnee?: Record<string, string> } = {}) => (
                          <span className={o.rouge ? 'trx-ht-ttc-pile trx-montant-repartition trx-rouge' : 'trx-ht-ttc-pile trx-montant-repartition'} {...o.donnee}>
                            <Montants ht={h} ttc={t} sens={o.rouge ? 'verse' : o.vert ? 'recu' : 'neutre'} /></span>);
                        const colonneEur = `€ ${MOT} (${MOT_UNITE[unite === 'ttc' ? 'ht' : 'ttc']})`;
                        const ligne = (cle: string, mot: ReactNode, societe: string, pctTexte: string, valeur: ReactNode, classe?: string, pctDonnee?: Record<string, string>) => (
                          <tr key={cle} className={classe} data-ligne-repartition={cle}><th scope="row">{mot}</th><td data-mot="Société">{societe}</td><td data-mot="%" {...pctDonnee}>{pctTexte}</td><td data-mot={colonneEur}>{valeur}</td></tr>);
                        const apporteur = r.retroApporteurTtc > 0 || v.apporteur != null;
                        return (
                        <div data-repartition-compromis>
                        <table className="tdb-table trx-table-repartition" aria-label="Répartition de la commission">
                          <thead><tr><th scope="col">Partie</th><th scope="col">Société</th><th scope="col">%</th><th scope="col" data-colonne-montants>{colonneEur}</th></tr></thead>
                          <tbody>
                            {ligne('commission', <>Commission de la vente — CA de {LIBELLE_SOCIETE[porteuse]} (société porteuse)</>, LIBELLE_SOCIETE[porteuse], pct(100),
                              montant(cHt?.commissionHt ?? ht(v.honorairesTtc), v.honorairesTtc, { vert: true, donnee: { 'data-ca-vente-compromis': porteuse } }), 'tdb-fort trx-somme-ligne')}
                            {apporteur
                              ? ligne('apporteur', <>− Apporteur{v.apporteur != null ? ` : ${v.apporteur}` : ''}</>, '', '', montant(cHt?.apporteurHt ?? ht(r.retroApporteurTtc), r.retroApporteurTtc, { rouge: true }))
                              : ligne('apporteur', 'Aucun apporteur', '', '', montant(0, 0))}
                            {ligne('base', '= Base de répartition (commission nette)', '', pct(100), montant(cHt?.baseHt ?? ps.netHt, cTtc?.baseHt ?? ps.netHt * TVA), 'tdb-fort trx-ligne-base trx-somme-ligne')}
                            {r.parties.map((p, i) => (
                              <tr key={i} data-ligne-repartition={`partie-${i}`}><th scope="row">{libellePartie(p)}</th><td data-mot="Société">{p.societe === null ? 'extérieur' : LIBELLE_SOCIETE[p.societe]}</td>
                                <td data-mot="%">{pct(p.pourcentage !== null ? p.pourcentage : ps.netHt === 0 ? 0 : ((p.montantHt ?? 0) / ps.netHt) * 100)}</td>
                                <td data-mot={colonneEur}>{montant(cHt?.parts[i] ?? repli[i], cTtc?.parts[i] ?? brutes[i] * TVA, { donnee: { 'data-part-partie-compromis': String(i) } })}</td></tr>
                            ))}
                            {/* 🔴 LOT AJ (Arno) — « Part X » et « − Reversé en inter-cabinet vers X » portaient le même montant : UNE ligne
                                « Part X − Reversé en inter-cabinet vers X », en rouge (fusion autorisée par Arno). X = la société qui REÇOIT (jamais écrit
                                en dur). La part de la porteuse reste sa ligne ; une société sans part reçue garde sa ligne « Part » ; même principe pour
                                une partie extérieure seule (« Part [agence] − Reversé à [agence] »). Sans centimes (somme ≠ 100 %), les lignes d'avant. */}
                            {(() => {
                              const recoit = (s: Societe): boolean => cHt !== null && cTtc !== null && s !== porteuse && cHt.reverse[s] > 0;
                              const partSociete = (s: Societe) => <tr key={s} className="tdb-fort" data-ligne-repartition={`part-${s}`}><th scope="row">Part {LIBELLE_SOCIETE[s]}</th><td data-mot="Société">{LIBELLE_SOCIETE[s]}</td>
                                <td data-mot="%" data-pct-societe-compromis={s}>{pcts === null ? '' : pct(pcts.societe[s])}</td>
                                <td data-mot={colonneEur}>{montant(cHt?.parSociete[s] ?? ps.societe[s], cTtc?.parSociete[s] ?? ps.societe[s] * TVA, { donnee: { 'data-part-societe-compromis': s } })}</td></tr>;
                              const ordre = cHt === null ? [...SOCIETES] : [porteuse, ...SOCIETES.filter((s) => s !== porteuse)];
                              const exterieurs = cHt === null ? [] : cHt.exterieurs.filter((e) => e.ht > 0);
                              const exterieurSeul = cHt !== null && cTtc !== null && exterieurs.length === 1;
                              return <>
                                {ordre.map((s) => recoit(s)
                                  ? ligne(`part-reverse-${s}`, <>Part {LIBELLE_SOCIETE[s]} − Reversé en inter-cabinet vers {LIBELLE_SOCIETE[s]}</>, LIBELLE_SOCIETE[s],
                                    pcts === null ? '' : pct(pcts.societe[s]), montant(cHt!.reverse[s], cTtc!.reverse[s], { rouge: true, donnee: { 'data-part-societe-compromis': s, 'data-reverse-compromis': s } }), undefined, { 'data-pct-societe-compromis': s })
                                  : partSociete(s))}
                                {ps.exterieurHt > 0 && (exterieurSeul
                                  ? ligne('part-reverse-exterieur-0', <>Part {exterieurs[0].nom} − Reversé à {exterieurs[0].nom}</>, 'extérieur', pcts === null ? '' : pct(pcts.exterieur),
                                    montant(exterieurs[0].ht, cTtc!.exterieurs.filter((e) => e.ht > 0)[0]?.ht ?? exterieurs[0].ht * TVA, { rouge: true, donnee: { 'data-reverse-compromis': 'exterieur-0' } }), undefined, { 'data-pct-exterieur-compromis': '' })
                                  : <tr data-ligne-repartition="part-exterieure"><th scope="row">Part extérieure (inter-cabinet extérieur)</th><td data-mot="Société">extérieur</td>
                                    <td data-mot="%" data-pct-exterieur-compromis>{pcts === null ? '' : pct(pcts.exterieur)}</td>
                                    <td data-mot={colonneEur}>{montant(cHt === null ? ps.exterieurHt : cHt.exterieurs.reduce((t, e) => t + e.ht, 0), cTtc === null ? ps.exterieurHt * TVA : cTtc.exterieurs.reduce((t, e) => t + e.ht, 0))}</td></tr>)}
                                {/* 🔴 LOT R / AH — plusieurs parties extérieures : chacune son reversement (en rouge) sous leur part commune. */}
                                {cHt !== null && cTtc !== null && !exterieurSeul && exterieurs.map((e, k) => ligne(`reverse-exterieur-${k}`, <>− Reversé à {e.nom}</>, 'extérieur', '',
                                  montant(e.ht, cTtc.exterieurs.filter((x) => x.ht > 0)[k]?.ht ?? e.ht * TVA, { rouge: true, donnee: { 'data-reverse-compromis': `exterieur-${k}` } })))}
                                {cHt !== null && cTtc !== null && ligne('reste', <>= Reste à {LIBELLE_SOCIETE[porteuse]}</>, LIBELLE_SOCIETE[porteuse], pcts === null ? '' : pct(pcts.societe[porteuse]),
                                  montant(cHt.resteHt, cTtc.resteHt, { vert: true, donnee: { 'data-reste-compromis': porteuse } }), 'tdb-fort trx-ligne-base trx-somme-ligne')}
                              </>;
                            })()}
                          </tbody>
                        </table>
                        </div>
                        );
                      })() : <p className="loc-muet">Répartition : toute la commission à {LIBELLE_SOCIETE[v.societe]} (historique, avant la répartition entre parties).</p>}
                    </section>
                    <div className="trx-actions trx-barre-actions">
                      <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setEdition({ vente: v, ajouter: null })} disabled={!d.disponible} data-modifier-compromis={v.id}>Modifier</button>
                      <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={() => setActe({ id: v.id, date: d.aujourdhui })} disabled={!d.disponible} data-acte-signe={v.id}>Acte signé</button>
                      <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setHistorique(historique === v.id ? null : v.id)}>{historique === v.id ? 'Masquer l’historique' : 'Historique'}</button>
                      {/* LOT G — « Annulation », à droite, contour et texte rouges : le mot accompagne la couleur. */}
                      <button type="button" className="trx-btn-annulation" onClick={() => setAnnulation(v)} disabled={!d.disponible || d.annulation !== true}
                        title={d.annulation === true ? undefined : 'Disponible après la mise à jour de la base (migration 436)'} data-annulation-compromis={v.id}>Annulation</button>
                      {d.annulation !== true && <span className="loc-muet trx-annulation-note" data-annulation-indisponible>Annulation : disponible après la mise à jour (migration 436).</span>}
                    </div>
                    {acte?.id === v.id && (
                      <form className="trx-form" onSubmit={(e) => { e.preventDefault(); void signer(); }} data-form-acte={v.id}>
                        <label>Date de l’acte (son mois est le mois du CA)<input type="date" value={acte.date} onChange={(e) => setActe({ id: v.id, date: e.target.value })} required data-date-acte /></label>
                        <div className="trx-actions"><button type="submit" className="svv-btn svv-btn-primary gst-btn" data-confirmer-acte>Confirmer l’acte</button>
                          <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setActe(null)}>Abandonner</button></div>
                      </form>
                    )}
                    {historique === v.id && <Journal entite="vente" id={v.id} onFait={relire} />}
                  </div>
                </BlocReplie>
              </li>
            );
          })}
        </ul>
      )}
      {/* 🔴 LOT AT (Arno) — « Compromis annulés » : le dernier bloc de la LISTE, sous la dernière carte, à l'écart de deux cartes, avant la
          synthèse ; affiché seulement s'il y a au moins un compromis annulé (accord d'Arno) — à 0, ni bloc ni espace. */}
      {(d.annules ?? []).length > 0 && <>
        <div className="trx-espace-annules" />
        <CompromisAnnules annules={d.annules ?? []} disponible={d.disponible && d.annulation === true} onFait={relire} onMotif={setMotif} />
      </>}
      {/* 🔴 LOT AQ (Arno) — « Ce que l'on doit — compromis non encore signés » : les mêmes lignes que les tuiles, par personne. */}
      <BlocDu detail={detailDu(dc, dca, liste, vue, d.aujourdhui)} societe={vue} autreSociete={autreSociete}
        titres={Object.fromEntries(liste.map((v) => [v.id, v.miroir != null ? v.libelle : carteCompromis(v, d.aujourdhui).titre]))} onAller={allerA} />
      {annulation !== null && <ModaleAnnulation vente={annulation} aujourdhui={d.aujourdhui} onFermer={() => setAnnulation(null)}
        onFait={() => { setAnnulation(null); relire(); }} />}
      {fenetrePersonnes !== null && (() => {
        const v = liste.find((x) => x.id === fenetrePersonnes.venteId);
        return v === undefined ? null : <FenetrePersonnes key={`${v.id}-${fenetrePersonnes.role}-${fenetrePersonnes.personneVisee ?? ''}`} vente={v} role={fenetrePersonnes.role}
          personneVisee={fenetrePersonnes.personneVisee} annuaire={d.personnes} avecType={d.personneType === true}
          onEnregistrer={(personnes) => enregistrerPersonnes(v, personnes)} onFermer={() => setFenetrePersonnes(null)} />;
      })()}
      {edition !== null && <FormulaireDossier societe={edition === 'nouveau' ? societeSaisie : edition.vente.societe} vente={edition === 'nouveau' ? null : edition.vente}
        ajouter={edition === 'nouveau' ? null : edition.ajouter} repartitionInitiale={edition === 'nouveau' ? undefined : edition.repartition}
        message={edition === 'nouveau' ? undefined : edition.message} personneVisee={edition === 'nouveau' ? null : edition.personneVisee ?? null}
        references={d} onFermer={() => setEdition(null)} onFait={(e) => { setEdition(null); if (e !== undefined) signalerPorteuse(e.id, e.repartition, e.honorairesTtc); relire(); }} />}
    </section>
    </FournisseurChangerAffichage></FournisseurAffichage>
  );
}

// ── LOT G : le négociateur d'un côté, depuis la carte ────────────────────────────────────────────────────────────────────

/** La société d'un compte, en clair (« ⚠ société à renseigner dans Comptes » si elle manque). */
const libelleSociete = (s: SocieteCompte | null): string => (s === null ? '⚠ société à renseigner dans Comptes' : LIBELLE_SOCIETE_COMPTE[s]);
/** Un pourcentage à l'écran (« 40 », « 62,5 »). */
const pctFr = (x: number): string => nombreFr(x, { maximumFractionDigits: 2 });
/** La société de la partie d'un négociateur sur cette vente (côté donné d'abord) ; null : aucune partie avec société. PUR. */
function societeSurVente(v: Vente, cote: 'entree' | 'sortie', id: number): Societe | null {
  const sortes = cote === 'entree' ? ['entree', 'entree_sortie'] : ['sortie', 'entree_sortie'];
  return v.repartition?.parties.find((p) => p.compteId === id && p.societe !== null && sortes.includes(p.sorte))?.societe
    ?? v.repartition?.parties.find((p) => p.compteId === id && p.societe !== null)?.societe ?? null;
}

/** Le dossier d'un compromis tel qu'il est, prêt à renvoyer avec un seul changement (les mêmes champs que « Modifier »). */
const champsDe = (v: Vente) => ({ libelle: v.libelle, commission: String(v.honorairesTtc), dateCompromis: v.dateCompromis ?? '', dateActePrevue: v.dossier?.dateActePrevue ?? '',
  dateActe: '', adresseBien: v.dossier?.adresseBien ?? '', note: v.note ?? '', prixVente: v.prixVente == null ? '' : String(v.prixVente) });
// 🔴 LOT BJ — la forme complète (type, civilité, prénom, représentants) : un geste de la carte ne fait rien perdre d'une société.
const personnesDe = (v: Vente) => (v.dossier?.personnes ?? []).map(personneEcranDe);

/**
 * 🔴 LOT G — « + Ajouter un négociateur » : dans « Vendeurs », le négociateur d'ENTRÉE du mandat ; dans « Acquéreurs », celui de SORTIE.
 * Un clic ouvre la liste des comptes actifs (avec leur société, « ⚠ société à renseigner dans Comptes » si elle manque) ; « Valider »
 * l'enregistre par le même geste que « Modifier » (journalisé, « Annuler » dans l'historique). Choisi, le bouton dit « Négociateur :
 * Prénom NOM (société) » et se rouvre pour le changer ou le retirer. La répartition suit les règles existantes ; si elle ne fait plus
 * 100 % (une partie extérieure), rien n'est enregistré : le formulaire s'ouvre pour la revoir, avec le message.
 * LOT I (437) — la COMMISSION VERSÉE à ce négociateur se saisit ici aussi (montant, « HT / TTC » au choix), enregistrée avec lui ; sous le
 * bouton, la commission enregistrée dans son unité et son équivalent.
 */
function BoutonNegociateur({ v, cote, references, disponible, onFait, onRevoir, statutDuLibelle, vue = null, onEnregistre, ventilation }: {
  v: Vente; cote: 'entree' | 'sortie'; references: References; disponible: boolean; onFait: () => void; onRevoir: (r: EtatRepartition, message: string) => void;
  /** LOT Y — le résolveur des libellés importés, celui des tuiles (la même règle du cumul). */
  statutDuLibelle?: StatutDuLibelle;
  /** LOT AA — la société dont c'est l'onglet (null : les deux, CA global). */
  vue?: Societe | null;
  /** LOT AE — la répartition enregistrée (le négociateur d'entrée, donc la porteuse, peut avoir changé). */
  onEnregistre?: (etat: EtatRepartition) => void;
  /** 🔴 LOT AY — la ventilation des honoraires de ce côté (part de l'agence) ; absente : rien à ventiler (historique, vente d'une autre société). */
  ventilation?: VentilationCote;
}) {
  const [ouvert, setOuvert] = useState(false);
  const actuel = cote === 'entree' ? v.dossier?.entree ?? null : v.dossier?.sortie ?? null;
  const [choix, setChoix] = useState<string>(actuel === null ? '' : String(actuel.id));
  const [motif, setMotif] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const avecUnite = references.uniteCommission === true;
  const enregistree = commissionDuCote(v, cote);
  const partieDuCote = actuel === null ? undefined : v.repartition?.parties.find((p) => p.compteId === actuel.id && (cote === 'entree' ? ['entree', 'entree_sortie'] : ['sortie', 'entree_sortie']).includes(p.sorte));
  const base = etatRepartitionDe(v, references.negociateurs, avecUnite);
  const initiale: MontantEcran = base.commissions?.[cote] ?? { texte: '', unite: 'ttc' };
  const [commission, setCommission] = useState<MontantEcran>(initiale);
  // La société de SA partie sur cette vente (côté de ce bouton d'abord) — pour le choix « CRITERIMMO / MACJ » d'un collaborateur des deux.
  const societeVente = (id: number): Societe | null => societeSurVente(v, cote, id);
  // 🔴 LOT K — un collaborateur des DEUX sociétés : « Pour cette vente, il travaille pour : CRITERIMMO / MACJ », obligatoire.
  const choisi = choix === '' ? null : Number(choix);
  const desDeux = choisi !== null && references.negociateurs.find((n) => n.id === choisi)?.societe === LES_DEUX;
  const societeInitiale = actuel !== null && choisi === actuel.id ? societeVente(actuel.id) : null;
  const [societeChoisie, setSocieteChoisie] = useState<Societe | null>(societeInitiale);
  const mot = cote === 'entree' ? 'entrée' : 'sortie';
  // 🔴 LOT S — NON COMMISSIONNÉ : le négociateur de ce côté (figé sur la vente, sinon son compte) ; celui qu'on choisit (son compte).
  const actuelNonCommissionne = actuel !== null && !commissionneDuCote(v, cote);
  const choisiNonCommissionne = choisi !== null && (choisi === (actuel?.id ?? null) ? actuelNonCommissionne : references.negociateurs.find((x) => x.id === choisi)?.commissionne === false);
  // 🔴 LOT O — la commission PROPOSÉE de ce côté : sa part dans la répartition (celle d'après le choix du négociateur) × la commission TTC.
  const hypothese = choisi === null || choisi === (actuel?.id ?? null) ? base : changerNegociateur(base, cote, choisi, references.negociateurs);
  // 🔴 LOT V — avec le taux TAPÉ dans ce panneau (il lisait celui enregistré : le montant ne suivait pas le taux) — l'un recalcule l'autre, en direct.
  const propose = propositionCommission(hypothese.commissions != null ? { ...hypothese, commissions: { ...hypothese.commissions, [cote]: commission } } : hypothese, cote, v.honorairesTtc);
  const enregistrer = async (id: number | null): Promise<void> => {
    setMotif(null);
    if (id !== null && desDeux && societeChoisie === null) {
      setMotif(`${references.negociateurs.find((n) => n.id === id)?.nom ?? 'Ce négociateur'} travaille pour CRITERIMMO et pour MACJ : choisissez pour quelle société il travaille sur cette vente. Rien n’a été enregistré.`);
      return;
    }
    // « Valider » valide la commission affichée de CE côté. 🔴 LOT V — l'autre côté garde son mode : calculée, il suit la nouvelle répartition
    // (le serveur la recalcule) ; saisie à la main, elle reste telle quelle.
    const saisie = montantEffectif(commission, propose);
    // ce qui est ENREGISTRÉ (rien : une commission proposée est un changement, « Valider » l'enregistre)
    const avant = enregistree === null ? { texte: '', unite: initiale.unite } : montantEffectif(initiale, propose);
    const memeCommission = saisie.texte === avant.texte && saisie.unite === avant.unite && (commission.taux ?? '') === (initiale.taux ?? '') && (commission.auto === true) === (initiale.auto === true);
    const memeSociete = !desDeux || societeChoisie === societeInitiale;
    if ((actuel?.id ?? null) === id && (!avecUnite || memeCommission) && memeSociete) { setOuvert(false); return; }
    const change = (actuel?.id ?? null) === id ? base : changerNegociateur(base, cote, id, references.negociateurs);
    const avecCommission: EtatRepartition = change.commissions != null && id !== null
      ? { ...change, commissions: { ...change.commissions, [cote]: { ...saisie, ...(commission.taux !== undefined ? { taux: commission.taux } : {}) } } } : change;
    const etat = id !== null && desDeux && societeChoisie !== null ? choisirSocietePartie(avecCommission, cote === 'entree' ? 0 : 1, societeChoisie) : avecCommission;
    const manque = motifSocieteVente(etat, references.negociateurs);
    if (manque !== null) { setOuvert(false); onRevoir(etat, manque); return; }
    const somme = etatSomme(etat, v.honorairesTtc);
    if (somme.motif !== null) { setOuvert(false); onRevoir(etat, `Le négociateur de ${mot} a changé : la répartition est à revoir. ${somme.motif}`); return; }
    setEnvoi(true);
    const r = await posterTransaction({ action: 'dossier-enregistrer', id: v.id, dossier: corpsDossier(v.societe, 'compromis', champsDe(v), personnesDe(v), etat) });
    setEnvoi(false);
    if (r === null) { onEnregistre?.(etat); setOuvert(false); onFait(); } else setMotif(r);
  };
  // 🔴 LOT T — les deux lignes de calcul sous le bouton (présentation seulement) : les honoraires de ce côté, puis la commission du négociateur.
  const honoraires = actuel === null ? null : honorairesDuCote(v, cote);
  const rem = actuel === null || actuelNonCommissionne ? null : remunerationDuCote(v, cote);
  // 🔴 LOT AA — le négociateur de ce côté travaille pour l'AUTRE société que celle de cet onglet : elle seule le rémunère (sa ligne miroir).
  const societeDuNego = actuel === null ? null : societeSurVente(v, cote, actuel.id);
  const autreSociete = vue !== null && rem !== null && societeDuNego !== null && societeDuNego !== vue ? societeDuNego : null;
  // 🔴 LOT AB (Arno) — les honoraires de ce côté sont VERSÉS à l'autre société (inter-cabinet) : ce sont eux qui entrent dans les « Commissions
  // versées » de la société porteuse (détail « Inter-cabinet vers … ») — même pour un négociateur non commissionné.
  // 🔴 LOT AD — décidé par la règle des tuiles (`bilanVente` : l'inter-cabinet versé par la société affichée à celle du négociateur).
  const versesVers = vue !== null && societeDuNego !== null && societeDuNego !== vue && bilanVente(v, vue).verseHt[societeDuNego] > 0 ? societeDuNego : null;
  // 🔴 LOT Y — la classe de cette commission par LA règle du cumul « Commissions versées » (`classeDeCommission`, celle des tuiles) : sa ligne
  // enregistrée ; sans ligne, le négociateur de ce côté (sa partie, figée sinon son compte ; sinon le compte rapproché de son libellé).
  const ligneCote = v.lignes.find((l) => l.role === 'negociateur' && l.cote === cote);
  const ligneStatut = actuel === null ? null : ligneCote ?? { negociateur: partieDuCote?.negociateur ?? actuel.nom, cote, statut: null };
  const classe = ligneStatut === null ? null : classeDeCommission(v, ligneStatut, statutDuLibelle);
  // 🔴 LOT Z — le statut de cette commission (le même que la classe : `statutDeCommission`) et, s'il n'est pas figé sur la vente, sa précision.
  const statutCommission = ligneStatut === null ? null : statutDeCommission(v, ligneStatut, statutDuLibelle);
  const precision = partieDuCote !== undefined && partieDuCote.statut == null ? (statutCommission !== null ? '(statut actuel du compte)' : '(à confirmer)') : undefined;
  const appliquer = (r: Remuneration): void => {
    const u = r.saisie?.unite ?? 'ttc';
    setEnvoi(true);
    void posterTransaction({ action: 'commission-cote', id: v.id, cote, montant: { montant: u === 'ttc' ? r.calculTtc : r.calculTtc / TVA, unite: u }, taux: r.taux, mode: 'calculee' })
      .then((x) => { setEnvoi(false); if (x === null) onFait(); else setMotif(x); });
  };
  const lignes = (montrer: 'honoraires' | 'commission') => <LignesCalcul montrer={montrer} classe={classe} mention={mentionCommission(statutCommission, precision)} cote={cote}
    premier={`Honoraires partie ${cote === 'entree' ? 'vendeur' : 'acquéreur'}`} honoraires={honoraires} honorairesVersesVers={versesVers === null ? null : LIBELLE_SOCIETE[versesVers]}
    rem={autreSociete === null ? rem : null} enregistree={avecUnite} occupe={!disponible || envoi} onAppliquer={appliquer} baseAffichee={ventilation?.base} sansCadre={ventilation?.conserve != null} />;
  return (
    <div className="trx-negociateur-carte" data-negociateur-cote={cote}>
      {/* 🔴 LOT T (Arno) — « Négociateur : Prénom NOM · 25 % » : son TAUX DE COMMISSIONNEMENT sur cette vente (la société et la part sont dans le
          bouton de la première ligne) ; non commissionné (lot S) : « · non commissionné ». */}
      <button type="button" className="svv-btn svv-btn-outline gst-btn trx-btn-large" onClick={() => setOuvert((o) => !o)} disabled={!disponible} aria-expanded={ouvert}
        data-negociateur-carte={cote}>{actuel === null ? '+ Ajouter un négociateur'
          : `Négociateur : ${actuel.nom} · ${actuelNonCommissionne ? 'non commissionné' : `${pctFr(tauxDuCote(v, cote))} %`}`}</button>
      {/* 🔴 LOT AB (accord d'Arno) — un négociateur de l'autre société : plus de bloc « Rémunéré par … » sous les honoraires (il reste dans le
          panneau du négociateur, « Commission réglée chez … ») ; ses honoraires, versés en inter-cabinet, sont encadrés de rouge. */}
      {/* 🔴 LOT AZ (Arno) — l'ordre des cadres : les lignes sans cadre (honoraires de la partie, statut), puis les cadres VERTS (part de l'agence,
          puis commission interne), puis les ROUGES (commission d'un indépendant, apporteur, agence extérieure, honoraires versés en inter-cabinet).
          Présentation seule : mêmes lignes, mêmes montants, mêmes couleurs. */}
      {/* 🔴 LOT BA (Arno) — avec une ventilation, l'en-tête « Honoraires partie … » est TOUJOURS la ligne sans cadre de la ventilation (la référence de
          la carte) ; l'inter-cabinet versé devient son cadre rouge « Reversé en inter-cabinet à … ». Sans ventilation (historique) : comme avant. */}
      {actuel !== null && ventilation === undefined && versesVers === null && lignes('honoraires')}
      {ventilation !== undefined && <VentilationPartie x={ventilation} groupe="tete" />}
      {/* Sans répartition (historique, import « toute la commission à … ») : aucun calcul possible — la commission versée, comme avant. */}
      {actuel !== null && avecUnite && !actuelNonCommissionne && honoraires === null && (
        <span className={enregistree === null ? 'loc-muet trx-negociateur-commission trx-a-renseigner' : 'trx-negociateur-commission'} data-commission-carte={cote}>
          {enregistree === null ? `Commission versée : ${A_RENSEIGNER}` : <>Commission versée : <HtTtc m={enregistree.montant} /></>}</span>
      )}
      {/* 🔴 LOT P — son statut À LA DATE DE LA VENTE (figé ; à défaut, celui de son compte, « à confirmer ») et ce qu'il devient dans le cumul.
          🔴 LOT Z (accord d'Arno) — RETIRÉE quand le bloc « Commission du négociateur » existe (doublon : le statut et sa précision sont dans la
          mention du bloc) ; gardée sans bloc — un non commissionné : « Statut à la vente : Associé — non commissionné ».
          🔴 LOT BE (retrait autorisé par Arno) — plus pour un non commissionné : son nom est sur son bouton, un associé est nommé dans « Part de
          l'agence » (« Rattachée au CA de … ») ; le statut figé reste en base et sert aux calculs. */}
      {actuel !== null && partieDuCote !== undefined && rem === null && !actuelNonCommissionne && (() => {
        const st = statutDePartie(partieDuCote);
        const classe = classeCommission(st);
        return <span className={classe === 'a_renseigner' ? 'loc-muet trx-negociateur-commission trx-alerte' : 'loc-muet trx-negociateur-commission'} data-statut-vente={cote}>
          Statut à la vente : {libelleStatut(st)}{partieDuCote.statut == null ? (st !== null ? ' (statut actuel du compte)' : ' (à confirmer)') : ''}
          {actuelNonCommissionne ? ' — non commissionné' : classe === 'independant' ? ' — commission déduite' : classe === 'interne' ? ' — commission interne, non déduite' : ' — commission non déduite'}</span>;
      })()}
      {/* 🔴 LOT AY (Arno) — sous la ou les commissions : 100 % des honoraires de la partie ventilés, jusqu'à la part de l'agence. */}
      {ventilation !== undefined && <VentilationPartie x={ventilation} groupe="vert" />}
      {actuel !== null && classe !== 'independant' && lignes('commission')}
      {actuel !== null && classe === 'independant' && lignes('commission')}
      {ventilation !== undefined && <VentilationPartie x={ventilation} groupe="rouge" />}
      {actuel !== null && ventilation === undefined && versesVers !== null && lignes('honoraires')}
      {ouvert && (
        <div className="trx-choix-negociateur" role="group" aria-label={`Négociateur de ${mot} du mandat`} data-choix-negociateur={cote}>
          <div className="trx-form-affichage" data-affichage-panneau={`negociateur-${cote}`}><span className="loc-muet">Montants en</span><SelecteurAffichage /></div>
          <label>Négociateur de {mot} du mandat
            <ListeChoix options={references.negociateurs.map((n) => ({ id: n.id, libelle: `${n.nom} — ${libelleSociete(n.societe)}` }))} valeur={choix} vide="— à choisir —"
              libelle={`Négociateur de ${mot} du mandat`} onChange={(x) => { setChoix(x); setSocieteChoisie(actuel !== null && x === String(actuel.id) ? societeVente(actuel.id) : null); }}
              donnees={{ 'data-liste-negociateur': cote }} recherche={{ placeholder: 'Rechercher un négociateur' }} /></label>
          {desDeux && <ChoixSocieteVente valeur={societeChoisie} onChoisir={(s) => { setSocieteChoisie(s); setMotif(null); }} cle={`carte-${cote}`} />}
          {choisiNonCommissionne ? <span className="loc-muet" data-non-commissionne-choix={cote}>Non commissionné</span>
            // 🔴 LOT AG (Arno) — pour TOUT négociateur commissionné, le taux et le montant se règlent ici (calcul en direct). Pour un négociateur de
            // l'autre société, ce sont EXACTEMENT les données de sa ligne miroir (la même ligne de la vente d'origine : aucune copie) ; sa commission
            // reste comptée chez sa société seule — la mention « Commission réglée chez … » le rappelle sous le champ.
            : avecUnite ? <>
              <ChampMontantUnite mot="Commission versée" valeur={commission} onChange={setCommission} avecHt champ={`commission-carte-${cote}`} propose={propose} />
              {autreSociete !== null && choisi === actuel?.id && <span className="loc-muet" data-commission-chez={cote}>Commission réglée chez {LIBELLE_SOCIETE[autreSociete]} :{' '}
                <a className="trx-lien" href={adresseOrigine(autreSociete, v.id)}>Voir chez {LIBELLE_SOCIETE[autreSociete]}</a></span>}
            </>
            : <span className="loc-muet" data-commission-indisponible>Commission versée au négociateur : disponible après la mise à jour de la base (migration 437).</span>}
          <div className="trx-actions">
            <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={envoi || choix === ''} onClick={() => void enregistrer(Number(choix))} data-valider-negociateur>Valider</button>
            {actuel !== null && <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={envoi} onClick={() => void enregistrer(null)} data-retirer-negociateur>Retirer le négociateur</button>}
            <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => { setOuvert(false); setMotif(null); }}>Fermer</button>
          </div>
          {motif !== null && <p className="trx-erreur" role="alert">{motif}</p>}
        </div>
      )}
    </div>
  );
}

// ── 🔴 LOT T : la société et la part de chaque côté ; les lignes de calcul sous le négociateur ──────────────────────────────────

/**
 * 🔴 LOT V (Arno) — UN MONTANT : le HT en gras d'abord, puis le TTC entre parenthèses, en vert, « TTC » écrit (« 1 625,00 € HT (1 950,00 € TTC) ») ;
 * `alerte` : en rouge (apporteur, commission enregistrée qui diffère du calcul) — le TTC n'y prend pas le vert.
 */
export function HtTtc({ ttc, m, alerte = false }: { ttc?: number; m?: MontantSaisi; alerte?: boolean }) {
  // 🔴 LOT AM — l'unité choisie (« HT | TTC ») en grand, l'autre entre parenthèses ; l'alerte en rouge, sinon l'encre.
  const t = m !== undefined ? enTtc(m) : ttc ?? 0;
  return <span className="trx-ht-ttc" data-ht-ttc><Montants disposition="ligne" sens={alerte ? 'verse' : 'neutre'} ht={m !== undefined ? enHt(m) : t / TVA} ttc={t}
    donneesHt={{ 'data-montant-ht': '' }} donneesTtc={{ 'data-montant-ttc': '' }} /></span>;
}

/**
 * 🔴 LOT W (Arno) — UNE LIGNE DE CALCUL sur DEUX lignes, toujours : le libellé et l'opération à gauche ; à droite, dans une colonne de largeur
 * FIXE alignée à droite, le résultat HT en gras, et juste dessous le TTC entre parenthèses, en vert. Les montants ne se coupent jamais ; quand la
 * place manque (téléphone, colonne étroite), le libellé passe au-dessus et HT / TTC restent l'un sous l'autre.
 */
/**
 * 🔴 LOT Z (Arno) — LA MENTION DU BLOC « Commission du négociateur » : le statut à la vente (« Salarié interne », « Associé », « Indépendant »,
 * « Statut à renseigner »), sa précision s'il n'est pas figé (« (statut actuel du compte) », « (à confirmer) »), et ce que devient la commission
 * dans « Commissions versées » — la règle du cumul (`classeCommission`, celle des tuiles). PUR.
 */
/** 🔴 LOT AB (Arno) — la mention d'honoraires versés en inter-cabinet (autre société, partie extérieure). PUR. */
export const mentionVersement = (vers: string): string => `Honoraires versés vers ${vers} — comptabilisés dans « Commissions versées »`;

export function mentionCommission(statut: Statut | null, precision?: string): string {
  const qui = statut === 'independant' ? 'Indépendant' : statut === 'salarie' ? 'Salarié interne' : statut === 'associe' ? 'Associé' : 'Statut à renseigner';
  return `${qui}${precision === undefined ? '' : ` ${precision}`} — ${classeCommission(statut) === 'independant' ? 'comptabilisé' : 'non comptabilisé'} dans « Commissions versées »`;
}

function LigneCalcul({ donnees, libelle, ttc, ht: htExact, encadre = null, mention, apres, rouge = false, classe }: { donnees: Record<string, string>; libelle: ReactNode; ttc: number;
  /** 🔴 LOT BB — un montant en rouge sans cadre (« − Apporteur » de l'en-tête). */
  rouge?: boolean;
  /** 🔴 LOT BB — une classe en plus (« = Honoraires partie … » en gras). */
  classe?: string;
  /** 🔴 LOT BA — des lignes d'information en petit, sous la mention (hors du total de la carte). */
  apres?: ReactNode;
  /** 🔴 LOT AY — le HT au centime quand il ne se déduit pas du TTC (lignes de ventilation : chaque unité a ses centimes). */
  ht?: number;
  /** LOT Z — la mention du bloc encadré (le statut à la vente et ce que devient la commission dans « Commissions versées »). */
  mention?: string;
  /**
   * 🔴 LOTS X / Y / Z — la commission du négociateur, encadrée d'un liseré fin : ROUGE si elle entre dans « Commissions versées » (indépendant),
   * VERT sinon (associé, salarié, statut à renseigner) ; la mention écrite (`mentionCommission`) accompagne toujours la couleur.
   */
  /** 🔴 LOT AY — « agence » : la part de l'agence, liseré VERT, montant en vert. */
  encadre?: 'deduite' | 'interne' | 'agence' | null }) {
  // 🔴 LOT AM — l'unité choisie en grand (gras), l'autre dessous entre parenthèses, de la même couleur : rouge si le montant ENTRE dans les
  // « Commissions versées » (lot AD), l'encre sinon (le vert n'est plus attaché au TTC). Les liserés (lots X / Y / Z) ne changent pas.
  const u = useAffichage();
  const autre = u === 'ttc' ? 'ht' : 'ttc';
  const valeur = (x: 'ht' | 'ttc'): number => (x === 'ttc' ? ttc : htExact ?? ttc / TVA);
  const couleur = encadre === 'deduite' || rouge ? ' trx-rouge' : encadre === 'agence' ? ' trx-vert' : '';
  return (
    <p className={`${encadre === null ? 'trx-calcul-cote trx-calcul-grille' : `trx-calcul-cote trx-calcul-grille trx-calcul-encadre trx-calcul-encadre--${encadre}`}${classe === undefined ? '' : ` ${classe}`}`} {...donnees}
      data-ht-ttc data-classe-commission={encadre ?? undefined}>
      <span className="trx-calcul-libelle">{libelle}</span>{' '}
      <strong className={`trx-calcul-resultat${couleur}`} {...{ [`data-montant-${u}`]: '' }}>{eur(valeur(u))}{ESPACE}{MOT_UNITE[u]}</strong>{' '}
      <span className={`trx-calcul-ttc trx-mt-petit${couleur}`} {...{ [`data-montant-${autre}`]: '' }}>({eur(valeur(autre))}{ESPACE}{MOT_UNITE[autre]})</span>
      {encadre !== null && <>{' '}<span className="trx-calcul-mention" data-mention-commission>{mention}</span></>}
      {apres !== undefined && <span className="trx-calcul-dont">{apres}</span>}
    </p>
  );
}

/**
 * 🔴 LOT T (Arno) — SOUS LE BOUTON DU NÉGOCIATEUR, deux lignes de calcul lisibles :
 *   · « Honoraires partie vendeur / acquéreur » (ligne miroir : « Honoraires reçus de CRITERIMMO / MACJ ») : la commission nette après apporteur
 *     × la part de ce côté = la base ;
 *   · « Commission du négociateur » : la base × son taux = la commission qui lui revient.
 * 🔴 LOT V — les montants en HT (gras) puis TTC (vert) ; et selon le MODE de la commission :
 *   · calculée (égale au calcul) : rien de plus — elle suit le calcul, recalculée et enregistrée à chaque changement ;
 *   · saisie à la main (tapée, enregistrée comme telle) : « Commission enregistrée : X — saisi à la main — calcul : Y » et « Revenir au calcul » ;
 *   · une commission d'avant qui diffère du calcul : « Commission enregistrée : X » en rouge et « Appliquer le calcul » (comportement du lot T).
 * Non commissionné (`rem` null) : la première ligne seule.
 */
function LignesCalcul({ cote, premier, honoraires, rem, enregistree, occupe, onAppliquer, appliquerSiVide = false, classe = null, mention, honorairesVersesVers = null, montrer = 'tout', baseAffichee, sansCadre = false }: {
  /** 🔴 LOT BI (Arno) — le côté d'un associé : sa commission n'est pas distinguée (pas de cadre ; le cadre vert porte tout le côté). */
  sansCadre?: boolean;
  /** 🔴 LOT BA — la base montrée dans l'opération de la commission : celle de l'en-tête de la carte (centimes du lot AH) ; la commission ne change pas. */
  baseAffichee?: MontantC;
  cote: 'entree' | 'sortie'; premier: string; honoraires: HonorairesCote | null; rem: Remuneration | null;
  /** 🔴 LOT AZ — une partie seulement (la carte place les honoraires et la commission selon l'ordre vert / rouge) ; défaut : tout. */
  montrer?: 'tout' | 'honoraires' | 'commission';
  /** 🔴 LOT AB — les honoraires de ce côté sont versés à cette société (inter-cabinet) : liseré rouge et « Honoraires versés vers … ». */
  honorairesVersesVers?: string | null;
  /** 🔴 LOT Y — la classe de la commission selon la règle du cumul (`classeDeCommission`) : la couleur du liseré. */
  classe?: ClasseCommission | null;
  /** 🔴 LOT Z — la mention du bloc (`mentionCommission`). */
  mention?: string;
  /** Faux : sans la 437 (ni commission enregistrée, ni « Appliquer le calcul »). */
  enregistree: boolean; occupe: boolean; onAppliquer: (r: Remuneration) => void;
  /** Ligne miroir : « Appliquer le calcul » aussi quand rien n'est encore enregistré (comme au lot R). */
  appliquerSiVide?: boolean;
}) {
  const bouton = (r: Remuneration, mot = 'Appliquer le calcul') => <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={occupe} onClick={() => onAppliquer(r)}
    data-appliquer-calcul-carte={cote}>{mot}</button>;
  const manuelle = rem !== null && rem.saisie !== null && rem.modeEnregistre && rem.mode === 'manuelle';
  const u = useAffichage();
  if (montrer !== 'tout') return <LignesCalcul {...{ cote, premier, enregistree, occupe, onAppliquer, appliquerSiVide, classe, mention, honorairesVersesVers, baseAffichee, sansCadre }}
    honoraires={montrer === 'honoraires' ? honoraires : null} rem={montrer === 'commission' ? rem : null} />;
  return <>
    {honoraires !== null && (
      <LigneCalcul donnees={{ 'data-honoraires-cote': cote }} libelle={<><span className="trx-calcul-mot">{premier}</span> : <span className="trx-calcul-operation">{montantAffiche(u, honoraires.netTtc / TVA, honoraires.netTtc)} × {pctFr(honoraires.part)}{ESPACE}% =</span></>}
        ttc={honoraires.ttc} encadre={honorairesVersesVers === null ? null : 'deduite'} mention={honorairesVersesVers === null ? undefined : mentionVersement(honorairesVersesVers)} />
    )}
    {/* 🔴 LOT BB (accord d'Arno) — un cadre à 0 (HT et TTC) ne s'affiche pas. */}
    {rem !== null && !sansCadre && Math.round(rem.calculTtc * 100) !== 0 && (
      <LigneCalcul encadre={classe === 'independant' ? 'deduite' : 'interne'} mention={mention ?? mentionCommission(null)} donnees={{ 'data-commission-negociateur': cote }} libelle={<><span className="trx-calcul-mot">Commission du négociateur</span> : <span className="trx-calcul-operation">{baseAffichee !== undefined ? montantAffiche(u, baseAffichee.htC / 100, baseAffichee.ttcC / 100) : montantAffiche(u, rem.baseTtc / TVA, rem.baseTtc)} × {pctFr(rem.taux)}{ESPACE}% =</span></>}
        ttc={rem.calculTtc} />
    )}
    {rem !== null && enregistree && manuelle && (
      <p className="trx-calcul-cote trx-ecart-calcul" data-commission-manuelle={cote}>
        <span>Commission enregistrée : <HtTtc m={rem.saisie!} /> <span className="loc-muet">— saisi à la main — calcul : {montantsTexte(u, rem.calculTtc / TVA, rem.calculTtc)}</span></span>
        {bouton(rem, 'Revenir au calcul')}</p>
    )}
    {rem !== null && enregistree && !manuelle && rem.ecart && rem.saisie !== null && (
      <p className="trx-calcul-cote trx-ecart-calcul" data-ecart-remuneration={cote}>
        <span className="trx-alerte" data-commission-enregistree={cote}>Commission enregistrée : <HtTtc m={rem.saisie} alerte /></span>{bouton(rem)}</p>
    )}
    {rem !== null && enregistree && rem.saisie === null && (
      <p className="trx-calcul-cote trx-ecart-calcul" data-commission-carte={cote}>
        <span className="loc-muet trx-a-renseigner">Commission enregistrée : {A_RENSEIGNER}</span>{appliquerSiVide && bouton(rem)}</p>
    )}
  </>;
}

/**
 * 🔴 LOT AY (Arno) — LA VENTILATION D'UNE PARTIE, sous la ou les commissions : la quote-part de l'apporteur et des agences extérieures (en
 * rouge : comptées dans « Commissions versées »), puis « Part de l'agence : honoraires de la partie − ce qui en sort = … » (liseré vert) —
 * ce qui reste dans le CA de la société, ou rattaché au CA de son associé. Commissions + quote-parts + inter-cabinet versé + part de l'agence
 * = honoraires de la partie, au centime, dans chaque unité (`ventilationVente`).
 */
export function VentilationPartie({ x, groupe }: { x: VentilationCote;
  /** 🔴 LOT AZ — « tete » : les honoraires de la partie (sans cadre) ; « vert » : la part de l'agence ; « rouge » : les quote-parts. */
  groupe: 'tete' | 'vert' | 'rouge' }) {
  const u = useAffichage();
  const t = (m: MontantC): string => montantAffiche(u, m.htC / 100, m.ttcC / 100);
  const mot = x.cote === 'entree' ? 'vendeur' : 'acquéreur';
  const sorties = [...x.commissions.map((c) => c.m), ...x.quoteParts.map((q) => q.m), ...(x.versee === null ? [] : [x.versee.m])];
  if (groupe === 'rouge' && x.quoteParts.length === 0 && (x.versee === null || (x.versee.m.htC === 0 && x.versee.m.ttcC === 0))) return null;
  if (groupe === 'vert' && x.agence.htC === 0 && x.agence.ttcC === 0) return null;
  const qui = LIBELLE_SOCIETE[x.societe];
  return (
    // 🔴 LOT BD — l'en-tête (la base) : un cadre à liseré gris.
    <div className={groupe === 'tete' ? 'trx-ventilation trx-cadre-base' : 'trx-ventilation'} data-ventilation={x.cote} data-groupe-ventilation={groupe}>
      {/* 🔴 LOT BA — l'en-tête, sans cadre : la part du CA de cette partie, référence de la carte (les cadres dessous la totalisent au centime). */}
      {/* 🔴 LOT BB (Arno) — avec apporteur, l'en-tête est le calcul complet : « Commission de la vente », « − Apporteur » (rouge, son nom dessous en
          petit, une ligne par apporteur), puis « = Honoraires partie … : (commission − apporteur) × part % = … » en gras. Sans apporteur : une ligne. */}
      {groupe === 'tete' && x.recuDe === null && x.apporteurs.length > 0 && <>
        <LigneCalcul donnees={{ 'data-entete-commission': x.cote }} ttc={x.commissionVente.ttcC / 100} ht={x.commissionVente.htC / 100}
          libelle={<span className="trx-calcul-mot">Commission de la vente</span>} />
        {/* 🔴 LOT BC (Arno) — une seule ligne par apporteur : « − Apporteur : [nom] » (sans nom : « à renseigner »), le montant rouge à droite sur la
            même ligne ; au téléphone, le nom peut passer à la ligne sous « − Apporteur : », sans jamais quitter son montant. */}
        {x.apporteurs.map((a, i) => <LigneCalcul key={i} rouge donnees={{ 'data-entete-apporteur': x.cote }} ttc={a.m.ttcC / 100} ht={a.m.htC / 100}
          libelle={<><span className="trx-calcul-mot">− Apporteur</span> : <span className={a.nom === null ? 'trx-a-renseigner' : undefined} data-entete-apporteur-nom>{a.nom ?? A_RENSEIGNER}</span></>} />)}
      </>}
      {/* 🔴 LOT BG (Arno) — la ligne résultat ressort : trame grise des sommes sur toute la largeur du cadre (coins du bas assortis), filet au-dessus
          s'il y a un apporteur, montant principal plus grand et en gras, et dessous, en petit : « base des calculs ci-dessous ». */}
      {groupe === 'tete' && <div className={`trx-calcul-base-resultat ${x.recuDe === null && x.apporteurs.length > 0 ? 'trx-calcul-base-resultat--filet' : 'trx-calcul-base-resultat--seule'}`} data-base-resultat={x.cote}>
        <LigneCalcul donnees={{ 'data-honoraires-cote': x.cote }} ttc={x.honoraires.ttcC / 100} ht={x.honoraires.htC / 100} classe={x.apporteurs.length > 0 ? 'trx-calcul-total' : undefined}
          libelle={x.recuDe !== null ? <span className="trx-calcul-mot">Honoraires reçus de {LIBELLE_SOCIETE[x.recuDe]}</span>
            : <><span className="trx-calcul-mot">{x.apporteurs.length > 0 ? '= ' : ''}Honoraires partie {mot}</span> : <span className="trx-calcul-operation">{x.apporteurs.length > 0
              ? `(${[x.commissionVente, ...x.apporteurs.map((a) => a.m)].map(t).join(' − ')})` : t(x.commissionVente)} × {pctFr(x.pctQuote)}{ESPACE}% =</span></>} />
        <span className="trx-calcul-base-note" data-base-note={x.cote}>base des calculs ci-dessous</span>
      </div>}
      {groupe === 'rouge' && x.quoteParts.map((q, i) => (
        <LigneCalcul key={`${q.cle}-${i}`} encadre="deduite" mention="Quote-part de cette partie — comptabilisée dans « Commissions versées »" donnees={{ 'data-quote-part': q.cle }}
          ttc={q.m.ttcC / 100} ht={q.m.htC / 100}
          libelle={<><span className="trx-calcul-mot">{q.cle === 'apporteur' ? 'Apporteur' : 'Agence extérieure'}{q.nom === null ? '' : ` — ${q.nom}`}</span> : <span className="trx-calcul-operation">{t(q.total)} × {pctFr(x.pctQuote)}{ESPACE}% =</span></>} />
      ))}
      {/* 🔴 LOT BA (Arno) — l'inter-cabinet versé : le même montant que la Répartition et la fenêtre « Commissions versées » ; à titre d'information,
          en petit (hors du total de la carte), la commission du négociateur (payée par l'autre société) et la part de l'agence de l'autre société. */}
      {groupe === 'rouge' && x.versee !== null && !(x.versee.m.htC === 0 && x.versee.m.ttcC === 0) && (() => {
        const w = x.versee;
        const autre = LIBELLE_SOCIETE[w.vers];
        return <LigneCalcul encadre="deduite" mention="Comptabilisé dans « Commissions versées »" donnees={{ 'data-reverse-cote': x.cote }} ttc={w.m.ttcC / 100} ht={w.m.htC / 100}
          libelle={<span className="trx-calcul-mot">Reversé en inter-cabinet à {autre}</span>}
          apres={<>
            {w.negociateur !== null && <span className="trx-calcul-dont-ligne" data-dont-commission={x.cote}>{w.commission === null
              ? `dont commission de ${w.negociateur} (${autre}) : aucune — non commissionné`
              : `dont commission de ${w.negociateur} (${autre}${w.taux === null ? '' : `, ${pctFr(w.taux)} %`}) : ${t(w.commission)} — payée par ${autre}`}</span>}
            <span className="trx-calcul-dont-ligne" data-dont-agence={x.cote}>dont part de l’agence {autre} : {t(w.agenceAutre)}</span>
          </>} />;
      })()}
      {groupe === 'vert' && !(x.agence.htC === 0 && x.agence.ttcC === 0) && <LigneCalcul encadre="agence" mention={mentionPartAgence(x)} donnees={{ 'data-part-agence': x.cote }} ttc={x.agence.ttcC / 100} ht={x.agence.htC / 100}
        libelle={x.conserve !== null
          // 🔴 LOT BI (Arno) — le côté d'un associé : tout le côté conservé, compté dans son CA (sa commission n'est pas distinguée).
          ? <><span className="trx-calcul-mot" data-conserve={x.cote}>Honoraires conservés par {qui}</span> :</>
          : <><span className="trx-calcul-mot">Part de l’agence {qui}</span> : <span className="trx-calcul-operation trx-calcul-operation--suite">{sorties.length === 0
          ? <><span className="trx-calcul-terme">{t(x.honoraires)}</span> <span className="trx-calcul-terme">− aucune commission =</span></>
          : [x.honoraires, ...sorties].map((m, i, l) => <span key={i}>{i > 0 && ' '}<span className="trx-calcul-terme">{i > 0 && '− '}{t(m)}{i === l.length - 1 && ' ='}</span></span>)}</span></>} />}
    </div>
  );
}

/**
 * 🔴 LOT BA (Arno) — LE CONTRÔLE PERMANENT, à l'écran : une affaire dont les cartes ne totalisent pas la commission de la vente (ou la part
 * reçue) — des données incomplètes — porte une petite alerte discrète ; aucune quand tout tombe juste (`controleVentilation`).
 */
function AlerteVentilation({ v, vue }: { v: Vente; vue: Societe | null }) {
  const u = useAffichage();
  const c = controleVentilation(v, vue);
  if (c === null || (c.ecart.htC === 0 && c.ecart.ttcC === 0)) return null;
  return <p className="trx-alerte trx-ventilation-alerte" role="status" data-ventilation-incomplete>Ventilation incomplète : {montantAffiche(u, c.ecart.htC / 100, c.ecart.ttcC / 100)} non affectés</p>;
}

/** La part d'une ligne de répartition à l'écran, en % de la commission nette (€ HT ramenés en %) ; illisible : 0. PUR. */
function pctLigne(p: PartieEcran | undefined, netHt: number): number {
  const x = p === undefined ? null : nombre(p.texte);
  if (p === undefined || x === null) return 0;
  return p.mode === 'pct' ? x : pourcentageDe(x, netHt);
}

/**
 * 🔴 LOT T (Arno) — LA PREMIÈRE LIGNE D'UNE COLONNE : « Vendeurs » / « Acquéreurs » à gauche ; à droite, la société concernée par ce côté et sa
 * part dans la répartition (« CRITERIMMO · 40 % » ; sans négociateur : « Société à définir · 50 % »). Un clic ouvre le réglage de la
 * répartition — le bloc partagé du formulaire, parts seules : % / €, auto-compensation à deux parties, partie extérieure, et la société pour
 * cette vente d'un collaborateur « CRITERIMMO et MACJ ». « Valider » l'enregistre par le même geste que « Modifier » (journalisé).
 * 🔴 LOT V — une commission calculée suit la nouvelle répartition (recalculée et enregistrée, « recalculée suite à … ») ; une commission
 * saisie à la main reste telle quelle.
 */
function BoutonSocieteCote({ titre, v, cote, references, disponible, onFait, onEnregistre }: {
  titre: string; v: Vente; cote: 'entree' | 'sortie'; references: References; disponible: boolean; onFait: () => void;
  /** LOT AE — la répartition enregistrée (la société porteuse peut avoir changé : société choisie d'un collaborateur des deux). */
  onEnregistre?: (etat: EtatRepartition) => void;
}) {
  const [etat, setEtat] = useState<EtatRepartition | null>(null);
  const [motif, setMotif] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const base = etatRepartitionDe(v, references.negociateurs, references.uniteCommission === true);
  const actuel = cote === 'entree' ? v.dossier?.entree ?? null : v.dossier?.sortie ?? null;
  const i = cote === 'entree' ? 0 : 1;
  const compte = actuel === null ? undefined : references.negociateurs.find((n) => n.id === actuel.id);
  const surVente = actuel === null ? null : societeSurVente(v, cote, actuel.id);
  const societe = actuel === null ? 'Société à définir'
    : surVente !== null ? LIBELLE_SOCIETE[surVente]
    : compte?.societe === LES_DEUX ? 'Société à choisir' : libelleSociete(compte?.societe ?? null);
  const part = partDuCote(v, cote) ?? pctLigne(base.parties[i], commissionNetteHt(v.honorairesTtc, v.repartition?.retroApporteurTtc ?? 0));
  const ouvert = etat !== null;
  const somme = etat === null ? null : etatSomme(etat, v.honorairesTtc);
  const bloque = etat === null ? null : motifSocieteVente(etat, references.negociateurs) ?? somme?.motif ?? null;
  const valider = async (): Promise<void> => {
    if (etat === null) return;
    setMotif(null);
    if (bloque !== null) { setMotif(`${bloque} Rien n’a été enregistré.`); return; }
    if (JSON.stringify(versModele(etat.parties)) === JSON.stringify(versModele(base.parties))) { setEtat(null); return; }
    setEnvoi(true);
    const r = await posterTransaction({ action: 'dossier-enregistrer', id: v.id, dossier: corpsDossier(v.societe, 'compromis', champsDe(v), personnesDe(v), etat) });
    setEnvoi(false);
    if (r === null) { onEnregistre?.(etat); setEtat(null); onFait(); } else setMotif(r);
  };
  return <>
    <div className="trx-colonne-tete">
      <h4>{titre}</h4>
      <button type="button" className="svv-btn svv-btn-outline gst-btn trx-btn-societe-cote" onClick={() => { setMotif(null); setEtat(ouvert ? null : base); }} disabled={!disponible}
        aria-expanded={ouvert} data-societe-cote={cote}>{societe} · {pctFr(part)} %</button>
    </div>
    {etat !== null && (
      <div className="trx-choix-negociateur trx-reglage-repartition" role="group" aria-label={`Répartition de la commission — ${titre}`} data-reglage-repartition={cote}>
        <div className="trx-form-affichage" data-affichage-panneau={`repartition-${cote}`}><span className="loc-muet">Montants en</span><SelecteurAffichage /></div>
        {/* Dans `.trx-form`, comme dans « Modifier » : les mêmes champs (44 px), une colonne sur téléphone. */}
        <div className="trx-form">
          <BlocRepartition etat={etat} onChange={(e) => { setEtat(e); setMotif(null); }} negociateurs={references.negociateurs} apporteurs={references.apporteurs}
            honorairesTtc={v.honorairesTtc} societeVente={v.societe} seulementParts />
        </div>
        <div className="trx-actions">
          <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={envoi || bloque !== null} onClick={() => void valider()} data-valider-repartition={cote}>Valider</button>
          <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => { setEtat(null); setMotif(null); }}>Fermer</button>
        </div>
        {motif !== null && <p className="trx-erreur" role="alert">{motif}</p>}
      </div>
    )}
  </>;
}

// ── 🔴 LOT R : la ligne miroir de l'inter-cabinet, et la rémunération d'un côté ─────────────────────────────────────────────────

/** L'adresse de la vente d'origine (chez la société porteuse), carte dépliée. */
export const adresseOrigine = (porteuse: Societe, id: number): string => `/admin/transaction/${porteuse}?vente=${id}`;

/**
 * 🔴 LOT R (Arno) — LA CARTE D'UNE LIGNE MIROIR : « … — inter-cabinet reçu de CRITERIMMO / MACJ », sa SEULE part en tête (TTC en grand,
 * HT dessous) — jamais le montant de la vente ni la commission totale. Non modifiable d'ici : « Voir la vente d'origine » ; seule la
 * rémunération de son négociateur se modifie (elle s'enregistre sur la vente d'origine, sans doublon).
 */
function CarteMiroir({ v, references, aujourdhui, disponible, onFait, statutDuLibelle, ouvertInitial = false }: { v: Vente; references: References; aujourdhui: string; disponible: boolean; onFait: () => void;
  statutDuLibelle?: StatutDuLibelle;
  /** LOT AA — « Voir chez MACJ » depuis la carte de la porteuse (?vente=N) : la ligne miroir s'ouvre. */
  ouvertInitial?: boolean }) {
  const m = v.miroir!;
  const c = carteCompromis(v, aujourdhui);
  // 🔴 LOT AY — chaque côté tenu par la société qui reçoit : sa part de l'agence, à partir de SA part reçue.
  const ventilation = ventilationVente(v, v.societe);
  const pctTexte = m.pourcentage === null ? null : pctFormat(m.pourcentage);
  const titre = (
    <span className="trx-carte-gauche">
      <span className="trx-carte-titre" data-carte="titre">{v.libelle}</span>
      <span className="trx-carte-infos" data-carte-ligne="infos">
        <span data-carte="part-recue">part reçue{pctTexte === null ? '' : ` : ${pctTexte} de la commission nette`}</span>
        <span className="trx-sep" aria-hidden="true">{'\u00a0·\u00a0'}</span>
        <span data-carte="butoir" className={c.depassee ? 'trx-depassee' : c.butoir === null ? 'trx-a-renseigner' : undefined}>
          {c.butoir === null ? `acte au plus tard le : ${A_RENSEIGNER}` : `acte au plus tard le ${date(c.butoir)}${c.depassee ? ' — dépassée' : ''}`}</span>
      </span>
    </span>
  );
  const droite = (
    <span className="trx-carte-droite" data-carte="montants">
      <Montants ht={m.partHt} ttc={v.honorairesTtc} sens="recu" classe="trx-carte-montants" donneesHt={{ 'data-carte': 'commission-ht' }} donneesTtc={{ 'data-carte': 'commission' }} />
      <span className="trx-carte-pct" data-carte="inter-cabinet">inter-cabinet reçu</span>
    </span>
  );
  return (
    <li data-compromis={v.id} data-miroir={m.origineId}>
      <BlocReplie id={`trx-miroir-${v.id}`} section={`miroir-${v.id}`} titre={titre} resume={droite} chevronAGauche defilement={false} classe="trx-carte trx-carte--miroir"
        donnees={{ 'data-carte-miroir': String(m.origineId) }} ouvertInitial={ouvertInitial}>
        <div className="trx-carte-detail">
          {/* 🔴 LOT AF (Arno) — le bloc « Inter-cabinet reçu » en couples libellé / valeur, une information par ligne (comme les Informations
              communes) ; puis la note, d'une ligne ; puis le bloc du négociateur. Rien n'est retiré : la phrase d'avant est dépliée en lignes. */}
          <section className="trx-communes" aria-label="Inter-cabinet reçu" data-miroir-bloc>
            <h4>Inter-cabinet reçu</h4>
            <dl className="trx-couples">
              <div className="trx-couple" data-miroir-info="porteuse"><dt>Société porteuse</dt><dd>{LIBELLE_SOCIETE[m.porteuse]}</dd></div>
              <div className="trx-couple" data-miroir-info="origine"><dt>Vente d’origine</dt><dd>{m.libelleOrigine}
                {' '}<a className="trx-lien" href={adresseOrigine(m.porteuse, m.origineId)} data-voir-origine={m.origineId}>Voir la vente d’origine</a></dd></div>
              <div className="trx-couple" data-miroir-info="part"><dt>Part reçue</dt>
                <dd className={pctTexte === null ? 'trx-a-renseigner' : undefined}>{pctTexte === null ? A_RENSEIGNER : `${pctTexte} de la commission nette`}</dd></div>
              <div className="trx-couple" data-miroir-info="ca"><dt>CA de {LIBELLE_SOCIETE[v.societe]} sur cette vente</dt>
                <dd><span className="trx-ht-ttc-pile"><Montants ht={m.partHt} ttc={v.honorairesTtc} sens="recu" /></span></dd></div>
              <div className="trx-couple" data-miroir-info="dates"><dt>Dates</dt><dd><span className="trx-dates">
                <span data-date="compromis" className={v.dateCompromis ? undefined : 'trx-a-renseigner'}>{v.dateCompromis ? `Compromis signé le ${date(v.dateCompromis)}` : `Compromis signé le : ${A_RENSEIGNER}`}</span>
                <span data-date="butoir" className={c.depassee ? 'trx-depassee' : c.butoir === null ? 'trx-a-renseigner' : undefined}>
                  {c.butoir === null ? `Vente définitive au plus tard le : ${A_RENSEIGNER}` : `Vente définitive au plus tard le ${date(c.butoir)}${c.depassee ? ' — dépassée' : ''}`}</span>
              </span></dd></div>
            </dl>
          </section>
          {/* 🔴 LOT BJ (Arno) — les vendeurs et acquéreurs de la vente d'origine : un bouton par personne, sa fenêtre de détail, en lecture seule. */}
          {references.personneType === true && (v.dossier?.personnes ?? []).length > 0 && (
            <section className="trx-communes" aria-label="Vendeurs et acquéreurs" data-miroir-personnes>
              <h4>Vendeurs et acquéreurs</h4>
              {(['vendeur', 'acquereur'] as const).map((role) => {
                const gens = (v.dossier?.personnes ?? []).filter((p) => p.role === role);
                return gens.length === 0 ? null : <div key={role} className="trx-personnes-boutons" data-personnes-miroir={role}>
                  <span className="loc-muet">{role === 'vendeur' ? 'Vendeurs' : 'Acquéreurs'}</span>
                  {gens.map((p) => <BoutonPersonne key={p.id} p={p} />)}
                </div>;
              })}
            </section>
          )}
          <AlerteVentilation v={v} vue={v.societe} />
          <p className="loc-muet trx-miroir-note" data-miroir-lecture-seule>Ligne miroir : suit la vente d’origine ; seule la rémunération du négociateur se modifie ici.</p>
          {m.cotes.length === 0 ? <p className="loc-muet">Aucun négociateur de {LIBELLE_SOCIETE[v.societe]} sur cette vente.</p>
            : m.cotes.map((x) => <RemunerationCote key={x.cote} statutDuLibelle={statutDuLibelle} venteId={m.origineId} cote={x.cote} negociateur={x.negociateur} societe={v.societe} statut={x.statut}
              ventilation={ventilation[x.cote]}
              baseTtc={x.baseTtc} pct={m.pourcentage} ligne={v.lignes.find((l) => l.role === 'negociateur' && l.cote === x.cote)} commissionne={x.commissionne !== false}
              disponible={disponible && references.uniteCommission === true} onFait={onFait} />)}
        </div>
      </BlocReplie>
    </li>
  );
}

/**
 * 🔴 LOT R — LA RÉMUNÉRATION D'UN CÔTÉ : la valeur enregistrée (son unité, son équivalent), le calcul (taux × le CA que la vente apporte à
 * sa société) et, si la valeur saisie en diffère, « valeur saisie — calcul proposé : X € » et « Appliquer le calcul » (un geste humain,
 * journalisé : rien n'est jamais recalculé tout seul) ; « Modifier la rémunération » : le taux OU le montant (l'un recalcule l'autre).
 */
export function RemunerationCote({ venteId, cote, negociateur, societe, statut, baseTtc, pct, ligne, disponible, onFait, commissionne = true, statutDuLibelle, ventilation }: {
  /** 🔴 LOT AY — la ventilation de ce côté (part de l'agence de la société qui reçoit). */
  ventilation?: VentilationCote;
  /** LOT Y — le résolveur des libellés importés (la règle du cumul). */
  statutDuLibelle?: StatutDuLibelle;
  venteId: number; cote: 'entree' | 'sortie'; negociateur: string; societe: Societe; statut: Statut | null; baseTtc: number; pct: number | null;
  ligne: Vente['lignes'][number] | undefined; disponible: boolean; onFait: () => void;
  /** LOT S — faux : négociateur non commissionné (ni montant, ni calcul, ni « Appliquer le calcul ») ; absent : commissionné. */
  commissionne?: boolean;
}) {
  const r = remuneration(baseTtc, ligne);
  const [ouvert, setOuvert] = useState(false);
  // 🔴 LOT V — calculée : le champ suit le taux (proposé) ; saisie à la main : le montant enregistré, tel quel.
  const [champ, setChamp] = useState<MontantEcran>(() => r.saisie === null ? { texte: '', unite: 'ttc', auto: true, taux: texteTaux(r.taux) }
    : { texte: String(r.saisie.montant).replace('.', ','), unite: r.saisie.unite, taux: texteTaux(r.taux), ...(r.mode === 'calculee' ? { auto: true } : {}) });
  const [motif, setMotif] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const mot = cote === 'entree' ? 'entrée' : 'sortie';
  const propose = { pct: pct ?? 0, baseTtc, taux: tauxDe(champ), ttc: (baseTtc * tauxDe(champ)) / 100 };
  const envoyer = async (montant: { montant: number; unite: 'ht' | 'ttc' } | null, taux: number, mode: 'calculee' | 'manuelle'): Promise<void> => {
    setEnvoi(true); setMotif(null);
    const res = await posterTransaction({ action: 'commission-cote', id: venteId, cote, montant, taux, mode });
    setEnvoi(false);
    if (res === null) { setOuvert(false); onFait(); } else setMotif(res);
  };
  const appliquer = (x: Remuneration = r): Promise<void> => {
    const u = x.saisie?.unite ?? 'ttc';
    return envoyer({ montant: u === 'ttc' ? x.calculTtc : x.calculTtc / TVA, unite: u }, x.taux, 'calculee');
  };
  const valider = (): Promise<void> => {
    const e = montantEffectif(champ, propose);
    const x = Number(e.texte.replace(/[\s  €]/g, '').replace(',', '.'));
    return envoyer(e.texte.trim() === '' ? null : { montant: x, unite: e.unite }, tauxDe(champ), champ.auto === true ? 'calculee' : 'manuelle');
  };
  // 🔴 LOT AF (Arno) — « Négociateur de sortie » en titre, puis le négociateur (sa société), puis son statut à la vente — sur des lignes
  // distinctes ; « commission déduite / interne » n'est plus répété ici (le liseré de la commission le dit, accord d'Arno).
  const entete = <>
    <h5 className="trx-remuneration-titre" data-remuneration-titre={cote}>Négociateur de {mot}</h5>
    {/* LOT AG — son taux, comme sur le bouton de la carte de la porteuse (la même ligne : une seule valeur). */}
    <p className="trx-remuneration-ligne" data-remuneration-negociateur={cote}><strong>{negociateur}</strong> ({LIBELLE_SOCIETE[societe]}){commissionne ? ` · ${pctFr(r.taux)} %` : ' · non commissionné'}</p>
  </>;
  // 🔴 LOT AK (Arno) — sur la ligne miroir, « Statut à la vente : … » et « Honoraires reçus de [porteuse] » sont retirés (retrait autorisé par
  // Arno, ligne miroir seule) : le montant fait doublon avec « CA de [société] sur cette vente » juste au-dessus, et le statut reste lisible
  // dans la mention du cadre « Commission du négociateur ». Un non commissionné n'a pas ce cadre : son statut y restait — 🔴 LOT BE (Arno) : retiré
  // aussi (son nom est sur la ligne du négociateur ; un associé est nommé dans « Part de l'agence »).
  if (!commissionne) return (
    <div className="trx-remuneration" data-remuneration={cote}>
      {entete}
      {/* 🔴 LOT BA (Arno) — en tête, sans cadre : « Honoraires reçus de [porteuse] » (sa part reçue) ; les cadres dessous la totalisent. */}
      {ventilation !== undefined && <VentilationPartie x={ventilation} groupe="tete" />}
      {/* 🔴 LOT BE (retrait autorisé par Arno, annule le lot AK sur ce point) — plus de « Statut à la vente : … » ; le statut figé reste en base. */}
      <p className="loc-muet" data-non-commissionne={cote}>Non commissionné</p>
      {ventilation !== undefined && <VentilationPartie x={ventilation} groupe="vert" />}
    </div>
  );
  return (
    <div className="trx-remuneration" data-remuneration={cote}>
      {entete}
      {/* 🔴 LOT BA — en tête, sans cadre : « Honoraires reçus de [porteuse] ». LOT AZ — le cadre VERT (part de l'agence) au-dessus de la
          commission (verte si interne, rouge si indépendant). */}
      {ventilation !== undefined && <VentilationPartie x={ventilation} groupe="tete" />}
      {ventilation !== undefined && <VentilationPartie x={ventilation} groupe="vert" />}
      {/* 🔴 LOT T — les mêmes lignes de calcul que sous le bouton d'une carte ; LOT AK : sans « Honoraires reçus de … » (doublon du CA). */}
      <LignesCalcul cote={cote} premier="" honoraires={null} rem={r} enregistree occupe={!disponible || envoi} onAppliquer={(x) => void appliquer(x)} appliquerSiVide sansCadre={ventilation?.conserve != null}
        classe={classeDeCommission({ repartition: null }, ligne ?? { negociateur, cote, statut }, statutDuLibelle)}
        mention={mentionCommission(statutDeCommission({ repartition: null }, ligne ?? { negociateur, cote, statut }, statutDuLibelle))} />
      <button type="button" className="trx-bouton-lien" disabled={!disponible} onClick={() => setOuvert((o) => !o)} aria-expanded={ouvert} data-modifier-remuneration={cote}>Modifier la rémunération</button>
      {ouvert && (
        <div className="trx-choix-negociateur" role="group" aria-label={`Rémunération du négociateur de ${mot}`}>
          {/* 🔴 LOT AN — le sélecteur « HT | TTC » du bloc, synchronisé : il décide aussi de l'unité du champ. */}
          <div className="trx-form-affichage" data-affichage-panneau={`remuneration-${cote}`}><span className="loc-muet">Montants en</span><SelecteurAffichage /></div>
          <ChampMontantUnite mot="Rémunération" valeur={champ} onChange={setChamp} avecHt champ={`remuneration-${cote}`} propose={propose} />
          <div className="trx-actions">
            <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={envoi} onClick={() => void valider()} data-valider-remuneration={cote}>Valider</button>
            <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => { setOuvert(false); setMotif(null); }}>Fermer</button>
          </div>
        </div>
      )}
      {motif !== null && <p className="trx-erreur" role="alert">{motif}</p>}
    </div>
  );
}

// ── LOT G : l'annulation d'un compromis ──────────────────────────────────────────────────────────────────────────────────

/**
 * 🔴 LOT G — LA MODALE « ANNULATION » : le style de la modale de perte d'un mandat de gestion de la Location (`CSS_MODALE_ARCHIVAGE`,
 * mêmes classes, posée dans la racine du thème). Motif obligatoire (« Défaut de crédit » proposé, ou « Autre motif » écrit), date
 * (aujourd'hui par défaut), note facultative ; « Confirmer l'annulation » (rouge) et « Fermer ». Un refus laisse la saisie.
 */
function ModaleAnnulation({ vente, aujourdhui, onFermer, onFait }: { vente: Vente; aujourdhui: string; onFermer: () => void; onFait: () => void }) {
  const fermer = useRef<HTMLButtonElement | null>(null);
  const [sorte, setSorte] = useState<'defaut_credit' | 'autre'>('defaut_credit');
  const [autre, setAutre] = useState('');
  const [date, setDate] = useState(aujourdhui);
  const [note, setNote] = useState('');
  const [motif, setMotif] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  useEffect(() => {
    fermer.current?.focus();
    const touche = (e: KeyboardEvent): void => { if (e.key === 'Escape') onFermer(); };
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  }, [onFermer]);
  const confirmer = async (): Promise<void> => {
    if (sorte === 'autre' && autre.trim() === '') { setMotif('Écrivez le motif de l’annulation (« Autre motif »).'); return; }
    setEnvoi(true);
    const r = await posterTransaction({ action: 'compromis-annuler', id: vente.id, annulation: { motif: sorte, autre, date, note } });
    setEnvoi(false);
    if (r === null) onFait(); else setMotif(r);
  };
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="arc-voile" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onFermer(); }}>
      <style>{CSS_MODALE_ARCHIVAGE + CSS_ANNULATION}</style>
      <div className="arc-modale" role="dialog" aria-modal="true" aria-labelledby="trx-annulation-titre" data-modale-annulation={vente.id}>
        <h2 id="trx-annulation-titre" className="arc-titre">Annuler le compromis « {vente.libelle} »</h2>
        <div className="arc-corps">
          <p className="arc-intro">Le compromis sortira des compromis en cours et du prévisionnel ; il ne comptera dans aucun CA. Il restera consultable dans « Compromis annulés », d’où il se rétablit.</p>
          <fieldset className="trx-annulation-motif">
            <legend>Motif (obligatoire)</legend>
            <label className="trx-radio"><input type="radio" name="trx-motif" checked={sorte === 'defaut_credit'} onChange={() => setSorte('defaut_credit')} data-motif="defaut_credit" />Défaut de crédit</label>
            <label className="trx-radio"><input type="radio" name="trx-motif" checked={sorte === 'autre'} onChange={() => setSorte('autre')} data-motif="autre" />Autre motif</label>
            {sorte === 'autre' && <label className="trx-annulation-champ">Motif à saisir<input value={autre} onChange={(e) => setAutre(e.target.value)} required autoFocus data-motif-autre /></label>}
          </fieldset>
          <label className="trx-annulation-champ">Date de l’annulation<input type="date" value={date} onChange={(e) => setDate(e.target.value)} required data-date-annulation /></label>
          <label className="trx-annulation-champ">Note (facultative)<textarea value={note} onChange={(e) => setNote(e.target.value)} data-note-annulation /></label>
          {motif !== null && <p className="cp-refus trx-erreur" role="alert" data-motif-refus-annulation>{motif}</p>}
        </div>
        <div className="arc-pied">
          <button type="button" className="arc-confirmer" disabled={envoi} onClick={() => void confirmer()} data-confirmer-annulation>Confirmer l’annulation</button>
          <button type="button" className="svv-btn svv-btn-outline gst-btn arc-annuler" ref={fermer} onClick={onFermer}>Fermer</button>
        </div>
      </div>
    </div>,
    document.querySelector('.svv-adm-root') ?? document.body,
  );
}
const CSS_ANNULATION = `
.trx-annulation-motif{border:0;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.trx-annulation-motif legend{font-weight:800;margin-bottom:4px}
.trx-radio{display:flex;align-items:center;gap:10px;min-height:44px;font-weight:600;cursor:pointer}
.trx-radio input{width:22px;height:22px;accent-color:var(--color-svv-red)}
.trx-annulation-champ{display:flex;flex-direction:column;gap:4px;font-size:.85rem;font-weight:700;color:var(--color-svv-muted)}
.trx-annulation-champ input,.trx-annulation-champ textarea{min-height:44px;border:1px solid var(--color-svv-line-strong);border-radius:10px;padding:0 10px;font:inherit;font-weight:400;color:var(--color-svv-ink);background:var(--color-svv-surface)}
.trx-annulation-champ textarea{min-height:72px;padding:8px 10px}
`;

/** LOT G — « Compromis annulés (N) », replié sous la liste (LOT AT : rendu seulement s'il y en a au moins un) : motif, date, note ; « Rétablir le compromis » (journalisé). */
function CompromisAnnules({ annules, disponible, onFait, onMotif }: { annules: readonly Vente[]; disponible: boolean; onFait: () => void; onMotif: (m: string | null) => void }) {
  const retablir = async (id: number): Promise<void> => {
    const r = await posterTransaction({ action: 'compromis-retablir', id });
    onMotif(r);
    if (r === null) onFait();
  };
  return (
    <BlocReplie id="trx-compromis-annules" section="compromis-annules" titre={<>Compromis annulés ({annules.length})</>} resume="" chevronAGauche defilement={false}
      classe="tdb-section trx-annules" donnees={{ 'data-bloc': 'compromis-annules' }}>
      {annules.length > 0 && (
        <ul className="trx-cartes" data-liste-annules>
          {annules.map((v) => (
            <li key={v.id} className="trx-annule" data-compromis-annule={v.id}>
              <div className="trx-annule-tete"><strong>{v.libelle}</strong><span className="trx-carte-ht"><Montants disposition="ligne" ht={ht(v.honorairesTtc)} ttc={v.honorairesTtc} /></span></div>
              <p data-annulation-detail>Annulé le {date(v.annulation?.date)} — motif : <strong>{v.annulation?.motif}</strong></p>
              {v.annulation?.note && <p className="loc-muet" data-annulation-note>Note : {v.annulation.note}</p>}
              {/* 🔴 LOT R — une ligne miroir suit la vente d'origine : elle se rétablit avec elle, depuis la société porteuse. */}
              {v.miroir != null
                ? <p className="loc-muet" data-miroir-annule={v.miroir.origineId}>Ligne miroir : elle suit la vente d’origine. <a className="trx-lien" href={adresseOrigine(v.miroir.porteuse, v.miroir.origineId)} data-voir-origine={v.miroir.origineId}>Voir la vente d’origine</a></p>
                : <div className="trx-actions"><button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={!disponible} onClick={() => void retablir(v.id)}
                  data-retablir-compromis={v.id}>Rétablir le compromis</button></div>}
            </li>
          ))}
        </ul>
      )}
    </BlocReplie>
  );
}
