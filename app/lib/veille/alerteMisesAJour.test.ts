import { describe, it, expect } from 'vitest';
import {
  executerAlerteMisesAJour, composerAlerteMaj, empreinteDe, commandeProtocole, espaceDisqueProtocole,
  type DepsAlerteMaj, type SourceEnAttente,
} from './alerteMisesAJour';
import { construireAffichageProtocoles } from '../admin/protocolesReingestion';

/**
 * FRAÎCHEUR / G4 — alerte e-mail (le lot qui ENVOIE). Prouve : interrupteur off → rien ; liste vide → rien ; 1re apparition →
 * un envoi ; même liste → rien ; ajout → nouvel envoi ; disparition → pas d'envoi mais empreinte mise à jour ; échec → empreinte
 * NON marquée + erreur journalisée. Et le CONTENU : la commande vient du parseur F5 ; une source automatisée n'en porte aucune.
 */

const SRC = (cle: string, automatisee = false): SourceEnAttente => ({
  cle, nom: cle.toUpperCase(), millesimeBase: '2026-07', editionDistante: '2026-08',
  automatisee, commande: automatisee ? null : `cd /x\nnpm run ${cle}:ingest`, espaceDisque: automatisee ? null : 'ESPACE DISQUE REQUIS : ~50 Mo.',
});

interface Calls { envoyer: string[]; maj: string[]; journal: { resultat: string; erreur: string | null }[] }
function faux(over: Partial<DepsAlerteMaj> = {}): { deps: DepsAlerteMaj; calls: Calls } {
  const calls: Calls = { envoyer: [], maj: [], journal: [] };
  const deps: DepsAlerteMaj = {
    config: async () => ({ active: true, email: 'admin@svav.fr' }),
    empreintePrecedente: async () => null,
    enAttente: async () => [SRC('dila')],
    majEmpreinte: async (e) => { calls.maj.push(e); },
    journaliser: async (_e, _d, _s, resultat, erreur) => { calls.journal.push({ resultat, erreur }); },
    envoyer: async (_d, _s, corps) => { calls.envoyer.push(corps); },
    ...over,
  };
  return { deps, calls };
}

describe('executerAlerteMisesAJour — anti-spam', () => {
  it('interrupteur DÉSACTIVÉ → aucun envoi', async () => {
    const f = faux({ config: async () => ({ active: false, email: 'admin@svav.fr' }) });
    expect((await executerAlerteMisesAJour(f.deps)).issue).toBe('desactive');
    expect(f.calls.envoyer).toEqual([]);
    expect(f.calls.maj).toEqual([]);
  });

  it('pas de destinataire → aucun envoi', async () => {
    const f = faux({ config: async () => ({ active: true, email: '' }) });
    expect((await executerAlerteMisesAJour(f.deps)).issue).toBe('sans_email');
    expect(f.calls.envoyer).toEqual([]);
  });

  it('liste VIDE → aucun envoi (jamais)', async () => {
    const f = faux({ enAttente: async () => [], empreintePrecedente: async () => null });
    expect((await executerAlerteMisesAJour(f.deps)).issue).toBe('liste_vide');
    expect(f.calls.envoyer).toEqual([]);
  });

  it('PREMIÈRE apparition → UN envoi, empreinte marquée, journal « envoyee »', async () => {
    const f = faux(); // dila, aucune empreinte précédente
    expect((await executerAlerteMisesAJour(f.deps)).issue).toBe('envoye');
    expect(f.calls.envoyer).toHaveLength(1);
    expect(f.calls.maj).toEqual(['dila']);
    expect(f.calls.journal).toEqual([{ resultat: 'envoyee', erreur: null }]);
  });

  it('MÊME liste au tick suivant → AUCUN envoi', async () => {
    const f = faux({ empreintePrecedente: async () => 'dila' });
    expect((await executerAlerteMisesAJour(f.deps)).issue).toBe('inchange');
    expect(f.calls.envoyer).toEqual([]);
  });

  it('une source S’AJOUTE → nouvel envoi', async () => {
    const f = faux({ enAttente: async () => [SRC('dila'), SRC('prada')], empreintePrecedente: async () => 'dila' });
    expect((await executerAlerteMisesAJour(f.deps)).issue).toBe('envoye');
    expect(f.calls.envoyer).toHaveLength(1);
    expect(f.calls.maj).toEqual(['dila|prada']);
  });

  it('une source DISPARAÎT → aucun envoi MAIS empreinte mise à jour', async () => {
    const f = faux({ enAttente: async () => [SRC('dila')], empreintePrecedente: async () => 'dila|prada' });
    expect((await executerAlerteMisesAJour(f.deps)).issue).toBe('absorbe');
    expect(f.calls.envoyer).toEqual([]);
    expect(f.calls.maj).toEqual(['dila']); // empreinte absorbée → un retour de prada ré-alertera
  });

  it('ÉCHEC d’envoi → empreinte NON marquée, erreur COMPLÈTE journalisée, pas de perte', async () => {
    const f = faux({ envoyer: async () => { throw new Error('SMTP 535 auth refusée'); } });
    expect((await executerAlerteMisesAJour(f.deps)).issue).toBe('echec');
    expect(f.calls.maj).toEqual([]); // empreinte NON marquée → réessai au prochain tick
    expect(f.calls.journal).toEqual([{ resultat: 'erreur', erreur: 'SMTP 535 auth refusée' }]);
  });
});

