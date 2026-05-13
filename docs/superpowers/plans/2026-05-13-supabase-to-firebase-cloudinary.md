# Migrazione Supabase → Firestore + Cloudinary — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sostituire Supabase Storage + tabella Postgres con Cloudinary (foto) + Firestore (metadata) nel sito di matrimonio `index.html`, mantenendo invariato il flusso RSVP Google Apps Script.

**Architecture:** Single-file vanilla JS. Un solo blocco `<script type="module">` (linee ~1009-1225 di `index.html`) viene sostituito atomicamente. Upload diretto dal browser a Cloudinary via unsigned preset; metadata in Firestore collection `photos` con `public_id` e `format`; URL costruiti on-the-fly dal `public_id` + transformations Cloudinary.

**Tech Stack:** HTML/CSS/vanilla JS, ESM CDN, Firebase Web SDK v12.13.0 (`firebase-app`, `firebase-firestore`), Cloudinary REST Upload API.

**Spec di riferimento:** [docs/superpowers/specs/2026-05-13-supabase-to-firebase-cloudinary-design.md](../specs/2026-05-13-supabase-to-firebase-cloudinary-design.md)

**Nota su testing:** progetto senza framework di test. La "verifica" di ogni task è manuale: apertura in browser, check console DevTools, controllo Cloudinary Media Library e Firestore Console.

**Prerequisiti già fatti dall'utente:**
- Progetto Firebase `mara-enrico-wedding` creato, Firestore abilitato in modalità test `eur3`.
- Cloudinary account creato, cloud `dwxunp63a`, preset unsigned `wedding_photos` con folder `wedding`.

---

## File Structure

**Modify:**
- `index.html` — sostituire il blocco `<script type="module">` Supabase con il nuovo blocco Firestore + Cloudinary.

**Create:**
- `firestore.rules` — copia statica delle regole Firestore, tenute in repo per tracciabilità (le regole live stanno nella Firebase Console).

**Untouched (regression-critical):**
- Tutto l'HTML/CSS di `index.html` (header, hero, storia, programma, location, RSVP form).
- Il primo blocco `<script>` (linee ~910-1006: hamburger, countdown, fade-in, RSVP fetch a Apps Script).
- `google-apps-script.js`, `README.md`, `foto.jpg`.

---

## Task 1: Salvare le regole Firestore in repo

**Files:**
- Create: `firestore.rules`

- [ ] **Step 1: Creare `firestore.rules`**

Crea il file `d:/Workspace/Mara-Enrico/firestore.rules` con questo contenuto esatto:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /photos/{doc} {
      allow read, create: if true;
      allow update, delete: if false;
    }
  }
}
```

- [ ] **Step 2: Verifica file presente**

Verifica che `firestore.rules` esista nella root del progetto.

- [ ] **Step 3: Commit**

```bash
git add firestore.rules
git commit -m "chore: add firestore rules for photos collection"
```

---

## Task 2: Applicare le regole Firestore nella Console Firebase

> Questo task non tocca il codice. È un'azione nella console Firebase, ma va fatta prima di Task 3 perché altrimenti gli upload nuovi falliscono per la scadenza della modalità test (dopo 30 giorni).

- [ ] **Step 1: Aprire Firebase Console → Firestore → Regole**

Naviga su [https://console.firebase.google.com/](https://console.firebase.google.com/) → progetto `mara-enrico-wedding` → menu "Build > Firestore Database" → tab "Regole".

- [ ] **Step 2: Incollare le regole**

Sostituisci tutto il contenuto del box regole con:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /photos/{doc} {
      allow read, create: if true;
      allow update, delete: if false;
    }
  }
}
```

- [ ] **Step 3: Pubblicare**

Clicca "Pubblica". Attendi conferma "Regole aggiornate".

- [ ] **Step 4: Smoke test che le regole funzionino**

