'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ht, LIBELLE_SOCIETE, SOCIETES, TVA, type Societe, type Vente } from '../../../../lib/transaction/modele';
import { commissionDuCote, retroApporteurDe, tuilesCompromis } from '../../../../lib/transaction/commissions';
import { libellePartie, partsParSociete } from '../../../../lib/transaction/repartition';
import { eur, eurUnite, posterTransaction, useTransaction } from './commun';
import { corpsDossier, etatRepartitionDe, FormulaireDossier, type References } from './FormulaireDossier';
import { changerNegociateur, ChampMontantUnite, etatSomme, type EtatRepartition, type MontantEcran } from './Repartition';
import { ListeChoix } from '../location/ListeChoix';
import { CSS_MODALE_ARCHIVAGE } from '../location/ModaleArchivage';
import { BlocReplie } from '../location/BlocReplie';
import { A_RENSEIGNER, carteCompromis, trierCompromis } from '../../../../lib/transaction/compromisCarte';
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
  annules?: Vente[] }
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
  const tu = tuilesCompromis(liste, vue);
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
          {vue !== null
            ? <span className="tdb-tuile-n1" data-part-compromis={vue}>Part {LIBELLE_SOCIETE[vue]} : part de la société après répartition</span>
            : <span className="tdb-tuile-n1" data-parts-compromis>{SOCIETES.map((s) => <span key={s} className="trx-tuile-part" data-part-compromis={s}>Part {LIBELLE_SOCIETE[s]} : {eur(tu.partHt[s])} HT</span>)
              .flatMap((x, i) => (i === 0 ? [x] : [<span key={`sep-${i}`} aria-hidden="true">{' · '}</span>, x]))}</span>}
          <span className="tdb-tuile-n1" data-commission-en-cours>sur {eur(tu.commissionTotaleHt)} HT de commission{tu.exterieurHt > 0 ? ` · parts extérieures (hors CA) : ${eur(tu.exterieurHt)} HT` : ''}</span></div></li>
        <li><button type="button" className="tdb-tuile" data-tuile="commissions" aria-expanded={detail} onClick={() => setDetailEpingle((x) => !x)}
          onMouseEnter={() => setDetailSurvol(true)} onMouseLeave={() => setDetailSurvol(false)}
          title={`Négociateurs : ${eur(tu.negociateursHt)} HT · Apporteurs : ${eur(tu.apporteursHt)} HT`}>
          <span className="tdb-tuile-mot">Commissions versées</span>
          <strong className="tdb-tuile-valeur trx-rouge" data-commissions-ttc>{eur(tu.commissionsTtc)} <small>TTC versées</small></strong>
          <span className="trx-tuile-ht" data-commissions-ht>{eur(tu.commissionsHt)} HT</span>
          {detail ? (
            <span className="trx-tuile-detail" data-detail-commissions>
              <span data-detail="negociateurs">Négociateurs : {eur(tu.negociateursHt)} HT <span className="trx-tuile-detail-n">({eur(tu.negociateursHt * TVA)} TTC)</span></span>
              <span data-detail="apporteurs">Apporteurs : {eur(tu.apporteursHt)} HT <span className="trx-tuile-detail-n">({eur(tu.apporteursHt * TVA)} TTC)</span></span>
            </span>
          ) : <span className="tdb-tuile-n1">négociateurs + apporteurs — toucher pour le détail</span>}
        </button></li>
        <li><div className="tdb-tuile" data-tuile="solde"><span className="tdb-tuile-mot">Solde net</span>
          <strong className="tdb-tuile-valeur" data-solde-ht>{eur(tu.soldeHt)} <small>HT</small></strong>
          <span className="trx-tuile-ht" data-solde-ttc>{eur(tu.soldeTtc)} TTC</span>
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
            const r = v.repartition ?? null;
            const ps = r === null ? null : partsParSociete(r.parties, v.honorairesTtc, r.retroApporteurTtc);
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
                  donnees={{ 'data-carte-compromis': String(v.id) }}>
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
                        {info('Taux de commission', c.pctPrix === null ? A_RENSEIGNER
                          : `${c.pctPrix.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} % du prix de vente`, 'taux')}
                        {info('Date du compromis', date(v.dateCompromis), 'date-compromis')}
                        {/* LOT I — la rétrocession dans SON unité, avec son équivalent (« 500,00 € HT (soit 600,00 € TTC) »). */}
                        {info('Apporteur', <>{ouManque(v.apporteur)}{(() => { const m = retroApporteurDe(v) ?? (r !== null && r.retroApporteurTtc > 0 ? { montant: r.retroApporteurTtc, unite: 'ttc' as const } : null);
                          return m === null ? '' : ` · rétrocession ${eurUnite(m)}`; })()}</>, 'apporteur')}
                      </dl>
                      {r !== null && ps !== null ? (
                        <div data-repartition-compromis>
                        <p className="loc-muet trx-repartition-titre">Répartition — commission nette (après apporteur) : {eur(ps.netHt)} HT</p>
                        <table className="tdb-table trx-table-repartition" aria-label="Répartition de la commission">
                          <thead><tr><th scope="col">Partie</th><th scope="col">Société</th><th scope="col">%</th><th scope="col">€ HT</th></tr></thead>
                          <tbody>
                            {r.parties.map((p, i) => (
                              <tr key={i}><th scope="row">{libellePartie(p)}</th><td data-mot="Société">{p.societe === null ? 'hors CA' : LIBELLE_SOCIETE[p.societe]}</td>
                                <td data-mot="%">{p.pourcentage !== null ? `${p.pourcentage.toLocaleString('fr-FR', { maximumFractionDigits: 4 })} %` : `${(ps.netHt === 0 ? 0 : ((p.montantHt ?? 0) / ps.netHt) * 100).toLocaleString('fr-FR', { maximumFractionDigits: 4 })} %`}</td>
                                <td data-mot="€ HT">{eur(p.pourcentage !== null ? (ps.netHt * p.pourcentage) / 100 : p.montantHt ?? 0)}</td></tr>
                            ))}
                            {SOCIETES.map((s) => <tr key={s} className="tdb-fort"><th scope="row">Part {LIBELLE_SOCIETE[s]}</th><td data-mot="Société">{LIBELLE_SOCIETE[s]}</td><td data-mot="%" />
                              <td data-mot="€ HT" data-part-societe-compromis={s}>{eur(ps.societe[s])} HT</td></tr>)}
                            {ps.exterieurHt > 0 && <tr><th scope="row">Part extérieure (hors CA)</th><td data-mot="Société">hors CA</td><td data-mot="%" /><td data-mot="€ HT">{eur(ps.exterieurHt)} HT</td></tr>}
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
  const base = etatRepartitionDe(v, references.negociateurs, avecUnite);
  const initiale: MontantEcran = base.commissions?.[cote] ?? { texte: '', unite: 'ht' };
  const [commission, setCommission] = useState<MontantEcran>(initiale);
  const societe = (id: number): Societe | null => v.repartition?.parties.find((p) => p.compteId === id && p.societe !== null)?.societe
    ?? references.negociateurs.find((n) => n.id === id)?.societe ?? null;
  const libelleSociete = (s: Societe | null): string => (s === null ? '⚠ société à renseigner dans Comptes' : LIBELLE_SOCIETE[s]);
  const mot = cote === 'entree' ? 'entrée' : 'sortie';
  const enregistrer = async (id: number | null): Promise<void> => {
    setMotif(null);
    const memeCommission = commission.texte === initiale.texte && commission.unite === initiale.unite;
    if ((actuel?.id ?? null) === id && (!avecUnite || memeCommission)) { setOuvert(false); return; }
    const change = (actuel?.id ?? null) === id ? base : changerNegociateur(base, cote, id, references.negociateurs);
    const etat: EtatRepartition = change.commissions != null && id !== null ? { ...change, commissions: { ...change.commissions, [cote]: commission } } : change;
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
        data-negociateur-carte={cote}>{actuel === null ? '+ Ajouter un négociateur' : `Négociateur : ${actuel.nom} (${libelleSociete(societe(actuel.id))})`}</button>
      {actuel !== null && avecUnite && (
        <span className={enregistree === null ? 'loc-muet trx-negociateur-commission trx-a-renseigner' : 'trx-negociateur-commission'} data-commission-carte={cote}>
          {enregistree === null ? `Commission versée : ${A_RENSEIGNER}` : `Commission versée : ${eurUnite(enregistree.montant)}`}</span>
      )}
      {ouvert && (
        <div className="trx-choix-negociateur" role="group" aria-label={`Négociateur de ${mot} du mandat`} data-choix-negociateur={cote}>
          <label>Négociateur de {mot} du mandat
            <ListeChoix options={references.negociateurs.map((n) => ({ id: n.id, libelle: `${n.nom} — ${libelleSociete(n.societe)}` }))} valeur={choix} vide="— à choisir —"
              libelle={`Négociateur de ${mot} du mandat`} onChange={setChoix} donnees={{ 'data-liste-negociateur': cote }} recherche={{ placeholder: 'Rechercher un négociateur' }} /></label>
          {avecUnite ? <ChampMontantUnite mot="Commission versée" valeur={commission} onChange={setCommission} avecHt champ={`commission-carte-${cote}`} />
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
              <div className="trx-actions"><button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={!disponible} onClick={() => void retablir(v.id)}
                data-retablir-compromis={v.id}>Rétablir le compromis</button></div>
            </li>
          ))}
        </ul>
      )}
    </BlocReplie>
  );
}
