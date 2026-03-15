/**
 * Google Apps Script — RSVP Matrimonio Mara & Enrico
 *
 * ISTRUZIONI:
 * 1. Crea un nuovo foglio Google (Google Sheets)
 * 2. Vai su Estensioni > Apps Script
 * 3. Cancella il contenuto di Code.gs e incolla questo codice
 * 4. Salva (Ctrl+S)
 * 5. Fai il deploy:
 *    - Clicca "Esegui il deployment" > "Nuovo deployment"
 *    - Tipo: "App web"
 *    - Esegui come: "Me" (il tuo account)
 *    - Chi ha accesso: "Chiunque"
 *    - Clicca "Esegui il deployment"
 * 6. Copia l'URL del deployment e incollalo nel file index.html
 *    al posto di 'YOUR_APPS_SCRIPT_URL'
 *
 * Il foglio avrà queste colonne:
 * Data/Ora | Nome | Cognome | Ospiti | Partecipa | Allergie | Messaggio
 */

function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var data = JSON.parse(e.postData.contents);

    // Aggiungi intestazioni se il foglio è vuoto
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        'Data/Ora', 'Nome', 'Cognome', 'Ospiti',
        'Partecipa', 'Allergie', 'Messaggio'
      ]);
      // Formatta intestazioni
      sheet.getRange(1, 1, 1, 7).setFontWeight('bold');
    }

    // Aggiungi riga con i dati
    sheet.appendRow([
      new Date().toLocaleString('it-IT'),
      data.nome       || '',
      data.cognome    || '',
      data.ospiti     || '1',
      data.partecipa  || '',
      data.allergie   || '',
      data.messaggio  || ''
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ result: 'ok' }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ result: 'error', error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
