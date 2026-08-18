'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { ETIQUETTE_PROFIL, type ProfilDemandeur } from '../../../../lib/sitadel/demande';
import type { DemandeListe, DemandeDetail, AlerteIdentite } from '../../../../lib/sitadel/demandeRepo';
import { type Tri, type Perimetre, filtrerDemandes, trierDemandes, basculerTri, OPTIONS_TRI, cleTri, triDepuisCle, dansPerimetre, statutsDuPerimetre, statutsVivants, statutsMorts, statutsAffiches, partitionnerParDus, visiblesEnCours, CHOIX_STATUT_DEFAUT } from '../../../../lib/sitadel/demandesListe';
import { MessageRetour, repartirRetour, FiltreTypes, TableDemandes, PanneauDetailDemande, MentionMasquage, RetourMairie, etatRetourMairie, nbAutreARepondre, BadgeReponseAttendue, FOND_REPONSE_ATTENDUE, STATUT_LIBELLE, type RetourAction } from './DemandesRendu';
// T6-A — « En cours » réutilise les composants PURS de « Réponses » (compte à rebours + 7 actions), la SOURCE UNIQUE de la donnée
//   riche (chargerDemandesSuivi via /en-cours) et le calcul d'échéance INTOUCHÉ (etatEcheance). Aucun de ces imports n'affecte « À demander ».
import { EtatDemande, DetailDossiers, ActionsCloture, RappelObtenusArchives, BlocLiens, BlocAlertesGed, BlocMessagesAutre, BlocPiecesReponses, formaterDate, type RetourCible } from './ReponsesRendu';
import { etatEcheance, type EtatEcheance } from '../../../../lib/veille/echeance';
import { RefMairieCellule } from './RefMairieCellule';
import type { DemandeSuivi, ReglagesReleve } from '../../../../lib/veille/reponsesSuivi';

/**
 * Q6 — tableau des demandes d'UN PÉRIMÈTRE (partagé par « À demander » et « En cours »). Le périmètre est un pré-filtre DUR par
 * statut (`dansPerimetre`) appliqué AVANT le filtre de l'utilisateur : un onglet ne peut JAMAIS afficher les demandes de
 * l'autre, et son sélecteur Statut ne propose QUE ses statuts. Q6b — le DÉFAUT du sélecteur n'est plus « Tous » mais les statuts
 * VIVANTS (à traiter) : les statuts MORTS (annulée, close = trace) sont masqués par défaut pour ne pas noyer les vivantes,
 * MAIS jamais en silence (mention + décompte + « les afficher » = bascule sur « Toutes »). Le PÉRIMÈTRE Q6 est inchangé. Les
 * compteurs comptent CE QUI EST AFFICHÉ. `avecActionsGroupees` (⇒ « à demander ») expose « Passer en prête » / « Annuler la demande » / « Basculer »
 * (elles portent sur des brouillons) ; « en cours » n'en a aucune. Le panneau détail s'ouvre des DEUX côtés. AUCUN envoi ; on
 * change CE QUI EST AFFICHÉ, pas ce qui est permis (les transitions serveur restent inchangées). Le tri, le filtre multi-types
 * et la pagination portent sur l'ENSEMBLE du périmètre, jamais sur la page.
 */
