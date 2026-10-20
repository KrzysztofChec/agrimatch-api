const { z } = require('zod');
const { timezone } = require('../config');

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(s) {
  if (typeof s !== 'string' || !ISO.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// "Today" in Europe/Warsaw as YYYY-MM-DD. ISO date strings compare correctly as text.
function todayLocal() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

const dateSchema = z.string().refine(isValidDate, { message: 'must be a valid date in YYYY-MM-DD format' });

module.exports = { isValidDate, todayLocal, dateSchema };
