export default function Loading() {
  return (
    <div className="mx-auto max-w-4xl space-y-4 px-4 py-6 sm:px-6" aria-busy="true">
      <div className="skeleton h-10 w-64" />
      <div className="skeleton h-28" />
      <div className="skeleton h-28" />
      <div className="skeleton h-28" />
    </div>
  );
}
