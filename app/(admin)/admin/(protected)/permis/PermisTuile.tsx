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
import { PROCESS_DEFAUT, type Process } from '../../../../lib/sitadel/process';
import type { CleCategorie } from '../../../../lib/sitadel/priorite';

/** D2 — onglets du groupe « Demandes aux mairies » scopés par le commutateur de process (À demander, En cours, Réponses, Archives). */
const ONGLETS_DEMANDES: readonly CleOnglet[] = ['a_demander', 'en_cours', 'reponses', 'archives'];

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

  // D2 — compteurs du commutateur (communes + demandes en cours par process, 3e groupe). Chargés à l'ouverture ; best-effort
  //   (un échec laisse le commutateur sans chiffres, jamais un écran cassé). Lecture seule, aucune requête de surveillance.
  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/permis/process-compteurs', { cache: 'no-store' });
        if (!annule && res.ok) setCompteursProcess((await res.json()) as CompteursProcess);
      } catch { /* compteurs indisponibles : commutateur utilisable sans chiffres */ }
    })();
    return () => { annule = true; };
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <OngletsPermis actif={onglet} onChoisir={setOnglet}
        compteurs={comptes ? { reponses: comptes.reponses, saisines: comptes.saisines, rattachement: comptes.rattachement, projection: comptes.projection } : undefined} />
      {/* D2 — le commutateur de process coiffe les 4 onglets « Demandes » et les scope (email / téléservice) + 3e groupe. */}
      {ONGLETS_DEMANDES.includes(onglet) && (
        <CommutateurProcess actif={processActif} onChoisir={setProcessActif} compteurs={compteursProcess} />
      )}
      {onglet === 'dossiers' && <PermisVue depuisParDefaut={depuisParDefaut} categories={categories} />}
      {onglet === 'rattachement' && <SuiviRattachementVue onRecompter={() => void recompter()} />}
      {onglet === 'a_demander' && <ADemanderVue categories={categories} ancienneteMaxAnnees={ancienneteMaxAnnees} triLibelle={triLibelle} process={processActif} onAllerReglages={() => setOnglet('reglages')} />}
      {onglet === 'en_cours' && <EnCoursVue categories={categories} process={processActif} />}
      {onglet === 'reponses' && <ReponsesVue process={processActif} onRecompter={() => void recompter()} />}
      {onglet === 'projection' && <ProjectionVue onRecompter={() => void recompter()} />}
      {onglet === 'archives' && <ArchivesVue process={processActif} />}
      {onglet === 'saisines' && <SaisinesVue onRecompter={() => void recompter()} />}
      {onglet === 'reglages' && <ReglagesVue />}
      {onglet === 'automatisation' && <AutomatisationVue />}
      {onglet === 'collaborateurs' && <CollaborateursVue />}
    </div>
  );
}
