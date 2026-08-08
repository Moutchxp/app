'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { echeanceDe, etatEcheance, type EtatEcheance } from '../../../../lib/veille/echeance';
import type { ReponsesData } from '../../../../lib/veille/reponsesSuivi';
import {
  IndicateurReleve, RappelReglages, TableRuns, BadgeEtat, CompteSatisfaction, DetailDossiers,
  BlocARattacher, RelanceCarte, PhraseVide, formaterDate, type RetourCible, type OptionDemande,
} from './ReponsesRendu';
import { MessageRetour } from './DemandesRendu';

/**
 * R5a/R5b — écran « Réponses » : suivi de la boucle CRPA + ACTIONS (rattacher, marquer/annuler un dossier reçu, télécharger
 * une pièce, marquer traitée). ⚠️ demande.statut n'est jamais écrit ici. L'état d'échéance est calculé via `etatEcheance`
 * (réutilisé) sur un instant figé au chargement. Le message de retour s'affiche À CÔTÉ du bouton cliqué (repli au bandeau
 * si l'emplacement n'est plus rendu) ; une action réussie recharge les données SANS effacer le message qu'on vient de poser.
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

export function ReponsesVue() {
  const [data, setData] = useState<ReponsesData | null>(null);
  const [maintenant, setMaintenant] = useState<Date>(() => new Date());
  const [erreur, setErreur] = useState(false);
  const [retour, setRetour] = useState<RetourCible>(null);
  const [selDemande, setSelDemande] = useState<Record<number, number>>({});
  const [dossOuverts, setDossOuverts] = useState<Set<number>>(new Set());
  const [relOuvertes, setRelOuvertes] = useState<Set<number>>(new Set());
  const [pageDem, setPageDem] = useState(1);
  const [pageRat, setPageRat] = useState(1);
  const [pageRel, setPageRel] = useState(1);
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

  // Options du sélecteur de rattachement : les demandes envoyées (référence + commune + date d'envoi, jamais un id brut).
  const optionsDemandes: OptionDemande[] = useMemo(
    () => (data?.demandes ?? []).map((d) => ({ demandeId: d.demandeId, reference: d.reference, communeNom: d.communeNom, envoyeLe: d.envoyeLe })),
    [data],
  );

  // ── Actions (POST) ─ toutes journalisées côté serveur ; le retour s'affiche à la CLÉ de l'emplacement cliqué. ──
  const agir = useCallback(async (corps: Record<string, unknown>, cle: string, texteOk: string): Promise<void> => {
    const res = await fetch('/api/admin/permis/reponses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
    if (res.ok) { setRetour({ cle, texte: texteOk, ok: true }); rafraichir(); } // recharge sans effacer le retour
    else setRetour({ cle, texte: await erreurServeur(res, 'Action impossible.'), ok: false });
  }, [rafraichir]);

  const telecharger = useCallback(async (reponseId: number, pieceId: number): Promise<void> => {
    const res = await fetch('/api/admin/permis/reponses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'url_piece', pieceId }) });
    if (res.ok) { const { url } = (await res.json()) as { url: string }; window.open(url, '_blank', 'noopener,noreferrer'); }
    else setRetour({ cle: `piece-${reponseId}`, texte: await erreurServeur(res, 'Lien indisponible.'), ok: false });
  }, []);

  if (erreur) return <p role="alert" style={{ color: 'var(--color-svv-red)' }}>Suivi indisponible.</p>;
  if (!data) return <p style={{ color: 'var(--color-svv-muted)' }} aria-live="polite">Chargement du suivi…</p>;

  const toggle = (set: Set<number>, id: number): Set<number> => { const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); return n; };

  const nbPagesDem = Math.max(1, Math.ceil(demandes.length / PAGE));
  const pDem = Math.min(pageDem, nbPagesDem);
  const demVisibles = demandes.slice((pDem - 1) * PAGE, pDem * PAGE);

  const nbPagesRat = Math.max(1, Math.ceil(data.aRattacher.length / PAGE));
  const pRat = Math.min(pageRat, nbPagesRat);
  const ratVisibles = data.aRattacher.slice((pRat - 1) * PAGE, pRat * PAGE);

  const nbPagesRel = Math.max(1, Math.ceil(data.relances.length / PAGE));
  const pRel = Math.min(pageRel, nbPagesRel);
  const relVisibles = data.relances.slice((pRel - 1) * PAGE, pRel * PAGE);

  // L'emplacement du retour est-il RENDU ? Sinon on le replie proprement dans le bandeau (jamais dédoublé).
  const estRendu = (cle: string): boolean => {
    if (cle.startsWith('dossier-')) { const d = Number(cle.split('-')[1]); return dossOuverts.has(d) && demVisibles.some((x) => x.demandeId === d); }
    if (cle.startsWith('rattacher-') || cle.startsWith('traiter-') || cle.startsWith('piece-')) { const id = Number(cle.split('-')[1]); return ratVisibles.some((x) => x.id === id); }
    return false;
  };
  const retourBanniere = retour && !estRendu(retour.cle) ? { texte: retour.texte, ok: retour.ok, zone: 'haut' as const } : null;

  return (
    <div className="flex flex-col gap-4">
      {retourBanniere && <div><MessageRetour r={retourBanniere} /></div>}

      {/* ── Bloc 1 : état de la relève ── */}
      <section className="svv-card flex flex-col gap-2">
        <h2 style={styleH2}>État de la relève</h2>
        <IndicateurReleve active={data.reglages.active} derniereOkLe={data.derniereOkLe} fraicheurHeures={data.reglages.fraicheurHeures} maintenant={maintenant} />
        <RappelReglages reglages={data.reglages} />
        <div>
          <h3 style={{ fontSize: 13, fontWeight: 700, margin: '.4rem 0 .2rem' }}>10 dernières relèves</h3>
          <TableRuns runs={data.runs} />
        </div>
      </section>

      {/* ── Bloc 2 : suivi des demandes envoyées ── */}
      <section className="flex flex-col gap-2">
        <h2 style={styleH2}>Suivi des demandes envoyées</h2>
        {demandes.length === 0 ? (
          <PhraseVide>Aucune demande envoyée pour l’instant.</PhraseVide>
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
                        <td style={styleTd}>{d.echeanceLe ? formaterDate(d.echeanceLe.toISOString()) : '—'}</td>
                        <td style={styleTd}><BadgeEtat etat={d.etat} motif={d.motif} /></td>
                        <td style={styleTd}><CompteSatisfaction satisfaits={d.dossiersSatisfaits} total={d.dossiersActifs} /></td>
                        <td style={{ ...styleTd, textAlign: 'right' }}>{d.nbReponses}</td>
                        <td style={styleTd}><button type="button" className="svv-link" style={{ width: 'auto', padding: '.15rem .4rem' }} aria-expanded={ouvert} onClick={() => setDossOuverts((s) => toggle(s, d.demandeId))}>{ouvert ? 'masquer' : 'détail'}</button></td>
                      </tr>,
                      ouvert ? (
                        <tr key={`${d.demandeId}-detail`} style={{ borderBottom: '1px solid var(--color-svv-line)' }}>
                          <td colSpan={8} style={{ padding: '0 .5rem .5rem' }}>
                            <DetailDossiers demandeId={d.demandeId} statut={d.statut} dossiers={d.dossiers} retour={retour}
                              onMarquer={(demandeId, dossierId, satisfait) => void agir({ action: 'marquer_dossier', demandeId, dossierId, satisfait }, `dossier-${demandeId}-${dossierId}`, satisfait ? 'Marqué reçu.' : 'Satisfaction annulée.')} />
                          </td>
                        </tr>
                      ) : null,
                    ];
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={pDem} nbPages={nbPagesDem} total={demandes.length} onPage={setPageDem} />
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

      {/* ── Bloc 4 : relances préparées (lecture seule — édition/abandon = chantier suivant) ── */}
      <section className="flex flex-col gap-2">
        <h2 style={styleH2}>Relances préparées</h2>
        {data.relances.length === 0 ? (
          <PhraseVide>Aucune relance préparée.</PhraseVide>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              {relVisibles.map((r) => (
                <div key={r.id} className="flex flex-col gap-1">
                  <RelanceCarte relance={r} ouvert={relOuvertes.has(r.id)} />
                  <button type="button" className="svv-link" style={{ width: 'auto', padding: '.15rem .4rem', alignSelf: 'flex-start' }}
                    aria-expanded={relOuvertes.has(r.id)} onClick={() => setRelOuvertes((s) => toggle(s, r.id))}>
                    {relOuvertes.has(r.id) ? 'masquer le corps' : 'voir le corps'}
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
