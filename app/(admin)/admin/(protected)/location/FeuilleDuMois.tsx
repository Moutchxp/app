'use client';

import { useEffect, useState } from 'react';
import { ListeChoix } from './ListeChoix';
import {
  type ActiviteLue, apporteursEtCollegues, caLigne, collegueDeLigne, commissionApporteurDe, type ContexteCalcul, type DonneesTableau,
  gestionDuMois, honorairesGestionMensuels, type LigneGestion, NOMS_MOIS, primeDe, sectionNegociateurs, STATUT_ARRIVEE, tauxAffichage, totauxPeriode,
} from '../../../../lib/location/suivi/tableauBord';
import {
  aRattacher, auCentime, LIBELLE_ORIGINE, LIBELLE_ORIGINE_CONTACT, libelleOrigineContact, type ModePrime, originesProposees, type OrigineContact,
  PRECISION_ORIGINE_MAX, versionADate,
} from '../../../../lib/location/suivi/suivi';

/**
 * ══ 🔴 LOCATION — « SUIVI DU MOIS » : LA FEUILLE D'UN MOIS (Arno, 23/10/2026) ═════════════════════════════════════════════════
 * Le modèle : un onglet du suivi d'Arno (CA_JBP_2026.xlsx).
 *   · « Locations du mois » : une ligne par bail signé — propriétaire(s), locataire(s), honoraires HT, total, avec / sans
 *     gestion, origine du contact, apporteur, collègue de rattachement, honoraires d'apporteur (montant, taux), prime de
 *     gestion, négociateur, nouveau / déjà client. La ligne ouvre le bien (et son bail) ; « Modifier » corrige dans la ligne
 *     l'origine, l'apporteur, la commission et la prime — la confirmation habituelle de la Location s'affiche ;
 *   · « Nouvelles gestions du mois » et « Mandats de gestion perdus », avec leurs honoraires de gestion mensuels et annuels ;
 *   · le bas de feuille du fichier : TOTAL CA HT, apporteurs, CA − apporteurs, primes, rétrocessions et commission brute par
 *     négociateur (droit « Voir les commissions »), ventilation avec / sans gestion, balance de gestion récurrente ;
 *   · « Apporteurs du mois » : par apporteur, et par collègue (les affaires de SES apporteurs).
 * 🔴 Arno (23/10/2026) — LA LIGNE EN ÉDITION SE FERME QUAND ON VEUT, SANS CONDITION : « Fermer » (en tête de ligne ou sous la
 * saisie), la touche Échap, ou « Modifier » sur une autre ligne la referment aussitôt et abandonnent la saisie (la ligne revient
 * aux valeurs en base ; rien n'est écrit). L'origine du contact obligatoire ne se contrôle qu'au clic sur « Enregistrer ».
 */
