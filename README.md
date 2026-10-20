# AgriMatch API

Cooperative farm-equipment sharing API - implementation of the project blueprint.
Stack: Node.js 20+, Express, MongoDB + Mongoose, Postman, Render, GitHub Actions.

## Run locally
```bash
npm install
cp .env.example .env        # set MONGODB_URI and JWT_SECRET
npm run seed                # optional demo data (wipes the collections!)
npm run dev                 # http://localhost:3000
npm test                    # needs a running MongoDB
```
Seed logins: `anna@example.com` / `piotr@example.com`, password `password123`.

## Auth
The blueprint says identity comes from verified authentication, so every endpoint except
`/auth/*` needs `Authorization: Bearer <token>`.
`POST /api/v1/auth/register` and `POST /api/v1/auth/login` return `{ token, farmer }`.

## Endpoints (all under `/api/v1`)
| Method | Path | Who | Result |
|---|---|---|---|
| GET | /machines | any farmer (`category`, `owner=me`, `available_from`+`available_to`, `limit`, `offset`) | 200 |
| POST | /machines | any farmer | 201 |
| GET | /machines/:id | any farmer | 200 |
| PATCH | /machines/:id (name, description, is_active) | owner | 200 |
| GET | /machines/:id/availability-periods | any farmer | 200 |
| POST | /machines/:id/availability-periods | owner | 201 |
| DELETE | /machines/:id/availability-periods/:periodId | owner, unused periods only | 204 |
| GET | /bookings (`role`, `status`) | participants | 200 |
| POST | /bookings | other farmers | 201 |
| GET | /bookings/:id | participants | 200 |
| PATCH | /bookings/:id `{ "status": ... }` | by transition | 200 |

Mapping from the brief: `POST /machinery/list` = create machine + create availability period;
`POST /bookings/request` = `POST /api/v1/bookings`. Confirm path requirements with your teacher.

## Rules implemented
- Dates are inclusive `YYYY-MM-DD`; new offers/requests must start after today (Europe/Warsaw).
- Booking lifecycle: `pending -> approved | rejected` (owner), `pending -> cancelled` (requester),
  `approved -> cancelled` (either). Rejected/cancelled are final; nothing changes once it has started.
- Pending requests may overlap, approved ones cannot (409). Approvals are serialised per machine
  (in-process mutex + MongoDB transaction on Atlas/replica sets).
- Errors use `application/problem+json`; 415 for non-JSON bodies, 422 for invalid/unknown fields.
- Pagination: `limit` (default 20, max 100) and `offset`; responses are `{ data, pagination }`.

## Deploy (Render)
1. Create a free MongoDB Atlas cluster and copy the connection string.
2. Push to GitHub, then create a Render Blueprint from this repo (`render.yaml`).
3. Set `MONGODB_URI` in the Render dashboard. `JWT_SECRET` is generated for you.

## Postman quick flow
1. `POST /auth/login` (Anna) -> copy `token`, use it as a Bearer token.
2. `POST /machines`, then `POST /machines/{id}/availability-periods`.
3. Log in as Piotr -> `POST /bookings` -> log in as Anna -> `PATCH /bookings/{id}` `{"status":"approved"}`.
