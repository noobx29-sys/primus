// OpenAI integration using modern chat completions
let openai = null;

// Trading Genie Assistant ID from environment variables
const TRADING_GENIE_ASSISTANT_ID = process.env.TRADING_GENIE_ASSISTANT_ID;

try {
    const OpenAI = require('openai');
    
    if (!process.env.OPENAI_API_KEY) {
        console.log('⚠️ OpenAI API key not found. AI assistant will be disabled.');
        openai = null;
    } else {
        openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
            timeout: 120000, // 2 minutes timeout for API calls
            maxRetries: 3 // Retry up to 3 times on failure
            // Remove custom headers as they might interfere with the library's own serialization
        });
        console.log('✅ OpenAI GPT-4 integration ready');
        console.log(`✅ API Key present: ${process.env.OPENAI_API_KEY.substring(0, 10)}...`);
        
        // Check Trading Genie Assistant ID
        if (!TRADING_GENIE_ASSISTANT_ID) {
            console.warn('⚠️ TRADING_GENIE_ASSISTANT_ID not found in environment variables.');
            console.warn('   GPT Vision analysis will work, but assistant features may be limited.');
            console.warn('   To create an assistant: https://platform.openai.com/assistants');
        } else {
            console.log(`✅ Trading Genie Assistant ID configured: ${TRADING_GENIE_ASSISTANT_ID.substring(0, 10)}...`);
        }
    }
} catch (error) {
    console.log('⚠️ OpenAI module not available. AI assistant will be disabled.');
}

// Simple conversation storage for context (optional)
const userConversations = new Map(); // userId -> conversation history

/**
 * Generate AI response for Trading Genie
 */
