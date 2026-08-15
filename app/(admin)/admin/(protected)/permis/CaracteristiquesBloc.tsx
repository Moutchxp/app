'use client';

import { useCallback, useEffect, useState } from 'react';
// ⚠️ Bundle client (piège du 13/08) : de `caracteristiquesRepo` / `journalLecture` (modules serveur, pg) on n'importe QUE des `type`, jamais une valeur.
import type { CorpsBatiment, GlobalPermis, OrigineValeur, ValeursCorps } from '../../../../lib/permis/caracteristiquesRepo';
import type { JournalPermis } from '../../../../lib/permis/journalLecture';
import type { BornesParColonne } from '../../../../lib/sitadel/reglagesVeille';
import {
  MESURES, CHAMPS_PERMIS, construireCorps, construirePermis, valeurVersInput, permisVersInput,
  type EditionCorps, type EditionGlobal, type EditionPermis, type ErreursCorps, type ErreursPermis, type FaitsPermis,
} from './caracteristiquesForm';
import { FaitsPermisBloc, ChampMesureEditeur, ChampDeclareEditeur, EditeurRepere, PastilleOrigineValeur, MESSAGE_AUCUN_CORPS, type LienPiece } from './CaracteristiquesRendu';

// N10 — piecesParNom : nom de fichier → id `dossier_document` (unique par dossier → résolution SÛRE). Sert à rendre une provenance cliquable.
interface EtatCharge { faits: FaitsPermis; global: GlobalPermis | null; corps: CorpsBatiment[]; bornes: BornesParColonne; journal: JournalPermis; naturesPossibles: string[]; piecesParNom?: Record<string, number> }

const editionDepuisCorps = (c: CorpsBatiment): EditionCorps => ({
  repere: c.repere ?? '', adresse: c.adresse ?? '',
  nbEtages: valeurVersInput(c.nbEtages), nbNiveauxSousSol: valeurVersInput(c.nbNiveauxSousSol),
  altitudeDernierPlancherNgf: valeurVersInput(c.altitudeDernierPlancherNgf), altitudeSommetNgf: valeurVersInput(c.altitudeSommetNgf),
  hauteurRelativeM: valeurVersInput(c.hauteurRelativeM), altitudeTerrainNaturelNgf: valeurVersInput(c.altitudeTerrainNaturelNgf),
});
const editionDepuisPermis = (g: GlobalPermis | null): EditionPermis => ({
  natureProjet: g?.natureProjet ?? '', surfacePlancherM2: permisVersInput(g?.surfacePlancherM2), nbLogements: permisVersInput(g?.nbLogements),
  nbPlacesStationnement: permisVersInput(g?.nbPlacesStationnement), adresseTerrain: g?.adresseTerrain ?? '',
  altitudeSommetNgf: permisVersInput(g?.altitudeSommetNgf), // N8-C — sommet du permis (108), éditable comme les autres déclarés
});
const origineDe = (o: unknown, cle: string): OrigineValeur | null => (o as Record<string, OrigineValeur | null>)?.[`${cle}Origine`] ?? null;
/** N7-F — divergence entre le booléen parking (VESTIGIAL, 103) et le nombre de places (106). null si concordant/vide. */
const divergenceParking = (g: GlobalPermis | null): string | null => {
  const pk = g?.parking, nb = g?.nbPlacesStationnement;
  if (pk === false && typeof nb === 'number' && nb > 0) return `parking déclaré « non » mais ${nb} place(s) de stationnement déclarée(s)`;
  if (pk === true && nb === 0) return 'parking déclaré « oui » mais 0 place de stationnement déclarée';
  return null;
};

const styleLabel = { fontSize: 12, fontWeight: 700, color: 'var(--color-svv-ink)' } as const;
const styleAide = { fontSize: 11, color: 'var(--color-svv-muted)', lineHeight: 1.4 } as const;
const styleTitre = { fontSize: 13, fontWeight: 700, margin: 0, color: 'var(--color-svv-ink)' } as const;
const styleInput = { width: '100%', boxSizing: 'border-box' as const, padding: '.35rem .5rem', border: '1px solid var(--color-svv-line)', borderRadius: '.45rem', fontSize: 14, fontFamily: 'inherit' };

