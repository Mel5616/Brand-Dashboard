// Thin Klaviyo API client. Every "create" here is a real, live call against
// the account — there is no sandbox — so callers must be deliberate about
// what triggers an actual send (only sendJob does).
const BASE = "https://a.klaviyo.com/api";
const REVISION = "2024-10-15";

function headers(apiKey?: string) {
  return {
    Authorization: `Klaviyo-API-Key ${apiKey || process.env.KLAVIYO_API_KEY}`,
    revision: REVISION,
    "Content-Type": "application/json",
  };
}

async function call(path: string, init?: RequestInit, apiKey?: string) {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: headers(apiKey), cache: "no-store" });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = body?.errors?.map((e: any) => e.detail).join("; ") || res.statusText;
    throw new Error(msg);
  }
  return body;
}

export async function listLists(): Promise<{ id: string; name: string }[]> {
  const out: { id: string; name: string }[] = [];
  let path = "/lists/?fields[list]=name";
  while (path) {
    const d = await call(path);
    out.push(...d.data.map((l: any) => ({ id: l.id, name: l.attributes.name })));
    path = d.links?.next ? d.links.next.replace(BASE, "") : "";
  }
  return out;
}

// Create a Draft campaign + email message with our HTML content, scoped to
// an audience of included/excluded list and/or segment ids (Klaviyo doesn't
// distinguish the two in this field — same flat id array either way). Does
// NOT send or schedule anything — that's a separate, explicit step
// (sendJob) so a create can never accidentally fire an email.
export async function createDraftCampaign(opts: {
  name: string; included: string[]; excluded?: string[]; subject: string; fromEmail: string; fromLabel: string; html: string;
}, apiKey?: string): Promise<{ campaignId: string; messageId: string }> {
  const camp = await call("/campaigns/", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "campaign",
        attributes: {
          name: opts.name,
          audiences: { included: opts.included, excluded: opts.excluded ?? [] },
          send_strategy: { method: "immediate" },
          "campaign-messages": {
            data: [{
              type: "campaign-message",
              attributes: {
                channel: "email",
                label: opts.name,
                content: { subject: opts.subject, preview_text: "", from_email: opts.fromEmail, from_label: opts.fromLabel },
              },
            }],
          },
        },
      },
    }),
  }, apiKey);
  const campaignId = camp.data.id;
  const messageId = camp.data.relationships["campaign-messages"].data[0].id;

  const tpl = await call("/templates/", {
    method: "POST",
    body: JSON.stringify({ data: { type: "template", attributes: { name: `${opts.name} — template`, editor_type: "CODE", html: opts.html } } }),
  }, apiKey);

  await call("/campaign-message-assign-template/", {
    method: "POST",
    body: JSON.stringify({ data: { type: "campaign-message", id: messageId, relationships: { template: { data: { type: "template", id: tpl.data.id } } } } }),
  }, apiKey);

  return { campaignId, messageId };
}

// Schedule (or immediately send, if datetime is omitted) a Draft campaign
// created above. This is the ONLY call that actually queues a real send —
// callers must get explicit confirmation before invoking it.
export async function scheduleSend(campaignId: string, datetimeIso?: string, apiKey?: string): Promise<void> {
  if (datetimeIso) {
    await call(`/campaigns/${campaignId}/`, {
      method: "PATCH",
      body: JSON.stringify({ data: { type: "campaign", id: campaignId, attributes: { send_strategy: { method: "static", options_static: { datetime: datetimeIso, is_local: false } } } } }),
    }, apiKey);
  }
  await call("/campaign-send-jobs/", {
    method: "POST",
    body: JSON.stringify({ data: { type: "campaign-send-job", id: campaignId } }),
  }, apiKey);
}

export async function cancelCampaign(campaignId: string, apiKey?: string): Promise<void> {
  await call(`/campaigns/${campaignId}/`, { method: "DELETE" }, apiKey);
}

export async function ensureProfile(email: string, firstName?: string, apiKey?: string): Promise<string> {
  const found = await call(`/profiles/?filter=${encodeURIComponent(`equals(email,"${email}")`)}`, undefined, apiKey);
  if (found.data?.length) return found.data[0].id;
  const created = await call("/profiles/", { method: "POST", body: JSON.stringify({ data: { type: "profile", attributes: { email, ...(firstName ? { first_name: firstName } : {}) } } }) }, apiKey);
  return created.data.id;
}