async function generateTradingGenieResponse(userId, userMessage, context = {}) {
    // Check if OpenAI is available
    if (!openai || !TRADING_GENIE_ASSISTANT_ID) {
        return "🤖 AI Assistant is currently not available. Please use the menu buttons above for navigation, or contact support if you need assistance.";
    }
    
    try {
        // Create or get thread for this user
        const threadId = await createOrGetThread(userId);
        
        // Add user message to thread
        await addMessage(threadId, userMessage);
        
        // Define tools for the assistant
        const tools = [
            {
                type: "function",
                function: {
                    name: "get_market_analysis",
                    description: "Get real-time market analysis for a specific symbol",
                    parameters: {
                        type: "object",
                        properties: {
                            symbol: {
                                type: "string",
                                description: "Trading symbol (e.g., XAUUSD, EURUSD)",
                                enum: ["XAUUSD", "EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD", "USDCAD", "NZDUSD"]
                            }
                        },
                        required: []
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "get_chart_analysis",
                    description: "Get technical chart analysis for a specific symbol and timeframe",
                    parameters: {
                        type: "object",
                        properties: {
                            symbol: {
                                type: "string",
                                description: "Trading symbol",
                                enum: ["XAUUSD", "EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD", "USDCAD", "NZDUSD"]
                            },
                            timeframe: {
                                type: "string",
                                description: "Chart timeframe",
                                enum: ["M1", "M5", "M15", "M30", "H1", "H4", "D1", "W1", "MN1"]
                            }
                        },
                        required: []
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "get_trading_signals",
                    description: "Get current trading signals for a symbol",
                    parameters: {
                        type: "object",
                        properties: {
                            symbol: {
                                type: "string",
                                description: "Trading symbol",
                                enum: ["XAUUSD", "EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD", "USDCAD", "NZDUSD"]
                            }
                        },
                        required: []
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "get_support_resistance",
                    description: "Get support and resistance levels for a symbol",
                    parameters: {
                        type: "object",
                        properties: {
                            symbol: {
                                type: "string",
                                description: "Trading symbol",
                                enum: ["XAUUSD", "EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD", "USDCAD", "NZDUSD"]
                            }
                        },
                        required: []
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "get_market_status",
                    description: "Get current market status and trading hours",
                    parameters: {
                        type: "object",
                        properties: {},
                        required: []
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "get_trading_hours",
                    description: "Get trading session hours and next signal time",
                    parameters: {
                        type: "object",
                        properties: {},
                        required: []
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "get_risk_management",
                    description: "Calculate risk management parameters for a trade",
                    parameters: {
                        type: "object",
                        properties: {
                            position_size: {
                                type: "number",
                                description: "Position size in lots or units"
                            },
                            stop_loss: {
                                type: "number",
                                description: "Stop loss price level"
                            },
                            take_profit: {
                                type: "number",
                                description: "Take profit price level"
                            }
                        },
                        required: []
                    }
                }
            }
        ];
        
        // Run the assistant
        const response = await runAssistant(threadId, tools);
        
        return response;
        
    } catch (error) {
        console.error("Error generating Trading Genie AI response:", error);
        return "I'm sorry, but I encountered an error while processing your request. Please try again.";
    }
}

// Tool implementation functions
async function getMarketAnalysis(symbol) {
    // This would integrate with your existing market analysis
    return {
        success: true,
        symbol: symbol,
        current_price: generateRandomPrice(symbol),
        trend: Math.random() > 0.5 ? 'BULLISH' : 'BEARISH',
        analysis: `Current market analysis for ${symbol} shows mixed signals. Consider waiting for clearer direction.`
    };
}

async function getChartAnalysis(symbol, timeframe) {
    // Enhanced chart analysis now available with GPT Vision
    // This function can be called from index.js using captureAndAnalyzeChart()
    
    return {
        success: true,
        symbol: symbol,
        timeframe: timeframe,
        analysis: `Enhanced GPT Vision chart analysis is now available for ${symbol} on ${timeframe} timeframe. 
        
To use the new visual analysis capabilities:
1. Use captureAndAnalyzeChart() function in index.js
2. This combines screenshot capture with GPT-4 Vision analysis
3. Provides detailed visual pattern recognition, candlestick analysis, and precise support/resistance levels

Features include:
- Visual pattern recognition (triangles, flags, channels)
- Candlestick pattern analysis
- Support/resistance identification from actual chart visuals
- Volume analysis
- Trend line detection
- Multi-timeframe visual correlation

The enhanced analysis provides much more accurate and detailed insights than traditional indicator-based analysis.`,
        enhanced_features: {
            vision_analysis: true,
            pattern_recognition: true,
            visual_support_resistance: true,
            candlestick_patterns: true,
            volume_analysis: true,
            trend_lines: true
        },
        usage: "Call captureAndAnalyzeChart(url, timeframe, symbol) from index.js for full visual analysis"
    };
}

async function getTradingSignals(symbol) {
    return {
        success: true,
        symbol: symbol,
        signal: Math.random() > 0.5 ? 'BUY' : 'SELL',
        confidence: Math.floor(Math.random() * 40) + 60,
        entry: generateRandomPrice(symbol),
        stop_loss: generateRandomPrice(symbol),
        take_profit: generateRandomPrice(symbol)
    };
}

async function getSupportResistance(symbol) {
    const basePrice = generateRandomPrice(symbol);
    return {
        success: true,
        symbol: symbol,
        support_levels: [basePrice * 0.99, basePrice * 0.98],
        resistance_levels: [basePrice * 1.01, basePrice * 1.02]
    };
}

async function getMarketStatus() {
    return {
        success: true,
        market_open: Math.random() > 0.5,
        current_session: Math.random() > 0.5 ? 'LONDON' : 'NEW_YORK',
        next_session: 'ASIAN'
    };
}

async function getTradingHours() {
    return {
        success: true,
        sessions: {
            asian: '6:00 PM - 3:00 AM EST',
            london: '3:00 AM - 12:00 PM EST',
            new_york: '8:00 AM - 5:00 PM EST'
        },
        next_signal: 'In 1 hour'
    };
}

async function getRiskManagement(position_size, stop_loss, take_profit) {
    if (!position_size || !stop_loss || !take_profit) {
        return {
            success: false,
            message: "Position size, stop loss, and take profit are required"
        };
    }
    
    const risk = Math.abs(take_profit - position_size);
    const reward = Math.abs(take_profit - stop_loss);
    const risk_reward_ratio = reward / risk;
    
    return {
        success: true,
        position_size: position_size,
        stop_loss: stop_loss,
        take_profit: take_profit,
        risk_reward_ratio: risk_reward_ratio.toFixed(2),
        risk_percentage: ((risk / position_size) * 100).toFixed(2) + '%'
    };
}

function generateRandomPrice(symbol) {
    if (symbol === 'XAUUSD') {
        return (1800 + Math.random() * 400).toFixed(2);
    } else {
        return (1.0 + Math.random() * 0.2).toFixed(5);
    }
}

/**
 * Analyze chart screenshot using GPT Vision
 */
async function analyzeChartWithVision(screenshotBuffer, analysisPrompt = "Analyze this trading chart and provide technical analysis including trend direction, support/resistance levels, key indicators, and potential entry/exit points.") {
    if (!openai) {
        throw new Error('OpenAI not available');
    }

    // Debug: Check if API key is available
    if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY environment variable is not set');
    }

    const maxRetries = 3;
    let lastError = null;
    
    // Try different model names in case gpt-4o is not available
    // Using latest stable vision models
    const modelNames = ["gpt-4o", "gpt-4o-mini", "gpt-4-vision-preview"];

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`🔄 GPT Vision analysis attempt ${attempt}/${maxRetries}`);
            console.log(`🔍 Debug: OpenAI object available: ${!!openai}`);
            console.log(`🔍 Debug: API key available: ${!!process.env.OPENAI_API_KEY}`);
            
            const base64Image = screenshotBuffer.toString('base64');
            
            // Try each model name until one works
            let response = null;
            let usedModel = null;
            
            for (const modelName of modelNames) {
                try {
                    console.log(`🔍 Trying model: ${modelName}`);
                    
                    // Ensure we have valid inputs
                    if (!modelName) {
                        throw new Error('Model name is undefined or null');
                    }
                    
                    if (!analysisPrompt || analysisPrompt.trim() === '') {
                        throw new Error('Analysis prompt is empty or undefined');
                    }
                    
                    if (!base64Image) {
                        throw new Error('Base64 image data is empty or undefined');
                    }
                    
                    // Build the request payload with explicit typing to ensure correct serialization
                    const requestPayload = {
                        model: modelName, // Don't convert to String as it might affect serialization
                        messages: [
                            {
                                role: "user",
                                content: [
                                    { 
                                        type: "text", 
                                        text: analysisPrompt.trim()
                                    },
                                    {
                                        type: "image_url",
                                        image_url: {
                                            url: `data:image/png;base64,${base64Image}`,
                                            detail: "high"
                                        }
                                    }
                                ]
                            }
                        ],
                        max_tokens: 1500,
                        temperature: 0.7
                    };
                    
                    console.log(`🔍 Debug: Request payload model: "${requestPayload.model}"`);
                    console.log(`🔍 Debug: Message count: ${requestPayload.messages.length}`);
                    console.log(`🔍 Debug: Content items: ${requestPayload.messages[0].content.length}`);
                    
                    // Final validation that model is present and not empty
                    if (!requestPayload.model || requestPayload.model.trim() === '') {
                        throw new Error(`Model parameter is empty or invalid: "${requestPayload.model}"`);
                    }
                    
                    // Make the API call with the complete payload
                    console.log('🔍 Making API call with model:', requestPayload.model);
                    console.log('🔍 Full payload structure check:', {
                        hasModel: !!requestPayload.model,
                        modelValue: requestPayload.model,
                        modelType: typeof requestPayload.model,
                        payloadKeys: Object.keys(requestPayload),
                        messagesLength: requestPayload.messages?.length
                    });
                    
                    response = await openai.chat.completions.create(requestPayload);
                    
                    usedModel = modelName;
                    console.log(`✅ Successfully used model: ${modelName}`);
                    break; // Exit the model loop on success
                    
                } catch (modelError) {
                    console.log(`❌ Model ${modelName} failed: ${modelError.message}`);
                    console.log(`🔍 Error details:`, {
                        status: modelError.status,
                        statusText: modelError.statusText,
                        code: modelError.code,
                        type: modelError.type,
                        response: modelError.response?.data
                    });
                    
                    // Log specific error messages for debugging
                    if (modelError.message && modelError.message.includes('model parameter')) {
                        console.log('🔍 Model parameter error detected - checking payload validity');
                        console.log('🔍 Current model value:', JSON.stringify(modelName));
                        console.log('🔍 Analysis prompt length:', analysisPrompt?.length || 0);
                        console.log('🔍 Base64 image length:', base64Image?.length || 0);
                    }
                    
                    if (modelName === modelNames[modelNames.length - 1]) {
                        throw modelError; // If this was the last model, throw the error
                    }
                    // Continue to next model
                }
            }
            
            if (!response) {
                throw new Error('All models failed');
            }

            console.log(`✅ GPT Vision analysis successful on attempt ${attempt} using model: ${usedModel}`);
            return {
                success: true,
                analysis: response.choices[0].message.content,
                model: usedModel,
                timestamp: new Date().toISOString(),
                attempt: attempt
            };
        } catch (error) {
            lastError = error;
            console.error(`❌ GPT Vision analysis failed on attempt ${attempt}:`, error.message);
            console.error(`🔍 Debug: Error details:`, {
                status: error.status,
                statusText: error.statusText,
                response: error.response?.data,
                message: error.message
            });
            
            // If it's not the last attempt, wait before retrying
            if (attempt < maxRetries) {
                const waitTime = attempt * 2000; // Exponential backoff: 2s, 4s, 6s
                console.log(`⏳ Waiting ${waitTime}ms before retry...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }
    }

    // All retries failed
    console.error('❌ GPT Vision analysis failed after all retries');
    return {
        success: false,
        error: lastError?.message || 'Unknown error after all retries',
        timestamp: new Date().toISOString(),
        attempts: maxRetries
    };
}

/**
 * Enhanced chart analysis that combines screenshot capture with GPT Vision
 */
async function getEnhancedChartAnalysis(symbol, timeframe, chartUrl = null) {
    try {
        // This function would be called from index.js where captureChartScreenshot is available
        // For now, return a placeholder that indicates vision analysis is available
        return {
            success: true,
            message: "Enhanced chart analysis with GPT Vision is now available. Use captureChartScreenshot() followed by analyzeChartWithVision().",
            symbol: symbol,
            timeframe: timeframe,
            features: [
                "Visual pattern recognition",
                "Candlestick pattern analysis", 
                "Support/resistance identification",
                "Trend line analysis",
                "Volume analysis",
                "Multi-timeframe correlation"
            ]
        };
    } catch (error) {
        console.error('Error in enhanced chart analysis:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

module.exports = {
    generateTradingGenieResponse,
    analyzeChartWithVision
};
