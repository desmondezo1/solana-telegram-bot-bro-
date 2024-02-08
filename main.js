const mongoose = require('mongoose');
const TelegramBot = require('node-telegram-bot-api');
const Project = require('./models/projectModel'); 
const Admin = require('./models/adminModel'); // Path to your admin model file
require('dotenv').config()
const {TELEGRAM_BOT_TOKEN, GROUP_ID, MONGODB_URI} = process.env


const token = TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

// MongoDB connection string
const uri = MONGODB_URI;



// Connect to MongoDB
mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected...'))
  .catch(err => console.error(err));

  //check if user is an admin
async function isAdmin(username) {
    const admin = await Admin.findOne({ username });
    return !!admin;
}

//format date time in utc
function formatDateAndTimeUTC(date, type='time') {
    const padZero = (num) => num.toString().padStart(2, '0');

    // Extracting components in UTC
    const day = padZero(date.getUTCDate());
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = months[date.getUTCMonth()]; // Correctly select the month from the array
    const year = date.getUTCFullYear();
    const hours = padZero(date.getUTCHours());
    const minutes = padZero(date.getUTCMinutes());

    // Constructing the formatted date and time string in "06 Feb 2024 17:00" format
    // return `${day} ${month} ${year} ${hours}:${minutes}`;
    if(type === 'date'){
      return `${day} ${month} ${year}`;
    } else if( type === 'time'){
      return `${hours}:${minutes}`;
    } else {
      return `${day} ${month}`
    }

    
}

async function fetchLivePresales(Project) {
    const now = new Date();
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));

    const res = await Project.find({
      datetime: { $lte: now,  $gte: startOfToday}, // The presale has already started
      type: 'PP'
    }).lean();

    return res;
  }


function handleMessageResponse(chatId, message) {
    return bot.sendAnimation(chatId,
        'https://media.giphy.com/media/Wns2ge8PMaBLrcI7xW/giphy.gif', 
        { caption: message, parse_mode: 'HTML' }
      );
}

async function messageFormat(projects, type='time'){
    let message = '<b><u>LAUNCH LIST By @BroonSolana </u></b>\n';
    message += !type? '\n' :`Date: ${formatDateAndTimeUTC(new Date(), 'date')}\n`;
    message += 'All times are in UTC\n\n';

    const livePresales = await fetchLivePresales(Project);
    
    const typeToEmoji = {
      'PP': '🟢', 
      'WL': '🟠',
      'LA': '🟣',
      'NFT': '🔵',
      'AD': '🟡'
      
    };
  
        projects.forEach(project => {
          const emoji = typeToEmoji[project.type] || '🟠';
          message += `${formatDateAndTimeUTC(project.datetime, type)} | ${project.type} | ${project.taxRatio} | ${emoji} <a href="${project.link}">${project.name}</a>\n`;
        });
        message += `\n\n`; // Add a newline for spacing

      message += `This Bot is only usable by members of our community at @BroonSolana \n`;

      return message;
}



bot.onText(/\/start/, (msg) => {

    if(msg.chat.id !== GROUP_ID){
        return;
    }

    const option = {
        reply_markup: JSON.stringify({
            keyboard: [
              ['/list', '/add'],
            ],
            resize_keyboard: true,
            one_time_keyboard: true
          })
    };

    bot.sendMessage(msg.chat.id, "Welcome to $BRO Solana Launch Bot", option);
});

bot.on('message', (msg) => {
  console.log({ ent: msg.entities[0].url})
})


// Command to get instructions for adding a project
bot.onText(/\/add/, async (msg) => {
    const chatId = msg.chat.id;

    const fromUsername = msg.from.username;
    if (!await isAdmin(fromUsername)) {
        bot.sendMessage(chatId, "Sorry, you're not authorized to add projects.");
        return;
      }

    const instructions = `To add a new project, please use the following format:\n` +
    `/submit <date> <time> <type> <taxRatio> <link>\n\n` +
    `Example:\n` +
    `/submit 09/02/2024 15:00 WL 0/0 ExampleLink\n\n` +
    `Where:\n` +
    `- <date> is in DD/MM/YYYY format\n` +
    `- <time> is in 24hr UTC format (HH:MM)\n` +
    `- <type> is the project type (e.g., WL (Whitelist Presale), NFT (NFT Presales), AD (Airdrops)  FL (Fair Launch), LA (Launched), PP (Public Presale)\n` +
    `- <taxRatio> is the buy/sell tax (e.g., 0/0 for no tax)\n` +
    `- <link> is the Telegram handle or project link\n` +
    `Please replace the example values with your project details.`;

    bot.sendMessage(chatId, instructions);
  });
  

