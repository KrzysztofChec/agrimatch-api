// Demo data from the project doc: Anna's tractor, offered 1-15 June 2027, and Piotr.
// WARNING: wipes the four AgriMatch collections.
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { connectDb } = require('../src/db');
const Farmer = require('../src/models/Farmer');
const Machine = require('../src/models/Machine');
const AvailabilityPeriod = require('../src/models/AvailabilityPeriod');
const Booking = require('../src/models/Booking');

(async () => {
  await connectDb();
  await Promise.all([Farmer.deleteMany({}), Machine.deleteMany({}), AvailabilityPeriod.deleteMany({}), Booking.deleteMany({})]);
  const password_hash = await bcrypt.hash('password123', 10);
  const [anna, piotr] = await Farmer.create([
    { display_name: 'Anna Kowalska', email: 'anna@example.com', town: 'Brzeziny', password_hash },
    { display_name: 'Piotr Nowak', email: 'piotr@example.com', town: 'Brzeziny', password_hash },
  ]);
  const tractor = await Machine.create({
    owner_id: anna._id, name: 'John Deere 5075E', category: 'tractor',
    description: '75 HP utility tractor', pickup_location: "Anna's farm, Brzeziny",
  });
  await AvailabilityPeriod.create({ machine_id: tractor._id, start_date: '2027-06-01', end_date: '2027-06-15' });
  console.log('Seeded. Logins: anna@example.com / piotr@example.com, password: password123');
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
