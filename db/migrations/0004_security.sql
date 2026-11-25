-- Security hardening (25 Nov 2026).
-- Two-step codes tried on a session: after 5 it is signed out and needs a new email or WhatsApp code.
alter table sessions add column if not exists mfa_tries int not null default 0;
-- The last authenticator time step a member used, so the same code can't be used twice.
alter table members add column if not exists totp_last_step bigint;
