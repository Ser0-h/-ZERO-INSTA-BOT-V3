const { createCanvas, loadImage } = require('@napi-rs/canvas');
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

// 🔗 Catbox Template JPG URL
const CATBOX_TEMPLATE_URL = "https://files.catbox.moe/bfonlm.jpg";

/**
 * Avatar Fetcher Helper
 */
async function getAvatarUrl(userID, username = "") {
  const defaultAvatar = 'https://i.imgur.com/6VBx3io.png';
  try {
    if (username) {
      const response = await axios.get(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${username}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'x-ig-app-id': '936619743392459'
        },
        timeout: 5000
      });
      const hdPicUrl = response.data?.data?.user?.profile_pic_url_hd || response.data?.data?.user?.profile_pic_url;
      if (hdPicUrl) return hdPicUrl;
    }

    if (userID) {
      return `https://graph.facebook.com/${userID}/picture?height=720&width=720&access_token=6628568379%7Cc1e620fa708a1d5696fb991c1bde5662`;
    }
  } catch (error) {
    console.error("Avatar Fetch Error:", error.message);
  }
  return defaultAvatar;
}

/**
 * Rounded Rectangle Drawer (Purano Name Box Dhakar Jonno)
 */
function drawRoundedRect(ctx, x, y, width, height, radius, fillStyle) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fillStyle = fillStyle;
  ctx.fill();
  ctx.restore();
}

/**
 * Circular Avatar Drawer
 */
function drawCircularImage(ctx, img, x, y, size) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2, true);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(img, x, y, size, size);
  ctx.restore();
}

module.exports = {
  config: {
    name: "pair",
    aliases: ["pair"],
    author: "idle×Saow",
    category: "love",
    cooldown: 5,
    role: 0,
    usePrefix: true,
    description: { en: "Pair with a random group member" },
    usage: { en: "{p}pair" }
  },

  onStart: async function ({ message, event, api, usersData, prefix }) {
    try {
      const threadID = event.threadID || event.chat_id;
      const senderID = event.senderID || message.senderID;

      let threadInfo = null;
      try {
        threadInfo = await api.getThreadInfo(threadID);
      } catch (e) {
        threadInfo = null;
      }

      let participantIDs = threadInfo ? (threadInfo.participantIDs || threadInfo.participants) : [];

      if (!participantIDs || participantIDs.length < 2) {
        return message.reply(`❌ Ei command ti shudhu group chat (GC)-e kaj korbe!\nUsage: ${prefix}pair`);
      }

      // Random Partner Pick
      let otherMembers = participantIDs.filter(id => id !== senderID);
      let randomPartnerID = otherMembers[Math.floor(Math.random() * otherMembers.length)];

      // Get Users Info
      let senderInfo = {};
      let partnerInfo = {};

      try { senderInfo = (await usersData.get(senderID)) || {}; } catch (e) { senderInfo = {}; }
      try { partnerInfo = (await usersData.get(randomPartnerID)) || {}; } catch (e) { partnerInfo = {}; }

      let senderName = senderInfo.name || senderInfo.username || "Sender";
      let partnerName = partnerInfo.name || partnerInfo.username || "Partner";

      // Fetch Avatars
      let senderAvatarUrl = await getAvatarUrl(senderID, senderInfo.username);
      let partnerAvatarUrl = await getAvatarUrl(randomPartnerID, partnerInfo.username);

      const fetchImage = async (url) => {
        try {
          const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 8000 });
          return await loadImage(Buffer.from(res.data));
        } catch (e) {
          return await loadImage('https://i.imgur.com/6VBx3io.png');
        }
      };

      // Download Template
      let templateImg;
      try {
        const templateRes = await axios.get(CATBOX_TEMPLATE_URL, { responseType: 'arraybuffer', timeout: 10000 });
        templateImg = await loadImage(Buffer.from(templateRes.data));
      } catch (err) {
        return message.reply("❌ Template image download korte somossa hoyeche!");
      }

      const canvas = createCanvas(templateImg.width, templateImg.height);
      const ctx = canvas.getContext('2d');

      // Draw Background
      ctx.drawImage(templateImg, 0, 0, canvas.width, canvas.height);

      const [senderAvatar, partnerAvatar] = await Promise.all([
        fetchImage(senderAvatarUrl),
        fetchImage(partnerAvatarUrl)
      ]);

      // 📍 Scale calculation (Template width x height adapt korar jonno)
      const scaleX = canvas.width / 663;
      const scaleY = canvas.height / 1000;

      // 1. Profile Picture Size & Position (Kalo biral & meyer frame-er thik majhkhane)
      const avatarSize = 182 * scaleX;
      const leftX = 139 * scaleX;
      const leftY = 514 * scaleY;
      const rightX = 342 * scaleX;
      const rightY = 514 * scaleY;

      drawCircularImage(ctx, senderAvatar, leftX, leftY, avatarSize);
      drawCircularImage(ctx, partnerAvatar, rightX, rightY, avatarSize);

      // 2. Cover Old Names ("SADIKUR RAHMAN" & "SEHNAZ FATEMA" dhakar jonno box)
      const boxW = 210 * scaleX;
      const boxH = 65 * scaleY;
      const boxRadius = 16 * scaleX;
      const boxY = 785 * scaleY;

      // White/Light background fill for new text
      drawRoundedRect(ctx, 125 * scaleX, boxY, boxW, boxH, boxRadius, '#F2EFF6');
      drawRoundedRect(ctx, 328 * scaleX, boxY, boxW, boxH, boxRadius, '#F2EFF6');

      // 3. Draw New Dynamic Names
      ctx.fillStyle = '#1A1A1A';
      ctx.textAlign = 'center';
      ctx.font = `bold ${Math.floor(19 * scaleX)}px Arial`;

      ctx.fillText(senderName.toUpperCase(), 230 * scaleX, boxY + (boxH / 2) + 6);
      ctx.fillText(partnerName.toUpperCase(), 433 * scaleX, boxY + (boxH / 2) + 6);

      // Save Output
      const cacheDir = path.join(__dirname, 'cache');
      if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

      const outputPath = path.join(cacheDir, `pair_${senderID}.png`);
      await fs.writeFile(outputPath, canvas.toBuffer('image/png'));

      const compatibility = Math.floor(Math.random() * 41) + 60;

      await message.reply({
        body: `💘 MATCHMAKING COMPLETE 💘\n\n👤 ${senderName} × ${partnerName}\n✨ Compatibility: ${compatibility}%`,
        attachment: fs.createReadStream(outputPath)
      });

      setTimeout(() => {
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      }, 10000);

    } catch (error) {
      console.error(error);
      return message.reply("Pair banner generate korte problem hoyeche: " + error.message);
    }
  }
};
