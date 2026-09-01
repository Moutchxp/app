'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { recompterSiSucces } from './comptesActions';
import { echeanceDe, etatEcheance, type EtatEcheance } from '../../../../lib/veille/echeance';
import type { ReponsesData } from '../../../../lib/veille/reponsesSuivi';
import type { FenetreCumul } from '../../../../lib/veille/fenetresCumul';
import { dansProcess } from '../../../../lib/sitadel/process';
import {
  BlocEtatReleve, EtatDemande, CompteSatisfaction, DetailDossiers, RappelObtenusArchives,
  partitionnerReponses, comparerUrgenceReponse, messageReponsesVide, aReponseSansDocuments, BadgeReponseSansDocuments,
  BlocARattacher, BlocPropositions, RelanceCarte, ActionsCloture, PhraseVide, BlocLiens, BlocLiensATelecharger, BlocAlertesGed, BlocMessagesAutre, BlocPiecesReponses, formaterDate, trierOptionsDemandes, type RetourCible, type OptionDemande,
} from './ReponsesRendu';
import { MessageRetour, MentionMasquage } from './DemandesRendu';
// UNIF-2 — même encart de familles qu'« En cours » (socle UNIF-0/1) + les 4 blocs PER-PERMIS d'« Analyse » (chargés au dépliage).
import { EncartFamilles, SousSectionsPermis } from './EncartFamilles';
import { BlocFilEchanges } from './BlocFilEchanges'; // LOT-4 — même fil d'échanges mail qu'en Analyse/Archives
import { SousBlocRepliable } from './SousBlocRepliable'; // LOT-5 — repli léger (1 clic) du sous-bloc artefacts, sans BlocRepliable imbriqué
import { LIBELLE_FAMILLE } from '../../../../lib/permis/encartFamilles';
import { BlocCompletude } from './BlocCompletude';
import { CaracteristiquesBloc } from './CaracteristiquesBloc';
import { BlocTraceEmprise } from './BlocTraceEmprise';
import { BlocPiecesPermis } from './BlocPiecesPermis';
import { partitionnerParDus } from '../../../../lib/sitadel/demandesListe'; // T4 : définition unique de « soldée » (réutilisée telle quelle)

/**
 * R5a/R5b/R5c — écran « Réponses » : suivi de la boucle CRPA + ACTIONS. R5b : rattacher, marquer/annuler un dossier reçu,
 * télécharger une pièce, marquer traitée. R5c : éditer / régénérer / abandonner un brouillon de relance, CLÔTURER une demande
 * et la ROUVRIR (une demande close reste visible, identifiée « Clôturée », avec son bouton Rouvrir). ⚠️ demande.statut est
 * désormais écrit — mais UNIQUEMENT via la route (cloturer/rouvrir), jamais ici. L'état d'échéance est calculé via
 * `etatEcheance` (réutilisé) sur un instant figé au chargement. Le message de retour s'affiche À CÔTÉ du bouton cliqué (repli
 * au bandeau si l'emplacement n'est plus rendu) ; une action réussie recharge les données SANS effacer le message posé.
 */
const PAGE = 20;
const styleTh: CSSProperties = { padding: '.4rem .5rem', textAlign: 'left' };
const styleTd: CSSProperties = { padding: '.4rem .5rem', verticalAlign: 'top' };
const styleH2: CSSProperties = { fontSize: 15, fontWeight: 700, margin: 0 };

async function erreurServeur(res: Response, repli: string): Promise<string> {
  try { const d = (await res.json()) as { erreur?: string }; return d?.erreur && d.erreur.trim() !== '' ? d.erreur : repli; }
  catch { return repli; }
}

function Pagination({ page, nbPages, total, onPage }: { page: number; nbPages: number; total: number; onPage: (p: number) => void }) {
  if (nbPages <= 1) return null;
  return (
    <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>
      <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.35rem .7rem' }} disabled={page <= 1} onClick={() => onPage(Math.max(1, page - 1))}>Précédent</button>
      <span>Page {page} / {nbPages} ({total})</span>
      <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.35rem .7rem' }} disabled={page >= nbPages} onClick={() => onPage(Math.min(nbPages, page + 1))}>Suivant</button>
    </div>
  );
}

