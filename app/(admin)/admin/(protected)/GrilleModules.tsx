'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
  type Announcements,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { LienMenu } from './menuAdmin';

/**
 * Grille de tuiles RÉORDONNABLE (dnd-kit) — composant CLIENT. `page.tsx` reste SERVEUR : il lit l'ordre
 * (Lot 1) et passe la liste déjà ordonnée en props. Au drop → POST `/api/admin/compte/ordre-modules` (Lot 2,
 * self-service scopé au sub du jeton), optimiste avec RÉTABLISSEMENT sur échec (jamais d'état « drag » bloqué :
 * l'état de drag de dnd-kit se termine au onDragEnd, et le seul état applicatif est l'ordre, remis à l'ancien
 * dans le `catch`). Après succès → `router.refresh()` : le layout (serveur) relit `ordre_modules` → la SIDEBAR
 * reflète le nouvel ordre. Accessibilité : poignée dédiée (clavier + pointeur), annonces en FRANÇAIS ; « Déconnexion »
 * n'est pas ici (hors `liensVisibles`). Aucun bleu ; prefers-reduced-motion coupe la transition (option dnd-kit).
 */

/** S'abonne à prefers-reduced-motion sans effet (SSR-safe : snapshot serveur = false). */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false,
  );
}

function TuileSortable({ tuile, reduce }: { tuile: LienMenu; reduce: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tuile.slug,
    // reduce → transition null : dnd-kit ne pose aucune animation de poussée (option native, pas un contournement).
    transition: reduce ? null : undefined,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? undefined,
  };
  return (
    <li ref={setNodeRef} style={style} className={`svv-grille-item${isDragging ? ' svv-grille-item--drag' : ''}`}>
      {/* Le <Link> EST la carte (géométrie d'origine). La poignée est SŒUR (jamais imbriquée : <button> dans <a>
          serait invalide) et HORS FLUX (position:absolute, coin) → aucune colonne ne pousse le contenu. */}
      <Link href={tuile.slug} className="svv-grille-lien">
        <span className="svv-grille-titre">{tuile.libelle}</span>
        <span className="svv-grille-desc">{tuile.desc}</span>
      </Link>
      <button
        type="button"
        className="svv-grille-poignee"
        aria-label={`Réordonner la tuile ${tuile.libelle}`}
        {...attributes}
        {...listeners}
      >
        <span aria-hidden="true">⠿</span>
      </button>
    </li>
  );
}

