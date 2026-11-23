const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const config = require('../config');
const Farmer = require('../models/Farmer');
const asyncHandler = require('../utils/asyncHandler');
const { unauthorized, conflict } = require('../utils/errors');

// bcrypt ignores bytes after the first 72, including in UTF-8 passwords.
const passwordSchema = z.string().max(100).refine((value) => Buffer.byteLength(value, 'utf8') <= 72, {
  message: 'password must be at most 72 UTF-8 bytes',
});

const registerSchema = z.object({
  display_name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email().max(254),
  town: z.string().trim().min(1).max(100),
  password: z.string().min(8).pipe(passwordSchema),
}).strict();

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).pipe(passwordSchema),
}).strict();

const sign = (farmer) =>
  jwt.sign({ sub: String(farmer._id) }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });

router.post('/register', asyncHandler(async (req, res) => {
  const body = registerSchema.parse(req.body);
  if (await Farmer.exists({ email: body.email })) throw conflict('This email is already registered.');
  const farmer = await Farmer.create({
    display_name: body.display_name,
    email: body.email,
    town: body.town,
    password_hash: await bcrypt.hash(body.password, 10),
  });
  res.status(201).json({ token: sign(farmer), farmer });
}));

router.post('/login', asyncHandler(async (req, res) => {
  const body = loginSchema.parse(req.body);
  const farmer = await Farmer.findOne({ email: body.email });
  const ok = farmer && (await bcrypt.compare(body.password, farmer.password_hash));
  if (!ok) throw unauthorized('Incorrect email or password.');
  res.json({ token: sign(farmer), farmer });
}));

module.exports = router;