Apri Firebase Console → Firestore → tab "Dati". Prova a creare manualmente una collection `photos` con un documento di test:
- public_id: `test`
- format: `jpg`
- name: `test`
- created_at: timestamp

Dovrebbe permettere la creazione. Poi prova a cliccare "Modifica documento" e salva: dovrebbe **fallire** con "Missing or insufficient permissions" (perché le regole bloccano update).

**Cancella il documento di test** dalla console (la console amministrativa bypassa le regole di sicurezza, quindi te lo permette).

- [ ] **Step 5: Nessun commit**

Questo task è una configurazione esterna, niente da committare.

---

## Task 3: Sostituire il blocco `<script type="module">` Supabase con il nuovo

**Files:**
- Modify: `index.html` (linee 1009-1225, il blocco `<!-- SUPABASE & FOTO -->`)

- [ ] **Step 1: Verificare lo stato corrente di `index.html`**

Apri `index.html` e conferma:
- La riga 1009 contiene `<!-- ═══════════════ SUPABASE & FOTO ═══════════════ -->`
- La riga 1010 è `<script type="module">`
- La riga 1011 inizia con `import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';`
- La riga 1225 chiude con `</script>`

Se le righe non corrispondono (file modificato), individua il blocco tramite il commento "SUPABASE & FOTO" e procedi.

- [ ] **Step 2: Sostituire il blocco intero**

Sostituisci tutte le righe dal commento `<!-- ═══════════════ SUPABASE & FOTO ═══════════════ -->` (riga 1009) fino a `</script>` (riga 1225) **incluse** con questo blocco:

```html
<!-- ═══════════════ FIRESTORE + CLOUDINARY & FOTO ═══════════════ -->
<script type="module">
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, query, orderBy,
  limit, startAfter, getDocs, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAV3HbzJRdKwgpwEs3YzcnH39DGui5Rijc",
  authDomain: "mara-enrico-wedding.firebaseapp.com",
  projectId: "mara-enrico-wedding",
  storageBucket: "mara-enrico-wedding.firebasestorage.app",
  messagingSenderId: "392174455170",
  appId: "1:392174455170:web:fd0b5db72f19b8a39fe79b"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

const CLOUDINARY_CLOUD  = 'dwxunp63a';
const CLOUDINARY_PRESET = 'wedding_photos';
const CLOUDINARY_FOLDER = 'wedding';
const BATCH = 20;

/* ── URL builder ───────────────────────────── */
const buildUrl = (publicId, format, transform) =>
  `https://res.cloudinary.com/${CLOUDINARY_CLOUD}/image/upload/${transform}/${publicId}.${format}`;
const thumbUrl = (p) => buildUrl(p.public_id, p.format, 'w_400,h_400,c_fill,q_auto,f_auto');
const fullUrl  = (p) => buildUrl(p.public_id, p.format, 'q_auto,f_auto');

/* ── Compressione leggera (Canvas API) ─────── */
function compressImage(file, maxDim, quality) {
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const r = Math.min(maxDim / width, maxDim / height);
        width  = Math.round(width * r);
        height = Math.round(height * r);
      }
      const c   = document.createElement('canvas');
      c.width   = width;
      c.height  = height;
      c.getContext('2d').drawImage(img, 0, 0, width, height);
      c.toBlob(blob => resolve({ blob, width, height }), 'image/jpeg', quality);
    };
    img.src = url;
  });
}

/* ── Elementi DOM ──────────────────────────── */
const dropzone        = document.getElementById('dropzone');
const fileInput       = document.getElementById('fileInput');
const uploadProgress  = document.getElementById('uploadProgress');
const uploadBar       = document.getElementById('uploadProgressBar');
const uploadText      = document.getElementById('uploadProgressText');
const uploadStatus    = document.getElementById('uploadStatus');
const galleryGrid     = document.getElementById('galleryGrid');
const loadMoreBtn     = document.getElementById('loadMoreBtn');
const lightbox        = document.getElementById('lightbox');
const lightboxImg     = document.getElementById('lightboxImg');
const lightboxCaption = document.getElementById('lightboxCaption');
const lightboxClose   = document.getElementById('lightboxClose');

