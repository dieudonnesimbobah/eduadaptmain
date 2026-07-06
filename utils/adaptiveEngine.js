// utils/adaptiveEngine.js - Rule-based adaptive learning engine
// Determines best video quality and content mode based on network and performance

/**
 * Select video quality based on bandwidth speed (Mbps)
 */
const selectVideoQuality = (bandwidthSpeed) => {
  if (bandwidthSpeed >= 5) return '720p';
  if (bandwidthSpeed >= 2) return '480p';
  if (bandwidthSpeed >= 1) return '360p';
  return null; // Too slow for video
};

/**
 * Recommend learning mode based on bandwidth and session interruptions
 */
const recommendMode = (bandwidthSpeed, interruptions = 0) => {
  // If many interruptions or very poor network, recommend PDF
  if (interruptions >= 3 || bandwidthSpeed < 0.5) return 'pdf';
  // Poor network: recommend audio
  if (bandwidthSpeed < 1) return 'audio';
  // Acceptable network: recommend video
  return 'video';
};

/**
 * Recommend content difficulty based on quiz percentage
 */
const recommendDifficulty = (percentage) => {
  if (percentage >= 70) return 'advanced';
  if (percentage >= 50) return 'intermediate';
  return 'beginner';
};

/**
 * Full adaptive decision combining QoE metrics
 */
const determineAdaptiveDecision = ({ bandwidthSpeed, responseTime, sessionInterruptions }) => {
  const mode = recommendMode(bandwidthSpeed, sessionInterruptions);
  const quality = selectVideoQuality(bandwidthSpeed);

  let decision = '';

  if (mode === 'pdf') {
    decision = `Poor network detected (${bandwidthSpeed} Mbps, ${sessionInterruptions} interruptions). Switching to PDF mode for uninterrupted learning.`;
  } else if (mode === 'audio') {
    decision = `Low bandwidth detected (${bandwidthSpeed} Mbps). Switching to audio mode for best experience.`;
  } else {
    decision = `Good network (${bandwidthSpeed} Mbps). Streaming ${quality} video.`;
  }

  return {
    mode,
    quality,
    decision,
  };
};

module.exports = {
  selectVideoQuality,
  recommendMode,
  recommendDifficulty,
  determineAdaptiveDecision,
};
