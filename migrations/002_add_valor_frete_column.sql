-- Migration: add valor_frete column to tiny_orders
alter table if exists public.tiny_orders
add column if not exists valor_frete numeric(14,2) default 0;
