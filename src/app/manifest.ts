import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Kamu Bildirim Sepeti',
    short_name: 'Kamu Sepeti',
    description:
      'Kariyer Kapısı, İŞKUR ve Resmî Gazete kamu atama, personel alımı ve görevlendirme ilanları ile KPSS merkezi yerleştirme arşivi.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f8fafc',
    theme_color: '#b91c1c',
    icons: [
      {
        src: '/icon',
        sizes: '32x32',
        type: 'image/png',
      },
    ],
  };
}
