'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { bilanVente, ht, LIBELLE_SOCIETE, SOCIETES, sommeSocietes, TVA, type Societe, type Vente } from '../../../../lib/transaction/modele';
import { commissionDuCote, commissionneDuCote, partDuCote, remuneration, remunerationDuCote, resolveurDe, retroApporteurDe, statutDePartie, tuilesCompromis } from '../../../../lib/transaction/commissions';
import { classeCommission, libelleStatut, type Statut } from '../../../../lib/admin/statut';
import { libellePartie, partsParSociete, pourcentagesParSociete } from '../../../../lib/transaction/repartition';
import { eur, eurEtEquivalent, eurUnite, parametre, posterTransaction, useTransaction } from './commun';
import { corpsDossier, etatRepartitionDe, FormulaireDossier, type References } from './FormulaireDossier';
import { changerNegociateur, ChampMontantUnite, ChoixSocieteVente, choisirSocietePartie, etatSomme, montantEffectif, motifSocieteVente, propositionCommission, tauxDe, texteTaux,
  type EtatRepartition, type MontantEcran } from './Repartition';
import { LES_DEUX, LIBELLE_SOCIETE_COMPTE, type SocieteCompte } from '../../../../lib/transaction/societeNegociateur';
import { ListeChoix } from '../location/ListeChoix';
import { CSS_MODALE_ARCHIVAGE } from '../location/ModaleArchivage';
import { BlocReplie } from '../location/BlocReplie';
import { A_RENSEIGNER, carteCompromis, libelleTaux, trierCompromis } from '../../../../lib/transaction/compromisCarte';
import { Journal } from './FormulaireVente';

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
  const [edition, setEdition] = useState<{ vente: Vente; ajouter: 'vendeur' | 'acquereur' | null; repartition?: EtatRepartition; message?: string } | 'nouveau' | null>(null);
  // LOT G — la modale « Annulation » ouverte sur un compromis.
  const [annulation, setAnnulation] = useState<Vente | null>(null);
  const [acte, setActe] = useState<{ id: number; date: string } | null>(null);
  const [fait, setFait] = useState<{ id: number; libelle: string } | null>(null);
  const [motif, setMotif] = useState<string | null>(null);
  const [historique, setHistorique] = useState<number | null>(null);
  // 🔴 LOT R — « Voir la vente d'origine » (depuis une ligne miroir) : la carte visée (?vente=N) s'ouvre et vient à l'écran.
  const [venteVisee] = useState<number | null>(() => { const x = Number(parametre('vente')); return Number.isInteger(x) && x > 0 ? x : null; });
  useEffect(() => {
    if (venteVisee === null || lu.etat !== 'ok') return;
    document.querySelector(`[data-compromis="${venteVisee}"]`)?.scrollIntoView?.({ block: 'start' });
  }, [venteVisee, lu.etat]);
  // LOT I — le détail de la tuile « Commissions versées » : épinglé au toucher (ou au clic), montré au survol.
  const [detailEpingle, setDetailEpingle] = useState(false);
  const [detailSurvol, setDetailSurvol] = useState(false);
  if (lu.etat === 'charge') return <p className="gst-info" role="status">Chargement…</p>;
  if (lu.etat === 'erreur') return <p className="gst-erreur" role="alert">{lu.message}</p>;
  const d = lu.data;
  const vue: Societe | null = societe === 'tous' ? null : societe;
  // LOT E — la date butoir la plus proche d'abord ; les compromis sans date à la fin.
  const liste = trierCompromis(d.compromis);
  // 🔴 LOT I — les 4 tuiles, sur les compromis EN COURS (les annulés n'y sont pas), selon la répartition par société.
  const tu = tuilesCompromis(liste, vue, resolveurDe(d.statutsNegociateurs));
  const detail = detailEpingle || detailSurvol;
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
  return (
    <section className="tdb-section trx-onglet-compromis" aria-labelledby="trx-compromis-titre" data-onglet-compromis={societe}>
      <div className="trx-barre">
        <h3 id="trx-compromis-titre">Compromis en cours <span className="loc-pastille">{liste.length}</span></h3>
        {vue !== null && <div className="trx-actions"><button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={() => setEdition('nouveau')}
          disabled={!d.disponible} data-nouveau-compromis>+ Nouveau compromis</button></div>}
      </div>
      {!d.lotD && <p className="loc-alerte loc-alerte--orange" role="status" data-sans-434>Personnes, négociateurs d’entrée et de sortie et répartition : disponibles après la mise à jour de la base (migration 434).</p>}
      {/* 🔴 LOT I (Arno) — QUATRE TUILES, dans cet ordre : le nombre ; le CA (TTC en grand, en vert, HT en gris dessous ; la part de la société
          après répartition) ; les commissions versées (négociateurs + apporteurs : TTC en grand, en rouge, HT dessous, détail au toucher ou
          au survol) ; le solde net (CA HT − commissions HT, négatif tel quel). Le mot accompagne toujours la couleur. */}
      <ul className="tdb-tuiles trx-tuiles4" aria-label="Les compromis en cours" data-totaux-compromis>
        <li><div className="tdb-tuile" data-tuile="nombre"><span className="tdb-tuile-mot">Compromis en cours</span><strong className="tdb-tuile-valeur" data-nb-compromis>{tu.nb}</strong>
          <span className="tdb-tuile-n1">acte non signé, hors annulés</span></div></li>
        <li><div className="tdb-tuile" data-tuile="ca"><span className="tdb-tuile-mot">Chiffre d’affaires</span>
          <strong className="tdb-tuile-valeur trx-vert" data-ca-ttc>{eur(tu.caTtc)} <small>TTC</small></strong>
          <span className="trx-tuile-ht" data-ca-ht>{eur(tu.caHt)} HT</span>
          {/* 🔴 LOT R (Arno) — « CA de la vente » + « dont reversé en inter-cabinet » (remplace « part de la société après répartition »). */}
          {vue !== null
            ? <span className="tdb-tuile-n1" data-part-compromis={vue}>CA de la vente : {eur(tu.caHt)} HT · dont reversé en inter-cabinet : {eur(sommeSocietes(tu.interCabinetHt) + tu.exterieurHt)} HT
              {tu.recuHt > 0 && <> · dont reçu en inter-cabinet : {eur(tu.recuHt)} HT</>}</span>
            : <span className="tdb-tuile-n1" data-parts-compromis>{SOCIETES.map((s) => <span key={s} className="trx-tuile-part" data-part-compromis={s}>CA {LIBELLE_SOCIETE[s]} : {eur(tu.caSocieteHt[s])} HT</span>)
              .flatMap((x, i) => (i === 0 ? [x] : [<span key={`sep-${i}`} aria-hidden="true">{' · '}</span>, x]))}</span>}
          {vue === null && <span className="tdb-tuile-n1" data-neutralise-compromis>Inter-cabinet entre nos sociétés : {eur(tu.neutraliseHt)} HT (neutralisé)</span>}
          <span className="tdb-tuile-n1" data-commission-en-cours>sur {eur(tu.commissionTotaleHt)} HT de commission{tu.exterieurHt > 0 ? ` · dont inter-cabinet extérieur : ${eur(tu.exterieurHt)} HT` : ''}</span></div></li>
        <li><button type="button" className="tdb-tuile" data-tuile="commissions" aria-expanded={detail} onClick={() => setDetailEpingle((x) => !x)}
          onMouseEnter={() => setDetailSurvol(true)} onMouseLeave={() => setDetailSurvol(false)}
          title={`Indépendants : ${eur(tu.independantsHt)} HT · Apporteurs : ${eur(tu.apporteursHt)} HT${SOCIETES.filter((s) => tu.interCabinetHt[s] > 0).map((s) => ` · Inter-cabinet vers ${LIBELLE_SOCIETE[s]} : ${eur(tu.interCabinetHt[s])} HT`).join('')}${tu.exterieurHt > 0 ? ` · Inter-cabinet extérieur : ${eur(tu.exterieurHt)} HT` : ''} · Internes (associés, salariés) : ${eur(tu.internesHt)} HT — non déduits`}>
          <span className="tdb-tuile-mot">Commissions versées</span>
          <strong className="tdb-tuile-valeur trx-rouge" data-commissions-ttc>{eur(tu.commissionsTtc)} <small>TTC versées</small></strong>
          <span className="trx-tuile-ht" data-commissions-ht>{eur(tu.commissionsHt)} HT</span>
          {detail ? (
            <span className="trx-tuile-detail" data-detail-commissions>
              {/* 🔴 LOT P (Arno) — n'entrent que les INDÉPENDANTS et les APPORTEURS ; les internes et les statuts à renseigner, à part. */}
              <span data-detail="independants">Indépendants : {eur(tu.independantsHt)} HT <span className="trx-tuile-detail-n">({eur(tu.independantsHt * TVA)} TTC)</span></span>
              <span data-detail="apporteurs">Apporteurs : {eur(tu.apporteursHt)} HT <span className="trx-tuile-detail-n">({eur(tu.apporteursHt * TVA)} TTC)</span></span>
              {/* 🔴 LOT R — l'inter-cabinet versé par la société porteuse (à l'autre société, à l'extérieur) ; entre nos sociétés, neutralisé au global. */}
              {SOCIETES.filter((s) => tu.interCabinetHt[s] > 0).map((s) => <span key={s} data-detail={`inter-cabinet-${s}`}>Inter-cabinet vers {LIBELLE_SOCIETE[s]} : {eur(tu.interCabinetHt[s])} HT <span className="trx-tuile-detail-n">({eur(tu.interCabinetHt[s] * TVA)} TTC)</span></span>)}
              {tu.exterieurHt > 0 && <span data-detail="inter-cabinet-exterieur">Inter-cabinet extérieur : {eur(tu.exterieurHt)} HT <span className="trx-tuile-detail-n">({eur(tu.exterieurHt * TVA)} TTC)</span></span>}
              {tu.neutraliseHt > 0 && <span data-detail="inter-cabinet-neutralise" className="trx-tuile-detail-a-part">Inter-cabinet entre nos sociétés : {eur(tu.neutraliseHt)} HT — neutralisé</span>}
              <span data-detail="internes" className="trx-tuile-detail-a-part">Internes (associés, salariés) : {eur(tu.internesHt)} HT — non déduits</span>
              {tu.aRenseignerHt > 0 && <span data-detail="a-renseigner" className="trx-tuile-detail-a-part trx-alerte">Statut à renseigner : {eur(tu.aRenseignerHt)} HT — non déduits</span>}
            </span>
          ) : <span className="tdb-tuile-n1">indépendants + apporteurs + inter-cabinet — toucher pour le détail</span>}
        </button></li>
        {/* LOT L (Arno) — le Solde net : TTC en premier, en grand et en VERT (« TTC » écrit) ; HT dessous, en gris. */}
        <li><div className="tdb-tuile" data-tuile="solde"><span className="tdb-tuile-mot">Solde net</span>
          <strong className="tdb-tuile-valeur trx-vert" data-solde-ttc>{eur(tu.soldeTtc)} <small>TTC</small></strong>
          <span className="trx-tuile-ht" data-solde-ht>{eur(tu.soldeHt)} HT</span>
          <span className="tdb-tuile-n1">CA HT − commissions versées HT</span></div></li>
      </ul>
      {motif !== null && <p className="trx-erreur" role="alert">{motif}</p>}
      {fait !== null && (
        <p className="loc-alerte" role="status" data-acte-fait>Acte enregistré : « {fait.libelle} » est une vente encaissée au mois de l’acte.
          {' '}<button type="button" className="trx-bouton-lien" onClick={() => void revenir()} data-revenir-compromis>Revenir en compromis</button></p>
      )}
      {liste.length === 0 ? <p className="loc-muet">Aucun compromis en cours.</p> : (
        <ul className="trx-cartes" data-liste-compromis>
          {liste.map((v) => {
            // 🔴 LOT R — la LIGNE MIROIR de l'inter-cabinet : sa seule part, non modifiable d'ici (sauf la rémunération du négociateur).
            if (v.miroir != null) return <CarteMiroir key={`miroir-${v.id}`} v={v} references={d} aujourdhui={d.aujourdhui} disponible={d.disponible && d.lotD} onFait={relire} />;
            const r = v.repartition ?? null;
            const ps = r === null ? null : partsParSociete(r.parties, v.honorairesTtc, r.retroApporteurTtc);
            // LOT N — le % de la commission nette de chaque société et de la part extérieure (même format que les lignes des parties).
            const pcts = r === null || ps === null ? null : pourcentagesParSociete(r.parties, ps.netHt);
            const pct = (x: number): string => `${x.toLocaleString('fr-FR', { maximumFractionDigits: 4 })} %`;
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
                <span className="trx-commission trx-commission--ttc" data-carte="commission">{eur(c.commissionTtc)} <small>TTC</small></span>
                <span className="trx-carte-ht" data-carte="commission-ht">{eur(c.commissionHt)} HT</span>
                {c.pctPrix !== null && <span className="trx-carte-pct" data-carte="pct-prix">{c.pctPrix.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} % du prix</span>}
              </span>
            );
            const colonne = (role: 'vendeur' | 'acquereur', mot: string) => {
              const gens = (v.dossier?.personnes ?? []).filter((p) => p.role === role);
              return (
                <section className="trx-colonne" aria-label={mot} data-colonne={role}>
                  <h4>{mot}</h4>
                  {gens.length === 0 ? <p className="loc-muet" data-aucune-personne={role}>{role === 'vendeur' ? 'Aucun vendeur enregistré' : 'Aucun acquéreur enregistré'}</p> : (
                    <ul className="trx-personnes" data-personnes-compromis={role}>
                      {gens.map((p) => (
                        <li key={`${p.role}-${p.id}`}><strong>{p.nom}</strong>
                          <span>{p.telephone ? <a href={`tel:${p.telephone.replace(/\s/g, '')}`}>{p.telephone}</a> : <span className="trx-a-renseigner">téléphone {A_RENSEIGNER}</span>}</span>
                          <span>{p.email ? <a href={`mailto:${p.email}`}>{p.email}</a> : <span className="trx-a-renseigner">e-mail {A_RENSEIGNER}</span>}</span>
                          <span>{p.adresse ?? <span className="trx-a-renseigner">adresse {A_RENSEIGNER}</span>}</span></li>
                      ))}
                    </ul>
                  )}
                  <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setEdition({ vente: v, ajouter: role })} disabled={!d.disponible}
                    data-ajouter-personne-carte={role}>{role === 'vendeur' ? '+ Ajouter un vendeur' : '+ Ajouter un acquéreur'}</button>
                  {/* LOT G — le négociateur de ce côté : d'ENTRÉE du mandat chez les vendeurs, de SORTIE chez les acquéreurs (la même donnée que
                      « Négociateur d'entrée / de sortie » du formulaire et des informations communes). */}
                  <BoutonNegociateur v={v} cote={role === 'vendeur' ? 'entree' : 'sortie'} references={d} disponible={d.disponible && d.lotD} onFait={relire}
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
                    <div className="trx-colonnes">
                      {colonne('vendeur', 'Vendeurs')}
                      {colonne('acquereur', 'Acquéreurs')}
                    </div>
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
                            <span className={m === null ? 'trx-apporteur-montant trx-a-renseigner' : 'trx-apporteur-montant'} data-apporteur-montant>{m === null ? `montant ${A_RENSEIGNER}` : eurEtEquivalent(m)}</span></span>; })(), 'apporteur')}
                      </dl>
                      {r !== null && ps !== null ? (
                        <div data-repartition-compromis>
                        <p className="loc-muet trx-repartition-titre">Répartition — commission nette (après apporteur) : {eur(ps.netHt)} HT</p>
                        <table className="tdb-table trx-table-repartition" aria-label="Répartition de la commission">
                          <thead><tr><th scope="col">Partie</th><th scope="col">Société</th><th scope="col">%</th><th scope="col">€ HT</th></tr></thead>
                          <tbody>
                            {r.parties.map((p, i) => (
                              <tr key={i}><th scope="row">{libellePartie(p)}</th><td data-mot="Société">{p.societe === null ? 'extérieur' : LIBELLE_SOCIETE[p.societe]}</td>
                                <td data-mot="%">{p.pourcentage !== null ? `${p.pourcentage.toLocaleString('fr-FR', { maximumFractionDigits: 4 })} %` : `${(ps.netHt === 0 ? 0 : ((p.montantHt ?? 0) / ps.netHt) * 100).toLocaleString('fr-FR', { maximumFractionDigits: 4 })} %`}</td>
                                <td data-mot="€ HT">{eur(p.pourcentage !== null ? (ps.netHt * p.pourcentage) / 100 : p.montantHt ?? 0)}</td></tr>
                            ))}
                            {SOCIETES.map((s) => <tr key={s} className="tdb-fort"><th scope="row">Part {LIBELLE_SOCIETE[s]}</th><td data-mot="Société">{LIBELLE_SOCIETE[s]}</td>
                              <td data-mot="%" data-pct-societe-compromis={s}>{pcts === null ? '' : pct(pcts.societe[s])}</td>
                              <td data-mot="€ HT" data-part-societe-compromis={s}>{eur(ps.societe[s])} HT</td></tr>)}
                            {ps.exterieurHt > 0 && <tr><th scope="row">Part extérieure (inter-cabinet extérieur)</th><td data-mot="Société">extérieur</td>
                              <td data-mot="%" data-pct-exterieur-compromis>{pcts === null ? '' : pct(pcts.exterieur)}</td><td data-mot="€ HT">{eur(ps.exterieurHt)} HT</td></tr>}
                            {/* 🔴 LOT R (Arno) — la société PORTEUSE encaisse le CA de la vente ; la part de l'autre société et l'extérieur lui sont reversés. */}
                            {(() => {
                              const b = bilanVente(v, null);
                              const pv = bilanVente(v, b.porteuse);
                              return <>
                                <tr className="tdb-fort" data-ca-vente-compromis={b.porteuse}><th scope="row">CA de la vente — {LIBELLE_SOCIETE[b.porteuse]} (société porteuse)</th><td data-mot="Société">{LIBELLE_SOCIETE[b.porteuse]}</td>
                                  <td data-mot="%">100 %</td><td data-mot="€ HT">{eur(b.caHt)} HT</td></tr>
                                {SOCIETES.filter((s) => pv.verseHt[s] > 0).map((s) => <tr key={`ic-${s}`} data-reverse-compromis={s}><th scope="row">dont reversé en inter-cabinet vers {LIBELLE_SOCIETE[s]}</th>
                                  <td data-mot="Société">{LIBELLE_SOCIETE[s]}</td><td data-mot="%">{pcts === null ? '' : pct(pcts.societe[s])}</td><td data-mot="€ HT">{eur(pv.verseHt[s])} HT</td></tr>)}
                                {pv.exterieurHt > 0 && <tr data-reverse-compromis="exterieur"><th scope="row">dont reversé en inter-cabinet extérieur</th><td data-mot="Société">extérieur</td>
                                  <td data-mot="%">{pcts === null ? '' : pct(pcts.exterieur)}</td><td data-mot="€ HT">{eur(pv.exterieurHt)} HT</td></tr>}
                              </>;
                            })()}
                          </tbody>
                        </table>
                        </div>
                      ) : <p className="loc-muet">Répartition : toute la commission à {LIBELLE_SOCIETE[v.societe]} (historique, avant la répartition entre parties).</p>}
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
      <div className="trx-espace-annules" />
      <CompromisAnnules annules={d.annules ?? []} disponible={d.disponible && d.annulation === true} onFait={relire} onMotif={setMotif} />
      {annulation !== null && <ModaleAnnulation vente={annulation} aujourdhui={d.aujourdhui} onFermer={() => setAnnulation(null)}
        onFait={() => { setAnnulation(null); relire(); }} />}
      {edition !== null && <FormulaireDossier societe={edition === 'nouveau' ? societeSaisie : edition.vente.societe} vente={edition === 'nouveau' ? null : edition.vente}
        ajouter={edition === 'nouveau' ? null : edition.ajouter} repartitionInitiale={edition === 'nouveau' ? undefined : edition.repartition}
        message={edition === 'nouveau' ? undefined : edition.message}
        references={d} onFermer={() => setEdition(null)} onFait={() => { setEdition(null); relire(); }} />}
    </section>
  );
}

