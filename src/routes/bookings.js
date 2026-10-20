const router = require('express').Router();
const { z } = require('zod');
const Machine = require('../models/Machine');
const AvailabilityPeriod = require('../models/AvailabilityPeriod');
const Booking = require('../models/Booking');
const requireAuth = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { runLocked } = require('../utils/lock');
const { idSchema, parseId } = require('../utils/ids');
const { parsePagination, envelope } = require('../utils/pagination');
const { dateSchema, todayLocal } = require('../utils/dates');
const { forbidden, notFound, conflict, unprocessable } = require('../utils/errors');

const { STATUSES } = Booking;
router.use(requireAuth);

const createSchema = z.object({
  availability_period_id: idSchema,
  start_date: dateSchema,
  end_date: dateSchema,
  plot_location: z.string().trim().min(1).max(250),
}).strict();

const patchSchema = z.object({ status: z.enum(['approved', 'rejected', 'cancelled']) }).strict();

// Approved booking that overlaps [start, end] on this machine, excluding `exceptId`.
const approvedClash = (machineId, start, end, exceptId, session) =>
  Booking.exists({
    machine_id: machineId, status: 'approved',
    start_date: { $lte: end }, end_date: { $gte: start },
    ...(exceptId && { _id: { $ne: exceptId } }),
  }).session(session);

// GET /bookings?role=requester|owner&status=...
router.get('/', asyncHandler(async (req, res) => {
  const page = parsePagination(req.query);
  const { role, status } = req.query;
  if (role !== undefined && !['requester', 'owner'].includes(role)) throw unprocessable("role must be 'requester' or 'owner'");
  if (status !== undefined && !STATUSES.includes(status)) throw unprocessable(`status must be one of: ${STATUSES.join(', ')}`);

  const me = req.farmer._id;
  const myMachines = role === 'requester' ? [] : await Machine.find({ owner_id: me }).distinct('_id');
  const asRequester = { requester_id: me };
  const asOwner = { machine_id: { $in: myMachines } };
  const filter = role === 'requester' ? asRequester : role === 'owner' ? asOwner : { $or: [asRequester, asOwner] };
  if (status) filter.status = status;

  const [total, bookings] = await Promise.all([
    Booking.countDocuments(filter),
    Booking.find(filter).sort({ _id: 1 }).skip(page.offset).limit(page.limit),
  ]);
  res.json(envelope(bookings.map((b) => b.toJSON()), total, page));
}));

// POST /bookings
router.post('/', asyncHandler(async (req, res) => {
  const body = createSchema.parse(req.body);
  if (body.end_date < body.start_date) throw unprocessable('end_date must not be before start_date');
  if (body.start_date <= todayLocal()) throw unprocessable('start_date must be after today');

  const period = await AvailabilityPeriod.findById(body.availability_period_id);
  if (!period) throw notFound('Availability period not found.');
  if (body.start_date < period.start_date || body.end_date > period.end_date) {
    throw unprocessable('The requested dates must fit inside the offered period.');
  }
  const machine = await Machine.findById(period.machine_id);
  if (machine.owner_id.equals(req.farmer._id)) throw forbidden('You cannot book your own machine.');

  const booking = await runLocked(machine._id, async (session) => {
    const fresh = await Machine.findById(machine._id).session(session);
    if (!fresh.is_active) throw conflict('This machine is not accepting requests.');
    if (await approvedClash(machine._id, body.start_date, body.end_date, null, session)) {
      throw conflict('These dates are already reserved.');
    }
    const [created] = await Booking.create([{
      availability_period_id: period._id,
      machine_id: machine._id,
      requester_id: req.farmer._id, // from the token, never the body
      start_date: body.start_date,
      end_date: body.end_date,
      plot_location: body.plot_location,
      status: 'pending',
    }], { session });
    return created;
  });
  res.status(201).location(`/api/v1/bookings/${booking.id}`).json(booking);
}));

// Only participants may see a booking; everyone else gets 404.
async function getParticipantBooking(id, farmer) {
  const booking = await Booking.findById(parseId(id));
  if (!booking) throw notFound('Booking not found.');
  const machine = await Machine.findById(booking.machine_id);
  const isRequester = booking.requester_id.equals(farmer._id);
  const isOwner = machine.owner_id.equals(farmer._id);
  if (!isRequester && !isOwner) throw notFound('Booking not found.');
  return { booking, machine, isRequester, isOwner };
}

router.get('/:bookingId', asyncHandler(async (req, res) => {
  const { booking } = await getParticipantBooking(req.params.bookingId, req.farmer);
  res.json(booking);
}));

// Lifecycle: pending -> approved|rejected (owner), pending -> cancelled (requester),
// approved -> cancelled (either). rejected/cancelled are final. Nothing changes once it has started.
const TRANSITIONS = {
  'pending>approved': 'owner',
  'pending>rejected': 'owner',
  'pending>cancelled': 'requester',
  'approved>cancelled': 'either',
};

router.patch('/:bookingId', asyncHandler(async (req, res) => {
  const { status: next } = patchSchema.parse(req.body);
  const ctx = await getParticipantBooking(req.params.bookingId, req.farmer);
  const { isRequester, isOwner } = ctx;

  const check = (booking) => {
    if (booking.start_date <= todayLocal()) throw conflict('This booking has already started and can no longer change.');
    const who = TRANSITIONS[`${booking.status}>${next}`];
    if (!who) throw conflict(`A ${booking.status} booking cannot become ${next}.`);
    const allowed = who === 'either' || (who === 'owner' && isOwner) || (who === 'requester' && isRequester);
    if (!allowed) throw forbidden(`Only the ${who} can set this status.`);
  };
  check(ctx.booking); // fast fail before taking the lock

  const updated = await runLocked(ctx.machine._id, async (session) => {
    const booking = await Booking.findById(ctx.booking._id).session(session); // re-read under lock
    check(booking);
    if (next === 'approved') {
      const machine = await Machine.findById(ctx.machine._id).session(session);
      if (!machine.is_active) throw conflict('This machine is not active, so requests cannot be approved.');
      if (await approvedClash(machine._id, booking.start_date, booking.end_date, booking._id, session)) {
        throw conflict('The requested dates are already reserved by another approved booking.');
      }
    }
    booking.status = next;
    await booking.save({ session });
    return booking;
  });
  res.json(updated);
}));

module.exports = router;
