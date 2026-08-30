'use client';

import { useEffect, useRef, useState } from 'react';
import { BlocDemandePieces } from './BlocDemandePieces';
import { BlocRepliable } from './BlocRepliable';
import { resumeCompletude, doitRecalculerAuto } from '../../../../lib/permis/completudeResume';

/**
 * PART-2 / PERF-1 — DIAGNOSTIC DE COMPLÉTUDE des pièces (+ demande de pièces + déclaration de relance), en tête de la ligne dépliée
 * d'« Analyse et projection ». Lit le diagnostic MÉMORISÉ (GET /api/admin/permis/completude), recomposé selon les familles attendues
 * vives — AUCUNE relecture de PDF ni IA au rendu. Le calcul (coûteux) se fait au geste « Relancer l'analyse ».
 *
 * PERF-1 : ce bloc fait UNE lecture légère (la mémoire) au montage pour afficher le BILAN dans la ligne de titre (visible sans
 * déplier). Le DÉTAIL — dont `BlocDemandePieces`, qui interroge le réseau — n'est monté qu'au DÉPLIAGE (render-prop de BlocRepliable).
 * Information portée par le TEXTE (jamais la couleur seule).
 */
type Famille = 'masse' | 'coupe' | 'etage' | 'cerfa';
const LIBELLE: Record<Famille, string> = { masse: 'Plan de masse', coupe: 'Plan de coupe', etage: 'Plans d’étages', cerfa: 'Formulaire Cerfa' };
const TITRE = 'Complétude des pièces et relances semi-automatiques';

interface LigneCompletude { famille: Famille; presente: boolean; pieces: string[] }
interface Desaccord { nomFichier: string; parContenu: Famille | null; parNom: Famille | null }
interface Completude {
  diagnostic: { lignes: LigneCompletude[]; desaccords: Desaccord[]; nonClassees: string[] };
  calculeLe: string;
  perime: boolean;
}
type Etat = { statut: 'chargement' } | { statut: 'erreur' } | { statut: 'ok'; completude: Completude | null };

const muted: React.CSSProperties = { fontSize: 12, color: 'var(--color-svv-muted)' };

