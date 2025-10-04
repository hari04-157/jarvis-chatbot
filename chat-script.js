document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();

    // --- Panel Toggle Logic ---
    const chatbotContainer = document.getElementById('chatbot-container');
    const chatLauncherButton = document.getElementById('chat-launcher-button');
    const closeChatButton = document.getElementById('close-chat-button');

    const toggleChatWindow = () => {
        document.body.classList.toggle('chat-open');
        chatbotContainer.classList.toggle('scale-0');
        chatbotContainer.classList.toggle('opacity-0');
    };

    if (chatLauncherButton) chatLauncherButton.addEventListener('click', toggleChatWindow);
    if (closeChatButton) closeChatButton.addEventListener('click', toggleChatWindow);

    // --- Tab Switching ---
    const tabs = document.querySelectorAll('.tab-button');
    const contents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            if (speechSynthesis.speaking) speechSynthesis.cancel();
            tabs.forEach(item => item.classList.remove('active'));
            tab.classList.add('active');
            const target = tab.getAttribute('data-tab');
            contents.forEach(content => {
                content.id === `${target}-tab` ? content.classList.remove('hidden') : content.classList.add('hidden');
            });
        });
    });

    // --- Chatbot, Emoji, and File Upload Logic ---
    const chatWindow = document.getElementById('chat-window');
    const chatInput = document.getElementById('chat-input');
    const sendButton = document.getElementById('send-button');
    const chatLoading = document.getElementById('chat-loading');
    const emojiButton = document.getElementById('emoji-button');
    const emojiPickerContainer = document.getElementById('emoji-picker-container');
    const emojiPicker = document.querySelector('emoji-picker');
    const fileUploadButton = document.getElementById('file-upload-button');
    const fileUploadInput = document.getElementById('file-upload');
    const attachmentPreview = document.getElementById('attachment-preview');
    const attachmentFilename = document.getElementById('attachment-filename');
    const removeAttachmentButton = document.getElementById('remove-attachment-button');
    let attachedFile = null;

    const disableChatInputs = () => {
        chatInput.disabled = true;
        sendButton.disabled = true;
        emojiButton.disabled = true;
        fileUploadButton.classList.add('disabled-input');
    };

    const enableChatInputs = () => {
        chatInput.disabled = false;
        sendButton.disabled = false;
        emojiButton.disabled = false;
        fileUploadButton.classList.remove('disabled-input');
    };

    if (emojiButton) {
        emojiButton.addEventListener('click', (event) => {
            event.stopPropagation();
            emojiPickerContainer.classList.toggle('hidden');
        });
    }

    if (emojiPicker) {
        emojiPicker.addEventListener('emoji-click', event => {
            chatInput.value += event.detail.unicode;
        });
    }

    document.addEventListener('click', (event) => {
        if (emojiPickerContainer && !emojiPickerContainer.contains(event.target) && emojiButton && !emojiButton.contains(event.target)) {
            emojiPickerContainer.classList.add('hidden');
        }
    });

    const clearAttachment = () => {
        attachedFile = null;
        fileUploadInput.value = '';
        if (attachmentPreview) attachmentPreview.classList.add('hidden');
        if (fileUploadButton) {
            fileUploadButton.querySelector('i, svg')?.classList.remove('text-blue-500');
        }
    };

    if (fileUploadInput) {
        fileUploadInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            attachedFile = file;
            attachmentPreview.classList.remove('hidden');
            attachmentFilename.textContent = file.name;
            fileUploadButton.querySelector('i, svg')?.classList.add('text-blue-500');
        });
    }

    if (removeAttachmentButton) {
        removeAttachmentButton.addEventListener('click', clearAttachment);
    }
    
    const formatMarkdownForHTML = (text) => text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');

    const addMessage = (message, sender) => {
        if (!chatWindow) return;
        const messageDiv = document.createElement('div');
        messageDiv.className = `flex ${sender === 'user' ? 'justify-end' : 'justify-start'}`;
        const formattedMessage = sender === 'bot' ? formatMarkdownForHTML(message) : message;
        messageDiv.innerHTML = `<div class="chat-bubble ${sender}">${formattedMessage}</div>`;
        chatWindow.appendChild(messageDiv);
        chatWindow.scrollTop = chatWindow.scrollHeight;
    };

    const addImage = (base64String) => {
        if (!chatWindow) return;
        const messageDiv = document.createElement('div');
        messageDiv.className = 'flex justify-start';
        const imageDataUrl = `data:image/png;base64,${base64String}`;
        messageDiv.innerHTML = `
            <div class="chat-bubble bot image-bubble">
                <img src="${imageDataUrl}" class="rounded-lg" alt="Generated Image">
                <a href="${imageDataUrl}" download="ai-generated-image.png" class="download-button mt-3 inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700">
                    <i data-lucide="download" class="w-4 h-4 mr-2"></i> Download Image
                </a>
            </div>`;
        chatWindow.appendChild(messageDiv);
        chatWindow.scrollTop = chatWindow.scrollHeight;
        lucide.createIcons();
    };

    const handleChat = async () => {
        const userInput = chatInput.value.trim();
        if (!userInput && !attachedFile) return;

        disableChatInputs();
        if (userInput) addMessage(userInput, 'user');
        chatInput.value = '';
        chatLoading.classList.remove('hidden');

        const formData = new FormData();
        formData.append('prompt', userInput);
        if (attachedFile) formData.append('file', attachedFile, attachedFile.name);
        
        try {
            const response = await fetch('/chat', { method: 'POST', body: formData });
            if (response.status === 401) {
                 addMessage('Your session has expired. Redirecting to login...', 'bot');
                 setTimeout(() => { window.location.href = '/'; }, 2000);
                 return;
            }
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'An unknown error occurred.');
            
            if (data.type === 'image') addImage(data.data);
            else addMessage(data.data, 'bot');

        } catch (error) {
            addMessage(`Error: ${error.message}`, 'bot');
        } finally {
            chatLoading.classList.add('hidden');
            clearAttachment();
            enableChatInputs();
        }
    };

    if (sendButton) sendButton.addEventListener('click', handleChat);
    if (chatInput) chatInput.addEventListener('keypress', (e) => e.key === 'Enter' && handleChat());

    // --- Voice Assistant, Utilities, Translator (all combined below) ---
    const vtoaInput = document.getElementById('vtoa-input');
    if(vtoaInput) { /* ...unchanged... */ }

    const ttoaSpeakBtn = document.getElementById('ttoa-speak');
    if(ttoaSpeakBtn) { /* ...unchanged... */ }
    
    const translatorButton = document.getElementById('translator-button');
    if (translatorButton) { /* ...unchanged... */ }

    // ===================================================================
    // ---                UPDATED VOICE ASSISTANT LOGIC                ---
    // ===================================================================
    const toggleAssistantBtn = document.getElementById('toggle-assistant-btn');
    const assistantStatus = document.getElementById('assistant-status');
    const userTranscript = document.getElementById('user-transcript');
    const visualizerCanvas = document.getElementById('voice-visualizer');
    const canvasCtx = visualizerCanvas.getContext('2d');

    const VoiceAssistantSpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition;
    let audioContext;
    let analyser;
    let source;
    let dataArray;
    let animationFrameId;
    let isAssistantActive = false;
    let assistantVoices = [];

    const setupSpeech = () => {
        const loadVoices = () => {
            assistantVoices = speechSynthesis.getVoices();
            console.log("Available voices:", assistantVoices); 
        };
        loadVoices();
        if (speechSynthesis.onvoiceschanged !== undefined) {
            speechSynthesis.onvoiceschanged = loadVoices;
        }
    };
    setupSpeech();

    const startConversation = () => {
        if (!VoiceAssistantSpeechRecognition || isAssistantActive) return;
        
        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(stream => {
                isAssistantActive = true;
                toggleAssistantBtn.innerHTML = `<i data-lucide="mic-off" class="w-5 h-5 mr-2"></i> Stop Assistant`;
                toggleAssistantBtn.classList.add('bg-red-600', 'hover:bg-red-700');
                toggleAssistantBtn.classList.remove('bg-green-600', 'hover:bg-green-700');
                lucide.createIcons();
                
                setupVisualizer(stream); 
                listen(); 
            })
            .catch(err => {
                console.error("Microphone access denied:", err);
                assistantStatus.textContent = "Microphone access is required.";
            });
    };

    const stopConversation = () => {
        if (!isAssistantActive) return;
        isAssistantActive = false;
        
        if (recognition) recognition.stop();
        if (speechSynthesis.speaking) speechSynthesis.cancel();
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        
        if (source) {
            source.mediaStream.getTracks().forEach(track => track.stop());
        }
        if (audioContext && audioContext.state !== 'closed') {
            audioContext.close();
        }
        
        assistantStatus.textContent = "Press the button to start.";
        userTranscript.textContent = "...";
        toggleAssistantBtn.innerHTML = `<i data-lucide="mic" class="w-5 h-5 mr-2"></i> Start Assistant`;
        toggleAssistantBtn.classList.add('bg-green-600', 'hover:bg-green-700');
        toggleAssistantBtn.classList.remove('bg-red-600', 'hover:bg-red-700');
        lucide.createIcons();
        clearCanvas();
    };

    const listen = () => {
        if (!isAssistantActive) return;
        assistantStatus.textContent = "Listening...";
        
        recognition = new VoiceAssistantSpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript.trim();
            userTranscript.textContent = `"${transcript}"`;
            assistantStatus.textContent = "Thinking...";
            sendToAI(transcript);
        };
        
        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
        };
        
        recognition.onend = () => {
            if (isAssistantActive && !speechSynthesis.speaking) {
                listen();
            }
        };

        recognition.start();
    };

    const sendToAI = async (promptText) => {
        try {
            const formData = new FormData();
            formData.append('prompt', promptText);
            const response = await fetch('/chat', { method: 'POST', body: formData });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "AI response error");
            const aiResponse = data.data || "I'm not sure how to respond to that.";
            speak(aiResponse);
        } catch (error) {
            console.error("Error sending to AI:", error);
            speak("Sorry, I encountered an error.");
        }
    };
    
    const sanitizeTextForSpeech = (text) => text.replace(/\*\*/g, '');

    const speak = (text) => {
        if (speechSynthesis.speaking) speechSynthesis.cancel();
        
        const utterance = new SpeechSynthesisUtterance(sanitizeTextForSpeech(text));
        
        // **UPDATED VOICE SELECTION**: Prefers male voices if available
        let selectedVoice = assistantVoices.find(voice => voice.name === 'Microsoft David - English (United States)') || 
                            assistantVoices.find(voice => voice.name === 'Google UK English Male') ||
                            assistantVoices.find(voice => voice.lang === 'en-US' && voice.name.toLowerCase().includes('male')) ||
                            assistantVoices.find(voice => voice.name === 'Google US English') ||
                            assistantVoices.find(voice => voice.lang === 'en-US');

        utterance.voice = selectedVoice;
        
        utterance.onstart = () => { assistantStatus.textContent = "Speaking..."; };
        utterance.onend = () => {
            if (isAssistantActive) {
                listen();
            }
        };
        speechSynthesis.speak(utterance);
    };

    const setupVisualizer = (stream) => {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);
        analyser.fftSize = 512;
        dataArray = new Uint8Array(analyser.frequencyBinCount);
        drawVisualizer();
    };

    const drawVisualizer = () => {
        if (!isAssistantActive) return;
        animationFrameId = requestAnimationFrame(drawVisualizer);
        analyser.getByteFrequencyData(dataArray);
        canvasCtx.fillStyle = '#111827';
        canvasCtx.fillRect(0, 0, visualizerCanvas.width, visualizerCanvas.height);
        const centerX = visualizerCanvas.width / 2;
        const centerY = visualizerCanvas.height / 2;
        const radius = 60, barWidth = 2, numBars = 100;
        const barHeightMultiplier = 0.4;
        for (let i = 0; i < numBars; i++) {
            const barHeight = dataArray[i] * barHeightMultiplier;
            const angle = (i / numBars) * 2 * Math.PI;
            const startX = centerX + radius * Math.cos(angle);
            const startY = centerY + radius * Math.sin(angle);
            const endX = centerX + (radius + barHeight) * Math.cos(angle);
            const endY = centerY + (radius + barHeight) * Math.sin(angle);
            const gradient = canvasCtx.createLinearGradient(0, 0, 0, visualizerCanvas.height);
            gradient.addColorStop(0, '#3b82f6');
            gradient.addColorStop(1, '#a855f7');
            canvasCtx.strokeStyle = gradient;
            canvasCtx.lineWidth = barWidth;
            canvasCtx.beginPath();
            canvasCtx.moveTo(startX, startY);
            canvasCtx.lineTo(endX, endY);
            canvasCtx.stroke();
        }
    };

    const clearCanvas = () => {
        if(canvasCtx) {
            canvasCtx.fillStyle = '#111827';
            canvasCtx.fillRect(0, 0, visualizerCanvas.width, visualizerCanvas.height);
        }
    };

    if (toggleAssistantBtn) {
        toggleAssistantBtn.addEventListener('click', () => isAssistantActive ? stopConversation() : startConversation());
    }

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            if (tab.getAttribute('data-tab') !== 'assistant' && isAssistantActive) {
                stopConversation();
            }
        });
    });

    if (closeChatButton) {
        closeChatButton.addEventListener('click', () => {
            if (isAssistantActive) stopConversation();
        });
    }
});