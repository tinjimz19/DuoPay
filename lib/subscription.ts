import type { ProfileStatus } from "@/types/database.types";

export interface SubscriptionFields {
  status: ProfileStatus;
  trial_ends_at: string | null;
  subscription_ends_at: string | null;
}

/**
 * Estado real de la tienda combinando el status guardado con las fechas.
 * Ej: ACTIVE con subscription_ends_at vencida => EXPIRED.
 */
export function getEffectiveStatus(profile: SubscriptionFields): ProfileStatus {
  const now = Date.now();

  if (profile.status === "TRIAL") {
    if (!profile.trial_ends_at || new Date(profile.trial_ends_at).getTime() <= now) {
      return "EXPIRED";
    }
    return "TRIAL";
  }

  if (profile.status === "ACTIVE") {
    if (
      !profile.subscription_ends_at ||
      new Date(profile.subscription_ends_at).getTime() <= now
    ) {
      return "EXPIRED";
    }
    return "ACTIVE";
  }

  return profile.status;
}

export function daysLeft(date: string | null): number | null {
  if (!date) return null;
  const diff = new Date(date).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}
