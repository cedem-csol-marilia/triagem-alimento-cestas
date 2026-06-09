// app/triagem/layout.tsx
// app/fila/layout.tsx  
// app/entregas/layout.tsx
// app/familias/layout.tsx
// Todas as seções usam o mesmo layout do dashboard (sidebar já está no dashboard/layout.tsx)

export default function SectionLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
