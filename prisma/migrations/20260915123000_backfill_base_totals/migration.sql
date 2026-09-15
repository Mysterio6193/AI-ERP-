-- Backfill baseTotal for documents raised before multi-currency existed.
--
-- The multi-currency migration added `baseTotal` with DEFAULT 0, which is
-- right for the column and wrong for the rows already there: every existing
-- order and invoice was raised in the entity's own currency, so its base
-- total is its total and its rate is 1. Left at zero they report as having
-- sold nothing, which is how a group revenue figure comes out silently empty
-- while the order count looks healthy.
--
-- Scoped to rows that still hold the default, so re-running cannot overwrite
-- a genuine foreign-currency document.

UPDATE "SalesOrder"
   SET "baseTotal" = "totalAmount",
       "exchangeRate" = 1
 WHERE "baseTotal" = 0
   AND "exchangeRate" = 1
   AND "totalAmount" <> 0;

UPDATE "Invoice"
   SET "baseTotal" = "totalAmount",
       "exchangeRate" = 1
 WHERE "baseTotal" = 0
   AND "exchangeRate" = 1
   AND "totalAmount" <> 0;
