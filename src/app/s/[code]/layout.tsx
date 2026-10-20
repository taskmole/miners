/** The frame around a shared place's card, and around its not-found card. */
export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-zinc-50 flex items-center justify-center p-4">
      <div className="w-full max-w-[411px] bg-white rounded-2xl shadow-lg overflow-hidden">{children}</div>
    </main>
  );
}
