// utils/mailer.js — Nodemailer transporter + email helpers
const nodemailer = require('nodemailer');
const dns        = require('dns');

const buildTransporter = () =>
  nodemailer.createTransport({
    host:   process.env.MAIL_HOST   || 'smtp.gmail.com',
    port:   Number(process.env.MAIL_PORT) || 587,
    secure: process.env.MAIL_SECURE === 'true',
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS,
    },
    tls: { rejectUnauthorized: false },
    // Force IPv4 DNS — Railway containers have no IPv6 outbound
    dnsLookup: (addr, options, callback) => dns.lookup(addr, { ...options, family: 4 }, callback),
  });

// Verify SMTP connection on server startup — logs result, never throws
const verifyMailer = async () => {
  if (!process.env.MAIL_USER || !process.env.MAIL_PASS) {
    console.warn('[mailer] ⚠ MAIL_USER / MAIL_PASS not set — emails will be skipped');
    return;
  }
  try {
    await buildTransporter().verify();
    console.log('[mailer] ✅ SMTP connection verified —', process.env.MAIL_USER);
  } catch (e) {
    console.error('[mailer] ❌ SMTP connection failed:', e.message);
    console.error('[mailer]    Check MAIL_HOST / MAIL_PORT / MAIL_USER / MAIL_PASS in env vars');
  }
};

const APP_URL = process.env.APP_URL || 'http://localhost:5001';

// ── Send a generic email (fire-and-forget — errors logged, never thrown) ──────
const sendMail = async ({ to, subject, html }) => {
  if (!process.env.MAIL_USER || !process.env.MAIL_PASS) {
    console.warn('[mailer] MAIL_USER / MAIL_PASS not set — skipping email to', to);
    return;
  }
  const transporter = buildTransporter();
  const FROM = `"EduAdapt" <${process.env.MAIL_FROM || process.env.MAIL_USER}>`;
  try {
    await transporter.sendMail({ from: FROM, to, subject, html });
    console.log(`[mailer] ✅ Email sent → ${to} | ${subject}`);
  } catch (e) {
    console.error('[mailer] Failed to send email:', e.message);
  }
};

