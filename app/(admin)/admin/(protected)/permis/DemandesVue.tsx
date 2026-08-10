'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { type Lot, type DiagnosticProposition, expliquerProposition, resumeDiagnostic, ancreDetail, ETIQUETTE_PROFIL, type ProfilDemandeur, cleLot, compterSelection } from '../../../../lib/sitadel/demande';
import type { DemandeListe, DemandeDetail, ResumeDemandes, AlerteIdentite, CompteRenduCreation, StockResultat, PermisDetail } from '../../../../lib/sitadel/demandeRepo';
import { type Tri, filtrerDemandes, trierDemandes, basculerTri, OPTIONS_TRI, cleTri, triDepuisCle } from '../../../../lib/sitadel/demandesListe';
import { PERIODE_STOCK_DEFAUT, FENETRE_STOCK_MOIS } from '../../../../lib/sitadel/stock';
import { OrigineDest, MessageRetour, repartirRetour, CartePropositions, FiltreTypes, TableDemandes, STATUT_LIBELLE, BlocStock, TableStock, PanneauDetailStock, type RetourAction } from './DemandesRendu';
import { BlocPrada } from './BlocPrada';
import { BlocDepot } from './BlocDepot';

/**
 * Gestion des demandes de communication (S7 / S7b / S7e). Deux profils de demandeur (Société / Personne physique) :
 * chaque demande porte le sien ; une bascule EN UN CLIC (sur brouillon) régénère le texte après confirmation. Colonne et
 * filtre « profil ». ⚠️ AUCUNE action d'envoi (préparation et revue seulement).
 */
