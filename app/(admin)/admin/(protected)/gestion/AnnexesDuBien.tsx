'use client';

import { useCallback, useEffect, useState } from 'react';
import { ModaleIssue } from '../location/ModaleIssue';
import {
  detailsAnnexe, motCompteur, questionDetacher, typeDuLot, type AnnexeAffichee, type CandidatRattachement,
} from '../../../../lib/gestion/annexesBien';

/**
 * ══ 🔴🔴 LES ANNEXES EN CASES SOUS LE BIEN PRINCIPAL, DÉTACHABLES (Arno, 21/10/2026) ═════════════════════════════════════════════
 *
 *   · UNE CASE PLEINE LARGEUR PAR ANNEXE, sous les informations du bien, au-dessus de « Historique » : le type en GRAS, puis N°
 *     affiché, N° de lot, niveau, adresse si elle diffère ; gris clair, empilées, même largeur. Un clic ouvre la fiche de l'annexe.
 *   · « Détacher » (lien discret dans la case), avec confirmation : l'annexe devient un bien à part entière, même propriétaire ;
 *     rien n'est supprimé, aucun geste sur le Drive (la marque `annexe_detachee_le`, migration 379 — le lien reste).
 *   · « Rattacher à un bien » sur un bien autonome de type annexe : une annexe détachée revient à SON bien d'origine (le lien est
 *     en ajout seul) ; un lot jamais lié se rattache à un bien principal du même propriétaire.
 * Les gestes passent par `/api/admin/gestion/annuaire/location` (`detacher-annexe`, `rattacher-annexe`), journalisés sur les
 * DEUX biens. ⚠️ AUCUN IMPORT QUI TIRE `pg`.
 */
const GESTES = '/api/admin/gestion/annuaire/location';

