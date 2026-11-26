import '@testing-library/jest-dom/vitest';
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import PublicInsightsClient from '@/components/PublicInsightsClient';
import { metadata as analizMetadata } from '@/app/analiz/page';
import { generateStaticParams as generateKaynakStaticParams } from '@/app/kaynak/[slug]/page';
import sitemap from '@/app/sitemap';

describe('Kamu Bildirim Sepeti Phase 9 Analiz & Kaynak UI Tests', () => {
  beforeEach(() => {
    document.documentElement.className = 'light';
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders SBB Kamu İlan card and /kaynak/kamuilan-sbb link in PublicInsightsClient', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ checkpoints: [] }), { status: 200 }))
    );

    render(<PublicInsightsClient />);

    const sbbHeading = screen.getByText('SBB Kamu İlan');
    expect(sbbHeading).toBeInTheDocument();
    const sbbLink = sbbHeading.closest('a');
    expect(sbbLink).toHaveAttribute('href', '/kaynak/kamuilan-sbb');

    const sourceLinks = screen.getAllByRole('link', { name: /Kaynak İlanlarını İncele/i });
    expect(sourceLinks).toHaveLength(4);
    expect(
      sourceLinks.some((link) => link.getAttribute('href') === '/kaynak/kamuilan-sbb')
    ).toBe(true);

    await waitFor(() => {
      expect(
        screen.getByText(/Henüz kayıtlı kaynak senkronizasyon kontrolü bulunmuyor/i)
      ).toBeInTheDocument();
    });
  });

  it('renders healthy Sağlıklı badges and Uyarı badge for lastError or stale checkpoint from /api/sync/status', async () => {
    const freshIso = new Date().toISOString();
    const staleIso = new Date(Date.now() - 90 * 60 * 1000).toISOString();

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url === '/api/sync/status') {
          return new Response(
            JSON.stringify({
              checkpoints: [
                {
                  source: 'kariyer_kapisi',
                  etag: null,
                  lastModified: null,
                  bodyHash: null,
                  lastCheckedAt: freshIso,
                  lastChangedAt: null,
                  activeCount: 42,
                  lastError: null,
                },
                {
                  source: 'sbb',
                  etag: null,
                  lastModified: null,
                  bodyHash: null,
                  lastCheckedAt: freshIso,
                  lastChangedAt: null,
                  activeCount: 19,
                  lastError: 'HTTP 503 servis geçici olarak yanıt vermedi',
                },
                {
                  source: 'iskur',
                  etag: null,
                  lastModified: null,
                  bodyHash: null,
                  lastCheckedAt: staleIso,
                  lastChangedAt: null,
                  activeCount: 7,
                  lastError: null,
                },
                {
                  source: 'resmi_gazete',
                  etag: null,
                  lastModified: null,
                  bodyHash: null,
                  lastCheckedAt: freshIso,
                  lastChangedAt: null,
                  activeCount: 11,
                  lastError: null,
                },
              ],
            }),
            { status: 200 }
          );
        }
        return new Response(JSON.stringify({}), { status: 200 });
      })
    );

    render(<PublicInsightsClient />);

    await waitFor(() => {
      expect(screen.getByText(/42 aktif ilan/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/Canlı Kaynak Sağlığı ve Ayrıştırıcı Durumu/i)).toBeInTheDocument();
    expect(screen.getByText(/19 aktif ilan/i)).toBeInTheDocument();
    expect(screen.getByText(/7 aktif ilan/i)).toBeInTheDocument();
    expect(screen.getByText(/11 aktif ilan/i)).toBeInTheDocument();
    expect(screen.getAllByText('Sağlıklı')).toHaveLength(2);
    expect(screen.getAllByText('Uyarı')).toHaveLength(2);
    expect(
      screen.getByText(/HTTP 503 servis geçici olarak yanıt vermedi/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/Son kontrol 60 dakikadan eski/i)).toBeInTheDocument();
  });

  it('renders honest error state when /api/sync/status returns HTTP 500', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'Server error' }), { status: 500 }))
    );

    render(<PublicInsightsClient />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        /Canlı kaynak sağlık verileri alınamadı/i
      );
    });
  });

  it('includes /kaynak/kamuilan-sbb in sitemap and static params, and SBB Kamu İlan in analiz metadata', async () => {
    const entries = sitemap();
    expect(entries.some((entry) => entry.url.endsWith('/kaynak/kamuilan-sbb'))).toBe(true);

    const staticParams = await generateKaynakStaticParams();
    expect(staticParams.some((param) => param.slug === 'kamuilan-sbb')).toBe(true);

    expect(String(analizMetadata.description)).toContain('SBB Kamu İlan');
  });
});
