'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { type Lot, type DiagnosticProposition, expliquerProposition, resumeDiagnostic, ETIQUETTE_PROFIL, type ProfilDemandeur, cleLot, compterSelection, bornerAncienneteMois } from '../../../../lib/sitadel/demande';
import type { StockResultat, PermisDetail, CompteRenduCreation } from '../../../../lib/sitadel/demandeRepo';
import { PERIODE_STOCK_DEFAUT } from '../../../../lib/sitadel/stock';
import { MessageRetour, CartePropositions, BlocStock, TableStock, PanneauDetailStock, BandeauReglages, type RetourAction } from './DemandesRendu';
import { BlocPrada } from './BlocPrada';
import { BlocDepot } from './BlocDepot';
import { SuiviDemandes } from './SuiviDemandes';

/**
 * Q5 — onglet « À DEMANDER » : tout ce qui PRÉCÈDE la création d'une demande. Extrait sans changement de logique de l'ex-onglet
 * « Demandes » : bandeau de rappel + filtre d'ancienneté (Q4), stock par commune (Q2b) devenu le contenu CENTRAL et OUVERT par
 * défaut, « Préparer les demandes » + profil + aperçu des lots avec sélection lot par lot (V3), et le bloc PRADA/injoignables
 * (C2/C3) qui conditionne la création. Aucun état n'est partagé avec « En cours » : la liste des demandes vit là-bas, et une
 * création apparaît dans « En cours » au prochain affichage de cet onglet (il recharge à son montage). AUCUN envoi.
 */
