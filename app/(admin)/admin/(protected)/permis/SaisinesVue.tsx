'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { SaisinesData } from '../../../../lib/veille/saisinesSuivi';
import {
  SectionSaisissables, SectionIndeterminees, SectionEnCours, SectionRecues, SectionAbandonnees, SectionFileDepot,
} from './SaisinesRendu';
import type { RetourCible } from './ReponsesRendu';
import { MessageRetour } from './DemandesRendu';
import { CarteCadaFormulaire } from './CarteCadaFormulaire';

/**
 * X4 — écran « Saisines CADA » : suivi + ACTIONS (lancer une saisine, marquer déposée, abandonner, enregistrer l'avis). Le
 * rendu est PUR (SaisinesRendu) ; ici on ne gère que l'état, le fetch et les POST. Rechargement = incrément de `version`
 * (dép. de l'effet) SANS toucher au retour : une action réussie recharge les données mais garde le message qu'on vient de
 * poser (motif async-IIFE, aucun setState synchrone dans l'effet). Le message s'affiche À CÔTÉ du bouton cliqué et se replie
 * dans le bandeau du haut si l'emplacement n'est plus rendu (l'item a changé de section). Aucun polling.
 */
const PAGE = 20;

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

/** Liste paginée à état INTERNE, pour les sections en LECTURE SEULE (aucune ancre de retour à suivre). */
function ListePaginee<T>({ items, children }: { items: T[]; children: (visibles: T[]) => ReactNode }) {
  const [p, setP] = useState(1);
  const nb = Math.max(1, Math.ceil(items.length / PAGE));
  const pc = Math.min(p, nb);
  return <>{children(items.slice((pc - 1) * PAGE, pc * PAGE))}<Pagination page={pc} nbPages={nb} total={items.length} onPage={setP} /></>;
}

