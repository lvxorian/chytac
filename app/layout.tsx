import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Chytac - .cz Domain Drop Catcher',
  description: 'Monitor .cz domains and catch them when they drop',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
