// controllers/walletController.js
const Wallet     = require('../models/Wallet');
const Withdrawal = require('../models/Withdrawal');
const Payment    = require('../models/Payment');
const Course     = require('../models/Course');
const { notifyWithdrawalResult } = require('../utils/notificationHelper'); // ← NEW

// ── GET /api/instructor/wallet ────────────────────────────────────────────────
const getInstructorWallet = async (req, res) => {
  try {
    const wallet = await Wallet.findOne({ ownerId: req.user._id, ownerType: 'instructor' })
      || { balance: 0, totalEarned: 0, totalWithdrawn: 0 };

    const courses = await Course.find({ instructorId: req.user._id }).select('_id title');
    const revenuePerCourse = await Promise.all(courses.map(async (c) => {
      const payments = await Payment.find({ courseId: c._id, status: 'successful' });
      const total    = payments.reduce((s, p) => s + p.instructorAmount, 0);
      return { courseId: c._id, title: c.title, revenue: total, sales: payments.length };
    }));

    const payments = await Payment.find({ instructorId: req.user._id, status: 'successful' })
      .populate('studentId', 'fullName')
      .populate('courseId', 'title')
      .sort({ paidAt: -1 })
      .limit(20);

    const withdrawals = await Withdrawal.find({ ownerId: req.user._id })
      .sort({ createdAt: -1 }).limit(10);

    res.json({ wallet, revenuePerCourse, payments, withdrawals });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ── POST /api/instructor/withdraw ─────────────────────────────────────────────
const requestWithdrawal = async (req, res) => {
  try {
    const { amount, phone, provider } = req.body;
    if (!amount || amount < 500) return res.status(400).json({ message: 'Minimum withdrawal is 500 XAF' });
    if (!phone)    return res.status(400).json({ message: 'Mobile Money number required' });
    if (!provider) return res.status(400).json({ message: 'Provider required (mtn or orange)' });

    const wallet = await Wallet.findOne({ ownerId: req.user._id, ownerType: 'instructor' });
    if (!wallet || wallet.balance < amount) {
      return res.status(400).json({ message: 'Insufficient balance' });
    }

    wallet.balance -= amount;
    await wallet.save();

    const withdrawal = await Withdrawal.create({
      ownerId: req.user._id, ownerType: 'instructor',
      amount, phone, provider, status: 'pending',
    });

    res.status(201).json({ message: 'Withdrawal request submitted. Admin will process it shortly.', withdrawal });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ── GET /api/admin/revenue ────────────────────────────────────────────────────
const getAdminRevenue = async (req, res) => {
  try {
    const allPayments = await Payment.find({ status: 'successful' })
      .populate('studentId', 'fullName email')
      .populate('courseId', 'title')
      .populate('instructorId', 'fullName')
      .sort({ paidAt: -1 });

    const totalRevenue     = allPayments.reduce((s, p) => s + p.amount, 0);
    const totalPlatformFee = allPayments.reduce((s, p) => s + p.platformFee, 0);
    const totalInstructor  = allPayments.reduce((s, p) => s + p.instructorAmount, 0);

    const instrMap = {};
    allPayments.forEach(p => {
      const id = String(p.instructorId?._id || p.instructorId);
      if (!instrMap[id]) instrMap[id] = { name: p.instructorId?.fullName || '–', revenue: 0, sales: 0 };
      instrMap[id].revenue += p.instructorAmount;
      instrMap[id].sales++;
    });

    const platWallet = await Wallet.findOne({ ownerType: 'platform' })
      || { balance: 0, totalEarned: 0, totalWithdrawn: 0 };

    const pendingWithdrawals = await Withdrawal.find({ status: 'pending' })
      .populate('ownerId', 'fullName email')
      .sort({ createdAt: -1 });

    res.json({
      totalRevenue, totalPlatformFee, totalInstructor,
      platWallet, payments: allPayments,
      instructorRevenue: Object.entries(instrMap).map(([id, v]) => ({ id, ...v })),
      pendingWithdrawals,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ── POST /api/admin/withdrawals/:id/approve ───────────────────────────────────
const approveWithdrawal = async (req, res) => {
  try {
    const w = await Withdrawal.findById(req.params.id).populate('ownerId', 'fullName');
    if (!w) return res.status(404).json({ message: 'Withdrawal not found' });
    if (w.status !== 'pending') return res.status(400).json({ message: 'Already processed' });

    w.status = 'paid';
    w.note   = req.body.note || 'Approved by admin';
    await w.save();

    const wallet = await Wallet.findOne({ ownerId: w.ownerId, ownerType: w.ownerType });
    if (wallet) { wallet.totalWithdrawn += w.amount; await wallet.save(); }

    // ── Notify instructor their withdrawal was approved ─────────────────────
    if (w.ownerType === 'instructor') {
      await notifyWithdrawalResult({
        instructorId: w.ownerId._id || w.ownerId,
        approved:     true,
        amount:       w.amount,
      });
    }

    res.json({ message: 'Withdrawal approved and marked as paid.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ── POST /api/admin/withdrawals/:id/reject ────────────────────────────────────
const rejectWithdrawal = async (req, res) => {
  try {
    const w = await Withdrawal.findById(req.params.id);
    if (!w) return res.status(404).json({ message: 'Withdrawal not found' });

    w.status = 'rejected';
    w.note   = req.body.note || 'Rejected by admin';
    await w.save();

    const wallet = await Wallet.findOne({ ownerId: w.ownerId, ownerType: w.ownerType });
    if (wallet) { wallet.balance += w.amount; await wallet.save(); }

    // ── Notify instructor their withdrawal was rejected ─────────────────────
    if (w.ownerType === 'instructor') {
      await notifyWithdrawalResult({
        instructorId: w.ownerId,
        approved:     false,
        amount:       w.amount,
      });
    }

    res.json({ message: 'Withdrawal rejected. Balance refunded.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ── POST /api/admin/withdraw ──────────────────────────────────────────────────
const adminWithdraw = async (req, res) => {
  try {
    const { amount, phone, provider } = req.body;
    if (!amount || amount < 500) return res.status(400).json({ message: 'Minimum withdrawal is 500 XAF' });

    const wallet = await Wallet.findOne({ ownerType: 'platform' });
    if (!wallet || wallet.balance < amount) {
      return res.status(400).json({ message: 'Insufficient platform balance' });
    }

    wallet.balance        -= amount;
    wallet.totalWithdrawn += amount;
    await wallet.save();

    const withdrawal = await Withdrawal.create({
      ownerType: 'platform', amount, phone, provider,
      status: 'paid', note: 'Admin withdrawal',
    });

    res.json({ message: 'Platform withdrawal recorded.', withdrawal });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getInstructorWallet, requestWithdrawal,
  getAdminRevenue, approveWithdrawal, rejectWithdrawal, adminWithdraw,
};