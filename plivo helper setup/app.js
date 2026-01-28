// ==============================================
// PLIVO BROWSER SDK MINIMAL TEST - APP.JS
// ==============================================

let plivoWebSdk;
let currentCall = null;
let plivoConfig = {
    plivoNumber: null
};

// DOM Elements
const sdkStatus = document.getElementById('sdkStatus');
const callStatus = document.getElementById('callStatus');
const phoneNumberInput = document.getElementById('phoneNumber');
const callBtn = document.getElementById('callBtn');
const hangupBtn = document.getElementById('hangupBtn');

// ==============================================
// UTILITY FUNCTIONS
// ==============================================

function updateSDKStatus(message, type = 'info') {
    sdkStatus.textContent = message;
    sdkStatus.className = 'status-value';
    
    if (type === 'ready') {
        sdkStatus.classList.add('ready');
    } else if (type === 'error') {
        sdkStatus.classList.add('error');
    }
    
    console.log('[SDK STATUS]', message);
}

function updateCallStatus(message, type = 'info') {
    callStatus.textContent = message;
    callStatus.className = 'status-value';
    
    if (type === 'calling') {
        callStatus.classList.add('calling');
    } else if (type === 'error') {
        callStatus.classList.add('error');
    } else if (type === 'ready') {
        callStatus.classList.add('ready');
    }
    
    console.log('[CALL STATUS]', message);
}

function enableCallControls(callActive = false) {
    if (callActive) {
        callBtn.disabled = true;
        hangupBtn.disabled = false;
        phoneNumberInput.disabled = true;
    } else {
        callBtn.disabled = false;
        hangupBtn.disabled = true;
        phoneNumberInput.disabled = false;
    }
}

// ==============================================
// PLIVO SDK INITIALIZATION
// ==============================================

