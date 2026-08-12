// Shared between the vendor stats route (app/api/v1/vendor/stores/
// [storeId]/stats/route.js, the dashboard's "Low stock" card) and the
// Paystack webhook's low-stock-crossing push notification - both need
// the exact same definition of "low", not two constants that could
// silently drift apart.
export const LOW_STOCK_THRESHOLD = 5;
