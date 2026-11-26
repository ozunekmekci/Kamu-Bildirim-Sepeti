<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Kamu Bildirim Sepeti - Agent Guide

## 30-Second Agent Resume Checklist
1. Read `docs/PROGRESS.md` and run `git log -n 5` to see the latest completed milestone and handoff state.
2. Read `docs/ROADMAP.md` to confirm phase scope and priorities.
3. Run `npm test && npm run lint` to verify baseline health before making changes.
4. Pick the next unchecked (`[ ]`) item in `docs/PROGRESS.md`.

## Product & Hard Rules
- **Brand:** ONLY **Kamu Bildirim Sepeti**. Never reference or introduce any competing third-party app name anywhere in code, comments, tests, or docs.
- **Copy Hygiene:** Never use the em dash character (`\u2014`) in UI copy, error messages, or documentation. Use commas, colons, periods, or parentheses instead.
- **No Fabricated Claims:** Never add fake user counts, fake uptime claims, or fake testimonials.
- **Official Sources & Binding Disclaimer:**
  - Kariyer Kapısı: `https://kariyerkapisi.gov.tr`
  - İŞKUR: `https://www.iskur.gov.tr/`
  - Resmî Gazete: `https://www.resmigazete.gov.tr/`
  - ÖSYM KPSS Arşivi: preserved under `/kpss-arsivi`
  - Every announcement view and legal notice must state that the official text published by the hiring public institution is binding and takes precedence in case of discrepancy.
- **UI & Accessibility:** Support both Light and Dark themes (`@custom-variant dark (&:where(.dark, .dark *));`) with WCAG AA contrast (`>= 4.5:1` body text), crisp 1px borders, `tabular-nums` on numbers/dates/quotas, and no gradients, glassmorphism, or decorative glows.
- **KVKK & Security:** Disclose the 5 collected data categories (Ad [İsteğe bağlı], E-posta adresi, Kullanıcı kimlikleri, Telefon numarası [İsteğe bağlı], Profil bilgileri), state no third-party data sharing, encryption in transit, and self-service permanent deletion (`DELETE /api/account` with `'SIL'` confirmation).

## Architecture & Deep Modules Map

| Layer | Path | Responsibility |
| --- | --- | --- |
| Announcements | `src/modules/announcements/` (`types.ts`, `seed.ts`, `parsers.ts`, `service.ts`, `index.ts`) | Unified `Announcement` schema, 24 seed items, zero-dependency Workers HTML/JSON-LD/RSS/fihrist parsers, filtering, facets, and `syncOfficialSources` |
| Matching | `src/modules/matching/` (`engine.ts`, `index.ts`) | Pure eligibility scoring (`evaluateAnnouncementMatch`, `matchAnnouncementsForProfile`) reusing `@/lib/turkish`, `@/data/departments`, `@/data/qualifications` |
| Database | `src/modules/db/` (`types.ts`, `d1-adapter.ts`, `memory-adapter.ts`, `index.ts`) | `DatabaseAdapter` seam with Cloudflare D1 adapter and local/test `MemoryDbAdapter` fallback via `getDb()` |
| Identity | `src/modules/identity/` (`crypto.ts`, `service.ts`, `index.ts`) | Edge-compatible Web Crypto PBKDF2 + HMAC-SHA256 `kbs_session` cookies, registration/login, email verification & password reset tokens, profile management, KVKK cascade deletion |
| Tracking | `src/modules/tracking/` (`email-adapters.ts`, `service.ts`, `index.ts`) | Saved announcements, free/premium save limits, notification preferences, reminder & new-announcement deduplication behind `Resend`/`MailChannels`/`Noop` `EmailAdapter` seam |
| Billing | `src/modules/billing/` (`payment-adapters.ts`, `service.ts`, `index.ts`) | `EntitlementGate` (Free: 15 visible / 10 saved; Premium: unlimited + profile match + instant alerts) and `Demo`/`Stripe`/`iyzico` `PaymentAdapter` seam with fail-closed webhook verification |
| Web Push & SW | `src/modules/push/` (`vapid.ts`, `service.ts`, `index.ts`), `public/sw.js` | Zero-dep Web Crypto RFC 8291 (`aes128gcm`) & RFC 8292 (`ES256` VAPID) sender, `VapidWebPushAdapter`, 404/410 auto-pruning, `dispatchPushForNewAnnouncements`, and lightweight PWA Service Worker |
| Analytics & SEO | `src/modules/analytics/` (`public-insights.ts`, `index.ts`), `src/app/sitemap.ts` | Dataset-derived insights (`getPublicInsightsSummary`), 81-province SEO catalog (`getCitySeoCatalog`, `getCityLandingData`, `getSourceLandingData`), scenario delta (`compareProfileScenarios`), and expanded sitemap |
| D1 Schema | `migrations/0001_init.sql`, `migrations/0002_phase2.sql`, `migrations/0003_phase3.sql` | SQLite/D1 schema (`users`, `sessions`, `auth_tokens`, `user_profiles`, `announcements`, `saved_announcements`, `notification_prefs`, `reminder_logs`, `subscriptions`, `sync_runs`, `push_subscriptions`) with `ON DELETE CASCADE` |
| API Routes | `src/app/api/**` | `auth/{register,login,logout,me,verify-email,resend-verification,forgot-password,reset-password}`, `profile`, `account`, `announcements/{,id,matched}`, `saved`, `notifications/preferences`, `billing/{,plan,checkout,webhook/stripe,webhook/iyzico}`, `push/{vapid-key,subscriptions}`, `cron/sync`, `sync/status`, `health` |
| App Routes | `src/app/**` | `/`, `/analiz`, `/sehir/[slug]`, `/kaynak/[slug]`, `/ilan/[id]`, `/kayitli`, `/profil`, `/ayarlar`, `/premium`, `/giris`, `/kayit`, `/sifre-sifirla`, `/eposta-dogrula`, `/kpss-arsivi`, `/gizlilik-politikasi`, `/kullanim-kosullari` |
| Deploy & Env | `scripts/setup-cloudflare.sh`, `.env.example` | Dry-run-by-default Wrangler D1 setup, `--generate-vapid` P-256 keypair generator, migration/secret setup script, and 17-variable `.env.example` |

## Phase 2, Phase 3 & Phase 4 Environment Variables
- Site & Auth/Cron: `NEXT_PUBLIC_SITE_URL`, `SESSION_SECRET`, `CRON_SECRET`
- Email: `RESEND_API_KEY`, `MAILCHANNELS_API_KEY`, `EMAIL_FROM`
- Billing & Webhooks: `PAYMENT_PROVIDER`, `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID_PREMIUM`, `STRIPE_WEBHOOK_SECRET`, `IYZICO_API_KEY`, `IYZICO_SECRET_KEY`, `IYZICO_BASE_URL`
- Web Push (VAPID): `VAPID_PUBLIC_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`

## Verification & Commit Convention
Every milestone must pass all four checks before updating `docs/PROGRESS.md` and committing:
1. `npm test`
2. `npm run lint`
3. `npm run build`
4. `npm run build:worker`

Use structured commit messages in Turkish/English ASCII summary format:
```text
feat(scope): short milestone summary

Tamamlananlar:
- ...

Dogrulama:
- npm test: ...
- npm run lint: ...
- npm run build: ...
- npm run build:worker: ...

Kaldigimiz Yer:
- ...

Sonraki Adim:
- ...
```
