// utils/ffmpegProcessor.js - FFmpeg video/audio processing
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const path = require('path');
const fs = require('fs');

// Point fluent-ffmpeg to the bundled static binary
ffmpeg.setFfmpegPath(ffmpegStatic);

// Ensure output directory exists
const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

/**
 * Generate a single video at a given resolution
 */
const generateVideoAtQuality = (inputPath, outputPath, height) => {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .videoFilters(`scale=-2:${height}`)
      .outputOptions([
        '-c:v libx264',
        '-crf 23',
        '-preset fast',
        '-c:a aac',
        '-b:a 128k',
      ])
      .on('end', () => resolve(outputPath))
      .on('error', (err) => reject(err))
      .save(outputPath);
  });
};

/**
 * Generate 360p, 480p, and 720p versions of a lesson video
 */
const generateVideoQualities = async (inputPath, outputDir) => {
  ensureDir(outputDir);

  const baseName = path.basename(inputPath, path.extname(inputPath));
  const qualities = [
    { label: '360p', height: 360 },
    { label: '480p', height: 480 },
    { label: '720p', height: 720 },
  ];

  const results = {};

  for (const q of qualities) {
    const outputPath = path.join(outputDir, `${baseName}_${q.label}.mp4`);
    try {
      await generateVideoAtQuality(inputPath, outputPath, q.height);
      results[`quality${q.label}`] = outputPath;
      console.log(`✅ Generated ${q.label}: ${outputPath}`);
    } catch (err) {
      console.error(`❌ Failed to generate ${q.label}: ${err.message}`);
      results[`quality${q.label}`] = null;
    }
  }

  return results;
};

/**
 * Extract MP3 audio track from a video file
 */
const extractAudio = (inputPath, outputDir) => {
  return new Promise((resolve, reject) => {
    ensureDir(outputDir);
    const baseName = path.basename(inputPath, path.extname(inputPath));
    const outputPath = path.join(outputDir, `${baseName}_audio.mp3`);

    ffmpeg(inputPath)
      .noVideo()
      .audioCodec('libmp3lame')
      .audioBitrate('128k')
      .on('end', () => {
        console.log(`✅ Audio extracted: ${outputPath}`);
        resolve(outputPath);
      })
      .on('error', (err) => {
        console.error(`❌ Audio extraction failed: ${err.message}`);
        reject(err);
      })
      .save(outputPath);
  });
};

/**
 * Full lesson media processing: generates all qualities + audio
 * Returns paths for storage in Lesson model
 */
const processLessonMedia = async (inputPath) => {
  const videoOutputDir = path.join('uploads', 'processed-videos');
  const audioOutputDir = path.join('uploads', 'audios');

  console.log(`🎬 Processing lesson media: ${inputPath}`);

  const videoQualities = await generateVideoQualities(inputPath, videoOutputDir);
  let audioVersion = null;

  try {
    audioVersion = await extractAudio(inputPath, audioOutputDir);
  } catch (err) {
    console.error('Audio extraction failed:', err.message);
  }

  return {
    videoQualities,
    audioVersion,
  };
};

module.exports = {
  generateVideoQualities,
  extractAudio,
  processLessonMedia,
};
