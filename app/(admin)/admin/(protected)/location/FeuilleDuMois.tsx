'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { ListeChoix } from './ListeChoix';
import { ModaleCaracteristiquesBien } from './ModaleCaracteristiquesBien';
import { ModaleFicheLocataire } from './ModaleFicheLocataire';
import { ModaleDossierLocation } from './ModaleDossierLocation';
import { TRACE_SUIVI } from './TraceFiche';
import { CascadeHonoraires } from './CascadeHonoraires';
import { CSS_STATUT_BIEN, PastilleNature, RubriqueStatutBien } from './StatutBien';
import { CascadeNegociateurMois, CSS_CASCADE_NEGOCIATEUR } from './CascadeNegociateur';
import { estInterne } from '../../../../lib/location/suivi/suivi';
import {
  type ActiviteLue, apporteurAffiche, apporteursEtCollegues, LIBELLE_NATURE_BIEN, NATURES_BIEN, resumeDuMois, natureBienLoue, caLigne, collegueDeLigne, commissionApporteurDe, type ContexteCalcul, type DonneesTableau,
  gestionDuMois, honorairesGestionMensuels, type LigneGestion, NOMS_MOIS, primeDe, sectionNegociateurs, STATUT_ARRIVEE, tauxAffichage, totauxPeriode,
  commissionCollegueMensuelleDe, commissionCollegueSignatureDe, remunerationCollegueDe, dusParDossier,
} from '../../../../lib/location/suivi/tableauBord';
import {
  aRattacher, auCentime, LIBELLE_CATEGORIE_PRIME, LIBELLE_ORIGINE, LIBELLE_ORIGINE_CONTACT, LIBELLE_TYPE_ACTIVITE, libelleOrigineContact, type ModePrime, originesProposees, type OrigineContact,
  PRECISION_ORIGINE_MAX, versionADate, libelleDuree,
} from '../../../../lib/location/suivi/suivi';

