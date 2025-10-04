const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
require('dotenv').config();

const path = require('path');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const LocalStrategy = require('passport-local').Strategy;
const session = require('express-session');
const mongoose = require('mongoose');
const MongoStore = require('connect-mongo');
const bcrypt = require('bcryptjs');
const multer = require('multer');

const app = express();
const port = process.env.PORT || 3000; // Use environment variable for port

// --- Database Connection ---
mongoose.connect(process.env.MONGO_URI, {})
    .then(() => console.log('MongoDB connected successfully.'))
    .catch(err => console.error('MongoDB connection error:', err));

// --- User Schema and Model ---
const UserSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true, lowercase: true },
    firstName: { type: String },
    lastName: { type: String },
    password: { type: String },
    googleId: { type: String, unique: true, sparse: true },
    displayName: { type: String },
    profilePicture: { type: String },
    createdAt: { type: Date, default: Date.now }
});

UserSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

UserSchema.methods.comparePassword = function(candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', UserSchema);

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// --- Middleware Configuration ---
app.use(cors({
    origin: process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000', // Ready for deployment
    credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.MONGO_URI, collectionName: 'sessions' }),
    cookie: {
        secure: 'auto', // Works with HTTP (local) and HTTPS (deployed)
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24 * 7 
    }
}));

app.use(passport.initialize());
app.use(passport.session());

app.use(express.static(path.join(__dirname)));

