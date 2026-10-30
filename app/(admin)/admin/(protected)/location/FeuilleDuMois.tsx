'use client';

import { annexeNonComptee, regleAnnexesDe, type RegleAnnexes } from '../../../../lib/location/suivi/annexesGestion';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { ListeChoix } from './ListeChoix';
import { ModaleCaracteristiquesBien } from './ModaleCaracteristiquesBien';
import { BlocOrigineLocation } from './BlocOrigineLocation';
import { ModaleFicheLocataire } from './ModaleFicheLocataire';
import { ModaleDossierLocation } from './ModaleDossierLocation';
import { TRACE_SUIVI } from './TraceFiche';
import { CascadeHonoraires } from './CascadeHonoraires';
import { CSS_STATUT_BIEN, PastilleNature, RubriqueStatutBien } from './StatutBien';
import { CascadeNegociateurMois, CascadeResultatNet, CSS_CASCADE_NEGOCIATEUR, MOTS_MOIS, MOTS_PERIODE, ResumeResultatNet, type MotsPeriode } from './CascadeNegociateur';
import { BlocReplie } from './BlocReplie';
import { dossiersCascade, resumeDuMoisComplet, type ResumeCalcule } from '../../../../lib/location/suivi/resumePeriode';
import { estInterne, texteRechercheApporteur } from '../../../../lib/location/suivi/suivi';
import { gliDepuisJanvier, margeFr, type GliPeriode } from '../../../../lib/location/suivi/margeGli';
import {
  type ActiviteCalcul, type ActiviteLue, type GestionDepuisJanvier, totalDesIntermediaires, apporteurAffiche, apporteursEtColleguesDesMois, detailCollegue, type CascadeNegociateur, type LigneDetailCollegue,  LIBELLE_NATURE_BIEN, NATURES_BIEN, gestionDepuisJanvier, natureBienLoue, caLigne, collegueDeLigne, commissionApporteurDe, type ContexteCalcul, type DonneesTableau,
  gestionDuMois, honorairesGestionMensuels, loyerChargesComprises, type LigneGestion, type MouvementGestion, NOMS_MOIS, primeDe, primeSaisieALaMain, STATUT_ARRIVEE, tauxAffichage,
  commissionCollegueMensuelleDe, commissionCollegueSignatureDe, remunerationCollegueDe, dusParDossier,
} from '../../../../lib/location/suivi/tableauBord';
import {
  aRattacher, auCentime, LIBELLE_CATEGORIE_PRIME, LIBELLE_ORIGINE, LIBELLE_ORIGINE_CONTACT, LIBELLE_TYPE_ACTIVITE, libelleOrigineContact, type ModePrime, originesProposees, type OrigineContact,
  PRECISION_ORIGINE_MAX, versionADate, libelleDuree,
} from '../../../../lib/location/suivi/suivi';
import { ChampNombre } from './ChampNombre';
import { BulleAnnexes, CSS_BULLE_ANNEXES } from './BulleAnnexes';
import { ConversionMandat } from './ConversionMandat';
import { CSS_SUPPRIMER_LOCATION, SupprimerLocation } from './SupprimerLocation';
import { posterSuivi } from './suiviApi';
import { useParametresSuivi } from './SuiviCommercial';
import { regrouperParBien, sommeDuGroupe, type LienAnnexeAffiche } from '../../../../lib/location/suivi/biensRegroupes';

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

/** 🔴 Arno (25/10/2026) — la fin du titre du Portefeuille, qui passe à la ligne sous 430 px (et seulement là). */
const TITRE_SUITE = '(honoraires de gestion HT)';

export function FeuilleDuMois({ d, lignes, ctx, annee, mois, negociateur, onDetail, onRelire }: Props) {
  const cle = `${annee}-${String(mois).padStart(2, '0')}`;
  const duMois = lignes.filter((a) => a.dateSignature.startsWith(cle));
  // 🔴 Arno (25/10/2026, 426) — la règle des annexes (à partir de la bascule, une annexe ne compte pas comme une gestion).
  const regleA = regleAnnexesDe(d);
  const g = gestionDuMois(d.gestionLignes ?? [], cle, regleA);
  // 🔴 Arno (25/10/2026) — le portefeuille de gestion depuis le 1er janvier (même source et même calcul que la ligne du mois).
  const cumul = gestionDepuisJanvier(d.gestionLignes ?? [], cle, regleA);
  // 🔴 Arno (25/10/2026, 427) — les NOUVELLES GLI « depuis le 1er janvier » (celles du mois sont dans le résumé du mois).
  const gliC = gliDepuisJanvier(d.gli ?? [], d.margesGli ?? [], cle);
  const [edition, setEdition] = useState<number | string | null>(null);
  // 🔴 Arno (24/10/2026) — la fiche ouverte depuis le panneau (locataire ou bien) ; enregistrée : fermée, et la page se relit.
  const [fiche, setFiche] = useState<{ sorte: 'locataire' | 'lot' | 'dossier'; id: number; libelle: string; bailId?: number | null; activiteId?: number | null; origineLigne?: string } | null>(null);
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
        <ModaleDossierLocation activiteId={fiche.id} onFermer={() => setFiche(null)} onEnregistre={ficheEnregistree} onRelire={onRelire} />
      )}
      {fiche !== null && fiche.sorte === 'locataire' && (
        // 🔴 Arno (25/10/2026) — les cartes du bloc 1 en modification ; enregistrée, elle RESTE ouverte et la ligne se relit derrière.
        <ModaleFicheLocataire locataireId={fiche.id} bailId={fiche.bailId ?? null} activiteId={fiche.activiteId ?? null} libelle={fiche.libelle} onFermer={() => setFiche(null)} onEnregistre={onRelire} />
      )}
      {fiche !== null && fiche.sorte === 'lot' && (
        // 🔴 Arno (25/10/2026, 425) — depuis une ligne du Suivi : le bloc 9 « Origine du contact » (la location de la ligne ; la modale reste ouverte).
        <ModaleCaracteristiquesBien lotId={fiche.id} titre="Fiche du bien" retourMot="Suivi du mois" trace={TRACE_SUIVI}
          onFermer={() => setFiche(null)} onEnregistre={ficheEnregistree}
          blocApres={(numero) => <BlocOrigineLocation activiteId={fiche.activiteId ?? null} numero={numero} origineLigne={fiche.origineLigne ?? ''} onEnregistre={onRelire}
            {...(fiche.activiteId ? { onAllerAuxCases: () => setFiche({ sorte: 'dossier', id: fiche.activiteId as number, libelle: fiche.libelle }) } : {})} />} />
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
                      <td data-mot="Gestion" className={`fdm-montant${prime === 0 ? ' fdm-vide' : ''}`}>
                        {prime === 0 ? '' : primeSaisieALaMain(a) ? <PrimeSaisieMain montant={eur(prime)} repere={id} /> : eur(prime)}</td>
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
                            <button key={`lot-${b.id}`} type="button" className="tdb-pilule fdm-raccourci" onClick={() => setFiche({ sorte: 'lot', id: b.id, libelle: b.libelle, activiteId: a.bailId !== null ? Number(a.id) : null,
                              origineLigne: libelleOrigineContact(a.origineContact ?? null, a.origineContactPrecision ?? null) })}
                              data-fiche-bien={b.id} title={b.libelle}>{(a.lots ?? []).length > 1 ? `Fiche du bien — ${b.libelle}` : 'Fiche du bien'}</button>
                          )) : <span className="fdm-non-rattache" data-bien-non-rattache>Fiche du bien : non rattaché</span>}
                          {/* 🔴 Arno (26/10/2026, décision C, 431) — une ligne « Bail » d'un locataire en place se convertit en « Mandat de gestion seul »
                              (réversible) ; sur la MÊME ligne que ses voisins (Arno, 26/10/2026) : son bloc se fond dans la rangée, sa confirmation
                              passe dessous. */}
                          <ConversionMandat a={a} onFini={onRelire} />
                          {/* 🔴 LOT LS1 (suppression autorisée par Arno) — « Supprimer » la location, en dernier, au texte rouge discret ; sa confirmation
                              dit ce qui part (la location, les profils des locataires) et ce qui reste (propriétaires, bien). */}
                          <SupprimerLocation id={a.id} onFini={onRelire} />
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
        {/* 🔴 Arno (26/10/2026) — une ligne par BIEN (lot principal + annexes) ; le titre compte les biens affichés. */}
        <h3 id="fdm-gestions">Nouvelles gestions du mois <small className="loc-muet" data-compte-biens>({regrouperParBien(g.nouvelles, d.liensAnnexes).length})</small></h3>
        <TableGestion lignes={g.nouvelles} perdus={false} regle={regleA} liens={d.liensAnnexes} />
      </section>
      {/* 🔴 Arno (26/10/2026, accord explicite) — le bloc « En attente de locataire (N) » est RETIRÉ de la page (« il ne sert à rien »). Seul
          l'affichage disparaît : la règle reste (un bien rentré vide n'est compté qu'à l'entrée de son premier locataire). */}
      {/* 🔴 Arno (26/10/2026) — les biens SORTIS SANS AVOIR ÉTÉ COMPTÉS (en attente de locataire, jamais entrés dans le portefeuille) : ni « −N »,
          ni « Mandats de gestion perdus » ; montrés ici, repliés — rien ne disparaît de l'écran. */}
      {(() => {
        const sortis = regrouperParBien((d.gestionSortiesNonComptees ?? []).filter((l) => l.effetLe.slice(0, 7) === cle), d.liensAnnexes);
        if (sortis.length === 0) return null;
        return (
          <BlocReplie id="fdm-sortis-non-comptes" section="sortis-non-comptes" titre={`Sortis sans avoir été comptés (${sortis.length})`}
            resume="en attente de locataire, jamais entrés dans le portefeuille : ni perte de mandat, ni « −1 »" donnees={{ 'data-bloc': 'sortis-non-comptes' }}>
            <ul className="fdm-attente" data-liste-sortis-non-comptes>
              {sortis.map((gr) => {
                const l = gr.principal ?? gr.lignes[0];
                return (
                  <li key={gr.cle} data-sorti-non-compte={gr.lotId ?? ''}>
                    {gr.lotId !== null ? <a href={`/admin/location/bien/${gr.lotId}`}>{gr.libelle}</a> : gr.libelle}
                    {gr.annexes.length > 0 && <BulleAnnexes annexes={gr.annexes} place="dessous" repere={gr.cle} />}
                    <span className="loc-muet"> — {l.proprietaire || 'propriétaire non renseigné'} — sorti le {l.effetLe.split('-').reverse().join('/')}, sans avoir été compté</span>
                  </li>
                );
              })}
            </ul>
          </BlocReplie>
        );
      })()}
      <section className="tdb-section" aria-labelledby="fdm-perdus" data-bloc="mandats-perdus">
        <h3 id="fdm-perdus">Mandats de gestion perdus <small className="loc-muet" data-compte-biens>({regrouperParBien(g.perdues, d.liensAnnexes).length})</small></h3>
        <TableGestion lignes={g.perdues} perdus regle={regleA} liens={d.liensAnnexes} />
      </section>

      {/* 🔴 Arno (25/10/2026) — « RÉSUMÉ DU MOIS » : le bas de feuille rangé par FAMILLES (le composant `ResumePeriode`, partagé avec le
          « Résumé de l'année » du Suivi annuel). */}
      <ResumePeriode d={d} resume={resumeDuMoisComplet(d, lignes, ctx, cle, negociateur)} unite="mois" libelle={nom} idp="fdm" moisCascade={cle} onRelire={onRelire}
        cumul={cumul} cumulTitre={`Depuis le 1er janvier ${annee}`} gliCumul={gliC} onDetail={onDetail} />

      {/* 🔴 Arno (27/10/2026) — « Apporteurs du mois » : le module partagé avec le Suivi annuel (`ModuleApporteurs`), seule la période change. */}
      <ModuleApporteurs lignes={duMois} ctx={ctx} mois={[cle]} aujourdhui={ctx.aujourdhui ?? d.aujourdhui} titre="Apporteurs du mois" idp="fdm" bloc="apporteurs-mois"
        libelle={nom} motVide="ce mois-ci" onDetail={onDetail} />
    </div>
  );
}