// ── LOT G : le négociateur d'un côté, depuis la carte ────────────────────────────────────────────────────────────────────

/** Le dossier d'un compromis tel qu'il est, prêt à renvoyer avec un seul changement (les mêmes champs que « Modifier »). */
const champsDe = (v: Vente) => ({ libelle: v.libelle, commission: String(v.honorairesTtc), dateCompromis: v.dateCompromis ?? '', dateActePrevue: v.dossier?.dateActePrevue ?? '',
  dateActe: '', adresseBien: v.dossier?.adresseBien ?? '', note: v.note ?? '', prixVente: v.prixVente == null ? '' : String(v.prixVente) });
const personnesDe = (v: Vente) => (v.dossier?.personnes ?? []).map((p) => ({ id: p.id, role: p.role, nom: p.nom, telephone: p.telephone ?? '', email: p.email ?? '', adresse: p.adresse ?? '' }));

/**
 * 🔴 LOT G — « + Ajouter un négociateur » : dans « Vendeurs », le négociateur d'ENTRÉE du mandat ; dans « Acquéreurs », celui de SORTIE.
 * Un clic ouvre la liste des comptes actifs (avec leur société, « ⚠ société à renseigner dans Comptes » si elle manque) ; « Valider »
 * l'enregistre par le même geste que « Modifier » (journalisé, « Annuler » dans l'historique). Choisi, le bouton dit « Négociateur :
 * Prénom NOM (société) » et se rouvre pour le changer ou le retirer. La répartition suit les règles existantes ; si elle ne fait plus
 * 100 % (une partie extérieure), rien n'est enregistré : le formulaire s'ouvre pour la revoir, avec le message.
 * LOT I (437) — la COMMISSION VERSÉE à ce négociateur se saisit ici aussi (montant, « HT / TTC » au choix), enregistrée avec lui ; sous le
 * bouton, la commission enregistrée dans son unité et son équivalent.
 */