/**
 * N3-C/N7-E — bloc « Caractéristiques » du panneau permis. DEUX niveaux SÉPARÉS : (1) LE PERMIS (déclaré : nature, surface,
 * logements, stationnement, adresse, parking, commentaire — vaut pour tout le permis, ne se répète pas) ; (2) LES CORPS DE
 * BÂTIMENT (mesurés : repère, altitudes, étages, adresse par corps). Toute écriture est en 'saisie'. Confiance/réserve/motif
 * lus du journal (parCorps + permis). Bornes et liste de nature LUES de la base.
 */
export function CaracteristiquesBloc({ dossierId, onTelecharger }: { dossierId: number; onTelecharger?: (id: number, source: 'reponse' | 'dossier') => void }) {
  const [etat, setEtat] = useState<'chargement' | 'erreur' | 'ok'>('chargement');
  const [data, setData] = useState<EtatCharge | null>(null);
  const [edGlobal, setEdGlobal] = useState<EditionGlobal>({ parking: '', commentaire: '' });
  const [edPermis, setEdPermis] = useState<EditionPermis>({ natureProjet: '', surfacePlancherM2: '', nbLogements: '', nbPlacesStationnement: '', adresseTerrain: '', altitudeSommetNgf: '' });
  const [erreursPermis, setErreursPermis] = useState<ErreursPermis>({});
  const [edCorps, setEdCorps] = useState<Record<number, EditionCorps>>({});
  const [erreursCorps, setErreursCorps] = useState<Record<number, ErreursCorps>>({});
  const [message, setMessage] = useState<string>('');
  const [enCours, setEnCours] = useState(false);

  const appliquer = useCallback((d: EtatCharge) => {
    setData(d);
    setEdGlobal({ parking: '', commentaire: d.global?.commentaire ?? '' }); // parking VESTIGIAL : non édité (N7-F)
    setEdPermis(editionDepuisPermis(d.global));
    setEdCorps(Object.fromEntries(d.corps.map((c) => [c.id, editionDepuisCorps(c)])));
    setErreursCorps({}); setErreursPermis({});
    setEtat('ok');
  }, []);

  const rafraichir = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/permis/caracteristiques?dossierId=${dossierId}`, { cache: 'no-store' });
      if (!res.ok) { setEtat('erreur'); return; }
      appliquer((await res.json()) as EtatCharge);
    } catch { setEtat('erreur'); }
  }, [dossierId, appliquer]);

  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        const res = await fetch(`/api/admin/permis/caracteristiques?dossierId=${dossierId}`, { cache: 'no-store' });
        if (annule) return;
        if (!res.ok) { setEtat('erreur'); return; }
        appliquer((await res.json()) as EtatCharge);
      } catch { if (!annule) setEtat('erreur'); }
    })();
    return () => { annule = true; };
  }, [dossierId, appliquer]);

  const poster = useCallback(async (corps: Record<string, unknown>): Promise<{ ok: boolean; erreur?: string }> => {
    setMessage('');
    try {
      const res = await fetch('/api/admin/permis/caracteristiques', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
      const rep = (await res.json().catch(() => ({}))) as { ok?: boolean; erreur?: string };
      if (!res.ok || rep.erreur) return { ok: false, erreur: rep.erreur ?? 'écriture refusée' };
      return { ok: true };
    } catch { return { ok: false, erreur: 'le serveur n’a pas répondu' }; }
  }, []);

  // Enregistre LE PERMIS : les 5 champs déclarés (action 'declare') + parking/commentaire (action 'global').
  const enregistrerPermis = useCallback(async () => {
    const { erreurs, valide } = construirePermis(edPermis, data?.naturesPossibles ?? [], data?.bornes ?? {});
    setErreursPermis(erreurs);
    if (!valide) { setMessage('Corrigez les champs signalés avant d’enregistrer.'); return; }
    setEnCours(true);
    const r1 = await poster({ action: 'declare', dossierId, edition: edPermis });
    // parking VESTIGIAL : on ne l'envoie plus (une saisie manuelle ne s'efface jamais). Seul le commentaire passe par 'global'.
    const r2 = r1.ok ? await poster({ action: 'global', dossierId, commentaire: edGlobal.commentaire }) : r1;
    if (r2.ok) { await rafraichir(); setMessage('Permis enregistré.'); } else setMessage(r2.erreur ?? 'échec');
    setEnCours(false);
  }, [poster, dossierId, edPermis, edGlobal, data, rafraichir]);

  const enregistrerCorps = useCallback(async (corpsId: number) => {
    const ed = edCorps[corpsId];
    if (!ed) return;
    const { valeurs, erreurs, valide } = construireCorps(ed, data?.bornes ?? {});
    setErreursCorps((m) => ({ ...m, [corpsId]: erreurs }));
    if (!valide) { setMessage('Corrigez les champs signalés avant d’enregistrer.'); return; }
    setEnCours(true);
    const r = await poster({ action: 'corps', corpsId, repere: ed.repere, adresse: ed.adresse, valeurs: valeurs as ValeursCorps });
    if (r.ok) { await rafraichir(); setMessage('Corps enregistré.'); } else setMessage(r.erreur ?? 'échec');
    setEnCours(false);
  }, [edCorps, data, poster, rafraichir]);

  const ajouterCorps = useCallback(async () => {
    setEnCours(true);
    const r = await poster({ action: 'creer', dossierId, repere: '' });
    if (r.ok) { await rafraichir(); setMessage('Corps ajouté.'); } else setMessage(r.erreur ?? 'échec');
    setEnCours(false);
  }, [poster, dossierId, rafraichir]);

  const supprimer = useCallback(async (corpsId: number, repere: string | null) => {
    if (!window.confirm(`Supprimer le bâtiment « ${repere ?? 'sans nom'} » et toutes ses valeurs ? Cette action est définitive.`)) return;
    setEnCours(true);
    const r = await poster({ action: 'supprimer', corpsId });
    if (r.ok) { await rafraichir(); setMessage('Corps supprimé.'); } else setMessage(r.erreur ?? 'échec');
    setEnCours(false);
  }, [poster, rafraichir]);

  if (etat === 'chargement') return <p style={styleAide} aria-live="polite">Chargement des caractéristiques…</p>;
  if (etat === 'erreur' || !data) return <p role="alert" style={{ fontSize: 12, color: 'var(--color-svv-red)', fontWeight: 600 }}>Caractéristiques indisponibles.</p>;

  const majChamp = (corpsId: number, cle: keyof EditionCorps, v: string) => setEdCorps((m) => ({ ...m, [corpsId]: { ...m[corpsId], [cle]: v } }));

  // N10-A — résout un nom de fichier de provenance en un déclencheur de téléchargement (source 'dossier'), ou undefined si non résolu
  // (nom absent de la GED → l'entrée reste en texte simple, jamais un lien mort). Le signeur reste le serveur (onTelecharger).
  const lienPiece: LienPiece = (nom) => { const id = data.piecesParNom?.[nom]; return id != null && onTelecharger ? () => onTelecharger(id, 'dossier') : undefined; };

  return (
    <div className="flex flex-col gap-3" style={{ marginTop: '.6rem' }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--color-svv-ink)' }}>Caractéristiques</h3>
      <FaitsPermisBloc faits={data.faits} />

      {/* ═══ SECTION 1 — LE PERMIS (déclaré) : vaut pour tout le permis, ne se répète pas ═══ */}
      <div className="svv-card flex flex-col gap-2" style={{ minWidth: 0 }}>
        <h4 style={styleTitre}>Le permis <span style={{ ...styleAide, fontWeight: 400 }}>— déclaré (Cerfa), vaut pour l’ensemble du projet</span></h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '.6rem' }}>
          {CHAMPS_PERMIS.map((champ) => {
            const estStationnement = champ.cle === 'nbPlacesStationnement';
            const vide = edPermis[champ.cle].trim() === '';
            // N7-F — le motif du parking VESTIGIAL vit sous « Places de stationnement » quand ce champ est vide.
            const journal = estStationnement && vide ? (data.journal.permis['parking'] ?? data.journal.permis[champ.colonne]) : data.journal.permis[champ.colonne];
            const divergence = estStationnement ? divergenceParking(data.global) : null;
            return (
              <ChampDeclareEditeur key={champ.cle} champ={champ} bornes={data.bornes[champ.colonne]} valeur={edPermis[champ.cle]} origine={origineDe(data.global, champ.cle)}
                erreur={erreursPermis[champ.cle]} journal={journal} lienPiece={lienPiece} naturesPossibles={data.naturesPossibles} divergence={divergence}
                onValeur={(v) => setEdPermis((p) => ({ ...p, [champ.cle]: v }))} />
            );
          })}
          <label className="flex flex-col gap-1" style={{ minWidth: 0 }}>
            <span style={styleLabel}>Commentaire</span>
            <textarea value={edGlobal.commentaire} rows={2} onChange={(e) => setEdGlobal((g) => ({ ...g, commentaire: e.target.value }))} style={styleInput} aria-label="Commentaire" />
          </label>
        </div>
        <div>
          <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.3rem .7rem' }} disabled={enCours} onClick={() => void enregistrerPermis()}>Enregistrer le permis</button>
        </div>
      </div>

      {/* ═══ SECTION 2 — LES CORPS DE BÂTIMENT (mesurés) : un par immeuble ═══ */}
      <h4 style={styleTitre}>Les bâtiments <span style={{ ...styleAide, fontWeight: 400 }}>— mesurés, un par immeuble (altitudes, étages)</span></h4>
      {data.corps.length === 0 && <p style={styleAide}>{MESSAGE_AUCUN_CORPS}</p>}
      {data.corps.map((c) => {
        const ed = edCorps[c.id];
        const err = erreursCorps[c.id] ?? {};
        const journalCorps = data.journal.parCorps[c.id] ?? {};
        if (!ed) return null;
        return (
          <div key={c.id} className="svv-card flex flex-col gap-2" style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', gap: '.6rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <EditeurRepere valeur={ed.repere} journal={journalCorps['repere']} onValeur={(v) => majChamp(c.id, 'repere', v)} />
              <label className="flex flex-col gap-1" style={{ minWidth: 0, flex: '1 1 200px' }}>
                <span style={styleLabel}>Adresse de ce bâtiment</span>
                <input value={ed.adresse} placeholder="vide = non renseignée" onChange={(e) => majChamp(c.id, 'adresse', e.target.value)} style={styleInput} aria-label="Adresse du bâtiment" />
              </label>
              <button type="button" className="svv-link" style={{ width: 'auto', padding: '.2rem .5rem', color: 'var(--color-svv-red)' }} disabled={enCours} onClick={() => void supprimer(c.id, c.repere)}>supprimer ce bâtiment</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '.6rem' }}>
              {MESURES.map((m) => (
                <ChampMesureEditeur key={m.cle} mesure={m} bornes={data.bornes[m.colonne]} valeur={ed[m.cle]} origine={origineDe(c, m.cle)}
                  erreur={err[m.cle]} journal={journalCorps[m.colonne]} lienPiece={lienPiece} onValeur={(v) => majChamp(c.id, m.cle, v)} />
              ))}
            </div>
            <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <button type="button" className="svv-btn svv-btn-primary" style={{ padding: '.35rem .8rem' }} disabled={enCours} onClick={() => void enregistrerCorps(c.id)}>Enregistrer ce bâtiment</button>
              <span style={{ display: 'inline-flex', gap: '.3rem', alignItems: 'center' }}><span style={styleAide}>saisie ici :</span><PastilleOrigineValeur origine="saisie" /></span>
            </div>
          </div>
        );
      })}

      <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.3rem .7rem' }} disabled={enCours} onClick={() => void ajouterCorps()}>+ ajouter un bâtiment</button>
        {message && <span role="status" style={{ fontSize: 12 }}>{message}</span>}
      </div>
    </div>
  );
}
