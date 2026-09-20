const { createCanvas, loadImage } = require('@napi-rs/canvas');
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

// 🔗 Aponar deowa Catbox Template JPG URL
const CATBOX_TEMPLATE_URL = "https://files.catbox.moe/bfonlm.jpg";

/**
 * Avatar Fetcher Helper Function
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

module.exports = {
  config: {
    name: "pair",
    aliases: ["pair"],
    author: "idle×Saow",
    category: "love",
    cooldown: 5,
    role: 0,
    usePrefix: true,
    description: { en: "Pair with a random group member with a custom banner" },
    usage: { en: "{p}pair" }
  },

  onStart: async function ({ message, event, api, usersData, prefix }) {
    try {
      const threadID = event.threadID || event.chat_id;
      const senderID = event.senderID || message.senderID;

      // Group Thread Info Fetching
      let threadInfo = null;
      try {
        threadInfo = await api.getThreadInfo(threadID);
      } catch (e) {
        threadInfo = null;
      }

      let participantIDs = threadInfo ? (threadInfo.participantIDs || threadInfo.participants) : [];

      if (!participantIDs || participantIDs.length < 2) {
        return message.reply(`❌ Ei command ti shudhu group chat e (GC) kaj korbe ebong kompokkhe 2 jon member thakte hobe!\nBabohar poddhoti: ${prefix}pair`);
      }

      // Random Partner Selection
      let otherMembers = participantIDs.filter(id => id !== senderID);
      let randomPartnerID = otherMembers[Math.floor(Math.random() * otherMembers.length)];

      // Fetch User Data
      let senderInfo = {};
      let partnerInfo = {};

      try {
        senderInfo = (await usersData.get(senderID)) || {};
      } catch (e) {
        senderInfo = {};
      }

      try {
        partnerInfo = (await usersData.get(randomPartnerID)) || {};
      } catch (e) {
        partnerInfo = {};
      }

      let senderName = senderInfo.name || senderInfo.username || "User";
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

      // 📥 Direct Catbox Template Loading
      let templateImg;
      try {
        const templateRes = await axios.get(CATBOX_TEMPLATE_URL, { responseType: 'arraybuffer', timeout: 10000 });
        templateImg = await loadImage(Buffer.from(templateRes.data));
      } catch (err) {
        return message.reply("❌ Catbox URL theke template image load hote somossa hoyeche!");
      }

      const canvas = createCanvas(templateImg.width, templateImg.height);
      const ctx = canvas.getContext('2d');

      // Draw Background Template
      ctx.drawImage(templateImg, 0, 0, canvas.width, canvas.height);

      const [senderAvatar, partnerAvatar] = await Promise.all([
        fetchImage(senderAvatarUrl),
        fetchImage(partnerAvatarUrl)
      ]);

      // Circle Profile Picture Drawer Function
      const drawCircularImage = (img, x, y, size) => {
        ctx.save();
        ctx.beginPath();
        ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2, true);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(img, x, y, size, size);
        ctx.restore();
      };

      // 📍 Profile Picture & Text Position Setup
      // Apnar template er structure onujayi ei value gulo dorkar hole change korte paren:
      const avatarSize = 220; // Profile Picture Size
      const leftX = 145;      // Left Profile Picture X position
      const leftY = 485;      // Left Profile Picture Y position
      const rightX = 535;     // Right Profile Picture X position
      const rightY = 485;     // Right Profile Picture Y position

      // Draw Profile Pictures
      drawCircularImage(senderAvatar, leftX, leftY, avatarSize);
      drawCircularImage(partnerAvatar, rightX, rightY, avatarSize);

      // Text Formatting Setup
      ctx.fillStyle = '#FFFFFF'; // Text Color (White)
      ctx.textAlign = 'center';
      ctx.font = 'bold 26px Arial';

      // Draw User Names
      ctx.fillText(senderName.toUpperCase(), leftX + avatarSize / 2, leftY + avatarSize + 50);
      ctx.fillText(partnerName.toUpperCase(), rightX + avatarSize / 2, rightY + avatarSize + 50);

      // Cache directory setup
      const cacheDir = path.join(__dirname, 'cache');
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }

      const outputPath = path.join(cacheDir, `pair_${senderID}.png`);
      const buffer = canvas.toBuffer('image/png');
      await fs.writeFile(outputPath, buffer);

      const compatibility = Math.floor(Math.random() * 41) + 60;

      await message.reply({
        body: `💘 MATCHMAKING COMPLETE 💘\n\n👤 ${senderName} × ${partnerName}\n✨ Compatibility: ${compatibility}%`,
        attachment: fs.createReadStream(outputPath)
      });

      // Temporary file delete
      setTimeout(() => {
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      }, 10000);

    } catch (error) {
      console.error(error);
      return message.reply("Pair banner generate korte somossa hoyeche: " + error.message);
    }
  }
};