const PROFILS: ProfilDemandeur[] = ['entreprise', 'personne'];
const PAGE_SIZE = 20;
const styleChamp: CSSProperties = { padding: '.35rem .5rem', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', fontSize: 13 };

const TEXTES: Record<Perimetre, { intro: string; vide: string }> = {
  a_demander: {
    intro: 'Demandes préparées mais pas encore parties auprès d’une mairie (brouillon, prête). Tant qu’elles ne sont pas envoyées, ce n’est pas une démarche engagée.',
    vide: 'Aucune demande en préparation. Créez-en depuis l’aperçu des lots ci-dessus.',
  },
  en_cours: {
    intro: 'Demandes INITIÉES auprès des mairies, en attente de retour (envoyée, close). L’envoi effectif reste une étape ultérieure.',
    vide: 'Aucune demande en cours. Elles apparaîtront ici une fois initiées (préparez-les dans l’onglet « À demander »).',
  },
};

type Bascule = { ids: number[]; profil: ProfilDemandeur };
interface Props {
  categories: { cle: string; libelle: string; rang: number }[];
  perimetre: Perimetre;
  signalRafraichir?: number; // Q6 : incrémenté par le parent (ex. après une création) → force un rechargement de la liste
}

async function erreurServeur(res: Response, repli: string): Promise<string> {
  try { const d = (await res.json()) as { erreur?: string }; return d?.erreur && d.erreur.trim() !== '' ? d.erreur : repli; }
  catch { return repli; }
}

export function SuiviDemandes({ categories, perimetre, signalRafraichir = 0 }: Props) {
  const avecActionsGroupees = perimetre === 'a_demander';
  const statutsFiltre = statutsDuPerimetre(perimetre);
  const avecAlertes = statutsFiltre.includes('brouillon'); // alertes d'identité = brouillons → uniquement « à demander »

  const [liste, setListe] = useState<{ demandes: DemandeListe[]; alertesIdentite: AlerteIdentite[]; referencesIndisponibles?: boolean } | null>(null);
  const [detail, setDetail] = useState<DemandeDetail | null>(null);
  const [corps, setCorps] = useState('');
  const [refDetail, setRefDetail] = useState('');
  const [retour, setRetour] = useState<RetourAction>(null);
  const [version, setVersion] = useState(0);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [choixStatut, setChoixStatut] = useState<string>(CHOIX_STATUT_DEFAUT); // Q6b : défaut = statuts VIVANTS, pas « Tous »
  const [fCommune, setFCommune] = useState('');
  const [fProfil, setFProfil] = useState('');
  const [fTypes, setFTypes] = useState<Set<number>>(new Set());
  const [fReference, setFReference] = useState('');
  const [tri, setTri] = useState<Tri>({ colonne: 'date', sens: 'desc' });
  const [page, setPage] = useState(1);
  const [confBascule, setConfBascule] = useState<Bascule | null>(null);

  // T6-A — « En cours » UNIQUEMENT : donnée riche partagée (source unique `chargerDemandesSuivi` via /en-cours) pour le compte à
  //   rebours (etatEcheance INTOUCHÉ), la colonne « Retour mairie » et les 7 actions du détail. `retourReponse` (cle-based) est le
  //   retour des actions /reponses, DISTINCT de `retour` (zone-based) des actions /demandes. RIEN de ceci n'existe pour « À demander ».
  const enCours = perimetre === 'en_cours';
  const [suivi, setSuivi] = useState<{ parId: Map<number, DemandeSuivi>; derniereOkLe: string | null; reglages: ReglagesReleve } | null>(null);
  const [maintenant, setMaintenant] = useState<Date>(() => new Date());
  const [versionSuivi, setVersionSuivi] = useState(0);
  const [retourReponse, setRetourReponse] = useState<RetourCible>(null);
  const [refus, setRefus] = useState<{ demandeId: number; dossierId: number; date: string } | null>(null); // formulaire « refus mairie » ouvert
  const [retrait, setRetrait] = useState<{ demandeId: number; dossierId: number } | null>(null);            // avertissement « retirer » ouvert
  const [motifCloture, setMotifCloture] = useState<Record<number, string>>({});                              // motif de clôture par demande

  const rafraichir = useCallback(() => setVersion((v) => v + 1), []);
  const rafraichirSuivi = useCallback(() => setVersionSuivi((v) => v + 1), []);
  const annoncer = useCallback((texte: string, ok: boolean, zone: 'haut' | 'detail' = 'haut') => setRetour(texte === '' ? null : { texte, ok, zone }), []);

  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/permis/demandes', { cache: 'no-store' });
        if (!annule && res.ok) setListe((await res.json()) as { demandes: DemandeListe[]; alertesIdentite: AlerteIdentite[]; referencesIndisponibles?: boolean });
      } catch { /* liste indisponible */ }
    })();
    return () => { annule = true; };
  }, [version, signalRafraichir]);

  // T6-A — « En cours » : charge la donnée riche (SOURCE UNIQUE partagée avec « Réponses »). Le tableau (liste) reste piloté par
  //   /demandes ; /en-cours ne fournit QUE l'échéance + le retour + les dossiers riches, fusionnés par id. « À demander » ne fetch jamais ceci.
  useEffect(() => {
    if (!enCours) return;
    let annule = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/permis/en-cours', { cache: 'no-store' });
        if (!annule && res.ok) {
          const d = (await res.json()) as { demandes: DemandeSuivi[]; derniereOkLe: string | null; reglages: ReglagesReleve };
          setSuivi({ parId: new Map(d.demandes.map((x) => [x.demandeId, x])), derniereOkLe: d.derniereOkLe, reglages: d.reglages });
          setMaintenant(new Date());
        }
      } catch { /* suivi indisponible : le tableau reste, sans compte à rebours (jamais un écran vide) */ }
    })();
    return () => { annule = true; };
  }, [enCours, version, versionSuivi, signalRafraichir]);

  // T6-A — état d'échéance par demande, calculé UNE FOIS par etatEcheance (INTOUCHÉ) sur la donnée de la source unique. Instant `maintenant` figé au chargement.
  const etatParId = useMemo(() => {
    const m = new Map<number, { etat: EtatEcheance; motif: string }>();
    if (!suivi) return m;
    const reg = { echeanceAlerteJours: suivi.reglages.alerteJours, releveFraicheurHeures: suivi.reglages.fraicheurHeures };
    const derniere = suivi.derniereOkLe ? new Date(suivi.derniereOkLe) : null;
    for (const d of suivi.parId.values()) {
      const r = etatEcheance({ envoyeLe: d.envoyeLe ? new Date(d.envoyeLe) : null, statutAcheminement: d.statutAcheminement, dossiersActifs: d.dossiersActifs, dossiersSatisfaits: d.dossiersSatisfaits, derniereReleveOkLe: derniere }, maintenant, reg);
      m.set(d.demandeId, { etat: r.etat, motif: r.motif });
    }
    return m;
  }, [suivi, maintenant]);

  // Q6 — PRÉ-FILTRE DUR par périmètre (hermeticité). Q6b — puis restreint aux statuts AFFICHÉS selon le choix du sélecteur
  // (défaut = VIVANTS). `filtrerDemandes` ne refiltre PAS le statut (déjà fait ici) : profil / commune / type / référence seulement.
  const dansP = useMemo(() => dansPerimetre(liste?.demandes ?? [], perimetre), [liste, perimetre]);
  const statutsVus = useMemo(() => new Set(statutsAffiches(perimetre, choixStatut)), [perimetre, choixStatut]);
  const dansVueStatut = useMemo(() => dansP.filter((d) => statutsVus.has(d.statut)), [dansP, statutsVus]);
  // T2-C — « En cours » applique la règle du commit A de Réponses : une demande sans AUCUN dossier dû (actif ET non satisfait)
  //   sort de la liste PAR DÉFAUT. Choisir un statut explicite (≠ défaut) désactive ce masquage → elle reste accessible via le
  //   filtre Statut existant. `À demander` n'est PAS concerné (ses brouillons/prêtes n'ont pas de dossiers retirés/satisfaits).
  const enCoursDefaut = perimetre === 'en_cours' && choixStatut === CHOIX_STATUT_DEFAUT;
  const partDus = useMemo(() => partitionnerParDus(dansVueStatut), [dansVueStatut]);
  // T8 — « En cours » : les SOLDÉES (tous dossiers actifs marqués reçus) sont TOUJOURS exclues, sous TOUT filtre (non révélable,
  //   foyer Archives : un permis n'est jamais dans deux onglets). Les sansDossier gardent le masquage révélable de défaut (T2-C).
  const dansVue = perimetre === 'en_cours' ? visiblesEnCours(dansVueStatut, enCoursDefaut) : dansVueStatut;
  const filtrees = useMemo(
    () => trierDemandes(filtrerDemandes(dansVue, { statut: '', profil: fProfil, commune: fCommune, types: [...fTypes], reference: fReference }), tri),
    [dansVue, fCommune, fProfil, fTypes, fReference, tri],
  );

  // Q6b — compteurs de CE QUI EST AFFICHÉ (statuts vus), décompte par statut. Le PÉRIMÈTRE ne bouge pas.
  const compteursVus = statutsDuPerimetre(perimetre).map((s) => ({ s, n: dansVue.filter((d) => d.statut === s).length })).filter((x) => x.n > 0);
  const dossiersVus = dansVue.reduce((acc, d) => acc + d.nbDossiers, 0);
  // Q6b — lignes MORTES (trace) écartées par le DÉFAUT : mention NON silencieuse. Uniquement en mode 'vivants' (choix
  // explicite « Toutes » ou un statut précis → rien de masqué, donc pas de mention).
  const mortsDetail = useMemo(
    () => statutsMorts(perimetre).map((s) => ({ statut: s, n: dansP.filter((d) => d.statut === s).length })),
    [perimetre, dansP],
  );
  // T2-C — sansDossier (0 dossier actif) : masquage RÉVÉLABLE de défaut, annoncé avec les morts (« les afficher » = « Toutes »).
  const mortsSansDossier = enCoursDefaut ? [{ statut: 'sans dossier actif', n: partDus.sansDossier.length }] : [];
  const morts = choixStatut === CHOIX_STATUT_DEFAUT ? [...mortsDetail, ...mortsSansDossier] : [];
  // T8 — SOLDÉES : exclusion NON RÉVÉLABLE (mention séparée, sans bouton, → Archives), sous TOUT filtre. Jamais confondue avec le masquage révélable.
  const exclusSoldees = perimetre === 'en_cours' && partDus.soldees.length > 0 ? { n: partDus.soldees.length, libelle: 'soldée(s) — voir l’onglet Archives' } : undefined;

  const nbPages = Math.max(1, Math.ceil(filtrees.length / PAGE_SIZE));
  const pageCourante = Math.min(page, nbPages);
  const visibles = filtrees.slice((pageCourante - 1) * PAGE_SIZE, pageCourante * PAGE_SIZE);
  const majFiltre = (fn: () => void): void => { fn(); setPage(1); };
  const trierPar = (colonne: Parameters<typeof basculerTri>[1]): void => { setTri((t) => basculerTri(t, colonne)); setPage(1); };
  const basculerType = (rang: number): void => majFiltre(() => setFTypes((s) => { const n = new Set(s); if (n.has(rang)) n.delete(rang); else n.add(rang); return n; }));

  const basculer = (id: number): void => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toutSelectionner = (): void => setSel((s) => {
    const tousVisibles = visibles.every((d) => s.has(d.id));
    const n = new Set(s);
    for (const d of visibles) { if (tousVisibles) n.delete(d.id); else n.add(d.id); }
    return n;
  });

  async function ouvrir(id: number, conserverRetour = false): Promise<void> {
    if (!conserverRetour) setRetour(null);
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
  async function ajouterReference(): Promise<void> {
    if (!detail) return;
    const reference = refDetail.trim();
    if (reference === '') { annoncer('Saisissez une référence.', false, 'detail'); return; }
    const res = await fetch('/api/admin/permis/demandes/reference', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ demandeId: detail.id, reference }) });
    if (res.ok) { setRefDetail(''); await ouvrir(detail.id, true); annoncer('Référence enregistrée.', true, 'detail'); }
    else annoncer(await erreurServeur(res, 'Ajout impossible.'), false, 'detail');
  }

  // FUS-4 — actions « Réf. mairie » DEPUIS LE TABLEAU (En cours). MÊME route que le détail (POST ajoute, DELETE retire) → un
  //   SEUL chemin d'écriture, jamais un second. Rafraîchissent le suivi (source des colonnes). Renvoient un message d'erreur
  //   (affiché dans la cellule) ou null. La route n'écrit jamais statut/envoye_le → effacer/modifier ne défait aucun envoi.
  const URL_REF = '/api/admin/permis/demandes/reference';
  async function ajouterRefTable(demandeId: number, reference: string): Promise<string | null> {
    const res = await fetch(URL_REF, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ demandeId, reference }) });
    if (res.ok) { rafraichirSuivi(); return null; }
    return await erreurServeur(res, 'Ajout impossible.');
  }
  async function supprimerRefTable(demandeId: number, reference: string): Promise<string | null> {
    const res = await fetch(URL_REF, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ demandeId, reference }) });
    if (res.ok) { rafraichirSuivi(); return null; }
    return await erreurServeur(res, 'Effacement impossible.');
  }
  async function modifierRefTable(demandeId: number, ancien: string, nouveau: string): Promise<string | null> {
    if (nouveau === ancien) return null;
    // Remplacer SANS jamais laisser la demande sans référence : on AJOUTE d'abord le nouveau ; on ne retire l'ancien que si le
    //   nouveau est en place (ajouté, ou 409 = déjà présent sur cette demande). Un échec RÉEL de l'ajout garde l'ancien intact.
    const resAjout = await fetch(URL_REF, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ demandeId, reference: nouveau }) });
    if (!resAjout.ok && resAjout.status !== 409) return await erreurServeur(resAjout, 'Modification impossible.');
    await fetch(URL_REF, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ demandeId, reference: ancien }) });
    rafraichirSuivi();
    return null;
  }
  async function transition(ids: number[], statut: 'prete' | 'annulee', origine: 'haut' | 'detail' = 'haut'): Promise<void> {
    if (ids.length === 0) return;
    const res = await fetch('/api/admin/permis/demandes', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, statut }) });
    if (res.ok) {
      const r = (await res.json()) as { traites: number; conflitsReactivation?: { numDau: string; dejaActiveSurDemandeId: number }[] };
      const base = `${r.traites} demande(s) ${statut === 'prete' ? 'marquée(s) prête(s)' : 'annulée(s) (permis remis au stock)'}.`;
      // B1 — compte rendu de réouverture : dossiers NON réactivés car déjà rattachés à une autre demande active (jamais silencieux).
      const conflits = r.conflitsReactivation ?? [];
      const suffixe = conflits.length > 0
        ? ` ⚠️ ${conflits.length} dossier(s) NON réactivé(s), déjà rattaché(s) à une autre demande active : ${conflits.map((c) => `${c.numDau} (demande ${c.dejaActiveSurDemandeId})`).join(', ')}.`
        : '';
      annoncer(base + suffixe, conflits.length === 0, origine);
      setSel(new Set()); if (detail && ids.includes(detail.id)) void ouvrir(detail.id, true); rafraichir();
      return;
    }
    if (res.status === 409) {
      const d = (await res.json()) as { champs?: string[] };
      annoncer(`Aucune demande modifiée : identité du demandeur incomplète — ${(d.champs ?? []).join(' ; ')}. Complétez la configuration dans l’onglet Réglages.`, false, origine);
    } else annoncer(await erreurServeur(res, 'Action impossible.'), false, origine);
  }
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

  // T6-A — actions du détail « En cours » (7 gestes des dossiers/clôture) : MÊME route POST /reponses que « Réponses » (aucune 2e
  //   implémentation). Retour cle-based (`retourReponse`) ; succès → recharge la liste, la donnée riche ET le détail ouvert (statut/clôture à jour).
  async function agirReponse(corps: Record<string, unknown>, cle: string, texteOk: string): Promise<void> {
    const res = await fetch('/api/admin/permis/reponses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
    if (res.ok) {
      setRetourReponse({ cle, texte: texteOk, ok: true });
      rafraichir(); rafraichirSuivi();
      if (detail) void ouvrir(detail.id, true); // rafraîchit l'en-tête du détail (statut après clôture/réouverture) sans effacer le retour
    } else setRetourReponse({ cle, texte: await erreurServeur(res, 'Action impossible.'), ok: false });
  }

  // T5 — téléchargement d'une pièce de réponse : SEUL signeur `url_piece` (source 'reponse' par défaut). Le client n'envoie
  //   qu'un pieceId ; le serveur lit la clé et renvoie une URL signée (la clé ne transite jamais). Aucune 2e implémentation.
  async function telechargerPiece(pieceId: number): Promise<void> {
    const res = await fetch('/api/admin/permis/reponses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'url_piece', pieceId }) });
    if (res.ok) { const { url } = (await res.json()) as { url: string }; window.open(url, '_blank', 'noopener,noreferrer'); }
    else setRetourReponse({ cle: `piece-${pieceId}`, texte: await erreurServeur(res, 'Lien indisponible.'), ok: false });
  }

  const selProfil = (id: string) => id as ProfilDemandeur;
  const zonesRetour = repartirRetour(retour, detail !== null);
  const aujourdhui = formaterDate(maintenant.toISOString()); // borne « refus le » (max) — la route reste l'autorité
  // T6-A — colonnes « Délai » (compte à rebours) + « Retour mairie », injectées dans TableDemandes UNIQUEMENT en « En cours ».
  const colonnesSuivi = enCours && suivi ? {
    largeur: 3,
    entetes: (
      <>
        <th style={{ padding: '.4rem .5rem', textAlign: 'left' as const, whiteSpace: 'nowrap' as const, minWidth: 150 }}>Délai</th>
        <th style={{ padding: '.4rem .5rem', textAlign: 'left' as const, whiteSpace: 'nowrap' as const }}>Retour mairie</th>
        <th style={{ padding: '.4rem .5rem', textAlign: 'left' as const, whiteSpace: 'nowrap' as const }}>Réf. mairie</th>
      </>
    ),
    cellule: (d: { id: number }) => {
      const rich = suivi.parId.get(d.id);
      const e = etatParId.get(d.id);
      return (
        <>
          <td style={{ padding: '.4rem .5rem', verticalAlign: 'top' as const }}>
            {rich && e ? <EtatDemande statut={rich.statut} dossiersActifs={rich.dossiersActifs} etat={e.etat} motif={e.motif} /> : <span style={{ color: 'var(--color-svv-muted)' }}>—</span>}
          </td>
          <td style={{ padding: '.4rem .5rem', verticalAlign: 'top' as const }}>
            {rich ? (
              <>
                <RetourMairie etat={etatRetourMairie(rich)} nbReponses={rich.nbReponses} derniereReponseLe={rich.derniereReponseLe} />
                {/* T7-B — badge « N à répondre » (cas ③), sous l'état documents ; porte le texte (a11y), le fond de ligne n'est qu'un appui. */}
                <div><BadgeReponseAttendue n={nbAutreARepondre(rich.messagesAutre)} /></div>
              </>
            ) : <span style={{ color: 'var(--color-svv-muted)' }}>—</span>}
          </td>
          {/* FUS-4 — Réf. mairie éditable (ajouter/modifier/effacer) via la MÊME route que le détail. « accusé reçu » DÉRIVÉ (aAccuse). */}
          {rich
            ? <RefMairieCellule references={rich.referencesMairie} aAccuse={rich.aAccuse}
                onAjouter={(r) => ajouterRefTable(d.id, r)} onModifier={(a, n) => modifierRefTable(d.id, a, n)} onSupprimer={(r) => supprimerRefTable(d.id, r)} />
            : <td style={{ padding: '.4rem .5rem', color: 'var(--color-svv-muted)' }}>—</td>}
        </>
      );
    },
  } : undefined;
  // T7-B — fond bleu de la ligne « réponse attendue » (cas ③) : dérivé du MÊME état (nbAutreARepondre > 0) que le badge.
  const fondLigne = enCours && suivi
    ? (d: { id: number }) => { const rich = suivi.parId.get(d.id); return rich && nbAutreARepondre(rich.messagesAutre) > 0 ? FOND_REPONSE_ATTENDUE : undefined; }
    : undefined;
  // T6-A — donnée riche de la demande OUVERTE (détail « En cours ») : dossiers + statut + compteurs pour DetailDossiers/ActionsCloture.
  const richDetail = enCours && detail && suivi ? suivi.parId.get(detail.id) ?? null : null;

  return (
    <div className="flex flex-col gap-4">
      {/* Q6b — compteurs de CE QUI EST AFFICHÉ + mention NON silencieuse des lignes mortes masquées par le défaut. */}
      {liste && (
        <div className="svv-card" style={{ fontSize: 13 }}>
          <strong>{dansVue.length} demande(s)</strong> · {dossiersVus} dossier(s) couvert(s) — {compteursVus.map((x) => `${x.n} ${STATUT_LIBELLE[x.s]}`).join(' · ') || 'aucune'}.
          <MentionMasquage morts={morts} onAfficherTout={() => majFiltre(() => setChoixStatut('tous'))} exclus={exclusSoldees} />
          <div style={{ color: 'var(--color-svv-muted)', marginTop: '.3rem' }}>{TEXTES[perimetre].intro}</div>
        </div>
      )}

      {avecAlertes && liste?.alertesIdentite.map((a) => (
        <div key={a.profil} className="svv-page-note" style={{ marginTop: 0, color: 'var(--color-svv-red)' }}>
          Profil « {a.libelle} » incomplet ({a.manque.join(' ; ')}). Les demandes en {a.libelle.toLowerCase()} ne pourront pas passer « prête » tant que ce n&rsquo;est pas complété (onglet Réglages).
        </div>
      ))}

      <MessageRetour r={zonesRetour.haut} />

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

      {/* U7 — le détail ne s'affiche PLUS ici (en haut) : il est rendu SOUS sa ligne, dans TableDemandes (slot `panneau`). */}

      {/* Filtres + tri (+ actions groupées si le périmètre en a) */}
      <div className="svv-card" style={{ display: 'flex', flexWrap: 'wrap', gap: '.6rem', alignItems: 'center', fontSize: 12 }}>
        {/* Q6b — le DÉFAUT est « Actives » (vivants), pas « Tous ». Chaque libellé dit ce qu'il montre ; « Toutes » nomme les morts. */}
        <label className="flex flex-col gap-1">Statut
          <select value={choixStatut} onChange={(e) => majFiltre(() => setChoixStatut(e.target.value))} style={styleChamp}>
            <option value="vivants">Actives ({statutsVivants(perimetre).map((s) => STATUT_LIBELLE[s]).join(', ')})</option>
            <option value="tous">Toutes (dont {statutsMorts(perimetre).map((s) => STATUT_LIBELLE[s]).join(', ')})</option>
            {statutsDuPerimetre(perimetre).map((s) => <option key={s} value={s}>{STATUT_LIBELLE[s]}</option>)}
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
        <label className="flex flex-col gap-1">Référence
          <input value={fReference} onChange={(e) => majFiltre(() => setFReference(e.target.value))} placeholder="mairie ou SVAV" style={styleChamp}
            aria-label="Rechercher par référence (mairie ou SVAV)" />
        </label>
        <label className="flex flex-col gap-1">Tri
          <select value={cleTri(tri)} onChange={(e) => setTri(triDepuisCle(e.target.value))} style={styleChamp}>
            {OPTIONS_TRI.map((o) => <option key={o.valeur} value={o.valeur}>{o.libelle}</option>)}
          </select>
        </label>
        <div style={{ flex: '1 1 100%' }}>
          <FiltreTypes categories={categories} coches={fTypes} onToggle={basculerType} />
        </div>
        {avecActionsGroupees && (
          <>
            <span style={{ marginLeft: 'auto' }}>{sel.size} sélectionnée(s)</span>
            <button type="button" className="svv-btn svv-btn-primary" style={{ padding: '.35rem .7rem', opacity: sel.size ? 1 : 0.5 }} disabled={sel.size === 0} onClick={() => void transition([...sel], 'prete')}>Passer en prête</button>
            <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.35rem .7rem', opacity: sel.size ? 1 : 0.5 }} disabled={sel.size === 0} onClick={() => void transition([...sel], 'annulee')}>Annuler la demande</button>
            <label className="flex flex-col gap-1">Basculer la sélection en…
              <select value="" disabled={sel.size === 0} onChange={(e) => { if (e.target.value) setConfBascule({ ids: [...sel], profil: selProfil(e.target.value) }); }} style={{ ...styleChamp, opacity: sel.size ? 1 : 0.5 }}>
                <option value="">—</option>
                {PROFILS.map((p) => <option key={p} value={p}>{ETIQUETTE_PROFIL[p]}</option>)}
              </select>
            </label>
          </>
        )}
      </div>

      {liste?.referencesIndisponibles && (
        <div role="status" style={{ fontSize: 12, color: 'var(--color-svv-red)', fontWeight: 600 }}>
          Recherche par référence mairie indisponible (lecture en erreur) — seule la référence SVAV est prise en compte.
        </div>
      )}

      <TableDemandes
        visibles={visibles} categories={categories} tri={tri} sel={sel} avecSelection={avecActionsGroupees}
        toutCoche={visibles.length > 0 && visibles.every((d) => sel.has(d.id))}
        messageVide={!liste ? 'Chargement…' : (fReference.trim() !== ''
          ? `Aucune demande ne correspond à la référence « ${fReference.trim()} » (mairie ou SVAV ; casse, espaces et tirets ignorés).`
          : TEXTES[perimetre].vide)}
        // U7 — accordéon À UN SEUL VOLET : `detail` est UN objet (jamais un Set) → au plus une ligne dépliée ; le panneau se rend SOUS sa ligne.
        demandeOuverte={detail?.id ?? null}
        // T6-A — colonnes Délai + Retour mairie (En cours seulement ; undefined → « À demander » inchangé).
        colonnesSuivi={colonnesSuivi}
        // T7-B — fond bleu « réponse attendue » (En cours seulement ; undefined ailleurs).
        fondLigne={fondLigne}
        panneau={detail ? (
          <PanneauDetailDemande
            detail={detail} corps={corps} refDetail={refDetail} retour={zonesRetour.detail}
            onCorps={setCorps} onRefDetail={setRefDetail}
            onFermer={() => setDetail(null)}
            onSauverCorps={() => void sauverCorps()}
            onAjouterReference={() => void ajouterReference()}
            onBascule={(p) => setConfBascule({ ids: [detail.id], profil: p })}
            onTransition={(statut) => void transition([detail.id], statut, 'detail')}
            // T6-A — En cours : les 7 actions (DetailDossiers + ActionsCloture) via la MÊME route POST /reponses. À demander : slots absents → détail inchangé.
            slotDossiers={richDetail ? (
              <>
                <RappelObtenusArchives n={richDetail.dossiersSatisfaits} />
                <DetailDossiers demandeId={detail.id} statut={richDetail.statut} dossiers={richDetail.dossiers} retour={retourReponse}
                  aujourdhui={aujourdhui} prefillRefus={richDetail.derniereReponseLe ? formaterDate(richDetail.derniereReponseLe) : aujourdhui}
                  onMarquer={(demandeId, dossierId, satisfait) => void agirReponse({ action: 'marquer_dossier', demandeId, dossierId, satisfait }, `dossier-${demandeId}-${dossierId}`, satisfait ? 'Marqué reçu.' : 'Satisfaction annulée.')}
                  onNonFourni={(demandeId, dossierId) => void agirReponse({ action: 'dossier_non_fourni', demandeId, dossierId }, `dossier-${demandeId}-${dossierId}`, 'Marqué « non fourni » — le dossier reste dû.')}
                  onAnnulerTriage={(demandeId, dossierId) => void agirReponse({ action: 'annuler_triage', demandeId, dossierId }, `dossier-${demandeId}-${dossierId}`, 'Statut annulé — retour à « dû ».')}
                  refusOuvertDossierId={refus?.demandeId === detail.id ? refus.dossierId : null}
                  refusDate={refus?.demandeId === detail.id ? refus.date : undefined}
                  onRefusOuvrir={(demandeId, dossierId, prefill) => setRefus({ demandeId, dossierId, date: prefill })}
                  onRefusDateChange={(date) => setRefus((r) => (r ? { ...r, date } : r))}
                  onRefusConfirmer={(demandeId, dossierId, date) => { setRefus(null); void agirReponse({ action: 'dossier_refus_mairie', demandeId, dossierId, refusLe: date }, `dossier-${demandeId}-${dossierId}`, 'Refus mairie enregistré — candidat à la saisine CADA.'); }}
                  onRefusAnnuler={() => setRefus(null)}
                  retirerOuvertDossierId={retrait?.demandeId === detail.id ? retrait.dossierId : null}
                  onRetirerOuvrir={(dossierId) => setRetrait({ demandeId: detail.id, dossierId })}
                  onRetirerConfirmer={(demandeId, dossierId) => { setRetrait(null); void agirReponse({ action: 'retirer_dossier', demandeId, dossierId }, `dossier-${demandeId}-${dossierId}`, 'Dossier retiré — il redevient demandable dans « À demander ».'); }}
                  onRetirerAnnuler={() => setRetrait(null)} />
                {/* L1 — MÊME BlocLiens que « Réponses », injecté par slot avec les liens DÉJÀ chargés (richDetail.liens) : un
                    accusé porteur d'un lien reste hors de « Réponses » (T3) mais son lien doit rester visible ICI, dans « En cours ». */}
                <BlocLiens liens={richDetail.liens} maintenant={new Date()} />
                {/* T5 — pièces des réponses rattachées, consultables/téléchargeables ici aussi (une demande porteuse de documents peut être en « En cours »). */}
                <BlocPiecesReponses groupes={richDetail.piecesReponses} onTelecharger={(pieceId) => void telechargerPiece(pieceId)} />
                {/* G1 — alertes « à classer/télécharger en GED » envoyées pour cette demande (retard rendu visible). */}
                <BlocAlertesGed alertes={richDetail.alertesGed} />
                {/* T7-B (cas ③) — messages « autre » appelant une réponse : bouton « répondu » MANUEL et RÉVERSIBLE par message. */}
                <BlocMessagesAutre messages={richDetail.messagesAutre} retour={retourReponse} compteReleve={suivi?.reglages.adresseReleve}
                  onRepondu={(reponseId) => void agirReponse({ action: 'repondu', reponseId }, `repondu-${reponseId}`, 'Message marqué « répondu ».')}
                  onAnnulerRepondu={(reponseId) => void agirReponse({ action: 'annuler_repondu', reponseId }, `repondu-${reponseId}`, '« Répondu » annulé.')} />
              </>
            ) : undefined}
            slotActions={richDetail ? (
              <ActionsCloture demandeId={detail.id} statut={richDetail.statut} dossiersDus={richDetail.dossiersActifs - richDetail.dossiersSatisfaits}
                motif={motifCloture[detail.id]} retour={retourReponse}
                onMotif={(demandeId, v) => setMotifCloture((s) => ({ ...s, [demandeId]: v }))}
                onCloturer={(demandeId) => void agirReponse({ action: 'cloturer', demandeId, motif: motifCloture[demandeId] ?? '' }, `cloturer-${demandeId}`, 'Demande clôturée.')}
                onRouvrir={(demandeId) => void agirReponse({ action: 'rouvrir', demandeId }, `rouvrir-${demandeId}`, 'Demande rouverte.')} />
            ) : undefined}
          />
        ) : null}
        onTrier={trierPar} onToutSelectionner={avecActionsGroupees ? toutSelectionner : undefined} onBasculer={avecActionsGroupees ? basculer : undefined}
        // U7 — le bouton de ligne BASCULE : rouvrir la ligne ouverte la referme ; ouvrir une AUTRE remplace le détail (un seul volet).
        onOuvrir={(id) => { if (detail?.id === id) setDetail(null); else void ouvrir(id); }}
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
