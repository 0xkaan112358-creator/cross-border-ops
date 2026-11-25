-- Where a SKU's sea/air transit days come from: 'default' (marketplace default), 'erp' (median of delivered
-- ERP shipments) or 'manual' (SKU master import). ERP syncs never overwrite 'manual'.
alter table skus add column if not exists transit_source text not null default 'default';
