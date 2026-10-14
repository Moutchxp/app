/**
 * CONTRÔLE DES URL PUBLIQUES AU DÉMARRAGE (lot PORTABILITE-ENV).
 *
 * En PRODUCTION, quatre variables doivent désigner une adresse joignable depuis l'extérieur : sinon les liens des
 * mails, des agendas, des alertes et le QR du certificat pointent vers la machine elle-même (cf.
 * `docs/RECON_PORTABILITE_SERVEUR.md` §1 : `GESTION_URL_APPLICATION` et `SVAV_URL_PUBLIQUE` retombent sur
 * `http://localhost:3000` quand elles sont absentes).
 *
 * Rend la liste des AVERTISSEMENTS (vide si tout va bien, ou si `NODE_ENV` ≠ `production`). N'arrête jamais rien, ne
 * lève jamais d'exception, et n'affiche JAMAIS la valeur d'une variable (elle peut porter un identifiant).
 *
 * PUR : aucune base, aucun réseau, aucun import — utilisable par `instrumentation.ts` comme par un script CLI.
 */

export const VARIABLES_URL_PUBLIQUES = [
  'SITE_URL',
  'GESTION_URL_APPLICATION',
  'SVAV_URL_PUBLIQUE',
  'S3_ENDPOINT',
] as const;

const MARQUEURS_LOCAUX = ['localhost', '127.0.0.1'] as const;

export function verifierUrlsPubliques(env: Record<string, string | undefined>): string[] {
  if (env.NODE_ENV !== 'production') return [];
  const messages: string[] = [];
  for (const nom of VARIABLES_URL_PUBLIQUES) {
    const valeur = (env[nom] ?? '').trim();
    if (valeur === '') {
      messages.push(`[config] AVERTISSEMENT : ${nom} est absente ou vide en production — les liens qui en dépendent seront faux ou désactivés.`);
      continue;
    }
    const minuscule = valeur.toLowerCase();
    const marqueur = MARQUEURS_LOCAUX.find((m) => minuscule.includes(m));
    if (marqueur) {
      messages.push(`[config] AVERTISSEMENT : ${nom} contient « ${marqueur} » en production — adresse injoignable depuis l'extérieur.`);
    }
  }
  return messages;
}