/**
 * ══ 🔴 Arno (25-27/10/2026) — LE MODULE « APPORTEURS » : la page du mois (« Apporteurs du mois ») ET le Suivi annuel (« Apporteur de l'année… »)
 * — un seul composant, les mêmes règles de calcul et de classement (`apporteursEtCollegues`, `totalDesIntermediaires`, `detailCollegue`) ;
 * seule la PÉRIODE change : `lignes` (les affaires de la période), `mois` (ses mois « AAAA-MM » : la part gestion « Récurrent » due ces
 * mois-là s'ajoute au dû, 413).
 */
export function ModuleApporteurs({ lignes, ctx, mois, aujourdhui, titre, idp, bloc, libelle, motVide, onDetail }: {
  lignes: readonly ActiviteCalcul[]; ctx: ContexteCalcul; mois: readonly string[]; aujourdhui: string;
  titre: string; idp: string; bloc: string;
  /** La fin du titre des listes ouvertes (« Affaires de X — <libelle> »). */
  libelle: string;
  /** « ce mois-ci », « sur la période » : les phrases sans affaire. */
  motVide: string;
  onDetail: (titre: string, ids: (number | string)[]) => void;
}) {
  // 413 — la part gestion « Récurrent » due ces mois-là s'ajoute au dû de l'apporteur et de son collègue. Plusieurs mois : chaque mois
  // calculé comme le module du mois, additionné au centime affiché (la période = la somme de ses mois).
  const ac = apporteursEtColleguesDesMois(lignes, ctx.apporteurs, { lignes: ctx.recurrents ?? [], mois, aujourdhui });
  /* 🔴 Arno (26/10/2026) — le Total du tableau « Apporteurs du mois » : les seules affaires passées par un intermédiaire. */
  const interm = totalDesIntermediaires(ac);
  const collegues = ac.collegues.map((x) => ({ x, det: detailCollegue(x) }));
  // 🔴 Arno (25/10/2026) — les collègues dépliés (repliés au chargement ; plusieurs à la fois).
  const [colOuverts, setColOuverts] = useState<ReadonlySet<string>>(() => new Set());
  const basculerCollegue = (c: string): void => setColOuverts((s) => { const n = new Set(s); if (n.has(c)) n.delete(c); else n.add(c); return n; });
  return (
    <section className="tdb-section" aria-labelledby={`${idp}-apporteurs`} data-bloc={bloc}>
      <h3 id={`${idp}-apporteurs`} data-titre-apporteurs>{titre}</h3>
      {/* 🔴 Arno (25/10/2026) — TOUS les apporteurs du mois (internes, externes, collègues « directement », commission non nommée), triés
          par CA apporté ; le meilleur mis en avant (ex aequo compris) ; puis le Total des seules affaires passées par un intermédiaire
          (Arno, 26/10/2026 : la ligne « Sans apporteur » est retirée). */}
      {lignes.length === 0 ? <p className="loc-muet">Aucune affaire {motVide}.</p> : (
        <div className="fdm-deux">
          <table className="fdm-table fdm-apporteurs">
            <thead><tr><th scope="col">Apporteur</th><th scope="col">Affaires</th><th scope="col">CA apporté</th><th scope="col">Hono. d’apporteur</th></tr></thead>
            <tbody>{[...ac.apporteurs.filter((x) => x.sorte !== 'non_nomme'), ...ac.apporteurs.filter((x) => x.sorte === 'non_nomme')].map((x) => (
              <tr key={`${x.apporteurId ?? x.nom}`} data-apporteur-mois={x.nom} className={x.meilleur ? 'fdm-meilleur' : undefined}>
                <th scope="row">{x.nom}{x.aRattacher && <span className="fdm-orange"> · à rattacher</span>}
                  {(x.sorte === 'interne' || x.sorte === 'externe') && <span className={`fdm-sorte fdm-sorte--${x.sorte}`} data-sorte-apporteur={x.sorte}>{x.sorte === 'interne' ? 'Interne' : 'Externe'}</span>}
                  {x.meilleur && <span className="fdm-badge-meilleur" data-meilleur-apporteur>Meilleur apporteur</span>}</th>
                <td data-mot="Affaires"><button type="button" className="tdb-chiffre" onClick={() => onDetail(`Affaires de ${x.nom} — ${libelle}`, x.ids)}>{x.nb}</button></td>
                <td data-mot="CA apporté"><button type="button" className="tdb-chiffre" onClick={() => onDetail(`Affaires de ${x.nom} — ${libelle}`, x.ids)}>{eur(x.ca)}</button></td>
                <td data-mot="Hono. d’apporteur">{eur(x.commission)}</td>
              </tr>))}
              {/* 🔴 Arno (26/10/2026, accord explicite) — la ligne « Sans apporteur » est RETIRÉE : ce tableau ne montre que les affaires passées
                  par un intermédiaire ; elles restent comptées partout ailleurs (CA, baux, résultat, négociateurs). */}
              {ac.apporteurs.length === 0 && <tr data-aucun-apporteur><td colSpan={4} className="loc-muet">Aucun apporteur {motVide}.</td></tr>}</tbody>
            <tfoot><tr data-apporteur-mois="total">
              <th scope="row">Total</th>
              <td data-mot="Affaires"><button type="button" className="tdb-chiffre" onClick={() => onDetail(`Affaires d’apporteurs — ${libelle}`, interm.ids)}>{interm.nb}</button></td>
              <td data-mot="CA apporté" data-total-apporteurs-ca>{eur(interm.ca)}</td><td data-mot="Hono. d’apporteur">{eur(interm.commission)}</td>
            </tr></tfoot>
          </table>
          {/* 🔴 Arno (25/10/2026) — les COLLÈGUES : via leurs apporteurs ET en direct, cumulés ; deux sous-lignes et un total quand les
              deux existent ; triés par CA total ; le meilleur badgé ; Total = somme des totaux des collègues. */}
          <table className="fdm-table fdm-collegues">
            <thead><tr><th scope="col">Collègues (via leurs apporteurs et en direct)</th><th scope="col">Affaires</th><th scope="col">CA apporté</th><th scope="col">Hono. d’apporteur</th></tr></thead>
            {/* 🔴 Arno (25/10/2026) — UNE ligne par collègue, REPLIÉE au chargement : ses TOTAUX (gras) et, en petit sous le nom, les origines
                présentes. S'il y a plus d'une ligne de détail (deux origines, ou plusieurs apporteurs), un chevron : la ligne se déplie en
                sous-lignes empilées et alignées d'une colonne à l'autre (via ses apporteurs, un apporteur par sous-ligne dès deux, en direct,
                Total). Chaque montant au centime affiché : Σ apporteurs = via ; via + direct = Total. */}
            <tbody>{ac.collegues.length === 0 ? <tr><td colSpan={4} className="loc-muet">Aucun collègue {motVide}.</td></tr> : collegues.map(({ x, det }) => {
              const ouvert = det.depliable && colOuverts.has(x.cle);
              const lien = (texte: string, titre: string, ids: (number | string)[], repere: string) => (
                <button type="button" className="tdb-chiffre" onClick={() => onDetail(`${titre} — ${libelle}`, ids)} data-detail-origine={repere}>{texte}</button>);
              const titre = (l: LigneDetailCollegue): string => l.sorte === 'total' ? `Affaires de ${x.libelle}` : l.sorte === 'apporteur' ? `Affaires de ${x.libelle} — via ${l.mot}`
                : `Affaires de ${x.libelle} — ${l.mot}`;
              const repere = (l: LigneDetailCollegue): string => (l.sorte === 'apporteur' ? l.cle : l.sorte);
              const badge = x.meilleur && <span className="fdm-badge-meilleur" data-meilleur-collegue>Meilleur collègue</span>;
              const total = det.lignes[det.lignes.length - 1];
              const classe = `fdm-collegue${ouvert ? ' fdm-collegue--deux' : ''}${det.depliable ? ' fdm-collegue--depliable' : ''}${x.cle === 'a-rattacher' ? ' fdm-orange-ligne' : ''}${x.meilleur ? ' fdm-meilleur' : ''}`;
              const chevron = det.depliable && (
                <button type="button" className="fdm-chevron fdm-chevron--collegue" aria-expanded={ouvert} data-deplier-collegue={x.cle}
                  aria-label={`${ouvert ? 'Replier' : 'Déplier'} le détail — ${x.libelle}`} onClick={(e) => { e.stopPropagation(); basculerCollegue(x.cle); }}>
                  <span aria-hidden="true">{ouvert ? '▾' : '▸'}</span></button>);
              // Un clic sur la ligne (hors montants cliquables et liens) la déplie, comme le chevron.
              const surLigne = det.depliable ? (e: { target: EventTarget }) => { if ((e.target as Element).closest('button, a') === null) basculerCollegue(x.cle); } : undefined;
              if (ouvert) {
                const pile = (cellule: (l: LigneDetailCollegue) => ReactNode) => (
                  <span className="fdm-pile">
                    <span className="fdm-pile-l fdm-pile-l--nom" aria-hidden="true" />
                    {det.lignes.map((l) => (
                      <span key={l.cle} className={`fdm-pile-l ${l.sorte === 'total' ? 'fdm-pile-l--total' : 'fdm-pile-l--detail'}${l.sorte === 'apporteur' ? ' fdm-pile-l--apporteur' : ''}`}
                        data-pile={l.sorte} data-pile-cle={l.cle} data-pile-mot={l.sorte === 'apporteur' ? `· ${l.mot}` : l.sorte === 'total' ? 'total' : l.mot}>{cellule(l)}</span>))}
                  </span>);
                return (
                  <tr key={x.cle} data-collegue-mois={x.libelle} data-deux-chemins data-collegue-deplie className={classe} onClick={surLigne}>
                    <th scope="row">
                      <span className="fdm-pile">
                        <span className="fdm-pile-l fdm-pile-l--nom">{chevron}{x.libelle}{badge}</span>
                        {det.lignes.map((l) => (
                          <span key={l.cle} className={`fdm-pile-l ${l.sorte === 'total' ? 'fdm-pile-l--total' : 'fdm-pile-l--detail'}${l.sorte === 'apporteur' ? ' fdm-pile-l--apporteur' : ''}`}
                            data-pile={l.sorte} data-pile-cle={l.cle}>
                            {l.sorte === 'apporteur' ? `· ${l.mot}` : l.mot}
                            {l.sorte === 'via' && det.seulApporteur !== null && <small className="fdm-pile-seul" data-seul-apporteur>&nbsp;· {det.seulApporteur}</small>}
                          </span>))}
                      </span></th>
                    <td data-mot="Affaires">{pile((l) => lien(String(l.nb), titre(l), l.ids, `${repere(l)}-nb`))}</td>
                    <td data-mot="CA apporté">{pile((l) => lien(eur(l.caCentimes / 100), titre(l), l.ids, `${repere(l)}-ca`))}</td>
                    <td data-mot="Hono. d’apporteur">{pile((l) => eur(l.commissionCentimes / 100))}</td>
                  </tr>
                );
              }
              return (
                <tr key={x.cle} data-collegue-mois={x.libelle} className={classe} onClick={surLigne}>
                  <th scope="row">{chevron}{x.libelle}{badge}
                    <small className="fdm-origine-collegue" data-origines-collegue>{det.mention}</small></th>
                  <td data-mot="Affaires" className="fdm-fort-cellule">{lien(String(total.nb), titre(total), total.ids, 'total-nb')}</td>
                  <td data-mot="CA apporté" className="fdm-fort-cellule">{lien(eur(total.caCentimes / 100), titre(total), total.ids, 'total-ca')}</td>
                  <td data-mot="Hono. d’apporteur" className="fdm-fort-cellule">{eur(total.commissionCentimes / 100)}</td>
                </tr>
              );
            })}</tbody>
            {ac.collegues.length > 0 && (
              <tfoot><tr data-collegue-mois="total">
                <th scope="row">Total</th>
                <td data-mot="Affaires">{collegues.reduce((t2, c2) => t2 + c2.x.nb, 0)}</td>
                <td data-mot="CA apporté" data-total-collegues-ca>{eur(collegues.reduce((t2, c2) => t2 + c2.det.lignes[c2.det.lignes.length - 1].caCentimes, 0) / 100)}</td>
                <td data-mot="Hono. d’apporteur">{eur(collegues.reduce((t2, c2) => t2 + c2.det.lignes[c2.det.lignes.length - 1].commissionCentimes, 0) / 100)}</td>
              </tr></tfoot>
            )}
          </table>
        </div>
      )}
    </section>
  );
}

