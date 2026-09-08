import type { ExternalVerificationProviderRegistry } from "@/lib/verification/providers";
import { facebookVerificationAdapter } from "@/lib/verification/providers/facebook";
import { googleVerificationAdapter } from "@/lib/verification/providers/google";
import { instagramVerificationAdapter } from "@/lib/verification/providers/instagram";
import { tiktokVerificationAdapter } from "@/lib/verification/providers/tiktok";

/**
 * The approved adapters are registered server-side only. A provider remains
 * unavailable until its database policy is explicitly enabled by an admin.
 */
export const approvedExternalVerificationProviders: ExternalVerificationProviderRegistry = {
  facebook: facebookVerificationAdapter,
  instagram: instagramVerificationAdapter,
  tiktok: tiktokVerificationAdapter,
  google: googleVerificationAdapter,
};

export function getExternalVerificationProvider(provider: string) {
  return approvedExternalVerificationProviders[provider.toLowerCase()];
}
