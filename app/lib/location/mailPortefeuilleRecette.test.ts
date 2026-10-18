import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dedoublonner } from './mailPortefeuilleRepo';
import { transportFactice, transportParDefaut, transportReel } from '../gestion/envoiDemandeTache';
import { decisionRecette } from '../recette/interception';

/**
 * Les mails d'entrée / sortie du portefeuille (Arno, 18/10/2026) — AUCUN envoi réel hors production :
 *   · sous les tests, le transport est TOUJOURS factice ;
 *   · en RECETTE, le canal (API Gmail de gestion@, celui des mails de tâches) passe par le `fetch` global, que le verrou
 *     de la recette intercepte (dépôt dans la boîte de test) ;
 *   · les destinataires sont dédoublonnés (casse ignorée), les adresses invalides écartées.
 */
describe('mail de portefeuille : destinataires et verrou de la recette', () => {
  it('destinataires dédoublonnés, casse ignorée, adresses invalides écartées', () => {
    expect(dedoublonner(['Arno@Exemple.test', 'arno@exemple.test', null, '', 'pas-une-adresse', 'b@exemple.test', 'B@exemple.test']))
      .toEqual(['arno@exemple.test', 'b@exemple.test']);
  });

  it('sous les tests : toujours le transport factice ; ailleurs : le transport réel (API Gmail)', () => {
    expect(transportParDefaut({ VITEST: 'true' })).toBe(transportFactice);
    expect(transportParDefaut({ NODE_ENV: 'development' })).toBe(transportReel);
  });

  it('en recette, un envoi par l’API Gmail est intercepté (simulé, rangé dans la boîte de test) — aucun envoi réel', () => {
    expect(decisionRecette('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', 'POST', 'x')).toMatchObject({ action: 'simuler', canal: 'gmail_envoi' });
    expect(decisionRecette('https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=multipart', 'POST', 'x'))
      .toMatchObject({ action: 'simuler', canal: 'gmail_envoi' });
  });

  it('le dépôt envoie par ce canal seulement (aucun SMTP, aucun fetch direct), après l’écriture et sans jamais lever', () => {
    const src = readFileSync('app/lib/location/mailPortefeuilleRepo.ts', 'utf8');
    expect(src).toContain('transportParDefaut()');
    expect(src).not.toMatch(/nodemailer|obtenirTransporteur|\bfetch\(/);
    // `avecMail` n'est appelé qu'après une issue « ok », et ne touche pas à l'issue elle-même (jamais bloquant).
    expect(src).toContain("if (issue.etat !== 'ok' || ev === null || ev.lotIds.length === 0) return issue;");
    const routes = ['app/(admin)/api/admin/location/route.ts', 'app/(admin)/api/admin/gestion/annuaire/location/route.ts'].map((f) => readFileSync(f, 'utf8'));
    expect(routes[0]).toContain("tuile: 'Location' as const");
    expect(routes[1]).toContain("tuile: 'Gestion' as const");
  });
});