/**
 * 🔴 Arno (25/10/2026) — LE « RÉSUMÉ » D'UNE PÉRIODE, rangé par familles : le Résumé du mois (Suivi du mois) et le Résumé de la période (Suivi
 * annuel, « Début / Fin ») sont CE composant, avec leurs chiffres (`ResumeCalcule` : un mois, ou la somme des mois de l'année) et les mots de leur période.
 * « Depuis le 1er janvier » (mois) ou « Depuis le début (<première année>) » (année) : la même grille, le même style de titre.
 */
/** 🔴 Arno (26/10/2026) — la liste « Depuis le 1er janvier / le début » : une ligne par bien, MOIS PAR MOIS (l'ordre des mois gardé). PUR. */
function biensParMois(biens: readonly MouvementGestion[], liens: readonly LienAnnexeAffiche[] | undefined) {
  const mois = [...new Set(biens.map((b) => b.mois))];
  return mois.flatMap((m) => regrouperParBien(biens.filter((b) => b.mois === m), liens).map((g) => ({ ...g, cle: `${m}-${g.cle}` })));
}

export function ResumePeriode({ d, resume, unite, libelle, idp, moisCascade, cumul, cumulTitre, gliCumul, onDetail, mention, onRelire }: {
  d: DonneesTableau; resume: ResumeCalcule; unite: 'mois' | 'periode'; libelle: string; idp: string; moisCascade: string;
  cumul: GestionDepuisJanvier; cumulTitre: string; gliCumul: GliPeriode; onDetail: (titre: string, ids: (number | string)[]) => void; mention?: ReactNode;
  /** 🔴 Arno (26/10/2026) — relire la page après un rattachement de négociateur (absent : le bloc « à rapprocher » n'est pas montré). */
  onRelire?: () => void;
}) {
  const { r, ventilation } = resume;
  const mots = unite === 'mois' ? MOTS_MOIS : { ...MOTS_PERIODE, libelle };
  const [cumulOuvert, setCumulOuvert] = useState<'entrees' | 'sorties' | null>(null);
  const [gliOuvert, setGliOuvert] = useState<'mois' | 'cumul' | null>(null);
  const titreMois = `Portefeuille de gestion — ${unite === 'mois' ? libelle.toLowerCase() : libelle}`;
  const titrePortefeuille = `${titreMois} ${TITRE_SUITE}`;
  // 🔴 Arno (25/10/2026) — une PÉRIODE a un libellé long : « (honoraires de gestion HT) » passe à la ligne (comme au téléphone) et la taille se
  // règle sur la plus longue des deux lignes ; le mois garde son titre sur une ligne.
  const tailleTitrePortefeuille = { '--lettres': unite === 'mois' ? titrePortefeuille.length : Math.max(titreMois.length, TITRE_SUITE.length),
    '--lettres-ligne': Math.max(titreMois.length, TITRE_SUITE.length) } as CSSProperties;
  return (
      <section className="tdb-section fdm-bas" aria-labelledby={`${idp}-bas`} data-bloc={unite === 'mois' ? 'bas-de-feuille' : 'resume-periode'}>
        <h3 id={`${idp}-bas`}>{unite === 'mois' ? 'Résumé du mois' : 'Résumé de la période'} — {libelle}</h3>
        {mention}
        {/* 🔴 Arno (25/10/2026) — DEUX COLONNES INDÉPENDANTES (des piles, répartition « A ») : à gauche Résultat puis CA par statut, à droite
            Portefeuille puis Honoraires ; chaque bloc démarre juste sous le précédent ; au téléphone, une seule colonne (Résultat, CA par statut,
            Portefeuille, Honoraires) ; les négociateurs dessous, sur toute la largeur. */}
        <div className="fdm-familles">
          <div className="fdm-colonne" data-colonne="gauche">
          <section className="fdm-famille" aria-labelledby={`${idp}-f1`} data-famille="resultat">
            <h4 id={`${idp}-f1`}>{unite === 'mois' ? 'Résultat du mois' : 'Résultat de la période'}</h4>
            <dl className="fdm-cascade-mois">
              <div className="fdm-fort"><dt>CA HT global</dt><dd><button type="button" className="tdb-chiffre" onClick={() => onDetail(`TOTAL CA HT — ${libelle}`, resume.ids)} data-total="ca">{eur(r.resultat.ca)}</button></dd></div>
              {/* 🔴 Arno (25/10/2026, suite) — les honoraires d'apporteurs VENTILÉS : externes + internes = l'ancien total, au centime. */}
              <div><dt>− Commissions apporteurs externes</dt><dd data-total="apporteurs-externes">{eur(ventilation.externes.centimes / 100)}</dd></div>
              <div><dt>− Commissions apporteurs internes</dt><dd data-total="apporteurs-internes">{eur(ventilation.internes.centimes / 100)}</dd></div>
              {/* 🔴 Arno (24/10/2026, 419) — affichée même à 0 : la cascade se lit d'un coup d'œil. */}
              <div><dt>− Rémunération des collègues sur leurs apporteurs</dt><dd data-total="collegues">{eur(ventilation.collegues.centimes / 100)}</dd></div>
              <div className="fdm-fort fdm-egal"><dt>= CA HT net</dt><dd data-total="ca-net">{eur(r.resultat.caNet)}</dd></div>
            </dl>
          </section>

          <section className="fdm-famille" aria-labelledby={`${idp}-f2`} data-famille="statuts">
            <h4 id={`${idp}-f2`}>CA par statut du bien</h4>
            <table className="fdm-mini">
              <thead><tr><th scope="col">Statut</th><th scope="col">Dossiers</th><th scope="col">CA HT</th><th scope="col">Part</th></tr></thead>
              <tbody>
                {r.parStatut.map((x) => (
                  <tr key={x.nature} data-statut-ca={x.nature}>
                    <th scope="row"><PastilleNature nature={x.nature} /></th>
                    <td data-mot="Dossiers">{x.nb}</td>
                    <td data-mot="CA HT">{x.nb === 0 ? eur(0) : <button type="button" className="tdb-chiffre" onClick={() => onDetail(`CA — ${LIBELLE_NATURE_BIEN[x.nature]} — ${libelle}`, x.ids)}>{eur(x.ca)}</button>}</td>
                    <td data-mot="Part">{x.part === null ? '—' : pctUn(x.part)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr data-statut-ca="total"><th scope="row">Total</th><td data-mot="Dossiers">{r.parStatut.reduce((s, x) => s + x.nb, 0)}</td>
                <td data-mot="CA HT">{eur(r.resultat.ca)}</td><td data-mot="Part">{r.resultat.ca === 0 ? '—' : '100 %'}</td></tr></tfoot>
            </table>
          </section>

          </div>
          <div className="fdm-colonne" data-colonne="droite">
          {/* 🔴 Arno (25/10/2026) — la taille du titre (portée par le bloc) vaut aussi pour le sous-titre « Depuis le 1er janvier ». */}
          <section className="fdm-famille" aria-labelledby={`${idp}-f4`} data-famille="portefeuille" style={tailleTitrePortefeuille}>
            {/* 🔴 Arno (25/10/2026) — le titre porte le mois, sur UNE ligne (police réduite si besoin, jamais coupé). */}
            <h4 id={`${idp}-f4`} className={unite === 'mois' ? 'fdm-titre-une-ligne' : 'fdm-titre-une-ligne fdm-titre-deux-lignes'} data-titre-portefeuille style={tailleTitrePortefeuille}>
              <span>{titreMois}</span> <span className="fdm-titre-suite">{TITRE_SUITE}</span></h4>
            {/* 🔴 Arno (25/10/2026) — UNE seule grille de colonnes pour le mois et « Depuis le 1er janvier » : Gestions | Biens | / mois | / an,
                au même x en haut et en bas (largeurs fixes), même hauteur de ligne ; le Solde du haut réparti dans ses colonnes. */}
            <table className="fdm-mini fdm-portefeuille">
              <colgroup><col className="fdm-pf-c1" /><col className="fdm-pf-c2" /><col className="fdm-pf-c3" /><col className="fdm-pf-c4" /></colgroup>
              <thead><tr><th scope="col">Gestions</th><th scope="col">Biens</th><th scope="col">/ mois</th><th scope="col">/ an</th></tr></thead>
              <tbody data-portefeuille-mois>
                <tr data-portefeuille="gagnes"><th scope="row">Gagnées (entrées)</th><td data-mot="Biens">{r.portefeuille.gagnes.nb}</td>
                  <td data-mot="/ mois">{eur(r.portefeuille.gagnes.mensuel)}</td><td data-mot="/ an">{eur(r.portefeuille.gagnes.annuel)}</td></tr>
                <tr data-portefeuille="perdus"><th scope="row">Perdues (sorties)</th><td data-mot="Biens">{r.portefeuille.perdus.nb}</td>
                  <td data-mot="/ mois">{r.portefeuille.perdus.mensuel === 0 ? eur(0) : `−${eur(r.portefeuille.perdus.mensuel)}`}</td>
                  <td data-mot="/ an">{r.portefeuille.perdus.annuel === 0 ? eur(0) : `−${eur(r.portefeuille.perdus.annuel)}`}</td></tr>
                <tr data-portefeuille="solde" className={`fdm-pf-solde tdb-signe tdb-signe--${sensSolde(r.portefeuille.solde.mensuel)}`}><th scope="row">Solde</th>
                  <td data-mot="Biens">{r.portefeuille.gagnes.nb - r.portefeuille.perdus.nb >= 0 ? '+' : '−'}{Math.abs(r.portefeuille.gagnes.nb - r.portefeuille.perdus.nb)}</td>
                  <td data-mot="/ mois" data-total="balance">{signeEur(r.portefeuille.solde.mensuel)}</td>
                  <td data-mot="/ an" data-total="balance-an">{signeEur(r.portefeuille.solde.annuel)}</td></tr>
                {r.portefeuille.sansLoyer > 0 && <tr className="fdm-pf-note"><td colSpan={4} className="loc-muet">{r.portefeuille.sansLoyer} bien(s) sans loyer de départ saisi : non comptés (rien n’est inventé).</td></tr>}
                {/* 🔴 Arno (25/10/2026, 426) — les annexes louées séparément ce mois (après la bascule seulement). */}
                {r.annexesLouees > 0 && <tr className="fdm-pf-note"><td colSpan={4} className="loc-muet" data-annexes-louees>{r.annexesLouees} annexe(s) louée(s) séparément : comptées en relocation, pas en nouvelle gestion.</td></tr>}
                <LigneGli g={resume.gli} portee="mois" ouvert={gliOuvert} onOuvrir={setGliOuvert} />
              </tbody>
              {/* 🔴 Arno (25/10/2026) — « DEPUIS LE 1ER JANVIER » : la somme des gains (et pertes) mensuels de chaque mois, comptés UNE fois. */}
              <tbody data-portefeuille-cumul>
                <tr className="fdm-pf-sous-titre"><th colSpan={4} scope="colgroup" className="fdm-cumul-titre"><span className="fdm-titre-bloc fdm-titre-taille" data-sous-titre-portefeuille>{cumulTitre}</span></th></tr>
                <tr className="fdm-pf-entetes" aria-hidden="true"><th>Gestions</th><th>Biens</th><th>/ mois</th><th>/ an</th></tr>
                <tr data-cumul="entrees"><th scope="row">Gestions entrées</th><td data-mot="Biens">{cumul.entrees.nb}</td>
                  <td data-mot="/ mois"><button type="button" className="tdb-chiffre" aria-expanded={cumulOuvert === 'entrees'} onClick={() => setCumulOuvert((v) => (v === 'entrees' ? null : 'entrees'))}>{eur(cumul.entrees.mensuel)}</button></td>
                  <td data-mot="/ an">{eur(cumul.entrees.annuel)}</td></tr>
                <tr data-cumul="sorties"><th scope="row">Gestions sorties</th><td data-mot="Biens">{cumul.sorties.nb}</td>
                  <td data-mot="/ mois"><button type="button" className="tdb-chiffre" aria-expanded={cumulOuvert === 'sorties'} onClick={() => setCumulOuvert((v) => (v === 'sorties' ? null : 'sorties'))}>{cumul.sorties.mensuel === 0 ? eur(0) : `−${eur(cumul.sorties.mensuel)}`}</button></td>
                  <td data-mot="/ an">{cumul.sorties.annuel === 0 ? eur(0) : `−${eur(cumul.sorties.annuel)}`}</td></tr>
                <tr data-cumul="solde" className={`fdm-pf-solde tdb-signe tdb-signe--${sensSolde(cumul.solde.mensuel)}`}><th scope="row">Solde mensuel</th>
                  <td data-mot="Biens">{cumul.entrees.nb - cumul.sorties.nb >= 0 ? '+' : '−'}{Math.abs(cumul.entrees.nb - cumul.sorties.nb)}</td>
                  <td data-mot="/ mois">{signeEur(cumul.solde.mensuel)}</td><td data-mot="/ an">{signeEur(cumul.solde.annuel)}</td></tr>
                {cumul.sansLoyer > 0 && <tr className="fdm-pf-note"><td colSpan={4} className="loc-muet" data-cumul-sans-loyer>{cumul.sansLoyer} bien(s) sans loyer de départ saisi {unite === 'mois' ? 'depuis le 1er janvier' : 'depuis le début'} : non comptés.</td></tr>}
                <LigneGli g={gliCumul} portee="cumul" ouvert={gliOuvert} onOuvrir={setGliOuvert} />
              </tbody>
            </table>
            {gliOuvert !== null && <ListeGli g={gliOuvert === 'mois' ? resume.gli : gliCumul} titre={gliOuvert === 'mois' ? `Nouvelle GLI Garantme — ${unite === 'mois' ? libelle.toLowerCase() : libelle}` : `Nouvelle GLI Garantme ${cumulTitre.charAt(0).toLowerCase() + cumulTitre.slice(1)}`} />}
            {cumulOuvert !== null && (
              <ul className="fdm-cumul-biens" data-cumul-biens={cumulOuvert}>
                {/* 🔴 Arno (26/10/2026) — une ligne par BIEN et par mois : le lot principal, « + N annexe(s) » en bulle ; / mois = la somme. */}
                {biensParMois(cumulOuvert === 'entrees' ? cumul.entrees.biens : cumul.sorties.biens, d.liensAnnexes).map((gr) => {
                  const x = gr.principal ?? gr.lignes[0];
                  const mensuel = sommeDuGroupe(gr, (y) => y.mensuel);
                  return (
                  <li key={gr.cle} data-cumul-bien={gr.lotId ?? 'fichier'}>
                    <span><span>{gr.lotId !== null ? <a href={`/admin/location/bien/${gr.lotId}`}>{gr.libelle}</a> : gr.libelle}
                      <BulleAnnexes annexes={gr.annexes} repere={gr.lotId ?? undefined}
                        note={gr.principalAbsent ? 'Le lot principal n’a pas bougé ce mois-là : seule son annexe figure ici.' : null}
                        extra={(a) => <span className="anx-bulle-extra">{a.ligne.annexeNonComptee ? ' — annexe non comptée' : ''}{gr.principal !== null && a.ligne.mensuel !== null ? ` — ${eur(a.ligne.mensuel)} / mois (inclus)` : ''}</span>} /></span>
                      <small>{NOMS_MOIS[Number(x.mois.slice(5, 7)) - 1]} {x.mois.slice(0, 4)}</small></span>
                    <span>{mensuel === null ? <span className="loc-muet">sans loyer — non compté</span> : `${eur(mensuel)} / mois`}</span>
                  </li>);
                })}
                {(cumulOuvert === 'entrees' ? cumul.entrees.biens : cumul.sorties.biens).length === 0 && <li className="loc-muet">Aucun bien.</li>}
              </ul>
            )}
          </section>

          <section className="fdm-famille" aria-labelledby={`${idp}-f3`} data-famille="gestion">
            <h4 id={`${idp}-f3`}>Honoraires avec / sans gestion</h4>
            <table className="fdm-mini">
              <thead><tr><th scope="col">Location</th><th scope="col">Dossiers</th><th scope="col">CA HT</th><th scope="col">Part</th></tr></thead>
              <tbody>
                <tr data-gestion-ca="avec"><th scope="row">Avec gestion</th><td data-mot="Dossiers">{r.gestion.avec.nb}</td><td data-mot="CA HT" data-total="avec">{eur(r.gestion.avec.ca)}</td>
                  <td data-mot="Part">{r.gestion.avec.part === null ? '—' : pctUn(r.gestion.avec.part)}</td></tr>
                <tr data-gestion-ca="sans"><th scope="row">Sans gestion</th><td data-mot="Dossiers">{r.gestion.sans.nb}</td><td data-mot="CA HT" data-total="sans">{eur(r.gestion.sans.ca)}</td>
                  <td data-mot="Part">{r.gestion.sans.part === null ? '—' : pctUn(r.gestion.sans.part)}</td></tr>
                {/* 🔴 Arno (27/10/2026) — les lignes « À qualifier » (le même statut que leur badge et que « CA par statut du bien »). */}
                <tr data-gestion-ca="a_qualifier"><th scope="row">À qualifier</th><td data-mot="Dossiers">{r.gestion.aQualifier.nb}</td><td data-mot="CA HT" data-total="a_qualifier">{eur(r.gestion.aQualifier.ca)}</td>
                  <td data-mot="Part">{r.gestion.aQualifier.part === null ? '—' : pctUn(r.gestion.aQualifier.part)}</td></tr>
              </tbody>
              <tfoot><tr data-gestion-ca="total"><th scope="row">Total</th><td data-mot="Dossiers">{r.gestion.avec.nb + r.gestion.sans.nb + r.gestion.aQualifier.nb}</td>
                <td data-mot="CA HT">{eur(r.resultat.ca)}</td><td data-mot="Part">{r.resultat.ca === 0 ? '—' : '100 %'}</td></tr></tfoot>
            </table>
          </section>

          </div>
          {/* 🔴 Arno (25/10/2026) — le RÉSULTAT NET DE L'AGENCE : après les 4 blocs, avant les négociateurs, sur toute la largeur.
              🔴 Arno (26/10/2026, 428) — administrateur, ou tuile Location + « Accès au Résultat net » à Oui ; pour tout autre compte, ABSENT
              (ni version tronquée, ni mention — et le serveur n'en envoie rien). */}
          {/* 🔴 Arno (26/10/2026) — REPLIÉ par défaut sur une ligne (BlocReplie) : le titre ; à droite « CA net de toutes variables », le
              montant (vert, gras), « (69,8 %) » et le chevron ; déplié, la cascade inchangée (ses « i » ne replient rien). */}
          {(d.voirCommissions || d.voirResultatNet === true) && (
            <BlocReplie id={`${idp}-f6`} section="resultat-net" classe="fdm-famille fdm-famille--large" niveau="h4" defilement={false}
              donnees={{ 'data-famille': 'resultat-net' }} titre={<>Résultat net de l’agence — {libelle}</>} resume={<ResumeResultatNet x={resume.net} />}
              /* 🔴 Arno (26/10/2026) — le triangle à GAUCHE du titre, exactement comme les lignes « Négociateur » en dessous. */
              chevronAGauche>
              <CascadeResultatNet x={resume.net} dossiers={dossiersCascade(resume.dossiers)} mots={mots} />
            </BlocReplie>
          )}
          {/* 🔴 Arno (25/10/2026) — LE BLOC « NÉGOCIATEUR — <nom> », un par négociateur, REPLIÉ à chaque chargement (une ligne, un chevron) ;
              déplié : la cascade. VISIBLE seulement de ce négociateur et des administrateurs (le serveur ne renvoie rien d'autre) ; pour tout
              autre compte, ABSENT de la page. */}
          {/* 🔴 Arno (26/10/2026) — « NÉGOCIATEURS À RAPPROCHER » (administrateurs) : un libellé sans compte qu'aucune correspondance sûre ne
              rattache ; « Rattacher » le joint à un compte (réversible, journalisé). Rien sans libellé à rapprocher ni rattachement manuel. */}
          {d.negociateursARapprocher !== undefined && onRelire !== undefined && <NegociateursARapprocher n={d.negociateursARapprocher} onRelire={onRelire} />}
          {resume.negociateurs.length > 0 && (
            <div className="fdm-negos fdm-famille--large" data-famille="negociateurs">
              {resume.negociateurs.map((x) => <BlocNegociateur key={x.cle} x={x} mois={moisCascade} mots={mots} />)}
              {/* Plusieurs négociateurs (administrateur) : les primes et les rétrocessions de tous, comme avant. */}
              {d.voirCommissions && resume.negociateurs.length > 1 && (
                <dl className="fdm-cascade-mois fdm-famille">
                  <div><dt>Primes de gestion — tous négociateurs</dt><dd data-total="primes">{eur(r.primes)}</dd></div>
                  <div><dt>Rétrocessions — tous négociateurs</dt><dd data-total="retrocessions">{eur(r.retrocessions)}</dd></div>
                </dl>
              )}
            </div>
          )}
        </div>
        {resume.pertesFichier && <p className="loc-muet tdb-note" data-note-pertes-fichier>* Mandats perdus notés dans le suivi mensuel : honoraires DÉDUITS (loyers cc du fichier × taux retenu, détail au survol).</p>}
        {resume.ecarts.map((e, i) => (
          <p key={i} className="fdm-ecart" data-ecart-fichier={e.champ}
            title={e.champ === 'commission' && !d.voirCommissions ? undefined : `${LIBELLE_CHAMP[e.champ]} — fichier : ${eur(e.fichier)} · outil (calcul juste) : ${eur(e.outil)}`}>
            <span className="fdm-ecart-mot">Écart avec le fichier, expliqué</span> {e.libelle}.
            {!(e.champ === 'commission' && !d.voirCommissions) && <span className="fdm-ecart-montants"> ({LIBELLE_CHAMP[e.champ]} : fichier {eur(e.fichier)} · outil {eur(e.outil)})</span>}</p>
        ))}
      </section>
  );
}

/**
 * 🔴 Arno (26/10/2026) — « NÉGOCIATEURS À RAPPROCHER » : chaque libellé texte sans compte (lignes de suivi, rétrocessions), son nombre de
 * lignes, et le choix du compte (les candidats d'abord) ; « Rattacher » réunit ses montants dans l'espace de la personne. Les rattachements
 * posés à la main se « Détachent ». Sans la migration 432 : la liste se lit, les gestes disent « disponible après la mise à jour ».
 */
function NegociateursARapprocher({ n, onRelire }: { n: NonNullable<DonneesTableau['negociateursARapprocher']>; onRelire: () => void }) {
  const [choix, setChoix] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const comptes = useComptesNegociateurs();
  if (n.aRapprocher.length === 0 && n.rattaches.length === 0) return null;
  const poster = async (corps: Record<string, unknown>): Promise<void> => {
    const r = await posterSuivi(corps);
    if (r.motif !== null) { setMessage(r.motif); return; }
    setMessage(null); onRelire();
  };
  return (
    <BlocReplie id="fdm-negos-a-rapprocher" section="negociateurs-a-rapprocher" classe="fdm-famille fdm-famille--large" niveau="h4" defilement={false}
      titre={`Négociateurs à rapprocher (${n.aRapprocher.length})`} resume="un libellé sans compte collaborateur : rattachez-le à la personne" donnees={{ 'data-bloc': 'negociateurs-a-rapprocher' }}>
      {!n.disponible && <p className="loc-muet">Rattacher à la main : disponible après la mise à jour de la base (migration 432).</p>}
      <ul className="fdm-attente" data-liste-negociateurs-a-rapprocher>
        {n.aRapprocher.map((x) => (
          <li key={x.libelle} data-negociateur-a-rapprocher={x.libelle}>
            <strong>{x.libelle}</strong> <span className="loc-muet">— {x.nb} ligne{x.nb > 1 ? 's' : ''}{x.candidats.length > 1 ? ' — plusieurs comptes possibles' : ''}</span>{' '}
            <span className="fdm-compte-choix"><ListeChoix options={[...x.candidats, ...comptes.filter((c) => !x.candidats.some((k) => k.id === c.id))].map((c) => ({ id: String(c.id), libelle: c.nom }))}
              valeur={choix[x.libelle] ?? ''} vide="— choisir le compte —" libelle={`Compte de ${x.libelle}`} desactive={!n.disponible}
              onChange={(v) => setChoix((c) => ({ ...c, [x.libelle]: v }))} donnees={{ 'data-compte-pour': x.libelle }} /></span>{' '}
            <button type="button" className="tdb-pilule fdm-raccourci" disabled={!n.disponible || (choix[x.libelle] ?? '') === ''}
              onClick={() => { void poster({ action: 'rattacher-negociateur', libelle: x.libelle, compteId: Number(choix[x.libelle]) }); }} data-rattacher-negociateur={x.libelle}>Rattacher</button>
          </li>
        ))}
        {n.rattaches.map((x) => (
          <li key={`r-${x.libelle}`} data-negociateur-rattache={x.libelle}>
            « {x.libelle} » → <strong>{x.compte}</strong> <span className="loc-muet">(rattaché à la main)</span>{' '}
            <button type="button" className="tdb-pilule fdm-raccourci" disabled={!n.disponible}
              onClick={() => { void poster({ action: 'detacher-negociateur', libelle: x.libelle }); }} data-detacher-negociateur={x.libelle}>Détacher</button>
          </li>
        ))}
      </ul>
      {message !== null && <p className="cp-refus" role="alert">{message}</p>}
    </BlocReplie>
  );
}

/** Les comptes collaborateurs proposés au rattachement (les négociateurs des paramètres du suivi). */
function useComptesNegociateurs(): { id: number; nom: string }[] {
  const p = useParametresSuivi();
  return (p.lu?.negociateurs ?? []).map((x) => ({ id: Number(x.id), nom: String(x.libelle) }));
}

/** 🔴 Arno (25/10/2026) — le bloc d'UN négociateur : replié sur une ligne (nom + chevron, aucun montant) ; déplié, la cascade. */
function BlocNegociateur({ x, mois, mots }: { x: CascadeNegociateur; mois: string; mots: MotsPeriode }) {
  const [ouvert, setOuvert] = useState(false);
  const id = `fdm-nego-${x.cle.replace(/[^a-z0-9]/gi, '-')}`;
  return (
    <section className="fdm-famille fdm-bloc-nego" aria-labelledby={`${id}-titre`} data-negociateur-bloc={x.libelle}>
      <h4 id={`${id}-titre`} className="fdm-nego-titre">
        <button type="button" className="fdm-nego-bascule" aria-expanded={ouvert} aria-controls={id} data-deplier-negociateur={x.libelle}
          onClick={() => setOuvert((v) => !v)}>
          <span className="fdm-nego-chevron" aria-hidden="true">{ouvert ? '▾' : '▸'}</span>
          <span>Négociateur — {x.libelle}</span>
        </button>
      </h4>
      {ouvert && (
        <div id={id} className="fdm-nego" data-negociateur-resume={x.libelle}>
          <CascadeNegociateurMois x={x} mois={mois} plusieurs={false} mots={mots} />
        </div>
      )}
    </section>
  );
}

/**
 * 🔴 Arno (26/10/2026) — UNE PRIME SAISIE À LA MAIN (colonne GESTION) : le montant souligné d'un trait rouge (jeton d'alerte), et — une
 * information ne tient jamais à la seule couleur — la bulle « prime saisie à la main » au survol, au toucher (sans déplier la ligne) et au
 * focus clavier ; Échap ou la perte du focus la referment. Le montant ne change pas.
 */
export function PrimeSaisieMain({ montant, repere }: { montant: string; repere: string }) {
  const [ouvert, setOuvert] = useState(false);
  const id = `fdm-prime-main-${repere}`;
  return (
    <span className="fdm-prime-main" tabIndex={0} aria-describedby={id} data-prime-manuelle={repere} data-ouvert={ouvert ? 'oui' : undefined}
      onClick={(e) => { e.stopPropagation(); setOuvert(true); }} onFocus={() => setOuvert(true)} onBlur={() => setOuvert(false)}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setOuvert(false); } }}>
      <span className="fdm-prime-main-montant">{montant}</span>
      <span role="tooltip" id={id} className="fdm-prime-main-bulle">prime saisie à la main</span>
    </span>
  );
}

/**
 * 🔴 Arno (26/10/2026) — UNE LIGNE PAR BIEN : le lot principal, « + N annexe(s) » et leur détail en bulle. Loyer, taux, date et statut :
 * ceux du lot principal (sinon de la seule ligne du groupe) ; honoraires / mois et / an : la SOMME des lignes du groupe — le total de la
 * colonne ne change pas. Une annexe détachée (bien autonome) n'est pas dans les liens : sa ligne reste à elle, sans mention d'annexe.
 */
function TableGestion({ lignes, perdus, regle, liens }: { lignes: readonly LigneGestion[]; perdus: boolean; regle: RegleAnnexes; liens?: readonly LienAnnexeAffiche[] }) {
  if (lignes.length === 0) return <p className="loc-muet">{perdus ? 'Aucun mandat perdu ce mois-ci.' : 'Aucune nouvelle gestion ce mois-ci.'}</p>;
  const groupes = regrouperParBien(lignes, liens);
  return (
    <table className="fdm-table">
      <thead><tr>
        <th scope="col">Bien</th><th scope="col">Propriétaire</th>
        {perdus ? <><th scope="col">Sortie le</th><th scope="col">Statut d’arrivée</th></> : <><th scope="col">Loyer (cc)</th><th scope="col">Taux</th></>}
        <th scope="col">{perdus ? 'Perdu / mois' : 'Honoraires / mois'}</th><th scope="col">{perdus ? 'Perdu / an' : 'Honoraires / an'}</th>
      </tr></thead>
      <tbody>{groupes.map((gr) => {
        const l = gr.principal ?? gr.lignes[0];
        const m = sommeDuGroupe(gr, honorairesGestionMensuels);
        return (
          <tr key={gr.cle} data-ligne-gestion={gr.lotId ?? 'fichier'}>
            <th scope="row">{gr.lotId !== null ? <a href={`/admin/location/bien/${gr.lotId}`}>{gr.libelle}</a> : <span>{gr.libelle}</span>}
              <BulleAnnexes annexes={gr.annexes} repere={gr.lotId ?? undefined}
                note={gr.principalAbsent ? (perdus ? 'Le lot principal n’est pas sorti de la gestion ce mois-ci : seule son annexe figure ici.' : 'Le lot principal n’est pas entré en gestion ce mois-ci : seule son annexe figure ici.') : null}
                extra={(x) => {
                  const mx = gr.principal === null ? null : honorairesGestionMensuels(x.ligne);
                  return <span className="anx-bulle-extra">{annexeNonComptee(x.lotId, x.ligne.effetLe, regle) ? ' — annexe non comptée' : ''}{mx !== null ? ` — ${eur(mx)} / mois (inclus)` : ''}</span>;
                }} />
              {l.origine === 'fichier' && <span className="loc-pastille" title={[l.commentaire, l.lotId === null ? 'Bien non rattaché' : null].filter(Boolean).join(' · ') || undefined}
                data-perte-fichier>suivi mensuel{l.lotId === null ? ' · non rattaché' : ''}</span>}</th>
            <td data-mot="Propriétaire">{l.proprietaire || '—'}</td>
            {perdus ? <><td data-mot="Sortie le">{l.origine === 'fichier' ? `${dateFr(l.effetLe).slice(3)} (mois)` : dateFr(l.effetLe)}</td>
              <td data-mot="Statut d’arrivée">{STATUT_ARRIVEE[l.apres] ?? l.apres}</td></>
              : <><td data-mot="Loyer (cc)">{(() => { const cc = loyerChargesComprises(l); return cc === null ? <span className="loc-muet">à saisir</span> : eur(cc); })()}</td>
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
              recherche={{ placeholder: 'Chercher un apporteur : nom, société, téléphone, e-mail…' }}
              options={ctx.apporteurs.filter((x) => !x.archive).map((x) => {
                const bloque = aRattacher(x) && String(x.id) !== String(a.apporteurId ?? '');
                // L'apporteur CHOISI s'affiche par son seul nom (jamais tronqué) ; « à rattacher » passe alors en badge sous le champ.
                const choisi = String(x.id) === v.apporteurId;
                return { id: x.id, libelle: x.nom, bloque, mention: aRattacher(x) && !choisi ? ' — à rattacher' : undefined, recherche: texteRechercheApporteur(x) };
              })} />
            {apporteurChoisi !== undefined && aRattacher(apporteurChoisi) && <span className="fdm-badge-orange" data-edition-apporteur-a-rattacher>à rattacher</span>}</label>
          <label className="tdb-champ fdm-champ-court"><span className="fdm-libelle">Taux (%)</span>
            <span className="fdm-saisie"><ChampNombre value={v.apporteurTaux} onChange={(e) => poser({ apporteurTaux: e.target.value })} data-edition-taux /><span className="fdm-unite" aria-hidden="true">%</span></span></label>
          <label className="tdb-champ"><span className="fdm-libelle">Hono. d’apporteur (€)</span>
            <span className="fdm-saisie"><ChampNombre value={v.commissionApporteur} placeholder="ex. 64,39 (vide = au taux)" onChange={(e) => poser({ commissionApporteur: e.target.value })} data-edition-commission /><span className="fdm-unite" aria-hidden="true">€</span></span></label>
        </>
      )}
      <label className="tdb-champ"><span className="fdm-libelle">Prime de gestion</span>
        <ListeChoix valeur={v.primeMode} vide={null} libelle="Prime de gestion" onChange={(x) => poser({ primeMode: x as ModePrime })} donnees={{ 'data-edition-prime': '' }}
          options={[{ id: 'regle', libelle: `${versionADate(ctx.regles, a.dateSignature)?.primeLogement ?? 150} €` }, { id: 'personnalise', libelle: 'Personnalisé' }, { id: 'aucune', libelle: 'Aucune' }]} /></label>
      {v.primeMode === 'personnalise' && (
        <label className="tdb-champ"><span className="fdm-libelle">Montant (€) *</span>
          <span className="fdm-saisie"><ChampNombre value={v.primeMontant} onChange={(e) => poser({ primeMontant: e.target.value })} data-edition-prime-montant /><span className="fdm-unite" aria-hidden="true">€</span></span></label>
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

/**
 * 🔴 Arno (25/10/2026, 427) — « NOUVELLES GLI » : la même grille que les gestions (Biens · / mois · / an, mêmes colonnes) ; les montants
 * ouvrent la liste (bail, locataire, loyer CC, marge, gain / mois). Les GLI sans loyer charges comprises sont comptées dans le nombre,
 * jamais dans les montants, et dites ; de même une GLI antérieure à toute marge enregistrée.
 */
function LigneGli({ g, portee, ouvert, onOuvrir }: { g: GliPeriode; portee: 'mois' | 'cumul'; ouvert: 'mois' | 'cumul' | null; onOuvrir: (v: 'mois' | 'cumul' | null) => void }) {
  const basculer = (): void => onOuvrir(ouvert === portee ? null : portee);
  const attr = portee === 'mois' ? { 'data-portefeuille': 'gli' } : { 'data-cumul': 'gli' };
  return (
    <>
      <tr {...attr} className="fdm-pf-gli">
        <th scope="row">Nouvelle GLI Garantme</th><td data-mot="Biens">{g.nb}</td>
        <td data-mot="/ mois"><button type="button" className="tdb-chiffre" aria-expanded={ouvert === portee} data-gli-ouvrir={portee} onClick={basculer}>{eur(g.mensuel)}</button></td>
        <td data-mot="/ an"><button type="button" className="tdb-chiffre" aria-expanded={ouvert === portee} data-gli-ouvrir-an={portee} onClick={basculer}>{eur(g.annuel)}</button></td>
      </tr>
      {g.sansLoyer > 0 && <tr className="fdm-pf-note"><td colSpan={4} className="loc-muet" data-gli-sans-loyer={portee}>{g.sansLoyer} GLI sans loyer charges comprises : non comptées</td></tr>}
      {g.sansMarge > 0 && <tr className="fdm-pf-note"><td colSpan={4} className="loc-muet" data-gli-sans-marge={portee}>{g.sansMarge} GLI antérieure(s) à toute marge GLI enregistrée : gain non compté</td></tr>}
    </>
  );
}

function ListeGli({ g, titre }: { g: GliPeriode; titre: string }) {
  const dateFr = (iso: string): string => iso.split('-').reverse().join('/');
  return (
    <ul className="fdm-cumul-biens fdm-gli-liste" data-gli-liste aria-label={titre}>
      {g.gli.map((x) => (
        <li key={x.bailId} data-gli-bail={x.bailId}>
          <span>{x.lotId !== null ? <a href={`/admin/location/bien/${x.lotId}`}>{x.bien}</a> : x.bien}
            <small>{x.locataire} · GLI du {dateFr(x.date)}</small></span>
          <span>{x.loyerCc === null ? <span className="loc-muet">sans loyer CC — non comptée</span> : <>
            <span data-mot="Loyer CC">{eur(x.loyerCc)} CC</span>{' × '}<span data-mot="Marge">{x.marge === null ? 'marge —' : margeFr(x.marge)}</span>{' = '}
            <strong data-mot="Gain / mois">{x.gainMensuel === null ? '—' : `${eur(x.gainMensuel)} / mois`}</strong></>}</span>
        </li>))}
      {g.gli.length === 0 && <li className="loc-muet">Aucune GLI.</li>}
    </ul>
  );
}

export const CSS_FEUILLE_MOIS = `${CSS_BULLE_ANNEXES}${CSS_SUPPRIMER_LOCATION}
.fdm{display:flex;flex-direction:column;gap:18px}
/* 🔴 Arno (26/10/2026) — LES BLOCS SE DISTINGUENT : la feuille posée sur un fond légèrement teinté, chaque bloc sur sa surface, avec une bordure
   plus marquée, une ombre légère, plus d'air entre les blocs et des titres plus affirmés. Jetons du thème seulement : clair ET sombre. */
.fdm{background:var(--color-svv-field);border:1px solid var(--color-svv-line);border-radius:20px;padding:16px;gap:22px}
.fdm > .tdb-section,.fdm > .tdb-replie{background:var(--color-svv-surface);border:1px solid var(--color-svv-line-strong);border-radius:16px;
  box-shadow:0 1px 2px color-mix(in srgb,var(--color-svv-ink) 8%,transparent),0 6px 18px -12px color-mix(in srgb,var(--color-svv-ink) 30%,transparent)}
.fdm > .tdb-section > h3,.fdm > .tdb-section h3:first-of-type{font-size:1.12rem;font-weight:800;color:var(--color-svv-ink);padding-bottom:8px;border-bottom:1px solid var(--color-svv-line);margin:0 0 12px}
@media (max-width:640px){ .fdm{padding:10px;border-radius:14px;gap:16px} }
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
.fdm-prime-main{position:relative;display:inline-flex;align-items:center;min-height:44px;cursor:help;outline:none}
.fdm-prime-main-montant{text-decoration:underline;text-decoration-color:var(--color-svv-red);text-decoration-thickness:2px;text-underline-offset:3px}
.fdm-prime-main:focus-visible .fdm-prime-main-montant{outline:2px solid var(--color-svv-red);outline-offset:2px}
.fdm-prime-main-bulle{position:absolute;right:0;bottom:calc(100% - 4px);z-index:30;width:max-content;max-width:min(240px,calc(100vw - 40px));padding:6px 9px;border-radius:8px;background:var(--color-svv-tip-bg);color:var(--color-svv-blanc);font-size:.72rem;font-weight:500;line-height:1.35;white-space:normal;text-align:left;visibility:hidden;opacity:0;pointer-events:none}
.fdm-prime-main:hover .fdm-prime-main-bulle,.fdm-prime-main[data-ouvert] .fdm-prime-main-bulle{visibility:visible;opacity:1}
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
.fdm-detail-gestes .fdm-conversion{display:contents}
.fdm-detail-gestes .fdm-conversion > p,.fdm-detail-gestes .fdm-conversion-confirmer{flex-basis:100%;margin:4px 0 0}
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
.fdm-familles{display:flex;flex-direction:column;gap:14px}
.fdm-colonne{display:contents}
.fdm-familles [data-famille="resultat"]{order:1} .fdm-familles [data-famille="statuts"]{order:2} .fdm-familles [data-famille="portefeuille"]{order:3}
.fdm-familles [data-famille="gestion"]{order:4} .fdm-familles [data-famille="resultat-net"]{order:5} .fdm-familles [data-famille="negociateurs"]{order:6}
@media (min-width:900px){
  .fdm-familles{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;align-items:start}
  .fdm-colonne{display:flex;flex-direction:column;gap:14px;min-width:0}
  /* 🔴 Arno (25/10/2026) — les deux colonnes finissent à la même hauteur : le DERNIER bloc de la colonne la plus courte s'étire (son fond
     seulement ; le contenu reste en haut). Au téléphone, rien ne s'étire. */
  .fdm-familles > .fdm-colonne{align-self:stretch}
  .fdm-colonne > .fdm-famille:last-child{flex:1 1 auto;justify-content:flex-start}
  .fdm-famille--large{grid-column:1 / -1}
}
/* Le Portefeuille : une seule grille de colonnes pour les deux parties (largeurs fixes), même hauteur de ligne. */
.fdm-portefeuille{table-layout:fixed}
.fdm-portefeuille col.fdm-pf-c1{width:38%} .fdm-portefeuille col.fdm-pf-c2{width:14%} .fdm-portefeuille col.fdm-pf-c3{width:24%} .fdm-portefeuille col.fdm-pf-c4{width:24%}
.fdm-portefeuille th,.fdm-portefeuille td{height:2rem;padding-top:4px;padding-bottom:4px;overflow:hidden;text-overflow:ellipsis}
.fdm-portefeuille .tdb-chiffre{min-height:0;padding:0 2px}
.fdm-portefeuille tr.fdm-pf-solde th,.fdm-portefeuille tr.fdm-pf-solde td{font-weight:800;border-top:2px solid var(--color-svv-line-strong)}
.fdm-portefeuille tr.fdm-pf-solde.tdb-signe--positif th,.fdm-portefeuille tr.fdm-pf-solde.tdb-signe--positif td{color:var(--color-svv-green-ink)}
.fdm-portefeuille tr.fdm-pf-solde.tdb-signe--negatif th,.fdm-portefeuille tr.fdm-pf-solde.tdb-signe--negatif td{color:var(--color-svv-red)}
.fdm-portefeuille tr.fdm-pf-solde.tdb-signe--nul th,.fdm-portefeuille tr.fdm-pf-solde.tdb-signe--nul td{color:var(--color-svv-muted)}
.fdm-portefeuille tr.fdm-pf-gli th,.fdm-portefeuille tr.fdm-pf-gli td{border-top:1px solid var(--color-svv-line-strong)}
.fdm-portefeuille tr.fdm-pf-note td{height:auto;text-align:left;white-space:normal;font-size:.8rem;border-bottom:0}
.fdm-portefeuille tr.fdm-pf-sous-titre th{height:auto;padding-top:14px;text-align:left;border-bottom:0}
.fdm-portefeuille tbody[data-portefeuille-cumul] tr.fdm-pf-sous-titre th{border-top:1px solid var(--color-svv-line-strong)}
.fdm-portefeuille tr.fdm-pf-entetes th{font-size:.74rem;font-weight:700;color:var(--color-svv-muted)}
.fdm-famille{border:1px solid var(--color-svv-line);border-radius:16px;background:var(--color-svv-field);padding:14px 16px;min-width:0;display:flex;flex-direction:column;gap:8px}
/* 🔴 Arno (25/10/2026) — LE STYLE DU TITRE D'UN BLOC, partagé par ses sous-titres (« Depuis le 1er janvier ») : une seule règle. */
.fdm-famille > h4,.fdm-titre-bloc{margin:0;font-size:.95rem;font-weight:800;color:var(--color-svv-ink)}
/* 🔴 Arno (25/10/2026) — un titre sur UNE ligne : la police se réduit selon la largeur de l'encadré et le nombre de lettres (0,46 em par
   lettre, mesuré : 0,44), plancher 13 px, jamais coupée. */
.fdm-familles [data-famille="portefeuille"]{container-type:inline-size}
.fdm-famille > h4.fdm-titre-une-ligne,.fdm-titre-bloc.fdm-titre-taille{font-size:clamp(13px, calc(100cqi / (var(--lettres) * .46)), .95rem)}
.fdm-famille > h4.fdm-titre-une-ligne{white-space:nowrap;overflow:visible}
.fdm-titre-deux-lignes .fdm-titre-suite{display:block}
@media (max-width:430px){
  .fdm-famille > h4.fdm-titre-une-ligne,.fdm-titre-bloc.fdm-titre-taille{font-size:clamp(13px, calc(100cqi / (var(--lettres-ligne) * .46)), .95rem)}
  .fdm-titre-une-ligne .fdm-titre-suite{display:block}
}
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
.fdm-negos{display:flex;flex-direction:column;gap:14px;min-width:0}
.fdm-famille > h4.fdm-nego-titre{margin:-6px -8px}
.fdm-nego-bascule{appearance:none;display:flex;align-items:center;gap:8px;width:100%;min-height:44px;padding:0 8px;background:none;border:0;border-radius:10px;font:inherit;color:inherit;text-align:left;cursor:pointer}
.fdm-nego-bascule:hover .fdm-nego-chevron{color:var(--color-svv-ink)}
.fdm-nego-bascule:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px}
.fdm-nego-chevron{flex:0 0 1.2em;color:var(--color-svv-muted);font-size:1rem}
.fdm-cumul{margin-top:10px;padding-top:10px;border-top:1px solid var(--color-svv-line-strong);display:flex;flex-direction:column;gap:6px}
.fdm-cumul-titre{margin:0;white-space:normal}
.fdm-titre-bloc{display:block}
.fdm-cumul-biens{list-style:none;margin:0;padding:8px 10px;border:1px solid var(--color-svv-line);border-radius:12px;background:var(--color-svv-surface);display:flex;flex-direction:column;gap:4px;font-size:.84rem}
.fdm-cumul-biens li{display:flex;justify-content:space-between;align-items:baseline;gap:12px}
.fdm-cumul-biens li > span:first-child{display:flex;flex-direction:column;min-width:0;overflow-wrap:anywhere}
.fdm-cumul-biens li > span:last-child{white-space:nowrap;font-variant-numeric:tabular-nums}
.fdm-cumul-biens small{color:var(--color-svv-muted)}
.fdm-gli-liste{margin-top:8px}
.fdm-gli-liste li > span:last-child{white-space:normal;text-align:right}
/* 🔴 Arno (25/10/2026) — Apporteurs du mois : badges discrets ; le meilleur légèrement surligné ; le Total à part. */
.fdm-sorte{display:inline-block;margin-left:6px;border-radius:999px;padding:0 7px;font-size:.68rem;font-weight:700;line-height:1.6;border:1px solid var(--color-svv-line-strong);color:var(--color-svv-muted);vertical-align:middle}
.fdm-sorte--interne{border-color:var(--color-svv-blue-soft);color:var(--color-svv-blue)}
.fdm-badge-meilleur{display:inline-block;margin-left:6px;border-radius:999px;padding:0 8px;font-size:.7rem;font-weight:800;line-height:1.6;background:var(--color-svv-green-soft);color:var(--color-svv-green-ink);vertical-align:middle;white-space:nowrap}
.fdm-apporteurs tr.fdm-meilleur > th,.fdm-apporteurs tr.fdm-meilleur > td{background:color-mix(in srgb, var(--color-svv-green-soft) 55%, transparent)}
.fdm-apporteurs tfoot th,.fdm-apporteurs tfoot td{font-weight:800;border-top:2px solid var(--color-svv-line-strong);border-bottom:0}
.fdm-collegues tr.fdm-meilleur > th,.fdm-collegues tr.fdm-meilleur > td{background:color-mix(in srgb, var(--color-svv-green-soft) 55%, transparent)}
.fdm-collegues tr.fdm-collegue > td.fdm-fort-cellule{font-weight:800}
.fdm-collegues tr.fdm-collegue > th{font-weight:800}
.fdm-origine-collegue{display:block;margin-top:2px;font-size:.74rem;font-weight:400;line-height:1.35;color:var(--color-svv-muted);white-space:normal}
.fdm-collegues tr.fdm-collegue--deux > th,.fdm-collegues tr.fdm-collegue--deux > td{vertical-align:top}
.fdm-pile{display:flex;flex-direction:column;align-items:stretch}
.fdm-pile-l{display:flex;align-items:center;white-space:nowrap;font-variant-numeric:tabular-nums}
td .fdm-pile-l{justify-content:flex-end}
.fdm-pile-l--nom{min-height:1.9rem;font-weight:800}
.fdm-pile-l--detail{height:1.3rem;font-size:.76rem;font-weight:400;color:var(--color-svv-muted)}
.fdm-pile-l--total{height:1.7rem;font-weight:800}
.fdm-pile-l .tdb-chiffre{min-height:0;padding:0 2px;font:inherit;color:inherit}
.fdm-pile-l--apporteur{padding-left:12px}
th .fdm-pile-l--detail[data-pile="via"]{font-weight:600}
.fdm-pile-seul{font-size:inherit;color:var(--color-svv-muted);font-weight:400;overflow:hidden;text-overflow:ellipsis}
.fdm-collegues tr.fdm-collegue--depliable{cursor:pointer}
.fdm-chevron--collegue{min-width:28px;min-height:28px;margin:-6px 2px -6px -6px;vertical-align:middle}
@media (max-width:640px){
  .fdm-collegues tr.fdm-collegue--deux > td{align-items:flex-start}
  .fdm-collegues td .fdm-pile-l--nom,.fdm-collegues th .fdm-pile-l[data-pile]{display:none}
  .fdm-collegues td .fdm-pile-l[data-pile]::before{content:attr(data-pile-mot);margin-right:auto;padding-right:8px;color:var(--color-svv-muted);font-weight:400;font-size:.76rem;overflow:hidden;text-overflow:ellipsis}
  .fdm-collegues td .fdm-pile-l--apporteur{padding-left:0}
  .fdm-chevron--collegue{min-width:44px;min-height:44px}
}
.fdm-collegues tfoot th,.fdm-collegues tfoot td{font-weight:800;border-top:2px solid var(--color-svv-line-strong);border-bottom:0}
.fdm-nego-nom{margin:6px 0 0;font-weight:800}
.fdm-famille .tdb-note{margin:0}
.fdm-deux{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;align-items:start}
@media (max-width:900px){ .fdm-deux{grid-template-columns:minmax(0,1fr)} }
@media (max-width:640px){ ${cartes('.fdm-table')} .fdm-famille{padding:12px} .fdm-mini th,.fdm-mini td{padding:6px 2px} }
${CSS_STATUT_BIEN}${CSS_CASCADE_NEGOCIATEUR}`;
