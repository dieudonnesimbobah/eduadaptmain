// controllers/paymentController.js
// Handles Fapshi Mobile Money payments for course enrollment.
// Fapshi API docs: https://fapshi.com/docs
const Course      = require('../models/Course');
const Enrollment  = require('../models/Enrollment');
const Progress    = require('../models/Progress');
const Payment     = require('../models/Payment');
const Wallet      = require('../models/Wallet');
const { logActivity } = require('../middleware/activityLogger');

const FAPSHI_BASE  = 'https://live.fapshi.com';
const PLATFORM_FEE_PERCENT = parseInt(process.env.PLATFORM_FEE_PERCENT || '20');

// ── Helper: get or create a wallet ───────────────────────────────────────────
const getOrCreateWallet = async (ownerId, ownerType) => {
  let wallet = await Wallet.findOne({ ownerId, ownerType });
  if (!wallet) {
    wallet = await Wallet.create({ ownerId, ownerType, balance: 0, totalEarned: 0, totalWithdrawn: 0 });
  }
  return wallet;
};

// ── POST /api/payments/initiate ───────────────────────────────────────────────
// Student initiates payment for a paid course
const initiatePayment = async (req, res) => {
  try {
    const { courseId, phone, provider } = req.body;
    const studentId = req.user._id;

    const course = await Course.findOne({ _id: courseId, approvalStatus: 'approved', isPublished: true });
    if (!course) return res.status(404).json({ message: 'Course not found' });

    // Already enrolled?
    const existing = await Enrollment.findOne({ studentId, courseId });
    if (existing) return res.status(400).json({ message: 'Already enrolled in this course' });

    // Free course — enroll directly
    if (course.isFree || !course.price || course.price === 0) {
      await Enrollment.create({ studentId, courseId, instructorId: course.instructorId });
      await Progress.create({ studentId, courseId, completionPercentage: 0 });
      return res.json({ message: 'Enrolled successfully (free course)', free: true });
    }

    // Validate phone
    if (!phone) return res.status(400).json({ message: 'Mobile Money phone number is required' });
    if (!provider || !['mtn', 'orange'].includes(provider)) {
      return res.status(400).json({ message: 'Provider must be mtn or orange' });
    }

    const amount = course.price;

    // Call Fapshi API to initiate payment
    const fapshiRes = await fetch(FAPSHI_BASE + '/initiate-pay', {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'apiuser':       process.env.FAPSHI_API_USER,
        'apikey':        process.env.FAPSHI_API_KEY,
      },
      body: JSON.stringify({
        amount,
        phone,
        redirectUrl: process.env.APP_URL + '/student-dashboard.html',
        userId:      String(studentId),
        externalId:  courseId + '_' + studentId + '_' + Date.now(),
        message:     'Payment for course: ' + course.title,
      }),
    });

    const fapshiData = await fapshiRes.json();

    if (!fapshiRes.ok || !fapshiData.transId) {
      console.error('Fapshi error:', fapshiData);
      return res.status(400).json({
        message: fapshiData.message || 'Payment initiation failed. Check your Mobile Money number.',
      });
    }

    // Calculate split
    const platformFee      = Math.round((amount * PLATFORM_FEE_PERCENT) / 100);
    const instructorAmount = amount - platformFee;

    // Save pending payment record
    await Payment.create({
      studentId,
      courseId,
      instructorId:    course.instructorId,
      amount,
      platformFee,
      instructorAmount,
      platformFeePercent: PLATFORM_FEE_PERCENT,
      reference:       fapshiData.transId,
      phone,
      provider,
      status:          'pending',
    });

    res.json({
      message:  'Payment initiated. Check your phone to confirm the Mobile Money prompt.',
      transId:  fapshiData.transId,
      amount,
      currency: 'XAF',
    });

  } catch (error) {
    console.error('Payment initiation error:', error);
    res.status(500).json({ message: error.message });
  }
};

