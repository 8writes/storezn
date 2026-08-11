// Shown the instant a dashboard nav link is clicked, while the target
// route's code/data streams in - covers every page under (dashboard)
// (vendor/*, super-admin/*, profile) since this sits above all of them.
export default function Loading() {
  return (
    <div className="flex items-center justify-center py-24">
      <span className="spinner" />
    </div>
  );
}
