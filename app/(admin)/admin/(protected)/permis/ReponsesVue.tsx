'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { recompterSiSucces } from './comptesActions';
import { echeanceDe, etatEcheance, type EtatEcheance } from '../../../../lib/veille/echeance';
import type { ReponsesData } from '../../../../lib/veille/reponsesSuivi';
import type { FenetreCumul } from '../../../../lib/veille/fenetresCumul';
import {
  BlocEtatReleve, EtatDemande, CompteSatisfaction, DetailDossiers, RappelObtenusArchives,
  partitionnerReponses, messageReponsesVide, aReponseSansDocuments, BadgeReponseSansDocuments,
  BlocARattacher, BlocPropositions, RelanceCarte, ActionsCloture, PhraseVide, BlocLiens, BlocAlertesGed, BlocMessagesAutre, BlocPiecesReponses, formaterDate, trierOptionsDemandes, type RetourCible, type OptionDemande,
} from './ReponsesRendu';
import { MessageRetour, MentionMasquage } from './DemandesRendu';
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

export function ReponsesVue({ onRecompter }: { onRecompter?: () => void } = {}) {
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
    return data.demandes.map((d) => {
      const envoye = d.envoyeLe ? new Date(d.envoyeLe) : null;
      const r = etatEcheance({ envoyeLe: envoye, statutAcheminement: d.statutAcheminement, dossiersActifs: d.dossiersActifs, dossiersSatisfaits: d.dossiersSatisfaits, derniereReleveOkLe: derniere }, maintenant, reg);
      return { ...d, etat: r.etat as EtatEcheance, motif: r.motif, echeanceLe: envoye ? echeanceDe(envoye) : null };
    }).sort((a, b) => {
      if (!a.echeanceLe && !b.echeanceLe) return 0;
      if (!a.echeanceLe) return 1;
      if (!b.echeanceLe) return -1;
      return a.echeanceLe.getTime() - b.echeanceLe.getTime();
    });
  }, [data, maintenant]);

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

  const telecharger = useCallback(async (reponseId: number, pieceId: number): Promise<void> => {
    const res = await fetch('/api/admin/permis/reponses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'url_piece', pieceId }) });
    if (res.ok) { const { url } = (await res.json()) as { url: string }; window.open(url, '_blank', 'noopener,noreferrer'); }
    else setRetour({ cle: `piece-${reponseId}`, texte: await erreurServeur(res, 'Lien indisponible.'), ok: false });
  }, []);

  if (erreur) return <p role="alert" style={{ color: 'var(--color-svv-red)' }}>Suivi indisponible.</p>;
  if (!data) return <p style={{ color: 'var(--color-svv-muted)' }} aria-live="polite">Chargement du suivi…</p>;

  const toggle = (set: Set<number>, id: number): Set<number> => { const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); return n; };

  // T6-A/2 — FILTRE LOCAL à Réponses (partitionnerReponses, PUR) : EXCLUT les demandes sans retour (foyer = « En cours »), de façon
  //   STRICTE (jamais révélées, même par « afficher tout »). Le toggle `afficherSoldees` ne lève QUE le masquage de confort (soldées /
  //   sans dossier actif, qui ONT un retour). Rien en silence : soldées/sans-dossier = révélables (mention + bouton) ; sans-retour =
  //   EXCLUES (mention `exclus`, sans bouton, « suivies dans En cours »). Jamais dans `chargerDemandesSuivi` → « En cours » les garde.
  const { affichees: demAffichees, soldees, sansDossier, sansRetour } = partitionnerReponses(demandes, afficherSoldees);
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

      {/* ── Bloc 2 : suivi des demandes envoyées ── */}
      <section className="flex flex-col gap-2">
        <h2 style={styleH2}>Suivi des demandes envoyées</h2>
        {demandes.length === 0 ? (
          <PhraseVide>Aucune demande envoyée pour l’instant.</PhraseVide>
        ) : (
          <>
            {demAffichees.length === 0 ? (
              <PhraseVide>{messageReponsesVide({ soldees, sansDossier, sansRetour })}</PhraseVide>
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
                            {/* T2 — les dossiers obtenus sont partis en Archives : on le DIT, on ne les fait pas disparaître en silence. */}
                            <RappelObtenusArchives n={d.dossiersSatisfaits} />
                            {(d.dossiers.length > 0 || d.dossiersSatisfaits === 0 || d.dossiersRetires.length > 0) && (
                            <DetailDossiers demandeId={d.demandeId} statut={d.statut} dossiers={d.dossiers} retour={retour}
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
                            )}
                            {/* FUS — cas ③ : les messages « autre » appelant une réponse (marquer répondu / reclasser) suivent la
                                demande dans son foyer « Réponses ». MÊME route /reponses (via `agir`), auteur journalisé — un seul
                                chemin d'écriture, identique à celui du détail « En cours ». */}
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
                            <div style={{ marginTop: '.5rem' }}>
                              <ActionsCloture demandeId={d.demandeId} statut={d.statut} dossiersDus={d.dossiersActifs - d.dossiersSatisfaits}
                                motif={motifCloture[d.demandeId]} retour={retour}
                                onMotif={(demandeId, v) => setMotifCloture((s) => ({ ...s, [demandeId]: v }))}
                                onCloturer={(demandeId) => void agir({ action: 'cloturer', demandeId, motif: motifCloture[demandeId] ?? '' }, `cloturer-${demandeId}`, 'Demande clôturée.')}
                                onRouvrir={(demandeId) => void agir({ action: 'rouvrir', demandeId }, `rouvrir-${demandeId}`, 'Demande rouverte.')} />
                            </div>
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
              exclus={sansRetour > 0 ? [{ n: sansRetour, libelle: 'sans retour de la mairie — suivies dans l’onglet En cours' }] : []} />
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

      {/* ── Bloc T4 : dépôts à confirmer (« cette demande a-t-elle été déposée ? ») — file DISTINCTE de « À rattacher » ── */}
      <section className="flex flex-col gap-2">
        <h2 style={styleH2}>Dépôts à confirmer</h2>
        <BlocPropositions
          propositions={propVisibles} aujourdhui={aujourdhui} retour={retour}
          dateOuverteId={propDate?.reponseId ?? null} dateValeur={propDate?.date ?? ''}
          onOuvrir={(reponseId) => setPropDate({ reponseId, date: '' })}
          onDateChange={(v) => setPropDate((s) => (s ? { ...s, date: v } : s))}
          onConfirmer={(reponseId, demandeId, date) => { setPropDate(null); void agir({ action: 'confirmer_depot', reponseId, demandeId, envoyeLe: date }, `proposition-${reponseId}`, 'Dépôt confirmé — demande passée « envoyée », message rattaché.'); }}
          onFermer={() => setPropDate(null)}
          onIgnorer={(reponseId) => { setPropDate(null); void agir({ action: 'ignorer_proposition', reponseId }, `proposition-${reponseId}`, 'Proposition ignorée.'); }}
        />
        <Pagination page={pProp} nbPages={nbPagesProp} total={data.propositions.length} onPage={setPageProp} />
      </section>

      {/* ── Bloc 4 : relances préparées (R5c : objet/corps éditables + régénérer / abandonner) ── */}
      <section className="flex flex-col gap-2">
        <h2 style={styleH2}>Relances préparées</h2>
        {data.relances.length === 0 ? (
          <PhraseVide>Aucune relance préparée.</PhraseVide>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              {relVisibles.map((r) => (
                <div key={r.id} className="flex flex-col gap-1">
                  <RelanceCarte relance={r} ouvert={relOuvertes.has(r.id)}
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
    </div>
  );
}
