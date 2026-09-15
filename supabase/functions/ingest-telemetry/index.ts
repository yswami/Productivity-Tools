import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedEvents = new Set([
  "app_started", "telemetry_enabled", "recording_started", "recording_completed",
  "recording_failed", "transcription_completed", "transcription_failed", "calendar_created"
]);
const allowedPropertyKeys = new Set(["platform", "stage", "duration_minutes"]);
const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type" };

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return response({ error: "Method not allowed" }, 405);
  if (Number(request.headers.get("content-length") || 0) > 4096) return response({ error: "Request too large" }, 413);
  try {
    const body = await request.json();
    if (!allowedEvents.has(body.event)) return response({ error: "Unsupported event" }, 400);
    if (!/^[0-9a-f-]{36}$/i.test(body.installation_id || "")) return response({ error: "Invalid installation" }, 400);
    if (!/^[0-9A-Za-z._-]{1,30}$/.test(body.app_version || "")) return response({ error: "Invalid version" }, 400);
    if (!new Set(["darwin", "win32"]).has(body.platform)) return response({ error: "Invalid platform" }, 400);
    const properties = sanitizeProperties(body.event, body.properties || {});
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { error } = await supabase.from("telemetry_events").insert({
      installation_id: body.installation_id,
      event: body.event,
      app_version: body.app_version,
      platform: body.platform,
      architecture: String(body.architecture || "unknown").slice(0, 20),
      properties
    });
    if (error) throw error;
    return response({ accepted: true }, 202);
  } catch {
    return response({ error: "Invalid request" }, 400);
  }
});

function sanitizeProperties(event: string, input: Record<string, unknown>) {
  const platform = ["zoom", "google-meet", "microsoft-teams", "manual"].includes(String(input.platform))
    ? String(input.platform)
    : undefined;
  const stage = ["capture", "transcription", "calendar"].includes(String(input.stage)) ? String(input.stage) : undefined;
  const duration = Number(input.duration_minutes);
  const candidates: Record<string, string | number | undefined> = {
    platform,
    stage,
    duration_minutes: Number.isFinite(duration) && duration >= 0 && duration <= 1440 ? Math.round(duration) : undefined
  };
  const eventKeys: Record<string, Set<string>> = {
    app_started: new Set(), telemetry_enabled: new Set(),
    recording_started: new Set(["platform"]), recording_completed: new Set(["platform", "duration_minutes"]),
    recording_failed: new Set(["platform", "stage"]), transcription_completed: new Set(["platform"]),
    transcription_failed: new Set(["platform"]), calendar_created: new Set(["platform"])
  };
  return Object.fromEntries(Object.entries(candidates).filter(([key, value]) => allowedPropertyKeys.has(key) && eventKeys[event]?.has(key) && value !== undefined));
}

function response(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });
}