const PROFILS: ProfilDemandeur[] = ['entreprise', 'personne'];
const PAGE_SIZE = 20;
const styleChamp: CSSProperties = { padding: '.35rem .5rem', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', fontSize: 13 };

interface Props { categories: { cle: string; libelle: string; rang: number }[]; ancienneteMaxAnnees: number; triLibelle: string; onAllerReglages: () => void }

/** Message d'échec = la RAISON réelle renvoyée par le serveur ({erreur}), jamais un libellé figé à deux mots. */
async function erreurServeur(res: Response, repli: string): Promise<string> {
  try { const d = (await res.json()) as { erreur?: string }; return d?.erreur && d.erreur.trim() !== '' ? d.erreur : repli; }
  catch { return repli; }
}

export function ADemanderVue({ categories, ancienneteMaxAnnees, triLibelle, onAllerReglages }: Props) {
  const [prop, setProp] = useState<{ lots: Lot[]; diagnostic: DiagnosticProposition; profil: ProfilDemandeur } | null>(null);
  const [profilPrep, setProfilPrep] = useState<ProfilDemandeur>('entreprise');
  const [retour, setRetour] = useState<RetourAction>(null);
  // V3 — sélection des lots à créer : vit ICI (clés de lot stables), JAMAIS dans la page affichée → survit à la pagination.
  const [selLots, setSelLots] = useState<Set<string>>(new Set());
  const [pageLots, setPageLots] = useState(1);
  // Q2b/Q5 — STOCK par commune : contenu CENTRAL de cet onglet, OUVERT par défaut (il n'est plus secondaire). Chargé au montage.
  const [stockOuvert, setStockOuvert] = useState(true);
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

  const annoncer = useCallback((texte: string, ok: boolean) => setRetour(texte === '' ? null : { texte, ok, zone: 'haut' }), []);

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
      setProp(null); setSelLots(new Set()); setPageLots(1); setSignalSuivi((s) => s + 1);
    } else annoncer(await erreurServeur(res, 'Création impossible.'), false);
  }

  const explication = prop ? expliquerProposition(prop.lots.length, prop.diagnostic) : '';
  const selProfil = (id: string) => id as ProfilDemandeur;

  // V3 — pagination + décompte des lots (sur l'ENSEMBLE, jamais la page).
  const lotsProp = prop?.lots ?? [];
  const nbPagesLots = Math.max(1, Math.ceil(lotsProp.length / PAGE_SIZE));
  const pLots = Math.min(pageLots, nbPagesLots);
  const lotsVisibles = lotsProp.slice((pLots - 1) * PAGE_SIZE, pLots * PAGE_SIZE).map((l) => ({
    cle: cleLot(l), codeInsee: l.codeInsee, communeNom: l.communeNom, canal: l.canal, nbDossiers: l.dossiers.length, destOrigine: l.destOrigine, destNom: l.destNom, profilImpose: l.profilImpose,
  }));
  const selCompte = compterSelection(lotsProp, selLots);
  const toutCocheLots = lotsProp.length > 0 && selCompte.nbLots === lotsProp.length;
  const basculerLot = (cle: string): void => setSelLots((s) => { const n = new Set(s); if (n.has(cle)) n.delete(cle); else n.add(cle); return n; });
  const toutSelectionnerLots = (): void => setSelLots(toutCocheLots ? new Set<string>() : new Set(lotsProp.map(cleLot)));

  return (
    <div className="flex flex-col gap-4">
      {/* Q4 — rappel des réglages + filtre d'ancienneté, en tête de l'onglet. */}
      <BandeauReglages
        ancienneteMaxAnnees={ancienneteMaxAnnees} triLibelle={triLibelle}
        moisSaisie={moisSaisie} maxMois={maxMois} onMois={changerMois} onAllerReglages={onAllerReglages}
      />

      {/* Q2b/Q5 — STOCK par commune : contenu CENTRAL, ouvert par défaut. */}
      <BlocStock
        ouvert={stockOuvert} onToggle={toggleStock} chargement={stockChargement}
        stock={stock?.lignes ?? null} tronque={stock?.tronque} genereEnMs={stock?.genereEnMs} fenetreMois={stock?.fenetreMois ?? ancienneteMois}
        table={stock ? (
          <TableStock
            lignes={stock.lignes} categories={categories} communeOuverte={communeStock} onDetail={ouvrirDetailStock}
            panneau={communeStock !== null ? (
              <PanneauDetailStock
                communeNom={stock.lignes.find((l) => l.codeInsee === communeStock)?.communeNom ?? communeStock}
                categories={categories}
                periode={periodeStock} onPeriode={setPeriodeStock} typeFiltre={typeStock} onType={setTypeStock}
                permis={permisStock} chargement={permisChargement} onRefermer={() => setCommuneStock(null)}
              />
            ) : null}
          />
        ) : null}
      />

      {/* Préparation : lance la proposition, choisit le profil, affiche le retour d'action. */}
      <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="svv-btn svv-btn-primary" style={{ padding: '.4rem .8rem' }} onClick={() => void preparerAvec(ancienneteMois)}>Préparer les demandes</button>
        <label style={{ fontSize: 12, display: 'flex', gap: '.3rem', alignItems: 'center' }}>Profil
          <select value={profilPrep} onChange={(e) => setProfilPrep(selProfil(e.target.value))} style={styleChamp}>
            {PROFILS.map((p) => <option key={p} value={p}>{ETIQUETTE_PROFIL[p]}</option>)}
          </select>
        </label>
        <MessageRetour r={retour} />
      </div>

      {prop && (
        <CartePropositions
          resumeDiag={resumeDiagnostic(prop.diagnostic)} explication={explication} total={lotsProp.length}
          profilLibelle={ETIQUETTE_PROFIL[profilPrep].toLowerCase()}
          lotsVisibles={lotsVisibles} selection={selLots} nbSelLots={selCompte.nbLots} nbSelDossiers={selCompte.nbDossiers} toutCoche={toutCocheLots}
          pageCourante={pLots} nbPages={nbPagesLots}
          onBasculer={basculerLot} onToutSelectionner={toutSelectionnerLots} onPage={setPageLots} onCreer={() => void creer()}
        />
      )}

      {/* C2/C3 — arbitrages PRADA (info) + communes sans adresse (saisie) : ils conditionnent la création, ils suivent. */}
      <BlocPrada />

      {/* P3 — « à déposer à la main » (téléservice) : un dépôt non effectué EST un envoi non effectué → il vit ici. */}
      <BlocDepot />

      {/* Q6 — tableau des demandes NON ENVOYÉES (brouillon/prête ; abandonnée via le filtre) + actions groupées « prête »/« abandonner ». */}
      <SuiviDemandes categories={categories} perimetre="a_demander" signalRafraichir={signalSuivi} />
    </div>
  );
}
