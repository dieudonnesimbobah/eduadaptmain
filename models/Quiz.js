// models/Quiz.js - Quiz with adaptive difficulty questions
const mongoose = require('mongoose');

const quizSchema = new mongoose.Schema({
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true,
  },
  lessonId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lesson',
    default: null,
  },
  instructorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  title: {
    type: String,
    required: true,
    default: 'Quiz',
  },
  questions: [
    {
      questionText: { type: String, required: true },
      options: [{ type: String }],
      correctAnswer: { type: String, required: true },
      difficultyLevel: {
        type: String,
        enum: ['beginner', 'intermediate', 'advanced'],
        default: 'beginner',
      },
    },
  ],
}, { timestamps: true });

module.exports = mongoose.model('Quiz', quizSchema);
