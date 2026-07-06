// routes/transcriptRoutes.js
// GET /api/transcript/:lessonId
// Student downloads an auto-generated PDF transcript of a lesson video.
// Uses AssemblyAI to transcribe the Cloudinary video URL.
const express    = require('express');
const router     = express.Router();
const Lesson     = require('../models/Lesson');
const Course     = require('../models/Course');
const Enrollment = require('../models/Enrollment');
const { protect }        = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');
const { generateTranscriptPdf } = require('../utils/videoTranscript');

router.get('/:lessonId',
  protect,
  authorizeRoles('student'),
  async (req, res) => {
    try {
      const lesson = await Lesson.findById(req.params.lessonId);
      if (!lesson) return res.status(404).json({ message: 'Lesson not found' });

      // Verify student is enrolled in the course
      const enrollment = await Enrollment.findOne({
        studentId: req.user._id,
        courseId:  lesson.courseId,
      });
      if (!enrollment) {
        return res.status(403).json({ message: 'You are not enrolled in this course' });
      }

      if (!lesson.videoOriginal) {
        return res.status(400).json({ message: 'No video has been uploaded for this lesson yet.' });
      }

      const course = await Course.findById(lesson.courseId);

      // Generate PDF (this calls AssemblyAI — may take 30–120 seconds)
      const pdfBuffer = await generateTranscriptPdf(lesson, course);

      const filename = lesson.title.replace(/[^a-z0-9]/gi, '_') + '-transcript.pdf';
      res.set({
        'Content-Type':        'application/pdf',
        'Content-Disposition': 'attachment; filename="' + filename + '"',
        'Content-Length':      pdfBuffer.length,
      });
      res.send(pdfBuffer);

    } catch (err) {
      console.error('Transcript error:', err.message);
      res.status(500).json({ message: err.message });
    }
  }
);

module.exports = router;