/* ── Drag & Drop ───────────────────────────── */
dropzone.addEventListener('dragover', e => {
  e.preventDefault();
  dropzone.classList.add('dragover');
});
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
dropzone.addEventListener('drop', e => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  handleFiles(e.dataTransfer.files);
});

/* ── File picker ───────────────────────────── */
fileInput.addEventListener('change', e => {
  handleFiles(e.target.files);
  e.target.value = '';
});

/* ── Upload handler ────────────────────────── */
async function handleFiles(fileList) {
  const files = Array.from(fileList).filter(f => f.type.startsWith('image/'));
  if (!files.length) return;

  const uploaderName = document.getElementById('uploaderName').value.trim() || 'Anonimo';
  uploadProgress.style.display = 'block';
  uploadStatus.textContent = '';
  let done = 0;

  for (const file of files) {
    try {
      uploadStatus.textContent = `Caricamento ${done + 1} di ${files.length}…`;

      // Compressione leggera: max 2400px, q=0.9 (alta qualità preservata)
      const { blob } = await compressImage(file, 2400, 0.9);

      // Upload diretto a Cloudinary (unsigned preset)
      const fd = new FormData();
      fd.append('file', blob);
      fd.append('upload_preset', CLOUDINARY_PRESET);
      fd.append('folder', CLOUDINARY_FOLDER);

      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`,
        { method: 'POST', body: fd }
      );
      if (!res.ok) throw new Error(`Cloudinary upload failed: ${res.status}`);
      const cl = await res.json();

      // Metadata su Firestore
      await addDoc(collection(db, 'photos'), {
        public_id:  cl.public_id,
        format:     cl.format,
        width:      cl.width,
        height:     cl.height,
        name:       uploaderName,
        created_at: serverTimestamp()
      });

      done++;
      const overall = Math.round((done / files.length) * 100);
      uploadBar.style.width = overall + '%';
      uploadText.textContent = overall + '%';

    } catch (err) {
      console.error('Upload error:', err);
      uploadStatus.textContent = `Errore: ${err.message}`;
    }
  }

  uploadBar.style.width = '100%';
  uploadText.textContent = '100%';
  uploadStatus.textContent = `${done} foto caricata/e con successo!`;

  setTimeout(() => {
    uploadProgress.style.display = 'none';
    uploadBar.style.width = '0%';
  }, 3000);

  loadGallery(true);
}

/* ── Galleria ──────────────────────────────── */
let lastDoc   = null;
let allPhotos = [];

async function loadGallery(reset = false) {
  if (reset) {
    lastDoc = null;
    allPhotos = [];
    galleryGrid.innerHTML = '';
  }

  try {
    let q = query(
      collection(db, 'photos'),
      orderBy('created_at', 'desc'),
      limit(BATCH)
    );
    if (lastDoc) q = query(q, startAfter(lastDoc));

    const snap = await getDocs(q);

    if (snap.empty && allPhotos.length === 0) {
      galleryGrid.innerHTML = '<p class="gallery-empty">Nessuna foto ancora. Sii il primo a caricare!</p>';
      loadMoreBtn.style.display = 'none';
      return;
    }

    snap.docs.forEach(docSnap => {
      const photo = { id: docSnap.id, ...docSnap.data() };
      allPhotos.push(photo);
      appendGalleryItem(photo, allPhotos.length - 1);
    });

    lastDoc = snap.docs[snap.docs.length - 1] || lastDoc;
    loadMoreBtn.style.display = snap.size < BATCH ? 'none' : 'inline-block';
  } catch (err) {
    console.error('Gallery load error:', err);
  }
}

function appendGalleryItem(data, idx) {
  const div = document.createElement('div');
  div.className = 'gallery-item';
  const img = document.createElement('img');
  img.src = thumbUrl(data);
  img.alt = `Foto di ${data.name}`;
  img.loading = 'lazy';
  img.onerror = () => div.remove();
  const label = document.createElement('div');
  label.className = 'gallery-item-name';
  label.textContent = data.name;
  div.appendChild(img);
  div.appendChild(label);
  div.addEventListener('click', () => openLightbox(idx));
  galleryGrid.appendChild(div);
}

loadMoreBtn.addEventListener('click', () => loadGallery(false));

/* ── Lightbox ──────────────────────────────── */
function openLightbox(idx) {
  const p = allPhotos[idx];
  lightboxImg.src = fullUrl(p);
  lightboxCaption.textContent = `Foto di ${p.name}`;
  lightbox.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  lightbox.style.display = 'none';
  lightboxImg.src = '';
  document.body.style.overflow = '';
}

lightboxClose.addEventListener('click', closeLightbox);
lightbox.addEventListener('click', e => { if (e.target === lightbox) closeLightbox(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLightbox(); });

/* ── Caricamento iniziale galleria ─────────── */
loadGallery();
</script>
```

- [ ] **Step 3: Smoke test — la pagina carica senza errori**

Apri `index.html` in un browser (doppio click o `start index.html` su Windows; meglio se servito tramite VS Code Live Server o `python -m http.server 8000` perché i moduli ESM richiedono protocollo `http://` o `https://`, non `file://`).

Apri DevTools → Console. Atteso:
- Nessun errore rosso.
- La sezione "Foto" mostra "Nessuna foto ancora. Sii il primo a caricare!" (la collection Firestore è vuota — o quasi se hai lasciato il doc di test).

Se vedi errori CORS o "Failed to fetch": stai aprendo via `file://`. Avvia un server locale.

- [ ] **Step 4: Smoke test — upload di una foto**

Dalla pagina:
1. Trascina (o seleziona) **una sola foto JPEG** sulla dropzone.
2. Inserisci un nome (es. "Test") nel campo "Il tuo nome".
3. Attendi che la progress bar arrivi al 100%.
4. Atteso: messaggio "1 foto caricata/e con successo!".

Verifica esiti esterni:
- **Cloudinary Console** → Media Library → cartella `wedding/` → la foto è presente.
- **Firebase Console** → Firestore → collection `photos` → c'è un nuovo documento con campi `public_id` (es. `wedding/IMG_1234_abc`), `format`, `width`, `height`, `name: "Test"`, `created_at` valorizzato.

- [ ] **Step 5: Smoke test — gallery e lightbox**

1. Ricarica la pagina.
2. Atteso: la foto appena caricata appare nella griglia con la sua thumbnail (formato quadrato 1:1).
3. Click sulla thumbnail → si apre il lightbox con la versione full.
4. Atteso: l'immagine si vede a piena risoluzione, la caption mostra "Foto di Test".
5. Premi ESC → il lightbox si chiude.

Verifica nella console DevTools, Network tab: gli URL delle immagini iniziano con `https://res.cloudinary.com/dwxunp63a/image/upload/...`.

- [ ] **Step 6: Smoke test — regression RSVP**

1. Vai alla sezione RSVP.
2. Compila il form (Nome: "Test", Cognome: "Regression", Partecipa: "Ci sarò!").
3. Clicca "Invia conferma".
4. Atteso: appare il messaggio "Grazie!".
5. Verifica nel Google Sheet che la riga è stata aggiunta.

Questo conferma che il refactoring del blocco foto **non ha rotto** il blocco RSVP (che è in uno `<script>` separato e usa Google Apps Script).

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "feat: migrate photo storage from Supabase to Firestore + Cloudinary"
```

Se il git mostra "dubious ownership" su Windows, esegui prima:
```bash
git config --global --add safe.directory D:/Workspace/Mara-Enrico
```

---

## Task 4: Smoke test esteso (upload multipli + paginazione + errore di rete)

**Files:** nessuna modifica al codice. Solo verifica manuale.

- [ ] **Step 1: Upload multiplo (5 foto)**

1. Seleziona 5 foto (mix di JPEG/PNG/HEIC se possibile).
2. Avvia upload.
3. Atteso: progress bar avanza in 5 step (20%, 40%, 60%, 80%, 100%), `uploadStatus` aggiorna "Caricamento N di 5…".
4. Verifica che tutte e 5 le foto siano in Cloudinary Media Library e in Firestore.

- [ ] **Step 2: Paginazione**

Per testare la paginazione serve la collection con > 20 foto. Se non hai tante foto:
- Carica altre foto fino a superare 20, oppure
- Salta questo step e annotalo come "da testare dopo il matrimonio".

Se hai > 20 foto:
1. Ricarica la pagina.
2. Atteso: vedi 20 thumbnail e in fondo il pulsante "Carica altre foto" è visibile.
3. Clicca "Carica altre foto".
4. Atteso: appaiono altre foto (fino a 20 in più), il pulsante si nasconde quando finiscono.

- [ ] **Step 3: Test errore di rete**

1. In DevTools → Network → abilita "Offline" (o disconnetti il WiFi).
2. Prova un upload.
3. Atteso: `uploadStatus` mostra "Errore: Failed to fetch" (o messaggio simile).
4. Console mostra il dettaglio dell'errore.
5. Riconnetti la rete, riprova l'upload, deve funzionare di nuovo.

- [ ] **Step 4: HEIC iPhone (se hai un iPhone a portata di mano)**

1. Carica una foto HEIC.
2. Atteso: la compressione client-side già converte HEIC in JPEG (canvas usa `image/jpeg` come output). Cloudinary riceve un JPEG.
3. Verifica che `format: "jpg"` nel doc Firestore e che la thumbnail si veda in gallery.

- [ ] **Step 5: Nessun commit**

Questo task è solo verifica. Se trovi un bug, torna a Task 3 e fai un fix commit separato.

---

## Self-Review

### Spec coverage
| Spec section | Task che la implementa |
|---|---|
| Architettura (Cloudinary + Firestore) | Task 3 step 2 |
| Setup Cloudinary | Prerequisito (utente l'ha fatto) |
| Setup Firebase Firestore | Prerequisito (utente l'ha fatto) |
| Regole Firestore | Task 1 (record in repo) + Task 2 (apply in console) |
| Data model Firestore (`public_id`, `format`, ...) | Task 3 step 2 (definizione in `handleFiles`) |
| URL builder | Task 3 step 2 (`buildUrl`, `thumbUrl`, `fullUrl`) |
| `handleFiles` Cloudinary REST | Task 3 step 2 + verifica step 4 |
| `loadGallery` Firestore cursor | Task 3 step 2 + verifica step 5 |
| `appendGalleryItem` con `thumbUrl` | Task 3 step 2 |
| `openLightbox` con `fullUrl` | Task 3 step 2 |
| Regression RSVP intatto | Task 3 step 6 |
| Test plan (upload singolo/multiplo/paginazione/errore/HEIC) | Task 3 + Task 4 |

Nessuna sezione dello spec scoperta.

### Placeholder scan
Nessun "TBD" / "TODO" / "implement later" nel piano. Tutto il codice è completo. Tutti i comandi shell sono concreti. I valori (`CLOUDINARY_CLOUD`, preset, folder, `firebaseConfig`) sono espliciti.

### Type consistency
- `public_id` (string), `format` (string), `width`/`height` (number), `name` (string), `created_at` (Timestamp): coerenti tra `handleFiles` (scrittura) e `loadGallery` (lettura).
- `buildUrl(publicId, format, transform)` chiamato con `(p.public_id, p.format, ...)` ovunque.
- `lastDoc` (DocumentSnapshot | null) e `allPhotos` (array) coerenti tra `loadGallery` e `openLightbox`.

Nessuna inconsistenza.
