const mongoose = require('mongoose');
const cleanJson = require('./plugins');

const CATEGORIES = ['tractor', 'harvester', 'seeder', 'other'];

const machineSchema = new mongoose.Schema(
  {
    owner_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Farmer', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    category: { type: String, required: true, enum: CATEGORIES },
    description: { type: String, trim: true, maxlength: 5000 },
    pickup_location: { type: String, required: true, trim: true, maxlength: 250 },
    is_active: { type: Boolean, default: true },
    lock_version: { type: Number, default: 0 }, // written inside transactions to serialise schedule changes
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false } }
);
machineSchema.index({ is_active: 1, category: 1 });
cleanJson(machineSchema, ['lock_version']);

module.exports = mongoose.model('Machine', machineSchema);
module.exports.CATEGORIES = CATEGORIES;
