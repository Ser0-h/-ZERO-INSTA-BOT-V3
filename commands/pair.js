const { createCanvas, loadImage } = require("@napi-rs/canvas");
const fs = require("fs");
const path = require("path");

const TEMPLATE_URL = "https://files.catbox.moe/bfonlm.jpg";

const DEFAULT_AVATAR =
  "https://i.imgur.com/6VBx3io.png";

/* =========================================
   FETCH
========================================= */

async function fetchBuffer(url, timeout = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
      }
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    return Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

/* =========================================
   DEEP SEARCH
   API response structure যাই হোক খুঁজবে
========================================= */

function deepFind(obj, keys, depth = 0) {
  if (!obj || depth > 6) return null;

  if (typeof obj !== "object") return null;

  for (const key of keys) {
    if (
      Object.prototype.hasOwnProperty.call(obj, key) &&
      obj[key] != null
    ) {
      const value = obj[key];

      if (
        typeof value === "string" ||
        typeof value === "number"
      ) {
        return String(value);
      }
    }
  }

  for (const key of Object.keys(obj)) {
    try {
      const result = deepFind(
        obj[key],
        keys,
        depth + 1
      );

      if (result) return result;
    } catch {}
  }

  return null;
}

/* =========================================
   GET USER DATA
========================================= */

async function getUserData(api, userID) {
  try {
    const response = await api.getUserInfo(userID);

    console.log(
      `[PAIR] getUserInfo(${userID}):`,
      JSON.stringify(response)
    );

    /*
      Different API naming support
    */

    const name = deepFind(response, [
      "name",
      "fullName",
      "full_name",
      "username",
      "userName",
      "displayName",
      "display_name"
    ]);

    const avatar = deepFind(response, [
      "profilePicUrlHD",
      "profile_pic_url_hd",
      "profilePicUrl",
      "profile_pic_url",
      "profilePicture",
      "profile_picture",
      "profilePictureUrl",
      "profile_picture_url",
      "avatar",
      "avatarUrl",
      "avatar_url",
      "photoUrl",
      "photo_url",
      "thumbSrc",
      "thumb_src",
      "thumbnailUrl",
      "thumbnail_url"
    ]);

    return {
      id: String(userID),

      name:
        name ||
        `User ${userID}`,

      avatar:
        avatar || null
    };

  } catch (error) {
    console.log(
      `[PAIR] User info error ${userID}:`,
      error.message
    );

    return {
      id: String(userID),
      name: `User ${userID}`,
      avatar: null
    };
  }
}

/* =========================================
   LOAD IMAGE
========================================= */

async function getImage(url) {
  try {
    const buffer = await fetchBuffer(url);
    return await loadImage(buffer);
  } catch (error) {
    console.log(
      "[PAIR] Avatar load failed:",
      error.message
    );

    const fallback =
      await fetchBuffer(DEFAULT_AVATAR);

    return await loadImage(fallback);
  }
}

/* =========================================
   CIRCLE IMAGE
========================================= */

function drawCircleImage(
  ctx,
  img,
  cx,
  cy,
  size
) {
  ctx.save();

  ctx.beginPath();

  ctx.arc(
    cx,
    cy,
    size / 2,
    0,
    Math.PI * 2
  );

  ctx.closePath();
  ctx.clip();

  const scale = Math.max(
    size / img.width,
    size / img.height
  );

  const w = img.width * scale;
  const h = img.height * scale;

  ctx.drawImage(
    img,
    cx - w / 2,
    cy - h / 2,
    w,
    h
  );

  ctx.restore();
}

/* =========================================
   ROUND BOX
========================================= */

function roundRect(
  ctx,
  x,
  y,
  w,
  h,
  radius,
  color
) {
  ctx.save();

  ctx.beginPath();

  ctx.moveTo(x + radius, y);

  ctx.lineTo(
    x + w - radius,
    y
  );

  ctx.quadraticCurveTo(
    x + w,
    y,
    x + w,
    y + radius
  );

  ctx.lineTo(
    x + w,
    y + h - radius
  );

  ctx.quadraticCurveTo(
    x + w,
    y + h,
    x + w - radius,
    y + h
  );

  ctx.lineTo(
    x + radius,
    y + h
  );

  ctx.quadraticCurveTo(
    x,
    y + h,
    x,
    y + h - radius
  );

  ctx.lineTo(
    x,
    y + radius
  );

  ctx.quadraticCurveTo(
    x,
    y,
    x + radius,
    y
  );

  ctx.closePath();

  ctx.fillStyle = color;
  ctx.fill();

  ctx.restore();
}