const API = '/api/admin/location/suivi';
const eur = (x: number): string => `${x.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const pct = (x: number): string => `${(x * 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %`;
const dateFr = (iso: string): string => iso.split('-').reverse().join('/');
/** Une valeur en base, dans une case : virgule française, sans le bruit des flottants (64,362 et non 64,36200000000001) — jamais arrondie. */
const LIBELLE_CHAMP: Record<string, string> = { ca: 'TOTAL CA HT', apporteurs: 'Honoraires d’apporteurs', primes: 'Primes de gestion', commission: 'Commission brute' };
const saisie = (x: number | null): string => (x === null ? '' : String(Number(x.toPrecision(12))).replace('.', ','));
/** Un montant en euros dans une case : toujours 2 décimales, comme dans le tableau (64,36). */
const saisieEuros = (x: number): string => auCentime(x).toFixed(2).replace('.', ',');
/** Un montant TAPÉ : arrondi au centime à l'envoi (64,365 → 64,37) ; une saisie illisible part telle quelle (le serveur dit pourquoi). */
const centimeTape = (t: string): string => {
  const n = Number(t.replace(/[\s  €]/g, '').replace(',', '.'));
  return t.trim() === '' || !Number.isFinite(n) ? t : saisieEuros(n);
};

interface Props {
  d: DonneesTableau;
  lignes: readonly ActiviteLue[];
  ctx: ContexteCalcul;
  annee: number;
  mois: number;
  negociateur: string | null;
  onDetail: (titre: string, ids: (number | string)[]) => void;
  onRelire: () => void;
}

export function FeuilleDuMois({ d, lignes, ctx, annee, mois, negociateur, onDetail, onRelire }: Props) {
  const cle = `${annee}-${String(mois).padStart(2, '0')}`;
  const duMois = lignes.filter((a) => a.dateSignature.startsWith(cle));
  const t = totauxPeriode(lignes, ctx, { annee, mois }, negociateur);
  const negos = d.voirCommissions ? sectionNegociateurs(lignes, ctx, { annee, mois }) : [];
  const g = gestionDuMois(d.gestionLignes ?? [], cle);
  const ecarts = (d.ecartsFichier ?? []).filter((e) => e.mois === cle);
  // 413 — la part gestion « Récurrent » due ce mois-ci s'ajoute au dû de l'apporteur et de son collègue.
  const ac = apporteursEtCollegues(duMois, ctx.apporteurs, { lignes: ctx.recurrents ?? [], mois: [cle], aujourdhui: ctx.aujourdhui ?? d.aujourdhui });
  const [edition, setEdition] = useState<number | string | null>(null);
  // Échap referme la ligne en édition — sauf quand une fenêtre (confirmation, roue) est ouverte : Échap est alors à elle.
  useEffect(() => {
    if (edition === null) return;
    const clavier = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && document.querySelector('[role="dialog"][aria-modal="true"]') === null) setEdition(null);
    };
    window.addEventListener('keydown', clavier);
    return () => window.removeEventListener('keydown', clavier);
  }, [edition]);
  const nom = `${NOMS_MOIS[mois - 1]} ${annee}`;
  const annuaire = d.annuaire === true;

  return (
    <div className="fdm" data-feuille-mois={cle}>
      <section className="tdb-section" aria-labelledby="fdm-locations" data-bloc="locations">
        <h3 id="fdm-locations">Locations du mois — {nom} <small className="loc-muet">({duMois.length})</small></h3>
        {!annuaire && <p className="loc-alerte loc-alerte--orange" role="status" data-feuille-sans-407>Mise à jour de la base à appliquer (migration 407) : l’origine du contact, le collègue et le choix de prime ne s’affichent ni ne se corrigent encore.</p>}
        {duMois.length === 0 ? <p className="loc-muet">Aucun bail signé ce mois-ci.</p> : (
          <div className="fdm-defile" data-defile-locations>
            <table className="fdm-table fdm-table--large">
              <thead><tr>
                <th scope="col">Propriétaire(s)</th><th scope="col">Locataire(s)</th><th scope="col">Hono. propriétaire HT</th><th scope="col">Hono. locataire HT</th>
                <th scope="col">Total HT</th><th scope="col">Gestion</th><th scope="col">Origine du contact</th><th scope="col">Apporteur</th><th scope="col">Collègue</th>
                <th scope="col">Hono. d’apporteur</th><th scope="col">Prime de gestion</th><th scope="col">Négociateur</th><th scope="col">Client</th><th scope="col"><span className="fdm-cache">Gestes</span></th>
              </tr></thead>
              <tbody>
                {duMois.map((a) => {
                  const col = collegueDeLigne(a, ctx.apporteurs);
                  const taux = tauxAffichage(a, ctx.apporteurs);
                  const prime = primeDe(a, ctx.regles);
                  const aRat = col !== null && 'aRattacher' in col;
                  return [
                    <tr key={String(a.id)} data-ligne-feuille={String(a.id)} className={a.rattachement !== 'rattache' ? 'fdm-historique' : undefined}>
                      <th scope="row" data-mot="Propriétaire(s)">
                        {a.lotId !== null ? <a href={`/admin/location/bien/${a.lotId}`} data-ouvrir-bail>{a.libelleProprietaire || '—'}</a> : <span>{a.libelleProprietaire || '—'}</span>}
                        {a.type !== 'bail' && <span className="loc-pastille">{a.type === 'avenant' ? 'Avenant' : 'Gestion seule'}</span>}
                        {a.rattachement !== 'rattache' && <span className="loc-pastille" title="Ligne reprise du suivi mensuel, sans bail de l’outil">{a.rattachement === 'douteux' ? 'à vérifier' : 'historique'}</span>}
                      </th>
                      <td data-mot="Locataire(s)">{a.libelleLocataire || '—'}</td>
                      <td data-mot="Hono. propriétaire HT">{eur(a.honoProprietaireHt)}</td>
                      <td data-mot="Hono. locataire HT">{eur(a.honoLocataireHt)}</td>
                      <td data-mot="Total HT" className="tdb-fort">{eur(caLigne(a))}</td>
                      <td data-mot="Gestion">{a.avecGestion ? 'avec' : 'sans'}</td>
                      <td data-mot="Origine du contact">{a.origineContact ? libelleOrigineContact(a.origineContact, a.origineContactPrecision) : <span className="loc-muet">à renseigner</span>}</td>
                      <td data-mot="Apporteur">{a.apporteurNom ?? '—'}</td>
                      <td data-mot="Collègue">{col === null ? '—' : aRat ? <span className="fdm-orange">à rattacher</span> : (col as { libelle: string }).libelle}</td>
                      <td data-mot="Hono. d’apporteur">{a.apporteurNom === null && a.apporteurId === null ? '—' : `${eur(commissionApporteurDe(a, ctx.apporteurs))}${taux === null ? '' : ` (${pct(taux)})`}`}</td>
                      <td data-mot="Prime de gestion">{prime === 0 ? 'Aucune' : eur(prime)}</td>
                      <td data-mot="Négociateur">{a.negociateurLibelle || '—'}</td>
                      <td data-mot="Client">{a.origineProprietaire ? LIBELLE_ORIGINE[a.origineProprietaire] : '—'}</td>
                      <td data-mot="">{annuaire && (
                        <button type="button" className="tdb-pilule fdm-modifier" aria-expanded={edition === a.id} onClick={() => setEdition(edition === a.id ? null : a.id)} data-modifier-ligne={String(a.id)}>
                          {edition === a.id ? 'Fermer' : 'Modifier'}</button>
                      )}</td>
                    </tr>,
                    edition === a.id && (
                      <tr key={`${String(a.id)}-edition`} className="fdm-edition"><td colSpan={14}>
                        <EditionLigne a={a} d={d} ctx={ctx} onFermer={() => setEdition(null)} onFini={() => { setEdition(null); onRelire(); }} />
                      </td></tr>
                    ),
                  ];
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="tdb-section" aria-labelledby="fdm-gestions" data-bloc="nouvelles-gestions">
        <h3 id="fdm-gestions">Nouvelles gestions du mois <small className="loc-muet">({g.nouvelles.length})</small></h3>
        <TableGestion lignes={g.nouvelles} perdus={false} />
      </section>
      <section className="tdb-section" aria-labelledby="fdm-perdus" data-bloc="mandats-perdus">
        <h3 id="fdm-perdus">Mandats de gestion perdus <small className="loc-muet">({g.perdues.length})</small></h3>
        <TableGestion lignes={g.perdues} perdus />
      </section>

      <section className="tdb-section fdm-bas" aria-labelledby="fdm-bas" data-bloc="bas-de-feuille">
        <h3 id="fdm-bas">Bas de feuille — {nom}</h3>
        <dl className="fdm-totaux">
          <div className="fdm-fort"><dt>TOTAL CA HT</dt><dd><button type="button" className="tdb-chiffre" onClick={() => onDetail(`TOTAL CA HT — ${nom}`, t.ids)} data-total="ca">{eur(t.ca)}</button></dd></div>
          <div><dt>Honoraires d’apporteurs</dt><dd data-total="apporteurs">{eur(t.apporteurs)}</dd></div>
          <div className="fdm-fort"><dt>CA HT − apporteurs</dt><dd data-total="ca-net">{eur(t.caNet)}</dd></div>
          <div><dt>Primes de gestion</dt><dd data-total="primes">{eur(t.primes)}</dd></div>
          {d.voirCommissions && <div><dt>Rétrocessions</dt><dd data-total="retrocessions">{eur(t.retrocessions)}</dd></div>}
          {d.voirCommissions && negos.map((n) => (
            <div key={n.cle} className="fdm-fort"><dt>Commission brute — {n.libelle}</dt><dd data-total-commission={n.libelle}>{eur(n.totaux.commission)}</dd></div>
          ))}
          <div><dt>Location avec gestion</dt><dd data-total="avec">{eur(t.avecGestion)}</dd></div>
          <div><dt>Location sans gestion</dt><dd data-total="sans">{eur(t.sansGestion)}</dd></div>
          <div className="fdm-fort"><dt>Balance de gestion récurrente (gagné − perdu)</dt>
            <dd data-total="balance">{g.balanceMensuelle >= 0 ? '+' : '−'}{eur(Math.abs(g.balanceMensuelle))} / mois · {g.balanceAnnuelle >= 0 ? '+' : '−'}{eur(Math.abs(g.balanceAnnuelle))} / an</dd></div>
        </dl>
        {g.perdues.some((l) => l.origine === 'fichier') && <p className="loc-muet tdb-note" data-note-pertes-fichier>* Mandats perdus notés dans le suivi mensuel : honoraires DÉDUITS (loyers cc du fichier × taux retenu, détail au survol).</p>}
        {ecarts.map((e, i) => (
          <p key={i} className="fdm-ecart" data-ecart-fichier={e.champ}
            title={e.champ === 'commission' && !d.voirCommissions ? undefined : `${LIBELLE_CHAMP[e.champ]} — fichier : ${eur(e.fichier)} · outil (calcul juste) : ${eur(e.outil)}`}>
            <span className="fdm-ecart-mot">Écart avec le fichier, expliqué</span> {e.libelle}.
            {!(e.champ === 'commission' && !d.voirCommissions) && <span className="fdm-ecart-montants"> ({LIBELLE_CHAMP[e.champ]} : fichier {eur(e.fichier)} · outil {eur(e.outil)})</span>}</p>
        ))}
        {g.sansLoyer > 0 && <p className="loc-muet tdb-note">{g.sansLoyer} bien(s) sans loyer de départ saisi : non comptés dans la balance (rien n’est inventé).</p>}
      </section>

      <section className="tdb-section" aria-labelledby="fdm-apporteurs" data-bloc="apporteurs-mois">
        <h3 id="fdm-apporteurs">Apporteurs du mois</h3>
        {ac.apporteurs.length === 0 ? <p className="loc-muet">Aucune affaire apportée ce mois-ci.</p> : (
          <div className="fdm-deux">
            <table className="fdm-table">
              <thead><tr><th scope="col">Apporteur</th><th scope="col">Affaires</th><th scope="col">CA apporté</th><th scope="col">Hono. d’apporteur</th></tr></thead>
              <tbody>{ac.apporteurs.map((x) => (
                <tr key={`${x.apporteurId ?? x.nom}`} data-apporteur-mois={x.nom}>
                  <th scope="row">{x.nom}{x.aRattacher && <span className="fdm-orange"> · à rattacher</span>}</th>
                  <td data-mot="Affaires"><button type="button" className="tdb-chiffre" onClick={() => onDetail(`Affaires de ${x.nom} — ${nom}`, x.ids)}>{x.nb}</button></td>
                  <td data-mot="CA apporté">{eur(x.ca)}</td><td data-mot="Hono. d’apporteur">{eur(x.commission)}</td>
                </tr>))}</tbody>
            </table>
            <table className="fdm-table">
              <thead><tr><th scope="col">Collègue (ses apporteurs)</th><th scope="col">Affaires</th><th scope="col">CA apporté</th><th scope="col">Hono. d’apporteur</th></tr></thead>
              <tbody>{ac.collegues.map((x) => (
                <tr key={x.cle} data-collegue-mois={x.libelle} className={x.cle === 'a-rattacher' ? 'fdm-orange-ligne' : undefined}>
                  <th scope="row">{x.libelle}</th>
                  <td data-mot="Affaires"><button type="button" className="tdb-chiffre" onClick={() => onDetail(`Affaires apportées — ${x.libelle} — ${nom}`, x.ids)}>{x.nb}</button></td>
                  <td data-mot="CA apporté">{eur(x.ca)}</td><td data-mot="Hono. d’apporteur">{eur(x.commission)}</td>
                </tr>))}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function TableGestion({ lignes, perdus }: { lignes: readonly LigneGestion[]; perdus: boolean }) {
  if (lignes.length === 0) return <p className="loc-muet">{perdus ? 'Aucun mandat perdu ce mois-ci.' : 'Aucune nouvelle gestion ce mois-ci.'}</p>;
  return (
    <table className="fdm-table">
      <thead><tr>
        <th scope="col">Bien</th><th scope="col">Propriétaire</th>
        {perdus ? <><th scope="col">Sortie le</th><th scope="col">Statut d’arrivée</th></> : <><th scope="col">Loyer</th><th scope="col">Taux</th></>}
        <th scope="col">{perdus ? 'Perdu / mois' : 'Honoraires / mois'}</th><th scope="col">{perdus ? 'Perdu / an' : 'Honoraires / an'}</th>
      </tr></thead>
      <tbody>{lignes.map((l, i) => {
        const m = honorairesGestionMensuels(l);
        return (
          <tr key={`${l.lotId ?? 'fichier'}-${l.effetLe}-${i}`} data-ligne-gestion={l.lotId ?? 'fichier'}>
            <th scope="row">{l.lotId !== null ? <a href={`/admin/location/bien/${l.lotId}`}>{l.libelle}</a> : <span>{l.libelle}</span>}
              {l.origine === 'fichier' && <span className="loc-pastille" title={[l.commentaire, l.lotId === null ? 'Bien non rattaché' : null].filter(Boolean).join(' · ') || undefined}
                data-perte-fichier>suivi mensuel{l.lotId === null ? ' · non rattaché' : ''}</span>}</th>
            <td data-mot="Propriétaire">{l.proprietaire || '—'}</td>
            {perdus ? <><td data-mot="Sortie le">{l.origine === 'fichier' ? `${dateFr(l.effetLe).slice(3)} (mois)` : dateFr(l.effetLe)}</td>
              <td data-mot="Statut d’arrivée">{STATUT_ARRIVEE[l.apres] ?? l.apres}</td></>
              : <><td data-mot="Loyer">{l.loyerHc === null ? <span className="loc-muet">à saisir</span> : `${eur(l.loyerHc)} HC${l.base === 'cc' && l.provisions ? ` + ${eur(l.provisions)}` : ''}`}</td>
                <td data-mot="Taux">{l.tauxHt === null ? '—' : `${String(l.tauxHt).replace('.', ',')} %`}</td></>}
            <td data-mot={perdus ? 'Perdu / mois' : 'Honoraires / mois'} title={l.origine === 'fichier' && m !== null ? `Déduit : loyers ${eur(l.loyerHc ?? 0)} cc (fichier) × ${String(l.tauxHt).replace('.', ',')} % HT — ${l.tauxSource === 'conditions' ? 'taux des conditions du bail' : l.tauxSource === 'wippimmo' ? 'taux WIPPIMMO du bien' : 'taux par défaut de l’agence'}` : undefined}>
              {m === null ? '—' : eur(m)}{l.origine === 'fichier' && m !== null && <span className="fdm-deduit" aria-label="valeur déduite"> *</span>}</td>
            <td data-mot={perdus ? 'Perdu / an' : 'Honoraires / an'}>{m === null ? '—' : eur(m * 12)}</td>
          </tr>
        );
      })}</tbody>
    </table>
  );
}

/** Corriger dans la ligne : origine, collègue, apporteur, commission, prime. La confirmation est celle de la tuile. */
function EditionLigne({ a, d, ctx, onFermer, onFini }: { a: ActiviteLue; d: DonneesTableau; ctx: ContexteCalcul; onFermer: () => void; onFini: () => void }) {
  const [v, setV] = useState({
    origineContact: (a.origineContact ?? '') as OrigineContact | '', collegueId: a.collegueId === null || a.collegueId === undefined ? '' : String(a.collegueId),
    apporteurId: a.apporteurId === null ? '' : String(a.apporteurId), apporteurTaux: a.apporteurTaux === null ? '' : saisie(Math.round(a.apporteurTaux * 1000000) / 10000),
    commissionApporteur: a.commissionSaisie === null ? '' : saisieEuros(a.commissionSaisie),
    primeMode: (a.primeMode ?? (primeDe(a, ctx.regles) === 0 ? 'aucune' : a.primeSaisie !== null && versionADate(ctx.regles, a.dateSignature)?.primeLogement !== a.primeSaisie ? 'personnalise' : 'regle')) as ModePrime,
    primeMontant: a.primeSaisie === null ? '' : saisie(a.primeSaisie),
    /* 411 — le texte d'une origine « Personnalisé ». */
    origineContactPrecision: a.origineContactPrecision ?? '',
  });
  // Les montants tels qu'à l'ouverture : s'ils n'ont pas bougé, la valeur EXACTE en base est gardée (jamais arrondie).
  const [initial] = useState(() => ({ taux: v.apporteurTaux, commission: v.commissionApporteur }));
  const [envoi, setEnvoi] = useState(false);
  const [motif, setMotif] = useState<string | null>(null);
  const [sansOrigine, setSansOrigine] = useState(false);
  const enregistrer = async (): Promise<void> => {
    // Contrôlée ICI, au clic sur « Enregistrer » seulement : rien n'est envoyé, la ligne reste ouverte, le message est sous le champ.
    if (v.origineContact === '') { setSansOrigine(true); return; }
    setEnvoi(true); setMotif(null);
    const conserverMontants = v.apporteurTaux === initial.taux && v.commissionApporteur === initial.commission;
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'modifier-activite', id: a.id, champs: {
        origineContact: v.origineContact || null, collegueId: v.collegueId === '' ? null : Number(v.collegueId), apporteurId: v.apporteurId === '' ? null : Number(v.apporteurId),
        apporteurTaux: v.apporteurTaux, commissionApporteur: conserverMontants ? v.commissionApporteur : centimeTape(v.commissionApporteur),
        conserverMontants, primeMode: v.primeMode, primeMontant: v.primeMontant, origineContactPrecision: v.origineContactPrecision } }) });
      const j = await r.json() as { etat?: string; motif?: string };
      if (j.etat === 'ok') { onFini(); return; }
      setMotif(j.motif ?? 'Enregistrement refusé.');
    } catch {
      setMotif('Enregistrement impossible : le serveur n’a pas répondu.');
    } finally {
      setEnvoi(false);
    }
  };
  const apporteurChoisi = ctx.apporteurs.find((x) => String(x.id) === v.apporteurId);
  const poser = (p: Partial<typeof v>) => { setV({ ...v, ...p }); setMotif(null); if (p.origineContact) setSansOrigine(false); };
  return (
    <div className="fdm-edition-corps" data-edition-ligne={String(a.id)}>
      <label className="tdb-champ fdm-champ-large"><span className="fdm-libelle">Origine du contact *</span>
        <select value={v.origineContact} onChange={(e) => poser({ origineContact: e.target.value as OrigineContact })} aria-invalid={sansOrigine} data-edition-origine>
          <option value="">— choisir —</option>
          {originesProposees(d.personnalisable === true || v.origineContact === 'personnalise', d.dejaClient === true || v.origineContact === 'proprietaire_deja_client').map((o) => <option key={o} value={o}>{LIBELLE_ORIGINE_CONTACT[o]}</option>)}
        </select>
        {sansOrigine && <span className="loc-manque fdm-manque" role="alert" data-edition-sans-origine>L’origine du contact est obligatoire.</span>}</label>
      {/* Arno (24/10/2026, 411) — « Personnalisé » : le texte de l'origine, obligatoire, 80 caractères au plus. */}
      {v.origineContact === 'personnalise' && (
        <label className="tdb-champ fdm-champ-large"><span className="fdm-libelle">Origine personnalisée *</span>
          <input value={v.origineContactPrecision} maxLength={PRECISION_ORIGINE_MAX} onChange={(e) => poser({ origineContactPrecision: e.target.value })} data-edition-origine-precision /></label>
      )}
      {v.origineContact === 'collegue' && (
        <label className="tdb-champ fdm-champ-large"><span className="fdm-libelle">Collègue *</span>
          <ListeChoix options={d.collegues ?? []} valeur={v.collegueId} libelle="Collègue" onChange={(x) => poser({ collegueId: x })} donnees={{ 'data-edition-collegue': '' }} /></label>
      )}
      {v.origineContact === 'apporteur' && (
        <>
          <label className="tdb-champ fdm-champ-large"><span className="fdm-libelle">Apporteur *</span>
            <select value={v.apporteurId} onChange={(e) => poser({ apporteurId: e.target.value })} data-edition-apporteur>
              <option value="">— choisir dans l’annuaire —</option>
              {ctx.apporteurs.filter((x) => !x.archive).map((x) => {
                const bloque = aRattacher(x) && String(x.id) !== String(a.apporteurId ?? '');
                // L'apporteur CHOISI s'affiche par son seul nom (jamais tronqué) ; « à rattacher » passe alors en badge sous le champ.
                const choisi = String(x.id) === v.apporteurId;
                return <option key={x.id} value={x.id} disabled={bloque}>{x.nom}{aRattacher(x) && !choisi ? ' — à rattacher' : ''}</option>;
              })}
            </select>
            {apporteurChoisi !== undefined && aRattacher(apporteurChoisi) && <span className="fdm-badge-orange" data-edition-apporteur-a-rattacher>à rattacher</span>}</label>
          <label className="tdb-champ fdm-champ-court"><span className="fdm-libelle">Taux (%)</span>
            <span className="fdm-saisie"><input inputMode="decimal" value={v.apporteurTaux} onChange={(e) => poser({ apporteurTaux: e.target.value })} data-edition-taux /><span className="fdm-unite" aria-hidden="true">%</span></span></label>
          <label className="tdb-champ"><span className="fdm-libelle">Hono. d’apporteur (€)</span>
            <span className="fdm-saisie"><input inputMode="decimal" value={v.commissionApporteur} placeholder="ex. 64,39 (vide = au taux)" onChange={(e) => poser({ commissionApporteur: e.target.value })} data-edition-commission /><span className="fdm-unite" aria-hidden="true">€</span></span></label>
        </>
      )}
      <label className="tdb-champ"><span className="fdm-libelle">Prime de gestion</span>
        <select value={v.primeMode} onChange={(e) => poser({ primeMode: e.target.value as ModePrime })} data-edition-prime>
          <option value="regle">{`${versionADate(ctx.regles, a.dateSignature)?.primeLogement ?? 150} €`}</option>
          <option value="personnalise">Personnalisé</option>
          <option value="aucune">Aucune</option>
        </select></label>
      {v.primeMode === 'personnalise' && (
        <label className="tdb-champ"><span className="fdm-libelle">Montant (€) *</span>
          <span className="fdm-saisie"><input inputMode="decimal" value={v.primeMontant} onChange={(e) => poser({ primeMontant: e.target.value })} data-edition-prime-montant /><span className="fdm-unite" aria-hidden="true">€</span></span></label>
      )}
      <div className="fdm-edition-gestes">
        {/* Une cale de la hauteur d'un libellé : les boutons s'alignent sur les cases, pas sur les libellés. */}
        <span className="fdm-libelle fdm-cale" aria-hidden="true">&nbsp;</span>
        <span className="fdm-edition-boutons">
          <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={onFermer} data-edition-fermer>Fermer</button>
          <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={envoi} onClick={() => { void enregistrer(); }} data-edition-enregistrer>{envoi ? 'Enregistrement…' : 'Enregistrer'}</button>
        </span>
        {motif !== null && <p className="gst-erreur" role="alert">{motif}</p>}
      </div>
    </div>
  );
}

/** Un tableau en cartes (une ligne = une carte, chaque valeur précédée de son intitulé). */
const cartes = (t: string): string => `
  ${t} thead{display:none}
  ${t},${t} tbody,${t} tr,${t} th,${t} td{display:block;width:100%;box-sizing:border-box}
  ${t} tr{border:1px solid var(--color-svv-line);border-radius:12px;padding:6px 10px;margin-bottom:8px}
  ${t} th[scope=row]{border-bottom:0;padding:4px 0;text-align:left}
  ${t} td{display:flex;justify-content:space-between;align-items:center;gap:10px;border-bottom:0;padding:2px 0;text-align:right}
  ${t} td::before{content:attr(data-mot);color:var(--color-svv-muted);font-size:.8rem;font-weight:700;text-align:left}
  ${t} tr.fdm-edition{border-style:dashed}`;

export const CSS_FEUILLE_MOIS = `
.fdm{display:flex;flex-direction:column;gap:18px}
.fdm-table{width:100%;border-collapse:collapse;font-size:.84rem}
.fdm-table th,.fdm-table td{padding:6px 6px;border-bottom:1px solid var(--color-svv-line);text-align:right;vertical-align:middle}
.fdm-table th[scope=row],.fdm-table thead th:first-child,.fdm-table thead th:nth-child(2){text-align:left}
.fdm-table thead th{font-size:.72rem;color:var(--color-svv-muted);font-weight:800;text-transform:uppercase;letter-spacing:.02em}
.fdm-table th[scope=row] a{color:inherit;font-weight:800}
.fdm-table td[data-mot*="HT"],.fdm-table td[data-mot^="Hono"],.fdm-table td[data-mot^="Prime"],.fdm-table td[data-mot^="CA "],.fdm-table td[data-mot*="/ "]{white-space:nowrap}
.fdm-totaux dd[data-total]:not([data-total="balance"]),.fdm-totaux dd[data-total-commission]{white-space:nowrap}
.fdm-table .loc-pastille{margin-left:6px}
.fdm-historique th[scope=row]{color:var(--color-svv-muted)}
.fdm-cache{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.fdm-modifier{min-height:44px;padding:0 12px;font-size:.82rem}
.fdm-orange{color:var(--color-svv-amber);font-weight:800}
.fdm-ecart{margin:6px 0 0;font-size:.8rem;color:var(--color-svv-muted);border-left:3px solid var(--color-svv-amber);padding-left:8px}
.fdm-ecart-mot{font-weight:800;color:var(--color-svv-ink)}
.fdm-ecart-montants{display:none}
@media (hover:none){ .fdm-ecart-montants{display:inline} }
.fdm-deduit{color:var(--color-svv-amber);font-weight:800}
.fdm-orange-ligne th{color:var(--color-svv-amber)}
.fdm-edition td{background:var(--color-svv-field)}
.fdm-edition-corps{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-start;text-align:left;padding:6px 0;position:sticky;left:0;width:100cqi;box-sizing:border-box}
.fdm-defile{position:relative;overflow-x:auto;container-type:inline-size}
.fdm-edition-corps>.tdb-champ{flex:1 1 150px}
.fdm-edition-corps>.fdm-champ-large{flex-basis:190px}
.fdm-edition-corps>.fdm-champ-court{flex-basis:110px}
.fdm-edition-gestes{flex:0 0 auto;display:flex;flex-direction:column;gap:4px;align-items:stretch}
@container (max-width:560px){ .fdm-edition-corps>*{flex-basis:100% !important} }
.fdm-edition-gestes .gst-btn{width:auto;min-height:44px;height:44px;padding-top:0;padding-bottom:0;flex:1 1 0;white-space:nowrap}
.fdm-edition-boutons{display:flex;gap:8px}
.fdm-libelle{display:block;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fdm-edition-corps select{height:44px}
.fdm-saisie{display:flex;align-items:center;gap:6px;height:44px;box-sizing:border-box;border:1px solid var(--color-svv-line-strong);border-radius:10px;padding:0 10px 0 8px;background:var(--color-svv-surface);min-width:0}
.fdm-saisie input{flex:1 1 auto;min-width:0;height:100%;border:0;outline:0;background:transparent;padding:0;font:inherit;font-size:.92rem;font-weight:400;color:var(--color-svv-ink);box-shadow:none;appearance:none}
.fdm-saisie input::placeholder{color:var(--color-svv-muted);font-weight:400}
.fdm-unite{color:var(--color-svv-muted);font-size:.92rem;font-weight:600}
.fdm-edition-corps select:focus-visible,.fdm-saisie:focus-within{outline:2px solid var(--color-svv-red);outline-offset:1px}
.fdm-badge-orange{align-self:flex-start;margin-top:4px;padding:2px 8px;border-radius:999px;background:var(--color-svv-amber);color:var(--color-svv-surface);font-size:.72rem;font-weight:800}
.fdm-edition-corps .fdm-manque{display:block;margin-top:4px;color:var(--color-svv-red);font-size:.8rem;font-weight:700}
.fdm-totaux{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:8px 18px;margin:0}
.fdm-totaux div{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid var(--color-svv-line);padding:6px 0}
.fdm-totaux dt{color:var(--color-svv-muted)}
.fdm-totaux dd{margin:0;text-align:right}
.fdm-fort dt,.fdm-fort dd{font-weight:800;color:var(--color-svv-ink)}
.fdm-deux{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}
@media (max-width:1300px){ ${cartes('.fdm-table--large')} }
@media (max-width:900px){ .fdm-deux{grid-template-columns:minmax(0,1fr)} }
@media (max-width:640px){ ${cartes('.fdm-table')} .fdm-totaux{grid-template-columns:minmax(0,1fr)} }
`;
