'use client';

import { Fragment, useState } from 'react';
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
 */

interface DonneesCompromis extends References { disponible: boolean; aujourdhui: string; compromis: Vente[] }
const date = (d: string | null | undefined): string => (d ? d.split('-').reverse().join('/') : A_RENSEIGNER);
const ouManque = (x: string | null | undefined): string => (x == null || x.trim() === '' ? A_RENSEIGNER : x);

export function OngletCompromis({ societe }: { societe: Societe | 'tous' }) {
  const { lu, relire } = useTransaction<DonneesCompromis>(`vue=compromis&societe=${societe}`);
  const [edition, setEdition] = useState<Vente | 'nouveau' | null>(null);
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
        <ul className="trx-journal" data-liste-compromis>
          {liste.map((v) => {
            const r = v.repartition ?? null;
            const ps = r === null ? null : partsParSociete(r.parties, v.honorairesTtc, r.retroApporteurTtc);
            const c = carteCompromis(v, d.aujourdhui);
            // 🔴 LOT E — LA CARTE COMPACTE : vendeurs, acquéreurs, puis adresse · prix · commission (verte, « € HT ») · date butoir ;
            // tout le détail d'avant se déplie (triangle à gauche) — rien n'est retiré.
            const titre = (
              <span className="trx-carte-lignes">
                <span className={`trx-carte-vendeurs${c.manque.vendeurs ? ' trx-a-renseigner' : ''}`} data-carte-ligne="vendeurs">{c.vendeurs}</span>
                <span className={c.manque.acquereurs ? 'trx-a-renseigner' : undefined} data-carte-ligne="acquereurs">{c.acquereurs}</span>
                <span className="trx-carte-infos" data-carte-ligne="infos">
                  <span className={c.manque.adresse ? 'trx-a-renseigner' : undefined} data-carte="adresse">{c.adresse}</span>
                  <span aria-hidden="true">{' · '}</span>
                  <span data-carte="prix">{c.prix === null ? <span className="trx-a-renseigner">prix {A_RENSEIGNER}</span> : `prix ${eur(c.prix)}`}</span>
                  <span aria-hidden="true">{' · '}</span>
                  <span className="trx-commission" data-carte="commission">{eur(c.commissionHt)} HT <small>({eur(c.commissionTtc)} TTC)</small></span>
                  <span aria-hidden="true">{' · '}</span>
                  <span data-carte="butoir" className={c.depassee ? 'trx-depassee' : c.butoir === null ? 'trx-a-renseigner' : undefined}>
                    {c.butoir === null ? `date butoir ${A_RENSEIGNER}` : `acte au plus tard le ${date(c.butoir)}${c.depassee ? ' — dépassée' : ''}`}</span>
                </span>
              </span>
            );
            return (
              <li key={v.id} data-compromis={v.id} data-depassee={c.depassee ? '' : undefined}>
                <BlocReplie id={`trx-compromis-${v.id}`} section={`compromis-${v.id}`} titre={titre} resume="" chevronAGauche defilement={false} classe="trx-carte"
                  donnees={{ 'data-carte-compromis': String(v.id) }}>
                <p><strong>{v.libelle}</strong>
                  <span className="trx-pastilles">
                    {societe === 'tous' && r === null && <span className="loc-pastille">{LIBELLE_SOCIETE[v.societe]}</span>}
                    {v.origine === 'import' && <span className="loc-pastille" title={`${v.sourceFichier ?? ''} › ${v.sourceOnglet ?? ''} › ligne ${v.sourceLigne ?? ''}`}>import</span>}
                  </span></p>
                <dl className="trx-resultat">
                  <dt>Adresse du bien</dt><dd>{ouManque(v.dossier?.adresseBien)}</dd>
                  <dt>Prix de vente</dt><dd>{v.prixVente == null ? A_RENSEIGNER : eur(v.prixVente)}</dd>
                  <dt>Compromis</dt><dd>{date(v.dateCompromis)}</dd>
                  <dt>Acte prévu</dt><dd data-acte-prevu>{v.dossier?.dateActePrevue ? date(v.dossier.dateActePrevue) : `${v.annee} (année du prévisionnel)`}</dd>
                  <dt>Commission</dt><dd>{eur(ht(v.honorairesTtc))} HT · {eur(v.honorairesTtc)} TTC</dd>
                  <dt>Négociateur d’entrée</dt><dd>{ouManque(v.dossier?.entree?.nom)}</dd>
                  <dt>Négociateur de sortie</dt><dd>{ouManque(v.dossier?.sortie?.nom)}</dd>
                  <dt>Apporteur</dt><dd>{ouManque(v.apporteur)}{r !== null && r.retroApporteurTtc > 0 ? ` · rétrocession ${eur(r.retroApporteurTtc)} TTC` : ''}</dd>
                </dl>
                {(v.dossier?.personnes ?? []).length > 0 && (
                  <ul className="trx-journal" data-personnes-compromis>
                    {v.dossier!.personnes.map((p) => (
                      <li key={`${p.role}-${p.id}`}>{p.role === 'vendeur' ? 'Vendeur' : 'Acquéreur'} : <strong>{p.nom}</strong>
                        {p.telephone && <> · <a href={`tel:${p.telephone.replace(/\s/g, '')}`}>{p.telephone}</a></>}
                        {p.email && <> · <a href={`mailto:${p.email}`}>{p.email}</a></>}
                        {p.adresse && <> · {p.adresse}</>}</li>
                    ))}
                  </ul>
                )}
                {r !== null && ps !== null ? (
                  <dl className="trx-resultat" data-repartition-compromis>
                    <dt>Commission nette (après apporteur)</dt><dd>{eur(ps.netHt)} HT</dd>
                    {r.parties.map((p, i) => <Fragment key={i}><dt>{libellePartie(p)}</dt><dd>{p.pourcentage !== null ? `${p.pourcentage.toLocaleString('fr-FR', { maximumFractionDigits: 4 })} % · ` : ''}{eur(p.pourcentage !== null ? (ps.netHt * p.pourcentage) / 100 : p.montantHt ?? 0)} HT</dd></Fragment>)}
                    {SOCIETES.map((s) => <Fragment key={s}><dt>Part {LIBELLE_SOCIETE[s]}</dt><dd data-part-societe-compromis={s}>{eur(ps.societe[s])} HT</dd></Fragment>)}
                    {ps.exterieurHt > 0 && <><dt>Part extérieure (hors CA)</dt><dd>{eur(ps.exterieurHt)} HT</dd></>}
                  </dl>
                ) : <p className="loc-muet">Répartition : toute la commission à {LIBELLE_SOCIETE[v.societe]} (historique, avant la répartition entre parties).</p>}
                <div className="trx-actions">
                  <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setEdition(v)} disabled={!d.disponible} data-modifier-compromis={v.id}>Modifier</button>
                  <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={() => setActe({ id: v.id, date: d.aujourdhui })} disabled={!d.disponible} data-acte-signe={v.id}>Acte signé</button>
                  <button type="button" className="trx-bouton-lien" onClick={() => setHistorique(historique === v.id ? null : v.id)}>{historique === v.id ? 'Masquer l’historique' : 'Historique'}</button>
                </div>
                {acte?.id === v.id && (
                  <form className="trx-form" onSubmit={(e) => { e.preventDefault(); void signer(); }} data-form-acte={v.id}>
                    <label>Date de l’acte (son mois est le mois du CA)<input type="date" value={acte.date} onChange={(e) => setActe({ id: v.id, date: e.target.value })} required data-date-acte /></label>
                    <div className="trx-actions"><button type="submit" className="svv-btn svv-btn-primary gst-btn" data-confirmer-acte>Confirmer l’acte</button>
                      <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setActe(null)}>Abandonner</button></div>
                  </form>
                )}
                {historique === v.id && <Journal entite="vente" id={v.id} onFait={relire} />}
                </BlocReplie>
              </li>
            );
          })}
        </ul>
      )}
      {edition !== null && <FormulaireDossier societe={edition === 'nouveau' ? societeSaisie : edition.societe} vente={edition === 'nouveau' ? null : edition}
        references={d} onFermer={() => setEdition(null)} onFait={() => { setEdition(null); relire(); }} />}
    </section>
  );
}
