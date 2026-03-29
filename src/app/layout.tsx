import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Studio - Ensaio Fotográfico com IA',
  description: 'Crie ensaios fotográficos profissionais com inteligência artificial',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400&family=DM+Sans:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-studio-bg text-[#f0ece4] font-sans antialiased">
        {children}
      </body>
    </html>
  )
}
