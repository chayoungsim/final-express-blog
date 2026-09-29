// middlewares/cors.js
const cors = require("cors");
const FRONTEND_URL = process.env.FRONTEND_URL;

// CORS 옵션 정의
const corsOptions = {
  origin: FRONTEND_URL, // 허용할 프론트엔드 도메인
  credentials: true, // 쿠키, 인증 헤더 허용
  allowedHeaders: [
    // 허용할 요청 헤더
    "Content-Type",
    "Authorization",
  ],
  methods: [
    // 허용할 HTTP 메서드
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "OPTIONS",
  ],
  optionsSuccessStatus: 200, // legacy 브라우저 지원용
};

// CORS 미들웨어 export
module.exports = cors(corsOptions);
