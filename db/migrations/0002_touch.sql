-- A post's updated_at moves whenever it, or anything people do to it, changes:
-- the browser asks "what changed since…" every few seconds.
create or replace function touch_post() returns trigger language plpgsql as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end $$;
create trigger posts_touch before update on posts for each row execute function touch_post();

create or replace function touch_parent_post() returns trigger language plpgsql as $$
begin
  update posts set updated_at = clock_timestamp() where id = coalesce(new.post_id, old.post_id);
  return null;
end $$;
create trigger reactions_touch after insert or update or delete on reactions for each row execute function touch_parent_post();
create trigger poll_votes_touch after insert or update or delete on poll_votes for each row execute function touch_parent_post();
create trigger responses_touch after insert or update or delete on responses for each row execute function touch_parent_post();
create trigger rsvps_touch after insert or update or delete on rsvps for each row execute function touch_parent_post();
