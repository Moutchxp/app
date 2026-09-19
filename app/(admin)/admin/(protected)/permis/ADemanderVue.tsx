'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { type Lot, type DiagnosticProposition, expliquerProposition, resumeDiagnostic, dateLiberationQuota, ETIQUETTE_PROFIL, type ProfilDemandeur, cleLot, compterSelection, bornerAncienneteMois } from '../../../../lib/sitadel/demande';
import type { StockResultat, PermisDetail, CompteRenduCreation } from '../../../../lib/sitadel/demandeRepo';
import { PERIODE_STOCK_DEFAUT } from '../../../../lib/sitadel/stock';
import { MessageRetour, CartePropositions, BlocStock, TableStock, PanneauDetailStock, BandeauReglages, type RetourAction } from './DemandesRendu';
import { BlocPrada } from './BlocPrada';
import { BlocDepot } from './BlocDepot';
import { SuiviDemandes } from './SuiviDemandes';
import { RechercheVivier } from './RechercheVivier';
import { CompteurVivierTeleservice } from './CompteurVivierTeleservice';
import { ResumeCriteresTeleservice } from './ResumeCriteresTeleservice';
import { ModeDemandeTeleservice, type ModePreparation } from './ModeDemandeTeleservice';
import { ModaleConfirmationEnvoiAuto } from './ModaleConfirmationEnvoiAuto';
import { GroupeRailsCommunes } from './GroupeRailsCommunes';
import type { CompteursProcess } from './CommutateurProcess';
import { dansProcess, PROCESS_META, type Process } from '../../../../lib/sitadel/process';

/**
 * Q5 — onglet « À DEMANDER » : tout ce qui PRÉCÈDE la création d'une demande. Extrait sans changement de logique de l'ex-onglet
 * « Demandes » : bandeau de rappel + filtre d'ancienneté (Q4), stock par commune (Q2b, REPLIÉ par défaut — U6),
 * « Préparer les demandes » + profil + aperçu des lots avec sélection lot par lot (V3), et le bloc PRADA/injoignables
 * (C2/C3) qui conditionne la création. Aucun état n'est partagé avec « En cours » : la liste des demandes vit là-bas, et une
 * création apparaît dans « En cours » au prochain affichage de cet onglet (il recharge à son montage). AUCUN envoi.
 */
