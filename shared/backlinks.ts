// Limits shared by Search & market › Backlinks (client/pages/backlinks.tsx) and its service
// (server/nocoreach/backlinks-service.ts).

/** The most competitors one Link gap lookup compares with: one DataForSEO request each. */
export const GAP_COMPETITORS = 3;
/** OpenSEO's DEFAULT_BACKLINKS_SPAM_THRESHOLD: rows scoring this or more count as spam. */
export const SPAM_THRESHOLD = 40;
