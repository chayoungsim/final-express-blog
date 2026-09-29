const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth");

const Post = require("../models/Post");
const User = require("../models/User");
const { faker } = require("@faker-js/faker");

// 전체 조회
// [GET] /posts
// 쿼리파라미터:
//  - sort: 'newest' | 'views' (없으면 기본 정렬 없음(등록순))
//  - category: 문자열 (없으면 전체 카테고리)
//  - limit: 숫자 (optional, 페이징용)
//  - skip: 숫자  (optional, 페이징용)
// [GET] /posts?sort=newest|views&category=...&limit=...&skip=...&page=...&perPage=...
router.get("/", async (req, res) => {
  try {
    // 1) 쿼리 파싱 (search 추가)
    let { sort, category, search, page, perPage = 12, limit, skip } = req.query;

    // 2) 필터
    const filter = {};
    if (category) {
      filter.category = category;
    }
    if (search) {
      // title 또는 content에 search 문자열이 포함된 문서 검색
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { content: { $regex: search, $options: "i" } },
      ];
    }

    // 3) 정렬
    const sortOption = {};
    if (sort === "newest") sortOption.createdAt = -1;
    else if (sort === "views") sortOption.viewCount = -1;

    // 4) 페이지네이션 파싱
    let p = parseInt(page, 10);
    let pp = parseInt(perPage, 10);
    let lim, skp;
    if (!isNaN(p) && !isNaN(pp) && p > 0 && pp > 0) {
      lim = pp;
      skp = (p - 1) * pp;
    } else {
      if (limit != null) lim = parseInt(limit, 10);
      if (skip != null) skp = parseInt(skip, 10);
    }

    // 5) 전체 카운트 및 최대 페이지 계산
    let totalCount = null;
    let maxPage = null;
    if (lim != null && skp != null && !isNaN(p) && !isNaN(pp)) {
      totalCount = await Post.countDocuments(filter);
      maxPage = Math.ceil(totalCount / pp);
    }

    // 6) 실제 조회 쿼리
    const query = Post.find(filter)
      .populate("author", "nickname profileImage")
      .populate("comments.author", "nickname profileImage")
      .lean();

    if (Object.keys(sortOption).length) query.sort(sortOption);
    if (lim != null) query.limit(lim);
    if (skp != null) query.skip(skp);

    const posts = await query;

    // 7) 응답
    const response = { posts };
    if (totalCount != null) {
      response.pagination = {
        totalCount,
        currentPage: p,
        perPage: pp,
        maxPage,
      };
    }
    res.json(response);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/overview", async (req, res) => {
  try {
    // 1) 총 문서 수
    const total = await Post.countDocuments();

    // 2) 랜덤 인덱스 계산
    const rnd = Math.floor(Math.random() * total);

    // 3) 랜덤 1개 가져오기
    const randomPost = await Post.findOne()
      .skip(rnd)
      .populate("author", "nickname profileImage")
      .populate("comments.author", "nickname profileImage")
      .lean();

    // 4) 최신 6개
    const latestPosts = await Post.find()
      .sort({ createdAt: -1 })
      .limit(6)
      .populate("author", "nickname profileImage")
      .lean();

    // 5) 인기 6개 (viewCount 순)
    const popularPosts = await Post.find()
      .sort({ viewCount: -1 })
      .limit(6)
      .populate("author", "nickname profileImage")
      .lean();

    // 6) 응답
    res.json({ randomPost, latestPosts, popularPosts });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// 단일 조회 & 조회수 증가
router.get("/:id", async (req, res) => {
  try {
    // 1) 해당 글을 viewCount + 1 한 채로 가져오기 (new: true → 업데이트된 문서 반환)
    const post = await Post.findByIdAndUpdate(
      req.params.id,
      { $inc: { viewCount: 1 } },
      { new: true }
    )
      .populate("author", "nickname profileImage")
      .populate("comments.author", "nickname profileImage")
      .lean();

    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    // 2) 응답
    res.json(post);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// 생성
router.post("/", auth, async (req, res) => {
  const { title, category, thumbnail, content } = req.body;
  const post = await Post.create({
    title,
    category,
    thumbnail,
    content,
    author: req.user._id,
  });
  res.status(201).json(post);
});

// 수정
router.put("/:id", auth, async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).json({ error: "Post not found" });
  if (!post.author.equals(req.user._id))
    return res.status(403).json({ error: "Forbidden" });
  ["title", "category", "thumbnail", "content"].forEach((f) => {
    if (req.body[f] != null) post[f] = req.body[f];
  });
  await post.save();
  res.json(post);
});

// 삭제
router.delete("/:id", auth, async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).json({ error: "Post not found" });
  if (!post.author.equals(req.user._id))
    return res.status(403).json({ error: "Forbidden" });
  await post.deleteOne();
  res.json({ success: true });
});

// 댓글 추가
router.post("/:id/comments", auth, async (req, res) => {
  // 1) Post 문서 찾기
  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).json({ error: "Post not found" });

  // 2) 댓글 푸시
  post.comments.push({
    author: req.user._id,
    content: req.body.content,
  });

  // 3) 저장
  await post.save();

  // 4) 방금 추가한 comments.author 필드에 대해 populate
  await post.populate({
    path: "comments.author",
    select: "nickname profileImage", // 가져올 필드만 지정
  });

  // 5) 새로 추가된 댓글을 꺼내서 응답
  const newComment = post.comments[post.comments.length - 1];
  res.json(newComment);
});

// 댓글 삭제
router.delete("/:postId/comments/:commentId", auth, async (req, res) => {
  const post = await Post.findById(req.params.postId);
  if (!post) return res.status(404).json({ error: "Post not found" });
  const comment = post.comments.id(req.params.commentId);
  if (!comment) return res.status(404).json({ error: "Comment not found" });
  if (!comment.author.equals(req.user._id))
    return res.status(403).json({ error: "Forbidden" });
  comment.deleteOne();
  await post.save();
  res.json({ success: true });
});

// 시드용 카테고리 배열 (빈 문자열 제외)
const categories = [
  "Technology",
  "Lifestyle",
  "Travel",
  "Business",
  "Economy",
  "Sports",
];

// ▶ [POST] /posts/seed
// - 기존 포스트 전부 삭제
// - categories 당 36개씩 더미 포스트 삽입
router.post("/seed", async (req, res) => {
  try {
    // 1) 기존 모든 포스트 삭제
    await Post.deleteMany({});

    // 2) 전체 유저 목록(_id) 조회
    const users = await User.find().select("_id").lean();
    if (users.length === 0) {
      return res.status(400).json({ error: "등록된 유저가 없습니다." });
    }

    // 첫 번째 유저 ID 가져오기
    const firstUserId = users[0]._id;

    // 3) 삽입할 더미 문서 배열 생성
    const docs = categories.flatMap((category) => {
      return Array.from({ length: 36 }, () => ({
        title: faker.lorem.sentence(),
        category,
        thumbnail: `https://picsum.photos/seed/${faker.string.uuid()}/800/600`,
        content: faker.lorem.paragraphs(2),
        author: firstUserId, // 항상 첫 번째 유저
        comments: [],
      }));
    });

    // 4) bulk insert
    const inserted = await Post.insertMany(docs);

    res.json({
      message: "기존 포스트 삭제 후 더미 포스트 삽입 완료 (첫 번째 유저 기준)",
      totalInserted: inserted.length,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