describe('composerAlerteMaj — contenu (le mail ne doit pas mentir)', () => {
  it('sujet : marqueur interne + nombre (distinct d’une relance mairie)', () => {
    const { sujet } = composerAlerteMaj([SRC('dila'), SRC('prada')]);
    expect(sujet).toContain('[Données SVAV]');
    expect(sujet).toContain('2 base');
  });

  it('source à faire : la COMMANDE affichée est CELLE PASSÉE (venue du parseur F5), + espace disque', () => {
    const cmd = 'cd /Users/x/app\nset -a && source .env && set +a\nnpm run dila:ingest';
    const { corps } = composerAlerteMaj([{ cle: 'dila', nom: 'DILA', millesimeBase: '2026-08-03', editionDistante: '2026-08-21', automatisee: false, commande: cmd, espaceDisque: 'ESPACE DISQUE REQUIS : ~360 Mo.' }]);
    expect(corps).toContain('npm run dila:ingest');
    expect(corps).toContain('source .env');
    expect(corps).toContain('ESPACE DISQUE REQUIS : ~360 Mo.');
  });

  it('source AUTOMATISÉE → mention « s’ingérera d’elle-même », AUCUNE commande', () => {
    const { corps } = composerAlerteMaj([SRC('cadastre', true)]);
    expect(corps).toContain('s’ingérera d’elle-même');
    expect(corps).not.toContain('npm run');
  });

  it('TOUTES automatisées → message informatif, aucune tâche à faire', () => {
    const { corps } = composerAlerteMaj([SRC('dila', true), SRC('prada', true)]);
    expect(corps).toContain('Rien à faire de votre part');
    expect(corps).not.toContain('npm run');
  });
});

describe('extraction depuis le parseur F5 (source unique, jamais réécrite)', () => {
  const PROTOS = [
    '<!-- SOURCE: dila -->', '## DILA', 'ESPACE DISQUE REQUIS : ~360 Mo.', '```bash', 'cd /x', 'npm run dila:ingest', '```',
    '<!-- SOURCE: lidar -->', '## LiDAR HD', 'CAS (c) aucune procédure connue.',
  ].join('\n');
  const proto = () => construireAffichageProtocoles(PROTOS, [{ cle: 'dila', nom: 'DILA' }, { cle: 'lidar', nom: 'LiDAR HD' }]);

  it('commandeProtocole lit le bloc F5 ; espaceDisqueProtocole lit la ligne F5', () => {
    expect(commandeProtocole(proto(), 'dila')).toContain('npm run dila:ingest');
    expect(espaceDisqueProtocole(proto(), 'dila')).toContain('ESPACE DISQUE REQUIS');
  });
  it('source cas (c) sans commande → null', () => {
    expect(commandeProtocole(proto(), 'lidar')).toBeNull();
  });
  it('empreinteDe : cles triées, jointes', () => {
    expect(empreinteDe(['prada', 'dila'])).toBe('dila|prada');
    expect(empreinteDe([])).toBe('');
  });
});
