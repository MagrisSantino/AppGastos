export function LoadingData() {
  return (
    <div className="flex flex-col items-center justify-center py-24">
      <div className="size-9 animate-spin rounded-full border-4 border-muted border-t-primary" />
      <p className="mt-4 text-sm text-muted-foreground">Cargando datos…</p>
    </div>
  );
}
