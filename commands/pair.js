const { createCanvas, loadImage } = require("@napi-rs/canvas");
const fs = require("fs");
const path = require("path");

// ===============================
// PAIR TEMPLATE
// ===============================
const TEMPLATE_URL = "https://files.catbox.moe/bfonlm.jpg";

const DEFAULT_AVATAR =
  "https://i.imgur.com/6VBx3io.png";

// ===============================
// FETCH BUFFER
// ===============================
async function fetchBuffer(url, timeout = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return Buffer.from(await response.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

// ===============================
// LOAD IMAGE
// ===============================
async function loadRemoteImage(url) {
  try {
    const buffer = await fetchBuffer(url);
    return await loadImage(buffer);
  } catch (error) {
    console.log("[PAIR] Image load failed:", error.message);

    const buffer = await fetchBuffer(DEFAULT_AVATAR);
    return await loadImage(buffer);
  }
}

// ===============================
// GET USER INFO
// ===============================
async function getUser(api, userID) {
  try {
    const data = await api.getUserInfo(userID);

    // Different API structures support
    const user =
      data?.user ||
      data?.data?.user ||
      data?.data ||
      data ||
      {};

    const name =
      user?.name ||
      user?.fullName ||
      user?.full_name ||
      user?.username ||
      user?.userName ||
      `User ${userID}`;

    const avatar =
      user?.profilePicUrlHD ||
      user?.profile_pic_url_hd ||
      user?.profilePicUrl ||
      user?.profile_pic_url ||
      user?.avatar ||
      user?.avatarUrl ||
      user?.profilePicture ||
      user?.profile_picture ||
      null;

    return {
      id: userID,
      name: String(name),
      avatar
    };
  } catch (error) {
    console.log(
      `[PAIR] getUserInfo failed for ${userID}:`,
      error.message
    );

    return {
      id: userID,
      name: `User ${userID}`,
      avatar: null
    };
  }
}

// ===============================
// ROUND RECTANGLE
// ===============================
function roundedRect(ctx, x, y, w, h, r, color) {
  ctx.save();

  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();

  ctx.fillStyle = color;
  ctx.fill();

  ctx.restore();
}

// ===============================
// CIRCLE AVATAR
// ===============================
function drawCircleImage(ctx, img, cx, cy, size) {
  const x = cx - size / 2;
  const y = cy - size / 2;

  ctx.save();

  ctx.beginPath();
  ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  // Cover image properly inside circle
  const scale = Math.max(
    size / img.width,
    size / img.height
  );

  const width = img.width * scale;
  const height = img.height * scale;

  const dx = cx - width / 2;
  const dy = cy - height / 2;

  ctx.drawImage(img, dx, dy, width, height);

  ctx.restore();
}

// ===============================
// TEXT FIT
// ===============================
function fitFont(ctx, text, maxWidth, startSize) {
  let size = startSize;

  while (size > 12) {
    ctx.font = `bold ${size}px Arial`;

    if (ctx.measureText(text).width <= maxWidth) {
      return size;
    }

    size -= 1;
  }

  return 12;
}

// ===============================
// DRAW NAME
// ===============================
function drawName(ctx, name, x, y, width, height, scale) {
  const cleanName = String(name)
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

  const maxWidth = width * 0.86;

  // Try one line first
  let fontSize = fitFont(
    ctx,
    cleanName,
    maxWidth,
    32 * scale
  );

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#171717";

  ctx.font = `bold ${fontSize}px Arial`;

  if (ctx.measureText(cleanName).width <= maxWidth) {
    ctx.fillText(
      cleanName,
      x + width / 2,
      y + height / 2
    );
    return;
  }

  // Two-line fallback
  const words = cleanName.split(" ");

  let line1 = "";
  let line2 = "";

  for (const word of words) {
    const test =
      line1.length === 0
        ? word
        : `${line1} ${word}`;

    ctx.font = `bold ${fontSize}px Arial`;

    if (
      ctx.measureText(test).width <= maxWidth &&
      line2.length === 0
    ) {
      line1 = test;
    } else {
      line2 +=
        line2.length === 0
          ? word
          : ` ${word}`;
    }
  }

  // If second line is still too large, reduce it
  while (
    fontSize > 12 &&
    ctx.measureText(line2).width > maxWidth
  ) {
    fontSize -= 1;
    ctx.font = `bold ${fontSize}px Arial`;
  }

  const lineHeight = fontSize * 1.05;

  ctx.fillText(
    line1,
    x + width / 2,
    y + height / 2 - lineHeight / 2
  );

  ctx.fillText(
    line2,
    x + width / 2,
    y + height / 2 + lineHeight / 2
  );
}

// ===============================
// COMMAND
// ===============================
module.exports = {
  config: {
    name: "pair",
    aliases: ["pair"],
    author: "Idle×Saow",
    category: "love",

    cooldown: 5,
    role: 0,

    usePrefix: true,

    description: {
      en: "Pair with a random group member"
    },

    usage: {
      en: "{p}pair"
    }
  },

  onStart: async function ({
    message,
    event,
    api
  }) {
    try {
      const threadID =
        event.threadID ||
        event.chat_id;

      const senderID =
        event.senderID ||
        event.userID ||
        message.senderID;

      if (!threadID || !senderID) {
        return message.reply(
          "❌ User information পাওয়া যায়নি!"
        );
      }

      // ===============================
      // GET GROUP MEMBERS
      // ===============================
      let threadInfo;

      try {
        threadInfo =
          await api.getThreadInfo(threadID);
      } catch (error) {
        console.log(
          "[PAIR] Thread info error:",
          error.message
        );

        return message.reply(
          "❌ Group member list পাওয়া যাচ্ছে না!"
        );
      }

      let participantIDs = [];

      // participantIDs = ["123", "456"]
      if (Array.isArray(threadInfo?.participantIDs)) {
        participantIDs =
          threadInfo.participantIDs.map(String);
      }

      // participants = [{userID:"123"}, ...]
      else if (Array.isArray(threadInfo?.participants)) {
        participantIDs =
          threadInfo.participants
            .map(user => {
              if (typeof user === "string") {
                return user;
              }

              return (
                user?.userID ||
                user?.id ||
                user?.participantID
              );
            })
            .filter(Boolean)
            .map(String);
      }

      // Remove duplicates
      participantIDs = [
        ...new Set(participantIDs)
      ];

      // ===============================
      // GROUP CHECK
      // ===============================
      if (participantIDs.length < 2) {
        return message.reply(
          "❌ Ei command ti shudhu group chat-e kaj korbe!"
        );
      }

      // ===============================
      // REMOVE COMMAND USER
      // ===============================
      const senderIDString =
        String(senderID);

      const otherMembers =
        participantIDs.filter(
          id => id !== senderIDString
        );

      if (!otherMembers.length) {
        return message.reply(
          "❌ Pair korar moto kono member nei!"
        );
      }

      // ===============================
      // RANDOM PARTNER
      // ===============================
      const randomPartnerID =
        otherMembers[
          Math.floor(
            Math.random() *
            otherMembers.length
          )
        ];

      // ===============================
      // GET BOTH USER DATA
      // ===============================
      const [sender, partner] =
        await Promise.all([
          getUser(api, senderIDString),
          getUser(api, randomPartnerID)
        ]);

      console.log(
        "[PAIR] Sender:",
        sender
      );

      console.log(
        "[PAIR] Partner:",
        partner
      );

      // ===============================
      // AVATARS
      // ===============================
      const [senderAvatar, partnerAvatar] =
        await Promise.all([
          loadRemoteImage(
            sender.avatar ||
            DEFAULT_AVATAR
          ),

          loadRemoteImage(
            partner.avatar ||
            DEFAULT_AVATAR
          )
        ]);

      // ===============================
      // TEMPLATE
      // ===============================
      const templateBuffer =
        await fetchBuffer(TEMPLATE_URL);

      const template =
        await loadImage(templateBuffer);

      const canvas =
        createCanvas(
          template.width,
          template.height
        );

      const ctx =
        canvas.getContext("2d");

      ctx.drawImage(
        template,
        0,
        0,
        canvas.width,
        canvas.height
      );

      // ===============================
      // SCALE
      // Template original ≈ 1018 x 1536
      // ===============================
      const scaleX =
        canvas.width / 1018;

      const scaleY =
        canvas.height / 1536;

      const scale =
        Math.min(scaleX, scaleY);

      // ===============================
      // AVATAR POSITION
      // ===============================
      // Left frame center
      const leftCX =
        317 * scaleX;

      const leftCY =
        935 * scaleY;

      // Right frame center
      const rightCX =
        705 * scaleX;

      const rightCY =
        935 * scaleY;

      const avatarSize =
        285 * scale;

      drawCircleImage(
        ctx,
        senderAvatar,
        leftCX,
        leftCY,
        avatarSize
      );

      drawCircleImage(
        ctx,
        partnerAvatar,
        rightCX,
        rightCY,
        avatarSize
      );

      // ===============================
      // COVER OLD NAMES
      // ===============================
      const nameY =
        1165 * scaleY;

      const nameH =
        145 * scaleY;

      const leftNameX =
        118 * scaleX;

      const rightNameX =
        527 * scaleX;

      const nameW =
        373 * scaleX;

      roundedRect(
        ctx,
        leftNameX,
        nameY,
        nameW,
        nameH,
        30 * scale,
        "#F2EFF6"
      );

      roundedRect(
        ctx,
        rightNameX,
        nameY,
        nameW,
        nameH,
        30 * scale,
        "#F2EFF6"
      );

      // ===============================
      // DRAW DYNAMIC NAMES
      // ===============================
      drawName(
        ctx,
        sender.name,
        leftNameX,
        nameY,
        nameW,
        nameH,
        scale
      );

      drawName(
        ctx,
        partner.name,
        rightNameX,
        nameY,
        nameW,
        nameH,
        scale
      );

      // ===============================
      // RANDOM COMPATIBILITY
      // 60 - 100%
      // ===============================
      const compatibility =
        Math.floor(
          Math.random() * 41
        ) + 60;

      // ===============================
      // COVER OLD COMPATIBILITY
      // ===============================
      roundedRect(
        ctx,
        95 * scaleX,
        1360 * scaleY,
        830 * scaleX,
        105 * scaleY,
        25 * scale,
        "rgba(232, 218, 237, 0.96)"
      );

      // ===============================
      // NEW COMPATIBILITY
      // ===============================
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      ctx.font =
        `bold ${42 * scale}px Georgia`;

      ctx.fillStyle = "#171717";

      ctx.fillText(
        `→ COMPATIBILITY: ${compatibility}% 💘`,
        canvas.width / 2,
        1410 * scaleY
      );

      // ===============================
      // SAVE
      // ===============================
      const cacheDir =
        path.join(
          __dirname,
          "cache"
        );

      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(
          cacheDir,
          { recursive: true }
        );
      }

      const outputPath =
        path.join(
          cacheDir,
          `pair_${senderID}_${Date.now()}.png`
        );

      fs.writeFileSync(
        outputPath,
        canvas.toBuffer("image/png")
      );

      // ===============================
      // SEND
      // ===============================
      await message.reply({
        body:
          `💘 MATCHMAKING COMPLETE 💘\n\n` +
          `👤 ${sender.name} × ${partner.name}\n` +
          `✨ Compatibility: ${compatibility}%`,

        attachment:
          fs.createReadStream(outputPath)
      });

      // ===============================
      // DELETE CACHE
      // ===============================
      setTimeout(() => {
        try {
          if (fs.existsSync(outputPath)) {
            fs.unlinkSync(outputPath);
          }
        } catch (e) {}
      }, 15000);

    } catch (error) {
      console.error(
        "[PAIR ERROR]",
        error
      );

      return message.reply(
        "❌ Pair banner generate korte problem hoyeche!"
      );
    }
  }
};
