# AgriMatch API

Cooperative farm-equipment sharing API. Node.js 20+, Express, MongoDB/Mongoose, JWT authentication, Postman, Render, GitHub Actions.

## Requirements

- Node.js 20 or newer (`package.json` `engines`).
- MongoDB (local instance or Atlas). Atlas, other replica sets, and sharded clusters enable cross-instance transaction locking; see [Concurrency](#concurrency).

## Run locally

```bash
npm install
cp .env.example .env        # set MONGODB_URI and JWT_SECRET
npm run seed                # optional demo data; wipes Farmers, Machines, AvailabilityPeriods, Bookings
npm run dev                 # http://localhost:3000
```

`npm start` runs the server without watch mode. `GET /health` is public and returns `{ "status": "ok" }`.

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/agrimatch` | MongoDB connection string |
| `JWT_SECRET` | `dev-secret-change-me` when unset; `.env.example` has a placeholder | JWT signing secret; startup fails in production if unset |
| `JWT_EXPIRES_IN` | `7d` | Token lifetime |
| `NODE_ENV` | unset | `production` requires `JWT_SECRET`; `test` disables request logging |
| `TEST_MONGODB_URI` | `mongodb://127.0.0.1:27017/agrimatch_test` | Test database; `npm test` drops it |

All "today" checks use the `Europe/Warsaw` time zone.

### Seed data

`npm run seed` creates:

- Anna Kowalska (`anna@example.com`) and Piotr Nowak (`piotr@example.com`), both with password `password123`.
- Anna's `John Deere 5075E` tractor.
- An availability period from `2027-06-01` to `2027-06-15`.

## Tests and CI

```bash
npm test
```

`test/api.test.js` uses Node's built-in test runner and needs a running MongoDB. It uses the `TEST_MONGODB_URI` environment variable when set, otherwise the `agrimatch_test` database, and drops that database when it finishes. It covers authentication, machine creation, availability periods, availability search, the booking lifecycle, concurrent approvals, and validation/error statuses.

CI (`.github/workflows/ci.yml`) runs on pushes to `main` and on pull requests: Node 20 with a `mongo:7` service, `npm ci`, then `npm test`. The committed `package-lock.json` is required for `npm ci` and for `actions/setup-node`'s npm cache.

## Auth

`POST /api/v1/auth/register` takes `{ "display_name", "email", "town", "password" }` and returns `201 { token, farmer }`. The password must be 8-100 characters and at most 72 UTF-8 bytes. Emails are unique; a duplicate returns 409.

`POST /api/v1/auth/login` takes `{ "email", "password" }` and returns `200 { token, farmer }`. Login rejects passwords over 72 UTF-8 bytes with 422.

Every `/api/v1` endpoint except these two requires `Authorization: Bearer <token>`. `GET /health` is public. Tokens expire after `JWT_EXPIRES_IN` (default `7d`); malformed or expired tokens, invalid token subjects, and tokens for farmers that no longer exist are rejected with 401.

Identity comes from the verified token: `owner_id`, `requester_id`, and `machine_id` are never accepted from the request body. The farmer object never includes `password_hash`; a machine's `owner` summary contains only `id`, `display_name`, and `town` (no email).

## Endpoints

All paths are under `/api/v1` except `/health`.

| Method | Path | Access | Body / query | Success |
|---|---|---|---|---|
| GET | `/health` | public | - | 200 `{ "status": "ok" }` |
| POST | `/auth/register` | public | `display_name`, `email`, `town`, `password` | 201 `{ token, farmer }` |
| POST | `/auth/login` | public | `email`, `password` | 200 `{ token, farmer }` |
| GET | `/machines` | authenticated | `category`, `owner=me`, `available_from` + `available_to`, `limit`, `offset` | 200 list |
| POST | `/machines` | authenticated | `name`, `category`, `pickup_location`, `description` (optional) | 201 |
| GET | `/machines/:id` | authenticated; inactive machines owner-only | - | 200 |
| PATCH | `/machines/:id` | owner | `name`, `description`, `is_active` (at least one) | 200 |
| GET | `/machines/:id/availability-periods` | authenticated; inactive machines owner-only | `limit`, `offset` | 200 list; each period includes `approved_bookings` |
| POST | `/machines/:id/availability-periods` | owner | `start_date`, `end_date` | 201 |
| DELETE | `/machines/:id/availability-periods/:periodId` | owner | - | 204 if the period has no bookings |
| GET | `/bookings` | authenticated | `role` (`requester` or `owner`), `status`, `limit`, `offset` | 200 list |
| POST | `/bookings` | authenticated, not the machine owner | `availability_period_id`, `start_date`, `end_date`, `plot_location` | 201 |
| GET | `/bookings/:id` | requester or machine owner | - | 200; everyone else gets 404 |
| PATCH | `/bookings/:id` | requester or machine owner | `status` (`approved`, `rejected`, `cancelled`) | 200 when the transition is allowed |

Machine `category` is one of `tractor`, `harvester`, `seeder`, `other`; new machines are active by default. Dates are `YYYY-MM-DD` strings.

### Responses

- Single resources and auth responses are returned as the object itself. List endpoints return `{ data, pagination: { limit, offset, total } }`.
- Resources use `id` (string) instead of `_id`; `created_at` is an ISO timestamp. Internal fields (`password_hash`, `lock_version`) are omitted.
- Errors use `application/problem+json` with `{ type, title, status, detail, instance }`.
- Status codes: 400 malformed JSON, 401 missing/invalid token, 403 not allowed, 404 unknown or not visible, 409 conflict, 413 body over 100 kb, 415 non-JSON body on POST/PATCH, 422 validation or unknown body field, 500 unexpected error.
- Pagination: `limit` defaults to 20 and must be a base-10 integer from 1 to 100; `offset` defaults to 0 and must be a base-10 integer >= 0 within the safe integer range. Invalid values return 422.

## Rules

### Machines and availability

- The default `/machines` list contains active machines only. `owner=me` lists the caller's machines, including inactive ones; inactive machines are visible only to their owner. `owner` accepts only `me`.
- Inactive machines cannot receive new availability periods or booking requests, and bookings for them cannot be approved.
- New availability periods and booking requests must start after today in `Europe/Warsaw`; `end_date` must not be before `start_date`.
- Availability periods on the same machine cannot overlap (409).
- `available_from` and `available_to` must be supplied together and must be valid dates with `available_to >= available_from`. The result contains machines with an offered period covering the whole range and no approved booking overlapping it. Pending bookings do not remove a machine from the result.
- A period can only be deleted while no booking of any status references it (409 otherwise).
- `GET /machines/:id/availability-periods` exposes only the date ranges of approved bookings, not the requester or plot details.

### Bookings

Booking dates must fit inside the selected availability period (inclusive). A farmer cannot book their own machine (403). New bookings start as `pending`.

| From | To | Who |
|---|---|---|
| `pending` | `approved` | machine owner |
| `pending` | `rejected` | machine owner |
| `pending` | `cancelled` | requester |
| `approved` | `cancelled` | requester or machine owner |

`rejected` and `cancelled` are final, and any other transition returns 409. A participant attempting a transition reserved for the other role gets 403. No status change is allowed once `start_date` is today or earlier in `Europe/Warsaw` (409).

`GET /bookings` returns bookings where the caller is the requester or the machine owner; `role=requester` and `role=owner` narrow the result to one side. `status` accepts `pending`, `approved`, `rejected`, or `cancelled`.

Pending requests may overlap. A booking request that overlaps an approved booking on the same machine is rejected with 409, and approval repeats the check. Only the requester or the machine owner can read or change a booking; everyone else gets 404.

### Concurrency

Machine updates and schedule changes for a machine (creating or deleting an availability period, creating a booking, changing a booking status) are serialised by an in-process mutex per machine. When MongoDB supports transactions (Atlas, a replica set, or a sharded cluster), the change also runs in a transaction that writes to the machine document, serialising across API instances. A standalone MongoDB only gets the in-process guarantee.

### Brief mapping

The brief's `POST /machinery/list` is split into `POST /machines` followed by `POST /machines/:id/availability-periods`. The brief's `POST /bookings/request` maps to `POST /bookings`.

## Deploy (Render)

1. Create a MongoDB Atlas cluster and copy its connection string.
2. Push the repository to GitHub and create a Render Blueprint from `render.yaml`.
3. Set `MONGODB_URI` in the Render dashboard. Render generates `JWT_SECRET`.

The Render service uses Node 20, runs `npm start`, and health-checks `/health`. Production startup fails if `JWT_SECRET` is unset.

## Postman

Public workspace: [AgriMatch on Postman](https://www.postman.com/selfdefenseteam/agrimatch).

The repository also contains `postman/agrimatch.postman_collection.json`, a Collection v2.1 with 43 requests in six folders: health, auth, machines, availability periods, bookings, and security/validation.

Import the JSON into Postman, or open the hosted workspace. Set the `baseUrl` collection variable (default `http://localhost:3000`; use the Render URL for the deployed API), and run it with the Collection Runner in collection order. Each run registers fresh users with a `runId`, chains tokens and IDs through collection variables, and every request has test assertions. The collection creates its own machine and dates, so `npm run seed` is not required.

### Manual smoke flow

After `npm run seed`:

1. `POST /api/v1/auth/login` as Anna and use the returned token.
2. `POST /api/v1/machines`, then `POST /api/v1/machines/:id/availability-periods` with dates after today.
3. `POST /api/v1/auth/login` as Piotr, `POST /api/v1/bookings` with the period ID and dates inside it, then log in as Anna and `PATCH /api/v1/bookings/:id` with `{ "status": "approved" }`.
