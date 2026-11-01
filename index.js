const http = require('http');
const readline = require('readline');
const mineflayer = require('mineflayer');

// Web server ringan menggunakan modul bawaan Node.js
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Mesin Bot Mancing Aktif!');
});

server.listen(process.env.PORT || 3000, () => {
    console.log('Web server berjalan.');
});

let currentBot = null;
let reconnectTimeout = null;
let tampilkanChat = false;
let modeMancing = false;
let sedangMancing = false;
let sedangMakan = false;

const makananTerlarang = [
    'rotten_flesh',
    'spider_eye',
    'poisonous_potato',
    'pufferfish',
    'chorus_fruit',
    'chicken',
    'cod',
    'salmon',
    'tropical_fish'
];

// Membaca ketikan langsung dari Console Pterodactyl
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});

rl.on('line', async (input) => {
    const text = input.trim();
    if (!text) return;

    if (!currentBot || !currentBot.entity) {
        console.log('[Info] Bot belum masuk ke dalam server.');
        return;
    }

    // Jika diawali tanda seru (!), jalankan perintah kontrol bot
    if (text.startsWith('!')) {
        const args = text.slice(1).trim().split(/\s+/);
        const cmd = args[0].toLowerCase();

        const arahGerak = {
            'maju': 'forward',
            'mundur': 'back',
            'kiri': 'left',
            'kanan': 'right'
        };

        if (cmd === 'pw') {
            const tujuan = args.slice(1).join(' ');
            if (!tujuan) {
                console.log('[Info] Gunakan format: !pw [nama tempat] atau /pw [nama tempat]');
                return;
            }
            modeMancing = false; // Matikan mancing sementara saat pindah tempat
            currentBot.chat(`/pw ${tujuan}`);
            console.log(`[Teleport] Mengirim perintah: /pw ${tujuan}`);
        } else if (cmd === 'mancing') {
            modeMancing = !modeMancing;
            console.log(`[Mancing] Mode Auto-Fishing: ${modeMancing ? 'AKTIF' : 'NONAKTIF'}`);
            if (modeMancing) {
                loopMancing(currentBot);
            } else if (sedangMancing) {
                currentBot.activateItem(); // Tarik kail jika sedang di air
            }
        } else if (cmd === 'lihat') {
            const yaw = parseFloat(args[1]) || 0;
            const pitch = parseFloat(args[2]) || 0;
            await currentBot.look(yaw * (Math.PI / 180), pitch * (Math.PI / 180), true);
            console.log(`[Pandang] Arah kepala diubah ke Yaw: ${yaw}°, Pitch: ${pitch}°`);
        } else if (cmd === 'isi') {
            const items = currentBot.inventory.items();
            if (items.length === 0) {
                console.log('[Inventory] Kosong.');
            } else {
                const daftar = items.map(i => `${i.name} (x${i.count})`).join(', ');
                console.log(`[Inventory] ${daftar}`);
            }
        } else if (cmd === 'buangsemua') {
            const sedangAktifMancing = modeMancing;
            modeMancing = false;
            console.log('[Inventory] Membuang hasil pancingan...');
            for (const item of currentBot.inventory.items()) {
                const isMakanan = currentBot.registry.foodsByName && currentBot.registry.foodsByName[item.name] && !makananTerlarang.includes(item.name);
                if (item.name !== 'fishing_rod' && !isMakanan) {
                    try {
                        await currentBot.tossStack(item);
                    } catch (e) {}
                }
            }
            console.log('[Inventory] Selesai membuang item.');
            if (sedangAktifMancing) {
                modeMancing = true;
                loopMancing(currentBot);
            }
        } else if (arahGerak[cmd]) {
            const durasi = (parseFloat(args[1]) || 2) * 1000;
            const kontrol = arahGerak[cmd];
            currentBot.setControlState(kontrol, true);
            console.log(`[Gerak] Bot bergerak ${cmd} selama ${durasi / 1000} detik...`);
            setTimeout(() => {
                if (currentBot && currentBot.entity) currentBot.setControlState(kontrol, false);
            }, durasi);
        } else if (cmd === 'lompat') {
            currentBot.setControlState('jump', true);
            setTimeout(() => {
                if (currentBot && currentBot.entity) currentBot.setControlState('jump', false);
            }, 500);
            console.log('[Gerak] Bot melompat.');
        } else if (cmd === 'stop') {
            modeMancing = false;
            currentBot.clearControlStates();
            console.log('[Gerak] Semua gerakan dan mancing dihentikan.');
        } else if (cmd === 'posisi') {
            const pos = currentBot.entity.position;
            console.log(`[Posisi] X: ${Math.floor(pos.x)}, Y: ${Math.floor(pos.y)}, Z: ${Math.floor(pos.z)}`);
        } else if (cmd === 'chat') {
            tampilkanChat = !tampilkanChat;
            console.log(`[Info] Tampilan chat server di console: ${tampilkanChat ? 'AKTIF' : 'NONAKTIF'}`);
        } else {
            console.log('[Info] Perintah: /pw [nama], !mancing, !isi, !buangsemua, !lihat [yaw] [pitch], !maju, !stop, !posisi, !chat');
        }
        return;
    }

    // Jika mengetik /pw atau chat biasa, kirim langsung ke server
    if (text.toLowerCase().startsWith('/pw ')) {
        modeMancing = false; // Hentikan mancing otomatis saat teleport
    }
    currentBot.chat(text);
    console.log(`[Terkirim ke Server]: ${text}`);
});

