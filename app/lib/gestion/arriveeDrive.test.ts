import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  ANNEE_INCONNUE, ARRIVEE_NOM, CLE_ARRIVEE, cleAnnee, cleMois, MOIS_INCONNU, periodeDe,
} from './arriveeDrive';
import { bornerProprietes, PROPRIETES_MAX, PROPRIETE_MAX_OCTETS } from './copiePiecesReel';

/**
 * LOT DRIVE-2-bis — LE DOSSIER D'ARRIVÉE, LES `appProperties`, ET LES GARANTIES DES NOUVELLES COMMANDES.
 *
 * 🔒 Aucune donnée réelle.
 */

describe('la période d’un mail', () => {
  it('une date ISO donne son année et son mois', () => {
    expect(periodeDe('2024-03-07T10:00:00Z')).toEqual({ annee: '2024', mois: '03' });
    expect(periodeDe('2026-01-31')).toEqual({ annee: '2026', mois: '01' });
  });

  it('une date illisible ne renvoie rien — l’appelant range alors dans « date inconnue »', () => {
    for (const non of ['', 'hier', '07/03/2024', '2024']) expect(periodeDe(non), non).toBeNull();
    expect(ANNEE_INCONNUE).toBe('date inconnue');
    expect(MOIS_INCONNU).toBe('00');
  });

  it('🔴 les clés de période sont PRÉFIXÉES : elles ne doivent pas heurter celles de « 00 Non rattachés »', () => {
    expect(cleAnnee('2024')).toBe('arrivee|2024');
    expect(cleMois('2024', '03')).toBe('arrivee|2024|03');
    // Les périodes du lot précédent s'appelaient « 2024 » et « 2024|03 » : sans préfixe, la clé unique
    // (sorte, cle) les confondrait et la copie déposerait dans « 00 Non rattachés ».
    expect(cleAnnee('2024')).not.toBe('2024');
  });

  it('le dossier d’arrivée a un nom et une clé stables', () => {
    expect(ARRIVEE_NOM).toBe('00 Arrivée des mails');
    expect(CLE_ARRIVEE).toBe('arrivee');
  });
});

describe('🔴 les appProperties sont BORNÉES par Drive — dépasser fait échouer tout l’envoi', () => {
  it('une valeur courte passe telle quelle', () => {
    expect(bornerProprietes({ piece_id: '4242' })).toEqual({ piece_id: '4242' });
  });

  it('🔴 une valeur trop longue est tronquée PROPREMENT, et le dit par une ellipse', () => {
    const b = bornerProprietes({ adresses_echange: Array.from({ length: 40 }, (_, i) => `a${i}@fictif.fr`).join(' ') });
    expect(Buffer.byteLength(`adresses_echange${b.adresses_echange}`, 'utf8')).toBeLessThanOrEqual(PROPRIETE_MAX_OCTETS);
    expect(b.adresses_echange.endsWith('…')).toBe(true);
  });

  it('🔴 la troncature compte des OCTETS mais coupe des CARACTÈRES — un accent ne se coupe pas en deux', () => {
    const b = bornerProprietes({ k: 'é'.repeat(200) });
    expect(Buffer.byteLength(`k${b.k}`, 'utf8')).toBeLessThanOrEqual(PROPRIETE_MAX_OCTETS);
    expect(b.k).not.toContain('�');           // aucun caractère de remplacement
    expect([...b.k].every((c) => c === 'é' || c === '…')).toBe(true);
  });

  it('au-delà de 30 clés, les suivantes sont omises plutôt que de faire échouer l’envoi', () => {
    const beaucoup: Record<string, string> = {};
    for (let i = 0; i < 50; i += 1) beaucoup[`k${i}`] = 'v';
    expect(Object.keys(bornerProprietes(beaucoup))).toHaveLength(PROPRIETES_MAX);
  });

  it('une clé si longue qu’il ne reste pas de place est omise, pas tronquée à vide', () => {
    const b = bornerProprietes({ [`k${'x'.repeat(200)}`]: 'valeur' });
    expect(Object.keys(b)).toHaveLength(0);
  });
});

/** LA MIGRATION 256, éprouvée par sa FORME. */
describe('la migration 256', () => {
  const sql = readFileSync('db/migrations/256_gestion_arrivee_adresses.sql', 'utf8');
  const code = sql.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');

  it('crée les trois tables du lot', () => {
    for (const t of ['gestion_message_adresse', 'gestion_piece_proposition', 'gestion_drive_production']) {
      expect(code, t).toContain(`CREATE TABLE IF NOT EXISTS ${t}`);
    }
  });

  it('🔴 la trace mail couvre TOUS les messages : sa clé étrangère vise gestion_message', () => {
    expect(code).toContain('message_id     bigint      NOT NULL REFERENCES gestion_message(id)');
  });

  it('🔴 les cinq rôles, et eux seuls — « cci » n’en fait pas partie', () => {
    expect(code).toContain("role IN ('expediteur', 'destinataire', 'copie', 'repondre_a', 'transfere')");
    expect(code).not.toContain("'cci'");
  });

  it('l’idempotence du relevé est tenue en base : (message, adresse, rôle) est unique', () => {
    expect(code).toContain('gestion_message_adresse_unique');
    expect(code).toContain('ON gestion_message_adresse (message_id, adresse, role)');
  });

  it('🔴 les propositions sont un HISTORIQUE : aucun index unique sur piece_id', () => {
    expect(code).toContain('CREATE INDEX IF NOT EXISTS gestion_piece_proposition_piece_idx');
    expect(code).not.toMatch(/CREATE UNIQUE INDEX[^;]*gestion_piece_proposition[^;]*\(piece_id\)/);
  });

  it('une proposition « aucune » n’a pas de clé, et une proposition nommée en a une', () => {
    expect(code).toContain("CHECK ((destination_sorte = 'aucune') = (destination_cle IS NULL))");
  });

  it('la sorte « arrivee » est ajoutée SANS retirer les précédentes', () => {
    for (const s of ['racine', 'non_rattaches', 'proprietaires', 'biens', 'proprietaire', 'bien',
      'occupation', 'rubrique', 'en_attente', 'raccourci', 'periode', 'arrivee']) {
      expect(code, s).toContain(`'${s}'`);
    }
  });

  it('élargit le journal du module, sans en retirer aucune entité', () => {
    for (const e of ['message', 'fil', 'evenement', 'affectation', 'regle', 'config', 'releve', 'partenaire',
      'envoi', 'piece_drive', 'compte_google', 'annuaire', 'drive_arbre', 'copie_piece',
      'adresses_messages', 'production_drive']) {
      expect(code, e).toContain(`'${e}'`);
    }
  });

  it('🔒 ne contient aucune donnée, et s’exécute en UNE transaction', () => {
    expect(code).not.toMatch(/INSERT\s+INTO\s+gestion_message_adresse/i);
    expect(code.trimStart().startsWith('BEGIN;')).toBe(true);
    expect(code.trimEnd().endsWith('COMMIT;')).toBe(true);
  });

  it('donne la commande exacte', () => {
    expect(sql).toContain('psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/256_gestion_arrivee_adresses.sql');
  });
});

