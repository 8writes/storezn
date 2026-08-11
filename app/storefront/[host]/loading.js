// Storefront pages resolve their store/product data server-side, so
// without this, clicking any link here blocks with a blank tab until that
// finishes. This fires instantly instead - the header (in layout.js) stays
// mounted, only the content area below it shows this fallback.
export default function Loading() {
  return (
    <div className="flex items-center justify-center py-24">
      <span className="spinner-lg" />
    </div>
  );
}
