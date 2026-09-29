const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    // 카카오 로그인 시 저장되는 고유 ID (없어도 가입 가능하도록 sparse 설정)
    kakaoId: {
      type: String,
    },

    // 일반 로그인 및 이메일 업데이트용
    email: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      lowercase: true,
    },

    // 회원 프로필 이미지 URL
    profileImage: {
      type: String,
    },

    // 사용자 닉네임
    nickname: {
      type: String,
      required: true,
    },

    // bcrypt로 해싱된 비밀번호 (소셜 로그인만 사용할 경우 필요없음)
    password: {
      type: String,
      required: function () {
        // kakaoId가 없을 때만 비밀번호 필요
        return !this.kakaoId;
      },
    },

    // 발급된 리프레시 토큰들
    refreshTokens: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true, // createdAt, updatedAt 자동 추가
  }
);
userSchema.index(
  { kakaoId: 1 },
  {
    unique: true,
    partialFilterExpression: { kakaoId: { $type: "string" } },
  }
);

// email 도 마찬가지로
userSchema.index(
  { email: 1 },
  {
    unique: true,
    partialFilterExpression: { email: { $type: "string" } },
  }
);
module.exports = mongoose.model("User", userSchema);