async function initializePlivoSDK() {
    try {
        updateSDKStatus('Fetching token...', 'info');
        
        // Fetch token from backend
        const response = await fetch('http://localhost:3000/token');
        
        if (!response.ok) {
            throw new Error(`Token fetch failed: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('[INIT] Token received for username:', data.username);

        plivoConfig.plivoNumber = data.plivoNumber || null;
        
        updateSDKStatus('Initializing SDK...', 'info');
        
        // Initialize Plivo Web SDK
        const options = {
            debug: 'ALL',
            permOnClick: true,
            enableTracking: true,
            closeProtection: true,
            enableIPV6: false
        };
        
        plivoWebSdk = new window.Plivo(options);

        // Setup event listeners BEFORE initiating login
        setupPlivoEventListeners();

        // Browser SDK v2 supports access-token login via loginWithAccessToken(token)
        plivoWebSdk.client.loginWithAccessToken(data.token);
        
    } catch (error) {
        console.error('[INIT] Initialization failed:', error);
        updateSDKStatus(`Error: ${error.message}`, 'error');
        updateCallStatus('Cannot make calls - SDK initialization failed', 'error');
    }
}

// ==============================================
// PLIVO EVENT LISTENERS
// ==============================================

function setupPlivoEventListeners() {
    
    // SDK Ready
    plivoWebSdk.client.on('onLogin', () => {
        console.log('[EVENT] SDK logged in successfully');
        updateSDKStatus('Ready ✓', 'ready');
        updateCallStatus('Ready to call', 'ready');
        enableCallControls(false);
    });
    
    // Login Failed
    plivoWebSdk.client.on('onLoginFailed', (reason) => {
        console.error('[EVENT] Login failed:', reason);
        updateSDKStatus(`Login failed: ${reason}`, 'error');
        updateCallStatus('Cannot make calls', 'error');
    });
    
    // Call Initiated
    plivoWebSdk.client.on('onCallInitiated', (event) => {
        console.log('[EVENT] Call initiated:', event);
        updateCallStatus('Initiating call...', 'calling');
    });
    
    // Call Ringing
    plivoWebSdk.client.on('onCallRemoteRinging', (event) => {
        console.log('[EVENT] Call ringing:', event);
        updateCallStatus('Ringing...', 'calling');
    });
    
    // Call Answered
    plivoWebSdk.client.on('onCallAnswered', (event) => {
        console.log('[EVENT] Call answered:', event);
        updateCallStatus('Call connected ✓', 'ready');
        currentCall = event;
        enableCallControls(true);
    });
    
    // Call Failed
    plivoWebSdk.client.on('onCallFailed', (reason) => {
        const cause = (reason && typeof reason === 'object' && 'cause' in reason) ? reason.cause : reason;
        console.error('[EVENT] Call failed:', reason);
        if (reason && typeof reason === 'object') {
            try {
                console.error('[EVENT] Call failed (details):', JSON.stringify(reason));
            } catch {
                // ignore
            }
        }
        updateCallStatus(`Call failed: ${cause}`, 'error');
        currentCall = null;
        enableCallControls(false);
    });
    
    // Call Terminated
    plivoWebSdk.client.on('onCallTerminated', (event) => {
        console.log('[EVENT] Call terminated:', event);
        updateCallStatus('Call ended', 'info');
        currentCall = null;
        enableCallControls(false);
    });
    
    // Media Connected
    plivoWebSdk.client.on('onMediaConnected', (event) => {
        console.log('[EVENT] Media connected - Audio should work now');
    });
    
    // Incoming Call (not expected in this test, but good to handle)
    plivoWebSdk.client.on('onIncomingCall', (callerName, extraHeaders) => {
        console.log('[EVENT] Incoming call from:', callerName);
        // In this test, we're only doing outbound calls
        plivoWebSdk.client.reject();
    });
    
    // WebRTC Not Supported
    plivoWebSdk.client.on('onWebrtcNotSupported', () => {
        console.error('[EVENT] WebRTC not supported in this browser');
        updateSDKStatus('Browser not supported', 'error');
        updateCallStatus('WebRTC not available', 'error');
    });
    
    // Permission Denied
    plivoWebSdk.client.on('mediaMetrics', (data) => {
        // Optional: Track media quality metrics
        if (data.audioLevel !== undefined) {
            console.log('[METRICS] Audio level:', data.audioLevel);
        }
    });
}

// ==============================================
// CALL CONTROLS
// ==============================================

function makeCall() {
    const phoneNumber = phoneNumberInput.value.trim();
    
    // Validation
    if (!phoneNumber) {
        alert('Please enter a phone number');
        return;
    }
    
    if (!/^\d+$/.test(phoneNumber)) {
        alert('Phone number should contain only digits');
        return;
    }
    
    if (!plivoWebSdk) {
        alert('SDK not initialized. Please refresh the page.');
        return;
    }
    
    try {
        console.log('[CALL] Initiating call to:', phoneNumber);
        updateCallStatus('Starting call...', 'calling');

        // Best-effort: ensure SDK audio elements have a non-empty sinkId.
        // The SDK logs "No speaker element found" when sinkId is empty (default output).
        // Setting it to "default" on a user gesture removes that warning in most browsers.
        try {
            const speakerEls = document.querySelectorAll('[data-devicetype="speakerDevice"], [data-devicetype="ringtoneDevice"]');
            speakerEls.forEach((el) => {
                if (el && typeof el.setSinkId === 'function') {
                    // Fire and forget
                    el.setSinkId('default').catch(() => {});
                }
            });
        } catch {
            // ignore
        }
        
        // Make outbound call
        const extraHeaders = {
            'X-PH-Test': 'phase-0-minimal'
        };

        // Preferred: call your Plivo number to force the XML Application Answer URL to run,
        // and pass the real destination via a custom header.
        if (plivoConfig.plivoNumber) {
            extraHeaders['X-PH-Dest'] = phoneNumber;
            console.log('[CALL] Routing via Plivo number:', plivoConfig.plivoNumber);
            plivoWebSdk.client.call(plivoConfig.plivoNumber, extraHeaders);
        } else {
            // Fallback: direct dial
            plivoWebSdk.client.call(phoneNumber, extraHeaders);
        }
        
    } catch (error) {
        console.error('[CALL] Error making call:', error);
        updateCallStatus(`Error: ${error.message}`, 'error');
    }
}

function hangupCall() {
    if (!currentCall) {
        console.log('[HANGUP] No active call to hang up');
        return;
    }
    
    try {
        console.log('[HANGUP] Hanging up call');
        updateCallStatus('Ending call...', 'info');
        
        plivoWebSdk.client.hangup();
        
    } catch (error) {
        console.error('[HANGUP] Error hanging up:', error);
        updateCallStatus(`Error: ${error.message}`, 'error');
    }
}

// ==============================================
// EVENT HANDLERS
// ==============================================

callBtn.addEventListener('click', makeCall);
hangupBtn.addEventListener('click', hangupCall);

// Allow Enter key to initiate call
phoneNumberInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !callBtn.disabled) {
        makeCall();
    }
});

// ==============================================
// AUTO-INITIALIZE ON PAGE LOAD
// ==============================================

window.addEventListener('load', () => {
    console.log('='.repeat(50));
    console.log('🚀 Plivo Browser SDK Test - Phase 0');
    console.log('='.repeat(50));
    
    // Check if Plivo SDK is loaded
    if (typeof window.Plivo === 'undefined') {
        console.error('[ERROR] Plivo SDK not loaded from CDN');
        updateSDKStatus('SDK not loaded', 'error');
        updateCallStatus('Cannot initialize', 'error');
        return;
    }
    
    // Initialize SDK
    initializePlivoSDK();
});

// ==============================================
// CLEANUP ON PAGE UNLOAD
// ==============================================

window.addEventListener('beforeunload', () => {
    if (currentCall) {
        plivoWebSdk.client.hangup();
    }
    if (plivoWebSdk) {
        plivoWebSdk.client.logout();
    }
});

// ==============================================
// EXPOSE FOR DEBUGGING
// ==============================================

window.plivoDebug = {
    sdk: () => plivoWebSdk,
    call: () => currentCall,
    makeTestCall: (number) => {
        phoneNumberInput.value = number;
        makeCall();
    }
};

console.log('💡 Debug utilities available: window.plivoDebug');
