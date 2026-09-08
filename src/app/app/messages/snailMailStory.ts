export type SnailMailStoryLetter = {
  letter_status?: string | null;
  transport_mode?: string | null;
  story_variant?: number | null;
};

const LOST_IN_TRANSIT_COPY: Record<string, string[]> = {
  sea_mail: [
    "A seagull appears to have made off with this letter.",
    "The letter seems to have gone overboard somewhere along the route.",
  ],
  rail: [
    "The letter boarded the wrong train and has not been seen since.",
    "This letter took an unexpected railway journey and never found its way back.",
  ],
  air_mail: [
    "The letter disappeared somewhere between baggage handling and common sense.",
    "Airport sorting appears to have claimed another victim.",
  ],
  rare_pigeon: [
    "The pigeon changed course before the handoff.",
    "The pigeon has not reported back from the journey.",
  ],
  default: [
    "Lost in transit. Somewhere, a sorting office has questions to answer.",
    "This letter never made it to its destination.",
  ],
};

export function isLostInTransit(letter: SnailMailStoryLetter | null | undefined) {
  return letter?.letter_status === "lost_in_transit";
}

export function hasSnailMailArrived(letter: SnailMailStoryLetter & { deliver_at: string; delivered_at: string | null }, now: number) {
  // The projection opens letters at their ETA, even before the worker records
  // delivered_at. This is presentation only; lifecycle writes stay server-side.
  return !isLostInTransit(letter) && Boolean(letter.delivered_at || new Date(letter.deliver_at).getTime() <= now);
}

export function lostInTransitCopy(letter: SnailMailStoryLetter) {
  const variants = LOST_IN_TRANSIT_COPY[letter.transport_mode ?? ""] ?? LOST_IN_TRANSIT_COPY.default;
  const numericVariant = Number(letter.story_variant ?? 0);
  const variant = Number.isFinite(numericVariant) ? Math.abs(Math.trunc(numericVariant)) % variants.length : 0;
  return variants[variant];
}
