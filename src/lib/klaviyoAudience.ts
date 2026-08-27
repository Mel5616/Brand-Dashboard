// Pure data — no server-only imports — so this is safe to use from both API
// routes and client components. The OOS Report always goes to this exact
// audience, mirroring Mel's saved "CK-Wholesale-OOS Report_2026" campaign
// audience in Klaviyo. Ids resolved directly from the account (a mix of
// lists and segments; Klaviyo doesn't distinguish the two here). Update if
// the saved audience in Klaviyo changes.
export const OOS_REPORT_AUDIENCE = {
  name: "CK-Wholesale-OOS Report_2026",
  included: [
    { id: "UUHRpp", name: "SEEDS - [Marketing Comms] Coolkidz Staff AND Reps" },
    { id: "UVJwCH", name: "Online Wholesale (ex Childcare Centres)" },
    { id: "VhcN5y", name: "Wholesale" },
  ],
  excluded: [
    { id: "TS83bA", name: "CK-Wholesale-Marketing-List" },
    { id: "UBeyuU", name: "CK - Wholesale DNS OOS" },
    { id: "VEkRHD", name: "UNSUBSCRIBES" },
    { id: "WK3NjN", name: "CK - Banana Baby Exclusion Send List" },
    { id: "WsGH6x", name: "Bounce Emails" },
  ],
};
