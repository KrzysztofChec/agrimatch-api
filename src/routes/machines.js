const router = require('express').Router();
const { z } = require('zod');
const Farmer = require('../models/Farmer');
const Machine = require('../models/Machine');
const AvailabilityPeriod = require('../models/AvailabilityPeriod');
const Booking = require('../models/Booking');
const requireAuth = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { parseId } = require('../utils/ids');
const { parsePagination, envelope } = require('../utils/pagination');
const { isValidDate } = require('../utils/dates');
const { notFound, forbidden, unprocessable } = require('../utils/errors');

const { CATEGORIES } = Machine;
router.use(requireAuth);

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  category: z.enum(CATEGORIES),
  pickup_location: z.string().trim().min(1).max(250),
  description: z.string().trim().max(5000).optional(),
}).strict();

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(5000),
  is_active: z.boolean(),
}).partial().strict().refine((o) => Object.keys(o).length > 0, { message: 'At least one field is required' });

// Public owner summary - never includes email.
async function ownerMap(machines) {
  const ids = [...new Set(machines.map((m) => String(m.owner_id)))];
  const farmers = await Farmer.find({ _id: { $in: ids } });
  return new Map(farmers.map((f) => [String(f._id), { id: f.id, display_name: f.display_name, town: f.town }]));
}
const present = (m, owners) => ({ ...m.toJSON(), owner: owners.get(String(m.owner_id)) });

// Machines with an offered period that fully covers [from, to] and no approved booking in that range.
async function machinesAvailableFor(from, to) {
  const candidates = await AvailabilityPeriod.find({ start_date: { $lte: from }, end_date: { $gte: to } }).distinct('machine_id');
  const occupied = await Booking.find({
    machine_id: { $in: candidates }, status: 'approved', start_date: { $lte: to }, end_date: { $gte: from },
  }).distinct('machine_id');
  const busy = new Set(occupied.map(String));
  return candidates.filter((id) => !busy.has(String(id)));
}

router.get('/', asyncHandler(async (req, res) => {
  const page = parsePagination(req.query);
  const filter = {};

  if (req.query.owner !== undefined) {
    if (req.query.owner !== 'me') throw unprocessable("owner must be 'me'");
    filter.owner_id = req.farmer._id; // includes inactive machines
  } else {
    filter.is_active = true;
  }
  if (req.query.category !== undefined) {
    if (!CATEGORIES.includes(req.query.category)) throw unprocessable(`category must be one of: ${CATEGORIES.join(', ')}`);
    filter.category = req.query.category;
  }
  const { available_from: from, available_to: to } = req.query;
  if ((from === undefined) !== (to === undefined)) throw unprocessable('available_from and available_to must be used together');
  if (from !== undefined) {
    if (!isValidDate(from) || !isValidDate(to)) throw unprocessable('available_from/available_to must be YYYY-MM-DD dates');
    if (to < from) throw unprocessable('available_to must not be before available_from');
    filter._id = { $in: await machinesAvailableFor(from, to) };
  }

  const [total, machines] = await Promise.all([
    Machine.countDocuments(filter),
    Machine.find(filter).sort({ _id: 1 }).skip(page.offset).limit(page.limit),
  ]);
  const owners = await ownerMap(machines);
  res.json(envelope(machines.map((m) => present(m, owners)), total, page));
}));

router.post('/', asyncHandler(async (req, res) => {
  const body = createSchema.parse(req.body);
  const machine = await Machine.create({ ...body, owner_id: req.farmer._id });
  const owners = await ownerMap([machine]);
  res.status(201).location(`/api/v1/machines/${machine.id}`).json(present(machine, owners));
}));

// Shared by machines + availability routes. Inactive machines are visible only to their owner.
async function getVisibleMachine(id, farmer) {
  const machine = await Machine.findById(parseId(id));
  if (!machine || (!machine.is_active && !machine.owner_id.equals(farmer._id))) throw notFound('Machine not found.');
  return machine;
}

router.get('/:machineId', asyncHandler(async (req, res) => {
  const machine = await getVisibleMachine(req.params.machineId, req.farmer);
  res.json(present(machine, await ownerMap([machine])));
}));

router.patch('/:machineId', asyncHandler(async (req, res) => {
  const machine = await getVisibleMachine(req.params.machineId, req.farmer);
  if (!machine.owner_id.equals(req.farmer._id)) throw forbidden('Only the owner can change this machine.');
  Object.assign(machine, patchSchema.parse(req.body));
  await machine.save();
  res.json(present(machine, await ownerMap([machine])));
}));

module.exports = router;
module.exports.getVisibleMachine = getVisibleMachine;
