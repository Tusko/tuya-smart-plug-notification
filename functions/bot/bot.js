const {Bot, InputFile} = require("grammy");
const {Menu} = require("@grammyjs/menu");

//local bot
//const bot = new Bot("6065682184:AAGj99qRP9AlXt5xp3zvaFuEzTy1NaBmSOQ");
// prod bot
const bot = new Bot("bot5976108869:AAHFHnaws69eThgoVNi2SafXiAWKPZScauQ");

bot.api.setMyCommands([
  {command: "start", description: "Початок роботи"},
  {command: "help", description: "Корисні посилання"},
  {command: "schedule", description: "Показати розклад"},
  {command: "ping", description: "Pong!"},
]);

const getUser = (info) => {
  const {id, is_bot, first_name, last_name} = info;
  const name = (
    first_name ? first_name : "" + " " + last_name ? last_name : ""
  ).trim();

  return {
    id,
    isBot: is_bot,
    name,
  };
};

const sendTable = (ctx, val) => {
  const domain = "https://dev1.one/svitloE/";
  ctx.replyWithPhoto(domain + val + ".png");
};

const menu = new Menu("myMenu")
  .text("1.1", (ctx) => sendTable(ctx, "1.1"))
  .text("1.2", (ctx) => sendTable(ctx, "1.2"))
  .row()
  .text("2.1", (ctx) => sendTable(ctx, "2.1"))
  .text("2.2", (ctx) => sendTable(ctx, "2.2"))
  .row()
  .text("3.1", (ctx) => sendTable(ctx, "3.1"))
  .text("3.2", (ctx) => sendTable(ctx, "3.2"));

const start = async (ctx) => {
  const {isBot, name} = getUser(ctx.from);

  if (isBot) {
    return ctx.reply(`Я не працюю з машинами, тіко з людьми!`);
  }

  try {
    await ctx.reply(
      `👋🏻  ${name}.
Для отримання доступних команд використовуй меню`
    );
  } catch (e) {
    return ctx.reply(`🤔 Упс, помилка`);
  }
};

bot.use(menu);

bot.command("start", start);
bot.command("help", (ctx) =>
  ctx.reply(
    `
Використовуй меню для отримання всіх команд.

Чому нема світла?
https://poweron.loe.lviv.ua/

Скільки залишилося до відключення?
https://lviv.energy-ua.info/grupa/2-2

Дізнатися групу відключення світла:
https://lviv.energy-ua.info/
`
  )
);
bot.command("schedule", (ctx) => {
  ctx.reply("💡 Оберіть групу для відображення графіка:", {
    reply_markup: menu,
  });
});
bot.command("ping", (ctx) => {
  ctx.reply("🏓");
});

bot.on("message", (ctx) =>
  ctx.reply(
    "Ваші повімдомлення дуже важливі для мене, але я їх не обробляю, поки що :)"
  )
);

exports.handler = async (event) => {
  try {
    await bot.start();

    return {
      statusCode: 200,
      body: "",
    };
  } catch (e) {
    console.log(e);

    return {
      statusCode: 400,
      body: "Цe кінцева точка призначена для спілкування ботів і телеграм",
    };
  }
};
