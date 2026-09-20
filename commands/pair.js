const { createCanvas, loadImage } = require('@napi-rs/canvas');
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

/**
 * Instagram Profile Picture Fetcher API Helper
 */
async function getInstagramAvatar(userID, username = "") {
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
    console.error("Avatar API Fetch Error:", error.message);
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

      let threadInfo = await api.getThreadInfo(threadID).catch(() => null);
      let participantIDs = threadInfo ? threadInfo.participantIDs : [];

      if (!participantIDs || participantIDs.length < 2) {
        return message.reply(`❌ এই কমান্ডটি শুধু গ্রুপ চ্যাটে (GC) কাজ করবে এবং কমপক্ষে ২ জন মেম্বার থাকতে হবে!\nব্যবহার পদ্ধতি: ${prefix}pair`);
      }

      let otherMembers = participantIDs.filter(id => id !== senderID);
      let randomPartnerID = otherMembers[Math.floor(Math.random() * otherMembers.length)];

      let senderInfo = await usersData.get(senderID).catch(() => null) || {};
      let partnerInfo = await usersData.get(randomPartnerID).catch(() => null) || {};

      let senderName = senderInfo.name || "User";
      let partnerName = partnerInfo.name || "Partner";

      let senderAvatarUrl = await getInstagramAvatar(senderID, senderInfo.username);
      let partnerAvatarUrl = await getInstagramAvatar(randomPartnerID, partnerInfo.username);

      const fetchImage = async (url) => {
        try {
          const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 8000 });
          return await loadImage(Buffer.from(res.data));
        } catch (e) {
          return await loadImage('https://i.imgur.com/6VBx3io.png');
        }
      };

      // Cache folder auto creation
      const cacheDir = path.join(__dirname, 'cache');
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }

      const templatePath = path.join(cacheDir, 'pair_template.png');

      if (!fs.existsSync(templatePath)) {
        return message.reply("⚠️ Banner template 'cache/pair_template.png' পাওয়া যায়নি!");
      }

      const templateImg = await loadImage(templatePath);
      const canvas = createCanvas(templateImg.width, templateImg.height);
      const ctx = canvas.getContext('2d');

      ctx.drawImage(templateImg, 0, 0, canvas.width, canvas.height);

      const [senderAvatar, partnerAvatar] = await Promise.all([
        fetchImage(senderAvatarUrl),
        fetchImage(partnerAvatarUrl)
      ]);

      const drawCircularImage = (img, x, y, size) => {
        ctx.save();
        ctx.beginPath();
        ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2, true);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(img, x, y, size, size);
        ctx.restore();
      };

      const avatarSize = 220;
      const leftX = 145;
      const leftY = 485;
      const rightX = 535;
      const rightY = 485;

      drawCircularImage(senderAvatar, leftX, leftY, avatarSize);
      drawCircularImage(partnerAvatar, rightX, rightY, avatarSize);

      ctx.fillStyle = '#1A1A1A';
      ctx.textAlign = 'center';
      ctx.font = 'bold 26px Arial';

      ctx.fillText(senderName.toUpperCase(), leftX + avatarSize / 2, leftY + avatarSize + 115);
      ctx.fillText(partnerName.toUpperCase(), rightX + avatarSize / 2, rightY + avatarSize + 115);

      const outputPath = path.join(cacheDir, `pair_${senderID}.png`);
      const buffer = canvas.toBuffer('image/png');
      await fs.writeFile(outputPath, buffer);

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
      return message.reply("Pair banner generate করতে সমস্যা হয়েছে: " + error.message);
    }
  }
};