/* =========================================
   DRAW NAME
========================================= */

function drawName(
  ctx,
  name,
  centerX,
  centerY,
  maxWidth
) {
  name = String(name || "Unknown")
    .replace(/\s+/g, " ")
    .trim();

  /*
    Long name হলে font ছোট হবে
  */

  let fontSize = 34;

  while (
    fontSize > 16
  ) {
    ctx.font =
      `bold ${fontSize}px Arial`;

    if (
      ctx.measureText(name).width <=
      maxWidth
    ) {
      break;
    }

    fontSize--;
  }

  ctx.fillStyle = "#111111";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.font =
    `bold ${fontSize}px Arial`;

  /*
    One line
  */

  if (
    ctx.measureText(name).width <=
    maxWidth
  ) {
    ctx.fillText(
      name.toUpperCase(),
      centerX,
      centerY
    );

    return;
  }

  /*
    Two line
  */

  const words =
    name.split(" ");

  let line1 = "";
  let line2 = "";

  for (const word of words) {
    const test =
      line1
        ? `${line1} ${word}`
        : word;

    if (
      ctx.measureText(test).width <=
      maxWidth
    ) {
      line1 = test;
    } else {
      line2 +=
        line2
          ? ` ${word}`
          : word;
    }
  }

  const lineHeight =
    fontSize * 1.05;

  ctx.fillText(
    line1.toUpperCase(),
    centerX,
    centerY - lineHeight / 2
  );

  ctx.fillText(
    line2.toUpperCase(),
    centerX,
    centerY + lineHeight / 2
  );
}

