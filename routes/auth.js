const express = require("express");
const axios = require("axios");
const bcrypt = require("bcrypt");
const router = express.Router();

const User = require("../models/User");
const { signAccess, signRefresh, verify } = require("../utils/jwt");
const auth = require("../middlewares/auth");
const { initDB } = require("../config/db");

const {
  KAKAO_CLIENT_ID,
  KAKAO_CLIENT_SECRET,
  KAKAO_REDIRECT_URI,
  FRONTEND_URL,
} = process.env;

/**
 * 카카오 OAuth 시작
 * - 유효한 리프레시 토큰이 있으면 JWT 재발급 후 리다이렉트
 * - 그렇지 않으면 카카오 인가 화면으로 리다이렉트
 */
router.get("/kakao", async (req, res) => {
  const rt = req.cookies.refresh_token;

  if (rt) {
    try {
      const { uid } = verify(rt);
      const user = await User.findOne({ _id: uid, refreshTokens: rt });
      if (user) {
        // 새 액세스/리프레시 토큰 발급
        const access = signAccess(uid);
        const refresh = signRefresh(uid);
        user.refreshTokens = user.refreshTokens.filter((t) => t !== rt);
        user.refreshTokens.push(refresh);
        await user.save();

        // 리프레시 토큰 HTTP-only 쿠키 저장
        res.cookie("refresh_token", refresh, {
          httpOnly: true,
          maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        return res.redirect(
          `${FRONTEND_URL}/auth/callback/kakao?access_token=${access}&email=${
            user.email ? "Y" : "N"
          }`
        );
      }
    } catch {
      console.log("리프레시 토큰이 유효하지 않습니다");
    }
  }

  // 카카오 인가 페이지로 리다이렉트
  const kakaoAuthUrl = [
    "https://kauth.kakao.com/oauth/authorize",
    `?client_id=${KAKAO_CLIENT_ID}`,
    `&redirect_uri=${encodeURIComponent(KAKAO_REDIRECT_URI)}`,
    "&response_type=code",
    "&scope=profile_nickname,profile_image",
  ].join("");

  res.redirect(kakaoAuthUrl);
});

/**
 * 카카오 콜백 처리
 * - 인가 코드를 토큰으로 교환
 * - 카카오 프로필 조회 후 사용자 생성 또는 조회
 * - JWT 발급 및 리프레시 토큰 쿠키 저장
 */
router.get("/kakao/callback", async (req, res) => {
  const code = req.query.code;

  // 인가 코드로 액세스 토큰 요청
  const tokenRes = await axios.post(
    "https://kauth.kakao.com/oauth/token",
    null,
    {
      params: {
        grant_type: "authorization_code",
        client_id: KAKAO_CLIENT_ID,
        client_secret: KAKAO_CLIENT_SECRET,
        redirect_uri: KAKAO_REDIRECT_URI,
        code,
      },
    }
  );

  // 카카오 사용자 정보 조회
  const kakaoUser = await axios.get("https://kapi.kakao.com/v2/user/me", {
    headers: { Authorization: `Bearer ${tokenRes.data.access_token}` },
  });

  const kakaoId = String(kakaoUser.data.id);
  const { profile } = kakaoUser.data.kakao_account;

  // 사용자 조회 또는 생성
  let user = await User.findOne({ kakaoId });
  if (!user) {
    const seed = Math.random().toString(36).substring(2, 12);
    const profileImage =
      profile.profile_image_url ||
      `https://gravatar.com/avatar/${seed}?d=identicon`;
    user = await User.create({
      kakaoId,
      nickname: profile.nickname,
      profileImage,
    });
  }

  // JWT 발급
  const access = signAccess(user._id);
  const refresh = signRefresh(user._id);
  user.refreshTokens.push(refresh);
  await user.save();

  // 리프레시 토큰 쿠키 저장
  res.cookie("refresh_token", refresh, {
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.redirect(
    `${FRONTEND_URL}/auth/callback/kakao?access_token=${access}&email=${
      user.email ? "Y" : "N"
    }`
  );
});

/**
 * 액세스 토큰 재발급
 * - 리프레시 토큰 검증 후 새 JWT 발급
 */
router.post("/refresh", async (req, res) => {
  const rt = req.cookies.refresh_token;
  if (!rt) return res.status(401).json({ error: "리프레시 토큰이 없습니다" });

  try {
    const { uid } = verify(rt);
    const user = await User.findOne({ _id: uid, refreshTokens: rt });
    if (!user) throw new Error();

    const access = signAccess(uid);
    const refresh = signRefresh(uid);
    user.refreshTokens = user.refreshTokens.filter((t) => t !== rt);
    user.refreshTokens.push(refresh);
    await user.save();

    res.cookie("refresh_token", refresh, {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    return res.json({ accessToken: access });
  } catch {
    res.clearCookie("refresh_token", { httpOnly: true });
    return res
      .status(401)
      .json({ error: "리프레시 토큰이 유효하지 않거나 만료되었습니다" });
  }
});

/**
 * 내 정보 조회
 * - 인증된 사용자 프로필 반환
 */
router.get("/me", auth, (req, res) => {
  const { _id, kakaoId, email, profileImage, nickname } = req.user;
  return res.json({ id: _id, kakaoId, email, profileImage, nickname });
});

/**
 * 이메일 업데이트
 * - 사용자 이메일 수정
 */
router.patch("/update-email", auth, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "이메일은 필수입니다" });

  try {
    req.user.email = email;
    await req.user.save();
    return res.json({
      message: "이메일이 성공적으로 업데이트되었습니다",
      user: req.user,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "이메일 업데이트에 실패했습니다" });
  }
});

/**
 * 로그아웃
 * - 리프레시 토큰 제거 후 쿠키 삭제
 */
router.post("/logout", async (req, res) => {
  const rt = req.cookies.refresh_token;
  if (!rt) return res.sendStatus(204);

  try {
    if (req.user) {
      req.user.refreshTokens = req.user.refreshTokens.filter((t) => t !== rt);
      await req.user.save();
    }
    res.clearCookie("refresh_token", { httpOnly: true });
    return res.sendStatus(204);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "로그아웃에 실패했습니다" });
  }
});

/**
 * 일반 회원가입
 * - 이메일, 닉네임, 비밀번호 필수
 * - 비밀번호 해싱 및 랜덤 아바타 생성
 */
router.post("/signup", async (req, res) => {
  const { email, nickname, password } = req.body;
  if (!email || !nickname || !password) {
    return res
      .status(400)
      .json({ error: "이메일, 닉네임, 비밀번호는 필수입니다" });
  }

  if (await User.findOne({ email })) {
    return res.status(409).json({ error: "이미 사용 중인 이메일입니다" });
  }

  const hashed = await bcrypt.hash(password, 10);
  const seed = Math.random().toString(36).substring(2, 12);
  const profileImage = `https://gravatar.com/avatar/${seed}?d=identicon`;

  const user = await User.create({
    email,
    nickname,
    password: hashed,
    profileImage,
  });
  await user.save();

  return res.status(201).json({ success: "회원가입에 성공했습니다." });
});

/**
 * 일반 로그인
 * - 이메일, 비밀번호로 인증
 * - JWT 발급 및 리프레시 토큰 교체
 */
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "이메일과 비밀번호는 필수입니다" });
  }

  const user = await User.findOne({ email });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: "인증 정보가 일치하지 않습니다" });
  }

  const access = signAccess(user._id);
  const refresh = signRefresh(user._id);
  user.refreshTokens = user.refreshTokens.filter(
    (t) => t !== req.cookies.refresh_token
  );
  user.refreshTokens.push(refresh);
  await user.save();

  res.cookie("refresh_token", refresh, {
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  return res.json({ accessToken: access, user });
});

/**
 * DB 연결 (옵션)
 * - 배포 시 DB 연결 문제 해결용
 */
router.get("/connect", (req, res) => {
  initDB();
  res.json("success");
});

module.exports = router;