// Command to submit a new project, now including date in the submission
// bot.onText(/\/submit (\d{2}\/\d{2}\/\d{4}) (\d{2}:\d{2}) (\w+) (\d+\/\d+) @(\S+) (\S+) (\S+)/, async (msg, match) => {
  bot.onText(/\/submit (\d{2}\/\d{2}\/\d{4}) (\d{2}:\d{2}) (\w+) (\d+\/\d+) (.+)/, async (msg, match) => {

    const chatId = msg.chat.id;
    const fromUsername = msg.from.username;

  
    // Add your admin check here
    if (!await isAdmin(fromUsername)) {
      bot.sendMessage(chatId, "Sorry, you're not authorized to add projects.");
      return;
    }

    const [day, month, year] = match[1].split('/');
    const time = match[2];
    const type = match[3];
    const taxRatio = match[4];
    const link = match[5];
    const chain = match[6]; // This includes both the emoji and the chain name
    const website = match[7]; // The website link
    const datetimeISO = `${year}-${month}-${day}T${time}:00.000Z`;

    const newdatetime = new Date(datetimeISO);

    // Initialize projectLink as null
    let projectLink = null;

    // Check if there are entities and a URL entity
    if (msg.entities && msg.entities.some(entity => entity.type === 'text_link')) {
      const urlEntity = msg.entities.find(entity => entity.type === 'text_link');
      projectLink = urlEntity.url; // Extract the URL from the entity
    }

    // Proceed with adding the project to the database
    const newProject = new Project({
      datetime: newdatetime, // Store combined date and time
      type,
      name: link,
      taxRatio,
      link: projectLink,
      chain,
      website 
    });

    newProject.save()
      .then(() => bot.sendMessage(chatId, "Project added successfully."))
      .catch(err => {
        console.error(err);
        bot.sendMessage(chatId, "We could't add the project, check your formating")
    });
  });
  

bot.onText(/\/bro later/, async (msg) => {
    const chatId = msg.chat.id;

    const fromUsername = msg.from.username;
    if (!await isAdmin(fromUsername)) {
        bot.sendMessage(chatId, "Sorry, you're not authorized to add projects.");
        return;
      }



    const now = new Date(); // Current date and time in UTC
    // const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
    // const endOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59));

    const nextTomorrowStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 2, 0, 0, 0));
      
    Project.find({
        datetime: { $gte: nextTomorrowStart}
    })
    .then(async (projects) => {
      if (projects.length === 0) {
        bot.sendMessage(chatId, "No projects launching today.");
        return;
      }

    let message = await messageFormat(projects, '')
  
    handleMessageResponse(chatId, message)

    })
    .catch(err => console.error(err));
  });
  

bot.onText(/\/bro today/, (msg) => {
    const chatId = msg.chat.id;


    // Calculate today's date range in UTC
    const now = new Date(); // Current date and time in UTC
    const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
    const endOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59));

    Project.find({
      datetime: {
        $gte: startOfDay,
        $lt: endOfDay
      }
    })
    .then(async (projects) => {
      if (projects.length === 0) {
        bot.sendMessage(chatId, "No projects launching today.");
        return;
      }
  

      let message = await messageFormat(projects)
  
      handleMessageResponse(chatId, message)

    })
    .catch(err => console.error(err));
  });
 

bot.onText(/\/bro tomorrow/, (msg) => {
  const chatId = msg.chat.id;
    

  const now = new Date();
  const utcNow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const tomorrowStart = new Date(utcNow);
  tomorrowStart.setUTCDate(utcNow.getUTCDate() + 1);
  const tomorrowEnd = new Date(tomorrowStart);
  tomorrowEnd.setUTCDate(tomorrowStart.getUTCDate() + 1);

  Project.find({
    datetime: {
      $gte: tomorrowStart,
      $lte: tomorrowEnd
    }
  })
  .then(async (projects) => {
    if (projects.length === 0) {
      bot.sendMessage(chatId, "No projects launching tomorrow.");
      return;
    }



    let message = await messageFormat(projects)
  
    handleMessageResponse(chatId, message)

  })
  .catch(err => {
    console.error("Error fetching projects for tomorrow:", err);
  });
});
  

bot.onText(/\/bro remove (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const fromUsername = msg.from.username;
  const projectName = match[1]; // Capture the project name from the command

  // Optional: Check if the user is authorized to remove projects
  if (!await isAdmin(fromUsername)) {
      bot.sendMessage(chatId, "Sorry, you're not authorized to remove projects.");
      return;
  }

  // Proceed with removing the project
  removeProjectByName(projectName, chatId);
});

async function removeProjectByName(projectName, chatId) {
  try {
      const result = await Project.deleteOne({ name: projectName });
      if (result.deletedCount === 0) {
          // No project was found with the given name
          bot.sendMessage(chatId, `No project found with the name "${projectName}".`);
      } else {
          // Project was successfully removed
          bot.sendMessage(chatId, `Project "${projectName}" has been successfully removed.`);
      }
  } catch (error) {
      console.error('Error removing project:', error);
      bot.sendMessage(chatId, "An error occurred while trying to remove the project.");
  }
}

console.log('Bot has been started...');
