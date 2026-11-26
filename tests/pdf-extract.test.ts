import { describe, expect, it, vi } from 'vitest';
import {
  extractTextFromPdfBuffer,
  fetchAndExtractPdfText,
  fetchPdfBuffer,
} from '../scripts/pdf-extract';

function buildMinimalTextPdf(lines: string[]): Buffer {
  const escapedLines = lines.map((line) =>
    line.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)'),
  );
  const contentLines = [
    'BT',
    '/F1 12 Tf',
    '50 750 Td',
    '16 TL',
    ...escapedLines.map((line, index) => (index === 0 ? `(${line}) Tj` : `T* (${line}) Tj`)),
    'ET',
  ].join('\n');

  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
    `4 0 obj\n<< /Length ${Buffer.byteLength(contentLines, 'ascii')} >>\nstream\n${contentLines}\nendstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'ascii'));
    pdf += obj;
  }
  const xrefStart = Buffer.byteLength(pdf, 'ascii');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(pdf, 'ascii');
}

describe('PDF and OCR extraction helper (scripts/pdf-extract.ts)', () => {
  it('sends SBB Referer header and browser User-Agent and accepts %PDF responses', async () => {
    const pdfBytes = Buffer.from('%PDF-1.4\n%sbb-sample-content', 'ascii');
    const mockFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://kamuilan.sbb.gov.tr/ilanDetay.aspx?kod=ABC123');
      const headers = (init?.headers ?? {}) as Record<string, string>;
      expect(headers.Referer).toBe('https://kamuilan.sbb.gov.tr/');
      expect(headers['User-Agent']).toContain('Mozilla/5.0');
      return new Response(pdfBytes, {
        status: 200,
        headers: { 'content-type': 'application/pdf' },
      });
    }) as unknown as typeof fetch;

    const result = await fetchPdfBuffer(
      'https://kamuilan.sbb.gov.tr/ilanDetay.aspx?kod=ABC123',
      { source: 'sbb', fetcher: mockFetch },
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result).not.toBeNull();
    expect(result?.subarray(0, 4).toString('ascii')).toBe('%PDF');
  });

  it('sends SBB Referer automatically when URL host is kamuilan.sbb.gov.tr even without source option', async () => {
    const pdfBytes = Buffer.from('%PDF-1.7\nbody', 'ascii');
    const mockFetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      expect(headers.Referer).toBe('https://kamuilan.sbb.gov.tr/');
      return new Response(pdfBytes, { status: 200 });
    }) as unknown as typeof fetch;

    const result = await fetchPdfBuffer(
      'https://kamuilan.sbb.gov.tr/ilanDetay.aspx?kod=XYZ999',
      { fetcher: mockFetch },
    );
    expect(result).toEqual(pdfBytes);
  });

  it('rejects non-PDF HTML soft-404 responses and non-200 responses with null', async () => {
    const htmlMock = vi.fn(async () => {
      return new Response('<!DOCTYPE html><html><body>404 Sayfa Bulunamadi</body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }) as unknown as typeof fetch;

    const htmlResult = await fetchPdfBuffer(
      'https://kamuilan.sbb.gov.tr/ilanDetay.aspx?kod=SOFT404',
      { source: 'sbb', fetcher: htmlMock },
    );
    expect(htmlResult).toBeNull();

    const errorMock = vi.fn(async () => new Response('%PDF-1.4', { status: 404 })) as unknown as typeof fetch;
    const errorResult = await fetchPdfBuffer(
      'https://www.iskur.gov.tr/medya/test.pdf',
      { source: 'iskur', fetcher: errorMock },
    );
    expect(errorResult).toBeNull();
  });

  it('enforces maxBytes limit via content-length and streaming body guard', async () => {
    const oversizedHeaderMock = vi.fn(async () => {
      return new Response(Buffer.from('%PDF-1.4\n1234567890', 'ascii'), {
        status: 200,
        headers: { 'content-length': '99999999' },
      });
    }) as unknown as typeof fetch;

    const headerRes = await fetchPdfBuffer('https://www.iskur.gov.tr/medya/big.pdf', {
      maxBytes: 1024,
      fetcher: oversizedHeaderMock,
    });
    expect(headerRes).toBeNull();

    const oversizedBodyMock = vi.fn(async () => {
      return new Response(Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(2048, 65)]), {
        status: 200,
      });
    }) as unknown as typeof fetch;

    const bodyRes = await fetchPdfBuffer('https://www.iskur.gov.tr/medya/stream-big.pdf', {
      maxBytes: 512,
      fetcher: oversizedBodyMock,
    });
    expect(bodyRes).toBeNull();
  });

  it('falls back gracefully to method=none on invalid or corrupted buffers without throwing', async () => {
    const nonPdf = await extractTextFromPdfBuffer(Buffer.from('<html>Not a PDF</html>', 'utf8'));
    expect(nonPdf).toEqual({ text: '', method: 'none' });

    const corruptPdf = await extractTextFromPdfBuffer(
      Buffer.from('%PDF-1.4\nthis-is-corrupted-binary-data', 'utf8'),
      { enableOcr: true, maxOcrPages: 1 },
    );
    expect(corruptPdf).toEqual({ text: '', method: 'none' });
  });

  it('extracts text via pdftotext from a valid text PDF buffer', async () => {
    const samplePdf = buildMinimalTextPdf([
      'KAMU BILDIRIM SEPETI TEST ILANI',
      'BOZKOY BELEDIYE BASKANLIGI ITFAIYE ERI ALIM ILANI',
      'KPSS P3 en az 65 puan ve en az C sinifi surucu belgesine sahip olmak.',
      'Son basvuru tarihi: 23.12.2026 Kontenjan: 1 adet memur kadrosu.',
    ]);

    const extracted = await extractTextFromPdfBuffer(samplePdf, { enableOcr: false });
    expect(extracted.method).toBe('pdftotext');
    expect(extracted.text).toContain('BOZKOY BELEDIYE BASKANLIGI');
    expect(extracted.text).toContain('KPSS P3 en az 65 puan');
  });

  it('returns method=none from fetchAndExtractPdfText when remote returns HTML soft-404', async () => {
    const mockFetch = vi.fn(async () => new Response('<html>404</html>', { status: 200 })) as unknown as typeof fetch;
    const res = await fetchAndExtractPdfText(
      'https://kamuilan.sbb.gov.tr/ilanDetay.aspx?kod=MISSING',
      { source: 'sbb', fetcher: mockFetch },
    );
    expect(res).toEqual({ text: '', method: 'none' });
  });
});
