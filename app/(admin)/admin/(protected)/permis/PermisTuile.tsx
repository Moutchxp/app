'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { PermisVue } from './PermisVue';
import { ADemanderVue } from './ADemanderVue';
import { EnCoursVue } from './EnCoursVue';
import { ReponsesVue } from './ReponsesVue';
import { ArchivesVue } from './ArchivesVue';
import { SaisinesVue } from './SaisinesVue';
import { ReglagesVue } from './ReglagesVue';
import { AutomatisationVue } from './AutomatisationVue';
import { CollaborateursVue } from './CollaborateursVue';
import { SuiviRattachementVue } from './SuiviRattachementVue';
import { ProjectionVue } from './ProjectionVue';
import { OngletsPermis, type CleOnglet } from './PermisOnglets';
import { CommutateurProcess, type CompteursProcess } from './CommutateurProcess';
import { BasculeRail } from './BasculeRail';
import { PROCESS_DEFAUT, type Process } from '../../../../lib/sitadel/process';
import type { CleCategorie } from '../../../../lib/sitadel/priorite';

/**
 * Onglets scopés par le commutateur de process (À demander, En cours, Réponses). D3-fix — Archives en est RETIRÉ : une fois les
 * documents obtenus, le process d'origine ne détermine plus aucun geste → Archives reste GLOBAL et n'affiche PAS le commutateur
 * (un commutateur qui ne filtre rien serait un mensonge d'interface).
 */
const ONGLETS_DEMANDES: readonly CleOnglet[] = ['a_demander', 'en_cours', 'reponses'];

/**
 * Onglets « Permis de construire », répartis en 2 groupes nommés (S13) — « Mise à jour des dossiers » (Dossiers,
 * Automatisation) et « Demandes aux mairies » (À demander, En cours, Réponses, Archives, Saisines CADA, Collaborateurs,
 * Réglages). La barre est PURE (`OngletsPermis`) ; ici on ne gère que l'onglet actif et le montage du corps correspondant.
 * Q5 — l'ex-« Demandes » est scindé : « À demander » (préparation) et « En cours » (suivi), montés indépendamment.
 */
interface Props { depuisParDefaut: string; categories: { cle: CleCategorie; libelle: string; rang: number }[]; ancienneteMaxAnnees: number; triLibelle: string }

interface Comptes { reponses: number; saisines: number; rattachement: number; projection: number }

/** Millisecondes jusqu'à la PROCHAINE occurrence de l'heure locale `h` (0..23). Sert au SEUL recomptage quotidien (pas un sondage). */
function msJusquaProchaineHeure(h: number): number {
  const now = new Date();
  const cible = new Date(now);
  cible.setHours(h, 0, 0, 0);
  if (cible.getTime() <= now.getTime()) cible.setDate(cible.getDate() + 1);
  return cible.getTime() - now.getTime();
}

export function PermisTuile({ depuisParDefaut, categories, ancienneteMaxAnnees, triLibelle }: Props) {
  const [onglet, setOnglet] = useState<CleOnglet>('dossiers');
  const [comptes, setComptes] = useState<Comptes | null>(null);
  // D2 — process actif du commutateur (défaut e-mail ; NE persiste PAS entre sessions) + compteurs des viviers.
  const [processActif, setProcessActif] = useState<Process>(PROCESS_DEFAUT);
  const [compteursProcess, setCompteursProcess] = useState<CompteursProcess | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recompterRef = useRef<() => Promise<void>>(async () => {}); // rompt l'auto-référence (planification quotidienne)

  // UNE requête de comptage : à l'ouverture (montage), après chaque action réussie (via onRecompter), et une fois par jour à
  // l'heure réglée (replanifiée à chaque comptage, via la ref). AUCUN sondage périodique. Un échec laisse les onglets utilisables.
  const recompter = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch('/api/admin/permis/actions', { cache: 'no-store' });
      if (!res.ok) return;
      const d = (await res.json()) as Comptes & { total: number; recomptageHeure: number };
      setComptes({ reponses: d.reponses, saisines: d.saisines, rattachement: d.rattachement, projection: d.projection });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => { void recompterRef.current(); }, msJusquaProchaineHeure(d.recomptageHeure)); // recomptage quotidien
    } catch { /* compteurs indisponibles : sans pastille, les onglets restent pleinement utilisables */ }
  }, []);

  useEffect(() => {
    recompterRef.current = recompter;
    void (async () => { await recompterRef.current(); })(); // comptage à l'ouverture (via la ref → pas de setState direct en effet)
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [recompter]);

  // D2 — compteurs du commutateur (communes + demandes en cours par process, 3e groupe). Best-effort (un échec laisse le
  //   commutateur sans chiffres). Lecture seule, aucune requête de surveillance. `rechargerCompteursProcess` (event-driven) sert
  //   au rechargement APRÈS une bascule de rail (D5) ; l'effet de montage inline son propre fetch (setState après await, jamais synchrone).
  const rechargerCompteursProcess = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch('/api/admin/permis/process-compteurs', { cache: 'no-store' });
      if (res.ok) setCompteursProcess((await res.json()) as CompteursProcess);
    } catch { /* compteurs indisponibles : commutateur utilisable sans chiffres */ }
  }, []);
  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/permis/process-compteurs', { cache: 'no-store' });
        if (!annule && res.ok) setCompteursProcess((await res.json()) as CompteursProcess);
      } catch { /* compteurs indisponibles */ }
    })();
    return () => { annule = true; };
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <OngletsPermis actif={onglet} onChoisir={setOnglet}
        compteurs={comptes ? { reponses: comptes.reponses, saisines: comptes.saisines, rattachement: comptes.rattachement, projection: comptes.projection } : undefined} />
      {/* D2 — le commutateur de process coiffe les 4 onglets « Demandes » et les scope (email / téléservice) + 3e groupe. */}
      {ONGLETS_DEMANDES.includes(onglet) && (
        <>
          <CommutateurProcess actif={processActif} onChoisir={setProcessActif} compteurs={compteursProcess} />
          {/* D5 — basculer une commune de rail, atteignable depuis le commutateur. Réutilise annuler-lot (D1) + PATCH /contact. */}
          <BasculeRail onBascule={() => void rechargerCompteursProcess()} />
        </>
      )}
      {onglet === 'dossiers' && <PermisVue depuisParDefaut={depuisParDefaut} categories={categories} />}
      {onglet === 'rattachement' && <SuiviRattachementVue onRecompter={() => void recompter()} />}
      {onglet === 'a_demander' && <ADemanderVue categories={categories} ancienneteMaxAnnees={ancienneteMaxAnnees} triLibelle={triLibelle} process={processActif} onBasculerProcess={setProcessActif} onAllerReglages={() => setOnglet('reglages')} />}
      {onglet === 'en_cours' && <EnCoursVue categories={categories} process={processActif} />}
      {onglet === 'reponses' && <ReponsesVue process={processActif} onRecompter={() => void recompter()} />}
      {onglet === 'projection' && <ProjectionVue onRecompter={() => void recompter()} />}
      {onglet === 'archives' && <ArchivesVue />}
      {onglet === 'saisines' && <SaisinesVue onRecompter={() => void recompter()} />}
      {onglet === 'reglages' && <ReglagesVue />}
      {onglet === 'automatisation' && <AutomatisationVue />}
      {onglet === 'collaborateurs' && <CollaborateursVue />}
    </div>
  );
}