// --- Passport.js Strategies Configuration ---
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${process.env.BASE_URL}/auth/google/callback` // Ready for deployment
}, async (accessToken, refreshToken, profile, done) => {
    try {
        let user = await User.findOne({ googleId: profile.id });
        if (user) {
            return done(null, user);
        } else {
            let existingUser = await User.findOne({ email: profile.emails[0].value });
            if (existingUser) {
                existingUser.googleId = profile.id;
                existingUser.displayName = existingUser.displayName || profile.displayName;
                existingUser.profilePicture = existingUser.profilePicture || profile.photos[0].value;
                await existingUser.save();
                return done(null, existingUser);
            }
            const newUser = new User({
                googleId: profile.id,
                displayName: profile.displayName,
                email: profile.emails[0].value.toLowerCase(),
                profilePicture: profile.photos[0].value,
                firstName: profile.name.givenName,
                lastName: profile.name.familyName
            });
            await newUser.save();
            return done(null, newUser);
        }
    } catch (err) {
        return done(err, null);
    }
}));

passport.use(new LocalStrategy({ usernameField: 'email' }, async (email, password, done) => {
    try {
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return done(null, false, { message: 'No user found with that email.' });
        }
        if (!user.password) {
            return done(null, false, { message: 'This account was registered with Google. Please use Google to log in.' });
        }
        const isMatch = await user.comparePassword(password);
        if (isMatch) {
            return done(null, user);
        } else {
            return done(null, false, { message: 'Password incorrect.' });
        }
    } catch (err) {
        return done(err);
    }
}));

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (err) {
        done(err, null);
    }
});

// --- Authentication Routes ---
app.post('/auth/signup', async (req, res) => {
    const { firstName, lastName, email, password } = req.body;
    try {
        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.status(400).json({ message: 'A user with this email already exists.' });
        }
        const newUser = new User({
            firstName,
            lastName,
            email: email.toLowerCase(),
            password,
            displayName: `${firstName} ${lastName}`
        });
        await newUser.save();
        req.login(newUser, (err) => {
            if (err) {
                return res.status(500).json({ message: 'Session could not be established after signup.' });
            }
            res.status(201).json({ message: 'User created successfully' });
        });
    } catch (error) {
        console.error('Signup Error:', error);
        res.status(500).json({ message: 'Server error during signup.' });
    }
});

app.post('/auth/login', passport.authenticate('local'), (req, res) => {
    res.status(200).json({ message: 'Logged in successfully' });
});

app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/' }), (req, res) => {
    res.redirect('/chat.html');
});

app.get('/auth/logout', (req, res, next) => {
    req.logout(function(err) {
        if (err) { return next(err); }
        res.redirect('/');
    });
});

app.get('/api/user', (req, res) => {
    if (req.isAuthenticated()) {
        res.json({ loggedIn: true });
    } else {
        res.json({ loggedIn: false });
    }
});

// --- Middleware and Protected Routes ---
function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/');
}

app.get('/chat.html', ensureAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'chat.html'));
});

// --- Main Chat Endpoint ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const STABILITY_API_KEY = process.env.STABILITY_API_KEY;

app.post('/chat', upload.single('file'), async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }

    const userPrompt = req.body.prompt || "";
    const file = req.file;

    if (!userPrompt && !file) {
        return res.status(400).json({ error: 'Prompt or file is required' });
    }
    
    const lowerCasePrompt = userPrompt.toLowerCase();
    const introTriggers = ['introduce yourself', 'who are you', 'what is your name', "what's your name", 'who made you', 'who developed you', 'who created you'];
    if (introTriggers.some(trigger => lowerCasePrompt.includes(trigger))) {
        const customResponse = "My name is Jarvis. I was developed by a team of 3rd-year B.Tech CSE students from the 2024-2027 batch at PBR Visvodaya Institute of Technology & Science, Kavali.";
        return res.json({ type: 'text', data: customResponse });
    }
    
    try {
        const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro-vision:generateContent?key=${GEMINI_API_KEY}`;
        
        if (file) {
            const fileData = file.buffer.toString('base64');
            const fileMimeType = file.mimetype;

            const requestBody = {
                contents: [{ 
                    parts: [
                        { text: userPrompt || "Please provide a detailed explanation of this file." },
                        { inline_data: { mime_type: fileMimeType, data: fileData } }
                    ]
                }],
                safetySettings: [
                    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
                ]
            };
            
            const geminiResponse = await fetch(geminiApiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            });
            
            if (!geminiResponse.ok) {
                const errorBody = await geminiResponse.json().catch(() => ({ error: `Gemini API returned status ${geminiResponse.status}` }));
                console.error('Gemini Multimodal API Error:', errorBody);
                throw new Error(errorBody.error?.message || 'Failed to get a multimodal response.');
            }
            const geminiData = await geminiResponse.json();
            const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "Sorry, I couldn't process the file.";
            return res.json({ type: 'text', data: responseText });
        }

        const routingPrompt = `Is the user asking to generate an image? Respond with a JSON object only, either {"type": "image", "prompt": "the subject for the image"} OR {"type": "text", "prompt": "the original question"}. User question: "${userPrompt}"`;
        const geminiTextApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`;
        
        const routingResponse = await fetch(geminiTextApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: routingPrompt }] }] }),
        });

        if (!routingResponse.ok) throw new Error(`Failed to get a response from the routing AI. Status: ${routingResponse.status}`);
        
        const routingData = await routingResponse.json();
        const geminiResponseText = routingData.candidates?.[0]?.content?.parts?.[0]?.text;
        const jsonMatch = geminiResponseText.match(/\{[\s\S]*\}/);
        const intent = JSON.parse(jsonMatch[0]);

        if (intent.type === 'image') {
            const imageBase64 = await generateImageWithStability(intent.prompt);
            res.json({ type: 'image', data: imageBase64 });
        } else {
            const textResponse = await generateTextWithGemini(intent.prompt);
            res.json({ type: 'text', data: textResponse });
        }
    } catch (error) {
        console.error('Server Error in /chat endpoint:', error);
        res.status(500).json({ error: error.message || 'Failed to process the request.' });
    }
});

async function generateTextWithGemini(prompt) {
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`;
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });
    if (!response.ok) throw new Error('Failed to get text response from Gemini API.');
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "Sorry, I couldn't get a response.";
}

async function generateImageWithStability(prompt) {
    const engineId = 'stable-diffusion-xl-1024-v1-0';
    const apiHost = 'https://api.stability.ai';
    const apiUrl = `${apiHost}/v1/generation/${engineId}/text-to-image`;
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${STABILITY_API_KEY}` },
        body: JSON.stringify({ text_prompts: [{ text: prompt }], cfg_scale: 7, height: 1024, width: 1024, steps: 30, samples: 1 }),
    });
    if (!response.ok) throw new Error('Failed to get image from Stability API.');
    const data = await response.json();
    return data.artifacts[0].base64;
}

app.post('/translate', async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }
    const { text, targetLanguage } = req.body;
    if (!text || !targetLanguage) {
        return res.status(400).json({ error: 'Text and target language are required.' });
    }
    try {
        const translationPrompt = `Translate the following text to ${targetLanguage}. Provide only the translated text as the response:\n\n"${text}"`;
        const translatedText = await generateTextWithGemini(translationPrompt);
        res.json({ translatedText });
    } catch (error) {
        console.error('Translation Error:', error);
        res.status(500).json({ error: 'Failed to translate the text.' });
    }
});

app.listen(port, () => {
    console.log(`Server is listening at http://localhost:${port}`);
});