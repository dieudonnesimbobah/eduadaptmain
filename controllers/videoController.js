// controllers/videoController.js - FFmpeg status and video processing
const { processLessonMedia } = require('../utils/ffmpegProcessor');
const Lesson = require('../models/Lesson');

// GET /api/video/ffmpeg-check
const checkFFmpeg = async (req, res) => {
  try {
    const ffmpegStatic = require('ffmpeg-static');
    const fs = require('fs');
    const available = fs.existsSync(ffmpegStatic);
    res.json({
      ffmpegAvailable: available,
      ffmpegPath: ffmpegStatic,
      message: available ? 'FFmpeg is available and ready' : 'FFmpeg binary not found',
    });
  } catch (error) {
    res.status(500).json({ ffmpegAvailable: false, message: error.message });
  }
};

// POST /api/video/process-lesson-video — manually trigger processing for a lesson
const processVideo = async (req, res) => {
  try {
    const { lessonId } = req.body;
    const lesson = await Lesson.findById(lessonId);
    if (!lesson) return res.status(404).json({ message: 'Lesson not found' });
    if (!lesson.videoOriginal) return res.status(400).json({ message: 'No original video to process' });

    res.json({ message: 'Video processing started. This runs in the background.' });

    // Process in background
    processLessonMedia(lesson.videoOriginal)
      .then(async ({ videoQualities, audioVersion }) => {
        lesson.videoQualities = videoQualities;
        lesson.audioVersion = audioVersion;
        lesson.processingStatus = 'completed';
        await lesson.save();
      })
      .catch(async (err) => {
        lesson.processingStatus = 'failed';
        await lesson.save();
        console.error('Processing error:', err.message);
      });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { checkFFmpeg, processVideo };
