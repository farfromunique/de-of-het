// Shuffle utility
function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// State
let queue = [];           // indices into WORDS for upcoming words
let retryQueue = [];      // { index, showAfter } — words to retry
let wordsSeen = 0;
let correctCount = 0;
let wrongCount = 0;
let streak = 0;
let currentIndex = null;
let articleAnswered = false;
let meaningAnswered = false;
let articleCorrect = false;
let meaningCorrect = false;

// DOM
const dutchWordEl = document.getElementById("dutch-word");
const articleFeedbackEl = document.getElementById("article-feedback");
const meaningFeedbackEl = document.getElementById("meaning-feedback");
const meaningOptionsEl = document.getElementById("meaning-options");
const nextBtn = document.getElementById("next-btn");
const correctCountEl = document.getElementById("correct-count");
const wrongCountEl = document.getElementById("wrong-count");
const streakCountEl = document.getElementById("streak-count");
const ttsBtn = document.getElementById("tts-btn");

// TTS — Google Translate audio for natural Dutch pronunciation
// Tries Audio element first (works locally), falls back to iframe (works on HTTPS/GitHub Pages)

function showToast(msg) {
    const old = document.getElementById("toast");
    if (old) old.remove();

    const toast = document.createElement("div");
    toast.id = "toast";
    toast.textContent = msg;
    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add("visible"));

    setTimeout(() => {
        toast.classList.remove("visible");
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

let ttsIframe = null;
let ttsTimeout = null;
const ttsAudio = new Audio();

function getTtsUrl(text) {
    return `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=nl&q=${encodeURIComponent(text)}`;
}

function speakViaIframe(url) {
    if (ttsIframe) ttsIframe.remove();
    if (ttsTimeout) clearTimeout(ttsTimeout);

    ttsIframe = document.createElement("iframe");
    ttsIframe.style.display = "none";
    ttsIframe.allow = "autoplay";
    ttsIframe.src = url;
    document.body.appendChild(ttsIframe);

    ttsTimeout = setTimeout(() => {
        ttsBtn.classList.remove("speaking");
    }, 2000);
}

const synth = window.speechSynthesis;
const voices = synth.getVoices();
let dutchVoices = [];
for (const voice of voices) {
    if (voice.lang == 'nl-NL') {
        dutchVoices.push(voice)
    }
}

function speakDutch(text) {
    // Start by trying to use a local Voice for Speech Synthesis
    if (dutchVoices.length > 0) {
        // Will only pronounce at all correctly if the user has a dutch voice installed.
        let rand = Math.random(0, dutchVoices.length);
        let my_voice = dutchVoices[rand];
        const utterThis = new SpeechSynthesisUtterance(text);
        utterThis.voice = my_voice;
        synth.speak(utterThis);
    } else {
        if (!navigator.onLine) {
            showToast("Could not play audio — check your internet connection.");
            return;
        }

        const url = getTtsUrl(text);
        ttsBtn.classList.add("speaking");

        // Try direct Audio first (works locally and some browsers)
        ttsAudio.src = url;
        ttsAudio.play()
            .then(() => {
                // Audio is playing — great, nothing else needed
            })
            .catch(() => {
                // Audio blocked (CORS on HTTPS) — fall back to iframe
                speakViaIframe(url);
            });
    }
}

ttsAudio.addEventListener("ended", () => ttsBtn.classList.remove("speaking"));
ttsAudio.addEventListener("error", () => {
    // Audio failed to load — try iframe fallback
    const url = ttsAudio.src;
    if (url) speakViaIframe(url);
});

ttsBtn.addEventListener("click", () => {
    const word = WORDS[currentIndex];
    if (word) speakDutch(word.dutch);
});

// Build initial queue (shuffled)
function initQueue() {
    queue = shuffle(Array.from({ length: WORDS.length }, (_, i) => i));
}

// Pick the next word index
function pickNext() {
    wordsSeen++;

    // Check retry queue first
    for (let i = 0; i < retryQueue.length; i++) {
        if (retryQueue[i].showAfter <= wordsSeen) {
            const entry = retryQueue.splice(i, 1)[0];
            return entry.index;
        }
    }

    // Otherwise pull from main queue; refill if empty
    if (queue.length === 0) {
        initQueue();
    }
    return queue.pop();
}

// Get random wrong meanings (not the same as the correct one)
function getWrongMeanings(correctIndex, count) {
    const pool = [];
    for (let i = 0; i < WORDS.length; i++) {
        if (i !== correctIndex) pool.push(i);
    }
    const shuffled = shuffle(pool);
    return shuffled.slice(0, count).map(i => WORDS[i].english);
}

// Find what dutch word has a given english meaning (for hint on wrong meaning answer)
function findDutchForEnglish(english) {
    const match = WORDS.find(w => w.english === english);
    return match ? match.dutch : null;
}

// Show a word
function showWord() {
    currentIndex = pickNext();
    const word = WORDS[currentIndex];

    dutchWordEl.textContent = word.dutch;

    // Reset state
    articleAnswered = false;
    meaningAnswered = false;
    articleCorrect = false;
    meaningCorrect = false;

    // Reset article buttons
    document.querySelectorAll(".article-btn").forEach(btn => {
        btn.classList.remove("correct", "wrong", "disabled");
    });

    // Reset feedback
    articleFeedbackEl.classList.add("hidden");
    articleFeedbackEl.classList.remove("wrong-feedback", "correct-feedback");
    articleFeedbackEl.innerHTML = "";
    meaningFeedbackEl.classList.add("hidden");
    meaningFeedbackEl.classList.remove("wrong-feedback", "correct-feedback");
    meaningFeedbackEl.innerHTML = "";

    // Build meaning options
    const wrongMeanings = getWrongMeanings(currentIndex, 3);
    const allMeanings = shuffle([word.english, ...wrongMeanings]);

    meaningOptionsEl.innerHTML = "";
    allMeanings.forEach(meaning => {
        const btn = document.createElement("button");
        btn.className = "option-btn meaning-btn";
        btn.textContent = meaning;
        btn.addEventListener("click", () => handleMeaningAnswer(btn, meaning));
        meaningOptionsEl.appendChild(btn);
    });

    // Hide next button
    nextBtn.classList.add("hidden");

    // Scroll to top on mobile
    window.scrollTo({ top: 0, behavior: "smooth" });
}

// Handle article answer
function handleArticleAnswer(btn, chosen) {
    if (articleAnswered) return;
    articleAnswered = true;

    const word = WORDS[currentIndex];
    const correct = word.article;

    document.querySelectorAll(".article-btn").forEach(b => {
        b.classList.add("disabled");
        if (b.dataset.article === correct) b.classList.add("correct");
    });

    if (chosen === correct) {
        articleCorrect = true;
        btn.classList.add("correct");
    } else {
        articleCorrect = false;
        btn.classList.add("wrong");

        // Show feedback with optional rule hint
        articleFeedbackEl.classList.remove("hidden");
        articleFeedbackEl.classList.add("wrong-feedback");

        let html = `The correct article is <strong>${correct}</strong>.`;
        if (word.rule) {
            html += ` <span class="hint-toggle" onclick="this.nextElementSibling.classList.toggle('visible')">?</span>`;
            html += `<div class="hint-text">${word.rule}</div>`;
        }
        articleFeedbackEl.innerHTML = html;
    }

    checkBothAnswered();
}

// Handle meaning answer
function handleMeaningAnswer(btn, chosen) {
    if (meaningAnswered) return;
    meaningAnswered = true;

    const word = WORDS[currentIndex];
    const correct = word.english;

    document.querySelectorAll(".meaning-btn").forEach(b => {
        b.classList.add("disabled");
        if (b.textContent === correct) b.classList.add("correct");
    });

    if (chosen === correct) {
        meaningCorrect = true;
        btn.classList.add("correct");
    } else {
        meaningCorrect = false;
        btn.classList.add("wrong");

        // Show feedback: what does the chosen word actually mean?
        meaningFeedbackEl.classList.remove("hidden");
        meaningFeedbackEl.classList.add("wrong-feedback");

        const dutchOfChosen = findDutchForEnglish(chosen);
        let html = `The correct meaning is <strong>${correct}</strong>.`;
        if (dutchOfChosen) {
            html += ` <span class="hint-toggle" onclick="this.nextElementSibling.classList.toggle('visible')">?</span>`;
            html += `<div class="hint-text">"${chosen}" is the meaning of <strong>${dutchOfChosen}</strong>.</div>`;
        }
        meaningFeedbackEl.innerHTML = html;
    }

    checkBothAnswered();
}

// After both questions answered
function checkBothAnswered() {
    if (!articleAnswered || !meaningAnswered) return;

    const gotWrong = !articleCorrect || !meaningCorrect;

    if (gotWrong) {
        wrongCount++;
        streak = 0;
        // Schedule retry 3-7 words from now
        const delay = 3 + Math.floor(Math.random() * 5);
        retryQueue.push({ index: currentIndex, showAfter: wordsSeen + delay });
    } else {
        correctCount++;
        streak++;
    }

    correctCountEl.textContent = correctCount;
    wrongCountEl.textContent = wrongCount;
    streakCountEl.textContent = `Streak: ${streak}`;

    nextBtn.classList.remove("hidden");
}

// Event listeners
document.querySelectorAll(".article-btn").forEach(btn => {
    btn.addEventListener("click", () => handleArticleAnswer(btn, btn.dataset.article));
});

nextBtn.addEventListener("click", showWord);

// Keyboard shortcut: press Enter or Space for next
document.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && !nextBtn.classList.contains("hidden")) {
        e.preventDefault();
        showWord();
    }
});

// Start
initQueue();
showWord();
