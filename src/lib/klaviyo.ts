// Thin Klaviyo API client. Every "create" here is a real, live call against
// the account — there is no sandbox — so callers must be deliberate about
// what triggers an actual send (only sendJob does).
const BASE = "https://a.klaviyo.com/api";
const REVISION = "2024-10-15";

function headers() {
  return {
    Authorization: `Klaviyo-API-Key ${process.env.KLAVIYO_API_KEY}`,
    revision: REVISION,
    "Content-Type": "application/json",
  };
}

async function call(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: headers(), cache: "no-store" });
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
}): Promise<{ campaignId: string; messageId: string }> {
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
  });
  const campaignId = camp.data.id;
  const messageId = camp.data.relationships["campaign-messages"].data[0].id;

  const tpl = await call("/templates/", {
    method: "POST",
    body: JSON.stringify({ data: { type: "template", attributes: { name: `${opts.name} — template`, editor_type: "CODE", html: opts.html } } }),
  });

  await call("/campaign-message-assign-template/", {
    method: "POST",
    body: JSON.stringify({ data: { type: "campaign-message", id: messageId, relationships: { template: { data: { type: "template", id: tpl.data.id } } } } }),
  });

  return { campaignId, messageId };
}

// Schedule (or immediately send, if datetime is omitted) a Draft campaign
// created above. This is the ONLY call that actually queues a real send —
// callers must get explicit confirmation before invoking it.
export async function scheduleSend(campaignId: string, datetimeIso?: string): Promise<void> {
  if (datetimeIso) {
    await call(`/campaigns/${campaignId}/`, {
      method: "PATCH",
      body: JSON.stringify({ data: { type: "campaign", id: campaignId, attributes: { send_strategy: { method: "static", options_static: { datetime: datetimeIso, is_local: false } } } } }),
    });
  }
  await call("/campaign-send-jobs/", {
    method: "POST",
    body: JSON.stringify({ data: { type: "campaign-send-job", id: campaignId } }),
  });
}

export async function cancelCampaign(campaignId: string): Promise<void> {
  await call(`/campaigns/${campaignId}/`, { method: "DELETE" });
}

async function ensureProfile(email: string): Promise<string> {
  const found = await call(`/profiles/?filter=${encodeURIComponent(`equals(email,"${email}")`)}`);
  if (found.data?.length) return found.data[0].id;
  const created = await call("/profiles/", { method: "POST", body: JSON.stringify({ data: { type: "profile", attributes: { email } } }) });
  return created.data.id;
}

// Klaviyo's public API has no dedicated "send test email" endpoint (confirmed
// with Klaviyo — not supported as of this writing), so a test send is a real,
// tiny campaign: a one-person list containing only the requester's own
// profile, sent immediately. It shows up in Klaviyo as a real send (by
// design — that's the only way to trigger actual delivery + real rendering),
// just to nobody but the person who asked for it.
export async function sendTestToSelf(opts: { subject: string; fromEmail: string; fromLabel: string; html: string; testEmail: string }): Promise<{ campaignId: string }> {
  const profileId = await ensureProfile(opts.testEmail);
  const listName = `🧪 Dashboard test — ${opts.testEmail}`;
  const list = await call("/lists/", { method: "POST", body: JSON.stringify({ data: { type: "list", attributes: { name: listName, opt_in_process: "single_opt_in" } } }) });
  const listId = list.data.id;
  await call(`/lists/${listId}/relationships/profiles/`, { method: "POST", body: JSON.stringify({ data: [{ type: "profile", id: profileId }] }) });
  const { campaignId } = await createDraftCampaign({ name: `[TEST] ${opts.subject}`, included: [listId], subject: `[TEST] ${opts.subject}`, fromEmail: opts.fromEmail, fromLabel: opts.fromLabel, html: opts.html });
  await scheduleSend(campaignId);
  return { campaignId };
}

// Opens/clicks for a set of tracked campaign ids, via the values-report API.
// conversion_metric_id is a required field on this endpoint but irrelevant
// to us — any valid metric id satisfies it.
export async function campaignStats(campaignIds: string[]): Promise<Record<string, { recipients: number; opens: number; opensUnique: number; openRate: number; clicksUnique: number; clickRate: number }>> {
  if (campaignIds.length === 0) return {};
  const metrics = await call("/metrics/?fields[metric]=name");
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
  });
  const out: Record<string, any> = {};
  for (const r of d.data.results) {
    out[r.groupings.campaign_id] = {
      recipients: r.statistics.recipients, opens: r.statistics.opens, opensUnique: r.statistics.opens_unique,
      openRate: r.statistics.open_rate, clicksUnique: r.statistics.clicks_unique, clickRate: r.statistics.click_rate,
    };
  }
  return out;
}
