const router = require('express').Router({ mergeParams: true });
const { z } = require('zod');
const Machine = require('../models/Machine');
const AvailabilityPeriod = require('../models/AvailabilityPeriod');
const Booking = require('../models/Booking');
const requireAuth = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { runLocked } = require('../utils/lock');
const { parseId } = require('../utils/ids');
const { parsePagination, envelope } = require('../utils/pagination');
const { dateSchema, todayLocal } = require('../utils/dates');
const { forbidden, notFound, conflict, unprocessable } = require('../utils/errors');
const { getVisibleMachine } = require('./machines');

router.use(requireAuth);

const createSchema = z.object({ start_date: dateSchema, end_date: dateSchema }).strict();

// GET /machines/:machineId/availability-periods
router.get('/', asyncHandler(async (req, res) => {
  const machine = await getVisibleMachine(req.params.machineId, req.farmer);
  const page = parsePagination(req.query);
  const filter = { machine_id: machine._id };
  const [total, periods] = await Promise.all([
    AvailabilityPeriod.countDocuments(filter),
    AvailabilityPeriod.find(filter).sort({ _id: 1 }).skip(page.offset).limit(page.limit),
  ]);
  // Approved ranges only - no requester or plot details.
  const approved = await Booking.find({
    availability_period_id: { $in: periods.map((p) => p._id) }, status: 'approved',
  }).sort({ start_date: 1 });
  const data = periods.map((p) => ({
    ...p.toJSON(),
    approved_bookings: approved
      .filter((b) => b.availability_period_id.equals(p._id))
      .map((b) => ({ start_date: b.start_date, end_date: b.end_date })),
  }));
  res.json(envelope(data, total, page));
}));

// POST /machines/:machineId/availability-periods
router.post('/', asyncHandler(async (req, res) => {
  const machine = await getVisibleMachine(req.params.machineId, req.farmer);
  if (!machine.owner_id.equals(req.farmer._id)) throw forbidden('Only the owner can offer dates.');
  const body = createSchema.parse(req.body);
  if (body.end_date < body.start_date) throw unprocessable('end_date must not be before start_date');
  if (body.start_date <= todayLocal()) throw unprocessable('start_date must be after today');

  const period = await runLocked(machine._id, async (session) => {
    const fresh = await Machine.findById(machine._id).session(session);
    if (!fresh.is_active) throw conflict('An inactive machine cannot be offered.');
    const clash = await AvailabilityPeriod.exists({
      machine_id: machine._id, start_date: { $lte: body.end_date }, end_date: { $gte: body.start_date },
    }).session(session);
    if (clash) throw conflict('These dates overlap an existing availability period.');
    const [created] = await AvailabilityPeriod.create([{ machine_id: machine._id, ...body }], { session });
    return created;
  });
  res.status(201)
    .location(`/api/v1/machines/${machine.id}/availability-periods/${period.id}`)
    .json({ ...period.toJSON(), approved_bookings: [] });
}));

// DELETE /machines/:machineId/availability-periods/:periodId
router.delete('/:periodId', asyncHandler(async (req, res) => {
  const machine = await getVisibleMachine(req.params.machineId, req.farmer);
  if (!machine.owner_id.equals(req.farmer._id)) throw forbidden('Only the owner can remove periods.');
  const periodId = parseId(req.params.periodId);

  await runLocked(machine._id, async (session) => {
    const period = await AvailabilityPeriod.findOne({ _id: periodId, machine_id: machine._id }).session(session);
    if (!period) throw notFound('Availability period not found.');
    if (await Booking.exists({ availability_period_id: period._id }).session(session)) {
      throw conflict('This period has bookings and cannot be removed.');
    }
    await period.deleteOne({ session });
  });
  res.status(204).end();
}));

module.exports = router;
