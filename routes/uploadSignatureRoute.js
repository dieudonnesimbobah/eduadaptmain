// routes/uploadSignatureRoute.js
// POST /api/instructor/upload-signature
// Returns a signed Cloudinary upload signature so the browser can upload
// files directly to Cloudinary without passing through Railway.
const express    = require('express');
const router     = express.Router();
const cloudinary = require('../config/cloudinary');
const { protect }                   = require('../middleware/authMiddleware');
const { authorizeRoles }            = require('../middleware/roleMiddleware');
const { requireApprovedInstructor } = require('../middleware/instructorApprovalMiddleware');

router.post('/',
  protect,
  authorizeRoles('instructor'),
  requireApprovedInstructor,
  (req, res) => {
    try {
      // Use exactly the folder the browser requests — don't override it
      const folder    = (req.body.folder || 'eduadapt/lessons').trim();
      const timestamp = Math.round(Date.now() / 1000);

      const signature = cloudinary.utils.api_sign_request(
        { folder, timestamp },
        process.env.CLOUDINARY_API_SECRET
      );

      res.json({
        signature,
        timestamp,
        folder,                                    // echo back so browser confirms
        cloudName: process.env.CLOUDINARY_CLOUD_NAME,
        apiKey:    process.env.CLOUDINARY_API_KEY,
      });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);

module.exports = router;