async function geste(corps: Record<string, unknown>): Promise<string | null> {
  try {
    const r = await fetch(GESTES, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
    const d = await r.json().catch(() => ({})) as { etat?: string; motif?: string };
    if (d.etat === 'ok') return null;
    if (r.status === 401 || r.status === 403) return 'Votre compte n’a pas le droit « Gestion », ou votre session a expiré.';
    return d.motif ?? (d.etat === 'inconnu' ? 'Ce bien n’est plus une annexe.' : 'Le geste a été refusé.');
  } catch {
    return 'Le serveur n’a pas répondu : rien n’a été modifié.';
  }
}

/** Les cases des annexes d'un bien principal, avec « Détacher ». `onApres` : relire la fiche après un geste réussi. */
export function CasesAnnexes({ annexes, bien, typePrincipal, onOuvrir, onApres }: {
  annexes: AnnexeAffichee[];
  bien: { adresse: string | null; commune: string | null };
  typePrincipal: string;
  onOuvrir: (lotId: number) => void;
  onApres: () => void;
}) {
  const [aDetacher, setADetacher] = useState<AnnexeAffichee | null>(null);
  const [motif, setMotif] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  if (annexes.length === 0) return null;
  const detacher = async (a: AnnexeAffichee): Promise<void> => {
    setEnvoi(true);
    const m = await geste({ action: 'detacher-annexe', id: a.id, detacher: true });
    setEnvoi(false);
    setADetacher(null);
    setMotif(m);
    if (m === null) onApres();
  };
  return (
    <div className="anx-cases" data-cases-annexes>
      <style>{CSS_ANNEXES_DU_BIEN}</style>
      {annexes.map((a) => {
        const type = typeDuLot(a);
        const details = detailsAnnexe(a, bien);
        return (
          <div key={a.id} className="anx-case" data-case-annexe={a.id}>
            <button type="button" className="anx-case-corps" onClick={() => onOuvrir(a.id)} data-ouvrir-annexe={a.id}>
              <strong className="anx-type">{type}</strong>
              {details.length > 0 && <span className="anx-details">{details.join(' · ')}</span>}
            </button>
            <button type="button" className="anx-detacher" onClick={() => { setMotif(null); setADetacher(a); }} data-detacher-annexe={a.id}
              aria-label={`Détacher ${type.toLowerCase()} ${details.join(' ')}`.trim()}>Détacher</button>
          </div>
        );
      })}
      {motif !== null && <p className="anx-refus" role="alert">{motif}</p>}
      {aDetacher !== null && (
        <ModaleIssue sorte="attention" titre="Détacher cette annexe ?" onFermer={() => { if (!envoi) setADetacher(null); }}
          notes={[questionDetacher(typeDuLot(aDetacher), typePrincipal), 'Elle garde toutes ses informations, son propriétaire, son historique et ses mails. Rien n’est supprimé.']}
          actions={[
            { libelle: 'Annuler', onClick: () => setADetacher(null), repere: 'annuler-detacher' },
            { libelle: envoi ? 'Détachement…' : 'Détacher', principal: true, repere: 'confirmer-detacher', onClick: () => { if (!envoi) void detacher(aDetacher); } },
          ]} />
      )}
    </div>
  );
}

/** « Rattacher à un bien » : les biens principaux proposés ; une annexe détachée ne revient qu'à son bien d'origine. */
export function RattacherABien({ lotId, typeLot, candidats, onApres }: {
  lotId: number; typeLot: string; candidats: CandidatRattachement[]; onApres: () => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [choix, setChoix] = useState<number | null>(null);
  const [motif, setMotif] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const rattacher = async (): Promise<void> => {
    const c = candidats.find((x) => x.id === choix);
    if (c === undefined) { setMotif('Choisissez le bien principal.'); return; }
    setEnvoi(true);
    const m = await geste(c.origine ? { action: 'detacher-annexe', id: lotId, detacher: false } : { action: 'rattacher-annexe', id: c.id, annexeId: lotId });
    setEnvoi(false);
    setMotif(m);
    if (m === null) { setOuvert(false); onApres(); }
  };
  return (
    <span className="anx-rattacher" data-rattacher-a-un-bien={lotId}>
      <style>{CSS_ANNEXES_DU_BIEN}</style>
      <button type="button" className="anx-lien" onClick={() => { setMotif(null); setChoix(candidats.length === 1 ? candidats[0].id : null); setOuvert(true); }}
        data-ouvrir-rattacher>Rattacher à un bien</button>
      {ouvert && (
        <ModaleIssue sorte="attention" titre={`Rattacher ${typeLot.toLowerCase() === 'autre' ? 'cette annexe' : `ce lot (${typeLot.toLowerCase()})`} à un bien`}
          onFermer={() => { if (!envoi) setOuvert(false); }}
          notes={candidats.length === 0 ? ['Aucun bien principal de ce propriétaire ne peut le recevoir.']
            : candidats.some((c) => c.origine) ? ['Une annexe détachée revient à son bien d’origine (son lien est gardé pour toujours) : elle redevient une case sous lui.']
              : ['Il redeviendra une case sous le bien choisi, et ne comptera plus comme un bien à part.']}
          actions={[
            { libelle: 'Annuler', onClick: () => setOuvert(false), repere: 'annuler-rattacher' },
            ...(candidats.length > 0 ? [{ libelle: envoi ? 'Rattachement…' : 'Rattacher', principal: true, repere: 'confirmer-rattacher', onClick: () => { if (!envoi) void rattacher(); } }] : []),
          ]}>
          {candidats.length > 0 && (
            <fieldset className="anx-choix" data-choix-rattacher>
              <legend>Bien principal</legend>
              {candidats.map((c) => (
                <label key={c.id} className="anx-choix-ligne">
                  <input type="radio" name={`rattacher-${lotId}`} checked={choix === c.id} onChange={() => { setChoix(c.id); setMotif(null); }} data-candidat={c.id} />
                  <span><strong>{typeDuLot({ categorie: c.categorie, nature: null, typeBien: null }, 'Bien')}</strong> — {[c.adresse, c.commune].filter((x) => x).join(', ') || `bien ${c.id}`}
                    {c.origine ? <span className="anx-muet"> · bien d’origine</span> : null}</span>
                </label>
              ))}
            </fieldset>
          )}
          {motif !== null && <p className="anx-refus" role="alert">{motif}</p>}
        </ModaleIssue>
      )}
    </span>
  );
}

interface AnnexesLues {
  lotId: number; typeLot: string; annexes: AnnexeAffichee[]; detachee: boolean; candidats: CandidatRattachement[] | null;
  principal: { id: number; adresse: string | null; commune: string | null; categorie: string | null } | null;
}

/**
 * Les annexes d'un bien LUES par sa fiche (fiche du bien, carte « Son logement » du locataire) : le compteur, les cases, et
 * « Rattacher à un bien » pour un lot autonome de type annexe. Rien s'il n'y a rien à dire.
 */
export function AnnexesDeLaFiche({ lotId, bien, onOuvrir }: {
  lotId: number; bien: { adresse: string | null; commune: string | null }; onOuvrir: (lotId: number) => void;
}) {
  const [lu, setLu] = useState<AnnexesLues | null>(null);
  const [tour, setTour] = useState(0);
  useEffect(() => {
    let vivant = true;
    fetch(`/api/admin/gestion/annexes?lot=${lotId}`, { headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then((r) => r.json())
      .then((d: { etat?: string; data?: AnnexesLues | null }) => { if (vivant) setLu(d.etat === 'ok' && d.data ? d.data : null); })
      .catch(() => { if (vivant) setLu(null); });
    return () => { vivant = false; };
  }, [lotId, tour]);
  const relire = useCallback(() => setTour((t) => t + 1), []);
  if (lu === null) return null;
  const typePrincipal = lu.typeLot;
  const compteur = motCompteur(typePrincipal, lu.annexes.length);
  if (lu.annexes.length === 0 && lu.candidats === null) return null;
  return (
    <div className="anx-fiche" data-annexes-de-la-fiche={lotId}>
      <style>{CSS_ANNEXES_DU_BIEN}</style>
      {compteur !== null && <p className="anx-compteur" data-compteur-annexes>{compteur}</p>}
      <CasesAnnexes annexes={lu.annexes} bien={bien} typePrincipal={typePrincipal} onOuvrir={onOuvrir} onApres={relire} />
      {lu.candidats !== null && (
        <p className="anx-autonome" data-bien-autonome>
          {lu.detachee && lu.principal !== null ? <>Annexe détachée — bien à part entière (d’origine : {[lu.principal.adresse, lu.principal.commune].filter((x) => x).join(', ') || `bien ${lu.principal.id}`}). </> : null}
          <RattacherABien lotId={lotId} typeLot={typePrincipal} candidats={lu.candidats} onApres={relire} />
        </p>
      )}
    </div>
  );
}

/** Une ligne de l'Historique d'annexe, telle que la route la rend. */
interface EvenementLu { id: number; quand: string; action: string; texte: string; par: string }
const MOT_ACTION: Record<string, string> = {
  location_annexe_detachee: 'Annexe détachée', location_annexe_rattachee: 'Annexe rattachée', location_annexe_reintegree: 'Annexe réintégrée',
};

/** « Annexes : détachements et rattachements (N) » — une bande repliable de l'Historique du bien (les deux biens concernés). */
export function HistoriqueAnnexes({ lotId }: { lotId: number }) {
  const [lignes, setLignes] = useState<EvenementLu[] | null>(null);
  const [ouvert, setOuvert] = useState(false);
  useEffect(() => {
    let vivant = true;
    fetch(`/api/admin/gestion/annexes?lot=${lotId}&journal=1`, { headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then((r) => r.json())
      .then((d: { etat?: string; data?: unknown }) => { if (vivant) setLignes(d.etat === 'ok' && Array.isArray(d.data) ? d.data as EvenementLu[] : []); })
      .catch(() => { if (vivant) setLignes([]); });
    return () => { vivant = false; };
  }, [lotId]);
  if (lignes === null || lignes.length === 0) return null;
  const date = (q: string): string => {
    const d = new Date(q);
    if (Number.isNaN(d.getTime())) return q;
    const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', ...o }).format(d);
    return `${f({ day: '2-digit', month: '2-digit', year: 'numeric' })} à ${f({ hour: '2-digit', minute: '2-digit' })}`;
  };
  return (
    <section className="hdb-groupe hdb-groupe--bande" data-historique-annexes>
      <style>{CSS_ANNEXES_DU_BIEN}</style>
      <div className="hdb-groupe-tete">
        <button type="button" className="hdb-replier" aria-expanded={ouvert} onClick={() => setOuvert((v) => !v)}>
          <span aria-hidden="true" className={`hdb-triangle${ouvert ? ' hdb-triangle--ouvert' : ''}`}>▶</span>
          Annexes : détachements et rattachements
          <span className="gst-compte">{lignes.length}</span>
        </button>
      </div>
      {ouvert && (
        <ul className="anx-histo">
          {lignes.map((l) => (
            <li key={l.id} data-evenement-annexe={l.id}>
              <span className="anx-histo-date">{date(l.quand)}</span>
              <strong>{MOT_ACTION[l.action] ?? l.action}</strong>
              <span className="anx-muet">{l.texte}</span>
              <span className="anx-muet">par {l.par}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* AUCUN ACCENT GRAVE DANS CE LITTERAL. Jetons du theme seulement (Clair et Sombre) ; cibles de 44 px pour les gestes. */
export const CSS_ANNEXES_DU_BIEN = `
.anx-cases{display:flex;flex-direction:column;gap:6px;min-width:0}
.anx-case{display:flex;align-items:stretch;gap:0;min-width:0;border:1px solid var(--color-svv-line);border-radius:10px;background:var(--color-svv-field);overflow:hidden}
.anx-case-corps{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;align-items:flex-start;gap:2px;text-align:left;padding:8px 10px;min-height:44px;
  border:0;background:transparent;font:inherit;font-size:.82rem;color:var(--color-svv-ink);cursor:pointer;box-sizing:border-box}
.anx-case-corps:hover{background:color-mix(in srgb, var(--color-svv-line) 35%, transparent)}
.anx-case-corps:focus-visible,.anx-detacher:focus-visible,.anx-lien:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px}
.anx-type{font-weight:800;font-size:.88rem}
.anx-details{color:var(--color-svv-muted);overflow-wrap:anywhere}
.anx-detacher{flex:0 0 auto;border:0;border-left:1px solid var(--color-svv-line);background:transparent;padding:0 12px;min-height:44px;font:inherit;font-size:.74rem;
  color:var(--color-svv-muted);text-decoration:underline;text-underline-offset:2px;cursor:pointer}
.anx-detacher:hover{color:var(--color-svv-red)}
.anx-refus{margin:0;color:var(--color-svv-red);font-weight:700;font-size:.85rem}
.anx-compteur{margin:0 0 2px;font-size:.78rem;font-weight:800;color:var(--color-svv-ink)}
.anx-fiche{display:flex;flex-direction:column;gap:6px;min-width:0}
.anx-autonome{margin:0;font-size:.8rem;color:var(--color-svv-muted);display:flex;flex-wrap:wrap;align-items:center;gap:4px;overflow-wrap:anywhere}
.anx-lien{border:0;background:none;padding:0 2px;min-height:44px;font:inherit;font-size:.78rem;font-weight:700;color:var(--color-svv-ink);text-decoration:underline;text-underline-offset:2px;cursor:pointer}
.anx-lien:hover{color:var(--color-svv-red)}
.anx-choix{border:0;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.anx-choix legend{font-weight:800;font-size:.85rem;margin-bottom:4px}
.anx-choix-ligne{display:flex;align-items:center;gap:10px;min-height:44px;padding:4px 8px;border:1px solid var(--color-svv-line);border-radius:10px;cursor:pointer;overflow-wrap:anywhere}
.anx-choix-ligne input{width:20px;height:20px;flex:0 0 auto}
.anx-muet{color:var(--color-svv-muted)}
.anx-histo{list-style:none;margin:4px 0 0;padding:0;display:flex;flex-direction:column;gap:4px}
.anx-histo li{display:flex;flex-wrap:wrap;align-items:baseline;gap:.25rem .75rem;padding:.5rem .6rem;min-height:44px;box-sizing:border-box;font-size:.86rem;
  color:var(--color-svv-ink);background:var(--color-svv-surface);border:1px solid var(--color-svv-line);border-radius:.5rem}
.anx-histo-date{font-weight:600;white-space:nowrap}
`;