// Set custom profile properties (e.g. a per-recipient discount code) so a
// campaign's HTML can reference them via Klaviyo Liquid ({{ person.foo }})
// and have each recipient see their own value in the same send.
export async function setProfileProperties(profileId: string, properties: Record<string, string>, apiKey?: string): Promise<void> {
  await call(`/profiles/${profileId}/`, {
    method: "PATCH",
    body: JSON.stringify({ data: { type: "profile", id: profileId, attributes: { properties } } }),
  }, apiKey);
}

// Build a one-off Klaviyo list containing exactly this set of recipients —
// generalizes the single-person list sendTestToSelf() builds below to N
// people, for a batch send to a specific ad-hoc customer list rather than an
// existing saved list/segment (e.g. the abandoned-cart win-back tool).
export async function buildAdhocList(name: string, recipients: { email: string; name?: string; properties?: Record<string, string> }[], apiKey?: string): Promise<string> {
  const list = await call("/lists/", { method: "POST", body: JSON.stringify({ data: { type: "list", attributes: { name, opt_in_process: "single_opt_in" } } }) }, apiKey);
  const listId = list.data.id;
  const profileIds: string[] = [];
  for (const r of recipients) {
    const profileId = await ensureProfile(r.email, r.name, apiKey);
    if (r.properties) await setProfileProperties(profileId, r.properties, apiKey);
    profileIds.push(profileId);
  }
  if (profileIds.length > 0) {
    await call(`/lists/${listId}/relationships/profiles/`, {
      method: "POST",
      body: JSON.stringify({ data: profileIds.map(id => ({ type: "profile", id })) }),
    }, apiKey);
  }
  return listId;
}

// Klaviyo's public API has no dedicated "send test email" endpoint (confirmed
// with Klaviyo — not supported as of this writing), so a test send is a real,
// tiny campaign: a one-person list containing only the requester's own
// profile, sent immediately. It shows up in Klaviyo as a real send (by
// design — that's the only way to trigger actual delivery + real rendering),
// just to nobody but the person who asked for it.
export async function sendTestToSelf(opts: { subject: string; fromEmail: string; fromLabel: string; html: string; testEmail: string }, apiKey?: string): Promise<{ campaignId: string }> {
  const profileId = await ensureProfile(opts.testEmail, undefined, apiKey);
  const listName = `🧪 Dashboard test — ${opts.testEmail}`;
  const list = await call("/lists/", { method: "POST", body: JSON.stringify({ data: { type: "list", attributes: { name: listName, opt_in_process: "single_opt_in" } } }) }, apiKey);
  const listId = list.data.id;
  await call(`/lists/${listId}/relationships/profiles/`, { method: "POST", body: JSON.stringify({ data: [{ type: "profile", id: profileId }] }) }, apiKey);
  const { campaignId } = await createDraftCampaign({ name: `[TEST] ${opts.subject}`, included: [listId], subject: `[TEST] ${opts.subject}`, fromEmail: opts.fromEmail, fromLabel: opts.fromLabel, html: opts.html }, apiKey);
  await scheduleSend(campaignId, undefined, apiKey);
  return { campaignId };
}

// Opens/clicks for a set of tracked campaign ids, via the values-report API.
// conversion_metric_id is a required field on this endpoint but irrelevant
// to us — any valid metric id satisfies it.
export async function campaignStats(campaignIds: string[], apiKey?: string): Promise<Record<string, { recipients: number; opens: number; opensUnique: number; openRate: number; clicksUnique: number; clickRate: number }>> {
  if (campaignIds.length === 0) return {};
  const metrics = await call("/metrics/?fields[metric]=name", undefined, apiKey);
  const conversionMetricId = metrics.data[0]?.id;
  if (!conversionMetricId) return {};
  const filter = `any(campaign_id,[${campaignIds.map(id => `"${id}"`).join(",")}])`;
  const d = await call("/campaign-values-reports/", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "campaign-values-report",
        attributes: {
          timeframe: { key: "last_365_days" },
          conversion_metric_id: conversionMetricId,
          statistics: ["opens", "opens_unique", "recipients", "open_rate", "click_rate", "clicks_unique"],
          filter,
        },
      },
    }),
  }, apiKey);
  const out: Record<string, any> = {};
  for (const r of d.data.results) {
    out[r.groupings.campaign_id] = {
      recipients: r.statistics.recipients, opens: r.statistics.opens, opensUnique: r.statistics.opens_unique,
      openRate: r.statistics.open_rate, clicksUnique: r.statistics.clicks_unique, clickRate: r.statistics.click_rate,
    };
  }
  return out;
}
