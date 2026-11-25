#!/usr/bin/env bash
set -euo pipefail

# Kamu Bildirim Sepeti - Cloudflare Workers & D1 Kurulum Betigi
# Varsayilan olarak --dry-run modunda calisir; gercekten uygulamak icin --execute verin.

DRY_RUN=true
if [[ "${1:-}" == "--execute" ]]; then
  DRY_RUN=false
fi

run_step() {
  local cmd="$1"
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "[DRY-RUN] $cmd"
  else
    echo "[EXEC] $cmd"
    eval "$cmd"
  fi
}

echo "=== Kamu Bildirim Sepeti Cloudflare D1 & Workers Kurulumu ==="
if [[ "$DRY_RUN" == "true" ]]; then
  echo "Mod: DRY-RUN (komutlar yalnizca yazdirilir; calistirmak icin --execute ekleyin)"
else
  echo "Mod: EXECUTE (komutlar gercekten calistirilacak)"
fi
echo ""

echo "1. Wrangler surum kontrolu"
run_step "npx wrangler --version"

echo ""
echo "2. D1 veritabani olusturma (cikti icindeki database_id degerini wrangler.jsonc dosyasina yazin)"
run_step "npx wrangler d1 create kamu_bildirim_sepeti"

echo ""
echo "3. D1 migration dosyalarini uzak veritabanina uygulama (0001_init.sql + 0002_phase2.sql)"
run_step "npx wrangler d1 migrations apply kamu_bildirim_sepeti --remote"

echo ""
echo "4. Zorunlu ve opsiyonel Cloudflare Workers gizli anahtarlarini tanimlama"
SECRETS=(
  "SESSION_SECRET"
  "CRON_SECRET"
  "RESEND_API_KEY"
  "PAYMENT_PROVIDER"
  "STRIPE_SECRET_KEY"
  "STRIPE_WEBHOOK_SECRET"
)

for secret_name in "${SECRETS[@]}"; do
  run_step "npx wrangler secret put ${secret_name}"
done

echo ""
echo "5. Istege bagli ek saglayici anahtarlari (iyzico veya MailChannels kullanacaksaniz):"
echo "   npx wrangler secret put IYZICO_API_KEY"
echo "   npx wrangler secret put IYZICO_SECRET_KEY"
echo "   npx wrangler secret put MAILCHANNELS_API_KEY"

echo ""
echo "6. OpenNext Cloudflare derleme ve dagitim"
run_step "npm run deploy"

echo ""
echo "Tamamlandi."
