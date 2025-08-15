const { makeWASocket, useMultiFileAuthState, DisconnectReason, jidNormalizedUser } = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');

const OWNER_NUMBER = '18093426507';

let settings = { antilinks: false, antispam: false, welcome: false, goodbye: false };
let admins = [OWNER_NUMBER];

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        auth: state
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            console.log('📱 Escanea este código QR para vincular el bot:');
            qrcode.generate(qr, { small: true });
        }
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            console.log('✅ Bot conectado');
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const sender = msg.key.remoteJid;
        const participant = msg.key.participant || sender;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';

        // Comandos de administración de admins
        if (sender.endsWith('@g.us') && text.startsWith('!addadmin') && admins.includes(participant)) {
            const newAdmin = text.split(' ')[1];
            if(newAdmin && !admins.includes(newAdmin)) {
                admins.push(newAdmin);
                await sock.sendMessage(sender, { text: `✅ ${newAdmin} agregado como admin.` });
            }
        }
        if (sender.endsWith('@g.us') && text.startsWith('!deladmin') && admins.includes(participant)) {
            const delAdmin = text.split(' ')[1];
            if(delAdmin && delAdmin !== OWNER_NUMBER && admins.includes(delAdmin)) {
                admins = admins.filter(a => a !== delAdmin);
                await sock.sendMessage(sender, { text: `✅ ${delAdmin} eliminado de admins.` });
            }
        }
        if (sender.endsWith('@g.us') && text.startsWith('!listadmins') && admins.includes(participant)) {
            await sock.sendMessage(sender, { text: `👑 Admins actuales: ${admins.join(', ')}` });
        }

        // Menú admin
        if (sender.endsWith('@g.us') && text.startsWith('!menu') && admins.includes(participant)) {
            await sock.sendMessage(sender, { text: `📋 Menú de configuración
1️⃣ Antilinks: ${settings.antilinks ? 'ON' : 'OFF'}
2️⃣ Antispam: ${settings.antispam ? 'ON' : 'OFF'}
3️⃣ Bienvenida: ${settings.welcome ? 'ON' : 'OFF'}
4️⃣ Despedida: ${settings.goodbye ? 'ON' : 'OFF'}

Usa:
!set antilinks on/off
!set antispam on/off
!set welcome on/off
!set goodbye on/off

Admins pueden usar:
!addadmin NUMERO
!deladmin NUMERO
!listadmins
` });
        }

        // Configuración de funciones
        if (sender.endsWith('@g.us') && text.startsWith('!set') && admins.includes(participant)) {
            const [, feature, value] = text.split(' ');
            if(settings.hasOwnProperty(feature)) {
                settings[feature] = value === 'on';
                await sock.sendMessage(sender, { text: `✅ ${feature} cambiado a ${value.toUpperCase()}` });
            } else {
                await sock.sendMessage(sender, { text: '❌ Opción inválida' });
            }
        }

        // Anti-links simple
        if (settings.antilinks && sender.endsWith('@g.us')) {
            const linkPattern = /(https?:\/\/[^\s]+)/gi;
            const messageText = text;
            if (linkPattern.test(messageText)) {
                await sock.sendMessage(sender, { text: `❌ Mensaje eliminado por contener link.` });
                try { await sock.sendMessage(sender, { delete: msg.key }); } catch(e){ }
            }
        }

        // Antispam básico: (ejemplo muy simple)
        // Puedes mejorar según tus necesidades

    });

    // Bienvenida y despedida
    sock.ev.on('group-participants.update', async (update) => {
        const groupId = update.id;
        for (const participant of update.participants) {
            if (update.action === 'add' && settings.welcome) {
                await sock.sendMessage(groupId, { text: `👋 Bienvenido @${participant.split('@')[0]} al grupo!` });
            } else if (update.action === 'remove' && settings.goodbye) {
                await sock.sendMessage(groupId, { text: `😢 @${participant.split('@')[0]} ha salido del grupo.` });
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

startBot();