// Fungsi utama Auto-Eat
async function cekDanMakan(bot) {
    if (sedangMakan || !bot.food || bot.food > 14) return;
    if (!bot.registry || !bot.registry.foodsByName) return;

    const daftarMakanan = bot.inventory.items()
        .filter(item => bot.registry.foodsByName[item.name] && !makananTerlarang.includes(item.name))
        .sort((a, b) => bot.registry.foodsByName[b.name].foodPoints - bot.registry.foodsByName[a.name].foodPoints);

    const makanan = daftarMakanan[0];
    if (!makanan) return;

    try {
        sedangMakan = true;
        console.log(`[Auto-Eat] Sedang makan ${makanan.name}...`);
        await bot.equip(makanan, 'hand');
        await bot.consume();
    } catch (err) {
        // Abaikan jika proses makan terputus
    } finally {
        sedangMakan = false;
    }
}

// Fungsi utama Auto-Fishing
async function loopMancing(bot) {
    if (!modeMancing || sedangMancing || !bot.entity) return;

    sedangMancing = true;

    while (modeMancing && bot === currentBot && bot.entity) {
        // Cek lapar terlebih dahulu sebelum melempar kail
        if (bot.food !== undefined && bot.food <= 14) {
            await cekDanMakan(bot);
        }

        // Cari Fishing Rod di inventory
        const pancingan = bot.inventory.items().find(item => item.name === 'fishing_rod');
        if (!pancingan) {
            console.log('[Mancing] Fishing Rod tidak ditemukan di inventory! Mode mancing dihentikan.');
            modeMancing = false;
            break;
        }

        try {
            await bot.equip(pancingan, 'hand');
            await bot.fish();
            console.log('[Mancing] Berhasil mendapat tangkapan!');
        } catch (err) {
            // Jika gagal atau dibatalkan, tunggu sebentar sebelum melempar ulang
            await new Promise(r => setTimeout(r, 1500));
        }

        // Jeda 1 detik antar lemparan agar aman dari anti-cheat server
        await new Promise(r => setTimeout(r, 1000));
    }

    sedangMancing = false;
}

function createBot() {
    if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
    }

    const bot = mineflayer.createBot({
        host: 'play.mikahsmp.my.id',
        username: 'FZALX',
        version: '1.20.1',
        viewDistance: 'tiny',
        checkTimeoutInterval: 60000,
        // Sound dan Particle dibiarkan aktif agar sensor pancingan berfungsi
        plugins: {
            scoreboard: false,
            villager: false,
            team: false,
            boss_bar: false,
            tablist: false,
            title: false,
            book: false,
            painting: false
        }
    });

    currentBot = bot;
    let jumpInterval = null;
    let loginTimeout = null;

    bot.on('login', () => {
        console.log('Bot berhasil masuk ke server!');
    });

    bot.once('spawn', () => {
        console.log('Bot berhasil spawn! Ketik /pw [nama] untuk teleport, lalu ketik !mancing untuk mulai memancing.');

        loginTimeout = setTimeout(() => {
            bot.chat('/login izalierty');
            console.log('Mengirim perintah login...');
        }, 2000);

        // Fitur melompat setiap 5 menit (hanya melompat jika sedang TIDAK memancing)
        jumpInterval = setInterval(() => {
            if (bot.entity && !modeMancing) {
                bot.setControlState('jump', true);
                setTimeout(() => {
                    if (bot.entity) bot.setControlState('jump', false);
                }, 1000);
            }
        }, 300000);
    });

    bot.on('messagestr', (msg) => {
        if (tampilkanChat) {
            console.log(`[Chat Server] ${msg}`);
        }
    });

    bot.on('health', () => {
        // Hanya langsung makan jika sedang tidak melempar pancingan
        if (!sedangMancing) {
            cekDanMakan(bot);
        }
    });

    function cleanup() {
        modeMancing = false;
        sedangMancing = false;
        sedangMakan = false;
        if (jumpInterval) {
            clearInterval(jumpInterval);
            jumpInterval = null;
        }
        if (loginTimeout) {
            clearTimeout(loginTimeout);
            loginTimeout = null;
        }
        currentBot = null;
        bot.removeAllListeners();
    }

    bot.on('end', (reason) => {
        console.log(`Koneksi terputus: ${reason}. Mencoba masuk kembali dalam 10 detik...`);
        cleanup();
        reconnectTimeout = setTimeout(createBot, 10000);
    });

    bot.on('error', (err) => {
        console.log(`Terjadi Error: ${err.message}`);
    });
}

createBot();
