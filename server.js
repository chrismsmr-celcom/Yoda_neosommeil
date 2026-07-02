import express from 'express';
import { OpenAI } from 'openai'; // On garde le SDK OpenAI car DeepSeek utilise la même API
import 'dotenv/config';
import cors from 'cors';

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// 🔐 Validation de la clé API DeepSeek au démarrage
const apiKey = process.env.DEEPSEEK_API_KEY;
if (!apiKey) {
    console.error('❌ ERREUR: DEEPSEEK_API_KEY manquante dans .env');
    process.exit(1);
}

// 🚀 Configuration pour DeepSeek (via le SDK OpenAI)
const deepseek = new OpenAI({
    baseURL: 'https://api.deepseek.com/v1',
    apiKey: apiKey,
    timeout: 30000,
    maxRetries: 2,
});

// 📝 Middleware de logging
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// 🛠️ Définition de l'outil de voyage
const travelTool = {
    type: "function",
    function: {
        name: "book_travel",
        description: "Extrait les données pour chercher un vol ou un hôtel",
        parameters: {
            type: "object",
            properties: {
                origin: { 
                    type: "string", 
                    description: "Ville de départ (ex: Kinshasa, Paris, New York)" 
                },
                destination: { 
                    type: "string", 
                    description: "Ville d'arrivée (ex: Paris, Londres, Tokyo)" 
                },
                date: { 
                    type: "string", 
                    description: "Date au format YYYY-MM-DD" 
                },
                duration: { 
                    type: "number", 
                    description: "Nombre de jours sur place (optionnel)" 
                }
            },
            required: ["origin", "destination", "date"]
        }
    }
};

// 🎯 Endpoint principal d'analyse
app.post('/api/analyze', async (req, res) => {
    const { text } = req.body;

    // Validation de l'entrée
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
        return res.status(400).json({ 
            success: false, 
            error: "Texte manquant ou invalide" 
        });
    }

    try {
        console.log(`📝 Analyse du texte: "${text}"`);

        // Appel à l'API DeepSeek
        const response = await deepseek.chat.completions.create({
            model: "deepseek-chat", // Modèle DeepSeek
            messages: [
                { 
                    role: "system", 
                    content: "Tu es Yoda, assistant de voyage expert. Extrait les données de voyage demandées avec précision." 
                },
                { 
                    role: "user", 
                    content: text 
                }
            ],
            tools: [travelTool],
            tool_choice: { 
                type: "function", 
                function: { name: "book_travel" } 
            },
            temperature: 0.3,
        });

        // Vérification que tool_calls existe
        const message = response.choices[0].message;
        if (!message.tool_calls || message.tool_calls.length === 0) {
            return res.status(400).json({
                success: false,
                error: "Impossible d'extraire les données de voyage"
            });
        }

        const rawArguments = message.tool_calls[0].function.arguments;
        const travelData = JSON.parse(rawArguments);

        // Validation des données extraites
        if (!travelData.origin || !travelData.destination || !travelData.date) {
            return res.status(400).json({
                success: false,
                error: "Données de voyage incomplètes",
                data: travelData
            });
        }

        console.log(`✅ Données extraites:`, travelData);
        res.json({ success: true, data: travelData });

    } catch (error) {
        console.error('❌ Erreur DeepSeek:', error);

        let errorMessage = "Erreur lors de l'analyse";
        let statusCode = 500;

        if (error.status === 401) {
            errorMessage = "Clé API DeepSeek invalide ou expirée";
            statusCode = 401;
        } else if (error.status === 429) {
            errorMessage = "Trop de requêtes DeepSeek, veuillez réessayer";
            statusCode = 429;
        } else if (error.code === 'ECONNABORTED') {
            errorMessage = "Temps d'attente dépassé";
            statusCode = 408;
        } else if (error instanceof SyntaxError) {
            errorMessage = "Erreur de format des données";
            statusCode = 400;
        }

        res.status(statusCode).json({ 
            success: false, 
            error: errorMessage,
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// 🏥 Endpoint de santé
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        apiConfigured: !!apiKey,
        provider: 'DeepSeek'
    });
});

// 🚀 Lancement du serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Serveur DeepSeek lancé sur http://localhost:${PORT}`);
    console.log(`🔑 API Key DeepSeek: ${apiKey ? '✅ Configurée' : '❌ Manquante'}`);
    console.log(`🌍 Environnement: ${process.env.NODE_ENV || 'development'}`);
});
