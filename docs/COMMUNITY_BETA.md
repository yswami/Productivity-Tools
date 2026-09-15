# Community beta operations

This setup uses only free services. Meeting audio and transcripts remain local.

## What is tracked

Supabase Auth stores each tester's email and signup date. Every authenticated download request records the tester ID, platform, version, and timestamp. The app can optionally send a random installation ID plus these operational events:

- App started
- Reliability sharing enabled
- Recording started, completed, or failed
- Transcription completed or failed
- Calendar file created

No event accepts meeting titles, transcripts, audio, participants, calendar content, or file paths. The Edge Function rejects unsupported event names and properties.

## Free service setup

1. Create a public GitHub repository and push this project.
2. In repository Settings > Pages, select GitHub Actions as the source.
3. Create a Supabase Free project and follow `supabase/README.md`.
4. Add `SUPABASE_URL` and `SUPABASE_ANON_KEY` under GitHub repository Settings > Secrets and variables > Actions > Variables.
5. Push `main`. The Pages workflow publishes the beta portal.
6. Add the published Pages URL to Supabase Authentication's site URL and redirect URL list.

The project URL and anon key are public client values. Never add the service-role key to GitHub, the website, or the desktop app.

## Publish a build

1. Update the version in `package.json`.
2. Commit and tag it, for example `v0.3.0`.
3. Push the tag. Native GitHub runners build Mac and Windows packages and attach them to the release.
4. Copy each release asset's direct URL into `beta_release_assets` using the SQL in `supabase/README.md`.

The beta portal records the signed-in tester before redirecting to GitHub. GitHub URLs can be forwarded, so this is participation tracking rather than copy protection.

## Review beta health

Use these read-only queries in the Supabase SQL editor:

```sql
select platform, version, count(*) as requests
from public.beta_downloads
group by platform, version
order by version desc, platform;

select event, app_version, platform, count(*) as events
from public.telemetry_events
where received_at >= now() - interval '30 days'
group by event, app_version, platform
order by event, app_version;

select count(distinct installation_id) as active_installations
from public.telemetry_events
where received_at >= now() - interval '30 days';
```

## Release safety checklist

- Run `npm run test:unit`.
- Verify the Mac bundle with `codesign --verify --deep --strict`.
- Test one microphone capture and one system-audio capture on each operating system.
- Confirm the consent prompt defaults to no data sharing.
- Confirm telemetry payloads contain no meeting content.
- Review privacy and beta terms when data collection changes.
- Never upload tester transcripts or audio to GitHub issues.
