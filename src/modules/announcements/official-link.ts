import type { Announcement, AnnouncementSource, VerifiedSourceRef } from './types';

export const SBB_PORTAL_URL = 'https://kamuilan.sbb.gov.tr/';

export interface ResolvedOfficialLink {
  href: string;
  label: string;
  isPortalFallback: boolean;
  helperNote: string | null;
}

/**
 * Checks whether a URL points to SBB's Referer-gated detail endpoint that returns 404 on external clicks.
 */
export function isSbbRefererProtectedUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /^https?:\/\/(?:www\.)?kamuilan\.sbb\.gov\.tr\/ilanDetay\.aspx/i.test(url.trim());
}

/**
 * Normalizes a verified source URL so SBB Referer-gated detail URLs open the official SBB portal cleanly.
 */
export function resolveVerifiedSourceUrl(source: AnnouncementSource, url: string): string {
  if (source === 'sbb' && isSbbRefererProtectedUrl(url)) {
    return SBB_PORTAL_URL;
  }
  return url;
}

/**
 * Resolves the safest clickable official announcement URL without triggering SBB external-Referer 404s.
 */
export function resolveOfficialLink(
  announcement: Pick<Announcement, 'source' | 'sourceUrl'> & {
    verifiedSources?: VerifiedSourceRef[];
  },
): ResolvedOfficialLink {
  if (announcement.source === 'sbb' && isSbbRefererProtectedUrl(announcement.sourceUrl)) {
    const directAlternative = (announcement.verifiedSources ?? []).find(
      (ref) =>
        ref.source !== 'sbb' &&
        Boolean(ref.url && ref.url.trim().length > 0) &&
        !isSbbRefererProtectedUrl(ref.url),
    );
    if (directAlternative) {
      return {
        href: directAlternative.url,
        label: 'Resmî İlan Metnine Git',
        isPortalFallback: false,
        helperNote: null,
      };
    }

    return {
      href: SBB_PORTAL_URL,
      label: 'SBB Kamu İlan Portalında Aç',
      isPortalFallback: true,
      helperNote:
        'SBB harici doğrudan ilan bağlantısını kapattığı için ilan ana portalda açılır. Kurum adını kopyalayıp portalda arayabilirsiniz.',
    };
  }

  return {
    href: announcement.sourceUrl,
    label: 'Resmî İlan Metnine Git',
    isPortalFallback: false,
    helperNote: null,
  };
}
