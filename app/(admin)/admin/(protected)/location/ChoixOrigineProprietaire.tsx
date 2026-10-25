'use client';

import { useEffect, useState } from 'react';
import { useChoixOrigine } from './ChoixOrigine';
import { CSS_SUIVI_COMMERCIAL, useParametresSuivi } from './SuiviCommercial';
import { libelleOrigineProprietaire, ORIGINES_PROPRIETAIRE } from '../../../../lib/location/origineProprietaire';
import { originesProposees } from '../../../../lib/location/suivi/suivi';

/**
 * ══ 🔴 Arno (25/10/2026, 425) — « ORIGINE DU CONTACT » D'UN PROPRIÉTAIRE ══════════════════════════════════════════════════════════════
 * Le composant d'origine du bloc 4, avec la liste du propriétaire (sans « Relocation » ni « Propriétaire déjà client », propres à une
 * location) et le choix « Origine inconnue — à compléter » en fin de liste : il satisfait l'obligation (jamais de champ vide) mais n'est
 * pas hérité par les locations. OBLIGATOIRE à la création (Nouveau propriétaire, ancienne page, bloc Propriétaire(s), « + Ajouter un
 * propriétaire »). Sans le droit Location (la liste des apporteurs), « Apporteur » et « Collègue » ne sont pas choisissables ici.
 */
export interface SaisieOrigineProprietaire { origine: string; precision: string; collegueId: number | null; apporteurId: number | null }
export const ORIGINE_PROPRIETAIRE_VIDE = (): SaisieOrigineProprietaire => ({ origine: '', precision: '', collegueId: null, apporteurId: null });

/** Ce que l'API reçoit (`verifierOrigineProprietaire`). PUR. */
export const corpsOrigineProprietaire = (s: SaisieOrigineProprietaire) => ({ origine: s.origine, precision: s.precision, collegueId: s.collegueId, apporteurId: s.apporteurId });

/** Le motif qui manque (affiché sous le champ), ou null. PUR. */
export function manqueOrigineProprietaire(s: SaisieOrigineProprietaire): string | null {
  if (s.origine === '') return 'L’origine du contact est obligatoire (ou « Origine inconnue — à compléter »).';
  if (s.origine === 'personnalise' && s.precision.trim() === '') return 'Origine « Personnalisé » : saisissez l’origine du contact.';
  if (s.origine === 'collegue' && s.collegueId === null) return 'Choisissez le collègue.';
  if (s.origine === 'apporteur' && s.apporteurId === null) return 'Choisissez l’apporteur d’affaires.';
  return null;
}

export function useOrigineProprietaire(valeur: SaisieOrigineProprietaire, onChange: (v: SaisieOrigineProprietaire) => void, o: { sousOrigine?: React.ReactNode } = {}) {
  const parametres = useParametresSuivi();
  const lu = parametres.lu;
  const sansLocation = parametres.erreur !== null;
  // Sans le droit Location (paramètres illisibles) : la 425 est demandée à l'annuaire ; un doute ne bloque rien ici (le serveur tranche).
  const [disponibleAnnuaire, setDisponibleAnnuaire] = useState<boolean | null>(null);
  useEffect(() => {
    if (!sansLocation || disponibleAnnuaire !== null) return;
    let vivant = true;
    fetch('/api/admin/gestion/annuaire?origineDisponible=1', { cache: 'no-store' }).then((r) => r.json())
      .then((d: { etat?: string; data?: { disponible?: boolean } }) => { if (vivant) setDisponibleAnnuaire(d.etat === 'ok' && d.data?.disponible === true); })
      .catch(() => { if (vivant) setDisponibleAnnuaire(false); });
    return () => { vivant = false; };
  }, [sansLocation, disponibleAnnuaire]);
  const proposees = new Set<string>([...originesProposees(lu?.personnalisable === true, false), 'inconnue']);
  const poser = (p: Partial<SaisieOrigineProprietaire>): void => onChange({ ...valeur, ...p });
  const choix = useChoixOrigine({
    valeur,
    // Le composant affiche l'origine même sans la 407 côté Location : la liste est celle du propriétaire.
    lu: { apporteurs: lu?.apporteurs ?? [], collegues: lu?.collegues ?? [], moi: lu?.moi ?? null, annuaire: true },
    rafraichir: parametres.rafraichir,
    options: ORIGINES_PROPRIETAIRE.filter((x) => proposees.has(x)).map((x) => ({ id: x, libelle: libelleOrigineProprietaire(x),
      ...(sansLocation && (x === 'apporteur' || x === 'collegue') ? { bloque: true, mention: ' — droit « Location » requis' } : {}) })),
    libelle: 'Origine du contact',
    sousOrigine: o.sousOrigine,
    onOrigine: (x) => poser({ origine: x, ...(x !== 'apporteur' ? { apporteurId: null } : {}), ...(x !== 'collegue' ? { collegueId: null } : {}), ...(x !== 'personnalise' ? { precision: '' } : {}) }),
    onPrecision: (t) => poser({ precision: t }),
    onCollegue: (id) => poser({ collegueId: id }),
    onApporteur: (id, depuisAnnuaire) => poser({ apporteurId: id, ...(depuisAnnuaire ? { origine: 'apporteur', collegueId: null, precision: '' } : {}) }),
  });
  // `disponible` : la 425 est-elle là ? (null : pas encore su).
  return { ...choix, disponible: sansLocation ? disponibleAnnuaire : lu === null ? null : lu.origineProprietaire === true, lu };
}

/** Ce que la carte d'ajout lit au moment d'enregistrer : la saisie et la disponibilité de la 425. */
export interface CibleOrigineCreation { saisie: SaisieOrigineProprietaire; disponible: boolean | null }

/**
 * 🔴 Arno (25/10/2026, 425) — l'origine du contact DANS LA CARTE D'AJOUT d'un propriétaire (bloc « Propriétaire(s) » de la fiche du bien,
 * « + Ajouter un propriétaire » de la Gestion) : montée seulement quand la carte est ouverte ; chaque saisie est remise à l'hôte
 * (`onChange`), qui la lit à l'enregistrement de la carte (obligatoire avec la 425).
 */
export function OrigineALaCreation({ initiale, onChange }: { initiale: SaisieOrigineProprietaire; onChange: (c: CibleOrigineCreation) => void }) {
  const [saisie, setSaisie] = useState<SaisieOrigineProprietaire>(initiale);
  const choix = useOrigineProprietaire(saisie, setSaisie);
  useEffect(() => { onChange({ saisie, disponible: choix.disponible }); }, [onChange, saisie, choix.disponible]);
  if (choix.disponible !== true) return null;
  const manque = manqueOrigineProprietaire(saisie);
  return (
    <div className="cp-origine-creation" data-origine-proprietaire>
      <style>{CSS_SUIVI_COMMERCIAL}</style>
      <div className="loc-grille loc-suivi-ligne loc-suivi-ligne--deux">{choix.champs}</div>
      {choix.apres}
      <small className="loc-muet">Reprise ensuite pour ses biens et chaque nouvelle location (modifiable sur la location).</small>
      {manque !== null && <small className="loc-manque" data-manque-origine>{manque}</small>}
    </div>
  );
}
