/**
 * EmlakRadar Pro — Sesli Not JS
 * MediaRecorder API + Whisper transkripsiyon
 */

(function () {
    let mediaRecorder = null;
    let audioChunks   = [];
    let recordTimer   = null;
    let startTime     = null;

    const recordBtn   = document.getElementById('record-btn');
    const recordIcon  = document.getElementById('record-icon');
    const recordText  = document.getElementById('record-text');
    const recordTimer_el = document.getElementById('record-timer');
    const waveform    = document.getElementById('waveform');
    const audioPlayer = document.getElementById('audio-player');
    const uploadForm  = document.getElementById('sesli-not-form');
    const transcriptEl= document.getElementById('transcript-text');
    const transcriptBox = document.getElementById('transcript-box');
    const statusEl    = document.getElementById('kayit-status');

    if (!recordBtn) return;

    // Mikrofon izni kontrolü
    async function mikrofoniBaslat() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            return stream;
        } catch (err) {
            showFlash('Mikrofon erişimi reddedildi. Lütfen izin verin.', 'error');
            return null;
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
        const stream = await mikrofoniBaslat();
        if (!stream) return;

        audioChunks = [];

        // webm tercih et, yoksa default
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

        mediaRecorder.start(200); // 200ms parçalar
        startTime = Date.now();

        // UI Güncelle
        recordBtn.classList.add('recording');
        if (recordIcon) recordIcon.textContent = '⏹';
        if (recordText) recordText.textContent = 'Durdurmak için tıkla';
        if (waveform)   waveform.classList.remove('hidden');
        if (statusEl)   statusEl.textContent = 'Kayıt devam ediyor...';

        // Sayaç
        recordTimer = setInterval(() => {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            const dk  = Math.floor(elapsed / 60).toString().padStart(2, '0');
            const sn  = (elapsed % 60).toString().padStart(2, '0');
            if (recordTimer_el) recordTimer_el.textContent = `${dk}:${sn}`;
        }, 1000);
    }

    function kayitDurdur() {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
            clearInterval(recordTimer);

            recordBtn.classList.remove('recording');
            if (recordIcon) recordIcon.textContent = '🎙';
            if (recordText) recordText.textContent = 'Kayıt alınıyor...';
            if (waveform)   waveform.classList.add('hidden');
            if (statusEl)   statusEl.textContent = 'Transkripsiyon yapılıyor...';
        }
    }

    function onKayitTamamlandi(blob, stream) {
        // Mikrofonu kapat
        stream.getTracks().forEach(t => t.stop());

        // Player
        if (audioPlayer) {
            audioPlayer.src = URL.createObjectURL(blob);
            audioPlayer.parentElement?.classList.remove('hidden');
        }

        // Sunucuya gönder
        const formData = new FormData();
        formData.append('ses', blob, 'ses_' + Date.now() + '.webm');

        // Müşteri ID ve telefon
        const musteriId = document.getElementById('musteri_id')?.value || '';
        const telefon   = document.getElementById('telefon')?.value || '';
        if (musteriId) formData.append('musteri_id', musteriId);
        if (telefon)   formData.append('telefon', telefon);
        formData.append('csrf_token', csrfToken());

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

                // Arama ID'yi gizli input'a yaz
                const aramaIdInput = document.getElementById('arama_id');
                if (aramaIdInput && data.data.arama_id) {
                    aramaIdInput.value = data.data.arama_id;
                }

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

    // Tarayıcı desteği kontrolü
    if (!navigator.mediaDevices || !window.MediaRecorder) {
        recordBtn.disabled = true;
        if (statusEl) statusEl.textContent = '⚠️ Tarayıcınız ses kayıt desteklemiyor.';
        showFlash('Sesli not için Chrome veya Firefox kullanın.', 'warning');
    }

    // Transkript kopyala
    const copyTranscriptBtn = document.getElementById('copy-transcript');
    if (copyTranscriptBtn && transcriptEl) {
        copyTranscriptBtn.addEventListener('click', function () {
            copyToClipboard(transcriptEl.value, 'Transkript kopyalandı!');
        });
    }

    // Görev oluştur butonu
    const gorevOlusturBtn = document.getElementById('gorev-olustur');
    if (gorevOlusturBtn) {
        gorevOlusturBtn.addEventListener('click', function () {
            const metin   = transcriptEl?.value?.trim();
            const aramaId = document.getElementById('arama_id')?.value;
            if (!metin) return showFlash('Önce sesli not kaydedin.', 'warning');

            fetch('/api/gorevler.php?action=kaydet', {
                method: 'POST',
                headers: csrfHeaders(),
                body: JSON.stringify({
                    baslik: 'Sesli nottan görev: ' + metin.substring(0, 60) + (metin.length > 60 ? '…' : ''),
                    tip: 'takip',
                    notlar: metin,
                    arama_id: aramaId || null,
                    musteri_id: document.getElementById('musteri_id')?.value || null,
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
