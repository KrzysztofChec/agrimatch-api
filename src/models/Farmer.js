const mongoose = require('mongoose');
const cleanJson = require('./plugins');

const farmerSchema = new mongoose.Schema(
  {
    display_name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    town: { type: String, required: true, trim: true, maxlength: 100 },
    password_hash: { type: String, required: true },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false } }
);
cleanJson(farmerSchema, ['password_hash']);

module.exports = mongoose.model('Farmer', farmerSchema);
