# phase 49 되돌리기용 원래 값 (비밀값 없음)

운영 전환 전 값. 되돌릴 때 이 값으로 복원한다. [전환 기록](production-cutover.md).

## Cloudflare (T3 이전)

```json
{
  "zone": "326c3b0175736aec02bd586f4469f44d",
  "taken_at": "2026-10-05 (before T3)",
  "dns_changed": [
    { "id": "f0d08691f80e1830ded91325529d1e69", "type": "A", "name": "getsasu.com", "content": "192.0.2.1", "proxied": true, "ttl": 1 },
    { "id": "d9e2d275488cbb6ecb4d40e97abc323b", "type": "A", "name": "www.getsasu.com", "content": "192.0.2.1", "proxied": true, "ttl": 1 }
  ],
  "dns_untouched": ["rsend CNAME", "send CNAME", "_dmarc TXT", "resend._domainkey TXT"],
  "redirect_ruleset": "1b1b2ec3ea6c40e0af0c5c1f2f9e0361",
  "redirect_rule": {
    "id": "78fa078b889248fa9e7fe65cc95a629d",
    "description": "getsasu.com → sasu 운영 웹",
    "expression": "(http.host in {\"getsasu.com\" \"www.getsasu.com\"})",
    "action": "redirect",
    "action_parameters": { "from_value": { "preserve_query_string": true, "status_code": 302, "target_url": { "expression": "concat(\"https://sasu-alpha.vercel.app\", http.request.uri.path)" } } },
    "enabled": true
  }
}
```

## Supabase Auth (T5·T9 이전)

```json
{
  "project": "fzpnidoyhejrmhymggpp",
  "taken_at": "2026-10-05 (before T5)",
  "site_url": "https://sasu-alpha.vercel.app",
  "uri_allow_list": "https://sasu-alpha.vercel.app/auth/callback",
  "mailer_otp_length": 6,
  "mailer_subjects_confirmation": "Confirm your email address",
  "mailer_subjects_magic_link": "사수 로그인 코드",
  "mailer_templates_confirmation_content": "<h2>Confirm your email address</h2>\n\n<p>Follow the link below to confirm this email address and finish signing up.</p>\n<p><a href=\"{{ .ConfirmationURL }}\">Confirm email address</a></p>",
  "mailer_templates_magic_link_content": "<h2>사수 로그인</h2>\n<p>데스크톱 앱에 아래 로그인 코드를 입력해 주세요.</p>\n<p style=\"font-size: 28px; font-weight: bold; letter-spacing: 4px;\">{{ .Token }}</p>\n<p>웹에서 로그인하려면 <a href=\"{{ .ConfirmationURL }}\">사수 로그인</a>을 눌러 주세요.</p>\n<p>이 코드는 한 번만 사용할 수 있습니다. 로그인 요청을 하지 않았다면 이 메일을 무시해 주세요.</p>"
}
```

## 그 밖

- Vercel Production `NEXT_PUBLIC_APP_URL=https://sasu-alpha.vercel.app`, `SASU_LEGACY_HOSTS` 없음. Vercel 도메인 `getsasu.com`·`www.getsasu.com` 없음.
- Slack 앱 SASU: Events `https://sasu-alpha.vercel.app/api/slack/events`, Interactivity `https://sasu-alpha.vercel.app/api/slack/interactions`, OAuth Redirect `https://sasu-alpha.vercel.app/api/slack/oauth/callback`만.
- `public.worker_config.jobs_run_url = https://sasu-alpha.vercel.app/api/jobs/run`.
