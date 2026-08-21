-- Extra per-deliverable stats beyond reach/engagement — shares, saves and
-- new followers attributable to the post. Third-party creator content isn't
-- reachable via Coolkidz's own Instagram Graph API token (that only covers
-- accounts Coolkidz itself manages), so these stay manually entered from
-- whatever the creator reports/screenshots, same as reach and engagement
-- already were.
alter table influencer_agreement_deliverables add column if not exists shares int;
alter table influencer_agreement_deliverables add column if not exists saves int;
alter table influencer_agreement_deliverables add column if not exists new_followers int;

create or replace view v_gifting_roi as
select
  b.name                                  as brand,
  count(distinct a.id)                    as agreements,
  sum(p.quantity * p.rrp)                 as total_rrp_gifted,
  sum(p.quantity * p.cost_price)          as total_cost_gifted,
  sum(d.reach)                            as total_reach,
  sum(d.engagement)                       as total_engagement,
  sum(d.shares)                           as total_shares,
  sum(d.saves)                            as total_saves,
  sum(d.new_followers)                    as total_new_followers
from influencer_agreements a
join brands b                                        on b.id = a.brand_id
left join influencer_agreement_products p             on p.agreement_id = a.id
left join influencer_agreement_deliverables d          on d.agreement_id = a.id and d.status = 'live'
where a.status not in ('draft', 'terminated')
group by b.name;