export function SaisinesVue() {
  const [data, setData] = useState<SaisinesData | null>(null);
  const [erreur, setErreur] = useState(false);
  const [retour, setRetour] = useState<RetourCible>(null);
  const [sensAvis, setSensAvis] = useState<Record<number, string>>({});
  // Pagination gérée ICI pour les 3 listes PORTEUSES d'actions (nécessaire au repli du retour dans le bandeau).
  const [pageSais, setPageSais] = useState(1);
  const [pageCours, setPageCours] = useState(1);
  const [pageFile, setPageFile] = useState(1);
  const [version, setVersion] = useState(0);

  const rafraichir = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/permis/saisines', { cache: 'no-store' });
        if (!annule) { if (res.ok) setData((await res.json()) as SaisinesData); else setErreur(true); }
      } catch { if (!annule) setErreur(true); }
    })();
    return () => { annule = true; };
  }, [version]);

  // Action générique : le retour s'affiche à la CLÉ de l'emplacement cliqué ; recharge sans effacer le retour. Quand la
  // réponse porte `ok:false` (ex. abandon idempotent sans effet), on le signale sans prétendre à un succès.
  const agir = useCallback(async (corps: Record<string, unknown>, cle: string, texteOk: string, texteRien = 'Aucun changement.'): Promise<void> => {
    const res = await fetch('/api/admin/permis/saisines', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
    if (res.ok) {
      const b = (await res.json().catch(() => ({ ok: true }))) as { ok?: boolean };
      setRetour({ cle, texte: b.ok === false ? texteRien : texteOk, ok: b.ok !== false });
      rafraichir();
    } else setRetour({ cle, texte: await erreurServeur(res, 'Action impossible.'), ok: false });
  }, [rafraichir]);

  // « Lancer » : succès = envoyée (e-mail) ou préparée (file) ; brouillon créé mais envoi non abouti = motif honnête (on
  // recharge quand même : la saisine est passée en brouillon / file). Refus de création (état, doublon) = 409 → message serveur.
  const lancer = useCallback(async (demandeId: number): Promise<void> => {
    const cle = `lancer-${demandeId}`;
    const res = await fetch('/api/admin/permis/saisines', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'lancer', demandeId }) });
    if (res.ok) {
      const b = (await res.json()) as { ok: boolean; canal?: string; motif?: string };
      if (b.ok) setRetour({ cle, texte: b.canal === 'formulaire' ? 'Saisine préparée : à déposer sur le formulaire (voir la file de dépôt).' : 'Saisine envoyée à la CADA.', ok: true });
      else setRetour({ cle, texte: b.motif ?? 'Envoi impossible.', ok: false });
      rafraichir();
    } else setRetour({ cle, texte: await erreurServeur(res, 'Lancement impossible.'), ok: false });
  }, [rafraichir]);

  if (erreur) return <p role="alert" style={{ color: 'var(--color-svv-red)' }}>Suivi des saisines indisponible.</p>;
  if (!data) return <p style={{ color: 'var(--color-svv-muted)' }} aria-live="polite">Chargement des saisines…</p>;

  const slice = <T,>(items: T[], page: number): { vis: T[]; pc: number; nb: number } => {
    const nb = Math.max(1, Math.ceil(items.length / PAGE));
    const pc = Math.min(page, nb);
    return { vis: items.slice((pc - 1) * PAGE, pc * PAGE), pc, nb };
  };
  const sais = slice(data.saisissables, pageSais);
  const cours = slice(data.enCours, pageCours);
  const file = slice(data.fileADeposer, pageFile);

  // L'emplacement du retour est-il RENDU ? Sinon repli propre dans le bandeau (jamais dédoublé) : après une action, l'item
  // change souvent de section → son ancre disparaît → le message remonte en haut.
  const estRendu = (cle: string): boolean => {
    if (cle.startsWith('lancer-')) { const id = Number(cle.slice('lancer-'.length)); return sais.vis.some((d) => d.demandeId === id); }
    if (cle.startsWith('avis-')) { const id = Number(cle.slice('avis-'.length)); return cours.vis.some((s) => s.saisineId === id); }
    if (cle.startsWith('deposee-')) { const id = Number(cle.slice('deposee-'.length)); return file.vis.some((s) => s.saisineId === id); }
    if (cle.startsWith('abandon-')) { const id = Number(cle.slice('abandon-'.length)); return cours.vis.some((s) => s.saisineId === id) || file.vis.some((s) => s.saisineId === id); }
    return false;
  };
  const retourBanniere = retour && !estRendu(retour.cle) ? { texte: retour.texte, ok: retour.ok, zone: 'haut' as const } : null;

  return (
    <div className="flex flex-col gap-4">
      {retourBanniere && <div><MessageRetour r={retourBanniere} /></div>}

      <SectionSaisissables saisissables={sais.vis} cadaEmailVide={data.cadaEmailVide} retour={retour} onLancer={(id) => void lancer(id)} />
      <Pagination page={sais.pc} nbPages={sais.nb} total={data.saisissables.length} onPage={setPageSais} />

      <ListePaginee items={data.indeterminees}>{(vis) => <SectionIndeterminees indeterminees={vis} />}</ListePaginee>

      <SectionEnCours enCours={cours.vis} retour={retour}
        sensAvis={sensAvis} onSens={(id, v) => setSensAvis((s) => ({ ...s, [id]: v }))}
        onEnregistrerAvis={(id) => { const sens = sensAvis[id]; if (!sens) { setRetour({ cle: `avis-${id}`, texte: 'Choisir le sens de l’avis d’abord.', ok: false }); return; } void agir({ action: 'enregistrer_avis', saisineId: id, sens }, `avis-${id}`, 'Avis enregistré.'); }}
        onAbandonner={(id) => void agir({ action: 'abandonner', saisineId: id }, `abandon-${id}`, 'Saisine abandonnée.', 'Déjà abandonnée ou introuvable.')} />
      <Pagination page={cours.pc} nbPages={cours.nb} total={data.enCours.length} onPage={setPageCours} />

      <ListePaginee items={data.recues}>{(vis) => <SectionRecues recues={vis} />}</ListePaginee>

      <ListePaginee items={data.abandonnees}>{(vis) => <SectionAbandonnees abandonnees={vis} />}</ListePaginee>

      <SectionFileDepot items={file.vis} cadaEmailVide={data.cadaEmailVide} urlFormulaire={data.urlFormulaire} retour={retour}
        onMarquerDeposee={(id) => void agir({ action: 'marquer_deposee', saisineId: id }, `deposee-${id}`, 'Marquée déposée.')}
        onAbandonner={(id) => void agir({ action: 'abandonner', saisineId: id }, `abandon-${id}`, 'Saisine abandonnée.', 'Déjà abandonnée ou introuvable.')}
        renderExtra={(s) => <CarteCadaFormulaire saisineId={s.saisineId} />} />
      {(data.cadaEmailVide || data.fileADeposer.length > 0) && <Pagination page={file.pc} nbPages={file.nb} total={data.fileADeposer.length} onPage={setPageFile} />}
    </div>
  );
}
