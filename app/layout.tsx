import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  ),
  title: 'Asistencia de Estudiantes',
  description: 'Escuela Colombiana de Ingeniería',
  openGraph: {
    title: 'Asistencia de Estudiantes',
    description: 'Escuela Colombiana de Ingeniería',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}