-- posts テーブル作成とRLS/ポリシー（開発向けに緩め）
create table if not exists public.posts (
  id bigserial primary key,
  author text null,
  content text not null check (char_length(content) between 1 and 500),
  created_at timestamptz not null default now()
);

alter table public.posts enable row level security;

-- 匿名セレクト許可（公開掲示板用の簡易設定。必要に応じて絞る）
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'posts' and policyname = 'anon read posts'
  ) then
    create policy "anon read posts" on public.posts for select using (true);
  end if;
end $$;

-- 匿名インサート許可（スパム対策はアプリ側で検討）
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'posts' and policyname = 'anon insert posts'
  ) then
    create policy "anon insert posts" on public.posts for insert with check (true);
  end if;
end $$;