/**
 * ══ 🔴 LOCATION — « SUIVI DU MOIS » : LA FEUILLE D'UN MOIS (Arno, 23/10/2026) ═════════════════════════════════════════════════
 * Le modèle : un onglet du suivi d'Arno (CA_JBP_2026.xlsx).
 *   · « Locations du mois » : une ligne par bail signé — propriétaire(s), locataire(s), honoraires HT, total, avec / sans
 *     gestion, origine du contact, apporteur, collègue de rattachement, honoraires d'apporteur (montant, taux), prime de
 *     gestion, négociateur, nouveau / déjà client. 🔴 Arno (24/10/2026) : la ligne est SYNTHÉTIQUE, comme le fichier
 *     (propriétaires | HT, locataires | HT, total CA HT, gestion, apporteurs d'affaires, coms) ; un clic (ou le chevron, Entrée,
 *     Espace) la déplie : tout le reste y est, avec « Modifier ». Le nom ouvre le bien (et son bail) ; « Modifier » corrige
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
/** Une part (0,452 → « 45,2 % »), une décimale ; le solde signé ; son sens (vert, rouge, gris). */
const pctUn = (x: number): string => `${(x * 100).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
const signeEur = (x: number): string => `${x > 0 ? '+' : x < 0 ? '−' : ''}${eur(Math.abs(x))}`;
const sensSolde = (x: number): 'positif' | 'negatif' | 'nul' => (auCentime(x) > 0 ? 'positif' : auCentime(x) < 0 ? 'negatif' : 'nul');
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
  const r = resumeDuMois(t, duMois, g, negos, ctx);
  const ecarts = (d.ecartsFichier ?? []).filter((e) => e.mois === cle);
  // 413 — la part gestion « Récurrent » due ce mois-ci s'ajoute au dû de l'apporteur et de son collègue.
  const ac = apporteursEtCollegues(duMois, ctx.apporteurs, { lignes: ctx.recurrents ?? [], mois: [cle], aujourdhui: ctx.aujourdhui ?? d.aujourdhui });
  const [edition, setEdition] = useState<number | string | null>(null);
  // 🔴 Arno (24/10/2026) — la fiche ouverte depuis le panneau (locataire ou bien) ; enregistrée : fermée, et la page se relit.
  const [fiche, setFiche] = useState<{ sorte: 'locataire' | 'lot' | 'dossier'; id: number; libelle: string; bailId?: number | null; activiteId?: number | null } | null>(null);
  const ficheEnregistree = (): void => { setFiche(null); onRelire(); };
  // Les lignes dépliées (plusieurs à la fois). Replier une ligne en édition abandonne la saisie, comme « Fermer ».
  const [deplies, setDeplies] = useState<ReadonlySet<string>>(() => new Set());
  const basculer = (id: number | string): void => {
    const cle = String(id);
    setDeplies((s) => { const n = new Set(s); if (n.has(cle)) n.delete(cle); else n.add(cle); return n; });
    if (deplies.has(cle) && edition !== null && String(edition) === cle) setEdition(null);
  };
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
      {fiche !== null && fiche.sorte === 'dossier' && (
        <ModaleDossierLocation activiteId={fiche.id} onFermer={() => setFiche(null)} onEnregistre={ficheEnregistree} />
      )}
      {fiche !== null && fiche.sorte === 'locataire' && (
        // 🔴 Arno (25/10/2026) — les cartes du bloc 1 en modification ; enregistrée, elle RESTE ouverte et la ligne se relit derrière.
        <ModaleFicheLocataire locataireId={fiche.id} bailId={fiche.bailId ?? null} activiteId={fiche.activiteId ?? null} libelle={fiche.libelle} onFermer={() => setFiche(null)} onEnregistre={onRelire} />
      )}
      {fiche !== null && fiche.sorte === 'lot' && (
        <ModaleCaracteristiquesBien lotId={fiche.id} titre="Fiche du bien" retourMot="Suivi du mois" trace={TRACE_SUIVI}
          onFermer={() => setFiche(null)} onEnregistre={ficheEnregistree} />
      )}
      <section className="tdb-section" aria-labelledby="fdm-locations" data-bloc="locations">
        <h3 id="fdm-locations">Locations du mois — {nom} <small className="loc-muet">({duMois.length})</small></h3>
        {!annuaire && <p className="loc-alerte loc-alerte--orange" role="status" data-feuille-sans-407>Mise à jour de la base à appliquer (migration 407) : l’origine du contact, le collègue et le choix de prime ne s’affichent ni ne se corrigent encore.</p>}
        {duMois.length === 0 ? <p className="loc-muet">Aucun bail signé ce mois-ci.</p> : (
          <>
          {/* 🔴 Arno (24/10/2026) — la légende des pastilles « BIEN », avec le nombre de lignes du mois dans chaque catégorie. */}
          <p className="fdm-legende" data-legende-nature>
            {NATURES_BIEN.map((n, i) => (
              <span key={n} className="fdm-legende-item" data-legende-nature-item={n}>
                <PastilleNature nature={n} /> <span className="fdm-legende-nb">{duMois.filter((a) => natureBienLoue(a).nature === n).length}</span>
                {i < NATURES_BIEN.length - 1 && <span className="fdm-legende-sep" aria-hidden="true">·</span>}
              </span>
            ))}
          </p>
          <div className="fdm-defile" data-defile-locations>
            {/* 🔴 Arno (24/10/2026) — la ligne SYNTHÉTIQUE du fichier CA_JBP (propriétaires, locataires, total, gestion, apporteurs,
                coms) ; tout le reste — et « Modifier » — dans le panneau déplié sous la ligne. Plusieurs lignes peuvent être dépliées. */}
            <table className="fdm-table fdm-table--synthese">
              <colgroup span={1} /><colgroup span={2} /><colgroup span={2} /><colgroup span={5} />
              <thead><tr>
                <th scope="col" className="fdm-nom">Bien</th>
                <th scope="colgroup" colSpan={2} className="fdm-nom">Propriétaires</th><th scope="colgroup" colSpan={2} className="fdm-nom">Locataires</th>
                <th scope="col">Total CA HT</th><th scope="col">Gestion</th><th scope="col" className="fdm-nom">Apporteurs d’affaires</th>
                <th scope="col">Coms apporteurs d’affaires</th><th scope="col"><span className="fdm-cache">Détail</span></th>
              </tr></thead>
              <tbody>
                {duMois.map((a) => {
                  const id = String(a.id);
                  const ouvert = deplies.has(id);
                  const prime = primeDe(a, ctx.regles);
                  const coms = commissionApporteurDe(a, ctx.apporteurs);
                  const app = apporteurAffiche(a, ctx.apporteurs);
                  const nature = natureBienLoue(a);
                  return [
                    <tr key={id} data-ligne-feuille={id} aria-expanded={ouvert}
                      className={`fdm-ligne${a.rattachement !== 'rattache' ? ' fdm-historique' : ''}${ouvert ? ' fdm-ligne--ouverte' : ''}`}
                      onClick={(e) => { if ((e.target as Element).closest('a') === null) basculer(a.id); }}>
                      <td data-mot="Bien" className="fdm-nom fdm-bien" data-nature-bien={nature.nature} title={nature.raison}><PastilleNature nature={nature.nature} /></td>
                      <th scope="row" data-mot="Propriétaires" className="fdm-nom">
                        {a.lotId !== null ? <a href={`/admin/location/bien/${a.lotId}`} data-ouvrir-bail>{a.libelleProprietaire || '—'}</a> : <span>{a.libelleProprietaire || '—'}</span>}
                        {a.type !== 'bail' && <span className="loc-pastille">{a.type === 'avenant' ? 'Avenant' : 'Gestion seule'}</span>}
                        {a.rattachement !== 'rattache' && <span className="loc-pastille" title="Ligne reprise du suivi mensuel, sans bail de l’outil">{a.rattachement === 'douteux' ? 'à vérifier' : 'historique'}</span>}
                      </th>
                      <td data-mot="Hono. propriétaire HT" className="fdm-montant">{eur(a.honoProprietaireHt)}</td>
                      <td data-mot="Locataires" className="fdm-nom">{a.libelleLocataire || '—'}</td>
                      <td data-mot="Hono. locataire HT" className="fdm-montant">{eur(a.honoLocataireHt)}</td>
                      <td data-mot="Total CA HT" className="fdm-montant tdb-fort">{eur(caLigne(a))}</td>
                      <td data-mot="Gestion" className={`fdm-montant${prime === 0 ? ' fdm-vide' : ''}`}>{prime === 0 ? '' : eur(prime)}</td>
                      <td data-mot="Apporteurs d’affaires" className={`fdm-nom${app.source === null ? ' fdm-vide' : ''}`} data-apporteur-source={app.source ?? undefined}>{app.texte}</td>
                      <td data-mot="Coms apporteurs d’affaires" className={`fdm-montant${auCentime(coms) === 0 ? ' fdm-vide' : ''}`}>{auCentime(coms) === 0 ? '' : eur(coms)}</td>
                      <td className="fdm-chevron-case">
                        <button type="button" className="fdm-chevron" aria-expanded={ouvert} aria-controls={`fdm-detail-${id}`} data-deplier-ligne={id}
                          aria-label={`${ouvert ? 'Replier' : 'Déplier'} le détail — ${a.libelleProprietaire || 'ligne'}`}>
                          <span aria-hidden="true">{ouvert ? '▾' : '▸'}</span></button>
                      </td>
                    </tr>,
                    ouvert && (
                      <tr key={`${id}-detail`} className="fdm-detail" id={`fdm-detail-${id}`} data-detail-ligne={id}><td colSpan={10}>
                        <DetailLigne a={a} ctx={ctx} statutManuel={d.statutBienManuel === true} onRelire={onRelire} />
                        <CascadeLigne a={a} ctx={ctx} />
                        <div className="fdm-detail-gestes">
                          {/* 🔴 Arno (24/10/2026) — « Dossier de location » EN PREMIER : le formulaire « Nouveau locataire » rouvert en
                              modification ; une ligne sans bail rattaché : inactif, et pourquoi (aucune création implicite). */}
                          {a.bailId !== null ? (
                            <button type="button" className="tdb-pilule fdm-raccourci fdm-dossier" onClick={() => setFiche({ sorte: 'dossier', id: Number(a.id), libelle: a.libelleLocataire })}
                              data-dossier-location={id}>Dossier de location</button>
                          ) : (
                            <button type="button" className="tdb-pilule fdm-raccourci fdm-dossier" disabled aria-describedby={`fdm-dossier-nr-${id}`} data-dossier-location={id}
                              data-dossier-non-rattache>Dossier de location<span id={`fdm-dossier-nr-${id}`} className="fdm-dossier-motif"> — Dossier non rattaché — à rattacher d’abord</span></button>
                          )}
                          {annuaire && (
                            <button type="button" className="tdb-pilule fdm-modifier" aria-expanded={edition === a.id} onClick={() => setEdition(edition === a.id ? null : a.id)} data-modifier-ligne={id}>
                              {edition === a.id ? 'Fermer' : 'Modifier'}</button>
                          )}
                          {/* 🔴 Arno (24/10/2026) — les fiches COMPLÈTES et modifiables, dans la source unique : un bouton par locataire, un
                              par bien ; sans locataire ou bien rattaché, « non rattaché » (jamais un bouton grisé sans explication). */}
                          {(a.locataires ?? []).length > 0 ? (a.locataires ?? []).map((l) => (
                            <button key={`loc-${l.id}`} type="button" className="tdb-pilule fdm-raccourci" onClick={() => setFiche({ sorte: 'locataire', id: l.id, libelle: l.libelle, bailId: a.bailId, activiteId: a.bailId !== null ? Number(a.id) : null })}
                              data-fiche-locataire={l.id}>{(a.locataires ?? []).length > 1 ? `Fiche locataire — ${l.libelle}` : 'Fiche locataire'}</button>
                          )) : <span className="fdm-non-rattache" data-locataire-non-rattache>Fiche locataire : non rattaché</span>}
                          {(a.lots ?? []).length > 0 ? (a.lots ?? []).map((b) => (
                            <button key={`lot-${b.id}`} type="button" className="tdb-pilule fdm-raccourci" onClick={() => setFiche({ sorte: 'lot', id: b.id, libelle: b.libelle })}
                              data-fiche-bien={b.id} title={b.libelle}>{(a.lots ?? []).length > 1 ? `Fiche du bien — ${b.libelle}` : 'Fiche du bien'}</button>
                          )) : <span className="fdm-non-rattache" data-bien-non-rattache>Fiche du bien : non rattaché</span>}
                        </div>
                        {edition === a.id && (
                          <div className="fdm-edition">
                            <EditionLigne a={a} d={d} ctx={ctx} onFermer={() => setEdition(null)} onFini={() => { setEdition(null); onRelire(); }} />
                          </div>
                        )}
                      </td></tr>
                    ),
                  ];
                })}
              </tbody>
            </table>
          </div>
          </>
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

      {/* 🔴 Arno (25/10/2026) — « RÉSUMÉ DU MOIS » : le bas de feuille rangé par FAMILLES, chacune dans son encadré titré, sans mélange.
          Aucun calcul ne change (sauf le CA HT net, qui retire aussi les commissions collègues) ; chaque chiffre d'avant s'y retrouve. */}
      <section className="tdb-section fdm-bas" aria-labelledby="fdm-bas" data-bloc="bas-de-feuille">
        <h3 id="fdm-bas">Résumé du mois — {nom}</h3>
        <div className="fdm-familles">
          <section className="fdm-famille" aria-labelledby="fdm-f1" data-famille="resultat">
            <h4 id="fdm-f1">Résultat du mois</h4>
            <dl className="fdm-cascade-mois">
              <div className="fdm-fort"><dt>CA HT global</dt><dd><button type="button" className="tdb-chiffre" onClick={() => onDetail(`TOTAL CA HT — ${nom}`, t.ids)} data-total="ca">{eur(r.resultat.ca)}</button></dd></div>
              <div><dt>− Honoraires d’apporteurs</dt><dd data-total="apporteurs">{eur(r.resultat.apporteurs)}</dd></div>
              {/* 🔴 Arno (24/10/2026, 419) — affichée même à 0 : la cascade se lit d'un coup d'œil. */}
              <div><dt>− Commissions collègues (apport d’apporteurs)</dt><dd data-total="collegues">{eur(r.resultat.collegues)}</dd></div>
              <div className="fdm-fort fdm-egal"><dt>= CA HT net</dt><dd data-total="ca-net">{eur(r.resultat.caNet)}</dd></div>
            </dl>
          </section>

          <section className="fdm-famille" aria-labelledby="fdm-f2" data-famille="statuts">
            <h4 id="fdm-f2">CA par statut du bien</h4>
            <table className="fdm-mini">
              <thead><tr><th scope="col">Statut</th><th scope="col">Dossiers</th><th scope="col">CA HT</th><th scope="col">Part</th></tr></thead>
              <tbody>
                {r.parStatut.map((x) => (
                  <tr key={x.nature} data-statut-ca={x.nature}>
                    <th scope="row"><PastilleNature nature={x.nature} /></th>
                    <td data-mot="Dossiers">{x.nb}</td>
                    <td data-mot="CA HT">{x.nb === 0 ? eur(0) : <button type="button" className="tdb-chiffre" onClick={() => onDetail(`CA — ${LIBELLE_NATURE_BIEN[x.nature]} — ${nom}`, x.ids)}>{eur(x.ca)}</button>}</td>
                    <td data-mot="Part">{x.part === null ? '—' : pctUn(x.part)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr data-statut-ca="total"><th scope="row">Total</th><td data-mot="Dossiers">{r.parStatut.reduce((s, x) => s + x.nb, 0)}</td>
                <td data-mot="CA HT">{eur(r.resultat.ca)}</td><td data-mot="Part">{r.resultat.ca === 0 ? '—' : '100 %'}</td></tr></tfoot>
            </table>
          </section>

          <section className="fdm-famille" aria-labelledby="fdm-f3" data-famille="gestion">
            <h4 id="fdm-f3">Honoraires avec / sans gestion</h4>
            <table className="fdm-mini">
              <thead><tr><th scope="col">Location</th><th scope="col">Dossiers</th><th scope="col">CA HT</th><th scope="col">Part</th></tr></thead>
              <tbody>
                <tr data-gestion-ca="avec"><th scope="row">Avec gestion</th><td data-mot="Dossiers">{r.gestion.avec.nb}</td><td data-mot="CA HT" data-total="avec">{eur(r.gestion.avec.ca)}</td>
                  <td data-mot="Part">{r.gestion.avec.part === null ? '—' : pctUn(r.gestion.avec.part)}</td></tr>
                <tr data-gestion-ca="sans"><th scope="row">Sans gestion</th><td data-mot="Dossiers">{r.gestion.sans.nb}</td><td data-mot="CA HT" data-total="sans">{eur(r.gestion.sans.ca)}</td>
                  <td data-mot="Part">{r.gestion.sans.part === null ? '—' : pctUn(r.gestion.sans.part)}</td></tr>
              </tbody>
              <tfoot><tr data-gestion-ca="total"><th scope="row">Total</th><td data-mot="Dossiers">{r.gestion.avec.nb + r.gestion.sans.nb}</td>
                <td data-mot="CA HT">{eur(r.resultat.ca)}</td><td data-mot="Part">{r.resultat.ca === 0 ? '—' : '100 %'}</td></tr></tfoot>
            </table>
          </section>

          <section className="fdm-famille" aria-labelledby="fdm-f4" data-famille="portefeuille">
            <h4 id="fdm-f4">Portefeuille de gestion (honoraires de gestion HT)</h4>
            <table className="fdm-mini">
              <thead><tr><th scope="col">Gestions</th><th scope="col">Biens</th><th scope="col">/ mois</th><th scope="col">/ an</th></tr></thead>
              <tbody>
                <tr data-portefeuille="gagnes"><th scope="row">Gagnées (entrées)</th><td data-mot="Biens">{r.portefeuille.gagnes.nb}</td>
                  <td data-mot="/ mois">{eur(r.portefeuille.gagnes.mensuel)}</td><td data-mot="/ an">{eur(r.portefeuille.gagnes.annuel)}</td></tr>
                <tr data-portefeuille="perdus"><th scope="row">Perdues (sorties)</th><td data-mot="Biens">{r.portefeuille.perdus.nb}</td>
                  <td data-mot="/ mois">{r.portefeuille.perdus.mensuel === 0 ? eur(0) : `−${eur(r.portefeuille.perdus.mensuel)}`}</td>
                  <td data-mot="/ an">{r.portefeuille.perdus.annuel === 0 ? eur(0) : `−${eur(r.portefeuille.perdus.annuel)}`}</td></tr>
              </tbody>
              <tfoot><tr data-portefeuille="solde" className={`tdb-signe tdb-signe--${sensSolde(r.portefeuille.solde.mensuel)}`}><th scope="row">Solde</th>
                <td data-mot="Biens">{r.portefeuille.gagnes.nb - r.portefeuille.perdus.nb >= 0 ? '+' : '−'}{Math.abs(r.portefeuille.gagnes.nb - r.portefeuille.perdus.nb)}</td>
                <td data-mot="/ mois" data-total="balance" colSpan={2}>{signeEur(r.portefeuille.solde.mensuel)} / mois · {signeEur(r.portefeuille.solde.annuel)} / an</td></tr></tfoot>
            </table>
            {g.sansLoyer > 0 && <p className="loc-muet tdb-note">{g.sansLoyer} bien(s) sans loyer de départ saisi : non comptés (rien n’est inventé).</p>}
          </section>

          <section className="fdm-famille fdm-famille--large" aria-labelledby="fdm-f5" data-famille="negociateurs">
            <h4 id="fdm-f5">{d.voirCommissions && r.negociateurs.length === 1 ? `Négociateur — ${r.negociateurs[0].libelle}` : 'Négociateurs'}</h4>
            {/* 🔴 Arno (25/10/2026) — le variable en CASCADE (une ligne = une opération), un « i » par ligne de calcul ; droit « Voir les commissions ». */}
            {d.voirCommissions && r.negociateurs.map((x) => (
              <div key={x.cle} className="fdm-nego" data-negociateur-resume={x.libelle}>
                <CascadeNegociateurMois x={x} mois={cle} plusieurs={r.negociateurs.length > 1} />
              </div>
            ))}
            {/* Les primes (visibles de tous, comme avant) et les rétrocessions (droit) de tous les négociateurs du mois. */}
            {!(d.voirCommissions && r.negociateurs.length === 1) && (
              <dl className="fdm-cascade-mois">
                <div><dt>Primes de gestion{d.voirCommissions && r.negociateurs.length > 1 ? ' — tous négociateurs' : ''}</dt><dd data-total="primes">{eur(r.primes)}</dd></div>
                {d.voirCommissions && <div><dt>Rétrocessions{r.negociateurs.length > 1 ? ' — tous négociateurs' : ''}</dt><dd data-total="retrocessions">{eur(r.retrocessions)}</dd></div>}
              </dl>
            )}
          </section>
        </div>
        {g.perdues.some((l) => l.origine === 'fichier') && <p className="loc-muet tdb-note" data-note-pertes-fichier>* Mandats perdus notés dans le suivi mensuel : honoraires DÉDUITS (loyers cc du fichier × taux retenu, détail au survol).</p>}
        {ecarts.map((e, i) => (
          <p key={i} className="fdm-ecart" data-ecart-fichier={e.champ}
            title={e.champ === 'commission' && !d.voirCommissions ? undefined : `${LIBELLE_CHAMP[e.champ]} — fichier : ${eur(e.fichier)} · outil (calcul juste) : ${eur(e.outil)}`}>
            <span className="fdm-ecart-mot">Écart avec le fichier, expliqué</span> {e.libelle}.
            {!(e.champ === 'commission' && !d.voirCommissions) && <span className="fdm-ecart-montants"> ({LIBELLE_CHAMP[e.champ]} : fichier {eur(e.fichier)} · outil {eur(e.outil)})</span>}</p>
        ))}
      </section>

      <section className="tdb-section" aria-labelledby="fdm-apporteurs" data-bloc="apporteurs-mois">
        <h3 id="fdm-apporteurs">Apporteurs du mois</h3>
        {/* 🔴 Arno (25/10/2026) — TOUS les apporteurs du mois (internes, externes, collègues « directement », commission non nommée), triés
            par CA apporté ; le meilleur mis en avant (ex aequo compris) ; puis « Sans apporteur » et le Total (= CA HT global du mois). */}
        {duMois.length === 0 ? <p className="loc-muet">Aucune affaire ce mois-ci.</p> : (
          <div className="fdm-deux">
            <table className="fdm-table fdm-apporteurs">
              <thead><tr><th scope="col">Apporteur</th><th scope="col">Affaires</th><th scope="col">CA apporté</th><th scope="col">Hono. d’apporteur</th></tr></thead>
              <tbody>{[...ac.apporteurs.filter((x) => x.sorte !== 'non_nomme'), ...ac.apporteurs.filter((x) => x.sorte === 'non_nomme')].map((x) => (
                <tr key={`${x.apporteurId ?? x.nom}`} data-apporteur-mois={x.nom} className={x.meilleur ? 'fdm-meilleur' : undefined}>
                  <th scope="row">{x.nom}{x.aRattacher && <span className="fdm-orange"> · à rattacher</span>}
                    {(x.sorte === 'interne' || x.sorte === 'externe') && <span className={`fdm-sorte fdm-sorte--${x.sorte}`} data-sorte-apporteur={x.sorte}>{x.sorte === 'interne' ? 'Interne' : 'Externe'}</span>}
                    {x.meilleur && <span className="fdm-badge-meilleur" data-meilleur-apporteur>Meilleur apporteur</span>}</th>
                  <td data-mot="Affaires"><button type="button" className="tdb-chiffre" onClick={() => onDetail(`Affaires de ${x.nom} — ${nom}`, x.ids)}>{x.nb}</button></td>
                  <td data-mot="CA apporté"><button type="button" className="tdb-chiffre" onClick={() => onDetail(`Affaires de ${x.nom} — ${nom}`, x.ids)}>{eur(x.ca)}</button></td>
                  <td data-mot="Hono. d’apporteur">{eur(x.commission)}</td>
                </tr>))}
                {ac.sans.nb > 0 && (
                  <tr data-apporteur-mois="sans" className="fdm-sans-apporteur">
                    <th scope="row">Sans apporteur <small className="loc-muet">(Internet, passage agence, à renseigner…)</small></th>
                    <td data-mot="Affaires"><button type="button" className="tdb-chiffre" onClick={() => onDetail(`Affaires sans apporteur — ${nom}`, ac.sans.ids)}>{ac.sans.nb}</button></td>
                    <td data-mot="CA apporté"><button type="button" className="tdb-chiffre" onClick={() => onDetail(`Affaires sans apporteur — ${nom}`, ac.sans.ids)}>{eur(ac.sans.ca)}</button></td>
                    <td data-mot="Hono. d’apporteur">{eur(ac.sans.commission)}</td>
                  </tr>
                )}</tbody>
              <tfoot><tr data-apporteur-mois="total">
                <th scope="row">Total</th>
                <td data-mot="Affaires"><button type="button" className="tdb-chiffre" onClick={() => onDetail(`Affaires du mois — ${nom}`, ac.total.ids)}>{ac.total.nb}</button></td>
                <td data-mot="CA apporté" data-total-apporteurs-ca>{eur(ac.total.ca)}</td><td data-mot="Hono. d’apporteur">{eur(ac.total.commission)}</td>
              </tr></tfoot>
            </table>
            {/* 🔴 Arno (25/10/2026) — les COLLÈGUES : via leurs apporteurs ET en direct, cumulés ; deux sous-lignes et un total quand les
                deux existent ; triés par CA total ; le meilleur badgé ; Total = somme des totaux des collègues. */}
            <table className="fdm-table fdm-collegues">
              <thead><tr><th scope="col">Collègues (via leurs apporteurs et en direct)</th><th scope="col">Affaires</th><th scope="col">CA apporté</th><th scope="col">Hono. d’apporteur</th></tr></thead>
              {ac.collegues.length === 0 ? <tbody><tr><td colSpan={4} className="loc-muet">Aucun collègue ce mois-ci.</td></tr></tbody> : ac.collegues.map((x) => {
                const via = x.via ?? { ...x, nb: 0, ca: 0, commission: 0, ids: [] };
                const direct = x.direct ?? { ...x, nb: 0, ca: 0, commission: 0, ids: [] };
                const deux = via.nb > 0 && direct.nb > 0;
                const cellules = (c: { nb: number; ca: number; commission: number; ids: (number | string)[] }, titre: string) => (<>
                  <td data-mot="Affaires"><button type="button" className="tdb-chiffre" onClick={() => onDetail(`${titre} — ${nom}`, c.ids)}>{c.nb}</button></td>
                  <td data-mot="CA apporté"><button type="button" className="tdb-chiffre" onClick={() => onDetail(`${titre} — ${nom}`, c.ids)}>{eur(c.ca)}</button></td>
                  <td data-mot="Hono. d’apporteur">{eur(c.commission)}</td></>);
                const nomC = <>{x.libelle}{x.meilleur && <span className="fdm-badge-meilleur" data-meilleur-collegue>Meilleur collègue</span>}</>;
                return (
                  <tbody key={x.cle} data-collegue-mois={x.libelle} className={`${x.cle === 'a-rattacher' ? 'fdm-orange-ligne' : ''}${x.meilleur ? ' fdm-meilleur' : ''}`}>
                    {deux ? (<>
                      <tr className="fdm-collegue-tete"><th scope="rowgroup" colSpan={4}>{nomC}</th></tr>
                      <tr data-collegue-part="via"><th scope="row" className="fdm-sous">via ses apporteurs</th>{cellules(via, `Affaires de ${x.libelle} — via ses apporteurs`)}</tr>
                      <tr data-collegue-part="direct"><th scope="row" className="fdm-sous">en direct</th>{cellules(direct, `Affaires de ${x.libelle} — en direct`)}</tr>
                      <tr data-collegue-part="total" className="fdm-collegue-total"><th scope="row">Total {x.libelle}</th>{cellules(x, `Affaires de ${x.libelle}`)}</tr>
                    </>) : (
                      <tr data-collegue-part={direct.nb > 0 ? 'direct' : 'via'}>
                        <th scope="row">{nomC}<small className="fdm-origine-collegue">{direct.nb > 0 ? 'en direct' : 'via ses apporteurs'}</small></th>
                        {cellules(x, `Affaires de ${x.libelle}`)}
                      </tr>
                    )}
                  </tbody>
                );
              })}
              {ac.collegues.length > 0 && (
                <tfoot><tr data-collegue-mois="total">
                  <th scope="row">Total</th>
                  <td data-mot="Affaires">{ac.collegues.reduce((t2, x) => t2 + x.nb, 0)}</td>
                  <td data-mot="CA apporté" data-total-collegues-ca>{eur(ac.collegues.reduce((t2, x) => t2 + x.ca, 0))}</td>
                  <td data-mot="Hono. d’apporteur">{eur(ac.collegues.reduce((t2, x) => t2 + x.commission, 0))}</td>
                </tr></tfoot>
              )}
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

/**
 * 🔴 Arno (24/10/2026) — la cascade du DOSSIER : honoraires HT − dû à l'apporteur − dû au collègue (externe rémunéré) = net agence HT,
 * les mêmes règles que l'annuaire (récurrents dus jusqu'à aujourd'hui). Sans apporteur : rien (la ligne n'a rien à retrancher).
 */
function CascadeLigne({ a, ctx }: { a: ActiviteLue; ctx: ContexteCalcul }) {
  if (a.apporteurId === null) return null;
  const ap = ctx.apporteurs.find((x) => x.id === a.apporteurId);
  const d = dusParDossier([a], ctx.apporteurs, ctx.aujourdhui ?? new Date().toISOString().slice(0, 10))[0];
  if (d === undefined) return null;
  const r = remunerationCollegueDe(a, ctx.apporteurs);
  const interne = ap !== undefined && estInterne(ap);
  return (
    <div className="fdm-cascade" data-cascade-ligne-feuille={String(a.id)}>
      <CascadeHonoraires ca={d.ca} apporteur={d.apporteur} collegue={interne || r === null ? (interne ? null : 0) : d.collegue}
        nomApporteur={a.apporteurNom ?? ap?.nom ?? '—'} nomCollegue={r?.collegue.libelle ?? (collegueDeLigne(a, ctx.apporteurs) as { libelle?: string } | null)?.libelle ?? '—'} />
    </div>
  );
}

/** Le choix de prime de la ligne : celui en base, sinon déduit (aucune prime → « Aucune » ; montant ≠ la règle → « Personnalisé »). */
const modePrimeDeLigne = (a: ActiviteLue, ctx: ContexteCalcul): ModePrime =>
  a.primeMode ?? (primeDe(a, ctx.regles) === 0 ? 'aucune' : a.primeSaisie !== null && versionADate(ctx.regles, a.dateSignature)?.primeLogement !== a.primeSaisie ? 'personnalise' : 'regle');
const LIBELLE_MODE_PRIME: Record<ModePrime, string> = { regle: 'Règle de l’agence', personnalise: 'Personnalisé', aucune: 'Aucune' };

/**
 * 🔴 Arno (24/10/2026) — le panneau déplié : TOUT ce qui a quitté la ligne synthétique (rien ne disparaît), en libellés / valeurs.
 * Chaque valeur porte `data-champ` (son libellé).
 */
function DetailLigne({ a, ctx, statutManuel, onRelire }: { a: ActiviteLue; ctx: ContexteCalcul; statutManuel: boolean; onRelire: () => void }) {
  const col = collegueDeLigne(a, ctx.apporteurs);
  const taux = tauxAffichage(a, ctx.apporteurs);
  const prime = primeDe(a, ctx.regles);
  const aRat = col !== null && 'aRattacher' in col;
  const categorie = a.categoriePrime ?? (a.parking ? 'parking' : null);
  const champs: [string, ReactNode][] = [
    // 🔴 Arno (25/10/2026, 424) — « Statut du bien » (anciennement « Nature du bien ») : pastille et raison inchangées ; un clic ouvre le choix.
    ['Statut du bien', <RubriqueStatutBien key="statut" a={a} disponible={statutManuel} onFini={onRelire} />],
    // 🔴 Arno (24/10/2026, Q1) — le texte du fichier d'une ligne reprise (la ligne affiche les noms de l'annuaire) : rien ne disparaît.
    ...(a.libelleOrigine !== undefined ? [['Libellé d’origine', `${a.libelleOrigine.proprietaire || '—'} / ${a.libelleOrigine.locataire || '—'}`] as [string, ReactNode]] : []),
    ['Date de signature', `${dateFr(a.dateSignature)}${a.dateSupposee ? ' (supposée : le 1er du mois)' : ''}`],
    ['Nature', LIBELLE_TYPE_ACTIVITE[a.type] ?? a.type],
    ['Type de bien', categorie === null ? '—' : LIBELLE_CATEGORIE_PRIME[categorie]],
    ['Gestion', a.avecGestion ? 'avec' : 'sans'],
    ['Origine du contact', a.origineContact ? libelleOrigineContact(a.origineContact, a.origineContactPrecision) : <span className="loc-muet">à renseigner</span>],
    ['Apporteur', a.apporteurNom ?? '—'],
    ['Collègue', col === null ? '—' : aRat ? <span className="fdm-orange">à rattacher</span> : (col as { libelle: string }).libelle],
    ['Hono. d’apporteur', a.apporteurNom === null && a.apporteurId === null ? '—' : `${eur(commissionApporteurDe(a, ctx.apporteurs))}${taux === null ? '' : ` (${pct(taux)})`}`],
    // 🔴 Arno (24/10/2026, 419) — le collègue qui a apporté cet apporteur, quand il est rémunéré sur ce dossier.
    ...(() => {
      const r = remunerationCollegueDe(a, ctx.apporteurs);
      if (r === null) return [];
      // 🔴 Arno (25/10/2026) — calcul mensuel du bien : le montant du dernier mois calculé (il suit le loyer révisé et la vacance).
      const gm = a.gestionMensuelle?.mois.filter((m) => m.mois <= (ctx.aujourdhui ?? '9999-12').slice(0, 7) && m.collegue !== 0) ?? [];
      const mensuel = gm.length > 0 ? gm[gm.length - 1].collegue : commissionCollegueMensuelleDe(a, ctx.apporteurs);
      const texte = `${r.collegue.libelle} — ${eur(commissionCollegueSignatureDe(a, ctx.apporteurs))}${mensuel > 0 ? ` + ${eur(mensuel)} / mois${gm.length > 0 ? ' (dernier mois calculé)' : ''} (${libelleDuree(r.regle.dureeAnnees)})` : ''}`;
      return [['Commission collègue (apport)', texte] as [string, ReactNode]];
    })(),
    ['Prime de gestion', prime === 0 ? 'Aucune' : eur(prime)],
    ['Choix de prime', LIBELLE_MODE_PRIME[modePrimeDeLigne(a, ctx)]],
    ['Négociateur', a.negociateurLibelle || '—'],
    ['Client', a.origineProprietaire ? LIBELLE_ORIGINE[a.origineProprietaire] : '—'],
  ];
  return (
    <dl className="fdm-detail-grille">
      {champs.map(([libelle, valeur]) => (
        <div key={libelle}><dt>{libelle}</dt><dd data-champ={libelle}>{valeur}</dd></div>
      ))}
    </dl>
  );
}

/** Corriger dans la ligne : origine, collègue, apporteur, commission, prime. La confirmation est celle de la tuile. */
function EditionLigne({ a, d, ctx, onFermer, onFini }: { a: ActiviteLue; d: DonneesTableau; ctx: ContexteCalcul; onFermer: () => void; onFini: () => void }) {
  const [v, setV] = useState({
    origineContact: (a.origineContact ?? '') as OrigineContact | '', collegueId: a.collegueId === null || a.collegueId === undefined ? '' : String(a.collegueId),
    apporteurId: a.apporteurId === null ? '' : String(a.apporteurId), apporteurTaux: a.apporteurTaux === null ? '' : saisie(Math.round(a.apporteurTaux * 1000000) / 10000),
    commissionApporteur: a.commissionSaisie === null ? '' : saisieEuros(a.commissionSaisie),
    primeMode: modePrimeDeLigne(a, ctx),
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
        {/* 🔴 Arno (24/10/2026) — plus de <select> natif en Location : la liste verte, menu juste sous le champ. */}
        <ListeChoix valeur={v.origineContact} libelle="Origine du contact" onChange={(x) => poser({ origineContact: x as OrigineContact })}
          options={originesProposees(d.personnalisable === true || v.origineContact === 'personnalise', d.dejaClient === true || v.origineContact === 'proprietaire_deja_client').map((o) => ({ id: o, libelle: LIBELLE_ORIGINE_CONTACT[o] }))}
          donnees={{ 'data-edition-origine': '', 'aria-invalid': String(sansOrigine) }} />
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
            <ListeChoix valeur={v.apporteurId} vide="— choisir dans l’annuaire —" libelle="Apporteur" onChange={(x) => poser({ apporteurId: x })} donnees={{ 'data-edition-apporteur': '' }}
              options={ctx.apporteurs.filter((x) => !x.archive).map((x) => {
                const bloque = aRattacher(x) && String(x.id) !== String(a.apporteurId ?? '');
                // L'apporteur CHOISI s'affiche par son seul nom (jamais tronqué) ; « à rattacher » passe alors en badge sous le champ.
                const choisi = String(x.id) === v.apporteurId;
                return { id: x.id, libelle: x.nom, bloque, mention: aRattacher(x) && !choisi ? ' — à rattacher' : undefined };
              })} />
            {apporteurChoisi !== undefined && aRattacher(apporteurChoisi) && <span className="fdm-badge-orange" data-edition-apporteur-a-rattacher>à rattacher</span>}</label>
          <label className="tdb-champ fdm-champ-court"><span className="fdm-libelle">Taux (%)</span>
            <span className="fdm-saisie"><input inputMode="decimal" value={v.apporteurTaux} onChange={(e) => poser({ apporteurTaux: e.target.value })} data-edition-taux /><span className="fdm-unite" aria-hidden="true">%</span></span></label>
          <label className="tdb-champ"><span className="fdm-libelle">Hono. d’apporteur (€)</span>
            <span className="fdm-saisie"><input inputMode="decimal" value={v.commissionApporteur} placeholder="ex. 64,39 (vide = au taux)" onChange={(e) => poser({ commissionApporteur: e.target.value })} data-edition-commission /><span className="fdm-unite" aria-hidden="true">€</span></span></label>
        </>
      )}
      <label className="tdb-champ"><span className="fdm-libelle">Prime de gestion</span>
        <ListeChoix valeur={v.primeMode} vide={null} libelle="Prime de gestion" onChange={(x) => poser({ primeMode: x as ModePrime })} donnees={{ 'data-edition-prime': '' }}
          options={[{ id: 'regle', libelle: `${versionADate(ctx.regles, a.dateSignature)?.primeLogement ?? 150} €` }, { id: 'personnalise', libelle: 'Personnalisé' }, { id: 'aucune', libelle: 'Aucune' }]} /></label>
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
  ${t},${t} tbody,${t} tfoot,${t} tr,${t} th,${t} td{display:block;width:100%;box-sizing:border-box}
  ${t} tr{border:1px solid var(--color-svv-line);border-radius:12px;padding:6px 10px;margin-bottom:8px}
  ${t} th[scope=row]{border-bottom:0;padding:4px 0;text-align:left}
  ${t} td{display:flex;justify-content:space-between;align-items:center;gap:10px;border-bottom:0;padding:2px 0;text-align:right}
  ${t} td::before{content:attr(data-mot);color:var(--color-svv-muted);font-size:.8rem;font-weight:700;text-align:left}
  ${t} tr.fdm-detail{border-style:dashed}
  ${t} td.fdm-vide{display:none}
  ${t} tr.fdm-detail>td{display:block;text-align:left}
  ${t} tr.fdm-ligne{position:relative;padding-right:52px}
  ${t} td.fdm-chevron-case{position:absolute;top:2px;right:2px;width:auto}
  ${t} tr.fdm-ligne--ouverte,${t} tr.fdm-detail{background:var(--color-svv-field)}
  ${t} tr.fdm-ligne--ouverte>th,${t} tr.fdm-ligne--ouverte>td,${t} tr.fdm-detail>td{background:transparent}`;

