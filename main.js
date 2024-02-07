const mongoose = require('mongoose');
const TelegramBot = require('node-telegram-bot-api');
const Project = require('./models/projectModel'); 
const Admin = require('./models/adminModel'); // Path to your admin model file
require('dotenv').config()
const {TELEGRAM_BOT_TOKEN} = process.env


const token = TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

// MongoDB connection string
const uri = "mongodb+srv://dezy_dev:Password123@cluster0.q0mthib.mongodb.net/bro_solana_bot_launch?retryWrites=true&w=majority";


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
function formatDateAndTimeUTC(date) {
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
    return `${hours}:${minutes}`;
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

async function messageFormat(projects){
    let message = '<b><u>LAUNCH LIST By @Bro_Launch_bot</u></b>\n';
    message += `Date: ${formatDateAndTimeUTC(new Date())}\nAll times are in UTC\n\n`;

    const livePresales = await fetchLivePresales(Project);

    for (const [chain, chainProjects] of Object.entries(organizeProjectByChain(projects))) {
        message += `${chain}\n`;
        chainProjects.forEach(project => {
          message += ` 🟠 ${formatDateAndTimeUTC(project.datetime)} - ${project.type} |${project.taxRatio}| <a href="https://t.me/${project.link}">${project.link}</a>\n`;
        });
        message += `\n`; // Add a newline for spacing
      }



      if (livePresales.length > 0) {
        message += `⏲ Live Presales:\n`;
        livePresales.forEach(project => {
          message += `<a href="${project.website}">${project.link}</a>\n`;
        });
        message += `\n`; // Add a newline for spacing
      }

      message += `Note: All business inquiries or list suggestions must be sent to @wakame8\n`;

      return message;
}

function organizeProjectByChain(projects){
    return projects.reduce((acc, project) => {
        const chain = project.chain || '🔗 Other';
        if (!acc[chain]) {
          acc[chain] = [];
        }
        acc[chain].push(project);
        return acc;
      }, {});
}



bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "Welcome to $BRO Solana Launch Bot");
    
});


// Command to get instructions for adding a project
bot.onText(/\/add/, async (msg) => {
    const chatId = msg.chat.id;
    const fromUsername = msg.from.username;
    if (!await isAdmin(fromUsername)) {
        bot.sendMessage(chatId, "Sorry, you're not authorized to add projects.");
        return;
      }

    const instructions = `To add a new project, please use the following format:\n` +
    `/submit <date> <time> <type> <taxRatio> <link> <chainWithEmoji> <website>\n\n` +
    `Example:\n` +
    `/submit 09/02/2024 15:00 WL 0/0 @ExampleLink ✅_Ethereum https://example.com\n\n` +
    `Where:\n` +
    `- <date> is in DD/MM/YYYY format\n` +
    `- <time> is in 24hr UTC format (HH:MM)\n` +
    `- <type> is the project type (e.g., WL (Whitelist),  FL (Fair Launch), LA (Launchpad), or PP (Presale)\n` +
    `- <taxRatio> is the buy/sell tax (e.g., 0/0 for no tax)\n` +
    `- <link> is the Telegram handle or project link\n` +
    `- <chainWithEmoji> is the blockchain category followed by an emoji (e.g., ✅_Ethereum)\n\n` +
    `Please replace the example values with your project details.`;

    bot.sendMessage(chatId, instructions);
  });
  

// Command to submit a new project, now including date in the submission
    bot.onText(/\/submit (\d{2}\/\d{2}\/\d{4}) (\d{2}:\d{2}) (\w+) (\d+\/\d+) @(\S+) (\S+) (\S+)/, async (msg, match) => {
    
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

    // Proceed with adding the project to the database
    const newProject = new Project({
      datetime: newdatetime, // Store combined date and time
      type,
      taxRatio,
      link: `${link}`,
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
  

bot.onText(/\/list/, async (msg) => {
    const chatId = msg.chat.id;

    const fromUsername = msg.from.username;
    if (!await isAdmin(fromUsername)) {
        bot.sendMessage(chatId, "Sorry, you're not authorized to add projects.");
        return;
      }



    const now = new Date(); // Current date and time in UTC
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
    const endOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59));
      
    Project.find({
        datetime: { $lte: endOfToday,  $gte: startOfToday}
    })
    .then(async (projects) => {
      if (projects.length === 0) {
        bot.sendMessage(chatId, "No projects launching today.");
        return;
      }

    let message = await messageFormat(projects)
  
    // let message = `Today's (${startOfToday.toISOString().slice(5, 10)}) Tracked Projects:\nTimes are in UTC\n\n`;

    // projects.forEach(project => {
    //     const formattedDateTime = formatDateAndTimeUTC(project.datetime);
    //     // Append the formatted date and time to your message
    //     message += `${formattedDateTime}|${project.type}|${project.taxRatio}| 📈📲 ${project.link}\n`;
    // });
  
        handleMessageResponse(chatId, message)

    })
    .catch(err => console.error(err));
  });
  

bot.onText(/\/bro today/, async (msg) => {
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
    .then(projects => {
      if (projects.length === 0) {
        bot.sendMessage(chatId, "No projects launching today.");
        return;
      }
  
      let message = `Today's (${startOfDay.toISOString().slice(0, 10)}) Tracked Projects:\nTimes are in UTC\n\n`;
      projects.forEach(project => {
        // Format datetime to display only the relevant part (time)
        const projectTime = project.datetime.toISOString().slice(11, 16); // Extracting time part
        message += `${projectTime}|${project.type}|${project.taxRatio}| 📈📲 ${project.link}\n`;
      });
  
      handleMessageResponse(chatId, message)

    })
    .catch(err => console.error(err));
  });
 

bot.onText(/\/bro tomorrow/, async (msg) => {
  const chatId = msg.chat.id;
  
  // Calculate tomorrow's date range in UTC
  // Using refined tomorrow's date calculation
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
  .then(projects => {
    if (projects.length === 0) {
      bot.sendMessage(chatId, "No projects launching tomorrow.");
      return;
    }

    let message = `Tomorrow's (${tomorrowStart.toISOString().slice(0, 10)}) Tracked Projects:\nTimes are in UTC\n\n`;
    projects.forEach(project => {
      const projectTime = project.datetime.toISOString().slice(11, 16); // Extracting time part
      message += `${projectTime}|${project.type}|${project.taxRatio}| 📈📲 ${project.link}\n`;
    });

    handleMessageResponse(chatId, message);

  })
  .catch(err => {
    console.error("Error fetching projects for tomorrow:", err);
  });
});
  

console.log('Bot has been started...');
