import { ImageResponse } from 'next/og';

export const alt = 'Kamu Bildirim Sepeti: Resmî Kamu İlanları ve KPSS Atama Takibi';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '60px',
          background: '#f8fafc',
          border: '16px solid #b91c1c',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Top Emblem Row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div
            style={{
              width: '80px',
              height: '80px',
              borderRadius: '8px',
              background: '#b91c1c',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontWeight: 900,
            }}
          >
            <span style={{ fontSize: '26px', letterSpacing: '-0.5px' }}>KBS</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span
              style={{
                fontSize: '20px',
                fontWeight: 800,
                color: '#b91c1c',
                textTransform: 'uppercase',
                letterSpacing: '1px',
              }}
            >
              Kamu Bildirim Sepeti
            </span>
            <span style={{ fontSize: '15px', color: '#475569' }}>
              Kariyer Kapısı, İŞKUR, Resmî Gazete İlan Akışı ve ÖSYM KPSS Arşivi
            </span>
          </div>
        </div>

        {/* Center Title */}
        <div style={{ display: 'flex', flexDirection: 'column', margin: '30px 0' }}>
          <h1
            style={{
              fontSize: '46px',
              fontWeight: 900,
              color: '#0f172a',
              lineHeight: 1.15,
              margin: '0 0 16px 0',
            }}
          >
            Kamu Atama, Personel Alımı ve Görevlendirme İlanları Tek Yerde
          </h1>
          <p
            style={{
              fontSize: '22px',
              color: '#334155',
              lineHeight: 1.4,
              margin: 0,
            }}
          >
            Profilinize uyan resmî ilanları filtreleyin, son başvuru tarihlerini kaydedin ve 2024-2026 KPSS taban puanlarını inceleyin.
          </p>
        </div>

        {/* Bottom Feature Badges */}
        <div style={{ display: 'flex', gap: '16px' }}>
          <div
            style={{
              background: 'white',
              border: '2px solid #cbd5e1',
              padding: '12px 20px',
              fontSize: '18px',
              fontWeight: 700,
              color: '#1e293b',
              display: 'flex',
            }}
          >
            Kariyer Kapısı
          </div>
          <div
            style={{
              background: 'white',
              border: '2px solid #cbd5e1',
              padding: '12px 20px',
              fontSize: '18px',
              fontWeight: 700,
              color: '#1e293b',
              display: 'flex',
            }}
          >
            İŞKUR
          </div>
          <div
            style={{
              background: 'white',
              border: '2px solid #cbd5e1',
              padding: '12px 20px',
              fontSize: '18px',
              fontWeight: 700,
              color: '#1e293b',
              display: 'flex',
            }}
          >
            Resmî Gazete
          </div>
          <div
            style={{
              background: '#fef2f2',
              border: '2px solid #fecaca',
              padding: '12px 20px',
              fontSize: '18px',
              fontWeight: 700,
              color: '#991b1b',
              display: 'flex',
            }}
          >
            KPSS Arşivi (P3 / P93 / P94)
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
