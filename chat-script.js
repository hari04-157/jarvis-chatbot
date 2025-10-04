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
    
    // --- Utility Functions ---
    const vtoaInput = document.getElementById('vtoa-input');
    const vtoaConvertBtn = document.getElementById('vtoa-convert');
    const vtoaFilename = document.getElementById('vtoa-filename');
    let vtoaFile;
    if(vtoaInput) {
        vtoaInput.addEventListener('change', (e) => {
            vtoaFile = e.target.files[0];
            if (vtoaFile) {
                vtoaFilename.textContent = `Selected: ${vtoaFile.name}`;
                vtoaConvertBtn.disabled = false;
                document.getElementById('vtoa-status').innerHTML = '';
            }
        });
    }
    if(vtoaConvertBtn) {
        vtoaConvertBtn.addEventListener('click', async () => {
            if (!vtoaFile) return;
            showStatus('vtoa-status', 'Processing...', 'info');
            vtoaConvertBtn.disabled = true;
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    const audioBuffer = await audioContext.decodeAudioData(e.target.result);
                    const wavBlob = audioBufferToWav(audioBuffer);
                    const url = URL.createObjectURL(wavBlob);
                    const downloadLink = document.createElement('a');
                    downloadLink.href = url;
                    downloadLink.download = `${vtoaFile.name.split('.')[0]}.wav`;
                    downloadLink.className = 'mt-4 block text-center text-blue-600 hover:underline';
                    downloadLink.innerText = 'Click here to download your audio file';
                    const statusContainer = document.getElementById('vtoa-status');
                    showStatus('vtoa-status', 'Conversion successful!', 'success');
                    statusContainer.appendChild(downloadLink);
                } catch (error) {
                    console.error('Conversion failed:', error);
                    showStatus('vtoa-status', 'Error: This video format may not be supported by your browser.', 'error');
                } finally {
                    vtoaConvertBtn.disabled = false;
                }
            };
            reader.readAsArrayBuffer(vtoaFile);
        });
    }
    const ttoaText = document.getElementById('ttoa-text');
    const ttoaVoice = document.getElementById('ttoa-voice');
    const ttoaSpeakBtn = document.getElementById('ttoa-speak');
    let voices = [];
    function populateVoiceList() {
        if(!ttoaVoice) return;
        voices = speechSynthesis.getVoices();
        ttoaVoice.innerHTML = voices
            .map(voice => `<option value="${voice.name}">${voice.name} (${voice.lang})</option>`)
            .join('');
    }
    if(speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = populateVoiceList;
    }
    populateVoiceList();
    if(ttoaSpeakBtn) {
        ttoaSpeakBtn.addEventListener('click', () => {
            if (speechSynthesis.speaking) {
                speechSynthesis.cancel();
            }
            const text = ttoaText.value;
            if (text.trim().length > 0) {
                const utterance = new SpeechSynthesisUtterance(text);
                utterance.voice = voices.find(voice => voice.name === ttoaVoice.value);
                speechSynthesis.speak(utterance);
            }
        });
    }
    function showStatus(elementId, message, type = 'info') {
        const el = document.getElementById(elementId);
        if(!el) return;
        const colorClass = type === 'success' ? 'text-green-600' : (type === 'error' ? 'text-red-600' : 'text-gray-600');
        el.innerHTML = `<div class="p-2 mt-2 rounded-md ${type !== 'info' ? 'bg-gray-100' : ''} ${colorClass}">${message}</div>`;
    };
    function audioBufferToWav(buffer) {
        let numOfChan = buffer.numberOfChannels, len = buffer.length * numOfChan * 2 + 44, wavBuffer = new ArrayBuffer(len), view = new DataView(wavBuffer), channels = [], i, sample, offset = 0, pos = 0;
        setUint32(0x46464952); setUint32(len - 8); setUint32(0x45564157); setUint32(0x20746d66); setUint32(16); setUint16(1); setUint16(numOfChan); setUint32(buffer.sampleRate); setUint32(buffer.sampleRate * 2 * numOfChan); setUint16(numOfChan * 2); setUint16(16); setUint32(0x61746164); setUint32(len - pos - 4);
        for (i = 0; i < buffer.numberOfChannels; i++) channels.push(buffer.getChannelData(i));
        while (pos < len) {
            for (i = 0; i < numOfChan; i++) {
                sample = Math.max(-1, Math.min(1, channels[i][offset]));
                sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
                view.setInt16(pos, sample, true);
                pos += 2;
            }
            offset++;
        }
        return new Blob([view], { type: 'audio/wav' });
        function setUint16(data) { view.setUint16(pos, data, true); pos += 2; }
        function setUint32(data) { view.setUint32(pos, data, true); pos += 4; }
    }

    // --- Language Translator Logic ---
    const translatorTextInput = document.getElementById('translator-text-input');
    const translatorLangSelect = document.getElementById('translator-language-select');
    const translatorButton = document.getElementById('translator-button');
    const translatorOutput = document.getElementById('translator-output');
    if (translatorButton) {
        translatorButton.addEventListener('click', async () => {
            const textToTranslate = translatorTextInput.value;
            const targetLanguage = translatorLangSelect.value;
            if (!textToTranslate.trim()) {
                translatorOutput.textContent = 'Please enter some text to translate.';
                return;
            }
            translatorButton.disabled = true;
            translatorButton.textContent = 'Translating...';
            translatorOutput.textContent = '';
            try {
                const response = await fetch('/translate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: textToTranslate, targetLanguage: targetLanguage })
                });
                if (response.status === 401) {
                    translatorOutput.textContent = 'Your session has expired. Please log in again.';
                    return;
                }
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({ error: 'Translation failed due to a server error.' }));
                    throw new Error(errorData.error);
                }
                const data = await response.json();
                translatorOutput.textContent = data.translatedText;
            } catch (error) {
                console.error('Translation error:', error);
                translatorOutput.textContent = `Error: ${error.message}`;
            } finally {
                translatorButton.disabled = false;
                translatorButton.textContent = 'Translate';
            }
        });
    }

    // ===================================================================
    // ---         REWRITTEN VOICE ASSISTANT LOGIC (SIMPLIFIED)        ---
    // ===================================================================
    const toggleAssistantBtn = document.getElementById('toggle-assistant-btn');
    const assistantStatus = document.getElementById('assistant-status');
    const userTranscript = document.getElementById('user-transcript');
    const assistantGesture = document.getElementById('assistant-gesture'); 

    const VoiceAssistantSpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition;
    let isAssistantActive = false;
    let assistantVoices = [];

    const updateAssistantGesture = (state) => {
        let icon = 'mic';
        let text = 'Press the button to start.';
        let animationClass = '';

        switch (state) {
            case 'listening':
                icon = 'mic';
                text = 'Listening...';
                animationClass = 'animate-pulse';
                break;
            case 'thinking':
                icon = 'brain-circuit';
                text = 'Thinking...';
                animationClass = 'animate-spin';
                break;
            case 'speaking':
                icon = 'volume-2';
                text = 'Speaking...';
                animationClass = 'animate-pulse';
                break;
            case 'idle':
            default:
                icon = 'mic';
                text = 'Press the button to start.';
                break;
        }

        if (assistantGesture) {
            assistantGesture.innerHTML = `<i data-lucide="${icon}" class="w-24 h-24 ${animationClass}"></i>`;
            lucide.createIcons();
        }
        if (assistantStatus) {
            assistantStatus.textContent = text;
        }
    };
    
    const setupSpeech = () => {
        const loadVoices = () => {
            assistantVoices = speechSynthesis.getVoices();
            console.log("Available voices:", assistantVoices); 
        };
        loadVoices();
        if (speechSynthesis.onvoiceschanged !== undefined) {
            speechSynthesis.onvoiceschanged = loadVoices;
        }
        updateAssistantGesture('idle'); 
    };
    setupSpeech();

    const startConversation = () => {
        if (!VoiceAssistantSpeechRecognition || isAssistantActive) return;
        
        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(() => {
                isAssistantActive = true;
                toggleAssistantBtn.innerHTML = `<i data-lucide="mic-off" class="w-5 h-5 mr-2"></i> Stop Assistant`;
                toggleAssistantBtn.classList.add('bg-red-600', 'hover:bg-red-700');
                toggleAssistantBtn.classList.remove('bg-green-600', 'hover:bg-green-700');
                lucide.createIcons();
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
        
        userTranscript.textContent = "...";
        toggleAssistantBtn.innerHTML = `<i data-lucide="mic" class="w-5 h-5 mr-2"></i> Start Assistant`;
        toggleAssistantBtn.classList.add('bg-green-600', 'hover:bg-green-700');
        toggleAssistantBtn.classList.remove('bg-red-600', 'hover:bg-red-700');
        lucide.createIcons();
        updateAssistantGesture('idle');
    };

    const listen = () => {
        if (!isAssistantActive) return;
        updateAssistantGesture('listening');
        
        recognition = new VoiceAssistantSpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript.trim();
            userTranscript.textContent = `"${transcript}"`;
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
        updateAssistantGesture('thinking');
        try {
            const formData = new FormData();
            formData.append('prompt', promptText);
            const response = await fetch('/chat', { method: 'POST', body: formData });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "AI response error");
            const aiResponse = data.data || "I'm not sure how to respond to that.";
            speak(aiResponse);
        } catch (error) {
            console.error("Error sending to AI from voice assistant:", error);
            const errorMessage = `Voice assistant error: ${error.toString()}`;
            addMessage(errorMessage, 'bot');
            speak("Sorry, I encountered an error. Please check the chat window for details.");
            stopConversation();
        }
    };
    
    const sanitizeTextForSpeech = (text) => text.replace(/\*\*/g, '');

    const speak = (text) => {
        if (speechSynthesis.speaking) speechSynthesis.cancel();
        updateAssistantGesture('speaking');
        
        const utterance = new SpeechSynthesisUtterance(sanitizeTextForSpeech(text));
        
        let selectedVoice = assistantVoices.find(voice => voice.name === 'Microsoft David - English (United States)') || 
                            assistantVoices.find(voice => voice.name === 'Google UK English Male') ||
                            assistantVoices.find(voice => voice.lang === 'en-US' && voice.name.toLowerCase().includes('male')) ||
                            assistantVoices.find(voice => voice.name === 'Google US English') ||
                            assistantVoices.find(voice => voice.lang === 'en-US');

        utterance.voice = selectedVoice;
        
        utterance.onend = () => {
            if (isAssistantActive) {
                listen();
            }
        };
        speechSynthesis.speak(utterance);
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