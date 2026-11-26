#!/usr/bin/env bash
set -euo pipefail

# Kamu Bildirim Sepeti - Cloudflare Workers & D1 Kurulum Betigi
# Varsayilan olarak --dry-run modunda calisir; gercekten uygulamak icin --execute verin.
# Yeni VAPID anahtar cifti uretmek icin --generate-vapid kullanin.

MODE="${1:-}"

if [[ "$MODE" == "--generate-vapid" ]]; then
  node --input-type=module -e '
    const cryptoApi = globalThis.crypto ?? (await import("node:crypto")).webcrypto;
    const keyPair = await cryptoApi.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"]
    );
    const jwk = await cryptoApi.subtle.exportKey("jwk", keyPair.privateKey);
    const b64uToBytes = (s) => {
      const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
      return Buffer.from(padded, "base64");
    };
    const pad32 = (b) => (b.length === 32 ? b : Buffer.concat([Buffer.alloc(32 - b.length), b]));
    const x = pad32(b64uToBytes(jwk.x));
    const y = pad32(b64uToBytes(jwk.y));
    const d = pad32(b64uToBytes(jwk.d));
    const publicKey = Buffer.concat([Buffer.from([0x04]), x, y]).toString("base64url");
    const privateKey = d.toString("base64url");
    console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
    console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${publicKey}`);
    console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
  '
  exit 0
fi

DRY_RUN=true
if [[ "$MODE" == "--execute" ]]; then
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
echo "3. D1 migration dosyalarini uzak veritabanina uygulama (0001_init.sql + 0002_phase2.sql + 0003_phase3.sql)"
run_step "npx wrangler d1 migrations apply kamu_bildirim_sepeti --remote"

echo ""
echo "4. Zorunlu ve opsiyonel Cloudflare Workers gizli anahtarlarini tanimlama"
SECRETS=(
  "NEXT_PUBLIC_SITE_URL"
  "SESSION_SECRET"
  "CRON_SECRET"
  "RESEND_API_KEY"
  "EMAIL_FROM"
  "PAYMENT_PROVIDER"
  "STRIPE_SECRET_KEY"
  "STRIPE_WEBHOOK_SECRET"
  "VAPID_PUBLIC_KEY"
  "NEXT_PUBLIC_VAPID_PUBLIC_KEY"
  "VAPID_PRIVATE_KEY"
)

for secret_name in "${SECRETS[@]}"; do
  run_step "npx wrangler secret put ${secret_name}"
done

echo ""
echo "5. Istege bagli ek saglayici anahtarlari (iyzico, MailChannels veya VAPID iletisim adresi icin):"
echo "   npx wrangler secret put IYZICO_API_KEY"
echo "   npx wrangler secret put IYZICO_SECRET_KEY"
echo "   npx wrangler secret put MAILCHANNELS_API_KEY"
echo "   npx wrangler secret put VAPID_SUBJECT"
echo "   VAPID anahtar cifti uretmek icin: bash scripts/setup-cloudflare.sh --generate-vapid"

echo ""
echo "6. OpenNext Cloudflare derleme ve dagitim"
run_step "npm run deploy"

echo ""
echo "Tamamlandi."
