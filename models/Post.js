const mongoose = require("mongoose");

const commentSchema = new mongoose.Schema({
  author: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  content: String,
  createdAt: { type: Date, default: Date.now },
});

const postSchema = new mongoose.Schema({
  title: String,
  category: String,
  thumbnail: String,
  content: String,
  createdAt: { type: Date, default: Date.now },
  author: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  comments: [commentSchema],
  viewCount: { type: Number, default: 0 }, // 총 조회수
});

module.exports = mongoose.model("Post", postSchema);
