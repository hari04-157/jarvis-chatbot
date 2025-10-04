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

// Added for robust file uploads
const multer = require('multer');

const app = express();
const port = 3000;

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

// Middleware to hash password before saving
UserSchema.pre('save', async function(next) {
    if (!this.isModified('password')) {
        return next();
    }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

// Method to compare entered password with hashed password
UserSchema.methods.comparePassword = function(candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', UserSchema);

// --- Multer Configuration ---
// Stores the uploaded file in memory as a Buffer
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.use(cors({
    origin: 'http://localhost:3000',
    credentials: true
}));

// Middleware for parsing JSON and URL-encoded data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


// --- Session Configuration ---
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGO_URI,
        collectionName: 'sessions'
    }),
    cookie: {
        secure: false, // Set to true if using HTTPS
        // --- THIS IS THE MODIFIED LINE ---
        maxAge: 1000 * 60 * 60 * 24 * 7 // Cookie expires in 7 days
    }
}));

app.use(passport.initialize());
app.use(passport.session());

// --- Serve Static Files ---
app.use(express.static(path.join(__dirname)));

// --- Passport.js Strategies Configuration ---
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "http://localhost:3000/auth/google/callback"
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
        const customResponse = "My name is Jarvis. I was developed by  P.V. Hareesh ,  3rd-year B.Tech CSE students from the 2024-2027 batch at PBR Visvodaya Institute of Technology & Science, Kavali. This project was completed under the guidance of Madhuri Madam.";
        return res.json({ type: 'text', data: customResponse });
    }
    
    try {
        const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${GEMINI_API_KEY}`;
        
        // --- Multimodal Logic (File + Optional Text) ---
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
                const errorBody = await geminiResponse.json().catch(() => geminiResponse.text());
                console.error('Gemini Multimodal API Error:', errorBody);
                throw new Error(`Failed to get a multimodal response. Status: ${geminiResponse.status}`);
            }

            const geminiData = await geminiResponse.json();

            if (!geminiData.candidates || geminiData.candidates.length === 0) {
                 if (geminiData.promptFeedback?.blockReason === 'SAFETY') {
                     return res.json({ type: 'text', data: "I'm sorry, I cannot provide an explanation for this file due to safety restrictions." });
                 }
            }

            const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "Sorry, I couldn't process the file.";
            return res.json({ type: 'text', data: responseText });
        }

        // --- Text-Only Logic (No file attached) ---
        const routingPrompt = `Is the user asking to generate an image? Respond with a JSON object only, either {"type": "image", "prompt": "the subject for the image"} OR {"type": "text", "prompt": "the original question"}. User question: "${userPrompt}"`;
        
        const routingResponse = await fetch(geminiApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: routingPrompt }] }] }),
        });

        if (!routingResponse.ok) {
            const errorBody = await routingResponse.json().catch(() => routingResponse.text());
            console.error('Gemini Routing API Error:', errorBody);
            throw new Error(`Failed to get a response from the routing AI. Status: ${routingResponse.status}`);
        }

        const routingData = await routingResponse.json();
        const geminiResponseText = routingData.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!geminiResponseText) throw new Error("The AI router returned an empty response.");
        
        const jsonMatch = geminiResponseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("The AI router gave an invalid response format.");
        
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
        res.status(500).json({ error: 'Failed to process the request.' });
    }
});

async function generateTextWithGemini(prompt) {
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${GEMINI_API_KEY}`;
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });
    if (!response.ok) {
        const errorBody = await response.json().catch(() => response.text());
        console.error('Gemini Text API Error:', errorBody);
        throw new Error('Failed to get text response from Gemini API.');
    }
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "Sorry, I couldn't get a response.";
}

async function generateImageWithStability(prompt) {
    if (!STABILITY_API_KEY) throw new Error('Stability AI API key not configured.');
    const engineId = 'stable-diffusion-xl-1024-v1-0';
    const apiHost = 'https://api.stability.ai';
    const apiUrl = `${apiHost}/v1/generation/${engineId}/text-to-image`;
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${STABILITY_API_KEY}` },
        body: JSON.stringify({ text_prompts: [{ text: prompt }], cfg_scale: 7, height: 1024, width: 1024, steps: 30, samples: 1 }),
    });
    if (!response.ok) {
        const errorText = await response.text();
        console.error('Stability API Error:', errorText);
        throw new Error('Failed to get image from Stability API.');
    }
    const data = await response.json();
    return data.artifacts[0].base64;
}

// --- NEW: Translation Endpoint ---
app.post('/translate', async (req, res) => {
    // Ensure user is logged in before allowing translation
    if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }

    const { text, targetLanguage } = req.body;

    if (!text || !targetLanguage) {
        return res.status(400).json({ error: 'Text and target language are required.' });
    }

    try {
        // Construct a clear prompt for the Gemini API
        const translationPrompt = `Translate the following text to ${targetLanguage}. Provide only the translated text as the response:\n\n"${text}"`;
        
        // Use the existing function to get the translation
        const translatedText = await generateTextWithGemini(translationPrompt);
        
        res.json({ translatedText });

    } catch (error) {
        console.error('Translation Error:', error);
        res.status(500).json({ error: 'Failed to translate the text.' });
    }
});

// --- App Listener ---
app.listen(port, () => {
    console.log(`Server is listening at http://localhost:${port}`);
});