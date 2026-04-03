create table if not exists yz_users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  created_at timestamp default now()
);

create table if not exists yz_data (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references yz_users(id),
  key text not null,
  value jsonb,
  updated_at timestamp default now(),
  unique(user_id, key)
);

create index on yz_data(user_id, key);