export const CSS_FEUILLE_MOIS = `
.fdm{display:flex;flex-direction:column;gap:18px}
.fdm-table{width:100%;border-collapse:collapse;font-size:.84rem}
.fdm-table th,.fdm-table td{padding:6px 6px;border-bottom:1px solid var(--color-svv-line);text-align:right;vertical-align:middle}
.fdm-table th[scope=row],.fdm-table thead th:first-child,.fdm-table thead th:nth-child(2){text-align:left}
.fdm-table thead th{font-size:.72rem;color:var(--color-svv-muted);font-weight:800;text-transform:uppercase;letter-spacing:.02em}
.fdm-table th[scope=row] a{color:inherit;font-weight:800}
.fdm-table td[data-mot*="HT"],.fdm-table td[data-mot^="Hono"],.fdm-table td[data-mot^="Prime"],.fdm-table td[data-mot^="CA "],.fdm-table td[data-mot*="/ "]{white-space:nowrap}
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
.fdm-table .fdm-nom,.fdm-table thead th.fdm-nom{text-align:left}
.fdm-table .fdm-montant{white-space:nowrap;text-align:right;font-variant-numeric:tabular-nums}
.fdm-ligne{cursor:pointer}
@media (hover:hover){ .fdm-ligne:hover>th,.fdm-ligne:hover>td{background:var(--color-svv-field)} }
.fdm-ligne--ouverte>th,.fdm-ligne--ouverte>td{border-bottom-color:transparent;background:var(--color-svv-field)}
.fdm-chevron-case{width:44px;padding:0 !important}
.fdm-chevron{display:inline-flex;align-items:center;justify-content:center;min-width:44px;min-height:44px;border:0;border-radius:10px;background:transparent;color:var(--color-svv-muted);font-size:1rem;cursor:pointer}
.fdm-chevron:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px}
.fdm-detail>td{background:var(--color-svv-field);text-align:left;padding:4px 10px 12px}
.fdm-detail-grille{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px 18px;margin:0;padding:6px 0;position:sticky;left:0;max-width:100cqi;box-sizing:border-box}
.fdm-detail-grille dt{font-size:.72rem;color:var(--color-svv-muted);font-weight:800;text-transform:uppercase;letter-spacing:.02em}
.fdm-detail-grille dd{margin:2px 0 0;color:var(--color-svv-ink);overflow-wrap:anywhere}
.fdm-legende{display:flex;flex-wrap:wrap;align-items:center;gap:6px 0;margin:0 0 10px;font-size:.84rem;color:var(--color-svv-muted)}
.fdm-legende-item{display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
.fdm-legende-sep{margin:0 8px}
.fdm-legende-nb{font-weight:800;color:var(--color-svv-ink);font-variant-numeric:tabular-nums}
.fdm-nature{display:inline-block;border-radius:999px;padding:1px 8px;font-size:.72rem;font-weight:800;line-height:1.45;white-space:nowrap;border:1px solid transparent}
.fdm-nature--relocation{background:var(--color-svv-blue-soft);color:var(--color-svv-blue);border-color:var(--color-svv-blue-soft)}
.fdm-nature--client_hors_gestion{background:var(--color-svv-field);color:var(--color-svv-ink);border:1px solid var(--color-svv-line-strong)}
.fdm-nature--nouveau_gestion{background:var(--color-svv-green-soft);color:var(--color-svv-green-ink);border-color:var(--color-svv-green-soft)}
.fdm-nature--nouveau_sans_gestion{background:var(--color-svv-violet-soft);color:var(--color-svv-violet);border-color:var(--color-svv-violet-soft)}
.fdm-nature--a_qualifier{background:transparent;color:var(--color-svv-muted);border:1px dashed var(--color-svv-muted)}
.fdm-table td.fdm-bien{width:1%;white-space:nowrap}
.fdm-table--synthese thead th:nth-child(-n+5){white-space:nowrap}
.fdm-raccourci{min-height:44px;padding:0 14px;font-size:.82rem}
.fdm-dossier{font-weight:800}
.fdm-dossier:disabled{opacity:1;cursor:not-allowed;color:var(--color-svv-muted);border-style:dashed}
.fdm-dossier-motif{font-weight:600}
.fdm-non-rattache{display:inline-flex;align-items:center;min-height:44px;padding:0 10px;color:var(--color-svv-muted);font-size:.82rem;font-style:italic}
.fdm-detail-gestes{display:flex;flex-wrap:wrap;align-items:center;gap:8px;justify-content:flex-start;padding-top:6px;position:sticky;left:0}
.fdm-edition{margin-top:8px;border-top:1px dashed var(--color-svv-line-strong)}
.fdm-detail .fdm-detail-grille{max-width:calc(100cqi - 20px)}
.fdm-detail .fdm-edition-corps{width:calc(100cqi - 20px)}
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
/* 🔴 Arno (25/10/2026) — « Résumé du mois » : une famille par encadré ; 2 colonnes au bureau (les négociateurs sur toute la largeur), 1 au
   téléphone. Libellés à gauche, montants à droite en chiffres tabulaires, jamais coupés. */
.fdm-familles{display:grid;grid-template-columns:minmax(0,1fr);gap:14px}
@media (min-width:900px){ .fdm-familles{grid-template-columns:repeat(2,minmax(0,1fr));align-items:start} .fdm-famille--large{grid-column:1 / -1} }
.fdm-famille{border:1px solid var(--color-svv-line);border-radius:16px;background:var(--color-svv-field);padding:14px 16px;min-width:0;display:flex;flex-direction:column;gap:8px}
.fdm-famille > h4{margin:0;font-size:.95rem;font-weight:800;color:var(--color-svv-ink)}
.fdm-cascade-mois{margin:0;display:flex;flex-direction:column}
.fdm-cascade-mois div{display:flex;justify-content:space-between;align-items:baseline;gap:12px;border-bottom:1px solid var(--color-svv-line);padding:6px 0}
.fdm-cascade-mois dt{color:var(--color-svv-muted)}
.fdm-cascade-mois dd{margin:0;text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.fdm-egal{border-top:2px solid var(--color-svv-ink);border-bottom:0 !important}
.fdm-fort dt,.fdm-fort dd{font-weight:800;color:var(--color-svv-ink)}
.fdm-mini{width:100%;border-collapse:collapse;font-size:.86rem}
.fdm-mini th,.fdm-mini td{padding:6px 4px;border-bottom:1px solid var(--color-svv-line);text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.fdm-mini thead th{font-size:.74rem;font-weight:700;color:var(--color-svv-muted)}
.fdm-mini th:first-child{text-align:left}
.fdm-mini tbody th{font-weight:600;color:var(--color-svv-ink)}
.fdm-mini tfoot th,.fdm-mini tfoot td{font-weight:800;border-bottom:0;border-top:2px solid var(--color-svv-line-strong)}
.fdm-mini tfoot tr.tdb-signe--positif td,.fdm-mini tfoot tr.tdb-signe--positif th{color:var(--color-svv-green-ink)}
.fdm-mini tfoot tr.tdb-signe--negatif td,.fdm-mini tfoot tr.tdb-signe--negatif th{color:var(--color-svv-red)}
.fdm-mini tfoot tr.tdb-signe--nul td,.fdm-mini tfoot tr.tdb-signe--nul th{color:var(--color-svv-muted)}
.fdm-nego{display:flex;flex-direction:column;gap:2px}
/* 🔴 Arno (25/10/2026) — Apporteurs du mois : badges discrets ; le meilleur légèrement surligné ; Sans apporteur et Total à part. */
.fdm-sorte{display:inline-block;margin-left:6px;border-radius:999px;padding:0 7px;font-size:.68rem;font-weight:700;line-height:1.6;border:1px solid var(--color-svv-line-strong);color:var(--color-svv-muted);vertical-align:middle}
.fdm-sorte--interne{border-color:var(--color-svv-blue-soft);color:var(--color-svv-blue)}
.fdm-badge-meilleur{display:inline-block;margin-left:6px;border-radius:999px;padding:0 8px;font-size:.7rem;font-weight:800;line-height:1.6;background:var(--color-svv-green-soft);color:var(--color-svv-green-ink);vertical-align:middle;white-space:nowrap}
.fdm-apporteurs tr.fdm-meilleur > th,.fdm-apporteurs tr.fdm-meilleur > td{background:color-mix(in srgb, var(--color-svv-green-soft) 55%, transparent)}
.fdm-apporteurs tr.fdm-sans-apporteur > th{font-weight:600;color:var(--color-svv-muted)}
.fdm-apporteurs tfoot th,.fdm-apporteurs tfoot td{font-weight:800;border-top:2px solid var(--color-svv-line-strong);border-bottom:0}
.fdm-collegues tbody.fdm-meilleur th,.fdm-collegues tbody.fdm-meilleur td{background:color-mix(in srgb, var(--color-svv-green-soft) 55%, transparent)}
.fdm-collegues tr.fdm-collegue-tete th{border-bottom:0;padding-bottom:0;font-weight:800;text-align:left}
@media (max-width:640px){
  .fdm-collegues tbody{border:1px solid var(--color-svv-line);border-radius:12px;padding:6px 10px;margin-bottom:8px}
  .fdm-collegues tbody tr{border:0;border-radius:0;padding:2px 0;margin:0}
  .fdm-collegues tbody tr + tr{border-top:1px dashed var(--color-svv-line);padding-top:6px;margin-top:4px}
  .fdm-collegues th.fdm-sous{padding-left:0}
}
.fdm-collegues th.fdm-sous{font-weight:400;color:var(--color-svv-muted);padding-left:18px}
.fdm-collegues tr.fdm-collegue-total th,.fdm-collegues tr.fdm-collegue-total td{font-weight:800}
.fdm-origine-collegue{display:block;font-size:.74rem;font-weight:400;color:var(--color-svv-muted)}
.fdm-collegues tfoot th,.fdm-collegues tfoot td{font-weight:800;border-top:2px solid var(--color-svv-line-strong);border-bottom:0}
.fdm-nego-nom{margin:6px 0 0;font-weight:800}
.fdm-famille .tdb-note{margin:0}
.fdm-deux{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;align-items:start}
@media (max-width:900px){ .fdm-deux{grid-template-columns:minmax(0,1fr)} }
@media (max-width:640px){ ${cartes('.fdm-table')} .fdm-famille{padding:12px} .fdm-mini th,.fdm-mini td{padding:6px 2px} }
${CSS_STATUT_BIEN}${CSS_CASCADE_NEGOCIATEUR}`;
