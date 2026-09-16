-- POS reconciliation/query indexes. Additive and safe on existing data.
CREATE INDEX IF NOT EXISTS idx_orders_pos_session_id ON orders (pos_session_id);
CREATE INDEX IF NOT EXISTS idx_orders_original_order_id ON orders (original_order_id);
