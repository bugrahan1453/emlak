/**
 * EmlakRadar Pro — Sesli Not JS (Gelişmiş)
 * MediaRecorder API + Canvas Waveform + Whisper transkripsiyon
 */

(function () {
    let mediaRecorder = null;
    let audioChunks   = [];
    let recordTimer   = null;
    let startTime     = null;
    let analyser      = null;
    let animFrame     = null;
    let audioContext   = null;

    const recordBtn      = document.getElementById('record-btn');
    const recordIcon     = document.getElementById('record-icon');
    const recordText     = document.getElementById('record-text');
    const recordTimerEl  = document.getElementById('record-timer');
    const waveform       = document.getElementById('waveform');
    const audioPlayer    = document.getElementById('audio-player');
    const transcriptEl   = document.getElementById('transcript-text');
    const transcriptBox  = document.getElementById('transcript-box');
    const statusEl       = document.getElementById('kayit-status');

    if (!recordBtn) return;

    // Canvas waveform oluştur
    let canvas, canvasCtx;
    if (waveform) {
        // CSS waveform yerine canvas kullan
        waveform.innerHTML = '';
        canvas = document.createElement('canvas');
        canvas.width  = 280;
        canvas.height = 50;
        canvas.style.cssText = 'width:100%;height:50px;border-radius:8px;';
        waveform.appendChild(canvas);
        canvasCtx = canvas.getContext('2d');
    }

    // Waveform çizimi
    function drawWaveform() {
        if (!analyser || !canvasCtx) return;
        animFrame = requestAnimationFrame(drawWaveform);

        const bufferLength = analyser.frequencyBinCount;
        const dataArray    = new Uint8Array(bufferLength);
        analyser.getByteTimeDomainData(dataArray);

        canvasCtx.fillStyle = 'rgba(6,10,26,0.3)';
        canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

        canvasCtx.lineWidth   = 2;
        canvasCtx.strokeStyle = '#00d4ff';
        canvasCtx.beginPath();

        const sliceWidth = canvas.width / bufferLength;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
            const v = dataArray[i] / 128.0;
            const y = v * canvas.height / 2;
            if (i === 0) canvasCtx.moveTo(x, y);
            else canvasCtx.lineTo(x, y);
            x += sliceWidth;
        }

        canvasCtx.lineTo(canvas.width, canvas.height / 2);
        canvasCtx.stroke();

        // Parlama efekti
        canvasCtx.shadowColor   = '#00d4ff';
        canvasCtx.shadowBlur    = 8;
        canvasCtx.shadowOffsetX = 0;
        canvasCtx.shadowOffsetY = 0;
    }

    function stopWaveform() {
        if (animFrame) cancelAnimationFrame(animFrame);
        if (canvasCtx && canvas) {
            canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }

    // Kayıt başlat/durdur
    recordBtn.addEventListener('click', async function () {
        if (!mediaRecorder || mediaRecorder.state === 'inactive') {
            await kayitBaslat();
        } else if (mediaRecorder.state === 'recording') {
            kayitDurdur();
        }
    });

    async function kayitBaslat() {
        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (err) {
            showFlash('Mikrofon erişimi reddedildi. Lütfen izin verin.', 'error');
            return;
        }

        audioChunks = [];

        // Audio analyser
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser     = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);

        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus'
            : (MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '');

        mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});

        mediaRecorder.ondataavailable = function (e) {
            if (e.data.size > 0) audioChunks.push(e.data);
        };

        mediaRecorder.onstop = function () {
            const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
            onKayitTamamlandi(blob, stream);
        };

        mediaRecorder.start(200);
        startTime = Date.now();

        // UI
        recordBtn.classList.add('recording');
        if (recordIcon) recordIcon.textContent = '⏹';
        if (recordText) recordText.textContent = 'Durdurmak için tıkla';
        if (waveform)   waveform.classList.remove('hidden');
        if (statusEl)   statusEl.textContent = 'Kayıt devam ediyor...';

        // Canvas waveform başlat
        drawWaveform();

        // Sayaç
        recordTimer = setInterval(() => {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            const dk = Math.floor(elapsed / 60).toString().padStart(2, '0');
            const sn = (elapsed % 60).toString().padStart(2, '0');
            if (recordTimerEl) recordTimerEl.textContent = `${dk}:${sn}`;
        }, 1000);
    }

    function kayitDurdur() {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
            clearInterval(recordTimer);
            stopWaveform();

            recordBtn.classList.remove('recording');
            if (recordIcon) recordIcon.textContent = '🎙';
            if (recordText) recordText.textContent = 'İşleniyor...';
            if (waveform)   waveform.classList.add('hidden');
            if (statusEl)   statusEl.textContent = 'Transkripsiyon yapılıyor...';
        }
    }

    function onKayitTamamlandi(blob, stream) {
        stream.getTracks().forEach(t => t.stop());
        if (audioContext) { audioContext.close(); audioContext = null; }

        if (audioPlayer) {
            audioPlayer.src = URL.createObjectURL(blob);
            audioPlayer.parentElement?.classList.remove('hidden');
        }

        // Hedef bilgilerini oku
        const hedefTip = document.getElementById('hedef_tip')?.value || '';
        const hedefId  = document.getElementById('hedef_id')?.value || '';
        const musteriId = document.getElementById('musteri_id')?.value || '';
        const telefon   = document.getElementById('telefon')?.value || '';

        const formData = new FormData();
        formData.append('ses', blob, 'ses_' + Date.now() + '.webm');
        formData.append('csrf_token', csrfToken());
        if (hedefTip) formData.append('hedef_tip', hedefTip);
        if (hedefId)  formData.append('hedef_id', hedefId);
        if (musteriId) formData.append('musteri_id', musteriId);
        if (telefon)   formData.append('telefon', telefon);

        // Progress bar
        if (statusEl) statusEl.innerHTML = '<div class="loader inline-block mr-2"></div>Yükleniyor ve transkribe ediliyor...';

        fetch('/api/sesli-not.php?action=kaydet', {
            method: 'POST',
            body: formData,
        })
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                if (recordText) recordText.textContent = 'Yeni kayıt başlat';
                if (statusEl)   statusEl.textContent = '✅ Transkripsiyon tamamlandı';

                if (transcriptEl && data.data.metin) {
                    transcriptEl.value = data.data.metin;
                    if (transcriptBox) transcriptBox.classList.remove('hidden');
                }

                // Parse sonucunu göster
                if (data.data.parse_sonucu) {
                    const ps = data.data.parse_sonucu;
                    let parseInfo = '';
                    if (ps.musteri_adi)    parseInfo += `👤 ${ps.musteri_adi}\n`;
                    if (ps.telefon)        parseInfo += `📞 ${ps.telefon}\n`;
                    if (ps.gorev_notu)     parseInfo += `📝 ${ps.gorev_notu}\n`;
                    if (ps.sonraki_adim)   parseInfo += `➡️ ${ps.sonraki_adim}\n`;
                    if (ps.duygu_analizi)  parseInfo += `💭 Duygu: ${ps.duygu_analizi}`;
                    if (parseInfo) {
                        const parseDiv = document.createElement('div');
                        parseDiv.className = 'mt-2 p-2 rounded-lg text-xs whitespace-pre-line';
                        parseDiv.style.cssText = 'background:rgba(139,92,246,0.1);color:#a855f7;border:1px solid rgba(139,92,246,0.2);';
                        parseDiv.textContent = parseInfo;
                        transcriptBox?.appendChild(parseDiv);
                    }
                }

                const aramaIdInput = document.getElementById('arama_id');
                if (aramaIdInput && data.data.arama_id) aramaIdInput.value = data.data.arama_id;

                showFlash('Sesli not kaydedildi ve transkribe edildi.', 'success');
            } else {
                if (statusEl) statusEl.textContent = '❌ Hata oluştu';
                if (recordText) recordText.textContent = 'Tekrar dene';
                showFlash(data.message || 'Sesli not kaydedilemedi.', 'error');
            }
        })
        .catch(() => {
            if (statusEl) statusEl.textContent = '❌ Bağlantı hatası';
            if (recordText) recordText.textContent = 'Tekrar dene';
            showFlash('Sunucu hatası oluştu.', 'error');
        });
    }

    // Tarayıcı desteği
    if (!navigator.mediaDevices || !window.MediaRecorder) {
        recordBtn.disabled = true;
        if (statusEl) statusEl.textContent = '⚠️ Tarayıcınız ses kayıt desteklemiyor.';
    }

    // Kopyala
    const copyBtn = document.getElementById('copy-transcript');
    if (copyBtn && transcriptEl) {
        copyBtn.addEventListener('click', () => copyToClipboard(transcriptEl.value, 'Transkript kopyalandı!'));
    }

    // Görev oluştur
    const gorevBtn = document.getElementById('gorev-olustur');
    if (gorevBtn) {
        gorevBtn.addEventListener('click', function () {
            const metin   = transcriptEl?.value?.trim();
            const aramaId = document.getElementById('arama_id')?.value;
            const musteriId = document.getElementById('musteri_id')?.value;
            if (!metin) return showFlash('Önce sesli not kaydedin.', 'warning');

            fetch('/api/gorevler.php?action=kaydet', {
                method: 'POST',
                headers: csrfHeaders(),
                body: JSON.stringify({
                    baslik: 'Sesli nottan: ' + metin.substring(0, 60) + (metin.length > 60 ? '…' : ''),
                    tip: 'takip',
                    notlar: metin,
                    arama_id: aramaId || null,
                    musteri_id: musteriId || null,
                }),
            })
            .then(r => r.json())
            .then(data => {
                showFlash(data.success ? 'Görev oluşturuldu.' : (data.message || 'Hata.'),
                          data.success ? 'success' : 'error');
            })
            .catch(() => showFlash('Sunucu hatası.', 'error'));
        });
    }
})();

/* ── Görev kartından sesli not ──────────────────────────────────────── */
window.gorevSesliNot = function(gorevId) {
    // Eğer görevler sayfasındaysa sesli not modalını aç
    const modal = document.getElementById('sesli-not-modal');
    if (modal) {
        // Hedef bilgilerini güncelle
        const tipInput = modal.querySelector('#hedef_tip');
        const idInput  = modal.querySelector('#hedef_id');
        if (tipInput) tipInput.value = 'gorev';
        if (idInput)  idInput.value = gorevId;
        modal.classList.remove('hidden');
    } else {
        // Modal yoksa basit prompt ile yönlendir
        showFlash('Sesli not için ilan veya müşteri detay sayfasına gidin.', 'info');
    }
};