export function GrilleModules({ tuiles }: { tuiles: LienMenu[] }) {
  const router = useRouter();
  const reduce = usePrefersReducedMotion();
  const [ordre, setOrdre] = useState<LienMenu[]>(tuiles);
  const [erreur, setErreur] = useState<string | null>(null);

  // Libellé par slug (annonces FR + rétablissement) — stable, dérivé des props.
  const libellePar = useMemo(() => new Map(tuiles.map((t) => [t.slug, t.libelle])), [tuiles]);
  const nom = (id: string | number) => libellePar.get(String(id)) ?? String(id);

  const sensors = useSensors(
    // Souris : clic simple = navigation (le drag ne démarre qu'au-delà de 8px). Tactile : long-press ~220ms +
    // tolérance 8px → ne bloque pas le scroll de page. Clavier : Espace/Entrée pour saisir, flèches pour déplacer.
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const annonces: Announcements = {
    onDragStart: ({ active }) => `Déplacement de « ${nom(active.id)} » commencé.`,
    onDragOver: ({ active, over }) =>
      over ? `« ${nom(active.id)} » déplacé sur la position de « ${nom(over.id)} ».` : `« ${nom(active.id)} » hors zone.`,
    onDragEnd: ({ active, over }) =>
      over ? `« ${nom(active.id)} » déposé à la position de « ${nom(over.id)} ».` : `« ${nom(active.id)} » déposé.`,
    onDragCancel: ({ active }) => `Déplacement annulé, « ${nom(active.id)} » revient à sa position.`,
  };
  const instructions = {
    draggable:
      'Appuyez sur Espace ou Entrée pour saisir la tuile, les flèches pour la déplacer, Espace ou Entrée pour déposer, Échap pour annuler.',
  };

  async function onDragEnd(evt: DragEndEvent) {
    const { active, over } = evt;
    if (!over || active.id === over.id) return;
    const oldIndex = ordre.findIndex((t) => t.slug === active.id);
    const newIndex = ordre.findIndex((t) => t.slug === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const ancien = ordre; // capture AVANT mutation → rétablissement possible sur échec
    const nouveau = arrayMove(ordre, oldIndex, newIndex);
    setOrdre(nouveau); // optimiste : l'UI reflète immédiatement
    setErreur(null);
    try {
      const res = await fetch('/api/admin/compte/ordre-modules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nouveau.map((t) => t.slug)),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      router.refresh(); // relit l'ordre côté serveur → la SIDEBAR (rendue par le layout) se met à jour
    } catch {
      // Tout chemin d'échec (réseau OU !res.ok) ramène l'état au repos : ordre rétabli, message visible.
      setOrdre(ancien);
      setErreur('Réorganisation non enregistrée — l’ordre précédent a été rétabli.');
    }
  }

  return (
    <>
      <style>{CSS_GRILLE}</style>
      {erreur && (
        <p className="svv-grille-erreur" role="status">
          {erreur}
        </p>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
        accessibility={{ announcements: annonces, screenReaderInstructions: instructions }}
      >
        <SortableContext items={ordre.map((t) => t.slug)} strategy={rectSortingStrategy}>
          <ul className="svv-grille">
            {ordre.map((t) => (
              <TuileSortable key={t.slug} tuile={t} reduce={reduce} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </>
  );
}

const CSS_GRILLE = `
.svv-grille{list-style:none;margin:0;padding:0;display:grid;gap:12px;grid-template-columns:repeat(auto-fill, minmax(220px, 1fr))}
/* Chaque tuile = conteneur RELATIF (ancre la poignée absolue) qui porte le transform dnd-kit. */
.svv-grille-item{margin:0;position:relative}
.svv-grille-item--drag{opacity:.6}
/* Le lien EST la carte : géométrie D'ORIGINE (svv-card) — bordure ligne, radius 14, padding 14/16, trame grise. */
.svv-grille-lien{display:block;height:100%;box-sizing:border-box;background:var(--color-svv-field);border:1px solid var(--color-svv-line);border-radius:14px;padding:14px 16px;text-decoration:none}
.svv-grille-lien:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.svv-grille-item--drag .svv-grille-lien{border-color:var(--color-svv-red);box-shadow:0 0 0 1px var(--color-svv-red)}
.svv-grille-titre{display:block;font-weight:700;color:var(--color-svv-ink);margin-bottom:4px}
.svv-grille-desc{display:block;font-size:.82rem;color:var(--color-svv-muted)}
/* Poignée HORS FLUX (coin haut-droit) : cible tactile 44×44 collée au bord droit (s'étend dans le padding, PAS
   vers le titre) ; visible EN PERMANENCE (opacité réduite, --color-svv-muted → utilisable au doigt, pas seulement
   au survol), renforcée au survol ET au focus. touch-action:none limité À la poignée (le scroll de page reste OK). */
.svv-grille-poignee{position:absolute;top:2px;right:2px;width:44px;height:44px;display:inline-flex;align-items:center;justify-content:center;border:0;background:transparent;color:var(--color-svv-muted);opacity:.55;font-size:1rem;line-height:1;cursor:grab;touch-action:none}
.svv-grille-poignee:hover,.svv-grille-poignee:focus-visible{opacity:1;color:var(--color-svv-ink)}
.svv-grille-poignee:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-4px;border-radius:8px}
.svv-grille-poignee:active{cursor:grabbing}
.svv-grille-erreur{margin:0 0 .6rem;font-size:.85rem;font-weight:600;color:var(--color-svv-red)}
`;
