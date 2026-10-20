// Tests use their own database and drop it afterwards - never your dev data.
process.env.MONGODB_URI = process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017/agrimatch_test';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { connectDb } = require('../src/db');
const app = require('../src/app');

let server; let base;

async function call(method, path, { token, body } = {}) {
  const res = await fetch(`${base}/api/v1${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

test.before(async () => {
  await connectDb();
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  server.close();
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('AgriMatch booking lifecycle', async () => {
  const reg = (n) => call('POST', '/auth/register', {
    body: { display_name: n, email: `${n.toLowerCase()}@test.io`, town: 'Brzeziny', password: 'password123' },
  });
  const anna = (await reg('Anna')).body;
  const piotr = (await reg('Piotr')).body;
  const marek = (await reg('Marek')).body;

  assert.equal((await call('GET', '/machines')).status, 401);
  assert.equal((await reg('Anna')).status, 409);

  const m = await call('POST', '/machines', { token: anna.token, body: { name: 'Tractor', category: 'tractor', pickup_location: 'Farm' } });
  assert.equal(m.status, 201);
  assert.equal(m.body.owner.email, undefined);
  assert.equal((await call('POST', '/machines', { token: anna.token, body: { name: 'x', category: 'rocket', pickup_location: 'y' } })).status, 422);

  const p = await call('POST', `/machines/${m.body.id}/availability-periods`, { token: anna.token, body: { start_date: '2099-06-01', end_date: '2099-06-15' } });
  assert.equal(p.status, 201);
  assert.equal((await call('POST', `/machines/${m.body.id}/availability-periods`, { token: anna.token, body: { start_date: '2099-06-10', end_date: '2099-06-20' } })).status, 409);
  assert.equal((await call('POST', `/machines/${m.body.id}/availability-periods`, { token: piotr.token, body: { start_date: '2099-07-01', end_date: '2099-07-05' } })).status, 403);

  const found = await call('GET', '/machines?available_from=2099-06-10&available_to=2099-06-12', { token: piotr.token });
  assert.equal(found.body.data.length, 1);

  const req = (token, s, e) => call('POST', '/bookings', { token, body: { availability_period_id: p.body.id, start_date: s, end_date: e, plot_location: 'North field' } });
  assert.equal((await req(anna.token, '2099-06-10', '2099-06-12')).status, 403);
  assert.equal((await req(piotr.token, '2099-05-30', '2099-06-02')).status, 422);
  const b1 = await req(piotr.token, '2099-06-10', '2099-06-12');
  const b2 = await req(marek.token, '2099-06-11', '2099-06-13');
  assert.equal(b1.status, 201);
  assert.equal(b1.body.status, 'pending');
  assert.equal(b2.status, 201); // pending requests may overlap

  assert.equal((await call('GET', `/bookings/${b1.body.id}`, { token: marek.token })).status, 404);
  assert.equal((await call('PATCH', `/bookings/${b1.body.id}`, { token: piotr.token, body: { status: 'approved' } })).status, 403);

  // competing approvals: exactly one wins
  const [r1, r2] = await Promise.all([
    call('PATCH', `/bookings/${b1.body.id}`, { token: anna.token, body: { status: 'approved' } }),
    call('PATCH', `/bookings/${b2.body.id}`, { token: anna.token, body: { status: 'approved' } }),
  ]);
  assert.deepEqual([r1.status, r2.status].sort(), [200, 409]);

  const periods = await call('GET', `/machines/${m.body.id}/availability-periods`, { token: marek.token });
  assert.equal(periods.body.data[0].approved_bookings.length, 1);
  assert.equal((await call('DELETE', `/machines/${m.body.id}/availability-periods/${p.body.id}`, { token: anna.token })).status, 409);

  const winner = r1.status === 200 ? b1 : b2;
  const winnerToken = r1.status === 200 ? piotr.token : marek.token;
  assert.equal((await call('PATCH', `/bookings/${winner.body.id}`, { token: winnerToken, body: { status: 'cancelled' } })).status, 200);
  assert.equal((await call('PATCH', `/bookings/${winner.body.id}`, { token: anna.token, body: { status: 'approved' } })).status, 409);

  const bad = await call('POST', '/bookings', { token: piotr.token, body: { nope: 1 } });
  assert.equal(bad.status, 422);
  assert.equal(bad.body.status, 422);
});
