const { Telegraf } = require('telegraf');
const dotenv = require('dotenv');
const fs = require('fs');
const axios = require('axios');
const path = require('path');
const bcrypt = require('bcrypt');

dotenv.config();

const bot = new Telegraf(process.env.BOT_TOKEN);

// Проверка пароля
async function checkPassword(inputPassword, storedHash) {
    return await bcrypt.compare(inputPassword, storedHash);
}

// Пример использования
async function verifyAdminPassword(inputPassword) {
    const storedHash = process.env.ADMIN_PASSWORD_HASH;  // Хеш пароля из переменных окружения
    const isPasswordValid = await checkPassword(inputPassword, storedHash);
    return true;
}

let userStates = {};
let users = {};
let users_Broadcast = {};

// Загрузка логов в файл user_logs.txt
async function logMessageToFile(username, userMessage, botResponse) {
    const logMessage = `Имя: ${username}, Сообщение: ${userMessage}, Ответ бота: ${botResponse}\n`;
    try {
        await fs.promises.appendFile('./logs/users_logs.txt', logMessage, 'utf8');
    } catch (error) {
        console.error('Ошибка при записи логов:', error);
    }
}

// Функция для отправки логов администратору
async function sendLogsToAdmin(ctx) {
    const filePath = './logs/users_logs.txt';
    try {
        await ctx.replyWithDocument({ source: filePath });
        fs.unlinkSync(filePath); // Удаляем файл после отправки
    } catch (error) {
        console.error('Ошибка при отправке логов:', error);
        ctx.reply('Произошла ошибка при отправке логов.');
    }
}

// Начало бота
bot.start((ctx) => {
    const chatId = ctx.chat.id;
    const username = ctx.message.chat.username;
    users[username] = chatId;

    ctx.reply('Привет! Я бот, который может помочь тебе с вопросами, связанные с SilkWay Cargo. Также, я проверяю на правильность заполненную адресную строку в таких приложениях, как: Pinduoduo, 1688, Alibaba, Taobao', {
        reply_markup: {
            keyboard: [
                [
                    { text: 'Задать вопрос' },
                    { text: 'Проверить правильность адреса' },
                ],
                [{ text: 'Связь с менеджером' }],
                [{ text: 'Подписаться' }, { text: 'Отписаться' }]
            ],
            resize_keyboard: true,
        }
    });
});

bot.hears('Подписаться', (ctx) => {
    const username = ctx.message.chat.username;
    const chatId = ctx.chat.id;

    if (!users_Broadcast[username]) {
        users_Broadcast[username] = chatId;
        ctx.reply('Вы успешно подписались на рассылку!');
    } else {
        ctx.reply('Вы уже подписаны.');
    }
});

bot.hears('Отписаться', (ctx) => {
    const username = ctx.message.chat.username;

    if (users_Broadcast[username]) {
        delete users_Broadcast[username];
        ctx.reply('Вы успешно отписались от рассылки!');
    } else {
        ctx.reply('Вы не были подписаны.');
    }
});

// /admin
bot.command('admin', (ctx) => {
    const userId = ctx.chat.id;
    userStates[userId] = { state: 'awaiting_admin_code' };
    ctx.reply('Введите секретный код для доступа к админ-панели:');
});

// Обработка всех текстовых сообщений
bot.on('text', async (ctx) => {
    const userId = ctx.chat.id;
    const userMessage = ctx.message.text;

    if (!userStates[userId]) {
        userStates[userId] = { state: null };
    }

    // Получение админ токена
    if (userStates[userId].state === 'awaiting_admin_code') {
        const isPasswordValid = await verifyAdminPassword(userMessage);
        if (isPasswordValid) {
            userStates[userId] = { state: 'admin' };
            return showAdminPanel(ctx);
        } else {
            return ctx.reply('Неверный код. Попробуйте снова.');
        }
    }

    // Проверка на админа и начало рассылки
    if (userStates[userId].state === 'sending_news') {
        const newsMessage = userMessage;
        userStates[userId] = { state: 'admin' };
        await ctx.reply('Рассылка начата. Ожидайте завершения.');
        await handleNewsBroadcast(ctx, newsMessage);
        return showAdminPanel(ctx);
    }

    switch (userMessage) {
        case 'Связь с менеджером':
            return ctx.reply('Связь с менеджером: https://api.whatsapp.com/send?phone=77055188988&text=');
        case 'Задать вопрос':
            return ctx.reply('Пожалуйста, свяжитесь с менеджером для получения ответа.');
        case 'Проверить правильность адреса':
            return ctx.reply('Функция проверки адреса временно недоступна.');
        default:
            return ctx.reply('Вы выбрали несуществующую функцию.');
    }
});

// По названию надеюсь понятно...
function showAdminPanel(ctx) {
    ctx.reply('Добро пожаловать в админ-панель! Выберите действие:', {
        reply_markup: {
            inline_keyboard: [
                [{ text: '📢 Рассылка новостей', callback_data: 'send_news' }],
                [{ text: '👥 Список пользователей', callback_data: 'list_users' }],
                [{ text: '👥 📢 Список пользователей c рассылкой', callback_data: 'list_broadcast_users' }],
                [{ text: '✉ Получить логи', callback_data: 'logs' }],
                [{ text: '🔙 Выйти из панели', callback_data: 'exit_admin' }],
            ],
        },
    });
}

// Обработка callback_query
bot.on('callback_query', async (ctx) => {
    const userId = ctx.chat.id;
    const option = ctx.callbackQuery.data;

    switch (option) {
        case 'send_news':
            userStates[userId] = { state: 'sending_news' };
            return ctx.reply('Введите текст новости для рассылки:');
        case 'logs':
            return sendLogsToAdmin(ctx);
        case 'list_users':
            return ctx.reply(`Всего пользователей:\n${Object.keys(users).join('\n')}`);
        case 'list_broadcast_users':
            return ctx.reply(`Всего пользователей с подпиской:\n${Object.keys(users_Broadcast).join('\n')}`);
        case 'exit_admin':
            userStates[userId] = { state: null };
            return ctx.reply('Вы вышли из админ-панели.');
        case 'main_menu': 
            return ctx.reply('Вы вернулись в главное меню.');
        default:
            return ctx.reply('Неизвестная команда.');
    }
});

// Функция для отправки рассылки
async function handleNewsBroadcast(ctx, message) {
    let successCount = 0;
    let failCount = 0;

    for (const username in users_Broadcast) {
        const chatId = users_Broadcast[username];
        try {
            await ctx.telegram.sendMessage(chatId, `📢 Новости:\n${message}`);
            successCount++;
        } catch (error) {
            console.error(`Ошибка отправки для пользователя ${chatId}:`, error);
            failCount++;
        }
    }

    ctx.reply(`Рассылка завершена. Успешно отправлено: ${successCount}, Ошибок: ${failCount}`);
}

// Запуск бота
bot.launch().then(() => {
    console.log('Бот запущен!');
});
