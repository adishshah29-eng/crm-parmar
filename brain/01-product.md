# Product

## What this is

An in-house CRM for Parmar Properties, a luxury real estate channel partner operating in South Mumbai and Pune. It manages inbound property enquiries from first contact to booking.

It is **not** a product for sale. It serves one company only. Do not build multi-tenancy, organisation switching, billing, or plan tiers.

## Who uses it

| Role | Count | What they do |
|---|---|---|
| super_admin | 1 | Owns everything. Creates all users. Sees all data. |
| admin | 3 | Observes all work and assigns leads. Cannot create users. |
| manager | 6–7 | Runs one or more territories. Owns leads personally. Supervises sub_managers and callers. |
| sub_manager | 20 | Inherits a manager's territories. Takes over when the manager is on a site visit. |
| caller | 5–10 | Calls leads assigned to them. Sees nothing else. |

A territory is a project, a location, or both. Two managers can share a project and can share a location.

## What the business cares about

1. **No lead goes cold.** A live lead untouched for 45 working minutes escalates to the manager and super_admin.
2. **Leads stay inside their territory.** A caller sees only what is assigned to them. Managers see their own territories and their own team. Nobody browses the whole database except super_admin and admin.
3. **The lead database does not leak.** Export is restricted and logged.
4. **Work is visible.** Super_admin can see every manager's portfolio at a glance, today or all time.

## Projects in scope

Raheja Imperia Worli, Lodha Bellevue, Runwal 7 Mahalaxmi, Sattva Parel, Lodha Aureus Sewri, Supreme Rivana Pune. New projects get added over time — never hardcode a project list.

## Lead sources

99acres, Meta (Facebook/Instagram lead ads), MagicBricks, Housing, other listing agents, walk-ins, referrals.

For v1 all lead intake is **CSV upload**. No live webhooks yet. The ingestion pipeline is built so a webhook can be added later without changing anything downstream.

## Calling

For v1 callers dial from their **personal phones**. There is no cloud telephony, no call recording, no number masking that can actually be enforced. Call outcomes are entered manually. This is a known limitation, accepted for v1.

## Out of scope for v1

- Property/unit inventory management
- Brokerage and commission tracking
- Cloud telephony and call recording
- WhatsApp Business API
- Mobile app (React Native comes after web)
- Multi-tenancy
- UrbanDhan Finance Advisory (Parmar Properties only)
