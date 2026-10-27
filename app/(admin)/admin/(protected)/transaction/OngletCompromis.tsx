'use client';

import { useState, type ReactNode } from 'react';
import { caHt, exterieurHt, ht, LIBELLE_SOCIETE, SOCIETES, type Societe, type Vente } from '../../../../lib/transaction/modele';
import { libellePartie, partsParSociete } from '../../../../lib/transaction/repartition';
import { eur, posterTransaction, useTransaction } from './commun';
import { FormulaireDossier, type References } from './FormulaireDossier';
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

interface DonneesCompromis extends References { disponible: boolean; aujourdhui: string; compromis: Vente[] }
const date = (d: string | null | undefined): string => (d ? d.split('-').reverse().join('/') : A_RENSEIGNER);
const ouManque = (x: string | null | undefined): string => (x == null || x.trim() === '' ? A_RENSEIGNER : x);

export function OngletCompromis({ societe }: { societe: Societe | 'tous' }) {
  const { lu, relire } = useTransaction<DonneesCompromis>(`vue=compromis&societe=${societe}`);
  // LOT F — « + Ajouter un vendeur / un acquéreur » ouvre le formulaire du compromis sur une ligne neuve de ce côté (personne existante ou neuve).
  const [edition, setEdition] = useState<{ vente: Vente; ajouter: 'vendeur' | 'acquereur' | null } | 'nouveau' | null>(null);
  const [acte, setActe] = useState<{ id: number; date: string } | null>(null);
  const [fait, setFait] = useState<{ id: number; libelle: string } | null>(null);
  const [motif, setMotif] = useState<string | null>(null);
  const [historique, setHistorique] = useState<number | null>(null);
  if (lu.etat === 'charge') return <p className="gst-info" role="status">Chargement…</p>;
  if (lu.etat === 'erreur') return <p className="gst-erreur" role="alert">{lu.message}</p>;
  const d = lu.data;
  const vue: Societe | null = societe === 'tous' ? null : societe;
  // LOT E — la date butoir la plus proche d'abord ; les compromis sans date à la fin.
  const liste = trierCompromis(d.compromis);
  const totalHt = liste.reduce((t, v) => t + ht(v.honorairesTtc), 0);
  const parSociete = Object.fromEntries(SOCIETES.map((s) => [s, liste.reduce((t, v) => t + caHt(v, s), 0)])) as Record<Societe, number>;
  const exterieur = liste.reduce((t, v) => t + exterieurHt(v), 0);
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
    <section className="tdb-section" aria-labelledby="trx-compromis-titre" data-onglet-compromis={societe}>
      <div className="trx-barre">
        <h3 id="trx-compromis-titre">Compromis en cours <span className="loc-pastille">{liste.length}</span></h3>
        {vue !== null && <div className="trx-actions"><button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={() => setEdition('nouveau')}
          disabled={!d.disponible} data-nouveau-compromis>+ Nouveau compromis</button></div>}
      </div>
      {!d.lotD && <p className="loc-alerte loc-alerte--orange" role="status" data-sans-434>Personnes, négociateurs d’entrée et de sortie et répartition : disponibles après la mise à jour de la base (migration 434).</p>}
      <ul className="tdb-tuiles" aria-label="Les compromis en cours" data-totaux-compromis>
        <li><div className="tdb-tuile"><span className="tdb-tuile-mot">Compromis en cours</span><strong className="tdb-tuile-valeur" data-nb-compromis>{liste.length}</strong>
          <span className="tdb-tuile-n1">acte non signé</span></div></li>
        <li><div className="tdb-tuile"><span className="tdb-tuile-mot">Commission HT en cours</span><strong className="tdb-tuile-valeur" data-commission-en-cours>{eur(totalHt)}</strong>
          <span className="tdb-tuile-n1">{eur(totalHt * 1.2)} TTC</span></div></li>
        {SOCIETES.filter((s) => vue === null || s === vue).map((s) => (
          <li key={s}><div className="tdb-tuile"><span className="tdb-tuile-mot">Part {LIBELLE_SOCIETE[s]} (HT)</span><strong className="tdb-tuile-valeur" data-part-compromis={s}>{eur(parSociete[s])}</strong>
            <span className="tdb-tuile-n1">après rétrocessions et parts des autres</span></div></li>
        ))}
        {exterieur > 0 && <li><div className="tdb-tuile"><span className="tdb-tuile-mot">Parts extérieures (hors CA)</span><strong className="tdb-tuile-valeur">{eur(exterieur)}</strong>
          <span className="tdb-tuile-n1">autres agences, confrères</span></div></li>}
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
                        {info(v.origine === 'import' ? 'Libellé du fichier' : 'Libellé', v.libelle, 'libelle')}
                        {info('Adresse du bien', ouManque(v.dossier?.adresseBien))}
                        {info('Prix de vente', v.prixVente == null ? A_RENSEIGNER : eur(v.prixVente))}
                        {info('Commission', <>{eur(ht(v.honorairesTtc))} HT · {eur(v.honorairesTtc)} TTC{c.pctPrix !== null ? ` · ${c.pctPrix.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} % du prix` : ''}</>)}
                        {info('Date du compromis', date(v.dateCompromis))}
                        {info('Acte au plus tard le', v.dossier?.dateActePrevue ? <span className={c.depassee ? 'trx-depassee' : undefined}>{date(v.dossier.dateActePrevue)}{c.depassee ? ' — dépassée' : ''}</span>
                          : `${A_RENSEIGNER} (prévisionnel ${v.annee})`, 'acte-prevu')}
                        {info('Négociateur d’entrée', ouManque(v.dossier?.entree?.nom))}
                        {info('Négociateur de sortie', ouManque(v.dossier?.sortie?.nom))}
                        {info('Apporteur', <>{ouManque(v.apporteur)}{r !== null && r.retroApporteurTtc > 0 ? ` · rétrocession ${eur(r.retroApporteurTtc)} TTC` : ''}</>)}
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
      {edition !== null && <FormulaireDossier societe={edition === 'nouveau' ? societeSaisie : edition.vente.societe} vente={edition === 'nouveau' ? null : edition.vente}
        ajouter={edition === 'nouveau' ? null : edition.ajouter}
        references={d} onFermer={() => setEdition(null)} onFait={() => { setEdition(null); relire(); }} />}
    </section>
  );
}