function BoutonNegociateur({ v, cote, references, disponible, onFait, onRevoir }: {
  v: Vente; cote: 'entree' | 'sortie'; references: References; disponible: boolean; onFait: () => void; onRevoir: (r: EtatRepartition, message: string) => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const actuel = cote === 'entree' ? v.dossier?.entree ?? null : v.dossier?.sortie ?? null;
  const [choix, setChoix] = useState<string>(actuel === null ? '' : String(actuel.id));
  const [motif, setMotif] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const avecUnite = references.uniteCommission === true;
  const enregistree = commissionDuCote(v, cote);
  const partieDuCote = actuel === null ? undefined : v.repartition?.parties.find((p) => p.compteId === actuel.id && (cote === 'entree' ? ['entree', 'entree_sortie'] : ['sortie', 'entree_sortie']).includes(p.sorte));
  // LOT J — sa part de la vente dans la répartition enregistrée (relue après chaque enregistrement) ; sans répartition : rien.
  const part = partDuCote(v, cote);
  const base = etatRepartitionDe(v, references.negociateurs, avecUnite);
  const initiale: MontantEcran = base.commissions?.[cote] ?? { texte: '', unite: 'ttc' };
  const [commission, setCommission] = useState<MontantEcran>(initiale);
  // La société affichée : celle de SA partie sur cette vente (côté de ce bouton d'abord) ; à défaut, celle de son compte.
  const sortes = cote === 'entree' ? ['entree', 'entree_sortie'] : ['sortie', 'entree_sortie'];
  const societeVente = (id: number): Societe | null => v.repartition?.parties.find((p) => p.compteId === id && p.societe !== null && sortes.includes(p.sorte))?.societe
    ?? v.repartition?.parties.find((p) => p.compteId === id && p.societe !== null)?.societe ?? null;
  const societe = (id: number): SocieteCompte | null => societeVente(id) ?? references.negociateurs.find((n) => n.id === id)?.societe ?? null;
  const libelleSociete = (s: SocieteCompte | null): string => (s === null ? '⚠ société à renseigner dans Comptes' : LIBELLE_SOCIETE_COMPTE[s]);
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
  const propose = propositionCommission(hypothese, cote, v.honorairesTtc);
  const enregistrer = async (id: number | null): Promise<void> => {
    setMotif(null);
    if (id !== null && desDeux && societeChoisie === null) {
      setMotif(`${references.negociateurs.find((n) => n.id === id)?.nom ?? 'Ce négociateur'} travaille pour CRITERIMMO et pour MACJ : choisissez pour quelle société il travaille sur cette vente. Rien n’a été enregistré.`);
      return;
    }
    // « Valider » valide la proposition affichée de CE côté ; celle de l'autre côté (non validée) ne part jamais.
    const saisie = montantEffectif(commission, propose);
    const memeCommission = saisie.texte === initiale.texte && saisie.unite === initiale.unite;
    const memeSociete = !desDeux || societeChoisie === societeInitiale;
    if ((actuel?.id ?? null) === id && (!avecUnite || memeCommission) && memeSociete) { setOuvert(false); return; }
    const change = (actuel?.id ?? null) === id ? base : changerNegociateur(base, cote, id, references.negociateurs);
    const autre = cote === 'entree' ? 'sortie' : 'entree';
    const sansAutreProposee = change.commissions != null && change.commissions[autre].auto === true
      ? { ...change, commissions: { ...change.commissions, [autre]: { texte: '', unite: change.commissions[autre].unite } } } : change;
    const avecCommission: EtatRepartition = sansAutreProposee.commissions != null && id !== null
      ? { ...sansAutreProposee, commissions: { ...sansAutreProposee.commissions, [cote]: { texte: saisie.texte, unite: saisie.unite, ...(commission.taux !== undefined ? { taux: commission.taux } : {}) } } } : sansAutreProposee;
    const etat = id !== null && desDeux && societeChoisie !== null ? choisirSocietePartie(avecCommission, cote === 'entree' ? 0 : 1, societeChoisie) : avecCommission;
    const manque = motifSocieteVente(etat, references.negociateurs);
    if (manque !== null) { setOuvert(false); onRevoir(etat, manque); return; }
    const somme = etatSomme(etat, v.honorairesTtc);
    if (somme.motif !== null) { setOuvert(false); onRevoir(etat, `Le négociateur de ${mot} a changé : la répartition est à revoir. ${somme.motif}`); return; }
    setEnvoi(true);
    const r = await posterTransaction({ action: 'dossier-enregistrer', id: v.id, dossier: corpsDossier(v.societe, 'compromis', champsDe(v), personnesDe(v), etat) });
    setEnvoi(false);
    if (r === null) { setOuvert(false); onFait(); } else setMotif(r);
  };
  return (
    <div className="trx-negociateur-carte" data-negociateur-cote={cote}>
      <button type="button" className="svv-btn svv-btn-outline gst-btn trx-btn-large" onClick={() => setOuvert((o) => !o)} disabled={!disponible} aria-expanded={ouvert}
        data-negociateur-carte={cote}>{actuel === null ? '+ Ajouter un négociateur' : `Négociateur : ${actuel.nom} (${libelleSociete(societe(actuel.id))})${part === null ? '' : ` (${part.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %)`}`}</button>
      {/* 🔴 LOT S (Arno) — non commissionné : « Non commissionné » à la place de la commission (rien d'autre : ni montant, ni calcul) ; les
          montants déjà saisis restent en base, consultables dans « Historique » (accord d'Arno pour ne plus les afficher sur la carte). */}
      {actuel !== null && actuelNonCommissionne && <span className="loc-muet trx-negociateur-commission" data-non-commissionne={cote}>Non commissionné</span>}
      {actuel !== null && avecUnite && !actuelNonCommissionne && (
        <span className={enregistree === null ? 'loc-muet trx-negociateur-commission trx-a-renseigner' : 'trx-negociateur-commission'} data-commission-carte={cote}>
          {enregistree === null ? `Commission versée : ${A_RENSEIGNER}` : `Commission versée : ${eurUnite(enregistree.montant)}`}</span>
      )}
      {/* 🔴 LOT R — la valeur saisie n'est jamais recalculée seule : si elle diffère du calcul (taux × sa part), le calcul proposé et « Appliquer le calcul ». */}
      {actuel !== null && avecUnite && !actuelNonCommissionne && (() => {
        const rem = remunerationDuCote(v, cote);
        if (rem === null || !rem.ecart || rem.saisie === null) return null;
        const u = rem.saisie.unite;
        return <span className="trx-negociateur-commission trx-ecart-calcul" data-ecart-remuneration={cote}>
          <span className="trx-alerte">valeur saisie — calcul proposé : {eur(rem.calculTtc)} TTC ({rem.taux.toLocaleString('fr-FR', { maximumFractionDigits: 4 })} % × {eur(rem.baseTtc)} TTC)</span>
          <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={!disponible || envoi} data-appliquer-calcul-carte={cote}
            onClick={() => { setEnvoi(true); void posterTransaction({ action: 'commission-cote', id: v.id, cote, montant: { montant: u === 'ttc' ? rem.calculTtc : rem.calculTtc / TVA, unite: u }, taux: rem.taux })
              .then((x) => { setEnvoi(false); if (x === null) onFait(); else setMotif(x); }); }}>Appliquer le calcul</button></span>;
      })()}
      {/* 🔴 LOT P — son statut À LA DATE DE LA VENTE (figé ; à défaut, celui de son compte, « à confirmer ») et ce qu'il devient dans le cumul. */}
      {actuel !== null && partieDuCote !== undefined && (() => {
        const st = statutDePartie(partieDuCote);
        const classe = classeCommission(st);
        return <span className={classe === 'a_renseigner' ? 'loc-muet trx-negociateur-commission trx-alerte' : 'loc-muet trx-negociateur-commission'} data-statut-vente={cote}>
          Statut à la vente : {libelleStatut(st)}{partieDuCote.statut == null ? (st !== null ? ' (statut actuel du compte)' : ' (à confirmer)') : ''}
          {actuelNonCommissionne ? '' : classe === 'independant' ? ' — commission déduite' : classe === 'interne' ? ' — commission interne, non déduite' : ' — commission non déduite'}</span>;
      })()}
      {ouvert && (
        <div className="trx-choix-negociateur" role="group" aria-label={`Négociateur de ${mot} du mandat`} data-choix-negociateur={cote}>
          <label>Négociateur de {mot} du mandat
            <ListeChoix options={references.negociateurs.map((n) => ({ id: n.id, libelle: `${n.nom} — ${libelleSociete(n.societe)}` }))} valeur={choix} vide="— à choisir —"
              libelle={`Négociateur de ${mot} du mandat`} onChange={(x) => { setChoix(x); setSocieteChoisie(actuel !== null && x === String(actuel.id) ? societeVente(actuel.id) : null); }}
              donnees={{ 'data-liste-negociateur': cote }} recherche={{ placeholder: 'Rechercher un négociateur' }} /></label>
          {desDeux && <ChoixSocieteVente valeur={societeChoisie} onChoisir={(s) => { setSocieteChoisie(s); setMotif(null); }} cle={`carte-${cote}`} />}
          {choisiNonCommissionne ? <span className="loc-muet" data-non-commissionne-choix={cote}>Non commissionné</span>
            : avecUnite ? <ChampMontantUnite mot="Commission versée" valeur={commission} onChange={setCommission} avecHt champ={`commission-carte-${cote}`} propose={propose} />
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

// ── 🔴 LOT R : la ligne miroir de l'inter-cabinet, et la rémunération d'un côté ─────────────────────────────────────────────────

/** L'adresse de la vente d'origine (chez la société porteuse), carte dépliée. */
export const adresseOrigine = (porteuse: Societe, id: number): string => `/admin/transaction/${porteuse}?vente=${id}`;

/**
 * 🔴 LOT R (Arno) — LA CARTE D'UNE LIGNE MIROIR : « … — inter-cabinet reçu de CRITERIMMO / MACJ », sa SEULE part en tête (TTC en grand,
 * HT dessous) — jamais le montant de la vente ni la commission totale. Non modifiable d'ici : « Voir la vente d'origine » ; seule la
 * rémunération de son négociateur se modifie (elle s'enregistre sur la vente d'origine, sans doublon).
 */
function CarteMiroir({ v, references, aujourdhui, disponible, onFait }: { v: Vente; references: References; aujourdhui: string; disponible: boolean; onFait: () => void }) {
  const m = v.miroir!;
  const c = carteCompromis(v, aujourdhui);
  const pctTexte = m.pourcentage === null ? null : `${m.pourcentage.toLocaleString('fr-FR', { maximumFractionDigits: 4 })} %`;
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
      <span className="trx-commission trx-commission--ttc" data-carte="commission">{eur(v.honorairesTtc)} <small>TTC</small></span>
      <span className="trx-carte-ht" data-carte="commission-ht">{eur(m.partHt)} HT</span>
      <span className="trx-carte-pct" data-carte="inter-cabinet">inter-cabinet reçu</span>
    </span>
  );
  return (
    <li data-compromis={v.id} data-miroir={m.origineId}>
      <BlocReplie id={`trx-miroir-${v.id}`} section={`miroir-${v.id}`} titre={titre} resume={droite} chevronAGauche defilement={false} classe="trx-carte trx-carte--miroir"
        donnees={{ 'data-carte-miroir': String(m.origineId) }}>
        <div className="trx-carte-detail">
          <p data-miroir-explication>Inter-cabinet reçu de <strong>{LIBELLE_SOCIETE[m.porteuse]}</strong> (société porteuse) sur la vente « {m.libelleOrigine} » : la part de {LIBELLE_SOCIETE[v.societe]},
            {' '}{eur(v.honorairesTtc)} TTC ({eur(m.partHt)} HT){pctTexte === null ? '' : `, ${pctTexte} de la commission nette`} — c’est le CA de {LIBELLE_SOCIETE[v.societe]} sur cette vente.</p>
          <p className="loc-muet" data-miroir-lecture-seule>Ligne miroir : elle suit la vente d’origine (compromis, acte signé, annulation, répartition) et ne se modifie pas d’ici, sauf la rémunération du négociateur.
            {' '}<a className="trx-lien" href={adresseOrigine(m.porteuse, m.origineId)} data-voir-origine={m.origineId}>Voir la vente d’origine</a></p>
          <dl className="trx-grille">
            <div className="trx-info" data-info="dates"><dt>Dates</dt><dd><span className="trx-dates">
              <span data-date="compromis" className={v.dateCompromis ? undefined : 'trx-a-renseigner'}>{v.dateCompromis ? `Compromis signé le ${date(v.dateCompromis)}` : `Compromis signé le : ${A_RENSEIGNER}`}</span>
              <span data-date="butoir" className={c.depassee ? 'trx-depassee' : c.butoir === null ? 'trx-a-renseigner' : undefined}>
                {c.butoir === null ? `Vente définitive au plus tard le : ${A_RENSEIGNER}` : `Vente définitive au plus tard le ${date(c.butoir)}${c.depassee ? ' — dépassée' : ''}`}</span>
            </span></dd></div>
          </dl>
          {m.cotes.length === 0 ? <p className="loc-muet">Aucun négociateur de {LIBELLE_SOCIETE[v.societe]} sur cette vente.</p>
            : m.cotes.map((x) => <RemunerationCote key={x.cote} venteId={m.origineId} cote={x.cote} negociateur={x.negociateur} societe={v.societe} statut={x.statut}
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
export function RemunerationCote({ venteId, cote, negociateur, societe, statut, baseTtc, pct, ligne, disponible, onFait, commissionne = true }: {
  venteId: number; cote: 'entree' | 'sortie'; negociateur: string; societe: Societe; statut: Statut | null; baseTtc: number; pct: number | null;
  ligne: Vente['lignes'][number] | undefined; disponible: boolean; onFait: () => void;
  /** LOT S — faux : négociateur non commissionné (ni montant, ni calcul, ni « Appliquer le calcul ») ; absent : commissionné. */
  commissionne?: boolean;
}) {
  const r = remuneration(baseTtc, ligne);
  const [ouvert, setOuvert] = useState(false);
  const [champ, setChamp] = useState<MontantEcran>(() => r.saisie === null ? { texte: '', unite: 'ttc', auto: true, taux: texteTaux(r.taux) }
    : { texte: String(r.saisie.montant).replace('.', ','), unite: r.saisie.unite, taux: texteTaux(r.taux) });
  const [motif, setMotif] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const mot = cote === 'entree' ? 'entrée' : 'sortie';
  const classe = classeCommission(statut);
  const propose = { pct: pct ?? 0, baseTtc, taux: tauxDe(champ), ttc: (baseTtc * tauxDe(champ)) / 100 };
  const envoyer = async (montant: { montant: number; unite: 'ht' | 'ttc' } | null, taux: number): Promise<void> => {
    setEnvoi(true); setMotif(null);
    const res = await posterTransaction({ action: 'commission-cote', id: venteId, cote, montant, taux });
    setEnvoi(false);
    if (res === null) { setOuvert(false); onFait(); } else setMotif(res);
  };
  const appliquer = (): Promise<void> => {
    const u = r.saisie?.unite ?? 'ttc';
    return envoyer({ montant: u === 'ttc' ? r.calculTtc : r.calculTtc / TVA, unite: u }, r.taux);
  };
  const valider = (): Promise<void> => {
    const e = montantEffectif(champ, propose);
    const x = Number(e.texte.replace(/[\s  €]/g, '').replace(',', '.'));
    return envoyer(e.texte.trim() === '' ? null : { montant: x, unite: e.unite }, tauxDe(champ));
  };
  if (!commissionne) return (
    <div className="trx-remuneration" data-remuneration={cote}>
      <p><strong>Négociateur de {mot} : {negociateur}</strong> ({LIBELLE_SOCIETE[societe]}) — statut à la vente : {libelleStatut(statut)}</p>
      <p className="loc-muet" data-non-commissionne={cote}>Non commissionné</p>
    </div>
  );
  return (
    <div className="trx-remuneration" data-remuneration={cote}>
      <p><strong>Négociateur de {mot} : {negociateur}</strong> ({LIBELLE_SOCIETE[societe]}) — statut à la vente : {libelleStatut(statut)}
        {classe === 'independant' ? ' — commission déduite' : classe === 'interne' ? ' — commission interne, non déduite' : ' — commission non déduite'}</p>
      <p data-remuneration-saisie={cote} className={r.saisie === null ? 'trx-a-renseigner' : undefined}>Rémunération : {r.saisie === null ? A_RENSEIGNER : eurUnite(r.saisie)}</p>
      <p className="loc-muet" data-remuneration-calcul={cote}>Calcul : {r.taux.toLocaleString('fr-FR', { maximumFractionDigits: 4 })} % × {eur(r.baseTtc)} TTC (CA que la vente apporte à {LIBELLE_SOCIETE[societe]}) = {eur(r.calculTtc)} TTC</p>
      {(r.ecart || r.saisie === null) && (
        <p className="trx-ecart-calcul" data-ecart-remuneration={cote}>
          {r.ecart && <span className="trx-alerte">valeur saisie — calcul proposé : {eur(r.calculTtc)} TTC</span>}
          <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={!disponible || envoi} onClick={() => void appliquer()} data-appliquer-calcul-carte={cote}>Appliquer le calcul</button>
        </p>
      )}
      <button type="button" className="trx-bouton-lien" disabled={!disponible} onClick={() => setOuvert((o) => !o)} aria-expanded={ouvert} data-modifier-remuneration={cote}>Modifier la rémunération</button>
      {ouvert && (
        <div className="trx-choix-negociateur" role="group" aria-label={`Rémunération du négociateur de ${mot}`}>
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

/** LOT G — « Compromis annulés (N) », replié en bas de l'onglet : motif, date, note ; « Rétablir le compromis » (journalisé). */
function CompromisAnnules({ annules, disponible, onFait, onMotif }: { annules: readonly Vente[]; disponible: boolean; onFait: () => void; onMotif: (m: string | null) => void }) {
  const retablir = async (id: number): Promise<void> => {
    const r = await posterTransaction({ action: 'compromis-retablir', id });
    onMotif(r);
    if (r === null) onFait();
  };
  return (
    <BlocReplie id="trx-compromis-annules" section="compromis-annules" titre={<>Compromis annulés ({annules.length})</>} resume="" chevronAGauche defilement={false}
      classe="tdb-section trx-annules" donnees={{ 'data-bloc': 'compromis-annules' }}>
      {annules.length === 0 ? <p className="loc-muet">Aucun compromis annulé.</p> : (
        <ul className="trx-cartes" data-liste-annules>
          {annules.map((v) => (
            <li key={v.id} className="trx-annule" data-compromis-annule={v.id}>
              <div className="trx-annule-tete"><strong>{v.libelle}</strong><span className="trx-carte-ht">{eur(v.honorairesTtc)} TTC · {eur(ht(v.honorairesTtc))} HT</span></div>
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
