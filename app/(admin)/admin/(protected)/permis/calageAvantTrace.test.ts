import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { accesTrace } from './TraceEmpriseRendu';

/**
 * LOT « calage avant tracé » — VERROU. Règle métier d'Arno : on ne PEUT PAS dessiner le polygone avant d'avoir calé la vue — sans calage,
 * le tracé n'a aucune référence géographique (emprise fausse mais enregistrable). Le calage est de SESSION (jamais retenu d'une fois à
 * l'autre) et valable POUR UNE SEULE PAGE → invalidé dès qu'on change de page. Ce filet verrouille (1) la DÉCISION PURE d'accès au tracé et
 * (2) le CÂBLAGE dans le composant client (non montable unitairement : garde par lecture de source, comme les autres filets du module) :
 * le mode 'trace' est inatteignable sans calage complet, et le calage est vidé au changement de page.
 */
describe('accesTrace — décision PURE : le tracé n’est accessible qu’après un calage COMPLET (2 paires)', () => {
  it('page non traçable (coupe/façade) → indisponible, motif « non-plan » (le plus AMONT de la hiérarchie)', () => {
    const a = accesTrace(false, 0);
    expect(a.disponible).toBe(false);
    expect(a.motif).toBe('non-plan');
    expect(a.message).toContain('vue en plan');
  });
  it('page en plan, 0 paire → indisponible, motif « calage », message « faites d’abord le calage » (2 paires)', () => {
    const a = accesTrace(true, 0);
    expect(a.disponible).toBe(false);
    expect(a.motif).toBe('calage');
    expect(a.message).toContain('calage');
    expect(a.message).toContain('2 paires');
  });
  it('page en plan, 1 paire posée → toujours indisponible, message PROGRESSIF « (1/2) » (pas un texte figé)', () => {
    const a = accesTrace(true, 1);
    expect(a.disponible).toBe(false);
    expect(a.motif).toBe('calage');
    expect(a.message).toContain('1/2');
  });
  it('page en plan, 2 paires → DISPONIBLE (tracé débloqué), aucun message', () => {
    const a = accesTrace(true, 2);
    expect(a.disponible).toBe(true);
    expect(a.motif).toBe('ok');
    expect(a.message).toBeNull();
  });
  it('page en plan, 3 paires (affinage échelle) → toujours DISPONIBLE', () => {
    expect(accesTrace(true, 3).disponible).toBe(true);
  });
  it('HIÉRARCHIE : « non-plan » l’emporte, même à 2 paires (l’ordre des empêchements est verrouillé)', () => {
    expect(accesTrace(false, 2).motif).toBe('non-plan');
  });
});

describe('BlocTraceEmprise — CÂBLAGE du verrou (garde par lecture de source ; composant client non montable ici)', () => {
  const SRC = readFileSync(fileURLToPath(new URL('./BlocTraceEmprise.tsx', import.meta.url)), 'utf8');
  const norm = SRC.replace(/\s+/g, ' ');

  it('l’accès au tracé DÉRIVE de accesTrace(tracable, paires.length) — état de SESSION, jamais une donnée en base', () => {
    expect(norm).toContain('const acces = accesTrace(tracable, paires.length)');
  });

  it('le mode « trace » n’est ATTEIGNABLE qu’avec calage complet : le bouton « Tracé » cède la place au message quand motif === calage', () => {
    // Bouton Tracé (niveaux 1-2) rendu SEULEMENT hors motif « calage » → un seul chemin vers setMode('trace'), garanti après calage.
    expect(norm).toContain("acces.motif === 'calage' ? ( <span");
    // Entrée niveau 3 : on ne bascule en 'trace' que si le tracé est réellement disponible (sinon consultation).
    expect(norm).toContain("if (acces.disponible) setMode('trace')");
    // La barre du niveau 3 montre les outils de tracé UNIQUEMENT si disponible ; sinon le message d’empêchement.
    expect(norm).toContain('{acces.disponible ? ( <> <button type="button" style={btn} disabled={sommets.length === 0}');
  });

  it('INVALIDATION AU CHANGEMENT DE PAGE : ajustement PENDANT LE RENDU (pattern convergent, pas d’effet) sur la clé (pieceId, page)', () => {
    // la clé du calage courant = pièce + page → dès qu'elle diffère, on vide et on repart à « calage à faire ».
    expect(norm).toContain(':${page}`'); // la clé inclut la page
    expect(norm).toContain('if (clePageTrace !== clePageCourante) {');
    expect(norm).toContain('setClePageTrace(clePageCourante)');
    expect(norm).toContain('if (paires.length) setPaires([])');
    expect(norm).toContain('if (sommets.length) setSommets([])');
    expect(norm).toContain('if (planEnAttente) setPlanEnAttente(null)');
    expect(norm).toContain("if (mode !== 'calage') setMode('calage')");
    // AUCUN setState synchrone dans un effet pour cette invalidation (règle react-hooks/set-state-in-effect) : c'est un ajustement de rendu.
    expect(norm).not.toMatch(/useEffect\(\(\) => \{ setPaires/);
  });
});
