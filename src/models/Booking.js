const mongoose = require('mongoose');
const cleanJson = require('./plugins');

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES = ['pending', 'approved', 'rejected', 'cancelled'];

const bookingSchema = new mongoose.Schema(
  {
    availability_period_id: { type: mongoose.Schema.Types.ObjectId, ref: 'AvailabilityPeriod', required: true, index: true },
    machine_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Machine', required: true }, // derived from the period, set by the server
    requester_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Farmer', required: true, index: true },
    start_date: { type: String, required: true, match: DATE },
    end_date: { type: String, required: true, match: DATE },
    plot_location: { type: String, required: true, trim: true, maxlength: 250 },
    status: { type: String, enum: STATUSES, default: 'pending' },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false } }
);
bookingSchema.index({ machine_id: 1, status: 1, start_date: 1, end_date: 1 });
cleanJson(bookingSchema);

module.exports = mongoose.model('Booking', bookingSchema);
module.exports.STATUSES = STATUSES;