// ── Instructor account approved ───────────────────────────────────────────────
const sendInstructorApprovedEmail = async ({ email, fullName }) => {
  const loginUrl = `${APP_URL}/login.html`;
  await sendMail({
    to:      email,
    subject: '🎉 Your EduAdapt Instructor Account Has Been Approved!',
    html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Account Approved – EduAdapt</title>
  <style>
    body  { margin:0; padding:0; background:#f3f4f6; font-family:'Segoe UI',Arial,sans-serif; }
    .wrap { max-width:600px; margin:40px auto; background:#ffffff; border-radius:12px; overflow:hidden;
            box-shadow:0 4px 20px rgba(0,0,0,0.08); }
    .header { background:linear-gradient(135deg,#1d4ed8,#1e3a8a); padding:40px 32px; text-align:center; }
    .header h1 { margin:0; color:#fff; font-size:1.75rem; letter-spacing:-0.5px; }
    .header p  { margin:8px 0 0; color:rgba(255,255,255,0.8); font-size:0.95rem; }
    .body  { padding:36px 32px; }
    .badge { display:inline-block; background:#ecfdf5; color:#059669; font-weight:700;
             padding:6px 16px; border-radius:99px; font-size:0.85rem; margin-bottom:24px; }
    .body h2 { margin:0 0 12px; color:#1f2937; font-size:1.25rem; }
    .body p  { margin:0 0 16px; color:#4b5563; line-height:1.7; font-size:0.95rem; }
    .btn-wrap { text-align:center; margin:28px 0; }
    .btn { display:inline-block; background:#1d4ed8; color:#fff; text-decoration:none;
           padding:14px 36px; border-radius:8px; font-weight:700; font-size:1rem;
           letter-spacing:0.02em; }
    .btn:hover { background:#1e3a8a; }
    .divider { border:none; border-top:1px solid #e5e7eb; margin:24px 0; }
    .steps { background:#f9fafb; border-radius:8px; padding:20px 24px; margin-bottom:20px; }
    .steps h3 { margin:0 0 12px; font-size:0.9rem; color:#374151; text-transform:uppercase;
                letter-spacing:0.05em; }
    .steps ol { margin:0; padding-left:20px; color:#4b5563; font-size:0.9rem; line-height:2; }
    .footer { background:#f9fafb; padding:20px 32px; text-align:center;
              font-size:0.8rem; color:#9ca3af; border-top:1px solid #e5e7eb; }
    .footer a { color:#6b7280; text-decoration:none; }
  </style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <h1>EduAdapt</h1>
    <p>Adaptive E-Learning for Inclusive Education in Cameroon</p>
  </div>
  <div class="body">
    <span class="badge">✅ Account Approved</span>
    <h2>Congratulations, ${fullName}!</h2>
    <p>
      Great news — your instructor application on <strong>EduAdapt</strong> has been
      reviewed and <strong>approved</strong> by our admin team. You now have full access
      to the instructor dashboard where you can create courses, add lessons, manage
      students, and track your earnings.
    </p>
    <div class="steps">
      <h3>Getting started</h3>
      <ol>
        <li>Click the button below to go to the login page</li>
        <li>Sign in with your registered email and password</li>
        <li>Start creating your first course!</li>
      </ol>
    </div>
    <div class="btn-wrap">
      <a href="${loginUrl}" class="btn">Access Your Dashboard →</a>
    </div>
    <hr class="divider"/>
    <p style="font-size:0.85rem;color:#9ca3af;text-align:center;">
      If the button above doesn't work, copy and paste this link into your browser:<br/>
      <a href="${loginUrl}" style="color:#1d4ed8;">${loginUrl}</a>
    </p>
  </div>
  <div class="footer">
    <p>© 2026 EduAdapt · Inclusive Education for Cameroon</p>
    <p>You are receiving this email because you registered as an instructor on EduAdapt.</p>
  </div>
</div>
</body>
</html>`,
  });
};

// ── Instructor account rejected ───────────────────────────────────────────────
const sendInstructorRejectedEmail = async ({ email, fullName, reason }) => {
  await sendMail({
    to:      email,
    subject: 'Your EduAdapt Instructor Application — Update',
    html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Application Update – EduAdapt</title>
  <style>
    body  { margin:0; padding:0; background:#f3f4f6; font-family:'Segoe UI',Arial,sans-serif; }
    .wrap { max-width:600px; margin:40px auto; background:#ffffff; border-radius:12px; overflow:hidden;
            box-shadow:0 4px 20px rgba(0,0,0,0.08); }
    .header { background:linear-gradient(135deg,#1d4ed8,#1e3a8a); padding:40px 32px; text-align:center; }
    .header h1 { margin:0; color:#fff; font-size:1.75rem; }
    .header p  { margin:8px 0 0; color:rgba(255,255,255,0.8); font-size:0.95rem; }
    .body  { padding:36px 32px; }
    .badge { display:inline-block; background:#fef2f2; color:#ef4444; font-weight:700;
             padding:6px 16px; border-radius:99px; font-size:0.85rem; margin-bottom:24px; }
    .body h2 { margin:0 0 12px; color:#1f2937; font-size:1.25rem; }
    .body p  { margin:0 0 16px; color:#4b5563; line-height:1.7; font-size:0.95rem; }
    .reason-box { background:#fef2f2; border-left:4px solid #ef4444; border-radius:6px;
                  padding:14px 18px; margin-bottom:20px; font-size:0.9rem; color:#7f1d1d; }
    .footer { background:#f9fafb; padding:20px 32px; text-align:center;
              font-size:0.8rem; color:#9ca3af; border-top:1px solid #e5e7eb; }
  </style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <h1>EduAdapt</h1>
    <p>Adaptive E-Learning for Inclusive Education in Cameroon</p>
  </div>
  <div class="body">
    <span class="badge">Application Not Approved</span>
    <h2>Hi ${fullName},</h2>
    <p>
      Thank you for applying to become an instructor on <strong>EduAdapt</strong>.
      After reviewing your application, we are unable to approve your account at this time.
    </p>
    ${reason ? `<div class="reason-box"><strong>Reason:</strong> ${reason}</div>` : ''}
    <p>
      If you believe this was a mistake or would like to provide additional information,
      please contact our support team by replying to this email. You are also welcome
      to re-apply after addressing the feedback above.
    </p>
  </div>
  <div class="footer">
    <p>© 2026 EduAdapt · Inclusive Education for Cameroon</p>
  </div>
</div>
</body>
</html>`,
  });
};

// ── Email Verification ────────────────────────────────────────────────────────
const sendVerificationEmail = async ({ email, fullName, verifyUrl }) => {
  await sendMail({
    to:      email,
    subject: 'Verify your EduAdapt email address',
    html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Verify Email – EduAdapt</title>
  <style>
    body  { margin:0; padding:0; background:#f3f4f6; font-family:'Segoe UI',Arial,sans-serif; }
    .wrap { max-width:600px; margin:40px auto; background:#ffffff; border-radius:12px; overflow:hidden;
            box-shadow:0 4px 20px rgba(0,0,0,0.08); }
    .header { background:linear-gradient(135deg,#1d4ed8,#1e3a8a); padding:40px 32px; text-align:center; }
    .header h1 { margin:0; color:#fff; font-size:1.75rem; }
    .header p  { margin:8px 0 0; color:rgba(255,255,255,0.8); font-size:0.95rem; }
    .body  { padding:36px 32px; }
    .body h2 { margin:0 0 12px; color:#1f2937; font-size:1.25rem; }
    .body p  { margin:0 0 16px; color:#4b5563; line-height:1.7; font-size:0.95rem; }
    .btn-wrap { text-align:center; margin:28px 0; }
    .btn { display:inline-block; background:#1d4ed8; color:#fff; text-decoration:none;
           padding:14px 36px; border-radius:8px; font-weight:700; font-size:1rem; }
    .warning { background:#f0f9ff; border-left:4px solid #0ea5e9; border-radius:6px;
               padding:12px 16px; font-size:0.875rem; color:#0c4a6e; margin-bottom:20px; }
    .footer { background:#f9fafb; padding:20px 32px; text-align:center;
              font-size:0.8rem; color:#9ca3af; border-top:1px solid #e5e7eb; }
  </style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <h1>EduAdapt</h1>
    <p>Adaptive E-Learning for Inclusive Education in Cameroon</p>
  </div>
  <div class="body">
    <h2>Welcome, ${fullName}!</h2>
    <p>Thanks for registering on <strong>EduAdapt</strong>. Please verify your email address to activate your account.</p>
    <div class="btn-wrap">
      <a href="${verifyUrl}" class="btn">Verify My Email →</a>
    </div>
    <div class="warning">
      This link expires in <strong>24 hours</strong>. If you did not create an account, ignore this email.
    </div>
    <p style="font-size:0.85rem;color:#9ca3af;text-align:center;">
      If the button doesn't work:<br/>
      <a href="${verifyUrl}" style="color:#1d4ed8;">${verifyUrl}</a>
    </p>
  </div>
  <div class="footer">
    <p>© 2026 EduAdapt · Inclusive Education for Cameroon</p>
  </div>
</div>
</body>
</html>`,
  });
};

// ── Password Reset ────────────────────────────────────────────────────────────
const sendPasswordResetEmail = async ({ email, fullName, resetUrl }) => {
  await sendMail({
    to:      email,
    subject: 'Reset your EduAdapt password',
    html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Password Reset – EduAdapt</title>
  <style>
    body  { margin:0; padding:0; background:#f3f4f6; font-family:'Segoe UI',Arial,sans-serif; }
    .wrap { max-width:600px; margin:40px auto; background:#ffffff; border-radius:12px; overflow:hidden;
            box-shadow:0 4px 20px rgba(0,0,0,0.08); }
    .header { background:linear-gradient(135deg,#1d4ed8,#1e3a8a); padding:40px 32px; text-align:center; }
    .header h1 { margin:0; color:#fff; font-size:1.75rem; }
    .header p  { margin:8px 0 0; color:rgba(255,255,255,0.8); font-size:0.95rem; }
    .body  { padding:36px 32px; }
    .body h2 { margin:0 0 12px; color:#1f2937; font-size:1.25rem; }
    .body p  { margin:0 0 16px; color:#4b5563; line-height:1.7; font-size:0.95rem; }
    .btn-wrap { text-align:center; margin:28px 0; }
    .btn { display:inline-block; background:#1d4ed8; color:#fff; text-decoration:none;
           padding:14px 36px; border-radius:8px; font-weight:700; font-size:1rem; }
    .warning { background:#fef3c7; border-left:4px solid #f59e0b; border-radius:6px;
               padding:12px 16px; font-size:0.875rem; color:#92400e; margin-bottom:20px; }
    .footer { background:#f9fafb; padding:20px 32px; text-align:center;
              font-size:0.8rem; color:#9ca3af; border-top:1px solid #e5e7eb; }
  </style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <h1>EduAdapt</h1>
    <p>Adaptive E-Learning for Inclusive Education in Cameroon</p>
  </div>
  <div class="body">
    <h2>Reset your password, ${fullName}</h2>
    <p>We received a request to reset the password for your EduAdapt account. Click the button below to choose a new password.</p>
    <div class="btn-wrap">
      <a href="${resetUrl}" class="btn">Reset Password →</a>
    </div>
    <div class="warning">
      This link expires in <strong>30 minutes</strong>. If you didn't request a password reset, you can ignore this email — your account remains secure.
    </div>
    <p style="font-size:0.85rem;color:#9ca3af;text-align:center;">
      If the button doesn't work, paste this link into your browser:<br/>
      <a href="${resetUrl}" style="color:#1d4ed8;">${resetUrl}</a>
    </p>
  </div>
  <div class="footer">
    <p>© 2026 EduAdapt · Inclusive Education for Cameroon</p>
  </div>
</div>
</body>
</html>`,
  });
};

module.exports = {
  sendMail,
  verifyMailer,
  sendInstructorApprovedEmail,
  sendInstructorRejectedEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
};
