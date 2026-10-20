const mongoose = require('mongoose');
const cleanJson = require('./plugins');

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const periodSchema = new mongoose.Schema(
  {
    machine_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Machine', required: true },
    start_date: { type: String, required: true, match: DATE },
    end_date: { type: String, required: true, match: DATE },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false } }
);
periodSchema.index({ machine_id: 1, start_date: 1, end_date: 1 });
cleanJson(periodSchema);

module.exports = mongoose.model('AvailabilityPeriod', periodSchema);
