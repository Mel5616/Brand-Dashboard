// Single source of truth for dashboard sections — drives the sidebar group order,
// the Users access picker, and access validation so they can never drift.
// (Pure data, no server imports, so client components can use it too.)

export type TabId = string;
export type TabDef = { id: string; label: string };
export type TabSection = { label: string; tabs: TabDef[] };

// Order here = the order of the blue-heading groups in the sidebar.
export const TAB_SECTIONS: TabSection[] = [
  { label: "Overview", tabs: [
    { id: "brands", label: "Portfolio Overview" },
    { id: "insights", label: "Insights" },
    { id: "report", label: "Budget vs Actuals" },
    { id: "snapshot", label: "Brand Snapshot" },
    { id: "uppababy", label: "UPPAbaby" },
  ] },
  { label: "Revenue & Channels", tabs: [
    { id: "sales", label: "Sales" },
    { id: "shopify", label: "Shopify" },
    { id: "tradeshows", label: "Tradeshows" },
  ] },
  { label: "Plan", tabs: [
    { id: "campaign-calendar", label: "Campaigns" },
    { id: "promotions", label: "Promotions" },
    { id: "calendar", label: "Calendar" },
    { id: "content", label: "Briefing Engine" },
    { id: "events", label: "Tune Up Days" },
    { id: "tasks", label: "Blogs" },
    { id: "design-requests", label: "Design Requests" },
  ] },
  { label: "Operations", tabs: [
    { id: "budget", label: "Budget" },
    { id: "new-products", label: "New Products" },
  ] },
  { label: "Paid", tabs: [
    { id: "google-ads", label: "Google Ads" },
    { id: "meta-ads", label: "Meta Ads" },
  ] },
  { label: "Owned & Earned", tabs: [
    { id: "email", label: "Email" },
    { id: "seo", label: "SEO" },
    { id: "social", label: "Social" },
    { id: "influencer", label: "Influencer" },
    { id: "gifting", label: "Gifting" },
  ] },
];

// Every grantable section id, in sidebar order.
export const ALL_TABS: string[] = TAB_SECTIONS.flatMap(s => s.tabs.map(t => t.id));

// Cost / margin sections — admin-only, never shown to members even if granted.
export const ADMIN_ONLY_TABS = ["budget", "influencer", "snapshot", "uppababy"];