/** LES COMMANDES : ce qu'elles ne doivent jamais faire. */
describe('🔴 les garanties des commandes du lot', () => {
  const sansCommentaires = (src: string): string => src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n').filter((l) => !l.trimStart().startsWith('//')).join('\n');

  const production = sansCommentaires(readFileSync('app/scripts/empreintes-production-drive.ts', 'utf8'));
  const deplacer = sansCommentaires(readFileSync('app/scripts/deplacer-vers-arrivee.ts', 'utf8'));
  const releve = sansCommentaires(readFileSync('app/scripts/relever-adresses.ts', 'utf8'));
  const reel = sansCommentaires(readFileSync('app/lib/gestion/copiePiecesReel.ts', 'utf8'));

  /**
   * 🔴 MESURÉ le 26/09/2026 : l'inventaire s'est arrêté à 22 000 fichiers sur un `ECONNRESET`. Un parcours d'un
   * quart d'heure doit absorber une connexion qui tombe — sinon une panne d'une seconde coûte tout le travail.
   */
  it('🔴 l’inventaire réessaie les coupures RÉSEAU, pas seulement les codes HTTP', () => {
    expect(reel).toContain('appelerAvecReessai');
    // La branche `catch` du fetch doit réessayer, et non rendre un échec immédiat.
    const bloc = reel.slice(reel.indexOf('async function appelerAvecReessai'));
    expect(bloc.slice(0, bloc.indexOf('if (reponse.ok)'))).toContain('continue;');
    // Et l'inventaire l'emploie, plutôt qu'un `fetch` nu.
    const inv = reel.slice(reel.indexOf('export async function inventorierDossier'));
    expect(inv).toContain('appelerAvecReessai');
    expect(inv.slice(0, inv.indexOf('return { ok: true, fichiers'))).not.toContain('deps.fetch(');
  });

  it('🔒 l’inventaire de production n’émet AUCUNE écriture Drive', () => {
    expect(production).not.toMatch(/method:\s*'(POST|PATCH|PUT|DELETE)'/);
    // Et il ne demande que des métadonnées : jamais `alt=media`, qui téléchargerait le contenu.
    expect(production).not.toContain('alt=media');
  });

  it('🔒 l’inventaire n’enregistre JAMAIS ce dossier dans la liste blanche', () => {
    expect(production).not.toContain('enregistrerNoeud');
    expect(reel).toContain('inventorierDossier');
    // La fonction d'inventaire elle-même n'écrit rien dans l'arbre.
    const bloc = reel.slice(reel.indexOf('export async function inventorierDossier'));
    expect(bloc).not.toContain('enregistrerNoeud');
  });

  it('🔴 le déplacement vérifie les DEUX bouts, et relit le fichier après coup', () => {
    expect(reel).toContain('deplacerFichier');
    expect(reel).toContain('addParents');
    expect(reel).toContain('removeParents');
    expect(deplacer).toContain('relireFichier');
    expect(deplacer).toContain('déplacement NON VÉRIFIÉ');
  });

  it('🔴 le déplacement ne porte QUE sur des fichiers créés par le programme', () => {
    expect(deplacer).toContain("d.origine = 'copie'");
    expect(deplacer).toContain('d.verifie_le IS NOT NULL');
  });

  it('🔴 un refus du garde-fou pendant un déplacement ARRÊTE la commande', () => {
    expect(deplacer).toContain('if (dep.refuse) break;');
  });

  it('le relevé d’adresses n’écrit que dans sa propre table', () => {
    const tables = [...releve.matchAll(/(?:INSERT INTO|UPDATE)\s+(gestion_\w+)/g)].map((m) => m[1]);
    expect(new Set(tables)).toEqual(new Set(['gestion_journal']));
    expect(releve).not.toMatch(/method:\s*'(POST|PATCH|PUT|DELETE)'/);
  });

  it('aucune de ces commandes n’efface quoi que ce soit sur MinIO', () => {
    for (const [nom, src] of [['production', production], ['deplacer', deplacer], ['releve', releve]] as const) {
      const imports = src.match(/import\s*\{[^}]*\}\s*from\s*'[^']*stockage[^']*'/g) ?? [];
      expect(imports, nom).toHaveLength(0);
    }
  });
});