// ── GET /api/payments/verify/:transId ────────────────────────────────────────
// Poll to check if payment was confirmed by student on their phone
const verifyPayment = async (req, res) => {
  try {
    const { transId } = req.params;
    const studentId   = req.user._id;

    const payment = await Payment.findOne({ reference: transId, studentId });
    if (!payment) return res.status(404).json({ message: 'Payment not found' });

    if (payment.status === 'successful') {
      return res.json({ status: 'successful', message: 'Payment already confirmed.' });
    }

    // Check with Fapshi
    const fapshiRes = await fetch(FAPSHI_BASE + '/payment-status/' + transId, {
      headers: {
        'apiuser': process.env.FAPSHI_API_USER,
        'apikey':  process.env.FAPSHI_API_KEY,
      },
    });

    const fapshiData = await fapshiRes.json();

    if (fapshiData.status === 'SUCCESSFUL') {
      // Update payment
      payment.status = 'successful';
      payment.paidAt = new Date();
      await payment.save();

      // Create enrollment
      const existing = await Enrollment.findOne({ studentId, courseId: payment.courseId });
      if (!existing) {
        await Enrollment.create({
          studentId,
          courseId:     payment.courseId,
          instructorId: payment.instructorId,
        });
        await Progress.create({ studentId, courseId: payment.courseId, completionPercentage: 0 });
      }

      // Credit instructor wallet
      const instrWallet = await getOrCreateWallet(payment.instructorId, 'instructor');
      instrWallet.balance     += payment.instructorAmount;
      instrWallet.totalEarned += payment.instructorAmount;
      await instrWallet.save();

      // Credit platform wallet
      const platWallet = await getOrCreateWallet(null, 'platform');
      platWallet.balance     += payment.platformFee;
      platWallet.totalEarned += payment.platformFee;
      await platWallet.save();

      await logActivity({
        userId: studentId, role: 'student', action: 'PAYMENT_SUCCESS',
        entityType: 'Course', entityId: payment.courseId,
        description: 'Student paid ' + payment.amount + ' XAF for course',
        ipAddress: req.ip,
      });

      return res.json({ status: 'successful', message: 'Payment confirmed! You are now enrolled.' });
    }

    if (fapshiData.status === 'FAILED' || fapshiData.status === 'EXPIRED') {
      payment.status = 'failed';
      await payment.save();
      return res.json({ status: 'failed', message: 'Payment failed or expired. Please try again.' });
    }

    // Still pending
    res.json({ status: 'pending', message: 'Payment pending. Please confirm on your phone.' });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ── GET /api/payments/my-payments ─────────────────────────────────────────────
const getMyPayments = async (req, res) => {
  try {
    const payments = await Payment.find({ studentId: req.user._id, status: 'successful' })
      .populate('courseId', 'title thumbnail')
      .sort({ paidAt: -1 });
    res.json(payments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ── POST /api/payments/webhook ────────────────────────────────────────────────
// Fapshi calls this endpoint when a payment status changes.
// Must be publicly accessible (no auth middleware).
// Fapshi sends: { transId, status, externalId, amount }
const handleWebhook = async (req, res) => {
  try {
    const { transId, status } = req.body;

    if (!transId || !status) {
      return res.status(400).json({ message: 'Missing transId or status' });
    }

    const payment = await Payment.findOne({ reference: transId });
    if (!payment) {
      return res.status(200).json({ received: true }); // acknowledge unknown tx to stop retries
    }

    if (payment.status === 'successful' || payment.status === 'failed') {
      return res.status(200).json({ received: true }); // idempotent
    }

    if (status === 'SUCCESSFUL') {
      payment.status = 'successful';
      payment.paidAt = new Date();
      await payment.save();

      const existing = await Enrollment.findOne({
        studentId: payment.studentId,
        courseId:  payment.courseId,
      });
      if (!existing) {
        await Enrollment.create({
          studentId:    payment.studentId,
          courseId:     payment.courseId,
          instructorId: payment.instructorId,
        });
        await Progress.create({
          studentId:            payment.studentId,
          courseId:             payment.courseId,
          completionPercentage: 0,
        });
      }

      const instrWallet = await getOrCreateWallet(payment.instructorId, 'instructor');
      instrWallet.balance     += payment.instructorAmount;
      instrWallet.totalEarned += payment.instructorAmount;
      await instrWallet.save();

      const platWallet = await getOrCreateWallet(null, 'platform');
      platWallet.balance     += payment.platformFee;
      platWallet.totalEarned += payment.platformFee;
      await platWallet.save();

      await logActivity({
        userId:      payment.studentId,
        role:        'student',
        action:      'PAYMENT_SUCCESS',
        entityType:  'Course',
        entityId:    payment.courseId,
        description: 'Webhook: student paid ' + payment.amount + ' XAF for course',
        ipAddress:   req.ip,
      });

    } else if (status === 'FAILED' || status === 'EXPIRED') {
      payment.status = 'failed';
      await payment.save();
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(200).json({ received: true }); // always 200 to prevent Fapshi retries
  }
};

module.exports = { initiatePayment, verifyPayment, getMyPayments, handleWebhook };