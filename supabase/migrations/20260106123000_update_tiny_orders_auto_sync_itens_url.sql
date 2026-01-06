-- Update tiny_orders_auto_sync_itens to use production domain
set search_path = public, extensions;
set check_function_bodies = off;

create or replace function public.tiny_orders_auto_sync_itens()
returns trigger
language plpgsql
as $$
begin
  if new.tiny_id is null then
    return new;
  end if;

  perform net.http_post(
    url := 'https://gestao.ambientautilidades.com.br/api/tiny/sync/itens',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'User-Agent', 'Supabase-Trigger/1.0'
    ),
    body := jsonb_build_object(
      'tinyIds', jsonb_build_array(to_jsonb(new.tiny_id))
    )
  );

  return new;
end;
$$;
