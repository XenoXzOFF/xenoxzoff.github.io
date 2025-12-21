require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const { Client, GatewayIntentBits, EmbedBuilder, Partials } = require('discord.js');
const fs = require('fs');
const path = require('path');

const app = express();

// --- CONFIGURATION DES CHEMINS ---
// Si tu utilises un volume Fly.io, change path.join(__dirname, ...) par '/data/...'
const dbPath = path.join(__dirname, 'database.json');
const configPath = path.join(__dirname, 'config.json');

// --- CONFIGURATION DU BOT DISCORD ---
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMembers, 
        GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Channel] 
});

client.on('ready', () => {
    console.log(`✅ Bot Elite connecté : ${client.user.tag}`);
});

client.login(process.env.DISCORD_TOKEN);

// --- HELPERS (JSON) ---
const getDB = () => {
    if (!fs.existsSync(dbPath)) fs.writeFileSync(dbPath, JSON.stringify({ applications: [], quotas: {} }, null, 2));
    return JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
};
const saveDB = (data) => fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));

const getConfig = () => {
    if (!fs.existsSync(configPath)) fs.writeFileSync(configPath, JSON.stringify({ maintenance: false }, null, 2));
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
};
const saveConfig = (data) => fs.writeFileSync(configPath, JSON.stringify(data, null, 2));

// --- FONCTIONS DISCORD (LOGS & MP) ---
async function sendLog(title, desc, color = 0xc5a059) {
    try {
        const channel = await client.channels.fetch(process.env.LOG_CHANNEL_ID);
        if (channel) {
            const embed = new EmbedBuilder().setTitle(title).setDescription(desc).setColor(color).setTimestamp();
            await channel.send({ embeds: [embed] });
        }
    } catch (e) { console.log("Erreur Log Discord : " + e.message); }
}

async function sendConfirmMP(userId, posteLabel) {
    try {
        const user = await client.users.fetch(userId);
        const embed = new EmbedBuilder()
            .setTitle("⚜️ Candidature Envoyée")
            .setDescription(`Votre dossier pour le poste de **${posteLabel}** a bien été réceptionné par nos services.`)
            .setColor(0xc5a059).setTimestamp();
        await user.send({ embeds: [embed] });
    } catch (e) { console.log("MP impossible pour " + userId); }
}

async function sendResultMP(userId, status) {
    try {
        const user = await client.users.fetch(userId);
        let config = {
            accepte: { txt: "accepté. Bienvenue au collège !", col: 0x2ed573 },
            refuse: { txt: "refusé pour le moment.", col: 0xff4757 },
            revision: { txt: "mis en cours de révision.", col: 0xeccc68 }
        }[status] || { txt: "mis à jour.", col: 0xc5a059 };
        const embed = new EmbedBuilder().setTitle("⚜️ Mise à jour").setDescription(`Votre dossier a été **${config.txt}**`).setColor(config.col).setTimestamp();
        await user.send({ embeds: [embed] });
    } catch (e) { console.log("MP impossible pour " + userId); }
}

// --- MIDDLEWARES ---
app.set('view engine', 'ejs');
app.set('trust proxy', 1);
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({ 
    secret: 'ps_ultra_secret', 
    resave: false, 
    saveUninitialized: false,
    cookie: { secure: false } 
}));

app.use(passport.initialize());
app.use(passport.session());

passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: process.env.DISCORD_CALLBACK_URL,
    scope: ['identify', 'guilds']
}, async (acc, ref, prof, done) => {
    try {
        const guild = await client.guilds.fetch(process.env.GUILD_ID);
        const member = await guild.members.fetch(prof.id).catch(() => null);
        prof.isAdmin = member ? member.roles.cache.has(process.env.ADMIN_ROLE_ID) : false;
        return done(null, prof);
    } catch (e) { return done(null, prof); }
}));

passport.serializeUser((u, d) => d(null, u));
passport.deserializeUser((o, d) => d(null, o));

// Middleware de Maintenance
app.use((req, res, next) => {
    const config = getConfig();
    res.locals.maintenance = config.maintenance;
    res.locals.user = req.user || null;

    if (config.maintenance) {
        const allowedRoutes = ['/auth/discord', '/auth/callback', '/logout', '/maintenance'];
        if (req.user && req.user.isAdmin) return next();
        if (!allowedRoutes.includes(req.path)) return res.redirect('/maintenance');
    }
    next();
});

// --- ROUTES ---

app.get('/maintenance', (req, res) => {
    const config = getConfig();
    if (!config.maintenance) return res.redirect('/');
    res.render('maintenance'); // Tu dois créer maintenance.ejs
});

app.get('/', (req, res) => res.render('index'));
app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/callback', passport.authenticate('discord', { failureRedirect: '/' }), (req, res) => res.redirect('/dashboard'));
app.get('/logout', (req, res) => req.logout(() => res.redirect('/')));

