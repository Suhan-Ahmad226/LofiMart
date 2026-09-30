export default function AdminLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 lg:px-6" aria-busy="true" aria-label="Loading admin workspace">
      <div className="h-20 animate-pulse rounded-2xl border border-black/5 bg-white shadow-sm" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-2xl border border-black/5 bg-white shadow-sm" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="h-80 animate-pulse rounded-2xl border border-black/5 bg-white shadow-sm" />
        <div className="h-80 animate-pulse rounded-2xl border border-black/5 bg-white shadow-sm" />
      </div>
      <div className="h-72 animate-pulse rounded-2xl border border-black/5 bg-white shadow-sm" />
    </div>
  );
}
