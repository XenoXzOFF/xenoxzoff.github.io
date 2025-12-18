require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const { Client, GatewayIntentBits, EmbedBuilder, Partials } = require('discord.js');
const fs = require('fs');
const path = require('path');

const app = express();

/**
 * CONFIGURATION DU CHEMIN DATABASE
 * Si tu remets le .gitignore et un volume Fly, change path.join(__dirname...) par '/data/database.json'
 */
const dbPath = path.join(__dirname, 'database.json');

// --- CONFIGURATION DU BOT DISCORD ---
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMembers, // INDISPENSABLE pour l'organigramme
        GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Channel] 
});

// Correction de l'événement (c'est 'ready' et non 'clientReady')
client.on('ready', () => {
    console.log(`✅ Bot Elite connecté : ${client.user.tag}`);
});

client.login(process.env.DISCORD_TOKEN);

// --- HELPERS BASE DE DONNÉES ---
const getDB = () => {
    if (!fs.existsSync(dbPath)) {
        fs.writeFileSync(dbPath, JSON.stringify({ applications: [], quotas: {} }, null, 2));
    }
    return JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
};
const saveDB = (data) => fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));

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
            .setDescription(`Votre dossier pour le poste de **${posteLabel}** a bien été réceptionné par nos services.\n\nIl sera étudié prochainement par la direction du collège.`)
            .setColor(0xc5a059)
            .setFooter({ text: "Collège Privé Paname Sud" })
            .setTimestamp();
        await user.send({ embeds: [embed] });
    } catch (e) { console.log("MP impossible pour " + userId); }
}

async function sendResultMP(userId, status) {
    try {
        const user = await client.users.fetch(userId);
        let config = {
            accepte: { txt: "accepté. Bienvenue au collège !", col: 0x2ed573 },
            refuse: { txt: "refusé pour le moment.", col: 0xff4757 },
            revision: { txt: "mis en cours de révision par la direction.", col: 0xeccc68 }
        }[status] || { txt: "mis à jour.", col: 0xc5a059 };

        const embed = new EmbedBuilder()
            .setTitle("⚜️ Mise à jour de votre dossier")
            .setDescription(`Votre dossier a été **${config.txt}**`)
            .setColor(config.col)
            .setFooter({ text: "Collège Privé Paname Sud" })
            .setTimestamp();
            
        await user.send({ embeds: [embed] });
    } catch (e) { console.log("MP impossible pour " + userId); }
}

// --- MIDDLEWARES ---
app.set('view engine', 'ejs');
app.set('trust proxy', 1); // CRUCIAL : Pour que Fly.io gère bien le HTTPS avec Discord
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({ 
    secret: 'ps_ultra_secret', 
    resave: false, 
    saveUninitialized: false,
    cookie: { secure: false } // Reste sur false tant qu'on n'a pas forcé le Full SSL partout
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

app.use((req, res, next) => {
    res.locals.user = req.user || null;
    next();
});

// --- ROUTES ---

app.get('/', (req, res) => res.render('index'));
app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/callback', passport.authenticate('discord', { failureRedirect: '/' }), (req, res) => res.redirect('/dashboard'));
app.get('/logout', (req, res) => req.logout(() => res.redirect('/')));

app.get('/dashboard', (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/auth/discord');
    const db = getDB();
    const userApps = db.applications.filter(a => a.userId === req.user.id);
    res.render('dashboard', { 
        appData: userApps[userApps.length - 1] || null, 
        totalUserApps: userApps.length 
    });
});

app.get('/apply', async (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/auth/discord');
    try {
        const db = getDB();
        const guild = await client.guilds.fetch(process.env.GUILD_ID);
        // On fetch tous les membres pour avoir des compteurs à jour
        const allMembers = await guild.members.fetch();
        const rolesStatus = {};

        if (db.quotas) {
            for (const [id, info] of Object.entries(db.quotas)) {
                const count = allMembers.filter(m => m.roles.cache.has(id)).size;
                const max = (info.max === "Infini" || info.max === "Infinity") ? Infinity : parseInt(info.max);
                
                rolesStatus[id] = { 
                    label: info.name, 
                    current: count, 
                    quota: max, 
                    isFull: max !== Infinity && count >= max 
                };
            }
        }
        res.render('apply', { rolesStatus });
    } catch (e) { 
        console.error(e);
        res.render('apply', { rolesStatus: {} }); 
    }
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
        // CRUCIAL : fetch() sans arguments récupère TOUT le serveur
        const allMembers = await guild.members.fetch();
        const effectif = {};

        if (db.quotas) {
            for (const [id, info] of Object.entries(db.quotas)) {
                const roleExists = guild.roles.cache.has(id);
                if (roleExists) {
                    const users = allMembers.filter(m => m.roles.cache.has(id));
                    effectif[id] = { 
                        label: info.name, 
                        quota: info.max, 
                        membres: users.map(u => u.displayName) 
                    };
                } else {
                    effectif[id] = { label: info.name + " (Rôle absent)", quota: info.max, membres: [] };
                }
            }
        }
        res.render('membres', { effectif });
    } catch (e) { 
        console.error("Erreur page membres :", e);
        res.status(500).send("Erreur de chargement de l'organigramme.");
    }
});

// --- ADMIN ---
app.get('/admin', (req, res) => {
    if (!req.user?.isAdmin) return res.redirect('/');
    res.render('admin', { applications: getDB().applications });
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
        sendLog("⚖️ Mise à jour", `Dossier de **${db.applications[appIdx].rpName}** passé en **${req.body.status}**`);
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Serveur opérationnel sur le port ${PORT}`);
});