// STATUT_LIBELLE : déplacé dans DemandesRendu.tsx (source unique, réutilisé par le tableau pur et ici) — importé ci-dessus.
const PROFILS: ProfilDemandeur[] = ['entreprise', 'personne'];
const PAGE_SIZE = 20;
const styleChamp: CSSProperties = { padding: '.35rem .5rem', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', fontSize: 13 };

type Bascule = { ids: number[]; profil: ProfilDemandeur };
interface Props { categories: { cle: string; libelle: string; rang: number }[] }

/** Message d'échec = la RAISON réelle renvoyée par le serveur ({erreur}), jamais un libellé figé à deux mots. */
async function erreurServeur(res: Response, repli: string): Promise<string> {
  try { const d = (await res.json()) as { erreur?: string }; return d?.erreur && d.erreur.trim() !== '' ? d.erreur : repli; }
  catch { return repli; }
}

export function DemandesVue({ categories }: Props) {
  const [liste, setListe] = useState<{ demandes: DemandeListe[]; alertesIdentite: AlerteIdentite[]; resume: ResumeDemandes; referencesIndisponibles?: boolean } | null>(null);
  const [prop, setProp] = useState<{ lots: Lot[]; diagnostic: DiagnosticProposition; profil: ProfilDemandeur } | null>(null);
  const [profilPrep, setProfilPrep] = useState<ProfilDemandeur>('entreprise');
  const [detail, setDetail] = useState<DemandeDetail | null>(null);
  const [corps, setCorps] = useState('');
  const [retour, setRetour] = useState<RetourAction>(null);
  const [version, setVersion] = useState(0);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [fStatut, setFStatut] = useState('');
  const [fCommune, setFCommune] = useState('');
  const [fProfil, setFProfil] = useState('');
  const [fTypes, setFTypes] = useState<Set<number>>(new Set()); // D2 : rangs de catégorie cochés ([]=tous)
  const [fReference, setFReference] = useState(''); // P1 : recherche par référence (SVAV ou mairie), '' = aucun filtre
  const [refDetail, setRefDetail] = useState(''); // P1 : saisie d'une référence à ajouter APRÈS COUP depuis le détail
  const [tri, setTri] = useState<Tri>({ colonne: 'date', sens: 'desc' }); // D2 : état de tri PARTAGÉ sélecteur ↔ en-têtes
  const [page, setPage] = useState(1);
  const [confBascule, setConfBascule] = useState<Bascule | null>(null); // confirmation avant régénération
  // V3 — sélection des lots à créer : vit ICI (clés de lot stables), JAMAIS dans la page affichée → survit à la pagination.
  const [selLots, setSelLots] = useState<Set<string>>(new Set());
  const [pageLots, setPageLots] = useState(1);
  // Q2b — STOCK par commune : bloc repliable FERMÉ par défaut, données chargées à l'OUVERTURE (jamais au montage de l'onglet).
  const [stockOuvert, setStockOuvert] = useState(false);
  const [stock, setStock] = useState<StockResultat | null>(null);
  const [stockChargement, setStockChargement] = useState(false);
  const [communeStock, setCommuneStock] = useState<string | null>(null);           // code INSEE du panneau ouvert (une seule ligne à la fois)
  const [periodeStock, setPeriodeStock] = useState<string>(PERIODE_STOCK_DEFAUT);   // panneau : période (défaut 6 mois)
  const [typeStock, setTypeStock] = useState<string>('immeuble_neuf');              // panneau : type (défaut immeuble neuf)
  const [permisStock, setPermisStock] = useState<PermisDetail[] | null>(null);      // null = en cours de chargement
  const [permisChargement, setPermisChargement] = useState(false);

  const rafraichir = useCallback(() => setVersion((v) => v + 1), []);
  // S42 — annonce un retour d'action dans la zone où l'utilisateur a agi ('haut' groupé, 'detail' panneau). Texte vide → efface.
  const annoncer = useCallback((texte: string, ok: boolean, zone: 'haut' | 'detail' = 'haut') => setRetour(texte === '' ? null : { texte, ok, zone }), []);

  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/permis/demandes', { cache: 'no-store' });
        if (!annule && res.ok) setListe((await res.json()) as { demandes: DemandeListe[]; alertesIdentite: AlerteIdentite[]; resume: ResumeDemandes; referencesIndisponibles?: boolean });
      } catch { /* liste indisponible */ }
    })();
    return () => { annule = true; };
  }, [version]);

  // Q2b — chargement de l'AGRÉGAT du stock (une seule fois, à la 1re ouverture du bloc). Un échec laisse le bloc consultable.
  const chargerStock = useCallback(() => {
    setStockChargement(true);
    void (async () => {
      try {
        const res = await fetch('/api/admin/permis/demandes/stock', { cache: 'no-store' });
        if (res.ok) setStock((await res.json()) as StockResultat);
      } catch { /* stock indisponible (journalisé côté serveur) */ }
      finally { setStockChargement(false); }
    })();
  }, []);
  const toggleStock = useCallback(() => {
    const ouvrir = !stockOuvert;
    setStockOuvert(ouvrir);
    if (ouvrir && stock === null && !stockChargement) chargerStock(); // charge à l'ouverture, pas au montage
  }, [stockOuvert, stock, stockChargement, chargerStock]);
  // Re-clic sur la même commune → referme ; sinon ouvre CETTE commune en repartant des filtres par DÉFAUT (6 mois / immeuble neuf).
  const ouvrirDetailStock = useCallback((code: string) => {
    setCommuneStock((actuel) => {
      if (actuel === code) return null;
      setPeriodeStock(PERIODE_STOCK_DEFAUT); setTypeStock('immeuble_neuf');
      return code;
    });
  }, []);

  // Q2b — chargement du PANNEAU (permis délivrés d'UNE commune), rejoué à chaque changement de commune / période / type.
  // Tous les setState vivent DANS l'IIFE async (jamais synchrones en corps d'effet) — même motif que l'effet de liste ci-dessus.
  useEffect(() => {
    if (communeStock === null) return;
    let annule = false;
    void (async () => {
      setPermisChargement(true); setPermisStock(null); // repart « en chargement » à chaque nouvelle commune/période/type
      try {
        const qs = new URLSearchParams({ commune: communeStock, periode: periodeStock, type: typeStock });
        const res = await fetch(`/api/admin/permis/demandes/stock?${qs.toString()}`, { cache: 'no-store' });
        if (!annule && res.ok) { const d = (await res.json()) as { permis: PermisDetail[] }; setPermisStock(d.permis); }
      } catch { /* détail indisponible (journalisé côté serveur) */ }
      finally { if (!annule) setPermisChargement(false); }
    })();
    return () => { annule = true; };
  }, [communeStock, periodeStock, typeStock]);

  // D2 — filtre PUIS tri sur l'ENSEMBLE (jamais sur la page) ; la pagination `slice` s'applique APRÈS (cf. `visibles`).
  const filtrees = useMemo(
    () => trierDemandes(filtrerDemandes(liste?.demandes ?? [], { statut: fStatut, profil: fProfil, commune: fCommune, types: [...fTypes], reference: fReference }), tri),
    [liste, fStatut, fCommune, fProfil, fTypes, fReference, tri],
  );

  const nbPages = Math.max(1, Math.ceil(filtrees.length / PAGE_SIZE));
  const pageCourante = Math.min(page, nbPages);
  const visibles = filtrees.slice((pageCourante - 1) * PAGE_SIZE, pageCourante * PAGE_SIZE);
  const majFiltre = (fn: () => void): void => { fn(); setPage(1); };
  // D2 — un clic sur un en-tête bascule le sens (même colonne) ou change de colonne : MÊME état `tri` que le sélecteur.
  const trierPar = (colonne: Parameters<typeof basculerTri>[1]): void => { setTri((t) => basculerTri(t, colonne)); setPage(1); };
  const basculerType = (rang: number): void => majFiltre(() => setFTypes((s) => { const n = new Set(s); if (n.has(rang)) n.delete(rang); else n.add(rang); return n; }));

  const basculer = (id: number): void => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toutSelectionner = (): void => setSel((s) => {
    const tousVisibles = visibles.every((d) => s.has(d.id));
    const n = new Set(s);
    for (const d of visibles) { if (tousVisibles) n.delete(d.id); else n.add(d.id); }
    return n;
  });

  async function preparer(): Promise<void> {
    setRetour(null);
    const res = await fetch(`/api/admin/permis/demandes/proposition?profil=${profilPrep}`, { cache: 'no-store' });
    // Nouvelle proposition → repart d'une sélection VIDE (jamais « tout créer » par défaut) et de la 1re page.
    if (res.ok) { const p = (await res.json()) as { lots: Lot[]; diagnostic: DiagnosticProposition; profil: ProfilDemandeur }; setProp(p); setProfilPrep(p.profil); setSelLots(new Set()); setPageLots(1); }
    else annoncer(await erreurServeur(res, 'Proposition indisponible.'), false);
  }
  async function creer(): Promise<void> {
    const lots = prop?.lots ?? [];
    const selectionnes = lots.filter((l) => selLots.has(cleLot(l))).map((l) => ({ cle: cleLot(l), communeNom: l.communeNom }));
    if (selectionnes.length === 0) { annoncer('Cochez au moins un lot avant de créer.', false); return; }
    const res = await fetch('/api/admin/permis/demandes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profil: profilPrep, lots: selectionnes }) });
    if (res.ok) {
      const r = (await res.json()) as CompteRenduCreation;
      // Compte rendu TOUJOURS chiffré (demandes + dossiers), et les lots ignorés/conflits sont nommés (jamais un 0 muet).
      const bouts = [`${r.demandesCreees} demande(s) créée(s) en ${ETIQUETTE_PROFIL[r.profil].toLowerCase()}`, `${r.dossiersCrees} dossier(s)`];
      if (r.lotsInvalides.length) bouts.push(`${r.lotsInvalides.length} lot(s) ignoré(s) (${r.lotsInvalides.map((x) => x.communeNom ?? x.cle).join(', ')})`);
      if (r.ignoresConflit) bouts.push(`${r.ignoresConflit} conflit(s)`);
      annoncer(`${bouts.join(' · ')}.`, true);
      setProp(null); setSelLots(new Set()); setPageLots(1); rafraichir();
    } else annoncer(await erreurServeur(res, 'Création impossible.'), false);
  }
  async function ouvrir(id: number, conserverRetour = false): Promise<void> {
    if (!conserverRetour) setRetour(null); // rechargement post-transition : ne pas effacer le retour qu'on vient de poser
    const res = await fetch(`/api/admin/permis/demandes/${id}`, { cache: 'no-store' });
    if (res.ok) { const d = (await res.json()) as DemandeDetail; setDetail(d); setCorps(d.corps ?? ''); }
    else annoncer(await erreurServeur(res, 'Ouverture impossible.'), false);
  }
  async function sauverCorps(): Promise<void> {
    if (!detail) return;
    const res = await fetch(`/api/admin/permis/demandes/${detail.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ corps }) });
    if (res.ok) { setDetail((await res.json()) as DemandeDetail); annoncer('Texte enregistré.', true, 'detail'); }
    else annoncer(await erreurServeur(res, 'Enregistrement impossible.'), false, 'detail');
  }
  // P1 — ajoute une référence mairie APRÈS COUP (fonctionne quel que soit le statut : l'accusé arrive parfois après le dépôt).
  async function ajouterReference(): Promise<void> {
    if (!detail) return;
    const reference = refDetail.trim();
    if (reference === '') { annoncer('Saisissez une référence.', false, 'detail'); return; }
    const res = await fetch('/api/admin/permis/demandes/reference', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ demandeId: detail.id, reference }) });
    if (res.ok) { setRefDetail(''); await ouvrir(detail.id, true); annoncer('Référence enregistrée.', true, 'detail'); } // recharge le détail (référence visible)
    else annoncer(await erreurServeur(res, 'Ajout impossible.'), false, 'detail'); // 409 nommé : « déjà enregistrée pour cette demande »
  }
  // `origine` = zone d'affichage du retour : 'detail' pour les boutons du panneau détail, 'haut' pour l'action groupée.
  async function transition(ids: number[], statut: 'prete' | 'abandonnee', origine: 'haut' | 'detail' = 'haut'): Promise<void> {
    if (ids.length === 0) return;
    const res = await fetch('/api/admin/permis/demandes', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, statut }) });
    if (res.ok) {
      const r = (await res.json()) as { traites: number };
      annoncer(`${r.traites} demande(s) ${statut === 'prete' ? 'marquée(s) prête(s)' : 'abandonnée(s)'}.`, true, origine);
      setSel(new Set()); if (detail && ids.includes(detail.id)) void ouvrir(detail.id, true); rafraichir();
      return;
    }
    if (res.status === 409) {
      const d = (await res.json()) as { champs?: string[] };
      annoncer(`Aucune demande modifiée : identité du demandeur incomplète — ${(d.champs ?? []).join(' ; ')}. Complétez la configuration dans l’onglet Réglages.`, false, origine);
    } else annoncer(await erreurServeur(res, 'Action impossible.'), false, origine);
  }
  /** Applique la bascule de profil confirmée (régénère le texte). Un seul refus ⇒ zéro écriture (tout-ou-rien serveur). */
  async function appliquerBascule(): Promise<void> {
    if (!confBascule) return;
    const { ids, profil } = confBascule;
    setConfBascule(null);
    const res = await fetch('/api/admin/permis/demandes', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, profil }) });
    if (res.ok) {
      const r = (await res.json()) as { traites: number };
      annoncer(`${r.traites} demande(s) basculée(s) en ${ETIQUETTE_PROFIL[profil].toLowerCase()} (texte régénéré).`, true);
      setSel(new Set()); if (detail && ids.includes(detail.id)) void ouvrir(detail.id, true); rafraichir();
      return;
    }
    if (res.status === 409) { const d = (await res.json()) as { erreur?: string }; annoncer(`Aucune bascule : ${d.erreur ?? 'transition interdite'}.`, false); }
    else annoncer(await erreurServeur(res, 'Bascule impossible.'), false);
  }

  const r = liste?.resume;
  const explication = prop ? expliquerProposition(prop.lots.length, prop.diagnostic) : '';
  const selProfil = (id: string) => id as ProfilDemandeur;

  // V3 — pagination + décompte des lots proposés. La sélection (selLots) est indépendante de la page : le décompte est
  // calculé sur l'ENSEMBLE des lots (compterSelection), et « tout sélectionner » agit sur tous les lots, pas la page.
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
  // S42 — le retour s'affiche dans UNE seule zone : le panneau détail s'il est ouvert et concerné, sinon le bandeau du haut.
  const zonesRetour = repartirRetour(retour, detail !== null);

  return (
    <div className="flex flex-col gap-4">
      {r && (
        <div className="svv-card" style={{ fontSize: 13 }}>
          <strong>{r.total} demande(s)</strong> · {r.dossiersCouverts} dossier(s) couvert(s) — {['brouillon', 'prete', 'envoyee', 'close', 'abandonnee'].filter((s) => r.parStatut[s]).map((s) => `${r.parStatut[s]} ${STATUT_LIBELLE[s]}`).join(' · ') || 'aucune'}.
          <div style={{ color: 'var(--color-svv-muted)', marginTop: '.3rem' }}>
            À ce stade, <strong>rien n&rsquo;est envoyé</strong> : cet écran prépare et permet de relire les demandes. L&rsquo;envoi est une étape ultérieure.
          </div>
        </div>
      )}
      {/* Alertes d'identité CIBLÉES par profil réellement utilisé en brouillon */}
      {liste?.alertesIdentite.map((a) => (
        <div key={a.profil} className="svv-page-note" style={{ marginTop: 0, color: 'var(--color-svv-red)' }}>
          Profil « {a.libelle} » incomplet ({a.manque.join(' ; ')}). Les demandes en {a.libelle.toLowerCase()} ne pourront pas passer « prête » tant que ce n&rsquo;est pas complété (onglet Réglages).
        </div>
      ))}

      {/* Confirmation de bascule (le texte va être régénéré) */}
      {confBascule && (
        <div className="svv-card" style={{ borderColor: 'var(--color-svv-red)', fontSize: 13 }}>
          <strong>Basculer {confBascule.ids.length} demande(s) en {ETIQUETTE_PROFIL[confBascule.profil].toLowerCase()} ?</strong>
          <div style={{ color: 'var(--color-svv-muted)', margin: '.3rem 0 .5rem' }}>Le texte va être régénéré depuis l’identité de ce profil : <strong>les modifications manuelles du corps seront perdues</strong>.</div>
          <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
            <button type="button" className="svv-btn svv-btn-primary" style={{ padding: '.3rem .8rem' }} onClick={() => void appliquerBascule()}>Confirmer la bascule</button>
            <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.3rem .8rem' }} onClick={() => setConfBascule(null)}>Annuler</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.4rem .8rem' }} onClick={() => void preparer()}>Préparer les demandes</button>
        <label style={{ fontSize: 12, display: 'flex', gap: '.3rem', alignItems: 'center' }}>Profil
          <select value={profilPrep} onChange={(e) => setProfilPrep(selProfil(e.target.value))} style={styleChamp}>
            {PROFILS.map((p) => <option key={p} value={p}>{ETIQUETTE_PROFIL[p]}</option>)}
          </select>
        </label>
        <MessageRetour r={zonesRetour.haut} />
      </div>

      {/* S14e — arbitrages PRADA (info) + rapprochements ambigus à trancher (rattachement/écartement manuel) */}
      <BlocPrada />
      {/* S16 — file « à déposer à la main » (canal formulaire / téléservice) */}
      <BlocDepot />

      {prop && (
        <CartePropositions
          resumeDiag={resumeDiagnostic(prop.diagnostic)} explication={explication} total={lotsProp.length}
          profilLibelle={ETIQUETTE_PROFIL[profilPrep].toLowerCase()}
          lotsVisibles={lotsVisibles} selection={selLots} nbSelLots={selCompte.nbLots} nbSelDossiers={selCompte.nbDossiers} toutCoche={toutCocheLots}
          pageCourante={pLots} nbPages={nbPagesLots}
          onBasculer={basculerLot} onToutSelectionner={toutSelectionnerLots} onPage={setPageLots} onCreer={() => void creer()}
        />
      )}

      {detail && (
        <div id={ancreDetail(detail.id)} className="svv-card flex flex-col gap-2">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
            <strong>{detail.reference} — {detail.communeNom ?? detail.codeInsee} — {STATUT_LIBELLE[detail.statut] ?? detail.statut} — {ETIQUETTE_PROFIL[detail.profil as ProfilDemandeur] ?? detail.profil}</strong>
            <button type="button" className="svv-link" style={{ width: 'auto', padding: '.15rem .4rem' }} onClick={() => setDetail(null)}>fermer</button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-svv-muted)', display: 'flex', gap: '.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <span>Destinataire figé : {detail.canal}{detail.destEmail ? ` · ${detail.destEmail}` : ''}{detail.destAdressePostale ? ` · ${detail.destAdressePostale}` : ''}{detail.destUrlFormulaire ? ` · ${detail.destUrlFormulaire}` : ''}</span>
            <OrigineDest origine={detail.destOrigine} nom={detail.destNom} />
          </div>
          {/* Bascule de profil — un clic ; sur brouillon uniquement (sinon désactivée + raison). */}
          <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center', flexWrap: 'wrap', fontSize: 12 }}>
            <span style={{ color: 'var(--color-svv-muted)' }}>Profil :</span>
            {PROFILS.map((p) => {
              const actif = detail.profil === p;
              const brouillon = detail.statut === 'brouillon';
              return (
                <button key={p} type="button"
                  className={`svv-btn ${actif ? 'svv-btn-primary' : 'svv-btn-outline'}`}
                  style={{ padding: '.25rem .7rem', opacity: brouillon || actif ? 1 : 0.5, cursor: brouillon && !actif ? 'pointer' : 'default' }}
                  disabled={actif || !brouillon}
                  onClick={() => setConfBascule({ ids: [detail.id], profil: p })}>{ETIQUETTE_PROFIL[p]}</button>
              );
            })}
            {detail.statut !== 'brouillon' && <span style={{ color: 'var(--color-svv-muted)' }}>bascule impossible : la demande n&rsquo;est plus en brouillon.</span>}
          </div>
          <textarea value={corps} onChange={(e) => setCorps(e.target.value)} rows={16} readOnly={detail.statut !== 'brouillon'}
            style={{ width: '100%', fontFamily: 'var(--font-svv-mono, monospace)', fontSize: 12, padding: '.5rem', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem' }} />
          <div><span style={{ fontSize: 12, color: 'var(--color-svv-muted)' }}>Dossiers ({detail.dossiers.length}) : </span><span style={{ fontSize: 12 }}>{detail.dossiers.map((x) => x.numDau).join(', ')}</span></div>
          {/* P1 — références de la mairie (preuve de dépôt) : VISIBLES + ajout APRÈS COUP (l'accusé de réception arrive parfois plus tard). */}
          <div style={{ fontSize: 12 }}>
            <span style={{ color: 'var(--color-svv-muted)' }}>Références mairie : </span>
            {/* P2 — « indisponibles » (lecture en erreur, journalisée) est DISTINCT de « aucune enregistrée » (lecture OK, vide). */}
            {detail.referencesMairieIndisponible
              ? <span role="status" style={{ color: 'var(--color-svv-red)', fontWeight: 600 }}>indisponibles (lecture en erreur — voir les journaux)</span>
              : detail.referencesMairie.length === 0
                ? <span style={{ color: 'var(--color-svv-muted)' }}>aucune enregistrée</span>
                : <span style={{ fontFamily: 'var(--font-svv-mono, monospace)' }}>{detail.referencesMairie.map((r) => r.reference).join(', ')}</span>}
            <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', marginTop: '.3rem', alignItems: 'center' }}>
              <input value={refDetail} onChange={(e) => setRefDetail(e.target.value)} placeholder="ajouter une référence mairie" aria-label="Ajouter une référence mairie"
                style={{ padding: '.3rem .5rem', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', fontSize: 13, fontFamily: 'var(--font-svv-mono, monospace)' }} />
              <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.3rem .7rem' }} onClick={() => void ajouterReference()}>Ajouter la référence</button>
            </div>
          </div>
          {detail.statut === 'brouillon' && (
            <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
              <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.35rem .8rem' }} onClick={() => void sauverCorps()}>Enregistrer le texte</button>
              <button type="button" className="svv-btn svv-btn-primary" style={{ padding: '.35rem .8rem' }} onClick={() => void transition([detail.id], 'prete', 'detail')}>Marquer prête</button>
              <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.35rem .8rem' }} onClick={() => void transition([detail.id], 'abandonnee', 'detail')}>Abandonner</button>
            </div>
          )}
          {/* S42 — retour d'action affiché LÀ où l'utilisateur a cliqué (hors du bloc brouillon : survit au passage en « prête »). */}
          <MessageRetour r={zonesRetour.detail} />
        </div>
      )}

      {/* Q2b — STOCK de permis à demander par commune : bloc repliable, AU-DESSUS de la liste, fermé + chargé à l'ouverture. */}
      <BlocStock
        ouvert={stockOuvert} onToggle={toggleStock} chargement={stockChargement}
        stock={stock?.lignes ?? null} tronque={stock?.tronque} genereEnMs={stock?.genereEnMs} fenetreMois={stock?.fenetreMois ?? FENETRE_STOCK_MOIS}
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

      {/* Filtres + tri + actions groupées */}
      <div className="svv-card" style={{ display: 'flex', flexWrap: 'wrap', gap: '.6rem', alignItems: 'center', fontSize: 12 }}>
        <label className="flex flex-col gap-1">Statut
          <select value={fStatut} onChange={(e) => majFiltre(() => setFStatut(e.target.value))} style={styleChamp}>
            <option value="">Tous</option>
            {['brouillon', 'prete', 'envoyee', 'close', 'abandonnee'].map((s) => <option key={s} value={s}>{STATUT_LIBELLE[s]}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">Profil
          <select value={fProfil} onChange={(e) => majFiltre(() => setFProfil(e.target.value))} style={styleChamp}>
            <option value="">Tous</option>
            {PROFILS.map((p) => <option key={p} value={p}>{ETIQUETTE_PROFIL[p]}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">Commune
          <input value={fCommune} onChange={(e) => majFiltre(() => setFCommune(e.target.value))} placeholder="nom ou code" style={styleChamp} />
        </label>
        {/* P1 — recherche par RÉFÉRENCE : un seul champ pour la réf. mairie ET la réf. SVAV (au téléphone, pas de case à choisir). */}
        <label className="flex flex-col gap-1">Référence
          <input value={fReference} onChange={(e) => majFiltre(() => setFReference(e.target.value))} placeholder="mairie ou SVAV" style={styleChamp}
            aria-label="Rechercher par référence (mairie ou SVAV)" />
        </label>
        <label className="flex flex-col gap-1">Tri
          <select value={cleTri(tri)} onChange={(e) => setTri(triDepuisCle(e.target.value))} style={styleChamp}>
            {OPTIONS_TRI.map((o) => <option key={o.valeur} value={o.valeur}>{o.libelle}</option>)}
          </select>
        </label>
        {/* D2 — filtre par TYPE de permis (multi-sélection, « au moins un dossier ») ; libellés de l'app, jamais inventés. */}
        <div style={{ flex: '1 1 100%' }}>
          <FiltreTypes categories={categories} coches={fTypes} onToggle={basculerType} />
        </div>
        <span style={{ marginLeft: 'auto' }}>{sel.size} sélectionnée(s)</span>
        <button type="button" className="svv-btn svv-btn-primary" style={{ padding: '.35rem .7rem', opacity: sel.size ? 1 : 0.5 }} disabled={sel.size === 0} onClick={() => void transition([...sel], 'prete')}>Passer en prête</button>
        <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.35rem .7rem', opacity: sel.size ? 1 : 0.5 }} disabled={sel.size === 0} onClick={() => void transition([...sel], 'abandonnee')}>Abandonner</button>
        <label className="flex flex-col gap-1">Basculer la sélection en…
          <select value="" disabled={sel.size === 0} onChange={(e) => { if (e.target.value) setConfBascule({ ids: [...sel], profil: selProfil(e.target.value) }); }} style={{ ...styleChamp, opacity: sel.size ? 1 : 0.5 }}>
            <option value="">—</option>
            {PROFILS.map((p) => <option key={p} value={p}>{ETIQUETTE_PROFIL[p]}</option>)}
          </select>
        </label>
      </div>

      {/* P2 — lecture des références en ERREUR (journalisée) : signalée à l'écran, DISTINCTE de « aucun résultat ». */}
      {liste?.referencesIndisponibles && (
        <div role="status" style={{ fontSize: 12, color: 'var(--color-svv-red)', fontWeight: 600 }}>
          Recherche par référence mairie indisponible (lecture en erreur) — seule la référence SVAV est prise en compte.
        </div>
      )}
      {/* D3 — tableau extrait en composant PUR (colonne « Type » + conteneur défilant a11y). Tri/filtre/pagination inchangés. */}
      <TableDemandes
        visibles={visibles} categories={categories} tri={tri} sel={sel}
        toutCoche={visibles.length > 0 && visibles.every((d) => sel.has(d.id))}
        messageVide={!liste ? 'Chargement…' : (fReference.trim() !== ''
          ? `Aucune demande ne correspond à la référence « ${fReference.trim()} » (mairie ou SVAV ; casse, espaces et tirets ignorés).`
          : 'Aucune demande pour ces filtres. Cliquez « Préparer les demandes ».')}
        onTrier={trierPar} onToutSelectionner={toutSelectionner} onBasculer={basculer} onOuvrir={(id) => void ouvrir(id)}
      />

      {nbPages > 1 && (
        <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>
          <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.35rem .7rem' }} disabled={pageCourante <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Précédent</button>
          <span>Page {pageCourante} / {nbPages} ({filtrees.length} demande(s))</span>
          <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.35rem .7rem' }} disabled={pageCourante >= nbPages} onClick={() => setPage((p) => Math.min(nbPages, p + 1))}>Suivant</button>
        </div>
      )}
    </div>
  );
}
