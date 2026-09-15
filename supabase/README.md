# Free beta backend

This folder contains the complete Supabase Free backend for tester signup, authenticated download records, and opt-in reliability events. Large installers remain on GitHub Releases so the beta does not consume paid object storage.

## One-time setup

1. Create a free Supabase project.
2. Install the Supabase CLI or run it through `npx supabase`.
3. Authenticate and link the project:

   ```sh
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_REF
   npx supabase db push
   npx supabase functions deploy ingest-telemetry
   npx supabase functions deploy issue-download
   ```

4. In Authentication > URL Configuration, set the site URL to the GitHub Pages URL and add the same URL to Redirect URLs.
5. Put the public project URL and publishable/anon key into GitHub repository variables `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
6. Create a GitHub Release containing the two packages, then register their direct asset URLs:

   ```sql
   insert into public.beta_release_assets(platform, download_url, version)
   values
     ('mac-arm64', 'https://github.com/OWNER/REPOSITORY/releases/download/v0.3.0/Meeting-Notes-macOS.zip', '0.3.0'),
     ('windows-x64', 'https://github.com/OWNER/REPOSITORY/releases/download/v0.3.0/Meeting-Notes-Windows-Setup.exe', '0.3.0')
   on conflict (platform) do update set
     download_url = excluded.download_url,
     version = excluded.version,
     enabled = true,
     updated_at = now();
   ```

Supabase's project URL and anon key are intentionally public client configuration. Never place the service-role key in the app, website, repository, or GitHub variables used by browser code. Download requests are tracked, but GitHub asset URLs can be forwarded; enforcing non-transferable downloads would require paid file delivery or an authenticated proxy.
