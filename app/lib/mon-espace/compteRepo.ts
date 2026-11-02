// 🔴 MON ESPACE — le compte qui agit : administrateur ou non (relu en base). Un module à part : la création, les apporteurs et les gestes s'en
// servent sans s'importer les uns les autres. LECTURE SEULE.
import { query } from '../db/client';

export async function estAdministrateur(compteId: number): Promise<boolean> {
  const { rows } = await query<{ role: string }>('SELECT role FROM admin_utilisateur WHERE id = $1', [compteId]);
  return rows[0]?.role === 'administrateur';
}
