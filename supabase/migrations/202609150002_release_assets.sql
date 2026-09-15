insert into public.beta_release_assets (platform, download_url, version)
values
  (
    'mac-arm64',
    'https://github.com/yswami/Productivity-Tools/releases/download/v0.3.0/Meeting.Notes-0.3.0-arm64-mac.zip',
    '0.3.0'
  ),
  (
    'windows-x64',
    'https://github.com/yswami/Productivity-Tools/releases/download/v0.3.0/Meeting.Notes-0.3.0-Windows-Setup-x64.exe',
    '0.3.0'
  )
on conflict (platform) do update set
  download_url = excluded.download_url,
  version = excluded.version,
  enabled = true,
  updated_at = now();
