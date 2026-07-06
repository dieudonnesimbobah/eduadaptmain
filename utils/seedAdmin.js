// utils/seedAdmin.js - Create the default admin account
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const connectDB = require('../config/db');

const seedAdmin = async () => {
  await connectDB();

  const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME } = process.env;

  if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !ADMIN_NAME) {
    console.error('❌ Missing ADMIN_EMAIL, ADMIN_PASSWORD, or ADMIN_NAME in .env');
    process.exit(1);
  }

  try {
    const existing = await User.findOne({ email: ADMIN_EMAIL });

    if (existing) {
      console.log(`⚠️  Admin already exists: ${ADMIN_EMAIL}`);
      process.exit(0);
    }

    const admin = await User.create({
      fullName:        ADMIN_NAME,
      email:           ADMIN_EMAIL,
      password:        ADMIN_PASSWORD,
      role:            'admin',
      approvalStatus:  'approved',
      isActive:        true,
      isEmailVerified: true, // admin is seeded directly — no email verification needed
    });

    console.log(`✅ Admin created successfully: ${admin.email}`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Seed error:', error.message);
    process.exit(1);
  }
};

seedAdmin();
