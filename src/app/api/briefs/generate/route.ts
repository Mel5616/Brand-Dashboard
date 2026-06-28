import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { buildSystemPrompt, createBriefTask, briefToHtmlNotes, BRIEFING_ENGINE_PROJECT, DRAFTED_SECTION_NAME } from "@/lib/briefing";

export const revalidate = 0;

// Draft a compliance-aware brief: load the brand profile, call Claude server-side,
// snapshot the guardrails onto the brief, save as draft, and (if the approval board
// is configured) create the Asana task. Admin only — this spends model tokens.
export async function POST(req: Request) {
  try {
    if ((await getAccess()).role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });
    const { brandSlug, momentId, pillarId, channels, focus, owner, dueDate } = await req.json();
    if (!brandSlug || !momentId || !pillarId || !Array.isArray(channels) || channels.length === 0) {
      return NextResponse.json({ error: "Pick a brand, moment and at least one channel." }, { status: 400 });
    }
    const sb = await createClient();

    const { data: brand } = await sb.from("brand_profiles").select("*").eq("slug", brandSlug).single();
    if (!brand) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

    const p = brand.profile;
    const pillar = p.pillars.find((x: any) => x.id === pillarId);
    const moment = p.moments.find((x: any) => x.id === momentId);
    const selected = p.channels.filter((c: any) => channels.includes(c.id));
    if (!pillar || !moment) return NextResponse.json({ error: "Invalid moment or pillar" }, { status: 400 });

    const system = buildSystemPrompt(brand.name, p, pillar, moment, selected, focus || "");

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1200,
        system,
        messages: [
          { role: "user", content: `Write the brief for the ${moment.name} moment across: ${selected.map((c: any) => c.name).join(", ")}.` },
          { role: "assistant", content: "{" }, // prefill forces clean JSON, no preamble or fences
        ],
      }),
    });
    const aiJson = await aiRes.json();
    if (!aiRes.ok) return NextResponse.json({ error: "Model call failed", detail: aiJson?.error?.message ?? null }, { status: 502 });

    const raw = (aiJson.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("").replace(/```json|```/g, "").trim();
    let gen: any;
    try {
      gen = JSON.parse(raw.startsWith("{") ? raw : "{" + raw);
    } catch {
      return NextResponse.json({ error: "The model returned an unreadable draft. Try again or reduce the channels." }, { status: 502 });
    }

    const deliverables = (gen.channels || []).map((ch: any) => ({
      id: ch.id,
      presets: selected.find((c: any) => c.id === ch.id)?.presets || "",
      copy_direction: ch.copy_direction,
      visual_direction: ch.visual_direction,
    }));

    const briefRow = {
      brand_id: brand.id,
      title: gen.title,
      moment: moment.name,
      pillar: pillar.name,
      channels,
      focus: focus || null,
      concept: gen.concept,
      key_message: gen.key_message,
      audience_note: gen.audience_note,
      deliverables,
      mandatory: p.mandatory,           // snapshot
      exclusions: p.exclusions,         // snapshot
      compliance_flags: p.standingFlags, // snapshot
      owner: owner || null,
      due_date: dueDate || null,
      status: "draft" as const,
    };

    const { data: saved, error: saveErr } = await sb.from("briefs").insert(briefRow).select().single();
    if (saveErr || !saved) return NextResponse.json({ error: "Could not save the brief", detail: saveErr?.message }, { status: 500 });

    let taskGid: string | null = null;
    if (BRIEFING_ENGINE_PROJECT) {
      taskGid = await createBriefTask({
        projectGid: BRIEFING_ENGINE_PROJECT,
        sectionName: DRAFTED_SECTION_NAME,
        name: `${brand.name} · ${moment.name} · ${channels.join(" + ")}`,
        htmlNotes: briefToHtmlNotes(briefRow, brand.name, brand.tier),
        assignee: "me",
        dueOn: dueDate || null,
      });
      if (taskGid) await sb.from("briefs").update({ asana_task_gid: taskGid }).eq("id", saved.id);
    }

    return NextResponse.json({ brief: { ...saved, asana_task_gid: taskGid }, brand: { name: brand.name, tier: brand.tier } });
  } catch (e: any) {
    return NextResponse.json({ error: "Generation failed", detail: String(e?.message ?? e) }, { status: 500 });
  }
}
