import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * CAUSE RÉELLE du « la proposition IA n'apparaît pas » (dossier 468) : ce n'était PAS le repli permis→corps (présent et prouvé par
 * CaracteristiquesBloc.propositionIA.test.ts), mais un DÉFAUT DE RAFRAÎCHISSEMENT. L'« analyse de la page » (LiseusePieces.analyserPage
 * → lire_valeurs_page) écrit la valeur IA au niveau permis, mais `BlocRepliable` ne DÉMONTE jamais un enfant déjà ouvert : le
 * `CaracteristiquesBloc` co-monté garde un journal PÉRIMÉ et n'affiche pas la proposition. `vAnalyse`/`vApresAnalyse` ne se bumpaient
 * que sur le DIAGNOSTIC COMPLET, jamais sur une analyse de PAGE. Correctif : LiseusePieces émet `onValeurEcrite` (écriture/annulation),
 * les parents re-fetchent SEULEMENT le bloc via un compteur DÉDIÉ (jamais dans la clé de la liseuse → le lecteur ne bouge pas).
 *
 * GARDE PAR LECTURE DE SOURCE : ces composants clients sont lourds (pdf.js, effets) et non montables unitairement ici — on verrouille
 * donc le CÂBLAGE, pas la forme d'un SQL. (Le comportement de la proposition elle-même est prouvé par montage dans l'autre fichier.)
 */
const lire = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const LISEUSE = lire('./LiseusePieces.tsx');
const TRACE = lire('./BlocTraceEmprise.tsx');
const PROJECTION = lire('./ProjectionVue.tsx');
const SUIVI = lire('./SuiviDemandes.tsx');

describe('LiseusePieces — signale une valeur lue/annulée par « analyse de la page »', () => {
  it('expose la prop optionnelle onValeurEcrite', () => {
    expect(LISEUSE).toContain('onValeurEcrite?: () => void');
  });
  it('la déclenche APRÈS une écriture réussie (ecrit === true), jamais sur un simple échec/aucune valeur', () => {
    expect(LISEUSE).toContain('if (body.resume?.ecrit === true) onValeurEcrite?.();');
  });
  it('la déclenche APRÈS une annulation effective (annule === true) → la proposition disparaît', () => {
    expect(LISEUSE).toContain('if (body.annule === true) onValeurEcrite?.();');
  });
});

describe('BlocTraceEmprise — repasse le signal de sa liseuse embarquée au parent (canvas/tracé intouché)', () => {
  it('accepte onValeurLue et le branche sur onValeurEcrite de la liseuse embarquée', () => {
    expect(TRACE).toContain('onValeurLue?: () => void');
    expect(TRACE).toContain('<LiseusePieces dossierId={dossierId} onValeurEcrite={onValeurLue} donneesPrechargees={donneesLiseuse} titreEnEntete />'); // P3 — donnée /emprise partagée (anti-doublon) ; LOT 3a — titre en en-tête (layout 2 colonnes)
  });
});

describe('les parents re-fetchent CaracteristiquesBloc via un compteur DÉDIÉ (le lecteur ne bouge pas)', () => {
  it('ProjectionVue : vValeurLue est dans la clé du bloc, PAS dans celle de la liseuse (embarquée via BlocTraceEmprise)', () => {
    expect(PROJECTION).toContain('const [vValeurLue, setVValeurLue] = useState(0)');
    expect(PROJECTION).toContain('key={`carac-${ouvert}-${vAnalyse}-${vValeurLue}-${vEmprise}`}');
    expect(PROJECTION).toContain('onValeurLue={() => setVValeurLue((v) => v + 1)}');
  });
  it('SuiviDemandes : vValeurLue remonte le bloc mais PAS la liseuse standalone (sa clé garde le seul vApresAnalyse)', () => {
    expect(SUIVI).toContain('const [vValeurLue, setVValeurLue] = useState(0)');
    expect(SUIVI).toContain('key={`carac-enc-${id}-${vApresAnalyse}-${vValeurLue}-${vEmprise}`}');
    expect(SUIVI).toContain('key={`liseuse-enc-${id}-${vApresAnalyse}`} dossierId={id} onValeurEcrite={() => setVValeurLue((v) => v + 1)}');
  });
});