const PROFILS: ProfilDemandeur[] = ['entreprise', 'personne'];
const PAGE_SIZE = 20;
const styleChamp: CSSProperties = { padding: '.35rem .5rem', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', fontSize: 13 };

interface Props { categories: { cle: string; libelle: string; rang: number }[]; ancienneteMaxAnnees: number; triLibelle: string; process: Process; onBasculerProcess: (p: Process) => void; onAllerReglages: () => void;
  /** DEPOT-2 — notifie le parent (PermisTuile) qu'une action a changé les compteurs (préparation / dépôt / annulation) → rafraîchit le commutateur. */
  onChangement?: () => void;
  /** GroupeRailsCommunes (« Bascule de rail & carte des communes ») est rendu ICI, sous le carrousel — ces props sont RELAYÉES telles
   *  quelles depuis PermisTuile (seul ancêtre commun avec l'éditeur de fiche par commune). */
  hors: CompteursProcess['hors'] | null; onOuvrirCommune?: (code: string) => void; signalCarte?: number }

/** Message d'échec = la RAISON réelle renvoyée par le serveur ({erreur}), jamais un libellé figé à deux mots. */
async function erreurServeur(res: Response, repli: string): Promise<string> {
  try { const d = (await res.json()) as { erreur?: string }; return d?.erreur && d.erreur.trim() !== '' ? d.erreur : repli; }
  catch { return repli; }
}

export function ADemanderVue({ categories, ancienneteMaxAnnees, triLibelle, process, onBasculerProcess, onAllerReglages, onChangement, hors, onOuvrirCommune, signalCarte }: Props) {
  const [prop, setProp] = useState<{ lots: Lot[]; diagnostic: DiagnosticProposition; profil: ProfilDemandeur } | null>(null);
  const [profilPrep, setProfilPrep] = useState<ProfilDemandeur>('entreprise');
  const [retour, setRetour] = useState<RetourAction>(null);
  // V3 — sélection des lots à créer : vit ICI (clés de lot stables), JAMAIS dans la page affichée → survit à la pagination.
  const [selLots, setSelLots] = useState<Set<string>>(new Set());
  const [pageLots, setPageLots] = useState(1);
  // Q2b/U6 — STOCK par commune : REPLIÉ par défaut (à l'arrivée sur l'onglet, une seule ligne visible). Aucune mémorisation
  //   (useState simple, pas de localStorage/URL) → toujours replié à l'arrivée. Chargement LAZY : les données ne sont récupérées
  //   qu'à l'ouverture (effet ci-dessous gardé sur `stockOuvert`), comme le prévoyait Q2b — l'ouverture manuelle est inchangée.
  const [stockOuvert, setStockOuvert] = useState(false);
  const [stock, setStock] = useState<StockResultat | null>(null);
  const [stockChargement, setStockChargement] = useState(false);
  const [communeStock, setCommuneStock] = useState<string | null>(null);
  const [periodeStock, setPeriodeStock] = useState<string>(PERIODE_STOCK_DEFAUT);
  const [typeStock, setTypeStock] = useState<string>('immeuble_neuf');
  const [permisStock, setPermisStock] = useState<PermisDetail[] | null>(null);
  const [permisChargement, setPermisChargement] = useState(false);
  // Q4 — FILTRE d'ancienneté (état d'écran). `moisSaisie` = saisie brute ; la valeur EFFECTIVE (bornée) DÉRIVE de la config.
  const maxMois = 12 * ancienneteMaxAnnees;
  const [moisSaisie, setMoisSaisie] = useState(String(maxMois));
  const ancienneteMois = bornerAncienneteMois(moisSaisie, ancienneteMaxAnnees);
  const prepSeq = useRef(0); // Q4-fix : compteur de séquence des préparations (anti-race)
  const [signalSuivi, setSignalSuivi] = useState(0); // Q6 : incrémenté après une création → rafraîchit le tableau des non-envoyées
  // Mode de préparation, UN PAR RAIL (basculer de rail n'emporte pas le mode de l'autre — décision porteur). Téléservice : pilote AUSSI
  //   l'affichage des cartes VIRTUELLES du carrousel (en manuel, on masque les virtuelles ; les réelles restent). E-mail : pilote le
  //   panneau auto (lot par critères) / manuel (choix d'un permis du vivier e-mail). ⚠️ SANS aucun lien avec l'auto-relance (relance_auto_active).
  const [modeTeleservice, setModeTeleservice] = useState<ModePreparation>('auto');
  // 224 — E-MAIL : le mode auto/manuel du bloc EST le flag serveur `email_envoi_initial_auto_active` (config_veille) — UNE SEULE vérité,
  //   éditable ICI comme dans Réglages. `null` = pas encore lu (affiché « manuel » = OFF, défaut sûr). Passer en AUTO exige une
  //   CONFIRMATION (modale récapitulative) ; le retour en manuel est immédiat. AUCUN lien avec l'auto-relance (relance_auto_active).
  const [emailEnvoiAuto, setEmailEnvoiAuto] = useState<boolean | null>(null);
  const [modaleEnvoiAuto, setModaleEnvoiAuto] = useState(false);
  const [basculeEnCours, setBasculeEnCours] = useState(false);
  // DEPOT-2 — FOYER UNIQUE local : toute action réussie (création, dépôt, annulation) rafraîchit les vues locales
  //   (SuiviDemandes + BlocDepot via signalSuivi) ET notifie le parent (compteurs du commutateur) — jamais l'un sans l'autre.
  const signalerChangement = useCallback((): void => { setSignalSuivi((s) => s + 1); onChangement?.(); }, [onChangement]);

  const annoncer = useCallback((texte: string, ok: boolean) => setRetour(texte === '' ? null : { texte, ok, zone: 'haut' }), []);

  // 224 — LECTURE INITIALE du flag d'envoi auto e-mail (source unique = config_veille via /reglages). Rejouée au MONTAGE de la vue.
  //   Comme PermisTuile démonte/remonte « À demander » à chaque changement d'onglet, revenir de Réglages relit le flag → l'état du bloc
  //   suit Réglages en temps réel (les deux écrivent la MÊME colonne). Indisponible (403/503) → reste OFF affiché (défaut sûr).
  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/permis/reglages', { cache: 'no-store' });
        if (!annule && res.ok) { const d = (await res.json()) as { veille?: { emailEnvoiInitialAutoActive?: boolean } }; setEmailEnvoiAuto(d?.veille?.emailEnvoiInitialAutoActive === true); }
      } catch { /* flag indisponible → OFF affiché */ }
    })();
    return () => { annule = true; };
  }, []);
  // 224 — écrit le flag via PATCH /reglages (allowlist PARAMS_VEILLE) et RECONCILIE sur la vérité serveur renvoyée (`.veille`). N'écrit
  //   QUE `email_envoi_initial_auto_active` — jamais relance_auto_active / saisine_cada_auto_active / cascade_partiel_auto_active / auto_active.
  const ecrireFlagEnvoiAuto = useCallback(async (actif: boolean): Promise<boolean> => {
    try {
      const res = await fetch('/api/admin/permis/reglages', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ veille: { email_envoi_initial_auto_active: actif } }) });
      if (!res.ok) return false;
      const d = (await res.json()) as { veille?: { emailEnvoiInitialAutoActive?: boolean } };
      setEmailEnvoiAuto(d?.veille?.emailEnvoiInitialAutoActive === true);
      return true;
    } catch { return false; }
  }, []);
  // E-MAIL : passage en MANUEL = immédiat (rien à armer) ; passage en AUTO = ouvre la modale (rien ne s'arme sans confirmation explicite).
  const changerModeEmail = useCallback((m: ModePreparation): void => {
    if (m === 'auto') { setModaleEnvoiAuto(true); return; }
    void (async () => { const ok = await ecrireFlagEnvoiAuto(false); if (!ok) annoncer('La désactivation de l’envoi automatique n’a pas pu être enregistrée.', false); })();
  }, [ecrireFlagEnvoiAuto, annoncer]);
  // Confirmation de la modale → arme le flag (PATCH true). Le déclenchement effectif reste gardé côté veille (flag + fenêtre + caps).
  const confirmerEnvoiAuto = useCallback((): void => {
    void (async () => {
      setBasculeEnCours(true);
      const ok = await ecrireFlagEnvoiAuto(true);
      setBasculeEnCours(false);
      setModaleEnvoiAuto(false);
      annoncer(ok ? 'Envoi automatique des 1res demandes e-mail activé.' : 'L’activation de l’envoi automatique n’a pas pu être enregistrée.', ok);
    })();
  }, [ecrireFlagEnvoiAuto, annoncer]);

  const toggleStock = useCallback(() => setStockOuvert((o) => !o), []);
  // Q2b/Q4 — agrégat du stock : au montage (ouvert par défaut) et RECHARGÉ quand le filtre d'ancienneté change. setState dans l'IIFE async.
  useEffect(() => {
    if (!stockOuvert) return;
    let annule = false;
    void (async () => {
      setStockChargement(true);
      try {
        const res = await fetch(`/api/admin/permis/demandes/stock?ancienneteMois=${ancienneteMois}`, { cache: 'no-store' });
        if (!annule && res.ok) setStock((await res.json()) as StockResultat);
      } catch { /* stock indisponible */ }
      finally { if (!annule) setStockChargement(false); }
    })();
    return () => { annule = true; };
  }, [stockOuvert, ancienneteMois]);
  const ouvrirDetailStock = useCallback((code: string) => {
    setCommuneStock((actuel) => {
      if (actuel === code) return null;
      setPeriodeStock(PERIODE_STOCK_DEFAUT); setTypeStock('immeuble_neuf');
      return code;
    });
  }, []);
  // Q2b — panneau (permis délivrés d'UNE commune), rejoué à chaque changement de commune / période / type.
  useEffect(() => {
    if (communeStock === null) return;
    let annule = false;
    void (async () => {
      setPermisChargement(true); setPermisStock(null);
      try {
        const qs = new URLSearchParams({ commune: communeStock, periode: periodeStock, type: typeStock });
        const res = await fetch(`/api/admin/permis/demandes/stock?${qs.toString()}`, { cache: 'no-store' });
        if (!annule && res.ok) { const d = (await res.json()) as { permis: PermisDetail[] }; setPermisStock(d.permis); }
      } catch { /* détail indisponible */ }
      finally { if (!annule) setPermisChargement(false); }
    })();
    return () => { annule = true; };
  }, [communeStock, periodeStock, typeStock]);

  // Q4-fix — la préparation prend la fenêtre EN PARAMÈTRE (jamais une valeur capturée stale) + compteur de séquence anti-race.
  async function preparerAvec(mois: number): Promise<void> {
    const seq = prepSeq.current + 1;
    prepSeq.current = seq;
    setRetour(null);
    const res = await fetch(`/api/admin/permis/demandes/proposition?profil=${profilPrep}&ancienneteMois=${mois}`, { cache: 'no-store' });
    if (seq !== prepSeq.current) return; // une préparation plus récente a été lancée → réponse ignorée (anti-race)
    if (res.ok) { const p = (await res.json()) as { lots: Lot[]; diagnostic: DiagnosticProposition; profil: ProfilDemandeur }; setProp(p); setProfilPrep(p.profil); setSelLots(new Set()); setPageLots(1); }
    else annoncer(await erreurServeur(res, 'Proposition indisponible.'), false);
  }
  // Q4-fix — le filtre agit IMMÉDIATEMENT sur l'aperçu (recalculé, jamais un snapshot stale) ET sur le stock (via son effet).
  const changerMois = (v: string): void => {
    const mois = bornerAncienneteMois(v, ancienneteMaxAnnees);
    setMoisSaisie(v);
    if (mois === ancienneteMois) return;        // saisie sans changement effectif → rien à refaire
    setCommuneStock(null);                        // referme le panneau de stock (sa ligne peut sortir de la fenêtre)
    if (prop !== null) void preparerAvec(mois);   // aperçu affiché → recalcul immédiat
  };
  async function creer(): Promise<void> {
    const lots = prop?.lots ?? [];
    const selectionnes = lots.filter((l) => selLots.has(cleLot(l))).map((l) => ({ cle: cleLot(l), communeNom: l.communeNom }));
    if (selectionnes.length === 0) { annoncer('Cochez au moins un lot avant de créer.', false); return; }
    const res = await fetch('/api/admin/permis/demandes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profil: profilPrep, lots: selectionnes, ancienneteMois }) });
    if (res.ok) {
      const r = (await res.json()) as CompteRenduCreation;
      const bouts = [`${r.demandesCreees} demande(s) créée(s) en ${ETIQUETTE_PROFIL[r.profil].toLowerCase()}`, `${r.dossiersCrees} dossier(s)`];
      if (r.lotsInvalides.length) bouts.push(`${r.lotsInvalides.length} lot(s) ignoré(s) (${r.lotsInvalides.map((x) => x.communeNom ?? x.cle).join(', ')})`);
      if (r.ignoresConflit) bouts.push(`${r.ignoresConflit} conflit(s)`);
      // Q6 — les demandes créées sont des BROUILLONS (non parties) : elles restent DANS CET ONGLET, dans le tableau ci-dessous.
      annoncer(`${bouts.join(' · ')}. Retrouvez-les dans le tableau des demandes ci-dessous.`, true);
      setProp(null); setSelLots(new Set()); setPageLots(1); signalerChangement();
    } else annoncer(await erreurServeur(res, 'Création impossible.'), false);
  }

  const explication = prop ? expliquerProposition(prop.lots.length, prop.diagnostic) : '';
  const selProfil = (id: string) => id as ProfilDemandeur;

  // V3 — pagination + décompte des lots (sur l'ENSEMBLE, jamais la page). D2 — SCOPE PROCESS : on n'affiche que les lots du
  //   process actif (email / formulaire). Filtre d'AFFICHAGE (le canal du lot vient de mairie_contact) ; la création reste
  //   re-dérivée serveur (jamais un lot forgé).
  const lotsProp = (prop?.lots ?? []).filter((l) => dansProcess(l.canal, process));
  const nbPagesLots = Math.max(1, Math.ceil(lotsProp.length / PAGE_SIZE));
  const pLots = Math.min(pageLots, nbPagesLots);
  const lotsVisibles = lotsProp.slice((pLots - 1) * PAGE_SIZE, pLots * PAGE_SIZE).map((l) => ({
    cle: cleLot(l), codeInsee: l.codeInsee, communeNom: l.communeNom, canal: l.canal, nbDossiers: l.dossiers.length, destOrigine: l.destOrigine, destNom: l.destNom, profilImpose: l.profilImpose,
  }));
  // D2 — SCOPE PROCESS du stock (canal de la commune). Le stock et les lots partagent ainsi le même vivier (cohérence Part 6).
  const stockLignes = (stock?.lignes ?? []).filter((l) => dansProcess(l.canal, process));
  const selCompte = compterSelection(lotsProp, selLots);
  const toutCocheLots = lotsProp.length > 0 && selCompte.nbLots === lotsProp.length;
  const basculerLot = (cle: string): void => setSelLots((s) => { const n = new Set(s); if (n.has(cle)) n.delete(cle); else n.add(cle); return n; });
  const toutSelectionnerLots = (): void => setSelLots(toutCocheLots ? new Set<string>() : new Set(lotsProp.map(cleLot)));

  return (
    <div className="flex flex-col gap-4">
      {/* ② BLOC AUTO/MANUEL — COMMUN aux deux rails, JUSTE SOUS le sélecteur des deux rails (CommutateurProcess, monté dans PermisTuile
          au-dessus de cette vue) et AU-DESSUS du carrousel. Téléservice : SÉLECTION (auto=cartes / manuel=vivier téléservice), état
          d'écran LOCAL (modeTeleservice). E-mail : ENVOI AUTO de la 1re demande — le mode auto/manuel EST le flag serveur
          `email_envoi_initial_auto_active` (emailEnvoiAuto), donc partagé avec Réglages (une seule vérité) ; l'AUTO ouvre une modale de
          confirmation, le MANUEL est immédiat. ⚠️ AUCUN lien avec l'auto-relance (relance_auto_active) : automatisations indépendantes. */}
      <ModeDemandeTeleservice
        categories={categories} process={process}
        mode={process === 'formulaire' ? modeTeleservice : (emailEnvoiAuto === true ? 'auto' : 'manuel')}
        onMode={process === 'formulaire' ? setModeTeleservice : changerModeEmail}
        onChangement={signalerChangement}
        badge={process === 'email' ? (
          <span className="svv-pill" aria-live="polite" style={{ fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', color: emailEnvoiAuto === true ? 'var(--color-svv-red)' : 'var(--color-svv-muted)', borderColor: emailEnvoiAuto === true ? 'var(--color-svv-red)' : 'var(--color-svv-line)' }}>
            {emailEnvoiAuto === true ? '● Envoi auto activé' : '○ Envoi auto désactivé'}
          </span>
        ) : undefined}
      />
      {/* 224 — MODALE de confirmation (rail e-mail uniquement) : s'ouvre au passage en AUTO. Rien n'est armé tant qu'elle n'est pas confirmée. */}
      {modaleEnvoiAuto && process === 'email' && (
        <ModaleConfirmationEnvoiAuto onConfirmer={confirmerEnvoiAuto} onAnnuler={() => { if (!basculeEnCours) setModaleEnvoiAuto(false); }} enCours={basculeEnCours} />
      )}
      {/* ③ CARROUSEL TÉLÉSERVICE (lot 1) — cartes de dépôt à faire, SOUS le bloc auto/manuel. UNE SEULE instance. Réservé au rail
          Téléservice (process === 'formulaire'). En mode MANUEL, les cartes VIRTUELLES sont masquées (afficherVirtuels=false) ; les
          RÉELLES restent. DEPOT-1 : mêmes signaux. Le COMPTEUR DE VIVIER (lot 2) est passé en prop `compteurVivier` → rendu SUR LA LIGNE
          de nav du carrousel (fetch/rafraîchissement propres via signalSuivi), visible même carrousel vide. */}
      {process === 'formulaire' && <BlocDepot signalRafraichir={signalSuivi} onChangement={signalerChangement} afficherVirtuels={modeTeleservice === 'auto'} compteurVivier={<CompteurVivierTeleservice signalRafraichir={signalSuivi} />} />}
      {/* ④ LIGNE « Bascule de rail & carte des communes » (repliable, repliée par défaut) — sous le carrousel. S'affiche pour les DEUX
          rails ; en e-mail, BlocDepot rend null. `onAction` = `onChangement` : même rafraîchissement qu'avant, aucun comportement modifié. */}
      <GroupeRailsCommunes hors={hors} rail={process} onAction={onChangement ?? (() => {})} onOuvrirCommune={onOuvrirCommune} signalCarte={signalCarte} />
      {/* RÉSUMÉ DES CRITÈRES (lot 3) — sous le carrousel : critères propres au téléservice ÉDITABLES ici, partagés avec l'E-mail en
          LECTURE SEULE (renvoi vers Réglages). Se rafraîchit sur le même signal (signalSuivi). */}
      {process === 'formulaire' && <ResumeCriteresTeleservice signalRafraichir={signalSuivi} onChangement={signalerChangement} onAllerReglages={onAllerReglages} />}

      {/* Q4 — rappel des réglages + filtre d'ancienneté, en tête de l'onglet. */}
      <BandeauReglages
        ancienneteMaxAnnees={ancienneteMaxAnnees} triLibelle={triLibelle}
        moisSaisie={moisSaisie} maxMois={maxMois} onMois={changerMois} onAllerReglages={onAllerReglages}
      />

      {/* MOTEUR FUSIONNÉ — recherche du VIVIER + action par ligne selon le rail. `mode` = mode COURANT du rail actif (téléservice :
          modeTeleservice ; e-mail : le flag d'envoi auto) → pilote l'apparition du bouton « Préparer » côté e-mail. `onPrepared` =
          foyer unique de rafraîchissement (carrousel + compteurs), comme l'ex-RechercheVivierManuel. */}
      <RechercheVivier process={process} categories={categories} onBasculer={onBasculerProcess}
        mode={process === 'formulaire' ? modeTeleservice : (emailEnvoiAuto === true ? 'auto' : 'manuel')}
        onPrepared={signalerChangement} />

      {/* Q2b/U6 — STOCK par commune : REPLIÉ par défaut (une seule ligne à l'arrivée) ; l'ouverture manuelle charge et déplie. */}
      <BlocStock
        ouvert={stockOuvert} onToggle={toggleStock} chargement={stockChargement}
        stock={stock ? stockLignes : null} tronque={stock?.tronque} genereEnMs={stock?.genereEnMs} fenetreMois={stock?.fenetreMois ?? ancienneteMois}
        table={stock ? (
          <TableStock
            lignes={stockLignes} categories={categories} communeOuverte={communeStock} onDetail={ouvrirDetailStock}
            panneau={communeStock !== null ? (
              <PanneauDetailStock
                communeNom={stockLignes.find((l) => l.codeInsee === communeStock)?.communeNom ?? communeStock}
                categories={categories}
                periode={periodeStock} onPeriode={setPeriodeStock} typeFiltre={typeStock} onType={setTypeStock}
                permis={permisStock} chargement={permisChargement} onRefermer={() => setCommuneStock(null)}
              />
            ) : null}
          />
        ) : null}
      />

      {/* D2/Part 6 — COHÉRENCE stock ↔ propositions : un permis peut être visible ici SANS être proposé. La raison se lit (par rail). */}
      {stockOuvert && stockLignes.length > 0 && (
        <p style={{ fontSize: 12, color: 'var(--color-svv-muted)', margin: 0 }}>
          {process === 'formulaire' ? (
            <>Un permis listé ici n’est pas toujours proposé en dépôt : sa commune peut être <strong>au plafond mensuel</strong>,
            <strong> en attente d’un accusé</strong>, ou le permis <strong>déjà demandé</strong> — dans ces cas aucune carte n’apparaît pour elle en mode automatique.</>
          ) : (
            <>Un permis listé ici n’est pas toujours proposable en lot : sa commune peut être <strong>au plafond mensuel</strong> ou
            le permis <strong>déjà demandé</strong>. Lancez « Préparer les demandes » : le détail nommé s’affiche sous l’aperçu
            (« Pourquoi peu ou pas de lots »).</>
          )}
        </p>
      )}

      {/* Préparation E-MAIL — « Préparer les demandes » (envoi groupé sur les 366 communes e-mail) + profil + retour. RETIRÉ du rail
          TÉLÉSERVICE (accord porteur) : là, le mode automatique propose une carte de dépôt par commune libre (bascule ci-dessus). */}
      {process === 'email' && (
      <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="svv-btn svv-btn-primary" style={{ padding: '.4rem .8rem' }} onClick={() => void preparerAvec(ancienneteMois)}>Préparer les demandes</button>
        <label style={{ fontSize: 12, display: 'flex', gap: '.3rem', alignItems: 'center' }}>Profil
          <select value={profilPrep} onChange={(e) => setProfilPrep(selProfil(e.target.value))} style={styleChamp}>
            {PROFILS.map((p) => <option key={p} value={p}>{ETIQUETTE_PROFIL[p]}</option>)}
          </select>
        </label>
        <MessageRetour r={retour} />
      </div>
      )}

      {process === 'email' && prop && (
        <CartePropositions
          resumeDiag={resumeDiagnostic(prop.diagnostic)} explication={explication} total={lotsProp.length}
          profilLibelle={ETIQUETTE_PROFIL[profilPrep].toLowerCase()}
          lotsVisibles={lotsVisibles} selection={selLots} nbSelLots={selCompte.nbLots} nbSelDossiers={selCompte.nbDossiers} toutCoche={toutCocheLots}
          pageCourante={pLots} nbPages={nbPagesLots}
          onBasculer={basculerLot} onToutSelectionner={toutSelectionnerLots} onPage={setPageLots} onCreer={() => void creer()}
        />
      )}

      {/* D2/Part 5 — POURQUOI peu ou pas de lots : communes NOMMÉES (fin du décompte anonyme). Scopé au process actif (canal).
          Fin de la « soirée Paris » : Paris apparaît ici, au plafond, avec son quota et sa date de libération. */}
      {process === 'email' && prop && (() => {
        const plafond = (prop.diagnostic.communesAuPlafond ?? []).filter((c) => dansProcess(c.canal, process));
        const sansCanal = process === 'email' ? (prop.diagnostic.communesSansCanalNoms ?? []) : []; // « sans canal » ne concerne que la voie e-mail
        const dejaN = prop.diagnostic.dossiersDejaRattaches;
        if (plafond.length === 0 && sansCanal.length === 0 && dejaN === 0) return null;
        const libere = dateLiberationQuota(new Date());
        return (
          <div className="svv-card" style={{ fontSize: 13 }}>
            <strong>Pourquoi peu ou pas de lots proposés (process {PROCESS_META[process].court})</strong>
            <ul style={{ margin: '.3rem 0 0 1.1rem' }}>
              {plafond.map((c) => (
                <li key={c.codeInsee}>
                  <strong>{c.nom ?? c.codeInsee}</strong> <span style={{ color: 'var(--color-svv-muted)' }}>({c.codeInsee})</span> — {c.consomme}/{c.plafond} <strong>permis</strong> déjà sollicités ce mois-ci (le plafond se compte en permis, pas en courriers), quota libéré le <strong>{libere}</strong>.
                </li>
              ))}
              {sansCanal.map((c) => (
                <li key={c.codeInsee}>{c.nom ?? '—'} <span style={{ color: 'var(--color-svv-muted)' }}>({c.codeInsee})</span> — aucun canal de contact connu (à renseigner en Réglages).</li>
              ))}
              {dejaN > 0 && <li>{dejaN} dossier(s) déjà rattaché(s) à une demande.</li>}
            </ul>
          </div>
        );
      })()}

      {/* C2/C3 — arbitrages PRADA + communes injoignables : machinerie du RAIL A (rendre joignable par e-mail) → process E-MAIL seul. */}
      {process === 'email' && <BlocPrada />}

      {/* Q6 — tableau des demandes NON ENVOYÉES du process actif + actions groupées (« prête » / annulation D1). */}
      <SuiviDemandes categories={categories} perimetre="a_demander" process={process} signalRafraichir={signalSuivi} />
    </div>
  );
}