export function ReponsesVue({ process, onRecompter }: { process: import('../../../../lib/sitadel/process').Process; onRecompter?: () => void }) {
  const [data, setData] = useState<ReponsesData | null>(null);
  const [maintenant, setMaintenant] = useState<Date>(() => new Date());
  const [erreur, setErreur] = useState(false);
  const [retour, setRetour] = useState<RetourCible>(null);
  const [selDemande, setSelDemande] = useState<Record<number, number>>({});
  const [motifCloture, setMotifCloture] = useState<Record<number, string>>({});    // R5c : motif de clôture par demande
  const [brouillons, setBrouillons] = useState<Record<number, { objet: string; corps: string }>>({}); // R5c : édition relance
  const [dossOuverts, setDossOuverts] = useState<Set<number>>(new Set());
  const [relOuvertes, setRelOuvertes] = useState<Set<number>>(new Set());
  const [refus, setRefus] = useState<{ demandeId: number; dossierId: number; date: string } | null>(null);   // T1 : formulaire « refus mairie » ouvert (date en cours de saisie)
  const [retrait, setRetrait] = useState<{ demandeId: number; dossierId: number } | null>(null);              // T1 : avertissement « retirer » ouvert
  const [reattach, setReattach] = useState<{ demandeId: number; dossierId: number } | null>(null);            // T1 : confirmation « annuler le retrait » ouverte
  const [afficherSoldees, setAfficherSoldees] = useState(false); // T2 : par défaut on masque les demandes sans dossier dû (soldées / sans dossier actif)
  const [pageDem, setPageDem] = useState(1);
  const [pageRat, setPageRat] = useState(1);
  const [pageProp, setPageProp] = useState(1);
  const [propDate, setPropDate] = useState<{ reponseId: number; date: string } | null>(null); // T4 : formulaire « déposée le » ouvert (date en cours) — VIDE au départ
  const [pageRel, setPageRel] = useState(1);
  const [periode, setPeriode] = useState<FenetreCumul>('7j'); // T2 : fenêtre du total ; purement locale (les 6 cumuls sont déjà chargés)
  const [releveOuvert, setReleveOuvert] = useState(false); // U8 : encart « État de la relève » REPLIÉ par défaut (aucune mémorisation) ; la ligne d'état reste visible
  const [version, setVersion] = useState(0);

  // Rechargement = incrément de `version` (dép. de l'effet) SANS toucher au retour : une action réussie recharge les données
  // mais garde le message qu'on vient de poser. Motif async-IIFE de DemandesVue → aucun setState synchrone dans l'effet.
  const rafraichir = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/permis/reponses', { cache: 'no-store' });
        if (!annule) { if (res.ok) { setData((await res.json()) as ReponsesData); setMaintenant(new Date()); } else setErreur(true); }
      } catch { if (!annule) setErreur(true); }
    })();
    return () => { annule = true; };
  }, [version]);

  const demandes = useMemo(() => {
    if (!data) return [];
    const reg = { echeanceAlerteJours: data.reglages.alerteJours, releveFraicheurHeures: data.reglages.fraicheurHeures };
    const derniere = data.derniereOkLe ? new Date(data.derniereOkLe) : null;
    // D2 — SCOPE PROCESS du suivi des demandes envoyées (filtre d'affichage sur le canal figé). Le rattachement des messages
    //   orphelins (optionsDemandes ci-dessous) reste NON filtré : une réponse peut concerner une demande de l'autre process.
    return data.demandes.filter((d) => dansProcess(d.canal, process)).map((d) => {
      const envoye = d.envoyeLe ? new Date(d.envoyeLe) : null;
      const r = etatEcheance({ envoyeLe: envoye, statutAcheminement: d.statutAcheminement, dossiersActifs: d.dossiersActifs, dossiersSatisfaits: d.dossiersSatisfaits, derniereReleveOkLe: derniere }, maintenant, reg);
      return { ...d, etat: r.etat as EtatEcheance, motif: r.motif, echeanceLe: envoye ? echeanceDe(envoye) : null };
    }).sort(comparerUrgenceReponse); // PART-D : lien en attente (plus ancien d'abord), puis échéance CADA la plus proche.
  }, [data, maintenant, process]);

  // Options du sélecteur de rattachement : les demandes envoyée/close (référence + commune + date, jamais un id brut). T4 : les
  //   SOLDÉES et CLOSE sont DÉMOTÉES (candidates moins probables) mais restent présentes et sélectionnables (filtrer, pas amputer).
  const optionsDemandes: OptionDemande[] = useMemo(() => {
    const dem = data?.demandes ?? [];
    // soldée = MÊME définition que partout (partitionnerParDus, réutilisée telle quelle) : des dossiers attachés, 0 dû.
    const idsSoldees = new Set(
      partitionnerParDus(dem.map((d) => ({ demandeId: d.demandeId, nbDossiers: d.dossiersActifs, dossiersDus: d.dossiersActifs - d.dossiersSatisfaits })))
        .soldees.map((x) => x.demandeId),
    );
    const options: OptionDemande[] = dem.map((d) => ({
      demandeId: d.demandeId, reference: d.reference, communeNom: d.communeNom, envoyeLe: d.envoyeLe,
      statut: d.statut, soldee: idsSoldees.has(d.demandeId),
    }));
    return trierOptionsDemandes(options); // candidates probables (non soldées/close) d'abord, puis date décroissante
  }, [data]);

  // ── Actions (POST) ─ toutes journalisées côté serveur ; le retour s'affiche à la CLÉ de l'emplacement cliqué. ──
  const agir = useCallback(async (corps: Record<string, unknown>, cle: string, texteOk: string): Promise<void> => {
    const res = await fetch('/api/admin/permis/reponses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
    if (res.ok) { setRetour({ cle, texte: texteOk, ok: true }); rafraichir(); } // recharge sans effacer le retour
    else setRetour({ cle, texte: await erreurServeur(res, 'Action impossible.'), ok: false });
    recompterSiSucces(res.ok, onRecompter); // pastille : recompter après une action réussie (jamais après un échec)
  }, [rafraichir, onRecompter]);

  // T1 — RÉ-ATTACHER un dossier retiré (« annuler le retrait »). Route EXISTANTE, telle quelle. 200 {ok:true} → de nouveau dû ;
  //   200 {ok:false} → 'introuvable' (le retrait n'existe plus) ; 409 → 'conflit' (message serveur). Sur échec, aucun état changé.
  const reattacher = useCallback(async (demandeId: number, dossierId: number): Promise<void> => {
    const cle = `dossier-${demandeId}-${dossierId}`;
    const res = await fetch('/api/admin/permis/reponses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reattacher_dossier', demandeId, dossierId }) });
    if (res.ok) {
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (d.ok) { setRetour({ cle, texte: 'Dossier ré-attaché — il redevient dû.', ok: true }); rafraichir(); }
      else setRetour({ cle, texte: 'Ré-attachement impossible : ce retrait n’existe plus (déjà ré-attaché ?).', ok: false });
    } else setRetour({ cle, texte: await erreurServeur(res, 'Ré-attachement impossible.'), ok: false });
    recompterSiSucces(res.ok, onRecompter); // pastille : recompter après un ré-attachement réussi
  }, [rafraichir, onRecompter]);

  // LOT 35 — CONFIRMER un dépôt : la réponse porte `referenceCaptee` (référence mairie attribuée depuis l'accusé). VÉRITÉ D'ÉCRAN :
  //   on dit si la référence a été enregistrée (elle apparaîtra dans « Réf. mairie » après rafraîchissement) ou, sinon, on invite à
  //   la saisir à la main — jamais un champ vide silencieux alors que la donnée existait.
  const confirmerDepotUI = useCallback(async (reponseId: number, demandeId: number, date: string): Promise<void> => {
    const cle = `proposition-${reponseId}`;
    const res = await fetch('/api/admin/permis/reponses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'confirmer_depot', reponseId, demandeId, envoyeLe: date }) });
    if (res.ok) {
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; referenceCaptee?: string | null };
      const suffixe = d.referenceCaptee
        ? ` Référence mairie ${d.referenceCaptee} enregistrée.`
        : ' Aucune référence détectée dans l’accusé — saisissez-la à la main dans la colonne « Réf. mairie ».';
      setRetour({ cle, texte: `Dépôt confirmé — demande passée « envoyée », message rattaché.${suffixe}`, ok: true });
      rafraichir();
    } else setRetour({ cle, texte: await erreurServeur(res, 'Action impossible.'), ok: false });
    recompterSiSucces(res.ok, onRecompter);
  }, [rafraichir, onRecompter]);

  const telecharger = useCallback(async (reponseId: number, pieceId: number): Promise<void> => {
    const res = await fetch('/api/admin/permis/reponses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'url_piece', pieceId }) });
    if (res.ok) { const { url } = (await res.json()) as { url: string }; window.open(url, '_blank', 'noopener,noreferrer'); }
    else setRetour({ cle: `piece-${reponseId}`, texte: await erreurServeur(res, 'Lien indisponible.'), ok: false });
  }, []);

  // UNIF-2 — ouverture d'une pièce À LA PAGE (visionneur) pour les familles per-permis (Caractéristiques / Pièces du permis). MÊME
  //   signeur unique `url_piece` (inline) qu'« Analyse » / « En cours » ; la clé ne transite jamais. Silencieux si indisponible.
  const ouvrirPiece = useCallback(async (pieceId: number, source: 'reponse' | 'dossier', page?: number): Promise<void> => {
    try {
      const res = await fetch('/api/admin/permis/reponses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'url_piece', pieceId, source, inline: true }) });
      if (res.ok) { const { url } = (await res.json()) as { url: string }; window.open(page ? `${url}#page=${page}` : url, '_blank', 'noopener,noreferrer'); }
    } catch { /* lien indisponible : silencieux */ }
  }, []);

  if (erreur) return <p role="alert" style={{ color: 'var(--color-svv-red)' }}>Suivi indisponible.</p>;
  if (!data) return <p style={{ color: 'var(--color-svv-muted)' }} aria-live="polite">Chargement du suivi…</p>;

  const toggle = (set: Set<number>, id: number): Set<number> => { const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); return n; };

  // T6-A/2 — FILTRE LOCAL à Réponses (partitionnerReponses, PUR) : EXCLUT les demandes sans retour (foyer = « En cours »), de façon
  //   STRICTE (jamais révélées, même par « afficher tout »). Le toggle `afficherSoldees` ne lève QUE le masquage de confort (soldées /
  //   sans dossier actif, qui ONT un retour). Rien en silence : soldées/sans-dossier = révélables (mention + bouton) ; sans-retour =
  //   EXCLUES (mention `exclus`, sans bouton, « suivies dans En cours »). Jamais dans `chargerDemandesSuivi` → « En cours » les garde.
  const { affichees: demAffichees, soldees, sansDossier, sansRetour } = partitionnerReponses(demandes, afficherSoldees);
  // PART-A — les demandes « dossier partiel » (suspension active) ont pour foyer « En cours » : demandeADuRetour les écarte déjà de
  //   `affichees`, mais elles restent dans le décompte `sansRetour` (= length − avecRetour). On les ISOLE pour une mention EXACTE
  //   (« en dossier partiel », pas « sans retour ») et un `sansRetour` PUR — un compte qui ne ment pas (précédent 18/08).
  const nbSuspendues = demandes.filter((x) => x.suspension != null).length;
  const sansRetourPur = sansRetour - nbSuspendues;
  const mortsMasquage = afficherSoldees ? [] : [
    { statut: 'soldée', n: soldees },
    { statut: 'sans dossier actif', n: sansDossier },
  ];
  const nbPagesDem = Math.max(1, Math.ceil(demAffichees.length / PAGE));
  const pDem = Math.min(pageDem, nbPagesDem);
  const demVisibles = demAffichees.slice((pDem - 1) * PAGE, pDem * PAGE);

  const nbPagesRat = Math.max(1, Math.ceil(data.aRattacher.length / PAGE));
  const pRat = Math.min(pageRat, nbPagesRat);
  const ratVisibles = data.aRattacher.slice((pRat - 1) * PAGE, pRat * PAGE);

  const nbPagesProp = Math.max(1, Math.ceil(data.propositions.length / PAGE));
  const pProp = Math.min(pageProp, nbPagesProp);
  const propVisibles = data.propositions.slice((pProp - 1) * PAGE, pProp * PAGE);

  const nbPagesRel = Math.max(1, Math.ceil(data.relances.length / PAGE));
  const pRel = Math.min(pageRel, nbPagesRel);
  const relVisibles = data.relances.slice((pRel - 1) * PAGE, pRel * PAGE);

  // L'emplacement du retour est-il RENDU ? Sinon on le replie proprement dans le bandeau (jamais dédoublé).
  const estRendu = (cle: string): boolean => {
    // dossier-/cloturer-/rouvrir- vivent dans le dépliant d'UNE demande visible (le 2e segment = demandeId).
    if (cle.startsWith('dossier-') || cle.startsWith('cloturer-') || cle.startsWith('rouvrir-')) { const d = Number(cle.split('-')[1]); return dossOuverts.has(d) && demVisibles.some((x) => x.demandeId === d); }
    if (cle.startsWith('rattacher-') || cle.startsWith('traiter-') || cle.startsWith('piece-')) { const id = Number(cle.split('-')[1]); return ratVisibles.some((x) => x.id === id); }
    if (cle.startsWith('proposition-')) { const id = Number(cle.split('-')[1]); return propVisibles.some((x) => x.id === id); }
    if (cle.startsWith('relance-')) { const id = Number(cle.split('-')[1]); return relOuvertes.has(id) && relVisibles.some((x) => x.id === id); }
    return false;
  };
  const retourBanniere = retour && !estRendu(retour.cle) ? { texte: retour.texte, ok: retour.ok, zone: 'haut' as const } : null;
  const aujourdhui = formaterDate(maintenant.toISOString()); // T1 : borne « refus le » (max + garde bouton) — la route reste l'autorité

  return (
    <div className="flex flex-col gap-4">
      {retourBanniere && <div><MessageRetour r={retourBanniere} /></div>}

      {/* ── Bloc 1 : état de la relève — U8 REPLIABLE (replié = titre + ligne d'état ; le reste, dont sélecteur/total/phrases
           de TableRuns, se déploie). Replié par défaut, aucune mémorisation. La ligne d'état porte son alerte, sans dépliage auto. ── */}
      <BlocEtatReleve
        reglages={data.reglages} derniereOkLe={data.derniereOkLe} releveDepuisLe={data.releveDepuisLe} relevePlafondAtteint={data.relevePlafondAtteint}
        runs={data.runs} cumul={data.cumuls[periode]}
        periode={periode} maintenant={maintenant} ouvert={releveOuvert} onToggle={() => setReleveOuvert((o) => !o)} onPeriode={setPeriode}
      />

      {/* ── GED-1 : liens de téléchargement disponibles (lien fort + GED vide) — EN TÊTE, visibles dès l'ouverture, sans déplier ni
           afficher les soldées. NON filtrés par process : un lien qui expire ne se cache pas derrière le commutateur. ── */}
      <BlocLiensATelecharger liens={data.liensATelecharger} maintenant={maintenant} />

      {/* ── Bloc 2 : suivi des demandes envoyées ── */}
      <section className="flex flex-col gap-2">
        <h2 style={styleH2}>Suivi des demandes envoyées</h2>
        {demandes.length === 0 ? (
          <PhraseVide>Aucune demande envoyée pour l’instant.</PhraseVide>
        ) : (
          <>
            {demAffichees.length === 0 ? (
              <PhraseVide>{soldees + sansDossier + sansRetourPur === 0 && nbSuspendues > 0
                ? 'Les demandes en « dossier partiel » sont suivies dans l’onglet « En cours ».' // PART-A : état vide dû aux seules suspendues
                : messageReponsesVide({ soldees, sansDossier, sansRetour: sansRetourPur })}</PhraseVide>
            ) : (
              <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ color: 'var(--color-svv-muted)', borderBottom: '1px solid var(--color-svv-line)' }}>
                    {['Référence', 'Commune', 'Envoyée le', 'Échéance', 'État', 'Dossiers', 'Réponses', ''].map((h) => <th key={h} style={styleTh}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {demVisibles.map((d) => {
                    const ouvert = dossOuverts.has(d.demandeId);
                    return [
                      <tr key={d.demandeId} style={{ borderBottom: ouvert ? 'none' : '1px solid var(--color-svv-line)' }}>
                        <td style={{ ...styleTd, fontFamily: 'var(--font-svv-mono, monospace)' }}>{d.reference}</td>
                        <td style={styleTd}>{d.communeNom ?? d.codeInsee}</td>
                        <td style={styleTd}>{formaterDate(d.envoyeLe)}</td>
                        <td style={styleTd}>{d.statut === 'close' || d.dossiersActifs === 0 ? '—' : (d.echeanceLe ? formaterDate(d.echeanceLe.toISOString()) : '—')}</td>
                        <td style={styleTd}>
                          {/* T2 commit B — l'échéance reste TOUJOURS affichée ; le badge « réponse sans documents » s'EMPILE en dessous (jamais de substitution). */}
                          <div className="flex flex-col gap-1">
                            <EtatDemande statut={d.statut} dossiersActifs={d.dossiersActifs} etat={d.etat} motif={d.motif} />
                            {aReponseSansDocuments(d.dossiers) && <BadgeReponseSansDocuments demandeId={d.demandeId} />}
                          </div>
                        </td>
                        <td style={styleTd}><CompteSatisfaction satisfaits={d.dossiersSatisfaits} total={d.dossiersActifs} /></td>
                        <td style={{ ...styleTd, textAlign: 'right' }}>{d.nbReponses}</td>
                        <td style={styleTd}><button type="button" className="svv-link" style={{ width: 'auto', padding: '.15rem .4rem' }} aria-expanded={ouvert} onClick={() => setDossOuverts((s) => toggle(s, d.demandeId))}>{ouvert ? 'masquer' : 'détail'}</button></td>
                      </tr>,
                      ouvert ? (
                        <tr key={`${d.demandeId}-detail`} style={{ borderBottom: '1px solid var(--color-svv-line)' }}>
                          <td colSpan={8} style={{ padding: '0 .5rem .5rem' }}>
                            {/* UNIF-2 — MÊME encart de familles qu'« En cours ». « Réponses » n'a NI suspension NI cascade NI réf. mairie
                                dans son détail (spécifiques En cours) : « Suivi & actions » = statuer dossiers + rappel obtenus + clôture.
                                Les 4 familles per-permis (si non vides) réutilisent SousSectionsPermis (contenu chargé au dépliage). */}
                            <EncartFamilles onglet="reponses" familles={[
                              {
                                cle: 'suivi_actions', nonVide: true, titre: LIBELLE_FAMILLE.suivi_actions,
                                contenu: () => (
                                <>
                            {/* T2 — les dossiers obtenus sont partis en Archives : on le DIT, on ne les fait pas disparaître en silence. */}
                            <RappelObtenusArchives n={d.dossiersSatisfaits} />
                            {/* LOT-3 — plus de garde au site d'appel : DetailDossiers est l'autorité UNIQUE de l'état vide (via nbSatisfaits), même règle qu'En cours. */}
                            <DetailDossiers demandeId={d.demandeId} statut={d.statut} dossiers={d.dossiers} nbSatisfaits={d.dossiersSatisfaits} retour={retour}
                              aujourdhui={aujourdhui} prefillRefus={d.derniereReponseLe ? formaterDate(d.derniereReponseLe) : aujourdhui}
                              onMarquer={(demandeId, dossierId, satisfait) => void agir({ action: 'marquer_dossier', demandeId, dossierId, satisfait }, `dossier-${demandeId}-${dossierId}`, satisfait ? 'Marqué reçu.' : 'Satisfaction annulée.')}
                              onNonFourni={(demandeId, dossierId) => void agir({ action: 'dossier_non_fourni', demandeId, dossierId }, `dossier-${demandeId}-${dossierId}`, 'Marqué « non fourni » — le dossier reste dû.')}
                              onAnnulerTriage={(demandeId, dossierId) => void agir({ action: 'annuler_triage', demandeId, dossierId }, `dossier-${demandeId}-${dossierId}`, 'Statut annulé — retour à « dû ».')}
                              refusOuvertDossierId={refus?.demandeId === d.demandeId ? refus.dossierId : null}
                              refusDate={refus?.demandeId === d.demandeId ? refus.date : undefined}
                              onRefusOuvrir={(demandeId, dossierId, prefill) => setRefus({ demandeId, dossierId, date: prefill })}
                              onRefusDateChange={(date) => setRefus((r) => (r ? { ...r, date } : r))}
                              onRefusConfirmer={(demandeId, dossierId, date) => { setRefus(null); void agir({ action: 'dossier_refus_mairie', demandeId, dossierId, refusLe: date }, `dossier-${demandeId}-${dossierId}`, 'Refus mairie enregistré — candidat à la saisine CADA.'); }}
                              onRefusAnnuler={() => setRefus(null)}
                              retirerOuvertDossierId={retrait?.demandeId === d.demandeId ? retrait.dossierId : null}
                              onRetirerOuvrir={(dossierId) => setRetrait({ demandeId: d.demandeId, dossierId })}
                              onRetirerConfirmer={(demandeId, dossierId) => { setRetrait(null); void agir({ action: 'retirer_dossier', demandeId, dossierId }, `dossier-${demandeId}-${dossierId}`, 'Dossier retiré — il redevient demandable dans « À demander ».'); }}
                              onRetirerAnnuler={() => setRetrait(null)}
                              dossiersRetires={d.dossiersRetires}
                              reattachOuvertDossierId={reattach?.demandeId === d.demandeId ? reattach.dossierId : null}
                              onReattachOuvrir={(dossierId) => setReattach({ demandeId: d.demandeId, dossierId })}
                              onReattachConfirmer={(demandeId, dossierId) => { setReattach(null); void reattacher(demandeId, dossierId); }}
                              onReattachAnnuler={() => setReattach(null)} />
                            <div style={{ marginTop: '.5rem' }}>
                              <ActionsCloture demandeId={d.demandeId} statut={d.statut} dossiersDus={d.dossiersActifs - d.dossiersSatisfaits}
                                motif={motifCloture[d.demandeId]} retour={retour}
                                onMotif={(demandeId, v) => setMotifCloture((s) => ({ ...s, [demandeId]: v }))}
                                onCloturer={(demandeId) => void agir({ action: 'cloturer', demandeId, motif: motifCloture[demandeId] ?? '' }, `cloturer-${demandeId}`, 'Demande clôturée.')}
                                onRouvrir={(demandeId) => void agir({ action: 'rouvrir', demandeId }, `rouvrir-${demandeId}`, 'Demande rouverte.')} />
                            </div>
                                </>
                                ),
                              },
                              {
                                cle: 'historique', titre: LIBELLE_FAMILLE.historique,
                                // LOT-4 — signal = « ≥ 1 entrée de fil » (historiqueNonVide, batché hors `dem`) ; historiqueNonVide inclut les reçus
                                //   → vraie dès qu'un artefact existe, aucun geste ci-dessous n'est jamais caché.
                                nonVide: d.historiqueNonVide,
                                contenu: () => (
                                <>
                            {/* LOT-4 — LE FIL des échanges mail (mêmes messages qu'en Analyse), par permis via SousSectionsPermis, comme Archives. */}
                            <SousSectionsPermis dossiers={d.dossiersEncart} rendre={(id) => <BlocFilEchanges key={id} dossierId={id} />} />
                            {/* Artefacts de réponses (liens/pièces/messages « autre »/alertes GED) : REPLIÉS par défaut (le fil ci-dessus est le contenu principal), 1 clic pour ouvrir, GESTES conservés derrière le pli. */}
                            {(d.messagesAutre.length > 0 || d.liens.length > 0 || d.piecesReponses.length > 0 || d.alertesGed.length > 0) && (
                            <SousBlocRepliable titre={`Liens, pièces et messages des réponses (${d.messagesAutre.length + new Set(d.liens.map((l) => l.url)).size + d.piecesReponses.reduce((n, g) => n + g.pieces.length, 0) + d.alertesGed.length})`}>
                            {/* FUS — cas ③ : messages « autre » (répondu / reclasser). MÊME route /reponses (via `agir`) que le détail « En cours ». */}
                            <BlocMessagesAutre messages={d.messagesAutre} retour={retour} compteReleve={data.reglages.adresseReleve}
                              onRepondu={(reponseId) => void agir({ action: 'repondu', reponseId }, `repondu-${reponseId}`, 'Message marqué « répondu ».')}
                              onAnnulerRepondu={(reponseId) => void agir({ action: 'annuler_repondu', reponseId }, `repondu-${reponseId}`, '« Répondu » annulé.')}
                              onReclasser={(reponseId, nature) => void agir({ action: 'reclasser', reponseId, nature }, `repondu-${reponseId}`, `Message reclassé « ${nature} ».`)} />
                            {/* L1 — liens captés (jamais suivis auto) ; G1 — « maintenant » signale un délai dépassé (fenêtre manquée). */}
                            <BlocLiens liens={d.liens} maintenant={new Date()} />
                            {/* T5 — pièces des réponses rattachées, consultables/téléchargeables (signeur unique url_piece, source 'reponse'). */}
                            <BlocPiecesReponses groupes={d.piecesReponses} onTelecharger={(pieceId) => void telecharger(d.demandeId, pieceId)} />
                            {/* G1 — alertes « à classer/télécharger en GED » déjà envoyées (retard rendu visible). */}
                            <BlocAlertesGed alertes={d.alertesGed} />
                            </SousBlocRepliable>
                            )}
                                </>
                                ),
                              },
                              // UNIF-2 — familles PER-PERMIS (si non vides), sous-sections par permis, contenu chargé AU DÉPLIAGE (paresse).
                              { cle: 'completude', titre: LIBELLE_FAMILLE.completude, nonVide: d.completudeNonVide,
                                contenu: () => <SousSectionsPermis dossiers={d.dossiersEncart} rendre={(id) => <BlocCompletude key={id} dossierId={id} sansPli />} /> },
                              { cle: 'caracteristiques', titre: LIBELLE_FAMILLE.caracteristiques, nonVide: d.caracteristiquesNonVide,
                                contenu: () => <SousSectionsPermis dossiers={d.dossiersEncart} rendre={(id) => <CaracteristiquesBloc key={id} dossierId={id} onOuvrir={(pid, source, page) => void ouvrirPiece(pid, source, page)} />} /> },
                              { cle: 'batiments', titre: LIBELLE_FAMILLE.batiments, nonVide: d.batimentsNonVide,
                                contenu: () => <SousSectionsPermis dossiers={d.dossiersEncart} rendre={(id) => <BlocTraceEmprise key={id} dossierId={id} />} /> },
                              { cle: 'pieces', titre: LIBELLE_FAMILLE.pieces, nonVide: d.piecesNonVide,
                                contenu: () => <SousSectionsPermis dossiers={d.dossiersEncart} rendre={(id) => <BlocPiecesPermis key={id} dossierId={id} onOuvrir={(pid, source, page) => void ouvrirPiece(pid, source, page)} />} /> },
                            ]} />
                          </td>
                        </tr>
                      ) : null,
                    ];
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={pDem} nbPages={nbPagesDem} total={demAffichees.length} onPage={setPageDem} />
              </>
            )}
            {/* T2 — le masquage n'est JAMAIS silencieux (réutilise MentionMasquage de Q6b : « N soldée(s) masquée(s) — les afficher »). */}
            {/* T6-A/2 — soldées / sans dossier actif = révélables (bouton) ; sans-retour = EXCLUES (motif `exclus`, sans bouton, « suivies dans En cours »). Toujours affiché, même en « afficher tout ». */}
            <MentionMasquage morts={mortsMasquage} onAfficherTout={() => setAfficherSoldees(true)}
              exclus={[
                ...(sansRetourPur > 0 ? [{ n: sansRetourPur, libelle: 'sans retour de la mairie — suivies dans l’onglet En cours' }] : []),
                ...(nbSuspendues > 0 ? [{ n: nbSuspendues, libelle: 'en « dossier partiel » — suivies dans l’onglet En cours' }] : []), // PART-A
              ]} />
          </>
        )}
      </section>

      {/* ── Bloc 3 : file « à rattacher » (rattacher / traiter / télécharger) ── */}
      <section className="flex flex-col gap-2">
        <h2 style={styleH2}>À rattacher</h2>
        <BlocARattacher
          reponses={ratVisibles} demandes={optionsDemandes} selection={selDemande} retour={retour}
          onChoisir={(reponseId, demandeId) => setSelDemande((s) => ({ ...s, [reponseId]: demandeId }))}
          onRattacher={(reponseId) => { const demandeId = selDemande[reponseId]; if (!demandeId) { setRetour({ cle: `rattacher-${reponseId}`, texte: 'Choisir une demande d’abord.', ok: false }); return; } void agir({ action: 'rattacher', reponseId, demandeId }, `rattacher-${reponseId}`, 'Rattachée.'); }}
          onTraiter={(reponseId) => void agir({ action: 'traiter', reponseId }, `traiter-${reponseId}`, 'Marquée traitée.')}
          onTelecharger={(reponseId, pieceId) => void telecharger(reponseId, pieceId)}
        />
        <Pagination page={pRat} nbPages={nbPagesRat} total={data.aRattacher.length} onPage={setPageRat} />
      </section>

      {/* ── Bloc T4 : dépôts à confirmer — nature TÉLÉSERVICE (formulaire) → visible au process Téléservice seul (D2). ── */}
      {process === 'formulaire' && (
      <section className="flex flex-col gap-2">
        <h2 style={styleH2}>Dépôts à confirmer</h2>
        <BlocPropositions
          propositions={propVisibles} aujourdhui={aujourdhui} retour={retour}
          dateOuverteId={propDate?.reponseId ?? null} dateValeur={propDate?.date ?? ''}
          onOuvrir={(reponseId) => setPropDate({ reponseId, date: '' })}
          onDateChange={(v) => setPropDate((s) => (s ? { ...s, date: v } : s))}
          onConfirmer={(reponseId, demandeId, date) => { setPropDate(null); void confirmerDepotUI(reponseId, demandeId, date); }}
          onFermer={() => setPropDate(null)}
          onIgnorer={(reponseId) => { setPropDate(null); void agir({ action: 'ignorer_proposition', reponseId }, `proposition-${reponseId}`, 'Proposition ignorée.'); }}
        />
        <Pagination page={pProp} nbPages={nbPagesProp} total={data.propositions.length} onPage={setPageProp} />
      </section>
      )}

      {/* ── Bloc 4 : relances préparées — nature E-MAIL AUTO → visible au process E-mail seul (D2). ── */}
      {process === 'email' && (
      <section className="flex flex-col gap-2">
        <h2 style={styleH2}>Relances préparées</h2>
        {data.relances.length === 0 ? (
          <PhraseVide>Aucune relance préparée.</PhraseVide>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              {relVisibles.map((r) => (
                <div key={r.id} className="flex flex-col gap-1">
                  <RelanceCarte relance={r} ouvert={relOuvertes.has(r.id)} envoi={data.envoi}
                    objet={brouillons[r.id]?.objet} corps={brouillons[r.id]?.corps} retour={retour}
                    onChangeObjet={(id, v) => setBrouillons((s) => ({ ...s, [id]: { objet: v, corps: s[id]?.corps ?? r.corps } }))}
                    onChangeCorps={(id, v) => setBrouillons((s) => ({ ...s, [id]: { objet: s[id]?.objet ?? r.objet, corps: v } }))}
                    onEnregistrer={(id) => void agir({ action: 'editer_relance', relanceId: id, objet: brouillons[id]?.objet ?? r.objet, corps: brouillons[id]?.corps ?? r.corps }, `relance-${id}`, 'Relance enregistrée.')}
                    onRegenerer={(id) => void agir({ action: 'regenerer_relance', relanceId: id }, `relance-${id}`, 'Relance régénérée.')}
                    onAbandonner={(id) => void agir({ action: 'abandonner_relance', relanceId: id }, `relance-${id}`, 'Relance abandonnée.')} />
                  <button type="button" className="svv-link" style={{ width: 'auto', padding: '.15rem .4rem', alignSelf: 'flex-start' }}
                    aria-expanded={relOuvertes.has(r.id)} onClick={() => setRelOuvertes((s) => toggle(s, r.id))}>
                    {relOuvertes.has(r.id) ? 'masquer' : 'éditer / voir le corps'}
                  </button>
                </div>
              ))}
            </div>
            <Pagination page={pRel} nbPages={nbPagesRel} total={data.relances.length} onPage={setPageRel} />
          </>
        )}
      </section>
      )}
    </div>
  );
}