export function BlocCompletude({ dossierId }: { dossierId: number }) {
  const [etat, setEtat] = useState<Etat>({ statut: 'chargement' });
  const [recalcEnCours, setRecalcEnCours] = useState(false); // PERF-2 — recalcul auto (GED changée) en tâche de fond
  const [recalcEchoue, setRecalcEchoue] = useState(false);   // PERF-2 — l'auto-recalcul a échoué : on le DIT, on ne montre pas un faux bilan
  const dejaLance = useRef(false);                           // PERF-2 — ANTI-BOUCLE : une seule tentative auto par ouverture de fiche

  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/permis/completude?dossierId=${dossierId}`, { cache: 'no-store' }); // lecture mémoire : bilan du titre
        if (annule) return;
        if (!res.ok) { setEtat({ statut: 'erreur' }); return; }
        const completude = ((await res.json()) as { completude: Completude | null }).completude;
        setEtat({ statut: 'ok', completude });
        // PERF-2 — ÉCART GED détecté (perime) → RECALCUL AUTO, NON BLOQUANT (la fiche est déjà rendue), UNE SEULE FOIS. Le recalcul
        //   relit les PDF par contenu (parse local, AUCUNE vision/IA payante). L'échec ne relance pas (dejaLance reste vrai).
        if (doitRecalculerAuto(completude, dejaLance.current)) {
          dejaLance.current = true;
          setRecalcEnCours(true);
          try {
            const r = await fetch('/api/admin/permis/completude', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dossierId }) });
            if (annule) return;
            if (r.ok) setEtat({ statut: 'ok', completude: ((await r.json()) as { completude: Completude | null }).completude });
            else setRecalcEchoue(true);
          } catch { if (!annule) setRecalcEchoue(true); }
          finally { if (!annule) setRecalcEnCours(false); }
        }
      } catch { if (!annule) setEtat({ statut: 'erreur' }); }
    })();
    return () => { annule = true; };
  }, [dossierId]);

  return (
    <BlocRepliable titre={<TitreBilan etat={etat} recalcEnCours={recalcEnCours} recalcEchoue={recalcEchoue} />}>
      {() => <CorpsCompletude etat={etat} dossierId={dossierId} recalcEnCours={recalcEnCours} recalcEchoue={recalcEchoue} />}
    </BlocRepliable>
  );
}

/** Ligne de titre : nom du bloc + BILAN léger (incomplet + nombre / complet / jamais calculé), texte porteur, couleur en appui. */
function TitreBilan({ etat, recalcEnCours, recalcEchoue }: { etat: Etat; recalcEnCours: boolean; recalcEchoue: boolean }) {
  let bilan: React.ReactNode;
  // PERF-2 : pendant/après l'auto-recalcul, on ne présente JAMAIS un bilan périmé comme actuel, et JAMAIS « incomplet » par défaut.
  if (recalcEnCours) bilan = <span style={{ fontWeight: 400, ...muted }}> — actualisation du diagnostic en cours…</span>;
  else if (recalcEchoue) bilan = <span style={{ fontWeight: 400, ...muted }}> — actualisation automatique en échec (utilisez « Relancer l’analyse »)</span>;
  else if (etat.statut === 'chargement') bilan = <span style={{ fontWeight: 400, ...muted }}> — analyse en cours…</span>;
  else if (etat.statut === 'erreur') bilan = <span style={{ fontWeight: 400, ...muted }}> — bilan indisponible</span>;
  else {
    const r = resumeCompletude(etat.completude);
    if (r.statut === 'jamais') bilan = <span style={{ fontWeight: 400, ...muted }}> — diagnostic non calculé (lancez l’analyse)</span>;
    else if (r.statut === 'incomplet') bilan = <span style={{ fontWeight: 700, color: 'var(--color-svv-red)' }}> — dossier incomplet ({r.manquantes} famille{r.manquantes > 1 ? 's' : ''} manquante{r.manquantes > 1 ? 's' : ''})</span>;
    else bilan = <span style={{ fontWeight: 700, color: 'var(--color-svv-green-ink)' }}> — dossier complet</span>;
  }
  return <span>{TITRE}{bilan}</span>;
}

/** Corps DÉTAILLÉ (monté seulement au dépliage) : lignes par famille, désaccords, non classées, et la demande de pièces manquantes. */
function CorpsCompletude({ etat, dossierId, recalcEnCours, recalcEchoue }: { etat: Etat; dossierId: number; recalcEnCours: boolean; recalcEchoue: boolean }) {
  return (
    <div className="svv-card flex flex-col gap-2" style={{ minWidth: 0 }}>
      {recalcEnCours && <span style={muted} aria-live="polite">Actualisation du diagnostic (lecture des pièces)…</span>}
      {!recalcEnCours && recalcEchoue && <span role="alert" style={{ fontSize: 12, color: 'var(--color-svv-red)' }}>L’actualisation automatique a échoué — cliquez « Relancer l’analyse » ci-dessus.</span>}
      {!recalcEnCours && !recalcEchoue && etat.statut === 'chargement' && <span style={muted} aria-live="polite">Analyse des pièces…</span>}
      {!recalcEnCours && !recalcEchoue && etat.statut === 'erreur' && <span role="alert" style={{ fontSize: 12, color: 'var(--color-svv-red)' }}>Diagnostic indisponible.</span>}
      {!recalcEnCours && !recalcEchoue && etat.statut === 'ok' && etat.completude === null && (
        <span style={muted}>Diagnostic non calculé pour ce permis — cliquez « Relancer l’analyse » ci-dessus pour l’établir.</span>
      )}
      {!recalcEnCours && !recalcEchoue && etat.statut === 'ok' && etat.completude !== null && <Contenu c={etat.completude} dossierId={dossierId} />}
    </div>
  );
}

function Contenu({ c, dossierId }: { c: Completude; dossierId: number }) {
  const manquantes = c.diagnostic.lignes.filter((l) => !l.presente).map((l) => l.famille);
  return (
    <div className="flex flex-col gap-1" style={{ fontSize: 13 }}>
      {c.perime && (
        <p role="note" style={{ margin: 0, fontSize: 12, color: 'var(--color-svv-red)' }}>
          ⚠ Une pièce a été ajoutée depuis ce diagnostic — relancez l’analyse pour l’actualiser.
        </p>
      )}
      <ul style={{ margin: 0, paddingLeft: '1.1rem', display: 'flex', flexDirection: 'column', gap: '.15rem' }}>
        {c.diagnostic.lignes.map((l) => (
          <li key={l.famille}>
            {/* Texte porteur : le MOT « Présent »/« Manquant » dit l'état, la couleur n'est qu'un appui. */}
            <strong>{LIBELLE[l.famille]}</strong> :{' '}
            {l.presente
              ? <span style={{ color: 'var(--color-svv-green-ink)' }}>Présent ({l.pieces.length} pièce{l.pieces.length > 1 ? 's' : ''})</span>
              : <span style={{ color: 'var(--color-svv-red)', fontWeight: 700 }}>Manquant</span>}
            {l.presente && l.pieces.length > 0 && <span style={muted}> — {l.pieces.join(', ')}</span>}
          </li>
        ))}
      </ul>
      {c.diagnostic.desaccords.length > 0 && (
        <div style={{ ...muted, marginTop: '.2rem' }}>
          Désaccord nom / contenu (le contenu l’emporte) :
          <ul style={{ margin: '.1rem 0 0', paddingLeft: '1.1rem' }}>
            {c.diagnostic.desaccords.map((d) => (
              <li key={d.nomFichier}>{d.nomFichier} — nom : {d.parNom ? LIBELLE[d.parNom] : '—'} ; contenu : {d.parContenu ? LIBELLE[d.parContenu] : '—'}</li>
            ))}
          </ul>
        </div>
      )}
      {c.diagnostic.nonClassees.length > 0 && (
        <span style={muted}>{c.diagnostic.nonClassees.length} pièce{c.diagnostic.nonClassees.length > 1 ? 's' : ''} non classée{c.diagnostic.nonClassees.length > 1 ? 's' : ''} (contenu illisible ou nom sans indice) : {c.diagnostic.nonClassees.join(', ')}</span>
      )}
      <span style={{ ...muted, fontSize: 11 }}>Diagnostic établi le {c.calculeLe.slice(0, 10)}.</span>
      {/* PART-3a — demander à la mairie les familles MANQUANTES (envoi manuel, dans le fil). Rien à demander si tout est présent. */}
      {manquantes.length > 0 && <BlocDemandePieces dossierId={dossierId} famillesManquantes={manquantes} />}
    </div>
  );
}