app.get('/dashboard', (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/auth/discord');
    const db = getDB();
    const userApps = db.applications.filter(a => a.userId === req.user.id);
    res.render('dashboard', { appData: userApps[userApps.length - 1] || null, totalUserApps: userApps.length });
});

app.get('/apply', async (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/auth/discord');
    try {
        const db = getDB();
        const guild = await client.guilds.fetch(process.env.GUILD_ID);
        const allMembers = await guild.members.fetch();
        const rolesStatus = {};
        if (db.quotas) {
            for (const [id, info] of Object.entries(db.quotas)) {
                const count = allMembers.filter(m => m.roles.cache.has(id)).size;
                const max = (info.max === "Infini" || info.max === "Infinity") ? Infinity : parseInt(info.max);
                rolesStatus[id] = { label: info.name, current: count, quota: max, isFull: max !== Infinity && count >= max };
            }
        }
        res.render('apply', { rolesStatus });
    } catch (e) { res.render('apply', { rolesStatus: {} }); }
});

app.post('/apply', async (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/');
    const db = getDB();
    const roleInfo = db.quotas[req.body.posteId];
    const now = new Date().toLocaleString('fr-FR');
    const posteName = roleInfo ? roleInfo.name : "Inconnu";
    const newApp = {
        userId: req.user.id, username: req.user.username, rpName: req.body.rpName,
        posteId: req.body.posteId, posteLabel: posteName,
        age: req.body.age, motivations: req.body.motivations, status: 'revision',
        createdAt: now, updatedAt: now, history: [{ action: "Soumission", date: now, by: "Système" }]
    };
    db.applications.push(newApp);
    saveDB(db);
    await sendConfirmMP(req.user.id, posteName);
    sendLog("📄 Nouvelle Candidature", `**Nom RP :** ${req.body.rpName}\n**Poste :** ${posteName}`);
    res.redirect('/dashboard');
});

app.get('/membres', async (req, res) => {
    try {
        const db = getDB();
        const guild = await client.guilds.fetch(process.env.GUILD_ID);
        const allMembers = await guild.members.fetch();
        const effectif = {};
        if (db.quotas) {
            for (const [id, info] of Object.entries(db.quotas)) {
                const roleExists = guild.roles.cache.has(id);
                if (roleExists) {
                    const users = allMembers.filter(m => m.roles.cache.has(id));
                    effectif[id] = { label: info.name, quota: info.max, membres: users.map(u => u.displayName) };
                } else {
                    effectif[id] = { label: info.name + " (Absent)", quota: info.max, membres: [] };
                }
            }
        }
        res.render('membres', { effectif });
    } catch (e) { res.status(500).send("Erreur organigramme."); }
});

// --- ADMIN ---
app.get('/admin', (req, res) => {
    if (!req.user?.isAdmin) return res.redirect('/');
    res.render('admin', { applications: getDB().applications, maintenance: getConfig().maintenance });
});

// Route pour activer/désactiver la maintenance
app.post('/admin/maintenance', (req, res) => {
    if (!req.user?.isAdmin) return res.redirect('/');
    const config = getConfig();
    config.maintenance = !config.maintenance;
    saveConfig(config);
    sendLog("🛠️ Maintenance", `Statut : **${config.maintenance ? 'ACTIVÉ' : 'DÉSACTIVÉ'}**`);
    res.redirect('/admin');
});

app.get('/admin/view/:userId', (req, res) => {
    if (!req.user?.isAdmin) return res.redirect('/');
    const db = getDB();
    const userApps = db.applications.filter(a => a.userId === req.params.userId);
    if (userApps.length === 0) return res.redirect('/admin');
    res.render('view_app', { app: userApps[userApps.length - 1], attempts: userApps.length });
});

app.post('/admin/status/:userId', async (req, res) => {
    if (!req.user?.isAdmin) return res.redirect('/');
    const db = getDB();
    const appIdx = db.applications.findLastIndex(a => a.userId === req.params.userId);
    if (appIdx !== -1) {
        const now = new Date().toLocaleString('fr-FR');
        db.applications[appIdx].status = req.body.status;
        db.applications[appIdx].updatedAt = now;
        db.applications[appIdx].history.push({ action: `Statut : ${req.body.status}`, date: now, by: req.user.username });
        saveDB(db);
        await sendResultMP(req.params.userId, req.body.status);
        sendLog("⚖️ Mise à jour", `Dossier de **${db.applications[appIdx].rpName}** : **${req.body.status}**`);
    }
    res.redirect('/admin/view/' + req.params.userId);
});

app.post('/admin/delete/:userId', (req, res) => {
    if (!req.user?.isAdmin) return res.redirect('/');
    const db = getDB();
    db.applications = db.applications.filter(a => a.userId !== req.params.userId);
    saveDB(db);
    res.redirect('/admin');
});

const PORT = process.env.PORT || 443;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Port : ${PORT}`));