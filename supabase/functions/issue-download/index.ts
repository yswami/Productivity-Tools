import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type"
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return response({ error: "Method not allowed" }, 405);
  const authorization = request.headers.get("authorization");
  if (!authorization) return response({ error: "Sign in is required" }, 401);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const token = authorization.replace(/^Bearer\s+/i, "");
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) return response({ error: "Invalid session" }, 401);

  const { platform } = await request.json();
  if (!new Set(["mac-arm64", "windows-x64"]).has(platform)) return response({ error: "Invalid platform" }, 400);
  const { data: asset, error: assetError } = await supabase
    .from("beta_release_assets")
    .select("download_url, version")
    .eq("platform", platform)
    .eq("enabled", true)
    .maybeSingle();
  if (assetError || !asset) return response({ error: "Build unavailable" }, 404);

  await supabase.from("beta_downloads").insert({
    user_id: authData.user.id,
    platform,
    version: asset.version
  });
  return response({ url: asset.download_url, version: asset.version }, 200);
});

function response(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });
}
