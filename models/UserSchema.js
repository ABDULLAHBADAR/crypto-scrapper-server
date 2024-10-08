const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// Create Schema
const UserSchema = new Schema({
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true
  },
  password: {
    type: String,
    required: true
  },
  paymentStatus:{
    type: String,
    enum: ['unpaid', 'pending', 'cancelled', 'completed'],
    default: 'unpaid'
  },
  nextPaymentDueDate: {
    type: Date
  },
  date: {
    type: Date,
    default: Date.now
  },
});

module.exports = mongoose.model("users", UserSchema);