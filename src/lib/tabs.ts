// Single source of truth for dashboard sections — drives the sidebar group order,
// the Users access picker, and access validation so they can never drift.
// (Pure data, no server imports, so client components can use it too.)

export type TabId = string;
export type TabDef = { id: string; label: string };
export type TabSection = { label: string; tabs: TabDef[] };

// Order here = the order of the blue-heading groups in the sidebar.
export const TAB_SECTIONS: TabSection[] = [
  { label: "Overview", tabs: [
    { id: "brands", label: "Business Overview" },
    { id: "summary", label: "Portfolio Summary" },
    { id: "insights", label: "Insights" },
  ] },
  { label: "Reports", tabs: [
    { id: "report", label: "Budget vs Actuals" },
    { id: "snapshot", label: "Brand Snapshot" },
    { id: "social-report", label: "Social Report" },
    { id: "uppababy", label: "UPPAbaby" },
  ] },
  { label: "Revenue & Channels", tabs: [
    { id: "sales", label: "Sales by Channel" },
    { id: "sales-budget", label: "Sales Budget" },
    { id: "baby-bunting", label: "Baby Bunting" },
    { id: "shopify", label: "Shopify" },
    { id: "tradeshows", label: "Tradeshows" },
  ] },
  { label: "Plan", tabs: [
    { id: "show-deals", label: "Tradeshow Deals" },
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
    { id: "product-info", label: "Product Information" },
  ] },
  { label: "Paid", tabs: [
    { id: "google-ads", label: "Google Ads" },
    { id: "meta-ads", label: "Meta Ads" },
    { id: "pinterest-ads", label: "Pinterest Ads" },
  ] },
  { label: "Owned & Earned", tabs: [
    { id: "email", label: "Email" },
    { id: "seo", label: "SEO" },
    { id: "social", label: "Social" },
    { id: "influencer", label: "Influencer Budget" },
    { id: "gifting", label: "Influencer Tracker" },
    { id: "pa-budget", label: "Partnerships Budget" },
    { id: "pa-tracker", label: "Partnerships Tracker" },
  ] },
];

// Every grantable section id, in sidebar order.
export const ALL_TABS: string[] = TAB_SECTIONS.flatMap(s => s.tabs.map(t => t.id));

// All sections can be granted to Management (view-only); editing/upload/export
// actions stay admin-gated inside each section. Nothing is hard-locked here.
export const ADMIN_ONLY_TABS: string[] = [];
