-- Cash change handed back on a POS / transfer OVERPAYMENT is money that
-- leaves the physical drawer, but it is NOT a cash sale and NOT a
-- discretionary paid-out. It was previously written as a NEGATIVE
-- `cash_sale` movement, which read as nonsense in the Z report
-- ("Cash sale -N2,000" on an order paid entirely by transfer).
--
-- New dedicated kind so it shows as its own line and never pollutes the
-- cash-sale total or the month-end "cash taken out of the drawer" fraud
-- metric. Additive + safe on live data; existing rows are untouched.
ALTER TYPE cash_movement_kind ADD VALUE IF NOT EXISTS 'change_out';