/* =========================================
   COMMAND
========================================= */

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

      /* =====================================
         SENDER
      ===================================== */

      const senderID =
        String(
          event.senderID ||
          event.userID ||
          message.senderID
        );

      const threadID =
        event.threadID ||
        event.chat_id;

      if (!senderID) {
        return message.reply(
          "❌ User ID পাওয়া যায়নি!"
        );
      }

      /* =====================================
         THREAD INFO
      ===================================== */

      let threadInfo;

      try {

        threadInfo =
          await api.getThreadInfo(
            threadID
          );

      } catch (error) {

        console.log(
          "[PAIR] Thread error:",
          error.message
        );

        return message.reply(
          "❌ Group information পাওয়া যাচ্ছে না!"
        );
      }

      /* =====================================
         PARTICIPANTS
      ===================================== */

      let members = [];

      if (
        Array.isArray(
          threadInfo?.participantIDs
        )
      ) {

        members =
          threadInfo.participantIDs
            .map(String);

      } else if (
        Array.isArray(
          threadInfo?.participants
        )
      ) {

        members =
          threadInfo.participants
            .map(user => {

              if (
                typeof user === "string"
              ) {
                return user;
              }

              return (
                user?.userID ||
                user?.id ||
                user?.uid ||
                user?.participantID
              );

            })
            .filter(Boolean)
            .map(String);
      }

      members = [
        ...new Set(members)
      ];

      /* =====================================
         GROUP CHECK
      ===================================== */

      if (members.length < 2) {

        return message.reply(
          "❌ Ei command ti shudhu group chat-e kaj korbe!"
        );
      }

      /* =====================================
         REMOVE COMMAND USER
      ===================================== */

      const possiblePartners =
        members.filter(
          id =>
            String(id) !==
            String(senderID)
        );

      if (
        possiblePartners.length === 0
      ) {

        return message.reply(
          "❌ Pair korar moto kono member nei!"
        );
      }

      /* =====================================
         RANDOM PARTNER
      ===================================== */

      const partnerID =
        possiblePartners[
          Math.floor(
            Math.random() *
            possiblePartners.length
          )
        ];

      /* =====================================
         GET ACTUAL USER DATA
      ===================================== */

      const [
        sender,
        partner
      ] = await Promise.all([

        getUserData(
          api,
          senderID
        ),

        getUserData(
          api,
          partnerID
        )

      ]);

      console.log(
        "[PAIR] FINAL SENDER:",
        sender
      );

      console.log(
        "[PAIR] FINAL PARTNER:",
        partner
      );

      /* =====================================
         GET PROFILE PICTURES
      ===================================== */

      const [
        senderAvatar,
        partnerAvatar
      ] = await Promise.all([

        getImage(
          sender.avatar ||
          DEFAULT_AVATAR
        ),

        getImage(
          partner.avatar ||
          DEFAULT_AVATAR
        )

      ]);

      /* =====================================
         TEMPLATE
      ===================================== */

      const templateBuffer =
        await fetchBuffer(
          TEMPLATE_URL
        );

      const template =
        await loadImage(
          templateBuffer
        );

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

      /*
        Template = 1018 x 1536
      */

      const sx =
        canvas.width / 1018;

      const sy =
        canvas.height / 1536;

      /* =====================================
         PROFILE PICTURES
      ===================================== */

      /*
        Frame-এর ভিতরের exact center
      */

      const avatarSize =
        260 * Math.min(
          sx,
          sy
        );

      const leftX =
        307 * sx;

      const rightX =
        711 * sx;

      const avatarY =
        933 * sy;

      drawCircleImage(
        ctx,
        senderAvatar,
        leftX,
        avatarY,
        avatarSize
      );

      drawCircleImage(
        ctx,
        partnerAvatar,
        rightX,
        avatarY,
        avatarSize
      );

      /* =====================================
         NAME BOX
      ===================================== */

      /*
        Existing names cover
      */

      const boxY =
        1168 * sy;

      const boxH =
        142 * sy;

      const boxW =
        375 * sx;

      const leftBoxX =
        118 * sx;

      const rightBoxX =
        525 * sx;

      /*
        Existing name area cover
      */

      roundRect(
        ctx,
        leftBoxX,
        boxY,
        boxW,
        boxH,
        28 * Math.min(sx, sy),
        "#F2EFF6"
      );

      roundRect(
        ctx,
        rightBoxX,
        boxY,
        boxW,
        boxH,
        28 * Math.min(sx, sy),
        "#F2EFF6"
      );

      /* =====================================
         ACTUAL NAMES
      ===================================== */

      drawName(
        ctx,
        sender.name,
        leftBoxX + boxW / 2,
        boxY + boxH / 2,
        boxW * 0.88
      );

      drawName(
        ctx,
        partner.name,
        rightBoxX + boxW / 2,
        boxY + boxH / 2,
        boxW * 0.88
      );

      /* =====================================
         RANDOM PERCENTAGE
      ===================================== */

      const percentage =
        Math.floor(
          Math.random() * 41
        ) + 60;

      /* =====================================
         COMPATIBILITY
      ===================================== */

      const compatibilityY =
        1408 * sy;

      /*
        পুরোনো percentage-এর উপর
        হালকা transparent box
      */

      roundRect(
        ctx,
        95 * sx,
        1360 * sy,
        830 * sx,
        105 * sy,
        20 * Math.min(sx, sy),
        "rgba(232, 218, 237, 0.92)"
      );

      ctx.fillStyle =
        "#171717";

      ctx.textAlign =
        "center";

      ctx.textBaseline =
        "middle";

      ctx.font =
        `bold ${40 * Math.min(sx, sy)}px Georgia`;

      ctx.fillText(
        `→ COMPATIBILITY: ${percentage}% 💘`,
        canvas.width / 2,
        compatibilityY
      );

      /* =====================================
         SAVE
      ===================================== */

      const cacheDir =
        path.join(
          __dirname,
          "cache"
        );

      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(
          cacheDir,
          {
            recursive: true
          }
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

      /* =====================================
         SEND
      ===================================== */

      await message.reply({
        body:
          `💘 MATCHMAKING COMPLETE 💘\n\n` +
          `👤 ${sender.name} × ${partner.name}\n` +
          `✨ Compatibility: ${percentage}%`,

        attachment:
          fs.createReadStream(
            outputPath
          )
      });

      /* =====================================
         DELETE CACHE
      ===================================== */

      setTimeout(() => {

        try {

          if (
            fs.existsSync(
              outputPath
            )
          ) {
            fs.unlinkSync(
              outputPath
            );
          }

        } catch {}

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
