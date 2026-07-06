// tests/setup.js — shared test helpers
const mongoose = require('mongoose');

const TEST_DB = process.env.MONGO_URI_TEST || process.env.MONGO_URI;

const connectTestDB = async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(TEST_DB);
  }
};

const disconnectTestDB = async () => {
  await mongoose.connection.close();
};

const clearCollection = async (Model) => {
  await Model.deleteMany({});
};

module.exports = { connectTestDB, disconnectTestDB, clearCollection };
